"use client";

/**
 * A MOLDURA do painel lateral da Mesa — abas, cabeçalho por aba, corpo
 * rolável, rodapé opcional, recolhimento, redimensionamento e drawer.
 *
 * Antes disto o painel inteiro (cinco abas e todo o conteúdo delas)
 * vivia nas últimas 120 linhas de `VttClient.tsx`, com dado
 * inventado. Aqui a moldura não sabe nada de chat, personagem, item ou
 * conteúdo: ela só decide QUAL aba está visível e como o painel se
 * comporta na tela.
 *
 * DUAS DECISÕES QUE VALEM A PENA REGISTRAR:
 *
 * 1. As cinco abas ficam MONTADAS o tempo todo; a troca só muda qual
 *    delas está visível (`hidden`). É o que preserva o scroll e o
 *    estado interno de cada uma (rascunho do Chat, busca do
 *    Compêndio, pasta aberta do diretório) — e o que permite o Chat
 *    continuar contando não lidos enquanto outra aba está à frente.
 *    Cada aba recebe `visivel` e só BUSCA dado quando fica visível
 *    pela primeira vez, então "montado" não custa rede.
 *
 * 2. Cada aba tem seu próprio `LimiteErroAba`. Uma exceção de render
 *    no Bando mostra o erro DENTRO do corpo do painel, com a moldura e
 *    as outras abas intactas — nunca derruba o Chat nem a mesa.
 *
 * Em viewport estreita o painel vira DRAWER sobre o mapa (nunca uma
 * coluna que espreme o canvas até ele ficar inútil): fechado, sobra só
 * a faixa de ícones; aberto, ele flutua sobre a borda direita — sem
 * véu, então o mapa continua inteiro e clicável — e o × do cabeçalho,
 * a aba ativa ou o Esc fecham. Em desktop é coluna lateral, e Esc
 * apenas recolhe.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PainelAbas } from "./PainelAbas";
import { ChatTab } from "./ChatTab";
import { PersonagensTab } from "./PersonagensTab";
import { ParticipantesTab } from "./ParticipantesTab";
import { BandoTab } from "./BandoTab";
import { CompendioTab } from "./CompendioTab";
import { LimiteErroAba } from "./LimiteErroAba";
import { TransferenciaBando, type AlvoTransferencia } from "./TransferenciaBando";
import { useConsoleDaMesa } from "../../_shell/ConsoleDaMesa";
import dynamic from "next/dynamic";
import { useJanelasDaMesa } from "../_shell/JanelasDaMesa";
/**
 * AS JANELAS QUE VIERAM DAS PÁGINAS CHEGAM SOB DEMANDA.
 *
 * Elas eram rotas: cada uma só baixava quando alguém ia até lá. Ao
 * virarem janelas com `import` normal, o código passou a viajar JUNTO
 * COM A MESA — e medido, não suposto: o editor de rascunhos arrasta a
 * árvore de `admin/biblioteca` (0,69 MB em dev) para dentro do pacote
 * de quem só quer abrir o mapa.
 *
 * `dynamic` devolve o que a rota dava de graça, sem mudar o
 * comportamento: elas já só RENDERIZAM quando abertas
 * (`janelas.aberta(...)`), então o carregamento acompanha exatamente o
 * mesmo gesto. `ssr: false` porque nenhuma delas tem o que dizer no
 * servidor — todas leem por ação depois de montar.
 */
