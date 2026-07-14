/**
 * Extração de campos editáveis a partir do canônico (Etapa 1) e
 * inicializadores de rascunho vazio/novo. Único lugar que sabe converter
 * `ConteudoCanonico` → `CamposX` — o formulário nunca lê o canônico
 * diretamente, e o canônico nunca é reconstruído a partir dos campos
 * editados (ver nota de arquitetura em `draftTypes.ts`).
 */

import { adaptItem } from "./adapters/item";
import { adaptSpell } from "./adapters/spell";
import { adaptTalentLevel } from "./adapters/talent";
import type { ConteudoCanonico, Referencia } from "./types";
import type { CamposItem, CamposMagia, CamposTalento, CamposTalentoNivel, RequisitoSimples } from "./draftTypes";

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
  };
}

export function vazioCamposMagia(): CamposMagia {
  return { nome: "", slug: "", tags: [], requisitos: [] };
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
  };
}

export function vazioCamposItem(): CamposItem {
  return { nome: "", slug: "", tags: [], propriedades: [] };
}

export function rawOriginalItemVazio(): Record<string, unknown> {
  return { estatisticas: {}, payload_automacao: { efeitos: [] } };
}

export function adaptarRawItem(raw: Record<string, unknown>) {
  return adaptItem(raw);
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
  };
}

export function extrairCamposTalento(talentoSlug: string, talentoNome: string, talentoRaw: Record<string, unknown>, niveisCanonicos: ConteudoCanonico[]): CamposTalento {
  const niveis = [1, 2, 3].map((nivelAlvo) => {
    const canonico = niveisCanonicos.find((c) => asNumber(c.classificacao.nivel) === nivelAlvo);
    return canonico ? extrairCamposTalentoNivel(canonico) : { nivel: nivelAlvo, nomeNivel: "", requisitos: [] };
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
      { nivel: 1, nomeNivel: "", requisitos: [] },
      { nivel: 2, nomeNivel: "", requisitos: [] },
      { nivel: 3, nomeNivel: "", requisitos: [] },
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
