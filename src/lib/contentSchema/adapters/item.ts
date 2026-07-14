/**
 * Adapter de leitura para `content_type = "item"`
 * (`content/db_equipamentos_normalizado_v1_2.json`, schema `schema_equipamentos_v1_2.json`).
 *
 * `estatisticas` é campo livre no schema legado (sem sub-propriedades
 * fixas — varia por categoria: arma tem dado_dano/perícia/propriedades,
 * outras categorias têm outros campos). Decisão registrada em
 * `docs/SCHEMA_CANONICO_CONTEUDO_V1.md` §7.3: tratar como somente
 * leitura nesta etapa, preservado inteiro como campo desconhecido, em
 * vez de arriscar um mapeamento parcial/instável.
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
  "subtipo",
  "raridade",
  "raridade_label",
  "preco",
  "descricao_curta",
  "descricao_longa",
  "tags",
  "estatisticas",
  "payload_automacao",
  "status",
  "versao",
  "created_at",
  "updated_at",
];

export function adaptItem(raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");
  const automacao = asRecord(raw.payload_automacao);
  const efeitosBrutos = Array.isArray(automacao?.efeitos) ? automacao!.efeitos : [];

  const efeitos: EfeitoCanonico[] = efeitosBrutos.map((efeitoBruto, indice) => {
    const efeito = asRecord(efeitoBruto) ?? {};
    const tipoLegado = typeof efeito.tipo === "string" ? efeito.tipo : undefined;

    let payloadEspecifico: Record<string, unknown> = {};
    if (tipoLegado === "cura") {
      payloadEspecifico = { dado: efeito.dado, valorFixo: efeito.valor, recurso: efeito.recurso };
    } else if (tipoLegado === "aplicar_condicao" || tipoLegado === "remover_condicao") {
      payloadEspecifico = { condicao: normalizarReferencia(efeito.condicao, "condition") };
    } else if (tipoLegado === "dano" || tipoLegado === "dano_em_area") {
      payloadEspecifico = { dado: efeito.dado, tipoDano: efeito.tipo_dano, subtipoDano: efeito.subtipo_dano };
    } else if (tipoLegado === "recurso") {
      payloadEspecifico = { recurso: efeito.recurso, valor: efeito.valor };
    } else {
      payloadEspecifico = { ...efeito };
    }

    return construirEfeitoCanonico({
      slugPai: slug,
      indice,
      contentType: "item",
      tipoLegado,
      ordem: indice,
      gatilho: tipoLegado === "dano_em_area" ? "area" : undefined,
      payloadEspecifico,
    });
  });

  const referencias: Referencia[] = efeitos
    .filter((e) => e.tipo === "aplicar_condicao" || e.tipo === "remover_condicao")
    .map((e) => e.payloadEspecifico.condicao as Referencia | undefined)
    .filter((ref): ref is Referencia => ref !== undefined);

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "item",
    slug,
    nome: String(raw.nome ?? slug),
    categoria: typeof raw.categoria === "string" ? raw.categoria : undefined,
    subtipo: typeof raw.subtipo === "string" ? raw.subtipo : undefined,
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricaoLonga: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    tags: asTagArray(raw.tags),
    classificacao: {
      raridade: raw.raridade,
      preco: raw.preco,
    },
    efeitos,
    referencias,
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = [
    ...coletarCamposDesconhecidos(raw, CHAVES_TOPO_MAPEADAS),
    ...marcarCampoSomenteLeitura(
      "estatisticas",
      raw.estatisticas,
      "estatisticas não tem sub-propriedades fixas no schema legado (varia por categoria) — mantido somente leitura nesta etapa.",
    ),
  ];

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_com_confirmacao" };
}
