/**
 * Adapter de leitura para `content_type = "condition"`
 * (`content/db_condicoes_normalizado_v1_5.json`, schema `schema_condicoes_v1_5.json`).
 *
 * Adaptado nesta etapa (além do recorte de MVP magia/talento/item) para
 * cobrir o caso obrigatório 4 (dano no fim da rodada) e servir de alvo
 * de referência para `aplicar_condicao` nos demais adapters.
 *
 * `remove_por[]` e `acoes_habilitadas[]` ainda não têm representação
 * canônica própria (não fazem parte dos 6 efeitos do MVP) — ficam como
 * campo desconhecido preservado, não descartado.
 */

import { normalizarDuracao } from "../fields/duracao";
import type { CampoDesconhecido, ConteudoCanonico, EfeitoCanonico, ResultadoAdaptacao } from "../types";
import { coletarCamposDesconhecidos } from "../unknownFields";
import { asRecord, asTagArray, construirEfeitoCanonico } from "./common";

const CHAVES_TOPO_MAPEADAS = [
  "id",
  "slug",
  "nome",
  "categoria",
  "categoria_label",
  "descricao_curta",
  "descricao_longa",
  "tags",
  "duracao_padrao",
  "payload_automacao",
  "status",
  "versao",
  "created_at",
  "updated_at",
];

export function adaptCondition(raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");
  const automacao = asRecord(raw.payload_automacao);
  const efeitosBrutos = Array.isArray(automacao?.efeitos) ? automacao!.efeitos : [];

  const efeitos: EfeitoCanonico[] = efeitosBrutos.map((efeitoBruto, indice) => {
    const efeito = asRecord(efeitoBruto) ?? {};
    const tipoLegado = typeof efeito.tipo === "string" ? efeito.tipo : undefined;

    let payloadEspecifico: Record<string, unknown> = {};
    let gatilho: string | undefined;
    if (tipoLegado === "dano_fim_de_rodada") {
      payloadEspecifico = { dado: efeito.dano, tipoDano: efeito.tipo_dano };
      gatilho = "fim_de_rodada";
    } else if (tipoLegado === "modificador" || tipoLegado === "modificador_recebido") {
      payloadEspecifico = { valor: efeito.valor, alvoTags: efeito.alvo_tags, recebido: tipoLegado === "modificador_recebido" };
    } else {
      payloadEspecifico = { ...efeito };
    }

    return construirEfeitoCanonico({
      slugPai: slug,
      indice,
      contentType: "condition",
      tipoLegado,
      ordem: indice,
      gatilho,
      payloadEspecifico,
    });
  });

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "condition",
    slug,
    nome: String(raw.nome ?? slug),
    categoria: typeof raw.categoria === "string" ? raw.categoria : undefined,
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricaoLonga: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    tags: asTagArray(raw.tags),
    classificacao: {},
    duracao: normalizarDuracao(raw.duracao_padrao),
    efeitos,
    referencias: [],
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = coletarCamposDesconhecidos(raw, CHAVES_TOPO_MAPEADAS);

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_com_confirmacao" };
}
