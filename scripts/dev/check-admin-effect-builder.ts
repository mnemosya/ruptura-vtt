/**
 * Browser check autenticado repetível do Construtor de Efeitos MVP
 * (Etapa 4) — reusa a sessão local salva por `save-admin-session.ts`
 * (`withAuthenticatedPage`/`SESSION_FILE`, `.auth/admin-session.json`).
 * Não pede senha, não imprime cookies/tokens. Se a sessão não existir
 * ou tiver expirado, `assertAdminSessionValid` lança com a instrução de
 * rodar `npm run auth:save-session` de novo — nunca um bypass.
 *
 * Todo seletor usado aqui aponta para um `data-testid` estável
 * adicionado à UI (nunca texto de rótulo parcial nem texto de opção) —
 * ver `EffectsEditorSection.tsx`, `EfeitoCamposPorTipo.tsx`,
 * `DuracaoEditor.tsx`, `CamposTalentoSection.tsx`, `NovoConteudoForm.tsx`,
 * `DraftEditorClient.tsx` e `TableClient.tsx`. Cada efeito tem
 * `data-effect-id` (o ID interno real, estável) e `data-effect-type` —
 * os campos de cada efeito são sempre localizados DENTRO do locator do
 * card correspondente, nunca por índice cego.
 *
 * Cria rascunhos de teste com prefixo inequívoco ("zz_e2e_etapa4_") e
 * sempre os remove ao final (`finally`), inclusive resíduos de uma
 * execução anterior que tenha travado (varredura no início). O fluxo
 * real de `/dev/table` (itens 21-23) usa a mesa de fixtures "Mesa CP7
 * Bando" já existente — aplica e remove a condição de teste na mesma
 * mesa compartilhada, em um `try/finally` próprio, para nunca deixar
 * resíduo ali mesmo se uma asserção falhar no meio.
 *
 * Uso:
 *   npx tsx scripts/dev/check-admin-effect-builder.ts
 */

import assert from "node:assert/strict";
import { chromium, type Locator, type Page } from "playwright";
import { BASE_URL, SESSION_FILE, assertAdminSessionValid, requireSessaoSalva, sessaoSalvaExiste } from "./authSession";

const PREFIXO_TESTE = "zz_e2e_etapa4_";
const NOME_MESA_FIXTURE = "Mesa CP7 Bando";
const NOME_PERSONAGEM_FIXTURE = "Personagem A (CP7)";
/**
 * ID real (characters.id) do fixture "Personagem A (CP7)" na "Mesa CP7
 * Bando" — usado em vez de filtrar por nome porque o texto do painel
 * de UM personagem pode conter o NOME de outro (ex.: autoria de
 * Contágio renderiza "Contágio (Personagem A (CP7))" dentro do painel
 * de Personagem B), o que quebra `.filter({ hasText })` em modo
 * estrito (resolve para mais de um elemento).
 */
const ID_PERSONAGEM_FIXTURE_A = "0b377e78-eb42-401b-81cf-220ff917299c";
const CONDICAO_TESTE = "atordoado";
const CONDICAO_TESTE_LABEL = "Atordoado";

// ---------------------------------------------------------------------
// Helpers de card de efeito — todo campo é buscado DENTRO do locator do
// card (nunca no documento inteiro), escopado por data-effect-id ou
// data-effect-type conforme o que for único no contexto.
// ---------------------------------------------------------------------

function cardPorTipo(page: Page, tipo: string): Locator {
  return page.locator(`[data-testid="efeito-editor-card"][data-effect-type="${tipo}"]`);
}

function cardPorId(page: Page, id: string): Locator {
  return page.locator(`[data-testid="efeito-editor-card"][data-effect-id="${id}"]`);
}

async function idsDosCards(escopo: Locator): Promise<string[]> {
  const cards = escopo.locator('[data-testid="efeito-editor-card"]');
  const total = await cards.count();
  const ids: string[] = [];
  for (let i = 0; i < total; i++) {
    ids.push((await cards.nth(i).getAttribute("data-effect-id"))!);
  }
  return ids;
}

