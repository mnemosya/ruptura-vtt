/**
 * Browser check da Fase 6 — migração do assistente de criação de
 * personagem (`CreateCharacterWizardClient.tsx`, 909L) para `rm-*` e
 * remoção final de `_shell/theme.ts`.
 *
 * "Smoke test do início ao fim" (critério do plano): percorre as 7
 * etapas de verdade, incluindo finalizar a criação — não só verifica
 * classes `rm-*` presentes. A distribuição de pontos (atributos/
 * perícias/vertentes) é genérica, lida do DOM (`Pontos restantes: N`),
 * não hardcoded contra os números atuais de `regras_personagem` — o
 * check continua válido se essas regras mudarem.
 *
 * Cobre:
 *   1. Trilho de etapas em `rm-pill`/`rm-pills`, com `aria-current="step"`
 *      (NÃO `role="tablist"`/`aria-selected` — auditoria pós-Fase-6: o
 *      componente não implementa `tabpanel`/`aria-controls`/roving
 *      `tabIndex`/navegação por setas, então anunciar semântica de abas
 *      seria uma mentira pra leitor de tela. Mesmo par de seletores já
 *      usado pro trilho da campanha — aditivo #8 do plano).
 *   2. Campos em `rm-input`/`rm-select`/`rm-field`.
 *   3. Fluxo completo: identidade → atributos → perícias → vertentes
 *      (se houver) → talento (opcional) → inventário (compra opcional)
 *      → revisão → FINALIZAR — personagem real criado, controle
 *      concedido, navegação para a ficha dele.
 *   4. Zero hex hardcoded no HTML servido da tela de revisão.
 *   5. `_shell/theme.ts` não existe mais no repositório.
 *   6. Console limpo.
 *   7-9. Falha em CADA catálogo (talentos/magias/itens — injeção real
 *      via header, seam dev-only de `src/lib/dev/faultInjection.ts`,
 *      mesmo mecanismo escopado por URL exata da Fase 5) confirma
 *      erro+retry na etapa afetada, NUNCA o "nenhum publicado ainda"
 *      que seria uma falha de leitura disfarçada de fato do domínio —
 *      e que o retry (`router.refresh()`) recupera de verdade.
 *   10. `FichaHeader.tsx` não tem paleta/helper de estilo copiados —
 *      só classes de `console.css`.
 *
 * Uso: npx tsx scripts/dev/check-campanha-wizard-fase6.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { existsSync, readFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage, Page, Route } from "playwright";
import { BASE_URL, withAuthenticatedPage } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Mesmo segredo que o servidor dev carrega em DEV_FAULT_INJECTION_SECRET
// (ver Fase 5) — sem ele configurado dos dois lados os critérios 7-9
// reprovam em vez de passar por omissão.
const FALHA_SEGREDO = requireEnv("DEV_FAULT_INJECTION_SECRET");

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
  return !t.includes("favicon") && !t.includes("Download the React DevTools");
}

/**
 * Clica "+" round-robin nos botões dados até "Pontos restantes: N"
 * chegar a 0 (ou até esgotar as tentativas — não hardcoded contra os
 * números atuais das regras). Clamps de teto no handler tornam clique
 * além do teto um no-op seguro, então round-robin sempre converge se a
 * distribuição for matematicamente possível.
 */
async function distribuirPontos(page: Page, testidPontosRestantes: string, seletorBotoesMais: string, maxTentativas = 400): Promise<number> {
  const botoes = page.locator(seletorBotoesMais);
  const total = await botoes.count();
  if (total === 0) return 0;
  for (let i = 0; i < maxTentativas; i++) {
    const texto = (await page.locator(`[data-testid="${testidPontosRestantes}"]`).textContent()) ?? "";
    const match = texto.match(/Pontos restantes:\s*(-?\d+)/);
    const restantes = match ? Number(match[1]) : 0;
    if (restantes <= 0) return restantes;
    await botoes.nth(i % total).click();
  }
  const textoFinal = (await page.locator(`[data-testid="${testidPontosRestantes}"]`).textContent()) ?? "";
  const matchFinal = textoFinal.match(/Pontos restantes:\s*(-?\d+)/);
  return matchFinal ? Number(matchFinal[1]) : -1;
}

/** Escopado ao request de DOCUMENTO da URL exata — mesmo mecanismo da Fase 5, ver ali o porquê (setExtraHTTPHeaders vazaria o segredo pra qualquer requisição). */
async function comFalhaInjetada<T>(page: Page, recurso: string, urlAlvo: string, corpo: () => Promise<T>): Promise<T> {
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.resourceType() === "document" && req.url() === urlAlvo) {
      await route.continue({ headers: { ...req.headers(), "x-ruptura-falha-recurso": recurso, "x-ruptura-falha-segredo": FALHA_SEGREDO } });
    } else {
      await route.continue();
    }
  };
  await page.route("**/*", handler);
  try {
    return await corpo();
  } finally {
    await page.unroute("**/*", handler);
  }
}

