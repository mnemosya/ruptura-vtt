#!/usr/bin/env node
/**
 * Validação FOCADA — checkpoint "Catálogo oficial de drones e robôs
 * consumido pela ficha", confirmação final pendente (ponto 2):
 * resolução efetiva (`resolveEffectiveList`) com DUAS campanhas reais
 * contra o Supabase configurado, confirmando que override/homebrew de
 * `companion_model` ficam isolados por campanha. Não monta personagens
 * completos, não repete Sinal Limpo/registro de drone/seed (já
 * aprovados nesta fase).
 *
 * Cria 2 campanhas reais + 1 narrador real (Admin API), autentica com
 * `signInWithPassword` (JWT real, mesmo padrão de
 * validate-campaign-session-concurrency.mjs), insere via service role
 * um OVERRIDE de `drone_mosca` só na campanha A e um HOMEBREW só na
 * campanha A (a escrita em si — publish_campaign_content_draft — já é
 * genérica por content_type e não foi tocada nesta fase; o que
 * importa aqui é a LEITURA/resolução, não o fluxo de rascunho).
 *
 * IMPORTANTE (limitação conhecida, não desta fase): o wrapper TS
 * `resolveEffectiveList`/`listCampaignContentDocumentsPublic` lê a
 * sessão via `next/headers` cookies() — indisponível fora de uma
 * request Next real. Por isso este script replica FIELMENTE (mesma
 * ordem: oficial -> override por slug -> + homebrews) o algoritmo de
 * `src/lib/campaignContent/resolveEffectiveContent.ts` usando um
 * client autenticado com o JWT real da mesma forma que
 * `getScopedTableClient` faria com uma sessão válida — exercitando a
 * RLS real (`can_read_campaign_content`), não uma simulação.
 *
 * Nunca imprime: token bruto, senha, chave anon/service role.
 *
 * Uso: npx tsx scripts/dev/validate-companion-model-resolver.mjs
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

const RUN_TAG = `companion-resolver-${Date.now()}`;
const createdUserIds = [];
const createdCampaignIds = [];
const createdContentDocIds = [];

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`OK   — ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL — ${label}`);
  }
}

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
  const { error } = await admin.from("campaigns").insert({ id, name: `VALIDACAO COMPANION MODEL ${label} (temp)`, owner_id: ownerId });
  if (error) throw new Error(`Falha ao criar campanha ${label}: ${error.message}`);
  createdCampaignIds.push(id);
  return id;
}

/** Mesma fórmula de payload_hash usada por publish_campaign_content_draft/seed-content.ts. */
function insertCampaignDoc({ campaignId, contentType, slug, originType, officialDocumentId, payload, createdBy }) {
  const id = `${campaignId}:${contentType}:${slug}`;
  createdContentDocIds.push(id);
  return admin.from("campaign_content_documents").insert({
    id,
    campaign_id: campaignId,
    content_type: contentType,
    slug,
    nome: payload.nome ?? null,
    origin_type: originType,
    official_document_id: officialDocumentId,
    official_version_base: officialDocumentId ? "1.0.0" : null,
    official_hash_base: null,
    payload,
    payload_hash: `test-${randomUUID()}`,
    status: "published",
    local_version: 1,
    created_by: createdBy,
    published_by: createdBy,
    published_at: new Date().toISOString(),
  });
}

/**
 * Réplica fiel de resolveEffectiveList (src/lib/campaignContent/
 * resolveEffectiveContent.ts) — oficial -> override por slug -> +
 * homebrews — usando um client já autenticado (RLS real).
 */
async function resolveEffectiveCompanionModels(authedClient, campaignId) {
  const { data: oficiais, error: errOficiais } = await admin
    .from("content_documents")
    .select("id, slug, nome, payload")
    .eq("content_type", "companion_model");
  if (errOficiais) throw new Error(`Falha ao ler oficiais: ${errOficiais.message}`);

  const { data: campanhaRows, error: errCampanha } = await authedClient
    .from("campaign_content_documents")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("content_type", "companion_model")
    .eq("status", "published");
  if (errCampanha) throw new Error(`Falha ao ler campaign_content_documents (RLS): ${errCampanha.message}`);

  const overridesPorSlug = new Map((campanhaRows ?? []).filter((r) => r.origin_type === "override").map((r) => [r.slug, r]));
  const homebrews = (campanhaRows ?? []).filter((r) => r.origin_type === "homebrew");

  const efetivos = (oficiais ?? []).map((doc) => {
    const override = overridesPorSlug.get(doc.slug);
    return override
      ? { slug: doc.slug, nome: override.nome, payload: override.payload, origem: "modificado_pela_mesa" }
      : { slug: doc.slug, nome: doc.nome, payload: doc.payload, origem: "oficial" };
  });
  for (const h of homebrews) {
    efetivos.push({ slug: h.slug, nome: h.nome, payload: h.payload, origem: "homebrew_da_mesa" });
  }
  return efetivos;
}

