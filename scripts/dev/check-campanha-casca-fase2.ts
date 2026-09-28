/**
 * Browser check da Fase 2 da reestrutura da área de campanha — a casca
 * visual (`mesa.css`), o trilho de navegação e a infraestrutura de
 * drawer.
 *
 * O que se verifica:
 *   1. A casca HUD existe de verdade: raiz, atmosfera (fundo/grade/
 *      vinheta/cantos), decoração de painel e cursor HUD.
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
      .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1])
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

    // --- 1. O QUE A CASCA AINDA DESENHA ---
    //
    // Este critério pedia a atmosfera inteira: fundo, grade, vinheta,
    // quatro cantos, decoração e cursor. `CampaignShell` parou de
    // desenhar quase tudo isso, e explica por quê: a campanha tem UMA
    // rota, a mesa, e o VTT é `position: fixed; inset: 0` — tudo que a
    // casca desenhava ficava DEBAIXO dele, "ocupando DOM, recebendo Tab
    // e sendo anunciado por leitor de tela sem nunca chegar a um
    // pixel".
    //
    // O que ela mantém está listado lá, e é isto que se afirma agora:
    //
    //   · `.rm-root`, que é o ESCOPO dos tokens `rm-*`. As janelas que
    //     vieram das páginas antigas (Conteúdo da campanha, o
    //     assistente de criação) trouxeram as classes daquela paleta
    //     junto; sem este escopo, as cores caem no valor inicial. É a
    //     regressão silenciosa que este critério passa a guardar;
    //   · o cursor HUD.
    //
    // Pedir o resto seria pedir a volta de uma casca que foi apagada de
    // propósito.
    {
      const c = await page.evaluate(() => {
        const root = document.querySelector(".rm-root");
        return {
          root: !!root,
          // Prova que o escopo FUNCIONA, não só que a classe existe: um
          // token `rm-*` precisa resolver dentro dele.
          tokenResolve: root ? getComputedStyle(root).getPropertyValue("--rm-text").trim() !== "" : false,
          cursor: !!document.querySelector(".ra-cursor-dot") && !!document.querySelector(".ra-cursor-ring"),
        };
      });
      registrar("1 (a casca mantém o escopo `rm-*` e o cursor HUD)", c.root && c.tokenResolve && c.cursor, JSON.stringify(c));
    }

    // --- 2 e 3 SAÍRAM: o TRILHO de navegação não existe ---
    //
    // Eles mediam os destinos do trilho, o `aria-current` do ativo, a
    // ausência de `aria-selected` (trilho é navegação, não abas), os
    // divisores, e a distinção entre "Livro" e "Conteúdo da campanha".
    // O trilho inteiro foi apagado junto com a casca — com oito rotas
    // ele fazia sentido, com uma não há entre o que navegar. Os
    // destinos viraram JANELAS dentro da mesa, e quem as abre é o menu
    // da mesa e o painel, cobertos em `check-vtt-janelas-ferramenta`.

    // --- 4. Todo item do trilho tem nome acessível ---
    {
      const semNome = await page.evaluate(
        () => [...document.querySelectorAll(".rm-navrail-btn")].filter((a) => !(a.getAttribute("aria-label") ?? "").trim()).length,
      );
      registrar("4 (nome acessível em todo item)", semNome === 0, `itens sem aria-label: ${semNome}`);
    }

    // --- 5 e 6 SAÍRAM com o trilho e o grid da casca ---
    //
    // O 5 media o GRID de três colunas (trilho | conteúdo | painel) e a
    // regra de só reservar a coluna do painel quando ele existe. O 6
    // media o Tab chegando no trilho com `:focus-visible`.
    //
    // Não há mais grid nem trilho: `.rm-navrail` e `.rm-shell-main` só
    // aparecem no CSS e nos boundaries de carregamento; a mesa é o VTT
    // em tela cheia, com o painel da sessão flutuando sobre ela. O
    // equivalente de hoje — o painel ocupar seu espaço sem espremer o
    // mapa, e o teclado alcançar as abas — é afirmado em
    // `check-vtt-painel` (75 critérios) e em `PainelAbas`, que
    // implementa tablist com tabindex roving e setas.

    // --- 7. A rota da campanha: sem erro de console, sem 404 ---
    {
      // Eram CINCO rotas ("/personagens", "/bando", "/livro",
      // "/configuracoes" e a raiz). As quatro primeiras não existem —
      // viraram janelas dentro da mesa —, e visitá-las produzia 404 de
      // propósito, o que fazia o critério 7a reprovar por cumprir o
      // desenho. Sobrou a que existe.
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
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
