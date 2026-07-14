import type { ModoAutomacao } from "../../../lib/contentSchema";
import type { ClassificacaoLegado } from "../../../lib/contentSchema";

export const MODO_AUTOMACAO_LABEL: Record<ModoAutomacao, string> = {
  automatico: "Automático",
  assistido: "Assistido",
  lembrete: "Lembrete",
  narrativo_rastreado: "Narrativo rastreado",
  sem_executor: "Sem executor",
};

/** Marcador textual (não só cor) — cada modo tem um símbolo distinto. */
export const MODO_AUTOMACAO_SIMBOLO: Record<ModoAutomacao, string> = {
  automatico: "✓",
  assistido: "◐",
  lembrete: "✎",
  narrativo_rastreado: "▶",
  sem_executor: "✕",
};

export const MODO_AUTOMACAO_COR: Record<ModoAutomacao, string> = {
  automatico: "#7fd39a",
  assistido: "#e0c56b",
  lembrete: "#8fb3e0",
  narrativo_rastreado: "#c79ee0",
  sem_executor: "#e08a8a",
};

export const CLASSIFICACAO_LEGADO_LABEL: Record<ClassificacaoLegado, string> = {
  conversao_direta: "Conversão direta",
  conversao_com_confirmacao: "Conversão com confirmação",
  somente_leitura: "Somente leitura (adapter genérico)",
  incompativel: "Incompatível",
  invalido: "Inválido",
};

/** Formata qualquer valor de payload canônico como texto de uma linha — nunca JSON.stringify no fluxo principal. */
export function formatarValor(valor: unknown): string {
  if (valor == null) return "—";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (Array.isArray(valor)) {
    const partes = valor.map((v) => formatarValor(v)).filter((v) => v !== "—");
    return partes.length > 0 ? partes.join(", ") : "—";
  }
  if (typeof valor === "object") {
    const rec = valor as Record<string, unknown>;
    if ("tipoConteudo" in rec && "slug" in rec) {
      return `${String(rec.papel ?? "referência")} → ${String(rec.tipoConteudo)}:${String(rec.slug)}`;
    }
    const partes = Object.entries(rec)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${formatarValor(v)}`);
    return partes.length > 0 ? partes.join(" — ") : "—";
  }
  return String(valor);
}
