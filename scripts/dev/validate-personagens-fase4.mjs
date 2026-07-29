#!/usr/bin/env node
/**
 * Testes comportamentais da Fase 4 (Personagens) contra o Supabase
 * REAL — cobre a lista "Testes mínimos — Fase 4" do pedido, usando
 * exclusivamente o modelo já concluído nas Fases 1/2
 * (character_controllers + campaign_members + campaigns.owner_id).
 *
 * Cenário: U1 (dono da Campanha A), U2 (dono da Campanha B), U3 e U4
 * (jogadores, membros ativos só de A). Personagens em A: CJ
 * (controlado por U3), CSJ (sem controlador, sem PN), CPN (marcado
 * como PN), CARQ (arquivado). CB pertence à Campanha B (isolamento).
 *
 * Service role usado SOMENTE para criar fixtures/inspecionar/limpar —
 * nunca como identidade submetida à autorização testada.
 *
 * Uso: npx tsx scripts/dev/validate-personagens-fase4.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import { personagemMatchesFiltro, isPersonagemPn } from "../../src/lib/character/personagensFilter.ts";

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

const RUN_TAG = `personagens-fase4-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label) {
  const email = `validation-${label}-${RUN_TAG}@ruptura.dev`;
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
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO PERSONAGENS ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

async function addActiveMember(campaignId, userId) {
  const { error } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: userId, role: "player", status: "active" });
  if (error) throw new Error(`Falha ao adicionar membership: ${error.message}`);
}

async function createCharacter(campaignId, name, extra = {}) {
  const id = randomUUID();
  const payload = { nome: name, metadados: { schema_version: 1 }, ...extra.payload };
  const { error } = await admin.from("characters").insert({
    id,
    name,
    payload,
    campaign_id: campaignId,
    archived_at: extra.archived_at ?? null,
  });
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
  const U1 = await createFixtureUser("u1-narrador-a");
  const U2 = await createFixtureUser("u2-narrador-b");
  const U3 = await createFixtureUser("u3-jogador");
  const U4 = await createFixtureUser("u4-jogador");
  const campaignA = await createCampaign(U1.id, "A");
  const campaignB = await createCampaign(U2.id, "B");
  await addActiveMember(campaignA, U3.id);
  await addActiveMember(campaignA, U4.id);

  const clientU1 = await signIn(U1);
  const clientU2 = await signIn(U2);
  const clientU3 = await signIn(U3);
  const clientU4 = await signIn(U4);

  const CJ = await createCharacter(campaignA, "CJ-controlado");
  const CSJ = await createCharacter(campaignA, "CSJ-sem-jogador");
  const CPN = await createCharacter(campaignA, "CPN-pn", { payload: { nome: "CPN-pn", metadados: { schema_version: 1, tipo_personagem: "pn" } } });
  const CARQ = await createCharacter(campaignA, "CARQ-arquivado", { archived_at: new Date().toISOString() });
  const CB = await createCharacter(campaignB, "CB-outra-campanha");

  await clientU1.rpc("grant_character_control", { p_character_id: CJ, p_user_id: U3.id });

  // --- Teste 1/2: jogador vê só o que controla, não lê o resto ---
  {
    const { data: visiveis } = await clientU3.from("characters").select("id").eq("campaign_id", campaignA);
    const ids = new Set((visiveis ?? []).map((r) => r.id));
    const soCJ = ids.has(CJ) && ids.size === 1;
    record("Teste 1 (jogador vê somente personagens controlados)", soCJ, `U3 vê ${ids.size} personagem(ns) em A: ${[...ids].join(",") || "(nenhum)"}`);

    const leSJ = await canReadCharacter(clientU3, CSJ);
    const lePN = await canReadCharacter(clientU3, CPN);
    record("Teste 2 (jogador não lê personagem não controlado)", !leSJ && !lePN, `U3 lê CSJ=${leSJ}, lê CPN=${lePN} (esperado: false, false)`);
  }

  // --- Teste 3: narrador vê todos, incluindo arquivado ---
  {
    const results = await Promise.all([CJ, CSJ, CPN, CARQ].map((id) => canReadCharacter(clientU1, id)));
    record("Teste 3 (narrador vê todos os personagens da própria campanha)", results.every(Boolean), `U1 lê CJ/CSJ/CPN/CARQ: ${results.join(",")}`);
  }

  // --- Teste 4: narrador não vê personagens de outra campanha ---
  {
    const leCB = await canReadCharacter(clientU1, CB);
    record("Teste 4 (narrador não vê personagens de outra campanha)", !leCB, `U1 (dono de A) lê CB (de B): ${leCB ? "SIM (falha)" : "não (correto)"}`);
  }

  // --- Teste 5/6/7: classificação de filtro (lógica real de PersonagensNarradorClient, via personagensFilter.ts) ---
  {
    const { data: csjRow } = await admin.from("characters").select("*").eq("id", CSJ).single();
    const { data: cpnRow } = await admin.from("characters").select("*").eq("id", CPN).single();
    const { data: carqRow } = await admin.from("characters").select("*").eq("id", CARQ).single();

    const csjOk =
      personagemMatchesFiltro(csjRow, "sem_jogador", 0) &&
      !personagemMatchesFiltro(csjRow, "jogadores", 0) &&
      !personagemMatchesFiltro(csjRow, "pns", 0) &&
      personagemMatchesFiltro(csjRow, "todos", 0);
    record("Teste 5 (personagem sem controlador aparece em Sem jogador)", csjOk, `CSJ: sem_jogador=true, jogadores=false, pns=false, todos=true — ${csjOk}`);

    const cpnOk = isPersonagemPn(cpnRow) && personagemMatchesFiltro(cpnRow, "pns", 0) && !personagemMatchesFiltro(cpnRow, "sem_jogador", 0);
    record("Teste 6 (PN aparece em PNs)", cpnOk, `CPN: isPn=${isPersonagemPn(cpnRow)}, pns=${personagemMatchesFiltro(cpnRow, "pns", 0)}, sem_jogador=${personagemMatchesFiltro(cpnRow, "sem_jogador", 0)}`);

    const carqOk =
      personagemMatchesFiltro(carqRow, "arquivados", 5) &&
      !personagemMatchesFiltro(carqRow, "todos", 5) &&
      !personagemMatchesFiltro(carqRow, "jogadores", 5) &&
      !personagemMatchesFiltro(carqRow, "sem_jogador", 0) &&
      !personagemMatchesFiltro(carqRow, "pns", 0);
    record("Teste 7 (arquivado aparece só no filtro correspondente)", carqOk, `CARQ aparece só em arquivados (mesmo com controllerCount>0 ou PN): ${carqOk}`);
  }

  // --- Teste 8: busca + filtro combinados sem resultado incoerente ---
  {
    const todos = [
      { ...(await admin.from("characters").select("*").eq("id", CJ).single()).data },
      { ...(await admin.from("characters").select("*").eq("id", CSJ).single()).data },
      { ...(await admin.from("characters").select("*").eq("id", CPN).single()).data },
      { ...(await admin.from("characters").select("*").eq("id", CARQ).single()).data },
    ];
    const controllerCounts = { [CJ]: 1, [CSJ]: 0, [CPN]: 0, [CARQ]: 0 };
    function buscar(nomeBusca, filtro) {
      return todos.filter((c) => personagemMatchesFiltro(c, filtro, controllerCounts[c.id] ?? 0) && c.name.toLowerCase().includes(nomeBusca.toLowerCase()));
    }
    const buscaPnComoJogador = buscar("cpn", "jogadores"); // nome bate, filtro não — deve dar vazio, não erro
    const buscaSemJogadorCerta = buscar("csj", "sem_jogador"); // nome e filtro batem — deve achar 1
    const combinavel = buscaPnComoJogador.length === 0 && buscaSemJogadorCerta.length === 1;
    record("Teste 8 (busca e filtros combináveis sem resultado incoerente)", combinavel, `busca "cpn"+filtro Jogadores=${buscaPnComoJogador.length} (esperado 0); busca "csj"+filtro Sem jogador=${buscaSemJogadorCerta.length} (esperado 1)`);
  }

  // --- Teste 9/10/11: atribuir/remover controle ---
  {
    const { error: grantErr } = await clientU1.rpc("grant_character_control", { p_character_id: CSJ, p_user_id: U4.id });
    const u4Le = await canReadCharacter(clientU4, CSJ);
    const u3Le = await canReadCharacter(clientU3, CSJ);
    record("Teste 9 (atribuir controle concede acesso ao jogador correto)", !grantErr && u4Le && !u3Le, `grant erro=${grantErr?.message ?? "nenhum"}; U4 lê=${u4Le}; U3 (não atribuído) lê=${u3Le}`);

    const { error: revokeErr } = await clientU1.rpc("revoke_character_control", { p_character_id: CSJ, p_user_id: U4.id });
    const u4LeDepois = await canReadCharacter(clientU4, CSJ);
    record("Teste 10 (remover controle revoga o acesso imediatamente)", !revokeErr && !u4LeDepois, `revoke erro=${revokeErr?.message ?? "nenhum"}; U4 lê depois=${u4LeDepois ? "SIM (falha)" : "não (correto)"}`);

    const { data: aindaExiste } = await admin.from("characters").select("id").eq("id", CSJ).maybeSingle();
    record("Teste 11 (remover controle não apaga o personagem)", !!aindaExiste, `CSJ ainda existe após revoke: ${!!aindaExiste}`);
  }

  // --- Teste 12: participante removido não acessa personagens mesmo com controle residual ---
  {
    await clientU1.rpc("grant_character_control", { p_character_id: CSJ, p_user_id: U4.id });
    await admin.from("campaign_members").update({ status: "removed" }).eq("campaign_id", campaignA).eq("user_id", U4.id);
    const { data: residual } = await admin.from("character_controllers").select("user_id").eq("character_id", CSJ).eq("user_id", U4.id).maybeSingle();
    const leApesarDoResidual = await canReadCharacter(clientU4, CSJ);
    record(
      "Teste 12 (participante removido não acessa mesmo com controle residual)",
      !!residual && !leApesarDoResidual,
      `controle residual presente=${!!residual}; U4 removido ainda lê CSJ=${leApesarDoResidual ? "SIM (falha grave)" : "não (correto)"}`,
    );
    await admin.from("campaign_members").update({ status: "active" }).eq("campaign_id", campaignA).eq("user_id", U4.id);
    await admin.from("character_controllers").delete().eq("character_id", CSJ).eq("user_id", U4.id);
  }

  // --- Teste 13: jogador não consegue atribuir/remover controle ---
  {
    const { error: grantErr } = await clientU3.rpc("grant_character_control", { p_character_id: CSJ, p_user_id: U3.id });
    const { error: revokeErr } = await clientU3.rpc("revoke_character_control", { p_character_id: CJ, p_user_id: U3.id });
    record("Teste 13 (jogador não consegue atribuir ou remover controle)", !!grantErr && !!revokeErr, `grant por U3: ${grantErr ? "rejeitado (correto)" : "ACEITO (falha grave)"}; revoke por U3: ${revokeErr ? "rejeitado (correto)" : "ACEITO (falha grave)"}`);
  }

  // --- Teste 14: jogador não consegue arquivar, restaurar ou duplicar por chamada direta ---
  {
    const { error: archiveErr, data: archiveData } = await clientU3.from("characters").update({ archived_at: new Date().toISOString() }).eq("id", CJ).select();
    const archiveBlocked = !!archiveErr || !archiveData || archiveData.length === 0;

    const { error: restoreErr, data: restoreData } = await clientU3.from("characters").update({ archived_at: null }).eq("id", CARQ).select();
    const restoreBlocked = !!restoreErr || !restoreData || restoreData.length === 0;

    const { error: dupErr, data: dupData } = await clientU3.from("characters").insert({ name: "Duplicata indevida", payload: { nome: "Duplicata indevida" }, campaign_id: campaignA }).select();
    const dupBlocked = !!dupErr || !dupData || dupData.length === 0;

    record(
      "Teste 14 (jogador não arquiva, restaura ou duplica por chamada direta)",
      archiveBlocked && restoreBlocked && dupBlocked,
      `archive bloqueado=${archiveBlocked}; restore bloqueado=${restoreBlocked}; duplicar(insert) bloqueado=${dupBlocked}`,
    );
  }

  // --- Teste 15: narrador executa as operações administrativas permitidas ---
  {
    // Emula createCharacterForCampaign (narrador logado, client autenticado
    // real, não admin) — mesmo padrão corrigido de insertCharacterScoped
    // (src/lib/character/storage.ts): INSERT sem .select() encadeado,
    // depois um SELECT separado. Ver comentário na função sobre por que
    // INSERT ... RETURNING quebra com can_read_character (STABLE).
    const criadoId = randomUUID();
    const { error: createViaOwnerErr } = await clientU1.from("characters").insert({ id: criadoId, name: "Criado-por-U1", payload: { nome: "Criado-por-U1" }, campaign_id: campaignA });
    const { data: criadoLido, error: rereadErr } = await clientU1.from("characters").select("id").eq("id", criadoId).maybeSingle();

    const { error: archErr } = await clientU1.from("characters").update({ archived_at: new Date().toISOString() }).eq("id", criadoId);
    const { error: restErr } = await clientU1.from("characters").update({ archived_at: null }).eq("id", criadoId);
    const { error: renameErr } = await clientU1.from("characters").update({ name: "Renomeado-por-U1", payload: { nome: "Renomeado-por-U1" } }).eq("id", criadoId);
    record(
      "Teste 15 (narrador executa criar/arquivar/restaurar/renomear)",
      !createViaOwnerErr && !rereadErr && !!criadoLido && !archErr && !restErr && !renameErr,
      `criar(via U1)=${!createViaOwnerErr}; releitura pós-criação=${!!criadoLido}; arquivar=${!archErr}; restaurar=${!restErr}; renomear=${!renameErr}`,
    );
  }

  // --- Teste 16: abrir ficha respeita permissões das Fases 1/2 ---
  {
    const controladorLe = await canReadCharacter(clientU3, CJ);
    const naoControladorLe = await canReadCharacter(clientU4, CJ);
    record("Teste 16 (abrir ficha respeita permissões das Fases 1/2)", controladorLe && !naoControladorLe, `controlador (U3) lê CJ=${controladorLe}; não-controlador (U4) lê CJ=${naoControladorLe ? "SIM (falha)" : "não (correto)"}`);
  }

  // --- Extra: duplicar preserva tipo_personagem (decisão de implementação da Fase 4) ---
  {
    const { data: cpnOriginal } = await admin.from("characters").select("payload").eq("id", CPN).single();
    const duplicataId = randomUUID();
    const duplicataPayload = { ...cpnOriginal.payload, nome: `${cpnOriginal.payload.nome} (cópia)` };
    await admin.from("characters").insert({ id: duplicataId, name: duplicataPayload.nome, payload: duplicataPayload, campaign_id: campaignA });
    const { data: duplicataRow } = await admin.from("characters").select("*").eq("id", duplicataId).single();
    const preserva = isPersonagemPn(duplicataRow);
    record("Extra (duplicar preserva tipo_personagem=pn)", preserva, `duplicata de CPN classificada como PN: ${preserva}`);
  }

  void clientU2; // usado só no Teste 4 (dono de B) — mantido para clareza do cenário
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

main()
  .catch((err) => {
    console.error("Erro fatal na validação de Personagens (Fase 4):", err.message);
    failed++;
  })
  .finally(async () => {
    const cleanExit = await cleanup();
    console.log(`\n${passed} testes aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) {
      process.exitCode = 1;
    }
  });
