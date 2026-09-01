"use client";

/**
 * "Conta e preferências" (aditivo §4.3), agora dentro do shell global.
 *
 * Salvamento automático (aditivo §13.10): sem botão genérico "Salvar" —
 * grava em segundo plano, com atraso curto após a digitação parar, e
 * mostra só os estados discretos "Salvando…"/"Salvo"/"Falha ao salvar"
 * (com nova tentativa).
 *
 * As preferências visuais ("reduzir movimento", "alto contraste") são do
 * shell (contexto + localStorage): valem para este navegador, não são
 * dados de conta — não há hoje onde persistí-las no servidor, e criar
 * uma tabela só para isso está fora do escopo deste redesign.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, updateDisplayName } from "../../../../lib/auth/actions";
import { useVisualPrefs } from "../../_global/GlobalShell";
import { PageHead } from "../../_global/parts";
import {
  AlertTriangle, Check, LogOut, Mail, Monitor, Shield, Spinner, User, Zap,
} from "../../../_design/icons";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 700;

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return (
      <span className="ra-save ra-save--saving" role="status" aria-live="polite">
        <Spinner size={11} className="ra-spin" /> Salvando…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="ra-save ra-save--saved" role="status" aria-live="polite">
        <Check size={11} /> Salvo
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="ra-save ra-save--error" role="status" aria-live="polite">
        <AlertTriangle size={11} /> Falha ao salvar: {state.message}
        <button type="button" className="ra-linkbtn" data-testid="conta-tentar-novamente" onClick={onRetry}>
          Tentar novamente
        </button>
      </span>
    );
  }
  return (
    <span className="ra-save ra-save--idle" role="status" aria-live="polite">
      · Salvamento automático ativo
    </span>
  );
}

export default function ContaClient({
  email,
  displayNameInicial,
}: {
  email: string;
  displayNameInicial: string | null;
}) {
  const router = useRouter();
  const { prefs, togglePref } = useVisualPrefs();

  const [displayName, setDisplayName] = useState(displayNameInicial ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [signingOut, setSigningOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(displayNameInicial ?? "");

  async function persist(value: string) {
    setSaveState({ kind: "saving" });
    const res = await updateDisplayName(value);
    if (res.ok) {
      lastSavedRef.current = value;
      setSaveState({ kind: "saved" });
      router.refresh();
    } else {
      setSaveState({ kind: "error", message: res.error ?? "Erro ao salvar nome de exibição." });
    }
  }

  function scheduleSave(value: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // Tenta concluir a alteração pendente antes de fechar/trocar de página (§13.10).
  useEffect(() => {
    function handleBeforeUnload() {
      if (timeoutRef.current && displayName !== lastSavedRef.current) void persist(displayName);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [displayName]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const nomeVisivel = displayName.trim() || email.split("@")[0];

  return (
    <div className="ra2-page ra2-page--narrow ra2-view-enter">
      <PageHead eyebrow="SYS.OPERATOR // PERFIL" title="Conta e preferências" />

      <div className="ra-module" style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            width: 82, height: 82, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(0,212,255,.35)", background: "rgba(0,212,255,.06)", color: "#418292",
            clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
            boxShadow: "0 0 20px rgba(0,212,255,.16)",
          }}
        >
          <User size={36} strokeWidth={1.1} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ra-h3">{nomeVisivel}</div>
          <div
            className="ra-mono"
            style={{ fontSize: 12.5, color: "rgba(184,216,232,.6)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Mail size={12} />
            <span data-testid="conta-email" style={{ wordBreak: "break-all" }}>{email}</span>
          </div>
        </div>
      </div>

      <div className="ra-module">
        <div className="ra-module-title">Identidade</div>
        <div className="ra-field">
          <label className="ra-flabel" htmlFor="conta-nome-exibicao">Nome de exibição</label>
          <input
            id="conta-nome-exibicao"
            data-testid="conta-nome-exibicao"
            className="ra-input"
            type="text"
            value={displayName}
            maxLength={60}
            onChange={(e) => { setDisplayName(e.target.value); scheduleSave(e.target.value); }}
            placeholder="Como você quer aparecer nas suas campanhas"
          />
          <div style={{ marginTop: 8 }}>
            <SaveIndicator state={saveState} onRetry={() => persist(displayName)} />
          </div>
          <span className="ra-hint">
            É o nome que o narrador vê em Jogadores e convites, e que aparece na Rede da sua home.
          </span>
        </div>
      </div>

      <div className="ra-module">
        <div className="ra-module-title"><Monitor size={12} /> Preferências visuais</div>

        <div className="ra-toggle-row">
          <div className="ra-toggle-copy">
            <strong><Zap size={12} /> Reduzir movimento</strong>
            <span>Desativa parallax, cursor HUD e animações ambientais.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.reduceMotion}
            aria-label="Reduzir movimento"
            data-testid="conta-reduzir-movimento"
            className={`ra-switch${prefs.reduceMotion ? " ra-switch--on" : ""}`}
            onClick={() => togglePref("reduceMotion")}
          >
            <span className="ra-switch-knob" />
          </button>
        </div>

        <div className="ra-toggle-row">
          <div className="ra-toggle-copy">
            <strong><Shield size={12} /> Alto contraste</strong>
            <span>Reforça bordas e legibilidade dos painéis HUD.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.highContrast}
            aria-label="Alto contraste"
            data-testid="conta-alto-contraste"
            className={`ra-switch${prefs.highContrast ? " ra-switch--on" : ""}`}
            onClick={() => togglePref("highContrast")}
          >
            <span className="ra-switch-knob" />
          </button>
        </div>

        <p className="ra-hint" style={{ marginTop: 12 }}>
          Guardadas neste navegador. Avatar e demais preferências pessoais ainda não têm onde ser
          persistidos no servidor nesta versão.
        </p>
      </div>

      <div className="ra-module">
        <div className="ra-module-title">Sessão</div>
        <div className="ra-kv">
          <div><span>Terminal</span><span className="ra-kv-v">WEB // NAVEGADOR</span></div>
          <div><span>Conta</span><span className="ra-kv-v">{email}</span></div>
          <div><span>Status</span><span style={{ color: "#22d3aa" }}>● Conectado</span></div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            className="ra-btn ra-btn--danger ra-btn--block"
            data-testid="conta-encerrar-sessao"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={14} /> {signingOut ? "Encerrando…" : "Encerrar sessão"}
          </button>
        </div>
      </div>
    </div>
  );
}
