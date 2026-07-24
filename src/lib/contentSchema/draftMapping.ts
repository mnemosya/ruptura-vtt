/**
 * Extração de campos editáveis a partir do canônico (Etapa 1) e
 * inicializadores de rascunho vazio/novo. Único lugar que sabe converter
 * `ConteudoCanonico` → `CamposX` — o formulário nunca lê o canônico
 * diretamente, e o canônico nunca é reconstruído a partir dos campos
 * editados (ver nota de arquitetura em `draftTypes.ts`).
 */

import { adaptItem } from "./adapters/item";
import { adaptRune } from "./adapters/rune";
import { adaptSpell } from "./adapters/spell";
import { adaptTalentLevel } from "./adapters/talent";
import { extrairEfeitosEditaveis } from "./effectDraftMapping";
import type { ConteudoCanonico, Referencia } from "./types";
import type { CamposCapitulo, CamposItem, CamposMagia, CamposRuna, CamposTalento, CamposTalentoNivel, RequisitoSimples } from "./draftTypes";

function asNumber(valor: unknown): number | undefined {
  return typeof valor === "number" ? valor : undefined;
}

function asString(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

function referenciasParaRequisitos(referencias: Referencia[], papelPrefixo: string): RequisitoSimples[] {
  return referencias.filter((r) => r.papel?.startsWith(papelPrefixo)).map((r) => ({ tipoConteudo: r.tipoConteudo, slug: r.slug, descricao: r.papel }));
}

// ---------------------------------------------------------------------
// Magia
// ---------------------------------------------------------------------

export function extrairCamposMagia(canonico: ConteudoCanonico): CamposMagia {
  const classificacao = canonico.classificacao;
  const alcance = classificacao.alcance as Record<string, unknown> | undefined;
  const area = classificacao.area as Record<string, unknown> | undefined;

  return {
    nome: canonico.nome,
    slug: canonico.slug,
    categoria: canonico.categoria,
    subtipo: canonico.subtipo,
    descricaoCurta: canonico.descricaoCurta,
    descricaoLonga: canonico.descricaoLonga,
    tags: canonico.tags,
    vertente: asString(classificacao.vertente),
    nivel: asNumber(classificacao.nivel),
    tipoMagia: asString(classificacao.tipoMagia),
    custoPa: asNumber(classificacao.custoPa),
    custoMana: asNumber(classificacao.custoMana),
    custoSobrecarga: asNumber(classificacao.custoSobrecarga),
    alcanceValorM: asNumber(alcance?.valor_m),
    alcanceTipo: asString(alcance?.tipo),
    areaTipo: asString(area?.tipo),
    areaTexto: asString(area?.texto ?? area?.parametros_texto),
    duracaoTexto: canonico.duracao?.texto,
    sustentavel: canonico.duracao?.sustentavel,
    resolucao: asString(classificacao.resolucao),
    periciaTeste: asString(classificacao.periciaTeste),
    resistenciaPericia: canonico.resistencia?.pericia,
    resistenciaCdFormula: canonico.resistencia?.cdFormula,
    requisitos: referenciasParaRequisitos(canonico.referencias, "requisito"),
    efeitos: extrairEfeitosEditaveis(canonico.efeitos),
  };
}

export function vazioCamposMagia(): CamposMagia {
  return { nome: "", slug: "", tags: [], requisitos: [], efeitos: [] };
}

export function rawOriginalSpellVazio(): Record<string, unknown> {
  return { estatisticas: {}, payload_automacao: { efeitos: [] } };
}

export function adaptarRawSpell(raw: Record<string, unknown>) {
  return adaptSpell(raw);
}

// ---------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------

export function extrairCamposItem(canonico: ConteudoCanonico): CamposItem {
  const classificacao = canonico.classificacao;
  return {
    nome: canonico.nome,
    slug: canonico.slug,
    categoria: canonico.categoria,
    subtipo: canonico.subtipo,
    descricaoCurta: canonico.descricaoCurta,
    descricaoLonga: canonico.descricaoLonga,
    tags: canonico.tags,
    raridade: asString(classificacao.raridade),
    preco: asNumber(classificacao.preco),
    propriedades: [],
    efeitos: extrairEfeitosEditaveis(canonico.efeitos),
  };
}

export function vazioCamposItem(): CamposItem {
  return { nome: "", slug: "", tags: [], propriedades: [], efeitos: [] };
}

export function rawOriginalItemVazio(): Record<string, unknown> {
  return { estatisticas: {}, payload_automacao: { efeitos: [] } };
}

export function adaptarRawItem(raw: Record<string, unknown>) {
  return adaptItem(raw);
}

// ---------------------------------------------------------------------
// Runa (Etapa 9)
// ---------------------------------------------------------------------

function asStringArrayLocal(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

export function extrairCamposRuna(canonico: ConteudoCanonico): CamposRuna {
  const classificacao = canonico.classificacao;
  return {
    nome: canonico.nome,
    slug: canonico.slug,
    categoria: canonico.categoria,
    descricaoCurta: canonico.descricaoCurta,
    descricaoLonga: canonico.descricaoLonga,
    tags: canonico.tags,
    raridade: asString(classificacao.raridade),
    preco: asNumber(classificacao.preco),
    slotsPossiveis: asStringArrayLocal(classificacao.slotsPossiveis),
    restricaoSubtipo: asString(classificacao.restricaoSubtipo),
    requisitoPericia: asString(classificacao.requisitoPericia),
    efeitos: extrairEfeitosEditaveis(canonico.efeitos),
  };
}

export function vazioCamposRuna(): CamposRuna {
  return { nome: "", slug: "", tags: [], slotsPossiveis: [], efeitos: [] };
}

export function rawOriginalRunaVazio(): Record<string, unknown> {
  return { categoria: "runa", categoria_label: "Runa", custo_integridade: 0, slots_possiveis: [], payload_automacao: { efeitos: [] } };
}

export function adaptarRawRune(raw: Record<string, unknown>) {
  return adaptRune(raw);
}

// ---------------------------------------------------------------------
// Talento (árvore com 3 níveis)
// ---------------------------------------------------------------------

function extrairCamposTalentoNivel(canonico: ConteudoCanonico): CamposTalentoNivel {
  const nivel = asNumber(canonico.classificacao.nivel) ?? 1;

  return {
    nivel,
    nomeNivel: canonico.nome,
    descricaoCurta: canonico.descricaoCurta,
    descricaoLonga: canonico.descricaoLonga,
    requisitos: referenciasParaRequisitos(canonico.referencias, "requisito"),
    efeitos: extrairEfeitosEditaveis(canonico.efeitos),
  };
}

export function extrairCamposTalento(talentoSlug: string, talentoNome: string, talentoRaw: Record<string, unknown>, niveisCanonicos: ConteudoCanonico[]): CamposTalento {
  const niveis = [1, 2, 3].map((nivelAlvo) => {
    const canonico = niveisCanonicos.find((c) => asNumber(c.classificacao.nivel) === nivelAlvo);
    return canonico ? extrairCamposTalentoNivel(canonico) : { nivel: nivelAlvo, nomeNivel: "", requisitos: [], efeitos: [] };
  }) as [CamposTalentoNivel, CamposTalentoNivel, CamposTalentoNivel];

  return {
    nome: talentoNome,
    slug: talentoSlug,
    tags: Array.isArray(talentoRaw.tags) ? talentoRaw.tags.filter((t): t is string => typeof t === "string") : [],
    descricaoCurta: asString(talentoRaw.descricao_curta),
    descricaoLonga: asString(talentoRaw.descricao_longa),
    niveis,
  };
}

export function vazioCamposTalento(): CamposTalento {
  return {
    nome: "",
    slug: "",
    tags: [],
    niveis: [
      { nivel: 1, nomeNivel: "", requisitos: [], efeitos: [] },
      { nivel: 2, nomeNivel: "", requisitos: [], efeitos: [] },
      { nivel: 3, nomeNivel: "", requisitos: [], efeitos: [] },
    ],
  };
}

export function rawOriginalTalentoVazio(slug: string, nome: string): Record<string, unknown> {
  return {
    slug,
    nome,
    tags: [],
    niveis: [1, 2, 3].map((nivel) => ({
      slug: `${slug}-n${nivel}`,
      talento_id: slug,
      nivel,
      nome: "",
      requisitos: [],
      tags: [],
      payload_automacao: { efeitos: [] },
    })),
  };
}

export function adaptarRawTalento(talentoRaw: Record<string, unknown>) {
  const slug = String(talentoRaw.slug ?? talentoRaw.id ?? "");
  const nome = String(talentoRaw.nome ?? slug);
  const niveisRaw = Array.isArray(talentoRaw.niveis) ? talentoRaw.niveis : [];
  const resultados = niveisRaw
    .map((n) => (typeof n === "object" && n !== null ? (n as Record<string, unknown>) : undefined))
    .filter((n): n is Record<string, unknown> => n !== undefined)
    .map((n) => adaptTalentLevel(slug, nome, n));
  return resultados;
}

// ---------------------------------------------------------------------
// Capítulo (Etapa 11, correção do drag) — documento editorial puro, sem
// automação/efeitos e sem conteúdo legado prévio (5º content type
// editável, nunca existiu antes desta correção — por isso não há
// `extrairCamposCapitulo`/`adaptarRawCapitulo`: nenhum capítulo publicado
// jamais existiu fora do Editor Universal para "adaptar de legado").
// ---------------------------------------------------------------------
export function vazioCamposCapitulo(): CamposCapitulo {
  return { nome: "", slug: "", tags: [], corpo: "", blocos: [] };
}

export function rawOriginalCapituloVazio(): Record<string, unknown> {
  return { blocos: [] };
}
