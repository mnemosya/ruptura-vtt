"use client";

import { useEffect, useId, useRef, useState } from "react";
import { changeOnlineSession, continueOnlineSession, type OnlineSession } from "../../../../lib/campaign/onlineSessionActions";
import styles from "./SessionTimeoutDialog.module.css";

export function SessionTimeoutDialog({ campaignId, session, clockOffset, syncError, reload }: {
  campaignId: string; session: OnlineSession; clockOffset: number;
  syncError: string | null; reload: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, Math.ceil((Date.parse(session.confirmation_deadline!) - now - clockOffset) / 1000));

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { if (remaining === 0) void reload(); }, [remaining, reload]);

  async function respond(keep: boolean) {
    if (pending.current || remaining === 0) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = keep
        ? await continueOnlineSession(campaignId, session.id, session.confirmation_deadline!)
        : await changeOnlineSession(campaignId, false, session.id);
      if (!result.ok) setError(result.error);
      await reload();
    } catch {
      setError("Falha de conexão. Sua confirmação não foi enviada. Tente novamente.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => event.preventDefault()} onKeyDown={event => event.stopPropagation()}>
    <header className={styles.header}>
      <span className={styles.label}>SESSÃO ONLINE</span>
      <span className={styles.code} aria-hidden="true">SYS.TIMEOUT // 30M</span>
    </header>
    <div className={styles.body}>
      <h2 id={titleId}>Manter a sessão aberta?</h2>
      <p id={descriptionId} className={styles.description}>Nenhum jogador está conectado há 30 minutos. Você pode continuar sozinho ou encerrar a sessão. O histórico será preservado.</p>
      <div className={styles.status}>
        <span className={styles.statusLabel}>ENCERRAMENTO AUTOMÁTICO</span>
        <p className={styles.countdown} role="timer" aria-live="off">
          {remaining > 0 ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Prazo esgotado. Sincronizando encerramento…"}
        </p>
      </div>
      <p className={styles.hint}>Continuar inicia um novo prazo de 30 minutos. Se um jogador voltar, este aviso será cancelado.</p>
      {(error || syncError) && <p className={styles.error} role="alert">{error || syncError}</p>}
    </div>
    <div className={styles.actions}>
      <button autoFocus disabled={busy || remaining === 0} onClick={() => void respond(true)}>Continuar</button>
      <button className={styles.danger} disabled={busy || remaining === 0} onClick={() => void respond(false)}>Encerrar</button>
    </div>
  </dialog>;
}
