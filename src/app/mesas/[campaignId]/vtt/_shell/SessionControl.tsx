"use client";

import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { useCampaignSession } from "../../_shell/CampaignRealtimeProvider";
import { useOnlineSession } from "../../_shell/OnlineSessionProvider";
import { changeOnlineSession } from "../../../../../lib/campaign/onlineSessionActions";

export function SessionControl() {
  const { campaignId, isNarrator, realtimeAuthDegradado, sessionSyncStatus } = useCampaignSession();
  const { session, loading, error, reload } = useOnlineSession();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const online = !!session && session.ended_at === null;
  const degraded = realtimeAuthDegradado || sessionSyncStatus === "error";

  async function change(next: boolean, expected: string | null) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = await changeOnlineSession(campaignId, next, expected);
      if (!result.ok) setActionError(result.error);
      setConfirmation(null);
      await reload();
    } catch {
      setActionError("Falha de conexão. Atualize para conferir o estado da sessão.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const confirming = isNarrator && !loading && !error && confirmation === session?.id && online;
  return <div className="rv-session" data-testid="vtt-session-control" aria-busy={busy}>
    {confirming ? <div className="rv-session-confirm">
      <p className="rv-session-question">Encerrar a sessão?</p>
      <p className="rv-session-note">O histórico fica salvo. Você poderá iniciar uma nova sessão quando quiser.</p>
      <div className="rv-session-actions">
        <button type="button" role="menuitem" className="rv-session-button" disabled={busy} onClick={() => setConfirmation(null)}>Voltar</button>
        <button type="button" role="menuitem" className="rv-session-button rv-session-button--danger" disabled={busy} onClick={() => void change(false, confirmation)}>{busy ? "Encerrando…" : "Encerrar"}</button>
      </div>
    </div> : <div className="rv-session-line">
      <div role="status">
        <div className="rv-session-status" data-online={!loading && !error && online}>
          {!loading && !error && <span className="rv-session-dot" aria-hidden="true" />}
          {loading ? "Consultando…" : error ? "Indisponível" : online ? "ONLINE" : "OFFLINE"}
        </div>
        {!loading && !error && <div className="rv-session-time">
          {online && session ? <time dateTime={session.started_at} title={new Date(session.started_at).toLocaleString("pt-BR")}>Desde {new Date(session.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time> : "Sessão encerrada"}
        </div>}
      </div>
      {isNarrator && !loading && !error && <button type="button" role="menuitem" className={`rv-session-toggle${online ? "" : " rv-session-toggle--start"}`} disabled={busy} onClick={() => online ? setConfirmation(session.id) : void change(true, null)}>
        {online ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
        {busy ? "Iniciando…" : online ? "Encerrar" : "Iniciar sessão"}
      </button>}
    </div>}
    {degraded && <p role="status" className="rv-session-note">Sincronização interrompida. Atualize o estado da sessão.</p>}
    {(error || actionError) && <p role="alert" className="rv-session-note">{actionError ?? error}</p>}
    {(error || actionError || degraded) && <button type="button" role="menuitem" className="rv-session-button" disabled={busy} onClick={() => void reload()}>Atualizar sessão</button>}
  </div>;
}
