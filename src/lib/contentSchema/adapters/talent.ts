/**
 * Adapter de leitura para `content_type = "talent"`
 * (`content/db_talentos_normalizado_v1_3.json`, schema `schema_talentos_v1_3.json`).
 *
 * Opera por NÍVEL de talento (`talento.niveis[i]`), não pelo talento
 * inteiro — cada nível carrega seu próprio `payload_automacao`. O
 * chamador (ver `adapters/index.ts`) itera `niveis[]` e monta um
 * `ConteudoCanonico` por nível, usando `talento.slug` como árvore.
 *
 * `familia` (20 valores de despacho, ex.: modificador/companheiro/
 * buff_empilhavel/reacao) é um conceito só deste content_type — não
 * existe em nenhum outro. É preservada dentro de `payloadEspecifico`
 * quando o efeito cai no balde "outro".
 */

import { normalizarDuracao } from "../fields/duracao";
import type { CampoDesconhecido, ConteudoCanonico, EfeitoCanonico, Referencia, ResultadoAdaptacao } from "../types";
import { coletarCamposDesconhecidos } from "../unknownFields";
import { asRecord, asTagArray, construirEfeitoCanonico } from "./common";

const CHAVES_NIVEL_MAPEADAS = [
  "id",
  "slug",
  "talento_id",
  "nivel",
  "nome",
  "requisitos",
  "tags",
  "descricao_curta",
  "descricao_longa",
  "payload_automacao",
  "status",
  "versao",
  "created_at",
  "updated_at",
];

export function adaptTalentLevel(talentoSlug: string, talentoNome: string, nivelRaw: Record<string, unknown>): ResultadoAdaptacao {
  const slug = String(nivelRaw.slug ?? `${talentoSlug}-n${nivelRaw.nivel ?? "?"}`);
  const automacao = asRecord(nivelRaw.payload_automacao);
  const efeitosBrutos = Array.isArray(automacao?.efeitos) ? automacao!.efeitos : [];

  const efeitos: EfeitoCanonico[] = efeitosBrutos.map((efeitoBruto, indice) => {
    const efeito = asRecord(efeitoBruto) ?? {};
    const tipoLegado = typeof efeito.tipo === "string" ? efeito.tipo : undefined;

    let payloadEspecifico: Record<string, unknown> = {};
    if (tipoLegado === "modificador") {
      payloadEspecifico = {
        valor: efeito.valor,
        alvoTags: efeito.alvo_tags,
        alvoAcoes: efeito.alvo_acoes,
        alvoTexto: efeito.alvo_texto,
      };
    } else {
      payloadEspecifico = { ...efeito, familia: efeito.familia };
    }

    return construirEfeitoCanonico({
      slugPai: slug,
      indice,
      contentType: "talent",
      tipoLegado,
      ordem: indice,
      duracao: normalizarDuracao(efeito.duracao),
      payloadEspecifico,
    });
  });

  const requisitosBrutos = Array.isArray(nivelRaw.requisitos) ? nivelRaw.requisitos : [];
  const referencias: Referencia[] = requisitosBrutos
    .map((r) => asRecord(r))
    .filter((r): r is Record<string, unknown> => r !== undefined && r.tipo === "talento_nivel_adquirido" && typeof r.talento_id === "string")
    .map((r) => ({ tipoConteudo: "talent" as const, slug: String(r.talento_id), papel: `requisito_nivel_${String(r.nivel ?? "?")}` }));

  const canonico: ConteudoCanonico = {
    schemaVersion: "content.v1",
    contentType: "talent",
    slug,
    nome: String(nivelRaw.nome ?? `${talentoNome} — nível ${String(nivelRaw.nivel ?? "?")}`),
    tags: asTagArray(nivelRaw.tags),
    descricaoCurta: typeof nivelRaw.descricao_curta === "string" ? nivelRaw.descricao_curta : undefined,
    descricaoLonga: typeof nivelRaw.descricao_longa === "string" ? nivelRaw.descricao_longa : undefined,
    classificacao: {
      arvore: talentoSlug,
      nivel: nivelRaw.nivel,
    },
    efeitos,
    referencias,
    status: typeof nivelRaw.status === "string" ? nivelRaw.status : "published",
    versao: typeof nivelRaw.versao === "string" ? nivelRaw.versao : undefined,
    origem: {},
  };

  const camposDesconhecidos: CampoDesconhecido[] = coletarCamposDesconhecidos(nivelRaw, CHAVES_NIVEL_MAPEADAS);

  return { canonico, camposDesconhecidos, classificacaoLegado: "conversao_com_confirmacao" };
}