async function cleanup() {
  for (const id of createdContentDocIds) {
    await admin.from("campaign_content_documents").delete().eq("id", id);
  }
  for (const campaignId of createdCampaignIds) {
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
  console.log(`\nFixtures removidas. Campanhas remanescentes desta rodada: ${remaining}.`);
  return remaining === 0;
}

async function main() {
  console.log("=== validate-companion-model-resolver ===\n");

  const { data: oficialMosca, error: errOficial } = await admin
    .from("content_documents")
    .select("id, slug, nome, payload")
    .eq("content_type", "companion_model")
    .eq("slug", "drone_mosca")
    .single();
  if (errOficial || !oficialMosca) throw new Error("Oficial drone_mosca não encontrado — rode scripts/seed-content.ts primeiro.");

  const narrador = await createFixtureUser("narrador");
  const campaignA = await createCampaign(narrador.id, "A");
  const campaignB = await createCampaign(narrador.id, "B");

  // Override de drone_mosca SÓ na campanha A.
  const { error: errOverride } = await insertCampaignDoc({
    campaignId: campaignA,
    contentType: "companion_model",
    slug: "drone_mosca",
    originType: "override",
    officialDocumentId: oficialMosca.id,
    payload: { ...oficialMosca.payload, nome: "Drone Mosca (Override Campanha A)" },
    createdBy: narrador.id,
  });
  if (errOverride) throw new Error(`Falha ao inserir override: ${errOverride.message}`);

  // Homebrew SÓ na campanha A.
  const { error: errHomebrew } = await insertCampaignDoc({
    campaignId: campaignA,
    contentType: "companion_model",
    slug: `drone_homebrew_teste_${RUN_TAG}`,
    originType: "homebrew",
    officialDocumentId: null,
    payload: { slug: `drone_homebrew_teste_${RUN_TAG}`, nome: "Drone Homebrew Só da Mesa A", categoria: "drone", acoes: [] },
    createdBy: narrador.id,
  });
  if (errHomebrew) throw new Error(`Falha ao inserir homebrew: ${errHomebrew.message}`);

  const authed = await signIn(narrador);

  const efetivosA = await resolveEffectiveCompanionModels(authed, campaignA);
  const efetivosB = await resolveEffectiveCompanionModels(authed, campaignB);

  const moscaEmA = efetivosA.find((e) => e.slug === "drone_mosca");
  const moscaEmB = efetivosB.find((e) => e.slug === "drone_mosca");
  const homebrewEmA = efetivosA.find((e) => e.slug === `drone_homebrew_teste_${RUN_TAG}`);
  const homebrewEmB = efetivosB.find((e) => e.slug === `drone_homebrew_teste_${RUN_TAG}`);

  check("Override da Campanha A substitui o oficial APENAS nela (drone_mosca com nome de override)", moscaEmA?.nome === "Drone Mosca (Override Campanha A)" && moscaEmA?.origem === "modificado_pela_mesa");
  check("Campanha B continua vendo o drone_mosca OFICIAL (não afetada pelo override de A)", moscaEmB?.nome === oficialMosca.payload.nome && moscaEmB?.origem === "oficial");
  check("Homebrew de A aparece na lista efetiva de A", homebrewEmA !== undefined && homebrewEmA.origem === "homebrew_da_mesa");
  check("Homebrew de A NÃO aparece na lista efetiva de B", homebrewEmB === undefined);
  check("As 10 entradas oficiais continuam presentes em ambas as campanhas (só drone_mosca muda em A)", efetivosA.length === 11 && efetivosB.length === 10);

  const cleanExit = await cleanup();
  console.log(`\n${passed} verificações aprovadas, ${failed} reprovadas.`);
  if (failed > 0 || !cleanExit) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("Erro fatal na validação do resolvedor:", err.message);
  await cleanup().catch(() => {});
  process.exitCode = 1;
});
