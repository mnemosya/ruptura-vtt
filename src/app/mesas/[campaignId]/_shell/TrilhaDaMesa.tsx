"use client";

/**
 * A TRILHA DE TURNOS DA MESA — uma só, para a campanha inteira.
 *
 * Até aqui existiam DOIS sistemas de combate vivendo lado a lado:
 *
 *   · `campaigns.turn_track` — o antigo. Alimentava o dock desta casca
 *     e as regras da ficha. Rodada, janela e uma ordem fixa.
 *   · `vtt_turn_tracks` (migration 0088) — o combate de verdade, por
 *     cena: elenco escolhido, declaração por janela, PA comprometido,
 *     alternância entre lados, fragmentação.
 *
 * Eles não conversavam. Começar o combate no VTT não mexia no dock, e
 * a ficha — que lia o antigo — achava que estava fora de combate
 * enquanto a mesa lutava. Dava pra ver os dois discordando na mesma
 * tela.
 *
 * Este provider elege `vtt_turn_tracks` como a ÚNICA fonte e o entrega
 * a toda rota da campanha. O VTT continua com o estado dele (é quem
 * opera o combate, com os trilhos e a ferramenta Rodadas); o que muda
 * é que agora ele e o dock leem a MESMA linha, com a mesma validação e
 * o mesmo realtime.
 *
 * O que NÃO mora aqui: regra de combate, nem a MONTAGEM do combate.
 * Toda a regra continua em `vtt/_turnos/modelo.ts`, e escolher o
 * elenco exige o mapa — por isso o dock nunca inicia rodadas, ele
 * manda pra ferramenta Rodadas, no VTT, onde essa decisão mora. Este
 * arquivo só carrega, escuta e devolve.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { atualizarTrilhaAction, lerTrilhaDaMesaAction } from "../vtt/_acoes/sceneActions";
import { subscribeToTrilhaDaMesa } from "../vtt/_realtime/vttRealtime";
import { trilhaDeJson, trilhaParaJson } from "../vtt/_turnos/serializacao";
import { concluirTurno, type EstadoTrilha } from "../vtt/_turnos/modelo";
import { meuParticipanteNaVez, resumirTrilha, type ResumoTrilha } from "../vtt/_turnos/projecao";
import type { Participante } from "../vtt/_turnos/modelo";

interface ApiTrilhaDaMesa {
  /** `null` = sem combate nesta cena (ou cena nenhuma ainda). */
  estado: EstadoTrilha | null;
  /** A leitura compacta: rodada, janela, quem age, quem vem. */
  resumo: ResumoTrilha | null;
  /** O participante DESTA pessoa com o turno aberto agora, se houver. */
  meuNaVez: Participante | null;
  /**
   * O PERSONAGEM (não o token) de quem está agindo, quando é meu.
   *
   * Os cards da Mesa são por personagem; o elenco do combate é por
   * token. A tradução vem pronta do servidor, junto da trilha, pra que
   * nenhuma tela precise refazê-la.
   */
  meuPersonagemNaVez: string | null;
  /** `false` enquanto a primeira leitura não voltou — o dock não deve chutar "sem combate". */
  carregada: boolean;
  /** Há uma escrita em voo. */
  ocupada: boolean;
  erro: string | null;
  /** Encerra o turno aberto do participante que é meu (gasta 0 PA extra). */
  encerrarMeuTurno: () => Promise<void>;
  /** Existe cena — sem ela não há combate possível nem pra onde mandar. */
  temCena: boolean;
}

const Contexto = createContext<ApiTrilhaDaMesa | null>(null);

/** `null` fora da casca da campanha. */
export function useTrilhaDaMesa(): ApiTrilhaDaMesa | null {
  return useContext(Contexto);
}

