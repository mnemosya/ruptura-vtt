import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { ModeToggle, type SheetMode } from "./ModeToggle";
import type { Campaign } from "../../../../lib/table";
import type { Character, EvolutionHistoryEntry } from "../../../../lib/character";

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

type SaveState = "idle" | "saving" | "saved" | "error";

const SEM_MESA = "";

const selectStyle = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
  maxWidth: 320,
};

export function GeneralTab({
  mode = "dev",
  nome,
  metadados,
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
  onLoadPersonagemAtivo,
  historicoEvolucao,
}: {
  /** "dev" (padrão) mantém o seletor de mesa; "product" (/ficha) mostra a mesa fixa como texto, sem seletor. */
  mode?: "dev" | "product";
  nome: string;
  /** Dados capturados no wizard de criação (checkpoint pós-v0.94, fase 4) — só leitura aqui. */
  metadados?: Character["metadados"];
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
  /** Recarrega o personagem atual do servidor (modo product: refaz getCharacterForCampaign). */
  onLoadPersonagemAtivo: () => void;
  /** Checkpoint v0.40 — PM e histórico de evolução. */
  historicoEvolucao: EvolutionHistoryEntry[];
}) {

  const mesaSelecionada = mesas.find((m) => m.id === selectedCampaignId) ?? null;

  return (
    <Section title="Geral">
      <ModeToggle mode={sheetMode} onChange={onModeChange} />

      {sheetMode === "evolucao" && (
        <div
          data-testid="evolucao-ajustes-secao"
          style={{
            background: "#15161b",
            border: "1px solid #2a2b33",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Ajustes permanentes</p>
          <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
            Histórico ({historicoEvolucao.length}) — ajustes permanentes de atributo e perícia feitos
            com "Ajustar".
          </p>
          <div data-testid="historico-evolucao-lista" style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {historicoEvolucao.length === 0 && (
              <span style={{ fontSize: 12, opacity: 0.5 }}>Nenhum evento de evolução ainda.</span>
            )}
            {[...historicoEvolucao].reverse().map((h) => (
              <div
                key={h.id}
                data-testid="historico-evolucao-item"
                style={{ fontSize: 11, opacity: 0.8, background: "#1d1e24", borderRadius: 6, padding: "6px 8px" }}
              >
                <strong>{h.tipo === "ganho" ? "Ganho" : h.tipo === "gasto" ? "Gasto" : "Ajuste"}</strong>
                {h.tipo !== "ajuste" ? ` ${h.quantidade} PM` : ""}
                {h.campoAfetado ? ` — ${h.campoAfetado}: ${h.antes} → ${h.depois}` : ""} — {h.descricao}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {(() => {
        const asString = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : null);
        const alcunha = asString(metadados?.alcunha);
        const conceito = asString(metadados?.conceito);
        const origem = asString(metadados?.origem);
        const idioma = asString(metadados?.idioma);
        const afiliacao = asString(metadados?.afiliacao);
        if (!alcunha && !conceito && !origem && !idioma && !afiliacao) return null;
        return (
          <div data-testid="ficha-identidade" style={{ fontSize: 12, opacity: 0.75, marginBottom: 16, display: "flex", flexDirection: "column", gap: 2 }}>
            {alcunha && <span><strong>Alcunha:</strong> {alcunha}</span>}
            {conceito && <span><strong>Conceito:</strong> {conceito}</span>}
            {origem && <span><strong>Origem:</strong> {origem}</span>}
            {idioma && <span><strong>Idioma:</strong> {idioma}</span>}
            {afiliacao && <span><strong>Afiliação:</strong> {afiliacao}</span>}
          </div>
        );
      })()}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* "Salvar personagem" SAIU.
            Ele ficava na página de baixo, coberto pela janela do
            Console — medido em (440,413), dentro da área que o Console
            ocupa. Quem editava PV ali não tinha como salvar sem fechar
            a ficha, e nada avisava que havia mudança pendente.
            Agora tudo grava sozinho; a evolução, que é permanente,
            grava ao sair do modo pelo ✓. O estado de gravação continua
            visível abaixo — some o passo manual, não o retorno. */}
        {mode === "dev" && (
          <button onClick={onNew} style={buttonStyle}>
            Novo personagem
          </button>
        )}
        {saveState === "saving" && <span style={{ fontSize: 13, opacity: 0.75 }}>Salvando…</span>}
        {saveState === "saved" && <span style={{ fontSize: 13, color: "#4caf50" }}>✓ Salvo</span>}
        {saveState === "error" && <span style={{ fontSize: 13, color: "#ff6b6b" }}>Erro: {errorMessage}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        <span>id: {characterId ?? "ainda não salvo"}</span>
        <span>schema version: {schemaVersion ?? "—"}</span>
      </div>

      {mode === "product" ? (
        <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          <span>Mesa: {mesaSelecionada?.name ?? "—"}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button data-testid="ficha-recarregar-button" onClick={onLoadPersonagemAtivo} style={buttonStyle}>
              Recarregar personagem
            </button>
          </div>
        </div>
      ) : (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginBottom: 16 }}>
          Mesa (opcional — rolagens também gravam no log persistente dela)
          <select
            data-testid="mesa-select"
            value={selectedCampaignId ?? SEM_MESA}
            onChange={(e) => onSelectCampaign(e.target.value === SEM_MESA ? null : e.target.value)}
            style={selectStyle}
          >
            <option value={SEM_MESA}>Nenhuma mesa (só log local)</option>
            {mesas.map((mesa) => (
              <option key={mesa.id} value={mesa.id}>
                {mesa.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </Section>
  );
}
