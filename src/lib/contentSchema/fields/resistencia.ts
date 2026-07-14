/**
 * Normalização de teste/resistência — a auditoria encontrou 2
 * representações legadas: `{cd_formula, acoes[]}` em magias vs.
 * `{pericia, cd}` (cd literal) em equipamentos/runas/propriedades.
 *
 * Nota de defasagem (auditoria §5.3): `cd_formula` no conteúdo de
 * magias ainda diz `"5 + nivel_vertente"`, mas o motor real
 * (`src/lib/character/spells.ts`) usa `6 + nível` — este normalizador
 * preserva o texto original em `cdFormula` sem tentar corrigi-lo; a
 * correção é decisão de conteúdo, não de leitura.
 */

import type { ResistenciaCanonica } from "../types";

export function normalizarResistencia(bruto: unknown): ResistenciaCanonica | undefined {
  if (bruto == null || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  const obj = bruto as Record<string, unknown>;

  const pericia = typeof obj.pericia === "string" ? obj.pericia : undefined;
  const cdFormula = typeof obj.cd_formula === "string" ? obj.cd_formula : undefined;
  const cdValor = typeof obj.cd === "number" ? obj.cd : undefined;
  const acoes = Array.isArray(obj.acoes) ? obj.acoes.filter((v): v is string => typeof v === "string") : undefined;

  if (!pericia && !cdFormula && cdValor === undefined && !acoes) return undefined;

  return { pericia, cdFormula, cdValor, acoes };
}
