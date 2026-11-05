import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3000/dev/escalpos");
  const panel = page.getByTestId("console-escalpos");
  await panel.waitFor();
  await panel.getByRole("button", { name: "Ver Ouvidos de Caçador", exact: true }).click();
  const dialog = page.locator(".hs-dialog");
  await dialog.waitFor();
  const desgaste = dialog.getByLabel("Desgaste de Ouvidos de Caçador");
  await desgaste.selectOption("1");
  assert.match(await dialog.innerText(), /1\/2 · Danificado/);
  await desgaste.selectOption("2");
  assert.match(await dialog.innerText(), /2\/2 · Inativo/);
  await page.screenshot({ path: "/tmp/escalpo-desgaste-desktop.png", fullPage: true });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.match(await panel.getByRole("button", { name: "Ver Ouvidos de Caçador", exact: true }).innerText(), /Inativo/i);
  await page.getByRole("checkbox", { name: "Somente leitura" }).check();
  await panel.getByRole("button", { name: "Ver Ouvidos de Caçador", exact: true }).click();
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel("Desgaste de Ouvidos de Caçador").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/escalpo-desgaste-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("Escalpos: Desgaste editável, leitura e mobile — OK");
} finally {
  await browser.close();
}
