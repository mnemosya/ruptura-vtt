import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { ModeToggle, type SheetMode } from "./ModeToggle";
import type { Campaign } from "../../../../lib/table";

type SaveState = "idle" | "saving" | "saved" | "error";

const SEM_MESA = "";

export function GeneralTab({
  nome,
  characterId,
  schemaVersion,
  saveState,
  errorMessage,
  sheetMode,
  onModeChange,
  onNomeChange,
  onSave,
  onNew,
  mesas,
  selectedCampaignId,
  onSelectCampaign,
}: {
  nome: string;
  characterId: string | null;
  schemaVersion: number | undefined;
  saveState: SaveState;
  errorMessage: string | null;
  sheetMode: SheetMode;
  onModeChange: (mode: SheetMode) => void;
  onNomeChange: (value: string) => void;
  onSave: () => void;
  onNew: () => void;
  mesas: Campaign[];
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string | null) => void;
}) {
  return (
    <Section title="Geral">
      <ModeToggle mode={sheetMode} onChange={onModeChange} />

      <input
        value={nome}
        onChange={(e) => onNomeChange(e.target.value)}
        style={{
          fontSize: 28,
          fontWeight: 700,
          background: "transparent",
          color: "inherit",
          border: "none",
          borderBottom: "1px solid #333",
          padding: "4px 0",
          marginBottom: 12,
          width: "100%",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={onSave} disabled={saveState === "saving"} style={buttonStyle}>
          {saveState === "saving" ? "Salvando…" : "Salvar personagem"}
        </button>
        <button onClick={onNew} style={buttonStyle}>
          Novo personagem
        </button>
        {saveState === "saved" && <span style={{ fontSize: 13, color: "#4caf50" }}>✓ Salvo</span>}
        {saveState === "error" && <span style={{ fontSize: 13, color: "#ff6b6b" }}>Erro: {errorMessage}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        <span>id: {characterId ?? "ainda não salvo"}</span>
        <span>schema version: {schemaVersion ?? "—"}</span>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        Mesa (opcional — rolagens também gravam no log persistente dela)
        <select
          data-testid="mesa-select"
          value={selectedCampaignId ?? SEM_MESA}
          onChange={(e) => onSelectCampaign(e.target.value === SEM_MESA ? null : e.target.value)}
          style={{
            background: "#0f1014",
            color: "inherit",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 13,
            maxWidth: 320,
          }}
        >
          <option value={SEM_MESA}>Nenhuma mesa (só log local)</option>
          {mesas.map((mesa) => (
            <option key={mesa.id} value={mesa.id}>
              {mesa.name}
            </option>
          ))}
        </select>
      </label>
    </Section>
  );
}
