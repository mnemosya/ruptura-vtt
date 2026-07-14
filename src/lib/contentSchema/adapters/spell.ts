/**
 * Adapter de leitura para `content_type = "spell"`
 * (`content/db_magias_normalizado_v1_3.json`, schema `schema_magias_v1_3.json`).
 *
 * Formato real (ver auditoria §3, schema canônico §3): `estatisticas` é
 * um objeto tipado (nivel, tipo_magia, custo_pa, custo_mana, alcance,
 * duracao, resolucao, area); `payload_automacao.efeitos[]` usa um
 * vocabulário fechado de 9 tipos. É o content_type menos legado do
 * conjunto — praticamente nada sobra como campo desconhecido.
 */

import { normalizarDuracao } from "../fields/duracao";
import { normalizarReferencia } from "../fields/referencia";
import { normalizarResistencia } from "../fields/resistencia";
import type { CampoDesconhecido, ConteudoCanonico, EfeitoCanonico, Referencia, ResultadoAdaptacao } from "../types";
import { coletarCamposDesconhecidos } from "../unknownFields";
import { asRecord, asTagArray, construirEfeitoCanonico } from "./common";

const CHAVES_TOPO_MAPEADAS = [
  "id",
  "slug",
  "nome",
  "categoria",
  "categoria_label",
  "vertente",
  "vertente_label",
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

const CHAVES_ESTATISTICAS_MAPEADAS = [
  "nivel",
  "tipo_magia",
  "custo_pa",
  "custo_mana",
  "usa_reacao",
  "alcance",
  "duracao",
  "resolucao",
  "area",
  "pericia_teste",
  "atributo_ataque",
];

export function adaptSpell(raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");
  const estatisticas = asRecord(raw.estatisticas) ?? {};
  const automacao = asRecord(raw.payload_automacao);
  const efeitosBrutos = Array.isArray(automacao?.efeitos) ? automacao!.efeitos : [];

  const resistenciaEfeitoBruto = efeitosBrutos.find((e) => asRecord(e)?.tipo === "efeito_com_resistencia");
  const resistencia = normalizarResistencia(asRecord(resistenciaEfeitoBruto)?.resistencia);

  const efeitos: EfeitoCanonico[] = efeitosBrutos.map((efeitoBruto, indice) => {
    const efeito = asRecord(efeitoBruto) ?? {};
    const tipoLegado = typeof efeito.tipo === "string" ? efeito.tipo : undefined;

    let payloadEspecifico: Record<string, unknown> = {};
    if (tipoLegado === "dano") {
      payloadEspecifico = {
        dado: efeito.dado,
        tipoDano: efeito.tipo_dano,
        subtipoDano: efeito.subtipo_dano,
        sucesso: efeito.sucesso,
      };
    } else if (tipoLegado === "aplicar_condicao" || tipoLegado === "remover_condicao") {
      payloadEspecifico = { condicao: normalizarReferencia(efeito.condicao, "condition") };
    } else if (tipoLegado === "cura") {
      payloadEspecifico = { dado: efeito.dado, recurso: efeito.recurso };
    } else if (tipoLegado === "efeito_com_resistencia") {
      const res = normalizarResistencia(efeito.resistencia);
      payloadEspecifico = { pericia: res?.pericia, cdFormula: res?.cdFormula, cdValor: res?.cdValor, acoes: res?.acoes };
    } else if (tipoLegado === "recurso" || tipoLegado === "recurso_temporario") {
      payloadEspecifico = { recurso: efeito.recurso, valor: efeito.valor, dado: efeito.dado };
    } else if (tipoLegado === "modificador") {
      payloadEspecifico = { valor: efeito.valor, alvoTags: efeito.alvo_tags };
    } else {
      payloadEspecifico = { ...efeito };
    }

    return construirEfeitoCanonico({
      slugPai: slug,
      indice,
      contentType: "spell",
      tipoLegado,
      ordem: indice,
      payloadEspecifico,
    });
  });

  const referencias: Referencia[] = efeitos
    .filter((e) => e.tipo === "aplicar_condicao" || e.tipo === "remover_condicao")
    .map((e) => e.payloadEspecifico.condicao as Referencia | undefined)
    .filter((ref): ref is Referencia => ref !== undefined);

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "spell",
    slug,
    nome: String(raw.nome ?? slug),
    categoria: typeof raw.categoria === "string" ? raw.categoria : undefined,
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricaoLonga: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    tags: asTagArray(raw.tags),
    classificacao: {
      vertente: raw.vertente,
      nivel: estatisticas.nivel,
      tipoMagia: estatisticas.tipo_magia,
      custoPa: estatisticas.custo_pa,
      custoMana: estatisticas.custo_mana,
      usaReacao: estatisticas.usa_reacao,
      alcance: estatisticas.alcance,
      area: estatisticas.area,
      resolucao: estatisticas.resolucao,
    },
    duracao: normalizarDuracao(estatisticas.duracao),
    resistencia,
    efeitos,
    referencias,
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = [
    ...coletarCamposDesconhecidos(raw, CHAVES_TOPO_MAPEADAS),
    ...coletarCamposDesconhecidos(estatisticas, CHAVES_ESTATISTICAS_MAPEADAS, "estatisticas"),
  ];

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_direta" };
}
