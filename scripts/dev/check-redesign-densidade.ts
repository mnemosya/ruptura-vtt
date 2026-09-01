/**
 * Densidade e uso de tela da área de campanha (F1 do redesign).
 *
 * O que esta fase mudou e por quê: antes, `.rm-shell` tinha
 * `min-height: 100vh` e quem rolava era o DOCUMENTO. Isso é o que
 * produzia ~60% de tela vazia em toda rota — sem altura definida, nada
 * podia "preencher a altura" (`height: 100%` num pai sem altura é
 * no-op), então o conteúdo ficava encostado no topo de uma página do
 * tamanho dele próprio. Agora o shell é travado na viewport
 * (`height: 100dvh; overflow: hidden`) e a ÚNICA região rolável é
 * `.rm-shell-main`, o que dá à linha `main` (`1fr`) uma altura real.
 *
 * ESCOPO HONESTO desta suíte: ela verifica que o CONTAINER passou a ter
 * altura real e que a rolagem mudou de dono — não que as telas já
 * PREENCHEM essa altura. Preencher é conteúdo (header de cena, party
 * board, chat), e isso é F2/F3. Um critério "conteúdo cobre ≥70% da
 * altura" reprovaria aqui por um motivo legítimo (a Mesa realmente tem
 * pouca coisa hoje) e viraria pressão pra inflar layout com espaço
 * morto — o oposto do objetivo. Ele entra na F2, junto do conteúdo que
 * o justifica.
 *
 * Cobre TODAS as rotas da campanha de propósito: `overflow: hidden` no
 * shell é uma regra só, mas com raio de alcance total — se alguma tela
 * dependia da rolagem do documento, ela para de rolar e o conteúdo fica
 * inalcançável. É o maior risco da fase.
 *
 * Uso: npx tsx scripts/dev/check-redesign-densidade.ts
 * (precisa de `npm run dev` e sessão salva)
 */

import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, requireSessaoSalva } from "./authSession";

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

/** As 8 rotas da campanha + o wizard, que é a única "página cheia" com formulário longo. */
const ROTAS = (id: string): { nome: string; url: string }[] => [
  { nome: "mesa", url: `/mesas/${id}` },
  { nome: "personagens", url: `/mesas/${id}/personagens` },
  { nome: "bando", url: `/mesas/${id}/bando` },
  { nome: "mercado", url: `/mesas/${id}/mercado` },
  { nome: "livro", url: `/mesas/${id}/livro` },
  { nome: "biblioteca", url: `/mesas/${id}/biblioteca` },
  { nome: "jogadores", url: `/mesas/${id}/jogadores-e-convites` },
  { nome: "configuracoes", url: `/mesas/${id}/configuracoes` },
  { nome: "wizard", url: `/mesas/${id}/personagens/novo` },
];

/** Nunca `networkidle`: a campanha mantém WebSocket de Realtime aberto e a rede pode não ficar quieta nunca. */
async function irPara(page: Page, url: string): Promise<void> {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
  await page.locator(".rm-shell, .rm-boundary").first().waitFor({ state: "attached", timeout: 20000 });
  await page.waitForTimeout(500); // hidratação + primeiro paint do conteúdo client-side
}

async function medir(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement as HTMLElement;
    const main = document.querySelector(".rm-shell-main") as HTMLElement | null;
    const shell = document.querySelector(".rm-shell") as HTMLElement | null;
    return {
      // Quanto o DOCUMENTO ainda rola. Esperado 0 — quem rola é o main.
      excessoDoc: doc.scrollHeight - doc.clientHeight,
      // Overflow horizontal em qualquer lugar da página.
      overflowHoriz: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      temShell: !!shell,
      shellAltura: shell?.getBoundingClientRect().height ?? null,
      viewportAltura: window.innerHeight,
      mainExiste: !!main,
      mainRolavel: main ? main.scrollHeight > main.clientHeight : null,
      mainOverflowY: main ? getComputedStyle(main).overflowY : null,
      // Largura útil do conteúdo vs largura disponível — pega o teto de
      // 1100px que foi removido nesta fase.
      mainLargura: main?.clientWidth ?? null,
      pageLargura: (document.querySelector(".rm-page") as HTMLElement | null)?.getBoundingClientRect().width ?? null,
    };
  });
}

