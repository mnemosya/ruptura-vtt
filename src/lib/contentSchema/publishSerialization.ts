/**
 * Serialização de publicação (Etapa 5): `DraftEnvelope` → CORPO no
 * formato legado de `content_documents.payload`, pronto para o RPC
 * transacional `publish_content_draft`.
 *
 * ESTRATÉGIA (documentada em docs/CHECKPOINT_ETAPA5_...md §Serialização):
 * "overlay sobre clone do rawOriginal". Partimos de um clone profundo do
 * `preservado.rawOriginal` (que É o payload legado original em edições, ou
 * um esqueleto mínimo em conteúdo novo) e sobrescrevemos SOMENTE os
 * caminhos que o editor controla. Tudo que o editor não toca —
 * `estatisticas` bespoke, campos desconhecidos, efeitos preservados,
 * labels derivados — sobrevive por construção, sem precisar reinserir
 * nada. Isso garante "nenhum campo descartado silenciosamente".
 *
 * O RPC injeta `id/slug/status/versao/created_at/updated_at` — não os
 * setamos aqui (a versão/estado são autoridade do servidor SQL).
 */

import type { CamposCapitulo, CamposItem, CamposMagia, CamposRuna, CamposTalento, ContentDraftRow, DraftContentType } from "./draftTypes";
import { isTipoEfeitoEditavel, isTipoEfeitoMvp, type EfeitoEditavel } from "./effectDraftTypes";
import { resolverTipoCanonico } from "./effectTypeRegistry";
import { reconstruirEfeitosLegado } from "./effectLegacySerialization";
import { categoriaItemLabel, raridadeItemLabel } from "./itemLabels";

/** Clone profundo simples (payloads são JSON puro). */
function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Escreve `valor` em `obj[chave]` só quando definido; remove a chave quando string vazia. */
function setOpcional(obj: Record<string, unknown>, chave: string, valor: unknown): void {
  if (valor === undefined) return;
  if (typeof valor === "string" && valor.trim() === "") {
    delete obj[chave];
    return;
  }
  obj[chave] = valor;
}

/**
 * True quando o efeito legado deve ser SUBSTITUÍDO pelos editáveis
 * (nunca duplicado ao lado deles) na hora de reconstruir
 * `payload_automacao.efeitos`.
 *
 * Dois casos, com regras DIFERENTES por design (ver docs/CHECKPOINT_
 * ETAPA6_ADAPTADORES_LEGADO.md §5 e CHECKPOINT_ETAPA7_..md §5):
 *
 * - `origemLegado` presente (rascunho nasceu de `criarRascunhoDeEdicaoLegado`,
 *   Etapa 6): só os 6 tipos originais do MVP são auto-promovidos ao editar
 *   legado — um `efeito_com_resistencia`/`promocao_margem`/etc. legado
 *   NUNCA é auto-convertido (decisão deliberada, estrutura real varia
 *   demais entre spell/item/rune/property), mesmo que a pessoa
 *   administradora construa uma árvore NOVA do zero ao lado dele — os
 *   dois devem coexistir (o antigo preservado, somente leitura; o novo
 *   editável). Aqui `isTipoEfeitoMvp` é o predicado certo.
 * - `origemLegado` ausente (edição normal, incl. reedição de conteúdo já
 *   publicado pelo próprio Editor, recuperada de `content_editor_metadata`):
 *   qualquer entrada legada de um tipo que o Construtor sabe
 *   criar/serializar é a PRÓPRIA saída anterior do editor para esse
 *   mesmo efeito — precisa ser substituída, nunca somada. Usar aqui só
 *   `isTipoEfeitoMvp` (bug real, mesma classe do e584abb): um
 *   `teste_resistencia`/`modificar_margem`/`alterar_dano_recebido`
 *   reeditado nunca substituía sua própria entrada legada já presente em
 *   `rawOriginal` — cada republicação ACUMULAVA mais uma cópia duplicada.
 *   `isTipoEfeitoEditavel` é o predicado certo aqui.
 */
