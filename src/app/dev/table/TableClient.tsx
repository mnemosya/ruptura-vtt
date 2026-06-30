"use client";

/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — não é a
 * interface final do VTT (sem chat real, sem realtime, sem
 * autenticação). Server Actions chamadas diretamente daqui, mesmo
 * padrão de CharacterSheetClient.
 */

import { useState } from "react";
import { createCampaign, listCampaigns, addLog, listLogs } from "../../../lib/table/storage";
import {
  TABLE_LOG_VISIBILITIES,
  type Campaign,
  type TableLogEntry,
  type TableLogVisibility,
} from "../../../lib/table";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

const VISIBILITY_LABELS: Record<TableLogVisibility, string> = {
  public: "Pública",
  private: "Privada",
  gm: "Mestre (GM)",
};

interface Props {
  mesasIniciais: Campaign[];
}

export default function TableClient({ mesasIniciais }: Props) {
  const [mesas, setMesas] = useState<Campaign[]>(mesasIniciais);
  const [novaMesaNome, setNovaMesaNome] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  async function refreshMesas() {
    try {
      setMesas(await listCampaigns());
    } catch {
      // Falha ao atualizar a lista não deve esconder o resultado da ação atual.
    }
  }

  async function handleCreateMesa() {
    setErrorMessage(null);
    try {
      const mesa = await createCampaign(novaMesaNome);
      setNovaMesaNome("");
      await refreshMesas();
      await handleSelectMesa(mesa.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar mesa.");
    }
  }

  async function handleSelectMesa(id: string) {
    setSelectedCampaignId(id);
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(id));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleAddLog() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId: selectedCampaignId,
        type: "chat",
        visibility: visibilidade,
        payload: { mensagem: mensagemInput.trim() || "(mensagem de teste vazia)" },
      });
      setMensagemInput("");
      setLogs(await listLogs(selectedCampaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao registrar log.");
    }
  }

  const mesaAtual = mesas.find((m) => m.id === selectedCampaignId);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 16 }}>
        /dev/table — base mínima de Mesa/Log persistente. Sem chat real, sem realtime, sem
        autenticação. Visibilidade ("Pública"/"Privada"/"Mestre") é só um campo de dados nesta
        etapa — não há filtro de RLS por enquanto (ver migration 0003).
      </p>

      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {errorMessage}</p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
          Criar mesa
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="nova-mesa-nome"
            type="text"
            value={novaMesaNome}
            onChange={(e) => setNovaMesaNome(e.target.value)}
            placeholder="Nome da mesa"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button data-testid="criar-mesa-button" onClick={handleCreateMesa} style={buttonStyle}>
            Criar mesa
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
          Mesas ({mesas.length})
        </h2>
        {mesas.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma mesa criada ainda.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mesas.map((mesa) => (
            <div
              key={mesa.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: mesa.id === selectedCampaignId ? "#26283280" : "#1d1e24",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{mesa.name}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>{mesa.id}</div>
              </div>
              <button data-testid={`selecionar-mesa-${mesa.id}`} onClick={() => handleSelectMesa(mesa.id)} style={buttonStyle}>
                {mesa.id === selectedCampaignId ? "Selecionada" : "Selecionar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedCampaignId && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Adicionar mensagem de teste — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                data-testid="mensagem-teste-input"
                type="text"
                value={mensagemInput}
                onChange={(e) => setMensagemInput(e.target.value)}
                placeholder="Mensagem de teste"
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <select
                data-testid="mensagem-visibilidade-select"
                value={visibilidade}
                onChange={(e) => setVisibilidade(e.target.value as TableLogVisibility)}
                style={inputStyle}
              >
                {TABLE_LOG_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
              <button data-testid="adicionar-log-button" onClick={handleAddLog} style={buttonStyle}>
                Adicionar ao log
              </button>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Log da mesa ({logs.length})
            </h2>
            {loadingLogs && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingLogs && logs.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
            )}
            <div data-testid="logs-lista" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  data-testid="log-entry"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    background: "#1d1e24",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace" }}>
                    {new Date(entry.created_at).toLocaleString("pt-BR")}
                  </span>
                  <span data-testid="log-entry-visibility" style={{ fontSize: 11, opacity: 0.6, minWidth: 70 }}>
                    [{VISIBILITY_LABELS[entry.visibility]}]
                  </span>
                  <span data-testid="log-entry-type" style={{ fontSize: 11, opacity: 0.6 }}>
                    {entry.type}:
                  </span>
                  <span data-testid="log-entry-mensagem">
                    {typeof entry.payload.mensagem === "string" ? entry.payload.mensagem : JSON.stringify(entry.payload)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
