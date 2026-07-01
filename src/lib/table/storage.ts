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
 *
 * ---------------------------------------------------------------------
 * CLASSIFICAÇÃO DAS FUNÇÕES (checkpoint v0.22.1 — auditoria pós dev/prod)
 * ---------------------------------------------------------------------
 * PRODUTO (seguras para rotas reais /login, /mesas, /join, /ficha):
 *   createCampaign, listCampaigns¹, getCampaign, addLog,
 *   listLogsForViewer (⚠ USE ESTA para ler logs em rota de jogador —
 *     NUNCA listLogs), createCampaignProfile, listCampaignProfiles,
 *   setCampaignProfileActiveCharacter, enterCampaignProfile,
 *   heartbeatCampaignProfile, leaveCampaignProfile,
 *   forceReleaseCampaignProfile, listProfileSessions,
 *   getActiveProfileSession, createCampaignInvite, listCampaignInvites,
 *   revokeCampaignInvite, resolveCampaignInvite, validateProductSession
 *   (checkpoint v0.24 — confere se o sessionId do navegador é o dono do
 *   bloqueio do perfil antes de `/ficha` abrir a ficha real),
 *   expireStaleProfileSessions (checkpoint v0.26 — marca sessões
 *   velhas como 'expired' e libera o bloqueio do perfil; chamada em
 *   pontos de carregamento seguros, nunca por cron/Realtime real).
 *
 *   ¹ listCampaigns retorna TODAS as mesas (RLS ainda em transição) —
 *     /mesas filtra por owner_id no servidor antes de exibir. Quando a
 *     RLS real cortar anon, a própria policy já devolverá só as do
 *     narrador.
 *
 * DEV/DIAGNÓSTICO (não usar em rota de jogador/produto):
 *   listLogs — SEM filtro de visibilidade, devolve tudo. Só para
 *     /dev/table (narrador vê tudo por design) e uso interno de
 *     listLogsForViewer quando o chamador é o dono da mesa.
 *   setCampaignProfileLocked — bloqueio manual legado (pré-heartbeat,
 *     migration 0004), só usado por /dev/table.
 * ---------------------------------------------------------------------
 */

import { createHash, randomBytes } from "node:crypto";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { TableStorageError } from "./storage.errors";
import { PROFILE_HEARTBEAT_TIMEOUT_MS, CAMPAIGN_INVITE_SAFE_COLUMNS, PROFILE_SESSION_SAFE_COLUMNS } from "./types";
import type { Campaign, CampaignInvite, CampaignProfile, ProfileSession, TableLogEntry, TableLogVisibility } from "./types";

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
const PROFILE_SESSIONS_TABLE = "profile_sessions";

/** Hash SHA-256 (hex). O banco só guarda hashes de tokens, nunca o bruto. */
function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Alias legível para hash de token de convite. */
function hashInviteToken(rawToken: string): string {
  return sha256hex(rawToken);
}

/**
 * Mantém a linha de `profile_sessions` (migration 0009) espelhando o
 * ciclo de vida do lock de perfil. `sessionId` é o mesmo id do navegador
 * que já flui pelas funções de enter/heartbeat/leave/release; guardamos
 * só o hash. Best-effort: falhas aqui são silenciadas para NUNCA quebrar
 * o fluxo de lock já existente (a sessão é uma camada de rastreio/
 * visibilidade, não o mecanismo de lock em si).
 */
