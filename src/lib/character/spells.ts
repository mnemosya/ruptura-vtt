/**
 * Vertentes e magias — checkpoint v0.50/v0.50.1/v0.50.2 (PRD 11.4),
 * consumo de Mana temporária no v0.53 (achado da auditoria v0.50 sobre
 * `custo_mana`). Catálogo inteiro (132 magias, 6 vertentes,
 * especializações) vem de `content_documents` (content_type="spell",
 * `listSpells()`, já existente) — nunca lista manual. Cada magia é
 * aprendida INDIVIDUALMENTE (`Character.magias_aprendidas`, mesmo
 * padrão de talentos, v0.48); a vertente "conhecida" é só uma
 * DERIVAÇÃO de já ter aprendido pelo menos 1 magia dela
 * (`getKnownVertentes`) — sem passo manual separado de "conhecer
 * vertente" (removido no v0.50.2 a pedido do usuário, redundante com
 * aprender magia individual).
 *
 * Escopo deliberadamente pequeno (mesmo critério de v0.47/v0.48/v0.49):
 * "Conjurar" desconta PA (sempre) e Mana (só quando `custo_mana` é um
 * número real no conteúdo — 13 das 132 magias publicadas, todas da
 * vertente Sináptica; as outras 119 ficam `null` por decisão explícita
 * do PRD §11.4/Fase 5 — "custo de mana pode usar placeholder enquanto
 * os valores finais não estiverem fechados" — NUNCA inventamos um
 * número para elas). Drena `mana_temporaria` ANTES da mana normal (PRD
 * 10.3), registra o resumo no log. Magias com efeito `dano` ganham
 * atalho de rolagem (reaproveita `rollDamageFormula` de `attack.ts`,
 * mesmo parser "NdM"). Magias com `resolucao:"resistencia"` mostram a
 * CD e o aviso de teste do alvo como TEXTO — nenhuma resolução
 * automática de resistência do alvo é implementada aqui (exigiria o
 * mesmo motor de ataque contestado do v0.47, mas para alvo de magia;
 * documentado como pendência, não inventado).
 *
 * NÃO implementado (PRD 11.4, fora de escopo): efeitos de controle/
 * movimento/suporte automatizados por tipo, sustentação de duração,
 * modal completo de detalhe (a UI usa expandir/recolher, mais simples
 * que um modal de verdade), especialização alterando a magia em si.
 */

import { rollDamageFormula } from "./attack";
import { getOverloadMaxPerDay } from "./overload";
import type { Character, OverloadRulesPayload } from "./types";

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
  /** Fórmula "NdM" quando o payload declara `dado` — ausente em dano fixo. */
  dado?: string;
  /** Dano FIXO quando o payload declara `valor` numérico (ex.: Arranque: 1) — ausente quando há dado. */
  valor?: number;
  tipo_dano: string;
  subtipo_dano?: string;
  /** O que acontece em sucesso do alvo (ex.: "metade") — texto do payload, resolução manual. */
  sucesso?: string;
}

/** Efeito de dano da magia, se houver — cobre `dado` (fórmula) E `valor` (fixo); nunca inventa fórmula. */
export function getSpellDamageEffect(spell: SpellContent): SpellDamageEffect | null {
  const efeito = getSpellEffects(spell).find((e) => e.tipo === "dano");
  if (!efeito || typeof efeito.tipo_dano !== "string") return null;
  const dado = typeof efeito.dado === "string" ? efeito.dado : undefined;
  const valor = typeof efeito.valor === "number" ? efeito.valor : undefined;
  if (!dado && valor == null) return null;
  return {
    dado,
    valor,
    tipo_dano: efeito.tipo_dano,
    subtipo_dano: typeof efeito.subtipo_dano === "string" ? efeito.subtipo_dano : undefined,
    sucesso: typeof efeito.sucesso === "string" ? efeito.sucesso : undefined,
  };
}

