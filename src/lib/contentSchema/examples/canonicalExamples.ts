/**
 * Exemplos canônicos permanentes (aditivo §Etapa 1 — "fixtures ou
 * exemplos permanentes"). Cobrem os 5 casos obrigatórios do checkpoint
 * de Etapa 1. Os payloads brutos abaixo são sintéticos, mas seguem
 * EXATAMENTE o formato legado real de cada content_type (mesmos nomes
 * de campo de `content/db_*.json` — ver auditoria/schema canônico) para
 * que os adapters os processem como processariam um registro real.
 *
 * Estes exemplos nunca devem ser apagados ou "corrigidos" para se
 * parecerem com o schema canônico — o valor deles é justamente
 * exercitar o adapter a partir do formato bruto de origem.
 */

import { adaptarNiveisDeTalento } from "../adapters";
import { adaptCondition } from "../adapters/condition";
import { adaptItem } from "../adapters/item";
import { adaptSpell } from "../adapters/spell";
import type { ResultadoAdaptacao } from "../types";

/** Caso 1 — magia que causa 1d8 de dano de fogo. */
export const EXEMPLO_MAGIA_DANO_FOGO: Record<string, unknown> = {
  id: "spell:rajada_ignea",
  slug: "rajada_ignea",
  nome: "Rajada Ígnea",
  categoria: "magia",
  categoria_label: "Magia",
  vertente: "energetica",
  vertente_label: "Energética",
  descricao_curta: "Você projeta uma rajada de chamas contra um alvo.",
  descricao_longa: "Você projeta uma rajada concentrada de chamas contra um alvo dentro do alcance.",
  tags: ["magia", "arcano", "ofensiva", "dano", "igneo"],
  estatisticas: {
    nivel: 1,
    tipo_magia: "ataque",
    custo_pa: 2,
    custo_mana: 2,
    usa_reacao: false,
    alcance: { tipo: "distancia", valor_m: 15, texto: "15 metros" },
    duracao: { texto: "Instantâneo", sustentavel: false },
    resolucao: "ataque",
  },
  payload_automacao: {
    efeitos: [{ tipo: "dano", dado: "1d8", tipo_dano: "energetico", subtipo_dano: "igneo" }],
  },
  status: "published",
  versao: "1.0.0",
  created_at: "2026-07-14",
  updated_at: "2026-07-14",
};

/** Caso 2 — item que cura 2d6 PV. */
export const EXEMPLO_ITEM_CURA: Record<string, unknown> = {
  id: "item:selante_regenerativo",
  slug: "selante_regenerativo",
  nome: "Selante Regenerativo",
  categoria: "farmacia",
  categoria_label: "Farmácia",
  raridade: "incomum",
  raridade_label: "Incomum",
  preco: 400,
  descricao_curta: "Composto regenerativo de aplicação rápida.",
  tags: ["cura", "equipamento", "loja"],
  estatisticas: { cargas_max: 1, custo_pa: 1 },
  payload_automacao: {
    efeitos: [{ tipo: "cura", dado: "2d6", recurso: "pv" }],
  },
  status: "published",
  versao: "1.0.0",
  created_at: "2026-07-14",
  updated_at: "2026-07-14",
};

/** Caso 3 — talento que concede +1 em Luta por 1 rodada. */
export const EXEMPLO_TALENTO_MODIFICADOR: Record<string, unknown> = {
  id: "talent:impulso_marcial",
  slug: "impulso_marcial",
  nome: "Impulso Marcial",
  descricao_curta: "Um impulso de determinação melhora sua Luta por um instante.",
  tags: ["talento", "marcial"],
  niveis: [
    {
      id: "impulso_marcial-n1",
      slug: "impulso_marcial-n1",
      talento_id: "impulso_marcial",
      nivel: 1,
      nome: "Impulso Marcial — nível 1",
      requisitos: [],
      tags: ["talento"],
      descricao_curta: "Ação livre: +1 em Luta por 1 rodada.",
      payload_automacao: {
        efeitos: [
          {
            familia: "modificador",
            tipo: "modificador",
            valor: 1,
            alvo_tags: ["luta"],
            alvo_texto: "testes de Luta",
            duracao: "1 rodada",
          },
        ],
      },
      status: "published",
      versao: "1.0.0",
      created_at: "2026-07-14",
      updated_at: "2026-07-14",
    },
  ],
  status: "published",
  versao: "1.0.0",
  created_at: "2026-07-14",
  updated_at: "2026-07-14",
};