async function upsertActiveProfileSession(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  profile: CampaignProfile,
  sessionId: string,
  inviteId?: string | null,
): Promise<void> {
  const tokenHash = sha256hex(sessionId);
  try {
    const { data: existing } = await client
      .from(PROFILE_SESSIONS_TABLE)
      .select("id, status")
      .eq("profile_id", profile.id)
      .eq("session_token_hash", tokenHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    if (existing) {
      // Reativa a sessão desta mesma origem (ex.: reentrou após sair/expirar).
      await client
        .from(PROFILE_SESSIONS_TABLE)
        .update({ status: "active", last_seen_at: nowIso, exited_at: null, released_at: null })
        .eq("id", (existing as { id: string }).id);
    } else {
      await client.from(PROFILE_SESSIONS_TABLE).insert({
        campaign_id: profile.campaign_id,
        profile_id: profile.id,
        invite_id: inviteId ?? null,
        session_token_hash: tokenHash,
        status: "active",
        last_seen_at: nowIso,
      });
    }
  } catch {
    // silencioso — camada de rastreio não pode derrubar o lock.
  }
}

/** Marca a(s) sessão(ões) ativa(s) de um perfil com um status terminal (best-effort). */
async function markProfileSessions(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  profileId: string,
  status: "exited" | "released" | "expired",
  opts?: { sessionId?: string },
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status };
    if (status === "exited") patch.exited_at = new Date().toISOString();
    if (status === "released") patch.released_at = new Date().toISOString();
    let q = client.from(PROFILE_SESSIONS_TABLE).update(patch).eq("profile_id", profileId).eq("status", "active");
    if (opts?.sessionId) q = q.eq("session_token_hash", sha256hex(opts.sessionId));
    await q;
  } catch {
    // silencioso.
  }
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
  /** Perfil que gerou o log (v0.20) — dono do 'private'. */
  profileId?: string | null;
  /** Sessão de perfil (v0.20), quando disponível. */
  profileSessionId?: string | null;
}

