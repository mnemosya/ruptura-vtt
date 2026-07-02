/**
 * Colapso por PV/PE 0 — checkpoint v0.38 (PRD 10.7).
 *
 * Primeira versão jogável: detecta o início (PV ou PE cai a 0) e o fim
 * por cura (PV ou PE volta a 1+), aplica/remove Inconsciente via o
 * sistema de condições já existente (v0.32), e oferece avanço manual
 * de segmento + estabilização. NÃO resolve morte/coma definitivos nem
 * cicatriz completa — só marca `cicatrizPendente` na sobrevivência.
 * NÃO processa fim de rodada automaticamente (sem sistema de rodada
 * real ainda) — o avanço de segmento é sempre um botão manual.
 */

import type { ActiveCondition, Character } from "./types";

const COLLAPSE_INCONSCIENTE_ORIGENS = ["Colapso (PV a 0)", "Colapso (PE a 0)"] as const;

function buildCollapseInconsciente(nowIso: string, tipo: "pv" | "pe"): ActiveCondition {
  return {
    id: crypto.randomUUID(),
    conditionId: "inconsciente",
    nome: "Inconsciente",
    descricao: "Caído + sem ação ou reação.",
    origem: tipo === "pv" ? "Colapso (PV a 0)" : "Colapso (PE a 0)",
    duracao: "Enquanto o colapso estiver ativo",
    aplicadaEm: nowIso,
    removidaEm: null,
    ativa: true,
  };
}

/** Remove só o Inconsciente que o PRÓPRIO colapso aplicou — nunca um Inconsciente aplicado manualmente por outro motivo. */
function endCollapseInconsciente(condicoes: ActiveCondition[], nowIso: string): ActiveCondition[] {
  return condicoes.map((c) =>
    c.ativa && c.conditionId === "inconsciente" && (COLLAPSE_INCONSCIENTE_ORIGENS as readonly string[]).includes(c.origem ?? "")
      ? { ...c, ativa: false, removidaEm: nowIso }
      : c,
  );
}

export interface ResourceSnapshot {
  pv: number;
  pe: number;
}

export interface CollapseDetectionResult {
  character: Character;
  started: boolean;
  ended: boolean;
  tipo: "pv" | "pe" | null;
  warnings: string[];
}

/**
 * Detecta início/fim de colapso a partir de uma variação de PV/PE.
 * Início: recurso cai de >0 para <=0, sem colapso já ativo. Fim (cura):
 * o recurso do TIPO já colapsado sobe de <=0 para 1+ — encerra e marca
 * `cicatrizPendente: true`. Se já há colapso ativo de um tipo e o
 * OUTRO recurso também cai a 0, isso não inicia um segundo colapso
 * (PRD não descreve colapso duplo) — fica registrado como warning.
 */
export function detectCollapseOnResourceChange(
  character: Character,
  before: ResourceSnapshot,
  after: ResourceSnapshot,
  nowIso: string,
): CollapseDetectionResult {
  const colapso = character.colapso;
  const warnings: string[] = [];

  if (!colapso || !colapso.ativo) {
    if (before.pv > 0 && after.pv <= 0) {
      return {
        character: {
          ...character,
          colapso: { ativo: true, tipo: "pv", segmentos: 0, estabilizado: false, iniciadoEm: nowIso, encerradoEm: null, cicatrizPendente: false, ultimoEvento: "iniciado_pv" },
          condicoes_ativas: [...(character.condicoes_ativas ?? []), buildCollapseInconsciente(nowIso, "pv")],
        },
        started: true,
        ended: false,
        tipo: "pv",
        warnings,
      };
    }
    if (before.pe > 0 && after.pe <= 0) {
      return {
        character: {
          ...character,
          colapso: { ativo: true, tipo: "pe", segmentos: 0, estabilizado: false, iniciadoEm: nowIso, encerradoEm: null, cicatrizPendente: false, ultimoEvento: "iniciado_pe" },
          condicoes_ativas: [...(character.condicoes_ativas ?? []), buildCollapseInconsciente(nowIso, "pe")],
        },
        started: true,
        ended: false,
        tipo: "pe",
        warnings,
      };
    }
    return { character, started: false, ended: false, tipo: null, warnings };
  }

  // Colapso já ativo — checa cura do mesmo tipo.
  if (colapso.tipo === "pv" && before.pv <= 0 && after.pv >= 1) {
    return { character: endCollapseByHealing(character, nowIso), started: false, ended: true, tipo: "pv", warnings };
  }
  if (colapso.tipo === "pe" && before.pe <= 0 && after.pe >= 1) {
    return { character: endCollapseByHealing(character, nowIso), started: false, ended: true, tipo: "pe", warnings };
  }

  if (colapso.tipo === "pv" && before.pe > 0 && after.pe <= 0) {
    warnings.push("PE também caiu a 0 durante um colapso de PV já ativo — sem regra de colapso duplo no PRD; nada foi alterado além do registrado.");
  }
  if (colapso.tipo === "pe" && before.pv > 0 && after.pv <= 0) {
    warnings.push("PV também caiu a 0 durante um colapso de PE já ativo — sem regra de colapso duplo no PRD; nada foi alterado além do registrado.");
  }

  return { character, started: false, ended: false, tipo: null, warnings };
}

/** Avança 1 segmento (máx. 3) do colapso ativo — sempre manual (sem fim de rodada automático ainda). */
export interface AdvanceSegmentResult {
  character: Character;
  segmentos: number;
  thirdSegmentReached: boolean;
  warnings: string[];
}

export function advanceCollapseSegment(character: Character, reason: string, nowIso: string): AdvanceSegmentResult {
  const colapso = character.colapso;
  if (!colapso || !colapso.ativo) {
    return { character, segmentos: colapso?.segmentos ?? 0, thirdSegmentReached: false, warnings: ["Nenhum colapso ativo — nada avançado."] };
  }
  const segmentos = Math.min(3, colapso.segmentos + 1);
  const thirdSegmentReached = segmentos >= 3;
  const warnings: string[] = [];
  if (thirdSegmentReached) {
    warnings.push(
      colapso.tipo === "pv"
        ? "3º segmento atingido — risco de morte (PRD 10.7). Resolução final (morte) não automatizada; registre manualmente."
        : "3º segmento atingido — risco de coma/fora de jogo (PRD 10.7). Resolução final não automatizada; registre manualmente.",
    );
  }
  return {
    character: { ...character, colapso: { ...colapso, segmentos, ultimoEvento: `avancado:${reason}` } },
    segmentos,
    thirdSegmentReached,
    warnings,
  };
}

/** Estabilizar interrompe o avanço de segmento — NÃO cura, NÃO remove Inconsciente (regra explícita do PRD). */
export function stabilizeCollapse(character: Character, nowIso: string): Character {
  if (!character.colapso?.ativo) return character;
  return { ...character, colapso: { ...character.colapso, estabilizado: true, ultimoEvento: "estabilizado" } };
}

/** Encerra o colapso por cura (1+ no recurso colapsado) — remove só o Inconsciente aplicado pelo colapso e marca cicatriz pendente. */
export function endCollapseByHealing(character: Character, nowIso: string): Character {
  if (!character.colapso?.ativo) return character;
  return {
    ...character,
    colapso: { ...character.colapso, ativo: false, encerradoEm: nowIso, cicatrizPendente: true, ultimoEvento: "encerrado_cura" },
    condicoes_ativas: endCollapseInconsciente(character.condicoes_ativas ?? [], nowIso),
  };
}
