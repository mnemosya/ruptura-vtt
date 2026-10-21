"use client";

/**
 * PAINEL "ROLAR DADOS" DO CONSOLE.
 *
 * É a ferramenta do VTT, não uma parecida: a casca
 * (`MolduraRolagem`), as primitivas (`Select`, `Stepper`, `CampoCD`,
 * `RollButton`, `SeletorVisibilidade`) e as peças de resultado
 * (`DadosRolados`, `FaixaResultado`) vêm todas de
 * `_dados3d/ResultadoRolagem.tsx`, o mesmo módulo que
 * `_dados3d/RoladorDados.tsx` usa. O que muda é só de onde vem a ficha
 * e quem resolve a regra.
 *
 * O clique num atributo, numa perícia ou numa defesa não rola mais
 * sozinho: ABRE este painel já preenchido. Quem rola é o botão — e até
 * lá dá pra trocar a perícia (inclusive num teste que começou como
 * atributo puro), mexer nos modificadores, pôr uma CD e escolher quem
 * enxerga o resultado.
 *
 * DADOS 3D: rolam NA MESA, exatamente como na ferramenta — o painel
 * pede (`useRolarNaMesa`) e espera as faces que os corpos rígidos
 * mostrarem quando pararem. Nunca um número sorteado antes com uma
 * animação por cima, e nunca uma bandeja dentro da própria janela: o
 * provedor da mesa envolve a campanha inteira (`CampaignShell`), então
 * o Console alcança o mesmo palco de onde estiver aberto.
 *
 * Não é modal: sem backdrop, sem trava. O Console segue clicável por
 * baixo, e clicar noutra perícia troca o que está preenchido aqui.
 *
 * A DEFESA gasta a Reação no momento de ROLAR, nunca ao abrir: abrir o
 * painel e desistir não pode consumir recurso. A penalidade cumulativa
 * (quando não há Reação sobrando) entra somada ao modificador da mesma
 * rolagem, e o aviso aparece junto do resultado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterAttributes } from "../../../../lib/character";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import { getRupturaPool } from "../../../../lib/dice";
import type { TableLogVisibility } from "../../../../lib/table";
import type { PhysicsDieSpec } from "../../../mesas/[campaignId]/vtt/_dados3d/ArenaDados";
import { useRolarNaMesa } from "../../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { lerContextoRolagemAction } from "../../../mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel";
import { type ResultKey } from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { CorpoTesteF, type EstadoTesteF, type RolagemF } from "../../../mesas/[campaignId]/vtt/_dados3d/RoladorDados";
import type { FichaRolagem } from "../../../mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel";
import { Dices, X } from "lucide-react";
import "../../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../../mesas/[campaignId]/vtt/_tema/janela-dados.css";
import type { ConsoleApi } from "../types";
import { useCentroDoConsole } from "../useCentroDoConsole";

const SEM_PERICIA = "";

/** O que o clique no Console pediu — o estado inicial do painel. */
export type PrefillRolagem =
  | { tipo: "atributo"; atributoId: keyof CharacterAttributes }
  | { tipo: "pericia"; periciaId: string }
  | { tipo: "colapso"; atributoId: keyof CharacterAttributes; cd: number }
  /**
   * `acao` é o NOME da ação defensiva escolhida — "Aparar",
   * "Esquivar", "Bloquear", "Resistir". Sem ele a rolagem chega na
   * mesa como a perícia que ela usa por baixo, e "Aparar" vira um
   * "teste de Luta" igual a qualquer outro: o feed perde exatamente a
   * informação pela qual a pessoa clicou.
   */
  | { tipo: "defesa"; periciaId: string; acao: string }
  /** Ação da aba Ações (Agarrar, Investigar, Sondar…): o feed mostra o nome da ação, não só a perícia. */
  | { tipo: "acao"; periciaId: string; acao: string; custoPa?: number };

