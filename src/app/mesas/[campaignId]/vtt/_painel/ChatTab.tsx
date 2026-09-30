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
import { ChevronDown, ChevronsDown, ImagePlus, Pin } from "lucide-react";
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
import { RetratosFeedProvider } from "./feed/retratos";
import { Composer } from "./feed/Composer";
import { BandejaDados } from "../_dados3d/RoladorDados";
import { enviarMensagemChatAction, excluirCardAction, fixarCardAction, lerContextoChatAction, type ContextoChatPainel } from "./acoes/chatPainel";
import { ItemFeedComMenu, cardTemMenu, resumoDoCartao, type AcoesMenuCard } from "./feed/MenuCard";
import { DialogoConfirmar } from "./ui/Dialogo";
import { cancelarUploadAction, finalizarUploadChatAction, reservarUploadAction } from "../_acoes/imageActions";
import { ImagemRecusadaError, enviarParaUrlAssinada, prepararImagem, validarArquivo } from "../../../../../lib/vtt/imagePreparation";
import { registrarRolagemLivreAction } from "./acoes/rolagemPainel";
import { lerComandoRolagem, type ComandoRolagem } from "./feed/comandoRolagem";
import { useRolarNaMesa } from "../_dados3d/ContextoMesaDados";
import type { PhysicsDieSpec } from "../_dados3d/ArenaDados";
import { aplicarDanoDoAtaqueAction } from "./acoes/combatePainel";
import { EstadoErro, EstadoVazio } from "./Estados";

/** Acento das rolagens feitas pelo chat — o mesmo ciano do composer. */
/**
 * A partir de quanto o atalho "Ir para o fim" aparece — o MAIOR entre
 * este número e uma tela cheia do feed. Fixo sozinho, ele aparecia
 * cedo demais num painel alto e tarde demais num baixo.
 */
const DISTANCIA_ATALHO = 600;

const ACENTO_ROLAGEM_CHAT = "#35c7d8";

