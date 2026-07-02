/**
 * PM e histórico de evolução — checkpoint v0.40 (PRD 3.3/4.2/4.3).
 *
 * "A progressão usa PM, investidos em atributo, perícia, vertente,
 * talento ou PA. Enquanto os custos finais não estiverem fechados, a
 * plataforma deve usar valores placeholder editáveis." (PRD 3.3) —
 * por isso `spendPm`/`gainPm` aceitam qualquer `quantidade`/`descricao`
 * livre, sem tabela de custo fixo (nada inventado). Módulo puro: nunca
 * lê/escreve estado React, sempre devolve um novo `Character`.
 */

import type { Character, EvolutionHistoryEntry } from "./types";

function pushHistorico(character: Character, entry: EvolutionHistoryEntry): EvolutionHistoryEntry[] {
  return [...(character.historico_evolucao ?? []), entry];
}

export interface EvolutionResult {
  character: Character;
  entry: EvolutionHistoryEntry;
  warnings: string[];
}

/** Registra PM recebido (ex.: recompensa de sessão) — soma em pm_total e pm_disponivel. */
export function gainPm(character: Character, quantidade: number, descricao: string, nowIso: string): EvolutionResult {
  const qtd = Math.max(0, Math.trunc(quantidade));
  const pmTotalAntes = character.pm_total ?? 0;
  const pmDisponivelAntes = character.pm_disponivel ?? 0;

  const entry: EvolutionHistoryEntry = {
    id: crypto.randomUUID(),
    tipo: "ganho",
    quantidade: qtd,
    descricao: descricao.trim() || "PM recebido",
    antes: pmDisponivelAntes,
    depois: pmDisponivelAntes + qtd,
    criadoEm: nowIso,
    criadoPor: "character_sheet",
  };

  return {
    character: {
      ...character,
      pm_total: pmTotalAntes + qtd,
      pm_disponivel: pmDisponivelAntes + qtd,
      historico_evolucao: pushHistorico(character, entry),
    },
    entry,
    warnings: [],
  };
}

/**
 * Registra gasto de PM (ex.: subir atributo/perícia/talento). Nunca
 * deixa `pm_disponivel` negativo — se pedir mais do que há, clampa em
 * 0 e devolve um warning (não bloqueia o registro, só avisa).
 */
export function spendPm(character: Character, quantidade: number, descricao: string, nowIso: string): EvolutionResult {
  const qtd = Math.max(0, Math.trunc(quantidade));
  const pmDisponivelAntes = character.pm_disponivel ?? 0;
  const warnings: string[] = [];
  let pmDisponivelDepois = pmDisponivelAntes - qtd;
  if (pmDisponivelDepois < 0) {
    warnings.push(`PM disponível insuficiente (tinha ${pmDisponivelAntes}, gasto de ${qtd}) — zerado, não negativo.`);
    pmDisponivelDepois = 0;
  }

  const entry: EvolutionHistoryEntry = {
    id: crypto.randomUUID(),
    tipo: "gasto",
    quantidade: qtd,
    descricao: descricao.trim() || "PM gasto",
    antes: pmDisponivelAntes,
    depois: pmDisponivelDepois,
    criadoEm: nowIso,
    criadoPor: "character_sheet",
  };

  return {
    character: {
      ...character,
      pm_disponivel: pmDisponivelDepois,
      historico_evolucao: pushHistorico(character, entry),
    },
    entry,
    warnings,
  };
}

/**
 * Registra um ajuste permanente de atributo/perícia feito em Modo
 * Evolução (checkpoint v0.40, item 4 do pedido) — sem custo de PM
 * fechado ainda (`quantidade: 0`), só o rastro auditável de
 * antes/depois. Chamado automaticamente por `updateAtributo`/
 * `updatePericia` sempre que o valor muda em Modo Evolução — não
 * exige um prompt de confirmação separado (mantém a edição fluida).
 */
export function logPermanentAdjustment(
  character: Character,
  campoAfetado: string,
  antes: number,
  depois: number,
  descricao: string,
  nowIso: string,
): Character {
  if (antes === depois) return character;
  const entry: EvolutionHistoryEntry = {
    id: crypto.randomUUID(),
    tipo: "ajuste",
    quantidade: 0,
    descricao,
    campoAfetado,
    antes,
    depois,
    criadoEm: nowIso,
    criadoPor: "character_sheet",
  };
  return { ...character, historico_evolucao: pushHistorico(character, entry) };
}
