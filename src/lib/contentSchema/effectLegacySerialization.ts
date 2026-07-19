/**
 * Serialização REVERSA de efeitos: `EfeitoEditavel` (Construtor de
 * Efeitos, Etapa 4) → objeto de efeito no formato legado de
 * `payload_automacao.efeitos[]` (o que `content_documents.payload`
 * guarda e os consumidores do jogo/schemas oficiais leem).
 *
 * CORREÇÃO PÓS-ETAPA 5 (ver
 * docs/CHECKPOINT_CORRECAO_METADATA_EDITOR_PUBLICACAO.md): a versão
 * anterior embutia um blob `_editor` com o `EfeitoEditavel` completo
 * dentro de CADA efeito publicado. Os schemas oficiais de magia
 * (`schema_magias_v1_3.json`) e talento (`schema_talentos_v1_3.json`)
 * têm `additionalProperties: false` no objeto de efeito — `_editor`
 * tornava esse conteúdo publicado INVÁLIDO contra o próprio contrato.
 * Equipamentos (`schema_equipamentos_v1_2.json`) tem
 * `additionalProperties: true` no efeito, mas `_editor` continua sendo
 * metadado administrativo que não pertence à regra publicada — por
 * isso NUNCA é emitido aqui, para nenhum content_type.
 *
 * A metadata editorial completa (`EfeitoEditavel[]`, com `id`,
 * `habilitado`, `gatilho`, `alvo`, `duracao`, `nomeOpcional`,
 * `textoLog`, `textoLembrete` e todos os campos por tipo) É PRESERVADA
 * — só que numa tabela administrativa separada
 * (`content_editor_metadata`, migration 0023), nunca no payload
 * público. Ver `publishServerActions.ts` (grava) e
 * `draftServerActions.ts::criarRascunhoDeEdicao` (relê, com fallback
 * para os adapters legados quando não há metadata).
 *
 * Cada `(contentType, tipoCanonico)` só emite as chaves CONFIRMADAS por
 * auditoria direta dos schemas reais — nunca um superconjunto genérico.
 * Quando o efeito configurado no editor não é representável no
 * vocabulário legado daquele content_type (ex.: `alterar_recurso` com
 * recurso "pa" numa MAGIA, cujo schema só aceita pv/pe/mana), a
 * publicação é BLOQUEADA por `validarEfeitoParaPublicacao` — nunca gera
 * um payload inválido silenciosamente.
 */

import type { DraftContentType } from "./draftTypes";
import type { EfeitoEditavel } from "./effectDraftTypes";

// ---------------------------------------------------------------------
// Enums confirmados por leitura direta dos schemas oficiais (auditoria).
// ---------------------------------------------------------------------

/** `condicao` — mesma lista nos 17 slugs em schema_magias_v1_3.json e schema_equipamentos_v1_2.json. */
const CONDICOES_ENUM = new Set([
  "agarrado", "agarrando", "atordoado", "caido", "cego", "contundido", "envenenado", "imobilizado",
  "inconsciente", "insaturado", "lento", "ofuscado", "queimando", "sangrando", "saturado", "sufocando", "surdo",
]);

/** `recurso` em efeito de magia (cura/recurso/recurso_temporario) — schema_magias_v1_3.json restringe a pv/pe/mana. */
const RECURSO_SPELL_ENUM = new Set(["pv", "pe", "mana"]);

/** `pericia`/`alvo_tags` em efeito de magia — enum de perícias do schema_magias_v1_3.json. */
const PERICIA_SPELL_ENUM = new Set([
  "arcanismo", "artes", "balistica", "biologia", "carisma", "engenharia", "furtividade", "influencia",
  "intimidacao", "logica", "luta", "mobilidade", "percepcao", "precisao", "psicologia", "reflexos",
  "robotica", "sociedade", "tecnomagia", "vigor", "vontade",
]);

/** `tipo_dano`/`subtipo_dano` em efeito de item — schema_equipamentos_v1_2.json restringe (magia é livre, sem enum). */
const TIPO_DANO_ITEM_ENUM = new Set(["acido", "energetico", "fisico", "psiquico", "toxico", "trauma"]);
const SUBTIPO_DANO_ITEM_ENUM = new Set(["cortante", "contundente", "perfurante", "igneo", "gelido", "eletrico", "acido", "toxico", "psiquico", "trauma"]);

function limpar(obj: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "") saida[k] = v;
  }
  return saida;
}

function formula(quantidadeDados: number | undefined, faces: number | undefined): string | undefined {
  if (quantidadeDados == null || faces == null) return undefined;
  return `${quantidadeDados}d${faces}`;
}

/**
 * Valida se um efeito editável é representável no vocabulário legado
 * daquele content_type. Retorna mensagens de erro BLOQUEANTES (vazio =
 * representável). Chamado pela revisão de publicação — nunca a
 * publicação em si tenta "salvar o que der" silenciosamente.
 */
