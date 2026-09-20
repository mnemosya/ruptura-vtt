"use server";

import { getScopedTableClient } from "../auth/scopedClient";
import { resolveCampaignAccess } from "./access";

export interface OnlineSession {
  id: string;
  campaign_id: string;
  started_at: string;
  ended_at: string | null;
  empty_since: string | null;
  confirmation_deadline: string | null;
}

export async function readOnlineSession(campaignId: string): Promise<{ session: OnlineSession | null; error?: string }> {
  try {
    const access = await resolveCampaignAccess(campaignId);
    if (access.kind !== "ok") throw new Error("Você não tem acesso a esta campanha.");
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_online_sessions")
      .select("id,campaign_id,started_at,ended_at,empty_since,confirmation_deadline").eq("campaign_id", campaignId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { session: data };
  } catch {
    return { session: null, error: "Não foi possível consultar a sessão online." };
  }
}

export async function heartbeatOnlineSession(campaignId: string): Promise<{
  session: OnlineSession | null; serverNow?: string; error?: string;
}> {
  try {
    // A RPC valida auth.uid() e o vínculo com a campanha; não aceita identidade do cliente.
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("heartbeat_campaign_session", { p_campaign_id: campaignId });
    if (error) throw error;
    return { session: data.session, serverNow: data.server_now };
  } catch {
    return { session: null, error: "Não foi possível sincronizar a sessão. Verifique sua conexão." };
  }
}

export async function continueOnlineSession(campaignId: string, sessionId: string, deadline: string) {
  try {
    const client = await getScopedTableClient();
    const { error } = await client.rpc("continue_campaign_session", {
      p_campaign_id: campaignId, p_session_id: sessionId, p_deadline: deadline,
    });
    if (error) throw error;
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Não foi possível continuar. O prazo pode ter expirado. Atualize e tente novamente." };
  }
}

export async function changeOnlineSession(campaignId: string, online: boolean, expectedId: string | null) {
  try {
    const access = await resolveCampaignAccess(campaignId);
    if (access.kind !== "ok" || access.role !== "narrator") throw new Error("Só o narrador pode controlar a sessão.");
    const client = await getScopedTableClient();
    const { error } = await client.rpc("set_campaign_online_session", {
      p_campaign_id: campaignId, p_online: online, p_expected_session_id: expectedId,
    });
    if (error) throw error;
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Não foi possível alterar a sessão. Atualize e tente novamente." };
  }
}
