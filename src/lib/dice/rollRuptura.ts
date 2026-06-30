import { rollDie } from "./rollExpression";
import type { RupturaRollParams, RupturaRollResult } from "./types";

/**
 * Rolagem base do Ruptura: "maior dado entre (Atributo)d8 + Perícia +
 * modificadores" (PRD). Rola `atributoValor` dados de 8 faces, usa o
 * maior, soma a perícia e o modificador manual. Se `cd` for informado,
 * calcula sucesso/falha e margem (total - cd) — senão deixa os três
 * campos ausentes.
 */
export function rollPericia(params: RupturaRollParams): RupturaRollResult {
  const quantidadeDados = Math.max(0, Math.trunc(params.atributoValor));
  const dados = Array.from({ length: quantidadeDados }, () => rollDie(8));
  const maiorDado = dados.length > 0 ? Math.max(...dados) : 0;
  const total = maiorDado + params.periciaValor + params.modificador;

  const resultado: RupturaRollResult = {
    atributoId: params.atributoId,
    atributoNome: params.atributoNome,
    atributoValor: params.atributoValor,
    periciaId: params.periciaId,
    periciaNome: params.periciaNome,
    periciaValor: params.periciaValor,
    modificador: params.modificador,
    dados,
    maiorDado,
    total,
  };

  if (params.cd == null) return resultado;

  return {
    ...resultado,
    cd: params.cd,
    sucesso: total >= params.cd,
    margem: total - params.cd,
  };
}
