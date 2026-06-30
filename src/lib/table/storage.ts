"use server";

/**
 * Persistência mínima de Mesa/Log (tabelas `campaigns` e `table_logs`,
 * migration 0003_campaigns_table_logs.sql).
 *
 * Server Actions ("use server"): mesmo padrão de
 * src/lib/character/storage.ts — chamadas diretamente do Client
 * Component mas executadas no servidor, usando a anon key
 * (getContentClient(), nunca a service role key).
 *
 * Isso só funciona porque a migration 0003 cria policies de RLS
 * TEMPORÁRIAS de desenvolvimento (campaigns: CRUD completo;
 * table_logs: só select/insert, append-only) — ver o aviso completo no
 * topo daquela migration, incluindo o risco de que `visibility`
 * ('public'/'private'/'gm') hoje é só um campo de dados, sem filtro
 * real de RLS.
 */

import { getContentClient } from "../content";
import { TableStorageError } from "./storage.errors";
import { PROFILE_HEARTBEAT_TIMEOUT_MS } from "./types";
import type { Campaign, CampaignProfile, TableLogEntry, TableLogVisibility } from "./types";

const CAMPAIGNS_TABLE = "campaigns";
const TABLE_LOGS_TABLE = "table_logs";
const CAMPAIGN_PROFILES_TABLE = "campaign_profiles";

/** Cria uma mesa (campaign) de desenvolvimento. */
export async function createCampaign(name: string): Promise<Campaign> {
  const client = getContentClient();
  const finalName = name.trim() ? name.trim() : "Mesa sem nome";
  const { data, error } = await client.from(CAMPAIGNS_TABLE).insert({ name: finalName }).select().single();

  if (error) {
    throw new TableStorageError(`Falha ao criar mesa: ${error.message}`, error);
  }
  return data as Campaign;
}

/** Lista mesas, mais recentemente atualizadas primeiro. */
export async function listCampaigns(): Promise<Campaign[]> {
  const client = getContentClient();
  const { data, error } = await client.from(CAMPAIGNS_TABLE).select().order("updated_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar mesas: ${error.message}`, error);
  }
  return (data as Campaign[]) ?? [];
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
  const client = getContentClient();
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
