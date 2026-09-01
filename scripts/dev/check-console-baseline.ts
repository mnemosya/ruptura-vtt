/**
 * Linha de base VISUAL do Console do Personagem (F0 do redesign da área
 * de campanha).
 *
 * Por que existe: o redesign vai mexer pesado em `mesa.css` e criar um
 * `tokens.css` no `:root`. O Console é a parte do app que o usuário
 * considera PRONTA e que serve de referência visual pro resto — a
 * pergunta "qual o risco de encostar em CSS compartilhado?" não pode
 * ser respondida com "acho que nenhum". Este script transforma "o
 * Console não regrediu" numa afirmação MECÂNICA: grava um retrato dos
 * valores computados de fato pelo browser e reprova em qualquer
 * diferença.
 *
 * Note que ele NÃO lê `console.css`. Ler o arquivo provaria só que o
 * arquivo não mudou — e o risco real é justamente o contrário: alguém
 * declara `--hud-*` no `:root`, ou muda a cascata/ordem de import, e o
 * Console muda SEM ninguém ter tocado em `console.css`. Por isso a
 * medida é `getComputedStyle` no DOM real, que é onde a cascata já
 * aconteceu.
 *
 * Cobre os dois pontos de entrada (rota direta `/ficha` e modal
 * interceptado sobre a campanha), porque a árvore de CSS que chega até
 * a janela é diferente nos dois — no modal, a página da campanha
 * (`mesa.css`) também está montada, que é exatamente o cenário onde um
 * vazamento apareceria.
 *
 * Seletores escolhidos por serem os portadores das técnicas visuais que
 * o redesign vai COPIAR pro `mesa.css` (é onde um erro de cópia
 * apareceria como regressão aqui): `.rc-window` (sombra dupla + textura),
 * `.rc-topbar` (gradiente 92deg), `.rc-avatar-fill` e `.rc-dock`
 * (chanfro/hexágono via `clip-path`), `.rc-skills-caption` e
 * `.rc-eq-caption` (box de título fundido), `.rc-skill` (cor por
 * atributo via custom property), `.rc-topbar-title` (mono 0.18em) — mais
 * os que carregam a pilha de empilhamento (`.rc-window-wrap` 501,
 * `.rc-backdrop` 500, `.rc-fichaheader` 510, `.rc-dock` 502), que a
 * camada de janelas da F6 precisa não perturbar.
 *
 * Uso:
 *   npx tsx scripts/dev/check-console-baseline.ts            → compara
 *   npx tsx scripts/dev/check-console-baseline.ts --gravar   → (re)grava
 *
 * O arquivo de linha de base é versionado de propósito: sem ele no
 * repositório, o script não protege ninguém além de quem o rodou.
 * Regravar é uma decisão CONSCIENTE — o diff do JSON no code review é
 * o que mostra que uma mudança visual do Console foi intencional.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = join(__dirname, "_baselines", "console-baseline.json");

const GRAVAR = process.argv.includes("--gravar");

/**
 * Elementos medidos — todos confirmados como RENDERIZADOS de verdade na
 * aba padrão do Console (probe no DOM ao escrever este script).
 * `.rc-panel` e `.rc-caption` ficaram DE FORA de propósito: existem em
 * `console.css` mas nenhum `.tsx` os usa (CSS morto), então medi-los
 * gravaria "AUSENTE" pra sempre e não protegeria nada.
 */
const SELETORES: { sel: string }[] = [
  { sel: ".rc-window-wrap" },
  { sel: ".rc-window" },
  { sel: ".rc-topbar" },
  { sel: ".rc-topbar-title" },
  { sel: ".rc-winbtn" },
  { sel: ".rc-winbtn--close" },
  { sel: ".rc-avatar-fill" },   // hexágono real (clip-path)
  { sel: ".rc-skills-caption" }, // box de título fundido
  { sel: ".rc-eq-caption" },
  { sel: ".rc-skill" },          // cor por atributo (custom property)
  { sel: ".rc-tabrail-btn" },
  { sel: ".rc-aside" },
  { sel: ".rc-backdrop" },
  { sel: ".rc-fichaheader" },
];

/**
 * Custom properties medidas junto — é AQUI que um vazamento de
 * `tokens.css` apareceria primeiro, e nenhuma propriedade padrão
 * denunciaria isso sozinha (um `--cy` sobrescrito muda a cor computada
 * só de quem o usa naquele momento; medir o token pega a causa, não
 * um sintoma). `--rc-skill-*` cobre a técnica de cor-por-entidade que o
 * `mesa.css` vai copiar.
 */
const CUSTOM_PROPS = [
  "--cy", "--am",
  "--rc-line", "--rc-line-soft", "--rc-surface", "--rc-panel",
  "--rc-text", "--rc-dim", "--rc-danger",
  "--rc-skill-cor", "--rc-skill-ico-border", "--rc-skill-ico-bg",
  // Nomes do redesign: DEVEM permanecer vazios dentro do Console. Se um
  // dia aparecerem aqui com valor, `tokens.css` vazou pra dentro dele.
  "--hud-space-4", "--hud-shadow-window", "--hud-notch-md",
];

