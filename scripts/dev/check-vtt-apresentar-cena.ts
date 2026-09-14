/**
 * O ACEITE DA FASE 3: "todos os jogadores online chegam à nova cena sem
 * recarregar a página."
 *
 * Isso só pode ser verificado com DUAS abas vivas ao mesmo tempo — uma
 * do narrador, uma do jogador —, e a aba do jogador nunca sendo
 * recarregada depois que a mesa abre. Qualquer `reload()` no meio
 * invalidaria o teste inteiro: provaria que a cena nova carrega, que é
 * outra coisa, e justamente a coisa que a fase 2 já provava.
 *
 * Cobre também as duas metades que a publicação tem de garantir juntas:
 * o jogador VAI e o narrador FICA.
 *
 * E a reconciliação: um cliente que perdeu o evento porque estava
 * offline não pode continuar jogando numa cena que a mesa abandonou.
 *
 * Uso: npx tsx scripts/dev/check-vtt-apresentar-cena.ts
 *      (precisa do `npm run dev` rodando)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { limparCampanhasDeTeste } from "./limparCampanhaDeTeste";

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

async function palcoDoBanco(campaignId: string): Promise<string | null> {
  const { data } = await admin.from("vtt_campaign_stage")
    .select("presented_scene_id").eq("campaign_id", campaignId).maybeSingle();
  return (data?.presented_scene_id as string | undefined) ?? null;
}

/** O nome da cena que ESTA aba está mostrando, lido do bloco de cena. */
async function cenaNaTela(page: Page): Promise<string> {
  return (await page.locator(".rv-cena").first().textContent())?.trim() ?? "";
}

async function esperarCenaNaTela(page: Page, nome: string, ms = 20000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (n) => document.querySelector(".rv-cena")?.textContent?.includes(n) === true,
      nome, { timeout: ms },
    );
    return true;
  } catch { return false; }
}

async function abrirMesa(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  token: { access_token: string; refresh_token: string },
  campaignId: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify(token),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
  return { ctx, page };
}

