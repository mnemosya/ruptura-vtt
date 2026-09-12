"use client";

/**
 * Casca da campanha — moldura que toda rota sob `/mesas/[campaignId]`
 * herda: atmosfera HUD, cabeçalho (nome da campanha + papel atual,
 * aditivo §5.3 "campanha e função atual devem permanecer
 * identificáveis"), trilho de navegação, área de conteúdo roteado e a
 * faixa lateral de sessão.
 *
 * Virou Client Component nesta fase (antes era Server): a casca agora
 * hospeda o cursor HUD e o estado de aberto/fechado do painel de
 * sessão. Continua sem NENHUMA checagem de autorização própria —
 * recebe papel e campanha já resolvidos pelo layout, como sempre.
 *
 * Por que não reusa `GlobalShell`: aquela casca traz a navegação global
 * (Minhas Campanhas / Personagens / Compêndio / Conta) numa sidebar
 * própria; a campanha tem a sua. O que se reaproveita é o vocabulário
 * visual (via `mesa.css`) e o componente de cursor, não a estrutura.
 *
 * `painelSessao`/`turnTrackDock` (o SessionPanel de log/participantes e
 * o dock de turno, Fase 3) chegam como PROPS — passados pelo `layout.tsx`,
 * que fica ACIMA do `CampaignRealtimeProvider` só na wiring, mas cria os
 * elementos DENTRO da árvore do provider (JSX resolve Context pela
 * posição real na árvore renderizada, não por onde foi escrito) — então
 * `SessionPanel`/`TurnTrackDock`, mesmo passados como prop, continuam
 * enxergando o Context normalmente. Passar por prop em vez de
 * `CampaignShell` importá-los direto mantém este componente testável em
 * isolamento (ver `/dev/campaign-shell-drawer`, que injeta conteúdo de
 * teste no lugar do SessionPanel real, sem precisar montar um provider
 * de verdade).
 */

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CampaignRole } from "../../../../lib/campaign/access";
import { HudCursor } from "../../_global/GlobalShell";
import { CampaignNav } from "./CampaignNav";
import { NavPendingProvider } from "../../../_design/NavPending";
import { BootMinDurationOverlay } from "../../../_boundaries/BootMinDurationOverlay";
import { ProvedorConsoleDaMesa, useConsoleDaMesa } from "./ConsoleDaMesa";
import { ProvedorMesaDados } from "../vtt/_dados3d/ContextoMesaDados";
import { ProvedorTrilhaDaMesa } from "./TrilhaDaMesa";
import "../../../_design/mesa.css";

/**
 * Se o painel de sessão está VISÍVEL de verdade agora — não "montado",
 * "visível ao usuário". Existe porque `SessionPanel.tsx` (o
 * `painelSessao` real) precisa disso pra contar mensagens não lidas
 * corretamente: no breakpoint intermediário, com o drawer FECHADO, a
 * aba interna do painel pode continuar sendo "Log" (é o padrão), mas o
 * usuário não está vendo nada — sem essa informação, `SessionPanel`
 * não tinha como saber que devia contar como não lida uma entrada nova
 * chegando nesse estado (bug real: contador ficava travado em 0
 * indefinidamente com o drawer fechado, mesmo se o log estivesse
 * crescendo).
 *
 * Criado e provido AQUI (por `PainelSessao`, que já é dona do estado
 * `aberto`/`intermediario`), não em `CampaignRealtimeProvider` —
 * `CampaignShell` continua sem depender do provider real (ver nota
 * abaixo), e este contexto só precisa alcançar quem está DENTRO de
 * `PainelSessao`, nunca o resto da árvore. Default `true`: se por
 * algum motivo `SessionPanel` for renderizado fora de `PainelSessao`
 * (não deveria acontecer em produção), assume visível — não esconder
 * um contador por engano é o lado mais seguro do erro.
 */
const PainelVisivelContext = createContext(true);
export function usePainelSessaoVisivel(): boolean {
  return useContext(PainelVisivelContext);
}

