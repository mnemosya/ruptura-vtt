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
import { isTipoEfeitoMvp, type EfeitoEditavel } from "./effectDraftTypes";
import { resolverTipoCanonico } from "./effectTypeRegistry";
import { reconstruirEfeitosLegado } from "./effectLegacySerialization";

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

/** True quando o efeito legado é um dos 6 tipos do MVP para aquele content_type (será substituído pelos editáveis). */
function ehEfeitoMvpLegado(contentType: DraftContentType, tipoLegado: string | undefined): boolean {
  return isTipoEfeitoMvp(resolverTipoCanonico(contentType, tipoLegado));
}

// ---------------------------------------------------------------------
// Magia
// ---------------------------------------------------------------------
function serializarMagia(base: Record<string, unknown>, campos: CamposMagia): Record<string, unknown> {
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

  aplicarEfeitos(base, "spell", campos.efeitos);
  aplicarRequisitosTopo(base, campos.requisitos);
  return base;
}

// ---------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------
function serializarItem(base: Record<string, unknown>, campos: CamposItem): Record<string, unknown> {
  setOpcional(base, "nome", campos.nome);
  setOpcional(base, "categoria", campos.categoria);
  setOpcional(base, "subtipo", campos.subtipo);
  setOpcional(base, "raridade", campos.raridade);
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

  aplicarEfeitos(base, "item", campos.efeitos);
  return base;
}

// ---------------------------------------------------------------------
// Runa (Etapa 9) — schema `schema_runas_v1_2.json`, additionalProperties
// aberto no efeito, mas campos de topo fechados (`categoria`/
// `categoria_label` const "runa"/"Runa", `custo_integridade` sempre 0 —
// nunca escrito a partir do editor, nunca uma regra reintroduzida).
// ---------------------------------------------------------------------
function serializarRuna(base: Record<string, unknown>, campos: CamposRuna): Record<string, unknown> {
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

  aplicarEfeitos(base, "rune", campos.efeitos);
  return base;
}

// ---------------------------------------------------------------------
// Talento (árvore com 3 níveis, um único documento)
// ---------------------------------------------------------------------
function serializarTalento(base: Record<string, unknown>, campos: CamposTalento): Record<string, unknown> {
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
    aplicarEfeitos(nivelBase, "talent", nivelEditavel.efeitos);
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
function aplicarEfeitos(alvo: Record<string, unknown>, contentType: DraftContentType, efeitosEditaveis: EfeitoEditavel[]): void {
  const automacao = asRecord(alvo.payload_automacao);
  const efeitosOriginais = Array.isArray(automacao.efeitos) ? automacao.efeitos : [];
  automacao.efeitos = reconstruirEfeitosLegado(
    contentType,
    efeitosOriginais,
    efeitosEditaveis,
    (tipoLegado) => ehEfeitoMvpLegado(contentType, tipoLegado),
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

  if (editaveis.contentType === "spell") return serializarMagia(base, editaveis.campos);
  if (editaveis.contentType === "item") return serializarItem(base, editaveis.campos);
  if (editaveis.contentType === "rune") return serializarRuna(base, editaveis.campos);
  if (editaveis.contentType === "capitulo") return serializarCapitulo(base, editaveis.campos);
  return serializarTalento(base, editaveis.campos);
}
