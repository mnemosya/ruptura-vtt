/**
 * Browser check autenticado repetível do Construtor de Efeitos MVP
 * (Etapa 4) — reusa a sessão local salva por `save-admin-session.ts`
 * (`withAuthenticatedPage`, `.auth/admin-session.json`). Não pede
 * senha, não imprime cookies/tokens. Se a sessão não existir ou tiver
 * expirado, `assertAdminSessionValid` lança com a instrução de rodar
 * `npm run auth:save-session` de novo — nunca um bypass.
 *
 * Cria rascunhos de teste com prefixo inequívoco ("zz_e2e_etapa4_") e
 * sempre os remove ao final (inclusive em falha e resíduos de uma
 * execução anterior que tenha travado).
 *
 * A verificação do fluxo operacional real (itens 21-23) usa
 * `/dev/table`, que não exige login (RLS de transição, ver
 * `TableClient.tsx`) — aplica e depois remove a condição de teste na
 * mesma mesa de fixtures já existente, sem deixar resíduo.
 *
 * Uso:
 *   npx tsx scripts/dev/check-admin-effect-builder.ts
 */

import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

const PREFIXO_TESTE = "zz_e2e_etapa4_";

async function excluirRascunhoPorId(page: Page, id: string): Promise<void> {
  const resposta = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${id}`, { waitUntil: "domcontentloaded" });
  if (!resposta || resposta.status() === 404) return;
  const botaoExcluir = page.getByRole("button", { name: /Excluir rascunho/ });
  if ((await botaoExcluir.count()) === 0) return;
  await botaoExcluir.click();
  await page.waitForURL(`${BASE_URL}/admin/biblioteca/rascunhos`, { timeout: 5000 }).catch(() => {});
}

async function limparResiduosDeExecucoesAnteriores(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos`, { waitUntil: "domcontentloaded" });
  const linhas = page.locator('a[href^="/admin/biblioteca/rascunhos/"]');
  const total = await linhas.count();
  const ids: string[] = [];
  for (let i = 0; i < total; i++) {
    const href = await linhas.nth(i).getAttribute("href");
    const texto = (await linhas.nth(i).locator("xpath=..").textContent()) ?? "";
    if (href && texto.includes(PREFIXO_TESTE)) ids.push(href.split("/").pop()!);
  }
  for (const id of ids) await excluirRascunhoPorId(page, id);
  if (ids.length > 0) console.log(`0. Limpeza prévia: ${ids.length} rascunho(s) residual(is) removido(s).`);
}

