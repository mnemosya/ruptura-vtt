"use client";

/**
 * Log da mesa — seção compartilhada por narrador e jogador (Fase 3,
 * divisão do antigo MesaDetailClient.tsx monolítico). A filtragem por
 * visibilidade já acontece no servidor (`listLogsForViewer`,
 * src/lib/table/storage.ts) antes destes dados chegarem aqui — este
 * componente só formata e exibe o que já veio autorizado.
 *
 * Reaproveita `formatTableLogEntry` (src/app/dev/character-sheet/
 * components/MesaTab.tsx), o formatador único já usado pela ficha —
 * não duplica a lógica de formatação por tipo de evento.
 */
import type { TableLogEntry } from "../../../../lib/table";
import { formatTableLogEntry } from "../../../dev/character-sheet/components/MesaTab";
import { btnGhost, card, text } from "../_shell/theme";

export function TableLogSection({
  logs,
  isNarrator,
  onReload,
}: {
  logs: TableLogEntry[];
  isNarrator: boolean;
  onReload: () => void | Promise<void>;
}) {
  return (
    <section aria-labelledby="mesa-log-heading">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 id="mesa-log-heading" style={text.h2}>Log da mesa ({logs.length})</h2>
        <button data-testid="det-atualizar-log" onClick={() => onReload()} className="rv-btn rv-focusable" style={btnGhost}>
          Atualizar
        </button>
      </div>
      <p style={{ ...text.faint, marginBottom: 12 }}>
        {isNarrator ? "Como narrador, você vê tudo (público, privado e de narrador)." : "Você vê os eventos públicos e os seus próprios."}
      </p>
      {logs.length === 0 ? (
        <p style={{ ...text.muted }}>Nenhum evento registrado ainda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.map((entry) => (
            <div key={entry.id} data-testid="det-log" style={{ ...card, fontSize: 12 }}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>[{entry.visibility}] {entry.type}</span>{" "}
              {formatTableLogEntry(entry)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