export interface SpellResistanceEffect {
  /**
   * Fórmula BRUTA do conteúdo (`resistencia.cd_formula`) — hoje sempre
   * `"5 + nivel_vertente"` no payload publicado (achado desatualizado
   * da digitalização original). NUNCA exibida ao usuário nem usada
   * para calcular a CD — a regra do VTT é `6 + nível` (ver
   * `getVertenteCd`/`resolveSpellResistance`); este campo existe só
   * para diagnóstico interno (ex.: detectar que a fórmula referencia
   * `nivel_vertente`) e é preservado como veio do conteúdo, igual a
   * qualquer outro campo bruto deste módulo.
   */
  cdFormula: string;
  acoes: string[];
  /** `condicional: true` no payload — a resistência só se aplica em certas circunstâncias (texto da magia). */
  condicional: boolean;
}

/** Efeito de resistência da magia, se houver — só texto/CD, nunca resolve o alvo automaticamente. */
export function getSpellResistanceEffect(spell: SpellContent): SpellResistanceEffect | null {
  const efeito = getSpellEffects(spell).find((e) => e.tipo === "efeito_com_resistencia");
  if (!efeito) return null;
  const resistencia = asRecord(efeito.resistencia);
  const cdFormula = typeof resistencia?.cd_formula === "string" ? resistencia.cd_formula : "?";
  const acoes = asStringArray(resistencia?.acoes);
  return { cdFormula, acoes, condicional: efeito.condicional === true };
}

// ---------------------------------------------------------------------
// Nível de vertente e CD de resistência (checkpoint pós-v0.69).
//
// REGRA DO VTT (fonte: produto, não o conteúdo digitalizado):
//   CD da vertente = 6 + nível da vertente.
// Exemplos obrigatórios: nível 1 → CD 7, nível 2 → CD 8, nível 3 → CD 9,
// nível 4 → CD 10, nível 5 → CD 11. NUNCA `5 + nível` — o payload
// publicado (`resistencia.cd_formula`) ainda traz a string antiga
// "5 + nivel_vertente" (conteúdo desatualizado que não editamos aqui,
// ver `SpellResistanceEffect.cdFormula`), mas a CD numérica sempre é
// calculada com esta constante, nunca com a fórmula bruta do conteúdo.
// ---------------------------------------------------------------------

/** Base da fórmula de CD de vertente — `6 + nível`. Nunca usar `5 +` em nenhum lugar do app. */
export const VERTENTE_CD_BASE = 6;

/** CD de resistência de uma vertente no nível dado — `6 + nível` (regra do VTT, nunca `5 + nível`). */
export function getVertenteCd(nivelVertente: number): number {
  const nivel = Number.isFinite(nivelVertente) ? Math.max(0, Math.trunc(nivelVertente)) : 0;
  return VERTENTE_CD_BASE + nivel;
}

/**
 * Nível investido pelo personagem numa vertente — `null` quando não há
 * entrada em `niveis_vertente` (nível DESCONHECIDO, não zero;
 * compatibilidade com personagens antigos que nunca tiveram este
 * campo). `0` é um valor válido e diferente de "desconhecido".
 */
export function getVertenteLevel(character: Pick<Character, "niveis_vertente">, vertente: string): number | null {
  const nivel = character.niveis_vertente?.[vertente];
  return typeof nivel === "number" && Number.isFinite(nivel) ? Math.trunc(nivel) : null;
}

export interface SpellVertenteLevelCheck {
  vertenteLevel: number | null;
  /** `true` só quando o nível da vertente é CONHECIDO e é menor que `spell.estatisticas.nivel` — nunca sinaliza quando o nível está indefinido (compatibilidade com personagens antigos). */
  aboveLevel: boolean;
}

/**
 * Compara o nível da magia com o nível investido pelo personagem na
 * vertente dela — usado para SINALIZAR (nunca bloquear; ver
 * CharacterSheetClient) aprendizado/conjuração acima do nível
 * investido. Sem nível definido para a vertente, `aboveLevel` é sempre
 * `false` — não há validação rígida de pré-requisito aqui, só um aviso
 * quando o dado existe e é claramente insuficiente.
 */
export function checkSpellVertenteLevel(spell: SpellContent, character: Pick<Character, "niveis_vertente">): SpellVertenteLevelCheck {
  const vertenteLevel = getVertenteLevel(character, spell.vertente);
  const aboveLevel = vertenteLevel != null && spell.estatisticas.nivel > vertenteLevel;
  return { vertenteLevel, aboveLevel };
}

