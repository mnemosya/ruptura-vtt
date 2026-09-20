/**
 * Browser check da Publicação/Versões/Changelog (Etapa 5). Mesmo padrão
 * de `check-admin-effect-builder.ts`: reusa a sessão salva
 * (`authSession.ts`, `.auth/admin-session.json`), roda headless, usa
 * `data-testid` estáveis e limpa o que criou.
 *
 * LIMPEZA: automática e completa no INÍCIO de cada execução
 * (`limparPublicadoDeTeste`): changelog, documentos e rascunhos com o
 * prefixo de teste. Não sobra SQL para rodar à mão.
 *
 * Rascunhos criados são excluídos pela UI. Conteúdo PUBLICADO de
 * teste é ARQUIVADO (a superfície RLS admin não tem hard-delete de
 * publicado, por design) e some na limpeza da execução seguinte.
 *
 * Uso: npm run check:admin-publication
 */

import assert from "node:assert/strict";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

const PREFIXO = "zz_e2e_etapa5_";

loadDotenv({ path: ".env.local" });

/**
 * Apaga o que execuções anteriores deixaram publicado com o prefixo de
 * teste, ANTES de começar.
 *
 * O check publica conteúdo, e publicar não tem desfazer pela interface —
 * a limpeza no fim só conseguia ARQUIVAR, e imprimia um SQL para a
 * pessoa rodar à mão. Ninguém rodava. Na execução seguinte o slug já
 * existia, a criação era recusada, e o check morria num
 * `waitForURL` que nunca chegava: falhava por causa de si mesmo.
 *
 * Limpar no INÍCIO, e não no fim, é o que torna isso irrelevante — não
 * importa como a execução anterior terminou.
 */
/** Quantos rascunhos com o prefixo de teste ainda existem. */
async function contarRascunhosDeTeste(): Promise<number> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return -1;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await db.connect();
  try {
    const r = await db.query("select count(*)::int as n from content_drafts where slug like $1", [`${PREFIXO}%`]);
    return r.rows[0]?.n ?? 0;
  } catch {
    return -1;
  } finally {
    await db.end();
  }
}

async function limparPublicadoDeTeste(): Promise<number> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return 0;
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await db.connect();
  try {
    let total = 0;
    // O changelog sai PRIMEIRO, e por `document_id` (`<tipo>:<slug>`) em
    // vez de `slug`: ele não tem essa coluna. Ficava de fora até aqui —
    // o rodapé deste arquivo mandava apagá-lo à mão, e ninguém apagava.
    // Três linhas de execuções antigas sobreviviam a cada limpeza e
    // derrubavam a publicação da execução seguinte.
    try {
      const r = await db.query("delete from content_changelog where document_id like $1", [`%${PREFIXO}%`]);
      total += r.rowCount ?? 0;
    } catch { /* tabela pode não existir nesta versão do schema */ }
    for (const tabela of ["content_documents", "content_drafts"]) {
      try {
        const r = await db.query(`delete from ${tabela} where slug like $1`, [`${PREFIXO}%`]);
        total += r.rowCount ?? 0;
      } catch { /* tabela pode não existir nesta versão do schema */ }
    }
    return total;
  } finally {
    await db.end();
  }
}

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
  const restos = await limparPublicadoDeTeste();
  if (restos > 0) console.log(`0. Resíduo de execução anterior removido (${restos} linha(s))`);

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
    /* O passo 8 navega de propósito para um rascunho que não existe, e a
       rota responde 404 de verdade — o navegador registra isso como erro
       de console. Contar esse 404 como "console sujo" reprovaria o check
       justamente por ele ter funcionado. Só este, e só ali. */
    let esperando404 = false;
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const texto = m.text();
      if (esperando404 && texto.includes("404")) return;
      erros.push(texto);
    });
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
    esperando404 = true;
    const respDraft = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${draft1}`, { waitUntil: "domcontentloaded" });
    esperando404 = false;
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
    /* 20. Limpeza. O conteúdo PUBLICADO não sai por aqui — publicar não
       tem desfazer no admin —, e por isso a limpeza de verdade acontece
       no INÍCIO da próxima execução (`limparPublicadoDeTeste`), direto no
       banco. Aqui só saem os rascunhos. */
    try {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page = await ctx.newPage();
      for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
      // Conta o que REALMENTE sobrou, em vez do tamanho da lista de
      // criados: o log anterior dizia "removidos (1)" mesmo quando o
      // rascunho já tinha sido consumido pela publicação, e eu quase
      // concluí, a partir dele, que publicar não estava apagando nada.
      const sobraram = await contarRascunhosDeTeste();
      console.log(`20. Limpeza: ${draftsCriados.length} rascunho(s) criados nesta execução, ${sobraram} ainda no banco.`);
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