let campaignId: string | null = null;
let characterIdCriado: string | null = null;

async function main() {
  await withAuthenticatedPage(async (page) => {
    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    campaignId = hrefs.map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1]).find(Boolean) ?? null;
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "nenhuma campanha encontrada em /mesas para esta conta");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    // Defensivo: descarta qualquer rascunho de criação deixado por uma
    // execução anterior deste MESMO script que tenha sido interrompida
    // (a conta narradora é persistente, não uma fixture descartável —
    // achado real ao rodar este script pela primeira vez: o autosave do
    // wizard grava a cada `irParaEtapa`, e as cenas de injeção de falha
    // abaixo navegam por várias etapas sem nunca finalizar nem cancelar
    // a criação, deixando um rascunho pra trás que o próximo load
    // RESTAURA — fazendo os critérios 1/2, que esperam a Etapa 1 limpa,
    // falharem por um motivo alheio ao que testam).
    await admin.from("character_creation_drafts").delete().eq("campaign_id", campaignId);

    const errosConsole: string[] = [];
    page.on("console", (m) => { if (erroRelevante(m)) errosConsole.push(m.text().slice(0, 200)); });

    const urlWizard = `${BASE_URL}/mesas/${campaignId}/personagens/novo`;
    await page.goto(urlWizard, { waitUntil: "networkidle" });

    // --- 1. Trilho de etapas rm-pill/rm-pills, aria-current="step" (não role=tab) ---
    {
      const pills = await page.locator(".rm-pills .rm-pill").count();
      const etapa1Atual = (await page.locator('[data-testid="wizard-etapa-1"][aria-current="step"]').count()) > 0;
      const semRoleTab = (await page.locator('[data-testid^="wizard-etapa-"][role="tab"]').count()) === 0;
      const semTablist = (await page.locator(".rm-pills[role=\"tablist\"]").count()) === 0;
      const temTitulo = (await page.locator("h1.rm-page-title:has-text(\"Novo personagem\")").count()) > 0;
      registrar(
        "1 (trilho de etapas: aria-current=\"step\", nunca role=tab/tablist)",
        pills === 7 && etapa1Atual && semRoleTab && semTablist && temTitulo,
        `pills=${pills} (esperado 7), etapa 1 aria-current=step=${etapa1Atual}, nenhum role=tab=${semRoleTab}, nenhum role=tablist=${semTablist}, título rm-*=${temTitulo}`,
      );
    }

    // --- 2. Campos em rm-input/rm-select ---
    {
      const nomeRm = (await page.locator('[data-testid="wizard-nome"].rm-input').count()) > 0;
      const origemRm = (await page.locator('[data-testid="wizard-origem"].rm-select').count()) > 0;
      registrar("2 (campos da Etapa 1 em rm-input/rm-select)", nomeRm && origemRm, `nome rm-input=${nomeRm}, origem rm-select=${origemRm}`);
    }

    // --- 7. Falha no catálogo de MAGIAS (Etapa 4) não vira "avance sem preencher" ---
    await comFalhaInjetada(page, "wizard-magias", urlWizard, () => page.goto(urlWizard, { waitUntil: "networkidle" }));
    {
      await page.locator('[data-testid="wizard-etapa-4"]').click();
      const erroVisivel = (await page.locator('[data-testid="wizard-magias-erro"]').count()) > 0;
      const semVazioFalso = (await page.locator('text=Nenhuma magia publicada nesta mesa ainda').count()) === 0;
      registrar(
        "7 (falha no catálogo de magias mostra erro+retry, nunca \"avance sem preencher\")",
        erroVisivel && semVazioFalso,
        `banner de erro=${erroVisivel}, texto de vazio indevido ausente=${semVazioFalso}`,
      );
      // Retry — `router.refresh()` dispara um fetch de RSC, não uma
      // navegação de documento, então o header injetado (escopado ao
      // request de documento da URL exata) não se aplica a ele: a
      // releitura é genuína.
      await page.locator('[data-testid="wizard-magias-erro"] button:has-text("Tentar de novo")').click();
      const erroSumiu = await page.locator('[data-testid="wizard-magias-erro"]').waitFor({ state: "detached", timeout: 8000 }).then(() => true).catch(() => false);
      registrar("7b (retry do catálogo de magias recupera de verdade)", erroSumiu, `banner de erro após retry=${!erroSumiu}`);
    }

    // --- 8. Falha no catálogo de TALENTOS (Etapa 5) ---
    await comFalhaInjetada(page, "wizard-talentos", urlWizard, () => page.goto(urlWizard, { waitUntil: "networkidle" }));
    {
      await page.locator('[data-testid="wizard-etapa-5"]').click();
      const erroVisivel = (await page.locator('[data-testid="wizard-talentos-erro"]').count()) > 0;
      const semVazioFalso = (await page.locator('text=Nenhum talento de nível 1 publicado').count()) === 0;
      registrar(
        "8 (falha no catálogo de talentos mostra erro+retry, nunca \"avance sem escolher\")",
        erroVisivel && semVazioFalso,
        `banner de erro=${erroVisivel}, texto de vazio indevido ausente=${semVazioFalso}`,
      );
      await page.locator('[data-testid="wizard-talentos-erro"] button:has-text("Tentar de novo")').click();
      const erroSumiu = await page.locator('[data-testid="wizard-talentos-erro"]').waitFor({ state: "detached", timeout: 8000 }).then(() => true).catch(() => false);
      registrar("8b (retry do catálogo de talentos recupera de verdade)", erroSumiu, `banner de erro após retry=${!erroSumiu}`);
    }

    // --- 9. Falha no catálogo de ITENS (Etapa 6) ---
    await comFalhaInjetada(page, "wizard-itens", urlWizard, () => page.goto(urlWizard, { waitUntil: "networkidle" }));
    {
      await page.locator('[data-testid="wizard-etapa-6"]').click();
      const erroVisivel = (await page.locator('[data-testid="wizard-itens-erro"]').count()) > 0;
      const semItensListados = (await page.locator('[data-testid^="wizard-comprar-"]').count()) === 0;
      registrar(
        "9 (falha no catálogo de itens mostra erro+retry, nunca a loja vazia)",
        erroVisivel && semItensListados,
        `banner de erro=${erroVisivel}, nenhum item de loja renderizado=${semItensListados}`,
      );
      await page.locator('[data-testid="wizard-itens-erro"] button:has-text("Tentar de novo")').click();
      const erroSumiu = await page.locator('[data-testid="wizard-itens-erro"]').waitFor({ state: "detached", timeout: 8000 }).then(() => true).catch(() => false);
      registrar("9b (retry do catálogo de itens recupera de verdade)", erroSumiu, `banner de erro após retry=${!erroSumiu}`);
    }

    // --- Fluxo completo, sem falha injetada, do zero ---
    // As 3 cenas de injeção acima navegaram por Etapas 4-6 sem finalizar
    // nem cancelar — o autosave já gravou um rascunho real. Descartado
    // aqui pelo mesmo motivo do descarte no início: sem isto, o próximo
    // load restauraria esse rascunho em vez de abrir a Etapa 1 limpa que
    // os critérios 3+ esperam.
    await admin.from("character_creation_drafts").delete().eq("campaign_id", campaignId);
    await page.goto(urlWizard, { waitUntil: "networkidle" });

    // --- 3. Fluxo completo — Etapa 1: identidade ---
    const nomePersonagem = `Fixture Wizard Fase6 ${Date.now()}`;
    await page.locator('[data-testid="wizard-nome"]').fill(nomePersonagem);

    // --- Etapa 2: atributos ---
    await page.locator('[data-testid="wizard-etapa-2"]').click();
    const atributosRestantes = await distribuirPontos(page, "wizard-atributos-pontos-restantes", '[data-testid$="-mais"][data-testid^="wizard-atributo-"]');

    // --- Etapa 3: perícias ---
    await page.locator('[data-testid="wizard-etapa-3"]').click();
    const periciasRestantes = await distribuirPontos(page, "wizard-pericias-pontos-restantes", '[data-testid$="-mais"][data-testid^="wizard-pericia-"]');

    // --- Etapa 4: vertentes (opcional — pode não ter magia publicada) ---
    await page.locator('[data-testid="wizard-etapa-4"]').click();
    const temVertentes = (await page.locator('[data-testid="wizard-vertentes-pontos-restantes"]').count()) > 0;
    const vertentesRestantes = temVertentes
      ? await distribuirPontos(page, "wizard-vertentes-pontos-restantes", '[data-testid$="-mais"][data-testid^="wizard-vertente-"]')
      : 0;

    // --- Etapa 6: inventário — compra opcional, só pra tocar a interação ---
    await page.locator('[data-testid="wizard-etapa-6"]').click();
    const primeiroComprar = page.locator('[data-testid^="wizard-comprar-"]').first();
    if ((await primeiroComprar.count()) > 0) await primeiroComprar.click();

    // --- Etapa 7: revisão + finalizar ---
    await page.locator('[data-testid="wizard-etapa-7"]').click();
    await page.waitForTimeout(300);

    const finalizarHabilitado = await page.locator('[data-testid="wizard-finalizar-button"]').isEnabled();
    registrar(
      "3 (fluxo completo até Revisão — validações passam com distribuição genérica de pontos)",
      finalizarHabilitado,
      `atributos restantes=${atributosRestantes}, perícias restantes=${periciasRestantes}, vertentes disponíveis=${temVertentes}, vertentes restantes=${vertentesRestantes}, botão finalizar habilitado=${finalizarHabilitado}`,
    );

    // --- 4. Zero hex hardcoded no HTML servido da Revisão ---
    {
      const hexInline = await page.evaluate(() => {
        const comStyle = [...document.querySelectorAll("[style]")];
        return comStyle.map((el) => el.getAttribute("style") ?? "").filter((s) => /#[0-9a-fA-F]{3,8}\b/.test(s)).slice(0, 5);
      });
      registrar("4 (zero hex inline na tela de Revisão)", hexInline.length === 0, `styles com hex=${JSON.stringify(hexInline)}`);
    }

    if (finalizarHabilitado) {
      await page.locator('[data-testid="wizard-finalizar-button"]').click();
      await page.waitForURL(/\/ficha\?campaignId=.*characterId=/, { timeout: 15000 }).catch(() => {});
      const url = page.url();
      const criouENavegou = url.includes("/ficha?") && url.includes("characterId=");
      characterIdCriado = criouENavegou ? new URL(url).searchParams.get("characterId") : null;
      registrar(
        "3b (finalizar cria o personagem de verdade e navega pra ficha dele)",
        criouENavegou && !!characterIdCriado,
        `url final="${url}", characterId=${characterIdCriado}`,
      );
    } else {
      registrar("3b (finalizar cria o personagem de verdade e navega pra ficha dele)", false, "pulado — botão finalizar não habilitou no passo anterior");
    }

    // --- 5. theme.ts não existe mais ---
    const themePath = "src/app/mesas/[campaignId]/_shell/theme.ts";
    registrar("5 (_shell/theme.ts removido do repositório)", !existsSync(themePath), existsSync(themePath) ? "ATENÇÃO: arquivo ainda existe" : "removido");

    // --- 10. FichaHeader.tsx sem paleta/helper de estilo copiados ---
    {
      const fonte = readFileSync("src/app/ficha/FichaHeader.tsx", "utf-8");
      const semCSSProperties = !/CSSProperties/.test(fonte);
      const semHelperBadge = !/function badge\s*\(/.test(fonte);
      const semObjetoColor = !/const color\s*=/.test(fonte);
      const semHexInline = !/#[0-9a-fA-F]{3,6}\b/.test(fonte);
      const usaClassesConsole = /className="rc-fichaheader/.test(fonte);
      registrar(
        "10 (FichaHeader.tsx sem paleta/helper copiados — só classes de console.css)",
        semCSSProperties && semHelperBadge && semObjetoColor && semHexInline && usaClassesConsole,
        `sem CSSProperties=${semCSSProperties}, sem função badge()=${semHelperBadge}, sem objeto color=${semObjetoColor}, sem hex inline=${semHexInline}, usa rc-fichaheader*=${usaClassesConsole}`,
      );
    }

    registrar("6 (console limpo)", errosConsole.length === 0, errosConsole.length ? JSON.stringify(errosConsole.slice(0, 3)) : "nenhum");
  });
}

