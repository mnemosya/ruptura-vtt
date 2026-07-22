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
import { MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO, type EfeitoEditavel, type ModificadorSimplesEfeitoTemporario } from "./effectDraftTypes";

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

/** Rótulo plural para mensagens de bloqueio — nunca hardcoded inline em cada mensagem. */
function rotuloContentType(contentType: DraftContentType): string {
  if (contentType === "spell") return "magias";
  if (contentType === "talent") return "talentos";
  if (contentType === "rune") return "runas";
  return "itens";
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
  if (cd?.tipo === "derivada" && (contentType === "item" || contentType === "rune")) {
    erros.push(`Efeito "${rotulo}": CD derivada (vertente) não é representável no contrato de ${rotuloContentType(contentType)}, que exige um valor numérico literal — use CD fixa.`);
  }
  if (resultados.length === 0) erros.push(`Efeito "${rotulo}": nenhum resultado configurado.`);
  if (resultados.length > MAX_RESULTADOS_SERIALIZAVEIS) {
    erros.push(`Efeito "${rotulo}": o contrato de ${rotuloContentType(contentType)} só representa até ${MAX_RESULTADOS_SERIALIZAVEIS} resultados (um de sucesso, um de falha) sem ambiguidade — simplifique a árvore.`);
  }
  const faixasVistas = new Set<string>();
  for (const r of resultados) {
    if (faixasVistas.has(r.faixa)) erros.push(`Efeito "${rotulo}": faixa "${r.faixa}" duplicada entre resultados.`);
    faixasVistas.add(r.faixa);
    if (!FAMILIA_SUCESSO.has(r.faixa) && !FAMILIA_FALHA.has(r.faixa)) {
      erros.push(`Efeito "${rotulo}": resultado de faixa "${r.faixa}" só é representável no contrato de ${rotuloContentType(contentType)} quando é sucesso ou falha (sem crítico/faixa específica/manual separados) — simplifique ou mantenha só no rascunho.`);
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
        erros.push(`Efeito "${rotulo}": resultado "${r.faixa}" tem um efeito filho do tipo "${filho.tipo}" que o contrato de ${rotuloContentType(contentType)} não representa dentro de um teste/resistência — só dano/aplicar_condicao/remover_condicao/cura são serializáveis aqui.`);
      }
      erros.push(...validarEfeitoParaPublicacao(contentType, filho));
    }
  }
  return erros;
}

/**
 * Valida se um `efeito_temporario` é representável no `buff_temporario`
 * REAL já lido por `extractModifiers`/`parseDuration`
 * (character/temporaryEffects.ts): esse leitor só reconhece UM modificador
 * de rolagem (`valor`+`alvo_tags`) e UM modificador de perícia
 * (`bonus_pericia`), nunca uma lista. Mais que isso não é um limite
 * arbitrário desta etapa — é o que o executor real consegue interpretar
 * hoje; excedente é bloqueado (nunca truncado silenciosamente).
 */
