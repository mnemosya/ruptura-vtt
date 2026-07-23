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
 * Valida um token real de sessão de perfil (Etapa 12, correção 7 —
 * migration 0032: chama a RPC `validate_profile_session_token`
 * `SECURITY DEFINER`, em vez de ler `profile_sessions`/
 * `campaign_profiles` diretamente. Nenhum acesso direto a
 * `profile_sessions` continua concedido a `anon`/`authenticated`
 * genérico desde a migration 0032 — a leitura/comparação de
 * `session_token_hash` só existe dentro da RPC, nunca chega ao
 * client). Mesmo contrato de antes: HARD CHECK completo (token, status
 * `active`, perfil ainda `is_locked`), nunca retorna
 * `session_token_hash`.
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
  const { data, error } = await client.rpc("validate_profile_session_token", {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
  });

  if (error) {
    throw new TableStorageError(`Falha ao validar sessão do perfil "${profileId}": ${error.message}`, error);
  }

  const result = data as {
    ok: boolean;
    reason?: ValidateProfileSessionTokenResult["reason"];
    campaign?: Campaign;
    profile?: CampaignProfile;
    profileSession?: ProfileSession;
  };

  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, campaign: result.campaign, profile: result.profile, profileSession: result.profileSession };
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
 * Preflight de "posso avançar esta campanha?" (checkpoint pós-v0.58) —
 * usado por `endCampaignRound`/`endCampaignScene` ANTES de processar
 * qualquer personagem, para não deixar estado parcial quando a RLS
 * bloqueia o UPDATE final em `campaigns` (endurecida na migration 0013:
 * `campaigns_owner_update` só permite o dono AUTENTICADO). Faz um UPDATE
 * NO-OP (grava `current_round` no próprio valor atual) sujeito à MESMA
 * policy do avanço real: se 0 linhas voltarem, a sessão não pode
 * avançar. Não reimplementa a regra da RLS em código — apenas a exercita
 * de forma inofensiva. Nunca usa service role (segue `getScopedTableClient`).
 */