/**
 * Caminho INVERSO do `PainelVisivelContext` acima: deixa quem está
 * DENTRO de `PainelSessao` (o `SessionPanel` real) reportar uma
 * contagem pro botão-gatilho "Sessão" mostrar — o botão e o `<aside>`
 * são IRMÃOS (ambos filhos de `PainelSessao`), não um dentro do outro,
 * então o contador não chega lá por composição normal de JSX.
 *
 * Achado de auditoria: o badge de não lidos (`session-log-nao-lidos`)
 * vivia SÓ dentro do `<aside>` — exatamente o elemento que a correção
 * do P2 provou que fica com `display: none` no breakpoint intermediário
 * quando o drawer está fechado. O número incrementava de verdade (a
 * lógica estava certa), mas ficava invisível até abrir o painel — o
 * caso de uso inteiro ("saber que tem mensagem nova SEM abrir") não
 * era atendido. `PainelSessao` não sabe (nem deveria saber) o que o
 * número significa — só repassa o que `SessionPanel` reportar pro
 * `.rm-drawer-contador` (classe já existente em `mesa.css`, nunca usada
 * até agora).
 */
const PainelBadgeContext = createContext<(n: number) => void>(() => {});
export function usePainelSessaoBadge(): (n: number) => void {
  return useContext(PainelBadgeContext);
}

// `CampaignShell` de propósito NÃO chama `useCampaignSession()` — faria
// este componente exigir um `CampaignRealtimeProvider` acima na árvore
// pra sempre, quebrando `/dev/campaign-shell-drawer` (que testa a
// casca isolada, sem um provider real, injetando `painelSessao` de
// teste no lugar do `SessionPanel` verdadeiro). O marcador de
// "instância única" do provider (prova pedida pela auditoria da
// Fase 1) mora dentro do próprio `SessionPanel.tsx`, que já é
// contexto-dependente por natureza.