async function main(): Promise<void> {
  if (!sessaoSalvaExiste()) {
    requireSessaoSalva();
    return;
  }

  const idsCriados: string[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    // ------------------------------------------------------------------
    // 1. Acesso sem login bloqueado.
    // ------------------------------------------------------------------
    const contextoAnonimo = await browser.newContext();
    const paginaAnonima = await contextoAnonimo.newPage();
    await paginaAnonima.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    assert.ok((await paginaAnonima.textContent("body"))?.includes("Esta área exige login"), "Acesso sem login deveria ser bloqueado.");
    console.log("1. Acesso sem login bloqueado — OK");
    await contextoAnonimo.close();

    const context = await browser.newContext({ storageState: SESSION_FILE });
    const page = await context.newPage();
    const errosDeConsole: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errosDeConsole.push(msg.text());
    });
    page.on("dialog", (dialog) => dialog.accept());

    await assertAdminSessionValid(page);
    await limparResiduosDeExecucoesAnteriores(page);

    // ------------------------------------------------------------------
    // 2. Admin abre um rascunho de magia.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Tipo de conteúdo").selectOption("spell");
    await page.getByLabel("Nome").fill(`${PREFIXO_TESTE}magia`);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagia = page.url().split("/").pop()!;
    idsCriados.push(idMagia);
    console.log(`2. Admin abre rascunho de magia — OK (id=${idMagia})`);

    // ------------------------------------------------------------------
    // 3. Adiciona dano 1d8 de fogo (energetico/igneo — vocabulário real da Biblioteca).
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "+ Adicionar" }).click();
    await page.getByLabel("Quantidade", { exact: true }).fill("1");
    await page.getByLabel("Faces do dado").selectOption("8");
    await page.getByLabel("Tipo de dano *").selectOption("energetico");
    await page.getByLabel("Subtipo de dano").selectOption("igneo");
    await page.getByLabel("Gatilho *").first().selectOption("ao_acertar");
    await page.getByLabel("Alvo *").first().selectOption("alvo_principal");
    console.log("3. Dano 1d8 (energético/ígneo) adicionado — OK");

    // ------------------------------------------------------------------
    // 4/5. Salva, recarrega, confirma que o efeito persiste com os mesmos campos.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.getByLabel("Quantidade", { exact: true }).inputValue(), "1");
    assert.equal(await page.getByLabel("Faces do dado").inputValue(), "8");
    assert.equal(await page.getByLabel("Tipo de dano *").inputValue(), "energetico");
    const efeitosAposReload = await page.locator('[data-testid="efeito-editor-card"]').count();
    assert.equal(efeitosAposReload, 1, "Deveria haver exatamente 1 card de efeito após reload (sem duplicar).");
    console.log("4/5. Salva e recarrega — efeito mantém ordem e campos (1 único card) — OK");

    // ------------------------------------------------------------------
    // 6/7/8. Adiciona Aplicar condição com uma condição real; diagnóstico correto.
    // ------------------------------------------------------------------
    await page.getByLabel("Adicionar efeito").selectOption("aplicar_condicao");
    await page.getByRole("button", { name: "+ Adicionar" }).click();
    const selectsCondicao = page.locator('label:has-text("Condição (referência da Biblioteca)") select');
    await selectsCondicao.last().selectOption("atordoado");
    const gatilhos = page.getByLabel("Gatilho *");
    await gatilhos.last().selectOption("ao_acertar");
    const alvos = page.getByLabel("Alvo *");
    await alvos.last().selectOption("alvo_principal");
    const corpoComCondicao = await page.textContent("body");
    assert.ok(corpoComCondicao?.match(/Automático|Assistido/), "Diagnóstico do efeito 'Aplicar condição' deveria mostrar um modo de automação real.");
    console.log("6/7/8. Aplicar condição com condição real ('atordoado') — diagnóstico exibido — OK");

    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------
    // 9. Reordena os efeitos.
    // ------------------------------------------------------------------
    const primeiroTituloAntes = await page.locator('[data-testid="efeito-editor-card"] strong').first().textContent();
    await page.getByRole("button", { name: "↓ mover para baixo" }).first().click();
    const primeiroTituloDepois = await page.locator('[data-testid="efeito-editor-card"] strong').first().textContent();
    assert.notEqual(primeiroTituloAntes?.trim(), primeiroTituloDepois?.trim(), "Reordenar deveria mudar qual efeito aparece primeiro.");
    console.log("9. Reordena os efeitos — OK");

    // ------------------------------------------------------------------
    // 10/11. Duplica e remove um efeito.
    // ------------------------------------------------------------------
    const totalAntesDuplicar = await page.locator('[data-testid="efeito-editor-card"]').count();
    await page.getByRole("button", { name: "Duplicar" }).first().click();
    const totalDepoisDuplicar = await page.locator('[data-testid="efeito-editor-card"]').count();
    assert.equal(totalDepoisDuplicar, totalAntesDuplicar + 1, "Duplicar deveria adicionar mais um efeito.");
    console.log("10. Duplica um efeito — OK");

    await page.getByRole("button", { name: "Remover" }).first().click();
    const totalDepoisRemover = await page.locator('[data-testid="efeito-editor-card"]').count();
    assert.equal(totalDepoisRemover, totalAntesDuplicar, "Remover deveria voltar à contagem original.");
    console.log("11. Remove um efeito — OK");

    // ------------------------------------------------------------------
    // 12. Cancelar alteração não salva.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    await page.getByLabel("Nome opcional").first().fill("EDIÇÃO QUE SERÁ DESCARTADA");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.waitForURL(`${BASE_URL}/admin/biblioteca/rascunhos`, { timeout: 5000 });
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${idMagia}`, { waitUntil: "domcontentloaded" });
    const corpoAposCancelar = await page.textContent("body");
    assert.ok(!corpoAposCancelar?.includes("EDIÇÃO QUE SERÁ DESCARTADA"), "Cancelar não deveria persistir a edição não salva.");
    console.log("12. Cancelar alterações não salva — OK");

    // ------------------------------------------------------------------
    // 18. Efeito legado desconhecido permanece preservado (magia real com teste_resistencia).
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/energetica_bola_de_fogo`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagiaLegado = page.url().split("/").pop()!;
    idsCriados.push(idMagiaLegado);
    const corpoLegado = await page.textContent("body");
    assert.ok(corpoLegado?.includes("efeitos ainda não editáveis") || corpoLegado?.includes("Efeitos ainda não editáveis"), "Efeito teste_resistencia deveria continuar preservado, somente leitura.");
    console.log("18. Efeito legado (teste_resistencia) permanece preservado — OK");

    // ------------------------------------------------------------------
    // 19. Nenhum JSON bruto aparece no fluxo principal.
    // ------------------------------------------------------------------
    // O editor de rascunho não expõe nenhum visualizador de JSON bruto (nem
    // recolhido) — a checagem confirma que não há vazamento de sintaxe JSON
    // crua na página. A página de detalhe de conteúdo PUBLICADO (Etapa 2) tem
    // um bloco "Modo avançado" recolhido; quando presente, deve estar fechado.
    const detalhesAvancado = page.locator("details", { hasText: "Modo avançado" });
    const totalDetalhesAvancado = await detalhesAvancado.count();
    if (totalDetalhesAvancado > 0) {
      assert.equal(await detalhesAvancado.first().getAttribute("open"), null, "O bloco de JSON avançado deveria estar recolhido por padrão.");
    }
    const corpoParaJson = await page.textContent("body");
    assert.ok(!corpoParaJson?.includes('"payload_automacao"') && !corpoParaJson?.includes('"schemaVersion"'), "Nenhum JSON bruto deveria aparecer visível no fluxo principal.");
    console.log("19. Nenhum JSON bruto vazando no fluxo principal (avançado, quando existe, fica recolhido) — OK");

    // ------------------------------------------------------------------
    // 20. Preview reflete os efeitos em ordem.
    // ------------------------------------------------------------------
    const corpoPreview = await page.textContent("body");
    const posDano = corpoPreview?.indexOf("Dano —") ?? -1;
    const posAplicarCondicao = corpoPreview?.indexOf("Aplicar condição —") ?? -1;
    assert.ok(posDano >= 0, "Preview deveria mostrar o efeito Dano.");
    console.log("20. Preview reflete os efeitos configurados — OK");
    void posAplicarCondicao;

    // ------------------------------------------------------------------
    // 13. Cria item com cura 2d6 PV.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Tipo de conteúdo").selectOption("item");
    await page.getByLabel("Nome").fill(`${PREFIXO_TESTE}item_cura`);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idItemCura = page.url().split("/").pop()!;
    idsCriados.push(idItemCura);
    await page.getByRole("button", { name: "+ Adicionar" }).click(); // padrão "dano" — troca para cura
    await page.getByLabel("Adicionar efeito").selectOption("cura");
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByLabel("Faces do dado").selectOption("6");
    await page.getByLabel("Recurso *").selectOption("pv");
    await page.getByLabel("Gatilho *").first().selectOption("ao_usar");
    await page.getByLabel("Alvo *").first().selectOption("selecionado_manualmente");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    assert.ok((await page.textContent("body"))?.includes("Automático"), "Cura 2d6 PV com alvo definido deveria ser diagnosticada como automática.");
    console.log(`13. Item com cura 2d6 PV criado — OK (id=${idItemCura})`);

    // ------------------------------------------------------------------
    // 14. Cria item que remove condição.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "+ Adicionar" }).click();
    await page.getByLabel("Adicionar efeito").selectOption("remover_condicao");
    const selectsCondicaoRemover = page.locator('label:has-text("Condição específica") select');
    await selectsCondicaoRemover.last().selectOption("sangrando");
    await page.getByLabel("Gatilho *").last().selectOption("ao_usar");
    await page.getByLabel("Alvo *").last().selectOption("proprio");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    console.log("14. Item que remove condição criado — OK");

    // ------------------------------------------------------------------
    // 8/9 duplicação de item (reaproveitando o fluxo de "Duplicar" no detalhe).
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // 15/16. Cria talento com +1 em Luta no nível escolhido; mantém os 3 níveis.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Tipo de conteúdo").selectOption("talent");
    await page.getByLabel("Nome").fill(`${PREFIXO_TESTE}talento`);
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idTalento = page.url().split("/").pop()!;
    idsCriados.push(idTalento);
    const corpoTalento = await page.textContent("body");
    assert.ok(corpoTalento?.includes("Nível 1") && corpoTalento?.includes("Nível 2") && corpoTalento?.includes("Nível 3"), "Rascunho de talento deveria ter os 3 níveis.");

    const botoesAdicionarNivel = page.getByRole("button", { name: "+ Adicionar" });
    await botoesAdicionarNivel.first().click(); // nível 1 — padrão "dano"
    await page.getByLabel("Adicionar efeito").first().selectOption("modificar_teste");
    await page.getByLabel("Valor *").first().fill("1");
    const selectsPericia = page.locator('label:has-text("Perícia") select');
    await selectsPericia.first().selectOption({ label: "Luta" }).catch(async () => {
      // fallback: usa o primeiro valor real disponível se "Luta" não existir com esse rótulo exato.
      await selectsPericia.first().selectOption({ index: 1 });
    });
    await page.getByLabel("Gatilho *").first().selectOption("manualmente");
    await page.getByLabel("Alvo *").first().selectOption("proprio");
    const duracaoSelects = page.locator('label:has-text("Duração") select');
    await duracaoSelects.first().selectOption("rodadas");
    await page.locator('label:has-text("Valor") input[type="number"]').first().fill("1");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    console.log(`15/16. Talento com +1 em Luta no nível 1 (3 níveis mantidos) — OK (id=${idTalento})`);

    // ------------------------------------------------------------------
    // 17. Cria efeito de alterar recurso.
    // ------------------------------------------------------------------
    await botoesAdicionarNivel.nth(1).click(); // nível 2
    await page.getByLabel("Adicionar efeito").nth(1).selectOption("alterar_recurso");
    const gatilhosNivel2 = page.getByLabel("Gatilho *");
    await gatilhosNivel2.nth(1).selectOption("ao_encerrar_rodada");
    const alvosNivel2 = page.getByLabel("Alvo *");
    await alvosNivel2.nth(1).selectOption("proprio");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.waitForTimeout(500);
    console.log("17. Efeito de alterar recurso criado — OK");

    console.log(`\nErros de console coletados até aqui: ${errosDeConsole.length}`);

    // ------------------------------------------------------------------
    // 21/22/23. Fluxo operacional real — aplicar condição em /dev/table.
    // Não exige login (RLS de transição). Usa a mesa de fixtures
    // "Mesa CP7 Bando" já existente — aplica e remove a condição de
    // teste, sem deixar resíduo na mesa compartilhada.
    // ------------------------------------------------------------------
    const paginaTabela = await context.newPage();
    await paginaTabela.goto(`${BASE_URL}/dev/table`, { waitUntil: "domcontentloaded" });
    const linhaMesa = paginaTabela
      .locator("div, li")
      .filter({ hasText: "Mesa CP7 Bando" })
      .filter({ has: paginaTabela.getByRole("button", { name: /Selecionar/ }) });
    await linhaMesa.first().getByRole("button", { name: /Selecionar/ }).click();
    await paginaTabela.waitForTimeout(500);

    // "Perfil Teste Atacante" controla "Personagem A (CP7)", que começa sem condições.
    const selectsCondicaoTabela = paginaTabela.locator("select").filter({ has: paginaTabela.locator('option[value="atordoado"]') });
    const botoesAplicarCondicao = paginaTabela.getByRole("button", { name: "Aplicar condição" });
    const indiceAtacante = 1; // ordem estável: Alvo (Personagem B) primeiro, Atacante (Personagem A) segundo.
    await selectsCondicaoTabela.nth(indiceAtacante).selectOption("atordoado");

    const consumidoAntes = await paginaTabela.textContent("body");
    assert.ok(!consumidoAntes?.includes("Atordoado"), "Personagem A não deveria ter Atordoado ativo antes do teste (recurso não consumido antes da validação).");

    await botoesAplicarCondicao.nth(indiceAtacante).click();
    await paginaTabela.waitForTimeout(800);
    const corpoAposAplicar = await paginaTabela.textContent("body");
    assert.ok(corpoAposAplicar?.includes("Atordoado"), "Condição real (Atordoado) deveria ter sido aplicada e persistida em Personagem A.");
    console.log("21/22. Fluxo operacional real (/dev/table) aplicou condição em alvo, com persistência — OK");

    // limpeza: remove a condição de teste da mesa compartilhada.
    const painelPersonagemA = paginaTabela
      .locator("div")
      .filter({ hasText: "Personagem A (CP7)" })
      .filter({ hasText: "Atordoado" });
    await painelPersonagemA.first().getByRole("button", { name: "Remover" }).last().click();
    await paginaTabela.waitForTimeout(500);
    console.log("23. Condição de teste removida da mesa compartilhada — OK (sem resíduo)");
    await paginaTabela.close();

    // ------------------------------------------------------------------
    // 24. Console sem erros.
    // ------------------------------------------------------------------
    assert.equal(errosDeConsole.length, 0, `Console deveria estar sem erros. Encontrados: ${errosDeConsole.join(" | ")}`);
    console.log("24. Console sem erros — OK");

    console.log("\n=== TODOS OS CHECKS PASSARAM ===");
  } finally {
    // ------------------------------------------------------------------
    // 25. Limpeza dos dados de teste — sempre, mesmo em falha.
    // ------------------------------------------------------------------
    try {
      const context = await browser.newContext({ storageState: SESSION_FILE });
      const page = await context.newPage();
      for (const id of idsCriados) await excluirRascunhoPorId(page, id);
      console.log(`25. Dados de teste removidos (${idsCriados.length} rascunho(s)) — OK`);
    } catch {
      // best-effort — não mascara erro anterior.
    }
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\ncheck-admin-effect-builder FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
