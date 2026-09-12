"use client";

/**
 * CHAT — conversa E superfície operacional de jogo.
 *
 * Este arquivo é fino de propósito. Ele NÃO sabe desenhar card nenhum:
 * liga o `CampaignRealtimeProvider` à projeção (`feed/contratos.ts`),
 * escolhe o card pelo dispatcher (`feed/EntradaFeed.tsx`) e monta o
 * composer (`feed/Composer.tsx`). O que ficava aqui virou peça
 * nomeada — a spec pede explicitamente que `ChatTab` não vire outro
 * monólito.
 *
 * TRÊS REGIÕES, na ordem: cabeçalho da aba (fora daqui, na moldura),
 * FEED (única área rolável) e COMPOSER (fixo no rodapé interno,
 * sempre inteiramente visível).
 *
 * O feed é uma PROJEÇÃO do log, não o log: `projetarFeed` aplica a
 * allowlist e correlaciona workflows, então um `character_state_change`
 * nunca aparece e um ataque evolui dentro do mesmo card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useCampaignSession } from "../../_shell/CampaignRealtimeProvider";
import type { TableLogVisibility } from "../../../../../lib/table";
import {
  contarNaoLidos,
  estaNoFim,
  ordenarCronologicamente,
  pendentesAindaVisiveis,
  resolverIdentidade,
  type EnvioPendente,
} from "./chatModelo";
import { projetarFeed, type CartaoFeed } from "./feed/contratos";
import { EntradaFeed, type AcoesFeed } from "./feed/EntradaFeed";
import { Composer } from "./feed/Composer";
import { BandejaDados } from "../_dados3d/RoladorDados";
import { enviarMensagemChatAction, lerContextoChatAction, type ContextoChatPainel } from "./acoes/chatPainel";
import { registrarRolagemLivreAction } from "./acoes/rolagemPainel";
import { lerComandoRolagem, type ComandoRolagem } from "./feed/comandoRolagem";
import { useRolarNaMesa } from "../_dados3d/ContextoMesaDados";
import type { PhysicsDieSpec } from "../_dados3d/ArenaDados";
import { aplicarDanoDoAtaqueAction } from "./acoes/combatePainel";
import { EstadoErro, EstadoVazio } from "./Estados";

/** Acento das rolagens feitas pelo chat — o mesmo ciano do composer. */
const ACENTO_ROLAGEM_CHAT = "#35c7d8";