export function ChatTab({
  visivel,
  personagemDoTokenSelecionado,
  onFocarToken,
  onAbrirFicha,
  fixtureVisual,
}: {
  visivel: boolean;
  /** Personagem do token selecionado no mapa, só quando a conta pode controlá-lo. Nunca autoriza nada sozinho. */
  personagemDoTokenSelecionado: { id: string; nome: string } | null;
  /** Ação EXPLÍCITA de centralizar a câmera — a única exceção ao invariante de não mexer na cena. */
  onFocarToken?: (tokenId: string) => void;
  /** "Abrir ficha" do menu do card — abre o Console do personagem que agiu. */
  onAbrirFicha?: (characterId: string) => void;
  /**
   * Contexto de autoria pronto, só para a galeria visual em
   * `/dev/estilos` — nunca usado pela mesa real. Os logs vêm do
   * contexto de sessão; só a lista de identidades é lida do servidor, e
   * sem ela a aba mostraria o erro de autorização por cima do feed.
   */
  fixtureVisual?: ContextoChatPainel;
}) {
  const { campaignId, role, viewer, logs, reloadLogs, sessionSyncStatus } = useCampaignSession();

  const [contexto, setContexto] = useState<ContextoChatPainel | null>(null);
  const [erroContexto, setErroContexto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  /* IMAGEM ANEXADA — escolhida pelo botão, colada ou arrastada. Fica no
     composer (com prévia) até o envio, para dar tempo de escrever a
     legenda; é no envio que ela sobe (migration 0153). */
  const [anexo, setAnexo] = useState<{ arquivo: File; previewUrl: string } | null>(null);
  const anexar = useCallback((arquivo: File) => {
    try {
      validarArquivo(arquivo);
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : "Imagem recusada.");
      return;
    }
    setErroEnvio(null);
    setAnexo((atual) => {
      if (atual) URL.revokeObjectURL(atual.previewUrl);
      return { arquivo, previewUrl: URL.createObjectURL(arquivo) };
    });
  }, []);
  const removerAnexo = useCallback(() => {
    setAnexo((atual) => {
      if (atual) URL.revokeObjectURL(atual.previewUrl);
      return null;
    });
  }, []);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<EnvioPendente[]>([]);
  const [escolhaIdentidade, setEscolhaIdentidade] = useState<string | null>(null);
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [temNovas, setTemNovas] = useState(false);
  /**
   * ESTADO DA ROLAGEM DO FEED — daqui sai o atalho de voltar pro fim.
   *
   * O feed NÃO tem véu nas pontas, ao contrário das outras listas. Foi
   * tentado e removido: com a bandeja de dados flutuando no pé dele,
   * nenhuma posição do degradê ficou boa. Quem diz que há mais
   * conversa é o atalho "ir para o fim".
   *
   * `longe` não é "não está no fim": subir dois cartões pra reler algo
   * e continuar lendo não pede atalho nenhum, e um botão aparecendo ao
   * primeiro giro da roda vira ruído. A partir de uma tela inteira de
   * distância (`DISTANCIA_ATALHO`) a coisa muda: aí voltar rolando é
   * trabalho, e o atalho passa a valer mais que o silêncio.
   */
  const [rolagem, setRolagem] = useState({ rolavel: false, inicio: true, fim: true, longe: false });
  /* Espelho síncrono de `rolagem` — ver `medirRolagem`. */
  const rolagemRef = useRef(rolagem);
  rolagemRef.current = rolagem;
  /**
   * A ALTURA DA BANDEJA, medida.
   *
   * O feed precisa dela em dois lugares — o respiro de baixo e o ponto
   * onde o véu descansa — e ela MUDA: recolhida são ~37px, aberta
   * passa de 300. Com o número cravado na folha, abrir a bandeja punha
   * o véu no meio dela e o fim da conversa debaixo dela.
   */
  const bandejaRef = useRef<HTMLDivElement>(null);
  const [alturaBandeja, setAlturaBandeja] = useState(37);
  useEffect(() => {
    const el = bandejaRef.current;
    if (!el) return;
    // A altura CRUA da bandeja, sem folga somada: é a linha do topo
    // dela que o véu tem que encostar, e qualquer acréscimo aqui vira
    // uma faixa chapada entre os dois. O respiro do feed soma a folga
    // por conta própria, na folha.
    const observador = new ResizeObserver(() => {
      setAlturaBandeja(Math.round(el.getBoundingClientRect().height));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
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

  /* O que a folha e o atalho precisam saber — medido de verdade, nunca
     deduzido da contagem de cartões (um cartão expandido muda a altura
     sem mudar a contagem). */
  function medirRolagem(el: HTMLDivElement) {
    const faltando = el.scrollHeight - el.scrollTop - el.clientHeight;
    const proximo = {
      // 1px de folga: alturas fracionárias fazem a conta parar a meio
      // pixel do fim, e sem ela o véu de baixo nunca sumia.
      rolavel: el.scrollHeight - el.clientHeight > 1,
      inicio: el.scrollTop <= 1,
      fim: faltando <= 1,
      longe: faltando > Math.max(DISTANCIA_ATALHO, el.clientHeight),
    };
    // Compara ANTES de chamar `setRolagem`: esta medida roda a cada
    // render (efeito sem dependências), e o chat re-renderiza a cada
    // quadro de pan do mapa. Um `setRolagem(updater)` por render — mesmo
    // devolvendo o valor igual — enfileirava um update dentro de efeito
    // por quadro, e num arrasto longo o React acusava "Maximum update
    // depth exceeded" (apontando pro `setPan` do mapa).
    const a = rolagemRef.current;
    if (a.rolavel === proximo.rolavel && a.inicio === proximo.inicio
      && a.fim === proximo.fim && a.longe === proximo.longe) return;
    setRolagem(proximo);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) medirRolagem(el);
    // Uma medida por render: cartão que expande, aba que volta e feed
    // que cresce são todos "a altura agora é outra".
  });

  function aoRolar() {
    const el = scrollRef.current;
    if (!el) return;
    medirRolagem(el);
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

  // ── Envio com imagem ───────────────────────────────────────────
  // Mesmo caminho das outras imagens do VTT: prepara no browser (WebP,
  // hash), reserva, sobe direto para o Storage, finaliza no servidor —
  // e só então grava a mensagem que cita o arquivo. A bolha otimista
  // mostra a prévia local enquanto isso.
  const enviarComImagem = useCallback(async (legenda: string, atual: { arquivo: File; previewUrl: string }) => {
    const idLocal = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEnviando(true);
    setErroEnvio(null);
    let reservaId: string | null = null;
    try {
      const preparada = await prepararImagem(atual.arquivo);
      setPendentes((p) => [
        ...p,
        {
          id: idLocal, texto: legenda, autorNome: identidade.nome, visibilidade, idServidor: null, erro: null,
          criadoEm: new Date().toISOString(),
          imagem: { previewUrl: preparada.previewUrl, largura: preparada.widthPx, altura: preparada.heightPx },
        },
      ]);
      noFimRef.current = true;

      const reserva = await reservarUploadAction(campaignId, preparada.sha256, "chat");
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
      let assetId = reserva.dados.assetId;
      if (!reserva.dados.reutilizado) {
        reservaId = reserva.dados.reservaId;
        await enviarParaUrlAssinada(reserva.dados.uploadUrl!, preparada.blob);
        const fim = await finalizarUploadChatAction(campaignId, reserva.dados.reservaId!, preparada.sha256);
        if (!fim.ok || !fim.dados) throw new Error(fim.erro ?? "Não foi possível concluir o envio.");
        assetId = fim.dados.assetId;
        reservaId = null;
      }

      const r = await enviarMensagemChatAction({
        campaignId,
        texto: legenda,
        characterId: identidade.characterId,
        visibilidade,
        imagem: { id: assetId, largura: preparada.widthPx, altura: preparada.heightPx },
      });
      if (!r.ok || !r.dados) throw new Error(r.erro ?? "Falha ao enviar.");
      const criada = r.dados;
      setPendentes((p) => p.map((x) => (x.id === idLocal ? { ...x, idServidor: criada.id } : x)));
      setTexto("");
      removerAnexo();
      await reloadLogs();
    } catch (e) {
      if (reservaId) void cancelarUploadAction(campaignId, reservaId).catch(() => {});
      setPendentes((p) => p.filter((x) => x.id !== idLocal));
      setErroEnvio(e instanceof ImagemRecusadaError || e instanceof Error ? e.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  }, [campaignId, identidade, visibilidade, reloadLogs, removerAnexo]);

  // ── Envio ──────────────────────────────────────────────────────
  const enviar = useCallback(async () => {
    const conteudo = texto.trim();
    if ((!conteudo && !anexo) || enviando) return;

    // Com imagem, o texto é LEGENDA — nunca um comando de rolagem.
    if (anexo) {
      await enviarComImagem(conteudo, anexo);
      return;
    }

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
  }, [texto, anexo, enviando, identidade, visibilidade, campaignId, role, reloadLogs, executarRolagem, enviarComImagem]);

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
        imagem: p.imagem
          ? { id: "", largura: p.imagem.largura, altura: p.imagem.altura, previewUrl: p.imagem.previewUrl }
          : null,
        imagemRemovida: false,
      })),
    [pendentesVisiveis],
  );

  const canalDegradado = sessionSyncStatus === "error";
  const todos = useMemo(() => [...cartoes, ...cartoesPendentes], [cartoes, cartoesPendentes]);
  /* Personagens que agiram no feed — o cabeçalho dos cards e a face
     das mensagens mostram o rosto deles. A chave em string segura a identidade da
     lista entre renders que não trazem personagem novo. */
  const chaveRetratos = useMemo(() => Array.from(new Set(
    todos.flatMap((c) => "autoria" in c && c.autoria.tipo === "personagem" && c.autoria.characterId
      ? [c.autoria.characterId] : []),
  )).join(","), [todos]);
  const idsRetratos = useMemo(() => (chaveRetratos ? chaveRetratos.split(",") : []), [chaveRetratos]);
  const chaveImagens = useMemo(() => Array.from(new Set(
    todos.flatMap((c) => (c.kind === "mensagem" && c.imagem?.id ? [c.imagem.id] : [])),
  )).join(","), [todos]);
  const idsImagens = useMemo(() => (chaveImagens ? chaveImagens.split(",") : []), [chaveImagens]);

  /* ARRASTAR IMAGEM PARA O CHAT. Só reage a ARQUIVOS do sistema —
     arrastar um personagem ou uma pasta do painel usa outros tipos e
     passa reto. O contador segura o `dragleave` que os filhos disparam
     ao cruzar o painel, que senão faria o aviso piscar. */
  const [arrastando, setArrastando] = useState(false);
  const profundidadeArrasto = useRef(0);
  const temArquivo = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const aoArrastarEntrar = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    profundidadeArrasto.current += 1;
    setArrastando(true);
  };
  const aoArrastarSobre = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const aoArrastarSair = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    profundidadeArrasto.current = Math.max(0, profundidadeArrasto.current - 1);
    if (profundidadeArrasto.current === 0) setArrastando(false);
  };
  const aoSoltar = (e: React.DragEvent) => {
    if (!temArquivo(e)) return;
    e.preventDefault();
    profundidadeArrasto.current = 0;
    setArrastando(false);
    const arquivo = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")) ?? e.dataTransfer.files[0];
    if (arquivo) anexar(arquivo);
  };

  // ── Menu do card: excluir, fixar, abrir ficha (migration 0152) ──
  // A regra de verdade está nas RPCs; aqui só se esconde o que o
  // servidor recusaria. Excluir: narrador qualquer card, o autor os
  // próprios. Fixar: quem vê o card. Ficha: personagem que a conta usa.
  const [confirmarExclusao, setConfirmarExclusao] = useState<CartaoFeed | null>(null);
  const [erroMenu, setErroMenu] = useState<string | null>(null);
  const [fixadosAbertos, setFixadosAbertos] = useState(true);
  const idsFicha = useMemo(() => new Set((contexto?.personagens ?? []).map((p) => p.id)), [contexto]);
  const ehNarrador = role === "narrator";
  const meuId = viewer.userId ?? null;

  const executarNoCard = useCallback(async (acao: () => Promise<{ ok: boolean; erro?: string }>) => {
    setErroMenu(null);
    const r = await acao();
    if (!r.ok) setErroMenu(r.erro ?? "Não foi possível concluir a ação.");
    await reloadLogs();
  }, [reloadLogs]);

  const acoesDoCard = useCallback((cartao: CartaoFeed): AcoesMenuCard => {
    if (!cardTemMenu(cartao) || fixtureVisual) return {};
    const charId = cartao.autoria.tipo === "personagem" ? cartao.autoria.characterId : null;
    const autor = meuId != null && cartao.autoria.userId === meuId;
    return {
      onAbrirFicha: charId && onAbrirFicha && (ehNarrador || idsFicha.has(charId)) ? () => onAbrirFicha(charId) : undefined,
      onFixar: (fixar) => void executarNoCard(() => fixarCardAction(campaignId, cartao.id, fixar)),
      onExcluir: ehNarrador || autor ? () => setConfirmarExclusao(cartao) : undefined,
    };
  }, [campaignId, ehNarrador, meuId, idsFicha, onAbrirFicha, executarNoCard, fixtureVisual]);

  const fixados = useMemo(
    () => todos.filter((c) => c.fixadoEm).sort((a, b) => ((a.fixadoEm ?? "") < (b.fixadoEm ?? "") ? 1 : -1)),
    [todos],
  );
  const irParaCard = useCallback((id: string) => {
    const el = document.getElementById(`feed-card-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-destaque", "true");
    window.setTimeout(() => el.removeAttribute("data-destaque"), 1600);
  }, []);

  return (
    <div
      className="rv-pn-chat"
      data-arrastando={arrastando ? "true" : undefined}
      onDragEnter={aoArrastarEntrar}
      onDragOver={aoArrastarSobre}
      onDragLeave={aoArrastarSair}
      onDrop={aoSoltar}
    >
      {arrastando && (
        <div className="pn-chat-soltar" aria-hidden="true">
          <div className="pn-chat-soltar-caixa">
            <ImagePlus size={26} />
            <span className="pn-chat-soltar-titulo">Solte para anexar</span>
            <span className="pn-chat-soltar-sub">PNG, JPEG ou WebP</span>
          </div>
        </div>
      )}
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
      {erroMenu && (
        <p className="rv-pn-estado rv-pn-estado--indisponivel" role="alert">
          <span className="rv-pn-estado-texto">{erroMenu}</span>
          <button type="button" className="rv-pn-retry" onClick={() => setErroMenu(null)}>Fechar</button>
        </p>
      )}
      {fixados.length > 0 && (
        <section className="pn-fixados" aria-label="Cards fixados" data-testid="painel-chat-fixados">
          <button
            type="button"
            className="pn-fixados-cab"
            aria-expanded={fixadosAbertos}
            onClick={() => setFixadosAbertos((v) => !v)}
          >
            <Pin size={12} aria-hidden="true" />
            <span>Fixados</span>
            <span className="pn-fixados-n">{fixados.length}</span>
            <ChevronDown size={13} aria-hidden="true" className="pn-fixados-chevron" />
          </button>
          {fixadosAbertos && (
            <ul className="pn-fixados-lista">
              {fixados.map((c) => (
                <li key={c.id}>
                  <button type="button" className="pn-fixados-item" onClick={() => irParaCard(c.id)}>
                    <span className="pn-fixados-autor">{c.autoria.nome}</span>
                    <span className="pn-fixados-resumo">{resumoDoCartao(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <RetratosFeedProvider campaignId={campaignId} characterIds={idsRetratos} imagemIds={idsImagens}>
      <div className="rv-pn-chat-feedwrap">
      <div
        className="rv-pn-chat-scroll" ref={scrollRef} onScroll={aoRolar}
        style={{ "--pn-bandeja-altura": `${alturaBandeja}px` } as React.CSSProperties}
        data-testid="painel-chat-scroll"
      >
        {todos.length === 0 ? (
          <EstadoVazio testId="painel-chat-vazio">Nenhum evento nesta campanha ainda.</EstadoVazio>
        ) : (
          todos.map((cartao, i) => (
            <ItemFeedComMenu key={cartao.id} cartao={cartao} acoes={acoesDoCard(cartao)}>
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
            </ItemFeedComMenu>
          ))
        )}
      </div>

      {/* O QUE FLUTUA SOBRE O FEED — o atalho de rolagem e a bandeja de
          dados, nesta ordem, empilhados no pé da conversa.

          A bandeja era uma FAIXA entre o feed e o composer: uma barra
          fixa cortando a coluna em dois, que roubava altura da leitura
          o tempo todo pra um painel que se usa de vez em quando. Por
          cima, ela ocupa o lugar dela só enquanto interessa — e o feed
          volta a ser a coluna inteira.

          A casca não recebe clique (`pointer-events: none`), só os
          filhos: senão a faixa transparente em volta da bandeja
          bloquearia o cartão que estivesse embaixo. */}
      <div className="rv-pn-chat-sobreposto">
        {temNovas ? (
          <button type="button" className="rv-pn-chat-novas" onClick={irParaOFim} data-testid="painel-chat-novas">
            <ChevronDown size={12} aria-hidden="true" /> Novas mensagens
          </button>
        ) : rolagem.longe && (
          /* O MESMO BOTÃO, sem variante de estilo: os dois ocupam o mesmo
             lugar e levam ao mesmo lugar. O que muda é a FRASE — "novas
             mensagens" quando chegou algo, "ir para o fim" quando só se
             subiu muito —, que é a única diferença real entre os casos. */
          <button
            type="button" className="rv-pn-chat-novas"
            onClick={irParaOFim} data-testid="painel-chat-voltar-fim"
          >
            <ChevronsDown size={15} aria-hidden="true" /> Ir para o fim
          </button>
        )}
        <div className="pn-bandeja-dados" ref={bandejaRef}>
          <BandejaDados campaignId={campaignId} personagemSugerido={personagemDoTokenSelecionado} />
        </div>
      </div>
      </div>
      </RetratosFeedProvider>

      <DialogoConfirmar
        aberto={confirmarExclusao !== null}
        titulo="Excluir card"
        mensagem={confirmarExclusao
          ? `Excluir "${resumoDoCartao(confirmarExclusao)}" do chat? Ele some para todos na mesa.`
          : ""}
        rotuloConfirmar="Excluir"
        onCancelar={() => setConfirmarExclusao(null)}
        onConfirmar={() => {
          const alvo = confirmarExclusao;
          setConfirmarExclusao(null);
          if (alvo) void executarNoCard(() => excluirCardAction(campaignId, alvo.id));
        }}
        testId="painel-chat-confirmar-exclusao"
      />


      <Composer
        anexo={anexo}
        onAnexar={anexar}
        onRemoverAnexo={removerAnexo}
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