export function validarEfeitoParaPublicacao(contentType: DraftContentType, efeito: EfeitoEditavel): string[] {
  const erros: string[] = [];
  const rotulo = efeito.nomeOpcional || efeito.tipo;

  if (contentType === "spell") {
    switch (efeito.tipo) {
      case "cura":
        if (!RECURSO_SPELL_ENUM.has(efeito.campos.recurso)) {
          erros.push(`Efeito "${rotulo}": recurso "${efeito.campos.recurso}" não é compatível com o contrato de magias (aceita apenas pv/pe/mana).`);
        }
        break;
      case "alterar_recurso":
        if (!RECURSO_SPELL_ENUM.has(efeito.campos.recurso)) {
          erros.push(`Efeito "${rotulo}": recurso "${efeito.campos.recurso}" não é compatível com o contrato de magias (aceita apenas pv/pe/mana).`);
        }
        break;
      case "aplicar_condicao":
        if (!efeito.campos.condicaoSlug || !CONDICOES_ENUM.has(efeito.campos.condicaoSlug)) {
          erros.push(`Efeito "${rotulo}": condição "${efeito.campos.condicaoSlug || "(vazia)"}" não é reconhecida pelo contrato de magias.`);
        }
        break;
      case "remover_condicao":
        if (efeito.campos.removerTodas) {
          erros.push(`Efeito "${rotulo}": "remover todas as condições" não é representável no contrato de magias (exige uma condição específica) — escolha uma condição.`);
        } else if (!efeito.campos.condicaoSlug || !CONDICOES_ENUM.has(efeito.campos.condicaoSlug)) {
          erros.push(`Efeito "${rotulo}": condição "${efeito.campos.condicaoSlug || "(vazia)"}" não é reconhecida pelo contrato de magias.`);
        }
        break;
      case "modificar_teste": {
        const tagsInvalidas = efeito.campos.tags.filter((t) => !PERICIA_SPELL_ENUM.has(t));
        if (tagsInvalidas.length > 0) {
          erros.push(`Efeito "${rotulo}": tags de perícia [${tagsInvalidas.join(", ")}] não são reconhecidas pelo contrato de magias.`);
        }
        if (efeito.campos.valor == null && efeito.campos.tags.length === 0) {
          erros.push(`Efeito "${rotulo}": modificar teste em magia precisa de um valor numérico ou de ao menos uma tag de perícia reconhecida.`);
        }
        break;
      }
      case "dano":
        if (!efeito.campos.tipoDano) {
          erros.push(`Efeito "${rotulo}": dano em magia exige um tipo de dano.`);
        }
        break;
    }
  }

  if (contentType === "item") {
    switch (efeito.tipo) {
      case "dano":
        if (efeito.campos.tipoDano && !TIPO_DANO_ITEM_ENUM.has(efeito.campos.tipoDano)) {
          erros.push(`Efeito "${rotulo}": tipo de dano "${efeito.campos.tipoDano}" não é reconhecido pelo contrato de itens.`);
        }
        if (efeito.campos.subtipoDano && !SUBTIPO_DANO_ITEM_ENUM.has(efeito.campos.subtipoDano)) {
          erros.push(`Efeito "${rotulo}": subtipo de dano "${efeito.campos.subtipoDano}" não é reconhecido pelo contrato de itens.`);
        }
        break;
      case "aplicar_condicao":
        if (!efeito.campos.condicaoSlug || !CONDICOES_ENUM.has(efeito.campos.condicaoSlug)) {
          erros.push(`Efeito "${rotulo}": condição "${efeito.campos.condicaoSlug || "(vazia)"}" não é reconhecida pelo contrato de itens.`);
        }
        break;
      case "remover_condicao":
        if (efeito.campos.removerTodas) {
          erros.push(`Efeito "${rotulo}": "remover todas as condições" não é representável no contrato de itens — escolha uma condição específica ou uma lista de condições possíveis.`);
        } else if (!efeito.campos.selecaoManual && (!efeito.campos.condicaoSlug || !CONDICOES_ENUM.has(efeito.campos.condicaoSlug))) {
          erros.push(`Efeito "${rotulo}": condição "${efeito.campos.condicaoSlug || "(vazia)"}" não é reconhecida pelo contrato de itens.`);
        }
        break;
    }
  }

  // Talento: gatilho/alvo/duracao/condicao/recurso/valor são tipados livremente
  // no schema (qualquer JSON) — só alvo_tags/alvo_acoes têm enum próprio,
  // e a Etapa 4 não expõe alvo_acoes com esses valores específicos, então
  // não há combinação bloqueante conhecida para talento hoje.

  return erros;
}

/** `familia` (obrigatório em talento) por tipo canônico — enum fixo do schema, sem opção "dano"/"cura" dedicada. */
const FAMILIA_TALENTO: Record<EfeitoEditavel["tipo"], string> = {
  dano: "regra_especial",
  cura: "regra_especial",
  aplicar_condicao: "aplicar_condicao",
  remover_condicao: "regra_especial",
  modificar_teste: "modificador",
  alterar_recurso: "recurso",
};

