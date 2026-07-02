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
 *   revokeCampaignInvite, resolveCampaignInvite,
 *   expireStaleProfileSessions (checkpoint v0.26 — marca sessões
 *   velhas como 'expired' e libera o bloqueio do perfil; chamada em
 *   pontos de carregamento seguros, nunca por cron/Realtime real),
 *   validateProfileSessionToken (checkpoint v0.30 — substitui
 *   validateProductSession do v0.24: exige um TOKEN REAL de sessão
 *   [profileSessionId + rawSessionToken, hash comparado em
 *   profile_sessions.session_token_hash, status='active'] em vez de
 *   confiar no sessionId de navegador comparado com lock_session_id).
 *   enterCampaignProfile/heartbeatCampaignProfile/leaveCampaignProfile
 *   também passaram a exigir/gerar esse token real desde o v0.30 — ver
 *   comentário de cada uma.
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
 * Cria um token REAL de sessão de perfil (checkpoint v0.30) — 256 bits
 * (`randomBytes(32)`, mesmo padrão do token de convite desde v0.18).
 * O banco só grava o hash SHA-256 em `profile_sessions.
 * session_token_hash`; o token BRUTO é devolvido UMA vez ao chamador
 * (enterCampaignProfile) para guardar no localStorage do navegador —
 * nunca é relido do banco.
 *
 * Invalida (`status = 'released'`) qualquer sessão AINDA 'active'
 * deste perfil antes de criar a nova — garante no máximo UM token
 * válido por perfil por vez (evita que um token antigo, esquecido em
 * outra aba/navegador, continue validando depois de uma nova entrada
 * legítima). Diferente da v0.29, que só marcava sessões 'expired' via
 * `expireStaleProfileSessions` (por inatividade) — aqui é imediato,
 * na entrada, independente de tempo.
 *
 * NÃO é mais best-effort: se a criação do token falhar, a função
 * lança e `enterCampaignProfile` propaga o erro — sem um token válido,
 * a "entrada" não tem como ser usada por heartbeat/ficha depois mesmo
 * que o lock em campaign_profiles tenha sido concedido.
 */
