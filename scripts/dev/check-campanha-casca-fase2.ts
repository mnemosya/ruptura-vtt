/**
 * Browser check da Fase 2 da reestrutura da área de campanha — a casca
 * visual (`mesa.css`), o trilho de navegação e a infraestrutura de
 * drawer.
 *
 * O que se verifica:
 *   1. A casca HUD existe de verdade: raiz, atmosfera (fundo/grade/
 *      vinheta/scanlines/cantos), decoração de painel e cursor HUD.
 *   2. O trilho lista os oito destinos + volta, com `aria-current="page"`
 *      no ativo e NENHUM `aria-selected` — são rotas, não abas (a
 *      aparência vem de `.rc-tabrail` do Console, a semântica não).
 *   3. "Livro" e "Conteúdo da campanha" são destinos distintos, com
 *      rotas distintas — a ambiguidade antiga (um item "Biblioteca"
 *      apontando para /livro) acabou.
 *   4. Cada item do trilho tem nome acessível (só o ícone é visível).
 *   5. Grid: sem painel de sessão, a coluna dele NÃO é reservada (nada
 *      de área morta até a Fase 3); no breakpoint intermediário a casca
 *      continua em duas colunas com o conteúdo acima da largura útil.
 *   6. Teclado: Tab percorre o trilho e o item focado casa com
 *      `:focus-visible`.
 *   7. Zero erro de console e zero 404 nas rotas da campanha.
 *
 * Não cobre: a visão do JOGADOR do trilho (o grupo "Gerenciar" deve
 * sumir inteiro) — exige uma segunda conta, verificação manual. E o
 * conteúdo das telas, que ainda usa `theme.ts` e só migra nas fases de
 * Gameplay/Administração.
 *
 * Uso: npx tsx scripts/dev/check-campanha-casca-fase2.ts
 * (precisa de `npm run dev` rodando e da sessão salva; se ela tiver
 * passado de ~1h, rode antes: npx tsx scripts/dev/refresh-admin-session.ts)
 */

import type { ConsoleMessage } from "playwright";
import { BASE_URL, withAuthenticatedPage } from "./authSession";

let passou = 0;
let falhou = 0;

function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon")) return false;
  if (t.includes("Download the React DevTools")) return false;
  return true;
}

const DESTINOS_ESPERADOS = [
  "Mesa",
  "Personagens",
  "Bando",
  "Mercado",
  "Livro",
  "Conteúdo da campanha",
  "Jogadores e convites",
  "Configurações",
];

