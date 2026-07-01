"use client";

/**
 * Aba "Mesa" da ficha — chat mínimo + log persistente da mesa
 * selecionada (table_logs), sem realtime (só atualização manual via
 * botão). Não substitui o Log local (aba "Log"), que continua sendo o
 * histórico volátil desta sessão de ficha.
 *
 * Segue o padrão do RollsTab: é um Client Component com estado próprio
 * (logs/filtro/input) que chama Server Actions diretamente
 * (listLogsForViewer/addLog), em vez de receber tudo via props do
 * CharacterSheetClient. IMPORTANTE (v0.20): usa listLogsForViewer, NÃO
 * listLogs — este componente é usado tanto por /ficha (jogador) quanto
 * por /dev/character-sheet, então a leitura já sai filtrada por
 * visibilidade no servidor (nunca listLogs cru, que não filtra nada).
 */

import { useEffect, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { addLog, listLogsForViewer } from "../../../../lib/table/storage";
import { TABLE_LOG_VISIBILITIES, type TableLogEntry, type TableLogVisibility } from "../../../../lib/table";

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
  gm: "Narrador",
};

const VISIBILITY_FILTERS = ["todos", ...TABLE_LOG_VISIBILITIES] as const;
type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  todos: "Todos",
  public: "Pública",
  private: "Privada",
  gm: "Narrador",
};

const ENTRY_KIND_LABELS: Record<string, string> = {
  chat: "Mensagem",
  rolagem_pericia: "Rolagem de Perícia",
  rolagem_expressao: "Rolagem de Expressão",
  profile_event: "Evento de Perfil",
};

function entryKindLabel(type: string): string {
  return ENTRY_KIND_LABELS[type] ?? type;
}

function entryIcon(type: string): string {
  if (type === "chat") return "💬";
  if (type === "rolagem_pericia" || type === "rolagem_expressao") return "🎲";
  if (type === "profile_event") return "🔑";
  return "•";
}

function entryBorderColor(type: string): string {
  if (type === "chat") return "#4f8cff";
  if (type === "profile_event") return "#ff6b9f";
  return "#ffb84f";
}

/** Texto da mensagem de chat — aceita `text` (ficha, v0.12) ou `mensagem` (formato antigo do /dev/table). */
function chatText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.mensagem === "string") return payload.mensagem;
  return JSON.stringify(payload);
}

/**
 * Autor preferencial de uma mensagem de chat: personagem > perfil >
 * "Mesa". Usa os campos que a ficha grava no payload (characterNome /
 * profileNickname); mensagens antigas sem esses campos caem em "Mesa".
 */
function chatAuthor(payload: Record<string, unknown>): string {
  if (typeof payload.characterNome === "string" && payload.characterNome.trim()) return payload.characterNome;
  if (typeof payload.profileNickname === "string" && payload.profileNickname.trim()) return payload.profileNickname;
  return "Mesa";
}

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

function formatProfileEvent(payload: Record<string, unknown>): string {
  const nickname = typeof payload.profileNickname === "string" ? payload.profileNickname : "perfil desconhecido";
  if (payload.evento === "enter") return `${nickname}: entrou no perfil`;
  if (payload.evento === "leave") return `${nickname}: saiu do perfil`;
  if (payload.evento === "heartbeat_expirado") return `${nickname}: heartbeat expirado (perfil perdido)`;
  return JSON.stringify(payload);
}

