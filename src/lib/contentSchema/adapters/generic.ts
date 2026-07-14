/**
 * Adapter genérico de fallback — usado pelos `content_type` ainda sem
 * adapter dedicado (rune, escalpo, property, combat_action,
 * character_rule, combat_field, combat_flow, master_table; ver
 * `contentTypeRegistry.ts`, `statusAdapter: "planejado"`).
 *
 * Garante que NENHUM content_type quebra ao passar por esta camada —
 * requisito explícito da Etapa 2 futura ("tipos desconhecidos não
 * quebram a tela") — preservando o payload inteiro como campo
 * desconhecido em vez de tentar interpretar um formato ainda não
 * auditado a fundo.
 */

import type { CampoDesconhecido, ContentTypeId, ConteudoCanonico, ResultadoAdaptacao } from "../types";
import { marcarCampoSomenteLeitura } from "../unknownFields";
import { asTagArray } from "./common";

export function adaptGenerico(contentType: ContentTypeId, raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType,
    slug,
    nome: String(raw.nome ?? slug ?? "Sem nome"),
    tags: asTagArray(raw.tags),
    classificacao: {},
    efeitos: [],
    referencias: [],
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = marcarCampoSomenteLeitura(
    "$",
    raw,
    `Adapter dedicado para "${contentType}" ainda não implementado (Etapa 1 cobriu spell/talent/item/condition) — payload preservado inteiro.`,
  );

  return { canonico, camposDesconhecidos, classificacaoLegado: "somente_leitura" };
}
