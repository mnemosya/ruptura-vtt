#!/usr/bin/env node
/**
 * Testes 11 e 20 da seção 13.8 do relatório de auditoria (revisão 4) —
 * só fazem sentido DEPOIS da migration destrutiva (0058), que remove
 * campaign_profiles/profile_sessions e as 15 RPCs/helpers do modelo de
 * perfil. Rodar via: npx tsx scripts/dev/validate-post-destructive-migration.mjs
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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
  // --- Teste 11: remoção definitiva confirmada ---
  {
    const { error: cpErr } = await admin.from("campaign_profiles").select("id").limit(1);
    const { error: psErr } = await admin.from("profile_sessions").select("id").limit(1);
    const cpGone = !!cpErr && /does not exist|not find the table|schema cache/i.test(cpErr.message ?? "");
    const psGone = !!psErr && /does not exist|not find the table|schema cache/i.test(psErr.message ?? "");
    record(
      "Teste 11 (campaign_profiles/profile_sessions removidas de verdade)",
      cpGone && psGone,
      `campaign_profiles: ${cpErr ? cpErr.message : "AINDA EXISTE (falha grave)"}; profile_sessions: ${psErr ? psErr.message : "AINDA EXISTE (falha grave)"}`,
    );
  }

  // --- Teste 20: nenhum objeto fora da lista aprovada foi removido ---
  {
    // Confirma que os objetos que DEVIAM sobreviver (não estavam na
    // lista de remoção) continuam existindo e funcionais.
    const survivors = [
      { label: "characters", check: async () => !(await admin.from("characters").select("id").limit(1)).error },
      { label: "campaign_members", check: async () => !(await admin.from("campaign_members").select("id").limit(1)).error },
      { label: "campaign_invites", check: async () => !(await admin.from("campaign_invites").select("id").limit(1)).error },
      { label: "character_controllers", check: async () => !(await admin.from("character_controllers").select("character_id").limit(1)).error },
      { label: "character_creation_drafts", check: async () => !(await admin.from("character_creation_drafts").select("id").limit(1)).error },
      { label: "table_logs", check: async () => !(await admin.from("table_logs").select("id").limit(1)).error },
      { label: "is_campaign_owner (função)", check: async () => !(await admin.rpc("is_campaign_owner", { p_campaign_id: "00000000-0000-0000-0000-000000000000" })).error },
      { label: "is_campaign_member (função)", check: async () => !(await admin.rpc("is_campaign_member", { p_campaign_id: "00000000-0000-0000-0000-000000000000" })).error },
      { label: "can_read_character (função)", check: async () => !(await admin.rpc("can_read_character", { p_character_id: "00000000-0000-0000-0000-000000000000" })).error },
      { label: "grant_character_control (função)", check: async () => {
          const { error } = await admin.rpc("grant_character_control", { p_character_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" });
          // Espera-se um erro de NEGÓCIO (personagem sem campanha / não encontrado) — não um erro de "função não existe".
          return !error || !/does not exist|schema cache/i.test(error.message ?? "");
        } },
      { label: "complete_character_creation (função)", check: async () => {
          const { error } = await admin.rpc("complete_character_creation", { p_campaign_id: "00000000-0000-0000-0000-000000000000", p_character_payload: {} });
          return !error || !/does not exist|schema cache/i.test(error.message ?? "");
        } },
    ];
    const results = await Promise.all(survivors.map(async (s) => ({ label: s.label, ok: await s.check().catch(() => false) })));
    const allOk = results.every((r) => r.ok);
    record(
      "Teste 20 (migration destrutiva não removeu nada fora da lista aprovada)",
      allOk,
      results.map((r) => `${r.label}=${r.ok ? "OK" : "QUEBRADO"}`).join("; "),
    );
  }

  // --- Confirma que is_character_controller (novo helper público) sobrevive ---
  {
    const { error } = await admin.rpc("is_character_controller", { p_character_id: "00000000-0000-0000-0000-000000000000" });
    record("Extra (is_character_controller ainda existe e funcional)", !error, `erro=${error?.message ?? "nenhum"}`);
  }
}

main()
  .catch((err) => {
    console.error("Erro fatal:", err.message);
    failed++;
  })
  .finally(() => {
    console.log(`\n${passed} testes aprovados, ${failed} reprovados.`);
    if (failed > 0) process.exitCode = 1;
  });
