/**
 * Browser check da LINGUAGEM DE MOVIMENTO (`src/app/_design/motion.css`).
 *
 * Por que existe: as afirmações que a fase de motion faz são todas
 * temporais ("o painel sai em 150ms", "o véu sai junto", "o esqueleto
 * não pisca antes de 120ms", "movimento reduzido zera o
 * deslocamento"). Nenhuma delas é verificável lendo CSS — `@starting-
 * style`, `transition-behavior: allow-discrete` e `prefers-reduced-
 * motion` só existem depois que a cascata e o compositor rodaram. Então
 * a medida é `getComputedStyle` no meio da animação, no browser real,
 * exatamente como `check-console-baseline.ts` faz com aparência.
 *
 * Roda contra `/dev/campaign-shell-drawer` — o mesmo harness isolado de
 * `check-campaign-shell-drawer.ts`, que monta o `CampaignShell` REAL
 * sem exigir campanha autenticada.
 *
 * Cobre:
 *   1. Escalas `--mo-*` resolvem dentro das cascas.
 *   2. E NÃO vazam para `:root` — é a mesma proteção que `tokens.css`
 *      documenta e que `check-console-baseline.ts` mede pelo outro
 *      lado: em `:root`, "o Console não enxerga os tokens do redesign"
 *      deixaria de ser uma afirmação verificável.
 *   3. Drawer: a ENTRADA de fato interpola (estado intermediário medido
 *      estritamente entre o inicial e o final, não só "chegou lá").
 *   4. Drawer: a SAÍDA existe — era o buraco real da versão anterior,
 *      onde React removia o nó e nada animava.
 *   5. Véu e painel saem JUNTOS (o véu ainda estava visível no meio da
 *      saída do painel; antes ele era desmontado no frame do clique).
 *   6. Véu fechado é inerte E invisível — não é "transparente e
 *      clicável", e não é armadilha de Tab.
 *   7. `prefers-reduced-motion`: sem deslocamento nenhum e sem espera.
 *   8. Navegação EM VOO marca o destino (`<LinkPending>`/`.mo-linkflag`)
 *      com o glow do HUD e o desmarca quando a rota chega — com texto
 *      para leitor de tela, não só o sinal visual.
 *  10. NADA COMPARTILHADO SOME numa navegação entre rotas globais: a
 *      sidebar é o MESMO nó de DOM antes, durante e depois (não uma
 *      igual remontada), e os itens de menu, a topbar e o fundo HUD
 *      continuam na tela. É a regressão que motivou mover a casca das
 *      páginas para o layout do grupo `(global)` — antes o `loading.tsx`
 *      substituía a tela inteira, porque a casca fazia parte da página.
 *  11. A entrada de rota não mexe em geometria: só `opacity`. Guarda
 *      contra alguém devolver deslocamento/escala ali e reintroduzir
 *      layout shift.
 *   9. Sidebar global fechada no mobile sai da ordem de foco. Era um
 *      bug de acessibilidade PRÉ-EXISTENTE, corrigido de carona nesta
 *      fase: `transform: translateX(-100%)` tira da tela mas não da
 *      tabulação, então a navegação inteira continuava alcançável por
 *      Tab atrás do conteúdo.
 *
 * Os critérios 8 e 9 rodam contra `/mesas` e precisam da sessão salva
 * (`npx tsx scripts/dev/save-admin-session.ts`), como os demais checks
 * autenticados. Os critérios 1-7 não precisam de nada.
 *
 * Uso: npx tsx scripts/dev/check-motion.ts
 */

import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

const ROTA = "/dev/campaign-shell-drawer";

let aprovados = 0;
let reprovados = 0;

function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) {
    aprovados += 1;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    reprovados += 1;
    console.log(`FALHA - ${criterio}: ${detalhe}`);
  }
}

/**
 * Um retrato do drawer + véu. `x` é o deslocamento horizontal REAL
 * (extraído da matriz), não a string — comparar `"none"` com
 * `"matrix(...)"` não diz se está no meio do caminho.
 */
interface Retrato {
  display: string;
  opacity: number;
  x: number;
  veuOpacity: number;
  veuVisibility: string;
  veuInert: boolean;
}

