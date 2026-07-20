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
/** Máximo de resultados/efeitos-filho que a serialização legada (siblings no formato existente) consegue representar sem ambiguidade — ver `serializarArvoreTesteResistencia`. */
const MAX_RESULTADOS_SERIALIZAVEIS = 2;
const MAX_EFEITOS_POR_RESULTADO_SERIALIZAVEL = 2;
const FAMILIA_SUCESSO = new Set(["sucesso_padrao", "sucesso_limitado", "sucesso_critico"]);
const FAMILIA_FALHA = new Set(["falha", "falha_limitada", "falha_critica"]);

function validarArvoreTesteResistencia(contentType: DraftContentType, efeito: Extract<EfeitoEditavel, { tipo: "teste_resistencia" }>): string[] {
  const erros: string[] = [];
  const rotulo = efeito.nomeOpcional || "teste ou resistência";

  if (contentType === "talent") {
    erros.push(`Efeito "${rotulo}": árvores de teste/resistência ainda não têm representação segura no contrato de talentos — mantenha este efeito só no rascunho.`);
    return erros;
  }

  const { cd, resultados, pericia, atributo } = efeito.campos;
  if (!pericia && !atributo) erros.push(`Efeito "${rotulo}": falta perícia ou atributo.`);
  if (!cd) erros.push(`Efeito "${rotulo}": falta CD (fixa ou derivada).`);
  if (cd?.tipo === "derivada" && contentType === "item") {
    erros.push(`Efeito "${rotulo}": CD derivada (vertente) não é representável no contrato de itens, que exige um valor numérico literal — use CD fixa.`);
  }
  if (resultados.length === 0) erros.push(`Efeito "${rotulo}": nenhum resultado configurado.`);
  if (resultados.length > MAX_RESULTADOS_SERIALIZAVEIS) {
    erros.push(`Efeito "${rotulo}": o contrato de ${contentType === "spell" ? "magias" : "itens"} só representa até ${MAX_RESULTADOS_SERIALIZAVEIS} resultados (um de sucesso, um de falha) sem ambiguidade — simplifique a árvore.`);
  }
  const faixasVistas = new Set<string>();
  for (const r of resultados) {
    if (faixasVistas.has(r.faixa)) erros.push(`Efeito "${rotulo}": faixa "${r.faixa}" duplicada entre resultados.`);
    faixasVistas.add(r.faixa);
    if (!FAMILIA_SUCESSO.has(r.faixa) && !FAMILIA_FALHA.has(r.faixa)) {
      erros.push(`Efeito "${rotulo}": resultado de faixa "${r.faixa}" só é representável no contrato de ${contentType === "spell" ? "magias" : "itens"} quando é sucesso ou falha (sem crítico/faixa específica/manual separados) — simplifique ou mantenha só no rascunho.`);
    }
    if (r.efeitos.length > MAX_EFEITOS_POR_RESULTADO_SERIALIZAVEL) {
      erros.push(`Efeito "${rotulo}": resultado "${r.faixa}" tem mais efeitos filhos do que o contrato consegue representar sem ambiguidade (máximo ${MAX_EFEITOS_POR_RESULTADO_SERIALIZAVEL}).`);
    }
    const danos = r.efeitos.filter((f) => f.tipo === "dano");
    const naoDanos = r.efeitos.filter((f) => f.tipo !== "dano");
    if (danos.length > 1) erros.push(`Efeito "${rotulo}": resultado "${r.faixa}" tem mais de um efeito de dano — não representável.`);
    if (naoDanos.length > 1) erros.push(`Efeito "${rotulo}": resultado "${r.faixa}" tem mais de um efeito não-dano — o contrato só representa 1 dano + 1 outro efeito por resultado.`);
    // Nenhum filho pode ser "teste_resistencia" — impossível pelo próprio
    // tipo (`EfeitoFilho` exclui esse tipo), não só validado em runtime.
    for (const filho of r.efeitos) {
      if (filho.tipo === "modificar_margem" || filho.tipo === "alterar_dano_recebido" || filho.tipo === "modificar_teste" || filho.tipo === "alterar_recurso") {
        erros.push(`Efeito "${rotulo}": resultado "${r.faixa}" tem um efeito filho do tipo "${filho.tipo}" que o contrato de ${contentType === "spell" ? "magias" : "itens"} não representa dentro de um teste/resistência — só dano/aplicar_condicao/remover_condicao/cura são serializáveis aqui.`);
      }
      erros.push(...validarEfeitoParaPublicacao(contentType, filho));
    }
  }
  return erros;
}

