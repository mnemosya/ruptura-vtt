import type { ReactNode } from "react";
import { Chevron, Check, DoubleCheck, Cross, Half, Warn } from "../lib/icons";

/* ------------------------------------------------------------------ */
/*  Accent system — used sparingly: one accent per card                */
/* ------------------------------------------------------------------ */

export type Accent = { key: string; hex: string; soft: string };

export const ACCENTS: Record<string, Accent> = {
  cyan: { key: "cyan", hex: "#45b8c9", soft: "rgba(69,184,201,0.09)" },
  amber: { key: "amber", hex: "#cf9a3e", soft: "rgba(207,154,62,0.09)" },
  danger: { key: "danger", hex: "#d15068", soft: "rgba(209,80,104,0.09)" },
  magenta: { key: "magenta", hex: "#c25a8c", soft: "rgba(194,90,140,0.09)" },
  arcane: { key: "arcane", hex: "#8878d6", soft: "rgba(136,120,214,0.09)" },
  good: { key: "good", hex: "#4fae82", soft: "rgba(79,174,130,0.09)" },
  slate: { key: "slate", hex: "#6f83a3", soft: "rgba(111,131,163,0.07)" },
};

export const VERTENTES: Record<string, Accent> = {
  Cinética: ACCENTS.cyan,
  Energética: ACCENTS.amber,
  Material: ACCENTS.slate,
  Biótica: ACCENTS.good,
  Sináptica: ACCENTS.magenta,
  Cognitiva: ACCENTS.arcane,
};

/* ------------------------------------------------------------------ */
/*  Labels & badges — quiet by default                                 */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </div>
  );
}

export function Badge({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: Accent;
}) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-[2px] font-display text-[9.5px] font-500 uppercase tracking-[0.1em] leading-none"
      style={{
        color: accent ? accent.hex : "#8496b4",
        border: "1px solid #1a2740",
        borderRadius: "2px",
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Buttons — flat, matte                                              */
/* ------------------------------------------------------------------ */

export function CommandButton({
  children,
  accent = ACCENTS.cyan,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  accent?: Accent;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-2 rounded-[2px] px-3 py-2 font-display text-[11px] font-600 uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed"
      style={{
        color: disabled ? "#4a5a78" : accent.hex,
        background: disabled ? "transparent" : accent.soft,
        border: `1px solid ${disabled ? "#182338" : accent.hex + "77"}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = accent.hex;
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = accent.hex + "77";
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-[2px] px-3 py-2 font-display text-[10px] font-500 uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Result strip                                                       */
/* ------------------------------------------------------------------ */

export type ResultKey = "critico" | "padrao" | "limitado" | "falha-limitada" | "falha";

export const RESULTS: Record<
  ResultKey,
  { label: string; accent: Accent; Icon: typeof Check }
> = {
  critico: { label: "Sucesso Crítico", accent: ACCENTS.cyan, Icon: DoubleCheck },
  padrao: { label: "Sucesso Padrão", accent: ACCENTS.good, Icon: Check },
  limitado: { label: "Sucesso Limitado", accent: ACCENTS.amber, Icon: Half },
  "falha-limitada": { label: "Falha Limitada", accent: ACCENTS.magenta, Icon: Warn },
  falha: { label: "Falha", accent: ACCENTS.danger, Icon: Cross },
};

export function ResultStrip({
  result,
  detail,
  roll,
}: {
  result: ResultKey;
  detail?: string;
  roll?: string;
}) {
  const r = RESULTS[result];
  const Icon = r.Icon;
  return (
    <div
      className="flex items-center gap-2.5 rounded-[2px] px-2.5 py-2"
      style={{ background: r.accent.soft, borderLeft: `2px solid ${r.accent.hex}` }}
    >
      <Icon width={15} height={15} style={{ color: r.accent.hex, flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div
          className="font-display text-[12px] font-600 uppercase tracking-[0.1em] leading-none"
          style={{ color: r.accent.hex }}
        >
          {r.label}
        </div>
        {detail && (
          <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-dim">
            {detail}
          </div>
        )}
      </div>
      {roll && (
        <span className="font-mono text-[15px] font-700" style={{ color: r.accent.hex }}>
          {roll}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat grid — clean, thin dividers, no per-cell decoration           */
/* ------------------------------------------------------------------ */

export function StatCell({
  label,
  value,
  sub,
  accent = ACCENTS.cyan,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: Accent;
}) {
  return (
    <div className="px-2.5 py-2">
      <div className="font-display text-[8.5px] font-500 uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[15px] font-700 leading-none" style={{ color: accent.hex }}>
        {value}
        {sub && <span className="ml-1 text-[9px] font-400 text-ink-faint">{sub}</span>}
      </div>
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid overflow-hidden rounded-[2px]"
      style={{
        gridAutoFlow: "column",
        gridAutoColumns: "1fr",
        gap: "1px",
        background: "#16223a",
        border: "1px solid #16223a",
      }}
    >
      {[...(Array.isArray(children) ? children : [children])].map((c, i) => (
        <div key={i} style={{ background: "#0c1420" }}>
          {c}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Duration & meta                                                    */
/* ------------------------------------------------------------------ */

export function DurationPill({
  children,
  expired = false,
  accent = ACCENTS.cyan,
}: {
  children: ReactNode;
  expired?: boolean;
  accent?: Accent;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em]"
      style={{ color: expired ? "#4a5a78" : accent.hex }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: expired ? "#4a5a78" : accent.hex }}
      />
      {children}
    </span>
  );
}

export function MetaLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <span className="w-[64px] shrink-0 font-display text-[8.5px] font-500 uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      <span className="text-[11.5px] text-ink-dim">{children}</span>
    </div>
  );
}

export { Chevron };