export interface ResolvedSpellResistance {
  acoes: string[];
  condicional: boolean;
  /** CD numérica final (`6 + nível`) — `null` quando o nível da vertente não está definido no personagem (nunca inventa um nível). */
  cd: number | null;
  /** `true` quando a fórmula do conteúdo referencia `nivel_vertente` (cobre 100% do catálogo atual com resistência). */
  usesVertenteLevel: boolean;
}

/**
 * Resolve a CD de resistência de uma magia para EXIBIÇÃO/uso — nunca
 * devolve a fórmula bruta do conteúdo (`cdFormula`, que ainda diz
 * "5 +"). Quando a fórmula referencia `nivel_vertente` e o nível é
 * conhecido, calcula `6 + nível`; senão devolve `cd: null` (o
 * chamador mostra "nível da vertente não definido", nunca um número
 * inventado).
 */
export function resolveSpellResistance(spell: SpellContent, vertenteLevel: number | null): ResolvedSpellResistance | null {
  const efeito = getSpellResistanceEffect(spell);
  if (!efeito) return null;
  const usesVertenteLevel = efeito.cdFormula.includes("nivel_vertente");
  const cd = usesVertenteLevel && vertenteLevel != null ? getVertenteCd(vertenteLevel) : null;
  return { acoes: efeito.acoes, condicional: efeito.condicional, cd, usesVertenteLevel };
}

/** Rola o dado de dano da magia (reaproveita o parser "NdM" de `attack.ts`); dano fixo (`valor`) devolve o próprio valor. */
export function rollSpellDamage(spell: SpellContent, rng?: () => number): number | null {
  const efeito = getSpellDamageEffect(spell);
  if (!efeito) return null;
  if (efeito.dado) return rollDamageFormula(efeito.dado, rng);
  return efeito.valor ?? null;
}

/**
 * Efeitos da magia que NÃO são automatizados — descritos textualmente a
 * partir do payload (aplicar/remover condição no alvo, cura em alvo,
 * recurso temporário, teste colateral, modificador sem duração
 * rastreada). Alvo é sempre teatro da mente: nada disso é aplicado
 * automaticamente (checkpoint pós-v0.64).
 */
export function describeSpellManualEffects(spell: SpellContent): string[] {
  const linhas: string[] = [];
  for (const efeito of getSpellEffects(spell)) {
    switch (efeito.tipo) {
      case "dano":
      case "efeito_com_resistencia":
        break; // tratados pelo fluxo de dano/resistência.
      case "aplicar_condicao":
        linhas.push(
          `Aplica a condição "${typeof efeito.condicao === "string" ? efeito.condicao : "?"}" no alvo${typeof efeito.duracao === "string" ? ` (${efeito.duracao.replace(/_/g, " ")})` : ""} — aplicação manual pelo narrador.`,
        );
        break;
      case "remover_condicao":
        linhas.push(`Remove a condição "${typeof efeito.condicao === "string" ? efeito.condicao : "?"}" do alvo — aplicação manual.`);
        break;
      case "cura":
        linhas.push(
          `Cura ${typeof efeito.dado === "string" ? efeito.dado : typeof efeito.valor === "number" ? efeito.valor : "?"} de ${efeito.recurso === "pe" ? "PE" : "PV"} no alvo — aplicação manual (alvo escolhido narrativamente).`,
        );
        break;
      case "recurso_temporario":
        linhas.push(
          `Concede ${typeof efeito.valor === "number" ? efeito.valor : "?"} de ${efeito.recurso === "pe" ? "PE" : efeito.recurso === "mana" ? "Mana" : "PV"} temporário — aplicação manual (duração não rastreada).`,
        );
        break;
      case "teste_colateral": {
        const pericia = typeof efeito.pericia === "string" ? efeito.pericia : "?";
        const cd = typeof efeito.cd === "number" ? `CD ${efeito.cd}` : "CD não estruturada";
        const momento = typeof efeito.momento === "string" ? efeito.momento.replace(/_/g, " ") : null;
        const falha = asRecord(efeito.falha);
        const falhaTexto = typeof falha?.aplicar_condicao === "string" ? `; em falha aplica "${falha.aplicar_condicao}"` : "";
        linhas.push(`Teste colateral do conjurador: ${pericia} (${cd})${momento ? ` — ${momento}` : ""}${falhaTexto} — rolar manualmente.`);
        break;
      }
      case "modificador": {
        const valor = typeof efeito.valor === "number" ? efeito.valor : null;
        const tags = asStringArray(efeito.alvo_tags);
        if (valor != null && tags.length > 0) {
          linhas.push(`Modificador ${valor >= 0 ? "+" : ""}${valor} em ${tags.join("/")} — aplicar manualmente (duração/sustentação não rastreada).`);
        } else {
          linhas.push(`Modificador declarado no payload sem estrutura completa — resolução manual.`);
        }
        break;
      }
      default:
        linhas.push(`Efeito "${efeito.tipo.replace(/_/g, " ")}" — resolução manual.`);
    }
  }
  return linhas;
}

