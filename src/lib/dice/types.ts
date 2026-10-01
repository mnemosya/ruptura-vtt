/**
 * Tipos da Dice Tray local. Sem persistência, sem chat — só os
 * resultados de rolagem em memória (ver RollsTab).
 */

/** Faces de dado aceitas na expressão genérica (item 6 do pedido). */
export const ALLOWED_DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DiceSides = (typeof ALLOWED_DICE_SIDES)[number];

/** Erro de expressão de dados inválida/insegura — nunca usa eval. */
export class DiceExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceExpressionError";
  }
}

/** Um termo de dado já rolado dentro de uma expressão (ex.: "+1d8" → {sides:8, value:5, sign:1}). */
export interface DiceTerm {
  sides: number;
  value: number;
  sign: 1 | -1;
}

/** Resultado de `rollExpression()` — expressão genérica tipo "1d8+1d4-1". */
export interface DiceRollResult {
  expression: string;
  dice: DiceTerm[];
  modifier: number;
  total: number;
}

/**
 * Parâmetros de `rollPericia()` — rolagem base do Ruptura. Perícia é
 * opcional: omitir periciaId/periciaNome/periciaValor representa "sem
 * perícia" (bônus de perícia tratado como 0 — ver rollRuptura.ts).
 */
export interface RupturaRollParams {
  atributoId: string;
  atributoNome: string;
  /**
   * Valor do atributo. Pools positivos rolam esse número de d8 e usam
   * o maior; 0 rola 2d8 e valores negativos acrescentam um d8 por
   * ponto negativo, sempre usando o menor.
   */
  atributoValor: number;
  periciaId?: string;
  periciaNome?: string;
  periciaValor?: number;
  modificador: number;
  /** CD opcional — se ausente, não calcula sucesso/falha/margem. */
  cd?: number;
  /** Promoção de margem data-driven (Passo Fantasma, Olhar Penetrante) — `origem` só rotula o resultado, nunca decide a promoção. */
  promocaoMargem?: { de: MargemClassificacao; para: MargemClassificacao; origem: string };
  /**
   * Pistoleiro › Gatilho Quente — inclui um d8 EXTRA ("dado de gatilho", cor
   * diferente) na MESMA rolagem, junto com os d8 do atributo, antes de
   * escolher o maior. Sempre virtual/interno (mesmo gerador dos demais
   * dados) — nunca pede ao jogador para rolar um d8 físico e digitar.
   */
  incluirDadoGatilho?: boolean;
  /**
   * Pistoleiro › Showdown — inclui VÁRIOS d8 de gatilho (até 3) na MESMA
   * rolagem, todos entrando no pool antes de escolher o maior (nunca dados
   * separados/bônus depois). Quando presente, tem precedência sobre
   * `incluirDadoGatilho` (que continua servindo Gatilho Quente/Bang Bang,
   * sempre 1 dado).
   */
  quantidadeDadosGatilho?: number;
}

/** Como o pool escolhe o único d8 que entra no total. */
export type RupturaSelectionMode = "highest" | "lowest";

/**
 * Classificação simples da margem quando há CD. Não é regra de jogo
 * nova (dano/região do corpo/combate) — só uma leitura mais rápida do
 * número de margem já calculado, cobrindo todo o eixo (negativo e
 * positivo):
 *   - falha_critica:    margem <= -5;
 *   - falha:             margem entre -4 e -2;
 *   - falha_limitada:    margem == -1;
 *   - sucesso_limitado:  margem entre 0 e 1;
 *   - sucesso_padrao:    margem entre 2 e 4;
 *   - sucesso_critico:   margem >= 5.
 */
export const MARGEM_CLASSIFICACOES = [
  "falha_critica",
  "falha",
  "falha_limitada",
  "sucesso_limitado",
  "sucesso_padrao",
  "sucesso_critico",
] as const;
export type MargemClassificacao = (typeof MARGEM_CLASSIFICACOES)[number];

/**
 * Resultado de `rollPericia()`: um d8 escolhido do pool + perícia +
 * modificador manual. Pools positivos usam o maior d8; pools de
 * Atributo 0 ou negativo usam o menor.
 *
 * periciaId/periciaNome ausentes = rolagem "sem perícia" — periciaValor
 * sempre vem preenchido (0 nesse caso), nunca fica `undefined`.
 */
export interface RupturaRollResult {
  atributoId: string;
  atributoNome: string;
  atributoValor: number;
  periciaId?: string;
  periciaNome?: string;
  periciaValor: number;
  modificador: number;
  /** Quantidade canônica de d8 pedida pelo valor do atributo. */
  quantidadeDados: number;
  /** `highest` para atributo positivo; `lowest` para zero/negativo. */
  modoSelecao: RupturaSelectionMode;
  /** Resultado de cada d8 rolado, na ordem em que saíram. */
  dados: number[];
  /** O d8 efetivamente usado no total. */
  dadoEscolhido: number;
  /**
   * Alias temporário para consumidores anteriores ao suporte a pools
   * negativos. Contém o dado escolhido, inclusive quando ele é o menor.
   */
  maiorDado: number;
  total: number;
  cd?: number;
  sucesso?: boolean;
  /** total - cd (positivo em sucesso, negativo em falha). Só presente se houver CD. */
  margem?: number;
  /** Classificação simples da margem (ver MargemClassificacao). Só presente se houver CD. */
  classificacaoMargem?: MargemClassificacao;
  /** Rótulo do talento que promoveu a margem (ex.: "Passo Fantasma") — ausente = nenhuma promoção aplicada. */
  promocaoAplicada?: string;
  /** Resultado do d8 de gatilho, quando `incluirDadoGatilho` foi pedido — já incluído em `dados`/`dadoEscolhido`. */
  dadoGatilhoResultado?: number;
  /** `true` quando o d8 de gatilho foi o escolhido pela regra do pool. */
  dadoGatilhoEscolhido?: boolean;
  /** Pistoleiro › Showdown — resultado de CADA d8 de gatilho pedido via `quantidadeDadosGatilho`, na ordem em que saíram — já incluídos em `dados`/`dadoEscolhido`. */
  dadosGatilhoResultados?: number[];
}

/**
 * Rolagem "preparada" a partir de um clique em Atributos/Perícias —
 * ponte entre CharacterSheetClient e RollsTab (ver item 1/2 do
 * checkpoint v0.10). `periciaId: null` representa "sem perícia"
 * (clique veio de um atributo). `origem` é só texto para o histórico
 * (ex.: "Atributo: Corpo", "Perícia: Arcanismo").
 */
export interface PreparedRoll {
  atributoId: string;
  periciaId: string | null;
  origem: string;
  /** Tags sintéticas somadas automaticamente (não togláveis) — ex.: `item:<instanceId>` para escopar bônus de item específico (Toque de Midas) só a ESTA arma. */
  extraTags?: string[];
}
