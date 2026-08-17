/**
 * Browser check da superfície única do painel de sessão em
 * `CampaignShell.tsx` (`PainelSessao`) — cobre três rodadas de
 * auditoria:
 *
 * 1ª lacuna: o check da casca (`check-campanha-casca-fase2.ts`) nunca
 *    passava `painelSessao`, então nunca exercitava abertura, `Escape`,
 *    retorno de foco, backdrop, trava de scroll ou fechamento por
 *    navegação.
 * 2ª lacuna: o "8/8" que corrigiu a 1ª escopava todo locator a
 *    `drawer.locator(...)`, mascarando um bug estrutural real —
 *    `painelSessao` era renderizado em DOIS pontos do JSX (coluna do
 *    grid + dentro do drawer), React montava DUAS instâncias da mesma
 *    árvore. Corrigido tornando `PainelSessao` a ÚNICA superfície,
 *    reposicionada por CSS de breakpoint. Critérios 9-11 provam isso
 *    especificamente: contagem GLOBAL, mesma instância nos dois
 *    breakpoints, ausência de ids duplicados.
 * 3ª rodada: dois problemas REAIS, não só falta de cobertura:
 *    (a) flash inicial — `hidden={intermediario && !aberto}` dependia
 *        de `intermediario`, um estado que só fica correto depois do
 *        efeito de `matchMedia` rodar (um tick depois do primeiro
 *        paint); numa tela já estreita no load, o painel piscava aberto
 *        antes de fechar sozinho. Corrigido: a ocultação padrão agora é
 *        100% CSS (`[data-open="true"]`), amarrada a `aberto`
 *        (`useState(false)`, correto desde sempre, nunca depende de
 *        `window`).
 *    (b) decisão modal-vs-trilho não fechada — o painel reivindicava
 *        `aria-modal="true"` E prendia foco, mas o backdrop
 *        deliberadamente deixava o trilho clicável por MOUSE (decisão
 *        da Fase 2, para permitir "fechar ao navegar" via trilho) —
 *        teclado não tinha esse mesmo acesso (Tab preso dentro do
 *        painel). Decisão fechada: é um diálogo NÃO-MODAL
 *        (`aria-modal="false"`, sem prender foco).
 * 4ª rodada (esta): as PROVAS da 3ª rodada eram fracas, não os fixes:
 *    (a) o critério de "sem flash" lia `display` logo após
 *        `domcontentloaded` — mas isso é um marco de timing, não uma
 *        garantia de que a hidratação não rodou. Substituído pelo
 *        critério 12 atual: contexto de browser com JavaScript
 *        TOTALMENTE desligado. Sem JS não há hidratação nenhuma — o que
 *        chega na tela é só HTML server-renderizado + CSS puro. Prova
 *        estrutural, não temporal.
 *    (b) "Tab sai do painel" (critério 3) não prova "Tab chega ao
 *        trilho" — na prática, Shift+Tab a partir do primeiro item
 *        pousa no BOTÃO DO BACKDROP (irmão imediato no DOM), não no
 *        trilho. Critério 13 (novo) continua pressionando Shift+Tab até
 *        alcançar de fato um botão do trilho (ou esgotar um limite de
 *        tentativas), com o painel confirmadamente ainda aberto — é a
 *        prova de paridade de verdade com o mouse, não só "não fica
 *        preso em algum lugar".
 *
 * Roda contra `/dev/campaign-shell-drawer` (harness isolado, guardado
 * por `assertDevRouteAllowed`), que monta o `CampaignShell` REAL com
 * `painelSessao` de teste — não uma cópia/simulação do componente.
 *
 * Cobre:
 *   1. Fechado por padrão; toggle abre (aria-expanded, painel visível).
 *   2. Foco entra no painel ao abrir.
 *   3. NÃO-MODAL: Tab/Shift+Tab a partir das pontas do painel SAEM dele
 *      (não ficam presos) — paridade com o mouse, que já alcançava o
 *      trilho por baixo do backdrop.
 *   4. Escape fecha e devolve o foco ao botão que abriu.
 *   5. Backdrop existe, cobre o conteúdo mas poupa o trilho de
 *      navegação, e clicar nele fecha.
 *   6. Scroll do body trava enquanto aberto e restaura ao fechar.
 *   7. Fechamento automático ao navegar (client-side) para outra rota
 *      — sem o CampaignShell nem o painel desmontarem.
 *   8. Instância única ENTRE ROTAS: o "mount id" não muda ao navegar.
 *   9. Instância única GLOBAL no amplo: exatamente 1 nó com o
 *      `data-testid` do painel em toda a página — não 2.
 *   10. MESMA instância nos dois breakpoints: o mount id no amplo é
 *       idêntico ao mount id depois de redimensionar pro intermediário
 *       (não é uma segunda montagem que por acaso também soma 1).
 *   11. Nenhum id de DOM duplicado na página (React avisaria no console
 *       se `useId()` fosse usado por duas instâncias simultâneas — este
 *       critério é a prova direta, não a inferência via warning).
 *   12. SEM FLASH — prova estrutural: com JavaScript totalmente
 *       desligado (sem hidratação nenhuma possível), o painel já chega
 *       `display:none` só de HTML server-renderizado + CSS.
 *   13. Teclado alcança o TRILHO de verdade (não só "sai do painel")
 *       via Shift+Tab repetido a partir do primeiro item, com o painel
 *       confirmadamente ainda aberto ao final.
 *
 * Uso: npx tsx scripts/dev/check-campaign-shell-drawer.ts
 * (precisa de `npm run dev`; não precisa de sessão autenticada — a
 * rota /dev não passa por login)
 */

