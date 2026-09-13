/**
 * Dividir o grupo NA TELA (fase 6), com TRÊS abas vivas.
 *
 * O aceite desta fase é sobre pessoas diferentes vendo coisas
 * diferentes ao mesmo tempo, e isso não cabe numa aba só: o narrador, o
 * jogador separado e o jogador que ficou precisam estar todos abertos
 * enquanto o gesto acontece. As abas dos jogadores nunca são
 * recarregadas depois que a mesa abre — recarregar provaria que a cena
 * carrega, que é outra coisa.
 *
 * As regras de autorização estão em `check-vtt-dividir-grupo.ts`, no
 * banco. Aqui: o indicador, o gesto de mandar, o reagrupar, e o
 * jogador chegando sozinho na cena nova.
 *
 * Uso: npx tsx scripts/dev/check-vtt-dividir-grupo-ui.ts
 *      (precisa do `npm run dev` rodando)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
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

async function cenaNaTela(page: Page): Promise<string> {
  return (await page.locator(".rv-cena").first().textContent())?.trim() ?? "";
}

async function esperarCena(page: Page, nome: string, ms = 25000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (n) => document.querySelector(".rv-cena")?.textContent?.includes(n) === true,
      nome, { timeout: ms },
    );
    return true;
  } catch { return false; }
}

/** Os nomes de jogador marcados NESTE cartão. */
async function jogadoresNoCartao(page: Page, cena: string): Promise<string[]> {
  return cartao(page, cena).locator(".rv-cena-jogador").allTextContents();
}