async function createProfileSessionToken(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  profile: CampaignProfile,
  inviteId?: string | null,
): Promise<{ profileSessionId: string; rawSessionToken: string }> {
  try {
    await client
      .from(PROFILE_SESSIONS_TABLE)
      .update({ status: "released", released_at: new Date().toISOString() })
      .eq("profile_id", profile.id)
      .eq("status", "active");
  } catch {
    // melhor esforço — mesmo se isso falhar, o hard check nas RPCs/
    // validateProfileSessionToken ainda vai exigir status='active' E
    // hash batendo, então um token antigo só continuaria válido se
    // ninguém mais tivesse entrado depois (sem risco de "duas sessões
    // ativas" de verdade, ver checkpoint v0.30 do relatório).
  }

  const rawSessionToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256hex(rawSessionToken);
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .insert({
      campaign_id: profile.campaign_id,
      profile_id: profile.id,
      invite_id: inviteId ?? null,
      session_token_hash: tokenHash,
      status: "active",
      last_seen_at: nowIso,
    })
    .select("id")
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar sessão de perfil: ${error.message}`, error);
  }
  return { profileSessionId: (data as { id: string }).id, rawSessionToken };
}

/**
 * Valida um token real de sessão de perfil (checkpoint v0.30) — HARD
 * CHECK: precisa existir uma linha em `profile_sessions` com esse
 * `profileSessionId`, para esse `profileId`/`campaignId`, com
 * `session_token_hash` batendo o SHA-256 do `rawSessionToken`, e
 * `status = 'active'`. Também reconfirma `campaign_profiles.
 * is_locked = true` (perfil não foi liberado à força depois que a
 * sessão foi criada). Sem fallback para `lock_session_id` — esse
 * campo agora é só um identificador local auxiliar (ver
 * browserSession.ts), nunca mais tratado como segredo.
 *
 * Nunca retorna `session_token_hash` — o objeto de sessão devolvido é
 * sempre construído só com os campos seguros (`PROFILE_SESSION_SAFE_COLUMNS`).
 */
export interface ValidateProfileSessionTokenResult {
  ok: boolean;
  reason?: "profile_not_found" | "wrong_campaign" | "not_locked" | "session_not_found" | "session_inactive";
  campaign?: Campaign;
  profile?: CampaignProfile;
  profileSession?: ProfileSession;
}

export async function validateProfileSessionToken(
  campaignId: string,
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<ValidateProfileSessionTokenResult> {
  const client = await getScopedTableClient();
  await expireStaleProfileSessions(campaignId).catch(() => {});

  const { data: profileData, error: profileError } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .select()
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) {
    throw new TableStorageError(`Falha ao validar sessão do perfil "${profileId}": ${profileError.message}`, profileError);
  }
  if (!profileData) return { ok: false, reason: "profile_not_found" };
  const profile = profileData as CampaignProfile;
  if (profile.campaign_id !== campaignId) return { ok: false, reason: "wrong_campaign" };
  if (!profile.is_locked) return { ok: false, reason: "not_locked" };

  const tokenHash = sha256hex(rawSessionToken);
  const { data: sessionRow, error: sessionError } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .select(`${PROFILE_SESSION_SAFE_COLUMNS}, session_token_hash`)
    .eq("id", profileSessionId)
    .eq("profile_id", profileId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (sessionError) {
    throw new TableStorageError(`Falha ao validar token de sessão: ${sessionError.message}`, sessionError);
  }
  if (!sessionRow) return { ok: false, reason: "session_not_found" };

  const row = sessionRow as ProfileSession & { session_token_hash: string };
  if (row.session_token_hash !== tokenHash) return { ok: false, reason: "session_not_found" }; // token errado = tratado igual a "não encontrada", não vaza qual parte bateu
  if (row.status !== "active") return { ok: false, reason: "session_inactive" };

  const { session_token_hash: _hash, ...safeSession } = row;
  void _hash; // nunca retornado — descartado explicitamente

  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, reason: "wrong_campaign" };

  return { ok: true, campaign, profile, profileSession: safeSession as ProfileSession };
}

/**
 * Marca a(s) sessão(ões) ativa(s) de um perfil com um status terminal
 * (best-effort). Checkpoint v0.30: só usada por
 * `forceReleaseCampaignProfile` (ação do narrador, sem token de
 * sessão de jogador em mãos) — `leaveCampaignProfile` agora atualiza a
 * linha exata por `profileSessionId` diretamente, já validada por
 * token.
 */
async function markProfileSessions(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  profileId: string,
  status: "exited" | "released" | "expired",
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status };
    if (status === "exited") patch.exited_at = new Date().toISOString();
    if (status === "released") patch.released_at = new Date().toISOString();
    await client.from(PROFILE_SESSIONS_TABLE).update(patch).eq("profile_id", profileId).eq("status", "active");
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

/**
 * "Encerrar rodada" (checkpoint v0.39, PRD seção 5) — incrementa
 * `campaigns.current_round` e registra `table_logs.type="round_ended"`.
 * NÃO resolve dano recorrente/fim de rodada automaticamente — o
 * `attentionSummary` (nomes/estados que precisam de atenção manual do
 * narrador) é opcional, calculado pelo chamador a partir dos
 * personagens da mesa (fora do escopo deste módulo, que só conhece
 * `campaigns`/`table_logs`).
 */
export async function endRound(campaignId: string, attentionSummary?: string[]): Promise<Campaign> {
  const client = await getScopedTableClient();
  const { data: campaignData, error: fetchError } = await client
    .from(CAMPAIGNS_TABLE)
    .select()
    .eq("id", campaignId)
    .single();
  if (fetchError) {
    throw new TableStorageError(`Falha ao buscar mesa "${campaignId}" para encerrar rodada: ${fetchError.message}`, fetchError);
  }
  const previousRound = (campaignData as Campaign).current_round;
  const newRound = previousRound + 1;

  const { data, error } = await client
    .from(CAMPAIGNS_TABLE)
    .update({ current_round: newRound })
    .eq("id", campaignId)
    .select()
    .single();
  if (error) {
    throw new TableStorageError(`Falha ao encerrar rodada da mesa "${campaignId}": ${error.message}`, error);
  }

  try {
    await client.from(TABLE_LOGS_TABLE).insert({
      campaign_id: campaignId,
      type: "round_ended",
      visibility: "public",
      payload: { previousRound, newRound, attentionSummary: attentionSummary ?? [], source: "mesa_dashboard" },
    });
  } catch {
    // Best-effort — a rodada já avançou; falha no log não deve travar o narrador.
  }

  return data as Campaign;
}

/**
 * "Encerrar cena" (checkpoint v0.39, PRD seção 5) — incrementa
 * `campaigns.current_scene` e registra `table_logs.type="scene_ended"`.
 * Se `rupturaPendingCharacterNames` vier não-vazio, registra também
 * `type="scene_rupture_pending"` — só o aviso; NÃO resolve Marca/Traço
 * nem remove `ruptura_pendente` (isso é trabalho de um checkpoint
 * futuro de resolução de Ruptura).
 */
export async function endScene(campaignId: string, rupturaPendingCharacterNames: string[] = []): Promise<Campaign> {
  const client = await getScopedTableClient();
  const { data: campaignData, error: fetchError } = await client
    .from(CAMPAIGNS_TABLE)
    .select()
    .eq("id", campaignId)
    .single();
  if (fetchError) {
    throw new TableStorageError(`Falha ao buscar mesa "${campaignId}" para encerrar cena: ${fetchError.message}`, fetchError);
  }
  const previousScene = (campaignData as Campaign).current_scene;
  const newScene = previousScene + 1;

  const { data, error } = await client
    .from(CAMPAIGNS_TABLE)
    .update({ current_scene: newScene })
    .eq("id", campaignId)
    .select()
    .single();
  if (error) {
    throw new TableStorageError(`Falha ao encerrar cena da mesa "${campaignId}": ${error.message}`, error);
  }

  try {
    await client.from(TABLE_LOGS_TABLE).insert({
      campaign_id: campaignId,
      type: "scene_ended",
      visibility: "public",
      payload: { previousScene, newScene, source: "mesa_dashboard" },
    });
    if (rupturaPendingCharacterNames.length > 0) {
      await client.from(TABLE_LOGS_TABLE).insert({
        campaign_id: campaignId,
        type: "scene_rupture_pending",
        visibility: "public",
        payload: { characterNames: rupturaPendingCharacterNames, source: "mesa_dashboard" },
      });
    }
  } catch {
    // Best-effort — a cena já avançou; falha no log não deve travar o narrador.
  }

  return data as Campaign;
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

export interface EnterProfileResult {
  profile: CampaignProfile;
  /** Id da linha de profile_sessions (não secreto) — usar com rawSessionToken em heartbeat/leave/ficha. */
  profileSessionId: string;
  /** Token BRUTO (256 bits) — só devolvido aqui, uma vez. Guardar no localStorage; nunca volta do banco. */
  rawSessionToken: string;
}

/**
 * Entra num perfil: permite se o perfil está livre, se já é a mesma
 * sessão (identificador local auxiliar) que o detém, ou se o bloqueio
 * atual expirou (sem heartbeat há mais de PROFILE_HEARTBEAT_TIMEOUT_MS).
 * Caso contrário, lança erro (perfil em uso por outra sessão ativa) —
 * é este gate que impede uma segunda sessão concorrente de sequer criar
 * um token novo enquanto a primeira ainda é válida.
 *
 * Checkpoint v0.30: além do lock de sempre (`is_locked`/
 * `lock_session_id`, baseado no `sessionId` do navegador — só um
 * identificador local, não secreto), gera um TOKEN REAL de sessão
 * (`createProfileSessionToken`) e devolve `profileSessionId`/
 * `rawSessionToken` — é esse par que autoriza heartbeat, sair do
 * perfil, e ler/salvar o personagem ativo (nunca mais o `sessionId`
 * sozinho).
 */
export async function enterCampaignProfile(
  profileId: string,
  sessionId: string,
  inviteId?: string | null,
): Promise<EnterProfileResult> {
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
  const { profileSessionId, rawSessionToken } = await createProfileSessionToken(client, updatedProfile, inviteId);
  return { profile: updatedProfile, profileSessionId, rawSessionToken };
}

/**
 * Renova o heartbeat (`last_seen_at`) de um perfil — checkpoint v0.30:
 * HARD CHECK contra o token real da sessão (`profileSessionId` +
 * `rawSessionToken`), não mais contra `lock_session_id`. Lança erro se
 * o token não bate, se a sessão não está `status='active'`, ou se o
 * perfil não está mais bloqueado (liberado à força, ou já expirado).
 */
export async function heartbeatCampaignProfile(
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const tokenHash = sha256hex(rawSessionToken);

  const { data: sessionRow, error: sessionError } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .select("id, profile_id, status, session_token_hash")
    .eq("id", profileSessionId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (sessionError) {
    throw new TableStorageError(`Falha ao validar sessão para heartbeat: ${sessionError.message}`, sessionError);
  }
  if (!sessionRow) {
    throw new TableStorageError(`Sessão de perfil "${profileSessionId}" não encontrada.`);
  }
  const row = sessionRow as { id: string; profile_id: string; status: string; session_token_hash: string };
  if (row.session_token_hash !== tokenHash) {
    throw new TableStorageError("Heartbeat rejeitado — token de sessão inválido.");
  }
  if (row.status !== "active") {
    throw new TableStorageError(`Heartbeat rejeitado — sessão de perfil não está mais ativa (status: "${row.status}").`);
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ last_seen_at: nowIso })
    .eq("id", profileId)
    .eq("is_locked", true)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(
      `Heartbeat rejeitado para o perfil "${profileId}" — perfil não está mais bloqueado: ${error.message}`,
      error,
    );
  }

  try {
    await client.from(PROFILE_SESSIONS_TABLE).update({ last_seen_at: nowIso }).eq("id", profileSessionId);
  } catch {
    // silencioso — atualizar o last_seen_at da própria linha de rastreio é melhor-esforço.
  }

  return data as CampaignProfile;
}

/**
 * Sai de um perfil — checkpoint v0.30: HARD CHECK contra o token real
 * da sessão (`profileSessionId` + `rawSessionToken`), não mais contra
 * `lock_session_id`. Marca a sessão como `exited` (nunca apaga a
 * linha) e libera o perfil (`is_locked = false`).
 */
export async function leaveCampaignProfile(
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const tokenHash = sha256hex(rawSessionToken);

  const { data: sessionRow, error: sessionError } = await client
    .from(PROFILE_SESSIONS_TABLE)
    .select("id, profile_id, status, session_token_hash")
    .eq("id", profileSessionId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (sessionError) {
    throw new TableStorageError(`Falha ao validar sessão para sair do perfil: ${sessionError.message}`, sessionError);
  }
  if (!sessionRow) {
    throw new TableStorageError(`Sessão de perfil "${profileSessionId}" não encontrada.`);
  }
  const row = sessionRow as { id: string; profile_id: string; status: string; session_token_hash: string };
  if (row.session_token_hash !== tokenHash) {
    throw new TableStorageError("Não foi possível sair do perfil — token de sessão inválido.");
  }
  if (row.status !== "active") {
    throw new TableStorageError(`Não foi possível sair do perfil — sessão não está mais ativa (status: "${row.status}").`);
  }

  const { data, error } = await client
    .from(CAMPAIGN_PROFILES_TABLE)
    .update({ is_locked: false, lock_session_id: null, locked_at: null })
    .eq("id", profileId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao sair do perfil "${profileId}": ${error.message}`, error);
  }

  await client
    .from(PROFILE_SESSIONS_TABLE)
    .update({ status: "exited", exited_at: new Date().toISOString() })
    .eq("id", profileSessionId)
    .eq("status", "active");

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
// Sessão de perfil real da rota de produto (/ficha) — checkpoint v0.24,
// substituída por token real no checkpoint v0.30. A validação de
// sessão real de /ficha agora é `validateProfileSessionToken` (ver
// definição mais acima neste arquivo) — exige profileSessionId +
// rawSessionToken (hard check contra profile_sessions), não mais um
// `sessionId` de navegador comparado com `lock_session_id`.
// =====================================================================

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
