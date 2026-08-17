"use client";

/**
 * Realtime mínimo (checkpoint v0.46) — sincroniza mesa e ficha quando
 * `characters`/`campaigns`/`table_logs` mudam no Supabase.
 *
 * Decisão de produto: assinatura + REFETCH SEGURO, nunca patch parcial
 * complexo. Quando um evento chega, o único trabalho deste módulo é
 * decidir "que tipo de refetch isso pede" (`routeRealtimePayload`) e
 * agendar uma chamada debounced ao refetch canônico que o chamador já
 * usa (`getCharacter`/`listCharactersForNarratorCampaign`/`getCampaign`/
 * `listLogsForViewer`, todos pré-existentes — nenhuma leitura nova é
 * inventada aqui). Isso evita conflito de merge, estado dessincronizado
 * por patch parcial e regra de jogo duplicada no cliente.
 *
 * Todas as funções puras deste arquivo (nomes de canal, chave de
 * evento, dedupe, roteamento, debounce) não tocam rede — só as
 * `subscribeTo*Realtime` abaixo abrem um canal de verdade, via
 * `getBrowserSupabaseClient()` (nunca service role).
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../supabase/browserClient";

// ---------------------------------------------------------------------
// Nomes de canal — únicos por recurso, nunca strings soltas nos componentes.
// ---------------------------------------------------------------------

export function buildCampaignChannelName(campaignId: string): string {
  return `campaign:${campaignId}`;
}

export function buildCharacterChannelName(characterId: string): string {
  return `character:${characterId}`;
}

export function buildTableLogsChannelName(campaignId: string): string {
  return `table_logs:${campaignId}`;
}

export function buildCharacterControllersChannelName(campaignId: string): string {
  return `character_controllers:${campaignId}`;
}

// ---------------------------------------------------------------------
// Chave de evento + dedupe — dois eventos "iguais" (mesma tabela, mesmo
// tipo, mesmo id de registro, mesmo commit_timestamp do Postgres) geram
// a mesma chave; um evento genuinamente novo gera outra.
// ---------------------------------------------------------------------

export interface RealtimeEventLike {
  table: string;
  eventType?: string;
  commit_timestamp?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

export function makeRealtimeEventKey(payload: RealtimeEventLike): string {
  const record = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
  const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : "sem-id";
  const ts = typeof payload.commit_timestamp === "string" ? payload.commit_timestamp : "sem-timestamp";
  return `${payload.table}:${payload.eventType ?? "?"}:${id}:${ts}`;
}

/**
 * `seen` é mutado (Set de chaves já vistas) — devolve `true` se o
 * evento é NOVO (deve ser processado), `false` se já foi visto (ignorar).
 * `maxSize` evita crescimento sem limite numa sessão longa (derruba as
 * chaves mais antigas, por ordem de inserção do Set).
 */
export function dedupeRealtimeEvent(seen: Set<string>, key: string, maxSize = 200): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > maxSize) {
    const overflow = seen.size - maxSize;
    let dropped = 0;
    for (const existing of seen) {
      if (dropped >= overflow) break;
      seen.delete(existing);
      dropped++;
    }
  }
  return true;
}

// ---------------------------------------------------------------------
// Roteamento — que ação um evento de `postgres_changes` pede.
// ---------------------------------------------------------------------

export type RealtimeRefetchAction = "refetch_character" | "refetch_campaign" | "refetch_table_logs" | "ignore";

export function routeRealtimePayload(table: string, eventType: string): RealtimeRefetchAction {
  if (table === "characters" && (eventType === "UPDATE" || eventType === "INSERT" || eventType === "DELETE")) {
    return "refetch_character";
  }
  if (table === "campaigns" && eventType === "UPDATE") {
    return "refetch_campaign";
  }
  if (table === "table_logs" && eventType === "INSERT") {
    return "refetch_table_logs";
  }
  return "ignore";
}

// ---------------------------------------------------------------------
// Merge de table_logs — dedupe por id, preserva ordem (mais novo primeiro,
// mesmo critério de listLogs/listLogsForViewer). Só usado quando um
// chamador decide anexar em vez de refazer a listagem inteira.
// ---------------------------------------------------------------------

