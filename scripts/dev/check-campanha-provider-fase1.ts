/**
 * Browser check da Fase 1 da reestrutura da área de campanha — o
 * `CampaignRealtimeProvider` que passou a viver na casca.
 *
 * O que esta fase promete e portanto o que aqui se verifica:
 *
 *   1. Nenhuma regressão visual/funcional na Mesa (a fase é só de
 *      dados: campanha e log saíram do estado local de `MesaClient`
 *      e passaram a vir do contexto).
 *   2. Os DOIS indicadores de sincronização existem e são
 *      independentes — "Sessão" (campanha + log, no provider) e
 *      "Personagens" (canal próprio, só narrador, ao lado de
 *      "Resolver Ataque"). Um agregado único diria "Sincronizado" com
 *      um dos canais em erro.
 *   3. O provider hidrata em QUALQUER rota da campanha, não só na
 *      Mesa — entrar direto em /personagens não pode quebrar nem
 *      depender de ter passado pela Mesa antes.
 *   4. Navegar entre rotas não derruba a casca (o provider é do layout,
 *      então sobrevive à troca de `{children}`).
 *   5. Zero erro de console em todas as rotas visitadas.
 *
 * Não cobre: realtime com duas sessões simultâneas (exige duas contas
 * distintas — verificação manual), e a aparência dos painéis
 * persistentes (só existem a partir da Fase 3).
 *
 * Uso: npx tsx scripts/dev/check-campanha-provider-fase1.ts
 * (precisa de `npm run dev` rodando e da sessão salva — ver
 * save-admin-session.ts)
 */

import type { ConsoleMessage, Page } from "playwright";
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

/** Erros de console que não são do app (ruído de dev/extensões). */
function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("Failed to load resource") && t.includes("favicon")) return false;
  if (t.includes("Download the React DevTools")) return false;
  return true;
}

async function textoDaPagina(page: Page): Promise<string> {
  return (await page.textContent("body")) ?? "";
}

function pareceTelaDeErro(texto: string): boolean {
  return (
    texto.includes("Application error") ||
    texto.includes("Unhandled Runtime Error") ||
    texto.includes("Export ") ||
    texto.includes("Module not found") ||
    texto.includes("This page could not be found")
  );
}