function ehEfeitoLegadoSubstituivel(contentType: DraftContentType, tipoLegado: string | undefined, origemLegado: boolean): boolean {
  const tipoCanonico = resolverTipoCanonico(contentType, tipoLegado);
  return origemLegado ? isTipoEfeitoMvp(tipoCanonico) : isTipoEfeitoEditavel(tipoCanonico);
}

// ---------------------------------------------------------------------
// Magia
// ---------------------------------------------------------------------
function serializarMagia(base: Record<string, unknown>, campos: CamposMagia, origemLegado: boolean): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  setOpcional(base, "categoria", campos.categoria);
  setOpcional(base, "vertente", campos.vertente);
  setOpcional(base, "descricao_curta", campos.descricaoCurta);
  setOpcional(base, "descricao_longa", campos.descricaoLonga);
  base.tags = [...campos.tags];

  const est = asRecord(base.estatisticas);
  setOpcional(est, "nivel", campos.nivel);
  setOpcional(est, "tipo_magia", campos.tipoMagia);
  setOpcional(est, "custo_pa", campos.custoPa);
  setOpcional(est, "custo_mana", campos.custoMana);
  setOpcional(est, "custo_sobrecarga", campos.custoSobrecarga);
  setOpcional(est, "resolucao", campos.resolucao);
  setOpcional(est, "pericia_teste", campos.periciaTeste);

  if (campos.alcanceValorM !== undefined || campos.alcanceTipo !== undefined) {
    const alcance = asRecord(est.alcance);
    setOpcional(alcance, "valor_m", campos.alcanceValorM);
    setOpcional(alcance, "tipo", campos.alcanceTipo);
    est.alcance = alcance;
  }
  if (campos.areaTipo !== undefined || campos.areaTexto !== undefined) {
    const area = asRecord(est.area);
    setOpcional(area, "tipo", campos.areaTipo);
    setOpcional(area, "texto", campos.areaTexto);
    est.area = area;
  }
  if (campos.duracaoTexto !== undefined || campos.sustentavel !== undefined) {
    const duracao = asRecord(est.duracao);
    setOpcional(duracao, "texto", campos.duracaoTexto);
    if (campos.sustentavel !== undefined) duracao.sustentavel = campos.sustentavel;
    est.duracao = duracao;
  }
  base.estatisticas = est;

  // Resistência editável → efeito preservado `efeito_com_resistencia`, quando existir.
  if (campos.resistenciaPericia !== undefined || campos.resistenciaCdFormula !== undefined) {
    const automacao = asRecord(base.payload_automacao);
    const efeitos = Array.isArray(automacao.efeitos) ? automacao.efeitos : [];
    const resistenciaEfeito = efeitos.find((e) => asRecord(e).tipo === "efeito_com_resistencia");
    if (resistenciaEfeito) {
      const res = asRecord(asRecord(resistenciaEfeito).resistencia);
      setOpcional(res, "pericia", campos.resistenciaPericia);
      setOpcional(res, "cd_formula", campos.resistenciaCdFormula);
      (resistenciaEfeito as Record<string, unknown>).resistencia = res;
    }
  }

  aplicarEfeitos(base, "spell", campos.efeitos, origemLegado);
  aplicarRequisitosTopo(base, campos.requisitos);
  return base;
}

