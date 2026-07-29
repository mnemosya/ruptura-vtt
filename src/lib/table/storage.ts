"use server";

/**
 * Persistência mínima de Mesa/Log (tabelas `campaigns`, `table_logs`,
 * `campaign_members`, `campaign_invites`).
 *
 * Server Actions ("use server") — chamadas diretamente do Client
 * Component mas executadas no servidor. O cliente Supabase usado aqui é
 * "scoped" à sessão da request (`getScopedTableClient()`, ver
 * src/lib/auth/scopedClient.ts): sem usuário logado, client anon puro;
 * com usuário logado, client com o access token anexado, para que
 * `auth.uid()` resolva nas policies RLS/RPCs.
 *
 * Nunca a service role key — nem aqui, nem em scopedClient.ts.
 *
 * ---------------------------------------------------------------------
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4 —
 * docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_
 * PERSONAGENS.md): este arquivo perdeu TODAS as funções de
 * `campaign_profiles`/`profile_sessions` ("perfil de mesa", token de
 * sessão de perfil, heartbeat, lock) — essas tabelas e o mecanismo
 * inteiro foram removidos do banco (migrations 0051-0058). Autorização
 * de jogador agora é: conta autenticada (Supabase Auth) →
 * `campaign_members` (participação ativa) → `character_controllers`
 * (controle de personagem) → `characters.campaign_id`. Ver
 * src/lib/character/storage.ts para as funções de personagem/controle.
 * ---------------------------------------------------------------------
 */

import { randomBytes, createHash } from "node:crypto";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { TableStorageError } from "./storage.errors";
import { CAMPAIGN_INVITE_SAFE_COLUMNS } from "./types";
import type { Campaign, CampaignInvite, CampaignInviteKind, CampaignMember, TableLogEntry, TableLogVisibility } from "./types";

/**
 * Id do usuário logado (narrador ou jogador) ou null. Best effort:
 * getCurrentUser lê o cookie httpOnly via next/headers, que só existe
 * num contexto de request (Server Action/RSC); fora disso (scripts
 * node) cai no catch e retorna null, sem quebrar.
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
const CAMPAIGN_INVITES_TABLE = "campaign_invites";

/** Hash SHA-256 (hex). O banco só guarda hashes de tokens, nunca o bruto. */
function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Alias legível para hash de token de convite. */
function hashInviteToken(rawToken: string): string {
  return sha256hex(rawToken);
}

/**
 * Cria uma mesa (campaign). Carimba `owner_id` com o narrador logado
 * quando há sessão.
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
 * Busca uma mesa por id. Retorna `null` se não existir (não lança erro
 * nesse caso, só em falha de rede/RLS), para a rota distinguir "mesa não
 * encontrada" de "erro ao buscar".
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
 * Renomeia uma campanha (Configurações, Fase 3) — `UPDATE` direto,
 * autorizado pela mesma RLS `campaigns_owner_update` (migration 0006)
 * já usada por `endRound`/`endScene`: só o dono da campanha grava.
 */
