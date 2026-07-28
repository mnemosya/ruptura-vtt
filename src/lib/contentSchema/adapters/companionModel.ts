/**
 * Adapter de leitura para `content_type = "companion_model"`
 * (`content/db_companion_models_v1.json`, coleção `modelos_companheiros`).
 *
 * Fonte dos dados: `docs/fontes/DRONES E ROBÔS....md` — catálogo oficial
 * de 5 modelos de drone + 5 de robô. Este adapter só projeta o payload
 * para o envelope canônico da Biblioteca (identificação/classificação/
 * texto/mercado); não interpreta `acoes[]` como `EfeitoCanonico` — ações
 * de drone/robô continuam resolvidas pela execução bespoke em
 * `talentEngine.ts` (registerDrone/registerRobo), o catálogo aqui é só
 * fonte de dados para a UI preencher (nome, custo de PA, descrição).
 *
 * `pa_maximo` só existe para robôs (drones não têm PA próprio — ver
 * checkpoint de Sinal Limpo); `cd_ser_percebido` só existe no Drone
 * Mosca; `habilidade_especial` só existe no Robô Ceifador — todos os
 * três são opcionais e preservados tal como vierem, nunca inventados.
 */

import type { CampoDesconhecido, ConteudoCanonico, ResultadoAdaptacao } from "../types";
import { coletarCamposDesconhecidos } from "../unknownFields";
import { asTagArray } from "./common";

const CHAVES_TOPO_MAPEADAS = [
  "id",
  "slug",
  "nome",
  "categoria",
  "raridade",
  "preco",
  "alcance_controle",
  "cd_operar",
  "atributos",
  "pd_maximo",
  "pa_maximo",
  "acoes",
  "cd_ser_percebido",
  "habilidade_especial",
  "descricao_curta",
  "tags",
  "status",
  "versao",
  "created_at",
  "updated_at",
];

export function adaptCompanionModel(raw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(raw.slug ?? raw.id ?? "");

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "companion_model",
    slug,
    nome: String(raw.nome ?? slug),
    categoria: typeof raw.categoria === "string" ? raw.categoria : undefined,
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    tags: asTagArray(raw.tags),
    classificacao: {
      raridade: raw.raridade,
      preco: raw.preco,
      alcanceControle: raw.alcance_controle,
      cdOperar: raw.cd_operar,
      atributos: raw.atributos,
      pdMaximo: raw.pd_maximo,
      paMaximo: raw.pa_maximo,
      acoes: raw.acoes,
      cdSerPercebido: raw.cd_ser_percebido,
      habilidadeEspecial: raw.habilidade_especial,
    },
    efeitos: [],
    referencias: [],
    status: typeof raw.status === "string" ? raw.status : "published",
    versao: typeof raw.versao === "string" ? raw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = coletarCamposDesconhecidos(raw, CHAVES_TOPO_MAPEADAS);

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_com_confirmacao" };
}
