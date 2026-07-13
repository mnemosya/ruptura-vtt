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
  // Pistoleiro › Gatilho Quente/Showdown — o(s) d8 de gatilho são rolados JUNTO com os
  // demais (mesma rolagem, cor diferente só narrativamente) e entram no pool de "maior
  // dado" — nunca um bônus separado somado depois. Showdown (`quantidadeDadosGatilho`)
  // tem precedência sobre o modo de 1 dado (`incluirDadoGatilho`).
  const quantidadeGatilho = Math.max(0, Math.trunc(params.quantidadeDadosGatilho ?? (params.incluirDadoGatilho ? 1 : 0)));
  const dadosGatilhoResultados = quantidadeGatilho > 0 ? Array.from({ length: quantidadeGatilho }, () => rollDie(8)) : undefined;
  const poolCompleto = dadosGatilhoResultados ? [...dados, ...dadosGatilhoResultados] : dados;
  const maiorDado = poolCompleto.length > 0 ? Math.max(...poolCompleto) : 0;
  const dadoGatilhoResultado = dadosGatilhoResultados && dadosGatilhoResultados.length === 1 ? dadosGatilhoResultados[0] : undefined;
  const dadoGatilhoEscolhido = dadoGatilhoResultado != null ? dadoGatilhoResultado === maiorDado : undefined;
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
    dados: poolCompleto,
    maiorDado,
    total,
    dadoGatilhoResultado,
    dadoGatilhoEscolhido,
    dadosGatilhoResultados,
  };

  if (params.cd == null) return resultado;

  const sucesso = total >= params.cd;
  const margem = total - params.cd;
  let classificacaoMargem = classificarMargem(margem);
  let promocaoAplicada: string | undefined;

  // Promoção de margem (ex.: Passo Fantasma, Olhar Penetrante) — data-driven,
  // vem do payload canônico do talento (`promocao_margem.de/para`), nunca
  // inventada aqui. "falha_limitada → sucesso_limitado" também promove
  // `sucesso` para true (o capítulo trata como sucesso a partir daí).
  if (params.promocaoMargem && classificacaoMargem === params.promocaoMargem.de) {
    classificacaoMargem = params.promocaoMargem.para;
    promocaoAplicada = params.promocaoMargem.origem;
  }

  return {
    ...resultado,
    cd: params.cd,
    sucesso: promocaoAplicada ? classificacaoMargem !== "falha" && classificacaoMargem !== "falha_critica" : sucesso,
    margem,
    classificacaoMargem,
    promocaoAplicada,
  };
}
