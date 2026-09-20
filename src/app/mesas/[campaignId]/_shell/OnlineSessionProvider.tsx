"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { heartbeatOnlineSession, type OnlineSession } from "../../../../lib/campaign/onlineSessionActions";
import { useCampaignSession } from "./CampaignRealtimeProvider";
import { SessionTimeoutDialog } from "./SessionTimeoutDialog";

const Context = createContext<{
  session: OnlineSession | null; loading: boolean; error: string | null; reload: () => Promise<void>;
} | null>(null);

export function OnlineSessionProvider({ children }: { children: ReactNode }) {
  const { campaignId, campaign, sessionSyncStatus, isNarrator } = useCampaignSession();
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await heartbeatOnlineSession(campaignId);
      if (request !== generation.current) return;
      if (!result.error) setSession(result.session);
      if (result.serverNow) setClockOffset(Date.parse(result.serverNow) - Date.now());
      setError(result.error ?? null);
    } catch {
      if (request !== generation.current) return;
      setError("Não foi possível sincronizar a sessão. Verifique sua conexão.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [campaignId]);
  useEffect(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload, campaign.updated_at, sessionSyncStatus]);
  useEffect(() => {
    const refresh = () => { void reload(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [reload]);
  return <Context.Provider value={{ session, loading, error, reload }}>
    {children}
    {isNarrator && session && !session.ended_at && session.confirmation_deadline &&
      <SessionTimeoutDialog key={`${session.id}:${session.confirmation_deadline}`}
        campaignId={campaignId} session={session} clockOffset={clockOffset} syncError={error} reload={reload} />}
  </Context.Provider>;
}

export function useOnlineSession() {
  const value = useContext(Context);
  if (!value) throw new Error("OnlineSessionProvider ausente");
  return value;
}