// ---------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------
function serializarItem(base: Record<string, unknown>, campos: CamposItem, origemLegado: boolean): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  setOpcional(base, "categoria", campos.categoria);
  // `categoria_label`/`raridade_label` nunca vêm do client — sempre
  // derivados no servidor a partir do valor canônico (ver itemLabels.ts),
  // impedindo a combinação inconsistente "categoria válida com label de
  // outra categoria". `setOpcional` já remove a chave quando o resultado
  // é `undefined` (categoria ausente ou não reconhecida) — a checagem de
  // "reconhecida" em si é bloqueante em `validarItemParaPublicacao`
  // (publishReview.ts), não aqui (serialização não decide se publica).
  setOpcional(base, "categoria_label", categoriaItemLabel(campos.categoria));
  setOpcional(base, "subtipo", campos.subtipo);
  setOpcional(base, "raridade", campos.raridade);
  setOpcional(base, "raridade_label", raridadeItemLabel(campos.raridade));
  setOpcional(base, "preco", campos.preco);
  setOpcional(base, "descricao_curta", campos.descricaoCurta);
  setOpcional(base, "descricao_longa", campos.descricaoLonga);
  base.tags = [...campos.tags];

  const est = asRecord(base.estatisticas);
  if (campos.propriedades.length > 0) est.propriedades = [...campos.propriedades];
  // Defaults de modelo (Etapa 9) — mesmas chaves reais lidas por
  // normalizeItemContent (character/inventory.ts). Nunca tocam em
  // instância (mitAtual/pdAtual/cargasAtual/municaoAtual vivem só no
  // personagem, nunca neste payload de conteúdo).
  setOpcional(est, "mit_base", campos.mitBase);
  setOpcional(est, "pd_max", campos.pdBase);
  setOpcional(est, "tipo_protecao", campos.tipoProtecao);
  if (campos.regioes && campos.regioes.length > 0) est.regioes = [...campos.regioes];
  setOpcional(est, "slots_runa_max", campos.slotsRunaMax);
  setOpcional(est, "cargas_max", campos.cargasMax);
  setOpcional(est, "municao_max", campos.municaoMax);
  setOpcional(est, "municao_compativel", campos.municaoCompativelSlug);
  base.estatisticas = est;

  aplicarEfeitos(base, "item", campos.efeitos, origemLegado);
  return base;
}

// ---------------------------------------------------------------------
// Runa (Etapa 9) — schema `schema_runas_v1_2.json`, additionalProperties
// aberto no efeito, mas campos de topo fechados (`categoria`/
// `categoria_label` const "runa"/"Runa", `custo_integridade` sempre 0 —
// nunca escrito a partir do editor, nunca uma regra reintroduzida).
// ---------------------------------------------------------------------
function serializarRuna(base: Record<string, unknown>, campos: CamposRuna, origemLegado: boolean): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  base.categoria = "runa";
  base.categoria_label = "Runa";
  setOpcional(base, "raridade", campos.raridade);
  setOpcional(base, "preco", campos.preco);
  setOpcional(base, "descricao_curta", campos.descricaoCurta);
  setOpcional(base, "descricao_longa", campos.descricaoLonga);
  base.tags = [...campos.tags];
  base.custo_integridade = 0;
  base.slots_possiveis = [...campos.slotsPossiveis];
  setOpcional(base, "restricao_subtipo", campos.restricaoSubtipo);
  base.requisito_pericia = campos.requisitoPericia ?? null;

  aplicarEfeitos(base, "rune", campos.efeitos, origemLegado);
  return base;
}

// ---------------------------------------------------------------------
// Talento (árvore com 3 níveis, um único documento)
// ---------------------------------------------------------------------
function serializarTalento(base: Record<string, unknown>, campos: CamposTalento, origemLegado: boolean): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  setOpcional(base, "descricao_curta", campos.descricaoCurta);
  setOpcional(base, "descricao_longa", campos.descricaoLonga);
  base.tags = [...campos.tags];

  const niveisBase = Array.isArray(base.niveis) ? (base.niveis as unknown[]) : [];
  // Mantém os 3 níveis no MESMO documento; sobrepõe cada nível pelo seu índice.
  const niveisSaida = campos.niveis.map((nivelEditavel, indice) => {
    const nivelBase = asRecord(niveisBase[indice]);
    setOpcional(nivelBase, "nome", nivelEditavel.nomeNivel);
    setOpcional(nivelBase, "descricao_curta", nivelEditavel.descricaoCurta);
    setOpcional(nivelBase, "descricao_longa", nivelEditavel.descricaoLonga);
    nivelBase.nivel = nivelEditavel.nivel;
    aplicarEfeitos(nivelBase, "talent", nivelEditavel.efeitos, origemLegado);
    aplicarRequisitosNivel(nivelBase, nivelEditavel.requisitos);
    return nivelBase;
  });
  base.niveis = niveisSaida;
  return base;
}

