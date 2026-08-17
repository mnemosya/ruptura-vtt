#!/usr/bin/env node
/**
 * Testes comportamentais da RPC `list_campaign_roster` (migration 0061)
 * contra o Supabase REAL — Fase 0 da reestrutura da área de campanha.
 *
 * A RPC é uma mudança de AUTORIZAÇÃO, não um DTO visual: ela expõe a
 * um jogador comum a lista de participantes da campanha, coisa que
 * nenhuma leitura anterior fazia (`campaign_members` devolve ao jogador
 * só a própria linha; `get_campaign_participant_info` só responde ao
 * narrador). Por isso os critérios abaixo são testados de verdade, com
 * clients autenticados, e não conferidos no olho.
 *
 * Cenário:
 *   U1  dono da Campanha A            (narrador)
 *   U2  membro ativo de A             (jogador)
 *   U3  dono da Campanha B            (externo a A)
 *   U4  membro REMOVIDO de A          (status='removed')
 *   U5  membro CONVIDADO de A         (status='invited', ainda não aceitou)
 *   Campanha A  — sem linha de dono em campaign_members (campanha "nova")
 *   Campanha C  — dona U1, COM linha de dono em campaign_members
 *                 (simula campanha anterior à migration 0026, que fez
 *                 backfill do dono como membro role='owner')
 *
 * Service role usado SOMENTE para criar fixtures e limpar — nunca como
 * identidade submetida à autorização testada.
 *
 * Uso: npx tsx scripts/dev/validate-campaign-roster.mjs
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

const RUN_TAG = `roster-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label, displayName) {
  const email = `validation-roster-${label}-${RUN_TAG}@ruptura.dev`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(displayName ? { user_metadata: { display_name: displayName } } : {}),
  });
  if (error) throw new Error(`Falha ao criar usuário ${label}: ${error.message}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password, displayName: displayName ?? null };
}

async function signIn(user) {
  const client = freshAnonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`Falha ao logar ${user.email.split("@")[0]}: ${error.message}`);
  return client;
}

async function createCampaign(ownerId, label) {
  const id = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO ROSTER ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

async function addMember(campaignId, userId, status, role = "player") {
  const { error } = await admin
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: userId, role, status, origem: "fixture_roster" });
  if (error) throw new Error(`Falha ao adicionar membro (${status}): ${error.message}`);
}

async function roster(client, campaignId) {
  const { data, error } = await client.rpc("list_campaign_roster", { p_campaign_id: campaignId });
  if (error) throw new Error(`RPC falhou: ${error.message}`);
  return data ?? [];
}

let passed = 0;
let failed = 0;

function record(criterio, ok, detalhe) {
  if (ok) {
    passed++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    failed++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

async function main() {
  const U1 = await createFixtureUser("u1-narrador", "Narradora Um");
  const U2 = await createFixtureUser("u2-jogador", "Jogador Dois");
  const U3 = await createFixtureUser("u3-externo", "Externo Tres");
  const U4 = await createFixtureUser("u4-removido", "Removido Quatro");
  const U5 = await createFixtureUser("u5-convidado", "Convidado Cinco");

  const campA = await createCampaign(U1.id, "A");
  const campB = await createCampaign(U3.id, "B");
  const campC = await createCampaign(U1.id, "C-com-linha-de-dono");

  await addMember(campA, U2.id, "active");
  await addMember(campA, U4.id, "removed");
  await addMember(campA, U5.id, "invited");
  // Campanha C reproduz o backfill da migration 0026: dono TAMBÉM
  // presente em campaign_members como role='owner'.
  await addMember(campC, U1.id, "active", "owner");

  const cU1 = await signIn(U1);
  const cU2 = await signIn(U2);
  const cU3 = await signIn(U3);
  const cU4 = await signIn(U4);

  // --- 1. Participante ativo vê o roster ---
  {
    const linhas = await roster(cU2, campA);
    const ids = linhas.map((r) => r.user_id);
    const ok = ids.includes(U1.id) && ids.includes(U2.id) && linhas.length === 2;
    record("1 (participante ativo vê o roster)", ok, `U2 (jogador) recebeu ${linhas.length} linha(s): ${linhas.map((r) => `${r.display_name}/${r.role}`).join(", ")}`);
  }

  // --- 2. Usuário externo não vê nada ---
  {
    const linhas = await roster(cU3, campA);
    record("2 (externo não vê nada)", linhas.length === 0, `U3 (dono de outra campanha) recebeu ${linhas.length} linha(s)`);
  }

  // --- 3. Membro removido não aparece no roster ---
  {
    const linhas = await roster(cU1, campA);
    const temRemovido = linhas.some((r) => r.user_id === U4.id);
    const temConvidado = linhas.some((r) => r.user_id === U5.id);
    record("3 (removido/convidado não aparecem)", !temRemovido && !temConvidado, `removido presente=${temRemovido}, convidado presente=${temConvidado}`);
  }

  // --- 4. Membro removido não CONSEGUE ler o roster ---
  {
    const linhas = await roster(cU4, campA);
    record("4 (removido não lê o roster)", linhas.length === 0, `U4 (removido) recebeu ${linhas.length} linha(s)`);
  }

  // --- 5. Nenhuma coluna de e-mail é retornada ---
  {
    const linhas = await roster(cU2, campA);
    const chaves = new Set(linhas.flatMap((r) => Object.keys(r)));
    const temEmail = [...chaves].some((k) => /mail/i.test(k));
    const valorComArroba = linhas.some((r) => Object.values(r).some((v) => typeof v === "string" && v.includes("@")));
    record("5 (jogador não recebe e-mail)", !temEmail && !valorComArroba, `colunas=[${[...chaves].join(", ")}], algum valor com "@"=${valorComArroba}`);
  }

  // --- 6. Narrador aparece exatamente uma vez (campanha SEM linha de dono) ---
  {
    const linhas = await roster(cU2, campA);
    const doDono = linhas.filter((r) => r.user_id === U1.id);
    const narradores = linhas.filter((r) => r.role === "narrator");
    const ok = doDono.length === 1 && narradores.length === 1 && doDono[0].role === "narrator";
    record("6 (narrador 1× — campanha sem linha de dono)", ok, `linhas do dono=${doDono.length}, papel=${doDono[0]?.role ?? "(ausente)"}`);
  }

  // --- 7. Narrador aparece exatamente uma vez (campanha COM linha de dono, pós-backfill 0026) ---
  {
    const linhas = await roster(cU1, campC);
    const doDono = linhas.filter((r) => r.user_id === U1.id);
    const ok = doDono.length === 1 && doDono[0]?.role === "narrator";
    record("7 (narrador 1× — campanha com linha de dono)", ok, `linhas do dono=${doDono.length}, papel=${doDono[0]?.role ?? "(ausente)"} (esperado: 1 e "narrator", nunca duplicado nem "player")`);
  }

  // --- 8. Campanha diferente não vaza participantes ---
  {
    const linhasA = await roster(cU1, campA);
    const idsB = [U3.id];
    const vazou = linhasA.some((r) => idsB.includes(r.user_id));
    record("8 (isolamento entre campanhas)", !vazou, `roster de A contém participante de B? ${vazou ? "SIM (falha)" : "não (correto)"}`);
  }

  // --- 9. Nome de exibição usado, nunca UUID cru ---
  {
    const linhas = await roster(cU2, campA);
    const algumUuid = linhas.some((r) => r.display_name === r.user_id);
    const todosComNome = linhas.every((r) => typeof r.display_name === "string" && r.display_name.trim().length > 0);
    record("9 (nome de exibição, nunca UUID)", !algumUuid && todosComNome, `nomes=[${linhas.map((r) => r.display_name).join(", ")}]`);
  }

  // --- 10. Conta sem display_name cai no rótulo genérico, não no e-mail ---
  {
    const U6 = await createFixtureUser("u6-sem-nome");
    await addMember(campA, U6.id, "active");
    const linhas = await roster(cU2, campA);
    const linha = linhas.find((r) => r.user_id === U6.id);
    const localPart = U6.email.split("@")[0];
    const ok = !!linha && linha.display_name === "Jogador sem nome" && !linha.display_name.includes(localPart);
    record("10 (sem display_name não vaza local-part do e-mail)", ok, `recebido="${linha?.display_name ?? "(ausente)"}" (esperado "Jogador sem nome", jamais "${localPart}")`);
  }
}

async function cleanup() {
  for (const campaignId of createdCampaignIds) {
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
    console.error("Erro fatal na validação do roster:", err.message);
    failed++;
  })
  .finally(async () => {
    const cleanExit = await cleanup();
    console.log(`\n${passed} critérios aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) {
      process.exitCode = 1;
    }
  });