/**
 * Seleciona a mesa de fixtures na página atual de `/dev/table`. A seleção
 * de mesa é só estado React (`selectedCampaignId`), sem URL nem
 * localStorage — some em qualquer reload real, então isso precisa ser
 * chamado de novo depois de todo `page.reload()`, não só uma vez.
 */
async function selecionarMesaFixture(page: Page): Promise<boolean> {
  const linhaMesa = page.locator('[data-testid^="mesa-linha-"]').filter({ hasText: NOME_MESA_FIXTURE });
  if ((await linhaMesa.count()) === 0) return false;
  await linhaMesa.locator('[data-testid^="selecionar-mesa-"]').click();
  return true;
}

async function excluirRascunhoPorId(page: Page, id: string): Promise<void> {
  const resposta = await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${id}`, { waitUntil: "domcontentloaded" });
  if (!resposta || resposta.status() === 404) return;
  const botaoExcluir = page.locator('[data-testid="rascunho-excluir"]');
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

/** Remove qualquer resíduo da condição de teste na mesa de fixtures compartilhada, de uma execução anterior que tenha travado. */
async function limparResiduoNaTabelaDev(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dev/table`, { waitUntil: "domcontentloaded" });
  if (!(await selecionarMesaFixture(page))) return;
  const painel = page.locator(`[data-testid="estado-personagem-${ID_PERSONAGEM_FIXTURE_A}"]`);
  try {
    await painel.waitFor({ timeout: 15000 });
  } catch {
    return; // personagem não carregou — nada para limpar aqui.
  }
  const condicoes = painel.locator('[data-testid^="estado-condicoes-"]');
  if ((await condicoes.count()) === 0) return;
  const textoCondicoes = await condicoes.textContent();
  if (!textoCondicoes?.includes(CONDICAO_TESTE_LABEL)) return;
  await painel.locator('[data-testid^="estado-remover-condicao-"]').first().click();
  await page.waitForTimeout(300);
  console.log("0b. Limpeza prévia: resíduo de condição de teste removido da mesa de fixtures compartilhada.");
}