export interface SpellCastDamage {
  formula: string;
  result: number;
  tipoDano: string;
  subtipoDano: string | null;
  /** "metade" etc. — em sucesso do alvo, ajustado manualmente. */
  sucesso: string | null;
  /** true quando o "dano" era `valor` fixo (não houve rolagem). */
  fixo: boolean;
}

export interface SpellCastResolution {
  /** `estatisticas.resolucao` — "automatica" | "resistencia" | "ataque". */
  resolucao: string;
  resistance: ResolvedSpellResistance | null;
  damage: SpellCastDamage | null;
  manualEffects: string[];
  reminders: string[];
}

/**
 * Cartão de resolução da conjuração (checkpoint pós-v0.64, CD de
 * vertente no pós-v0.69) — rola o dano (quando estruturado), calcula a
 * CD de resistência (`6 + nível da vertente`, `resolveSpellResistance`)
 * e lista os efeitos manuais. NUNCA aplica nada em alvo (teatro da
 * mente); o narrador usa as ferramentas existentes de /dev/table.
 *
 * `vertenteLevel` vem de `getVertenteLevel(character, spell.vertente)`
 * — `null` quando o personagem não tem esse nível definido ainda; a CD
 * fica `null` nesse caso (nunca inventa um nível/CD).
 *
 * Sobrecarga: auditoria do catálogo (132 magias) não encontrou NENHUM
 * campo estruturado de sobrecarga em payload de magia — não há o que
 * automatizar aqui; registrado como pendência de conteúdo (o fluxo de
 * Surto usa `sobrecarga_usada_dia`, ver overload.ts).
 */
export function prepareSpellCastResolution(spell: SpellContent, rng?: () => number, vertenteLevel: number | null = null): SpellCastResolution {
  const resistance = resolveSpellResistance(spell, vertenteLevel);
  const damageEffect = getSpellDamageEffect(spell);
  const reminders: string[] = [];

  let damage: SpellCastDamage | null = null;
  if (damageEffect) {
    const result = rollSpellDamage(spell, rng);
    if (result != null) {
      damage = {
        formula: damageEffect.dado ?? String(damageEffect.valor),
        result,
        tipoDano: damageEffect.tipo_dano,
        subtipoDano: damageEffect.subtipo_dano ?? null,
        sucesso: damageEffect.sucesso ?? null,
        fixo: !damageEffect.dado,
      };
      reminders.push("Dano rolado/preparado, nunca aplicado automaticamente — escolha alvos manualmente e resolva pelo painel do narrador.");
      if (damage.sucesso) reminders.push(`Em sucesso do alvo: ${damage.sucesso.replace(/_/g, " ")} — ajuste manual.`);
    }
  }

  if (resistance) {
    if (resistance.cd != null) {
      reminders.push(`Resistência do alvo: ${resistance.acoes.join("/") || "?"} (CD ${resistance.cd})${resistance.condicional ? " — condicional, ver texto da magia" : ""}.`);
    } else if (resistance.usesVertenteLevel) {
      reminders.push(
        `Resistência do alvo: ${resistance.acoes.join("/") || "?"} — CD depende do nível da vertente (6 + nível), que ainda não está definido na ficha (aba Magias). Defina o nível para calcular a CD.`,
      );
    } else {
      reminders.push(`Resistência do alvo: ${resistance.acoes.join("/") || "?"}${resistance.condicional ? " — condicional, ver texto da magia" : ""} — CD não estruturada.`);
    }
  }
  if (spell.estatisticas.resolucao === "ataque") {
    reminders.push("Resolução por ATAQUE mágico — role o teste pela aba Rolagens; sem motor de ataque mágico dedicado ainda.");
  }

  return {
    resolucao: spell.estatisticas.resolucao,
    resistance,
    damage,
    manualEffects: describeSpellManualEffects(spell),
    reminders,
  };
}