export async function renameCampaign(campaignId: string, name: string): Promise<Campaign> {
  const client = await getScopedTableClient();
  const finalName = name.trim() ? name.trim() : "Mesa sem nome";
  const { data, error } = await client
    .from(CAMPAIGNS_TABLE)
    .update({ name: finalName })
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao renomear a mesa "${campaignId}": ${error.message}`, error);
  }
  return data as Campaign;
}

/**
 * Preflight de "posso avançar esta campanha?" — usado por
 * `endCampaignRound`/`endCampaignScene` ANTES de processar qualquer
 * personagem, para não deixar estado parcial quando a RLS bloqueia o
 * UPDATE final em `campaigns`. Faz um UPDATE NO-OP (grava
 * `current_round` no próprio valor atual) sujeito à MESMA policy do
 * avanço real: se 0 linhas voltarem, a sessão não pode avançar.
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
 * "Encerrar rodada" — incrementa `campaigns.current_round` e registra
 * `table_logs.type="round_ended"`. NÃO resolve dano recorrente/fim de
 * rodada automaticamente.
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
 * "Encerrar cena" — incrementa `campaigns.current_scene` e registra
 * `table_logs.type="scene_ended"`. Se `rupturaPendingCharacterNames`
 * vier não-vazio, registra também `type="scene_rupture_pending"`.
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
}

/**
 * Registra uma entrada no log persistente de uma mesa. Append-only.
 * Chama a RPC `append_table_log` (SECURITY DEFINER) — o autor é sempre
 * derivado de `auth.uid()` no servidor, nunca confiado do cliente.
 */
export async function addLog(params: AddLogParams): Promise<TableLogEntry> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("append_table_log", {
    p_campaign_id: params.campaignId,
    p_type: params.type,
    p_visibility: params.visibility,
    p_payload: params.payload,
    p_character_id: params.characterId ?? null,
  });

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
  /** Conta do jogador que está olhando (null = narrador/anônimo — resolvido internamente por getCurrentUser). */
  userId?: string | null;
}

/**
 * Lista os logs de uma mesa JÁ FILTRADOS por visibilidade, no servidor,
 * conforme quem está pedindo. Regras:
 *   • narrador logado dono da mesa: vê TUDO (public/private/gm);
 *   • jogador autenticado: public + private do próprio (por
 *     created_by_user_id); NUNCA gm;
 *   • sem conta: só public.
 *
 * Fase 1: o filtro de "private" do próprio deixou de usar `profile_id`
 * (coluna removida de table_logs, migration 0057) — usa
 * `created_by_user_id`, já preenchido pela RPC `append_table_log` com
 * `auth.uid()` de quem registrou o evento.
 */
export async function listLogsForViewer(campaignId: string, viewer: LogViewer = {}): Promise<TableLogEntry[]> {
  const client = await getScopedTableClient();

  let isOwner = false;
  let viewerUserId = viewer.userId ?? null;
  try {
    const user = await getCurrentUser();
    if (user) {
      viewerUserId = viewerUserId ?? user.id;
      const { data: camp } = await client.from(CAMPAIGNS_TABLE).select("owner_id").eq("id", campaignId).maybeSingle();
      isOwner = !!camp && (camp as { owner_id: string | null }).owner_id === user.id;
    }
  } catch {
    isOwner = false;
  }

  const all = await listLogs(campaignId);
  if (isOwner) return all;

  return all.filter((entry) => {
    if (entry.visibility === "public") return true;
    if (entry.visibility === "gm") return false; // jogador nunca vê gm
    return viewerUserId != null && entry.created_by_user_id === viewerUserId;
  });
}

// =====================================================================
// Participação em campanha (campaign_members)
// =====================================================================

/** A conta logada é participante ATIVA (narrador dono ou jogador) desta campanha? */
export async function isCampaignMember(campaignId: string): Promise<boolean> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("is_campaign_member", { p_campaign_id: campaignId });
  if (error) return false;
  return Boolean(data);
}

/** Lista participantes de uma campanha (RLS: dono vê todos; jogador só a própria linha). Mais recentes primeiro. */
export async function listCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("campaign_members")
    .select()
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new TableStorageError(`Falha ao listar participantes da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as CampaignMember[]) ?? [];
}

/**
 * Remove um participante da campanha (`status='removed'`) — só o
 * narrador dono. Apaga também, na mesma transação (RPC
 * `remove_campaign_member`, migration 0055), os controles de personagem
 * que essa conta tinha nesta campanha — limpeza de dados; a negação de
 * acesso em si já não depende disso (`character_controllers` exige
 * participação ativa independentemente, ver src/lib/character/storage.ts).
 */
export async function removeCampaignMember(campaignId: string, userId: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("remove_campaign_member", {
    p_campaign_id: campaignId,
    p_user_id: userId,
  });
  if (error) {
    throw new TableStorageError(`Falha ao remover participante "${userId}" da mesa "${campaignId}": ${error.message}`, error);
  }
}

export interface CampaignParticipantInfo {
  user_id: string;
  display_name: string;
  email: string | null;
}

/**
 * Nome de exibição (com fallback humano, nunca UUID cru) e e-mail de
 * quem participa/controla personagens de uma campanha — SÓ retorna
 * linhas quando quem chama é o narrador (dono) daquela campanha (RPC
 * `get_campaign_participant_info`, migration 0060). Não é um sistema de
 * perfil público: leitura pontual, restrita por campanha, sem consultar
 * `auth.users` diretamente do frontend. Usada pelas telas exclusivas do
 * narrador (Jogadores e convites, Personagens) para nunca exibir
 * `user_id` bruto na UI.
 */
