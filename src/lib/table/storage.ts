"use server";

/**
 * Persistência mínima de Mesa/Log (tabelas `campaigns`, `table_logs`,
 * `campaign_profiles`).
 *
 * Server Actions ("use server") — chamadas diretamente do Client
 * Component mas executadas no servidor. Checkpoint v0.16: o cliente
 * Supabase usado aqui é "scoped" à sessão da request
 * (`getScopedTableClient()`, ver src/lib/auth/scopedClient.ts):
 *
 *   - Sem narrador logado: client anon puro — comportamento IDÊNTICO
 *     ao de antes deste checkpoint.
 *   - Com narrador logado: client com o access token da sessão anexado,
 *     para que `auth.uid()` resolva nas policies RLS owner-scoped
 *     (migration 0006). Hoje isso ainda não restringe nada de verdade,
 *     porque as policies dev-anon (migrations 0002/0003/0004) continuam
 *     coexistindo — ver aviso completo na migration 0006 e no
 *     checkpoint v0.14 do relatório. É preparação, não segurança real
 *     ainda.
 *
 * Nunca a service role key — nem aqui, nem em scopedClient.ts.
 */

import { createHash, randomBytes } from "node:crypto";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { TableStorageError } from "./storage.errors";
import { PROFILE_HEARTBEAT_TIMEOUT_MS, CAMPAIGN_INVITE_SAFE_COLUMNS } from "./types";
import type { Campaign, CampaignInvite, CampaignProfile, TableLogEntry, TableLogVisibility } from "./types";

/**
 * Id do narrador logado (auth dev, checkpoint v0.13) ou null. Best
 * effort: getCurrentUser lê o cookie httpOnly via next/headers, que só
 * existe num contexto de request (Server Action/RSC); fora disso
 * (scripts node) cai no catch e retorna null, sem quebrar.
 */
async function currentOwnerId(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

const CAMPAIGNS_TABLE = "campaigns";
const TABLE_LOGS_TABLE = "table_logs";
const CAMPAIGN_PROFILES_TABLE = "campaign_profiles";
const CAMPAIGN_INVITES_TABLE = "campaign_invites";

/** Hash SHA-256 (hex) de um token de convite. O banco só guarda o hash. */
function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Cria uma mesa (campaign) de desenvolvimento. Carimba `owner_id` com o
 * narrador logado quando há sessão (auth dev, v0.13/v0.14); fica null
 * para mesas criadas sem login ("mesa dev legada"). A coluna owner_id é
 * nullable e a RLS ainda é a dev aberta — stampar aqui só prepara o
 * terreno para a segurança real futura (ver migration 0006), sem
 * mudar quem pode criar/ver mesas hoje.
 */
export async function createCampaign(name: string): Promise<Campaign> {
  const client = await getScopedTableClient();
  const finalName = name.trim() ? name.trim() : "Mesa sem nome";
  const ownerId = await currentOwnerId();
  const { data, error } = await client
    .from(CAMPAIGNS_TABLE)
    .insert({ name: finalName, owner_id: ownerId })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar mesa: ${error.message}`, error);
  }
  return data as Campaign;
}

/** Lista mesas, mais recentemente atualizadas primeiro. */
export async function listCampaigns(): Promise<Campaign[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from(CAMPAIGNS_TABLE).select().order("updated_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar mesas: ${error.message}`, error);
  }
  return (data as Campaign[]) ?? [];
}

/**
 * Busca uma mesa por id — usada por `/dev/join/[campaignId]` (checkpoint
 * v0.10) para resolver o link de entrada dev. Retorna `null` se não
 * existir (não lança erro nesse caso, só em falha de rede/RLS), para a
 * rota distinguir "mesa não encontrada" de "erro ao buscar".
 */
export async function getCampaign(id: string): Promise<Campaign | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from(CAMPAIGNS_TABLE).select().eq("id", id).maybeSingle();

  if (error) {
    throw new TableStorageError(`Falha ao buscar mesa "${id}": ${error.message}`, error);
  }
  return (data as Campaign | null) ?? null;
}

export interface AddLogParams {
  campaignId: string;
  characterId?: string;
  type: string;
  visibility: TableLogVisibility;
  payload: Record<string, unknown>;
}