// ---------------------------------------------------------------------
// Magias aprendidas — checkpoint v0.50.1/v0.50.2. Não existe passo
// separado de "conhecer a vertente": conhecer a vertente é só uma
// CONSEQUÊNCIA de já ter aprendido pelo menos 1 magia dela
// (`getKnownVertentes`). Aprender é por magia individual, mesmo padrão
// de `acquireTalentLevel`/`removeTalentLevel` (v0.48) — idempotente,
// um item por magia aprendida.
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

/**
 * Vertentes "conhecidas" — derivadas, nunca um campo próprio: uma
 * vertente é conhecida assim que o personagem aprende a PRIMEIRA magia
 * dela. Sem passo manual de "marcar vertente conhecida" (removido no
 * checkpoint v0.50.2 a pedido do usuário — redundante com aprender
 * magia individual).
 */
export function getKnownVertentes(
  character: Pick<Character, "magias_aprendidas">,
  spells: SpellContent[],
): string[] {
  const aprendidas = new Set((character.magias_aprendidas ?? []).map((m) => m.spellSlug));
  const vertentes = new Set<string>();
  for (const spell of spells) {
    if (aprendidas.has(spell.slug)) vertentes.add(spell.vertente);
  }
  return [...vertentes];
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
  /** Mana temporária consumida ANTES da mana normal (PRD 10.3) — 0 quando não havia/não foi usada. */
  manaTemporariaBefore?: number;
  manaTemporariaAfter?: number;
  manaCostUnknown: boolean;
}

