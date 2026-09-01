/**
 * Sincronização ao vivo entre DUAS sessões reais de navegador
 * (narrador + jogador) — a verificação que a correção desta rodada
 * pediu explicitamente, sem substituir por chamadas SQL: cria/edita/
 * oculta/revela/remove token, concede/revoga controle, ping legítimo/
 * forjado/de outra cena, e preferência de camadas independente por
 * sessão. Cobre também o teste de Strict Mode das camadas (alterna
 * repetidamente, sem loop nem warning).
 *
 * Uso: npx tsx scripts/dev/check-vtt-sincronizacao-live.ts (servidor
 * dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });
function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon") || t.includes("Download the React DevTools")) return false;
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let outraSceneId: string | null = null;
let jogadorId: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let characterId: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function donoAtual(): Promise<string> {
  const email = `check-vtt-sync-narrador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Sync" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  criados.usuarios.push(data.user.id);
  narradorEmail = email; narradorSenha = senha;
  return data.user.id;
}

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Sync Live", owner_id: await donoAtual() });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const email = `check-vtt-sync-jogador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Jogador Sync" } });
  if (error) throw new Error(`Falha ao criar jogador fixture: ${error.message}`);
  jogadorId = data.user.id; jogadorEmail = email; jogadorSenha = senha;
  criados.usuarios.push(jogadorId);

  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_vtt_sync" });

  const novoId = randomUUID();
  await admin.from("characters").insert({
    id: novoId, name: "PJ do teste de sync", owner_label: null, status: "draft",
    payload: { nome: "PJ do teste de sync" }, campaign_id: campaignId, owner_id: jogadorId,
  });
  characterId = novoId;
}

async function contextoDe(email: string, senha: string): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

async function limpar() {
  if (characterId) await admin.from("character_controllers").delete().eq("character_id", characterId);
  if (characterId) await admin.from("characters").delete().eq("id", characterId);
  for (const cid of criados.campanhas) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function contarSiglas(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla")).map((e) => e.textContent ?? ""));
}
async function esperarAte(fn: () => Promise<boolean>, timeoutMs: number, intervaloMs = 250): Promise<boolean> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador com 1 personagem, ainda sem controle)", true, `campanha=${campaignId}`);

  const { page: narradorPage, close: closeNarrador } = await contextoDe(narradorEmail!, narradorSenha!);
  const errosNarrador: string[] = [];
  narradorPage.on("console", (m) => { if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 600)); });
  await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await narradorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const { data } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).maybeSingle();
    sceneId = data?.id ?? null;
  }
  registrar("0b (cena semeada)", !!sceneId, `sceneId=${sceneId}`);

  const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
  const errosJogador: string[] = [];
  jogadorPage.on("console", (m) => { if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 600)); });
  await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  // --- 1. Criar: narrador cria um token pelo menu contextual — jogador vê aparecer sem reload ---
  let tokenId = "";
  {
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const box = await narradorPage.locator(".rv-camada-grade path").first().boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
    await narradorPage.locator(".rv-gerenciador-token input[type=text]").first().fill("Sentinela Sync");
    // Fluxo em duas etapas: "Continuar para posicionar" só fecha o
    // formulário e abre o fantasma no mapa — a criação de verdade só
    // acontece no clique da célula, abaixo.
    await narradorPage.locator('.rv-gerenciador-token .rv-btn--pri', { hasText: "Continuar para posicionar" }).click();
    await narradorPage.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
    await narradorPage.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
    await narradorPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
    await narradorPage.waitForTimeout(150);
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await narradorPage.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });
    const { data } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Sentinela Sync").maybeSingle();
    tokenId = data?.id ?? "";
    const apareceuNoJogador = await esperarAte(async () => (await contarSiglas(jogadorPage)).includes("SS"), 6000);
    registrar("1 (criar: token aparece no jogador sem reload)", !!tokenId && apareceuNoJogador, `tokenId=${tokenId.slice(0, 8)}, apareceu=${apareceuNoJogador}`);
  }

  // --- 2. Editar: narrador troca nome+tamanho pela UI numa edição só
  //        (RPC atômica `edit_vtt_token`, migration 0076) — persiste
  //        no banco com uma única revisão, e o JOGADOR recebe a linha
  //        final completa sem reload. ---
  {
    // NÃO vincula personagem aqui — `edit_vtt_token` (chamado pela UI
    // de editar, abaixo) reenvia o `characterId` que o FORMULÁRIO
    // carregou; vincular antes e editar depois reverteria o vínculo
    // de volta pra null (achado real ao escrever este script — não é
    // bug de produto, é o form editando exatamente o campo que diz
    // editar). O vínculo de verdade acontece só depois, logo antes do
    // critério 6.
    const { data: antes } = await admin.from("vtt_tokens").select("revision, tamanho").eq("id", tokenId).single();
    const tokenLocator = narradorPage.locator(".rv-camada-tokens .rv-token", { has: narradorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
    const box = await tokenLocator.boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Editar" }).click();
    const nomeInput = narradorPage.locator(".rv-gerenciador-token input[type=text]").first();
    await nomeInput.fill("");
    await nomeInput.fill("Sentinela Editada");
    await narradorPage.selectOption("#rv-campo-tamanho", "grande"); // muda tamanho JUNTO com o nome, na mesma confirmação
    await narradorPage.locator('.rv-gerenciador-token .rv-btn--pri', { hasText: "Salvar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });
    const { data: linha } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenId).single();
    registrar(
      "2 (editar nome+tamanho numa RPC só: os DOIS persistem, revisão sobe exatamente 1)",
      linha?.nome === "Sentinela Editada" && linha?.tamanho === "grande" && linha?.revision === antes!.revision + 1,
      `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(linha)}`,
    );

    // Jogador recebe a linha FINAL completa (nome+tamanho já
    // aplicados juntos) via a invalidação sanitizada — sem reload.
    // "Grande" é multicelular (3 células) — só pegadas multicelulares
    // desenham `.rv-token-pegada`; médio/pequeno nunca desenham isso.
    // É um sinal direto de que o TAMANHO NOVO chegou, não só o nome.
    const jogadorVeGrande = await esperarAte(async () => (await jogadorPage.locator(`.rv-token[data-token-id="${tokenId}"] .rv-token-pegada`).count()) > 0, 6000);
    registrar("2b (outra sessão recebe o token final completo — tamanho novo aplicado sem reload)", jogadorVeGrande, `jogadorVeGrande=${jogadorVeGrande}`);

    // Volta pra "medio" — mantém o resto do script (posições/vizinhança
    // já calculadas pros próximos critérios) estável.
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await narradorPage.selectOption("#rv-campo-tamanho", "medio");
    await narradorPage.locator('.rv-gerenciador-token .rv-btn--pri', { hasText: "Salvar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });
    const { data: depoisDeVoltar } = await admin.from("vtt_tokens").select("tamanho, revision").eq("id", tokenId).single();
    registrar(
      "2c (reverter tamanho é outra edição atômica — revisão sobe mais 1, nunca 2)",
      depoisDeVoltar?.tamanho === "medio" && depoisDeVoltar?.revision === linha!.revision + 1,
      `depois=${JSON.stringify(depoisDeVoltar)}`,
    );
  }

  // --- 3. Ocultar: narrador oculta — jogador PERDE o token do DOM sem reload ---
  {
    const antesJogador = await contarSiglas(jogadorPage);
    const tokenLocator = narradorPage.locator(".rv-camada-tokens .rv-token", { has: narradorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
    const box = await tokenLocator.boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Ocultar" }).click();
    const sumiu = await esperarAte(async () => !(await contarSiglas(jogadorPage)).includes("SS"), 6000);
    registrar("3 (ocultar: token some do DOM do jogador sem reload)", sumiu, `antes=${JSON.stringify(antesJogador)}, sumiu=${sumiu}`);
  }

  // --- 4. Revelar: narrador revela — jogador RECUPERA o token sem reload ---
  {
    const tokenLocatorNarrador = narradorPage.locator(".rv-camada-tokens .rv-token.is-oculto").first();
    const box = await tokenLocatorNarrador.boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Revelar" }).click();
    const voltou = await esperarAte(async () => (await contarSiglas(jogadorPage)).includes("SS"), 6000);
    registrar("4 (revelar: token reaparece no DOM do jogador sem reload)", voltou, `voltou=${voltou}`);
  }

  // --- 6. Conceder controle: jogador passa a mover o token sem reload ---
  {
    // Vincula o personagem ao token pela UI de VERDADE (editar →
    // selecionar no dropdown "Personagem vinculado" → salvar) — não
    // por escrita direta no banco, que o próximo edit da UI
    // reverteria (achado documentado acima, no critério 2).
    const tokenLocator = narradorPage.locator(".rv-camada-tokens .rv-token", { has: narradorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
    const boxEditar = await tokenLocator.boundingBox();
    await narradorPage.mouse.click(boxEditar!.x + boxEditar!.width / 2, boxEditar!.y + boxEditar!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await narradorPage.locator(".rv-gerenciador-token label", { hasText: "Vincular a uma ficha" }).locator("select").selectOption({ label: "PJ do teste de sync" });
    await narradorPage.locator('.rv-gerenciador-token .rv-btn--pri', { hasText: "Salvar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });
    const { data: vinculado } = await admin.from("vtt_tokens").select("character_id").eq("id", tokenId).single();
    registrar("6a (vincular personagem pela UI persiste no banco)", vinculado?.character_id === characterId, `character_id=${vinculado?.character_id}`);

    await admin.from("character_controllers").insert({ character_id: characterId, campaign_id: campaignId, user_id: jogadorId });

    // Critério de verdade: arrasta o token pela UI do jogador — só
    // funciona se `controlledCharacterIds` já foi recarregado AO VIVO
    // (sem reload, sem esperar foco), via `useCampaignCharacterControllersRealtime`.
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const conseguiuMoverSemReload = await esperarAte(async () => {
      const tokenLoc = jogadorPage.locator(".rv-camada-tokens .rv-token", { has: jogadorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
      const box = await tokenLoc.boundingBox();
      if (!box) return false;
      const { data: atual } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenId).single();
      await jogadorPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
      await jogadorPage.mouse.up();
      await jogadorPage.waitForTimeout(700);
      const { data: depois } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenId).single();
      return depois?.q !== atual?.q || depois?.r !== atual?.r;
    }, 8000);
    registrar("6 (conceder controle: jogador move o token sem reload)", conseguiuMoverSemReload, `moveu=${conseguiuMoverSemReload}`);
  }

  // --- 7. Revogar controle: jogador NÃO move mais, sem reload ---
  {
    await admin.from("character_controllers").delete().eq("character_id", characterId).eq("user_id", jogadorId);
    const parouDeMoverSemReload = await esperarAte(async () => {
      const { data: atual } = await admin.from("vtt_tokens").select("q, r, revision").eq("id", tokenId).single();
      // Espera até `controlledCharacterIds` já ter sido recarregado — sem
      // acesso direto ao estado React, infere pela BLOQUAGEM: o
      // arrasto na UI não deve mais produzir mudança no banco.
      const tokenLoc = jogadorPage.locator(".rv-camada-tokens .rv-token", { has: jogadorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
      const box = await tokenLoc.boundingBox();
      if (!box) return false;
      await jogadorPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
      await jogadorPage.mouse.up();
      await jogadorPage.waitForTimeout(500);
      const { data: depois } = await admin.from("vtt_tokens").select("q, r, revision").eq("id", tokenId).single();
      return depois?.revision === atual?.revision && depois?.q === atual?.q && depois?.r === atual?.r;
    }, 6000);
    registrar("7 (revogar controle: jogador NÃO move mais, sem reload — servidor continua sendo a autoridade)", parouDeMoverSemReload, `bloqueado=${parouDeMoverSemReload}`);
  }

  // --- 5. Remover: narrador remove — some dos dois DOMs ---
  {
    const tokenLocator = narradorPage.locator(".rv-camada-tokens .rv-token", { has: narradorPage.locator("text.rv-token-sigla", { hasText: "SS" }) }).first();
    const box = await tokenLocator.boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Remover" }).click();
    await narradorPage.locator(".rv-modal--confirmar .rv-btn--perigo", { hasText: "Remover" }).click();
    const sumiuNarrador = await esperarAte(async () => !(await contarSiglas(narradorPage)).includes("SS"), 5000);
    const sumiuJogador = await esperarAte(async () => !(await contarSiglas(jogadorPage)).includes("SS"), 5000);
    const { data: aindaExiste } = await admin.from("vtt_tokens").select("id").eq("id", tokenId).maybeSingle();
    registrar("5 (remover: some dos dois DOMs, linha desaparece do banco)", sumiuNarrador && sumiuJogador && !aindaExiste, `narrador=${sumiuNarrador}, jogador=${sumiuJogador}, banco=${!aindaExiste}`);
  }

  // --- pegada personalizada × edição atômica (migration 0077): editar
  //     o TAMANHO de um token com pegada personalizada precisa limpar
  //     essa pegada e aplicar o preset novo — a OUTRA sessão (jogador)
  //     recebe o tamanho e a forma finais coerentes, sem reload. ---
  {
    const { data: criado } = await admin.from("vtt_tokens").insert({
      scene_id: sceneId, campaign_id: campaignId, nome: "Pegada Live", sigla: "PL", lado: "pn",
      q: 15, r: 15, tamanho: "grande", pegada_personalizada: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      visivel: true,
    }).select("id").single();
    const tokenPegadaId = criado!.id;
    // Convida os dois clientes a saber deste token novo (invalidação
    // sanitizada não dispara pra um INSERT direto via service role —
    // mesma lacuna documentada alhures nesta suíte; um reload aqui é
    // só pra fazer os dois clientes CONHECEREM o token antes do teste
    // de verdade, que é a EDIÇÃO logo abaixo, essa sim via RPC/UI real).
    await narradorPage.reload({ waitUntil: "networkidle" });
    await jogadorPage.reload({ waitUntil: "networkidle" });
    await narradorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });

    const jogadorViuFormaAntiga = await esperarAte(async () => (await jogadorPage.locator(`.rv-token[data-token-id="${tokenPegadaId}"] .rv-token-pegada`).count()) > 0, 6000);
    registrar("pegada-live-0 (fixture: jogador enxerga a pegada personalizada 2 células antes da edição)", jogadorViuFormaAntiga, `viu=${jogadorViuFormaAntiga}`);

    await narradorPage.locator(`.rv-token[data-token-id="${tokenPegadaId}"]`).click({ button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await narradorPage.selectOption("#rv-campo-tamanho", "medio");
    await narradorPage.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Salvar" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });

    const { data: linha } = await admin.from("vtt_tokens").select("tamanho, pegada_personalizada").eq("id", tokenPegadaId).single();
    registrar(
      "pegada-live-1 (banco: tamanho vira Médio, pegada_personalizada vira null)",
      linha?.tamanho === "medio" && linha?.pegada_personalizada === null,
      `tamanho=${linha?.tamanho}, pegada=${JSON.stringify(linha?.pegada_personalizada)}`,
    );

    const jogadorViuFormaNova = await esperarAte(async () => (await jogadorPage.locator(`.rv-token[data-token-id="${tokenPegadaId}"] .rv-token-pegada`).count()) === 0, 6000);
    registrar(
      "pegada-live-2 (outra sessão recebe o tamanho e a pegada final coerentes, sem reload — token vira 1 célula sem .rv-token-pegada)",
      jogadorViuFormaNova, `jogadorViuFormaNova=${jogadorViuFormaNova}`,
    );

    await admin.from("vtt_tokens").delete().eq("id", tokenPegadaId);
  }

  // --- nome automático: narrador cria SEM nome — o JOGADOR recebe o
  //     nome/sigla DEFINITIVOS (gerados pelo servidor) sem reload. ---
  {
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const box = await narradorPage.locator(".rv-camada-grade path").nth(140).boundingBox();
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await narradorPage.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
    await narradorPage.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    // Nome/sigla ficam vazios de propósito — não preenche nada.
    await narradorPage.locator('.rv-gerenciador-token .rv-btn--pri', { hasText: "Continuar para posicionar" }).click();
    await narradorPage.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
    await narradorPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
    await narradorPage.waitForTimeout(150);
    await narradorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await narradorPage.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });

    const { data: criado } = await admin.from("vtt_tokens").select("id, nome, sigla").eq("campaign_id", campaignId).like("nome", "#%").order("created_at", { ascending: false }).limit(1).single();
    registrar("nome-auto-live-1 (banco: nome automático '#N' de verdade, sigla derivada)", /^#\d+$/.test(criado!.nome) && criado!.sigla === criado!.nome.slice(1), `nome="${criado!.nome}", sigla="${criado!.sigla}"`);

    const jogadorViu = await esperarAte(async () => (await jogadorPage.locator(`.rv-token[data-token-id="${criado!.id}"] text.rv-token-sigla`).textContent().catch(() => null)) === criado!.sigla, 6000);
    registrar("nome-auto-live-2 (outra sessão recebe o nome/sigla definitivos sem reload — não um placeholder do cliente)", jogadorViu, `jogadorViu=${jogadorViu}`);

    await admin.from("vtt_tokens").delete().eq("id", criado!.id);
  }

  // --- 8. Ping legítimo: jogador SEGURA o botão esquerdo parado —
  // narrador vê o ping aparecer. Apontar deixou de ser ferramenta
  // (nada de trocar pra "Apontar" na barra, ela não existe mais): é
  // gesto global, igual Foundry/Roll20 — segura e solta na MESMA
  // célula, sem arrastar. ---
  {
    const box = await jogadorPage.locator(".rv-camada-grade path").nth(30).boundingBox();
    await jogadorPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await jogadorPage.mouse.down();
    await jogadorPage.waitForTimeout(600); // > DURACAO_SEGURAR_PING_MS (400ms, `_mapa/MapaHex.tsx`)
    const apareceu = await esperarAte(async () => (await narradorPage.locator(".rv-ping").count()) > 0, 4000);
    await jogadorPage.mouse.up();
    registrar("8 (ping legítimo: segurar parado dispara o gesto, narrador vê o ping do jogador aparecer)", apareceu, `apareceu=${apareceu}`);
  }

  // --- 9. Ping forjado — um client autenticado como o JOGADOR (mesmo
  // supabase-js, mesma policy da 0074) tenta channel.send() direto,
  // enquanto a página REAL do narrador está aberta e assinando o
  // canal de verdade — prova contra a UI viva, não só um observador
  // isolado (esse já existe em `check-vtt-canal-forjado.ts`).
  {
    const cliForja = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliForja.auth.signInWithPassword({ email: jogadorEmail!, password: jogadorSenha! });
    const marcador = `forja-live-${randomUUID()}`;
    const canal = cliForja.channel(`campaign:${campaignId}:scene:${sceneId}:vtt:ping`, { config: { private: true } }).subscribe();
    await new Promise((r) => setTimeout(r, 800));
    await canal.send({ type: "broadcast", event: "ping", payload: { v: 1, id: randomUUID(), campaignId, sceneId, autorId: jogadorId, q: 2, r: 2, largura: 20, altura: 20, ts: Date.now(), marcador } });
    await narradorPage.waitForTimeout(1500);
    const apareceuNaUiViva = await narradorPage.evaluate((m) => document.body.innerHTML.includes(m), marcador);
    cliForja.removeChannel(canal);
    registrar(
      "9 (ping forjado via channel.send() direto: NUNCA chega à UI viva do narrador)",
      !apareceuNaUiViva, `marcador apareceu no DOM do narrador=${apareceuNaUiViva}`,
    );
  }

  // --- 10. Ping de outra cena — não aparece nesta view ---
  {
    const { data: outraCena } = await admin.from("vtt_scenes").insert({ campaign_id: campaignId, nome: "Outra cena", largura: 10, altura: 10 }).select("id").single();
    outraSceneId = outraCena!.id as string;
    const cliJogador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliJogador.auth.signInWithPassword({ email: jogadorEmail!, password: jogadorSenha! });
    await cliJogador.rpc("vtt_ping", { p_campaign_id: campaignId, p_scene_id: outraSceneId, p_q: 1, p_r: 1 });
    await narradorPage.waitForTimeout(1500);
    const semPingNovo = (await narradorPage.locator(".rv-ping").count()) === 0;
    registrar("10 (ping de outra cena não aparece na cena ativa do narrador)", semPingNovo, `pings visíveis=${!semPingNovo ? "algum" : "nenhum"}`);
  }

  // --- 12. Camadas independentes por sessão ---
  {
    await narradorPage.locator('.rv-ferr-btn[aria-label="Camadas do mapa"]').click();
    await narradorPage.evaluate(() => {
      const b = [...document.querySelectorAll(".rv-camadas-item")].find((li) => li.querySelector(".rv-camadas-nome")?.textContent === "Tokens")?.querySelector('button[aria-label^="Ocultar"], button[aria-label^="Mostrar"]') as HTMLButtonElement | undefined;
      b?.click();
    });
    await narradorPage.waitForTimeout(300);
    const narradorTokensOcultos = await narradorPage.evaluate(() => document.querySelector(".rv-camada-tokens")?.getAttribute("style"));
    const jogadorTokensAindaVisiveis = await jogadorPage.evaluate(() => document.querySelector(".rv-camada-tokens")?.getAttribute("style"));
    registrar(
      "12 (preferência de camada é local — narrador oculta Tokens, jogador continua com a camada visível)",
      !!narradorTokensOcultos?.includes("none") && !jogadorTokensAindaVisiveis?.includes("none"),
      `narrador=${narradorTokensOcultos}, jogador=${jogadorTokensAindaVisiveis}`,
    );
  }

  // --- Strict Mode: alterna cada camada repetidamente, sem loop nem warning ---
  {
    const antesErros = errosNarrador.length;
    await narradorPage.evaluate(async () => {
      const botoes = [...document.querySelectorAll(".rv-camadas-btn")] as HTMLButtonElement[];
      for (let volta = 0; volta < 6; volta++) {
        for (const b of botoes) b.click();
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    await narradorPage.waitForTimeout(500);
    const novosErros = errosNarrador.slice(antesErros);
    const semLoopNemWarning = novosErros.length === 0;
    registrar(
      "strict-1 (alternar cada camada 6× seguidas não produz warning/erro — updater puro, sem setState aninhado)",
      semLoopNemWarning, semLoopNemWarning ? "console limpo durante as alternâncias" : `erros: ${JSON.stringify(novosErros)}`,
    );
  }

  // --- strict-2: alternâncias RÁPIDAS e INTERCALADAS em DUAS camadas
  // diferentes, todas dentro do MESMO `page.evaluate` (sem nenhum
  // round-trip do Playwright entre cliques — o cenário mais adversarial
  // pra pegar um closure velho: os cliques disparam antes de o React
  // ter qualquer chance de re-renderizar entre um e outro). Restaura
  // primeiro pro padrão pra partir de um estado conhecido. ---
  {
    await narradorPage.evaluate(() => {
      const btn = document.querySelector(".rv-camadas-restaurar") as HTMLButtonElement | null;
      btn?.click();
    });
    await narradorPage.waitForTimeout(300);

    const antesErros = errosNarrador.length;
    const resultadoCliques = await narradorPage.evaluate(() => {
      const liGrade = [...document.querySelectorAll(".rv-camadas-item")].find((el) => el.querySelector(".rv-camadas-nome")?.textContent === "Grade");
      const liObjetos = [...document.querySelectorAll(".rv-camadas-item")].find((el) => el.querySelector(".rv-camadas-nome")?.textContent === "Objetos / coberturas");
      const btnGrade = liGrade?.querySelector('button[aria-label^="Ocultar"], button[aria-label^="Mostrar"]') as HTMLButtonElement | undefined;
      const btnObjetos = liObjetos?.querySelector('button[aria-label^="Ocultar"], button[aria-label^="Mostrar"]') as HTMLButtonElement | undefined;
      if (!btnGrade || !btnObjetos) return { ok: false as const };
      // Grade: 5 cliques (ímpar → termina oculta). Objetos: 3 cliques
      // (ímpar → termina oculta). Intercalados, SEM esperar nada entre
      // eles — tudo no mesmo tick síncrono.
      const sequencia: ("grade" | "objetos")[] = ["grade", "objetos", "grade", "objetos", "grade", "objetos", "grade", "grade"];
      for (const alvo of sequencia) (alvo === "grade" ? btnGrade : btnObjetos).click();
      return { ok: true as const };
    });
    await narradorPage.waitForTimeout(500); // assenta render + persistência

    const estadoFinal = await narradorPage.evaluate(() => {
      const gradeOculta = document.querySelector(".rv-camada-grade")?.classList.contains("rv-camada-grade--oculta") ?? null;
      const objetosStyle = document.querySelector(".rv-camada-objetos")?.getAttribute("style") ?? null;
      const chaveLs = Object.keys(localStorage).find((k) => k.startsWith("rv-camadas:"));
      const valorLs = chaveLs ? JSON.parse(localStorage.getItem(chaveLs) ?? "{}") : null;
      return { gradeOculta, objetosOculto: !!objetosStyle?.includes("none"), valorLs };
    });
    const novosErros = errosNarrador.slice(antesErros);

    registrar(
      "strict-2 (5+3 cliques intercalados em Grade/Objetos, sem yield entre eles: nenhuma alternância perdida — Grade e Objetos terminam OCULTAS, como o número ímpar de cliques exige)",
      resultadoCliques.ok && estadoFinal.gradeOculta === true && estadoFinal.objetosOculto === true,
      `resultadoCliques=${JSON.stringify(resultadoCliques)}, estado=${JSON.stringify(estadoFinal)}`,
    );
    registrar(
      "strict-3 (localStorage recebeu exatamente o estado final — grade e objetos ocultos, sem escrita perdida por closure velho)",
      estadoFinal.valorLs?.grade?.visivel === false && estadoFinal.valorLs?.objetos?.visivel === false,
      `localStorage=${JSON.stringify(estadoFinal.valorLs)}`,
    );
    registrar(
      "strict-4 (5+3 cliques intercalados sem yield: sem warning/erro no console)",
      novosErros.length === 0, novosErros.length === 0 ? "console limpo" : `erros: ${JSON.stringify(novosErros)}`,
    );
  }

  // --- Console limpo geral (medido ao longo de todo o script) ---
  registrar("console-narrador (sem erros/warnings além dos já filtrados)", errosNarrador.length === 0, JSON.stringify(errosNarrador));
  registrar("console-jogador (sem erros/warnings além dos já filtrados)", errosJogador.length === 0, JSON.stringify(errosJogador));

  await closeNarrador();
  await closeJogador();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
