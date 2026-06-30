import { ALLOWED_DICE_SIDES, DiceExpressionError, type DiceRollResult, type DiceSides, type DiceTerm } from "./types";

/** Limite de dados por termo — proteção simples contra expressão absurda (ex.: "9999999d8"). */
const MAX_DICE_PER_TERM = 100;

/** Rola um dado de `sides` faces. Math.random() — sem dependência nova, sem eval. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function isAllowedSides(value: number): value is DiceSides {
  return (ALLOWED_DICE_SIDES as readonly number[]).includes(value);
}

/**
 * Rola uma expressão genérica de dados (ex.: "1d8+1d4-1", "2d6+3").
 *
 * Parser estrito, SEM eval: valida a string contra uma whitelist de
 * caracteres (apenas dígitos, "d", "+", "-") antes de qualquer outra
 * coisa, depois quebra em termos pelo sinal e casa cada termo contra
 * `/^\d+d\d+$/` (dado) ou `/^\d+$/` (número fixo). Qualquer caractere
 * ou termo fora disso — incluindo algo como "alert(1)" — é rejeitado
 * com DiceExpressionError antes de qualquer rolagem acontecer.
 */
export function rollExpression(rawExpr: string): DiceRollResult {
  const expr = rawExpr.replace(/\s+/g, "");
  if (!expr) {
    throw new DiceExpressionError("Expressão vazia.");
  }
  if (!/^[0-9d+-]+$/.test(expr)) {
    throw new DiceExpressionError(`Expressão contém caracteres não permitidos: "${rawExpr}".`);
  }

  const normalized = /^[+-]/.test(expr) ? expr : `+${expr}`;
  const termMatches = normalized.match(/[+-][^+-]+/g);
  if (!termMatches || termMatches.join("") !== normalized) {
    throw new DiceExpressionError(`Expressão inválida: "${rawExpr}".`);
  }

  const dice: DiceTerm[] = [];
  let modifier = 0;

  for (const term of termMatches) {
    const sign: 1 | -1 = term[0] === "-" ? -1 : 1;
    const body = term.slice(1);

    const diceMatch = /^(\d+)d(\d+)$/.exec(body);
    if (diceMatch) {
      const quantity = Number(diceMatch[1]);
      const sides = Number(diceMatch[2]);
      if (!isAllowedSides(sides)) {
        throw new DiceExpressionError(
          `Dado d${sides} não suportado (use d4, d6, d8, d10, d12, d20 ou d100).`,
        );
      }
      if (quantity < 1 || quantity > MAX_DICE_PER_TERM) {
        throw new DiceExpressionError(`Quantidade de dados inválida em "${term}".`);
      }
      for (let i = 0; i < quantity; i++) {
        dice.push({ sides, value: rollDie(sides), sign });
      }
      continue;
    }

    const flatMatch = /^(\d+)$/.exec(body);
    if (flatMatch) {
      modifier += sign * Number(flatMatch[1]);
      continue;
    }

    throw new DiceExpressionError(`Termo inválido: "${term}".`);
  }

  const total = dice.reduce((acc, d) => acc + d.value * d.sign, 0) + modifier;
  return { expression: expr, dice, modifier, total };
}
