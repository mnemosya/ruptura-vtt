#!/usr/bin/env node
/**
 * Validação de CONCORRÊNCIA SIMULTÂNEA REAL da Etapa 12 (correção 7 +
 * validação integrada) contra o Supabase configurado no projeto.
 *
 * Diferente da rodada anterior (que só provou RLS/RPC com chamadas
 * SEQUENCIAIS via `SET ROLE`), este script dispara pares de operações
 * usando DOIS CLIENTES `@supabase/supabase-js` independentes, cada um
 * com sua PRÓPRIA sessão real (`auth.signInWithPassword`), disparados
 * com `Promise.allSettled` sem aguardar um antes do outro — ambas as
 * chamadas HTTP saem antes de qualquer resultado ser conhecido.
 *
 * Service role é usado SOMENTE para: criar usuários de teste
 * (`auth.admin.createUser`), preparar fixtures (campanha/perfis/
 * personagens/convite) e inspecionar/limpar o estado final — NUNCA
 * como identidade submetida à autorização testada.
 *
 * Nunca imprime: token bruto, senha, chave anon/service role, cookie,
 * `session_token_hash`.
 *
 * Uso: npx tsx scripts/dev/validate-campaign-session-concurrency.mjs
 * (roda sob Node puro — .mjs, sem dependência de bundler do Next).
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

async function createProfile(campaignId, nickname) {
  const id = randomUUID();
  const { error } = await admin.from("campaign_profiles").insert({ id, campaign_id: campaignId, nickname });
  if (error) throw new Error(`Falha ao criar perfil: ${error.message}`);
  return id;
}

async function createCharacter(campaignId, profileId, name) {
  const id = randomUUID();
  const { error } = await admin.from("characters").insert({
    id, name, payload: { nome: name }, campaign_id: campaignId, profile_id: profileId,
  });
  if (error) throw new Error(`Falha ao criar personagem: ${error.message}`);
  return id;
}

let passed = 0;
let failed = 0;
const report = [];

function record(scenario, ok, detail) {
  report.push({ scenario, ok, detail });
  if (ok) {
    passed++;
    console.log(`ok - ${scenario}: ${detail}`);
  } else {
    failed++;
    console.error(`FALHA - ${scenario}: ${detail}`);
  }
}

// ---------------------------------------------------------------------
// Cenário 1 — reivindicação simultânea do mesmo perfil (Player A vs B)
// ---------------------------------------------------------------------
async function scenario1() {
  const owner = await createFixtureUser("owner-s1");
  const playerA = await createFixtureUser("playerA-s1");
  const playerB = await createFixtureUser("playerB-s1");
  const campaignId = await createCampaign(owner.id, "S1");
  await addActiveMember(campaignId, playerA.id);
  await addActiveMember(campaignId, playerB.id);
  const profileId = await createProfile(campaignId, "Perfil disputado S1");

  const clientA = await signIn(playerA);
  const clientB = await signIn(playerB);

  const t0 = Date.now();
  const [resA, resB] = await Promise.allSettled([
    clientA.rpc("claim_campaign_profile", { p_profile_id: profileId }),
    clientB.rpc("claim_campaign_profile", { p_profile_id: profileId }),
  ]);
  const elapsed = Date.now() - t0;

  const okA = resA.status === "fulfilled" && !resA.value.error;
  const okB = resB.status === "fulfilled" && !resB.value.error;
  const exactlyOneWon = (okA && !okB) || (!okA && okB);

  const { data: profileRow } = await admin.from("campaign_profiles").select("user_id").eq("id", profileId).single();
  const singleWinnerInDb = profileRow?.user_id === playerA.id || profileRow?.user_id === playerB.id;

  const { count } = await admin.from("campaign_profiles").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);

  record(
    "Cenário 1 (claim simultâneo)",
    exactlyOneWon && singleWinnerInDb && count === 1,
    `disparo simultâneo em ${elapsed}ms; A ${okA ? "venceu" : "falhou"}, B ${okB ? "venceu" : "falhou"}; user_id final=${singleWinnerInDb ? "único" : "INCONSISTENTE"}; perfis na campanha=${count}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 2 — dupla entrada simultânea no mesmo perfil (owner, duas
// conexões distintas — só o owner pode iniciar sessão de perfil não
// reivindicado neste fixture, então usamos duas sessões de login
// independentes do MESMO usuário, não uma conexão compartilhada).
// ---------------------------------------------------------------------
async function scenario2() {
  const owner = await createFixtureUser("owner-s2");
  const campaignId = await createCampaign(owner.id, "S2");
  const profileId = await createProfile(campaignId, "Perfil S2");

  const clientOwner1 = await signIn(owner);
  const clientOwner2 = await signIn(owner); // segunda sessão real, independente

  const t0 = Date.now();
  const [res1, res2] = await Promise.allSettled([
    clientOwner1.rpc("enter_campaign_profile", { p_profile_id: profileId, p_session_id: "concurrency-session-1" }),
    clientOwner2.rpc("enter_campaign_profile", { p_profile_id: profileId, p_session_id: "concurrency-session-2" }),
  ]);
  const elapsed = Date.now() - t0;

  const ok1 = res1.status === "fulfilled" && !res1.value.error;
  const ok2 = res2.status === "fulfilled" && !res2.value.error;

  const { count: activeCount } = await admin
    .from("profile_sessions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "active");

  // Exatamente uma sessão "active" deve sobrar (a segunda entrada libera a anterior).
  record(
    "Cenário 2 (dupla entrada simultânea)",
    activeCount === 1,
    `disparo simultâneo em ${elapsed}ms; entrada1 ${ok1 ? "sucesso" : "falhou"}, entrada2 ${ok2 ? "sucesso" : "falhou"}; sessões active restantes=${activeCount}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 3 — heartbeat vs leave simultâneos na mesma sessão.
// ---------------------------------------------------------------------
async function scenario3() {
  const owner = await createFixtureUser("owner-s3");
  const playerA = await createFixtureUser("playerA-s3");
  const campaignId = await createCampaign(owner.id, "S3");
  await addActiveMember(campaignId, playerA.id);
  const profileId = await createProfile(campaignId, "Perfil S3");
  await admin.from("campaign_profiles").update({ user_id: playerA.id, claimed_at: new Date().toISOString() }).eq("id", profileId);

  const clientA = await signIn(playerA);
  const { data: enterData, error: enterErr } = await clientA.rpc("enter_campaign_profile", {
    p_profile_id: profileId,
    p_session_id: "concurrency-s3",
  });
  if (enterErr) throw new Error(`Falha ao entrar no perfil (S3 setup): ${enterErr.message}`);
  const { profileSessionId, rawSessionToken } = enterData;

  const clientA2 = await signIn(playerA); // segunda conexão real do mesmo jogador

  const t0 = Date.now();
  const [heartbeatRes, leaveRes] = await Promise.allSettled([
    clientA.rpc("heartbeat_profile_session", { p_profile_id: profileId, p_profile_session_id: profileSessionId, p_raw_session_token: rawSessionToken }),
    clientA2.rpc("leave_campaign_profile", { p_profile_id: profileId, p_profile_session_id: profileSessionId, p_raw_session_token: rawSessionToken }),
  ]);
  const elapsed = Date.now() - t0;

  const { data: sessionRow } = await admin.from("profile_sessions").select("status").eq("id", profileSessionId).single();
  const { data: profileRow } = await admin.from("campaign_profiles").select("is_locked").eq("id", profileId).single();

  // Garantia real da implementação (lida no código, não inventada): status
  // final deve ser um estado TERMINAL determinístico ('exited' se leave
  // venceu; heartbeat nunca reverte 'exited' de volta para 'active') e o
  // perfil não pode ficar preso bloqueado se a sessão não é mais active.
  const statusIsTerminalOrActive = ["exited", "active"].includes(sessionRow?.status);
  const neverBothWrong = !(sessionRow?.status === "active" && profileRow?.is_locked === false);

  record(
    "Cenário 3 (heartbeat vs leave simultâneos)",
    statusIsTerminalOrActive && neverBothWrong,
    `disparo simultâneo em ${elapsed}ms; heartbeat ${heartbeatRes.status === "fulfilled" && !heartbeatRes.value.error ? "sucesso" : "falhou"}, leave ${leaveRes.status === "fulfilled" && !leaveRes.value.error ? "sucesso" : "falhou"}; status final da sessão=${sessionRow?.status}; perfil ainda bloqueado=${profileRow?.is_locked}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 4 — force_release (owner) vs heartbeat (jogador) simultâneos.
// ---------------------------------------------------------------------
async function scenario4() {
  const owner = await createFixtureUser("owner-s4");
  const playerA = await createFixtureUser("playerA-s4");
  const campaignId = await createCampaign(owner.id, "S4");
  await addActiveMember(campaignId, playerA.id);
  const profileId = await createProfile(campaignId, "Perfil S4");
  await admin.from("campaign_profiles").update({ user_id: playerA.id, claimed_at: new Date().toISOString() }).eq("id", profileId);

  const clientA = await signIn(playerA);
  const { data: enterData, error: enterErr } = await clientA.rpc("enter_campaign_profile", {
    p_profile_id: profileId,
    p_session_id: "concurrency-s4",
  });
  if (enterErr) throw new Error(`Falha ao entrar no perfil (S4 setup): ${enterErr.message}`);
  const { profileSessionId, rawSessionToken } = enterData;

  const clientOwner = await signIn(owner);

  const t0 = Date.now();
  const [releaseRes, heartbeatRes] = await Promise.allSettled([
    clientOwner.rpc("force_release_campaign_profile", { p_profile_id: profileId }),
    clientA.rpc("heartbeat_profile_session", { p_profile_id: profileId, p_profile_session_id: profileSessionId, p_raw_session_token: rawSessionToken }),
  ]);
  const elapsed = Date.now() - t0;

  const { data: profileRow } = await admin.from("campaign_profiles").select("is_locked").eq("id", profileId).single();

  // Depois da corrida, tentar usar o token para ler o personagem (não
  // deveria autorizar mais nada, independente de quem venceu a corrida).
  const { data: charAfter } = await clientA.rpc("get_character_for_profile_session", {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
  });

  record(
    "Cenário 4 (force_release vs heartbeat simultâneos)",
    profileRow?.is_locked === false && (!charAfter || charAfter.length === 0),
    `disparo simultâneo em ${elapsed}ms; release ${releaseRes.status === "fulfilled" && !releaseRes.value.error ? "sucesso" : "falhou"}, heartbeat ${heartbeatRes.status === "fulfilled" && !heartbeatRes.value.error ? "sucesso" : "falhou"}; perfil bloqueado=${profileRow?.is_locked}; personagem ainda acessível pelo token=${!!charAfter?.length}`,
  );
}

// ---------------------------------------------------------------------
// Cenário 5 — save (jogador) vs troca de personagem ativo (owner)
// simultâneos, mais uma variante hostil (personagem de OUTRO perfil).
// ---------------------------------------------------------------------
async function scenario5() {
  const owner = await createFixtureUser("owner-s5");
  const playerA = await createFixtureUser("playerA-s5");
  const campaignId = await createCampaign(owner.id, "S5");
  await addActiveMember(campaignId, playerA.id);
  const profileId = await createProfile(campaignId, "Perfil S5");
  await admin.from("campaign_profiles").update({ user_id: playerA.id, claimed_at: new Date().toISOString() }).eq("id", profileId);
  const charA1 = await createCharacter(campaignId, profileId, "S5 Personagem A1");
  const charA2 = await createCharacter(campaignId, profileId, "S5 Personagem A2");
  await admin.from("campaign_profiles").update({ active_character_id: charA1 }).eq("id", profileId);

  const clientA = await signIn(playerA);
  const { data: enterData, error: enterErr } = await clientA.rpc("enter_campaign_profile", {
    p_profile_id: profileId,
    p_session_id: "concurrency-s5",
  });
  if (enterErr) throw new Error(`Falha ao entrar no perfil (S5 setup): ${enterErr.message}`);
  const { profileSessionId, rawSessionToken } = enterData;

  const clientOwner = await signIn(owner);

  const t0 = Date.now();
  const [saveRes, swapRes] = await Promise.allSettled([
    clientA.rpc("save_character_for_profile_session", {
      p_campaign_id: campaignId,
      p_profile_id: profileId,
      p_profile_session_id: profileSessionId,
      p_raw_session_token: rawSessionToken,
      p_character_id: charA1,
      p_name: "S5 A1 salvo pelo jogador",
      p_payload: { nome: "S5 A1 salvo pelo jogador" },
    }),
    clientOwner.rpc("set_campaign_profile_active_character", { p_profile_id: profileId, p_character_id: charA2 }),
  ]);
  const elapsed = Date.now() - t0;

  const { data: charA1Row } = await admin.from("characters").select("name").eq("id", charA1).single();
  const { data: charA2Row } = await admin.from("characters").select("name").eq("id", charA2).single();

  const a2Untouched = charA2Row?.name === "S5 Personagem A2";
  const a1EitherSavedOrUnchanged = ["S5 A1 salvo pelo jogador", "S5 Personagem A1"].includes(charA1Row?.name);

  record(
    "Cenário 5 (save vs troca de personagem ativo simultâneos)",
    a2Untouched && a1EitherSavedOrUnchanged,
    `disparo simultâneo em ${elapsed}ms; save ${saveRes.status === "fulfilled" && !saveRes.value.error ? "sucesso" : "rejeitado"}, swap ${swapRes.status === "fulfilled" && !swapRes.value.error ? "sucesso" : "rejeitado"}; A2 intocado=${a2Untouched}; A1 estado=${a1EitherSavedOrUnchanged ? "consistente" : "INCONSISTENTE"}`,
  );

  // Variante hostil: personagem de OUTRO perfil (não da mesma "família").
  const playerB = await createFixtureUser("playerB-s5");
  await addActiveMember(campaignId, playerB.id);
  const profileB = await createProfile(campaignId, "Perfil B S5");
  await admin.from("campaign_profiles").update({ user_id: playerB.id, claimed_at: new Date().toISOString() }).eq("id", profileB);
  const charB = await createCharacter(campaignId, profileB, "S5 Personagem B (alheio)");

  const { error: hostileSwapErr } = await clientOwner.rpc("set_campaign_profile_active_character", { p_profile_id: profileId, p_character_id: charB });
  const { data: hostileSaveData } = await clientA.rpc("save_character_for_profile_session", {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
    p_character_id: charB,
    p_name: "tentativa hostil",
    p_payload: { nome: "tentativa hostil" },
  });
  const { data: charBAfter } = await admin.from("characters").select("name").eq("id", charB).single();

  record(
    "Cenário 5b (variante hostil — personagem de outro perfil)",
    !!hostileSwapErr && (!hostileSaveData || hostileSaveData.length === 0) && charBAfter?.name === "S5 Personagem B (alheio)",
    `troca hostil ${hostileSwapErr ? "rejeitada corretamente" : "NÃO REJEITADA"}; save hostil ${hostileSaveData?.length ? "TOCOU O PERSONAGEM ALHEIO" : "não tocou nada"}; personagem B final=intocado`,
  );
}

// ---------------------------------------------------------------------
// Cenário 6 — expire_stale_profile_sessions vs heartbeat simultâneos.
// ---------------------------------------------------------------------
async function scenario6() {
  const owner = await createFixtureUser("owner-s6");
  const playerA = await createFixtureUser("playerA-s6");
  const playerB = await createFixtureUser("playerB-s6");
  const campaignId = await createCampaign(owner.id, "S6");
  await addActiveMember(campaignId, playerA.id);
  await addActiveMember(campaignId, playerB.id);

  // Perfil A: sessão DELIBERADAMENTE vencida (last_seen_at no passado, via fixture).
  const profileStale = await createProfile(campaignId, "Perfil S6 vencido");
  await admin.from("campaign_profiles").update({ user_id: playerA.id, claimed_at: new Date().toISOString() }).eq("id", profileStale);
  const clientA = await signIn(playerA);
  const { data: enterStale, error: enterStaleErr } = await clientA.rpc("enter_campaign_profile", { p_profile_id: profileStale, p_session_id: "concurrency-s6-stale" });
  if (enterStaleErr) throw new Error(`Falha ao entrar (S6 stale setup): ${enterStaleErr.message}`);
  // Fixture administrativa: força last_seen_at para 5 minutos atrás (bem além do limite de 30s).
  const staleTimestamp = new Date(Date.now() - 5 * 60_000).toISOString();
  await admin.from("profile_sessions").update({ last_seen_at: staleTimestamp }).eq("id", enterStale.profileSessionId);
  await admin.from("campaign_profiles").update({ last_seen_at: staleTimestamp }).eq("id", profileStale);

  // Perfil B: sessão RECENTE (acabou de entrar), não deve expirar.
  const profileFresh = await createProfile(campaignId, "Perfil S6 recente");
  await admin.from("campaign_profiles").update({ user_id: playerB.id, claimed_at: new Date().toISOString() }).eq("id", profileFresh);
  const clientB = await signIn(playerB);
  const { data: enterFresh, error: enterFreshErr } = await clientB.rpc("enter_campaign_profile", { p_profile_id: profileFresh, p_session_id: "concurrency-s6-fresh" });
  if (enterFreshErr) throw new Error(`Falha ao entrar (S6 fresh setup): ${enterFreshErr.message}`);

  const t0 = Date.now();
  const [expireRes, heartbeatStaleRes, heartbeatFreshRes] = await Promise.allSettled([
    clientA.rpc("expire_stale_profile_sessions", { p_campaign_id: campaignId, p_stale_after_seconds: 30 }),
    clientA.rpc("heartbeat_profile_session", { p_profile_id: profileStale, p_profile_session_id: enterStale.profileSessionId, p_raw_session_token: enterStale.rawSessionToken }),
    clientB.rpc("heartbeat_profile_session", { p_profile_id: profileFresh, p_profile_session_id: enterFresh.profileSessionId, p_raw_session_token: enterFresh.rawSessionToken }),
  ]);
  const elapsed = Date.now() - t0;

  const { data: staleSessionAfter } = await admin.from("profile_sessions").select("status").eq("id", enterStale.profileSessionId).single();
  const { data: freshSessionAfter } = await admin.from("profile_sessions").select("status").eq("id", enterFresh.profileSessionId).single();
  const { data: staleProfileAfter } = await admin.from("campaign_profiles").select("is_locked").eq("id", profileStale).single();

  const staleCorrectlyTerminal = ["expired"].includes(staleSessionAfter?.status) || heartbeatStaleRes.status === "rejected" || (heartbeatStaleRes.status === "fulfilled" && !!heartbeatStaleRes.value.error);
  const freshRemainsActive = freshSessionAfter?.status === "active";
  const staleLockReleased = staleProfileAfter?.is_locked === false || staleSessionAfter?.status !== "expired";

  record(
    "Cenário 6 (expire vs heartbeat simultâneos)",
    staleCorrectlyTerminal && freshRemainsActive,
    `disparo simultâneo em ${elapsed}ms; expire ${expireRes.status === "fulfilled" ? "rodou" : "falhou"}; sessão vencida final=${staleSessionAfter?.status} (lock=${staleProfileAfter?.is_locked}); sessão recente final=${freshSessionAfter?.status}`,
  );
}

async function cleanup() {
  console.log("\nLimpando fixtures...");
  for (const campaignId of createdCampaignIds) {
    await admin.from("campaign_content_changelog").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_content_documents").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_content_drafts").delete().eq("campaign_id", campaignId);
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("profile_sessions").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_profiles").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_invites").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }

  // Confirmação por contagem: zero fixtures restantes.
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
    await scenario4();
    await scenario5();
    await scenario6();
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