/** `tipo` legado a emitir, por content_type — só valores confirmados no enum real (spell/item) ou livres (talent). */
const TIPO_LEGADO: Record<DraftContentType, Partial<Record<EfeitoEditavel["tipo"], string>>> = {
  spell: { dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso" },
  // "dano" não existe no enum de tipo do schema de equipamentos — só "dano_em_area".
  item: { dano: "dano_em_area", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso" },
  talent: { dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso" },
};

/** Campos específicos por (content_type, tipo) — só chaves confirmadas pelos schemas reais. Nunca gatilho/alvo/duracao/habilitado/nome/_editor para spell/item; talento permite gatilho/alvo/duracao (tipado livre) mas não habilitado/nome/texto_log. */
function camposLegadoPorTipo(contentType: DraftContentType, efeito: EfeitoEditavel): Record<string, unknown> {
  switch (efeito.tipo) {
    case "dano": {
      const cp = efeito.campos;
      const dado = cp.tipoFormula === "fixo" ? undefined : formula(cp.quantidadeDados, cp.faces);
      if (contentType === "spell") {
        return { dado, valor: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano, sucesso: cp.metadeEmSucesso ? "metade" : undefined };
      }
      if (contentType === "item") {
        return { dado, valor: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano, sucesso: cp.metadeEmSucesso ? "metade" : undefined };
      }
      // talent: dado/valor tipados livremente; sem tipo_dano/subtipo_dano no schema.
      return { dado, valor: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined };
    }
    case "cura": {
      const cp = efeito.campos;
      const dado = cp.tipoFormula === "fixo" ? undefined : formula(cp.quantidadeDados, cp.faces);
      return { dado, valor: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined, recurso: cp.recurso };
    }
    case "aplicar_condicao":
      return { condicao: efeito.campos.condicaoSlug || undefined };
    case "remover_condicao": {
      const cp = efeito.campos;
      if (contentType === "item" && cp.selecaoManual && cp.condicoesPossiveis.length > 0) {
        return { condicoes_possiveis: cp.condicoesPossiveis };
      }
      return { condicao: cp.condicaoSlug || undefined };
    }
    case "modificar_teste": {
      const cp = efeito.campos;
      const valorComSinal = cp.valor == null ? undefined : cp.modo === "penalidade" ? -Math.abs(cp.valor) : cp.valor;
      if (contentType === "talent") {
        return { valor: valorComSinal, alvo_tags: cp.tags.length > 0 ? cp.tags : undefined, pericias: cp.pericia ? [cp.pericia] : undefined };
      }
      // spell/item: alvo_tags restrito ao vocabulário de perícia real.
      return { valor: valorComSinal, alvo_tags: cp.tags.length > 0 ? cp.tags : undefined };
    }
    case "alterar_recurso": {
      const cp = efeito.campos;
      return { recurso: cp.recurso, valor: cp.valorFixo };
    }
  }
}

/** Campos transversais só onde o schema realmente os define (hoje: só talento — gatilho/alvo/duracao). */
function camposTransversaisLegado(contentType: DraftContentType, efeito: EfeitoEditavel): Record<string, unknown> {
  if (contentType !== "talent") return {};
  const c: Record<string, unknown> = {};
  if (efeito.gatilho) c.gatilho = efeito.gatilho;
  if (efeito.alvo) c.alvo = efeito.alvo;
  if (efeito.duracao) c.duracao = efeito.duracao;
  return c;
}

/**
 * Serializa UM efeito editável para o objeto legado — só chaves
 * confirmadas pelo schema real daquele content_type. Sem `_editor`, sem
 * `habilitado`/`nome`/`texto_log` (vivem só em `content_editor_metadata`).
 */
export function serializarEfeitoLegado(contentType: DraftContentType, efeito: EfeitoEditavel): Record<string, unknown> {
  const tipoLegado = TIPO_LEGADO[contentType][efeito.tipo] ?? efeito.tipo;
  const familia = contentType === "talent" ? FAMILIA_TALENTO[efeito.tipo] : undefined;

  return limpar({
    tipo: tipoLegado,
    ...(familia ? { familia } : {}),
    ...camposTransversaisLegado(contentType, efeito),
    ...camposLegadoPorTipo(contentType, efeito),
  });
}

/**
 * Reconstrói `payload_automacao.efeitos[]` para publicação: efeitos
 * PRESERVADOS (não-MVP) na ordem original, seguidos dos efeitos
 * EDITÁVEIS na ordem do editor.
 */
export function reconstruirEfeitosLegado(
  contentType: DraftContentType,
  efeitosLegadoOriginais: unknown[],
  efeitosEditaveis: EfeitoEditavel[],
  isTipoEfeitoMvpLegado: (tipoLegado: string | undefined) => boolean,
): unknown[] {
  const preservados = efeitosLegadoOriginais.filter((e) => {
    const tipo = typeof e === "object" && e !== null ? (e as Record<string, unknown>).tipo : undefined;
    return !isTipoEfeitoMvpLegado(typeof tipo === "string" ? tipo : undefined);
  });

  const editaveisSerializados = [...efeitosEditaveis]
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => serializarEfeitoLegado(contentType, e));

  return [...preservados, ...editaveisSerializados];
}