/** Espelha `useCursorHabilitado` do Console: cursor customizado só quando o sistema não pede movimento reduzido. */
function useCursorHabilitado(): boolean {
  const [habilitado, setHabilitado] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setHabilitado(!mq.matches);
    const onChange = () => setHabilitado(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return habilitado;
}

/**
 * true abaixo de 1280px — mesmo breakpoint de `mesa.css`
 * (`@media (max-width: 1279px)`). Os dois PRECISAM concordar: é o que
 * decide se `PainelSessao` se comporta como diálogo NÃO-modal
 * sobreposto (drawer — ver decisão detalhada mais abaixo) ou como
 * landmark estático (coluna do grid).
 */
function useBreakpointIntermediario(): boolean {
  const [intermediario, setIntermediario] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)");
    setIntermediario(mq.matches);
    const onChange = () => setIntermediario(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return intermediario;
}

/**
 * A ÚNICA superfície do painel de sessão — renderizada em UM lugar do
 * JSX, nunca dois. Uma auditoria anterior encontrou o bug real de
 * passar `painelSessao` para dois pontos do JSX (coluna do grid E
 * dentro do drawer): mesmo sendo "o mesmo nó React", cada ponto de
 * renderização monta sua PRÓPRIA árvore de componentes — dois
 * `useState`, duas assinaturas de qualquer efeito, dois DOMs com o
 * mesmo `data-testid`. Para o SessionPanel da Fase 3 (que vai assinar
 * Realtime), isso teria significado duas assinaturas do mesmo canal.
 *
 * A correção não é só técnica de teste, é estrutural: CSS reposiciona
 * a MESMA superfície por breakpoint, em vez de React montá-la duas
 * vezes. Em ≥1280px (`mesa.css` sem a media query) ela é uma coluna
 * normal do grid — sempre visível, sem semântica de diálogo. Abaixo de
 * 1280px ela vira `position: fixed` e um DIÁLOGO NÃO-MODAL (decisão
 * explicada abaixo, no bloco de `propsDialogo`).
 *
 * ── Decisão: diálogo não-modal, não modal de verdade ────────────────
 * A Fase −1 pediu especificamente que o trilho de navegação continue
 * clicável com o painel aberto (é o que permite "fechamento automático
 * ao navegar" — sair para outra seção sem precisar fechar o painel
 * primeiro). Isso é, por definição, o padrão WAI-ARIA de "non-modal
 * dialog": o resto da página CONTINUA operável, então `aria-modal` deve
 * ser `false` (nunca `true`), e por decorrência não deve prender foco
 * — um modal de verdade prende foco porque o resto da página está
 * inerte; aqui não está. Sem essa mudança, a versão anterior tinha uma
 * inconsistência real entre entradas: mouse conseguia alcançar o
 * trilho por baixo do backdrop (que exclui a faixa do trilho de
 * propósito), mas teclado ficava PRESO dentro do painel (Tab não saía)
 * — dois graus de acesso diferentes pro mesmo recurso, dependendo de
 * qual dispositivo de entrada. Ver
 * https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (padrão
 * "non-modal dialog"): Escape/clique-fora continuam válidos como
 * conveniência; foco preso não é.
 */
function PainelSessao({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [badge, setBadge] = useState(0);
  const intermediario = useBreakpointIntermediario();
  const painelId = useId();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  /**
   * Se o fechamento em curso foi um ato DELIBERADO do usuário sobre o
   * painel (Escape, backdrop, o próprio toggle) — só nesses casos o foco
   * volta pro botão "Sessão".
   *
   * Achado de auditoria: o cleanup do efeito abaixo devolvia foco SEMPRE,
   * mas ele roda em qualquer transição de `aberto`/`intermediario` —
   * inclusive quando o painel fecha por NAVEGAÇÃO (o efeito de
   * `pathname`) ou por mudança de breakpoint. Nesses casos o foco do
   * usuário está em outro lugar legítimo (o link do trilho que ele
   * acabou de acionar, ou o conteúdo da página nova), e puxá-lo de volta
   * pro botão do drawer é roubo de foco — quebra a navegação por teclado
   * exatamente em quem depende dela.
   */
  const fechamentoExplicitoRef = useRef(false);

  // Navegar fecha o painel quando ele está agindo como drawer — cobre o
  // conteúdo, e ficar aberto por cima de uma página nova que o usuário
  // acabou de pedir é ruído. Em ≥1280px isto não faz diferença visual
  // nenhuma (a superfície é sempre mostrada lá), mas mantém o estado
  // previsível: reentrar no breakpoint estreito começa sempre fechado.
  useEffect(() => {
    // Fechamento por navegação NÃO é explícito — o foco pertence a quem
    // navegou (ver `fechamentoExplicitoRef`).
    fechamentoExplicitoRef.current = false;
    setAberto(false);
  }, [pathname]);

  // Efeitos de diálogo NÃO-MODAL (ver decisão acima): trava scroll do
  // fundo (o conteúdo coberto pelo backdrop não devia rolar por baixo),
  // Escape fecha, foco entra no painel ao abrir e volta ao botão ao
  // fechar. NÃO prende foco — Tab flui pro resto da página normalmente,
  // simetricamente ao mouse (que já alcança o trilho por baixo do
  // backdrop). Só roda no breakpoint intermediário: em ≥1280px o painel
  // nunca é aberto pelo usuário (o botão que alterna `aberto` só existe
  // visualmente ali, via CSS), então este efeito não tem o que fazer.
  useEffect(() => {
    if (!intermediario || !aberto) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechamentoExplicitoRef.current = true;
        setAberto(false);
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    // Foco entra no painel ao abrir — prática comum mesmo em diálogos
    // não-modais (ex.: painéis de "Localizar na página"), não implica
    // prender o foco ali depois.
    painelRef.current?.focus();

    // Devolve o foco a quem abriu no CLEANUP deste efeito (roda quando
    // `aberto` ou `intermediario` mudam, e no unmount — `focus()` num
    // nó já desconectado é no-op, inofensivo). Versão anterior usava
    // `onTransitionEnd`, que nunca disparava por falta de qualquer
    // `transition` declarada no elemento — bug real, corrigido.
    //
    // Mas SÓ em fechamento explícito (ver `fechamentoExplicitoRef`):
    // devolver foco sempre roubava o foco de quem tinha acabado de
    // navegar pelo trilho, porque este mesmo cleanup também roda quando
    // o painel fecha por navegação ou por mudança de breakpoint.
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = anterior;
      if (fechamentoExplicitoRef.current) {
        fechamentoExplicitoRef.current = false;
        botaoRef.current?.focus();
      }
    };
  }, [aberto, intermediario]);

  // `role`/`aria-modal`/`tabIndex` só existem quando a superfície é de
  // fato um diálogo (intermediário) — em ≥1280px ela é um landmark
  // comum (`aria-label`, sem role nenhum). `aria-modal: false` é
  // explícito (não omitido) — documenta a decisão em vez de deixar o
  // leitor achar que foi esquecido.
  const propsDialogo = intermediario ? { role: "dialog" as const, "aria-modal": false, tabIndex: -1 } : {};

  // Visível de verdade: sempre em ≥1280px (é a coluna do grid, nunca
  // "fechada"); só quando `aberto` no breakpoint intermediário.
  const painelVisivel = !intermediario || aberto;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className="rm-drawer-toggle"
        data-testid="campshell-drawer-toggle"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={() => {
          // Fechar pelo próprio toggle é explícito (o foco já está aqui,
          // então devolver é no-op — mas mantém a intenção declarada).
          fechamentoExplicitoRef.current = aberto;
          setAberto((v) => !v);
        }}
      >
        {rotulo}
        {badge > 0 && (
          <span className="rm-drawer-contador" data-testid="campshell-drawer-toggle-badge">
            {badge}
          </span>
        )}
      </button>

      {/*
        MONTADO enquanto o breakpoint for o intermediário, aberto ou
        não — antes era `intermediario && aberto`, e essa era a razão
        de o fechamento não poder ser animado: React removia o nó no
        mesmo frame do clique, então nenhuma transição de saída chegava
        a rodar e o véu sumia seco enquanto o painel ainda estava lá.
        Com o nó permanente, `.mo-scrim` (motion.css) cuida do resto e
        os dois saem JUNTOS, com a mesma curva e a mesma duração.

        `inert` quando fechado, além de `visibility: hidden` do
        `.mo-scrim`: um `<button>` invisível mas focável seria uma
        armadilha de teclado silenciosa — Tab pararia num "Fechar
        painel" que o usuário não vê e que não faz nada.
      */}
      {intermediario && (
        <button
          type="button"
          className="rm-drawer-backdrop mo-scrim"
          data-open={aberto}
          inert={!aberto}
          aria-label="Fechar painel"
          onClick={() => {
            fechamentoExplicitoRef.current = true;
            setAberto(false);
          }}
        />
      )}

      <aside
        id={painelId}
        ref={painelRef}
        className="rm-shell-panel"
        data-testid="campshell-painel-sessao"
        aria-label={rotulo}
        // `data-open` (nunca `hidden`) — CORREÇÃO DE FLASH: a versão
        // anterior usava `hidden={intermediario && !aberto}`, e
        // `intermediario` só é conhecido depois que o efeito de
        // `matchMedia` roda (useState(false) inicial, tanto no SSR
        // quanto no primeiro paint do cliente, ANTES de qualquer efeito
        // — efeitos rodam depois do paint, nunca antes). Numa tela
        // estreita, isso fazia `intermediario` começar `false` por um
        // instante real mesmo com a viewport já estreita — `hidden`
        // avaliava pra `false`, e o painel (já `position: fixed` pela
        // media query, que É síncrona) aparecia como um drawer aberto
        // por cima do conteúdo, sumindo um instante depois quando o
        // efeito corrigia `intermediario`. `aberto`, em contraste, é
        // `false` desde o `useState` inicial em QUALQUER contexto
        // (servidor ou cliente, não depende de `window`) — então
        // `data-open="false"` já nasce certo, sem depender de nenhum
        // efeito rodar primeiro. A ocultação de verdade agora é 100%
        // CSS (`.rm-shell-panel[data-open="true"]` dentro da media
        // query, ver mesa.css), nunca um atributo React que só fica
        // correto um tick depois de montar.
        data-open={aberto}
        {...propsDialogo}
      >
        <PainelVisivelContext.Provider value={painelVisivel}>
          <PainelBadgeContext.Provider value={setBadge}>{children}</PainelBadgeContext.Provider>
        </PainelVisivelContext.Provider>
      </aside>
    </>
  );
}