import { BASE_URL } from "./authSession";
import { chromium } from "playwright";

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // --- 12. SEM FLASH — prova ESTRUTURAL, não de timing ---
    // A primeira versão deste critério lia o `display` computado logo
    // após `domcontentloaded`, mas `domcontentloaded` NÃO garante que a
    // hidratação ainda não rodou — é só um marco de parsing do HTML, e
    // React pode hidratar componentes síncronos antes dele disparar em
    // alguns casos. Timing não é prova.
    //
    // A prova de verdade é estrutural: um contexto de browser com
    // JAVASCRIPT TOTALMENTE DESLIGADO. Sem JS, não existe hidratação —
    // nenhum `useEffect` roda, nenhum `useState` reidrata. O que chega
    // na tela é EXATAMENTE o HTML server-renderizado (`data-open="false"`,
    // valor do `useState(false)` inicial, que o SSR já escreve por
    // conta própria) mais o CSS puro. Se o painel está fechado aqui, é
    // fechado por ESTRUTURA (CSS + SSR), nunca por um efeito que "deu
    // tempo de rodar antes do teste olhar".
    {
      const contextoSemJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1024, height: 800 } });
      const paginaSemJs = await contextoSemJs.newPage();
      await paginaSemJs.goto(`${BASE_URL}/dev/campaign-shell-drawer`);
      const semJs = await paginaSemJs.evaluate(() => {
        const p = document.querySelector('[data-testid="campshell-painel-sessao"]');
        return { display: p ? getComputedStyle(p).display : null, dataOpen: p?.getAttribute("data-open") ?? null };
      });
      // `evaluate` em si roda um script mínimo do Playwright pra LER o
      // resultado — isso não conta como "hidratar a página": o app
      // nunca executou nenhum de seus próprios scripts (JS desligado no
      // CONTEXTO da página desde antes do primeiro request).
      registrar(
        "12 (sem flash — JS totalmente desligado, prova estrutural)",
        semJs.display === "none" && semJs.dataOpen === "false",
        `com JS desligado: display="${semJs.display}" (esperado "none"), data-open="${semJs.dataOpen}" (esperado "false", vindo do SSR)`,
      );
      await contextoSemJs.close();
    }

    // --- 9. Instância única GLOBAL, no breakpoint AMPLO ---
    // Verificado ANTES de qualquer interação com o drawer, e num
    // viewport onde a superfície é a coluna do grid (não o drawer) —
    // é justamente o cenário que o bug antigo quebrava: uma cópia na
    // coluna, outra dentro do (então oculto, mas MONTADO) drawer.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/dev/campaign-shell-drawer`, { waitUntil: "networkidle" });
    {
      const contagemAmplo = await page.locator('[data-testid="campshell-painel-sessao"]').count();
      registrar("9 (instância única global, breakpoint amplo)", contagemAmplo === 1, `nós com data-testid="campshell-painel-sessao": ${contagemAmplo} (esperado 1)`);
    }
    const mountIdAmplo = await page.locator('[data-testid="drawer-mount-id"]').getAttribute("data-mount-id");

    // --- 10. MESMA instância ao cruzar pro breakpoint intermediário ---
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForTimeout(300);
    {
      const contagemInter = await page.locator('[data-testid="campshell-painel-sessao"]').count();
      const mountIdInter = await page.locator('[data-testid="drawer-mount-id"]').getAttribute("data-mount-id");
      registrar(
        "10 (mesma instância nos dois breakpoints)",
        contagemInter === 1 && mountIdInter === mountIdAmplo,
        `nós no intermediário=${contagemInter} (esperado 1), mount id amplo="${mountIdAmplo}" vs intermediário="${mountIdInter}" (devem ser iguais)`,
      );
    }

    // --- 11. Nenhum id de DOM duplicado na página ---
    {
      const idsDuplicados = await page.evaluate(() => {
        const contagem = new Map<string, number>();
        document.querySelectorAll("[id]").forEach((el) => {
          const id = el.id;
          contagem.set(id, (contagem.get(id) ?? 0) + 1);
        });
        return [...contagem.entries()].filter(([, n]) => n > 1);
      });
      registrar("11 (nenhum id de DOM duplicado)", idsDuplicados.length === 0, idsDuplicados.length ? JSON.stringify(idsDuplicados) : "nenhum");
    }

    const toggle = page.locator('[data-testid="campshell-drawer-toggle"]');
    const painel = page.locator('[data-testid="campshell-painel-sessao"]');
    const backdrop = page.locator(".rm-drawer-backdrop");

    // --- 1. Fechado por padrão; abre ao clicar --- (já está no intermediário, viewport 1024 da etapa 10)
    {
      const fechadoInicial = await painel.isHidden();
      await toggle.click();
      await page.waitForTimeout(150);
      const expanded = await toggle.getAttribute("aria-expanded");
      const visivel = await painel.isVisible();
      registrar("1 (fechado por padrão, abre no clique)", fechadoInicial && expanded === "true" && visivel, `fechado inicial=${fechadoInicial}, aria-expanded=${expanded}, visível após clique=${visivel}`);
    }

    // --- 2. Foco entra no painel ao abrir ---
    {
      const dentroDoPainel = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="campshell-painel-sessao"]');
        return !!p && p === document.activeElement;
      });
      registrar("2 (foco entra no painel ao abrir)", dentroDoPainel, `document.activeElement é o painel: ${dentroDoPainel}`);
    }

    // --- 3. NÃO-MODAL: Tab/Shift+Tab SAEM do painel (não ficam presos) ---
    // Decisão fechada nesta rodada: é diálogo não-modal (Fase −1 exige
    // o trilho clicável por mouse com o painel aberto; prender o
    // teclado dentro do painel dava a mouse e teclado dois graus de
    // acesso diferentes pro mesmo recurso). O teste antigo validava o
    // oposto (aprisionamento) — substituído por este, que prova a
    // simetria.
    {
      const item1 = painel.locator('[data-testid="drawer-item-1"]');
      const item3 = painel.locator('[data-testid="drawer-item-3"]');

      await item1.focus();
      await page.keyboard.press("Shift+Tab"); // do primeiro item, deveria SAIR do painel
      const antesSaiuDoPainel = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="campshell-painel-sessao"]');
        return !!p && !p.contains(document.activeElement);
      });

      await item3.focus();
      await page.keyboard.press("Tab"); // do último item, deveria SAIR do painel
      const depoisSaiuDoPainel = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="campshell-painel-sessao"]');
        return !!p && !p.contains(document.activeElement);
      });

      registrar(
        "3 (não-modal: Tab/Shift+Tab saem do painel, sem prender foco)",
        antesSaiuDoPainel && depoisSaiuDoPainel,
        `Shift+Tab do primeiro item saiu do painel=${antesSaiuDoPainel}; Tab do último item saiu do painel=${depoisSaiuDoPainel}`,
      );

      // --- 13. Alcance de VERDADE: teclado chega ao trilho, não só "sai
      // do painel" ---
      // O critério 3 sozinho é fraco: sair do painel via Shift+Tab a
      // partir do primeiro item pousa no botão do BACKDROP (irmão
      // imediato antes do `<aside>` no DOM, e um `<button>` de verdade,
      // então naturalmente focável) — não no trilho. "Saiu do painel"
      // não é o mesmo que "chegou aonde o mouse chega". Este critério
      // continua pressionando Shift+Tab a partir daí até ou alcançar um
      // botão do trilho (`.rm-navrail-btn`) ou esgotar um número
      // generoso de tentativas — prova (ou refuta) a paridade de
      // verdade com o mouse, que já alcançava o trilho por baixo do
      // backdrop desde a correção anterior.
      let alcancouTrilho = false;
      let tentativas = 0;
      const MAX_TENTATIVAS = 10;
      await item1.focus();
      await page.keyboard.press("Shift+Tab");
      while (tentativas < MAX_TENTATIVAS) {
        tentativas++;
        alcancouTrilho = await page.evaluate(() => !!document.activeElement?.closest(".rm-navrail"));
        if (alcancouTrilho) break;
        await page.keyboard.press("Shift+Tab");
      }
      const painelSeguiaAberto = (await toggle.getAttribute("aria-expanded")) === "true";
      registrar(
        "13 (teclado alcança o trilho, painel permanece aberto)",
        alcancouTrilho && painelSeguiaAberto,
        alcancouTrilho
          ? `alcançou um botão do trilho após ${tentativas} Shift+Tab a partir do 1º item; painel continuava aberto=${painelSeguiaAberto}`
          : `NÃO alcançou o trilho em ${MAX_TENTATIVAS} tentativas de Shift+Tab`,
      );

      // Reafirma o item 1 com foco, pro resto da suíte (testes 4+)
      // partir de um estado conhecido.
      await item1.focus();

      // Sair do painel com Tab não fecha nada (não-modal não tem esse
      // efeito colateral) — `aberto` continua `true`, os testes
      // seguintes (Escape, backdrop) seguem assumindo painel aberto sem
      // precisar reabrir aqui.
    }

    // --- 4. Escape fecha e devolve o foco ao botão ---
    {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      const fechado = await painel.isHidden();
      const focoNoBotao = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "campshell-drawer-toggle");
      registrar("4 (Escape fecha e devolve foco ao botão)", fechado && focoNoBotao, `fechado=${fechado}, foco voltou ao toggle=${focoNoBotao}`);
    }

    // --- 5. Backdrop existe e fecha ao clicar ---
    {
      await toggle.click();
      await page.waitForTimeout(150);
      const backdropVisivel = await backdrop.isVisible();
      const box = await backdrop.boundingBox();
      // Largura esperada é viewport MENOS o trilho (52px), não a tela
      // inteira — o backdrop poupa o trilho de propósito (ver
      // comentário em mesa.css), então "cobre a tela" aqui significa
      // "cobre tudo, exceto o trilho".
      const cobreConteudoTodo = !!box && box.x >= 50 && box.width >= 970 && box.height >= 800;
      await backdrop.click({ position: { x: 5, y: 5 } }); // canto do backdrop, longe do painel (que fica à direita)
      await page.waitForTimeout(150);
      const fechouAoClicar = await painel.isHidden();
      registrar(
        "5 (backdrop cobre o conteúdo mas poupa o trilho, e fecha ao clicar)",
        backdropVisivel && cobreConteudoTodo && fechouAoClicar,
        `backdrop visível=${backdropVisivel}, x=${box?.x} ${box?.width}x${box?.height}px, fechou ao clicar=${fechouAoClicar}`,
      );
    }

    // --- 6. Scroll do body trava e restaura ---
    {
      const antesDeAbrir = await page.evaluate(() => document.body.style.overflow);
      await toggle.click();
      await page.waitForTimeout(150);
      const comPainelAberto = await page.evaluate(() => document.body.style.overflow);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      const depoisDeFechar = await page.evaluate(() => document.body.style.overflow);
      registrar(
        "6 (scroll do body trava e restaura)",
        comPainelAberto === "hidden" && depoisDeFechar === antesDeAbrir,
        `antes="${antesDeAbrir}", aberto="${comPainelAberto}", depois="${depoisDeFechar}"`,
      );
    }

    // --- 7 e 8. Fechamento por navegação + instância única entre rotas ---
    {
      const mountIdAntes = await painel.locator('[data-testid="drawer-mount-id"]').getAttribute("data-mount-id");

      await toggle.click();
      await page.waitForTimeout(150);
      const abertoAntesDeNavegar = await painel.isVisible();

      await page.locator('[data-testid="harness-ir-para-b"]').click();
      await page.waitForURL("**/dev/campaign-shell-drawer/outra");
      await page.waitForTimeout(200);

      const fechadoAposNavegar = await painel.isHidden();
      const mountIdDepois = await painel.locator('[data-testid="drawer-mount-id"]').getAttribute("data-mount-id");
      const contagemAposNavegar = await page.locator('[data-testid="campshell-painel-sessao"]').count();

      registrar(
        "7 (painel fecha sozinho ao navegar)",
        abertoAntesDeNavegar && fechadoAposNavegar,
        `aberto antes de clicar no link=${abertoAntesDeNavegar}, fechado depois de navegar=${fechadoAposNavegar}`,
      );
      registrar(
        "8 (instância única — sem remount entre rotas)",
        mountIdAntes !== null && mountIdAntes === mountIdDepois && contagemAposNavegar === 1,
        `mount id antes="${mountIdAntes}", depois="${mountIdDepois}", nós após navegar=${contagemAposNavegar}`,
      );
    }

    // --- 14. Fechamento por NAVEGAÇÃO não rouba o foco de volta ---
    // O cleanup do efeito de drawer devolvia foco ao botão "Sessão"
    // SEMPRE, mas roda em qualquer transição de aberto/breakpoint —
    // inclusive quando o painel fecha porque o usuário navegou. Nesse
    // caso o foco pertence a quem navegou (o link acionado / a página
    // nova), e puxá-lo pro botão do drawer é roubo de foco. Só
    // fechamento explícito (Escape/backdrop/toggle) devolve.
    {
      await page.goto(`${BASE_URL}/dev/campaign-shell-drawer`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);

      await toggle.click();
      await page.waitForTimeout(200);
      const abertoAntes = await painel.isVisible();

      // Navega pelo TECLADO — é onde roubo de foco dói de verdade.
      const link = page.locator('[data-testid="harness-ir-para-b"]');
      await link.focus();
      await page.keyboard.press("Enter");
      await page.waitForURL("**/dev/campaign-shell-drawer/outra");
      await page.waitForTimeout(400);

      const focoAposNavegar = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          testid: el?.getAttribute("data-testid") ?? null,
          tag: el?.tagName ?? null,
          ehToggle: el?.getAttribute("data-testid") === "campshell-drawer-toggle",
        };
      });

      // Contraprova no mesmo critério: fechamento EXPLÍCITO (Escape)
      // continua devolvendo o foco — a correção não pode ter matado o
      // comportamento correto junto com o errado.
      await toggle.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const focoAposEscape = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.getAttribute("data-testid") === "campshell-drawer-toggle",
      );

      registrar(
        "14 (navegação não rouba foco; fechamento explícito ainda devolve)",
        abertoAntes && !focoAposNavegar.ehToggle && focoAposEscape,
        `após navegar por teclado com o painel aberto, foco em <${focoAposNavegar.tag}> testid="${focoAposNavegar.testid}" ` +
          `(NÃO pode ser o toggle: ${!focoAposNavegar.ehToggle}); após Escape, foco voltou ao toggle=${focoAposEscape}`,
      );
    }

    await browser.close();
  } catch (err) {
    await browser.close();
    throw err;
  }
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