async function main(): Promise<void> {
  if (!sessaoSalvaExiste()) {
    requireSessaoSalva();
    return;
  }

  const idsCriados: string[] = [];
  const errosDeConsole: string[] = [];
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
    page.on("console", (msg) => {
      if (msg.type() === "error") errosDeConsole.push(msg.text());
    });
    page.on("dialog", (dialog) => dialog.accept());

    await assertAdminSessionValid(page);
    await limparResiduosDeExecucoesAnteriores(page);
    await limparResiduoNaTabelaDev(page);

    // ------------------------------------------------------------------
    // 2. Admin abre um rascunho de magia.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("spell");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill(`${PREFIXO_TESTE}magia`);
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagia = page.url().split("/").pop()!;
    idsCriados.push(idMagia);
    console.log(`2. Admin abre rascunho de magia — OK (id=${idMagia})`);

    // ------------------------------------------------------------------
    // 3. Adiciona dano 1d8 de fogo (energetico/igneo — vocabulário real da Biblioteca).
    // ------------------------------------------------------------------
    await page.locator('[data-testid="novo-efeito-adicionar-spell"]').click(); // padrão já é "dano"
    const cardDano = cardPorTipo(page, "dano");
    await cardDano.waitFor();
    const idEfeitoDano = (await cardDano.getAttribute("data-effect-id"))!;
    assert.ok(idEfeitoDano, "Efeito de dano deveria ter um data-effect-id estável.");

    await cardDano.locator('[data-testid="dano-quantidade"]').fill("1");
    await cardDano.locator('[data-testid="dano-faces"]').selectOption("8");
    await cardDano.locator('[data-testid="dano-tipo-dano"]').selectOption("energetico");
    await cardDano.locator('[data-testid="dano-subtipo-dano"]').selectOption("igneo");
    await cardDano.locator('[data-testid="efeito-gatilho"]').selectOption("ao_acertar");
    await cardDano.locator('[data-testid="efeito-alvo"]').selectOption("alvo_principal");
    console.log("3. Dano 1d8 (energético/ígneo) adicionado — OK");

    // ------------------------------------------------------------------
    // 4/5. Salva, recarrega, confirma que o efeito mantém ID, ordem e campos.
    // ------------------------------------------------------------------
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });

    const cardDanoAposReload = cardPorId(page, idEfeitoDano);
    await cardDanoAposReload.waitFor();
    assert.equal(await page.locator('[data-testid="efeito-editor-card"]').count(), 1, "Deveria haver exatamente 1 card de efeito após reload (sem duplicar).");
    assert.equal(await cardDanoAposReload.locator('[data-testid="dano-quantidade"]').inputValue(), "1");
    assert.equal(await cardDanoAposReload.locator('[data-testid="dano-faces"]').inputValue(), "8");
    assert.equal(await cardDanoAposReload.locator('[data-testid="dano-tipo-dano"]').inputValue(), "energetico");
    assert.equal(await cardDanoAposReload.locator('[data-testid="dano-subtipo-dano"]').inputValue(), "igneo");
    assert.equal(await cardDanoAposReload.locator('[data-testid="efeito-gatilho"]').inputValue(), "ao_acertar");
    assert.equal(await cardDanoAposReload.getAttribute("data-effect-id"), idEfeitoDano, "O ID do efeito não pode mudar entre salvar e recarregar.");
    console.log("4/5. Salva e recarrega — mesmo ID, mesma ordem, mesmos campos — OK");

    // ------------------------------------------------------------------
    // 6/7/8. Adiciona Aplicar condição com uma condição real; diagnóstico correto.
    // ------------------------------------------------------------------
    await page.locator('[data-testid="novo-efeito-tipo-spell"]').selectOption("aplicar_condicao");
    await page.locator('[data-testid="novo-efeito-adicionar-spell"]').click();
    const cardCondicao = cardPorTipo(page, "aplicar_condicao");
    await cardCondicao.waitFor();
    const idEfeitoCondicao = (await cardCondicao.getAttribute("data-effect-id"))!;

    await cardCondicao.locator('[data-testid="aplicar-condicao-slug"]').selectOption(CONDICAO_TESTE);
    await cardCondicao.locator('[data-testid="efeito-gatilho"]').selectOption("ao_acertar");
    await cardCondicao.locator('[data-testid="efeito-alvo"]').selectOption("alvo_principal");
    console.log("7. Condição publicada real selecionada ('atordoado') — OK");

    const modoAutomacao = await cardCondicao.locator('[data-testid="efeito-modo-automacao"]').getAttribute("data-modo");
    assert.ok(modoAutomacao === "automatico" || modoAutomacao === "assistido", `Modo de automação inesperado para aplicar_condicao configurada: ${modoAutomacao}`);
    console.log(`8. Diagnóstico mostra modo de automação real (${modoAutomacao}) — OK`);

    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------
    // 9. Reordena os efeitos.
    // ------------------------------------------------------------------
    const cardsAntesDeReordenar = page.locator('[data-testid="efeito-editor-card"]');
    const primeiroIdAntes = await cardsAntesDeReordenar.first().getAttribute("data-effect-id");
    await cardsAntesDeReordenar.first().locator('[data-testid="efeito-mover-baixo"]').click();
    const primeiroIdDepois = await cardsAntesDeReordenar.first().getAttribute("data-effect-id");
    assert.notEqual(primeiroIdAntes, primeiroIdDepois, "Reordenar deveria mudar qual efeito aparece primeiro.");
    const idsAposReordenar = await idsDosCards(page.locator("body"));
    assert.ok(idsAposReordenar.includes(idEfeitoDano) && idsAposReordenar.includes(idEfeitoCondicao), "Reordenar não pode perder nenhum efeito.");
    console.log("9. Reordena os efeitos (mesmos IDs, nova ordem) — OK");

    // ------------------------------------------------------------------
    // 10/11. Duplica e remove um efeito — usando o card de dano, identificado por ID.
    // ------------------------------------------------------------------
    const idsAntesDeDuplicar = new Set(await idsDosCards(page.locator("body")));
    await cardPorId(page, idEfeitoDano).locator('[data-testid="efeito-duplicar"]').click();
    const idsDepoisDeDuplicar = await idsDosCards(page.locator("body"));
    assert.equal(idsDepoisDeDuplicar.length, idsAntesDeDuplicar.size + 1, "Duplicar deveria adicionar exatamente mais um efeito.");
    const idNovoDaCopia = idsDepoisDeDuplicar.find((id) => !idsAntesDeDuplicar.has(id));
    assert.ok(idNovoDaCopia, "A cópia deveria ter um data-effect-id novo, nunca reaproveitado.");
    assert.ok(idsDepoisDeDuplicar.includes(idEfeitoDano), "O efeito original deveria continuar intacto após duplicar.");
    console.log("10. Duplica um efeito (novo ID, original preservado) — OK");

    await cardPorId(page, idNovoDaCopia!).locator('[data-testid="efeito-remover"]').click();
    const idsDepoisDeRemover = await idsDosCards(page.locator("body"));
    assert.deepEqual(new Set(idsDepoisDeRemover), idsAntesDeDuplicar, "Remover a cópia deveria voltar exatamente ao conjunto de IDs original.");
    console.log("11. Remove a cópia (conjunto de IDs volta ao original) — OK");

    // ------------------------------------------------------------------
    // 12. Cancelar alteração não salva.
    // ------------------------------------------------------------------
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    await cardPorId(page, idEfeitoDano).locator('[data-testid="efeito-nome-opcional"]').fill("EDIÇÃO QUE SERÁ DESCARTADA");
    await page.locator('[data-testid="rascunho-cancelar"]').click();
    await page.waitForURL(`${BASE_URL}/admin/biblioteca/rascunhos`, { timeout: 5000 });
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${idMagia}`, { waitUntil: "domcontentloaded" });
    const nomeOpcionalAposCancelar = await cardPorId(page, idEfeitoDano).locator('[data-testid="efeito-nome-opcional"]').inputValue();
    assert.equal(nomeOpcionalAposCancelar, "", "Cancelar não deveria persistir a edição não salva.");
    console.log("12. Cancelar alterações não salva — OK");

    // ------------------------------------------------------------------
    // 18. Efeito legado desconhecido permanece preservado (magia real com teste_resistencia).
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/spell/energetica_bola_de_fogo`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idMagiaLegado = page.url().split("/").pop()!;
    idsCriados.push(idMagiaLegado);
    const containerPreservados = page.locator('[data-testid="efeitos-preservados-container"]');
    await containerPreservados.waitFor();
    const textoPreservados = await containerPreservados.textContent();
    assert.ok(!textoPreservados?.includes("Nenhum efeito fora do Construtor"), "Deveria haver ao menos um efeito preservado (teste_resistencia) para esta magia real.");
    console.log("18. Efeito legado (teste_resistencia) permanece preservado — OK");

    // ------------------------------------------------------------------
    // 19. Nenhum JSON bruto aparece no fluxo principal.
    // ------------------------------------------------------------------
    // O editor de rascunho não expõe nenhum visualizador de JSON bruto (nem
    // recolhido) — a checagem confirma que não há vazamento de sintaxe JSON
    // crua na página. A página de detalhe de conteúdo PUBLICADO (Etapa 2) tem
    // um bloco "Modo avançado" recolhido; quando presente, deve estar fechado.
    const detalhesAvancado = page.locator("details", { hasText: "Modo avançado" });
    if ((await detalhesAvancado.count()) > 0) {
      assert.equal(await detalhesAvancado.first().getAttribute("open"), null, "O bloco de JSON avançado deveria estar recolhido por padrão.");
    }
    const corpoParaJson = await page.textContent("body");
    assert.ok(!corpoParaJson?.includes('"payload_automacao"') && !corpoParaJson?.includes('"schemaVersion"'), "Nenhum JSON bruto deveria aparecer visível no fluxo principal.");
    console.log("19. Nenhum JSON bruto vazando no fluxo principal — OK");

    // ------------------------------------------------------------------
    // 20. Preview reflete os efeitos em ordem (mesmos IDs, mesma sequência).
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/${idMagia}`, { waitUntil: "domcontentloaded" });
    const ordemNoEditor = await idsDosCards(page.locator("body"));
    const itensPreview = page.locator('[data-testid="efeito-preview-item"]');
    const totalPreview = await itensPreview.count();
    const ordemNoPreview: string[] = [];
    for (let i = 0; i < totalPreview; i++) {
      ordemNoPreview.push((await itensPreview.nth(i).getAttribute("data-effect-id"))!);
    }
    assert.deepEqual(ordemNoPreview, ordemNoEditor, "O preview deveria refletir exatamente a mesma ordem do editor.");
    console.log("20. Preview reflete os efeitos configurados, na mesma ordem — OK");

    // ------------------------------------------------------------------
    // 13. Cria item com cura 2d6 PV.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("item");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill(`${PREFIXO_TESTE}item_cura`);
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idItemCura = page.url().split("/").pop()!;
    idsCriados.push(idItemCura);

    await page.locator('[data-testid="novo-efeito-tipo-item"]').selectOption("cura");
    await page.locator('[data-testid="novo-efeito-adicionar-item"]').click();
    const cardCura = cardPorTipo(page, "cura");
    await cardCura.waitFor();
    await cardCura.locator('[data-testid="cura-quantidade"]').fill("2");
    await cardCura.locator('[data-testid="cura-faces"]').selectOption("6");
    await cardCura.locator('[data-testid="cura-recurso"]').selectOption("pv");
    await cardCura.locator('[data-testid="efeito-gatilho"]').selectOption("ao_usar");
    await cardCura.locator('[data-testid="efeito-alvo"]').selectOption("selecionado_manualmente");
    const modoAutomacaoCura = await cardCura.locator('[data-testid="efeito-modo-automacao"]').getAttribute("data-modo");
    assert.equal(modoAutomacaoCura, "automatico", "Cura 2d6 PV com fórmula/recurso/alvo definidos deveria ser diagnosticada como automática.");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    console.log(`13. Item com cura 2d6 PV criado (modo automático confirmado) — OK (id=${idItemCura})`);

    // ------------------------------------------------------------------
    // 14. Cria item que remove condição.
    // ------------------------------------------------------------------
    await page.locator('[data-testid="novo-efeito-tipo-item"]').selectOption("remover_condicao");
    await page.locator('[data-testid="novo-efeito-adicionar-item"]').click();
    const cardRemoverCondicao = cardPorTipo(page, "remover_condicao");
    await cardRemoverCondicao.waitFor();
    await cardRemoverCondicao.locator('[data-testid="remover-condicao-slug"]').selectOption("sangrando");
    await cardRemoverCondicao.locator('[data-testid="efeito-gatilho"]').selectOption("ao_usar");
    await cardRemoverCondicao.locator('[data-testid="efeito-alvo"]').selectOption("proprio");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    console.log("14. Item que remove condição criado — OK");

    // ------------------------------------------------------------------
    // 15/16. Cria talento com +1 em Luta no nível 1; mantém os 3 níveis.
    // ------------------------------------------------------------------
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("talent");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill(`${PREFIXO_TESTE}talento`);
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const idTalento = page.url().split("/").pop()!;
    idsCriados.push(idTalento);

    assert.equal(await page.locator('[data-testid^="talento-nivel-secao-"]').count(), 3, "Rascunho de talento deveria ter exatamente os 3 níveis.");

    const nivel1 = page.locator('[data-testid="talento-nivel-secao-1"]');
    await nivel1.locator('[data-testid="novo-efeito-tipo-nivel-1"]').selectOption("modificar_teste");
    await nivel1.locator('[data-testid="novo-efeito-adicionar-nivel-1"]').click();
    const cardModificarTeste = nivel1.locator('[data-testid="efeito-editor-card"][data-effect-type="modificar_teste"]');
    await cardModificarTeste.waitFor();
    await cardModificarTeste.locator('[data-testid="modificar-teste-valor"]').fill("1");
    await cardModificarTeste.locator('[data-testid="modificar-teste-pericia"]').selectOption("luta");
    await cardModificarTeste.locator('[data-testid="efeito-gatilho"]').selectOption("manualmente");
    await cardModificarTeste.locator('[data-testid="efeito-alvo"]').selectOption("proprio");
    await cardModificarTeste.locator('[data-testid="efeito-duracao-tipo"]').selectOption("rodadas");
    await cardModificarTeste.locator('[data-testid="efeito-duracao-valor"]').fill("1");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);

    // A escrita/leitura em nivel 2/3 não pode ter recebido o efeito do nível 1 — escopo por card.
    assert.equal(await page.locator('[data-testid="talento-nivel-secao-2"]').locator('[data-testid="efeito-editor-card"]').count(), 0, "Nível 2 não deveria ter recebido o efeito do nível 1.");
    assert.equal(await page.locator('[data-testid="talento-nivel-secao-3"]').locator('[data-testid="efeito-editor-card"]').count(), 0, "Nível 3 não deveria ter recebido o efeito do nível 1.");
    console.log(`15/16. Talento com +1 em Luta no nível 1 (3 níveis mantidos, sem vazamento entre níveis) — OK (id=${idTalento})`);

    // ------------------------------------------------------------------
    // 17. Cria efeito de alterar recurso no nível 2.
    // ------------------------------------------------------------------
    const nivel2 = page.locator('[data-testid="talento-nivel-secao-2"]');
    await nivel2.locator('[data-testid="novo-efeito-tipo-nivel-2"]').selectOption("alterar_recurso");
    await nivel2.locator('[data-testid="novo-efeito-adicionar-nivel-2"]').click();
    const cardAlterarRecurso = nivel2.locator('[data-testid="efeito-editor-card"][data-effect-type="alterar_recurso"]');
    await cardAlterarRecurso.waitFor();
    await cardAlterarRecurso.locator('[data-testid="efeito-gatilho"]').selectOption("ao_encerrar_rodada");
    await cardAlterarRecurso.locator('[data-testid="efeito-alvo"]').selectOption("proprio");
    await cardAlterarRecurso.locator('[data-testid="alterar-recurso-recurso"]').selectOption("pa");
    await cardAlterarRecurso.locator('[data-testid="alterar-recurso-operacao"]').selectOption("reduzir");
    await cardAlterarRecurso.locator('[data-testid="alterar-recurso-valor-fixo"]').fill("1");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-testid="talento-nivel-secao-1"]').locator('[data-testid="efeito-editor-card"]').count(), 1, "Nível 1 deveria continuar com seu efeito, intacto.");
    console.log("17. Efeito de alterar recurso criado no nível 2 (nível 1 permanece intacto) — OK");

    console.log(`\nErros de console coletados até aqui: ${errosDeConsole.length}`);

    // ------------------------------------------------------------------
    // 21/22/23. Fluxo operacional real — executor genérico de aplicar
    // condição, em /dev/table. Não exige login (RLS de transição).
    // Usa a mesa de fixtures já existente; try/finally próprio para
    // garantir que a condição de teste NUNCA fica presa na mesa
    // compartilhada, mesmo se uma asserção falhar no meio.
    // ------------------------------------------------------------------
    const paginaTabela = await context.newPage();
    paginaTabela.on("console", (msg) => {
      if (msg.type() === "error") errosDeConsole.push(`[/dev/table] ${msg.text()}`);
    });
    let painelPersonagemA: Locator | null = null;
    try {
      await paginaTabela.goto(`${BASE_URL}/dev/table`, { waitUntil: "domcontentloaded" });
      assert.ok(await selecionarMesaFixture(paginaTabela), `Mesa de fixtures "${NOME_MESA_FIXTURE}" deveria existir.`);

      painelPersonagemA = paginaTabela.locator(`[data-testid="estado-personagem-${ID_PERSONAGEM_FIXTURE_A}"]`);
      await painelPersonagemA.waitFor();

      // 23a. Nenhum recurso consumido antes da validação: personagem começa sem a condição de teste.
      assert.equal(await painelPersonagemA.locator('[data-testid^="estado-condicoes-"]').count(), 0, `${NOME_PERSONAGEM_FIXTURE} não deveria ter condições ativas antes do teste.`);

      const selectCondicao = painelPersonagemA.locator('[data-testid^="estado-condicao-select-"]');
      const botaoAplicar = painelPersonagemA.locator('[data-testid^="estado-aplicar-condicao-"]');

      await selectCondicao.selectOption(CONDICAO_TESTE);
      await botaoAplicar.click();
      await painelPersonagemA.locator('[data-testid^="estado-condicoes-"]').waitFor({ timeout: 5000 });

      // 21/22. Condição real aplicada, persistida (recarrega e confirma que sobrevive) e com log.
      const condicoesAtivas = painelPersonagemA.locator('[data-testid^="estado-condicoes-"]');
      assert.ok((await condicoesAtivas.textContent())?.includes(CONDICAO_TESTE_LABEL), "Condição real deveria ter sido aplicada em Personagem A.");
      await paginaTabela.reload({ waitUntil: "domcontentloaded" });
      // Reload real zera o estado React de mesa selecionada (não há URL nem localStorage) — reseleciona.
      assert.ok(await selecionarMesaFixture(paginaTabela), `Mesa de fixtures "${NOME_MESA_FIXTURE}" deveria continuar existindo após reload.`);
      const painelAposReload = paginaTabela.locator(`[data-testid="estado-personagem-${ID_PERSONAGEM_FIXTURE_A}"]`);
      await painelAposReload.waitFor();
      assert.ok(
        (await painelAposReload.locator('[data-testid^="estado-condicoes-"]').textContent())?.includes(CONDICAO_TESTE_LABEL),
        "Condição deveria persistir após reload (não é só estado de memória do client).",
      );
      painelPersonagemA = painelAposReload;
      console.log("21/22. Executor genérico aplicou condição real em alvo e ela persiste após reload — OK");

      // 23b. Erro não é tratado como sucesso: tentar aplicar de novo (já ativa) não duplica nem finge sucesso.
      await painelPersonagemA.locator('[data-testid^="estado-condicao-select-"]').selectOption(CONDICAO_TESTE);
      await painelPersonagemA.locator('[data-testid^="estado-aplicar-condicao-"]').click();
      await paginaTabela.waitForTimeout(500);
      const erroExibido = paginaTabela.locator('[data-testid="estado-personagens-erro"]');
      assert.equal(await erroExibido.count(), 1, "Aplicar a mesma condição de novo deveria mostrar um erro (validação antes de qualquer mutação), não um sucesso silencioso.");
      const quantidadeCondicoesTag = await painelPersonagemA.locator('[data-testid^="estado-condicoes-"] span').count();
      assert.equal(quantidadeCondicoesTag, 1, "A condição não pode ter sido duplicada por uma segunda tentativa inválida — nenhuma persistência parcial.");
      console.log("23. Segunda tentativa (já ativa) falha com erro visível, sem duplicar nem persistir — validação antes de qualquer consumo — OK");
    } finally {
      // Limpeza garantida da mesa compartilhada, independente do resultado das asserções acima.
      if (painelPersonagemA) {
        const botaoRemover = painelPersonagemA.locator('[data-testid^="estado-remover-condicao-"]');
        if ((await botaoRemover.count()) > 0) {
          await botaoRemover.first().click();
          await paginaTabela.waitForTimeout(400);
        }
      }
      await paginaTabela.close();
    }

    // ------------------------------------------------------------------
    // 24. Console sem erros.
    // ------------------------------------------------------------------
    assert.equal(errosDeConsole.length, 0, `Console deveria estar sem erros. Encontrados: ${errosDeConsole.join(" | ")}`);
    console.log("24. Console sem erros — OK");

    console.log("\n=== TODOS OS CHECKS PASSARAM ===");
  } finally {
    // Sempre visível, mesmo se a falha aconteceu antes do item 24 — nunca perder
    // o diagnóstico de console por causa de onde exatamente o script parou.
    console.log(`\nErros de console coletados até o fim da execução: ${errosDeConsole.length}`);
    if (errosDeConsole.length > 0) console.log(errosDeConsole.map((e) => `  - ${e}`).join("\n"));

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