/** Registra uma entrada no log persistente de uma mesa. Append-only. */
export async function addLog(params: AddLogParams): Promise<TableLogEntry> {
  const client = await getScopedTableClient();
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  const { data, error } = await client
    .from(TABLE_LOGS_TABLE)
    .insert({
      campaign_id: params.campaignId,
      character_id: params.characterId ?? null,
      type: params.type,
      visibility: params.visibility,
      payload: params.payload,
      profile_id: params.profileId ?? null,
      created_by_user_id: user?.id ?? null,
      profile_session_id: params.profileSessionId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao registrar log na mesa "${params.campaignId}": ${error.message}`, error);
  }
  return data as TableLogEntry;
}

/**
 * Lista TODOS os logs de uma mesa (sem filtro de visibilidade). Uso
 * dev/diagnóstico (/dev/table) e base do listLogsForViewer. NÃO usar
 * direto em rota de jogador — usar listLogsForViewer.
 */
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

/** Quem está vendo os logs — define o filtro de visibilidade aplicado no servidor. */
export interface LogViewer {
  /** Perfil do jogador que está olhando (null = anon sem perfil). */
  profileId?: string | null;
}

/**
 * Lista os logs de uma mesa JÁ FILTRADOS por visibilidade, no servidor,
 * conforme quem está pedindo (enforcement application-layer — checkpoint
 * v0.20). Regras:
 *   • narrador logado dono da mesa: vê TUDO (public/private/gm);
 *   • jogador com perfil P: public + private do próprio P; NUNCA gm;
 *   • anon sem perfil: só public.
 *
 * O 'private' do próprio perfil casa por `profile_id` (coluna, v0.20) OU
 * por `payload.profileId` (compat com logs antigos sem a coluna). Logs
 * 'private' sem dono identificável nunca vão para jogador (lado seguro).
 */
export async function listLogsForViewer(campaignId: string, viewer: LogViewer): Promise<TableLogEntry[]> {
  const client = await getScopedTableClient();

  // Narrador dono da mesa vê tudo.
  let isOwner = false;
  try {
    const user = await getCurrentUser();
    if (user) {
      const { data: camp } = await client.from(CAMPAIGNS_TABLE).select("owner_id").eq("id", campaignId).maybeSingle();
      isOwner = !!camp && (camp as { owner_id: string | null }).owner_id === user.id;
    }
  } catch {
    isOwner = false;
  }

  const all = await listLogs(campaignId);
  if (isOwner) return all;

  const viewerProfileId = viewer.profileId ?? null;
  return all.filter((entry) => {
    if (entry.visibility === "public") return true;
    if (entry.visibility === "gm") return false; // jogador nunca vê gm
    // private: só o do próprio perfil
    const logProfileId =
      entry.profile_id ?? (typeof entry.payload.profileId === "string" ? (entry.payload.profileId as string) : null);
    return viewerProfileId != null && logProfileId === viewerProfileId;
  });
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

// =====================================================================
// Expiração automática de sessões (checkpoint v0.26)
// =====================================================================

/**
 * Varre `profile_sessions` ativas com `last_seen_at` mais velho que
 * `staleAfterSeconds` (default: mesma janela do heartbeat,
 * PROFILE_HEARTBEAT_TIMEOUT_MS) e marca `status = 'expired'`. Quando a
 * sessão expirada ainda é quem detém o bloqueio do perfil (hash do
 * sessionId bate com `session_token_hash`), libera o perfil
 * (`is_locked = false`) e registra um `profile_event` (visibilidade
 * "gm") — só faz isso quando o hash bate, para nunca derrubar uma
 * sessão MAIS NOVA que já assumiu o mesmo perfil depois desta ficar
 * velha.
 *
 * NUNCA apaga linhas — só muda `status` (histórico preservado). Sem
 * cron/job automático ainda: é chamada em pontos de carregamento
 * seguros (`/mesas/[campaignId]`, `/join/[token]`, `/ficha` via
 * validateProductSession, `enterCampaignProfile`) — ver
 * scripts/dev/expire-profile-sessions.ts para rodar manualmente. Um
 * cron de verdade fica documentado como trabalho futuro (ver
 * relatório), não implementado nesta etapa.
 *
 * Retorna quantas sessões foram marcadas expiradas. Melhor esforço por
 * linha: uma falha isolada não interrompe as demais.
 */
export async function expireStaleProfileSessions(
  campaignId?: string,
  staleAfterSeconds: number = PROFILE_HEARTBEAT_TIMEOUT_MS / 1000,
): Promise<number> {
  const client = await getScopedTableClient();
  const staleBeforeIso = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();

  let query = client
    .from(PROFILE_SESSIONS_TABLE)
    .select("id, campaign_id, profile_id, session_token_hash, last_seen_at")
    .eq("status", "active")
    .lt("last_seen_at", staleBeforeIso);
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) {
    throw new TableStorageError(`Falha ao buscar sessões expiráveis: ${error.message}`, error);
  }

  const staleRows =
    (data as { id: string; campaign_id: string; profile_id: string; session_token_hash: string; last_seen_at: string }[]) ??
    [];

  let expiredCount = 0;
  for (const row of staleRows) {
    try {
      const { error: sessErr } = await client
        .from(PROFILE_SESSIONS_TABLE)
        .update({ status: "expired" })
        .eq("id", row.id)
        .eq("status", "active"); // idempotente: só expira se ainda estava ativa (evita corrida com heartbeat concorrente)
      if (sessErr) continue;
      expiredCount++;

      const { data: profileData } = await client
        .from(CAMPAIGN_PROFILES_TABLE)
        .select()
        .eq("id", row.profile_id)
        .maybeSingle();
      const profile = profileData as CampaignProfile | null;

      if (profile?.is_locked && profile.lock_session_id && sha256hex(profile.lock_session_id) === row.session_token_hash) {
        await client
          .from(CAMPAIGN_PROFILES_TABLE)
          .update({ is_locked: false, lock_session_id: null, locked_at: null })
          .eq("id", row.profile_id);

        try {
          await client.from(TABLE_LOGS_TABLE).insert({
            campaign_id: row.campaign_id,
            type: "profile_event",
            visibility: "gm",
            profile_id: row.profile_id,
            profile_session_id: row.id,
            payload: { evento: "expirado_automatico", profileId: row.profile_id },
          });
        } catch {
          // log é melhor-esforço — não deve interromper a expiração.
        }
      }
    } catch {
      // best-effort por linha — uma falha isolada não interrompe as demais.
    }
  }
  return expiredCount;
}

/**
 * Entra num perfil: permite se o perfil está livre, se já é a mesma
 * sessão que o detém, ou se o bloqueio atual expirou (sem heartbeat há
 * mais de PROFILE_HEARTBEAT_TIMEOUT_MS). Caso contrário, lança erro
 * (perfil em uso por outra sessão ativa).
 */
export async function enterCampaignProfile(
  profileId: string,
  sessionId: string,
  inviteId?: string | null,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data: existing, error: fetchError } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .select()
    .eq("id", profileId)
    .single();

  if (fetchError) {
    throw new TableStorageError(`Falha ao ler perfil "${profileId}": ${fetchError.message}`, fetchError);
  }

  // v0.26: expira sessões velhas desta mesa ANTES de decidir se pode
  // entrar — evita que um bloqueio "tecnicamente expirado mas ainda
  // marcado is_locked" precise do fallback isProfileExpired() abaixo
  // (que já cobria isso via UI, mas agora o estado real do banco
  // também é corrigido, não só contornado no cálculo).
  await expireStaleProfileSessions(existing ? (existing as CampaignProfile).campaign_id : undefined).catch(() => {});

  const { data: freshData } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .select()
    .eq("id", profileId)
    .maybeSingle();
  const profile = (freshData as CampaignProfile | null) ?? (existing as CampaignProfile);
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
  const updatedProfile = data as CampaignProfile;
  await upsertActiveProfileSession(client, updatedProfile, sessionId, inviteId);
  return updatedProfile;
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
  // Espelha o last_seen na sessão ativa desta origem (best-effort).
  try {
    await client
      .from(PROFILE_SESSIONS_TABLE)
      .update({ last_seen_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .eq("session_token_hash", sha256hex(sessionId))
      .eq("status", "active");
  } catch {
    // silencioso.
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
  await markProfileSessions(client, profileId, "exited", { sessionId });
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
  await markProfileSessions(client, profileId, "released");
  return data as CampaignProfile;
}

// =====================================================================
// Sessões de perfil — leitura (profile_sessions, migration 0009)
// =====================================================================

/** Lista as sessões de uma mesa (mais recentes primeiro). Nunca retorna o hash do token. */
export async function listProfileSessions(campaignId: string): Promise<ProfileSession[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .select(PROFILE_SESSION_SAFE_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new TableStorageError(`Falha ao listar sessões da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as ProfileSession[]) ?? [];
}

/** Status resumido da sessão ativa de um perfil (ou null se não houver). */
export async function getActiveProfileSession(profileId: string): Promise<ProfileSession | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .select(PROFILE_SESSION_SAFE_COLUMNS)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new TableStorageError(`Falha ao ler sessão ativa do perfil "${profileId}": ${error.message}`, error);
  }
  return (data as ProfileSession | null) ?? null;
}