export function validarEfeitoParaPublicacao(contentType: DraftContentType, efeito: EfeitoEditavel): string[] {
  const erros: string[] = [];
  const rotulo = efeito.nomeOpcional || efeito.tipo;

  if (efeito.tipo === "teste_resistencia") return validarArvoreTesteResistencia(contentType, efeito);

  if (efeito.tipo === "modificar_margem" && contentType !== "talent") {
    erros.push(`Efeito "${rotulo}": modificar margem só tem representação segura no contrato de talentos (mesmo formato lido por getMarginPromotions) — para magia/item, mantenha só no rascunho.`);
  }
  if (efeito.tipo === "modificar_margem" && contentType === "talent" && efeito.campos.pericias.length === 0) {
    erros.push(`Efeito "${rotulo}": modificar margem precisa de ao menos uma perícia afetada.`);
  }
  if (efeito.tipo === "alterar_dano_recebido" && contentType === "spell") {
    erros.push(`Efeito "${rotulo}": alterar dano recebido não tem representação segura no contrato de magias (schema fechado, sem categoria genérica) — mantenha só no rascunho, ou aplique como item/talento.`);
  }
  if (efeito.tipo === "alterar_dano_recebido" && efeito.campos.operacao === "reduzir" && efeito.campos.valorFixo == null) {
    erros.push(`Efeito "${rotulo}": operação "reduzir" exige um valor fixo.`);
  }
  if (efeito.tipo === "alterar_dano_recebido" && efeito.campos.operacao === "multiplicar" && (efeito.campos.multiplicador == null || efeito.campos.multiplicador < 0)) {
    erros.push(`Efeito "${rotulo}": operação "multiplicar" exige um multiplicador válido (>= 0).`);
  }

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
  modificar_margem: "margem",
  alterar_dano_recebido: "protecao",
  teste_resistencia: "regra_especial", // nunca serializado de fato — validarArvoreTesteResistencia bloqueia talento.
};