async function main() {
  await withAuthenticatedPage(async (page) => {
    const errosPorRota = new Map<string, string[]>();
    let rotaAtual = "(inicial)";
    page.on("console", (msg) => {
      if (!erroRelevante(msg)) return;
      const lista = errosPorRota.get(rotaAtual) ?? [];
      lista.push(msg.text().slice(0, 200));
      errosPorRota.set(rotaAtual, lista);
    });

    // --- Descobrir uma campanha real da conta logada ---
    rotaAtual = "/mesas";
    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    // Filtra por UUID de verdade: `a[href^="/mesas/"]` também casa com
    // os links do menu (/mesas/personagens, /mesas/conta…), que vêm
    // antes das campanhas na ordem do DOM.
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const campaignId =
      hrefs.map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]).find(Boolean) ?? null;

    if (!campaignId) {
      registrar("0 (campanha de teste disponível)", false, "Nenhuma campanha encontrada em /mesas para esta conta — crie uma antes de rodar este check.");
      return;
    }
    registrar("0 (campanha de teste disponível)", true, `usando campanha ${campaignId}`);

    // --- 1. Mesa abre sem tela de erro ---
    rotaAtual = `/mesas/${campaignId}`;
    await page.goto(`${BASE_URL}${rotaAtual}`, { waitUntil: "networkidle" });
    const textoMesa = await textoDaPagina(page);
    registrar("1 (Mesa abre sem tela de erro)", !pareceTelaDeErro(textoMesa), `primeiros 90 chars: "${textoMesa.trim().slice(0, 90)}…"`);

    // --- 2. Seções da Mesa continuam presentes (sem regressão) ---
    // Atualizado na Fase 3: "Turnos" deixou de ser um h2 embutido na
    // Mesa — virou o TurnTrackDock, persistente na casca (visível em
    // QUALQUER rota, não só aqui). O critério de turno agora procura o
    // dock, não o texto antigo.
    {
      const temRodada = (await page.locator('[data-testid="det-rodada-atual"]').count()) > 0 || textoMesa.includes("Rodada");
      const temDockDeTurno = (await page.locator('[data-testid^="turndock-"]').count()) > 0;
      const temRecarregar = (await page.locator('[data-testid="mesa-recarregar"]').count()) > 0;
      registrar(
        "2 (seções da Mesa preservadas)",
        temRodada && temDockDeTurno && temRecarregar,
        `rodada=${temRodada}, dock de turno=${temDockDeTurno}, botão recarregar=${temRecarregar}`,
      );
    }

    // --- 3. Dois indicadores de sincronização, independentes ---
    {
      const sessao = page.locator('[data-testid="mesa-sync-status"]');
      const personagens = page.locator('[data-testid="mesa-sync-status-personagens"]');
      const temSessao = (await sessao.count()) > 0;
      const temPersonagens = (await personagens.count()) > 0;
      const txtSessao = temSessao ? ((await sessao.textContent()) ?? "").trim() : "(ausente)";
      const txtPersonagens = temPersonagens ? ((await personagens.textContent()) ?? "").trim() : "(ausente)";
      // São dois elementos distintos, não o mesmo status repetido.
      const distintos = temSessao && temPersonagens && txtSessao !== txtPersonagens;
      registrar(
        "3 (dois indicadores de sync separados)",
        distintos,
        `sessão="${txtSessao}" | personagens="${txtPersonagens}"`,
      );
    }

    // --- 4. Realtime da SESSÃO conecta de verdade ---
    {
      const sessao = page.locator('[data-testid="mesa-sync-status"]');
      await page
        .waitForFunction(
          () => {
            const el = document.querySelector('[data-testid="mesa-sync-status"]');
            return !!el && /sincroniz/i.test(el.textContent ?? "");
          },
          { timeout: 15000 },
        )
        .catch(() => {});
      const txt = ((await sessao.textContent()) ?? "").trim();
      const conectou = /sincroniz/i.test(txt) && !/erro/i.test(txt);
      registrar("4 (canal de sessão conecta)", conectou, `status final: "${txt}"`);
    }

    // --- 5. Navegar para outra rota não quebra a casca ---
    rotaAtual = `/mesas/${campaignId}/personagens`;
    {
      // Navegação client-side de verdade (link do menu), não page.goto —
      // é isso que exercita o provider sobrevivendo à troca de children.
      const link = page.locator('[data-testid="campnav-personagens"]');
      if ((await link.count()) > 0) {
        await link.first().click();
        await page.waitForURL(`**/mesas/${campaignId}/personagens`, { timeout: 15000 }).catch(() => {});
      } else {
        await page.goto(`${BASE_URL}${rotaAtual}`, { waitUntil: "networkidle" });
      }
      await page.waitForLoadState("networkidle");
      const txt = await textoDaPagina(page);
      registrar("5 (navegar Mesa → Personagens não quebra)", !pareceTelaDeErro(txt), `url=${page.url().replace(BASE_URL, "")}`);
    }

    // --- 6. Provider hidrata entrando DIRETO numa rota que não é a Mesa ---
    rotaAtual = `/mesas/${campaignId}/personagens (entrada direta)`;
    {
      const novaAba = await page.context().newPage();
      const errosDireta: string[] = [];
      novaAba.on("console", (msg) => {
        if (erroRelevante(msg)) errosDireta.push(msg.text().slice(0, 200));
      });
      await novaAba.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
      const txt = (await novaAba.textContent("body")) ?? "";
      const ok = !pareceTelaDeErro(txt) && errosDireta.length === 0;
      registrar(
        "6 (entrada direta em rota não-Mesa hidrata o provider)",
        ok,
        `tela de erro=${pareceTelaDeErro(txt)}, erros de console=${errosDireta.length}${errosDireta.length ? ` (${errosDireta[0]})` : ""}`,
      );
      await novaAba.close();
    }

    // --- 7. Voltar para a Mesa continua íntegro ---
    rotaAtual = `/mesas/${campaignId} (volta)`;
    {
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      const txt = await textoDaPagina(page);
      const temSync = (await page.locator('[data-testid="mesa-sync-status"]').count()) > 0;
      registrar("7 (volta para a Mesa íntegra)", !pareceTelaDeErro(txt) && temSync, `indicador de sessão presente=${temSync}`);
    }

    // --- 8. Zero erro de console nas rotas DA CAMPANHA ---
    // `/mesas` (o dashboard) fica de fora do critério de propósito: é só
    // de onde se descobre um id de campanha para o teste, não faz parte
    // da área sob verificação. Ele tem um 404 pré-existente e alheio a
    // esta fase (`/brand/app-hud.png` referenciado em
    // `mesas/_global/parts.tsx`, enquanto o arquivo em disco é `.jpg`) —
    // contá-lo aqui mascararia uma regressão real da campanha atrás de
    // um ruído conhecido de outra área.
    {
      const daCampanha = [...errosPorRota.entries()].filter(([rota]) => /^\/mesas\/[0-9a-f-]{36}/i.test(rota));
      const total = daCampanha.reduce((s, [, l]) => s + l.length, 0);
      const resumo = total === 0 ? "nenhum nas rotas da campanha" : daCampanha.map(([r, l]) => `${r}: ${l.length} (${l[0]})`).join(" | ");
      registrar("8 (console limpo nas rotas da campanha)", total === 0, resumo);
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
