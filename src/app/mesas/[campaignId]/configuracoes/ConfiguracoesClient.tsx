"use client";

/**
 * Salvamento automático (aditivo §13.10) — sem botão genérico
 * "Salvar": grava o novo nome em segundo plano após a digitação
 * parar, com estados discretos de Salvando/Salvo/Falha ao salvar.
 */
import { useEffect, useRef, useState } from "react";
import { renameCampaign } from "../../../../lib/table/storage";
import type { Campaign } from "../../../../lib/table";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };
const AUTOSAVE_DELAY_MS = 700;

export default function ConfiguracoesClient({ campaign }: { campaign: Campaign }) {
  const [name, setName] = useState(campaign.name);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(value: string) {
    if (!value.trim()) {
      setSaveState({ kind: "error", message: "O nome da campanha não pode ficar vazio." });
      return;
    }
    setSaveState({ kind: "saving" });
    try {
      await renameCampaign(campaign.id, value);
      setSaveState({ kind: "saved" });
    } catch (e) {
      setSaveState({ kind: "error", message: e instanceof Error ? e.message : "Erro ao renomear campanha." });
    }
  }

  function scheduleSave(value: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <main className="rm-page" style={{ maxWidth: 560 }}>
      <h1 className="rm-page-title">Configurações</h1>

      <section className="rm-card" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <label htmlFor="config-nome-campanha" className="rm-field-label">Nome da campanha</label>
        <input
          id="config-nome-campanha"
          data-testid="config-nome-campanha"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); scheduleSave(e.target.value); }}
          className="rm-input rv-focusable"
          style={{ width: "100%" }}
        />
        <p aria-live="polite" style={{ fontSize: 11, minHeight: 14, margin: 0 }}>
          {saveState.kind === "saving" && <span className="rm-faint">Salvando…</span>}
          {saveState.kind === "saved" && <span style={{ color: "var(--rm-success)" }}>✓ Salvo</span>}
          {saveState.kind === "error" && <span style={{ color: "var(--rm-danger)" }}>Falha ao salvar: {saveState.message}</span>}
        </p>
      </section>

      <p className="rm-faint">
        Permissões de criação de personagem e configuração de convites ainda não estão disponíveis
        nesta versão — decisões de produto pendentes (ver relatório de auditoria).
      </p>
    </main>
  );
}
