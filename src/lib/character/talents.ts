/**
 * Talentos: automação por padrão — checkpoint v0.48 (PRD 12).
 *
 * O catálogo inteiro de talentos (22 talentos publicados, ~60 níveis,
 * PRD 12.2) NUNCA é listado manualmente aqui — vem de
 * `content_documents` (content_type="talent", `listTalents()`,
 * `db_talentos_normalizado_v1_3.json`). Este módulo só interpreta,
 * genericamente, o ÚNICO padrão reutilizável (PRD 12.1) seguro de
 * automatizar sem inventar regra: "+X em testes específicos"
 * (`payload_automacao.efeitos[].tipo === "modificador"`, com
 * `alvo_tags`) — mesmo mecanismo de `ActiveEffect` já usado por
 * condições (v0.33) e defesa sem Reação (v0.43), plugado direto no
 * mesmo prompt de rolagem (`RollsTab`), sem duplicar infraestrutura.
 *
 * Os outros 13 padrões do PRD 12.1 (promoção de margem, piso/override,
 * dado extra com gatilho, buff empilhável, reação grátis, redução de
 * PA, aplicar condição em margem menor, contadores por cadência,
 * companheiro, trama, economia/loja, runas, troca de atributo) NÃO são
 * automatizados aqui — são narrativamente variados demais para uma
 * regra genérica seguro sem inventar mecânica; ficam como
 * `pendingEffects` textuais (mesmo critério de `actionConsole.ts`) e
 * documentados no relatório.
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character } from "./types";

// ---------------------------------------------------------------------
// Conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface TalentLevelEffect {
  familia?: string;
  tipo: string;
  [key: string]: unknown;
}

export interface TalentLevelContent {
  id: string;
  slug: string;
  talentoId: string;
  nivel: number;
  nome: string;
  descricao_curta?: string;
  payload_automacao?: unknown;
  requisitos?: unknown;
}

export interface TalentContent {
  id: string;
  slug: string;
  nome: string;
  descricao_curta?: string;
  niveis: TalentLevelContent[];
  status: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos. */
export function normalizeTalentContent(raw: Record<string, unknown>): TalentContent {
  const niveisRaw = Array.isArray(raw.niveis) ? (raw.niveis as Record<string, unknown>[]) : [];
  const niveis: TalentLevelContent[] = niveisRaw.map((nivel) => ({
    id: String(nivel.id ?? nivel.slug ?? ""),
    slug: String(nivel.slug ?? nivel.id ?? ""),
    talentoId: String(nivel.talento_id ?? raw.id ?? ""),
    nivel: typeof nivel.nivel === "number" ? nivel.nivel : 0,
    nome: String(nivel.nome ?? nivel.slug ?? "Nível"),
    descricao_curta: typeof nivel.descricao_curta === "string" ? nivel.descricao_curta : undefined,
    payload_automacao: nivel.payload_automacao,
    requisitos: nivel.requisitos,
  }));
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Talento"),
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    niveis,
    status: String(raw.status ?? "published"),
  };
}

