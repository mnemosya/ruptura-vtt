/**
 * Vertentes e magias — checkpoint v0.50 (PRD 11.4). Catálogo inteiro
 * (132 magias, 6 vertentes, especializações) vem de
 * `content_documents` (content_type="spell", `listSpells()`, já
 * existente) — nunca lista manual. A ficha só mostra as magias das
 * vertentes que o personagem CONHECE (`Character.vertentes_conhecidas`,
 * adicionada em Modo Evolução — mesmo espírito de talentos/atributos).
 *
 * Escopo deliberadamente pequeno (mesmo critério de v0.47/v0.48/v0.49):
 * "Conjurar" desconta PA/Mana (custo_mana pode ser `null` no DB atual —
 * PRD autoriza placeholder; nunca inventamos um número) e registra o
 * resumo no log. Magias com efeito `dano` ganham atalho de rolagem
 * (reaproveita `rollDamageFormula` de `attack.ts`, mesmo parser "NdM").
 * Magias com `resolucao:"resistencia"` mostram a CD e o aviso de teste
 * do alvo como TEXTO — nenhuma resolução automática de resistência do
 * alvo é implementada aqui (exigiria o mesmo motor de ataque
 * contestado do v0.47, mas para alvo de magia; documentado como
 * pendência, não inventado).
 *
 * NÃO implementado (PRD 11.4, fora de escopo): efeitos de controle/
 * movimento/suporte automatizados por tipo, sustentação de duração,
 * modal completo de detalhe (a UI usa expandir/recolher, mais simples
 * que um modal de verdade), especialização alterando a magia em si.
 */

import { rollDamageFormula } from "./attack";
import type { Character } from "./types";

// ---------------------------------------------------------------------
// Conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface SpellStatistics {
  nivel: number;
  tipo_magia: string;
  custo_pa: number;
  usa_reacao: boolean;
  /** `null` no DB atual para várias magias — PRD autoriza placeholder; nunca inventamos um valor. */
  custo_mana: number | null;
  resolucao: string;
}

export interface SpellEffect {
  tipo: string;
  [key: string]: unknown;
}

export interface SpellContent {
  id: string;
  slug: string;
  nome: string;
  vertente: string;
  vertente_label?: string;
  descricao_curta?: string;
  descricao_longa?: string;
  tags: string[];
  estatisticas: SpellStatistics;
  payload_automacao?: unknown;
  status: string;
}

export interface SpecializationContent {
  vertente: string;
  nome: string;
  slug: string;
  descricao?: string;
  criterio_aplicacao?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos. */
export function normalizeSpellContent(raw: Record<string, unknown>): SpellContent {
  const estatisticasRaw = asRecord(raw.estatisticas) ?? {};
  const alcanceRaw = asRecord(estatisticasRaw.alcance);
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Magia"),
    vertente: String(raw.vertente ?? ""),
    vertente_label: typeof raw.vertente_label === "string" ? raw.vertente_label : undefined,
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricao_longa: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    tags: asStringArray(raw.tags),
    estatisticas: {
      nivel: typeof estatisticasRaw.nivel === "number" ? estatisticasRaw.nivel : 1,
      tipo_magia: typeof estatisticasRaw.tipo_magia === "string" ? estatisticasRaw.tipo_magia : "",
      custo_pa: typeof estatisticasRaw.custo_pa === "number" ? estatisticasRaw.custo_pa : 0,
      usa_reacao: estatisticasRaw.usa_reacao === true,
      custo_mana: typeof estatisticasRaw.custo_mana === "number" ? estatisticasRaw.custo_mana : null,
      resolucao: typeof estatisticasRaw.resolucao === "string" ? estatisticasRaw.resolucao : "",
    },
    payload_automacao: raw.payload_automacao,
    status: String(raw.status ?? "published"),
  };
}

export function normalizeSpecializationContent(raw: Record<string, unknown>): SpecializationContent {
  return {
    vertente: String(raw.vertente ?? ""),
    nome: String(raw.nome ?? ""),
    slug: String(raw.slug ?? ""),
    descricao: typeof raw.descricao === "string" ? raw.descricao : undefined,
    criterio_aplicacao: typeof raw.criterio_aplicacao === "string" ? raw.criterio_aplicacao : undefined,
  };
}

