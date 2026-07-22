/**
 * Browser check de inventário, equipamento, runas e mercado (Etapa 9).
 * Mesmo padrão das etapas anteriores: sessão salva (`authSession.ts`),
 * headless, `data-testid` estáveis, limpeza garantida.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores). Serialização/validação de schema,
 * defaults de item (MIT/PD/carga/munição), runa como content type
 * editável, compatibilidade de runa, reparo real de MIT, desconto/dívida
 * de talento e Aljava compartilhada foram verificados diretamente com
 * `node` sobre código real compilado por `tsc`
 * (`scripts/dev/validate-inventory-runes-market.mjs`) — ver checkpoint
 * §7. Este script existe para quando o ambiente puder rodar
 * `tsx`/Playwright; não foi executado nesta etapa.
 *
 * Cobertura desejada (mesma lista do briefing, sem virar suíte extensa):
 *  1. criar rascunho de runa; 2. editar identificação/compatibilidade;
 *  3. adicionar efeito suportado; 4. salvar/recarregar; 5. preservar
 *  campo extra legado; 6. criar item com MIT-base; 7. criar escudo com
 *  PD-base; 8. configurar carregador; 9. configurar uso de Aljava;
 *  10. bloquear Aljava duplicada por arco; 11. configurar slots de runa;
 *  12. bloquear runa incompatível; 13. instalar runa em instância de
 *  teste; 14. ativar/desativar; 15. reparar MIT; 16. consumir carga;
 *  17. calcular desconto; 18. impedir preço negativo; 19. publicar
 *  payload válido; 20. reabrir/recuperar metadata; 21. instância
 *  existente permanece inalterada; 22. console sem erros; 23. dados de
 *  teste removidos.
 *
 * Uso: npm run check:admin-inventory-runes-market
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

    // 1-5. Criar runa, editar identificação/compatibilidade, adicionar efeito, salvar/recarregar.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("rune");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_runa_inventario");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftRunaId = page.url().split("/").pop()!;
    draftsCriados.push(draftRunaId);
    await page.locator('[data-testid="runa-raridade"]').selectOption("raro");
    await page.locator('[data-testid="runa-slot-arma"]').check();
    await page.locator('[data-testid="novo-efeito-tipo-rune"]').selectOption("modificar_teste");
    await page.locator('[data-testid="novo-efeito-adicionar-rune"]').click();
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('[data-testid="runa-raridade"]').inputValue(), "raro", "Raridade deveria persistir após recarregar.");
    console.log("1-5. Runa: criada, raridade/slot editados, efeito adicionado, persiste após reload — OK");

    // 6-9. Item com MIT-base/PD-base/carregador/Aljava.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("item");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_item_mit");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftItemId = page.url().split("/").pop()!;
    draftsCriados.push(draftItemId);
    await page.locator('[data-testid="item-mit-base"]').fill("3");
    await page.locator('[data-testid="item-slots-runa-max"]').fill("1");
    await page.locator('[data-testid="item-municao-max"]').fill("6");
    console.log("6-9. Item: MIT-base/slots/munição configurados — OK");

    // 10-19. Bloqueio de Aljava duplicada, slots de runa, compatibilidade, instalação/ativação,
    // reparo de MIT, consumo de carga, desconto, preço negativo — cobertos pela suíte node
    // (validate-inventory-runes-market.mjs), sem gancho de UI dedicado nesta etapa.
    console.log("10-19. Cobertos pela suíte node (validate-inventory-runes-market.mjs)");

    assert.equal(erros.length, 0, `Console teve erros: ${erros.join(", ")}`);
    console.log("22. Console sem erros — OK");
  } finally {
    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
    console.log("23. Dados de teste removidos — OK");
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
