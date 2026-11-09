/** Verificação de teclado da Forja isolada. Requer `npm run dev`. */
import { strict as assert } from "node:assert";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.FORJA_TEST_URL ?? "http://localhost:3000/dev/forja");
  await page.getByRole("button", { name: /Novo refratário/i }).waitFor();

  await page.waitForFunction(() => document.activeElement?.classList.contains("fj-titulo__item"));
  await page.evaluate(() => {
    const fundo = document.createElement("button");
    fundo.id = "botao-fundo-teste";
    fundo.textContent = "Botão do fundo";
    fundo.onclick = () => { document.body.dataset.cliqueFundo = "sim"; };
    document.body.prepend(fundo);
    fundo.focus();
  });
  await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "Passos da forja" }).waitFor();
  assert.equal(await page.locator("body").getAttribute("data-clique-fundo"), null);
  console.log("ok Enter inicia com foco herdado do fundo");

  const passo = page.locator(".fj-menu__passo[aria-current='step']");
  const nome = page.getByRole("textbox", { name: "Nome", exact: true });
  await nome.focus();
  await page.keyboard.press("e");
  assert.match(await passo.innerText(), /Conceito/i);
  assert.equal(await nome.inputValue(), "e");
  await nome.evaluate((el) => (el as HTMLInputElement).blur());
  console.log("ok E escreve no campo sem trocar de passo");

  // Um diálogo anterior na árvore (atrás da Forja) não bloqueia Q/E/U.
  await page.evaluate(() => {
    const fundo = document.createElement("div");
    fundo.setAttribute("aria-modal", "true");
    fundo.id = "modal-fundo-teste";
    document.body.prepend(fundo);
  });
  assert.match(await passo.innerText(), /Conceito/i);
  await page.keyboard.press("e");
  await page.waitForTimeout(100);
  assert.match(await passo.innerText(), /Região/i);
  await page.keyboard.press("q");
  await page.waitForTimeout(100);
  assert.match(await passo.innerText(), /Conceito/i);
  console.log("ok E avança e Q volta com modal ao fundo");

  await page.keyboard.press("u");
  await page.getByRole("dialog", { name: /Avatar do refratário/i }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: /Avatar do refratário/i }).waitFor({ state: "hidden" });
  console.log("ok U abre avatar e Escape fecha");

  await page.keyboard.press("e");
  await page.keyboard.press("i");
  await page.getByRole("dialog", { name: /Códex regional/i }).waitFor();
  await page.keyboard.press("e");
  assert.match(await passo.innerText(), /Região/i);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: /Códex regional/i }).waitFor({ state: "hidden" });
  console.log("ok I abre Códex e E não atravessa o modal");

  await page.goto(process.env.FORJA_TEST_URL ?? "http://localhost:3000/dev/forja");
  await page.waitForFunction(() => document.activeElement?.classList.contains("fj-titulo__item"));
  await page.keyboard.press("Enter");
  await page.getByRole("navigation", { name: "Passos da forja" }).waitFor();
  console.log("ok Enter ativa o botão primário focado");
  await page.close();
} finally {
  await browser.close();
}
