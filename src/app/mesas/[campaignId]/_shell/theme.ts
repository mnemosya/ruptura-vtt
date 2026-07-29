/**
 * Tokens visuais mínimos compartilhados pela navegação e páginas da
 * campanha (Fase 3/4 — aditivo §13.6 "sistema visual consistente,
 * ainda que simples"). Mesma paleta escura já usada no resto do
 * projeto (ver estilos inline em MesaDetailClient.tsx/globals.css) —
 * não é um design system novo, é a mesma linguagem visual nomeada e
 * reaproveitada, para não divergir cor a cor entre arquivos.
 */
import type { CSSProperties } from "react";

export const color = {
  bg: "#0f1014",
  surface: "#1d1e24",
  surfaceRaised: "#22242c",
  border: "#333",
  borderSubtle: "#2a2b32",
  text: "#e8e8ec",
  textMuted: "rgba(232,232,236,0.7)",
  textFaint: "rgba(232,232,236,0.5)",
  accent: "#5ec8ff",
  success: "#7fd99a",
  successBg: "#15301a",
  successBorder: "#2a5a35",
  warning: "#e0b95c",
  warningBg: "#2a2a15",
  warningBorder: "#5a5a2a",
  danger: "#ff6b6b",
  dangerBg: "#2a1a1a",
  dangerBorder: "#5a2a2a",
  narratorBadgeBg: "#3a2a1a",
  narratorBadgeBorder: "#6a4a2a",
  narratorBadgeText: "#e0b95c",
  playerBadgeBg: "#1a2a3a",
  playerBadgeBorder: "#2a4a6a",
  playerBadgeText: "#5ec8ff",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 32 };

export const text = {
  h1: { fontSize: 22, fontWeight: 700, margin: 0 } as CSSProperties,
  h2: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.6,
    fontWeight: 600,
    margin: 0,
  } as CSSProperties,
  body: { fontSize: 13, color: color.text } as CSSProperties,
  muted: { fontSize: 12, color: color.textMuted } as CSSProperties,
  faint: { fontSize: 11, color: color.textFaint } as CSSProperties,
};

export const card: CSSProperties = {
  background: color.surface,
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 13,
  border: `1px solid ${color.borderSubtle}`,
};

export const btnBase: CSSProperties = {
  background: color.surface,
  color: "inherit",
  border: `1px solid ${color.border}`,
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export const btnPrimary: CSSProperties = {
  ...btnBase,
  background: "#1d3a1e",
  border: "1px solid #2a5a2a",
};

export const btnDanger: CSSProperties = {
  ...btnBase,
  background: "#2a1a1a",
  border: `1px solid ${color.dangerBorder}`,
  color: "#ffb3b3",
};

export const btnGhost: CSSProperties = {
  ...btnBase,
  background: "transparent",
};

export const input: CSSProperties = {
  background: color.bg,
  color: "inherit",
  border: `1px solid ${color.border}`,
  borderRadius: 4,
  padding: "7px 10px",
  fontSize: 13,
};

export const badge = (kind: "narrator" | "player"): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 8px",
  borderRadius: 999,
  background: kind === "narrator" ? color.narratorBadgeBg : color.playerBadgeBg,
  border: `1px solid ${kind === "narrator" ? color.narratorBadgeBorder : color.playerBadgeBorder}`,
  color: kind === "narrator" ? color.narratorBadgeText : color.playerBadgeText,
});

export const pageContainer = (maxWidth = 1040): CSSProperties => ({
  maxWidth,
  margin: "0 auto",
  padding: "24px 20px 80px",
});

export const emptyState: CSSProperties = {
  ...card,
  textAlign: "center",
  padding: "32px 20px",
  color: color.textMuted,
};

export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