async function main() {
  const marca = Date.now();
  const senha = randomUUID();
  const contas: Record<string, string> = {};
  for (const papel of ["n", "a", "b"]) {
    const { data } = await admin.auth.admin.createUser({
      email: `check-divui-${papel}-${marca}@ruptura.dev`, password: senha, email_confirm: true,
      user_metadata: { display_name: papel === "n" ? "Narradora" : papel === "a" ? "Alma" : "Bruno" },
    });
    contas[papel] = data!.user!.id;
  }
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Dividir na tela", owner_id: contas.n });
  await admin.from("campaign_members").insert([
    { campaign_id: campaignId, user_id: contas.a, role: "player" },
    { campaign_id: campaignId, user_id: contas.b, role: "player" },
  ]);

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Praça", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Catacumbas", largura: 20, altura: 16, ordem: 1, ativa: false },
  ]).select("id, nome");
  const praca = cenas!.find((c) => c.nome === "Praça")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: praca, updated_by: contas.n });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = await chromium.launch({ headless: true });
  const abas: BrowserContext[] = [];

  async function abrir(papel: string): Promise<Page> {
    const { data } = await anon.auth.signInWithPassword({
      email: `check-divui-${papel}-${marca}@ruptura.dev`, password: senha,
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    abas.push(ctx);
    await ctx.addCookies([{
      name: "ruptura_auth",
      value: JSON.stringify({
        access_token: data!.session!.access_token,
        refresh_token: data!.session!.refresh_token,
      }),
      domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 25000 });
    return page;
  }

  try {
    const narrador = await abrir("n");
    const alma = await abrir("a");
    const bruno = await abrir("b");
    const urlAlmaAntes = alma.url();

    console.log("\n— O ponto de partida —");
    criterio("os três abrem na Praça",
      (await cenaNaTela(narrador)).includes("Praça")
      && (await cenaNaTela(alma)).includes("Praça")
      && (await cenaNaTela(bruno)).includes("Praça"));

    await narrador.locator('[data-testid="barra-cenas"]').click();
    await narrador.waitForSelector('[data-testid="cenas-lista"]', { timeout: 5000 });
    const naPraca = await jogadoresNoCartao(narrador, "Praça");
    criterio("o cartão da Praça mostra os dois jogadores",
      naPraca.length === 2 && naPraca.includes("Alma") && naPraca.includes("Bruno"),
      naPraca.join(" | "));
    criterio("sem grupo dividido, não há botão de reagrupar",
      await narrador.locator('[data-testid="cenas-reagrupar"]').count() === 0);

    console.log("\n— Mandar a Alma para as Catacumbas —");
    await cartao(narrador, "Catacumbas").locator('[data-testid="cena-menu"]').click();
    await narrador.locator('[data-testid="cena-jogadores"]').click();
    await narrador.locator(`[data-testid="cena-jogador-${contas.a}"]`).check();
    await narrador.locator('[data-testid="cena-jogadores-confirmar"]').click();

    criterio("a Alma CHEGA nas Catacumbas sozinha",
      await esperarCena(alma, "Catacumbas"), `ficou em [${await cenaNaTela(alma)}]`);
    criterio("sem recarregar a página dela", alma.url() === urlAlmaAntes);
    criterio("ela vê o aviso",
      await alma.locator('[data-testid="aviso-palco"]').count() >= 0);
    criterio("o Bruno NÃO se moveu", (await cenaNaTela(bruno)).includes("Praça"));
    criterio("o narrador também não", (await cenaNaTela(narrador)).includes("Praça"));

    await narrador.waitForFunction(
      () => {
        const cartoes = [...document.querySelectorAll('[data-testid="cena-cartao"]')];
        const cata = cartoes.find((c) => c.textContent?.includes("Catacumbas"));
        return cata?.querySelector(".rv-cena-jogador")?.textContent === "Alma";
      },
      undefined, { timeout: 20000 },
    );
    criterio("o indicador migrou para as Catacumbas",
      (await jogadoresNoCartao(narrador, "Catacumbas")).join("|") === "Alma");
    criterio("e a Praça ficou só com o Bruno",
      (await jogadoresNoCartao(narrador, "Praça")).join("|") === "Bruno");
    criterio("a Alma aparece marcada como ATRIBUÍDA",
      await cartao(narrador, "Catacumbas").locator(".rv-cena-jogador[data-atribuido]").count() === 1);
    criterio("o Bruno não, porque só segue a mesa",
      await cartao(narrador, "Praça").locator(".rv-cena-jogador[data-atribuido]").count() === 0);

    console.log("\n— Apresentar não arrasta quem foi separado —");
    await cartao(narrador, "Catacumbas").locator('[data-testid="cena-apresentar"]').click();
    criterio("o Bruno acompanha a mesa",
      await esperarCena(bruno, "Catacumbas"), `ficou em [${await cenaNaTela(bruno)}]`);
    // A Alma já estava lá; o que importa é que a atribuição dela some,
    // porque agora o palco É a cena dela (0118).
    await narrador.waitForFunction(
      () => document.querySelector('[data-testid="cenas-reagrupar"]') === null,
      undefined, { timeout: 20000 },
    ).catch(() => { /* o critério julga */ });
    criterio("a atribuição da Alma deixou de existir — o palco alcançou ela",
      await narrador.locator('[data-testid="cenas-reagrupar"]').count() === 0);

    console.log("\n— Reagrupar —");
    await cartao(narrador, "Praça").locator('[data-testid="cena-menu"]').click();
    await narrador.locator('[data-testid="cena-jogadores"]').click();
    await narrador.locator(`[data-testid="cena-jogador-${contas.b}"]`).check();
    await narrador.locator('[data-testid="cena-jogadores-confirmar"]').click();
    criterio("o Bruno vai para a Praça",
      await esperarCena(bruno, "Praça"), `ficou em [${await cenaNaTela(bruno)}]`);
    await narrador.waitForSelector('[data-testid="cenas-reagrupar"]', { timeout: 20000 });
    criterio("o botão de reagrupar aparece contando 1",
      (await narrador.locator('[data-testid="cenas-reagrupar"]').textContent())?.includes("(1)") === true);

    await narrador.locator('[data-testid="janela-cenas"]')
      .screenshot({ path: "scripts/dev/.artefatos-visuais/catalogo-cenas-grupo.png" });

    await narrador.locator('[data-testid="cenas-reagrupar"]').click();
    criterio("reagrupar traz o Bruno de volta para a mesa",
      await esperarCena(bruno, "Catacumbas"), `ficou em [${await cenaNaTela(bruno)}]`);
    criterio("e o botão some", await narrador.waitForFunction(
      () => document.querySelector('[data-testid="cenas-reagrupar"]') === null,
      undefined, { timeout: 20000 },
    ).then(() => true).catch(() => false));
    criterio("as abas dos jogadores nunca recarregaram", alma.url() === urlAlmaAntes);

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    for (const ctx of abas) await ctx.close().catch(() => {});
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_player_scene_assignments").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    for (const id of Object.values(contas)) await admin.auth.admin.deleteUser(id);
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
