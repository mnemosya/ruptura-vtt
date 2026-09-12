"use client";

/**
 * Aba "Mesa" da ficha — chat mínimo + log persistente da mesa
 * selecionada (table_logs). Atualiza automaticamente via Supabase
 * Realtime (checkpoint v0.46, `useTableLogsRealtime`) quando a mesa
 * ganha um novo log; o botão "Atualizar logs" continua funcionando
 * como refetch manual (útil se Realtime estiver indisponível). Não
 * substitui o Log local (aba "Log"), que continua sendo o histórico
 * volátil desta sessão de ficha.
 *
 * Segue o padrão do RollsTab: é um Client Component com estado próprio
 * (logs/filtro/input) que chama Server Actions diretamente
 * (listLogsForViewer/addLog), em vez de receber tudo via props do
 * CharacterSheetClient. IMPORTANTE (v0.20): usa listLogsForViewer, NÃO
 * listLogs — este componente é usado tanto por /ficha (jogador) quanto
 * por /dev/character-sheet, então a leitura já sai filtrada por
 * visibilidade no servidor (nunca listLogs cru, que não filtra nada).
 *
 * O FORMATADOR de log não mora mais aqui: `formatTableLogEntry` e os
 * ~40 formatadores por tipo foram para `src/lib/table/logPresentation.ts`
 * quando o painel da Mesa virou o terceiro consumidor de produção (os
 * outros dois: `SessionPanel` da casca e `scripts/test-realtime-minimal.ts`).
 * Nenhuma regra mudou. O reexport abaixo mantém importações antigas
 * (`from ".../MesaTab"`) funcionando.
 */

import { useEffect, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import { addLog, listLogsForViewer } from "../../../../lib/table/storage";
import { listCrewInventory, type CrewInventoryItem } from "../../../../lib/table/crewInventory";
import { useTableLogsRealtime } from "../../../../lib/realtime/useTableLogsRealtime";
import { describeRealtimeStatus } from "../../../../lib/realtime/tableRealtime";
import { TABLE_LOG_VISIBILITIES, type TableLogEntry, type TableLogVisibility } from "../../../../lib/table";
import {
  VISIBILITY_LABELS,
  VISIBILITY_FILTERS,
  VISIBILITY_FILTER_LABELS,
  chatAuthor,
  chatText,
  entryBorderColor,
  entryIcon,
  entryKindLabel,
  formatTableLogEntry,
  type VisibilityFilter,
} from "../../../../lib/table/logPresentation";

/** Reexport de compatibilidade — a implementação vive em `lib/table/logPresentation.ts`. */
export { formatTableLogEntry };

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};


export function MesaTab({
  campaignId,
  mesaNome,
  characterId,
  characterNome,
}: {
  campaignId: string | null;
  mesaNome: string | null;
  characterId: string | null;
  characterNome: string;
}) {
  const [logs, setLogs] = useState<TableLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<VisibilityFilter>("todos");
  const [mensagemInput, setMensagemInput] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  // Só exibição ("Última atualização: HH:mm:ss") — nunca refeita a
  // partir do servidor, não interfere no filtro nem nos logs em si.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // Checkpoint pós-v0.94 (fase 6) — leitura do inventário do bando pelo
  // jogador (migration 0038 liberou SELECT para membro da campanha);
  // retirar/editar continua exclusivo do narrador em /dev/table.
  const [crewInventory, setCrewInventory] = useState<CrewInventoryItem[]>([]);
  const [crewInventoryError, setCrewInventoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setCrewInventory([]);
      return;
    }
    listCrewInventory(campaignId)
      .then((items) => {
        setCrewInventory(items);
        setCrewInventoryError(null);
      })
      .catch((err) => {
        setCrewInventory([]);
        setCrewInventoryError(err instanceof Error ? err.message : "Erro ao carregar inventário do bando.");
      });
  }, [campaignId]);

  async function refreshLogs() {
    if (!campaignId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      // Visibilidade REAL (v0.20): o servidor filtra por observador —
      // jogador vê public + private do próprio perfil, nunca gm; narrador
      // dono vê tudo. Não é mais só filtro visual.
      setLogs(await listLogsForViewer(campaignId));
      setLastUpdatedAt(new Date());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao carregar logs da mesa.");
    } finally {
      setLoading(false);
    }
  }

  // Carrega os logs ao abrir a aba com uma mesa selecionada, e recarrega
  // se a mesa mudar. `filtro` nunca é resetado aqui — só `logs` muda;
  // atualizações automáticas (Realtime, abaixo) e manuais (botão
  // "Atualizar logs") reusam este mesmo refetch, sempre substituindo a
  // lista inteira (nunca duplica: é sempre a leitura canônica do servidor).
  useEffect(() => {
    if (!campaignId) {
      setLogs([]);
      return;
    }
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Checkpoint v0.46 — Realtime mínimo: INSERT novo em table_logs desta
  // mesa agenda um refetch debounced de `refreshLogs` (mesmo refetch
  // canônico do botão "Atualizar logs", nunca patch parcial). Continua
  // funcionando manualmente (botão) se Realtime estiver indisponível.
  const syncStatus = useTableLogsRealtime(campaignId, refreshLogs);

  async function handleEnviar() {
    if (!campaignId) return;
    const text = mensagemInput.trim();
    if (!text) return;
    setErrorMessage(null);
    try {
      await addLog({
        campaignId,
        characterId: characterId ?? undefined,
        type: "chat",
        visibility: visibilidade,
        payload: {
          text,
          source: "character_sheet",
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

      <div data-testid="mesa-tab-inventario-bando" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 8 }}>
          Inventário do bando ({crewInventory.length})
        </p>
        {crewInventoryError && (
          <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>⚠ {crewInventoryError}</p>
        )}
        {!crewInventoryError && crewInventory.length === 0 && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum item no bando ainda.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {crewInventory.map((row) => (
            <span key={row.id} data-testid={`mesa-tab-bando-item-${row.id}`} style={{ fontSize: 12 }}>
              {row.itemName ?? row.payload.itemNome} × {row.quantity ?? row.payload.quantidade}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
          Retirar do bando é feito pelo narrador. Envie itens para o bando na aba Inventário.
        </p>
      </div>

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
          <strong>{characterNome?.trim() || "Mesa"}</strong>
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
        <span data-testid="ficha-mesa-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(syncStatus, "ficha").cor }}>
          ● {describeRealtimeStatus(syncStatus, "ficha").texto}
        </span>
        <span data-testid="mesa-auto-update-status" style={{ fontSize: 11, opacity: 0.55 }}>
          {syncStatus === "subscribed" ? "Atualização automática ligada" : "Atualização automática indisponível — use o botão"}
          {lastUpdatedAt && ` · Última atualização: ${lastUpdatedAt.toLocaleTimeString("pt-BR")}`}
        </span>
      </div>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
        Isolamento entre campanhas é real (RLS, migration 0043) — só membros desta mesa leem esta
        lista. O filtro Pública/Privada/Narrador abaixo continua só visual, aplicado no cliente
        sobre o campo de dados `visibility` (sem RLS por nível dentro da MESMA campanha).
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
              {entry.type === "chat" ? chatText(entry.payload) : formatTableLogEntry(entry)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
