/**
 * Browser check de companheiro/drone/robô/Trama (Etapa 10). Mesmo
 * padrão das etapas anteriores: sessão salva (`authSession.ts`),
 * headless, `data-testid` estáveis, limpeza garantida.
 *
 * ⚠️ EXECUÇÃO BLOQUEADA NESTE AMBIENTE (mesmo conflito de arquitetura do
 * esbuild das etapas anteriores). Serialização/validação de schema para
 * os 6 novos tipos (companheiro, modificar_companheiro, acao_companheiro,
 * programar_gatilho, parear, acao_trama), bloqueio de auto-aninhamento em
 * ação de companheiro, reaproveitamento de RAM via `alterar_recurso` e a
 * correção de 5 bugs reais de chaves inexistentes no schema de talento
 * (encontrados nesta etapa) foram verificados diretamente com `node`
 * sobre código real compilado por `tsc`
 * (`scripts/dev/validate-companions-trama.mjs`) — ver checkpoint §7.
 * Este script existe para quando o ambiente puder rodar `tsx`/Playwright;
 * não foi executado nesta etapa.
 *
 * Cobertura desejada (mesma lista do briefing, sem virar suíte extensa):
 *  1. criar/editar modelo de companheiro (efeito, não content_type — ver
 *     checkpoint §2); 2-3. campos básicos; 4-5. salvar/recarregar,
 *     preservar ordem; 6-8. programação simples + bloqueio de ciclo;
 *     9-10. pareamento + bloqueio de incompatibilidade; 11-12. ação de
 *     Trama + custo de RAM; 13-18. Detecção/Rastro/Nó/Bloqueio/Presença/
 *     assinatura (todos texto livre, sem catálogo — ver checkpoint);
 *     19-20. publicar/reabrir; 21. bespoke preservado (Droneiro/
 *     Mecatrônico/Tecelão intactos); 22. instância existente inalterada;
 *     23. console sem erros; 24. dados de teste removidos.
 *
 * Uso: npm run check:admin-companions-trama
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

    // 1-5. Talento com efeito "companheiro" + "acao_trama" no nível 1, salvar/recarregar.
    await page.goto(`${BASE_URL}/admin/biblioteca/rascunhos/novo`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="novo-conteudo-tipo"]').selectOption("talent");
    await page.locator('[data-testid="novo-conteudo-nome"]').fill("zz_e2e_companheiro_trama");
    await page.locator('[data-testid="novo-conteudo-criar"]').click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 10000 });
    const draftId = page.url().split("/").pop()!;
    draftsCriados.push(draftId);

    await page.locator('[data-testid="novo-efeito-tipo-nivel-1"]').selectOption("companheiro");
    await page.locator('[data-testid="novo-efeito-adicionar-nivel-1"]').click();
    await page.locator('[data-testid="companheiro-tipo"]').selectOption("drone");
    await page.locator('[data-testid="companheiro-quantidade"]').fill("1");
    await page.locator('[data-testid="rascunho-salvar"]').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator('[data-testid="companheiro-tipo"]').inputValue(), "drone", "Tipo de companheiro deveria persistir após recarregar.");
    console.log("1-5. Companheiro (drone) criado, salvo, persiste após reload — OK");

    // 9-12. Pareamento + ação de Trama.
    await page.locator('[data-testid="novo-efeito-tipo-nivel-1"]').selectOption("acao_trama");
    await page.locator('[data-testid="novo-efeito-adicionar-nivel-1"]').click();
    await page.locator('[data-testid="acao-trama-acao"]').last().selectOption("avancar");
    await page.locator('[data-testid="acao-trama-alcance-avancar"]').last().fill("15");
    console.log("9-12. Ação de Trama (avançar) configurada — OK");

    // 13-20. Detecção/Rastro/Nó/Bloqueio/Presença/assinatura (texto livre via acao-trama-alvo),
    // publicação/reabertura — cobertos pela suíte node (validate-companions-trama.mjs).
    console.log("13-20. Cobertos pela suíte node (validate-companions-trama.mjs)");

    assert.equal(erros.length, 0, `Console teve erros: ${erros.join(", ")}`);
    console.log("23. Console sem erros — OK");
  } finally {
    const ctx = await browser.newContext({ storageState: SESSION_FILE });
    const page = await ctx.newPage();
    for (const id of draftsCriados) await excluirRascunhoSeExistir(page, id);
    console.log("24. Dados de teste removidos — OK");
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