export async function canAdvanceCampaign(campaignId: string): Promise<boolean> {
  const client = await getScopedTableClient();
  const { data: campaignData, error: fetchError } = await client
    .from(CAMPAIGNS_TABLE)
    .select("current_round")
    .eq("id", campaignId)
    .maybeSingle();
  if (fetchError || !campaignData) return false;
  const currentRound = (campaignData as { current_round: number }).current_round;
  const { data, error } = await client
    .from(CAMPAIGNS_TABLE)
    .update({ current_round: currentRound })
    .eq("id", campaignId)
    .select("id");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
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
 * Passar `characterId: null` limpa o vínculo. Etapa 12 (correção 7,
 * migration 0032): chama a RPC `set_campaign_profile_active_character`
 * (`SECURITY DEFINER`) em vez de fazer UPDATE direto — a RPC exige
 * `auth.uid()` de narrador dono da campanha e valida que o personagem
 * (quando não-nulo) tem `campaign_id` igual ao do perfil E
 * `characters.profile_id` igual a ESTE perfil (vínculo canônico,
 * migration 0011) — nunca mais aceita apontar para personagem de outro
 * perfil/campanha. Antes desta correção, o UPDATE direto não validava
 * nada disso (achado crítico da auditoria pós-correção 6).
 */
export async function setCampaignProfileActiveCharacter(
  profileId: string,
  characterId: string | null,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("set_campaign_profile_active_character", {
    p_profile_id: profileId,
    p_character_id: characterId,
  });

  if (error) {
    throw new TableStorageError(
      `Falha ao atualizar personagem ativo do perfil "${profileId}": ${error.message}`,
      error,
    );
  }
  return data as CampaignProfile;
}


// =====================================================================
// Expiração automática de sessões (checkpoint v0.26)
// =====================================================================

/**
 * Varre `profile_sessions` ativas com `last_seen_at` mais velho que
 * `staleAfterSeconds` e marca `status = 'expired'`, liberando o
 * bloqueio do perfil quando a sessão expirada era a última ativa dele.
 * Etapa 12 (correção 7, migration 0032): chama a RPC
 * `expire_stale_profile_sessions` (`SECURITY DEFINER`) em vez de ler/
 * escrever `profile_sessions`/`campaign_profiles` diretamente — não há
 * mais nenhuma policy que permita a um `anon`/`authenticated` genérico
 * tocar essas tabelas fora desta RPC. A própria RPC corrige, de
 * passagem, um bug latente desta função (a versão TypeScript comparava
 * `sha256(lock_session_id)` com `session_token_hash` — dois valores
 * sem relação alguma desde a migration 0016 — então praticamente nunca
 * liberava o lock; a RPC libera corretamente quando a sessão que expira
 * é a última `active` daquele perfil).
 *
 * NUNCA apaga linhas — só muda `status` (histórico preservado). Sem
 * cron/job automático ainda: é chamada em pontos de carregamento
 * seguros (`/mesas/[campaignId]`, `/join/[token]`, `/ficha` via
 * validateProductSession, `enterCampaignProfile`).
 *
 * Retorna quantas sessões foram marcadas expiradas.
 */
export async function expireStaleProfileSessions(
  campaignId?: string,
  staleAfterSeconds: number = PROFILE_HEARTBEAT_TIMEOUT_MS / 1000,
): Promise<number> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("expire_stale_profile_sessions", {
    p_campaign_id: campaignId ?? null,
    p_stale_after_seconds: Math.round(staleAfterSeconds),
  });
  if (error) {
    throw new TableStorageError(`Falha ao expirar sessões: ${error.message}`, error);
  }
  return (data as number) ?? 0;
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
 * atual expirou. Caso contrário, lança erro (perfil em uso por outra
 * sessão ativa).
 *
 * Etapa 12 (correção 7, migration 0032): chama a RPC
 * `enter_campaign_profile` (`SECURITY DEFINER`) — o token bruto de 256
 * bits agora é gerado DENTRO do banco (`extensions.gen_random_bytes`,
 * nunca escolhido pelo cliente) e devolvido uma única vez; nenhum
 * INSERT/UPDATE direto em `campaign_profiles`/`profile_sessions`
 * continua acessível para isso.
 */
export async function enterCampaignProfile(
  profileId: string,
  sessionId: string,
  inviteId?: string | null,
): Promise<EnterProfileResult> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("enter_campaign_profile", {
    p_profile_id: profileId,
    p_session_id: sessionId,
    p_invite_id: inviteId ?? null,
  });

  if (error) {
    throw new TableStorageError(`Falha ao entrar no perfil "${profileId}": ${error.message}`, error);
  }
  const result = data as { profile: CampaignProfile; profileSessionId: string; rawSessionToken: string };
  return { profile: result.profile, profileSessionId: result.profileSessionId, rawSessionToken: result.rawSessionToken };
}

/**
 * Renova o heartbeat (`last_seen_at`) de um perfil — HARD CHECK contra
 * o token real da sessão. Etapa 12 (correção 7, migration 0032): chama
 * a RPC `heartbeat_profile_session` (`SECURITY DEFINER`) em vez de ler/
 * escrever as tabelas diretamente.
 */
export async function heartbeatCampaignProfile(
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("heartbeat_profile_session", {
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
  });
  if (error) {
    throw new TableStorageError(`Heartbeat rejeitado para o perfil "${profileId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

/**
 * Sai de um perfil — HARD CHECK contra o token real da sessão. Marca a
 * sessão como `exited` (nunca apaga a linha) e libera o perfil
 * (`is_locked = false`). Etapa 12 (correção 7, migration 0032): chama a
 * RPC `leave_campaign_profile` (`SECURITY DEFINER`).
 */
export async function leaveCampaignProfile(
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("leave_campaign_profile", {
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
  });
  if (error) {
    throw new TableStorageError(`Falha ao sair do perfil "${profileId}": ${error.message}`, error);
  }
  return data as CampaignProfile;
}

/**
 * Libera um perfil incondicionalmente (sem checar sessionId) — ação do
 * NARRADOR (dono da campanha). Etapa 12 (correção 7, migration 0032):
 * chama a RPC `force_release_campaign_profile` (`SECURITY DEFINER`),
 * que exige `auth.uid()` = dono da campanha do perfil — antes desta
 * correção não havia checagem de autorização alguma nesta função além
 * da RLS aberta (ver aviso antigo na migration 0005, agora obsoleto).
 */
export async function forceReleaseCampaignProfile(profileId: string): Promise<CampaignProfile> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("force_release_campaign_profile", { p_profile_id: profileId });
  if (error) {
    throw new TableStorageError(`Falha ao liberar perfil "${profileId}": ${error.message}`, error);
  }
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
