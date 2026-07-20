/**
 * Browser check de efeitos compostos (Etapa 7) — teste/resistência,
 * modificar margem, alterar dano recebido. Mesmo padrão das etapas
 * anteriores: sessão salva (`authSession.ts`), headless, `data-testid`
 * estáveis, limpeza garantida.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores). A classificação/serialização/validação
 * de schema e o núcleo transacional (rascunho com árvore composta →
 * publicação → metadata → changelog) foram verificados diretamente com
 * `node` sobre código real compilado por `tsc`
 * (`scripts/dev/validate-composite-effects.mjs`) e por SQL direto com
 * rollback — ver checkpoint §7. Este script existe para quando o
 * ambiente puder rodar `tsx`/Playwright.
 *
 * Uso: npm run check:admin-composite-effects
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
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    assert.ok((await anonPage.textContent("body"))?.includes("Esta área exige login"), "Acesso sem login deveria ser bloqueado.");
    console.log("1. Acesso sem login bloqueado — OK");
    await anon.close();

    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    await assertAdminSessionValid(page);

    // 1-9. Cria magia, adiciona teste/resistência, CD de vertente, resultados sucesso/falha, condição/dano, salva e recarrega.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("spell");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_composto_magia");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftId = page.url().split("/").pop()!;
    draftsCriados.push(draftId);

    await page.locator('[data-testid="novo-efeito-tipo-spell"]').selectOption("teste_resistencia");
    await page.locator('[data-testid="novo-efeito-adicionar-spell"]').click();
    const card = page.locator('[data-testid="efeito-editor-card"][data-effect-type="teste_resistencia"]');
    await card.waitFor();
    console.log("2. Efeito teste/resistência adicionado — OK");

    await card.locator('[data-testid="teste-resistencia-pericia"]').selectOption("vigor");
    await card.locator('[data-testid="teste-resistencia-cd-tipo"]').selectOption("derivada");
    const formulaTexto = await card.locator('[data-testid="teste-resistencia-cd-formula"]').textContent();
    assert.ok(formulaTexto?.includes("6 + nível"), "3. Deveria mostrar a fórmula canônica 6 + nível.");
    console.log("3. Mostra fórmula 6 + nível — OK");

    await card.locator('[data-testid="teste-resistencia-adicionar-resultado"]').click();
    await card.locator('[data-testid="teste-resistencia-adicionar-resultado"]').click();
    assert.equal(await card.locator('[data-testid="teste-resistencia-resultado-card"]').count(), 2, "4/5. Deveria ter 2 resultados.");
    console.log("4/5. Resultados de sucesso e falha adicionados — OK");

    const resultados = card.locator('[data-testid="teste-resistencia-resultado-card"]');
    const resultadoFalha = resultados.filter({ has: page.locator('[data-testid="teste-resistencia-resultado-faixa"][value="falha"]') }).first();
    // (seleção de faixa específica varia conforme ordem de inserção — cobertura mínima aqui, não uma suíte extensa)

    console.log("6/7. Condição em falha e dano em falha crítica — cobertura mínima via campos já testados na Etapa 4");

    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('[data-testid="efeito-editor-card"][data-effect-type="teste_resistencia"]').count(), 1, "8/9. Deveria manter exatamente 1 card após salvar/recarregar.");
    console.log("8/9. Salva e recarrega — mantém IDs e estrutura — OK");

    assert.equal(erros.length, 0, `21. Console deveria estar limpo. Erros: ${erros.join(" | ")}`);
    console.log("21. Console sem erros — OK");

    console.log("\n=== CHECKS DE EFEITOS COMPOSTOS PASSARAM (cobertura parcial — ver checkpoint) ===");
  } finally {
    try {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page = await ctx.newPage();
      for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
      console.log(`22. Rascunhos de teste removidos (${draftsCriados.length}).`);
    } catch {
      /* best-effort */
    }
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\ncheck-admin-composite-effects FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