async function main() {
  await withAuthenticatedPage(async (page) => {
    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const campaignId = hrefs
      .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1])
      .find(Boolean);

    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "Nenhuma campanha encontrada em /mesas para esta conta.");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    // Erros e 404 contados só a partir daqui — /mesas (dashboard) tem um
    // 404 pré-existente e alheio a esta reestrutura.
    const erros: string[] = [];
    const naoEncontrados: string[] = [];
    page.on("console", (m) => {
      if (erroRelevante(m)) erros.push(m.text().slice(0, 160));
    });
    page.on("response", (r) => {
      if (r.status() === 404) naoEncontrados.push(r.url());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // --- 1. Casca HUD presente ---
    {
      const c = await page.evaluate(() => ({
        root: !!document.querySelector(".rm-root"),
        bg: !!document.querySelector(".rm-bg-img"),
        grid: !!document.querySelector(".rm-bg-grid"),
        vinheta: !!document.querySelector(".rm-bg-vignette"),
        scanlines: !!document.querySelector(".rm-scanlines"),
        cantos: document.querySelectorAll(".rm-vp-corner").length,
        deco: !!document.querySelector(".rm-deco-top .rm-deco-a") && !!document.querySelector(".rm-deco-top .rm-deco-b"),
        cursor: !!document.querySelector(".ra-cursor-dot") && !!document.querySelector(".ra-cursor-ring"),
      }));
      const ok = c.root && c.bg && c.grid && c.vinheta && c.scanlines && c.cantos === 4 && c.deco && c.cursor;
      registrar("1 (casca HUD completa)", ok, JSON.stringify(c));
    }

    // --- 2. Trilho: destinos, aria-current, ausência de aria-selected ---
    {
      const t = await page.evaluate(() => ({
        labels: [...document.querySelectorAll(".rm-navrail-btn")].map((a) => a.getAttribute("aria-label") ?? ""),
        current: [...document.querySelectorAll('.rm-navrail-btn[aria-current="page"]')].map((a) => a.getAttribute("aria-label")),
        comAriaSelected: document.querySelectorAll(".rm-navrail-btn[aria-selected]").length,
        divisores: document.querySelectorAll(".rm-navrail-divider").length,
      }));
      const temTodos = DESTINOS_ESPERADOS.every((d) => t.labels.includes(d));
      const voltaPresente = t.labels.includes("Minhas Campanhas");
      const ativoCerto = t.current.length === 1 && t.current[0] === "Mesa";
      const ok = temTodos && voltaPresente && ativoCerto && t.comAriaSelected === 0;
      registrar(
        "2 (trilho: destinos + aria-current, sem aria-selected)",
        ok,
        `destinos=${t.labels.length}, ativo=${JSON.stringify(t.current)}, aria-selected=${t.comAriaSelected}, divisores=${t.divisores}`,
      );
    }

    // --- 3. Livro e Conteúdo da campanha são destinos distintos ---
    {
      // Sem funções auxiliares nomeadas dentro de `evaluate`: o esbuild
      // do tsx injeta um wrapper `__name` que não existe no browser, e o
      // callback quebra com "ReferenceError: __name is not defined".
      const r = await page.evaluate(() => ({
        livro: document.querySelector('.rm-navrail-btn[aria-label="Livro"]')?.getAttribute("href") ?? null,
        conteudo: document.querySelector('.rm-navrail-btn[aria-label="Conteúdo da campanha"]')?.getAttribute("href") ?? null,
      }));
      const ok = !!r.livro && !!r.conteudo && r.livro !== r.conteudo && r.livro.endsWith("/livro") && r.conteudo.endsWith("/biblioteca");
      registrar("3 (Livro ≠ Conteúdo da campanha)", ok, `livro=${r.livro} | conteúdo=${r.conteudo}`);
    }

    // --- 4. Todo item do trilho tem nome acessível ---
    {
      const semNome = await page.evaluate(
        () => [...document.querySelectorAll(".rm-navrail-btn")].filter((a) => !(a.getAttribute("aria-label") ?? "").trim()).length,
      );
      registrar("4 (nome acessível em todo item)", semNome === 0, `itens sem aria-label: ${semNome}`);
    }

    // --- 5. Grid reserva a coluna do painel SÓ quando ele existe ---
    // Atualizado na Fase 3: agora que `layout.tsx` sempre passa
    // `painelSessao={<SessionPanel />}` de verdade em toda rota real,
    // "sem painel" deixou de acontecer em produção — o critério 5a
    // testava justamente essa ausência. A garantia estrutural que
    // importa agora é a oposta: com o painel presente, a 3ª coluna
    // aparece com a largura certa (--rm-panel-w) e o conteúdo principal
    // não fica espremido por conta disso. A lógica CSS de "sem coluna
    // reservada quando `painelSessao` está ausente" (`:has()` em
    // mesa.css) continua existindo e intocada — só não há mais rota
    // real que a exercite; `check-campaign-shell-drawer.ts` (harness)
    // é onde ausência de conteúdo é testada de propósito.
    {
      const amplo = await page.evaluate(() => ({
        cols: getComputedStyle(document.querySelector(".rm-shell")!).gridTemplateColumns,
        temPainel: !!document.querySelector(".rm-shell-panel"),
        larguraMain: Math.round(document.querySelector(".rm-shell-main")!.getBoundingClientRect().width),
      }));
      const colunas = amplo.cols.split(/\s+/);
      const treColunas = colunas.length === 3;
      const larguraPainelOk = Math.abs(parseFloat(colunas[2] ?? "0") - 320) < 2;
      registrar(
        "5a (amplo: painel real ocupa a 3ª coluna, sem espremer o conteúdo)",
        treColunas && amplo.temPainel && larguraPainelOk && amplo.larguraMain >= 900,
        `cols="${amplo.cols}", painel montado=${amplo.temPainel}, main=${amplo.larguraMain}px`,
      );

      await page.setViewportSize({ width: 1024, height: 800 });
      await page.waitForTimeout(500);
      const inter = await page.evaluate(() => ({
        cols: getComputedStyle(document.querySelector(".rm-shell")!).gridTemplateColumns,
        larguraMain: Math.round(document.querySelector(".rm-shell-main")!.getBoundingClientRect().width),
        railVisivel: getComputedStyle(document.querySelector(".rm-navrail")!).display !== "none",
      }));
      registrar(
        "5b (intermediário: trilho mantido, conteúdo com largura útil)",
        inter.railVisivel && inter.larguraMain >= 720,
        `cols="${inter.cols}", main=${inter.larguraMain}px, trilho visível=${inter.railVisivel}`,
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);
    }

    // --- 6. Teclado: Tab percorre o trilho com foco visível ---
    {
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.keyboard.press("Tab");
      const primeiro = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          noTrilho: !!el?.closest(".rm-navrail"),
          label: el?.getAttribute("aria-label") ?? null,
          focusVisible: !!el?.matches(":focus-visible"),
        };
      });
      registrar(
        "6 (teclado alcança o trilho com :focus-visible)",
        primeiro.noTrilho && primeiro.focusVisible,
        `foco em "${primeiro.label}", dentro do trilho=${primeiro.noTrilho}, :focus-visible=${primeiro.focusVisible}`,
      );
    }

    // --- 7. Rotas da campanha: sem erro de console, sem 404 ---
    {
      for (const rota of ["/personagens", "/bando", "/livro", "/configuracoes"]) {
        await page.goto(`${BASE_URL}/mesas/${campaignId}${rota}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
      }
      const unicos404 = [...new Set(naoEncontrados)];
      registrar("7a (sem 404 nas rotas da campanha)", unicos404.length === 0, unicos404.length ? JSON.stringify(unicos404) : "nenhum");
      registrar("7b (console limpo nas rotas da campanha)", erros.length === 0, erros.length ? JSON.stringify(erros.slice(0, 3)) : "nenhum");
    }
  });
}

main()
  .catch((err) => {
    console.error("Erro fatal no check:", err instanceof Error ? err.message : err);
    falhou++;
  })
  .finally(() => {
    console.log(`\n${passou} critérios aprovados, ${falhou} reprovados.`);
    if (falhou > 0) process.exitCode = 1;
  });