async function main() {
  const marca = Date.now();
  const senha = randomUUID();
  const { data: uN } = await admin.auth.admin.createUser({
    email: `check-apresentar-n-${marca}@ruptura.dev`, password: senha, email_confirm: true,
    user_metadata: { display_name: "Narradora" },
  });
  const { data: uJ } = await admin.auth.admin.createUser({
    email: `check-apresentar-j-${marca}@ruptura.dev`, password: senha, email_confirm: true,
    user_metadata: { display_name: "Jogador" },
  });
  const narradorId = uN!.user!.id;
  const jogadorId = uJ!.user!.id;

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Apresentar cena", owner_id: narradorId });
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogadorId, role: "player" });

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 20, altura: 16, ordem: 1, ativa: false },
    { campaign_id: campaignId, nome: "Ponte Quebrada", largura: 20, altura: 16, ordem: 2, ativa: false },
  ]).select("id, nome");
  const porNome = new Map(cenas!.map((c) => [c.nome as string, c.id as string]));
  const doca = porNome.get("Doca Norte")!;
  const maquinas = porNome.get("Casa de Máquinas")!;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sN } = await anon.auth.signInWithPassword({
    email: `check-apresentar-n-${marca}@ruptura.dev`, password: senha,
  });
  const { data: sJ } = await anon.auth.signInWithPassword({
    email: `check-apresentar-j-${marca}@ruptura.dev`, password: senha,
  });

  const browser = await chromium.launch({ headless: true });
  let ctxN: BrowserContext | null = null;
  let ctxJ: BrowserContext | null = null;

  try {
    const narrador = await abrirMesa(browser, sN!.session!, campaignId);
    const jogador = await abrirMesa(browser, sJ!.session!, campaignId);
    ctxN = narrador.ctx;
    ctxJ = jogador.ctx;

    console.log("\n— O ponto de partida —");
    criterio("os dois abrem na cena apresentada",
      (await cenaNaTela(jogador.page)).includes("Doca Norte")
      && (await cenaNaTela(narrador.page)).includes("Doca Norte"),
      `narrador [${await cenaNaTela(narrador.page)}] jogador [${await cenaNaTela(jogador.page)}]`);

    // O narrador vai preparar OUTRA cena, sem mexer na mesa (fase 2).
    // É o que torna o teste seguinte honesto: se ele estivesse na
    // mesma cena que vai apresentar, "o narrador não se moveu" passaria
    // sozinho.
    await narrador.page.locator('[data-testid="cena-chip"]').click();
    await narrador.page.waitForSelector('[data-testid="cenas-lista"]', { timeout: 5000 });
    await narrador.page.locator('[data-testid="cena-cartao"]').filter({ hasText: "Ponte Quebrada" })
      .locator('[data-testid="cena-abrir"]').click();
    criterio("o narrador foi preparar a Ponte Quebrada",
      await esperarCenaNaTela(narrador.page, "Ponte Quebrada"));
    criterio("e o jogador continuou na Doca",
      (await cenaNaTela(jogador.page)).includes("Doca Norte"));

    console.log("\n— Apresentar —");
    const urlJogadorAntes = jogador.page.url();
    await narrador.page.locator('[data-testid="cena-cartao"]').filter({ hasText: "Casa de Máquinas" })
      .locator('[data-testid="cena-apresentar"]').click();

    criterio("o jogador vê o aviso de que a cena mudou",
      await jogador.page.locator('[data-testid="aviso-palco"]')
        .waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    criterio("o jogador CHEGA na cena nova",
      await esperarCenaNaTela(jogador.page, "Casa de Máquinas"),
      `ficou em [${await cenaNaTela(jogador.page)}]`);
    // A prova de que não houve recarga: nenhum `reload()` foi chamado e
    // a URL é a mesma de antes. Se a mesa tivesse navegado, o teste
    // estaria medindo outra coisa.
    criterio("sem recarregar a página", jogador.page.url() === urlJogadorAntes);

    criterio("o NARRADOR não foi arrastado junto",
      (await cenaNaTela(narrador.page)).includes("Ponte Quebrada"),
      `foi parar em [${await cenaNaTela(narrador.page)}]`);
    criterio("o palco no banco é a cena nova", await palcoDoBanco(campaignId) === maquinas);

    console.log("\n— O selo do catálogo acompanha —");
    criterio('"Jogadores aqui" migrou para a Casa de Máquinas',
      await narrador.page.waitForFunction(() => {
        const cartoes = [...document.querySelectorAll('[data-testid="cena-cartao"]')];
        const comSelo = cartoes.find((c) => c.querySelector('.rv-cena-selo[data-tipo="mesa"]'));
        return comSelo?.textContent?.includes("Casa de Máquinas") === true;
      }, undefined, { timeout: 20000 }).then(() => true).catch(() => false));

    console.log("\n— Reconciliação de quem estava offline —");
    // O canal não guarda histórico. Sem reler o palco ao reconectar, o
    // jogador seguiria jogando numa cena que a mesa já abandonou, sem
    // nada na tela denunciando.
    // Offline LONGO de propósito. Um corte curto não derruba o
    // WebSocket: o Phoenix retoma e entrega o que ficou pendente, e o
    // teste passaria mesmo sem reconciliação nenhuma — foi o que
    // aconteceu com 1,5s. O que esta fase precisa cobrir é a queda de
    // verdade (o laptop que dormiu, o túnel), em que o evento se perde
    // e só reler o palco traz o cliente de volta. Daí esperar o
    // heartbeat falhar.
    await ctxJ.setOffline(true);
    await new Promise((r) => setTimeout(r, 45000));
    await narrador.page.locator('[data-testid="cena-cartao"]').filter({ hasText: "Doca Norte" })
      .locator('[data-testid="cena-apresentar"]').click();
    await admin.from("vtt_campaign_stage").select("presented_scene_id").eq("campaign_id", campaignId).maybeSingle();
    criterio("enquanto offline, o jogador NÃO acompanhou",
      (await cenaNaTela(jogador.page)).includes("Casa de Máquinas"));

    await ctxJ.setOffline(false);
    criterio("ao voltar, ele reconcilia e chega na cena certa",
      await esperarCenaNaTela(jogador.page, "Doca Norte", 45000),
      `ficou em [${await cenaNaTela(jogador.page)}]`);
    criterio("ainda sem recarregar", jogador.page.url() === urlJogadorAntes);

  } finally {
    await ctxN?.close().catch(() => {});
    await ctxJ?.close().catch(() => {});
    await browser.close();
    // Ordem canônica e compartilhada — ver `limparCampanhaDeTeste.ts`.
    // Cada limpeza escrita à mão tinha uma ordem própria, e o schema
    // mudou por baixo de todas: FKs de palco e de imagem RECUSAM a
    // exclusão em vez de cascatear, e o erro sumia sem ninguém olhar.
    const { restos } = await limparCampanhasDeTeste(admin, {
      campanhas: [campaignId], usuarios: [narradorId, jogadorId],
    });
    criterio("Z (limpeza de fixtures)", restos.length === 0, restos.join("; "));
    // O resumo sai DEPOIS da limpeza: antes, ele afirmava "0 falhas"
    // sem saber o que a limpeza ia encontrar.
    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
