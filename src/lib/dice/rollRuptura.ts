import { rollDie } from "./rollExpression";
import type {
  MargemClassificacao,
  RupturaRollParams,
  RupturaRollResult,
  RupturaSelectionMode,
} from "./types";

export interface RupturaPoolDefinition {
  quantidadeDados: number;
  modoSelecao: RupturaSelectionMode;
}

/**
 * Traduz o valor do Atributo no pool canônico da v1.2.
 *
 *  3 → 3d8, maior
 *  1 → 1d8, maior
 *  0 → 2d8, menor
 * -1 → 3d8, menor
 * -2 → 4d8, menor
 */
export function getRupturaPool(atributoValor: number): RupturaPoolDefinition {
  const valor = Number.isFinite(atributoValor) ? Math.trunc(atributoValor) : 0;
  return valor > 0
    ? { quantidadeDados: valor, modoSelecao: "highest" }
    : { quantidadeDados: 2 + Math.abs(valor), modoSelecao: "lowest" };
}

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
 * Rolagem base do Ruptura v1.2. Atributo positivo rola `Nd8` e usa o
 * maior. Atributo 0 rola 2d8 e usa o menor; cada ponto negativo adiciona
 * um d8 e continua usando o menor. Depois soma Perícia e modificadores.
 */
export function rollPericia(params: RupturaRollParams): RupturaRollResult {
  const { quantidadeDados } = getRupturaPool(params.atributoValor);
  const dados = Array.from({ length: quantidadeDados }, () => rollDie(8));
  // Pistoleiro › Gatilho Quente/Showdown — o(s) d8 de gatilho são rolados JUNTO com os
  // demais (mesma rolagem, cor diferente só narrativamente) e entram no pool antes da
  // seleção do maior/menor — nunca um bônus separado. Showdown (`quantidadeDadosGatilho`)
  // tem precedência sobre o modo de 1 dado (`incluirDadoGatilho`).
  const quantidadeGatilho = Math.max(0, Math.trunc(params.quantidadeDadosGatilho ?? (params.incluirDadoGatilho ? 1 : 0)));
  const dadosGatilhoResultados = quantidadeGatilho > 0 ? Array.from({ length: quantidadeGatilho }, () => rollDie(8)) : undefined;
  return resolverPericia(params, dados, dadosGatilhoResultados);
}

/**
 * A REGRA, separada de quem sorteia os dados.
 *
 * `rollPericia` sorteia e resolve; esta função só resolve, a partir de
 * dados que já existem. É o que permite a mesa do VTT — onde os d8 são
 * corpos rígidos de verdade e o valor sai da face que ficou pra cima
 * quando eles param (`ArenaDados`) — usar EXATAMENTE a mesma regra do
 * Console, em vez de reimplementar "dado escolhido + perícia + modificador"
 * e as seis faixas de margem por conta própria. Uma regra, dois
 * geradores de dado.
 */
export function resolverPericia(
  params: RupturaRollParams,
  dados: number[],
  dadosGatilhoResultados?: number[],
): RupturaRollResult {
  const { quantidadeDados, modoSelecao } = getRupturaPool(params.atributoValor);
  const poolCompleto = dadosGatilhoResultados ? [...dados, ...dadosGatilhoResultados] : dados;
  const dadoEscolhido = poolCompleto.length > 0
    ? modoSelecao === "highest" ? Math.max(...poolCompleto) : Math.min(...poolCompleto)
    : 0;
  const dadoGatilhoResultado = dadosGatilhoResultados && dadosGatilhoResultados.length === 1 ? dadosGatilhoResultados[0] : undefined;
  const dadoGatilhoEscolhido = dadoGatilhoResultado != null ? dadoGatilhoResultado === dadoEscolhido : undefined;
  const periciaValor = params.periciaValor ?? 0;
  const total = dadoEscolhido + periciaValor + params.modificador;

  const resultado: RupturaRollResult = {
    atributoId: params.atributoId,
    atributoNome: params.atributoNome,
    atributoValor: params.atributoValor,
    periciaId: params.periciaId,
    periciaNome: params.periciaNome,
    periciaValor,
    modificador: params.modificador,
    quantidadeDados,
    modoSelecao,
    dados: poolCompleto,
    dadoEscolhido,
    maiorDado: dadoEscolhido,
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