async function limpar(): Promise<void> {
  if (characterIdCriado) {
    const { error } = await admin.from("characters").delete().eq("id", characterIdCriado);
    registrar(
      "L (limpeza — personagem criado pelo smoke test removido)",
      !error,
      error ? `FALHA — remoção manual necessária: characters ${characterIdCriado}: ${error.message}` : "removido com sucesso",
    );
  }
  // Rascunho residual do finalizar (a RPC já o exclui best-effort — ver
  // `deleteCharacterCreationDraft` em `finalizar()`), OU de uma
  // interrupção nesta própria execução (`falhou > 0` no meio do fluxo).
  // Sem isto, a PRÓXIMA execução herdaria estado desta.
  if (campaignId) {
    const resultado = await admin.from("character_creation_drafts").delete({ count: "exact" }).eq("campaign_id", campaignId);
    const qtde = resultado.count ?? 0;
    if (qtde > 0 || resultado.error) {
      registrar(
        "Lb (rascunho residual do wizard removido)",
        !resultado.error,
        resultado.error ? `FALHA: ${resultado.error.message}` : `${qtde} rascunho(s) removido(s)`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("Erro fatal no check:", err instanceof Error ? err.message : err);
    falhou++;
  })
  .finally(async () => {
    await limpar();
    console.log(`\n${passou} critérios aprovados, ${falhou} reprovados.`);
    if (falhou > 0) process.exitCode = 1;
  });
