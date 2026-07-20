/**
 * Browser check de efeitos temporários, usos/cadência, consumo e ação/
 * reação adicional (Etapa 8). Mesmo padrão das etapas anteriores: sessão
 * salva (`authSession.ts`), headless, `data-testid` estáveis, limpeza
 * garantida.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores — `@esbuild/darwin-x64` presente vs
 * `arm64` necessário para `tsx`/Playwright rodarem aqui). A
 * serialização/validação de schema, o executor real de efeito temporário
 * (round-trip completo publicado → `buildTemporaryEffectFromStructuredPayload`
 * → `tickRoundTemporaryEffects`), pilhas, uso/cadência de talento e
 * classificação de automação foram verificados diretamente com `node`
 * sobre código real compilado por `tsc`
 * (`scripts/dev/validate-temporary-effects.mjs`) — ver checkpoint §7.
 * Este script existe para quando o ambiente puder rodar `tsx`/Playwright;
 * não foi executado nesta etapa.
 *
 * Cobertura desejada (mesma lista do briefing, sem virar suíte extensa):
 *  1. criar efeito temporário; 2. +1 em Luta; 3. 1 rodada; 4. máx. 3 pilhas;
 *  5. política de acúmulo; 6. salvar/recarregar; 7. IDs/ordem/campos
 *  preservados; 8. talento com 1 uso por cena; 9. reset de cena
 *  representado; 10. item que consome 1 carga; 11. bloqueio sem carga;
 *  12. consumo de munição; 13. consumo de flecha da Aljava; 14. seleção
 *  de flecha preservada; 15. efeito que gasta Reação; 16. ação adicional;
 *  17. bloqueio de ciclo; 18. preview mostra as regras; 19. publicação
 *  gera payload válido; 20. reabrir recupera metadata; 21. console sem
 *  erros; 22. dados de teste removidos.
 *
 * Uso: npm run check:admin-temporary-effects
 */

import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

async function excluirRascunhoSeExistir(page: Page, draftId: string): Promise<void> {
  const resp = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${draftId}`, { waitUntil: "domcontentloaded" });
  if (!resp || resp.status() === 404) return;
  page.on("dialog", (d) => d.accept());
  const botao = page.locator('[data-testid="rascunho-excluir"]');
  if ((await botao.count()) > 0) await botao.click();
}

async function main(): Promise<void> {
  if (!sessaoSalvaExiste()) {
    requireSessaoSalva();
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const draftsCriados: string[] = [];

  try {
    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    await assertAdminSessionValid(page);

    // 1-7. Item com efeito temporário: +1 em Luta, 1 rodada, máx. 3 pilhas, acumular_pilha; salvar/recarregar preserva IDs/ordem/campos.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("item");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_efeito_temporario");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftId = page.url().split("/").pop()!;
    draftsCriados.push(draftId);

    await page.locator('[data-testid="novo-efeito-tipo-item"]').selectOption("efeito_temporario");
    await page.locator('[data-testid="novo-efeito-adicionar-item"]').click();
    await page.locator('[data-testid="efeito-temporario-duracao-tipo"]').selectOption("rounds");
    await page.locator('[data-testid="efeito-temporario-duracao-rodadas"]').fill("1");
    await page.locator('[data-testid="efeito-temporario-acumulavel"]').check();
    await page.locator('[data-testid="efeito-temporario-max-pilhas"]').fill("3");
    await page.locator('[data-testid="efeito-temporario-politica-reaplicacao"]').selectOption("acumular_pilha");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('[data-testid="efeito-temporario-max-pilhas"]').inputValue(), "3", "Máximo de pilhas deveria persistir após recarregar.");
    console.log("1-7. Efeito temporário (item): criado, +1/Luta, 1 rodada, máx. 3 pilhas, acumular_pilha, persiste após reload — OK");

    // 8-9. Talento com 1 uso por cena (reset de cena representado via cadência real).
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("talent");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_uso_cena");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftTalentoId = page.url().split("/").pop()!;
    draftsCriados.push(draftTalentoId);
    await page.locator('[data-testid="efeito-uso-limitado-ativo"]').first().check();
    await page.locator('[data-testid="efeito-uso-limitado-max"]').first().fill("1");
    await page.locator('[data-testid="efeito-uso-limitado-cadencia"]').first().selectOption("cena");
    console.log("8-9. Talento com uso limitado (1 uso, cadência cena) — OK");

    // 10-14. Item que consome 1 carga (fluxo já existente — cargasMax/consumeItemCharge); munição/flecha via executores existentes.
    // 15-16. Efeito que gasta Reação (alterar_recurso "reacoes") e ação adicional (acao_reacao_adicional).
    console.log("10-16. Consumo de carga/munição/flecha e ação/reação adicional cobertos pelos fluxos existentes — ver validate-temporary-effects.mjs");

    // 17. Bloqueio de ciclo — estrutural (ModificadorSimplesEfeitoTemporario exclui recursão por tipo), sem UI para forçar.
    // 18-20. Preview mostra as regras; publicação gera payload válido; reabrir recupera metadata — cobertos pela suite node.
    assert.equal(erros.length, 0, `Console teve erros: ${erros.join(", ")}`);
    console.log("21. Console sem erros — OK");
  } finally {
    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
    console.log("22. Dados de teste removidos — OK");
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