/** Registra uma entrada no log persistente de uma mesa. Append-only. */
export async function addLog(params: AddLogParams): Promise<TableLogEntry> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE_LOGS_TABLE)
    .insert({
      campaign_id: params.campaignId,
      character_id: params.characterId ?? null,
      type: params.type,
      visibility: params.visibility,
      payload: params.payload,
    })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao registrar log na mesa "${params.campaignId}": ${error.message}`, error);
  }
  return data as TableLogEntry;
}

/** Lista os logs de uma mesa, mais recentes primeiro. */
export async function listLogs(campaignId: string): Promise<TableLogEntry[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE_LOGS_TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar logs da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as TableLogEntry[]) ?? [];
}

/**
 * Cria um perfil DEV (apelido) numa mesa (tabela `campaign_profiles`,
 * migration 0004). Não é conta de usuário nem login — ver aviso na
 * migration. `nickname` vazio vira "Perfil sem apelido".
 */
export async function createCampaignProfile(
  campaignId: string,
  nickname: string,
  colorLabel?: string,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const finalNickname = nickname.trim() ? nickname.trim() : "Perfil sem apelido";
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .insert({
      campaign_id: campaignId,
      nickname: finalNickname,
      color_label: colorLabel ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar perfil na mesa "${campaignId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

/** Lista os perfis de uma mesa, mais recentemente criados primeiro. */
export async function listCampaignProfiles(campaignId: string): Promise<CampaignProfile[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar perfis da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as CampaignProfile[]) ?? [];
}

/**
 * Bloqueia ou desbloqueia um perfil (`is_locked`). Bloqueio puramente
 * manual nesta etapa — sem heartbeat de presença, sem liberação
 * automática por timeout (ver aviso na migration 0004).
 */
export async function setCampaignProfileLocked(profileId: string, locked: boolean): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ is_locked: locked })
    .eq("id", profileId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao atualizar bloqueio do perfil "${profileId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

/**
 * Define ou limpa o personagem ativo de um perfil (`active_character_id`).
 * Passar `characterId: null` limpa o vínculo. Vínculo simples de UI dev —
 * não checa se o personagem pertence a um "dono" do perfil (sem
 * autenticação ainda, mesmo aviso da migration 0004).
 */
export async function setCampaignProfileActiveCharacter(
  profileId: string,
  characterId: string | null,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ active_character_id: characterId })
    .eq("id", profileId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(
      `Falha ao atualizar personagem ativo do perfil "${profileId}": ${error.message}`,
      error,
    );
  }
  return data as CampaignProfile;
}

/**
 * Heartbeat dev de perfil (migration 0005). `sessionId` é só um id
 * gerado no localStorage do navegador — NÃO é autenticação (ver aviso
 * completo na migration). Lógica de leitura-então-escrita (não
 * atômica): aceitável nesta etapa de dev de baixa concorrência; uma
 * corrida real entre dois clientes entrando no mesmo instante não é
 * coberta (mesmo princípio de "best effort" já documentado para
 * is_locked desde a migration 0004).
 */
function isProfileExpired(profile: CampaignProfile): boolean {
  const lastSeenMs = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  return Date.now() - lastSeenMs > PROFILE_HEARTBEAT_TIMEOUT_MS;
}

/**
 * Entra num perfil: permite se o perfil está livre, se já é a mesma
 * sessão que o detém, ou se o bloqueio atual expirou (sem heartbeat há
 * mais de PROFILE_HEARTBEAT_TIMEOUT_MS). Caso contrário, lança erro
 * (perfil em uso por outra sessão ativa).
 */
export async function enterCampaignProfile(profileId: string, sessionId: string): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data: existing, error: fetchError } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .select()
    .eq("id", profileId)
    .single();

  if (fetchError) {
    throw new TableStorageError(`Falha ao ler perfil "${profileId}": ${fetchError.message}`, fetchError);
  }

  const profile = existing as CampaignProfile;
  const mesmaSessao = profile.lock_session_id === sessionId;

  if (profile.is_locked && !mesmaSessao && !isProfileExpired(profile)) {
    throw new TableStorageError(
      `Perfil "${profile.nickname}" está em uso por outra sessão (sem expirar ainda).`,
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({
      is_locked: true,
      lock_session_id: sessionId,
      locked_at: nowIso,
      last_seen_at: nowIso,
    })
    .eq("id", profileId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao entrar no perfil "${profileId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

/**
 * Renova o heartbeat (`last_seen_at`) de um perfil — só funciona se
 * `sessionId` ainda for quem detém o bloqueio (`lock_session_id`).
 * Lança erro se a sessão não é mais a dona (perfil assumido por outra
 * sessão após expirar, ou liberado manualmente).
 */
export async function heartbeatCampaignProfile(profileId: string, sessionId: string): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", profileId)
    .eq("lock_session_id", sessionId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(
      `Heartbeat rejeitado para o perfil "${profileId}" — sessão não é mais a dona do bloqueio: ${error.message}`,
      error,
    );
  }
  return data as CampaignProfile;
}

/**
 * Sai de um perfil — só libera (`is_locked = false`) se `sessionId`
 * ainda for quem detém o bloqueio. Não apaga `last_seen_at` (fica como
 * histórico de "última vez visto").
 */
export async function leaveCampaignProfile(profileId: string, sessionId: string): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ is_locked: false, lock_session_id: null, locked_at: null })
    .eq("id", profileId)
    .eq("lock_session_id", sessionId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(
      `Falha ao sair do perfil "${profileId}" (sessão pode não ser mais a dona do bloqueio): ${error.message}`,
      error,
    );
  }
  return data as CampaignProfile;
}

/**
 * Libera um perfil incondicionalmente (sem checar sessionId) — ação de
 * "narrador" em `/dev/table`. Sem checagem de autorização real (sem
 * autenticação ainda, ver aviso na migration 0005).
 */
export async function forceReleaseCampaignProfile(profileId: string): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ is_locked: false, lock_session_id: null, locked_at: null })
    .eq("id", profileId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao liberar perfil "${profileId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

// =====================================================================
// Convites de mesa (campaign_invites, migration 0008)
// =====================================================================

export interface CreateInviteResult {
  invite: CampaignInvite;
  /** Token BRUTO — só retornado aqui, no momento da criação. Nunca é relido do banco (só o hash é guardado). */
  rawToken: string;
}

export interface ResolvedInvite {
  ok: boolean;
  /** Motivo da recusa quando ok=false. */
  reason?: "not_found" | "revoked" | "inactive" | "expired";
  campaign?: Campaign;
  inviteId?: string;
}

/**
 * Cria um convite para uma mesa. Gera um token aleatório forte
 * server-side, guarda só o SHA-256 no banco e devolve o token bruto
 * UMA vez (para montar o link). Quando há narrador logado, recusa se
 * ele não for o dono da mesa.
 */
export async function createCampaignInvite(
  campaignId: string,
  label?: string,
  expiresAt?: string | null,
): Promise<CreateInviteResult> {
  const client = await getScopedTableClient();
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }

  // Checagem de dono só quando há usuário logado (fluxo dev anon segue livre).
  if (user) {
    const { data: camp } = await client.from(CAMPAIGNS_TABLE).select("owner_id").eq("id", campaignId).maybeSingle();
    if (camp && (camp as { owner_id: string | null }).owner_id && (camp as { owner_id: string | null }).owner_id !== user.id) {
      throw new TableStorageError("Só o dono da mesa pode criar convites para ela.");
    }
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(rawToken);
  const { data, error } = await client
    .from(CAMPAIGN_INVITES_TABLE)
    .insert({
      campaign_id: campaignId,
      token_hash: tokenHash,
      label: label?.trim() ? label.trim() : null,
      expires_at: expiresAt ?? null,
      created_by: user?.id ?? null,
    })
    .select(CAMPAIGN_INVITE_SAFE_COLUMNS)
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar convite na mesa "${campaignId}": ${error.message}`, error);
  }
  return { invite: data as CampaignInvite, rawToken };
}