/**
 * Propriedades medidas. Deliberadamente NÃO inclui geometria de layout
 * (width/height/top/left) fora do `.rc-window` — a janela se dimensiona
 * pelo conteúdo medido, então largura/altura de elementos internos
 * variam com o personagem de teste e gerariam falso positivo. O que
 * interessa aqui é o TRATAMENTO visual, que é estável.
 */
const PROPRIEDADES = [
  "background-color",
  "background-image",
  "border-top-width", "border-top-style", "border-top-color",
  "border-right-color", "border-bottom-color", "border-left-color",
  "border-radius",
  "box-shadow",
  "clip-path",
  "color",
  "font-family", "font-size", "font-weight",
  "letter-spacing", "text-transform",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "z-index",
  "opacity",
];

const VIEWPORTS = [
  { nome: "1600x950", width: 1600, height: 950 },
  { nome: "1366x768", width: 1366, height: 768 },
  { nome: "1920x1080", width: 1920, height: 1080 },
];

type Retrato = Record<string, Record<string, string> | "AUSENTE">;
type Baseline = Record<string, Retrato>;

/**
 * `page.evaluate` do Playwright rodando via `tsx` NÃO aceita função
 * auxiliar nomeada — o esbuild injeta um wrapper `__name` que não
 * existe no browser (`ReferenceError: __name is not defined`). Tudo
 * inline dentro do callback. Armadilha já documentada nos checks da
 * Fase 2.
 */
async function capturar(
  page: Page,
  seletores: { sel: string }[],
  props: string[],
  customProps: string[],
): Promise<Retrato> {
  return page.evaluate(
    ({ seletores, props, customProps }) => {
      const out: Record<string, Record<string, string> | "AUSENTE"> = {};
      for (const { sel } of seletores) {
        const el = document.querySelector(sel);
        if (!el) {
          out[sel] = "AUSENTE";
          continue;
        }
        const cs = getComputedStyle(el);
        const valores: Record<string, string> = {};
        for (const p of props) valores[p] = cs.getPropertyValue(p).trim();
        // Custom properties: valor vazio é informação legítima (o token
        // NÃO alcança este elemento) — gravar como "" e comparar, em vez
        // de omitir, é o que faz um vazamento futuro virar diff.
        for (const p of customProps) valores[p] = cs.getPropertyValue(p).trim();
        // Geometria só da janela — ver comentário em PROPRIEDADES.
        if (sel === ".rc-window") {
          const r = el.getBoundingClientRect();
          valores["__rect"] = `${Math.round(r.width)}x${Math.round(r.height)}`;
        }
        out[sel] = valores;
      }
      return out;
    },
    { seletores, props, customProps },
  );
}

/**
 * Espera TODA animação/transição em voo terminar antes de medir.
 *
 * Não é zelo preventivo: a primeira versão deste script usava
 * `waitForTimeout` fixo e a cena "minimizado" reprovou sozinha, com
 * `.rc-dock { opacity } "0" → "0.43"` — o dock entra com `rc-dock-in`
 * e a medida caía no meio da animação, gerando um valor diferente a
 * cada execução. Um harness de regressão que acusa diferença sem
 * ninguém ter mudado nada é pior que nenhum: ensina a ignorar o
 * resultado. `getAnimations()` resolve pelo estado real (as `finished`
 * de cada animação), não por um número mágico.
 */
async function esperarAnimacoes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const anims = document.getAnimations();
    await Promise.all(
      anims.map((a) =>
        // `finished` rejeita se a animação for cancelada (ex.: elemento
        // removido no meio) — cancelamento não é motivo pra derrubar a
        // captura, então engole.
        a.finished.catch(() => undefined),
      ),
    );
  });
  // Um frame extra: `finished` resolve no fim do timing, o estilo
  // computado final assenta no paint seguinte.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

/**
 * `waitUntil: "domcontentloaded"` + espera POR SELETOR, nunca
 * `networkidle`: a área de campanha mantém um WebSocket de Realtime
 * aberto e recarrega roster/viewer por foco, então "a rede ficou
 * quieta por 500ms" pode simplesmente nunca acontecer. Isto reprovou de
 * verdade aqui (timeout de 30s em `/personagens` que responde 200 em
 * 0,5s no curl) — o wait estava medindo a quietude da rede, não a
 * prontidão da página.
 */
