/**
 * Pastas e busca NA TELA (fase 5).
 *
 * As regras de grafo estão em `check-vtt-pastas.ts`, no banco. Aqui o
 * que se verifica é o que só existe na interface: navegar, o
 * breadcrumb, arrastar uma cena para dentro de uma pasta e para fora
 * dela, e a busca achatando a hierarquia.
 *
 * O arrasto é o gesto central desta fase e o mais fácil de escrever
 * "quase certo": `dragTo` do Playwright dispara a sequência HTML5
 * inteira, que é o que os handlers de `dragover`/`drop` esperam.
 *
 * Uso: npx tsx scripts/dev/check-vtt-pastas-ui.ts
 *      (precisa do `npm run dev` rodando)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
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

const cartao = (page: Page, nome: string) =>
  page.locator('[data-testid="cena-cartao"]').filter({ hasText: nome });
const linhaPasta = (page: Page, nome: string) =>
  page.locator('[data-testid="pasta-linha"]').filter({ hasText: nome });

const nomesCenas = (page: Page) =>
  page.locator('[data-testid="cena-cartao"] .rv-cena-nome').allTextContents();
const nomesPastas = (page: Page) =>
  page.locator('[data-testid="pasta-linha"] .rv-pasta-nome-txt').allTextContents();

async function main() {
  const email = `check-pastasui-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora" },
  });
  const narradorId = u!.user!.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Pastas na tela", owner_id: narradorId });

  // Cinco cenas: o campo de busca só aparece acima de quatro, e a
  // própria regra precisa ser exercitada.
  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 20, altura: 16, ordem: 1, ativa: false },
    { campaign_id: campaignId, nome: "Ponte Quebrada", largura: 20, altura: 16, ordem: 2, ativa: false },
    { campaign_id: campaignId, nome: "Mercado Velho", largura: 20, altura: 16, ordem: 3, ativa: false, local: "Bairro alto" },
    { campaign_id: campaignId, nome: "Torre do Sino", largura: 20, altura: 16, ordem: 4, ativa: false },
  ]).select("id, nome");
  const doca = cenas!.find((c) => c.nome === "Doca Norte")!.id as string;
  const maquinas = cenas!.find((c) => c.nome === "Casa de Máquinas")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });

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

    console.log("\n— Criar pasta —");
    criterio("a raiz é o único degrau no começo",
      (await page.locator('[data-testid="cenas-trilha"] .rv-pasta-degrau').allTextContents())
        .join("|") === "Catálogo");
    await page.locator('[data-testid="pasta-nova"]').click();
    await page.locator('[data-testid="pasta-nova-nome"]').fill("Ato I");
    await page.locator('[data-testid="pasta-nova-confirmar"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="pasta-linha"]').length === 1,
      undefined, { timeout: 15000 },
    );
    criterio("a pasta aparece na lista", (await nomesPastas(page)).includes("Ato I"));
    criterio("nasce vazia", (await linhaPasta(page, "Ato I").locator(".rv-pasta-contagem").textContent()) === "vazia");

    console.log("\n— Arrastar uma cena PARA a pasta —");
    await cartao(page, "Casa de Máquinas").dragTo(linhaPasta(page, "Ato I"));
    await page.waitForFunction(
      () => ![...document.querySelectorAll('[data-testid="cena-cartao"] .rv-cena-nome')]
        .some((n) => n.textContent?.includes("Casa de Máquinas")),
      undefined, { timeout: 15000 },
    );
    criterio("a cena sai da raiz",
      !(await nomesCenas(page)).includes("Casa de Máquinas"), (await nomesCenas(page)).join(" | "));
    criterio("a pasta passa a contar 1",
      (await linhaPasta(page, "Ato I").locator(".rv-pasta-contagem").textContent()) === "1 cena");
    const { data: noBanco } = await admin.from("vtt_scenes").select("folder_id").eq("id", maquinas).single();
    criterio("e o banco registrou", noBanco?.folder_id !== null);

    console.log("\n— Entrar e o breadcrumb —");
    await linhaPasta(page, "Ato I").locator('[data-testid="pasta-abrir"]').click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-testid="cena-cartao"] .rv-cena-nome')]
        .some((n) => n.textContent?.includes("Casa de Máquinas")),
      undefined, { timeout: 15000 },
    );
    criterio("dentro da pasta aparece a cena movida",
      (await nomesCenas(page)).join("|") === "Casa de Máquinas", (await nomesCenas(page)).join(" | "));
    criterio("o breadcrumb ganhou o degrau",
      (await page.locator('[data-testid="cenas-trilha"] .rv-pasta-degrau').allTextContents())
        .join(" / ") === "Catálogo / Ato I");

    console.log("\n— Arrastar de volta PARA FORA, pelo breadcrumb —");
    await cartao(page, "Casa de Máquinas").dragTo(page.locator('[data-testid="trilha-raiz"]'));
    await page.waitForFunction(
      () => document.querySelector('[data-testid="cenas-vazio"]') !== null,
      undefined, { timeout: 15000 },
    );
    criterio("a pasta ficou vazia", await page.locator('[data-testid="cenas-vazio"]').count() === 1);
    const { data: voltou } = await admin.from("vtt_scenes").select("folder_id").eq("id", maquinas).single();
    criterio("o banco registrou a volta para a raiz", voltou?.folder_id === null);

    await page.locator('[data-testid="trilha-raiz"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"]').length === 5,
      undefined, { timeout: 15000 },
    );
    criterio("de volta na raiz, as cinco cenas", (await nomesCenas(page)).length === 5);

    console.log("\n— Busca —");
    criterio("o campo de busca existe com cinco cenas",
      await page.locator('[data-testid="cenas-busca"]').count() === 1);
    await page.locator('[data-testid="cenas-busca"]').fill("ponte");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"]').length === 1,
      undefined, { timeout: 10000 },
    );
    criterio("filtra pelo nome", (await nomesCenas(page)).join("|") === "Ponte Quebrada");
    criterio("o breadcrumb some durante a busca",
      await page.locator('[data-testid="cenas-trilha"]').count() === 0);

    await page.locator('[data-testid="cenas-busca"]').fill("bairro");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"]').length === 1,
      undefined, { timeout: 10000 },
    );
    criterio("também acha pelo LOCAL", (await nomesCenas(page)).join("|") === "Mercado Velho");

    // A busca tem que atravessar pasta: é o motivo de ela existir.
    await page.locator('[data-testid="cenas-busca"]').fill("");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"]').length === 5,
      undefined, { timeout: 10000 },
    );
    await cartao(page, "Torre do Sino").dragTo(linhaPasta(page, "Ato I"));
    await page.waitForFunction(
      () => ![...document.querySelectorAll('[data-testid="cena-cartao"] .rv-cena-nome')]
        .some((n) => n.textContent?.includes("Torre do Sino")),
      undefined, { timeout: 15000 },
    );
    await page.locator('[data-testid="cenas-busca"]').fill("torre");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"]').length === 1,
      undefined, { timeout: 10000 },
    );
    criterio("a busca ATRAVESSA a pasta",
      (await nomesCenas(page)).join("|") === "Torre do Sino", (await nomesCenas(page)).join(" | "));
    criterio("e o resultado diz em que pasta a cena está",
      (await cartao(page, "Torre do Sino").locator('.rv-cena-local[data-tipo="pasta"]').textContent()) === "Ato I");
    criterio("reordenar fica indisponível na busca",
      await cartao(page, "Torre do Sino").locator('button[aria-label^="Mover"]').first().isDisabled());

    await page.locator('[data-testid="cenas-busca"]').fill("");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="cenas-trilha"]') !== null,
      undefined, { timeout: 10000 },
    );

    await page.locator('[data-testid="janela-cenas"]')
      .screenshot({ path: "scripts/dev/.artefatos-visuais/catalogo-cenas-pastas.png" });

    console.log("\n— Excluir a pasta não apaga a cena —");
    await linhaPasta(page, "Ato I").locator('[data-testid="pasta-excluir"]').click();
    await page.locator('[data-testid="pasta-excluir-confirmar"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="pasta-linha"]').length === 0,
      undefined, { timeout: 15000 },
    );
    criterio("a pasta some", (await nomesPastas(page)).length === 0);
    criterio("e a cena que estava dentro voltou para a raiz",
      (await nomesCenas(page)).includes("Torre do Sino"), (await nomesCenas(page)).join(" | "));

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scene_folders").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
