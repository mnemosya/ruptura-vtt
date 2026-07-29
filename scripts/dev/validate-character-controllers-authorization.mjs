#!/usr/bin/env node
/**
 * Testes comportamentais da Fase 1 (revisão 4) contra o Supabase REAL —
 * docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_
 * PERSONAGENS.md, seção 13.8. Cobre os testes 1-10 e 12-19 (18 dos 20)
 * — os testes 11 e 20 (que dependem de campaign_profiles/profile_sessions
 * já terem sido REMOVIDAS) rodam depois da migration destrutiva, num
 * script separado (validate-post-destructive-migration.mjs).
 *
 * Cenário base: U1 (dono da Campanha A), U2 (dono da Campanha B), U3
 * (jogador, membro ativo só de A). Personagem C1 pertence à Campanha A.
 *
 * Service role usado SOMENTE para: criar usuários de teste, preparar
 * fixtures, inspecionar/limpar estado final — NUNCA como identidade
 * submetida à autorização testada (cada verificação usa um client
 * autenticado real via signInWithPassword).
 *
 * Uso: npx tsx scripts/dev/validate-character-controllers-authorization.mjs
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

const RUN_TAG = `authz-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label) {
  const email = `validation-authz-${label}-${RUN_TAG}@ruptura.dev`;
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
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO AUTHZ ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

async function addActiveMember(campaignId, userId, role = "player") {
  const { error } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: userId, role, status: "active", origem: "fixture_authz" });
  if (error) throw new Error(`Falha ao adicionar membership: ${error.message}`);
}

async function createCharacter(campaignId, name, extra = {}) {
  const id = randomUUID();
  const { error } = await admin.from("characters").insert({ id, name, payload: { nome: name }, campaign_id: campaignId, ...extra });
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

async function canReadCharacter(client, characterId) {
  const { data, error } = await client.from("characters").select("id").eq("id", characterId).maybeSingle();
  return !error && !!data;
}

async function main() {
  const U1 = await createFixtureUser("u1-owner-a");
  const U2 = await createFixtureUser("u2-owner-b");
  const U3 = await createFixtureUser("u3-player");
  const campaignA = await createCampaign(U1.id, "A");
  const campaignB = await createCampaign(U2.id, "B");
  await addActiveMember(campaignA, U3.id, "player");

  const C1 = await createCharacter(campaignA, "C1");
  const clientU1 = await signIn(U1);
  const clientU2 = await signIn(U2);
  const clientU3 = await signIn(U3);

  // --- Teste 1: isolamento entre campanhas ---
  {
    const canRead = await canReadCharacter(clientU2, C1);
    record("Teste 1 (isolamento entre campanhas)", !canRead, `U2 (dono de B) lê C1 de A? ${canRead ? "SIM (falha)" : "não (correto)"}`);
  }

  // --- Teste 2: narrador acessa sem ser controlador ---
  {
    const canRead = await canReadCharacter(clientU1, C1);
    const { error: updErr } = await clientU1.from("characters").update({ payload: { nome: "C1 editado pelo narrador" } }).eq("id", C1);
    record("Teste 2 (narrador acessa sem ser controlador)", canRead && !updErr, `U1 lê=${canRead}, edita=${!updErr}`);
  }

  // --- Teste 3: controle concede acesso ---
  {
    const { error: grantErr } = await clientU1.rpc("grant_character_control", { p_character_id: C1, p_user_id: U3.id });
    const canRead = await canReadCharacter(clientU3, C1);
    record("Teste 3 (controle concede acesso)", !grantErr && canRead, `grant erro=${grantErr?.message ?? "nenhum"}; U3 lê=${canRead}`);
  }

  // --- Teste 4: revogação remove acesso sem apagar personagem ---
  {
    const { error: revokeErr } = await clientU1.rpc("revoke_character_control", { p_character_id: C1, p_user_id: U3.id });
    const canReadAfter = await canReadCharacter(clientU3, C1);
    const { data: stillExists } = await admin.from("characters").select("id").eq("id", C1).maybeSingle();
    record("Teste 4 (revogação remove acesso sem apagar)", !revokeErr && !canReadAfter && !!stillExists, `revoke erro=${revokeErr?.message ?? "nenhum"}; U3 lê depois=${canReadAfter}; personagem existe=${!!stillExists}`);
  }

  // --- Teste 5: integridade de campaign_id via FK composta ---
  {
    const { error: insertErr } = await admin.from("character_controllers").insert({ character_id: C1, campaign_id: campaignB, user_id: U3.id, granted_by: U1.id });
    const isFkViolation = insertErr && (insertErr.code === "23503" || /foreign key/i.test(insertErr.message ?? ""));
    record("Teste 5 (integridade campaign_id via FK composta)", isFkViolation, `insert com campaign_id errado: ${insertErr ? `rejeitado (${insertErr.code ?? insertErr.message})` : "ACEITO (falha grave)"}`);
  }

  // --- Teste 6: grant exige membership ativa do alvo ---
  {
    const strangerNotMember = await createFixtureUser("stranger-not-member");
    const { error: grantErr } = await clientU1.rpc("grant_character_control", { p_character_id: C1, p_user_id: strangerNotMember.id });
    record("Teste 6 (grant exige membership ativa do alvo)", !!grantErr, `grant para não-membro: ${grantErr ? "rejeitado (correto)" : "ACEITO (falha grave)"}`);
  }

  // --- Teste 7: grant exige que o chamador seja dono ---
  {
    const { error: grantErr } = await clientU3.rpc("grant_character_control", { p_character_id: C1, p_user_id: U3.id });
    record("Teste 7 (grant exige que o chamador seja dono)", !!grantErr, `U3 (não-dono) tentando grant: ${grantErr ? "rejeitado (correto)" : "ACEITO (falha grave)"}`);
  }

  // --- Teste 8/9/10: caminho da ficha (RLS select direto, equivalente a getCharacterForCampaign) ---
  {
    await clientU1.rpc("grant_character_control", { p_character_id: C1, p_user_id: U3.id });
    const playerSees = await canReadCharacter(clientU3, C1);
    record("Teste 8 (ficha — caminho do jogador)", playerSees, `U3 controlador lê C1 via campaignId+characterId: ${playerSees}`);

    const narratorSees = await canReadCharacter(clientU1, C1);
    record("Teste 9 (ficha — caminho do narrador)", narratorSees, `U1 dono lê C1 via campaignId+characterId: ${narratorSees}`);

    const strangerSees = await canReadCharacter(clientU2, C1);
    record("Teste 10 (ficha — acesso negado para conta sem relação)", !strangerSees, `U2 sem relação lê C1: ${strangerSees ? "SIM (falha)" : "não (correto)"}`);
  }

  // --- Teste 12: participante removido perde acesso mesmo com controle residual ---
  {
    // U3 já tem controle de C1 (teste 8). Marca membership como removida
    // SEM apagar character_controllers (simula falha da limpeza best-effort).
    await admin.from("campaign_members").update({ status: "removed" }).eq("campaign_id", campaignA).eq("user_id", U3.id);
    const { data: residualControl } = await admin.from("character_controllers").select("user_id").eq("character_id", C1).eq("user_id", U3.id).maybeSingle();
    const canReadAfterRemoval = await canReadCharacter(clientU3, C1);
    record(
      "Teste 12 (participante removido perde acesso mesmo com controle residual)",
      !!residualControl && !canReadAfterRemoval,
      `controle residual presente=${!!residualControl}; U3 ainda lê C1=${canReadAfterRemoval ? "SIM (falha grave)" : "não (correto)"}`,
    );
    // Restaura membership ativa para os testes seguintes que dependem de U3 ser membro.
    await admin.from("campaign_members").update({ status: "active" }).eq("campaign_id", campaignA).eq("user_id", U3.id);
    await admin.from("character_controllers").delete().eq("character_id", C1).eq("user_id", U3.id);
  }

  // --- Teste 13: revogar controle remove acesso mesmo com owner_id residual ---
  {
    // Personagem com owner_id = U3 (residual/legado) MAS campaign_id setado.
    const C13 = await createCharacter(campaignA, "C13-owner-residual", { owner_id: U3.id });
    await clientU1.rpc("grant_character_control", { p_character_id: C13, p_user_id: U3.id });
    const canReadWithControl = await canReadCharacter(clientU3, C13);
    await clientU1.rpc("revoke_character_control", { p_character_id: C13, p_user_id: U3.id });
    const canReadAfterRevoke = await canReadCharacter(clientU3, C13);
    record(
      "Teste 13 (revogar controle remove acesso mesmo com owner_id residual)",
      canReadWithControl && !canReadAfterRevoke,
      `com controle lê=${canReadWithControl}; após revogar (owner_id ainda=U3) lê=${canReadAfterRevoke ? "SIM (falha grave — owner_id contornou)" : "não (correto)"}`,
    );
  }

  // --- Teste 14: personagem sem campanha ainda respeita owner_id ---
  {
    const C14 = await createCharacter(null, "C14-solto", { owner_id: U3.id });
    const canRead = await canReadCharacter(clientU3, C14);
    record("Teste 14 (personagem sem campanha respeita owner_id)", canRead, `U3 dono (owner_id) de personagem solto lê: ${canRead}`);
  }

  // --- Teste 15/16/17/18: controlador não altera campos administrativos ---
  {
    const C15 = await createCharacter(campaignA, "C15-administrativo");
    await clientU1.rpc("grant_character_control", { p_character_id: C15, p_user_id: U3.id });

    const { error: campaignIdErr, data: campaignIdData } = await clientU3.from("characters").update({ campaign_id: campaignB }).eq("id", C15).select();
    const campaignIdBlocked = !!campaignIdErr || !campaignIdData || campaignIdData.length === 0;
    record("Teste 15 (controlador não altera campaign_id)", campaignIdBlocked, `UPDATE campaign_id por U3: ${campaignIdErr ? "erro" : `0 linhas afetadas=${campaignIdData?.length === 0}`}`);

    const { error: ownerIdErr, data: ownerIdData } = await clientU3.from("characters").update({ owner_id: U3.id }).eq("id", C15).select();
    const ownerIdBlocked = !!ownerIdErr || !ownerIdData || ownerIdData.length === 0;
    record("Teste 16 (controlador não altera owner_id)", ownerIdBlocked, `UPDATE owner_id por U3: ${ownerIdErr ? "erro" : `0 linhas afetadas=${ownerIdData?.length === 0}`}`);

    const { error: archiveErr, data: archiveData } = await clientU3.from("characters").update({ archived_at: new Date().toISOString() }).eq("id", C15).select();
    const archiveBlocked = !!archiveErr || !archiveData || archiveData.length === 0;
    const { error: deleteErr, data: deleteData } = await clientU3.from("characters").delete().eq("id", C15).select();
    const deleteBlocked = !!deleteErr || !deleteData || deleteData.length === 0;
    record("Teste 17 (controlador não arquiva nem exclui)", archiveBlocked && deleteBlocked, `archive bloqueado=${archiveBlocked}; delete bloqueado=${deleteBlocked}`);

    const { data: c15After } = await admin.from("characters").select("campaign_id, owner_id, archived_at").eq("id", C15).single();
    const intact = c15After?.campaign_id === campaignA && c15After?.owner_id == null && c15After?.archived_at == null;
    record("Teste 18 (C15 continua íntegro em A após tentativas falharem)", intact, `campaign_id=${c15After?.campaign_id}, owner_id=${c15After?.owner_id}, archived_at=${c15After?.archived_at}`);
  }

  // --- Teste 19: narrador continua executando operações administrativas ---
  {
    const C19 = await createCharacter(campaignA, "C19-admin-narrador");
    const { error: e1 } = await clientU1.from("characters").update({ campaign_id: campaignA }).eq("id", C19);
    const { error: e2 } = await clientU1.from("characters").update({ owner_id: U1.id }).eq("id", C19);
    const { error: e3 } = await clientU1.from("characters").update({ archived_at: new Date().toISOString() }).eq("id", C19);
    const { error: e4 } = await clientU1.from("characters").update({ archived_at: null, payload: { nome: "C19 editado" } }).eq("id", C19);
    record("Teste 19 (narrador continua com poderes administrativos)", !e1 && !e2 && !e3 && !e4, `campaign_id=${!e1}, owner_id=${!e2}, archive=${!e3}, unarchive+payload=${!e4}`);
  }

  // --- update_character_sheet_payload: whitelist real (só payload) ---
  {
    const C20 = await createCharacter(campaignA, "C20-payload-whitelist");
    await clientU1.rpc("grant_character_control", { p_character_id: C20, p_user_id: U3.id });
    const { error: payloadErr } = await clientU3.rpc("update_character_sheet_payload", { p_character_id: C20, p_payload: { nome: "C20 editado pelo jogador" } });
    const { data: c20After } = await admin.from("characters").select("payload").eq("id", C20).single();
    record(
      "Extra (update_character_sheet_payload funciona para o controlador)",
      !payloadErr && c20After?.payload?.nome === "C20 editado pelo jogador",
      `erro=${payloadErr?.message ?? "nenhum"}; payload final=${JSON.stringify(c20After?.payload)}`,
    );
  }
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
  // Personagens soltos (campaign_id null) criados por owner_id de teste — limpeza por owner_id.
  for (const userId of createdUserIds) {
    await admin.from("characters").delete().is("campaign_id", null).eq("owner_id", userId);
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
    console.error("Erro fatal na validação de autorização:", err.message);
    failed++;
  })
  .finally(async () => {
    const cleanExit = await cleanup();
    console.log(`\n${passed} testes aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) {
      process.exitCode = 1;
    }
  });