// ---------------------------------------------------------------------
// Capítulo (Etapa 11, correção do drag) — documento editorial puro, sem
// `estatisticas`/`payload_automacao` (não tem automação — aditivo
// §11.11). `blocos` é a hierarquia ordenada; cada bloco de entidade
// serializa só `tipo_conteudo`/`slug` (nunca o payload da entidade
// referenciada — sempre resolvido de novo na leitura).
// ---------------------------------------------------------------------
function serializarCapitulo(base: Record<string, unknown>, campos: CamposCapitulo): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  setOpcional(base, "categoria", campos.categoria);
  setOpcional(base, "descricao_curta", campos.descricaoCurta);
  setOpcional(base, "descricao_longa", campos.descricaoLonga);
  setOpcional(base, "corpo", campos.corpo);
  base.tags = [...campos.tags];
  base.blocos = campos.blocos.map((bloco) =>
    bloco.tipo === "texto"
      ? { id: bloco.id, tipo: "texto", texto: bloco.texto }
      : { id: bloco.id, tipo: "entidade", entidade: { tipo_conteudo: bloco.entidade.contentType, slug: bloco.entidade.slug } },
  );
  return base;
}

// ---------------------------------------------------------------------
// Auxiliares compartilhados
// ---------------------------------------------------------------------
function aplicarEfeitos(alvo: Record<string, unknown>, contentType: DraftContentType, efeitosEditaveis: EfeitoEditavel[], origemLegado: boolean): void {
  const automacao = asRecord(alvo.payload_automacao);
  const efeitosOriginais = Array.isArray(automacao.efeitos) ? automacao.efeitos : [];
  automacao.efeitos = reconstruirEfeitosLegado(
    contentType,
    efeitosOriginais,
    efeitosEditaveis,
    (tipoLegado) => ehEfeitoLegadoSubstituivel(contentType, tipoLegado, origemLegado),
  );
  alvo.payload_automacao = automacao;
}

/** Requisitos de magia/item não têm caminho legado canônico — vão para um array de topo aditivo, só quando houver. */
function aplicarRequisitosTopo(base: Record<string, unknown>, requisitos: { tipoConteudo: string; slug: string }[]): void {
  if (requisitos.length === 0) return;
  base.requisitos = requisitos.map((r) => ({ tipo_conteudo: r.tipoConteudo, slug: r.slug }));
}

/** Requisitos de talento vivem por nível no formato legado. */
function aplicarRequisitosNivel(nivelBase: Record<string, unknown>, requisitos: { tipoConteudo: string; slug: string }[]): void {
  nivelBase.requisitos = requisitos.map((r) => ({ tipo_conteudo: r.tipoConteudo, slug: r.slug }));
}

/**
 * Serializa o rascunho para o corpo legado publicável. Não define
 * versão/status/timestamps (autoridade do RPC). Sempre parte de um clone
 * do rawOriginal — nunca perde campo preservado.
 */
export function serializarRascunhoParaPublicacao(draft: ContentDraftRow): Record<string, unknown> {
  const base = clonar(asRecord(draft.payload.preservado.rawOriginal));
  const editaveis = draft.payload.camposEditaveis;
  const origemLegado = draft.payload.origemLegado !== undefined;

  if (editaveis.contentType === "spell") return serializarMagia(base, editaveis.campos, origemLegado);
  if (editaveis.contentType === "item") return serializarItem(base, editaveis.campos, origemLegado);
  if (editaveis.contentType === "rune") return serializarRuna(base, editaveis.campos, origemLegado);
  if (editaveis.contentType === "capitulo") return serializarCapitulo(base, editaveis.campos);
  return serializarTalento(base, editaveis.campos, origemLegado);
}
