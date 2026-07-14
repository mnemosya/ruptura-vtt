/**
 * Browser check autenticado repetível do Editor Universal de campos
 * básicos (Etapa 3) — reusa a sessão local salva por
 * `save-admin-session.ts` (`withAuthenticatedPage`, `.auth/admin-session.json`).
 * Não pede senha, não imprime cookies/tokens. Se a sessão não existir
 * ou tiver expirado, `withAuthenticatedPage`/`assertAdminSessionValid`
 * já lançam `SessaoAusenteOuExpiradaError` com a instrução de rodar
 * `npm run auth:save-session` de novo — este script não tenta nenhum
 * bypass, só propaga esse erro.
 *
 * Cria rascunhos de teste com identificadores inequívocos
 * (prefixo "zz_e2e_etapa3_") e sempre os remove ao final (inclusive em
 * caso de falha, e também limpa resíduos de uma execução anterior que
 * tenha travado no meio).
 *
 * Uso:
 *   npx tsx scripts/dev/check-admin-content-drafts.ts
 */

import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

const PREFIXO_TESTE = "zz_e2e_etapa3_";
const SLUGS_ORIGEM_PARA_LIMPAR = ["energetica_bola_de_fogo", "artifice"];

async function excluirRascunhoPorId(page: Page, id: string): Promise<void> {
  const resposta = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${id}`, { waitUntil: "domcontentloaded" });
  if (!resposta || resposta.status() === 404) return;
  const botaoExcluir = page.getByRole("button", { name: /Excluir rascunho/ });
  if ((await botaoExcluir.count()) === 0) return;
  await botaoExcluir.click();
  await page.waitForURL(`${BASE_URL}/admin/biblioteca/rascunhos`, { timeout: 5000 }).catch(() => {});
}

/** Varre a lista de rascunhos e remove qualquer resíduo de execuções anteriores (prefixo de teste ou slugs de origem usados neste check). */
async function limparResiduosDeExecucoesAnteriores(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos`, { waitUntil: "domcontentloaded" });
  const linhas = page.locator('a[href^="/admin/biblioteca/rascunhos/"]');
  const total = await linhas.count();
  const idsParaExcluir: string[] = [];

  for (let i = 0; i < total; i++) {
    const href = await linhas.nth(i).getAttribute("href");
    if (!href) continue;
    const id = href.split("/").pop();
    if (!id) continue;
    const textoLinha = (await linhas.nth(i).locator("xpath=..").textContent()) ?? "";
    if (textoLinha.includes(PREFIXO_TESTE) || SLUGS_ORIGEM_PARA_LIMPAR.some((s) => textoLinha.includes(s))) {
      idsParaExcluir.push(id);
    }
  }

  for (const id of idsParaExcluir) {
    await excluirRascunhoPorId(page, id);
  }
  if (idsParaExcluir.length > 0) console.log(`0. Limpeza prévia: ${idsParaExcluir.length} rascunho(s) residual(is) de execuções anteriores removido(s).`);
}

