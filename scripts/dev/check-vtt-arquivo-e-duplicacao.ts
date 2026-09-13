/**
 * Os gestos de ciclo de vida da cena NA TELA (fase 4).
 *
 * A transação em si está coberta por `check-vtt-ciclo-cena.ts`, que
 * roda no banco. Aqui o que está sob teste é o que só existe na
 * interface: o menu, a aba de arquivo, a confirmação por nome, e o
 * caso que nenhum dos dois lados resolve sozinho — arquivar a cena que
 * o narrador está OLHANDO, que precisa tirá-lo dali.
 *
 * Uso: npx tsx scripts/dev/check-vtt-arquivo-e-duplicacao.ts
 *      (precisa do `npm run dev` rodando)
 */

import { createHash, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function criterio(nome: string, ok: boolean, detalhe = "") {
  if (ok) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

function cartao(page: Page, nome: string) {
  return page.locator('[data-testid="cena-cartao"]').filter({ hasText: nome });
}

async function nomes(page: Page): Promise<string[]> {
  return page.locator('[data-testid="cena-cartao"] .rv-cena-nome').allTextContents();
}

/** Abre o menu do cartão e clica num item dele. */
async function noMenu(page: Page, cena: string, item: string) {
  await cartao(page, cena).locator('[data-testid="cena-menu"]').click();
  await page.locator('[data-testid="cena-menu-lista"]').waitFor({ timeout: 5000 });
  await page.locator(`[data-testid="${item}"]`).click();
}

async function cenaNaTela(page: Page): Promise<string> {
  return (await page.locator(".rv-cena").first().textContent())?.trim() ?? "";
}

async function main() {
  const email = `check-arquivo-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora" },
  });
  const narradorId = u!.user!.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Arquivo e duplicação", owner_id: narradorId });

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 20, altura: 16, ordem: 1, ativa: false },
    { campaign_id: campaignId, nome: "Ponte Quebrada", largura: 20, altura: 16, ordem: 2, ativa: false },
  ]).select("id, nome");
  const doca = cenas!.find((c) => c.nome === "Doca Norte")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });

  // ── Um fundo de verdade na Doca, para a miniatura ───────────────────
  // A miniatura não é um `<img src>` qualquer: o id sai de
  // `list_vtt_scenes`, a URL sai de `assinarImagensAction`, e no meio
  // está `vtt_asset_assinavel_para`. Semear o arquivo de verdade é o
  // que separa "a fiação existe" de "a imagem aparece".
  const webp = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 90, b: 120 } },
  }).webp({ quality: 80 }).toBuffer();
  const sha = createHash("sha256").update(webp).digest("hex");
  const storagePath = `${campaignId}/${sha}.webp`;
  const { error: eUp } = await admin.storage.from("vtt-imagens")
    .upload(storagePath, webp, { contentType: "image/webp", upsert: true });
  if (eUp) throw new Error(`upload da imagem: ${eUp.message}`);
  const { data: asset, error: eAsset } = await admin.from("vtt_image_assets").insert({
    campaign_id: campaignId, storage_path: storagePath, sha256: sha, mime: "image/webp",
    bytes: webp.byteLength, width_px: 64, height_px: 64, estado: "ready", uploaded_by: narradorId,
  }).select("id").single();
  if (eAsset) throw new Error(`asset: ${eAsset.message}`);
  const { error: eColoc } = await admin.from("vtt_scene_images").insert({
    scene_id: doca, campaign_id: campaignId, image_id: asset!.id, papel: "fundo",
    centro_q: 10, centro_r: 8, largura_m: 20, criador_id: narradorId,
  });
  if (eColoc) throw new Error(`colocação: ${eColoc.message}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao } = await anon.auth.signInWithPassword({ email, password: senha });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({
      access_token: sessao!.session!.access_token,
      refresh_token: sessao!.session!.refresh_token,
    }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    await page.locator('[data-testid="barra-cenas"]').click();
    await page.waitForSelector('[data-testid="cenas-lista"]', { timeout: 5000 });

    console.log("\n— A miniatura —");
    const imgDoca = cartao(page, "Doca Norte").locator(".rv-cena-mini-img");
    criterio("a cena com fundo mostra miniatura",
      await imgDoca.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    // ESPERA o carregamento antes de medir. Ler `naturalWidth` assim
    // que o elemento aparece mede a corrida, não a imagem — e foi
    // exatamente o que a primeira versão fez, acusando uma falha que
    // não existia.
    const largura = await imgDoca.evaluate(async (el) => {
      const img = el as HTMLImageElement;
      if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
      return img.naturalWidth;
    }).catch(() => 0);
    criterio("e a imagem CARREGA de fato (não é só um src)", largura > 0, `naturalWidth ${largura}`);
    criterio("a cena sem fundo cai na inicial do nome",
      (await cartao(page, "Casa de Máquinas").locator(".rv-cena-mini").textContent())?.trim() === "C",
      `veio "${(await cartao(page, "Casa de Máquinas").locator(".rv-cena-mini").textContent())?.trim()}"`);

    console.log("\n— O menu —");
    await cartao(page, "Ponte Quebrada").locator('[data-testid="cena-menu"]').click();
    criterio("o menu abre", await page.locator('[data-testid="cena-menu-lista"]').isVisible());
    await page.keyboard.press("Escape");
    criterio("Escape fecha o menu",
      await page.locator('[data-testid="cena-menu-lista"]').count() === 0);

    console.log("\n— A cena apresentada é protegida —");
    await cartao(page, "Doca Norte").locator('[data-testid="cena-menu"]').click();
    criterio("arquivar fica desabilitado na cena apresentada",
      await page.locator('[data-testid="cena-arquivar"]').isDisabled());
    criterio("excluir também",
      await page.locator('[data-testid="cena-excluir"]').isDisabled());
    await page.keyboard.press("Escape");

    console.log("\n— Duplicar —");
    await noMenu(page, "Ponte Quebrada", "cena-duplicar");
    criterio("oferece os dois modos",
      await page.locator('[data-testid="cena-duplicar-opcoes"]').isVisible());
    await page.locator('[data-testid="cena-duplicar-completa"]').click();
    await page.waitForFunction(
      () => document.body.textContent?.includes("Ponte Quebrada (cópia)") === true,
      undefined, { timeout: 15000 },
    );
    const listaComCopia = await nomes(page);
    criterio("a cópia entra no fim do catálogo",
      listaComCopia[listaComCopia.length - 1] === "Ponte Quebrada (cópia)",
      listaComCopia.join(" | "));
    criterio("duplicar não abriu a cópia",
      !(await cenaNaTela(page)).includes("(cópia)"));

    console.log("\n— Arquivar e a aba de arquivo —");
    criterio("sem arquivo, o botão do arquivo não existe",
      await page.locator('[data-testid="cenas-ver-arquivo"]').count() === 0);
    await noMenu(page, "Ponte Quebrada (cópia)", "cena-arquivar");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="cenas-ver-arquivo"]') !== null,
      undefined, { timeout: 15000 },
    );
    criterio("a arquivada sai do catálogo",
      !(await nomes(page)).includes("Ponte Quebrada (cópia)"), (await nomes(page)).join(" | "));
    criterio("e o botão do arquivo aparece contando 1",
      (await page.locator('[data-testid="cenas-ver-arquivo"]').textContent())?.includes("(1)") === true);

    await page.locator('[data-testid="cenas-ver-arquivo"]').click();
    criterio("a aba de arquivo mostra a cena",
      (await nomes(page)).includes("Ponte Quebrada (cópia)"), (await nomes(page)).join(" | "));
    criterio("com o selo de arquivada",
      await cartao(page, "Ponte Quebrada (cópia)").locator('.rv-cena-selo[data-tipo="arquivo"]').count() === 1);
    criterio("e sem o botão de apresentar",
      await cartao(page, "Ponte Quebrada (cópia)").locator('[data-testid="cena-apresentar"]').count() === 0);
    criterio("criar some na aba de arquivo",
      await page.locator('[data-testid="cena-nova"]').count() === 0);

    console.log("\n— Restaurar —");
    await noMenu(page, "Ponte Quebrada (cópia)", "cena-restaurar");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="cenas-ver-arquivo"]') === null
        || document.querySelector('[data-testid="cenas-ver-arquivo"]')?.textContent?.includes("(0)") === true,
      undefined, { timeout: 15000 },
    ).catch(() => { /* o critério abaixo julga */ });
    // Depois de restaurar, o arquivo fica vazio; a janela continua na
    // aba dele, mostrando o estado vazio — voltar sozinha ao catálogo
    // seria a tela decidindo por quem clicou.
    criterio("o arquivo fica vazio",
      await page.locator('[data-testid="cenas-vazio"]').count() === 1);
    await page.locator('[data-testid="cenas-ver-arquivo"]').click();
    criterio("a restaurada voltou ao catálogo",
      (await nomes(page)).includes("Ponte Quebrada (cópia)"), (await nomes(page)).join(" | "));

    console.log("\n— Arquivar a cena que o narrador está OLHANDO —");
    await cartao(page, "Casa de Máquinas").locator('[data-testid="cena-abrir"]').click();
    await page.waitForFunction(
      () => document.querySelector(".rv-cena")?.textContent?.includes("Casa de Máquinas") === true,
      undefined, { timeout: 15000 },
    );
    criterio("ele está na Casa de Máquinas", (await cenaNaTela(page)).includes("Casa de Máquinas"));
    await noMenu(page, "Casa de Máquinas", "cena-arquivar");
    criterio("arquivar tira ele de lá e o leva ao palco",
      await page.waitForFunction(
        () => document.querySelector(".rv-cena")?.textContent?.includes("Doca Norte") === true,
        undefined, { timeout: 20000 },
      ).then(() => true).catch(() => false),
      `ficou em [${await cenaNaTela(page)}]`);

    console.log("\n— Excluir —");
    await noMenu(page, "Ponte Quebrada (cópia)", "cena-excluir");
    criterio("pede confirmação",
      await page.locator('[data-testid="cena-excluir-confirma"]').isVisible());
    criterio("o botão nasce desabilitado",
      await page.locator('[data-testid="cena-excluir-confirmar"]').isDisabled());
    await page.locator('[data-testid="cena-excluir-campo"]').fill("nome errado");
    criterio("continua desabilitado com o nome errado",
      await page.locator('[data-testid="cena-excluir-confirmar"]').isDisabled());
    await page.locator('[data-testid="cena-excluir-campo"]').fill("Ponte Quebrada (cópia)");
    criterio("habilita com o nome certo",
      await page.locator('[data-testid="cena-excluir-confirmar"]').isEnabled());
    await page.locator('[data-testid="cena-excluir-confirmar"]').click();
    await page.waitForFunction(
      () => document.body.textContent?.includes("Ponte Quebrada (cópia)") !== true,
      undefined, { timeout: 15000 },
    );
    criterio("a cena some do catálogo",
      !(await nomes(page)).includes("Ponte Quebrada (cópia)"), (await nomes(page)).join(" | "));
    criterio("e do banco",
      (await admin.from("vtt_scenes").select("id")
        .eq("campaign_id", campaignId).eq("nome", "Ponte Quebrada (cópia)")).data?.length === 0);

    await page.locator('[data-testid="janela-cenas"]')
      .screenshot({ path: "scripts/dev/.artefatos-visuais/catalogo-cenas-arquivo.png" });

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.storage.from("vtt-imagens").remove([storagePath]).catch(() => {});
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