/** Caso 4 — condição que causa 1d4 no fim da rodada. */
export const EXEMPLO_CONDICAO_DANO_FIM_DE_RODADA: Record<string, unknown> = {
  id: "condition:corroido",
  slug: "corroido",
  nome: "Corroído",
  categoria: "condicao",
  categoria_label: "Condição",
  descricao_curta: "Sofre 1d4 de dano ácido no fim de cada rodada.",
  descricao_longa: "Um ácido residual continua corroendo o alvo ao fim de cada rodada enquanto a condição persistir.",
  tags: ["dano_continuo", "fim_de_rodada", "acido"],
  duracao_padrao: "3 rodadas",
  payload_automacao: {
    efeitos: [{ tipo: "dano_fim_de_rodada", dano: "1d4", tipo_dano: "acido" }],
  },
  status: "published",
  versao: "1.0.0",
  created_at: "2026-07-14",
  updated_at: "2026-07-14",
};

/** Caso 5 — magia com resistência que aplica Atordoado em falha. */
export const EXEMPLO_MAGIA_RESISTENCIA_ATORDOADO: Record<string, unknown> = {
  id: "spell:pulso_neural",
  slug: "pulso_neural",
  nome: "Pulso Neural",
  categoria: "magia",
  categoria_label: "Magia",
  vertente: "sinaptica",
  vertente_label: "Sináptica",
  descricao_curta: "Um pulso neural desorienta o alvo, podendo atordoá-lo.",
  tags: ["magia", "controle"],
  estatisticas: {
    nivel: 2,
    tipo_magia: "controle",
    custo_pa: 2,
    custo_mana: 3,
    usa_reacao: false,
    alcance: { tipo: "distancia", valor_m: 10, texto: "10 metros" },
    duracao: { texto: "Instantâneo", sustentavel: false },
    resolucao: "resistencia",
  },
  payload_automacao: {
    efeitos: [
      { tipo: "efeito_com_resistencia", resistencia: { cd_formula: "5 + nivel_vertente", acoes: ["resistir"] } },
      { tipo: "aplicar_condicao", condicao: "atordoado" },
    ],
  },
  status: "published",
  versao: "1.0.0",
  created_at: "2026-07-14",
  updated_at: "2026-07-14",
};

export interface ExemploCanonico {
  id: string;
  descricao: string;
  adaptar: () => ResultadoAdaptacao[];
}

export const EXEMPLOS_OBRIGATORIOS: ExemploCanonico[] = [
  {
    id: "magia_dano_fogo",
    descricao: "Magia que causa 1d8 de dano de fogo",
    adaptar: () => [adaptSpell(EXEMPLO_MAGIA_DANO_FOGO)],
  },
  {
    id: "item_cura",
    descricao: "Item que cura 2d6 PV",
    adaptar: () => [adaptItem(EXEMPLO_ITEM_CURA)],
  },
  {
    id: "talento_modificador",
    descricao: "Talento que concede +1 em Luta por 1 rodada",
    adaptar: () => adaptarNiveisDeTalento(EXEMPLO_TALENTO_MODIFICADOR),
  },
  {
    id: "condicao_dano_fim_de_rodada",
    descricao: "Condição que causa 1d4 no fim da rodada",
    adaptar: () => [adaptCondition(EXEMPLO_CONDICAO_DANO_FIM_DE_RODADA)],
  },
  {
    id: "magia_resistencia_atordoado",
    descricao: "Magia com resistência que aplica Atordoado em falha",
    adaptar: () => [adaptSpell(EXEMPLO_MAGIA_RESISTENCIA_ATORDOADO)],
  },
];
