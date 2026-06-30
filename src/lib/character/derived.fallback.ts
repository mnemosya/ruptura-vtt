/**
 * ETAPA TEMPORÁRIA — NÃO é a fonte de verdade das regras.
 *
 * Estas fórmulas só são usadas em computeDerivedStats() (ver derived.ts)
 * quando um id de derivado esperado pela ficha mínima NÃO é encontrado
 * no payload de regras_personagem vindo do banco (ex.: campo renomeado,
 * schema mudou, ou getCharacterRules() indisponível). Sempre que o
 * payload tiver a fórmula correspondente, ela é usada no lugar desta.
 *
 * Hoje (db_regras_personagem_normalizado_v1_4.json) todos os 8 ids
 * abaixo já existem no payload com a fórmula idêntica a esta — ou seja,
 * em condições normais este arquivo nunca é consultado. Ele existe só
 * como rede de segurança e fica isolado aqui para não se misturar com
 * a leitura "de verdade" das regras.
 *
 * TODO: remover quando a ficha não precisar mais rodar sem acesso à
 * Biblioteca do Sistema.
 */

import type { DerivedStats, FormulaNode } from "./types";

export const FALLBACK_DERIVED_FORMULAS: Record<keyof DerivedStats, FormulaNode> = {
  pv_max: { op: "+", args: [{ const: 10 }, { ref: "atributo", id: "corpo" }] },
  pe_max: { op: "+", args: [{ const: 10 }, { ref: "atributo", id: "mente" }] },
  mana_max: {
    op: "+",
    args: [{ const: 10 }, { op: "*", args: [{ ref: "atributo", id: "animo" }, { const: 2 }] }],
  },
  integridade_max: {
    op: "+",
    args: [{ const: 10 }, { op: "*", args: [{ ref: "atributo", id: "animo" }, { const: 2 }] }],
  },
  reacoes_por_rodada: { ref: "atributo", id: "mente" },
  andar_m: { op: "+", args: [{ const: 10 }, { ref: "atributo", id: "corpo" }] },
  correr_m: { op: "*", args: [{ ref: "derivado", id: "andar_m" }, { const: 2 }] },
  pa_max: { const: 3 },
};
