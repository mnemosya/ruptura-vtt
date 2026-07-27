import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { ModeToggle, type SheetMode } from "./ModeToggle";
import type { Campaign, CampaignProfile } from "../../../../lib/table";
import type { Character, CharacterRecord, EvolutionHistoryEntry } from "../../../../lib/character";

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
  pmTotal,
  pmDisponivel,
  historicoEvolucao,
  onGainPm,
  onSpendPm,
}: {
  /** "dev" (padrão) mantém os seletores de mesa/perfil; "product" (/ficha, v0.24) mostra mesa/perfil fixos como texto, sem seletor. */
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
  /** Checkpoint v0.40 — PM e histórico de evolução. */
  pmTotal: number;
  pmDisponivel: number;
  historicoEvolucao: EvolutionHistoryEntry[];
  onGainPm: (quantidade: number, descricao: string) => void;
  onSpendPm: (quantidade: number, descricao: string) => void;
}) {
  const [ganhoQtd, setGanhoQtd] = useState("0");
  const [ganhoDescricao, setGanhoDescricao] = useState("");
  const [gastoQtd, setGastoQtd] = useState("0");
  const [gastoDescricao, setGastoDescricao] = useState("");

  const perfilSelecionado = perfis.find((p) => p.id === selectedProfileId) ?? null;
  const personagemAtivo = perfilSelecionado
    ? personagens.find((p) => p.id === perfilSelecionado.active_character_id) ?? null
    : null;
  const estaNoPerfilSelecionado = perfilSelecionado != null && enteredProfileId === perfilSelecionado.id;
  const mesaSelecionada = mesas.find((m) => m.id === selectedCampaignId) ?? null;

  return (
    <Section title="Geral">
      <ModeToggle mode={sheetMode} onChange={onModeChange} />

      {sheetMode === "evolucao" && (
        <div
          data-testid="pm-evolucao-secao"
          style={{
            background: "#15161b",
            border: "1px solid #2a2b33",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PM e evolução</p>
          <p data-testid="pm-disponivel" style={{ fontSize: 13, marginBottom: 8 }}>
            PM disponível: <strong>{pmDisponivel}</strong> · PM total recebido: {pmTotal}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input
              data-testid="pm-ganho-quantidade"
              type="number"
              value={ganhoQtd}
              onChange={(e) => setGanhoQtd(e.target.value)}
              style={{ ...inputStyle, width: 70 }}
            />
            <input
              data-testid="pm-ganho-descricao"
              type="text"
              placeholder="Descrição (ex.: recompensa da sessão)"
              value={ganhoDescricao}
              onChange={(e) => setGanhoDescricao(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
            <button
              data-testid="pm-ganho-button"
              onClick={() => {
                onGainPm(Number.parseInt(ganhoQtd, 10) || 0, ganhoDescricao);
                setGanhoQtd("0");
                setGanhoDescricao("");
              }}
              style={buttonStyle}
            >
              Adicionar PM recebido
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              data-testid="pm-gasto-quantidade"
              type="number"
              value={gastoQtd}
              onChange={(e) => setGastoQtd(e.target.value)}
              style={{ ...inputStyle, width: 70 }}
            />
            <input
              data-testid="pm-gasto-descricao"
              type="text"
              placeholder="Descrição (ex.: subir Corpo)"
              value={gastoDescricao}
              onChange={(e) => setGastoDescricao(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            />
            <button
              data-testid="pm-gasto-button"
              onClick={() => {
                onSpendPm(Number.parseInt(gastoQtd, 10) || 0, gastoDescricao);
                setGastoQtd("0");
                setGastoDescricao("");
              }}
              style={buttonStyle}
            >
              Registrar gasto manual
            </button>
          </div>
          <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
            Histórico de evolução ({historicoEvolucao.length}) — inclui PM ganho/gasto e ajustes
            permanentes de atributo/perícia feitos em Modo Evolução.
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
        <button onClick={onSave} disabled={saveState === "saving"} style={buttonStyle}>
          {saveState === "saving" ? "Salvando…" : "Salvar personagem"}
        </button>
        {mode === "dev" && (
          <button onClick={onNew} style={buttonStyle}>
            Novo personagem
          </button>
        )}
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
          <span>Perfil: {perfilSelecionado?.nickname ?? "—"}</span>
          <span data-testid="perfil-selecionado-status">Status: {perfilStatus ?? "—"}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button data-testid="ficha-recarregar-button" onClick={onLoadPersonagemAtivo} style={buttonStyle}>
              Recarregar personagem
            </button>
            {estaNoPerfilSelecionado && (
              <button data-testid="perfil-sair-button" onClick={onLeaveProfile} style={buttonStyle}>
                Sair do perfil
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            Heartbeat: id de sessão fica só no localStorage deste navegador. Sem heartbeat por 30s, outra
            sessão pode assumir o perfil.
          </span>
          {profileWarning && (
            <span data-testid="perfil-aviso" style={{ color: "#ffb84f" }}>
              {profileWarning}
            </span>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}
    </Section>
  );
}