export function ProvedorTrilhaDaMesa({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoTrilha | null>(null);
  const [revisao, setRevisao] = useState(0);
  const [tokensQueControlo, setTokensQueControlo] = useState<string[]>([]);
  const [personagemDoToken, setPersonagemDoToken] = useState<Record<string, string>>({});
  const [carregada, setCarregada] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const revisaoRef = useRef(0);
  useEffect(() => { revisaoRef.current = revisao; }, [revisao]);

  /**
   * Adota o que o servidor devolveu ou transmitiu. SEMPRE pelo
   * validador — mesma disciplina do VTT: um payload de realtime não é
   * mais confiável que uma linha lida, e um estado ilegível nunca vira
   * meia trilha na tela.
   */
  const adotar = useCallback((persistida: { estado: unknown; revision: number } | null) => {
    if (!persistida || persistida.estado == null) { setEstado(null); setRevisao(0); return; }
    const lido = trilhaDeJson(persistida.estado);
    setEstado(lido);
    setRevisao(lido ? persistida.revision : 0);
  }, []);

  /**
   * Uma leitura só, na montagem: trilha + quais tokens são meus.
   *
   * A lista de controle não precisa acompanhar o combate porque o
   * ELENCO é fechado quando as rodadas começam (`PainelRodadas`) — um
   * token criado no meio da luta não entra sozinho. Reler a cada
   * mudança de turno seria um round-trip por cliente a cada vez, para
   * uma resposta que não muda.
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await lerTrilhaDaMesaAction(campaignId);
        if (!vivo) return;
        if (r.ok && r.dados) {
          setSceneId(r.dados.sceneId);
          setTokensQueControlo(r.dados.tokensQueControlo);
          setPersonagemDoToken(r.dados.personagemDoToken);
          adotar({ estado: r.dados.estado, revision: r.dados.revision });
        }
      } catch {
        // Rede caída, sessão expirando, navegação no meio da ida: o
        // dock some, e é isso. Uma trilha que não pôde ser lida NUNCA
        // pode derrubar a casca inteira — ela é moldura de todas as
        // rotas da campanha. Sem este catch, a promessa rejeitada
        // deixava `carregada` em false pra sempre e o dock não voltava
        // nem depois da rede se recuperar.
      } finally {
        if (vivo) setCarregada(true);
      }
    })();
    return () => { vivo = false; };
  }, [campaignId, adotar]);

  useEffect(() => {
    if (!sceneId) return;
    return subscribeToTrilhaDaMesa({
      campaignId,
      sceneId,
      onTrilha: (e) => {
        if (e.tipo === "encerrada") { setEstado(null); setRevisao(0); return; }
        adotar({ estado: e.estado, revision: e.revision });
      },
    });
  }, [campaignId, sceneId, adotar]);

  const encerrarMeuTurno = useCallback(async () => {
    if (!sceneId || !estado?.agindoId) return;
    setOcupada(true); setErro(null);
    try {
      // 0 PA a mais: encerrar pelo dock é "passo a vez", não "gastei
      // agora". Quem gasta PA é a ferramenta Rodadas, com o valor à
      // vista — um botão de canto não pode debitar recurso em silêncio.
      const proximo = concluirTurno(estado, 0);
      const r = await atualizarTrilhaAction({
        campaignId, sceneId, estado: trilhaParaJson(proximo), revisionEsperada: revisaoRef.current,
      });
      if (r.ok) adotar(r.dados ?? null);
      else setErro(r.erro ?? "Falha ao encerrar o turno.");
    } finally {
      setOcupada(false);
    }
  }, [campaignId, sceneId, estado, adotar]);

  const resumo = useMemo(() => resumirTrilha(estado), [estado]);
  const meuNaVez = useMemo(() => meuParticipanteNaVez(estado, tokensQueControlo), [estado, tokensQueControlo]);
  const meuPersonagemNaVez = meuNaVez ? (personagemDoToken[meuNaVez.id] ?? null) : null;

  const api = useMemo(
    () => ({
      estado, resumo, meuNaVez, meuPersonagemNaVez, carregada, ocupada, erro,
      encerrarMeuTurno, temCena: sceneId !== null,
    }),
    [estado, resumo, meuNaVez, meuPersonagemNaVez, carregada, ocupada, erro, encerrarMeuTurno, sceneId],
  );

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}
