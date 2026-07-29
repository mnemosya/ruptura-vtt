#!/usr/bin/env node
/**
 * Testes comportamentais da Fase 2 (convites por e-mail + convite
 * limpo + ativação automática) contra o Supabase REAL — plano de
 * contas/campanhas/convites/personagens, revisão 4, seção 8 (Fase 2).
 *
 * Cenário base: U1 (dono da Campanha A), U2 (conta com e-mail correto
 * do convite), U3 (conta com e-mail diferente, tentativa hostil).
 *
 * Uso: npx tsx scripts/dev/validate-campaign-invites-fase2.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHash } from "node:crypto";

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

const RUN_TAG = `invites2-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label, email) {
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
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO CONVITES2 ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

function sha256hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createRawInvite(campaignId, ownerId, { kind, email = null, label = null }) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256hex(rawToken);
  const { data, error } = await admin
    .from("campaign_invites")
    .insert({ campaign_id: campaignId, token_hash: tokenHash, kind, email, label, created_by: ownerId })
    .select()
    .single();
  if (error) throw new Error(`Falha ao criar convite fixture: ${error.message}`);
  return { rawToken, invite: data };
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

async function main() {
  const U1 = await createFixtureUser("u1-owner", `validation-invites2-u1-${RUN_TAG}@ruptura.dev`);
  const U2 = await createFixtureUser("u2-correct-email", `validation-invites2-u2-${RUN_TAG}@ruptura.dev`);
  const U3 = await createFixtureUser("u3-wrong-email", `validation-invites2-u3-${RUN_TAG}@ruptura.dev`);
  const campaignA = await createCampaign(U1.id, "A");

  const clientU1 = await signIn(U1);
  const clientU2 = await signIn(U2);
  const clientU3 = await signIn(U3);

  // --- Teste: convite por e-mail nunca cria campaign_members no momento da criação ---
  {
    const { rawToken, invite } = await createRawInvite(campaignA, U1.id, { kind: "email", email: U2.email, label: "Convite para U2" });
    const { count } = await admin.from("campaign_members").select("*", { count: "exact", head: true }).eq("campaign_id", campaignA).eq("user_id", U2.id);
    record(
      "Nenhuma campaign_members criada no momento do convite por e-mail",
      count === 0,
      `linhas em campaign_members para U2 logo após criar o convite=${count}`,
    );

    // --- Teste: e-mail errado não ativa ---
    const { data: wrongResult, error: wrongErr } = await clientU3.rpc("accept_campaign_invite", { p_token: rawToken });
    record(
      "Conta com e-mail errado não consegue ativar convite por e-mail",
      !!wrongErr,
      wrongErr ? `rejeitado corretamente (${wrongErr.message})` : "ACEITO (falha grave)",
    );

    // --- Teste: e-mail correto ativa via accept_campaign_invite (fluxo de clicar no link) ---
    const { error: rightErr } = await clientU2.rpc("accept_campaign_invite", { p_token: rawToken });
    const { data: memberRow } = await admin.from("campaign_members").select("status, role").eq("campaign_id", campaignA).eq("user_id", U2.id).maybeSingle();
    const { data: inviteAfter } = await admin.from("campaign_invites").select("activated_at, activated_by").eq("id", invite.id).single();
    record(
      "Conta com e-mail correto ativa convite por e-mail via accept_campaign_invite",
      !rightErr && memberRow?.status === "active" && memberRow?.role === "player" && !!inviteAfter?.activated_at && inviteAfter?.activated_by === U2.id,
      `erro=${rightErr?.message ?? "nenhum"}; membership=${JSON.stringify(memberRow)}; convite ativado=${!!inviteAfter?.activated_at}`,
    );
  }

  // --- Teste: ativação automática via activate_pending_email_invites (sem clicar no link) ---
  {
    const U4 = await createFixtureUser("u4-auto-activate", `validation-invites2-u4-${RUN_TAG}@ruptura.dev`);
    const { invite } = await createRawInvite(campaignA, U1.id, { kind: "email", email: U4.email, label: "Convite auto-ativação" });
    const clientU4 = await signIn(U4);
    const { data: activateResult, error: activateErr } = await clientU4.rpc("activate_pending_email_invites");
    const { data: memberRow } = await admin.from("campaign_members").select("status").eq("campaign_id", campaignA).eq("user_id", U4.id).maybeSingle();
    const activatedList = activateResult?.activatedCampaignIds ?? [];
    record(
      "Ativação automática (activate_pending_email_invites) sem visitar o link",
      !activateErr && activatedList.includes(campaignA) && memberRow?.status === "active",
      `erro=${activateErr?.message ?? "nenhum"}; campanhas ativadas=${JSON.stringify(activatedList)}; membership=${JSON.stringify(memberRow)}`,
    );
    void invite;
  }

  // --- Teste: convite limpo funciona para qualquer conta e sempre concede Jogador ---
  {
    const U5 = await createFixtureUser("u5-clean-invite", `validation-invites2-u5-${RUN_TAG}@ruptura.dev`);
    const { rawToken } = await createRawInvite(campaignA, U1.id, { kind: "clean", label: "Convite limpo teste" });
    const clientU5 = await signIn(U5);
    const { error: acceptErr } = await clientU5.rpc("accept_campaign_invite", { p_token: rawToken });
    const { data: memberRow } = await admin.from("campaign_members").select("status, role").eq("campaign_id", campaignA).eq("user_id", U5.id).maybeSingle();
    record(
      "Convite limpo utilizável por qualquer conta, sempre concede Jogador",
      !acceptErr && memberRow?.status === "active" && memberRow?.role === "player",
      `erro=${acceptErr?.message ?? "nenhum"}; membership=${JSON.stringify(memberRow)}`,
    );
  }

  // --- Teste: revogar convite não remove participantes já ativos ---
  {
    const { rawToken, invite } = await createRawInvite(campaignA, U1.id, { kind: "clean", label: "Convite para revogar" });
    const U6 = await createFixtureUser("u6-revoke-test", `validation-invites2-u6-${RUN_TAG}@ruptura.dev`);
    const clientU6 = await signIn(U6);
    await clientU6.rpc("accept_campaign_invite", { p_token: rawToken });
    const { error: revokeErr } = await clientU1.from("campaign_invites").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", invite.id);
    const { data: memberAfter } = await admin.from("campaign_members").select("status").eq("campaign_id", campaignA).eq("user_id", U6.id).single();
    record(
      "Revogar convite não remove participantes já ativos",
      !revokeErr && memberAfter?.status === "active",
      `revoke erro=${revokeErr?.message ?? "nenhum"}; membership de U6 após revogar=${memberAfter?.status}`,
    );

    // Novo uso do convite revogado deve falhar.
    const U7 = await createFixtureUser("u7-post-revoke", `validation-invites2-u7-${RUN_TAG}@ruptura.dev`);
    const clientU7 = await signIn(U7);
    const { error: postRevokeErr } = await clientU7.rpc("accept_campaign_invite", { p_token: rawToken });
    record(
      "Convite revogado não aceita novos usos",
      !!postRevokeErr,
      postRevokeErr ? `rejeitado corretamente (${postRevokeErr.message})` : "ACEITO (falha grave)",
    );
  }

  // --- Teste: aceitar convite é idempotente para a mesma conta ---
  {
    const { rawToken } = await createRawInvite(campaignA, U1.id, { kind: "clean", label: "Convite idempotência" });
    const U8 = await createFixtureUser("u8-idempotent", `validation-invites2-u8-${RUN_TAG}@ruptura.dev`);
    const clientU8 = await signIn(U8);
    const { error: e1 } = await clientU8.rpc("accept_campaign_invite", { p_token: rawToken });
    const { error: e2 } = await clientU8.rpc("accept_campaign_invite", { p_token: rawToken });
    const { count } = await admin.from("campaign_members").select("*", { count: "exact", head: true }).eq("campaign_id", campaignA).eq("user_id", U8.id);
    record(
      "Aceitar convite é idempotente (mesma conta, múltiplas tentativas)",
      !e1 && !e2 && count === 1,
      `erro1=${e1?.message ?? "nenhum"}; erro2=${e2?.message ?? "nenhum"}; linhas em campaign_members=${count}`,
    );
  }

  // --- Teste: convite limpo nunca concede Narrador (RLS/RPC não aceita role diferente de player) ---
  {
    const { rawToken } = await createRawInvite(campaignA, U1.id, { kind: "clean", label: "Convite nunca vira narrador" });
    const U9 = await createFixtureUser("u9-never-owner", `validation-invites2-u9-${RUN_TAG}@ruptura.dev`);
    const clientU9 = await signIn(U9);
    await clientU9.rpc("accept_campaign_invite", { p_token: rawToken });
    const { data: memberRow } = await admin.from("campaign_members").select("role").eq("campaign_id", campaignA).eq("user_id", U9.id).single();
    record("Convite limpo nunca concede Narrador", memberRow?.role === "player", `role concedida=${memberRow?.role}`);
  }
}

async function cleanup() {
  console.log("\nLimpando fixtures...");
  for (const campaignId of createdCampaignIds) {
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
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

main()
  .catch((err) => {
    console.error("Erro fatal:", err.message);
    failed++;
  })
  .finally(async () => {
    const cleanExit = await cleanup();
    console.log(`\n${passed} testes aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) process.exitCode = 1;
  });
