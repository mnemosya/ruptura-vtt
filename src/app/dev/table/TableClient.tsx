"use client";

/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — não é a
 * interface final do VTT (sem chat real, sem realtime, sem
 * autenticação). Server Actions chamadas diretamente daqui, mesmo
 * padrão de CharacterSheetClient.
 */

import { useEffect, useState } from "react";
import {
  createCampaign,
  listCampaigns,
  addLog,
  listLogs,
  createCampaignProfile,
  listCampaignProfiles,
  setCampaignProfileLocked,
} from "../../../lib/table/storage";
import {
  TABLE_LOG_VISIBILITIES,
  type Campaign,
  type CampaignProfile,
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

function formatRolagem(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string") {
    if (payload.atributo) {
      const pericia = payload.pericia ? ` + ${payload.pericia}` : " (sem perícia)";
      return `${payload.characterNome}: ${payload.atributo}${pericia} = ${payload.total}`;
    }
    if (payload.expressao) {
      return `${payload.characterNome}: ${payload.expressao} = ${payload.total}`;
    }
  }
  return JSON.stringify(payload);
}

const ENTRY_KIND_LABELS: Record<string, string> = {
  chat: "Mensagem",
  rolagem_pericia: "Rolagem de Perícia",
  rolagem_expressao: "Rolagem de Expressão",
};

function entryKindLabel(type: string): string {
  return ENTRY_KIND_LABELS[type] ?? type;
}

function entryIcon(type: string): string {
  if (type === "chat") return "💬";
  if (type === "rolagem_pericia" || type === "rolagem_expressao") return "🎲";
  return "•";
}

const AUTO_REFRESH_INTERVAL_MS = 5000;

const VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  todos: "Todos",
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
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
  const [visibilidadeFiltro, setVisibilidadeFiltro] = useState<VisibilityFilter>("todos");
  const [autoAtualizar, setAutoAtualizar] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [perfis, setPerfis] = useState<CampaignProfile[]>([]);
  const [novoPerfilApelido, setNovoPerfilApelido] = useState("");
  const [loadingPerfis, setLoadingPerfis] = useState(false);

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
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs.");
    } finally {
      setLoadingLogs(false);
    }
    await handleRefreshPerfis(id);
  }

  async function handleRefreshPerfis(campaignId: string) {
    setLoadingPerfis(true);
    try {
      setPerfis(await listCampaignProfiles(campaignId));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoadingPerfis(false);
    }
  }

  async function handleCreatePerfil() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await createCampaignProfile(selectedCampaignId, novoPerfilApelido);
      setNovoPerfilApelido("");
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar perfil.");
    }
  }

  async function handleToggleLockPerfil(profile: CampaignProfile) {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    try {
      await setCampaignProfileLocked(profile.id, !profile.is_locked);
      await handleRefreshPerfis(selectedCampaignId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao bloquear/desbloquear perfil.");
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
        payload: { mensagem: mensagemInput.trim() || "(mensagem vazia)" },
      });
      setMensagemInput("");
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao registrar log.");
    }
  }

  async function handleRefreshLogs() {
    if (!selectedCampaignId) return;
    setErrorMessage(null);
    setLoadingLogs(true);
    try {
      setLogs(await listLogs(selectedCampaignId));
      setUltimaAtualizacao(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao atualizar logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  // Autoatualização: re-busca os logs da mesa selecionada a cada
  // AUTO_REFRESH_INTERVAL_MS, sem mexer no filtro de visibilidade (estado
  // separado, não tocado aqui) e sem indicador de "Carregando…" (evita
  // piscar a lista a cada 5s). setLogs substitui a lista inteira a partir
  // do servidor — não há append, então não há risco de duplicar entradas.
  useEffect(() => {
    if (!autoAtualizar || !selectedCampaignId) return;

    const intervalId = setInterval(async () => {
      try {
        const proximosLogs = await listLogs(selectedCampaignId);
        setLogs(proximosLogs);
        setUltimaAtualizacao(new Date());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido na autoatualização.");
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [autoAtualizar, selectedCampaignId]);

  const mesaAtual = mesas.find((m) => m.id === selectedCampaignId);
  const logsFiltrados =
    visibilidadeFiltro === "todos" ? logs : logs.filter((entry) => entry.visibility === visibilidadeFiltro);

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
              Perfis da mesa ({perfis.length}) — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              Perfil DEV: só apelido + bloqueio manual. Sem login, sem link de convite, sem
              heartbeat de presença — bloqueio aqui é só um indicador visual, sem enforcement real
              (ver migration 0004).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                data-testid="novo-perfil-apelido"
                type="text"
                value={novoPerfilApelido}
                onChange={(e) => setNovoPerfilApelido(e.target.value)}
                placeholder="Apelido do perfil"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button data-testid="criar-perfil-button" onClick={handleCreatePerfil} style={buttonStyle}>
                Criar perfil
              </button>
            </div>
            {loadingPerfis && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingPerfis && perfis.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum perfil criado ainda nesta mesa.</p>
            )}
            <div data-testid="perfis-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {perfis.map((perfil) => (
                <div
                  key={perfil.id}
                  data-testid="perfil-entry"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "#1d1e24",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span data-testid="perfil-apelido" style={{ fontWeight: 600 }}>
                      {perfil.nickname}
                    </span>
                    <span
                      data-testid="perfil-status"
                      style={{ marginLeft: 10, fontSize: 11, opacity: 0.7, color: perfil.is_locked ? "#ffb84f" : "#7fd99a" }}
                    >
                      {perfil.is_locked ? "Bloqueado" : "Livre"}
                    </span>
                  </div>
                  <button data-testid={`bloquear-perfil-${perfil.id}`} onClick={() => handleToggleLockPerfil(perfil)} style={buttonStyle}>
                    {perfil.is_locked ? "Desbloquear" : "Bloquear"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
              Enviar mensagem — {mesaAtual?.name ?? selectedCampaignId}
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                data-testid="mensagem-teste-input"
                type="text"
                value={mensagemInput}
                onChange={(e) => setMensagemInput(e.target.value)}
                placeholder="Mensagem"
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
                Enviar
              </button>
            </div>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6 }}>
                Log da mesa ({logsFiltrados.length}/{logs.length})
              </h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  data-testid="filtro-visibilidade-select"
                  value={visibilidadeFiltro}
                  onChange={(e) => setVisibilidadeFiltro(e.target.value as VisibilityFilter)}
                  style={inputStyle}
                >
                  {VISIBILITY_FILTERS.map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_FILTER_LABELS[v]}
                    </option>
                  ))}
                </select>
                <button data-testid="atualizar-logs-button" onClick={handleRefreshLogs} style={buttonStyle}>
                  Atualizar logs
                </button>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    data-testid="auto-atualizar-toggle"
                    type="checkbox"
                    checked={autoAtualizar}
                    onChange={(e) => setAutoAtualizar(e.target.checked)}
                  />
                  Autoatualizar
                </label>
              </div>
            </div>
            <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              Filtro visual apenas; ainda sem segurança real.
            </p>
            <p data-testid="auto-atualizar-status" style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
              {autoAtualizar ? "Autoatualização ligada" : "Autoatualização desligada"}
              {ultimaAtualizacao && ` — Última atualização: ${ultimaAtualizacao.toLocaleTimeString("pt-BR")}`}
            </p>
            {loadingLogs && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
            {!loadingLogs && logs.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
            )}
            {!loadingLogs && logs.length > 0 && logsFiltrados.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log com essa visibilidade.</p>
            )}
            <div data-testid="logs-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logsFiltrados.map((entry) => {
                const isChat = entry.type === "chat";
                const isRolagem = entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao";
                const conteudo = isChat && typeof entry.payload.mensagem === "string"
                  ? entry.payload.mensagem
                  : isRolagem
                    ? formatRolagem(entry.payload)
                    : JSON.stringify(entry.payload);

                return (
                  <div
                    key={entry.id}
                    data-testid="log-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      background: "#1d1e24",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      borderLeft: `3px solid ${isChat ? "#4f8cff" : "#ffb84f"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6 }}>
                      <span aria-hidden="true">{entryIcon(entry.type)}</span>
                      <span data-testid="log-entry-type">{entryKindLabel(entry.type)}</span>
                      <span data-testid="log-entry-visibility">[{VISIBILITY_LABELS[entry.visibility]}]</span>
                      <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                        {new Date(entry.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <span data-testid="log-entry-mensagem">{conteudo}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
