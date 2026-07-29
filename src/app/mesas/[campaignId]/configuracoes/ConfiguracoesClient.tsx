"use client";

/**
 * Salvamento automático (aditivo §13.10) — sem botão genérico
 * "Salvar": grava o novo nome em segundo plano após a digitação
 * parar, com estados discretos de Salvando/Salvo/Falha ao salvar.
 */
import { useEffect, useRef, useState } from "react";
import { renameCampaign } from "../../../../lib/table/storage";
import type { Campaign } from "../../../../lib/table";
import { card, color, input, pageContainer, text } from "../_shell/theme";

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
    <main style={pageContainer(560)}>
      <h1 style={{ ...text.h1, marginBottom: 20 }}>Configurações</h1>

      <section style={{ ...card, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <label htmlFor="config-nome-campanha" style={{ ...text.faint }}>Nome da campanha</label>
        <input
          id="config-nome-campanha"
          data-testid="config-nome-campanha"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); scheduleSave(e.target.value); }}
          className="rv-focusable"
          style={{ ...input, width: "100%" }}
        />
        <p aria-live="polite" style={{ fontSize: 11, minHeight: 14, margin: 0 }}>
          {saveState.kind === "saving" && <span style={{ opacity: 0.6 }}>Salvando…</span>}
          {saveState.kind === "saved" && <span style={{ color: color.success }}>✓ Salvo</span>}
          {saveState.kind === "error" && <span style={{ color: color.danger }}>Falha ao salvar: {saveState.message}</span>}
        </p>
      </section>

      <p style={{ ...text.faint }}>
        Permissões de criação de personagem e configuração de convites ainda não estão disponíveis
        nesta versão — decisões de produto pendentes (ver relatório de auditoria).
      </p>
    </main>
  );
}
