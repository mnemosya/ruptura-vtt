/** TOK-06/07: fixtures isoladas, dois participantes e gesto real no mapa. */
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
config({ path: ".env.local", quiet: true });
const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const campanha = randomUUID(), personagem = randomUUID(), ator = randomUUID(), alvo = randomUUID(), oculto = randomUUID();
const usuarios: string[] = [];
const browser = await chromium.launch({ headless: true });
async function conta(nome: string) {
  const email = `tok07-${randomUUID()}@ruptura.dev`, password = randomUUID();
  const r = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: nome } });
  if (r.error) throw r.error;
  usuarios.push(r.data.user!.id);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sess = await client.auth.signInWithPassword({ email, password });
  if (sess.error) throw sess.error;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: sess.data.session!.access_token, refresh_token: sess.data.session!.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return { id: r.data.user!.id, client, page: await ctx.newPage() };
}
async function esperar(fn: () => Promise<boolean>, nome: string, ms = 15000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await fn()) { console.log(`ok - ${nome}`); return; } await new Promise(r => setTimeout(r, 200)); }
  throw new Error(`Tempo esgotado: ${nome}`);
}
const token = (p: Page, id: string) => p.locator(`.rv-token[data-token-id="${id}"]`);
async function clicar(p: Page, id: string, direito = false, shift = false) {
  const disco = token(p, id).locator('[data-token-disco]');
  const b = await disco.boundingBox();
  assert(b, `Token ${id} visível`);
  if (shift) await p.keyboard.down("Shift");
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: direito ? "right" : "left" });
  if (shift) await p.keyboard.up("Shift");
}
async function db(p: PromiseLike<{ error: unknown }>) { const r = await p; if (r.error) throw r.error; }
try {
  const n = await conta("Narrador QA"), j = await conta("Jogador QA"), estranho = await conta("Fora da mesa QA");
  await db(admin.from("campaigns").insert({ id: campanha, name: "QA targets temporária", owner_id: n.id }));
  await db(admin.from("campaign_members").insert({ campaign_id: campanha, user_id: j.id, role: "player", status: "active" }));
  await db(admin.from("characters").insert({ id: personagem, name: "Raven QA", status: "draft", campaign_id: campanha, owner_id: n.id,
    payload: { nome: "Raven QA", atributos: { corpo: 3, mente: 2, animo: 3 }, pericias: { luta: 2 }, estado_jogo: { pa_gastos: 99 }, metadados: { schema_version: 1 } } }));
  await n.page.goto(`http://localhost:3000/mesas/${campanha}`, { waitUntil: "networkidle" });
  await n.page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
  const cena = (await admin.from("vtt_scenes").select("id").eq("campaign_id", campanha).single()).data!.id;
  for (const [id, nome, q, visivel, character_id] of [[ator, "Raven QA", -4, true, personagem], [alvo, "Sentinela QA", 4, true, null], [oculto, "Segredo QA", 6, false, null]] as const) {
    await db(admin.from("vtt_tokens").insert({ id, scene_id: cena, campaign_id: campanha, nome, sigla: nome.slice(0, 2), q, r: 0, visivel, character_id }));
  }
  await Promise.all([n.page.reload({ waitUntil: "networkidle" }), j.page.goto(`http://localhost:3000/mesas/${campanha}`, { waitUntil: "networkidle" })]);
  await token(j.page, alvo).waitFor();
  await clicar(n.page, ator);
  await n.page.locator('.rv-cartao-token').waitFor({ timeout: 10000 });
  await clicar(n.page, alvo, false, true);
  assert.equal(await n.page.locator('.rv-token.is-sel').count(), 2, "Shift+esquerdo mantém seleção múltipla");
  await n.page.keyboard.press("Escape");
  console.log("ok - clique normal abre status; Shift+esquerdo preserva multisseleção");
  const erroOculto = await j.client.rpc("set_vtt_target", { p_scene_id: cena, p_token_id: oculto, p_selected: true });
  assert(erroOculto.error, "Jogador não marca oculto");
  const erroEstranho = await estranho.client.rpc("set_vtt_target", { p_scene_id: cena, p_token_id: alvo, p_selected: true });
  assert(erroEstranho.error, "Estranho não marca alvo");
  const erroAtor = await j.client.rpc("read_vtt_action_context", { p_actor_id: ator, p_target_id: alvo });
  assert(erroAtor.error, "Jogador não age com personagem alheio");
  console.log("ok - RPCs recusam token oculto, estranho e ator não controlado");
  assert.equal((await n.client.rpc("read_vtt_action_context", { p_actor_id: ator, p_target_id: oculto })).data?.logVisibility, "gm");
  assert((await j.client.from("vtt_targets").select("*")).error, "Tabela não permite ler alvos sem filtro autorizado");
  await clicar(j.page, alvo, true, true);
  await esperar(async () => (await j.client.rpc("read_vtt_targets", { p_scene_id: cena })).data?.some((t: { autorId: string }) => t.autorId === j.id), "Shift+direito persiste alvo");
  await esperar(async () => await token(n.page, alvo).locator(".rv-token-alvo").count() > 0, "outro participante vê alvo", 12000);
  assert.equal(await j.page.locator(".rv-menu-contextual").count(), 0, "Não abre menu ao targetar");
  await clicar(n.page, ator, true);
  const acaoMenu = n.page.getByRole("menuitem", { name: /Ações rápidas/ });
  assert.equal(await acaoMenu.locator("svg").count(), 1);
  assert.equal(await n.page.getByRole("menuitem", { name: "Marcar alvo" }).locator("svg").count(), 1);
  await n.page.screenshot({ path: "/tmp/tok07-menu.png" });
  await acaoMenu.click();
  await n.page.getByTestId("token-acoes-radial").getByRole("button", { name: "Atacar", exact: true }).click();
  const painel = n.page.getByTestId("token-acao-painel");
  await painel.waitFor({ timeout: 30000 });
  const antesArrasto = await painel.boundingBox();
  const cabecalho = painel.locator(".rc-picker-cab");
  const caixaCabecalho = await cabecalho.boundingBox();
  assert(antesArrasto && caixaCabecalho);
  await n.page.mouse.move(caixaCabecalho.x + 80, caixaCabecalho.y + caixaCabecalho.height / 2);
  await n.page.mouse.down(); await n.page.mouse.move(caixaCabecalho.x + 150, caixaCabecalho.y + caixaCabecalho.height / 2 + 45); await n.page.mouse.up();
  const depoisArrasto = await painel.boundingBox();
  assert(depoisArrasto && depoisArrasto.x > antesArrasto.x + 50 && depoisArrasto.y > antesArrasto.y + 25, "Janela deve acompanhar arrasto do cabeçalho");
  console.log("ok - janela de ação é arrastável pelo cabeçalho");
  await painel.getByText(/PA insuficiente/).waitFor();
  assert(await painel.getByRole("button", { name: /Ataque desarmado/ }).isEnabled());
  await painel.screenshot({ path: "/tmp/tok07-console-escolha.png" });
  await painel.getByRole("button", { name: /Ataque desarmado/ }).click();
  assert.equal(await n.page.getByTestId("painel-janela-fundo").count(), 0);
  await n.page.screenshot({ path: "/tmp/tok07-aguardando.png" });
  await clicar(n.page, alvo, true, true);
  await painel.getByRole("button", { name: /Sentinela QA/ }).waitFor({ timeout: 15000 });
  assert.equal(await painel.getByRole("button", { name: /Sentinela QA/ }).locator(".rv-token-flow__radio svg").count(), 1, "Alvo selecionado mostra check");
  assert.equal(await painel.getByRole("button", { name: "Confirmar ataque" }).isEnabled(), true);
  await n.page.screenshot({ path: "/tmp/tok07-alvo.png" });
  console.log("ok - janela não bloqueia mapa; target marcado com janela aberta habilita confirmar");
  await painel.getByRole("button", { name: "Confirmar ataque" }).click();
  await painel.waitFor({ state: "detached", timeout: 15000 });
  await n.page.getByTestId("console-painel-rolagem").waitFor({ timeout: 15000 });
  console.log("ok - confirmação fecha a janela de ação e deixa apenas a rolagem");
  await esperar(async () => {
    const r = await admin.from("table_logs").select("payload").eq("campaign_id", campanha).eq("type", "action_used");
    return r.data?.some(t => t.payload.alvoTokenId === alvo && t.payload.actorTokenId === ator) ?? false;
  }, "ação confirma custo e publica alvo correto");
  await clicar(j.page, alvo, true, true);
  await esperar(async () => {
    const r = await n.client.rpc("read_vtt_targets", { p_scene_id: cena });
    return r.data?.length === 1 && r.data[0].autorId === n.id;
  }, "desmarcar remove só o próprio alvo");
  const preparo = randomUUID();
  await db(admin.from("vtt_scenes").insert({ id: preparo, campaign_id: campanha, nome: "Preparação privada", largura: 10, altura: 10, ordem: 1, ativa: false }));
  assert.deepEqual((await j.client.rpc("read_vtt_targets", { p_scene_id: preparo })).data, []);
  assert.equal((await j.client.rpc("vtt_targets_channel_autorizado", { p_topic: `campaign:${campanha}:scene:${preparo}:vtt:targets` })).data, false);
  assert.equal((await n.client.rpc("vtt_targets_channel_autorizado", { p_topic: `campaign:${campanha}:scene:${preparo}:vtt:targets` })).data, true);
  console.log("ok - cena não apresentada e canal privados do narrador");
  console.log("PASSOU: targets, permissões, sincronização e confirmação de ataque");
} finally {
  await browser.close();
  await admin.from("table_logs").delete().eq("campaign_id", campanha);
  await admin.from("vtt_tokens").delete().eq("campaign_id", campanha);
  await admin.from("characters").delete().eq("id", personagem);
  await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campanha);
  await admin.from("vtt_scenes").delete().eq("campaign_id", campanha);
  await admin.from("campaign_members").delete().eq("campaign_id", campanha);
  await admin.from("campaigns").delete().eq("id", campanha);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  console.log("Fixtures temporárias removidas.");
}
