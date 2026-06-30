import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { ModeToggle, type SheetMode } from "./ModeToggle";
import type { Campaign, CampaignProfile } from "../../../../lib/table";
import type { CharacterRecord } from "../../../../lib/character";

type SaveState = "idle" | "saving" | "saved" | "error";

const SEM_MESA = "";
const SEM_PERFIL = "";

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
  perfis,
  selectedProfileId,
  onSelectProfile,
  onLoadPersonagemAtivo,
  profileWarning,
  personagens,
  perfilStatus,
  enteredProfileId,
  onEnterProfile,
  onLeaveProfile,
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
  perfis: CampaignProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (id: string | null) => void;
  onLoadPersonagemAtivo: () => void;
  profileWarning: string | null;
  personagens: CharacterRecord[];
  /** "Livre" | "Em uso por esta aba" | "Expirado" | "Em uso" — calculado pelo componente pai (precisa de sessionId + relógio local). */
  perfilStatus: string | null;
  /** Id do perfil que ESTA aba entrou via heartbeat (distinto de selectedProfileId). */
  enteredProfileId: string | null;
  onEnterProfile: () => void;
  onLeaveProfile: () => void;
}) {
  const perfilSelecionado = perfis.find((p) => p.id === selectedProfileId) ?? null;
  const personagemAtivo = perfilSelecionado
    ? personagens.find((p) => p.id === perfilSelecionado.active_character_id) ?? null
    : null;
  const estaNoPerfilSelecionado = perfilSelecionado != null && enteredProfileId === perfilSelecionado.id;
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

      {selectedCampaignId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Perfil nesta mesa (opcional — usado para "Carregar personagem ativo" e anotado nas rolagens)
            <select
              data-testid="perfil-select"
              value={selectedProfileId ?? SEM_PERFIL}
              onChange={(e) => onSelectProfile(e.target.value === SEM_PERFIL ? null : e.target.value)}
              style={selectStyle}
            >
              <option value={SEM_PERFIL}>Nenhum perfil</option>
              {perfis.map((perfil) => (
                <option key={perfil.id} value={perfil.id}>
                  {perfil.nickname} ({perfil.is_locked ? "Bloqueado" : "Livre"})
                </option>
              ))}
            </select>
          </label>

          {perfilSelecionado && (
            <div style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4 }}>
              <span data-testid="perfil-selecionado-status">Status: {perfilStatus ?? "—"}</span>
              <span data-testid="perfil-selecionado-personagem-ativo">
                Personagem ativo: {personagemAtivo ? personagemAtivo.name : "nenhum"}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={onLoadPersonagemAtivo} style={buttonStyle}>
                  Carregar personagem ativo
                </button>
                {estaNoPerfilSelecionado ? (
                  <button data-testid="perfil-sair-button" onClick={onLeaveProfile} style={buttonStyle}>
                    Sair do perfil
                  </button>
                ) : (
                  <button data-testid="perfil-entrar-button" onClick={onEnterProfile} style={buttonStyle}>
                    Entrar como perfil
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                Heartbeat dev: id de sessão fica só no localStorage deste navegador (não é login). Sem heartbeat
                por 30s, outra sessão pode assumir o perfil.
              </span>
              {profileWarning && (
                <span data-testid="perfil-aviso" style={{ color: "#ffb84f" }}>
                  {profileWarning}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