function validarEfeitoTemporarioParaPublicacao(contentType: DraftContentType, efeito: Extract<EfeitoEditavel, { tipo: "efeito_temporario" }>): string[] {
  const erros: string[] = [];
  const rotulo = efeito.nomeOpcional || "efeito temporário";
  const { modificadores, duracao } = efeito.campos;

  if (!duracao || (duracao.tipo === "rounds" && !(duracao.rodadas! > 0))) {
    erros.push(`Efeito "${rotulo}": duração ausente ou inválida.`);
  }

  const porTags = modificadores.filter((m) => (m.campos.tags?.length ?? 0) > 0 && !m.campos.pericia);
  const porPericia = modificadores.filter((m) => !!m.campos.pericia);
  const outros = modificadores.filter((m) => !porTags.includes(m) && !porPericia.includes(m));

  if (porTags.length > 1 || porPericia.length > 1) {
    erros.push(`Efeito "${rotulo}": o executor real (buff_temporario) só reconhece 1 modificador por tags e 1 por perícia — reduza os modificadores.`);
  }
  if (outros.length > 0) {
    erros.push(`Efeito "${rotulo}": modificador sem tags nem perícia definidas não é serializável (o executor real não sabe a que aplicar).`);
  }
  for (const m of modificadores) {
    const exigeValor = m.campos.modo === "bonus" || m.campos.modo === "penalidade";
    if (exigeValor && m.campos.valor == null) {
      erros.push(`Efeito "${rotulo}": modificador sem valor numérico — o executor real só soma/subtrai valores fixos (sem vantagem/desvantagem em buff temporário).`);
    }
  }
  if (contentType === "talent") {
    // Talento preserva a estrutura (duracao/max_pilhas/buffs no schema livre), mas não há
    // leitor genérico equivalente a extractModifiers — sem bloqueio adicional aqui, só
    // classificado como "lembrete" pelo diagnóstico (ver effectDiagnostics.ts).
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

  if (efeito.tipo === "efeito_temporario") {
    if (contentType === "spell" || contentType === "rune") {
      erros.push(`Efeito "${rotulo}": efeito temporário não tem representação segura no contrato de ${rotuloContentType(contentType)} (sem campo de duração/buff no vocabulário real) — mantenha só no rascunho.`);
    } else {
      erros.push(...validarEfeitoTemporarioParaPublicacao(contentType, efeito));
    }
  }
  if (efeito.tipo === "acao_reacao_adicional" && contentType === "spell") {
    erros.push(`Efeito "${rotulo}": ação/reação adicional não tem representação segura no contrato de magias (schema fechado, sem tipo ataque_adicional/reacao) — mantenha só no rascunho.`);
  }
  if (efeito.tipo === "acao_reacao_adicional" && contentType === "item" && efeito.campos.tipo !== "ataque") {
    erros.push(`Efeito "${rotulo}": o contrato de itens só reconhece concessão de ATAQUE adicional (tipo "ataque_adicional" no enum real) — ação/reação adicional em item mantenha só no rascunho.`);
  }
  if (efeito.usoLimitado && (contentType === "spell" || contentType === "item")) {
    erros.push(`Efeito "${rotulo}": uso/cadência limitados só têm representação segura no contrato de talentos/runas (mesmo formato real usos/cadencia) — para magia/item, mantenha só no rascunho.`);
  }
  if (efeito.usoLimitado && !(efeito.usoLimitado.usosMax > 0)) {
    erros.push(`Efeito "${rotulo}": quantidade máxima de usos precisa ser maior que zero.`);
  }

  // Etapa 9 — inventário/mercado. Vocabulário real por content_type (ver TIPO_LEGADO):
  // cura/remover_condicao NÃO existem no enum real de runa; conceder_item/consumir_item/
  // alterar_disponibilidade só têm bucket real em talento (tipo livre); alterar_preco só
  // tem leitor real em talento; modificar_instancia não tem bucket real em magia.
  if ((efeito.tipo === "cura" || efeito.tipo === "remover_condicao") && contentType === "rune") {
    erros.push(`Efeito "${rotulo}": "${efeito.tipo}" não existe no vocabulário real de runa (schema_runas_v1_2.json) — mantenha só no rascunho.`);
  }
  if (efeito.tipo === "modificar_instancia" && contentType === "spell") {
    erros.push(`Efeito "${rotulo}": modificar instância não tem representação segura no contrato de magias (schema fechado, sem categoria genérica) — mantenha só no rascunho.`);
  }
  if (efeito.tipo === "modificar_instancia") {
    const exigeValor = efeito.campos.operacao !== "reparar_mit" && efeito.campos.operacao !== "reparar_pd";
    if (exigeValor && efeito.campos.valor == null) {
      erros.push(`Efeito "${rotulo}": operação "${efeito.campos.operacao}" exige um valor.`);
    }
    if (!exigeValor && (efeito.campos.valor == null || efeito.campos.valor <= 0)) {
      erros.push(`Efeito "${rotulo}": operação "${efeito.campos.operacao}" exige um valor positivo (reparo nunca reduz).`);
    }
  }
  if ((efeito.tipo === "conceder_item" || efeito.tipo === "consumir_item" || efeito.tipo === "alterar_disponibilidade") && contentType !== "talent") {
    erros.push(`Efeito "${rotulo}": "${efeito.tipo}" só tem representação (sem automação) no contrato de talentos — para magia/item/runa, mantenha só no rascunho.`);
  }
  if (efeito.tipo === "conceder_item" && !efeito.campos.itemSlug) {
    erros.push(`Efeito "${rotulo}": falta o item referenciado da Biblioteca.`);
  }
  if (efeito.tipo === "alterar_preco") {
    if (contentType !== "talent") {
      erros.push(`Efeito "${rotulo}": alterar preço/desconto só tem representação segura no contrato de talentos (mesmo formato lido por getGarimpoDeRuaAvailability/getCadernetaDeDividaAvailability) — para magia/item/runa, mantenha só no rascunho.`);
    } else if (efeito.campos.operacao !== "desconto_percentual" && efeito.campos.operacao !== "permitir_compra_fiada") {
      erros.push(`Efeito "${rotulo}": operação "${efeito.campos.operacao}" não tem leitor real no conteúdo hoje (só desconto_percentual/permitir_compra_fiada) — mantenha só no rascunho.`);
    } else if (efeito.campos.operacao === "desconto_percentual" && (efeito.campos.percentual == null || efeito.campos.percentual < 0 || efeito.campos.percentual > 100)) {
      erros.push(`Efeito "${rotulo}": desconto percentual precisa estar entre 0 e 100.`);
    }
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

  if (contentType === "rune") {
    switch (efeito.tipo) {
      case "dano":
        if (!efeito.campos.tipoDano) {
          erros.push(`Efeito "${rotulo}": dano em runa exige um tipo de dano.`);
        }
        if (efeito.campos.tipoDano && !TIPO_DANO_ITEM_ENUM.has(efeito.campos.tipoDano)) {
          erros.push(`Efeito "${rotulo}": tipo de dano "${efeito.campos.tipoDano}" não é reconhecido pelo contrato de runas.`);
        }
        break;
      case "aplicar_condicao":
        if (!efeito.campos.condicaoSlug || !CONDICOES_ENUM.has(efeito.campos.condicaoSlug)) {
          erros.push(`Efeito "${rotulo}": condição "${efeito.campos.condicaoSlug || "(vazia)"}" não é reconhecida pelo contrato de runas.`);
        }
        break;
    }
  }

  // Talento: gatilho/alvo/duracao/condicao/recurso/valor são tipados livremente
  // no schema (qualquer JSON) — só alvo_tags/alvo_acoes têm enum próprio,
  // e a Etapa 4 não expõe alvo_acoes com esses valores específicos, então
  // não há combinação bloqueante conhecida para talento hoje.

  // Etapa 10 — companheiro/Trama. `familia:"companheiro"`/`"trama"` só
  // existem no enum real de talento (auditoria: FAMILIAS_INCOMPATIVEIS em
  // legacyConversion.ts já reconhece essas 2 famílias) — sem bucket real
  // em magia/item/runa, então bloqueados fora de talento.
  const TIPOS_COMPANHEIRO_TRAMA = new Set(["companheiro", "modificar_companheiro", "acao_companheiro", "programar_gatilho", "parear", "acao_trama"]);
  if (TIPOS_COMPANHEIRO_TRAMA.has(efeito.tipo) && contentType !== "talent") {
    erros.push(`Efeito "${rotulo}": companheiro/Trama só têm representação (sem automação) no contrato de talentos — para magia/item/runa, mantenha só no rascunho.`);
  }
  if (efeito.tipo === "companheiro" && !(efeito.campos.quantidade > 0)) {
    erros.push(`Efeito "${rotulo}": quantidade de companheiro precisa ser maior que zero.`);
  }
  if (efeito.tipo === "acao_companheiro") {
    if (efeito.campos.efeitosConsequencia.length > MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO) {
      erros.push(`Efeito "${rotulo}": mais de ${MAX_EFEITOS_CONSEQUENCIA_ACAO_COMPANHEIRO} consequências — acima do limite documentado.`);
    }
    if (efeito.campos.efeitosConsequencia.some((f) => f.tipo === "acao_companheiro")) {
      erros.push(`Efeito "${rotulo}": uma ação de companheiro não pode conter outra ação de companheiro como consequência.`);
    }
    for (const filho of efeito.campos.efeitosConsequencia) {
      erros.push(...validarEfeitoParaPublicacao(contentType, filho));
    }
  }
  if (efeito.tipo === "programar_gatilho" && (!efeito.gatilho || !efeito.campos.acaoReferencia)) {
    erros.push(`Efeito "${rotulo}": programação precisa de gatilho e ação associada.`);
  }
  if (efeito.tipo === "parear" && efeito.campos.compartilhamentos.length === 0) {
    erros.push(`Efeito "${rotulo}": pareamento precisa de ao menos um compartilhamento definido.`);
  }
  if (efeito.tipo === "acao_trama") {
    if (!efeito.campos.acao) {
      erros.push(`Efeito "${rotulo}": ação de Trama sem ação definida.`);
    }
    if (efeito.campos.acao === "avancar" && efeito.campos.alcanceAvancarEspacos != null && efeito.campos.alcanceAvancarEspacos <= 0) {
      erros.push(`Efeito "${rotulo}": alcance de Avançar precisa ser positivo.`);
    }
  }

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
  efeito_temporario: "buff_empilhavel",
  // Valor default; camposLegadoPorTipo sobrescreve `familia` real (ataque_adicional | reacao) conforme campos.tipo.
  acao_reacao_adicional: "reacao",
  modificar_instancia: "regra_especial",
  conceder_item: "regra_especial",
  consumir_item: "regra_especial",
  // Valor default; camposLegadoPorTipo sobrescreve conforme necessário (sempre "economia_loja" na prática — enum real).
  alterar_preco: "economia_loja",
  alterar_disponibilidade: "economia_loja",
  // "companheiro"/"trama" (Etapa 10) são valores REAIS do enum de família de talento —
  // já reconhecidos por legacyConversion.ts::FAMILIAS_INCOMPATIVEIS para conteúdo legado.
  companheiro: "companheiro",
  modificar_companheiro: "companheiro",
  acao_companheiro: "companheiro",
  programar_gatilho: "companheiro",
  parear: "companheiro",
  acao_trama: "trama",
};

/**
 * `tipo` legado a emitir, por content_type — só valores confirmados no
 * enum real (spell/item/rune) ou livres (talent). Etapa 9: `rune` usa o
 * vocabulário real do próprio schema de runa (`aplicar_condicao |
 * ataque_adicional | autorreparo | dano_modificador | economia_pa |
 * efeito_com_resistencia | modificador | narrativo | protecao | reacao |
 * recurso | revelar | utilitario`) — NÃO tem `cura`/`remover_condicao`
 * no enum real, por isso ausentes aqui (bloqueados em
 * validarEfeitoParaPublicacao).
 */
const TIPO_LEGADO: Record<DraftContentType, Partial<Record<EfeitoEditavel["tipo"], string>>> = {
  spell: { dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso", teste_resistencia: "efeito_com_resistencia" },
  // "dano" não existe no enum de tipo do schema de equipamentos — só "dano_em_area". Sem entrada boa para
  // modificar_margem/alterar_dano_recebido no enum fechado — "utilitario" é o catch-all genérico real usado como fallback.
  item: {
    dano: "dano_em_area", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso",
    teste_resistencia: "efeito_com_resistencia", alterar_dano_recebido: "utilitario",
    // "buff_temporario" e "ataque_adicional" são valores REAIS do enum tipo_efeito de item (auditoria) — mesmo shape já lido por buildTemporaryEffectFromStructuredPayload (itemUse.ts).
    efeito_temporario: "buff_temporario", acao_reacao_adicional: "ataque_adicional",
    // Sem bucket real específico ("autorreparo" só existe no enum de runa) — reaproveita "utilitario" (mesmo catch-all já usado por alterar_dano_recebido).
    modificar_instancia: "utilitario",
  },
  // "promocao_margem" é o tipo real já lido por getMarginPromotions (talentEngine.ts); "reduzir_dano_recebido" é
  // string livre (schema de talento não restringe `tipo`) com família "protecao" (enum real, mesmo conceito das runas reais).
  talent: {
    dano: "dano", cura: "cura", aplicar_condicao: "aplicar_condicao", remover_condicao: "remover_condicao", modificar_teste: "modificador", alterar_recurso: "recurso",
    modificar_margem: "promocao_margem", alterar_dano_recebido: "reduzir_dano_recebido",
    // "buff_temporario" tipo livre com família "buff_empilhavel" (enum real); acao_reacao_adicional tem `tipo`/`familia`
    // reais recalculados em camposLegadoPorTipo (ataque_adicional/reacao) conforme campos.tipo.
    efeito_temporario: "buff_temporario", acao_reacao_adicional: "ataque_adicional",
    // Sem bucket real específico para talento — tipo livre, família "regra_especial" (catch-all).
    modificar_instancia: "modificar_instancia", conceder_item: "conceder_item", consumir_item: "consumir_item",
    // "desconto_loja"/"compra_fiada" são os tipos REAIS já lidos por getGarimpoDeRuaAvailability/getCadernetaDeDividaAvailability;
    // camposLegadoPorTipo escolhe entre os dois conforme campos.operacao. Sem bucket real para alterar_disponibilidade — tipo livre.
    alterar_preco: "desconto_loja", alterar_disponibilidade: "alterar_disponibilidade",
    // Etapa 10 — companheiro/Trama: tipo livre (schema de talento não restringe `tipo`),
    // família real "companheiro"/"trama" (FAMILIA_TALENTO acima). Nenhum destes tem
    // executor real — preservados/representáveis, sempre lembrete (ver effectDiagnostics.ts).
    companheiro: "conceder_companheiro", modificar_companheiro: "modificar_companheiro",
    acao_companheiro: "acao_companheiro", programar_gatilho: "programar_gatilho", parear: "parear",
    acao_trama: "acao_trama",
  },
  // Vocabulário real de runa (schema_runas_v1_2.json) — sem `cura`/`remover_condicao`/`modificar_margem`/
  // `efeito_temporario`/`conceder_item`/`consumir_item`/`alterar_preco`/`alterar_disponibilidade` (bloqueados em validarEfeitoParaPublicacao).
  rune: {
    dano: "dano_modificador", aplicar_condicao: "aplicar_condicao", modificar_teste: "modificador", alterar_recurso: "recurso",
    teste_resistencia: "efeito_com_resistencia", alterar_dano_recebido: "protecao", acao_reacao_adicional: "ataque_adicional",
    modificar_instancia: "autorreparo",
  },
};

/** Campos específicos por (content_type, tipo) — só chaves confirmadas pelos schemas reais. Nunca gatilho/alvo/duracao/habilitado/nome/_editor para spell/item; talento permite gatilho/alvo/duracao (tipado livre) mas não habilitado/nome/texto_log. */
function camposLegadoPorTipo(contentType: DraftContentType, efeito: EfeitoEditavel): Record<string, unknown> {
  switch (efeito.tipo) {
    case "dano": {
      const cp = efeito.campos;
      const dado = cp.tipoFormula === "fixo" ? undefined : formula(cp.quantidadeDados, cp.faces);
      if (contentType === "spell" || contentType === "item") {
        return { dado, valor: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano, sucesso: cp.metadeEmSucesso ? "metade" : undefined };
      }
      if (contentType === "rune") {
        // "dano_modificador" real (ex.: runa_cac_flamejante) usa usos/cadencia (ver usoLimitado, mesclado em serializarEfeitoLegado) — nunca o campo "sucesso" (conceito de resistência de dano/cura, não de bônus consumível).
        return { dado, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano };
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
      if (contentType === "item" || contentType === "rune") {
        return { operacao: cp.operacao, valor_fixo: cp.valorFixo, multiplicador: cp.multiplicador, tipo_dano: cp.tipoDano, subtipo_dano: cp.subtipoDano, momento: cp.momento };
      }
      // talent: só chaves confirmadas livres do schema (valor/momento) — "reducao_dano" é o rótulo real mais próximo.
      return { reducao_dano: cp.valorFixo, momento: cp.momento };
    }
    case "efeito_temporario": {
      const cp = efeito.campos;
      const duracaoTexto =
        cp.duracao.tipo === "rounds" ? `${cp.duracao.rodadas ?? 1}_rodadas` : cp.duracao.tipo === "scene" ? "cena" : cp.duracao.tipo === "rest" ? "descanso_longo" : undefined;
      const porTags = cp.modificadores.find((m) => (m.campos.tags?.length ?? 0) > 0 && !m.campos.pericia);
      const porPericia = cp.modificadores.find((m) => !!m.campos.pericia);
      const valorComSinal = (m: ModificadorSimplesEfeitoTemporario) => (m.campos.valor == null ? undefined : m.campos.modo === "penalidade" ? -Math.abs(m.campos.valor) : m.campos.valor);
      if (contentType === "talent") {
        // Correção (Etapa 10): "bonus_pericia"/"nota" não existem no schema fechado de
        // talento — só "pericias" (array) é real. Como só há UM slot genérico de "valor"
        // no schema, prioriza o modificador por-tags quando ambos existem (o outro
        // permanece só na metadata editorial, nunca perdido, só não no payload público).
        const escolhido = porTags ?? porPericia;
        return {
          duracao: duracaoTexto,
          max_pilhas: cp.acumulavel ? cp.maximoPilhas : undefined,
          valor: escolhido ? valorComSinal(escolhido) : undefined,
          alvo_tags: escolhido === porTags && (porTags?.campos.tags?.length ?? 0) > 0 ? porTags!.campos.tags : undefined,
          pericias: escolhido === porPericia && porPericia?.campos.pericia ? [porPericia.campos.pericia] : undefined,
        };
      }
      return {
        duracao: duracaoTexto,
        max_pilhas: cp.acumulavel ? cp.maximoPilhas : undefined,
        valor: porTags ? valorComSinal(porTags) : undefined,
        alvo_tags: porTags && (porTags.campos.tags?.length ?? 0) > 0 ? porTags.campos.tags : undefined,
        bonus_pericia: porPericia ? { pericia: porPericia.campos.pericia, valor: valorComSinal(porPericia) } : undefined,
        nota: efeito.textoLembrete,
      };
    }
    case "acao_reacao_adicional": {
      const cp = efeito.campos;
      const familiaReal = cp.tipo === "ataque" ? "ataque_adicional" : "reacao";
      return {
        familia: contentType === "talent" ? familiaReal : undefined,
        tipo: contentType === "item" ? "ataque_adicional" : contentType === "rune" ? familiaReal : undefined,
        acao: cp.acaoPermitida,
        rodadas_extra: cp.limite,
        custo_pa_extra: cp.consomePa,
        penalidade: cp.penalidade,
        gatilho: cp.janela,
      };
    }
    case "modificar_instancia": {
      const cp = efeito.campos;
      if (contentType === "rune") {
        // "autorreparo" real (ex.: runa_armadura_autorreparo) usa gatilho/efeito, não operacao/valor.
        const efeitoTexto = cp.operacao === "reparar_mit" || cp.operacao === "alterar_mit_atual" ? "recupera_mit_total" : cp.operacao === "reparar_pd" || cp.operacao === "alterar_pd_atual" ? "recupera_pd_total" : cp.operacao;
        return { gatilho: efeito.gatilho, efeito: efeitoTexto };
      }
      if (contentType === "talent") {
        // Correção (Etapa 10): schema de talento é FECHADO (additionalProperties:false,
        // ~90 chaves fixas) — "operacao"/"limite" não existem no enum real. Reaproveita
        // "acao" (chave real, slot de texto livre para nome de ação) para a operação.
        return { acao: cp.operacao, valor: cp.valor };
      }
      // item: additionalProperties:true — nomes descritivos livres são schema-legais.
      return { operacao: cp.operacao, valor: cp.valor, limite: cp.limite };
    }
    case "conceder_item": {
      const cp = efeito.campos;
      if (contentType === "talent") {
        // Correção (Etapa 10): "item_slug"/"destino"/"estado_inicial"/etc. não existem
        // no schema fechado de talento — reaproveita "identifica"/"max_unidades"/"escopo"/
        // "requisito" (chaves reais; "escopo"/"identifica" só aceitam array). Campos sem
        // contraparte real ficam só na metadata.
        return { identifica: cp.itemSlug ? [cp.itemSlug] : undefined, max_unidades: cp.quantidade, escopo: cp.destino ? [cp.destino] : undefined, requisito: cp.motivo };
      }
      return { item_slug: cp.itemSlug || undefined, quantidade: cp.quantidade, destino: cp.destino, estado_inicial: cp.estadoInicial, cargas_iniciais: cp.cargasIniciais, quantidade_inicial: cp.quantidadeInicial, motivo: cp.motivo };
    }
    case "consumir_item": {
      const cp = efeito.campos;
      if (contentType === "talent") {
        return { identifica: cp.itemSlug ? [cp.itemSlug] : undefined, max_unidades: cp.quantidade, condicao: cp.condicao, para: cp.destinoTransferencia };
      }
      return { item_slug: cp.itemSlug, quantidade: cp.quantidade, comportamento_pilha: cp.comportamentoPilha, condicao: cp.condicao, refund: cp.refund || undefined, destino: cp.destinoTransferencia };
    }
    case "alterar_preco": {
      const cp = efeito.campos;
      if (cp.operacao === "permitir_compra_fiada") {
        // "compra_fiada" real (mermo formato lido por getCadernetaDeDividaAvailability) — sobrescreve o default "desconto_loja" de TIPO_LEGADO.
        return { tipo: "compra_fiada", raridade_maxima: cp.raridadeMaxima ?? "raro", gera_divida: true, contexto: cp.contextoTexto };
      }
      // desconto_percentual — único outro caminho que chega aqui (demais operações são bloqueadas em validarEfeitoParaPublicacao).
      return { percentual: cp.percentual, contexto: cp.contextoTexto };
    }
    case "alterar_disponibilidade": {
      // Só talento (bloqueado para spell/item/rune em validarEfeitoParaPublicacao) —
      // correção (Etapa 10): "operacao"/"quantidade"/"fornecedor" não existem no schema
      // fechado de talento. Reaproveita "acao"/"max_unidades"/"identifica" (chaves reais;
      // "identifica" só aceita array).
      const cp = efeito.campos;
      return { acao: cp.operacao, max_unidades: cp.quantidade, identifica: cp.fornecedor ? [cp.fornecedor] : undefined, contexto: cp.contextoTexto };
    }
    // Etapa 10 — companheiro/Trama, sempre talento (bloqueado para os demais em
    // validarEfeitoParaPublicacao). O schema de talento é FECHADO
    // (additionalProperties:false, ~90 chaves fixas, nenhuma pensada para estes
    // conceitos) — cada case abaixo usa SÓ chaves reais confirmadas por leitura
    // direta do schema (`content/schema_talentos_v1_3.json`, `$defs.efeito`).
    // Campos sem contraparte real ficam só em `content_editor_metadata` (nunca
    // perdidos, só ausentes do payload público) — nunca uma chave nova inventada.
    case "companheiro": {
      // "escopo"/"identifica" só aceitam array no schema real — nunca string solta.
      const cp = efeito.campos;
      return {
        contexto: cp.tipo, identifica: cp.modeloReferencia ? [cp.modeloReferencia] : undefined, escopo: [cp.destino],
        max_unidades: cp.quantidade, pa_bonus: cp.paInicial,
        duracao: cp.persistente ? undefined : cp.duracao, requisito: cp.vinculo,
      };
    }
    case "modificar_companheiro": {
      const cp = efeito.campos;
      return { acao: cp.operacao, alvo: cp.alvo, valor: cp.valor, duracao: cp.duracao, requisito: cp.requisito };
    }
    case "acao_companheiro": {
      const cp = efeito.campos;
      const resumoConsequencias = cp.efeitosConsequencia.length > 0 ? `${cp.efeitosConsequencia.length} consequência(s): ${cp.efeitosConsequencia.map((f) => f.tipo).join(", ")}` : undefined;
      return {
        acao: cp.acaoReferencia, custo_pa: cp.custoPaCompanheiro, custo_pa_extra: cp.custoControlador,
        // "teste" só aceita object/string/array no schema real — nunca boolean solto.
        alvo: cp.alvo, teste: cp.exigeTeste ? "sim" : undefined,
        // Consequências completas vivem só na metadata editorial — sem chave real
        // para uma lista aninhada de efeitos no schema de talento; "resultado" (texto)
        // guarda só um resumo legível, nunca a árvore inteira.
        resultado: resumoConsequencias,
      };
    }
    case "programar_gatilho": {
      const cp = efeito.campos;
      return { acao: cp.acaoReferencia, condicao_ativacao: cp.condicaoTexto };
    }
    case "parear": {
      const cp = efeito.campos;
      return {
        de: cp.origem, para: cp.destino,
        comandos: cp.compartilhamentos.length > 0 ? cp.compartilhamentos : undefined,
        duracao: cp.duracao, custo: cp.custo, requisito: cp.requisito,
      };
    }
    case "acao_trama": {
      const cp = efeito.campos;
      // "teste" só aceita object/string/array — guarda a perícia exigida (nunca boolean solto).
      return {
        acao: cp.acao, custo_pa: cp.custoPa, custo_ram: cp.custoRam, teste: cp.exigeTeste ? cp.pericia ?? "sim" : undefined,
        minimo: cp.cdFixa, alvo_texto: cp.alvoTexto,
        distancia_espacos: cp.acao === "avancar" ? cp.alcanceAvancarEspacos : undefined, requisito: cp.requisito,
      };
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
    // Uso/cadência (Etapa 8) só tem leitor real GENÉRICO para talento
    // (getTalentUsageState/TALENT_CADENCES) — mesmos campos `usos`/`cadencia`
    // já lidos por talents.ts em QUALQUER efeito, não um tipo à parte.
    // Runa (Etapa 9) preserva os mesmos campos (conteúdo real já usa
    // usos/cadencia, ex.: runa_cac_flamejante) mas SEM leitor genérico —
    // representável, classificado lembrete no diagnóstico. Bloqueado
    // para spell/item em validarEfeitoParaPublicacao.
    ...((contentType === "talent" || contentType === "rune") && efeito.usoLimitado ? { usos: efeito.usoLimitado.usosMax, cadencia: efeito.usoLimitado.cadencia } : {}),
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
export function serializarArvoreTesteResistencia(contentType: "spell" | "item" | "rune", efeito: Extract<EfeitoEditavel, { tipo: "teste_resistencia" }>): Record<string, unknown>[] {
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