const JanelaMercado = dynamic(() => import("./janelas/JanelaMercado").then((m) => m.JanelaMercado), { ssr: false });
const JanelaLivro = dynamic(() => import("./janelas/JanelaLivro").then((m) => m.JanelaLivro), { ssr: false });
const JanelaConfiguracoes = dynamic(() => import("./janelas/JanelaConfiguracoes").then((m) => m.JanelaConfiguracoes), { ssr: false });
const JanelaConteudo = dynamic(() => import("./janelas/JanelaConteudo").then((m) => m.JanelaConteudo), { ssr: false });
const JanelaNovoPersonagem = dynamic(() => import("./janelas/JanelaNovoPersonagem").then((m) => m.JanelaNovoPersonagem), { ssr: false });
import { JanelaAcessoPersonagem, JanelaJogadoresConvites } from "./janelas/JanelasAdmin";
import { JanelaInterna } from "./ui/JanelaInterna";
import type { ItemTransferivel } from "./bandoModelo";
import type { PersonagemArrastado } from "./personagensModelo";
import { ABAS_ORDEM, LARGURA_MAX, LARGURA_MIN, ROTULO_ABA, limitarLarguraPainel, type AbaId } from "./tipos";
import {
  PREFERENCIAS_PAINEL_PADRAO,
  carregarPreferenciasPainel,
  chavePreferenciasPainel,
  salvarPreferenciasPainel,
  type PreferenciasPainel,
} from "./preferencias";
import "./painel.css";

/** Abaixo disto o painel deixa de ser coluna e vira drawer sobre o mapa. */
const LARGURA_DRAWER_PX = 1100;
/**
 * Quanto é preciso passar ALÉM do mínimo, arrastando a alça pra
 * direita, pra que soltar recolha o painel.
 *
 * 8px — o bastante pra separar um empurrão de um tremor de mão, e nada
 * além disso. Era 40, e 40 criava um limbo: o painel já estava
 * deslizando e desbotando (o gesto já dizia "vou fechar") mas soltar
 * ali não fechava nada. Quem arrastou e parou no meio não mudou de
 * ideia — só não sabia que faltava chão. Agora o MOVIMENTO é o
 * compromisso: se ele começou, soltar recolhe.
 */
const LIMIAR_RECOLHER = 8;
/**
 * Até quantos pixels de movimento um gesto na alça ainda conta como
 * CLIQUE. Acima disso ele é arrasto, e quem decide é a distância
 * percorrida — não o tempo, que castigaria quem clica devagar.
 */
const MOVIMENTO_CLIQUE = 4;