export function ChatTab({
  visivel,
  personagemDoTokenSelecionado,
  onContador,
  onFocarToken,
  fixtureVisual,
}: {
  visivel: boolean;
  /** Personagem do token selecionado no mapa, só quando a conta pode controlá-lo. Nunca autoriza nada sozinho. */
  personagemDoTokenSelecionado: { id: string; nome: string } | null;
  onContador: (n: number | null) => void;
  /** Ação EXPLÍCITA de centralizar a câmera — a única exceção ao invariante de não mexer na cena. */
  onFocarToken?: (tokenId: string) => void;
  /**
   * Contexto de autoria pronto, só para a galeria visual em
   * `/dev/estilos` — nunca usado pela mesa real. Os logs vêm do
   * contexto de sessão; só a lista de identidades é lida do servidor, e
   * sem ela a aba mostraria o erro de autorização por cima do feed.
   */
  fixtureVisual?: ContextoChatPainel;
}) {
  const { campaignId, role, logs, reloadLogs, sessionSyncStatus } = useCampaignSession();

  const [contexto, setContexto] = useState<ContextoChatPainel | null>(null);
  const [erroContexto, setErroContexto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<EnvioPendente[]>([]);
  const [escolhaIdentidade, setEscolhaIdentidade] = useState<string | null>(null);
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [temNovas, setTemNovas] = useState(false);
  const [ultimoIdVisto, setUltimoIdVisto] = useState<string | null>(null);
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);
  const [errosPorCartao, setErrosPorCartao] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const noFimRef = useRef(true);
  /** Scroll preservado entre trocas de aba (a aba não desmonta, mas fica `hidden` e perde a métrica). */
  const scrollSalvoRef = useRef<number | null>(null);
  const ultimaEnviadaRef = useRef<string | null>(null);

  const cronologicos = useMemo(() => ordenarCronologicamente(logs), [logs]);
  const cartoes = useMemo(() => projetarFeed(cronologicos), [cronologicos]);
  const pendentesVisiveis = useMemo(() => pendentesAindaVisiveis(cronologicos, pendentes), [cronologicos, pendentes]);

  useEffect(() => {
    setPendentes((atuais) => {
      const restantes = pendentesAindaVisiveis(cronologicos, atuais);
      return restantes.length === atuais.length ? atuais : restantes;
    });
  }, [cronologicos]);

  // ── Contexto de autoria ────────────────────────────────────────
  const carregarContexto = useCallback(() => {
    if (fixtureVisual) { setContexto(fixtureVisual); setErroContexto(null); return; }
    lerContextoChatAction(campaignId).then((r) => {
      if (r.ok && r.dados) {
        setContexto(r.dados);
        setErroContexto(null);
      } else {
        setErroContexto(r.erro ?? "Falha ao carregar o contexto do Chat.");
      }
    });
  }, [campaignId, fixtureVisual]);

  useEffect(() => {
    if (!visivel) return;
    carregarContexto();
  }, [visivel, carregarContexto]);

  useEffect(() => {
    if (!visivel) return;
    const aoFocar = () => carregarContexto();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [visivel, carregarContexto]);

  const identidade = useMemo(
    () =>
      resolverIdentidade({
        papel: role,
        nomeDaConta: contexto?.nomeDaConta ?? (role === "narrator" ? "Narrador" : "Jogador"),
        personagemDoTokenSelecionado,
        personagensDisponiveis: contexto?.personagens ?? [],
        escolhaManual: escolhaIdentidade,
      }),
    [role, contexto, personagemDoTokenSelecionado, escolhaIdentidade],
  );

  // ── Não lidos ──────────────────────────────────────────────────
  // Conta sobre os CARTÕES projetados, não sobre o log bruto: um
  // `character_state_change` não pode acender badge de mensagem nova.
  const idDoFim = cartoes.length > 0 ? cartoes[cartoes.length - 1].id : null;

  useEffect(() => {
    if (ultimoIdVisto === null && idDoFim !== null) setUltimoIdVisto(idDoFim);
  }, [idDoFim, ultimoIdVisto]);

  const naoLidos = useMemo(() => contarNaoLidos(cartoes, ultimoIdVisto), [cartoes, ultimoIdVisto]);

  useEffect(() => {
    onContador(naoLidos > 0 ? naoLidos : null);
  }, [naoLidos, onContador]);

  // ── Scroll ─────────────────────────────────────────────────────
  //
  // `scrollTop` direto (nunca `scrollIntoView`): `scrollIntoView` rola
  // o ANCESTRAL mais próximo que pode rolar, o que arrastaria a página
  // inteira quando o painel é drawer. Aqui a rolagem nunca escapa do
  // contêiner do feed.
  const totalLinhas = cartoes.length + pendentesVisiveis.length;
  useEffect(() => {
    if (!visivel) return;
    const el = scrollRef.current;
    if (!el) return;
    if (noFimRef.current) {
      el.scrollTop = el.scrollHeight;
      if (idDoFim) setUltimoIdVisto(idDoFim);
      setTemNovas(false);
    } else {
      setTemNovas(true);
    }
  }, [totalLinhas, visivel, idDoFim]);

  // Ao VOLTAR para a aba: restaura o scroll salvo; se estava no fim,
  // reancora no fim.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!visivel) {
      scrollSalvoRef.current = el.scrollTop;
      return;
    }
    if (noFimRef.current) {
      el.scrollTop = el.scrollHeight;
      if (idDoFim) setUltimoIdVisto(idDoFim);
      setTemNovas(false);
    } else if (scrollSalvoRef.current != null) {
      el.scrollTop = scrollSalvoRef.current;
    }
  }, [visivel, idDoFim]);

  function aoRolar() {
    const el = scrollRef.current;
    if (!el) return;
    noFimRef.current = estaNoFim(el.scrollTop, el.scrollHeight, el.clientHeight);
    scrollSalvoRef.current = el.scrollTop;
    if (noFimRef.current) {
      setTemNovas(false);
      if (idDoFim) setUltimoIdVisto(idDoFim);
    }
  }

  function irParaOFim() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    noFimRef.current = true;
    setTemNovas(false);
    if (idDoFim) setUltimoIdVisto(idDoFim);
  }

  // ── Atalho de rolagem (`/r 1d8 + 2`) ───────────────────────────
  /**
   * Rola pela MESMA porta que a ferramenta de dados: a física do
   * `MesaDadosOverlay` produz os valores e
   * `registrarRolagemLivreAction` grava o registro. Nada de um segundo
   * caminho de rolagem que divergiria do primeiro na primeira regra
   * nova (um d100 aqui e outro lá, por exemplo).
   *
   * Sem provedor de mesa (fora do VTT) `rolarNaMesa` é `null` — o
   * comando então avisa em vez de inventar números em silêncio.
   */
  const rolarNaMesa = useRolarNaMesa();
  const executarRolagem = useCallback(async (comando: ComandoRolagem) => {
    if (!rolarNaMesa) {
      setErroEnvio("A mesa de dados não está aberta nesta tela.");
      return;
    }
    /* Um d100 são DOIS d10 na física (dezena + unidade) — mesma regra
       da ferramenta de dados, e por isso `mapa` liga cada dado PEDIDO
       aos corpos que a mesa jogou por ele. */
    const pedidos = comando.grupos.flatMap((g) => Array.from({ length: g.quantidade }, () => g.faces));
    const corpos: PhysicsDieSpec[] = [];
    const mapa: number[][] = [];
    pedidos.forEach((faces, i) => {
      if (faces === 100) {
        mapa[i] = [corpos.length, corpos.length + 1];
        corpos.push({ id: `cmd-${i}-dez`, sides: 100 }, { id: `cmd-${i}-uni`, sides: 10 });
      } else {
        mapa[i] = [corpos.length];
        corpos.push({ id: `cmd-${i}`, sides: faces });
      }
    });
    const caidos = await rolarNaMesa(corpos, ACENTO_ROLAGEM_CHAT);
    const dados = pedidos.map((faces, i) => ({
      faces,
      valor: mapa[i].reduce((t, j) => t + (caidos[j]?.value ?? 0), 0),
    }));
    const r = await registrarRolagemLivreAction({
      campaignId,
      characterId: identidade.characterId,
      dados,
      modificador: comando.modificador,
      // `/r` é sempre SOMA. O "maior dado" é teste de atributo, que
      // tem ficha e CD atrás dele — não cabe num atalho de uma linha.
      modo: "sum",
      cd: null,
      visibilidade,
    });
    if (!r.ok) {
      setErroEnvio(r.erro ?? "Falha ao registrar a rolagem.");
      return;
    }
    setTexto("");
    noFimRef.current = true;
    await reloadLogs();
  }, [rolarNaMesa, campaignId, identidade, visibilidade, reloadLogs]);

  // ── Envio ──────────────────────────────────────────────────────
  const enviar = useCallback(async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;

    // O comando é decidido ANTES de qualquer bolha otimista: uma
    // rolagem não é uma mensagem, e não pode piscar como se fosse.
    const comando = lerComandoRolagem(conteudo);
    if (comando.tipo === "erro") { setErroEnvio(comando.erro); return; }
    if (comando.tipo === "ok") {
      setEnviando(true);
      setErroEnvio(null);
      try {
        await executarRolagem(comando.comando);
      } catch (e) {
        setErroEnvio(e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede ao rolar.");
      } finally {
        setEnviando(false);
      }
      return;
    }

    const idLocal = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEnviando(true);
    setErroEnvio(null);
    setPendentes((p) => [
      ...p,
      { id: idLocal, texto: conteudo, autorNome: identidade.nome, visibilidade, idServidor: null, erro: null, criadoEm: new Date().toISOString() },
    ]);
    try {
      const r = await enviarMensagemChatAction({
        campaignId,
        texto: conteudo,
        characterId: identidade.characterId,
        visibilidade,
      });
      if (!r.ok || !r.dados) {
        setErroEnvio(r.erro ?? "Falha ao enviar.");
        setPendentes((p) => p.filter((x) => x.id !== idLocal));
        return;
      }
      const criada = r.dados;
      setPendentes((p) => p.map((x) => (x.id === idLocal ? { ...x, idServidor: criada.id } : x)));
      ultimaEnviadaRef.current = conteudo;
      setTexto("");
      noFimRef.current = true;
      await reloadLogs();
    } catch (e) {
      setErroEnvio(e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede ao enviar.");
      setPendentes((p) => p.filter((x) => x.id !== idLocal));
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, identidade, visibilidade, campaignId, role, reloadLogs, executarRolagem]);

  // ── Aplicar dano (workflow de ataque) ──────────────────────────
  const aplicarDano = useCallback(
    async (cartaoId: string) => {
      if (aplicandoId) return; // guarda local; a de verdade é a PK do banco
      setAplicandoId(cartaoId);
      setErrosPorCartao((e) => {
        const { [cartaoId]: _fora, ...resto } = e;
        return resto;
      });
      try {
        const r = await aplicarDanoDoAtaqueAction({ campaignId, logId: cartaoId });
        if (!r.ok) {
          setErrosPorCartao((e) => ({ ...e, [cartaoId]: r.erro ?? "Falha ao aplicar o dano." }));
          return;
        }
        await reloadLogs();
      } catch (e) {
        setErrosPorCartao((er) => ({ ...er, [cartaoId]: e instanceof Error ? e.message : "Falha de rede." }));
      } finally {
        setAplicandoId(null);
      }
    },
    [aplicandoId, campaignId, reloadLogs],
  );

  const alternarExpandido = useCallback((id: string) => {
    setExpandidos((s) => {
      const p = new Set(s);
      if (p.has(id)) p.delete(id);
      else p.add(id);
      return p;
    });
  }, []);

  const acoes: AcoesFeed = useMemo(
    () => ({
      onAplicarDano: aplicarDano,
      aplicandoId,
      errosPorCartao,
      onFocarToken,
      podeAplicarDano: role === "narrator",
    }),
    [aplicarDano, aplicandoId, errosPorCartao, onFocarToken, role],
  );

  /** Bolhas otimistas viram cartões de mensagem com o mesmo contrato — sem um caminho de render paralelo. */
  const cartoesPendentes: CartaoFeed[] = useMemo(
    () =>
      pendentesVisiveis.map((p) => ({
        kind: "mensagem" as const,
        id: p.id,
        schemaVersion: 1,
        criadoEm: p.criadoEm,
        visibilidade: p.visibilidade,
        autoria: { nome: p.autorNome, tipo: "personagem" as const, characterId: null, userId: null },
        origem: "chat",
        texto: p.texto,
        estilo: "normal" as const,
      })),
    [pendentesVisiveis],
  );

  const canalDegradado = sessionSyncStatus === "error";
  const todos = useMemo(() => [...cartoes, ...cartoesPendentes], [cartoes, cartoesPendentes]);

  return (
    <div className="rv-pn-chat">
      {canalDegradado && (
        <p className="rv-pn-estado rv-pn-estado--indisponivel" role="status">
          <span className="rv-pn-estado-texto">Sincronização interrompida — eventos novos podem demorar.</span>
          <button type="button" className="rv-pn-retry" onClick={() => reloadLogs()}>
            Atualizar
          </button>
        </p>
      )}
      {erroContexto && <EstadoErro mensagem={erroContexto} onTentarDeNovo={carregarContexto} testId="painel-chat-erro-contexto" />}

      {/* O feed e o aviso de novas vivem no MESMO contêiner relativo —
          é o que ancora o botão logo acima do composer sem depender de
          adivinhar a altura dele (que muda quando os chips quebram). */}
      <div className="rv-pn-chat-feedwrap">
      <div className="rv-pn-chat-scroll" ref={scrollRef} onScroll={aoRolar} data-testid="painel-chat-scroll">
        {todos.length === 0 ? (
          <EstadoVazio testId="painel-chat-vazio">Nenhum evento nesta campanha ainda.</EstadoVazio>
        ) : (
          todos.map((cartao, i) => (
            <EntradaFeed
              key={cartao.id}
              cartao={cartao}
              anterior={todos[i - 1]}
              papel={role}
              expandidos={expandidos}
              onAlternar={alternarExpandido}
              acoes={acoes}
              pendente={cartao.id.startsWith("local-")}
            />
          ))
        )}
      </div>

      {temNovas && (
        <button type="button" className="rv-pn-chat-novas" onClick={irParaOFim} data-testid="painel-chat-novas">
          <ChevronDown size={12} aria-hidden="true" /> Novas mensagens
        </button>
      )}
      </div>

      <div className="pn-bandeja-dados">
        <BandejaDados campaignId={campaignId} personagemSugerido={personagemDoTokenSelecionado} />
      </div>

      <Composer
        papel={role}
        identidade={{ characterId: identidade.characterId, nome: identidade.nome, modo: identidade.modo }}
        identidadesDisponiveis={contexto?.personagens ?? []}
        escolhaIdentidade={escolhaIdentidade}
        onEscolherIdentidade={setEscolhaIdentidade}
        visibilidade={visibilidade}
        onEscolherVisibilidade={setVisibilidade}
        texto={texto}
        onTexto={setTexto}
        enviando={enviando}
        erro={erroEnvio}
        onEnviar={enviar}
        onLimparErro={() => setErroEnvio(null)}
        ultimaEnviada={ultimaEnviadaRef.current}
      />
    </div>
  );
}