export function mergeTableLogsById<T extends { id: string; created_at: string }>(existing: T[], incoming: T[]): T[] {
  const seenIds = new Set(existing.map((entry) => entry.id));
  const novos = incoming.filter((entry) => !seenIds.has(entry.id));
  if (novos.length === 0) return existing;
  return [...novos, ...existing].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

// ---------------------------------------------------------------------
// Debounce de refetch — rajadas de eventos viram UMA chamada.
// ---------------------------------------------------------------------

export interface DebouncedRefetcher {
  schedule: () => void;
  cancel: () => void;
}

export function createDebouncedRefetcher(fn: () => void, delayMs = 200): DebouncedRefetcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ---------------------------------------------------------------------
// Status exposto pelas hooks (ver lib/realtime/use*Realtime.ts).
// ---------------------------------------------------------------------

export type RealtimeStatus = "connecting" | "subscribed" | "error" | "disabled";

function mapSupabaseChannelStatus(status: string): RealtimeStatus {
  if (status === "SUBSCRIBED") return "subscribed";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "error";
  return "connecting";
}

/** Texto/cor únicos do indicador discreto de sincronização — usado pela mesa e pela ficha (nunca modal, nunca poluir a UI). */
export function describeRealtimeStatus(status: RealtimeStatus, contexto: "mesa" | "ficha" = "mesa"): { texto: string; cor: string } {
  if (status === "subscribed") return { texto: contexto === "mesa" ? "Sincronizado" : "Sincronizado com a mesa", cor: "#4caf50" };
  if (status === "connecting") return { texto: "Conectando…", cor: "#f5a623" };
  if (status === "error") return { texto: "Erro de sincronização — use recarregar", cor: "#ff6b6b" };
  return { texto: contexto === "mesa" ? "Realtime indisponível — use recarregar" : "Sem realtime", cor: "#888" };
}

// ---------------------------------------------------------------------
// Assinaturas de verdade — abrem um canal Realtime; devolvem uma função
// de cleanup (unsubscribe + removeChannel). Nunca lançam: se o client de
// browser não existir (env pública ausente), reportam "disabled" e
// devolvem um cleanup no-op — o app segue funcionando com reload manual.
// ---------------------------------------------------------------------

export function subscribeToCampaignRealtime(params: {
  campaignId: string;
  onChange: (payload: RealtimeEventLike) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(buildCampaignChannelName(params.campaignId))
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${params.campaignId}` },
      (payload) => params.onChange(payload as unknown as RealtimeEventLike),
    )
    .subscribe((status) => params.onStatusChange?.(mapSupabaseChannelStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

export function subscribeToCharacterRealtime(params: {
  characterId: string;
  onChange: (payload: RealtimeEventLike) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(buildCharacterChannelName(params.characterId))
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "characters", filter: `id=eq.${params.characterId}` },
      (payload) => params.onChange(payload as unknown as RealtimeEventLike),
    )
    .subscribe((status) => params.onStatusChange?.(mapSupabaseChannelStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

/** Mesa: todos os personagens da campanha (INSERT/UPDATE/DELETE) — filtro por `campaign_id`. */
export function subscribeToCampaignCharactersRealtime(params: {
  campaignId: string;
  onChange: (payload: RealtimeEventLike) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`${buildCampaignChannelName(params.campaignId)}:characters`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => params.onChange(payload as unknown as RealtimeEventLike),
    )
    .subscribe((status) => params.onStatusChange?.(mapSupabaseChannelStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Mudanças de CONTROLE (`character_controllers`) — grant/revoke não
 * mexe na linha de `characters`, então o canal de personagens (acima)
 * nunca vê esse evento. Filtro por `campaign_id`; RLS de
 * `character_controllers_select` (migration 0051: `user_id =
 * auth.uid() or is_campaign_owner(campaign_id)`) já restringe o que
 * cada assinante recebe — o jogador só vê linhas do PRÓPRIO
 * `user_id`, o narrador vê a campanha inteira. Não precisa filtrar de
 * novo no cliente.
 */
export function subscribeToCampaignCharacterControllersRealtime(params: {
  campaignId: string;
  onChange: (payload: RealtimeEventLike) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(buildCharacterControllersChannelName(params.campaignId))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "character_controllers", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => params.onChange(payload as unknown as RealtimeEventLike),
    )
    .subscribe((status) => params.onStatusChange?.(mapSupabaseChannelStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}

export function subscribeToTableLogsRealtime(params: {
  campaignId: string;
  onChange: (payload: RealtimeEventLike) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}): () => void {
  const client = getBrowserSupabaseClient();
  if (!client) {
    params.onStatusChange?.("disabled");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(buildTableLogsChannelName(params.campaignId))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "table_logs", filter: `campaign_id=eq.${params.campaignId}` },
      (payload) => params.onChange(payload as unknown as RealtimeEventLike),
    )
    .subscribe((status) => params.onStatusChange?.(mapSupabaseChannelStatus(status)));

  return () => {
    client.removeChannel(channel);
  };
}
