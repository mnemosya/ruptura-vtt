/**
 * Cálculo dos derivados básicos (pv_max, pe_max, mana_max,
 * integridade_max, reacoes_por_rodada, andar_m, correr_m, pa_max).
 *
 * Em vez de reescrever as fórmulas manualmente, este módulo INTERPRETA
 * a árvore de fórmula que já vem em
 * regras_personagem.derivados[].formula (formato { const } | { ref } |
 * { op, args }). Isso evita reinterpretar a regra: se o payload mudar
 * uma fórmula, o cálculo aqui muda junto, sem precisar editar código.
 *
 * O fallback hardcoded (derived.fallback.ts) só entra se um id
 * esperado não existir no payload — ver comentário lá.
 */

import { FALLBACK_DERIVED_FORMULAS } from "./derived.fallback";
import {
  DERIVED_IDS,
  type CharacterAttributes,
  type CharacterRulesPayload,
  type DerivedStats,
  type FormulaNode,
} from "./types";

function isConstNode(node: FormulaNode): node is { const: number } {
  return typeof (node as { const?: unknown }).const === "number";
}

function isRefNode(node: FormulaNode): node is { ref: "atributo" | "derivado"; id: string } {
  return "ref" in node;
}

function isOpNode(node: FormulaNode): node is { op: "+" | "-" | "*" | "/"; args: FormulaNode[] } {
  return "op" in node;
}

function applyOp(op: "+" | "-" | "*" | "/", values: number[]): number {
  switch (op) {
    case "+":
      return values.reduce((acc, v) => acc + v, 0);
    case "*":
      return values.reduce((acc, v) => acc * v, 1);
    case "-":
      return values.reduce((acc, v, i) => (i === 0 ? v : acc - v));
    case "/":
      return values.reduce((acc, v, i) => (i === 0 ? v : acc / v));
    default:
      throw new Error(`Operador de fórmula não suportado: "${op}"`);
  }
}

function evaluateNode(
  node: FormulaNode,
  atributos: Record<string, number>,
  resolveDerivado: (id: string) => number,
): number {
  if (isConstNode(node)) return node.const;

  if (isRefNode(node)) {
    if (node.ref === "atributo") {
      const value = atributos[node.id];
      if (value == null) {
        throw new Error(`Fórmula referencia o atributo "${node.id}", que não existe no personagem.`);
      }
      return value;
    }
    if (node.ref === "derivado") return resolveDerivado(node.id);
    throw new Error(`Tipo de referência de fórmula não suportado: "${(node as { ref: string }).ref}"`);
  }

  if (isOpNode(node)) {
    const values = node.args.map((arg) => evaluateNode(arg, atributos, resolveDerivado));
    return applyOp(node.op, values);
  }

  throw new Error("Nó de fórmula em formato desconhecido (nem const, ref ou op).");
}

/**
 * Calcula os 8 derivados básicos a partir dos atributos do personagem.
 *
 * `regras` é o payload de getCharacterRules() (pode ser null se a
 * busca falhar — nesse caso tudo cai no fallback temporário).
 */
export function computeDerivedStats(
  atributos: CharacterAttributes,
  regras: CharacterRulesPayload | null,
): DerivedStats {
  const formulas = new Map<string, FormulaNode>();
  for (const def of regras?.derivados ?? []) {
    formulas.set(def.id, def.formula);
  }
  for (const id of DERIVED_IDS) {
    if (!formulas.has(id)) formulas.set(id, FALLBACK_DERIVED_FORMULAS[id]);
  }

  const cache = new Map<string, number>();
  const resolving = new Set<string>();
  // CharacterAttributes não tem index signature; o cast é seguro pois
  // todas as suas propriedades já são number.
  const attrs = atributos as unknown as Record<string, number>;

  function resolve(id: string): number {
    if (cache.has(id)) return cache.get(id)!;
    if (resolving.has(id)) {
      throw new Error(`Referência circular ao calcular o derivado "${id}".`);
    }
    const formula = formulas.get(id);
    if (!formula) {
      throw new Error(`Nenhuma fórmula encontrada para o derivado "${id}" (payload nem fallback).`);
    }
    resolving.add(id);
    const value = evaluateNode(formula, attrs, resolve);
    resolving.delete(id);
    cache.set(id, value);
    return value;
  }

  const result = {} as DerivedStats;
  for (const id of DERIVED_IDS) {
    result[id] = resolve(id);
  }
  return result;
}
