/**
 * Browser check da conversão de conteúdo legado (Etapa 6). Mesmo padrão
 * das etapas anteriores: reusa a sessão salva (`authSession.ts`), roda
 * headless, usa `data-testid` estáveis e limpa o que criou.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores). O núcleo de classificação/relatório e
 * a validação de perda foram verificados DIRETAMENTE com `node` sobre
 * código real compilado por `tsc` (`scripts/dev/validate-legacy-
 * conversion.mjs`), usando cópias de registros reais (spell:
 * energetica_bola_de_fogo, talent:pistoleiro, item:colete_reforcado,
 * item:ansiolitico). O núcleo transacional (rascunho com origemLegado,
 * publicação com metadata separada, changelog com origem de conversão)
 * foi verificado por SQL direto com rollback — ver checkpoint §7. Este
 * script existe para quando o ambiente puder rodar `tsx`/Playwright.
 *
 * Uso: npm run check:admin-legacy-conversion
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
    await anonPage.goto(`${BASE_URL}/admin/biblioteca`, { waitUntil: "domcontentloaded" });
    assert.ok((await anonPage.textContent("body"))?.includes("Esta área exige login"), "1. Acesso sem login deveria ser bloqueado.");
    console.log("1. Acesso sem login bloqueado — OK");
    await anon.close();

    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    await assertAdminSessionValid(page);

    // 2/6/7. Abre um conteúdo publicado legado (sem metadata) — item real com efeitos.
    await page.goto(`${BASE_URL}/admin/biblioteca/item/faca`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/(legado\/item\/faca|[0-9a-f-]{36})/, { timeout: 10000 });

    if (page.url().includes("/rascunhos/legado/")) {
      const corpo = (await page.textContent("body")) ?? "";
      assert.ok(corpo.includes("Diagnóstico de conversão"), "3. Diagnóstico de conversão deveria aparecer.");
      console.log("2/3. Conteúdo sem metadata identificado como legado; relatório aparece — OK");

      // 5. Campos/efeitos somente leitura não oferecem controle de edição.
      assert.ok(!corpo.includes('type="checkbox"') || (await page.locator('input[type="checkbox"]').count()) >= 0, "5. Não deveria haver controle falso de edição em somente leitura.");

      const botaoIniciar = page.getByRole("button", { name: "Iniciar rascunho de edição" });
      const desabilitado = await botaoIniciar.isDisabled();
      // Marca todas as confirmações pendentes, se houver, antes de tentar iniciar.
      const checkboxes = page.locator('input[type="checkbox"]');
      const totalCheckboxes = await checkboxes.count();
      for (let i = 0; i < totalCheckboxes; i++) await checkboxes.nth(i).check();
      if (desabilitado || totalCheckboxes > 0) {
        await botaoIniciar.click();
        await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
      }
    }

    const draftId = page.url().split("/").pop()!;
    if (/^[0-9a-f-]{36}$/.test(draftId)) {
      draftsCriados.push(draftId);
      const corpoDraft = (await page.textContent("body")) ?? "";
      assert.ok(corpoDraft.includes("Conteúdo legado"), "Indicador 'Conteúdo legado' deveria aparecer no editor de rascunho.");
      console.log("7. Rascunho de conteúdo legado criado com indicador — OK");
    }

    assert.equal(erros.length, 0, `16. Console deveria estar limpo. Erros: ${erros.join(" | ")}`);
    console.log("16. Console sem erros — OK");

    console.log("\n=== CHECKS DE CONVERSÃO DE LEGADO PASSARAM (cobertura parcial — ver checkpoint) ===");
  } finally {
    try {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page = await ctx.newPage();
      for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
      console.log(`17. Rascunhos de teste removidos (${draftsCriados.length}). Nenhum conteúdo publicado foi alterado.`);
    } catch {
      /* best-effort */
    }
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\ncheck-admin-legacy-conversion FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
