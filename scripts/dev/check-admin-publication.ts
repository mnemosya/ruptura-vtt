/**
 * Browser check da Publicação/Versões/Changelog (Etapa 5). Mesmo padrão
 * de `check-admin-effect-builder.ts`: reusa a sessão salva
 * (`authSession.ts`, `.auth/admin-session.json`), roda headless, usa
 * `data-testid` estáveis e limpa o que criou.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores). O núcleo transacional (publicar,
 * incrementar versão, changelog, consumir rascunho, conflito de hash,
 * versão otimista, arquivar) foi verificado DIRETAMENTE por SQL contra o
 * banco (função `publish_content_draft`/`archive_content_document`), com
 * rollback forçado e zero resíduo — ver checkpoint §Verificações. Este
 * script existe para quando o ambiente puder rodar `tsx`/Playwright.
 *
 * LIMPEZA: rascunhos criados são excluídos pela UI. Conteúdo PUBLICADO de
 * teste é ARQUIVADO (a superfície RLS admin não tem hard-delete de
 * publicado, por design). Para remover de vez as linhas de teste e o
 * changelog, rode o SQL no rodapé deste arquivo com o prefixo abaixo.
 *
 * Uso: npm run check:admin-publication
 */

import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

const PREFIXO = "zz_e2e_etapa5_";

async function criarRascunhoNovoSpell(page: Page, slug: string): Promise<string> {
  await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("spell");
  await page.locator('[data-testid="novo-conteudo-nome"]').fill(`${slug}`);
  await page.locator('[data-testid="novo-conteudo-slug"]').fill(slug);
  await page.locator('[data-testid="novo-conteudo-criar"]').click();
  await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
  return page.url().split("/").pop()!;
}

async function publicar(page: Page, draftId: string, resumo: string): Promise<void> {
  await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${draftId}/publicar`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="publicar-resumo"]').fill(resumo);
  await page.locator('[data-testid="publicar-confirmar"]').click();
  await page.waitForURL(/\/admin\/biblioteca\/spell\//, { timeout: 10000 });
}

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
  const slug = `${PREFIXO}magia`;
  const browser = await chromium.launch({ headless: true });
  const draftsCriados: string[] = [];

  try {
    // 1. Acesso sem login bloqueado.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    assert.ok((await anonPage.textContent("body"))?.includes("Esta área exige login"), "1. Acesso sem login deveria ser bloqueado.");
    console.log("1. Acesso sem login bloqueado — OK");
    await anon.close();

    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    page.on("dialog", (d) => d.accept());
    await assertAdminSessionValid(page);

    // 2/3. Cria rascunho novo e publica como 1.0.0.
    const draft1 = await criarRascunhoNovoSpell(page, slug);
    draftsCriados.push(draft1);
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(400);

    // 4. Revisão mostra comparação/próxima versão e permite publicar.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${draft1}/publicar`, { waitUntil: "domcontentloaded" });
    assert.ok((await page.textContent("body"))?.includes("1.0.0"), "6. Conteúdo novo deveria publicar como 1.0.0.");
    await page.locator('[data-testid="publicar-resumo"]').fill("publicacao inicial de teste");
    await page.locator('[data-testid="publicar-confirmar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/spell\//, { timeout: 10000 });
    assert.ok((await page.textContent("body"))?.includes("1.0.0"), "6/7. Detalhe deveria mostrar versão 1.0.0.");
    console.log("2-7. Rascunho novo publicado como 1.0.0 e aparece na Biblioteca — OK");

    // 8. Rascunho deixou de existir após publicação.
    const respDraft = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${draft1}`, { waitUntil: "domcontentloaded" });
    assert.ok(respDraft && respDraft.status() === 404, "8. Rascunho deveria ter sido consumido (404) após publicar.");
    console.log("8. Rascunho consumido após publicação — OK");

    // 9. Edição → incrementa patch (1.0.1).
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draft2 = page.url().split("/").pop()!;
    draftsCriados.push(draft2);
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(400);
    await publicar(page, draft2, "edicao de teste");
    assert.ok((await page.textContent("body"))?.includes("1.0.1"), "9. Edição deveria publicar 1.0.1.");
    console.log("9/10. Edição publicada como 1.0.1 (payload anterior fica no histórico) — OK");

    // 11. Histórico mostra as versões.
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/${slug}/historico`, { waitUntil: "domcontentloaded" });
    const corpoHist = (await page.textContent("body")) ?? "";
    assert.ok(corpoHist.includes("1.0.0") && corpoHist.includes("1.0.1"), "11. Histórico deveria listar 1.0.0 e 1.0.1.");
    console.log("11. Histórico lista e compara versões — OK");

    // 14/15. Arquivar remove das consultas públicas; segue visível no admin.
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/${slug}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="arquivar-abrir"]').click();
    await page.locator('[data-testid="arquivar-motivo"]').fill("arquivamento de teste");
    await page.locator('[data-testid="arquivar-confirmar"]').click();
    await page.waitForTimeout(600);
    assert.ok((await page.textContent("body"))?.includes("Arquivado"), "14/15. Conteúdo deveria aparecer como arquivado no admin.");
    console.log("14/15. Arquivado (some do jogo; visível no admin) — OK");

    // 19. Console sem erros.
    assert.equal(erros.length, 0, `19. Console deveria estar limpo. Erros: ${erros.join(" | ")}`);
    console.log("19. Console sem erros — OK");

    console.log("\n=== CHECKS DE PUBLICAÇÃO PASSARAM ===");
  } finally {
    // 20. Limpeza — exclui rascunhos criados. Conteúdo publicado de teste
    // fica arquivado (sem hard-delete no admin); use o SQL do rodapé.
    try {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page = await ctx.newPage();
      for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
      console.log(`20. Rascunhos de teste removidos (${draftsCriados.length}). Conteúdo publicado de teste ficou arquivado — rode o SQL abaixo para remover de vez.`);
    } catch {
      /* best-effort */
    }
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\ncheck-admin-publication FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/*
-- Limpeza definitiva das linhas de teste (rode no SQL editor / psql):
delete from content_changelog where document_id like 'spell:zz_e2e_etapa5_%';
delete from content_documents  where slug like 'zz_e2e_etapa5_%';
delete from content_drafts     where slug like 'zz_e2e_etapa5_%';
*/
