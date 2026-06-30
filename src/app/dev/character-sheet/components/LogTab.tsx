import { Section } from "./Section";
import { buttonStyle } from "./styles";

/**
 * Log local mínimo da ficha — sem chat, sem persistência no Supabase.
 * Estado vive em CharacterSheetClient (precisa ser alimentado por
 * eventos de mais de uma aba: rolagens vêm de RollsTab, mudanças de
 * recursos/PA/Reações vêm dos handlers do próprio CharacterSheetClient).
 */

export const LOG_TIPOS = ["rolagem_pericia", "rolagem_expressao", "recurso", "pa", "reacao"] as const;
export type LogTipo = (typeof LOG_TIPOS)[number];

export interface LogEntry {
  id: string;
  /** Horário local formatado (toLocaleTimeString) — não é timestamp ISO bruto, é só exibição. */
  horario: string;
  tipo: LogTipo;
  resumo: string;
}

const LOG_TIPO_LABELS: Record<LogTipo, string> = {
  rolagem_pericia: "Rolagem de perícia",
  rolagem_expressao: "Rolagem de expressão",
  recurso: "Recurso",
  pa: "PA",
  reacao: "Reação",
};

const LOG_TIPO_CORES: Record<LogTipo, string> = {
  rolagem_pericia: "#5ec8ff",
  rolagem_expressao: "#9b8cff",
  recurso: "#4caf50",
  pa: "#f5a623",
  reacao: "#f5a623",
};

const LOG_MAX = 50;

export function LogTab({ log, onClear }: { log: LogEntry[]; onClear: () => void }) {
  return (
    <Section title={`Log (${log.length}/${LOG_MAX})`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
        Log local desta sessão — não é salvo no Supabase, não é chat, não é compartilhado com
        ninguém. Recarregar a página ou trocar de personagem o esvazia.
      </p>
      <button onClick={onClear} style={{ ...buttonStyle, marginBottom: 12 }}>
        Limpar log
      </button>
      {log.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum evento registrado ainda.</p>}
      <div data-testid="log-lista" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {log.map((entry) => (
          <div
            key={entry.id}
            data-testid="log-item"
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
            <span style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace", minWidth: 64 }}>{entry.horario}</span>
            <span
              data-testid="log-item-tipo"
              style={{ fontSize: 11, color: LOG_TIPO_CORES[entry.tipo], fontWeight: 700, minWidth: 130 }}
            >
              {LOG_TIPO_LABELS[entry.tipo]}
            </span>
            <span data-testid="log-item-resumo">{entry.resumo}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
