/**
 * Adapter de leitura para `content_type = "rune"`
 * (`content/db_runas_normalizado_v1_2.json`, schema `schema_runas_v1_2.json`).
 *
 * Etapa 9: substitui o fallback genérico (`adapters/generic.ts`) que
 * cobria `rune` até aqui (`contentTypeRegistry.ts` já sinalizava
 * `statusAdapter: "planejado" ... "até Etapa 9"`). Mapeia os campos de
 * topo REAIS do schema (`slots_possiveis`, `restricao_subtipo`,
 * `requisito_pericia`, `custo_integridade` — sempre 0 no conteúdo real,
 * exclusivo de escalpo) e reaproveita o mesmo `construirEfeitoCanonico`
 * dos demais adapters para os efeitos, com o vocabulário `tipo` REAL de
 * runa: `aplicar_condicao | ataque_adicional | autorreparo |
 * dano_modificador | economia_pa | efeito_com_resistencia | modificador |
 * narrativo | protecao | reacao | recurso | revelar | utilitario`.
 *
 * `payload_automacao.efeitos[]` do schema de runa tem
 * `additionalProperties: true` — campos bespoke (ex.: `restrito_a`,
 * `nota`) são preservados dentro de `payloadEspecifico` (nunca
 * descartados), mesmo padrão dos demais adapters (`else { ...efeito }`).
 */

import { normalizarReferencia } from "../fields/referencia";
import type { CampoDesconhecido, ConteudoCanonico, EfeitoCanonico, Referencia, ResultadoAdaptacao } from "../types";
import { coletarCamposDesconhecidos, marcarCampoSomenteLeitura } from "../unknownFields";
import { asRecord, asTagArray, construirEfeitoCanonico } from "./common";

const CHAVES_TOPO_MAPEADAS = [
  "id",
  "slug",
  "nome",
  "categoria",
  "categoria_label",
  "raridade",
  "raridade_label",
  "preco",
  "descricao_curta",
  "descricao_longa",
  "tags",
  "slots_possiveis",
  "restricao_subtipo",
  "custo_integridade",
  "requisito_pericia",
  "payload_automacao",
  "status",
  "versao",
  "created_at",
  "updated_at",
];

export function adaptRune(raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");
  const automacao = asRecord(raw.payload_automacao);
  const efeitosBrutos = Array.isArray(automacao?.efeitos) ? automacao!.efeitos : [];

  const efeitos: EfeitoCanonico[] = efeitosBrutos.map((efeitoBruto, indice) => {
    const efeito = asRecord(efeitoBruto) ?? {};
    const tipoLegado = typeof efeito.tipo === "string" ? efeito.tipo : undefined;

    let payloadEspecifico: Record<string, unknown> = {};
    if (tipoLegado === "aplicar_condicao") {
      payloadEspecifico = { condicao: normalizarReferencia(efeito.condicao, "condition"), gatilho: efeito.gatilho };
    } else if (tipoLegado === "dano_modificador") {
      payloadEspecifico = { dado: efeito.dado, tipoDano: efeito.tipo_dano, subtipoDano: efeito.subtipo_dano, usos: efeito.usos, cadencia: efeito.cadencia };
    } else if (tipoLegado === "recurso") {
      payloadEspecifico = { recurso: efeito.recurso, valor: efeito.valor };
    } else if (tipoLegado === "modificador") {
      payloadEspecifico = { bonus: efeito.bonus, alvoTags: efeito.alvo_tags, restritoA: efeito.restrito_a };
    } else if (tipoLegado === "autorreparo") {
      payloadEspecifico = { gatilho: efeito.gatilho, efeito: efeito.efeito };
    } else {
      payloadEspecifico = { ...efeito };
    }

    return construirEfeitoCanonico({
      slugPai: slug,
      indice,
      contentType: "rune",
      tipoLegado,
      ordem: indice,
      gatilho: typeof efeito.gatilho === "string" ? efeito.gatilho : undefined,
      payloadEspecifico,
    });
  });

  const referencias: Referencia[] = efeitos
    .filter((e) => e.tipo === "aplicar_condicao")
    .map((e) => e.payloadEspecifico.condicao as Referencia | undefined)
    .filter((ref): ref is Referencia => ref !== undefined);

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "rune",
    slug,
    nome: String(raw.nome ?? slug),
    categoria: "runa",
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricaoLonga: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    tags: asTagArray(raw.tags),
    classificacao: {
      raridade: raw.raridade,
      preco: raw.preco,
      slotsPossiveis: raw.slots_possiveis,
      restricaoSubtipo: raw.restricao_subtipo,
      requisitoPericia: raw.requisito_pericia,
    },
    efeitos,
    referencias,
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = [
    ...coletarCamposDesconhecidos(raw, CHAVES_TOPO_MAPEADAS),
    // `custo_integridade` é sempre 0 em runa real (exclusivo de escalpo) — preservado somente leitura,
    // nunca reintroduzido como regra editável (ver serializarRuna, publishSerialization.ts).
    ...marcarCampoSomenteLeitura(
      "custo_integridade",
      raw.custo_integridade,
      "Runas não têm custo de Integridade (exclusivo de escalpo) — sempre 0, fixado na serialização, nunca editável.",
    ),
  ];

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_com_confirmacao" };
}
