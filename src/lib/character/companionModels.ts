/**
 * Catálogo de modelos de drone/robô (checkpoint "Catálogo oficial de
 * drones e robôs consumido pela ficha" — `content_type: "companion_model"`,
 * fonte: `docs/fontes/DRONES E ROBÔS....md`). Normaliza o payload bruto
 * (`ConteudoEfetivo.payload`, vindo de `listCompanionModelsEffective`) só
 * para o subconjunto que a ficha usa para PREENCHER o registro de
 * drone/robô (`registerDrone`/`registerRobo`) — nunca um executor de
 * ações; a execução bespoke em `talentEngine.ts` não muda.
 */

export interface CompanionModelAcao {
  nome: string;
  /** Ausente para ações do tipo Reação (a fonte não define custo de PA para elas — nunca inventado). */
  custoPA?: number;
  descricao: string;
}

export interface CompanionModelSummary {
  slug: string;
  nome: string;
  categoria: "drone" | "robo";
  /** Só existe para robôs — drones não têm PA próprio na fonte (ausente, nunca inventado como 0). */
  paMaximo?: number;
  acoes: CompanionModelAcao[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function normalizeCompanionModel(raw: Record<string, unknown>): CompanionModelSummary {
  const slug = String(raw.slug ?? raw.id ?? "");
  const categoria = raw.categoria === "robo" ? "robo" : "drone";
  const acoesBrutas = Array.isArray(raw.acoes) ? raw.acoes : [];
  const acoes: CompanionModelAcao[] = acoesBrutas
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      nome: typeof item.nome === "string" ? item.nome : "Ação",
      custoPA: typeof item.custoPA === "number" ? item.custoPA : undefined,
      descricao: typeof item.descricao === "string" ? item.descricao : "",
    }));

  return {
    slug,
    nome: typeof raw.nome === "string" && raw.nome.trim() !== "" ? raw.nome : slug || "Modelo sem nome",
    categoria,
    paMaximo: typeof raw.pa_maximo === "number" ? raw.pa_maximo : undefined,
    acoes,
  };
}

/** Formata as ações do modelo para o campo de texto livre editável de acões da instância. */
export function formatCompanionModelAcoesText(acoes: CompanionModelAcao[]): string {
  return acoes
    .map((a) => `${a.nome}${a.custoPA != null ? ` (${a.custoPA} PA)` : ""}: ${a.descricao}`)
    .join("; ");
}