export function PainelVtt({
  campaignId,
  usuarioId,
  ehNarrador,
  personagemDoTokenSelecionado,
  onAdicionarPersonagemACena,
  onArrastarPersonagem,
  onFocarToken,
  fixtureVisual,
}: {
  campaignId: string;
  usuarioId: string | null;
  ehNarrador: boolean;
  /** Personagem do token selecionado, só quando a conta pode controlá-lo — o Chat usa como identidade automática. */
  personagemDoTokenSelecionado: { id: string; nome: string } | null;
  /** Inicia o fluxo CANÔNICO de criação de token vinculado (posicionamento no mapa). */
  onAdicionarPersonagemACena: (p: PersonagemArrastado) => void;
  /** Repassado ao diretório: quem está sendo arrastado pro mapa. */
  onArrastarPersonagem?: (p: PersonagemArrastado | null) => void;
  /**
   * Centraliza a câmera num token. É a ÚNICA ação do painel autorizada
   * a mexer na cena, e só a partir de um controle explicitamente
   * rotulado ("Centralizar a câmera no alvo") — a exceção que o
   * invariante de não-navegação prevê.
   */
  onFocarToken?: (tokenId: string) => void;
  /**
   * Dados prontos de cada aba, só para a galeria visual em
   * `/dev/estilos` — nunca usado pela mesa real.
   *
   * O painel é COMPOSIÇÃO: ele não lê nada do servidor por conta
   * própria, só monta as abas. Então o repasse é literal — cada chave
   * vai para a aba correspondente, que já sabe o que fazer com ela
   * (mesmo padrão do `dadosFixos` do `CartaoTokenHover`).
   *
   * É isto que permite revisar o painel como NARRADOR e como JOGADOR
   * sem campanha nenhuma: com campanha real o papel é o que o servidor
   * disser, e quem é narrador da própria mesa nunca alcança a visão de
   * jogador.
   */
  fixtureVisual?: {
    chat?: React.ComponentProps<typeof ChatTab>["fixtureVisual"];
    personagens?: React.ComponentProps<typeof PersonagensTab>["fixtureVisual"];
    participantes?: React.ComponentProps<typeof ParticipantesTab>["fixtureVisual"];
    bando?: React.ComponentProps<typeof BandoTab>["fixtureVisual"];
    compendio?: React.ComponentProps<typeof CompendioTab>["fixtureVisual"];
  };
}) {
  const chave = useMemo(() => chavePreferenciasPainel(usuarioId, campaignId), [usuarioId, campaignId]);
  // As preferências não podem ser lidas na renderização (SSR não tem
  // `localStorage`, e ler no primeiro render do cliente divergiria do
  // HTML do servidor). Nascem no padrão e são hidratadas num efeito —
  // mesma solução do `sessionMountId` do provider.
  const [prefs, setPrefs] = useState<PreferenciasPainel>(PREFERENCIAS_PAINEL_PADRAO);
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    setPrefs(carregarPreferenciasPainel(chave));
    setHidratado(true);
  }, [chave]);

  const atualizarPrefs = useCallback(
    (parcial: Partial<PreferenciasPainel>) => {
      setPrefs((atual) => {
        const proximo = { ...atual, ...parcial };
        salvarPreferenciasPainel(chave, proximo);
        return proximo;
      });
    },
    [chave],
  );

  const [ehDrawer, setEhDrawer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${LARGURA_DRAWER_PX - 1}px)`);
    const aplicar = () => setEhDrawer(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);


  const asideRef = useRef<HTMLElement | null>(null);
  const idBase = useId();
  const idPainelDe = useCallback((aba: AbaId) => `${idBase}-painel-${aba}`, [idBase]);

  /**
   * Devolve o foco à ABA ativa. É pra onde o teclado tem que voltar
   * depois de recolher/fechar: o botão de recolher some junto com o
   * painel aberto, e a aba ativa continua visível na faixa recolhida —
   * ela é, literalmente, o botão que reabre o painel. Sem isto o foco
   * cairia no `<body>` e a navegação por teclado recomeçaria do zero.
   */
  const focarAbaAtiva = useCallback((aba: AbaId) => {
    requestAnimationFrame(() => {
      asideRef.current?.querySelector<HTMLElement>(`#rv-aba-${aba}`)?.focus();
    });
  }, []);

  const recolher = useCallback(() => {
    atualizarPrefs({ aberto: false });
    focarAbaAtiva(prefs.aba);
  }, [atualizarPrefs, focarAbaAtiva, prefs.aba]);

  /**
   * REABRIR ONDE PAROU. Não passa por `selecionar` de propósito: aquilo
   * é "vá para esta seção", e aqui não há seção nova — só o painel
   * voltando ao tamanho que tinha.
   */
  const expandir = useCallback(() => {
    atualizarPrefs({ aberto: true });
    focarAbaAtiva(prefs.aba);
  }, [atualizarPrefs, focarAbaAtiva, prefs.aba]);

  const selecionar = useCallback(
    (aba: AbaId) => {
      // Clicar de novo na aba JÁ ativa é INERTE. A versão anterior
      // recolhia o painel (atalho do Foundry) e isso se mostrou hostil
      // aqui: um clique repetido — comum ao voltar para o Chat — fechava
      // o painel inteiro e a pessoa perdia scroll, busca e rascunho. O
      // recolhimento passou a ter caminhos PRÓPRIOS e explícitos: o
      // botão de recolher, o × do drawer e o Esc.
      if (prefs.aberto && prefs.aba === aba) return;
      atualizarPrefs({ aba, aberto: true });
    },
    [prefs.aberto, prefs.aba, atualizarPrefs],
  );

  // Esc: fecha o drawer / recolhe a coluna — mas nunca quando o foco
  // está num campo editável (digitar Esc no Chat não pode fechar o
  // painel) nem quando um diálogo do painel está aberto (ele tem o
  // próprio Esc).
  const [transferencia, setTransferencia] = useState<AlvoTransferencia | null>(null);
  useEffect(() => {
    if (!prefs.aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (transferencia) return;
      const alvo = document.activeElement as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
      if (!asideRef.current?.contains(alvo)) return;
      e.preventDefault();
      e.stopPropagation();
      recolher();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [prefs.aberto, recolher, transferencia]);

  // ── Redimensionamento por arrasto ──────────────────────────────
  const arrastandoRef = useRef(false);
  const inicioRef = useRef({ x: 0, largura: 0 });
  /** O quanto o ponteiro andou neste gesto — é isto que separa clique de arrasto. */
  const andouRef = useRef(0);
  const [redimensionando, setRedimensionando] = useState(false);
  /**
   * O arrasto já passou do ponto em que soltar RECOLHE.
   *
   * DOIS lugares pro mesmo fato, e não por descuido: o estado pinta o
   * aviso, a REF decide. `pointerup` pode chegar no mesmo lote do
   * `pointermove` que cruzou o limiar — aí o handler ainda enxerga o
   * estado ANTERIOR e não recolhe nada, que é exatamente o "às vezes
   * não fecha, fica parado e volta pro ciano". A ref é escrita na hora,
   * sem esperar render.
   */
  const vaiRecolherRef = useRef(false);
  const [vaiRecolher, setVaiRecolher] = useState(false);
  /**
   * QUANTO O ARRASTO JÁ PASSOU DO MÍNIMO, em pixels.
   *
   * No batente o painel simplesmente parava, e continuar puxando não
   * fazia nada — a mão andava e a tela não, que é a sensação de coisa
   * travada. Daqui pra frente a largura continua presa (é o que fica
   * salvo), mas o painel ACOMPANHA: desliza pra fora e desbota junto,
   * até sumir. O gesto passa a mostrar o que vai acontecer enquanto
   * acontece, em vez de anunciar por um fio de 1px.
   */
  const [excedente, setExcedente] = useState(0);

  /** Como desligar os ouvintes do arrasto em curso — nulo fora dele. */
  const desligarArrastoRef = useRef<(() => void) | null>(null);
  /* Se o painel sair de cena no meio de um arrasto, os ouvintes vão junto. */
  useEffect(() => () => desligarArrastoRef.current?.(), []);

  /**
   * O GESTO INTEIRO VIVE NA JANELA, não na alça, e os ouvintes são
   * presos JÁ no `pointerdown`.
   *
   * Duas correções na mesma decisão:
   *
   *   1. antes o gesto morava nos handlers React do elemento, com
   *      `setPointerCapture` segurando o ponteiro. Quando essa captura
   *      se perde — e ela se perde: o elemento re-renderiza, o ponteiro
   *      sai da janela, o sistema entrega o gesto a outra coisa — o
   *      `pointerup` nunca chega. Como é ele quem limpa tudo, o painel
   *      FICAVA no meio do caminho: deslizado, translúcido, nem aberto
   *      nem recolhido, e sem nada que o trouxesse de volta. O
   *      fantasma. No `window` não há captura a perder: o `pointerup`
   *      acontece em algum lugar, sempre;
   *   2. e a inscrição é aqui, não num `useEffect` que reage ao estado:
   *      o efeito só rodaria no render seguinte, e todo movimento antes
   *      dele se perderia — o arrasto começava mudo.
   */
  const aoPressionarAlca = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      desligarArrastoRef.current?.();
      arrastandoRef.current = true;
      inicioRef.current = { x: e.clientX, largura: prefs.largura };
      andouRef.current = 0;
      setRedimensionando(true);

      const mover = (ev: PointerEvent) => {
        // A alça fica na borda ESQUERDA do painel: arrastar pra esquerda
        // AUMENTA a largura, daí o sinal invertido.
        andouRef.current = Math.max(andouRef.current, Math.abs(ev.clientX - inicioRef.current.x));
        const proposta = inicioRef.current.largura - (ev.clientX - inicioRef.current.x);
        // PASSAR DO MÍNIMO É O GESTO DE FECHAR: o menor painel que
        // existe é nenhum painel. Daí pra frente a largura fica presa e
        // o que anda é o painel inteiro, deslizando e desbotando.
        vaiRecolherRef.current = proposta < LARGURA_MIN - LIMIAR_RECOLHER;
        setVaiRecolher(vaiRecolherRef.current);
        setExcedente(Math.max(0, LARGURA_MIN - proposta));
        setPrefs((atual) => ({ ...atual, largura: limitarLarguraPainel(proposta) }));
      };

      /** `confirmar` = o gesto terminou por vontade de quem arrasta. */
      const encerrar = (confirmar: boolean) => {
        desligar();
        arrastandoRef.current = false;
        setRedimensionando(false);
        setExcedente(0);
        // CLIQUE SIMPLES TAMBÉM RECOLHE. A alça é a borda do painel, e
        // clicar numa borda pra fechar o que ela delimita é o gesto
        // curto da mesma intenção do arrasto longo — quem só quer o
        // mapa inteiro não deveria ter que percorrer 400px pra pedir
        // isso. O arrasto continua sendo arrasto: só conta como clique
        // o que andou menos de `MOVIMENTO_CLIQUE`.
        const recolhe = confirmar
          && (vaiRecolherRef.current || andouRef.current < MOVIMENTO_CLIQUE);
        vaiRecolherRef.current = false;
        setVaiRecolher(false);
        setPrefs((atual) => {
          // Recolhendo, a largura gravada é a de ANTES do arrasto:
          // reabrir devolve o painel como ele era, não espremido no
          // mínimo. Nos dois casos a escrita é uma só, no fim do gesto
          // — não uma por frame.
          const proximo = recolhe
            ? { ...atual, largura: inicioRef.current.largura, aberto: false }
            : atual;
          salvarPreferenciasPainel(chave, proximo);
          return proximo;
        });
        if (recolhe) focarAbaAtiva(prefs.aba);
      };

      const soltou = () => encerrar(true);
      // CANCELAR não é soltar: o sistema abortou o gesto e a intenção
      // nunca foi declarada — fechar ali seria fechar por acidente.
      const abortou = () => encerrar(false);

      function desligar() {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltou);
        window.removeEventListener("pointercancel", abortou);
        window.removeEventListener("blur", abortou);
        desligarArrastoRef.current = null;
      }

      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltou);
      window.addEventListener("pointercancel", abortou);
      window.addEventListener("blur", abortou);
      desligarArrastoRef.current = desligar;
    },
    [prefs.largura, prefs.aba, chave, focarAbaAtiva, setPrefs],
  );

  /** Teclado na alça: setas ajustam de 10 em 10 px, Home/End vão aos limites. */
  const aoTeclarAlca = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let proposta: number | null = null;
      if (e.key === "ArrowLeft") proposta = prefs.largura + 10;
      else if (e.key === "ArrowRight") proposta = prefs.largura - 10;
      else if (e.key === "Home") proposta = 9999;
      else if (e.key === "End") proposta = 0;
      if (proposta === null) return;
      e.preventDefault();
      atualizarPrefs({ largura: limitarLarguraPainel(proposta) });
    },
    [prefs.largura, atualizarPrefs],
  );

  const [sinalRecarregarBando, setSinalRecarregarBando] = useState(0);

  // ── Janelas internas ────────────────────────────────────────────
  // Todo destino que ANTES era `router.push`/`<Link>` virou uma destas.
  // Nenhuma troca a URL, nenhuma remonta o VTT.
  const [acessoDe, setAcessoDe] = useState<string | null>(null);
  /* QUEM ESTÁ ABERTO mora no contexto, não aqui: o menu da mesa abre
     as mesmas janelas do outro lado da tela (ver `JanelasDaMesa`). O
     painel continua sendo quem as DESENHA. */
  const janelas = useJanelasDaMesa();
  const convitesAberto = janelas.aberta("convites");
  const bandoAberto = janelas.aberta("bando");
  const compendioAberto = janelas.aberta("compendio");
  const participantesAberto = janelas.aberta("participantes");
  const personagensAberto = janelas.aberta("personagens");
  const setConvitesAberto = (v: boolean) => (v ? janelas.abrir("convites") : janelas.fechar("convites"));
  const setBandoAberto = (v: boolean) => (v ? janelas.abrir("bando") : janelas.fechar("bando"));
  const setCompendioAberto = (v: boolean) => (v ? janelas.abrir("compendio") : janelas.fechar("compendio"));
  const setParticipantesAberto = (v: boolean) => (v ? janelas.abrir("participantes") : janelas.fechar("participantes"));
  const setPersonagensAberto = (v: boolean) => (v ? janelas.abrir("personagens") : janelas.fechar("personagens"));

  /**
   * A ficha não é mais janela DO PAINEL: quem a hospeda é a casca da
   * campanha (`_shell/ConsoleDaMesa.tsx`), pra que Personagens, Mesa e
   * VTT abram exatamente a mesma coisa, do mesmo jeito, sem navegar.
   * Aqui só ficaram as duas intenções: abrir e aquecer.
   */
  const consoleDaMesa = useConsoleDaMesa();
  const abrirConsole = useCallback((id: string) => consoleDaMesa?.abrir(id), [consoleDaMesa]);
  const aquecerConsole = useCallback(() => consoleDaMesa?.aquecer(), [consoleDaMesa]);

  /**
   * Empresta ao Console a câmera do mapa enquanto o VTT está montado.
   *
   * A ficha vive na casca da campanha, ACIMA do VTT, e por isso não
   * alcança a câmera sozinha. Registrando aqui, "Ver no mapa" aparece
   * na ficha só onde existe mapa — em Personagens ou na Mesa a ação
   * simplesmente não é oferecida, em vez de existir e não fazer nada.
   */
  const registrarFocoNoMapa = consoleDaMesa?.registrarFocoNoMapa;
  useEffect(() => {
    if (!registrarFocoNoMapa) return;
    registrarFocoNoMapa(onFocarToken ?? null);
    return () => registrarFocoNoMapa(null);
  }, [registrarFocoNoMapa, onFocarToken]);

  const aberto = prefs.aberto;
  const abaAtiva = prefs.aba;

  const conteudoAba: Record<AbaId, React.ReactNode> = {
    chat: (
      <ChatTab
        visivel={aberto && abaAtiva === "chat"}
        personagemDoTokenSelecionado={personagemDoTokenSelecionado}
        onFocarToken={onFocarToken}
        fixtureVisual={fixtureVisual?.chat}
      />
    ),
    personagens: (
      <PersonagensTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "personagens"}
        ehNarrador={ehNarrador}
        onAdicionarACena={onAdicionarPersonagemACena}
        onArrastarPersonagem={onArrastarPersonagem}
        onAbrirConsole={abrirConsole}
        onConfigurarAcesso={setAcessoDe}
        onPrecarregarConsole={aquecerConsole}
        onReceberItemDoBando={(item, personagem) => setTransferencia({ item, personagem })}
        onAbrirJanela={() => setPersonagensAberto(true)}
        fixtureVisual={fixtureVisual?.personagens}
      />
    ),
    participantes: (
      <ParticipantesTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "participantes"}
        ehNarrador={ehNarrador}
        onAbrirConvites={() => setConvitesAberto(true)}
        onAbrirConsole={abrirConsole}
        onAbrirJanela={() => setParticipantesAberto(true)}
        fixtureVisual={fixtureVisual?.participantes}
      />
    ),
    bando: (
      <BandoTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "bando"}
        onEnviarParaPersonagem={(item: ItemTransferivel) => setTransferencia({ item, personagem: null })}
        recarregarSinal={sinalRecarregarBando}
        onAbrirJanela={() => setBandoAberto(true)}
        fixtureVisual={fixtureVisual?.bando}
      />
    ),
    compendio: (
      <CompendioTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "compendio"}
        onAbrirJanela={() => setCompendioAberto(true)}
        fixtureVisual={fixtureVisual?.compendio}
      />
    ),
  };

  return (
    <>
      {/* SEM véu de fundo, de propósito. Um drawer "de manual" põe um
          scrim sobre o resto e o resto para de responder — numa Mesa
          isso significa o MAPA parar de responder enquanto o painel
          está aberto, que é justamente o que a mesa não pode fazer
          (foi o que um browser check pegou: o véu interceptava o
          clique no mapa). Aqui o painel só FLUTUA por cima da borda
          direita: o mapa segue com a largura inteira e continua
          clicável, e quem quiser fechar tem o botão × do cabeçalho, a
          própria aba ativa e o Esc. */}
      <aside
        ref={asideRef}
        className="rv-painel"
        data-aberto={aberto}
        data-drawer={ehDrawer ? "true" : undefined}
        data-hidratado={hidratado ? "true" : undefined}
        data-redimensionando={redimensionando ? "true" : undefined}
        data-vai-recolher={vaiRecolher ? "true" : undefined}
        // Largura INLINE, não por classe: `vtt.css` já declara
        // `.rv-painel[data-aberto="true"] { width: 316px }` com a mesma
        // especificidade da regra equivalente de `painel.css`, e qual
        // das duas vence dependeria da ordem em que os dois arquivos
        // entram no bundle — frágil demais para a largura que a pessoa
        // escolheu. O estilo inline vence as duas, sempre. No drawer
        // ele ainda respeita o teto de viewport.
        style={
          aberto
            ? {
                width: ehDrawer ? `min(${prefs.largura}px, 88vw)` : `${prefs.largura}px`,
                // O painel sai de cena PELO LADO em que está sendo
                // empurrado, e some no caminho. A opacidade cai mais
                // devagar que o deslize (o teto é .78 de perda): some o
                // bastante pra dizer "já era", não tanto que o conteúdo
                // desapareça antes de a decisão ser tomada.
                ...(excedente > 0
                  ? {
                      transform: `translateX(${excedente}px)`,
                      // O desbotamento acompanha o arrasto INTEIRO, sem
                      // piso que o faça parecer emperrado no meio: quem
                      // continua puxando continua vendo o painel ir
                      // embora. 170px é a distância em que ele some de
                      // vez — larga o bastante pra ser um gradiente, e
                      // não um corte.
                      opacity: Math.max(0.04, 1 - excedente / 170),
                    }
                  : null),
              }
            : undefined
        }
        aria-label="Painel da sessão"
        data-testid="painel-vtt"
      >
        {/* A ALÇA VALE TAMBÉM NO MODO GAVETA. Ela era exclusiva do painel
            ancorado, e numa janela estreita — justamente onde a largura
            do painel mais custa — simplesmente não existia: não havia
            como encolher nem como puxar. O drawer já respeita o teto de
            88vw, então arrastar aqui continua não tendo como estourar a
            tela. */}
        {aberto && (
          <div
            className="rv-painel-alca"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar painel"
            aria-valuenow={prefs.largura}
            aria-valuemin={LARGURA_MIN}
            aria-valuemax={LARGURA_MAX}
            tabIndex={0}
            onPointerDown={aoPressionarAlca}
            onKeyDown={aoTeclarAlca}
            data-testid="painel-alca"
          />
        )}

        <PainelAbas
          abaAtiva={abaAtiva}
          aberto={aberto}
          onSelecionar={selecionar}
          onRecolher={recolher}
          onExpandir={expandir}
          idPainelDe={idPainelDe}
        />

        {/* Corpo: os cinco painéis existem sempre; só um fica visível.
            `hidden` (não desmontar) é o que preserva scroll e estado. */}
        <div className="rv-painel-corpo" hidden={!aberto}>
          {ABAS_ORDEM.map((id) => (
            <section
              key={id}
              id={idPainelDe(id)}
              role="tabpanel"
              aria-labelledby={`rv-aba-${id}`}
              className="rv-painel-tabpanel"
              hidden={!aberto || abaAtiva !== id}
              data-testid={`painel-tabpanel-${id}`}
            >
              {/* SEM CABEÇALHO, em nenhum modo. Ele já tinha perdido o
                  título (a aba selecionada diz onde você está, e
                  repetir "CHAT LOG" abaixo dela gastava uma linha pra
                  não dizer nada novo) e sobrevivia só no modo gaveta
                  pra carregar um × de fechar — um segundo botão pro que
                  o "recolher" da fileira de abas já faz, sozinho numa
                  faixa de largura inteira. O nome acessível do painel
                  continua vindo da própria aba (`aria-labelledby`). */}
              <LimiteErroAba chaveReset={id} rotuloAba={ROTULO_ABA[id]}>
                {conteudoAba[id]}
              </LimiteErroAba>
            </section>
          ))}
        </div>
      </aside>

      {/* Janelas internas — o que antes era navegação. */}
      <JanelaJogadoresConvites campaignId={campaignId} aberta={convitesAberto} onFechar={() => setConvitesAberto(false)} />

      {/* AS QUE ERAM PÁGINA. Mesmo lugar das outras: montadas aqui,
          abertas de qualquer porta (painel ou menu da mesa). */}
      {janelas.aberta("mercado") && (
        <JanelaMercado
          campaignId={campaignId}
          ehNarrador={ehNarrador}
          // A loja é a aba Inventário da ficha — o Mercado sempre foi
          // isto com um seletor na frente.
          onAbrirFicha={(id) => consoleDaMesa?.abrir(id, "inventario")}
          onFechar={() => janelas.fechar("mercado")}
        />
      )}
      {janelas.aberta("novo-personagem") && (
        <JanelaNovoPersonagem
          campaignId={campaignId}
          onAbrirFicha={(id) => consoleDaMesa?.abrir(id)}
          onFechar={() => janelas.fechar("novo-personagem")}
        />
      )}
      {janelas.aberta("livro") && (
        <JanelaLivro campaignId={campaignId} onFechar={() => janelas.fechar("livro")} />
      )}
      {ehNarrador && janelas.aberta("conteudo") && (
        <JanelaConteudo campaignId={campaignId} onFechar={() => janelas.fechar("conteudo")} />
      )}
      {ehNarrador && janelas.aberta("configuracoes") && (
        <JanelaConfiguracoes campaignId={campaignId} onFechar={() => janelas.fechar("configuracoes")} />
      )}
      <JanelaAcessoPersonagem campaignId={campaignId} characterId={acessoDe} onFechar={() => setAcessoDe(null)} />
      {bandoAberto && (
        <JanelaInterna aberta titulo="Bando" largura={620} altura={620} onFechar={() => setBandoAberto(false)} testId="painel-janela-bando">
          {/* Mesma aba, com mais espaço — nada de uma segunda
              implementação do Bando para manter em sincronia. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <BandoTab
              campaignId={campaignId}
              visivel
              onEnviarParaPersonagem={(item: ItemTransferivel) => setTransferencia({ item, personagem: null })}
              recarregarSinal={sinalRecarregarBando}
            />
          </div>
        </JanelaInterna>
      )}
      {compendioAberto && (
        <JanelaInterna aberta titulo="Compêndio" largura={680} altura={620} onFechar={() => setCompendioAberto(false)} testId="painel-janela-compendio">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação do Compêndio. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <CompendioTab campaignId={campaignId} visivel />
          </div>
        </JanelaInterna>
      )}
      {participantesAberto && (
        <JanelaInterna aberta titulo="Participantes" largura={620} altura={620} onFechar={() => setParticipantesAberto(false)} testId="painel-janela-participantes">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação de Participantes. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <ParticipantesTab
              campaignId={campaignId}
              visivel
              ehNarrador={ehNarrador}
              onAbrirConvites={() => setConvitesAberto(true)}
              onAbrirConsole={abrirConsole}
            />
          </div>
        </JanelaInterna>
      )}
      {personagensAberto && (
        <JanelaInterna aberta titulo="Personagens" largura={680} altura={620} onFechar={() => setPersonagensAberto(false)} testId="painel-janela-personagens">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação de Personagens. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <PersonagensTab
              campaignId={campaignId}
              visivel
              ehNarrador={ehNarrador}
              onAdicionarACena={onAdicionarPersonagemACena}
              onArrastarPersonagem={onArrastarPersonagem}
              onAbrirConsole={abrirConsole}
              onConfigurarAcesso={setAcessoDe}
              onPrecarregarConsole={aquecerConsole}
              onReceberItemDoBando={(item, personagem) => setTransferencia({ item, personagem })}
            />
          </div>
        </JanelaInterna>
      )}

      {transferencia && (
        <TransferenciaBando
          campaignId={campaignId}
          alvo={transferencia}
          onFechar={() => setTransferencia(null)}
          onConcluido={() => {
            setTransferencia(null);
            setSinalRecarregarBando((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