export function PainelRolagem({ api, prefill, onFechar, acaoToken }: {
  api: ConsoleApi;
  prefill: PrefillRolagem;
  onFechar: () => void;
  acaoToken?: {
    nome: string;
    visibilidade: "public" | "gm";
    penalidadeAlcance?: number;
    /**
     * Ataque CONTESTADO (com alvo): chamado com a rolagem pronta, para
     * abrir o cartão de ataque no chat (`declararAtaqueAction`). As faces
     * são as mesmas que acabaram de ser gravadas na rolagem.
     */
    onRolado?: (entrada: { atributoId: string; periciaId: string | null; modificador: number; dados: number[] }) => void;
  };
}) {
  const mesa = api.mesa;
  // "Narrador" no seletor de visibilidade só existe pra quem é
  // narrador — e quem sabe isso é o servidor, a mesma fonte que a
  // ferramenta do VTT consulta. Sem mesa, nem se pergunta.
  const [ehNarrador, setEhNarrador] = useState(false);
  const [identidade, setIdentidade] = useState<{ nome: string; avatarUrl: string | null; tipo: "jogador" | "pn" } | null>(null);
  useEffect(() => {
    if (!mesa) return;
    let vivo = true;
    lerContextoRolagemAction(mesa.campaignId, mesa.characterId)
      .then((r) => {
        if (!vivo || !r.ok || !r.dados) return;
        setEhNarrador(!!r.dados.ehNarrador);
        const eu = r.dados.personagens?.find((p) => p.id === mesa.characterId);
        if (eu) setIdentidade({ nome: eu.nome, avatarUrl: eu.avatarUrl ?? null, tipo: eu.tipo === "pn" ? "pn" : "jogador" });
      })
      .catch(() => { /* sem resposta, segue sem a opção de narrador */ });
    return () => { vivo = false; };
  }, [mesa]);
  const atributos = api.regras?.atributos ?? [];
  const pericias = api.regras?.pericias ?? [];

  const testeColapso = prefill.tipo === "colapso";
  const atributoInicial: keyof CharacterAttributes =
    prefill.tipo === "atributo" || prefill.tipo === "colapso" ? prefill.atributoId : api.atributoDaPericia(prefill.periciaId);
  const periciaInicial = prefill.tipo === "atributo" || prefill.tipo === "colapso" ? SEM_PERICIA : prefill.periciaId;

  const [atributoId, setAtributoId] = useState<string>(atributoInicial);
  const [periciaId, setPericiaId] = useState<string>(periciaInicial);
  const [mods, setMods] = useState(0);
  const [cdInput, setCdInput] = useState(prefill.tipo === "colapso" ? String(prefill.cd) : "");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>(acaoToken?.visibilidade ?? "public");
  const [carga, setCarga] = useState(0);
  const [rolando, setRolando] = useState(false);
  const [landed, setLanded] = useState(false);
  const [resultado, setResultado] = useState<RupturaRollResult | null>(null);
  const [defesa, setDefesa] = useState<{ usouReacao: boolean; penalidade: number; defesasSemReacao: number } | null>(null);

  const rolarNaMesa = useRolarNaMesa();
  const centro = useCentroDoConsole();
  const posicao = centro
    ? { position: "absolute" as const, left: centro.x, top: centro.y, transform: "translate(-50%, -50%)", maxHeight: "100%" }
    : { position: "absolute" as const, inset: 0, display: "grid", placeItems: "center", padding: 24 };

  const valorAtributo = api.character.atributos[atributoId as keyof CharacterAttributes] ?? 0;
  const pool = getRupturaPool(valorAtributo);
  const nd8 = pool.quantidadeDados;
  const podeRolar = !rolando && !!rolarNaMesa && !((testeColapso || acaoToken) && resultado);

  const doRoll = useCallback(async (forca: number) => {
    if (rolando || !rolarNaMesa || (acaoToken && resultado)) return;
    setRolando(true);
    setLanded(false);
    setResultado(null);

    // A física primeiro: as faces do teste são as que os corpos
    // mostrarem quando pararem — nunca sorteadas antes.
    const pedido: PhysicsDieSpec[] = Array.from({ length: nd8 }, (_, i) => ({ id: `teste-${i}`, sides: 8 }));
    const fisicos = await rolarNaMesa(pedido, "#00d4ff", forca);
    const dados = fisicos.map((d) => d.value);

    // A Reação da defesa é gasta AQUI, junto da rolagem que ela paga.
    const info = prefill.tipo === "defesa" ? api.prepararDefesa() : null;
    // O PA da ação também: só sai quando a rolagem acontece.
    if (prefill.tipo === "acao" && prefill.custoPa) api.ajustarPa(prefill.custoPa);
    setDefesa(info);

    const cdNum = cdInput.trim() === "" ? null : Number.parseInt(cdInput, 10);
    const r = api.rolarTeste({
      atributoId: atributoId as keyof CharacterAttributes,
      periciaId: periciaId === SEM_PERICIA ? null : periciaId,
      modificador: mods + (info?.penalidade ?? 0) + (acaoToken?.penalidadeAlcance ?? 0),
      cd: cdNum != null && Number.isFinite(cdNum) ? cdNum : null,
      dados,
      visibilidade,
      intencao: acaoToken ? { tipo: "ATAQUE", nome: acaoToken.nome } : prefill.tipo === "defesa"
        ? { tipo: "DEFESA", nome: prefill.acao }
        : prefill.tipo === "acao" ? { tipo: "AÇÃO", nome: prefill.acao }
        : prefill.tipo === "colapso" ? { tipo: "COLAPSO", nome: "Teste decisivo" } : null,
      // Ataque contestado: os dados vão para o cartão do ataque, não
      // para um cartão de rolagem à parte.
      publicar: acaoToken?.onRolado ? false : undefined,
    });

    setResultado(r);
    acaoToken?.onRolado?.({
      atributoId,
      periciaId: periciaId === SEM_PERICIA ? null : periciaId,
      modificador: mods + (info?.penalidade ?? 0),
      dados: r.dados,
    });
    if (testeColapso) api.aplicarTesteDecisivoColapso(r.dados);
    setRolando(false);
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  }, [api, atributoId, cdInput, mods, nd8, periciaId, prefill, rolando, rolarNaMesa, testeColapso, visibilidade, acaoToken, resultado]);

  /* Rolagem de uma AÇÃO DO TOKEN (depois de confirmar o ataque) fecha
     só pelo X: fechar no clique fora derrubava a rolagem quando a pessoa
     trocava de aba (chat, Console) no meio do ataque. */
  const janelaRef = useRef<HTMLDivElement>(null);

  // Linha de modo da janela: só o teste decisivo de Colapso usa.
  const modo = prefill.tipo === "colapso"
    ? "colapso · teste decisivo"
    : `d8 · ${pool.modoSelecao === "lowest" ? "menor" : "maior"} dado + perícia + modificadores`;

  // A vitrine F (a mesma da ferramenta Rolar Dados da mesa) lê o teste
  // neste formato; a regra continua sendo a do Console (`api.rolarTeste`).
  const nomeAtributo = (id: string) => atributos.find((a) => a.id === id)?.nome ?? id;
  const ficha: FichaRolagem = {
    characterId: mesa?.characterId ?? "",
    nome: api.character.nome,
    atributos: atributos.map((a) => ({ id: a.id, nome: a.nome, valor: api.character.atributos[a.id as keyof CharacterAttributes] ?? 0 })),
    pericias: pericias.map((p) => ({ id: p.id, nome: p.nome, valor: api.character.pericias[p.id] ?? 0 })),
  } as FichaRolagem;
  const periciaSel = periciaId === SEM_PERICIA ? null : ficha.pericias.find((p) => p.id === periciaId) ?? null;
  const roll: RolagemF | null = resultado ? {
    dados: resultado.dados,
    maiorDado: resultado.maiorDado,
    quantidadeDados: resultado.dados.length,
    modoSelecao: resultado.modoSelecao,
    atributo: nomeAtributo(atributoId),
    atributoValor: valorAtributo,
    pericia: resultado.periciaNome ?? null,
    periciaValor: resultado.periciaValor,
    modificador: resultado.modificador,
    total: resultado.total,
    cd: resultado.cd ?? null,
    sucesso: resultado.sucesso ?? null,
    classificacao: (resultado.classificacaoMargem as ResultKey | undefined) ?? null,
  } : null;
  const estado: EstadoTesteF = {
    ficha, atributoId, setAtributoId, periciaId, setPericiaId,
    atributo: ficha.atributos.find((a) => a.id === atributoId) ?? null,
    pericia: periciaSel,
    mods, setMods, cdInput, setCdInput, roll, doRoll, rolling: rolando, landed, carga, setCarga,
    erro: null, podeRolar,
  };
  const rotulo = rolando ? "Rolando…" : testeColapso && resultado ? "Resultado aplicado" : resultado ? "Rolar de novo" : `Rolar ${nd8}d8`;
  const nota = acaoToken
    ? `${acaoToken.nome}${acaoToken.penalidadeAlcance ? ` · alcance ${acaoToken.penalidadeAlcance}` : ""}`
    : carga > 0 ? `Força ${Math.round(carga * 100)}%${carga >= 0.995 ? " · máxima" : ""}` : "Segure pra carregar força";

  return (
    <div style={CAMADA} data-testid="console-rolagem-camada">
      {/* Sem Console pra centralizar (ação do token), `posicao` é a TELA
          INTEIRA (`inset: 0` + grid centrado) — com `pointer-events:
          auto` ali, a caixa engolia todo clique no mapa. Quem ocupa a
          tela deixa passar; só a janela em si recebe clique. */}
      <div style={{ ...posicao, pointerEvents: centro ? "auto" : "none" }}>
      <div ref={janelaRef} style={{ pointerEvents: "auto" }}>
      {/* A moldura da janela Rolar Dados da mesa (linha F), sem o arrasto: aqui ela vive presa ao Console.
          `rv-moldura-rolagem` traz os tokens da mesa (fontes, acento), que fora do `.rv-mesa` não chegam. */}
      <section className="rv-moldura-rolagem rv-fp rv-fp--f rv-dados-painel" role="dialog" aria-label="Rolar dados" data-testid="console-painel-rolagem"
        style={{ position: "relative", left: "auto", top: "auto", ["--jf-acento" as string]: "#00d4ff" }}>
        <header className="rv-fp-cab">
          <span className="rv-fp-cab-icone" aria-hidden="true"><Dices size={16} /></span>
          <span className="rv-fp-cab-txt">
            <span className="rv-fp-titulo">Rolar Dados</span>
            {/* Como na ferramenta da mesa, sem linha de estado — exceto quando ela muda a regra. */}
            {testeColapso && <span className="rv-fp-modo">{modo}</span>}
          </span>
          <button type="button" className="rv-fp-fechar" aria-label="Fechar rolagem" onClick={onFechar}><X size={15} /></button>
        </header>
        <div className="rv-dados-corpo jf-corpo rup-scroll">
          <CorpoTesteF
            s={estado}
            identidade={identidade && mesa ? { id: mesa.characterId, ...identidade } : null}
            visibilidade={mesa ? visibilidade : undefined}
            onVisibilidade={mesa ? setVisibilidade : undefined}
            ehNarrador={ehNarrador}
            rotulo={rotulo}
            nota={nota}
            travado={testeColapso}
            extra={defesa && !defesa.usouReacao ? (
              <p role="status" className="rv-rf-aviso">
                Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa
                de <strong>{defesa.penalidade}</strong> já aplicada.
              </p>
            ) : undefined}
          />
        </div>
      </section>
      </div>
      </div>
    </div>
  );
}

/**
 * SEM BACKDROP — é uma janela flutuante, não um modal.
 *
 * A ferramenta do VTT nunca escureceu o mapa nem bloqueou o clique
 * atrás dela, e esta é a mesma ferramenta: com a rolagem aberta dá pra
 * continuar mexendo no Console (marcar uma condição, gastar um PA,
 * clicar noutra perícia) sem fechar nada. A camada existe só pra
 * POSICIONAR a janela em coordenada de tela; `pointer-events: none`
 * garante que ela não intercepte nada — só a própria janela recebe
 * clique (`pointer-events: auto`, logo acima).
 *
 * Por consequência, fechar é pelo X. Não existe "clicar fora": fora
 * dela a pessoa está clicando no Console, e isso tem que funcionar.
 */
const CAMADA: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 520,
  pointerEvents: "none",
};
