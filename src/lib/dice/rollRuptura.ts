import { rollDie } from "./rollExpression";
import type { MargemClassificacao, RupturaRollParams, RupturaRollResult } from "./types";

/**
 * Classifica a margem de uma rolagem já resolvida contra CD. A margem
 * sozinha já determina a categoria (negativa = falha, >=0 = sucesso) —
 * não reinterpreta `sucesso`/`total >= cd`, só agrupa o número numa
 * leitura rápida, sem mexer em dano/região do corpo/combate.
 */
function classificarMargem(margem: number): MargemClassificacao {
  if (margem <= -5) return "falha_critica";
  if (margem <= -2) return "falha";
  if (margem === -1) return "falha_limitada";
  if (margem <= 1) return "sucesso_limitado";
  if (margem <= 4) return "sucesso_padrao";
  return "sucesso_critico";
}

/**
 * Rolagem base do Ruptura: "maior dado entre (Atributo)d8 + Perícia +
 * modificadores" (PRD). Rola `atributoValor` dados de 8 faces, usa o
 * maior, soma a perícia (0 se nenhuma for informada — rolagem "sem
 * perícia") e o modificador manual. Se `cd` for informado, calcula
 * sucesso/falha, margem (total - cd) e a classificação da margem —
 * senão deixa os quatro campos ausentes.
 */
export function rollPericia(params: RupturaRollParams): RupturaRollResult {
  const quantidadeDados = Math.max(0, Math.trunc(params.atributoValor));
  const dados = Array.from({ length: quantidadeDados }, () => rollDie(8));
  const maiorDado = dados.length > 0 ? Math.max(...dados) : 0;
  const periciaValor = params.periciaValor ?? 0;
  const total = maiorDado + periciaValor + params.modificador;

  const resultado: RupturaRollResult = {
    atributoId: params.atributoId,
    atributoNome: params.atributoNome,
    atributoValor: params.atributoValor,
    periciaId: params.periciaId,
    periciaNome: params.periciaNome,
    periciaValor,
    modificador: params.modificador,
    dados,
    maiorDado,
    total,
  };

  if (params.cd == null) return resultado;

  const sucesso = total >= params.cd;
  const margem = total - params.cd;

  return {
    ...resultado,
    cd: params.cd,
    sucesso,
    margem,
    classificacaoMargem: classificarMargem(margem),
  };
}