export async function getCampaignParticipantInfo(campaignId: string): Promise<Map<string, CampaignParticipantInfo>> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("get_campaign_participant_info", { p_campaign_id: campaignId });
  if (error) {
    throw new TableStorageError(`Falha ao buscar nomes de participantes da mesa "${campaignId}": ${error.message}`, error);
  }
  const rows = (data as CampaignParticipantInfo[]) ?? [];
  return new Map(rows.map((r) => [r.user_id, r]));
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
  /**
   * Só `id`/`name` (migration 0043) — nunca a linha inteira de
   * `campaigns`. Antes do login, o visitante é 100% anônimo; a RPC
   * `resolve_campaign_invite_public` (SECURITY DEFINER) é o único
   * caminho seguro para mostrar o nome da mesa sem depender de SELECT
   * amplo na tabela.
   */
  campaignId?: string;
  campaignName?: string;
  inviteId?: string;
  /** Fase 2 (migration 0059): tipo do convite e, quando "email", o e-mail associado — usado para pré-preencher o LoginForm. */
  kind?: CampaignInviteKind;
  email?: string | null;
}

/**
 * Cria um convite LIMPO (reutilizável, sempre concede Jogador, nunca
 * associado a e-mail — aditivo §7) para uma mesa. Gera um token
 * aleatório forte server-side, guarda só o SHA-256 no banco e devolve o
 * token bruto UMA vez (para montar o link). Quando há narrador logado,
 * recusa se ele não for o dono da mesa.
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
      kind: "clean",
    })
    .select(CAMPAIGN_INVITE_SAFE_COLUMNS)
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar convite na mesa "${campaignId}": ${error.message}`, error);
  }
  return { invite: data as CampaignInvite, rawToken };
}

/**
 * Cria um convite POR E-MAIL (aditivo §6) — associado a uma conta
 * específica. Ativação é automática: quando a pessoa autentica com o
 * MESMO e-mail (aceitando este link ou fazendo login/cadastro em
 * qualquer outro ponto, via `activatePendingEmailInvites`), a
 * participação é criada sem etapa extra. Nunca cria `campaign_members`
 * no momento da criação do convite — o estado "pendente" vive só aqui,
 * em `campaign_invites` (revisão 4 do relatório de auditoria).
 */
export async function createCampaignEmailInvite(
  campaignId: string,
  email: string,
  label?: string,
  expiresAt?: string | null,
): Promise<CreateInviteResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    throw new TableStorageError("Informe um e-mail para o convite.");
  }

  const client = await getScopedTableClient();
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }

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
      kind: "email",
      email: trimmedEmail,
    })
    .select(CAMPAIGN_INVITE_SAFE_COLUMNS)
    .single();

  if (error) {
    throw new TableStorageError(`Falha ao criar convite por e-mail na mesa "${campaignId}": ${error.message}`, error);
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
 * Resolve um token bruto de convite pela RPC pública mínima
 * `resolve_campaign_invite_public` — nunca um SELECT direto em
 * `campaign_invites`/`campaigns`. Nunca lança por convite inválido —
 * só por falha real de rede.
 */
export async function resolveCampaignInvite(rawToken: string): Promise<ResolvedInvite> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("resolve_campaign_invite_public", { p_token: rawToken });

  if (error) {
    throw new TableStorageError(`Falha ao resolver convite: ${error.message}`, error);
  }

  const result = data as {
    ok: boolean;
    reason?: ResolvedInvite["reason"];
    inviteId?: string;
    campaignId?: string;
    campaignName?: string;
    kind?: CampaignInviteKind;
    email?: string | null;
  };

  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    inviteId: result.inviteId,
    campaignId: result.campaignId,
    campaignName: result.campaignName,
    kind: result.kind,
    email: result.email,
  };
}

/**
 * Ativa, best-effort, todos os convites por e-mail pendentes cujo
 * e-mail bate com a conta que acabou de autenticar (login ou cadastro)
 * — aditivo §6: "ativação automática, sem etapa extra de aceitar
 * convite". Nunca lança: chamar isso não deve poder quebrar o fluxo de
 * login. Devolve os ids das campanhas cuja participação foi ativada
 * agora (lista vazia se nenhuma, ou em caso de erro).
 */
export async function activatePendingEmailInvites(): Promise<string[]> {
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("activate_pending_email_invites");
    if (error) return [];
    return ((data as { activatedCampaignIds?: string[] } | null)?.activatedCampaignIds) ?? [];
  } catch {
    return [];
  }
}