/** Lista convites de uma mesa (mais recentes primeiro). Nunca retorna token_hash. */
export async function listCampaignInvites(campaignId: string): Promise<CampaignInvite[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_INVITES_TABLE)
    .select(CAMPAIGN_INVITE_SAFE_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar convites da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as CampaignInvite[]) ?? [];
}

/** Revoga um convite (is_active=false, revoked_at=agora). Idempotente. */
export async function revokeCampaignInvite(inviteId: string): Promise<CampaignInvite> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CAMPAIGN_INVITES_TABLE)
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .select(CAMPAIGN_INVITE_SAFE_COLUMNS)
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao revogar convite "${inviteId}": ${error.message}`, error);
  }
  return data as CampaignInvite;
}

/**
 * Resolve um token bruto de convite: hasheia, busca por token_hash e
 * valida estado (revogado/inativo/expirado). Retorna a mesma-mesa
 * quando válido. Nunca lança por convite inválido — só por falha real
 * de rede/RLS.
 */
export async function resolveCampaignInvite(rawToken: string): Promise<ResolvedInvite> {
  const client = await getScopedTableClient();
  const tokenHash = hashInviteToken(rawToken);
  const { data, error } = await client
    .from(CAMPAIGN_INVITES_TABLE)
    .select("id, campaign_id, is_active, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new TableStorageError(`Falha ao resolver convite: ${error.message}`, error);
  }
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as { id: string; campaign_id: string; is_active: boolean; expires_at: string | null; revoked_at: string | null };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (!row.is_active) return { ok: false, reason: "inactive" };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const campaign = await getCampaign(row.campaign_id);
  if (!campaign) return { ok: false, reason: "not_found" };
  return { ok: true, campaign, inviteId: row.id };
}