export function CampaignShell({
  campaignId,
  campaignName,
  role,
  painelSessao,
  turnTrackDock,
  avisoSync,
  children,
}: {
  campaignId: string;
  campaignName: string;
  role: CampaignRole;
  /** SessionPanel (log + participantes). */
  painelSessao?: ReactNode;
  /** Dock persistente do rastreador de turno. */
  turnTrackDock?: ReactNode;
  /**
   * Aviso global de sincronização (`SyncAlert`). Vai no CABEÇALHO
   * porque é a única superfície visível em toda rota e todo breakpoint
   * — o painel de sessão vira drawer fechado no intermediário, e a Mesa
   * é só uma das rotas.
   */
  avisoSync?: ReactNode;
  children: ReactNode;
}) {
  const cursorHabilitado = useCursorHabilitado();

  // A Mesa (`/vtt`) é uma UI própria, de tela cheia, com FERRAMENTAS e
  // PAINEL LATERAL equivalentes já embutidos (`rv-ferramentas`,
  // `rv-painel` — Chat/Personagens/Participantes/Bando/Compêndio). O
  // drawer geral de Log/Participantes da casca é redundante ali e,
  // como precisa de um z-index acima de tudo pra funcionar como
  // overlay nas outras rotas, renderiza POR CIMA do painel próprio da
  // Mesa em vez de ao lado dele — bug real reportado visualmente
  // ("o painel de log fica na frente do menu da direita da mesa").
  // Suprimido só nesta rota; nenhuma outra página perde o drawer.
  const pathname = usePathname();
  const naMesaVtt = pathname?.endsWith("/vtt") ?? false;

  return (
    // Agrega `useLinkStatus()` de todo `<LinkPending>` do trilho (ver
    // `CampaignNav.tsx`) numa contagem única — é o sinal que
    // `BootMinDurationOverlay` (dentro de `.rm-shell-main`, abaixo) usa
    // pra saber se alguma navegação está em voo.
    <NavPendingProvider>
    {/* O Console do Personagem é janela DESTA casca, não uma rota:
        qualquer página da campanha abre a ficha por cima de si mesma,
        sem navegar. Ver `ConsoleDaMesa.tsx`. */}
    {/* Uma trilha de turnos só, para a campanha inteira — o dock, a
        ficha e o VTT leem a MESMA linha de `vtt_turn_tracks`. Ver
        `TrilhaDaMesa.tsx`. */}
    <ProvedorTrilhaDaMesa campaignId={campaignId}>
    {/* A mesa de dados envolve a campanha INTEIRA, não só o VTT: o
        Console é uma janela desta casca (`ConsoleDaMesa.tsx`) e rola
        pelos mesmos d8 de verdade que a ferramenta do mapa. Quem
        DESENHA a física continua sendo quem tem palco — o VTT o
        reivindica; nas outras páginas o próprio provedor desenha por
        cima da página. */}
    <ProvedorMesaDados>
    <ProvedorConsoleDaMesa campaignId={campaignId}>
    <div className="rm-root">
      <HudCursor enabled={cursorHabilitado} />

      <div className="rm-bg" aria-hidden="true">
        <div className="rm-bg-img" />
        <div className="rm-bg-grid" />
        <div className="rm-bg-vignette" />
      </div>

      <div className="rm-shell">
        <div className="rm-shell-rail">
          <CampaignNav campaignId={campaignId} role={role} />
        </div>

        <header className="rm-shell-header rm-header">
          <div className="rm-deco-top" aria-hidden="true">
            <div className="rm-deco-a" />
            <div className="rm-deco-b" />
          </div>

          <Link href="/mesas" className="rm-header-home">
            Ruptura VTT
          </Link>
          <span className="rm-header-sep" aria-hidden="true">
            /
          </span>
          <h1 className="rm-header-nome" data-testid="campshell-nome-campanha" title={campaignName}>
            {campaignName}
          </h1>
          <span className="rm-badge-papel" data-papel={role} data-testid="campshell-papel">
            {role === "narrator" ? "Narrador" : "Jogador"}
          </span>
          {avisoSync}
        </header>

        {turnTrackDock && <div className="rm-shell-dock">{turnTrackDock}</div>}

        <main className="rm-shell-main">
          {children}
          <BootMinDurationOverlay label="Carregando mesa" />
        </main>

        {/* Uma única chamada — a superfície decide sozinha, via CSS de
            breakpoint, se é coluna de grid ou drawer. Suprimida na
            Mesa (`naMesaVtt`) — ver comentário acima — e enquanto uma
            ficha está aberta. */}
        {painelSessao && !naMesaVtt && <PainelSessaoSeLivre rotulo="Sessão">{painelSessao}</PainelSessaoSeLivre>}
      </div>
    </div>
    </ProvedorConsoleDaMesa>
    </ProvedorMesaDados>
    </ProvedorTrilhaDaMesa>
    </NavPendingProvider>
  );
}

/**
 * A faixa de sessão (Log/Participantes) some enquanto uma ficha está
 * aberta.
 *
 * A ficha ocupa quase toda a largura útil e o que sobrava do painel ao
 * lado era uma tira de log sem contexto — parecia outra tela colada na
 * ficha, que foi exatamente a leitura de quem usou. Ela volta sozinha
 * ao fechar; nada é desmontado, só deixa de ser renderizado no lugar
 * onde atrapalhava.
 */
function PainelSessaoSeLivre({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const consoleDaMesa = useConsoleDaMesa();
  if (consoleDaMesa?.aberto) return null;
  return <PainelSessao rotulo={rotulo}>{children}</PainelSessao>;
}