async function abrirHarness(page: Page) {
  await page.goto(`${BASE_URL}${ROTA}`, { waitUntil: "networkidle" });
  // O drawer só existe abaixo de 1280px (acima disso o painel é coluna
  // do grid, sempre visível — nada a animar).
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(120);
}

/**
 * Roda a sequência fechado → entrando → aberto → saindo → fechado e
 * devolve um retrato por etapa.
 *
 * ARMADILHA (já documentada nos outros checks): `page.evaluate` via
 * `tsx` NÃO aceita função auxiliar NOMEADA dentro do callback — nem
 * declaração, nem arrow atribuída a `const`. O esbuild injeta um
 * wrapper `__name` que não existe no browser
 * (`ReferenceError: __name is not defined`, encontrado ao escrever
 * este arquivo). Por isso o retrato é montado inline dentro de um laço
 * dirigido por uma tabela de passos, em vez de por um helper: é a
 * forma de não repetir o literal cinco vezes SEM criar um nome.
 */
async function sequenciaDrawer(page: Page, esperaMeio: number): Promise<Retrato[]> {
  return page.evaluate(
    async ({ esperaMeio }) => {
      const painel = document.querySelector('[data-testid="campshell-painel-sessao"]') as HTMLElement;
      const veu = document.querySelector(".rm-drawer-backdrop") as HTMLElement;
      const toggle = document.querySelector('[data-testid="campshell-drawer-toggle"]') as HTMLElement;

      // 0 fechado · 1 meio da entrada · 2 aberto · 3 meio da saída · 4 fechado
      const plano = [
        { clicar: false, espera: 0 },
        { clicar: true, espera: esperaMeio },
        { clicar: false, espera: 400 },
        { clicar: true, espera: esperaMeio },
        { clicar: false, espera: 400 },
      ];

      const fotos = [];
      for (const passo of plano) {
        if (passo.clicar) toggle.click();
        if (passo.espera > 0) await new Promise((res) => setTimeout(res, passo.espera));
        const cs = getComputedStyle(painel);
        const cv = getComputedStyle(veu);
        fotos.push({
          display: cs.display,
          opacity: Number(cs.opacity),
          // Deslocamento REAL em px, extraído da matriz — comparar a
          // string "none" com "matrix(...)" não diz se está no meio do
          // caminho, que é justamente o que este check precisa provar.
          x: new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform).m41,
          veuOpacity: Number(cv.opacity),
          veuVisibility: cv.visibility,
          veuInert: veu.hasAttribute("inert"),
        });
      }
      return fotos;
    },
    { esperaMeio },
  );
}

