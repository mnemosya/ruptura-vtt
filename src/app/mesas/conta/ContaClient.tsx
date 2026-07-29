"use client";

/**
 * Salvamento automático (aditivo §13.10): sem botão genérico "Salvar"
 * — grava em segundo plano, com atraso curto após a digitação parar,
 * e mostra só os estados discretos "Salvando…"/"Salvo"/"Falha ao
 * salvar" (com nova tentativa).
 */
import { useEffect, useRef, useState } from "react";
import { updateDisplayName } from "../../../lib/auth/actions";
import { AccountNav } from "../_account/AccountNav";
import { card, color, input, pageContainer, text } from "../[campaignId]/_shell/theme";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 700;

export default function ContaClient({ email, displayNameInicial }: { email: string; displayNameInicial: string | null }) {
  const [displayName, setDisplayName] = useState(displayNameInicial ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(displayNameInicial ?? "");

  async function persist(value: string) {
    setSaveState({ kind: "saving" });
    const res = await updateDisplayName(value);
    if (res.ok) {
      lastSavedRef.current = value;
      setSaveState({ kind: "saved" });
    } else {
      setSaveState({ kind: "error", message: res.error ?? "Erro ao salvar nome de exibição." });
    }
  }

  function scheduleSave(value: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Tenta concluir a alteração pendente antes de fechar/trocar de página (§13.10).
  useEffect(() => {
    function handleBeforeUnload() {
      if (timeoutRef.current && displayName !== lastSavedRef.current) {
        void persist(displayName);
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [displayName]);

  return (
    <div>
      <AccountNav userEmail={email} />
      <main style={pageContainer(560)}>
        <h1 style={{ ...text.h1, marginBottom: 20 }}>Conta e preferências</h1>

        <section style={{ ...card, display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div>
            <span style={{ ...text.faint, display: "block", marginBottom: 2 }}>E-mail</span>
            <span data-testid="conta-email" style={{ fontSize: 14 }}>{email}</span>
          </div>

          <div>
            <label htmlFor="conta-nome-exibicao" style={{ ...text.faint, display: "block", marginBottom: 4 }}>
              Nome de exibição
            </label>
            <input
              id="conta-nome-exibicao"
              data-testid="conta-nome-exibicao"
              type="text"
              value={displayName}
              onChange={(e) => {
                const value = e.target.value;
                setDisplayName(value);
                scheduleSave(value);
              }}
              placeholder="Como você quer aparecer nas suas campanhas"
              className="rv-focusable"
              style={{ ...input, width: "100%" }}
            />
            <p aria-live="polite" style={{ fontSize: 11, marginTop: 6, minHeight: 14 }}>
              {saveState.kind === "saving" && <span style={{ opacity: 0.6 }}>Salvando…</span>}
              {saveState.kind === "saved" && <span style={{ color: color.success }}>✓ Salvo</span>}
              {saveState.kind === "error" && (
                <span style={{ color: color.danger }}>
                  Falha ao salvar: {saveState.message}{" "}
                  <button
                    data-testid="conta-tentar-novamente"
                    onClick={() => persist(displayName)}
                    className="rv-focusable"
                    style={{ background: "transparent", border: "none", color: color.accent, cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}
                  >
                    Tentar novamente
                  </button>
                </span>
              )}
            </p>
          </div>
        </section>

        <p style={{ ...text.faint }}>
          Avatar e outras preferências pessoais ainda não estão disponíveis nesta versão.
        </p>
      </main>
    </div>
  );
}
