#!/usr/bin/env node
/**
 * Verificação ESTÁTICA (não substitui prova em Supabase real) da Etapa
 * 12, correção 7 — migration 0032. Lê o texto das migrations 0004,
 * 0007, 0009, 0030, 0031, 0032 e confirma, por análise estrutural (não
 * por execução de SQL), que:
 *
 *   - as policies REALMENTE ativas de `campaign_profiles`/
 *     `profile_sessions` para `anon`/`authenticated` genérico
 *     (`*_dev_transition_*`) são dropadas na migration 0032 usando o
 *     NOME CORRETO (o nome pós-rename da migration 0007 — o achado
 *     desta correção é que 0030/0031 usavam o nome ERRADO,
 *     pré-rename, e por isso nunca as removiam de fato);
 *   - `revoke all ... from anon` existe para as duas tabelas;
 *   - a policy `campaign_profiles_authenticated_update` da 0032 não
 *     contém mais `user_id = ` na sua definição (o jogador perde o
 *     UPDATE direto, só owner);
 *   - as RPCs novas existem com `security definer` + `search_path`
 *     explícito + `revoke all ... from public`;
 *   - `set_campaign_profile_active_character` valida
 *     `campaign_id`/`profile_id` do personagem antes de gravar;
 *   - `get_character_for_profile_session`/
 *     `save_character_for_profile_session` (versão 0032) checam
 *     `profile_id = p_profile_id` na consulta/UPDATE de `characters`
 *     (não confiam só em `active_character_id`).
 *
 * NÃO prova comportamento de RLS/transação real — isso exige um
 * Supabase conectado (ver checkpoint, seção "Verificações não
 * executadas"). Isto só prova que o TEXTO da migration contém as
 * cláusulas esperadas — é uma rede de segurança contra o tipo exato de
 * erro que motivou esta correção (nome de policy errado em 0030/0031),
 * não uma prova de autorização.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function read(name) {
  const full = path.join(MIGRATIONS_DIR, name);
  if (!fs.existsSync(full)) throw new Error(`Migration não encontrada: ${name}`);
  return fs.readFileSync(full, "utf8");
}

let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  console.log(`ok - ${label}`);
  passed++;
}

const m0007 = read("0007_rls_controlled.sql");
const m0009 = read("0009_profile_sessions.sql");
const m0032 = read("0032_lockdown_profile_sessions_and_active_character.sql");

// --- Confirma o nome REAL das policies (pós-rename 0007) ---
check(
  "0007 renomeia campaign_profiles_dev_anon_* para campaign_profiles_dev_transition_* (nome real em vigor)",
  /alter policy campaign_profiles_dev_anon_select on campaign_profiles rename to campaign_profiles_dev_transition_select/.test(m0007),
);

// --- Confirma que 0032 dropa o nome CORRETO (não o antigo dev_anon) ---
for (const op of ["select", "insert", "update", "delete"]) {
  check(
    `0032 dropa campaign_profiles_dev_transition_${op} (nome real, não o dev_anon pré-rename)`,
    new RegExp(`drop policy if exists campaign_profiles_dev_transition_${op} on campaign_profiles;`).test(m0032),
  );
  check(
    `0032 dropa profile_sessions_dev_transition_${op}`,
    new RegExp(`drop policy if exists profile_sessions_dev_transition_${op} on profile_sessions;`).test(m0032),
  );
}

// --- profile_sessions_dev_transition_* existe mesmo na 0009 (nunca renomeada) ---
check(
  "0009 cria profile_sessions_dev_transition_* diretamente (sem fase dev_anon intermediária)",
  /create policy profile_sessions_dev_transition_select on profile_sessions/.test(m0009),
);

// --- revokes de anon presentes ---
check("0032 revoga acesso direto de anon a campaign_profiles", /revoke all on campaign_profiles from anon;/.test(m0032));
check("0032 revoga acesso direto de anon a profile_sessions", /revoke all on profile_sessions from anon;/.test(m0032));

// --- UPDATE de campaign_profiles deixa de ter braço "user_id = ..." (jogador não atualiza mais direto) ---
{
  const updateBlockMatch = m0032.match(
    /create policy campaign_profiles_authenticated_update[\s\S]*?;\n\n-- SELECT/,
  );
  const updateBlock = updateBlockMatch ? updateBlockMatch[0] : m0032;
  check(
    "campaign_profiles_authenticated_update (0032) não contém mais 'user_id = ' — só owner atualiza direto",
    !/user_id\s*=\s*\(select auth\.uid\(\)\)/.test(updateBlock),
  );
  check(
    "campaign_profiles_authenticated_update (0032) usa is_campaign_owner tanto em USING quanto em WITH CHECK",
    (updateBlock.match(/is_campaign_owner\(campaign_id\)/g) ?? []).length >= 2,
  );
}

// --- RPCs novas: security definer + search_path + revoke/grant mínimos ---
const novasRpcs = [
  ["enter_campaign_profile", "uuid, text, uuid"],
  ["heartbeat_profile_session", "uuid, uuid, text"],
  ["leave_campaign_profile", "uuid, uuid, text"],
  ["validate_profile_session_token", "uuid, uuid, uuid, text"],
  ["expire_stale_profile_sessions", "uuid, integer"],
  ["force_release_campaign_profile", "uuid"],
  ["set_campaign_profile_active_character", "uuid, uuid"],
];

for (const [name] of novasRpcs) {
  const fnRegex = new RegExp(`create or replace function ${name}\\(`);
  check(`RPC ${name} existe (create or replace function)`, fnRegex.test(m0032));
}

for (const [name, args] of novasRpcs) {
  const revokeRegex = new RegExp(`revoke all on function ${name}\\(${args.replace(/,/g, ",\\s*")}\\) from public;`);
  check(`RPC ${name} tem 'revoke all ... from public'`, revokeRegex.test(m0032));
}

// --- security definer + search_path explícito para as RPCs novas (checagem por bloco) ---
for (const [name] of novasRpcs) {
  const blockRegex = new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\$\\$;`);
  const block = m0032.match(blockRegex)?.[0] ?? "";
  check(`RPC ${name} é security definer`, /security definer/.test(block));
  check(`RPC ${name} define search_path explícito`, /set search_path (to )?['"]?public['"]?/.test(block));
}

// --- set_campaign_profile_active_character valida campaign_id e profile_id do personagem ---
{
  const block = m0032.match(/create or replace function set_campaign_profile_active_character[\s\S]*?\$\$;/)?.[0] ?? "";
  check(
    "set_campaign_profile_active_character valida characters.campaign_id contra o perfil",
    /v_character\.campaign_id is distinct from v_profile\.campaign_id/.test(block),
  );
  check(
    "set_campaign_profile_active_character valida characters.profile_id contra o perfil-alvo (vínculo canônico)",
    /v_character\.profile_id is distinct from p_profile_id/.test(block),
  );
  check(
    "set_campaign_profile_active_character rejeita personagem arquivado",
    /v_character\.archived_at is not null/.test(block),
  );
  check(
    "set_campaign_profile_active_character exige is_campaign_owner (só narrador)",
    /is_campaign_owner\(v_profile\.campaign_id\)/.test(block),
  );
}

// --- get/save_character_for_profile_session (0032) checam profile_id, não só active_character_id ---
{
  const getBlock = m0032.match(/create or replace function get_character_for_profile_session[\s\S]*?\$\$;/)?.[0] ?? "";
  check(
    "get_character_for_profile_session (0032) exige characters.profile_id = p_profile_id na consulta final",
    /where id = v_profile\.active_character_id[\s\S]*?and profile_id = p_profile_id/.test(getBlock),
  );

  const saveBlock = m0032.match(/create or replace function save_character_for_profile_session[\s\S]*?\$\$;/)?.[0] ?? "";
  check(
    "save_character_for_profile_session (0032) exige characters.profile_id = p_profile_id no WHERE do UPDATE",
    /where id = p_character_id[\s\S]*?and profile_id = p_profile_id/.test(saveBlock),
  );
}

console.log(`\n${passed} verificações estruturais passaram.`);
console.log("LEMBRETE: isto só confirma o TEXTO da migration — não prova RLS/autorização real. Exige Supabase conectado para prova de comportamento.");