// =====================================================================
// Sessão de perfil real da rota de produto (/ficha, checkpoint v0.24)
// =====================================================================

export interface ProductSessionResult {
  ok: boolean;
  reason?: "profile_not_found" | "wrong_campaign" | "not_locked";
  campaign?: Campaign;
  profile?: CampaignProfile;
}

/**
 * Valida que o `sessionId` do navegador (localStorage, NÃO autenticação
 * real) é de fato quem detém o bloqueio (`lock_session_id`) do perfil
 * informado, dentro da mesa informada. Usado por `/ficha` (rota real,
 * checkpoint v0.24) para decidir se abre a ficha do perfil ou mostra
 * "Entre por um convite para abrir a ficha." — nunca lança por sessão
 * inválida, só por falha real de rede/RLS.
 *
 * v0.26: expira sessões velhas desta mesa antes de checar o bloqueio —
 * garante que /ficha nunca valide contra um bloqueio "tecnicamente
 * expirado" que ainda não tinha sido limpo no banco.
 */
export async function validateProductSession(
  campaignId: string,
  profileId: string,
  sessionId: string,
): Promise<ProductSessionResult> {
  const client = await getScopedTableClient();
  await expireStaleProfileSessions(campaignId).catch(() => {});
  const { data, error } = await client.from(CAMPAIGN_PROFILES_TABLE).select().eq("id", profileId).maybeSingle();

  if (error) {
    throw new TableStorageError(`Falha ao validar sessão do perfil "${profileId}": ${error.message}`, error);
  }
  if (!data) return { ok: false, reason: "profile_not_found" };

  const profile = data as CampaignProfile;
  if (profile.campaign_id !== campaignId) return { ok: false, reason: "wrong_campaign" };
  if (!profile.is_locked || profile.lock_session_id !== sessionId) return { ok: false, reason: "not_locked" };

  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, reason: "wrong_campaign" };
  return { ok: true, campaign, profile };
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
