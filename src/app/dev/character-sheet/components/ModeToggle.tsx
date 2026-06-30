export const SHEET_MODES = ["jogo", "evolucao"] as const;
export type SheetMode = (typeof SHEET_MODES)[number];

const SHEET_MODE_LABELS: Record<SheetMode, string> = {
  jogo: "Modo Jogo",
  evolucao: "Modo Evolução",
};

/**
 * Seletor de modo da ficha — Jogo (visão padrão de sessão) vs Evolução
 * (alterações permanentes deliberadas). Puramente estado de UI local,
 * não vai para o payload salvo (ver CharacterSheetClient).
 */
export function ModeToggle({ mode, onChange }: { mode: SheetMode; onChange: (mode: SheetMode) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {SHEET_MODES.map((m) => (
        <button
          key={m}
          data-testid={`mode-${m}`}
          onClick={() => onChange(m)}
          style={{
            background: mode === m ? "#2d4a2f" : "#1d1e24",
            color: "inherit",
            border: mode === m ? "1px solid #4caf50" : "1px solid #333",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: mode === m ? 700 : 400,
            cursor: "pointer",
          }}
        >
          {SHEET_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