async function main(): Promise<void> {
  if (!sessaoSalvaExiste()) {
    requireSessaoSalva(); // lança com a instrução de rodar npm run auth:save-session
    return;
  }

  const errosDeConsole: string[] = [];
  const idsCriadosNesteRun: string[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    // ------------------------------------------------------------------
    // 1. Acesso sem login bloqueado — contexto NOVO, sem storageState.
    // ------------------------------------------------------------------
    const contextoAnonimo = await browser.newContext();
    const paginaAnonima = await contextoAnonimo.newPage();
    await paginaAnonima.goto(`${BASE_URL}/admin/biblioteca`, { waitUntil: "domcontentloaded" });
    const corpoAnonimo = await paginaAnonima.textContent("body");
    assert.ok(corpoAnonimo?.includes("Esta área exige login"), "Acesso sem login deveria ser bloqueado.");
    console.log("1. Acesso sem login bloqueado — OK");
    await contextoAnonimo.close();

    // ------------------------------------------------------------------
    // 2. Usuário autenticado sem admin — sem forma segura de testar sem
    //    criar uma segunda conta/credencial, o que este script não faz.
    // ------------------------------------------------------------------
    console.log("2. Usuário autenticado sem admin — PULADO (exigiria criar uma segunda credencial de teste; fora do escopo deste script).");

    // ------------------------------------------------------------------
    // Contexto autenticado (sessão local) para o restante dos checks.
    // ------------------------------------------------------------------
    const context = await browser.newContext({ storageState: SESSION_FILE });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") errosDeConsole.push(msg.text());
    });
    page.on("dialog", (dialog) => dialog.accept());

    await assertAdminSessionValid(page);
    console.log("Sessão de admin válida — prosseguindo com os checks autenticados.\n");

    await limparResiduosDeExecucoesAnteriores(page);

    // ------------------------------------------------------------------
    // 3+4+5. Cria rascunho de magia, edita, confirma persistência após reload.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Tipo de conteúdo").selectOption("spell");
    const nomeMagiaTeste = `${PREFIXO_TESTE}magia`;
    await page.getByLabel("Nome").fill(nomeMagiaTeste);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagia = page.url().split("/").pop()!;
    idsCriadosNesteRun.push(idMagia);
    console.log(`3. Admin cria rascunho de magia — OK (id=${idMagia})`);

    const descricaoTeste = "Descrição de teste do browser check da Etapa 3.";
    await page.getByLabel("Descrição curta").fill(descricaoTeste);
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForSelector("text=alterações não salvas", { state: "detached", timeout: 5000 }).catch(() => {});
    console.log("   Admin edita o rascunho e salva — OK");

    await page.reload({ waitUntil: "domcontentloaded" });
    const descricaoAposReload = await page.getByLabel("Descrição curta").inputValue();
    assert.equal(descricaoAposReload, descricaoTeste, "Descrição editada deveria persistir após reload.");
    console.log("4/5. Rascunho reaparece com a edição após reload — OK");

    // ------------------------------------------------------------------
    // 6+7. Criar rascunho de edição a partir de magia publicada; publicado intacto.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/energetica_bola_de_fogo`, { waitUntil: "domcontentloaded" });
    const corpoAntes = await page.textContent("body");
    assert.ok(corpoAntes?.includes("3d6"), "Magia publicada deveria mostrar o dado original (3d6) antes de qualquer edição.");

    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagiaEdicao = page.url().split("/").pop()!;
    idsCriadosNesteRun.push(idMagiaEdicao);
    const corpoRascunhoEdicao = await page.textContent("body");
    assert.ok(corpoRascunhoEdicao?.includes("condensa energia"), "Rascunho de edição deveria herdar a descrição do conteúdo publicado.");
    assert.ok(corpoRascunhoEdicao?.includes("Rascunho — não disponível no jogo"), "Preview deveria indicar status de rascunho.");
    console.log(`6. Admin cria rascunho de edição a partir de conteúdo publicado — OK (id=${idMagiaEdicao})`);

    await page.getByLabel("Descrição curta").fill("Isto NUNCA deveria aparecer no conteúdo publicado.");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);

    await page.goto(`${BASE_URL}/admin/biblioteca/spell/energetica_bola_de_fogo`, { waitUntil: "domcontentloaded" });
    const corpoDepois = await page.textContent("body");
    assert.ok(corpoDepois?.includes("condensa energia") && corpoDepois?.includes("3d6"), "Conteúdo publicado deveria continuar com o texto/dado original.");
    assert.ok(!corpoDepois?.includes("NUNCA deveria aparecer"), "Edição do rascunho não pode vazar para o conteúdo publicado.");
    console.log("7. Conteúdo publicado permanece inalterado depois de editar o rascunho — OK");

    // ------------------------------------------------------------------
    // 8+9. Duplicar item — novo slug e novo id.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/item/ansiolitico`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Duplicar", exact: true }).click();
    const novoSlugItem = `${PREFIXO_TESTE}ansiolitico`;
    await page.getByLabel(/Novo slug/).fill(novoSlugItem);
    await page.getByRole("button", { name: "Confirmar duplicação" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idItemDuplicado = page.url().split("/").pop()!;
    idsCriadosNesteRun.push(idItemDuplicado);
    assert.notEqual(idItemDuplicado, "ansiolitico", "O rascunho duplicado precisa ter um ID próprio, nunca o do original.");
    const slugCampoDuplicado = await page.getByLabel("Slug").inputValue();
    assert.equal(slugCampoDuplicado, novoSlugItem, "Rascunho duplicado deveria mostrar o novo slug no campo Slug.");
    console.log(`8/9. Item duplicado como novo rascunho com novo slug/ID — OK (slug=${novoSlugItem}, id=${idItemDuplicado})`);

    // ------------------------------------------------------------------
    // 10+11. Talento mantém os 3 níveis; campos desconhecidos/efeitos preservados.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/talent/artifice`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idTalento = page.url().split("/").pop()!;
    idsCriadosNesteRun.push(idTalento);
    const corpoTalento = await page.textContent("body");
    assert.ok(corpoTalento?.includes("Nível 1") && corpoTalento?.includes("Nível 2") && corpoTalento?.includes("Nível 3"), "Rascunho de talento deveria manter os 3 níveis.");
    assert.ok(corpoTalento?.includes("Efeitos preservados") || corpoTalento?.includes("efeitos preservados"), "Deveria haver seção de efeitos preservados.");
    console.log(`10/11. Rascunho de talento mantém os 3 níveis com efeitos/campos preservados — OK (id=${idTalento})`);

    // ------------------------------------------------------------------
    // 12. Cancelar não salva.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${idMagia}`, { waitUntil: "domcontentloaded" });
    const descricaoAntesDeCancelar = await page.getByLabel("Descrição curta").inputValue();
    await page.getByLabel("Descrição curta").fill("Edição que será descartada pelo Cancelar.");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.waitForURL(`${BASE_URL}/admin/biblioteca/rascunhos`, { timeout: 5000 });
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${idMagia}`, { waitUntil: "domcontentloaded" });
    const descricaoDepoisDeCancelar = await page.getByLabel("Descrição curta").inputValue();
    assert.equal(descricaoDepoisDeCancelar, descricaoAntesDeCancelar, "Cancelar não deveria persistir a edição não salva.");
    console.log("12. Cancelar alterações não salva — OK");

    // ------------------------------------------------------------------
    // 13. Preview mostra status de rascunho (já conferido em vários pontos acima).
    // ------------------------------------------------------------------
    const corpoFinal = await page.textContent("body");
    assert.ok(corpoFinal?.includes("Rascunho — não disponível no jogo"), 'Preview deveria mostrar "Rascunho — não disponível no jogo".');
    console.log("13. Preview mostra status de rascunho — OK");

    console.log(`\n=== TODOS OS CHECKS PASSARAM (${errosDeConsole.length} erro(s) de console coletado(s)) ===`);
    if (errosDeConsole.length > 0) {
      console.log("Erros de console encontrados:");
      errosDeConsole.forEach((e) => console.log(" -", e));
    }
    assert.equal(errosDeConsole.length, 0, "Console deveria estar sem erros.");
    console.log("14. Console sem erros — OK");

    // ------------------------------------------------------------------
    // 15. Limpeza dos dados de teste.
    // ------------------------------------------------------------------
    for (const id of idsCriadosNesteRun) {
      await excluirRascunhoPorId(page, id);
    }
    console.log(`15. Dados de teste removidos (${idsCriadosNesteRun.length} rascunho(s)) — OK`);
  } catch (err) {
    // Mesmo em falha, tenta remover o que este run criou antes de propagar o erro.
    try {
      const context = await browser.newContext({ storageState: SESSION_FILE });
      const page = await context.newPage();
      for (const id of idsCriadosNesteRun) {
        await excluirRascunhoPorId(page, id);
      }
      if (idsCriadosNesteRun.length > 0) console.log(`Limpeza de emergência: ${idsCriadosNesteRun.length} rascunho(s) removido(s) após falha.`);
    } catch {
      // best-effort — não mascara o erro original.
    }
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\ncheck-admin-content-drafts FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
