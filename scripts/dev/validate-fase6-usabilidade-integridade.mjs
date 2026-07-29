#!/usr/bin/env node
/**
 * Testes comportamentais da Fase 6 (correção curta de usabilidade e
 * integridade — IDs internos, proteção de tipo_personagem, filtros de
 * personagem) contra o Supabase REAL, migration 0060.
 *
 * Cenário: U1 (narrador da Campanha A), U2 (narrador da Campanha B,
 * usado só para isolamento), U3/U4 (jogadores ativos de A).
 *
 * Service role usado SOMENTE para criar fixtures/inspecionar/limpar —
 * nunca como identidade submetida à autorização testada.
 *
 * Uso: npx tsx scripts/dev/validate-fase6-usabilidade-integridade.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import { personagemMatchesFiltro } from "../../src/lib/character/personagensFilter.ts";

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

const RUN_TAG = `fase6-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];

async function createFixtureUser(label, displayName) {
  const email = `validation-${label}-${RUN_TAG}@ruptura.dev`;
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
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
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO FASE6 ${label} (temp)`, owner_id: ownerId });
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

async function main() {
  const U1 = await createFixtureUser("u1-narrador", "Narradora Um");
  const U2 = await createFixtureUser("u2-narrador-b", "Narrador Dois");
  const U3 = await createFixtureUser("u3-jogador", "Jogador Três");
  const U4 = await createFixtureUser("u4-jogador"); // sem display_name — testa fallback humano

  const campaignA = await createCampaign(U1.id, "A");
  const campaignB = await createCampaign(U2.id, "B");
  await addActiveMember(campaignA, U3.id);
  await addActiveMember(campaignA, U4.id);

  const clientU1 = await signIn(U1);
  const clientU2 = await signIn(U2);
  const clientU3 = await signIn(U3);

  // =====================================================================
  // Correção 1 — nomes de exibição / e-mail via get_campaign_participant_info
  // =====================================================================

  {
    const { data, error } = await clientU1.rpc("get_campaign_participant_info", { p_campaign_id: campaignA });
    const rows = data ?? [];
    const u3Row = rows.find((r) => r.user_id === U3.id);
    const u4Row = rows.find((r) => r.user_id === U4.id);
    const ok =
      !error &&
      u3Row?.display_name === "Jogador Três" &&
      u3Row?.email === U3.email &&
      !!u4Row?.display_name &&
      u4Row.display_name !== U4.id && // nunca UUID
      /^[^@]+$/.test(u4Row.display_name); // fallback = parte local do e-mail (humano, não UUID)
    record(
      "Correção 1 — Teste A (narrador vê nome+e-mail de participante, com fallback humano quando sem display_name)",
      ok,
      `U3: nome="${u3Row?.display_name}" email="${u3Row?.email}"; U4 (sem display_name): nome="${u4Row?.display_name}" (nunca UUID)`,
    );
  }

  {
    // Jogador não é narrador de A: RPC devolve vazio (não é caminho de UI hoje, mas a restrição do servidor precisa valer de qualquer forma).
    const { data } = await clientU3.rpc("get_campaign_participant_info", { p_campaign_id: campaignA });
    const ok = Array.isArray(data) && data.length === 0;
    record("Correção 1 — Teste B (jogador não recebe dados de participantes pela RPC — só o narrador)", ok, `linhas devolvidas a U3: ${data?.length ?? "erro"}`);
  }

  {
    // Isolamento entre campanhas: narrador de B não vê nada de A.
    const { data } = await clientU2.rpc("get_campaign_participant_info", { p_campaign_id: campaignA });
    const ok = Array.isArray(data) && data.length === 0;
    record("Correção 1 — Teste C (isolamento: narrador de outra campanha não vê participantes de A)", ok, `linhas devolvidas a U2 (dono de B) sobre A: ${data?.length ?? "erro"}`);
  }

  // =====================================================================
  // Correção 2 — proteção de tipo_personagem em update_character_sheet_payload
  // =====================================================================

  const CJ = await createCharacter(campaignA, "CJ-jogador");
  await clientU1.rpc("grant_character_control", { p_character_id: CJ, p_user_id: U3.id });

  {
    // Jogador altera campo normal — continua funcionando.
    const { data: atual } = await admin.from("characters").select("payload").eq("id", CJ).single();
    const novoPayload = { ...atual.payload, nome: "CJ-jogador-editado", recursos_atuais: { pv: 7 } };
    const { data, error } = await clientU3.rpc("update_character_sheet_payload", { p_character_id: CJ, p_payload: novoPayload });
    const ok = !error && data?.payload?.nome === "CJ-jogador-editado" && data?.payload?.recursos_atuais?.pv === 7;
    record("Correção 2 — Teste A (jogador controlador altera campos normais da ficha)", ok, `erro=${error?.message ?? "nenhum"}; nome=${data?.payload?.nome}; pv=${data?.payload?.recursos_atuais?.pv}`);
  }

  {
    // Jogador tenta transformar o próprio personagem em PN — servidor preserva ausência.
    const { data: atual } = await admin.from("characters").select("payload").eq("id", CJ).single();
    const payloadComPn = { ...atual.payload, metadados: { ...atual.payload.metadados, tipo_personagem: "pn" } };
    const { data, error } = await clientU3.rpc("update_character_sheet_payload", { p_character_id: CJ, p_payload: payloadComPn });
    const ok = !error && data?.payload?.metadados?.tipo_personagem === undefined;
    record("Correção 2 — Teste B (jogador não consegue marcar o próprio personagem como PN)", ok, `erro=${error?.message ?? "nenhum"}; tipo_personagem após salvar=${JSON.stringify(data?.payload?.metadados?.tipo_personagem)}`);
  }

  // Narrador marca CJ como PN administrativamente (fora da RPC do jogador — caminho direto de UPDATE do narrador).
  {
    const { data: atual } = await admin.from("characters").select("payload").eq("id", CJ).single();
    const payloadPn = { ...atual.payload, metadados: { ...atual.payload.metadados, tipo_personagem: "pn" } };
    const { error } = await clientU1.from("characters").update({ payload: payloadPn }).eq("id", CJ);
    if (error) throw new Error(`Falha ao preparar Teste C (narrador marcar PN): ${error.message}`);
  }

  {
    // Jogador tenta REMOVER a classificação PN já existente.
    const { data: atual } = await admin.from("characters").select("payload").eq("id", CJ).single();
    const { tipo_personagem, ...metadadosSemTipo } = atual.payload.metadados;
    void tipo_personagem;
    const payloadSemPn = { ...atual.payload, metadados: metadadosSemTipo };
    const { data, error } = await clientU3.rpc("update_character_sheet_payload", { p_character_id: CJ, p_payload: payloadSemPn });
    const ok = !error && data?.payload?.metadados?.tipo_personagem === "pn";
    record("Correção 2 — Teste C (jogador não consegue remover a classificação PN existente)", ok, `erro=${error?.message ?? "nenhum"}; tipo_personagem após salvar=${JSON.stringify(data?.payload?.metadados?.tipo_personagem)}`);
  }

  {
    // Jogador tenta substituir indiretamente via payload completo novo (sem metadados algum).
    const payloadNovo = { nome: "CJ-payload-inteiro-novo", atributos: { corpo: 1, mente: 1, animo: 1 }, pericias: {} };
    const { data, error } = await clientU3.rpc("update_character_sheet_payload", { p_character_id: CJ, p_payload: payloadNovo });
    const ok = !error && data?.payload?.metadados?.tipo_personagem === "pn" && data?.payload?.nome === "CJ-payload-inteiro-novo";
    record(
      "Correção 2 — Teste D (payload completo novo do jogador não apaga tipo_personagem por omissão)",
      ok,
      `erro=${error?.message ?? "nenhum"}; nome=${data?.payload?.nome}; tipo_personagem=${JSON.stringify(data?.payload?.metadados?.tipo_personagem)}`,
    );
  }

  {
    // Narrador continua podendo definir/alterar a classificação livremente (caminho administrativo, fora da RPC do jogador).
    const { data: atual } = await admin.from("characters").select("payload").eq("id", CJ).single();
    const payloadSemPn = { ...atual.payload, metadados: { ...atual.payload.metadados, tipo_personagem: undefined } };
    delete payloadSemPn.metadados.tipo_personagem;
    const { data, error } = await clientU1.from("characters").update({ payload: payloadSemPn }).eq("id", CJ).select().single();
    const ok = !error && data?.payload?.metadados?.tipo_personagem === undefined;
    record("Correção 2 — Teste E (narrador continua podendo alterar/remover tipo_personagem pelo caminho administrativo)", ok, `erro=${error?.message ?? "nenhum"}; tipo_personagem=${JSON.stringify(data?.payload?.metadados?.tipo_personagem)}`);
  }

  // =====================================================================
  // Correção 3 — filtros de personagem (controle exige participação ativa
  // e função Jogador; narrador não recebe controle redundante ao criar)
  // =====================================================================

  {
    // Narrador cria personagem via complete_character_creation na própria campanha — não deve gerar controle redundante.
    const payload = {
      nome: "Criado-por-narrador-wizard",
      atributos: { corpo: 1, mente: 1, animo: 1 },
      pericias: {},
      niveis_vertente: {},
      magias_aprendidas: [],
      talentos_adquiridos: [],
      inventario: [],
      carteira: { aretz_informal: 5000, cdi: 0, cdi_craqueada: 0 },
    };
    const { data, error } = await clientU1.rpc("complete_character_creation", { p_campaign_id: campaignA, p_character_payload: payload });
    const charId = data?.character?.id;
    const { data: controllerRow } = await admin.from("character_controllers").select("user_id").eq("character_id", charId).eq("user_id", U1.id).maybeSingle();
    const ok = !error && !!charId && !controllerRow;
    record(
      "Correção 3 — Teste A (narrador criando personagem pelo assistente na própria campanha não gera controle redundante)",
      ok,
      `erro=${error?.message ?? "nenhum"}; personagem criado=${!!charId}; linha de controle redundante para o narrador=${!!controllerRow ? "SIM (falha)" : "não (correto)"}`,
    );
    if (charId) await admin.from("characters").delete().eq("id", charId);
  }

  {
    // Jogador criando personagem pelo assistente continua recebendo controle automaticamente.
    const payload = {
      nome: "Criado-por-jogador-wizard",
      atributos: { corpo: 1, mente: 1, animo: 1 },
      pericias: {},
      niveis_vertente: {},
      magias_aprendidas: [],
      talentos_adquiridos: [],
      inventario: [],
      carteira: { aretz_informal: 5000, cdi: 0, cdi_craqueada: 0 },
    };
    const { data, error } = await clientU3.rpc("complete_character_creation", { p_campaign_id: campaignA, p_character_payload: payload });
    const charId = data?.character?.id;
    const { data: controllerRow } = await admin.from("character_controllers").select("user_id").eq("character_id", charId).eq("user_id", U3.id).maybeSingle();
    const ok = !error && !!charId && !!controllerRow;
    record(
      "Correção 3 — Teste B (jogador criando personagem pelo assistente recebe controle automaticamente)",
      ok,
      `erro=${error?.message ?? "nenhum"}; personagem criado=${!!charId}; controle concedido ao criador=${!!controllerRow}`,
    );
    if (charId) await admin.from("characters").delete().eq("id", charId);
  }

  {
    // Cenário completo de filtros: PSJ (sem controlador, não PN), CPN_SOLO (PN sem jogador),
    // CJOG (atribuído a jogador ativo), CPN_JOG (PN + atribuído a jogador ativo),
    // e um personagem com controle residual de participante REMOVIDO (não deve contar em Jogadores).
    const PSJ = await createCharacter(campaignA, "PSJ-sem-jogador");
    const CPN_SOLO = await createCharacter(campaignA, "CPN-solo", { payload: { nome: "CPN-solo", metadados: { schema_version: 1, tipo_personagem: "pn" } } });
    const CJOG = await createCharacter(campaignA, "CJOG-atribuido");
    const CPN_JOG = await createCharacter(campaignA, "CPN-atribuido", { payload: { nome: "CPN-atribuido", metadados: { schema_version: 1, tipo_personagem: "pn" } } });
    const CREMOVIDO = await createCharacter(campaignA, "C-controle-residual");

    await clientU1.rpc("grant_character_control", { p_character_id: CJOG, p_user_id: U3.id });
    await clientU1.rpc("grant_character_control", { p_character_id: CPN_JOG, p_user_id: U4.id });
    await clientU1.rpc("grant_character_control", { p_character_id: CREMOVIDO, p_user_id: U4.id });
    // U4 é removido de A DEPOIS de já controlar CREMOVIDO — controle residual deve ser ignorado pelo filtro.
    await admin.from("campaign_members").update({ status: "removed" }).eq("campaign_id", campaignA).eq("user_id", U4.id);

    // Simula exatamente o que PersonagensNarradorClient calcula: activeJogadorUserIds = participantes com role=player e status=active.
    const { data: membrosAtivos } = await admin.from("campaign_members").select("user_id").eq("campaign_id", campaignA).eq("role", "player").eq("status", "active");
    const activeJogadorUserIds = new Set((membrosAtivos ?? []).map((m) => m.user_id));

    const { data: controles } = await admin.from("character_controllers").select("character_id, user_id").eq("campaign_id", campaignA);
    function activeCount(charId) {
      return (controles ?? []).filter((c) => c.character_id === charId && activeJogadorUserIds.has(c.user_id)).length;
    }

    const { data: rows } = await admin.from("characters").select("*").in("id", [PSJ, CPN_SOLO, CJOG, CPN_JOG, CREMOVIDO]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    const psjOk = personagemMatchesFiltro(byId[PSJ], "sem_jogador", activeCount(PSJ)) && !personagemMatchesFiltro(byId[PSJ], "jogadores", activeCount(PSJ));
    record("Correção 3 — Teste C (sem controlador e não PN → Sem jogador, não Jogadores)", psjOk, `PSJ: sem_jogador=${personagemMatchesFiltro(byId[PSJ], "sem_jogador", activeCount(PSJ))}, jogadores=${personagemMatchesFiltro(byId[PSJ], "jogadores", activeCount(PSJ))}`);

    const cpnSoloOk = personagemMatchesFiltro(byId[CPN_SOLO], "pns", activeCount(CPN_SOLO)) && !personagemMatchesFiltro(byId[CPN_SOLO], "jogadores", activeCount(CPN_SOLO));
    record("Correção 3 — Teste D (PN e sem jogador → PNs, não Jogadores)", cpnSoloOk, `CPN_SOLO: pns=${personagemMatchesFiltro(byId[CPN_SOLO], "pns", activeCount(CPN_SOLO))}, jogadores=${personagemMatchesFiltro(byId[CPN_SOLO], "jogadores", activeCount(CPN_SOLO))}`);

    const cjogOk = personagemMatchesFiltro(byId[CJOG], "jogadores", activeCount(CJOG)) && !personagemMatchesFiltro(byId[CJOG], "sem_jogador", activeCount(CJOG));
    record("Correção 3 — Teste E (atribuído a jogador ativo → Jogadores)", cjogOk, `CJOG: jogadores=${personagemMatchesFiltro(byId[CJOG], "jogadores", activeCount(CJOG))}, activeCount=${activeCount(CJOG)}`);

    const cpnJogOkAntes = personagemMatchesFiltro(byId[CPN_JOG], "pns", 0);
    // CPN_JOG foi atribuído a U4, que JÁ FOI removido no passo acima — então, para este teste específico, reatribuímos a U3 (ativo) para provar o caso "PN atribuído a jogador ATIVO".
    await clientU1.rpc("grant_character_control", { p_character_id: CPN_JOG, p_user_id: U3.id });
    const { data: controles2 } = await admin.from("character_controllers").select("character_id, user_id").eq("campaign_id", campaignA);
    const activeCount2 = (charId) => (controles2 ?? []).filter((c) => c.character_id === charId && activeJogadorUserIds.has(c.user_id)).length;
    const cpnJogOk = personagemMatchesFiltro(byId[CPN_JOG], "pns", activeCount2(CPN_JOG)) && personagemMatchesFiltro(byId[CPN_JOG], "jogadores", activeCount2(CPN_JOG));
    record(
      "Correção 3 — Teste F (PN atribuído a jogador ativo → PNs E Jogadores simultaneamente)",
      cpnJogOkAntes && cpnJogOk,
      `CPN_JOG: pns=${personagemMatchesFiltro(byId[CPN_JOG], "pns", activeCount2(CPN_JOG))}, jogadores=${personagemMatchesFiltro(byId[CPN_JOG], "jogadores", activeCount2(CPN_JOG))}, activeCount=${activeCount2(CPN_JOG)}`,
    );

    const cremovidoOk = activeCount(CREMOVIDO) === 0 && !personagemMatchesFiltro(byId[CREMOVIDO], "jogadores", activeCount(CREMOVIDO));
    record(
      "Correção 3 — Teste G (controlador com participação removida não mantém personagem em Jogadores)",
      cremovidoOk,
      `CREMOVIDO: controle residual em character_controllers=SIM; activeJogadorCount=${activeCount(CREMOVIDO)}; aparece em Jogadores=${personagemMatchesFiltro(byId[CREMOVIDO], "jogadores", activeCount(CREMOVIDO))}`,
    );

    await admin.from("campaign_members").update({ status: "active" }).eq("campaign_id", campaignA).eq("user_id", U4.id);
    await admin.from("characters").delete().in("id", [PSJ, CPN_SOLO, CJOG, CPN_JOG, CREMOVIDO]);
  }

  await admin.from("characters").delete().eq("id", CJ);
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
    console.error("Erro fatal na validação da Fase 6:", err.message, err.stack);
    failed++;
  })
  .finally(async () => {
    const cleanExit = await cleanup();
    console.log(`\n${passed} testes aprovados, ${failed} reprovados.`);
    if (failed > 0 || !cleanExit) {
      process.exitCode = 1;
    }
  });
