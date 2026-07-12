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
  /** Quantidade de d8 a rolar (= valor do atributo). */
  atributoValor: number;
  periciaId?: string;
  periciaNome?: string;
  periciaValor?: number;
  modificador: number;
  /** CD opcional — se ausente, não calcula sucesso/falha/margem. */
  cd?: number;
  /** Promoção de margem data-driven (Passo Fantasma, Olhar Penetrante) — `origem` só rotula o resultado, nunca decide a promoção. */
  promocaoMargem?: { de: MargemClassificacao; para: MargemClassificacao; origem: string };
}

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
 * Resultado de `rollPericia()`: maior d8 entre N dados (N = atributo) +
 * perícia + modificador manual. Espelha a regra do PRD: "maior dado
 * entre (Atributo)d8 + Perícia + modificadores".
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
  /** Resultado de cada d8 rolado, na ordem em que saíram. */
  dados: number[];
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