export function MesaTab({
  campaignId,
  mesaNome,
  profileId,
  profileNickname,
  characterId,
  characterNome,
  profileSessionId,
}: {
  campaignId: string | null;
  mesaNome: string | null;
  profileId: string | null;
  profileNickname: string | null;
  characterId: string | null;
  characterNome: string;
  /** sessionId do navegador (checkpoint v0.24) — anotado em table_logs.profile_session_id. */
  profileSessionId?: string | null;
}) {
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<VisibilityFilter>("todos");
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");

  async function refreshLogs() {
    if (!campaignId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      // Visibilidade REAL (v0.20): o servidor filtra por observador —
      // jogador vê public + private do próprio perfil, nunca gm; narrador
      // dono vê tudo. Não é mais só filtro visual.
      setLogs(await listLogsForViewer(campaignId, { profileId }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs da mesa.");
    } finally {
      setLoading(false);
    }
  }

  // Carrega os logs ao abrir a aba com uma mesa selecionada, e recarrega
  // se a mesa mudar. Sem realtime — atualizações posteriores são manuais
  // (botão "Atualizar logs") ou automáticas só uma vez após enviar.
  useEffect(() => {
    if (!campaignId) {
      setLogs([]);
      return;
    }
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function handleEnviar() {
    if (!campaignId) return;
    const text = mensagemInput.trim();
    if (!text) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId,
        characterId: characterId ?? undefined,
        profileId,
        profileSessionId,
        type: "chat",
        visibility: visibilidade,
        payload: {
          text,
          source: "character_sheet",
          profileId,
          profileNickname,
          characterId,
          characterNome,
        },
      });
      setMensagemInput("");
      await refreshLogs();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao enviar mensagem.");
    }
  }

  if (!campaignId) {
    return (
      <Section title="Mesa">
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          Nenhuma mesa selecionada — escolha uma mesa na aba Geral para ver e enviar mensagens ao
          log persistente da mesa.
        </p>
      </Section>
    );
  }

  const logsFiltrados = filtro === "todos" ? logs : logs.filter((entry) => entry.visibility === filtro);
  const podeEnviar = mensagemInput.trim().length > 0;

  return (
    <Section title={`Mesa — ${mesaNome ?? campaignId}`}>
      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12 }}>Erro: {errorMessage}</p>
      )}

      {/* --- Área de envio --- */}
      <div
        style={{
          background: "#15161b",
          border: "1px solid #2a2b33",
          borderRadius: 8,
          padding: 12,
          marginBottom: 20,
        }}
      >
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
          Enviar mensagem como{" "}
          <strong>{characterNome?.trim() || profileNickname || "Mesa"}</strong>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            data-testid="mesa-mensagem-input"
            type="text"
            value={mensagemInput}
            onChange={(e) => setMensagemInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && podeEnviar) handleEnviar();
            }}
            placeholder="Mensagem para a mesa"
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <select
            data-testid="mesa-visibilidade-select"
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
          <button
            data-testid="mesa-enviar-button"
            onClick={handleEnviar}
            disabled={!podeEnviar}
            style={{ ...buttonStyle, opacity: podeEnviar ? 1 : 0.5, cursor: podeEnviar ? "pointer" : "not-allowed" }}
          >
            Enviar
          </button>
        </div>
      </div>

      {/* --- Lista de mensagens/eventos --- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          Log da mesa ({logsFiltrados.length}/{logs.length})
        </span>
        <select
          data-testid="mesa-filtro-select"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as VisibilityFilter)}
          style={inputStyle}
        >
          {VISIBILITY_FILTERS.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_FILTER_LABELS[v]}
            </option>
          ))}
        </select>
        <button data-testid="mesa-atualizar-button" onClick={refreshLogs} style={buttonStyle}>
          Atualizar logs
        </button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
        Filtro visual apenas; ainda sem segurança real (visibilidade é só um campo de dados, ver
        migration 0003).
      </p>

      {loading && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>}
      {!loading && logs.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log ainda nesta mesa.</p>
      )}
      {!loading && logs.length > 0 && logsFiltrados.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum log com essa visibilidade.</p>
      )}

      <div data-testid="mesa-logs-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logsFiltrados.map((entry) => (
          <div
            key={entry.id}
            data-testid="mesa-log-entry"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: "#1d1e24",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              borderLeft: `3px solid ${entryBorderColor(entry.type)}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.6 }}>
              <span aria-hidden="true">{entryIcon(entry.type)}</span>
              {entry.type === "chat" ? (
                <span data-testid="mesa-log-entry-autor" style={{ fontWeight: 700 }}>
                  {chatAuthor(entry.payload)}
                </span>
              ) : (
                <span data-testid="mesa-log-entry-type">{entryKindLabel(entry.type)}</span>
              )}
              <span data-testid="mesa-log-entry-visibility">[{VISIBILITY_LABELS[entry.visibility]}]</span>
              <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                {new Date(entry.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            <span data-testid="mesa-log-entry-conteudo">
              {entry.type === "chat"
                ? chatText(entry.payload)
                : entry.type === "rolagem_pericia" || entry.type === "rolagem_expressao"
                  ? formatRolagem(entry.payload)
                  : entry.type === "profile_event"
                    ? formatProfileEvent(entry.payload)
                    : JSON.stringify(entry.payload)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