function getSpellEffects(spell: SpellContent): SpellEffect[] {
  const payload = asRecord(spell.payload_automacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? (efeitos as SpellEffect[]) : [];
}

export interface SpellDamageEffect {
  dado: string;
  tipo_dano: string;
  subtipo_dano?: string;
}

/** Efeito de dano da magia, se houver — nunca inventa fórmula. */
export function getSpellDamageEffect(spell: SpellContent): SpellDamageEffect | null {
  const efeito = getSpellEffects(spell).find((e) => e.tipo === "dano");
  if (!efeito || typeof efeito.dado !== "string" || typeof efeito.tipo_dano !== "string") return null;
  return { dado: efeito.dado, tipo_dano: efeito.tipo_dano, subtipo_dano: typeof efeito.subtipo_dano === "string" ? efeito.subtipo_dano : undefined };
}

export interface SpellResistanceEffect {
  cdFormula: string;
  acoes: string[];
}

/** Efeito de resistência da magia, se houver — só texto/CD, nunca resolve o alvo automaticamente. */
export function getSpellResistanceEffect(spell: SpellContent): SpellResistanceEffect | null {
  const efeito = getSpellEffects(spell).find((e) => e.tipo === "efeito_com_resistencia");
  if (!efeito) return null;
  const resistencia = asRecord(efeito.resistencia);
  const cdFormula = typeof resistencia?.cd_formula === "string" ? resistencia.cd_formula : "?";
  const acoes = asStringArray(resistencia?.acoes);
  return { cdFormula, acoes };
}

/** Rola o dado de dano da magia (reaproveita o parser "NdM" de `attack.ts` — mesmo mecanismo, sem duplicar). */
export function rollSpellDamage(spell: SpellContent, rng?: () => number): number | null {
  const efeito = getSpellDamageEffect(spell);
  if (!efeito) return null;
  return rollDamageFormula(efeito.dado, rng);
}

// ---------------------------------------------------------------------
// Vertentes conhecidas — Modo Evolução (PRD 11.4 "permitir adicionar
// vertente no Modo Evolução").
// ---------------------------------------------------------------------

export function addKnownVertente(character: Character, vertente: string): Character {
  const atuais = character.vertentes_conhecidas ?? [];
  if (atuais.includes(vertente)) return character;
  return { ...character, vertentes_conhecidas: [...atuais, vertente] };
}

export function removeKnownVertente(character: Character, vertente: string): Character {
  const atuais = character.vertentes_conhecidas ?? [];
  const next = atuais.filter((v) => v !== vertente);
  if (next.length === atuais.length) return character;
  return { ...character, vertentes_conhecidas: next };
}

// ---------------------------------------------------------------------
// Magias aprendidas — checkpoint v0.50.1. Conhecer a vertente só define
// QUAIS magias aparecem para aprender (filtro de exibição, PRD 11.4);
// aprender é por magia individual, mesmo padrão de
// `acquireTalentLevel`/`removeTalentLevel` (v0.48) — idempotente, um
// item por magia aprendida.
// ---------------------------------------------------------------------

export interface LearnedSpell {
  id: string;
  spellSlug: string;
  aprendidaEm: string;
}

export function learnSpell(character: Character, spellSlug: string, nowIso: string): Character {
  const atuais = character.magias_aprendidas ?? [];
  if (atuais.some((m) => m.spellSlug === spellSlug)) return character;
  const nova: LearnedSpell = { id: crypto.randomUUID(), spellSlug, aprendidaEm: nowIso };
  return { ...character, magias_aprendidas: [...atuais, nova] };
}

export function forgetSpell(character: Character, learnedId: string): Character {
  const atuais = character.magias_aprendidas ?? [];
  const next = atuais.filter((m) => m.id !== learnedId);
  if (next.length === atuais.length) return character;
  return { ...character, magias_aprendidas: next };
}

export function isSpellLearned(character: Pick<Character, "magias_aprendidas">, spellSlug: string): boolean {
  return (character.magias_aprendidas ?? []).some((m) => m.spellSlug === spellSlug);
}

// ---------------------------------------------------------------------
// Conjurar — desconta PA/Mana, nunca inventa custo_mana ausente.
// ---------------------------------------------------------------------

export interface CastSpellResult {
  character: Character;
  ok: boolean;
  reason?: string;
  paBefore: number;
  paAfter: number;
  manaBefore?: number;
  manaAfter?: number;
  manaCostUnknown: boolean;
}

/**
 * Desconta PA (sempre) e Mana (só se `custo_mana` for um número real no
 * conteúdo — placeholder `null` não bloqueia a conjuração, só marca
 * `manaCostUnknown: true` para a UI avisar). Sem PA suficiente, devolve
 * `ok:false` sem mutar nada (mesmo padrão de `canPayActionCost`/
 * `purchaseItem`).
 */
export function castSpell(params: {
  character: Character;
  spell: SpellContent;
  paMax: number;
  manaMax: number;
}): CastSpellResult {
  const { character, spell, paMax, manaMax } = params;
  const paGastosAntes = character.estado_jogo?.pa_gastos ?? 0;
  const paBefore = Math.max(0, paMax - paGastosAntes);
  const custoPa = spell.estatisticas.custo_pa;

  if (custoPa > paBefore) {
    return {
      character,
      ok: false,
      reason: `PA insuficiente (atual: ${paBefore}, necessário: ${custoPa}).`,
      paBefore,
      paAfter: paBefore,
      manaCostUnknown: spell.estatisticas.custo_mana == null,
    };
  }

  const manaCostUnknown = spell.estatisticas.custo_mana == null;
  const manaAntes = character.recursos_atuais?.mana ?? manaMax;
  const custoMana = spell.estatisticas.custo_mana ?? 0;

  if (!manaCostUnknown && custoMana > manaAntes) {
    return {
      character,
      ok: false,
      reason: `Mana insuficiente (atual: ${manaAntes}, necessário: ${custoMana}).`,
      paBefore,
      paAfter: paBefore,
      manaBefore: manaAntes,
      manaAfter: manaAntes,
      manaCostUnknown,
    };
  }

  const manaDepois = manaCostUnknown ? manaAntes : manaAntes - custoMana;
  const nextCharacter: Character = {
    ...character,
    estado_jogo: { ...character.estado_jogo, pa_gastos: paGastosAntes + custoPa },
    recursos_atuais: manaCostUnknown ? character.recursos_atuais : { ...character.recursos_atuais, mana: manaDepois },
  };

  return {
    character: nextCharacter,
    ok: true,
    paBefore,
    paAfter: paBefore - custoPa,
    manaBefore: manaAntes,
    manaAfter: manaDepois,
    manaCostUnknown,
  };
}