async function main() {
  requireSessaoSalva();
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 1600, height: 950 } });
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "domcontentloaded" });
    await page.locator('a[href^="/mesas/"]').first().waitFor({ state: "attached", timeout: 20000 });
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const campaignId = hrefs
      .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1])
      .find(Boolean);
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "nenhuma campanha em /mesas — sessão expirada?");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    // --- 1/2/3: as 3 garantias estruturais, em TODAS as rotas ---
    const semRolagemDoc: string[] = [];
    const comOverflowH: string[] = [];
    const semMain: string[] = [];
    const shellForaDaViewport: string[] = [];

    for (const { nome, url } of ROTAS(campaignId)) {
      await irPara(page, url);
      const m = await medir(page);
      if (!m.temShell) continue; // rota que caiu em boundary (ex.: sem permissão) — fora do escopo desta medida
      if (m.excessoDoc > 1) semRolagemDoc.push(`${nome}(+${m.excessoDoc}px)`);
      if (m.overflowHoriz > 1) comOverflowH.push(`${nome}(+${m.overflowHoriz}px)`);
      if (!m.mainExiste || m.mainOverflowY !== "auto") semMain.push(`${nome}(overflowY=${m.mainOverflowY})`);
      if (m.shellAltura !== null && Math.abs(m.shellAltura - m.viewportAltura) > 2) {
        shellForaDaViewport.push(`${nome}(${Math.round(m.shellAltura)} vs ${m.viewportAltura})`);
      }
    }

    registrar(
      "1 (documento NÃO rola em nenhuma rota — o shell é travado na viewport)",
      semRolagemDoc.length === 0,
      semRolagemDoc.length ? `rotas ainda rolando: ${semRolagemDoc.join(", ")}` : "nenhuma rota rola o documento",
    );
    registrar(
      "2 (.rm-shell-main é a região rolável em todas as rotas)",
      semMain.length === 0,
      semMain.length ? `sem main/overflow correto: ${semMain.join(", ")}` : "todas com overflow-y: auto no main",
    );
    registrar(
      "3 (nenhuma rota estoura na horizontal)",
      comOverflowH.length === 0,
      comOverflowH.length ? `estourando: ${comOverflowH.join(", ")}` : "nenhuma",
    );
    registrar(
      "4 (shell ocupa exatamente a viewport em todas as rotas)",
      shellForaDaViewport.length === 0,
      shellForaDaViewport.length ? `divergindo: ${shellForaDaViewport.join(", ")}` : "todas iguais à viewport",
    );

    // --- 5: conteúdo longo REALMENTE rola dentro do main e chega ao fim ---
    await irPara(page, `/mesas/${campaignId}/biblioteca`);
    {
      const r = await page.evaluate(() => {
        const main = document.querySelector(".rm-shell-main") as HTMLElement;
        if (!main || main.scrollHeight <= main.clientHeight) return { rolavel: false, chegouAoFim: false };
        main.scrollTop = main.scrollHeight;
        const chegouAoFim = Math.abs(main.scrollTop + main.clientHeight - main.scrollHeight) < 2;
        return { rolavel: true, chegouAoFim };
      });
      registrar(
        "5 (conteúdo longo rola DENTRO do main e alcança o fim)",
        r.rolavel && r.chegouAoFim,
        `rolável=${r.rolavel}, chegou ao fim=${r.chegouAoFim} (se rolável=false, a Biblioteca ficou curta demais pra testar)`,
      );
    }

    // --- 6: o teto de 1100px sumiu — conteúdo usa a largura disponível ---
    {
      const m = await medir(page);
      const usa = m.pageLargura !== null && m.mainLargura !== null && m.pageLargura > 1100;
      registrar(
        "6 (conteúdo usa a largura disponível — o teto de 1100px saiu)",
        usa,
        `largura do .rm-page=${m.pageLargura ? Math.round(m.pageLargura) : "?"}px, main=${m.mainLargura}px (esperado > 1100)`,
      );
    }

    // --- 7: painel de sessão tem moldura no amplo (antes: só grid-area) ---
    {
      const p = await page.evaluate(() => {
        const el = document.querySelector(".rm-shell-panel") as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { borda: cs.borderLeftWidth, fundo: cs.backgroundColor };
      });
      registrar(
        "7 (painel de sessão tem moldura no breakpoint amplo)",
        !!p && p.borda !== "0px" && p.fundo !== "rgba(0, 0, 0, 0)",
        p ? `border-left=${p.borda}, background=${p.fundo}` : "painel ausente",
      );
    }

    // --- 8: trilho com RÓTULO em ≥1920, só ícone abaixo disso ---
    {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await irPara(page, `/mesas/${campaignId}`);
      const largo = await page.evaluate(() => {
        const btn = document.querySelector(".rm-navrail-btn") as HTMLElement;
        return { largura: btn?.getBoundingClientRect().width ?? 0, rotulo: getComputedStyle(btn, "::after").content };
      });
      await page.setViewportSize({ width: 1600, height: 950 });
      await irPara(page, `/mesas/${campaignId}`);
      const medio = await page.evaluate(() => {
        const btn = document.querySelector(".rm-navrail-btn") as HTMLElement;
        return { largura: btn?.getBoundingClientRect().width ?? 0, rotulo: getComputedStyle(btn, "::after").content };
      });
      const temRotulo = largo.rotulo !== "none" && largo.rotulo.includes("Mesa");
      registrar(
        "8 (trilho ganha rótulo em ≥1920 e volta a só-ícone abaixo)",
        temRotulo && largo.largura > medio.largura,
        `1920: largura=${Math.round(largo.largura)}px rótulo=${largo.rotulo} | 1600: largura=${Math.round(medio.largura)}px rótulo=${medio.rotulo}`,
      );

      // 8b: rótulo que trunca é pior que rótulo nenhum — promete
      // legibilidade e entrega reticências. Aconteceu de verdade: a
      // primeira versão usou 176px e cortou "Conteúdo da campanha",
      // "Jogadores e convites" e "Minhas Campanhas". Medido comparando
      // a largura RENDERIZADA do ::after com a largura que o texto
      // ocuparia sem limite (via canvas com a mesma fonte).
      await page.setViewportSize({ width: 1920, height: 1080 });
      await irPara(page, `/mesas/${campaignId}`);
      const truncados = await page.evaluate(() => {
        const cortados: string[] = [];
        document.querySelectorAll(".rm-navrail-btn").forEach((btn) => {
          const cs = getComputedStyle(btn, "::after");
          const rotulo = btn.getAttribute("aria-label") ?? "";
          const canvas = document.createElement("canvas");
          const ctx2 = canvas.getContext("2d")!;
          ctx2.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          // tracking não entra no measureText — soma manual
          const tracking = parseFloat(cs.letterSpacing) || 0;
          const larguraTexto = ctx2.measureText(rotulo.toUpperCase()).width + tracking * rotulo.length;
          const disponivel = (btn as HTMLElement).clientWidth
            - parseFloat(getComputedStyle(btn).paddingLeft)
            - parseFloat(getComputedStyle(btn).paddingRight)
            - 18 /* ícone */ - 12 /* gap */;
          if (larguraTexto > disponivel) cortados.push(`${rotulo}(${Math.round(larguraTexto)}>${Math.round(disponivel)}px)`);
        });
        return cortados;
      });
      await page.setViewportSize({ width: 1600, height: 950 });
      registrar(
        "8b (nenhum rótulo do trilho trunca em ≥1920)",
        truncados.length === 0,
        truncados.length ? `truncando: ${truncados.join(", ")}` : "todos cabem",
      );
    }

    // --- 9: console limpo nas rotas da campanha ---
    {
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("favicon") && !m.text().includes("React DevTools")) {
          erros.push(m.text().slice(0, 160));
        }
      });
      for (const { url } of ROTAS(campaignId).slice(0, 6)) await irPara(page, url);
      registrar("9 (console limpo nas rotas da campanha)", erros.length === 0, erros.length ? JSON.stringify(erros.slice(0, 3)) : "nenhum");
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
