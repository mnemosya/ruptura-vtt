/**
 * Registro canônico de tipos de conteúdo (aditivo §13.1, plano §1).
 *
 * Única fonte de verdade sobre quais `content_type` existem, como são
 * armazenados hoje (`supabase/migrations/0001_content_library.sql`,
 * `scripts/seed-content.ts`) e quais seções do editor futuro cada um
 * habilita. O editor e o motor devem consultar este registro em vez de
 * hardcodear condicionais por `content_type` espalhadas pelo código.
 */

import type { ContentTypeId } from "./types";

export type SecaoEditor =
  | "identificacao"
  | "classificacao"
  | "texto"
  | "requisitos"
  | "ativacao"
  | "alvo_alcance_area"
  | "duracao"
  | "usos_cadencia"
  | "efeitos"
  | "relacoes"
  | "mercado"
  | "equipamento_instancia";

export type StatusAdapter = "implementado" | "planejado";

export interface ContentTypeDefinition {
  id: ContentTypeId;
  label: string;
  modoArmazenamento: "singleton" | "collection";
  /** Chave da coleção dentro do arquivo `db_*.json` (só quando collection). */
  colecaoChave?: string;
  secoesAplicaveis: SecaoEditor[];
  statusAdapter: StatusAdapter;
  observacao?: string;
}

export const CONTENT_TYPE_REGISTRY: Record<ContentTypeId, ContentTypeDefinition> = {
  spell: {
    id: "spell",
    label: "Magia",
    modoArmazenamento: "collection",
    colecaoChave: "magias",
    secoesAplicaveis: [
      "identificacao",
      "classificacao",
      "texto",
      "ativacao",
      "alvo_alcance_area",
      "duracao",
      "efeitos",
      "relacoes",
    ],
    statusAdapter: "implementado",
  },
  talent: {
    id: "talent",
    label: "Talento",
    modoArmazenamento: "collection",
    colecaoChave: "talentos",
    secoesAplicaveis: [
      "identificacao",
      "classificacao",
      "texto",
      "requisitos",
      "ativacao",
      "usos_cadencia",
      "duracao",
      "efeitos",
      "relacoes",
    ],
    statusAdapter: "implementado",
    observacao:
      "O adapter opera por nível de talento (talento.niveis[i]), não pelo talento inteiro — cada nível tem seu próprio payload_automacao.",
  },
  item: {
    id: "item",
    label: "Item / Equipamento",
    modoArmazenamento: "collection",
    colecaoChave: "itens",
    secoesAplicaveis: [
      "identificacao",
      "classificacao",
      "texto",
      "ativacao",
      "usos_cadencia",
      "efeitos",
      "relacoes",
      "mercado",
      "equipamento_instancia",
    ],
    statusAdapter: "implementado",
    observacao:
      "estatisticas é campo livre no schema atual (sem sub-propriedades fixas) — tratado como somente leitura nesta etapa (docs/SCHEMA_CANONICO_CONTEUDO_V1.md §7.3).",
  },
  condition: {
    id: "condition",
    label: "Condição",
    modoArmazenamento: "collection",
    colecaoChave: "condicoes",
    secoesAplicaveis: ["identificacao", "texto", "duracao", "efeitos", "relacoes"],
    statusAdapter: "implementado",
    observacao: "Adaptado nesta etapa para suportar o caso obrigatório 4/5 (dano fim de rodada, referência em falha de resistência).",
  },
  rune: {
    id: "rune",
    label: "Runa",
    modoArmazenamento: "collection",
    colecaoChave: "runas",
    secoesAplicaveis: ["identificacao", "texto", "efeitos", "mercado"],
    statusAdapter: "implementado",
    observacao: "Etapa 9: adapter dedicado (adapters/rune.ts) + 4º content type editável no Editor Universal (slots_possiveis/restricao_subtipo/requisito_pericia + catálogo universal de efeitos).",
  },
  escalpo: {
    id: "escalpo",
    label: "Escalpo",
    modoArmazenamento: "collection",
    colecaoChave: "escalpos",
    secoesAplicaveis: ["identificacao", "texto", "requisitos", "efeitos", "mercado"],
    statusAdapter: "planejado",
  },
  property: {
    id: "property",
    label: "Propriedade de arma",
    modoArmazenamento: "collection",
    colecaoChave: "propriedades",
    secoesAplicaveis: ["identificacao", "texto", "efeitos"],
    statusAdapter: "planejado",
  },
  combat_action: {
    id: "combat_action",
    label: "Ação de combate",
    modoArmazenamento: "collection",
    colecaoChave: "acoes",
    secoesAplicaveis: ["identificacao", "texto", "ativacao", "efeitos"],
    statusAdapter: "planejado",
  },
  character_rule: {
    id: "character_rule",
    label: "Regras de personagem",
    modoArmazenamento: "singleton",
    secoesAplicaveis: ["identificacao", "texto"],
    statusAdapter: "planejado",
    observacao:
      "Singleton — perícias, atributos, vertentes/tipos de dano vivem soterrados dentro do payload (auditoria §2.1). Não viram registro próprio nesta etapa.",
  },
  combat_field: {
    id: "combat_field",
    label: "Campo de combate",
    modoArmazenamento: "singleton",
    secoesAplicaveis: ["identificacao", "texto"],
    statusAdapter: "planejado",
  },
  combat_flow: {
    id: "combat_flow",
    label: "Fluxo de combate",
    modoArmazenamento: "singleton",
    secoesAplicaveis: ["identificacao", "texto"],
    statusAdapter: "planejado",
  },
  master_table: {
    id: "master_table",
    label: "Tabela mestra",
    modoArmazenamento: "singleton",
    secoesAplicaveis: ["identificacao", "texto"],
    statusAdapter: "planejado",
    observacao: "50 master_tables + 11 content_tables hoje são um array só dentro do singleton — sem registro individual (auditoria §2.1).",
  },
};

export function getContentTypeDefinition(id: ContentTypeId): ContentTypeDefinition {
  return CONTENT_TYPE_REGISTRY[id];
}

export function listContentTypesComAdapter(): ContentTypeDefinition[] {
  return Object.values(CONTENT_TYPE_REGISTRY).filter((def) => def.statusAdapter === "implementado");
}