/** `tipo` legado a emitir, por content_type — só valores confirmados no enum real (spell/item) ou livres (talent). */
const TIPO_LEGADO: Record<DraftContentType, Partial<Record<EfeitoEditavel["tipo"], string>>> = {
  spell: { dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso", teste_resistencia: "efeito_com_resistencia" },
  // "dano" não existe no enum de tipo do schema de equipamentos — só "dano_em_area". Sem entrada boa para
  // modificar_margem/alterar_dano_recebido no enum fechado — "utilitario" é o catch-all genérico real usado como fallback.
  item: {
    dano: "dano_em_area", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso",
    teste_resistencia: "efeito_com_resistencia", alterar_dano_recebido: "utilitario",
  },
  // "promocao_margem" é o tipo real já lido por getMarginPromotions (talentEngine.ts); "reduzir_dano_recebido" é
  // string livre (schema de talento não restringe `tipo`) com família "protecao" (enum real, mesmo conceito das runas reais).
  talent: {
    dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso",
    modificar_margem: "promocao_margem", alterar_dano_recebido: "reduzir_dano_recebido",
  },
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
    case "modificar_margem": {
      const cp = efeito.campos;
      // Só talento tem representação segura (validado em validarEfeitoParaPublicacao) — mesmo formato lido por getMarginPromotions.
      return { pericias: cp.pericias.length > 0 ? cp.pericias : undefined, de: cp.faixaOrigem, para: cp.faixaDestino, contexto: cp.contextoTexto };
    }
    case "alterar_dano_recebido": {
      const cp = efeito.campos;
      if (contentType === "item") {
        return { operacao: cp.operacao, valor_fixo: cp.valorFixo, multiplicador: cp.multiplicador, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano, momento: cp.momento };
      }
      // talent: só chaves confirmadas livres do schema (valor/momento) — "reducao_dano" é o rótulo real mais próximo.
      return { reducao_dano: cp.valorFixo, momento: cp.momento };
    }
    case "teste_resistencia":
      // Nunca serializado por aqui — é uma árvore (vira múltiplos objetos
      // legados irmãos), tratada só em `serializarArvoreTesteResistencia`
      // dentro de `reconstruirEfeitosLegado`. Chegar aqui é bug de chamador.
      throw new Error('serializarEfeitoLegado não serializa "teste_resistencia" diretamente — use reconstruirEfeitosLegado.');
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
 * Serializa a árvore de `teste_resistencia` para o formato legado —
 * SEMPRE um array (o efeito-raiz de resistência + até um efeito irmão
 * por resultado sucesso/falha), nunca um único objeto. Regra de
 * combinação (documentada e limitada por `validarArvoreTesteResistencia`,
 * que já bloqueia qualquer árvore fora deste formato antes de chegar
 * aqui): quando existe um resultado de dano tanto no ramo de sucesso
 * quanto no de falha, o dano do ramo de falha ganha `sucesso: "metade"`
 * (mesma convenção real já usada em conteúdo publicado, ex.:
 * `energetica_bola_de_fogo`) — quando só existe no ramo de falha, o
 * efeito nunca é reduzido no sucesso (nenhuma consequência = campo
 * ausente, nunca inventado).
 */
export function serializarArvoreTesteResistencia(contentType: "spell" | "item", efeito: Extract<EfeitoEditavel, { tipo: "teste_resistencia" }>): Record<string, unknown>[] {
  const cp = efeito.campos;
  const cdFormula = cp.cd?.tipo === "derivada" ? "6 + nivel_vertente" : undefined;
  const cdValor = cp.cd?.tipo === "fixa" ? cp.cd.valor : undefined;

  const raiz =
    contentType === "spell"
      ? limpar({ tipo: "efeito_com_resistencia", resistencia: limpar({ cd_formula: cdFormula ?? String(cdValor ?? ""), pericias: cp.pericia ? [cp.pericia] : undefined }) })
      : limpar({ tipo: "efeito_com_resistencia", resistencia: limpar({ pericia: cp.pericia, cd: cdValor }) });

  const sucesso = cp.resultados.find((r) => FAMILIA_SUCESSO.has(r.faixa));
  const falha = cp.resultados.find((r) => FAMILIA_FALHA.has(r.faixa));
  const irmaos: Record<string, unknown>[] = [];

  const danoFalha = falha?.efeitos.find((f) => f.tipo === "dano");
  const naoDanoFalha = falha?.efeitos.find((f) => f.tipo !== "dano");
  const danoSucesso = sucesso?.efeitos.find((f) => f.tipo === "dano");
  const naoDanoSucesso = sucesso?.efeitos.find((f) => f.tipo !== "dano");

  if (danoFalha) {
    const objDano = serializarEfeitoLegado(contentType, danoFalha);
    if (danoSucesso) objDano.sucesso = "metade";
    irmaos.push(objDano);
  } else if (danoSucesso) {
    // Dano só no ramo de sucesso (raro, mas representável) — serializado como está, sem campo "sucesso" (não há falha equivalente para reduzir).
    irmaos.push(serializarEfeitoLegado(contentType, danoSucesso));
  }
  if (naoDanoFalha) irmaos.push(serializarEfeitoLegado(contentType, naoDanoFalha));
  if (naoDanoSucesso) irmaos.push(serializarEfeitoLegado(contentType, naoDanoSucesso));

  return [raiz, ...irmaos];
}

/**
 * Reconstrói `payload_automacao.efeitos[]` para publicação: efeitos
 * PRESERVADOS (não-MVP) na ordem original, seguidos dos efeitos
 * EDITÁVEIS na ordem do editor. `teste_resistencia` expande para vários
 * objetos irmãos (nunca um único) — ver `serializarArvoreTesteResistencia`.
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
    .flatMap((e) => (e.tipo === "teste_resistencia" && contentType !== "talent" ? serializarArvoreTesteResistencia(contentType, e) : [serializarEfeitoLegado(contentType, e)]));

  return [...preservados, ...editaveisSerializados];
}