/**
 * Desconta PA (sempre) e Mana (só se `custo_mana` for um número real no
 * conteúdo — placeholder `null` não bloqueia a conjuração, só marca
 * `manaCostUnknown: true` para a UI avisar). Sem PA suficiente, devolve
 * `ok:false` sem mutar nada (mesmo padrão de `canPayActionCost`/
 * `purchaseItem`).
 *
 * Nível de vertente (checkpoint pós-v0.70) — PRIMEIRA checagem, antes
 * de qualquer outra: magia com `estatisticas.nivel` acima do nível
 * investido na vertente do personagem (`checkSpellVertenteLevel`) é
 * BLOQUEADA aqui, não só sinalizada — devolve `ok:false` sem gastar PA,
 * Mana, nem mutar o personagem. Sem nível definido para a vertente
 * (`vertenteLevel === null`, personagem legado ou vertente ainda não
 * configurada), a conjuração NÃO é bloqueada por este motivo — decisão
 * deliberada de compatibilidade (documentada em `checkSpellVertenteLevel`
 * e no relatório do checkpoint): travar todo personagem sem
 * `niveis_vertente` quebraria fichas antigas sem nenhum aviso prévio.
 *
 * Mana temporária (checkpoint v0.53, PRD 10.3: "Mana temporária é uma
 * camada consumida antes da mana normal") é drenada PRIMEIRO — só o
 * restante do custo (se houver) desconta a Mana normal. Insuficiência é
 * checada contra a SOMA (mana + mana_temporaria); nunca deixa nenhuma
 * das duas negativa.
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

  const nivelCheck = checkSpellVertenteLevel(spell, character);
  if (nivelCheck.aboveLevel) {
    return {
      character,
      ok: false,
      reason: `Nível de vertente insuficiente para conjurar ${spell.nome} — exige nível ${spell.estatisticas.nivel} de ${spell.vertente}, personagem tem nível ${nivelCheck.vertenteLevel}.`,
      paBefore,
      paAfter: paBefore,
      manaCostUnknown: spell.estatisticas.custo_mana == null,
    };
  }

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
  const manaTemporariaAntes = character.recursos_atuais?.mana_temporaria ?? 0;
  const custoMana = spell.estatisticas.custo_mana ?? 0;

  if (!manaCostUnknown && custoMana > manaAntes + manaTemporariaAntes) {
    return {
      character,
      ok: false,
      reason: `Mana insuficiente (atual: ${manaAntes}${manaTemporariaAntes > 0 ? ` + ${manaTemporariaAntes} temporária` : ""}, necessário: ${custoMana}).`,
      paBefore,
      paAfter: paBefore,
      manaBefore: manaAntes,
      manaAfter: manaAntes,
      manaTemporariaBefore: manaTemporariaAntes,
      manaTemporariaAfter: manaTemporariaAntes,
      manaCostUnknown,
    };
  }

  const consumidoDaTemporaria = manaCostUnknown ? 0 : Math.min(manaTemporariaAntes, custoMana);
  const manaTemporariaDepois = manaTemporariaAntes - consumidoDaTemporaria;
  const manaDepois = manaCostUnknown ? manaAntes : manaAntes - (custoMana - consumidoDaTemporaria);
  const nextCharacter: Character = {
    ...character,
    estado_jogo: { ...character.estado_jogo, pa_gastos: paGastosAntes + custoPa },
    recursos_atuais: manaCostUnknown
      ? character.recursos_atuais
      : { ...character.recursos_atuais, mana: manaDepois, mana_temporaria: manaTemporariaDepois },
  };

  return {
    character: nextCharacter,
    ok: true,
    paBefore,
    paAfter: paBefore - custoPa,
    manaBefore: manaAntes,
    manaAfter: manaDepois,
    manaTemporariaBefore: manaTemporariaAntes,
    manaTemporariaAfter: manaTemporariaDepois,
    manaCostUnknown,
  };
}

// ---------------------------------------------------------------------
// Fusão de magias (checkpoint pós-v0.66) — fluxo manual seguro.
//
// Regra conhecida: Fusão custa SEMPRE 1 Sobrecarga (uma carga do
// contador diário `sobrecarga_usada_dia` — mesma reserva dos surtos).
// A fusão NÃO é um surto: o dano psíquico imediato (`surto.dano_imediato`)
// é declarado para SURTOS no conteúdo, então não é rolado aqui.
// Atingir o máximo de Sobrecargas do dia marca Ruptura pendente
// (regra canônica: "marcar_ruptura_pendente_ao_chegar_a_3_sobrecargas").
//
// O que é automatizado: custos estruturados da magia PRINCIPAL
// (PA/Mana via `castSpell`) + 1 Sobrecarga. A magia FUNDIDA nunca tem
// custo/efeito somado automaticamente ("não combinar números
// incompatíveis") — os efeitos dela viram lembretes no cartão.
// ---------------------------------------------------------------------

export interface CastSpellFusionResult {
  character: Character;
  ok: boolean;
  reason?: string;
  cast: CastSpellResult | null;
  sobrecargaBefore: number;
  sobrecargaAfter: number;
  sobrecargaMax: number;
  rupturaPendente: boolean;
  /** Lembretes específicos da fusão (efeitos da magia fundida, mana não somada, ruptura). */
  fusionReminders: string[];
}

/**
 * Conjura `spell` com Fusão de `fusedSpell` — bloqueia sem mudar nada
 * quando não há Sobrecarga disponível (custa 1), quando as magias são a
 * mesma, ou quando os custos de PA/Mana da principal não podem ser
 * pagos (mesma checagem de `castSpell`). O chamador é responsável por
 * garantir que AMBAS as magias estão aprendidas (modelo atual).
 */
