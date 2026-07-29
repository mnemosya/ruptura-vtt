#!/usr/bin/env node
/**
 * Validação de CONCORRÊNCIA SIMULTÂNEA REAL contra o Supabase configurado
 * no projeto — reescrito na Fase 1 (revisão 4) do plano de contas/
 * campanhas/convites/personagens. A versão anterior deste script testava
 * concorrência do modelo de "perfil"/"sessão de perfil"
 * (`campaign_profiles`/`profile_sessions`), removido por completo do
 * banco — os cenários abaixo testam concorrência do modelo atual:
 * `character_controllers` (controle de personagem) e
 * `complete_character_creation` (idempotência da criação via wizard).
 *
 * Dois clientes `@supabase/supabase-js` independentes, cada um com sua
 * PRÓPRIA sessão real (`auth.signInWithPassword`), disparados com
 * `Promise.allSettled` sem aguardar um antes do outro.
 *
 * Service role é usado SOMENTE para: criar usuários de teste, preparar
 * fixtures e inspecionar/limpar o estado final — NUNCA como identidade
 * submetida à autorização testada.
 *
 * Uso: npx tsx scripts/dev/validate-campaign-session-concurrency.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";

loadDotenv({ path: ".env.local" });

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function freshAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function randomPassword() {
  return randomBytes(18).toString("base64url");
}

const RUN_TAG = `concurrency-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label) {
  const email = `validation-concurrency-${label}-${RUN_TAG}@ruptura.dev`;
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Falha ao criar usuário ${label}: ${error.message}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(fixtureUser) {
  const client = freshAnonClient();
  const { error } = await client.auth.signInWithPassword({ email: fixtureUser.email, password: fixtureUser.password });
  if (error) throw new Error(`Falha ao logar ${fixtureUser.email.split("@")[0]}: ${error.message}`);
  return client;
}

async function createCampaign(ownerId, label) {
  const id = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO CONCORRENCIA ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

async function addActiveMember(campaignId, userId, role = "player") {
  const { error } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: userId, role, status: "active", origem: "fixture_concurrency" });
  if (error) throw new Error(`Falha ao adicionar membership: ${error.message}`);
}

async function createCharacter(campaignId, name) {
  const id = randomUUID();
  const { error } = await admin.from("characters").insert({ id, name, payload: { nome: name }, campaign_id: campaignId });
  if (error) throw new Error(`Falha ao criar personagem: ${error.message}`);
  return id;
}

let passed = 0;
let failed = 0;

function record(scenario, ok, detail) {
  if (ok) {
    passed++;
    console.log(`ok - ${scenario}: ${detail}`);
  } else {
    failed++;
    console.error(`FALHA - ${scenario}: ${detail}`);
  }
}

// ---------------------------------------------------------------------
// Cenário 1 — grant_character_control simultâneo para o MESMO
// (character, user) — deve convergir para exatamente uma linha
// (chave primária composta (character_id, user_id) com ON CONFLICT DO
// NOTHING, migration 0051), sem erro em nenhuma das duas chamadas.
// ---------------------------------------------------------------------
async function scenario1() {
  const owner = await createFixtureUser("owner-s1");
  const player = await createFixtureUser("player-s1");
  const campaignId = await createCampaign(owner.id, "S1");
  await addActiveMember(campaignId, player.id);
  const characterId = await createCharacter(campaignId, "S1 Personagem");

  const clientOwner1 = await signIn(owner);
  const clientOwner2 = await signIn(owner); // segunda sessão real, independente

  const t0 = Date.now();
  const [res1, res2] = await Promise.allSettled([
    clientOwner1.rpc("grant_character_control", { p_character_id: characterId, p_user_id: player.id }),
    clientOwner2.rpc("grant_character_control", { p_character_id: characterId, p_user_id: player.id }),
  ]);
  const elapsed = Date.now() - t0;

  const ok1 = res1.status === "fulfilled" && !res1.value.error;
  const ok2 = res2.status === "fulfilled" && !res2.value.error;

  const { count } = await admin
    .from("character_controllers")
    .select("*", { count: "exact", head: true })
    .eq("character_id", characterId)
    .eq("user_id", player.id);

  record(
    "Cenário 1 (grant_character_control simultâneo, mesmo alvo)",
    ok1 && ok2 && count === 1,
    `disparo simultâneo em ${elapsed}ms; grant1 ${ok1 ? "sucesso" : "falhou"}, grant2 ${ok2 ? "sucesso" : "falhou"}; linhas finais em character_controllers=${count}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 2 — grant vs revoke simultâneos do MESMO (character, user).
// Resultado determinístico não é garantido pela ordem de chegada (é
// uma corrida real), mas o estado final tem que ser um dos dois
// estados válidos (linha existe OU não existe) — nunca erro/estado
// inconsistente, e uma segunda leitura direta confirma que o estado é
// estável (não fica "piscando").
// ---------------------------------------------------------------------
async function scenario2() {
  const owner = await createFixtureUser("owner-s2");
  const player = await createFixtureUser("player-s2");
  const campaignId = await createCampaign(owner.id, "S2");
  await addActiveMember(campaignId, player.id);
  const characterId = await createCharacter(campaignId, "S2 Personagem");
  await admin.from("character_controllers").insert({ character_id: characterId, campaign_id: campaignId, user_id: player.id });

  const clientOwner1 = await signIn(owner);
  const clientOwner2 = await signIn(owner);

  const t0 = Date.now();
  const [grantRes, revokeRes] = await Promise.allSettled([
    clientOwner1.rpc("grant_character_control", { p_character_id: characterId, p_user_id: player.id }),
    clientOwner2.rpc("revoke_character_control", { p_character_id: characterId, p_user_id: player.id }),
  ]);
  const elapsed = Date.now() - t0;

  const grantOk = grantRes.status === "fulfilled" && !grantRes.value.error;
  const revokeOk = revokeRes.status === "fulfilled" && !revokeRes.value.error;

  const { count: countAfter1 } = await admin.from("character_controllers").select("*", { count: "exact", head: true }).eq("character_id", characterId).eq("user_id", player.id);
  await new Promise((r) => setTimeout(r, 200));
  const { count: countAfter2 } = await admin.from("character_controllers").select("*", { count: "exact", head: true }).eq("character_id", characterId).eq("user_id", player.id);

  record(
    "Cenário 2 (grant vs revoke simultâneos)",
    grantOk && revokeOk && (countAfter1 === 0 || countAfter1 === 1) && countAfter1 === countAfter2,
    `disparo simultâneo em ${elapsed}ms; grant ${grantOk ? "sucesso" : "falhou"}, revoke ${revokeOk ? "sucesso" : "falhou"}; estado final estável=${countAfter1 === countAfter2}, linhas=${countAfter1}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 3 — complete_character_creation com o MESMO creationRequestId
// disparado duas vezes simultaneamente (duplo clique/retry) — deve
// produzir exatamente UM personagem (idempotência real sob concorrência,
// não só sob chamadas sequenciais), com a segunda resposta marcada
// idempotentReplay=true.
// ---------------------------------------------------------------------
async function scenario3() {
  const owner = await createFixtureUser("owner-s3");
  const player = await createFixtureUser("player-s3");
  const campaignId = await createCampaign(owner.id, "S3");
  await addActiveMember(campaignId, player.id);

  const clientPlayer1 = await signIn(player);
  const clientPlayer2 = await signIn(player);
  const creationRequestId = randomUUID();
  const payload = {
    nome: "S3 Personagem Duplo Clique",
    niveis_vertente: {},
    magias_aprendidas: [],
    talentos_adquiridos: [],
    inventario: [],
    carteira: { aretz_informal: 5000, cdi: 0, cdi_craqueada: 0 },
  };

  const t0 = Date.now();
  const [res1, res2] = await Promise.allSettled([
    clientPlayer1.rpc("complete_character_creation", { p_campaign_id: campaignId, p_character_payload: { ...payload, metadados: { creationRequestId } }, p_creation_request_id: creationRequestId }),
    clientPlayer2.rpc("complete_character_creation", { p_campaign_id: campaignId, p_character_payload: { ...payload, metadados: { creationRequestId } }, p_creation_request_id: creationRequestId }),
  ]);
  const elapsed = Date.now() - t0;

  const ok1 = res1.status === "fulfilled" && !res1.value.error;
  const ok2 = res2.status === "fulfilled" && !res2.value.error;

  const { count: charCount } = await admin
    .from("characters")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("owner_id", player.id);

  record(
    "Cenário 3 (criação de personagem idempotente sob concorrência real)",
    ok1 && ok2 && charCount === 1,
    `disparo simultâneo em ${elapsed}ms; criação1 ${ok1 ? "sucesso" : "falhou"}, criação2 ${ok2 ? "sucesso" : "falhou"}; personagens criados=${charCount} (esperado 1)`,
  );
}

async function cleanup() {
  console.log("\nLimpando fixtures...");
  for (const campaignId of createdCampaignIds) {
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("character_creation_drafts").delete().eq("campaign_id", campaignId);
    await admin.from("character_controllers").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_invites").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }

  let remaining = 0;
  for (const campaignId of createdCampaignIds) {
    const { count } = await admin.from("campaigns").select("id", { count: "exact", head: true }).eq("id", campaignId);
    remaining += count ?? 0;
  }
  console.log(`Fixtures removidas. Campanhas remanescentes desta rodada: ${remaining}.`);
  return remaining === 0;
}

async function main() {
  try {
    await scenario1();
    await scenario2();
    await scenario3();
  } finally {
    const cleanExit = await cleanup();
    console.log(`\n${passed} cenários aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error("Erro fatal na validação de concorrência:", err.message);
  process.exitCode = 1;
});