async function main() {
  const browser = await chromium.launch();

  // ── Movimento normal ────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await abrirHarness(page);

    const escalas = await page.evaluate(() => {
      const raiz = document.querySelector(".rm-root") as HTMLElement;
      const cs = getComputedStyle(raiz);
      const doc = getComputedStyle(document.documentElement);
      const nomes = ["--mo-dur-micro", "--mo-dur-enter", "--mo-dur-exit", "--mo-dur-view", "--mo-ease-out", "--mo-dist-panel", "--mo-delay-busy"];
      return {
        naCasca: Object.fromEntries(nomes.map((n) => [n, cs.getPropertyValue(n).trim()])),
        noRoot: Object.fromEntries(nomes.map((n) => [n, doc.getPropertyValue(n).trim()])),
      };
    });

    const todasResolvem = Object.values(escalas.naCasca).every((v) => v.length > 0);
    registrar(
      "1 (escalas --mo-* resolvem dentro da casca)",
      todasResolvem,
      Object.entries(escalas.naCasca).map(([k, v]) => `${k}=${v || "VAZIO"}`).join(", "),
    );

    const vazias = Object.values(escalas.noRoot).every((v) => v.length === 0);
    registrar(
      "2 (nenhuma escala --mo-* vaza pro :root — proteção da linha de base do Console)",
      vazias,
      vazias ? "todas vazias no :root, como deve ser" : `VAZOU: ${JSON.stringify(escalas.noRoot)}`,
    );

    const [fechado, entrando, aberto, saindo, fechadoDeNovo] = await sequenciaDrawer(page, 90);

    // Entrada: no meio do caminho, o painel precisa estar ENTRE o
    // estado inicial (opacity 0, x=24) e o final (opacity 1, x=0).
    // "Chegou ao final" sozinho não prova animação nenhuma — um
    // `display` seco também chegaria lá.
    const entradaInterpola =
      entrando.display !== "none" &&
      entrando.opacity > 0 && entrando.opacity < 1 &&
      entrando.x > 0 && entrando.x < 24;
    registrar(
      "3 (entrada do drawer interpola de verdade)",
      entradaInterpola,
      `meio: display=${entrando.display} opacity=${entrando.opacity.toFixed(2)} x=${entrando.x.toFixed(1)}px (esperado 0<opacity<1 e 0<x<24) | final: opacity=${aberto.opacity} x=${aberto.x}`,
    );

    // Saída: o buraco real da versão anterior. `display` ainda precisa
    // ser `flex` no meio da saída (é o `allow-discrete` segurando o nó)
    // e `none` no fim.
    const saidaExiste =
      saindo.display !== "none" &&
      saindo.opacity < 1 &&
      fechadoDeNovo.display === "none";
    registrar(
      "4 (saída do drawer existe e termina em display:none)",
      saidaExiste,
      `meio da saída: display=${saindo.display} opacity=${saindo.opacity.toFixed(2)} | fim: display=${fechadoDeNovo.display}`,
    );

    // Coordenação: antes, o véu era `{aberto && <button/>}` e sumia no
    // frame do clique enquanto o painel ainda deslizava por 250ms.
    const veuSaiJunto = saindo.veuOpacity > 0 && saindo.veuVisibility === "visible";
    registrar(
      "5 (véu e painel saem juntos)",
      veuSaiJunto,
      `no meio da saída do painel, véu: opacity=${saindo.veuOpacity.toFixed(2)} visibility=${saindo.veuVisibility} (esperado >0 e visible)`,
    );

    const veuFechadoSeguro =
      fechado.veuInert && fechadoDeNovo.veuInert &&
      fechado.veuVisibility === "hidden" && fechadoDeNovo.veuVisibility === "hidden";
    registrar(
      "6 (véu fechado é inerte e invisível, nunca transparente-e-clicável)",
      veuFechadoSeguro,
      `inert inicial=${fechado.veuInert}, inert após fechar=${fechadoDeNovo.veuInert}, visibility=${fechadoDeNovo.veuVisibility}`,
    );

    await ctx.close();
  }

  // ── Palco do painel de carregamento (centralização) ─────────────
  // Verifica a coisa que motivou este bloco: `BootPanel` precisa
  // centralizar dentro da ÁREA DE CONTEÚDO — nunca por cima do trilho.
  // Injeta o markup exato que `[campaignId]/loading.tsx` renderiza
  // (`.mo-boot-stage` > `.mo-boot-in` > `.mo-boot`) dentro de
  // `.rm-shell-main` já montado pelo harness — mais direto e
  // determinístico que flagrar o `loading.tsx` real numa janela de
  // tempo estreita, e testa exatamente a mesma folha de estilo.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}${ROTA}`, { waitUntil: "networkidle" });

    const medidas = await page.evaluate(() => {
      const main = document.querySelector(".rm-shell-main") as HTMLElement;
      main.innerHTML =
        '<main class="mo-boot-stage mo-scope"><div class="mo-boot-in"><div class="mo-boot" role="status">' +
        '<span class="mo-boot-label">Teste</span><span class="mo-boot-bar"></span></div></div></main>';
      const painel = document.querySelector(".mo-boot") as HTMLElement;
      const rail = document.querySelector(".rm-navrail") as HTMLElement;
      const mainBox = main.getBoundingClientRect();
      const painelBox = painel.getBoundingClientRect();
      const railBox = rail?.getBoundingClientRect();
      // `.rm-shell-main` tem padding ASSIMÉTRICO (mais embaixo que em
      // cima — respiro pro final da rolagem). `min-height:100%` do
      // `.mo-boot-stage` resolve contra a caixa de CONTEÚDO (que já
      // exclui o padding, é assim que `%` sempre funcionou em CSS) —
      // então o centro geométrico da caixa DE FORA (padding incluído)
      // não é o centro que o painel de fato mira. Medir contra ele
      // teria acusado um "erro" de 8px que não é bug nenhum, só
      // aritmética de padding ignorada na medida.
      const cs = getComputedStyle(main);
      const padTop = parseFloat(cs.paddingTop);
      const padBottom = parseFloat(cs.paddingBottom);
      const padLeft = parseFloat(cs.paddingLeft);
      const padRight = parseFloat(cs.paddingRight);
      const conteudoTop = mainBox.top + padTop;
      const conteudoBottom = mainBox.bottom - padBottom;
      const conteudoLeft = mainBox.left + padLeft;
      const conteudoRight = mainBox.right - padRight;
      return {
        centroPainelX: painelBox.left + painelBox.width / 2,
        centroAreaX: (conteudoLeft + conteudoRight) / 2,
        centroPainelY: painelBox.top + painelBox.height / 2,
        centroAreaY: (conteudoTop + conteudoBottom) / 2,
        painelEsquerda: painelBox.left,
        railDireita: railBox ? railBox.right : 0,
      };
    });

    const centralizadoX = Math.abs(medidas.centroPainelX - medidas.centroAreaX) < 2;
    const centralizadoY = Math.abs(medidas.centroPainelY - medidas.centroAreaY) < 2;
    const naoInvadeTrilho = medidas.painelEsquerda >= medidas.railDireita;

    registrar(
      "12 (BootPanel centraliza dentro da área de conteúdo, sem invadir o trilho)",
      centralizadoX && centralizadoY && naoInvadeTrilho,
      `centro do painel=(${medidas.centroPainelX.toFixed(1)}, ${medidas.centroPainelY.toFixed(1)}) vs centro da área=(${medidas.centroAreaX.toFixed(1)}, ${medidas.centroAreaY.toFixed(1)}); borda esquerda do painel=${medidas.painelEsquerda.toFixed(1)}px, borda direita do trilho=${medidas.railDireita.toFixed(1)}px`,
    );

    await ctx.close();
  }

  // ── Movimento reduzido ──────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await abrirHarness(page);

    const dist = await page.evaluate(() => {
      const raiz = document.querySelector(".rm-root") as HTMLElement;
      const cs = getComputedStyle(raiz);
      return {
        panel: cs.getPropertyValue("--mo-dist-panel").trim(),
        sm: cs.getPropertyValue("--mo-dist-sm").trim(),
        enter: cs.getPropertyValue("--mo-dur-enter").trim(),
        // O atraso anti-flash NÃO é zerado de propósito: não é
        // movimento, é a decisão de não piscar um esqueleto numa
        // navegação de 40ms — vale igual pra quem pede movimento
        // reduzido.
        delayBusy: cs.getPropertyValue("--mo-delay-busy").trim(),
      };
    });

    const semDeslocamento = dist.panel === "0px" && dist.sm === "0px";
    registrar(
      "7a (movimento reduzido zera os deslocamentos)",
      semDeslocamento,
      `--mo-dist-panel=${dist.panel}, --mo-dist-sm=${dist.sm} (esperado 0px nos dois)`,
    );

    // O browser normaliza a serialização do valor computado ("0.01ms"
    // volta como ".01ms"), então a comparação é numérica em ms, não de
    // string — foi o que reprovou este critério na primeira execução,
    // com o CSS já correto.
    const emMs = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
    const semEspera = emMs(dist.enter) <= 1;
    registrar(
      "7b (movimento reduzido zera a duração de entrada)",
      semEspera,
      `--mo-dur-enter=${dist.enter} (esperado 0.01ms)`,
    );

    registrar(
      "7c (atraso anti-flash PRESERVADO no movimento reduzido)",
      Math.abs(emMs(dist.delayBusy) - 120) < 1,
      `--mo-delay-busy=${dist.delayBusy} (esperado seguir 120ms — não é movimento, é anti-flash)`,
    );

    // Mesmo sem movimento, abrir e fechar precisa continuar FUNCIONANDO.
    const [, , aberto, , fechadoDeNovo] = await sequenciaDrawer(page, 60);
    const aindaFunciona = aberto.display !== "none" && aberto.opacity === 1 && fechadoDeNovo.display === "none";
    registrar(
      "7d (movimento reduzido não quebra abrir/fechar)",
      aindaFunciona,
      `aberto: display=${aberto.display} opacity=${aberto.opacity} x=${aberto.x} | fechado: display=${fechadoDeNovo.display}`,
    );

    await ctx.close();
  }

  // ── Cascas autenticadas (/mesas) ────────────────────────────────
  {
    requireSessaoSalva();
    const ctx = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    const mobileFechada = await page.evaluate(() => {
      const wrap = document.querySelector(".ra2-sidebar-wrap") as HTMLElement;
      const link = wrap.querySelector('[data-testid="nav-characters"]') as HTMLElement;
      const visibility = getComputedStyle(wrap).visibility;
      link.focus();
      return { visibility, focoChegou: document.activeElement === link };
    });
    registrar(
      "9 (sidebar global fechada no mobile sai da ordem de foco)",
      mobileFechada.visibility === "hidden" && !mobileFechada.focoChegou,
      `visibility=${mobileFechada.visibility} (esperado hidden), focus() alcançou um item=${mobileFechada.focoChegou} (esperado false)`,
    );

    // ── 10 e 11: casca persistente + entrada sem geometria ────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // ── 13: mesmo teste de centralização do critério 12, na área
    // global — mesma folha, ancestral diferente (`.ra2-content`, em
    // vez de `.rm-shell-main`). ABA PRÓPRIA, fechada logo depois: mutar
    // `.ra2-content` via `innerHTML` quebra a árvore que o React já tem
    // montada ali (os nós que ele "lembra" deixam de existir de
    // verdade), e reusar o MESMO `page` das checagens 9-11 fez
    // exatamente isso na primeira execução — o clique em "Compêndio"
    // tentou reconciliar contra nós que a mutação crua já tinha
    // substituído, e o app caiu pra uma navegação de página inteira em
    // vez da transição client-side que os critérios 10/11 esperam
    // (sidebar remontou, nenhum item ficou marcado como ativo).
    {
      const paginaTeste = await ctx.newPage();
      // `ctx` foi criado com viewport MOBILE (390×844, pro critério 9) —
      // `page.setViewportSize` de antes só valia pro `page` original,
      // uma aba NOVA volta pro padrão do contexto. Sem fixar aqui, este
      // critério mediria a sidebar já escondida (drawer fechado, caixa
      // degenerada) — passaria por acidente, sem provar a exclusão de
      // sidebar/topbar que é o ponto real do teste.
      await paginaTeste.setViewportSize({ width: 1440, height: 900 });
      await paginaTeste.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
      await paginaTeste.waitForTimeout(300);

      const medidas = await paginaTeste.evaluate(() => {
        const conteudo = document.querySelector(".ra2-content") as HTMLElement;
        conteudo.innerHTML =
          '<div class="mo-boot-stage mo-scope"><div class="mo-boot-in"><div class="mo-boot" role="status">' +
          '<span class="mo-boot-label">Teste</span><span class="mo-boot-bar"></span></div></div></div>';
        const painel = document.querySelector(".mo-boot") as HTMLElement;
        const sidebar = document.querySelector(".ra2-sidebar") as HTMLElement;
        const conteudoBox = conteudo.getBoundingClientRect();
        const painelBox = painel.getBoundingClientRect();
        const sidebarBox = sidebar.getBoundingClientRect();
        // Mesma correção de padding do critério 12 — `.ra2-content` não
        // tem padding próprio hoje (quem tem é `.ra2-page`, que este
        // markup de teste substitui), mas medir do mesmo jeito nos dois
        // lugares é o que torna os dois critérios comparáveis.
        const cs = getComputedStyle(conteudo);
        const padTop = parseFloat(cs.paddingTop);
        const padBottom = parseFloat(cs.paddingBottom);
        const padLeft = parseFloat(cs.paddingLeft);
        const padRight = parseFloat(cs.paddingRight);
        return {
          centroPainelX: painelBox.left + painelBox.width / 2,
          centroAreaX: conteudoBox.left + padLeft + (conteudoBox.width - padLeft - padRight) / 2,
          centroPainelY: painelBox.top + painelBox.height / 2,
          centroAreaY: conteudoBox.top + padTop + (conteudoBox.height - padTop - padBottom) / 2,
          painelEsquerda: painelBox.left,
          sidebarDireita: sidebarBox.right,
        };
      });

      await paginaTeste.close();

      const centralizadoX = Math.abs(medidas.centroPainelX - medidas.centroAreaX) < 2;
      const centralizadoY = Math.abs(medidas.centroPainelY - medidas.centroAreaY) < 2;
      const naoInvadeSidebar = medidas.painelEsquerda >= medidas.sidebarDireita;

      registrar(
        "13 (BootPanel centraliza dentro da área global de conteúdo, sem invadir a sidebar)",
        centralizadoX && centralizadoY && naoInvadeSidebar,
        `centro do painel=(${medidas.centroPainelX.toFixed(1)}, ${medidas.centroPainelY.toFixed(1)}) vs centro da área=(${medidas.centroAreaX.toFixed(1)}, ${medidas.centroAreaY.toFixed(1)}); borda esquerda do painel=${medidas.painelEsquerda.toFixed(1)}px, borda direita da sidebar=${medidas.sidebarDireita.toFixed(1)}px`,
      );
    }

    // Carimba o nó atual da sidebar. Se depois da navegação o carimbo
    // ainda estiver lá, é o MESMO elemento — prova de que React não
    // remontou a casca. Uma sidebar "igual" recém-criada não teria.
    await page.evaluate(() => {
      (document.querySelector(".ra2-sidebar") as HTMLElement).dataset.carimbo = "antes";
    });

    await page.route((u) => u.pathname.includes("/mesas/compendio"), async (route) => {
      await new Promise((res) => setTimeout(res, 1500));
      await route.continue();
    });
    await page.getByTestId("nav-compendium").click();
    await page.waitForTimeout(500);

    const noMeio = await page.evaluate(() => {
      const side = document.querySelector(".ra2-sidebar") as HTMLElement | null;
      return {
        mesmoNo: side?.dataset.carimbo === "antes",
        itens: document.querySelectorAll(".ra2-nav-item").length,
        topbar: !!document.querySelector(".ra2-topbar"),
        fundo: !!document.querySelector(".ra-bg-img"),
      };
    });
    // Espera a URL virar, não um tempo fixo: o handler atrasa TODA
    // requisição que casa (o prefetch e a navegação, em série), então
    // um sleep calibrado no atraso de um deles chegaria cedo — e
    // "mesmo nó" seria trivialmente verdadeiro se a navegação nem
    // tivesse acontecido. Chegar ao destino faz parte do critério.
    await page.waitForURL("**/mesas/compendio", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const noFim = await page.evaluate(() => ({
      mesmoNo: (document.querySelector(".ra2-sidebar") as HTMLElement)?.dataset.carimbo === "antes",
      ativo: document.querySelector(".ra2-nav-item--active")?.textContent?.trim() ?? null,
      url: location.pathname,
    }));

    registrar(
      "10 (nada compartilhado some ao navegar: mesma casca, mesmos itens, mesmo fundo)",
      noMeio.mesmoNo && noMeio.itens >= 4 && noMeio.topbar && noMeio.fundo &&
        noFim.mesmoNo && noFim.url === "/mesas/compendio",
      `durante: mesmo nó=${noMeio.mesmoNo} itens=${noMeio.itens} topbar=${noMeio.topbar} fundo=${noMeio.fundo} | depois: mesmo nó=${noFim.mesmoNo} url=${noFim.url} ativo=${JSON.stringify(noFim.ativo)}`,
    );

    // A rota ainda está sob o delay ARTIFICIAL de 1500ms registrado
    // acima (pro critério 10 flagrar a casca persistente no meio do
    // caminho) — `waitForURL`, logo acima, resolve OTIMISTICAMENTE
    // assim que o Next atualiza a barra de endereço, o que acontece
    // ANTES do conteúdo real estar pronto (é o mesmo mecanismo que faz
    // `(global)/loading.tsx` aparecer). Um `waitForTimeout` fixo depois
    // dele é aposta na duração exata do delay artificial; esperar o
    // seletor É a precondição real dos critérios 11 e 14 — medir a
    // animação de ENTRADA do conteúdo exige que o conteúdo já exista.
    await page.waitForSelector(".ra2-page", { timeout: 15000 }).catch(() => {});

    // Entrada de rota: mede a geometria do conteúdo logo no início da
    // animação e no fim. Se `mo-view-in` voltar a deslocar ou escalar,
    // a matriz deixa de ser identidade e este critério cai.
    const geometria = await page.evaluate(async () => {
      const alvo = document.querySelector(".ra2-page") as HTMLElement | null;
      if (!alvo) return null;
      alvo.style.animation = "none";
      void alvo.offsetWidth;
      alvo.style.animation = "";
      await new Promise((res) => setTimeout(res, 60));
      const cs = getComputedStyle(alvo);
      const topo = alvo.getBoundingClientRect().top;
      await new Promise((res) => setTimeout(res, 400));
      return {
        nome: cs.animationName,
        transformNoMeio: cs.transform,
        topoNoMeio: topo,
        topoNoFim: alvo.getBoundingClientRect().top,
      };
    });

    registrar(
      "11 (entrada de rota é só opacidade — sem deslocamento, sem layout shift)",
      !!geometria &&
        geometria.nome === "mo-view-in" &&
        (geometria.transformNoMeio === "none" || geometria.transformNoMeio === "matrix(1, 0, 0, 1, 0, 0)") &&
        Math.abs(geometria.topoNoMeio - geometria.topoNoFim) < 0.5,
      geometria
        ? `animação=${geometria.nome} transform=${geometria.transformNoMeio} topo ${geometria.topoNoMeio.toFixed(1)}px → ${geometria.topoNoFim.toFixed(1)}px`
        : "elemento .ra2-page não encontrado",
    );

    // ── 14: `mo-view-in` NUNCA pisca ─────────────────────────────────
    // Achado real, reportado pelo usuário depois da fase anterior: a
    // primeira versão deste keyframe oscilava a opacidade (0 → 0.5 →
    // 0.18 → 1 → 0.82 → 1) simulando um painel ligando — bonito isolado,
    // mas em uso real (uma tela que troca de conteúdo o dia inteiro) lia
    // como a TELA PISCANDO. Revertido pra um fade monotônico simples.
    // Este critério AMOSTRA a opacidade em vários pontos da animação e
    // reprova se ela cair em algum momento — é a prova mecânica de que
    // essa regressão específica não volta em silêncio.
    const amostraOpacidade = await page.evaluate(async () => {
      const alvo = document.querySelector(".ra2-page") as HTMLElement | null;
      if (!alvo) return null;
      // Reinicia a animação do zero (mesmo truque do critério acima:
      // remover e devolver `animation` força o browser a recomeçar do
      // frame 0, em vez de continuar de onde a execução anterior parou).
      alvo.style.animation = "none";
      void alvo.offsetWidth;
      alvo.style.animation = "";
      const amostras: number[] = [];
      // ~13 leituras ao longo de 260ms (--mo-dur-view) cobrem qualquer
      // dip que um keyframe intermediário possa introduzir — um dip que
      // só existisse ENTRE duas amostras de 20ms seria imperceptível de
      // qualquer forma, então a resolução já é adequada ao olho humano.
      for (let i = 0; i < 13; i++) {
        amostras.push(Number(getComputedStyle(alvo).opacity));
        await new Promise((res) => setTimeout(res, 20));
      }
      return amostras;
    });

    const nuncaCai =
      !!amostraOpacidade &&
      amostraOpacidade.every((v, i) => i === 0 || v >= amostraOpacidade[i - 1] - 0.001);

    registrar(
      "14 (entrada de rota nunca pisca — opacidade só sobe)",
      nuncaCai,
      amostraOpacidade
        ? `amostras: ${amostraOpacidade.map((v) => v.toFixed(2)).join(", ")}`
        : "elemento .ra2-page não encontrado",
    );

    // Rota destino atrasada de propósito: sem atraso, a navegação
    // resolve dentro do `--mo-delay-busy` e não HÁ barra pra medir — o
    // que é o comportamento correto, mas não prova nada.
    await page.reload({ waitUntil: "networkidle" });
    await page.route("**/mesas/personagens**", async (route) => {
      await new Promise((res) => setTimeout(res, 1200));
      await route.continue();
    });
    await page.getByTestId("nav-characters").click();
    await page.waitForTimeout(450);

    const emVoo = await page.evaluate(() => {
      const item = document.querySelector('[data-testid="nav-characters"]') as HTMLElement;
      const marcador = item.querySelector(".mo-linkflag") as HTMLElement | null;
      const status = item.querySelector('[role="status"]');
      // O desenho do estado é o GLOW (box-shadow respirando), não um
      // elemento próprio — o marcador de propósito não pinta nada
      // (`display: none`), pra não haver geometria que possa cair em
      // cima da borda do botão como na primeira versão.
      const anims = item.getAnimations().map((a) => (a as CSSAnimation).animationName ?? "");
      return {
        marcador: !!marcador,
        marcadorInvisivel: marcador ? getComputedStyle(marcador).display === "none" : false,
        glow: anims.includes("mo-armado"),
        texto: status?.textContent?.trim() ?? null,
      };
    });
    await page.waitForTimeout(1600);
    const sumiu = await page.evaluate(() => {
      const item = document.querySelector('[data-testid="nav-characters"]') as HTMLElement;
      const anims = item.getAnimations().map((a) => (a as CSSAnimation).animationName ?? "");
      return !document.querySelector(".mo-linkflag") && !anims.includes("mo-armado");
    });

    registrar(
      "8 (navegação em voo acende o destino com o glow do HUD, com texto pra leitor de tela, e apaga ao chegar)",
      emVoo.marcador && emVoo.marcadorInvisivel && emVoo.glow && emVoo.texto === "Carregando…" && sumiu,
      `durante: marcador=${emVoo.marcador} (não pinta nada=${emVoo.marcadorInvisivel}) glow=${emVoo.glow} texto=${JSON.stringify(emVoo.texto)} | depois: apagou=${sumiu}`,
    );

    // ── 15: duração mínima do painel de carregamento (`BootMinDurationOverlay`) ──
    // Achado real, coberto por DUAS tentativas anteriores que quebraram
    // (documentado em `bootTiming.ts`): coordenar via `loading.tsx`
    // (Suspense) não funciona porque um ancestral não é re-executado
    // quando o Suspense de um descendente resolve, e porque navegações
    // rápidas às vezes nunca chegam a comitar o fallback. A versão que
    // funciona usa `useLinkStatus()` — o mesmo sinal do critério 8 —
    // agregado numa sobreposição independente.
    //
    // O atraso de 250ms É o ponto certo pra provar isto: cruza
    // `BOOT_OVERLAY_DELAY_MS` (120ms, o painel decide aparecer) mas
    // resolve bem ANTES de `BOOT_MIN_VISIBLE_MS` (550ms) — se a
    // permanência mínima não estivesse funcionando, o painel sumiria
    // junto com a navegação, por volta de 250ms.
    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.route("**/mesas/compendio**", async (route) => {
      await new Promise((res) => setTimeout(res, 250));
      await route.continue();
    });

    const t0 = Date.now();
    await page.getByTestId("nav-compendium").click();
    let apareceuEm = -1;
    let sumiuEm = -1;
    for (let i = 0; i < 60; i++) {
      const overlayPresente = await page.evaluate(() => !!document.querySelector(".mo-boot-overlay")).catch(() => false);
      const agora = Date.now() - t0;
      if (overlayPresente && apareceuEm === -1) apareceuEm = agora;
      if (!overlayPresente && apareceuEm !== -1 && sumiuEm === -1) {
        sumiuEm = agora;
        break;
      }
      await page.waitForTimeout(15);
    }
    const permanencia = sumiuEm - apareceuEm;

    registrar(
      "15 (BootMinDurationOverlay garante ~550ms de permanência mesmo quando a navegação resolve antes disso)",
      apareceuEm > 0 && sumiuEm > 0 && permanencia >= 530 && permanencia <= 900,
      `apareceu em ${apareceuEm}ms, sumiu em ${sumiuEm}ms, permaneceu ${permanencia}ms (esperado entre 530 e 900ms — a navegação real levou só ~250ms)`,
    );

    await ctx.close();
  }

  await browser.close();

  console.log(`\n${aprovados} critérios aprovados, ${reprovados} reprovados.`);
  if (reprovados > 0) process.exit(1);
}

void main();