export function castSpellWithFusion(params: {
  character: Character;
  spell: SpellContent;
  fusedSpell: SpellContent;
  paMax: number;
  manaMax: number;
  overloadRules?: OverloadRulesPayload | null;
  /** Nível de vertente da magia FUNDIDA (checkpoint pós-v0.69) — `null` quando não definido; usado só para o lembrete de CD, nunca para automatizar a fusão. */
  fusedVertenteLevel?: number | null;
}): CastSpellFusionResult {
  const { character, spell, fusedSpell, paMax, manaMax, overloadRules, fusedVertenteLevel = null } = params;
  const sobrecargaBefore = character.sobrecarga_usada_dia ?? 0;
  const sobrecargaMax = getOverloadMaxPerDay(overloadRules);

  const blocked = (reason: string): CastSpellFusionResult => ({
    character,
    ok: false,
    reason,
    cast: null,
    sobrecargaBefore,
    sobrecargaAfter: sobrecargaBefore,
    sobrecargaMax,
    rupturaPendente: character.ruptura_pendente ?? false,
    fusionReminders: [],
  });

  if (spell.slug === fusedSpell.slug) {
    return blocked("Escolha uma SEGUNDA magia diferente para fundir.");
  }

  // Nível de vertente (checkpoint pós-v0.70) — valida AMBAS as magias
  // (principal e fundida) ANTES de checar/gastar Sobrecarga ou PA/Mana.
  // Mesma regra de compatibilidade de `castSpell`: sem nível definido
  // para a vertente, não bloqueia por este motivo.
  const mainLevelCheck = checkSpellVertenteLevel(spell, character);
  if (mainLevelCheck.aboveLevel) {
    return blocked(
      `Nível de vertente insuficiente para conjurar ${spell.nome} — exige nível ${spell.estatisticas.nivel} de ${spell.vertente}, personagem tem nível ${mainLevelCheck.vertenteLevel}.`,
    );
  }
  const fusedLevelCheck = checkSpellVertenteLevel(fusedSpell, character);
  if (fusedLevelCheck.aboveLevel) {
    return blocked(
      `Nível de vertente insuficiente para fundir com ${fusedSpell.nome} — exige nível ${fusedSpell.estatisticas.nivel} de ${fusedSpell.vertente}, personagem tem nível ${fusedLevelCheck.vertenteLevel}.`,
    );
  }

  if (sobrecargaBefore >= sobrecargaMax) {
    return blocked(`Sobrecarga insuficiente para Fusão (custa 1; ${sobrecargaBefore}/${sobrecargaMax} já usadas).`);
  }

  const cast = castSpell({ character, spell, paMax, manaMax });
  if (!cast.ok) {
    return blocked(cast.reason ?? "Conjuração não realizada.");
  }

  const sobrecargaAfter = sobrecargaBefore + 1;
  const atingiuMax = sobrecargaAfter >= sobrecargaMax;
  const nextCharacter: Character = {
    ...cast.character,
    sobrecarga_usada_dia: sobrecargaAfter,
    ruptura_pendente: atingiuMax ? true : cast.character.ruptura_pendente,
    ruptura_nivel_pendente: atingiuMax ? (cast.character.ruptura_nivel_pendente ?? 1) : cast.character.ruptura_nivel_pendente,
  };

  const fusionReminders: string[] = [
    `Fusão com ${fusedSpell.nome}: efeitos combinados são resolvidos MANUALMENTE pelo narrador — números das duas magias nunca são somados automaticamente.`,
  ];
  if (fusedSpell.estatisticas.custo_mana != null) {
    fusionReminders.push(
      `${fusedSpell.nome} declara custo de Mana ${fusedSpell.estatisticas.custo_mana} — a Fusão não desconta a Mana da magia fundida automaticamente; ajuste se o narrador exigir.`,
    );
  }
  const fusedResistance = resolveSpellResistance(fusedSpell, fusedVertenteLevel);
  if (fusedResistance) {
    const cdTexto = fusedResistance.cd != null ? `CD ${fusedResistance.cd}` : "CD depende do nível da vertente (6 + nível), ainda não definido";
    fusionReminders.push(`${fusedSpell.nome}: resistência ${fusedResistance.acoes.join("/") || "?"} (${cdTexto}) — resolver manualmente.`);
  }
  const fusedDamage = getSpellDamageEffect(fusedSpell);
  if (fusedDamage) {
    fusionReminders.push(
      `${fusedSpell.nome}: dano ${fusedDamage.dado ?? fusedDamage.valor} (${fusedDamage.tipo_dano}) — rolar/aplicar manualmente conforme a fusão narrada.`,
    );
  }
  fusionReminders.push(...describeSpellManualEffects(fusedSpell).map((linha) => `${fusedSpell.nome}: ${linha}`));
  if (atingiuMax) {
    fusionReminders.push(
      `Sobrecarga chegou a ${sobrecargaAfter}/${sobrecargaMax} — Ruptura pendente (resolvida no fim da cena). O teste do 3º SURTO não foi rolado: a regra canônica o descreve para surtos, não para Fusão — narrador decide se aplica.`,
    );
  }

  return {
    character: nextCharacter,
    ok: true,
    cast,
    sobrecargaBefore,
    sobrecargaAfter,
    sobrecargaMax,
    rupturaPendente: nextCharacter.ruptura_pendente ?? false,
    fusionReminders,
  };
}