export function getTalentLevelEffects(nivel: TalentLevelContent): TalentLevelEffect[] {
  const payload = asRecord(nivel.payload_automacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? (efeitos as TalentLevelEffect[]) : [];
}

// ---------------------------------------------------------------------
// Talentos adquiridos pelo personagem — registro simples, um item por
// NÍVEL adquirido (não assume progressão contígua automática; a UI
// sugere adquirir em ordem, mas não bloqueia — mesmo espírito de
// "nunca travar a UI" já usado em condições/Ruptura).
// ---------------------------------------------------------------------

export interface AcquiredTalentLevel {
  id: string;
  talentoId: string;
  nivelId: string;
  nivel: number;
  adquiridoEm: string;
}

export function acquireTalentLevel(
  character: Character,
  params: { talentoId: string; nivelId: string; nivel: number; nowIso: string },
): Character {
  const atuais = character.talentos_adquiridos ?? [];
  if (atuais.some((t) => t.nivelId === params.nivelId)) return character; // já adquirido — sem duplicar.
  const novo: AcquiredTalentLevel = {
    id: crypto.randomUUID(),
    talentoId: params.talentoId,
    nivelId: params.nivelId,
    nivel: params.nivel,
    adquiridoEm: params.nowIso,
  };
  return { ...character, talentos_adquiridos: [...atuais, novo] };
}

export function removeTalentLevel(character: Character, acquiredId: string): Character {
  const atuais = character.talentos_adquiridos ?? [];
  const next = atuais.filter((t) => t.id !== acquiredId);
  if (next.length === atuais.length) return character;
  return { ...character, talentos_adquiridos: next };
}

// ---------------------------------------------------------------------
// Efeitos ativos derivados — ÚNICO padrão automatizado: "+X em testes
// específicos" (`tipo: "modificador"`, com `alvo_tags`/`valor`).
// ---------------------------------------------------------------------

/**
 * Deriva os `ActiveEffect` dos talentos ADQUIRIDOS (mesmo formato de
 * `deriveActiveEffectsFromConditions`, plugável no mesmo prompt de
 * rolagem). Efeitos cuja `tipo` não é `"modificador"` com `alvo_tags`
 * válidos são ignorados aqui de propósito (não viram warning — a UI de
 * Talentos já lista o texto completo do nível para leitura manual,
 * ver `pendingEffects` em `TalentsTab.tsx`).
 */
export function deriveActiveEffectsFromTalents(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): ActiveEffect[] {
  const acquiredByLevelId = new Map((character.talentos_adquiridos ?? []).map((t) => [t.nivelId, t]));
  const effects: ActiveEffect[] = [];

  for (const talent of talents) {
    if (talent.status !== "published") continue;
    for (const nivel of talent.niveis) {
      const acquired = acquiredByLevelId.get(nivel.id);
      if (!acquired) continue;

      getTalentLevelEffects(nivel).forEach((efeito, index) => {
        if (efeito.tipo !== "modificador") return;
        const valor = efeito.valor;
        // Achado de auditoria do DB real (`db_talentos_normalizado_v1_3.json`):
        // a maioria dos efeitos "modificador" usa `alvo_acoes` (slug de
        // ação, ex.: "bloquear"), não `alvo_tags` — tratados aqui como a
        // MESMA lista de alvos (ambos são só "o que este modificador
        // afeta"), já que `RollsTab`/`ActionsTab` já usam slugs de ação
        // e tags de perícia intercambiavelmente como `affectedTags`.
        const alvoTags = [
          ...(Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags : []),
          ...(Array.isArray(efeito.alvo_acoes) ? efeito.alvo_acoes : []),
        ].filter((t): t is string => typeof t === "string");
        if (typeof valor !== "number" || alvoTags.length === 0) return;

        const alvoTexto = typeof efeito.alvo_texto === "string" ? efeito.alvo_texto : alvoTags.join(", ");
        effects.push({
          id: `talent:${acquired.id}:${index}`,
          sourceType: "talent",
          sourceId: nivel.id,
          sourceName: `${talent.nome} — ${nivel.nome}`,
          affectedTags: alvoTags,
          modifier: valor,
          explanation: `${talent.nome} (${nivel.nome}): ${valor >= 0 ? "+" : ""}${valor} em ${alvoTexto}.`,
          enabledByDefault: true,
          kind: "modifier",
          reversible: true,
        });
      });
    }
  }

  return effects;
}

/** Texto/rótulo dos efeitos de um nível que NÃO são o padrão automatizado — para exibição manual (nunca JSON cru). */
export function describeNonAutomatedTalentEffects(nivel: TalentLevelContent): string[] {
  return getTalentLevelEffects(nivel)
    .filter((efeito) => efeito.tipo !== "modificador")
    .map((efeito) => {
      const usos = typeof efeito.usos === "number" ? efeito.usos : undefined;
      const cadencia = typeof efeito.cadencia === "string" ? efeito.cadencia : undefined;
      const cadenciaTexto = usos != null && cadencia ? ` (${usos}/${cadencia})` : "";
      return `${efeito.tipo}${cadenciaTexto} — resolução manual`;
    });
}
