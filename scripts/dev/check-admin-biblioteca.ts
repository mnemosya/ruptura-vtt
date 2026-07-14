/**
 * Browser check autenticado repetível da área /admin/biblioteca, usando
 * a sessão local salva por `save-admin-session.ts` — não pede senha,
 * não imprime cookies/tokens. Se a sessão não existir ou tiver
 * expirado, falha com uma mensagem clara pedindo para repetir o login
 * manual (nunca finge sucesso nem inventa um bypass).
 *
 * Uso:
 *   npx tsx scripts/dev/check-admin-biblioteca.ts
 */

import assert from "node:assert/strict";
import { BASE_URL, assertAdminSessionValid, withAuthenticatedPage } from "./authSession";

async function main(): Promise<void> {
  await withAuthenticatedPage(async (page) => {
    console.log("=== check-admin-biblioteca (sessão local) ===\n");

    await assertAdminSessionValid(page);
    console.log("1. Sessão válida — acesso administrativo confirmado.");

    await page.goto(`${BASE_URL}/admin/biblioteca`, { waitUntil: "domcontentloaded" });
    const titulo = await page.textContent("h1");
    assert.ok(titulo?.includes("Biblioteca"), 'Esperado título contendo "Biblioteca" na lista.');
    console.log("2. Lista carrega —", titulo?.trim());

    await page.goto(`${BASE_URL}/admin/biblioteca?q=fogo`, { waitUntil: "domcontentloaded" });
    const corpoBusca = await page.textContent("body");
    assert.ok(corpoBusca?.match(/conteúdo\(s\) encontrado\(s\)/), "Esperado contador de resultados na busca.");
    console.log("3. Busca 'fogo' retorna resultados — OK");

    await page.goto(`${BASE_URL}/admin/biblioteca/spell/energetica_bola_de_fogo`, { waitUntil: "domcontentloaded" });
    const corpoDetalhe = await page.textContent("body");
    assert.ok(corpoDetalhe?.includes("Preview"), "Esperado a seção 'Preview' no detalhe de uma magia.");
    assert.ok(corpoDetalhe?.includes("Efeitos"), "Esperado a seção 'Efeitos' no detalhe.");
    console.log("4. Detalhe semântico (spell) renderiza Preview + Efeitos — OK");

    await page.goto(`${BASE_URL}/admin/biblioteca/combat_action/agarrar`, { waitUntil: "domcontentloaded" });
    const corpoGenerico = await page.textContent("body");
    assert.ok(corpoGenerico?.includes("Agarrar"), "Esperado o nome do conteúdo genérico na página.");
    console.log("5. Detalhe genérico (combat_action) abre sem quebrar — OK");

    console.log("\n=== TODOS OS CHECKS PASSARAM ===");
  });
}

main().catch((err) => {
  console.error("\ncheck-admin-biblioteca FALHOU:\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