async function descobrirAlvo(page: Page): Promise<{ campaignId: string; characterId: string }> {
  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "domcontentloaded" });
  await page.locator('a[href^="/mesas/"]').first().waitFor({ state: "attached", timeout: 20000 });
  const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const campaignId = hrefs
    .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1])
    .find(Boolean);
  if (!campaignId) throw new Error("Nenhuma campanha encontrada em /mesas — sessão expirada? Rode refresh-admin-session.ts");

  await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "domcontentloaded" });
  const linkFicha = page.locator('a[data-testid^="personagens-abrir-ficha-"]').first();
  await linkFicha.waitFor({ state: "attached", timeout: 20000 });
  const href = await linkFicha.getAttribute("href");
  const characterId = href?.match(/characterId=([0-9a-f-]{36})/i)?.[1];
  if (!characterId) throw new Error(`Nenhum personagem encontrado na campanha ${campaignId}`);
  return { campaignId, characterId };
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });
  const retratos: Baseline = {};

  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        storageState: SESSION_FILE,
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      const { campaignId, characterId } = await descobrirAlvo(page);

      // --- Cena A: rota DIRETA /ficha (sem mesa.css na árvore) ---
      await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".rc-window", { state: "visible", timeout: 10000 });
      await esperarAnimacoes(page);
      retratos[`${vp.nome}/direta`] = await capturar(page, SELETORES, PROPRIEDADES, CUSTOM_PROPS);

      // --- Cena B: modal interceptado SOBRE a campanha (mesa.css montado
      // junto — é aqui que um vazamento de token apareceria) ---
      await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "domcontentloaded" });
      await page.locator(`[data-testid="personagens-abrir-ficha-${characterId}"]`).waitFor({ state: "visible", timeout: 20000 });
      await page.locator(`[data-testid="personagens-abrir-ficha-${characterId}"]`).click();
      await page.waitForURL(/\/ficha\?/, { timeout: 5000 });
      await page.waitForSelector(".rc-window", { state: "visible", timeout: 10000 });
      await esperarAnimacoes(page);
      retratos[`${vp.nome}/modal`] = await capturar(page, SELETORES, PROPRIEDADES, CUSTOM_PROPS);

      // --- Cena C: minimizado (única em que `.rc-dock` existe) ---
      await page.locator('[aria-label="Minimizar console"]').first().click();
      await page.waitForSelector('[data-testid="console-dock"]', { state: "visible", timeout: 5000 });
      await esperarAnimacoes(page);
      retratos[`${vp.nome}/minimizado`] = await capturar(
        page,
        [{ sel: ".rc-dock" }, { sel: ".rc-window-wrap" }],
        PROPRIEDADES,
        CUSTOM_PROPS,
      );

      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  if (GRAVAR) {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify(retratos, null, 2) + "\n", "utf-8");
    const cenas = Object.keys(retratos).length;
    const medidas = Object.values(retratos).reduce(
      (acc, r) => acc + Object.values(r).filter((v) => v !== "AUSENTE").length,
      0,
    );
    console.log(`Linha de base GRAVADA em ${BASELINE_FILE}`);
    console.log(`${cenas} cena(s), ${medidas} elemento(s) medido(s).`);
    console.log("Revise o diff deste JSON no code review — é ele que mostra que a mudança visual foi intencional.");
    return;
  }

  if (!existsSync(BASELINE_FILE)) {
    console.error(`Nenhuma linha de base em ${BASELINE_FILE}.`);
    console.error("Grave uma primeiro: npx tsx scripts/dev/check-console-baseline.ts --gravar");
    process.exit(1);
  }

  const base = JSON.parse(readFileSync(BASELINE_FILE, "utf-8")) as Baseline;
  const diffs: string[] = [];

  const cenas = new Set([...Object.keys(base), ...Object.keys(retratos)]);
  for (const cena of [...cenas].sort()) {
    const antes = base[cena];
    const agora = retratos[cena];
    if (!antes) { diffs.push(`cena NOVA (não existe na linha de base): ${cena}`); continue; }
    if (!agora) { diffs.push(`cena SUMIU (existe na linha de base, não foi capturada): ${cena}`); continue; }

    const sels = new Set([...Object.keys(antes), ...Object.keys(agora)]);
    for (const sel of [...sels].sort()) {
      const a = antes[sel];
      const b = agora[sel];
      if (a === "AUSENTE" && b === "AUSENTE") continue;
      if (a === "AUSENTE" || b === "AUSENTE") {
        diffs.push(`${cena} ${sel}: presença mudou (${a === "AUSENTE" ? "ausente→presente" : "presente→AUSENTE"})`);
        continue;
      }
      const props = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const p of [...props].sort()) {
        if (a[p] !== b[p]) diffs.push(`${cena} ${sel} { ${p} }: "${a[p]}" → "${b[p]}"`);
      }
    }
  }

  if (diffs.length === 0) {
    const medidas = Object.values(retratos).reduce(
      (acc, r) => acc + Object.values(r).filter((v) => v !== "AUSENTE").length,
      0,
    );
    console.log(`ok - Console sem regressão visual: ${Object.keys(retratos).length} cena(s), ${medidas} elemento(s), 0 diffs.`);
    return;
  }

  console.error(`FALHA - ${diffs.length} diferença(s) em relação à linha de base do Console:\n`);
  for (const d of diffs.slice(0, 60)) console.error(`  ${d}`);
  if (diffs.length > 60) console.error(`  … e mais ${diffs.length - 60}.`);
  console.error("\nSe a mudança foi INTENCIONAL, regrave com --gravar e deixe o diff do JSON aparecer no code review.");
  process.exit(1);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
