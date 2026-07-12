/**
 * Engine de operação canônica de talentos (checkpoint CP1).
 *
 * Camada de leitura/derivação ÚNICA sobre o catálogo canônico
 * (`content_documents`, `db_talentos_normalizado_v1_3.json`) e o estado
 * de instância no personagem (`talentos_adquiridos`, `talentos_estado`,
 * `efeitos_temporarios`). NUNCA inventa regra, nunca lista talento
 * manualmente: só interpreta os campos já presentes no payload.
 *
 * Reaproveita os primitivos de `talents.ts` (modificadores passivos,
 * usos/cadência, toggles, efeitos temporários) e adiciona:
 *   - API canônica nomeada (getTalentDefinition, getLearnedTalentLevels,
 *     getTalentCurrentLevel, getTalentUsageState, canUseTalent,
 *     consumeTalentUse, resetTalentCadence, getTalentPassiveModifiers,
 *     getTalentAvailableActions, getTalentContextualOpportunities);
 *   - catálogo de TODAS as cadências (turno/rodada/cena/combate/dia/
 *     sessão/missão/descanso longo/uma vez ao adquirir) com política de
 *     reset (automática vs manual — reset manual do narrador SEMPRE
 *     logado, nunca silencioso);
 *   - gatilhos tipados leves (TalentTrigger) que casam efeitos
 *     contextuais com eventos de mesa;
 *   - oportunidades contextuais (efêmeras derivadas + persistidas em
 *     `talentos_estado.oportunidades` só quando precisam sobreviver a
 *     reload);
 *   - construtores dos logs extras (talent_triggered,
 *     talent_opportunity_resolved, talent_resource_changed,
 *     talent_effect_applied) — sempre texto formatado, nunca JSON cru.
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character, TemporaryEffect } from "./types";
import { addTemporaryEffect, getActiveTemporaryEffects, removeTemporaryEffect } from "./temporaryEffects";
import { detectCollapseOnResourceChange } from "./collapse";
import {
  deriveActiveEffectsFromTalents,
  getTalentEffectKey,
  getTalentLevelEffects,
  getUsableTalentEffects,
  describeTalentEffect,
  resetTalentUses,
  type TalentContent,
  type TalentLevelContent,
  type TalentLevelEffect,
  type UsableTalentEffect,
} from "./talents";

// ---------------------------------------------------------------------
// Cadências canônicas
// ---------------------------------------------------------------------

export type TalentResetMode = "automatica" | "manual" | "permanente";

export interface TalentCadenceInfo {
  slug: string;
  label: string;
  /** Como a cadência renova o recurso no app. */
  reset: TalentResetMode;
  /** Evento canônico do app que dispara o reset automático (quando houver). */
  gatilhoReset?: "encerrar_rodada" | "encerrar_cena" | "descanso_longo";
}

/**
 * Todas as cadências do capítulo canônico. "turno" e "rodada" resetam no
 * Encerrar Rodada; "cena"/"combate" no Encerrar Cena; "dia"/"descanso
 * longo" no descanso longo. "sessão", "sessao_malha", "missão" e "uma vez
 * ao adquirir" não têm gatilho canônico no app — reset manual do narrador
 * (sempre logado). "permanente"/"ao adquirir" nunca reseta.
 */
export const TALENT_CADENCES: Record<string, TalentCadenceInfo> = {
  turno: { slug: "turno", label: "por turno", reset: "automatica", gatilhoReset: "encerrar_rodada" },
  rodada: { slug: "rodada", label: "por rodada", reset: "automatica", gatilhoReset: "encerrar_rodada" },
  cena: { slug: "cena", label: "por cena", reset: "automatica", gatilhoReset: "encerrar_cena" },
  combate: { slug: "combate", label: "por combate", reset: "automatica", gatilhoReset: "encerrar_cena" },
  dia: { slug: "dia", label: "por dia", reset: "automatica", gatilhoReset: "descanso_longo" },
  descanso_longo: { slug: "descanso_longo", label: "por descanso longo", reset: "automatica", gatilhoReset: "descanso_longo" },
  sessao: { slug: "sessao", label: "por sessão", reset: "manual" },
  sessao_malha: { slug: "sessao_malha", label: "por sessão de Malha", reset: "manual" },
  missao: { slug: "missao", label: "por missão", reset: "manual" },
  permanente: { slug: "permanente", label: "permanente", reset: "permanente" },
  ao_adquirir: { slug: "ao_adquirir", label: "uma vez ao adquirir", reset: "permanente" },
};

/** Cadências que o app reseta sozinho a partir de eventos canônicos. */
export const AUTO_RESET_CADENCES = new Set(
  Object.values(TALENT_CADENCES).filter((c) => c.reset === "automatica").map((c) => c.slug),
);

/** Cadências dos eventos → lista de slugs a resetar. */
export function cadencesForEvent(evento: TalentCadenceInfo["gatilhoReset"]): string[] {
  return Object.values(TALENT_CADENCES)
    .filter((c) => c.gatilhoReset === evento)
    .map((c) => c.slug);
}

export function describeCadence(cadencia: string | null | undefined): string {
  if (!cadencia) return "sem cadência";
  return TALENT_CADENCES[cadencia]?.label ?? cadencia.replace(/_/g, " ");
}

export function cadenceResetsAutomatically(cadencia: string | null | undefined): boolean {
  return cadencia != null && AUTO_RESET_CADENCES.has(cadencia);
}

// ---------------------------------------------------------------------
// Classificação de padrão operacional (os 4 destinos do capítulo)
// ---------------------------------------------------------------------

export type TalentOperationPattern = "automatico" | "contextual" | "atividade" | "narrativo";

const CONTEXTUAL_FAMILIES = new Set(["reacao", "buff_empilhavel", "aplicar_condicao", "propagacao_efeito"]);
const CONTEXTUAL_TIPOS = new Set([
  "promocao_margem",
  "piso_margem",
  "forcar_margem",
  "substituir_bonus_acao",
  "reposicionamento_pos_acerto",
  "marcar_inimigo_afetado",
  "companheiro_script",
]);
const NARRATIVE_TIPOS = new Set([
  "acao_narrativa",
  "invocar_contato",
  "encontrar_local_seguro",
  "escape_narrativo",
  "recrutar_pn_aliado_temporario",
  "compra_fiada",
  "ler_vulnerabilidade_social",
  "forcar_abertura_social",
  "briefing_pre_cena",
  "marcar_alvo_ou_detalhe",
]);
const ACTIVITY_FAMILIES = new Set(["dado_gatilho", "recurso", "economia_loja", "runa", "magia"]);

/** Classifica UM efeito num dos 4 padrões operacionais (só campos do payload). */
export function classifyTalentEffect(efeito: TalentLevelEffect): TalentOperationPattern {
  const familia = typeof efeito.familia === "string" ? efeito.familia : "";
  const tipo = efeito.tipo;
  // Bricolagem: "identificar a falha" lança a atividade "Examinar ponto vulnerável"
  // (nunca um modificador incondicional — ver exclusão em deriveActiveEffectsFromTalents).
  if (tipo === "detectar_falha_sem_teste") return "atividade";
  // Modificador passivo de rolagem aplicado direto no fluxo.
  if (tipo === "modificador") return "automatico";
  if (NARRATIVE_TIPOS.has(tipo)) return "narrativo";
  // Atividade própria: tem contador de uso OU é recurso/loja/runa acionável.
  const temUsos = typeof efeito.usos === "number" && efeito.usos > 0;
  if (tipo === "toggle_condicional") return "contextual";
  if (CONTEXTUAL_FAMILIES.has(familia) || CONTEXTUAL_TIPOS.has(tipo)) return "contextual";
  if (ACTIVITY_FAMILIES.has(familia) || temUsos) return "atividade";
  if (familia === "companheiro") return "atividade";
  if (familia === "troca_atributo") return "automatico";
  if (familia === "trama") return "atividade";
  // Modificadores estruturais passivos (alcance de magia, espaços de runa, etc.).
  return "automatico";
}

// ---------------------------------------------------------------------
// API canônica — definição, níveis aprendidos, nível atual
// ---------------------------------------------------------------------

export function getTalentDefinition(talents: TalentContent[], talentoId: string): TalentContent | null {
  return talents.find((t) => t.id === talentoId || t.slug === talentoId) ?? null;
}

export interface LearnedTalentLevel {
  talent: TalentContent;
  nivel: TalentLevelContent;
  acquiredId: string;
  adquiridoEm: string;
}

/** Todos os NÍVEIS de talento adquiridos, resolvidos contra o catálogo (ordenados por árvore/nível). */
export function getLearnedTalentLevels(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): LearnedTalentLevel[] {
  const acquired = character.talentos_adquiridos ?? [];
  const byLevelId = new Map(acquired.map((a) => [a.nivelId, a]));
  const out: LearnedTalentLevel[] = [];
  for (const talent of talents) {
    if (talent.status !== "published") continue;
    for (const nivel of talent.niveis) {
      const a = byLevelId.get(nivel.id);
      if (!a) continue;
      out.push({ talent, nivel, acquiredId: a.id, adquiridoEm: a.adquiridoEm });
    }
  }
  return out.sort((x, y) => x.talent.nome.localeCompare(y.talent.nome) || x.nivel.nivel - y.nivel.nivel);
}

/** Maior nível adquirido de uma árvore (0 = nenhum). */
export function getTalentCurrentLevel(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
  talentoId: string,
): number {
  const def = getTalentDefinition(talents, talentoId);
  if (!def) return 0;
  const levelIds = new Set(def.niveis.map((n) => n.id));
  const acquired = (character.talentos_adquiridos ?? []).filter((a) => levelIds.has(a.nivelId));
  return acquired.reduce((max, a) => Math.max(max, a.nivel), 0);
}

// ---------------------------------------------------------------------
// Estado de uso / recurso
// ---------------------------------------------------------------------

export interface TalentUsageState {
  key: string;
  usosMax: number | null;
  usosGastos: number;
  usosRestantes: number | null;
  cadencia: string | null;
  esgotado: boolean;
}

export function getTalentUsageState(
  character: Pick<Character, "talentos_estado">,
  key: string,
  usosMax: number | null,
  cadencia: string | null,
): TalentUsageState {
  const usados = character.talentos_estado?.usos?.[key]?.usados ?? 0;
  const restantes = usosMax == null ? null : Math.max(0, usosMax - usados);
  return {
    key,
    usosMax,
    usosGastos: usados,
    usosRestantes: restantes,
    cadencia,
    esgotado: usosMax != null && usados >= usosMax,
  };
}

export interface CanUseResult {
  ok: boolean;
  reason?: string;
}

/** Checa se um efeito usável pode ser usado agora (usos + PA). Não muta. */
export function canUseTalent(usable: UsableTalentEffect, paDisponivel: number): CanUseResult {
  if (usable.kind !== "limited_use") return { ok: false, reason: "Efeito não é de usos limitados." };
  if (usable.usosMax != null && usable.usosGastos >= usable.usosMax) {
    return { ok: false, reason: `Sem usos restantes (${usable.usosGastos}/${usable.usosMax} ${describeCadence(usable.cadencia)}).` };
  }
  if (usable.custoPa != null && usable.custoPa > paDisponivel) {
    return { ok: false, reason: `PA insuficiente (atual: ${paDisponivel}, necessário: ${usable.custoPa}).` };
  }
  return { ok: true };
}

/**
 * Reset de UMA cadência inteira — usado pelos gatilhos automáticos e
 * pelo reset manual do narrador. Delega a `resetTalentUses`; devolve o
 * mesmo objeto quando nada muda. O CHAMADOR deve logar o reset (manual
 * nunca é silencioso).
 */
export function resetTalentCadence(character: Character, cadencia: string): { character: Character; resetCount: number } {
  return resetTalentUses(character, [cadencia]);
}

// ---------------------------------------------------------------------
// Recursos próprios (ex.: dados de gatilho do Pistoleiro)
// ---------------------------------------------------------------------

export interface TalentResourceState {
  key: string;
  disponivel: number;
  max: number;
  cadenciaRecuperacao: string | null;
}

export function getTalentResourceState(
  character: Pick<Character, "talentos_estado">,
  key: string,
  max: number,
  cadenciaRecuperacao: string | null,
): TalentResourceState {
  const stored = character.talentos_estado?.recursos?.[key];
  return {
    key,
    disponivel: stored?.disponivel ?? max,
    max: stored?.max ?? max,
    cadenciaRecuperacao: stored?.cadenciaRecuperacao ?? cadenciaRecuperacao,
  };
}

/** Ajusta a reserva de um recurso (delta negativo = gastar). Faz clamp em [0, max]. */
export function adjustTalentResource(
  character: Character,
  key: string,
  delta: number,
  max: number,
  cadenciaRecuperacao: string | null,
  nowIso: string,
): { character: Character; state: TalentResourceState } {
  const before = getTalentResourceState(character, key, max, cadenciaRecuperacao);
  const disponivel = Math.max(0, Math.min(before.max, before.disponivel + delta));
  const recursos = { ...(character.talentos_estado?.recursos ?? {}) };
  recursos[key] = { disponivel, max: before.max, cadenciaRecuperacao: before.cadenciaRecuperacao, atualizadoEm: nowIso };
  return {
    character: { ...character, talentos_estado: { ...character.talentos_estado, recursos } },
    state: { key, disponivel, max: before.max, cadenciaRecuperacao: before.cadenciaRecuperacao },
  };
}

// ---------------------------------------------------------------------
// Modificadores passivos / atividades disponíveis
// ---------------------------------------------------------------------

/** Modificadores passivos (padrão "automático") aplicados direto nas rolagens. */
export function getTalentPassiveModifiers(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): ActiveEffect[] {
  return deriveActiveEffectsFromTalents(character, talents);
}

/** Efeitos com botão próprio (usos limitados) — o padrão "atividade própria". */
export function getTalentAvailableActions(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado" | "efeitos_temporarios">,
  talents: TalentContent[],
): UsableTalentEffect[] {
  return getUsableTalentEffects(character, talents).filter((u) => u.kind === "limited_use");
}

// ---------------------------------------------------------------------
// Gatilhos tipados + oportunidades contextuais
// ---------------------------------------------------------------------

export type TalentTriggerType =
  | "sofrer_dano"
  | "atacar"
  | "defender"
  | "inimigo_erra"
  | "critico"
  | "chegar_a_zero_pv"
  | "aliado_em_queda"
  | "aplicar_efeito_positivo"
  | "aplicar_efeito_negativo"
  | "ataque_furtivo"
  | "mirar";

export interface TalentTrigger {
  type: TalentTriggerType;
  /** Contexto livre para casar com `efeito.contexto`/`gatilho` (opcional). */
  detalhe?: string;
}

/** Mapa gatilho-do-app → substrings que aparecem em `efeito.gatilho`/`contexto`/`tipo`. */
const TRIGGER_MATCHERS: Record<TalentTriggerType, string[]> = {
  sofrer_dano: ["sofrer_dano", "sofre dano", "buff_empilhavel"],
  atacar: ["atacar", "ataque", "acerto"],
  defender: ["bloquear", "aparar", "desviar", "defensiva"],
  inimigo_erra: ["inimigo", "erra", "reacao_gatilho", "erro"],
  critico: ["critico", "crítico"],
  chegar_a_zero_pv: ["zero_pv", "0 pv", "prevenir_zero"],
  aliado_em_queda: ["queda", "aliado", "0_pv", "estabilizar"],
  aplicar_efeito_positivo: ["efeito_positivo", "positivo", "bencao"],
  aplicar_efeito_negativo: ["efeito_negativo", "negativo", "marca", "contagio"],
  ataque_furtivo: ["furtiv", "nao percebe", "não percebe", "não percebe sua presença"],
  mirar: ["mirar", "mira"],
};

export interface TalentContextualOpportunity {
  id: string;
  talentNome: string;
  nivelNome: string;
  nivelId: string;
  efeitoIndex: number;
  pattern: TalentOperationPattern;
  rotulo: string;
  descricao: string;
  /** true quando veio de `talentos_estado.oportunidades` (persistida). */
  persistida: boolean;
}

/**
 * Oportunidades contextuais dos talentos adquiridos — efeitos que
 * disparam em GATILHO de evento (padrão "contextual"). Sem `trigger`,
 * devolve todas as oportunidades latentes (para a aba mostrar "dispara
 * quando…"); com `trigger`, filtra as que casam com o evento atual.
 * Sempre inclui as oportunidades PERSISTIDAS em `talentos_estado`.
 */
export function getTalentContextualOpportunities(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
  trigger?: TalentTrigger,
): TalentContextualOpportunity[] {
  const out: TalentContextualOpportunity[] = [];
  const learned = getLearnedTalentLevels(character, talents);

  for (const { talent, nivel } of learned) {
    getTalentLevelEffects(nivel).forEach((efeito, index) => {
      if (classifyTalentEffect(efeito) !== "contextual") return;
      const haystack = [
        efeito.tipo,
        typeof efeito.familia === "string" ? efeito.familia : "",
        typeof efeito.gatilho === "string" ? efeito.gatilho : "",
        typeof efeito.contexto === "string" ? efeito.contexto : "",
      ]
        .join(" ")
        .toLowerCase();

      if (trigger) {
        const matchers = TRIGGER_MATCHERS[trigger.type] ?? [];
        if (!matchers.some((m) => haystack.includes(m.toLowerCase()))) return;
      }

      out.push({
        id: `${nivel.id}:${index}`,
        talentNome: talent.nome,
        nivelNome: nivel.nome,
        nivelId: nivel.id,
        efeitoIndex: index,
        pattern: "contextual",
        rotulo: `${talent.nome} — ${nivel.nome}`,
        descricao: describeTalentEffect(efeito),
        persistida: false,
      });
    });
  }

  for (const p of character.talentos_estado?.oportunidades ?? []) {
    out.push({
      id: p.id,
      talentNome: p.talentoNome,
      nivelNome: "",
      nivelId: p.nivelId,
      efeitoIndex: p.efeitoIndex,
      pattern: "contextual",
      rotulo: p.rotulo,
      descricao: p.contexto ?? p.rotulo,
      persistida: true,
    });
  }

  return out;
}

/** Registra uma oportunidade contextual PERSISTIDA (que precisa sobreviver a reload). */
export function addPersistedOpportunity(
  character: Character,
  op: { talentoNome: string; nivelId: string; efeitoIndex: number; rotulo: string; contexto?: string },
  id: string,
  nowIso: string,
): Character {
  const lista = character.talentos_estado?.oportunidades ?? [];
  return {
    ...character,
    talentos_estado: {
      ...character.talentos_estado,
      oportunidades: [...lista, { id, ...op, criadaEm: nowIso }],
    },
  };
}

/** Resolve (remove) uma oportunidade persistida pelo id. Devolve o mesmo objeto se não existir. */
export function resolvePersistedOpportunity(character: Character, id: string): Character {
  const lista = character.talentos_estado?.oportunidades;
  if (!lista || !lista.some((o) => o.id === id)) return character;
  return {
    ...character,
    talentos_estado: { ...character.talentos_estado, oportunidades: lista.filter((o) => o.id !== id) },
  };
}

// ---------------------------------------------------------------------
// Overrides mecânicos passivos derivados de talentos adquiridos
// (integração real nos fluxos — nunca inventa valor, lê do payload)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Artífice › Bricolagem (N1) — vulnerabilidade identificada, bônus
// consumível escopado ao PRÓXIMO teste relacionado (nunca "sempre
// ligado" — ver exclusão em `talents.ts:deriveActiveEffectsFromTalents`).
// ---------------------------------------------------------------------

/** Bônus (valor) declarado no payload canônico de Bricolagem — nunca hardcoded. */
export function getBricolagemModifier(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): { valor: number; nivelId: string } | null {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "modificador" && typeof efeito.valor === "number" && Array.isArray(efeito.alvo_tags)) {
        // Só considera o modificador IRMÃO de detectar_falha_sem_teste (mesmo nível).
        const irmaoCondicional = getTalentLevelEffects(nivel).some((e) => e.tipo === "detectar_falha_sem_teste");
        if (irmaoCondicional) return { valor: efeito.valor, nivelId: nivel.id };
      }
    }
  }
  return null;
}

/** Registra uma nova vulnerabilidade (substitui a anterior — sempre a última conta). */
export function registerBricolagemVulnerabilidade(
  character: Character,
  params: { nivelId: string; tipo: "mecanismo" | "estrutura" | "sistema_simples"; alvoDescricao: string; falhaPrincipal: string; periciaBeneficiada: "engenharia" | "robotica" },
  id: string,
  nowIso: string,
): Character {
  return {
    ...character,
    bricolagem_vulnerabilidade: { id, ...params, criadaEm: nowIso, consumida: false },
  };
}

/** Consome o bônus (marcado ao usar o botão "Rolar teste relacionado" — nunca em outra rolagem). */
export function consumeBricolagemUse(character: Character, nowIso: string): Character {
  if (!character.bricolagem_vulnerabilidade || character.bricolagem_vulnerabilidade.consumida) return character;
  return { ...character, bricolagem_vulnerabilidade: { ...character.bricolagem_vulnerabilidade, consumida: true, consumidaEm: nowIso } };
}

/** Encerra manualmente (descarta) a vulnerabilidade ativa. */
export function endBricolagemVulnerabilidade(character: Character): Character {
  if (!character.bricolagem_vulnerabilidade) return character;
  const { bricolagem_vulnerabilidade: _drop, ...rest } = character;
  return rest;
}

/** Chave sintética de tag de rolagem para o bônus ativo de Bricolagem. */
/**
 * Tag sintética do registro ATUAL de Bricolagem, exista ele consumido ou
 * não. `consumida` só controla a UI (esconde "Rolar teste relacionado",
 * mostra "consumido") — NÃO esconde o `ActiveEffect` retroativamente,
 * senão o +1 desaparece da rolagem que o consumiu no exato instante em
 * que é aplicado (o registro só é removido de fato ao registrar uma
 * NOVA vulnerabilidade ou encerrar manualmente).
 */
export function getBricolagemTag(character: Pick<Character, "bricolagem_vulnerabilidade">): string | null {
  const v = character.bricolagem_vulnerabilidade;
  return v ? `bricolagem:${v.id}` : null;
}

/** ActiveEffect do bônus de Bricolagem — escopado à tag sintética, só quando há vulnerabilidade ativa e não consumida. */
export function getBricolagemActiveEffects(
  character: Pick<Character, "talentos_adquiridos" | "bricolagem_vulnerabilidade">,
  talents: TalentContent[],
): ActiveEffect[] {
  const tag = getBricolagemTag(character);
  if (!tag) return [];
  const mod = getBricolagemModifier(character, talents);
  if (!mod) return [];
  const v = character.bricolagem_vulnerabilidade!;
  return [
    {
      id: `bricolagem:${v.id}`,
      sourceType: "talent",
      sourceId: mod.nivelId,
      sourceName: `Bricolagem — ${v.falhaPrincipal}`,
      affectedTags: [tag],
      modifier: mod.valor,
      explanation: `Bricolagem: +${mod.valor} no teste de ${v.periciaBeneficiada} relacionado à falha "${v.falhaPrincipal}".`,
      enabledByDefault: true,
      kind: "modifier",
      reversible: true,
    },
  ];
}

// ---------------------------------------------------------------------
// Artífice › Gambiarra Expressa (N3) — atividade narrativa 1/sessão.
// ---------------------------------------------------------------------

export const GAMBIARRA_USAGE_KEY = "gambiarra_expressa:sessao";

export function getGambiarraAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisSession: boolean; available: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "acao_narrativa" && Array.isArray(efeito.alvos)) acquired = true;
    }
  }
  const usedThisSession = (character.talentos_estado?.usos?.[GAMBIARRA_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisSession, available: acquired && !usedThisSession };
}

export function registerGambiarraExpressa(
  character: Character,
  params: { nivelId: string; alvo: "estrutura" | "equipamento" | "automato"; materialBase: string; criacaoOuModificacao: "criacao" | "modificacao"; efeitoObtido: string; duracao: string; observacoes?: string },
  id: string,
  nowIso: string,
): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[GAMBIARRA_USAGE_KEY] = { usados: 1, cadencia: "sessao", atualizadoEm: nowIso };
  return {
    ...character,
    gambiarra_expressa_ativa: { id, ...params, criadaEm: nowIso },
    talentos_estado: { ...character.talentos_estado, usos },
  };
}

/** Encerra manualmente (o narrador confirma que o efeito narrativo terminou). */
export function endGambiarraExpressa(character: Character): Character {
  if (!character.gambiarra_expressa_ativa) return character;
  const { gambiarra_expressa_ativa: _drop, ...rest } = character;
  return rest;
}

// ---------------------------------------------------------------------
// Fase E — talentos do ATACANTE resolvidos em /dev/table (cross-record).
// Assassino › Hemorragia (N2) / Executar (N3).
// ---------------------------------------------------------------------

/** `true` se o personagem tem Hemorragia (Assassino N2) adquirida. */
/** Assassino › Lâmina Oculta (N1) — assinatura única: `reposicionamento_pos_acerto` (só este talento declara esse tipo). */
export function hasLaminaOculta(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "reposicionamento_pos_acerto") return true;
    }
  }
  return false;
}

export function hasHemorragia(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "aplicar_condicao_em_margem" && efeito.condicao === "sangrando") return true;
    }
  }
  return false;
}

/** Dado de Sangrando em crítico — lido do payload (`alterar_dado_condicao`), fallback "1d6" (dado padrão da condição, não hardcoded como "regra do talento"). */
export function getHemorragiaCriticalDie(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): string {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "alterar_dado_condicao" && efeito.condicao === "sangrando" && typeof efeito.dado === "string") {
        return efeito.dado;
      }
    }
  }
  return "1d8";
}

export const EXECUTAR_USAGE_KEY = "assassino_executar:cena";

export function getExecutarAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean; available: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "declarar_execucao") acquired = true;
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[EXECUTAR_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene, available: acquired && !usedThisScene };
}

export function markExecutarUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[EXECUTAR_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Margem — promoção genérica de margem (Passo Fantasma, Olhar Penetrante)
// data-driven a partir de `promocao_margem.pericias[]` do payload. Nunca
// aplica sem a perícia explícita no payload (Totem › Benção não tem
// `pericias`, então fica de fora — não inventa mapeamento).
// ---------------------------------------------------------------------

export interface MarginPromotion {
  periciaId: string;
  de: string;
  para: string;
  origem: string;
  /**
   * Texto EXATO de `efeito.contexto` do payload (ex.: "Influência para
   * distorcer percepções, convencer ou manipular"). Alguns talentos
   * (Olhar Penetrante) descrevem um contexto mais estreito que "qualquer
   * teste desta perícia" — o payload não estrutura essa distinção além do
   * texto livre, então a UI (RollsTab) exige que o jogador CONFIRME que o
   * teste atual se encaixa no contexto antes de aplicar a promoção, em vez
   * de aplicar automaticamente a qualquer teste da perícia (o que seria
   * inventar uma regra mais ampla do que o capítulo descreve).
   */
  contexto: string | null;
}

export function getMarginPromotions(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): MarginPromotion[] {
  const out: MarginPromotion[] = [];
  for (const { talent, nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "promocao_margem") continue;
      const pericias = Array.isArray(efeito.pericias) ? efeito.pericias.filter((p): p is string => typeof p === "string") : [];
      if (pericias.length === 0 || typeof efeito.de !== "string" || typeof efeito.para !== "string") continue;
      const contexto = typeof efeito.contexto === "string" ? efeito.contexto : null;
      for (const periciaId of pericias) {
        out.push({ periciaId, de: efeito.de, para: efeito.para, origem: `${talent.nome} — ${nivel.nome}`, contexto });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Atirador de Elite — 1 Tiro, 1 Acerto (N1): estado real de Mirar.
// À Espreita (N2) / Headshot (N3): forçam a banda de margem do ataque à
// distância no lado do narrador (mesmo mecanismo de Assassino › Executar).
// ---------------------------------------------------------------------

export function hasAEspreita(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    if (nivel.slug === "atirador_de_elite_a_espreita") return true;
  }
  return false;
}

export function hasHeadshot(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    if (nivel.slug === "atirador_de_elite_headshot") return true;
  }
  return false;
}

export function getMirarModifier(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): { bonusPadrao: number; bonusCritico: number; alvoTags: string[]; nivelId: string } | null {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "substituir_bonus_acao" && efeito.acao === "mirar") {
        const alvoTags = Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags.filter((t): t is string => typeof t === "string") : [];
        if (typeof efeito.bonus_padrao === "number" && typeof efeito.bonus_critico === "number") {
          return { bonusPadrao: efeito.bonus_padrao, bonusCritico: efeito.bonus_critico, alvoTags, nivelId: nivel.id };
        }
      }
    }
  }
  return null;
}

/** Confirma o resultado de Mirar (sucesso/crítico) — cria o estado real, bônus lido do payload. */
export function confirmMirarResult(
  character: Character,
  talents: TalentContent[],
  resultado: "sucesso" | "critico",
  currentRound: number | null,
  id: string,
  nowIso: string,
): Character {
  const mod = getMirarModifier(character, talents);
  if (!mod) return character;
  const bonus = resultado === "critico" ? mod.bonusCritico : mod.bonusPadrao;
  return {
    ...character,
    mirar_ativo: { id, nivelId: mod.nivelId, resultado, bonus, criadaNaRodada: currentRound, criadaEm: nowIso, consumido: false },
  };
}

/** `true` se `mirar_ativo` ainda vale nesta rodada (nunca expira "aproximado" — só compara rodada de criação com a atual). */
export function isMirarActive(character: Pick<Character, "mirar_ativo">, currentRound: number | null): boolean {
  const m = character.mirar_ativo;
  if (!m) return false;
  if (m.criadaNaRodada == null || currentRound == null) return true; // sem rodada rastreada — nunca expira sozinho, só manual.
  return m.criadaNaRodada === currentRound;
}

export const MIRAR_TAG = "mirar:ativo";

/** ActiveEffect do bônus de Mirar — escopado à tag `mirar:ativo`, só quando ativo nesta rodada (consumido ou não — mesmo critério de Bricolagem). */
export function getMirarActiveEffects(
  character: Pick<Character, "mirar_ativo">,
  currentRound: number | null,
): ActiveEffect[] {
  const m = character.mirar_ativo;
  if (!m || !isMirarActive(character, currentRound)) return [];
  return [
    {
      id: `mirar:${m.id}`,
      sourceType: "talent",
      sourceId: m.nivelId,
      sourceName: `1 Tiro, 1 Acerto (${m.resultado === "critico" ? "crítico" : "sucesso"})`,
      affectedTags: [MIRAR_TAG],
      modifier: m.bonus,
      explanation: `1 Tiro, 1 Acerto: +${m.bonus} no próximo disparo (Mirar ${m.resultado}), até o fim da rodada.`,
      enabledByDefault: true,
      kind: "modifier",
      reversible: true,
    },
  ];
}

export function consumeMirar(character: Character, nowIso: string): Character {
  if (!character.mirar_ativo || character.mirar_ativo.consumido) return character;
  return { ...character, mirar_ativo: { ...character.mirar_ativo, consumido: true } };
}

export function endMirar(character: Character): Character {
  if (!character.mirar_ativo) return character;
  const { mirar_ativo: _drop, ...rest } = character;
  return rest;
}

// ---------------------------------------------------------------------
// Sorrateiro — Passo Fantasma (N1, promoção de margem genérica, ver
// getMarginPromotions) / Camuflagem Óptica (N2) / Ataque Fatal (N3).
// ---------------------------------------------------------------------

export function hasCamuflagemOptica(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    if (nivel.slug === "sorrateiro_camuflagem_optica") return true;
  }
  return false;
}

export function hasAtaqueFatal(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    if (nivel.slug === "sorrateiro_ataque_fatal") return true;
  }
  return false;
}

/** Entra em Furtividade manualmente (ação narrativa, sem teste estruturado próprio) — substitui um estado anterior. */
export function startFurtividade(character: Character, source: string, nowIso: string): Character {
  return {
    ...character,
    furtividade_ativa: { active: true, source, enteredAt: nowIso, plausibleCoverConfirmed: false, detected: false, exitReason: null },
  };
}

export function isFurtividadeActive(character: Pick<Character, "furtividade_ativa">): boolean {
  return character.furtividade_ativa?.active === true;
}

/** Encerra Furtividade manualmente — `reason` fica registrado no log (ver formatters), estado não é reaproveitado depois. */
export function endFurtividade(character: Character, reason: string | null = null): Character {
  if (!character.furtividade_ativa?.active) return character;
  return { ...character, furtividade_ativa: { ...character.furtividade_ativa, active: false, exitReason: reason } };
}

/**
 * Sorrateiro › Camuflagem Óptica (N2) — confirma que o deslocamento
 * exposto (linha de visão/fora de cobertura) terminou num ponto
 * plausível para continuar escondido; mantém Furtividade ativa em vez de
 * encerrá-la automaticamente (o capítulo não define encerramento
 * automático por linha de visão — só CONDICIONA continuar a essa
 * confirmação).
 */
export function confirmCamuflagemOpticaMovement(character: Character): Character {
  if (!character.furtividade_ativa?.active) return character;
  return { ...character, furtividade_ativa: { ...character.furtividade_ativa, plausibleCoverConfirmed: true } };
}

/** Narrador marca Furtividade como detectada (exposta à força) — encerra o estado com motivo fixo. */
export function markFurtividadeDetected(character: Character): Character {
  if (!character.furtividade_ativa?.active) return character;
  return { ...character, furtividade_ativa: { ...character.furtividade_ativa, active: false, detected: true, exitReason: "detectado" } };
}

// ---------------------------------------------------------------------
// Rúnico — Gatilho Rúnico (N1) / Entalhe Rápido (N2) / Sobregravação (N3).
// ---------------------------------------------------------------------

export function hasGatilhoRunico(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "ativar_desativar_runa_sem_pa") return true;
    }
  }
  return false;
}

export function hasEntalheRapido(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "instalar_remover_runa") return true;
    }
  }
  return false;
}

export function hasSobregravacao(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "aumentar_espacos_runa") return true;
    }
  }
  return false;
}

/**
 * Multiplicador de espaços de runa de Sobregravação — lido do payload
 * (`multiplicador_espacos_extra`), nunca hardcoded. O schema de
 * equipamento só declara UM número total de slots (`slots_runa_max`,
 * sem separar "base" de "extra"); dobrar o total é a única leitura
 * possível sem inventar uma divisão que o conteúdo não estrutura.
 */
export function getSobregravacaoMultiplier(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): number {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "aumentar_espacos_runa" && typeof efeito.multiplicador_espacos_extra === "number") {
        return efeito.multiplicador_espacos_extra;
      }
    }
  }
  return 1;
}

/**
 * Novo limite diário de Surtos de Sobrecarga imposto por talento
 * adquirido (Mago de Batalha › Ascensão — `alterar_limite_sobrecarga`,
 * `novo_limite_diario`). Devolve o MAIOR override, ou null quando nenhum
 * talento adquirido altera o limite. Data-driven: o valor (5) vem do
 * payload canônico. Decisão canônica confirmada: a Ruptura acompanha o
 * novo limite (dispara no novo N-ésimo surto), então o override entra
 * direto como `maxPerDay` em `useOverloadSurge`.
 */
export function getTalentOverloadLimitOverride(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): number | null {
  let override: number | null = null;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "alterar_limite_sobrecarga") continue;
      const novo = efeito.novo_limite_diario;
      if (typeof novo === "number" && novo > 0) override = Math.max(override ?? 0, novo);
    }
  }
  return override;
}

/** Chave sintética de uso 1/rodada de Canalizar (Potencializar/Amortecer compartilham). */
export const CANALIZAR_USAGE_KEY = "canalizar:rodada";

/** Chave sintética de uso 1/dia de Toque de Midas (Artífice N2). */
export const TOQUE_DE_MIDAS_USAGE_KEY = "toque_de_midas:dia";

/** Disponibilidade de Toque de Midas: adquirido (efeito `aprimorar_item_temporario`) e ainda não usado hoje. */
export function getToqueDeMidasAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedToday: boolean; available: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "aprimorar_item_temporario") acquired = true;
    }
  }
  const usedToday = (character.talentos_estado?.usos?.[TOQUE_DE_MIDAS_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedToday, available: acquired && !usedToday };
}

/** Marca Toque de Midas como usado hoje (cadência "dia" → reseta no descanso longo). */
export function markToqueDeMidasUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[TOQUE_DE_MIDAS_USAGE_KEY] = { usados: 1, cadencia: "dia", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

export interface ToqueDeMidasTargetModifiers {
  ataque?: number;
  dano?: number;
  mit?: number;
  pd?: number;
  testeRelacionado?: number;
  nivelId: string;
}

/**
 * Lê, do payload canônico (`aprimorar_item_temporario.opcoes[]`), os
 * modificadores por alvo de Toque de Midas — nunca hardcoded aqui. Devolve
 * null se o talento não foi adquirido ou o payload não estrutura o alvo.
 */
export function getToqueDeMidasModifiersForTarget(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
  alvo: "arma" | "armadura" | "escudo" | "ferramenta_dispositivo",
): ToqueDeMidasTargetModifiers | null {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "aprimorar_item_temporario") continue;
      const opcoes = Array.isArray(efeito.opcoes) ? efeito.opcoes : [];
      for (const opcaoRaw of opcoes) {
        const opcao = opcaoRaw as Record<string, unknown>;
        if (opcao.alvo !== alvo) continue;
        const mods = Array.isArray(opcao.modificadores) ? (opcao.modificadores as Record<string, unknown>[]) : [];
        const out: ToqueDeMidasTargetModifiers = { nivelId: nivel.id };
        for (const m of mods) {
          const valor = m.valor;
          if (typeof valor !== "number") continue;
          if (m.tipo === "modificador" && Array.isArray(m.alvo_tags)) {
            if ((m.alvo_tags as unknown[]).includes("ataque")) out.ataque = valor;
            if ((m.alvo_tags as unknown[]).includes("teste_relacionado")) out.testeRelacionado = valor;
          }
          if (m.tipo === "modificador_dano") out.dano = valor;
          if (m.tipo === "mit_bonus") out.mit = valor;
          if (m.tipo === "pd_bonus") out.pd = valor;
        }
        return out;
      }
    }
  }
  return null;
}

/**
 * Estado de Canalizar (Mago de Batalha N2) — se adquirido e se ainda não
 * foi usado nesta rodada (o gate 1/rodada é compartilhado entre
 * Potencializar e Amortecer, via `talentos_estado.usos[CANALIZAR_USAGE_KEY]`).
 */
export function getCanalizarState(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisRound: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "canalizar_mana") acquired = true;
    }
  }
  const usedThisRound = (character.talentos_estado?.usos?.[CANALIZAR_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisRound };
}

/** Marca Canalizar como usado nesta rodada (cadência "rodada" → reseta no Encerrar Rodada). */
export function markCanalizarUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[CANALIZAR_USAGE_KEY] = { usados: 1, cadencia: "rodada", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

/**
 * `true` se algum nível ADQUIRIDO concede a Ruptura especial de Ascensão
 * (`ruptura_imediata_sem_perda_integridade`).
 */
export function hasAscensaoImmediateRupture(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): { has: boolean; nivelId: string | null } {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "ruptura_imediata_sem_perda_integridade") return { has: true, nivelId: nivel.id };
    }
  }
  return { has: false, nivelId: null };
}

/**
 * Aplica, de forma IDEMPOTENTE, a Ruptura especial de Ascensão — só na
 * primeira vez que o nível é adquirido. Não toca Integridade e não entra
 * em cálculos futuros (é só o marcador `ruptura_especial_ascensao`).
 * Devolve o MESMO objeto quando já aplicada ou quando o talento não está
 * adquirido (seguro para chamar em acquire/load/reacquire).
 */
export function applyAscensaoSpecialRupture(
  character: Character,
  talents: TalentContent[],
  idFactory: () => string,
  nowIso: string,
): { character: Character; applied: boolean } {
  if (character.ruptura_especial_ascensao) return { character, applied: false };
  const { has, nivelId } = hasAscensaoImmediateRupture(character, talents);
  if (!has || !nivelId) return { character, applied: false };
  return {
    character: {
      ...character,
      ruptura_especial_ascensao: {
        id: idFactory(),
        nivelId,
        aplicadaEm: nowIso,
        nota: "Ruptura especial de Ascensão — não reduz Integridade e não conta para cálculos futuros.",
      },
    },
    applied: true,
  };
}

/**
 * Multiplicador de alcance/área de magias de ATAQUE imposto por talento
 * (Mago de Batalha › Domínio Territorial — `multiplicar_alcance_area_magia`).
 * 1 quando nenhum talento aplica. Data-driven (1.5 = +50% vem do payload).
 */
export function getTalentSpellRangeAreaMultiplier(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
  magiaTipo: string,
): number {
  let mult = 1;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "multiplicar_alcance_area_magia") continue;
      const alvoTipo = typeof efeito.magia_tipo === "string" ? efeito.magia_tipo : null;
      if (alvoTipo && alvoTipo !== magiaTipo) continue;
      const m = efeito.multiplicador;
      if (typeof m === "number" && m > 0) mult *= m;
    }
  }
  return mult;
}

/**
 * Aplica um multiplicador ao PRIMEIRO número de um texto de alcance/área
 * (ex.: "10 metros (linha —)" × 1.5 → "15 metros (linha —)"). Quando o
 * texto não tem número parseável, devolve `changed: false` e o texto
 * original — o chamador mostra lembrete de confirmação manual (distância
 * pode ser confirmada manualmente, conforme o capítulo). Sem inventar:
 * só reescala o número presente.
 */
export function applyRangeAreaMultiplierToText(text: string, mult: number): { text: string; changed: boolean } {
  if (mult === 1) return { text, changed: false };
  const m = /(\d+(?:[.,]\d+)?)/.exec(text);
  if (!m) return { text, changed: false };
  const original = Number(m[1].replace(",", "."));
  if (!Number.isFinite(original)) return { text, changed: false };
  const escalado = Math.round(original * mult * 100) / 100;
  const escaladoStr = Number.isInteger(escalado) ? String(escalado) : String(escalado);
  return { text: text.slice(0, m.index) + escaladoStr + text.slice(m.index + m[1].length), changed: true };
}

// ---------------------------------------------------------------------
// Berserker — Fúria (N1) / Sede de Sangue (N2).
// ---------------------------------------------------------------------

export function hasFuria(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "buff_empilhavel" && efeito.gatilho === "sofrer_dano") return true;
    }
  }
  return false;
}

/**
 * Berserker › Fúria — constrói o efeito temporário empilhável real (+1 em
 * Luta por pilha, até `max_pilhas` do payload) para aplicar no personagem
 * que ACABOU de sofrer dano. `stackingMode: "stack"` (`addTemporaryEffect`)
 * incrementa a pilha existente em vez de duplicar.
 *
 * Duração real do payload é "até o fim do PRÓXIMO TURNO" do alvo — este
 * sistema só rastreia `current_round`/"Encerrar Rodada" (fim de RODADA
 * global), sem noção de turno individual dentro da ordem de iniciativa.
 * Um stack marcado `durationType: "rounds", remainingRounds: 1` expiraria
 * no PRÓXIMO "Encerrar Rodada" — na prática, quase sempre o fim da rodada
 * ATUAL, cortando o turno do alvo cedo demais sempre que ele já agiu antes
 * de sofrer o dano (checkpoint talentos, Fase 3 — corrigido: nunca
 * aproximar para fim de rodada). Por isso usa `durationType: "manual"`
 * (mesmo padrão já adotado para Golpe Cirúrgico/Fincada): nunca expira
 * sozinho no fim de rodada, e o narrador remove pelo botão de efeito
 * temporário já existente quando o turno do alvo de fato terminar.
 * `createdRound` é preservado só como metadado informativo (não dirige
 * expiração).
 */
export function buildFuriaTemporaryEffect(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
  idFactory: () => string,
  nowIso: string,
  currentRound: number | null,
): TemporaryEffect | null {
  for (const { talent, nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "buff_empilhavel" || efeito.gatilho !== "sofrer_dano") continue;
      const valorPorPilha = typeof efeito.valor_por_pilha === "number" ? efeito.valor_por_pilha : 1;
      const maxPilhas = typeof efeito.max_pilhas === "number" ? efeito.max_pilhas : undefined;
      const alvoTags = Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags.filter((t): t is string => typeof t === "string") : [];
      return {
        id: idFactory(),
        sourceType: "talent",
        sourceId: nivel.id,
        sourceName: `${talent.nome} — ${nivel.nome}`,
        name: nivel.nome,
        durationType: "manual",
        createdRound: currentRound ?? undefined,
        stackingMode: "stack",
        stacks: 1,
        maxStacks: maxPilhas,
        modifiers: alvoTags.length > 0 ? [{ target: "skill", operation: "add", value: valorPorPilha, appliesTo: alvoTags, label: `+${valorPorPilha}/pilha` }] : [],
        active: true,
        createdAt: nowIso,
      };
    }
  }
  return null;
}

export function hasSedeDeSangue(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "toggle_condicional" && efeito.condicao_ativacao != null) return true;
    }
  }
  return false;
}

/**
 * Localiza o efeito de nível a partir do `sourceId` de um TemporaryEffect
 * (`"<nivelId>:<efeitoIndex>"`, ver `getTalentEffectKey`). Usado para
 * checar `condicao_ativacao` de um toggle já ativo sem duplicar a busca
 * em `talents`/`niveis` em cada chamador.
 */
function findEffectBySourceId(talents: TalentContent[], sourceId: string | undefined): TalentLevelEffect | null {
  if (!sourceId) return null;
  const [nivelId, efeitoIndexStr] = sourceId.split(":");
  const efeitoIndex = Number(efeitoIndexStr);
  if (!nivelId || !Number.isFinite(efeitoIndex)) return null;
  for (const talent of talents) {
    const nivel = talent.niveis.find((n) => n.id === nivelId);
    if (!nivel) continue;
    return getTalentLevelEffects(nivel)[efeitoIndex] ?? null;
  }
  return null;
}

/**
 * Berserker › Sede de Sangue — só pode ATIVAR com PV abaixo da metade do
 * máximo (`condicao_ativacao.tipo === "pv_abaixo_metade"`, lido do
 * payload — genérico para qualquer talento futuro com a mesma condição,
 * não hardcoded por nome). `pvMax <= 0` nunca bloqueia (dado ausente).
 */
export function isPvGatedToggleAllowedToActivate(efeito: TalentLevelEffect, pvAtual: number, pvMax: number): boolean {
  const condicao = efeito.condicao_ativacao as Record<string, unknown> | undefined;
  if (condicao?.tipo !== "pv_abaixo_metade") return true;
  if (pvMax <= 0) return true;
  return pvAtual < pvMax / 2;
}

/**
 * Desativa automaticamente qualquer toggle ativo cuja `condicao_ativacao`
 * (`pv_abaixo_metade`) deixou de valer — chamado nos pontos reais de
 * mudança de PV (edição manual, item de cura, descanso). Nunca ativa
 * sozinho (ativação continua manual, com PA/confirmação do jogador).
 */
export function enforcePvGatedToggleDeactivation(
  character: Character,
  talents: TalentContent[],
  pvAtual: number,
  pvMax: number,
  nowIso: string,
): { character: Character; deactivated: { nivelNome: string; talentNome: string; effectId: string }[] } {
  if (pvMax <= 0 || pvAtual < pvMax / 2) return { character, deactivated: [] };
  const ativos = getActiveTemporaryEffects(character).filter((e) => e.sourceType === "talent");
  const deactivated: { nivelNome: string; talentNome: string; effectId: string }[] = [];
  let next = character;
  for (const effect of ativos) {
    const efeito = findEffectBySourceId(talents, effect.sourceId);
    const condicao = efeito?.condicao_ativacao as Record<string, unknown> | undefined;
    if (condicao?.tipo !== "pv_abaixo_metade") continue;
    next = removeTemporaryEffect(next, effect.id, nowIso);
    deactivated.push({ nivelNome: effect.name, talentNome: effect.sourceName, effectId: effect.id });
  }
  return { character: next, deactivated };
}

/**
 * Berserker › Sede de Sangue — toggle ativo AGORA? (mesma fonte usada por
 * `getUsableTalentEffects.toggledOn`, mas exposta standalone para o
 * lembrete de dano dobrado em `/dev/table`/ficha, sem precisar montar a
 * lista inteira de efeitos usáveis.)
 */
export function isSedeDeSangueActive(character: Pick<Character, "efeitos_temporarios" | "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const effect of getActiveTemporaryEffects(character)) {
    if (effect.sourceType !== "talent") continue;
    const efeito = findEffectBySourceId(talents, effect.sourceId);
    if ((efeito?.condicao_ativacao as Record<string, unknown> | undefined)?.tipo === "pv_abaixo_metade") return true;
  }
  return false;
}

/**
 * Berserker › Sede de Sangue — bônus de Corpo DOBRADO a somar no dano
 * corpo a corpo, além do bônus normal já incluído pelo narrador (o
 * capítulo de Combate soma Corpo ao dano corpo a corpo como regra-base;
 * este sistema não tem uma calculadora de dano automática que já inclua
 * esse bônus, então o valor exato do bônus EXTRA — igual a Corpo de
 * novo — é exposto aqui para o narrador somar ao dano bruto). `null`
 * quando o toggle não está ativo.
 */
export function getSedeDeSangueDobroCorpoBonus(
  character: Pick<Character, "efeitos_temporarios" | "talentos_adquiridos" | "atributos">,
  talents: TalentContent[],
): number | null {
  if (!isSedeDeSangueActive(character, talents)) return null;
  return character.atributos?.corpo ?? 0;
}

// ---------------------------------------------------------------------
// Berserker — Último Fôlego (N3): previne queda a 0 PV, 1/cena.
// ---------------------------------------------------------------------

export function hasUltimoFolego(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "gatilho_prevenir_zero_pv") return true;
    }
  }
  return false;
}

export const ULTIMO_FOLEGO_USAGE_KEY = "berserker_ultimo_folego:cena";

export function getUltimoFolegoAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean; pvResultante: number; buffLuta: number; danoExtra: string } {
  let acquired = false;
  let pvResultante = 1;
  let buffLuta = 0;
  let danoExtra = "";
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "gatilho_prevenir_zero_pv") continue;
      acquired = true;
      if (typeof efeito.pv_resultante === "number") pvResultante = efeito.pv_resultante;
      const buffs = Array.isArray(efeito.buffs) ? efeito.buffs : [];
      for (const buff of buffs) {
        if (typeof buff !== "object" || buff === null) continue;
        const b = buff as Record<string, unknown>;
        if (b.tipo === "modificador" && typeof b.valor === "number") buffLuta = b.valor;
        if (b.tipo === "dano_extra" && typeof b.valor === "string") danoExtra = b.valor;
      }
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[ULTIMO_FOLEGO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene, pvResultante, buffLuta, danoExtra };
}

export function markUltimoFolegoUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[ULTIMO_FOLEGO_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

/**
 * Aplica a prevenção real: força PV para `pv_resultante` (rede de segurança —
 * o chamador já deve ter evitado o dano de tocar 0 de verdade, ver
 * TableClient.tsx), cria os dois efeitos temporários reais do payload
 * (+Luta até fim de cena; +dano corpo a corpo é um lembrete estruturado, já
 * que não existe calculadora de dano automática neste sistema), marca o
 * uso de cena e grava `ultimo_folego_ativo` — consumido em "Encerrar Cena"
 * (`resolveUltimoFolegoSceneEnd`) para a queda automática se ainda de pé.
 */
export function applyUltimoFolegoPrevention(
  character: Character,
  talents: TalentContent[],
  idFactory: () => string,
  nowIso: string,
  currentScene: number | null,
): Character {
  const status = getUltimoFolegoAvailability(character, talents);
  if (!status.acquired) return character;
  let next: Character = {
    ...character,
    recursos_atuais: { ...character.recursos_atuais, pv: status.pvResultante },
    ultimo_folego_ativo: { ativadoEm: nowIso, cena: currentScene ?? character.current_scene ?? 1 },
  };
  next = markUltimoFolegoUsed(next, nowIso);
  if (status.buffLuta !== 0) {
    next = addTemporaryEffect(next, {
      id: idFactory(),
      sourceType: "talent",
      sourceId: "berserker_ultimo_folego_luta",
      sourceName: "Último Fôlego",
      name: "Último Fôlego — Luta",
      durationType: "scene",
      createdScene: currentScene ?? undefined,
      stackingMode: "ignore",
      modifiers: [{ target: "skill", operation: "add", value: status.buffLuta, appliesTo: ["luta"], label: `+${status.buffLuta} Luta` }],
      active: true,
      createdAt: nowIso,
    });
  }
  if (status.danoExtra) {
    next = addTemporaryEffect(next, {
      id: idFactory(),
      sourceType: "talent",
      sourceId: "berserker_ultimo_folego_dano",
      sourceName: "Último Fôlego",
      name: "Último Fôlego — dano extra corpo a corpo",
      description: `+${status.danoExtra} de dano corpo a corpo até o fim da cena — sem calculadora de dano automática neste sistema, somar manualmente ao dano bruto.`,
      durationType: "scene",
      createdScene: currentScene ?? undefined,
      stackingMode: "ignore",
      modifiers: [
        { target: "damage", operation: "manual", reminder: `+${status.danoExtra} de dano corpo a corpo (Último Fôlego, até o fim da cena)` },
      ],
      active: true,
      createdAt: nowIso,
    });
  }
  return next;
}

/**
 * Resolve a consequência de fim de cena do payload (`consequencia_fim_cena.tipo ===
 * "cair_a_zero_pv"`): se `ultimo_folego_ativo` está marcado e o personagem ainda
 * está de pé (PV > 0), força PV a 0 — cura recebida durante a cena NÃO impede
 * essa queda (regra explícita do capítulo). PV chegando a 0 por qualquer via dispara
 * colapso normalmente neste sistema (`detectCollapseOnResourceChange`), então esta
 * queda também dispara (mesmo padrão de qualquer outro dano que zera o PV — nunca um
 * "0 PV silencioso" fora do fluxo de colapso já existente). Sempre limpa o marcador
 * ao final da cena, independentemente do resultado. Chamado por `endScene.ts`
 * (Encerrar Cena canônico), o único lugar que já processa TODOS os personagens
 * ativos no fim de cena.
 */
export function resolveUltimoFolegoSceneEnd(character: Character, nowIso: string): { character: Character; forcedToZero: boolean } {
  if (!character.ultimo_folego_ativo) return { character, forcedToZero: false };
  const pvAntes = character.recursos_atuais?.pv ?? 0;
  const forcedToZero = pvAntes > 0;
  if (!forcedToZero) {
    return { character: { ...character, ultimo_folego_ativo: undefined }, forcedToZero: false };
  }
  const peAtual = character.recursos_atuais?.pe ?? 0;
  const withZeroPv: Character = {
    ...character,
    recursos_atuais: { ...character.recursos_atuais, pv: 0 },
    ultimo_folego_ativo: undefined,
  };
  const collapse = detectCollapseOnResourceChange(withZeroPv, { pv: pvAntes, pe: peAtual }, { pv: 0, pe: peAtual }, nowIso);
  return { character: collapse.character, forcedToZero: true };
}

// ---------------------------------------------------------------------
// Guardião — Sentinela (N1): Bloquear como Reação GRATUITA, 1/rodada.
// ---------------------------------------------------------------------

export const SENTINELA_USAGE_KEY = "guardiao_sentinela:rodada";

export function getSentinelaAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisRound: boolean; alcanceM: number } {
  let acquired = false;
  let alcanceM = 1;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "reacao_gratuita" && efeito.acao === "bloquear") acquired = true;
      if (efeito.tipo === "alterar_alcance_protecao" && typeof efeito.alcance_m === "number") alcanceM = efeito.alcance_m;
    }
  }
  const usedThisRound = (character.talentos_estado?.usos?.[SENTINELA_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisRound, alcanceM };
}

export function markSentinelaUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[SENTINELA_USAGE_KEY] = { usados: 1, cadencia: "rodada", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Guardião — Blindagem (N2): anular dano bloqueado sem consumir PD.
// ---------------------------------------------------------------------

export const BLINDAGEM_USAGE_KEY = "blindagem:cena";

export function getBlindagemAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "anular_dano_bloqueado") acquired = true;
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[BLINDAGEM_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene };
}

export function markBlindagemUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[BLINDAGEM_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Guardião — Muralha (N3): sempre que obtiver sucesso em Bloquear,
// cobertura parcial (-1 em ataques direcionais) para si + aliado
// protegido, até fim de rodada. Sem "modificador aplicado ao ATACANTE"
// neste sistema (`activeEffects.ts` documenta `modificador_recebido`
// como fora do escopo automatizável — mesmo limite já documentado para
// "cobertura" em geral em todo o app, ver reminder fixo "Cobertura...
// não são validados automaticamente" no painel de resolução de ataque).
// Aplica uma condição real ("Cobertura Parcial") com autoria/alvo
// persistidos nos dois protegidos — o valor -1 fica como lembrete
// textual para o narrador aplicar manualmente em ataques direcionais
// contra eles, mesmo critério já usado para toda cobertura no app.
// ---------------------------------------------------------------------

export function hasMuralha(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "conceder_cobertura_pos_bloqueio") return true;
    }
  }
  return false;
}

export function getMuralhaPenalidade(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): number {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "conceder_cobertura_pos_bloqueio" && typeof efeito.penalidade_ofensiva_direcional === "number") {
        return efeito.penalidade_ofensiva_direcional;
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------
// Paramédico — Pronto-socorro (N1): estabiliza aliado adjacente a 0 PV.
// ---------------------------------------------------------------------

export const PRONTO_SOCORRO_USAGE_KEY = "pronto_socorro:cena";

export function getProntoSocorroAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean; pvResultante: number } {
  let acquired = false;
  let pvResultante = 1;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "estabilizar_aliado") {
        acquired = true;
        if (typeof efeito.pv_resultante === "number") pvResultante = efeito.pv_resultante;
      }
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[PRONTO_SOCORRO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene, pvResultante };
}

export function markProntoSocorroUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[PRONTO_SOCORRO_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Espadachim — Aparar (N1): promoção manual 1/cena (sucesso padrão → crítico).
// ---------------------------------------------------------------------

export const APARAR_PROMOCAO_USAGE_KEY = "aparar_promocao:cena";

export function getApararPromocaoAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean } {
  let acquired = false;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "promocao_margem_manual") acquired = true;
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[APARAR_PROMOCAO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene };
}

export function markApararPromocaoUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[APARAR_PROMOCAO_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Espadachim — Estocar (N2): -1 PA (mínimo respeitado) 1/combate num
// ataque corpo a corpo com lâmina. Cadência "combate" NÃO está em
// `TALENT_CADENCE_AUTO_RESET` (só rodada/cena/dia) — reset manual do
// narrador via `resetTalentUse` já existente (mesmo critério documentado
// no próprio `talents.ts` para combate/sessão/missão, não uma pendência
// nova deste talento).
// ---------------------------------------------------------------------

export const ESTOCAR_USAGE_KEY = "espadachim_estocar:combate";

export function getEstocarAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisCombat: boolean; reducao: number; minimo: number } {
  let acquired = false;
  let reducao = 1;
  let minimo = 1;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "reduzir_custo_pa") continue;
      acquired = true;
      if (typeof efeito.reducao === "number") reducao = efeito.reducao;
      if (typeof efeito.minimo === "number") minimo = efeito.minimo;
    }
  }
  const usedThisCombat = (character.talentos_estado?.usos?.[ESTOCAR_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisCombat, reducao, minimo };
}

export function markEstocarUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[ESTOCAR_USAGE_KEY] = { usados: 1, cadencia: "combate", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Espadachim — Ripostar (N3): 1/rodada, contra-ataque grátis (0 PA) ao
// obter sucesso crítico em Aparar com lâmina.
// ---------------------------------------------------------------------

export const RIPOSTAR_USAGE_KEY = "espadachim_ripostar:rodada";

export function hasRipostar(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "contra_ataque_sem_pa" && efeito.gatilho === "sucesso_critico_em_aparar") return true;
    }
  }
  return false;
}

export function getRipostarAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisRound: boolean } {
  const acquired = hasRipostar(character, talents);
  const usedThisRound = (character.talentos_estado?.usos?.[RIPOSTAR_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisRound };
}

export function markRipostarUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[RIPOSTAR_USAGE_KEY] = { usados: 1, cadencia: "rodada", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Malabarista — Saque Fantasma (N1): saque sem PA (já não custava PA
// nesta base — equipar/trocar de item nunca teve custo estruturado) +
// ignora a penalidade de Rajada (−1) com arma leve de Arremesso.
// ---------------------------------------------------------------------

export function hasSaqueFantasma(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "saque_sem_pa") return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Pistoleiro — Gatilho Quente (N1) / Bang Bang (N2, +1 dado de gatilho).
// ---------------------------------------------------------------------

export const GATILHO_DADOS_USAGE_KEY = "gatilho_dados:descanso_longo";

/**
 * Estado real do recurso "dados de gatilho" — `max` soma o total base
 * (payload `dados`) com qualquer `aumentar_recurso` de nível superior
 * (Bang Bang, +1), nunca hardcoded. `used` vem do contador genérico de
 * usos (`talentos_estado.usos`), cadência "descanso_longo" (o payload
 * declara `cadencia_recuperacao: "descanso_longo"` — reaproveita a
 * cadência canônica já existente, resetada em `handleApplyLongRest`).
 */
export function getGatilhoQuenteAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; max: number; used: number; available: number } {
  let acquired = false;
  let max = 0;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "recurso_dado_gatilho" && typeof efeito.dados === "number") {
        acquired = true;
        max += efeito.dados;
      }
      if (efeito.tipo === "aumentar_recurso" && efeito.recurso === "dado_gatilho" && typeof efeito.valor === "number") {
        max += efeito.valor;
      }
    }
  }
  const used = character.talentos_estado?.usos?.[GATILHO_DADOS_USAGE_KEY]?.usados ?? 0;
  return { acquired, max, used, available: Math.max(0, max - used) };
}

/** Consome 1 dado de gatilho — o d8 é rolado virtualmente na MESMA rolagem (`rollPericia.incluirDadoGatilho`), nunca digitado à parte. */
export function consumeGatilhoDado(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  const atual = usos[GATILHO_DADOS_USAGE_KEY]?.usados ?? 0;
  usos[GATILHO_DADOS_USAGE_KEY] = { usados: atual + 1, cadencia: "descanso_longo", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

/** Pistoleiro › Bang Bang (N2) — segundo disparo (assinatura única: `segundo_disparo`, distinta de `aumentar_recurso`). */
export function hasBangBangSegundoDisparo(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "segundo_disparo") return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Totem — Benção (N1): promoção de margem sem `pericias[]` (aplica em
// QUALQUER teste que aplique um efeito positivo, confirmado manualmente,
// mesmo critério de Lâmina Oculta) + token 1/cena concedido a um aliado.
// ---------------------------------------------------------------------

export const TOTEM_BENCAO_TOKEN_USAGE_KEY = "totem_bencao_token:cena";

export function hasTotemBencao(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "token_sucesso_limitado") return true;
    }
  }
  return false;
}

export function getTotemBencaoTokenAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean } {
  const acquired = hasTotemBencao(character, talents);
  const usedThisScene = (character.talentos_estado?.usos?.[TOTEM_BENCAO_TOKEN_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene };
}

export function markTotemBencaoTokenUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[TOTEM_BENCAO_TOKEN_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Mercador — Garimpo de Rua (N1): desconto real de -20% na Loja, 1/dia.
// ---------------------------------------------------------------------

export const GARIMPO_DE_RUA_USAGE_KEY = "garimpo_de_rua:dia";

export function getGarimpoDeRuaAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; percentual: number; ativoHoje: boolean } {
  let acquired = false;
  let percentual = 0;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "desconto_loja" && typeof efeito.percentual === "number") {
        acquired = true;
        percentual = efeito.percentual;
      }
    }
  }
  const ativoHoje = (character.talentos_estado?.usos?.[GARIMPO_DE_RUA_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, percentual, ativoHoje };
}

/** Ativa o desconto para o resto do dia (cadência "dia" — reseta em Novo Dia/descanso longo, mesmo padrão de Toque de Midas). */
export function activateGarimpoDeRua(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[GARIMPO_DE_RUA_USAGE_KEY] = { usados: 1, cadencia: "dia", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Dissecador — Golpe Cirúrgico (N1): -2 na próxima ação ofensiva do alvo
// após sucesso crítico com dano contundente corpo a corpo. A troca
// Corpo→Mente do mesmo nível (`familia: "troca_atributo"`) não precisa de
// gate próprio: o dropdown de atributo do RollsTab já é livre para
// qualquer rolagem, então a troca já é real sem nenhum código adicional
// (o requisito "desarmado ou arma contundente" fica só como lembrete
// textual, mesmo padrão já usado para outros efeitos "automatico").
// ---------------------------------------------------------------------

export const GOLPE_CIRURGICO_USAGE_KEY = "dissecador_golpe_cirurgico:rodada";

export function getGolpeCirurgicoPenalidadeAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisRound: boolean; valor: number } {
  let acquired = false;
  let valor = -2;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "aplicar_penalidade_pos_critico") continue;
      acquired = true;
      if (typeof efeito.valor === "number") valor = efeito.valor;
    }
  }
  const usedThisRound = (character.talentos_estado?.usos?.[GOLPE_CIRURGICO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisRound, valor };
}

export function markGolpeCirurgicoPenalidadeUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[GOLPE_CIRURGICO_USAGE_KEY] = { usados: 1, cadencia: "rodada", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

/**
 * Constrói o `TemporaryEffect` real de penalidade na próxima ação
 * ofensiva do ALVO. Este sistema não tem uma tag genérica "ofensiva" nas
 * rolagens (RollsTab só tageia por atributoId/periciaId reais) — aplica
 * ao conjunto fechado de perícias que a ação "Atacar" de fato resolve
 * (luta/precisao/balistica, ver `attackWeapon.ts`), o único jeito de
 * garantir que o modificador realmente entra na próxima rolagem
 * ofensiva do alvo em vez de ficar preso a uma tag que nunca casa com
 * nada. `durationType: "manual"` porque a duração é "1 ação", não uma
 * janela de rodadas — o narrador remove pelo botão de efeito temporário
 * já existente assim que a ação ofensiva seguinte do alvo ocorrer.
 */
export function buildGolpeCirurgicoPenalidadeEffect(
  attackerNome: string,
  valor: number,
  idFactory: () => string,
  nowIso: string,
): TemporaryEffect {
  return {
    id: idFactory(),
    sourceType: "talent",
    sourceId: "dissecador_golpe_cirurgico_penalidade",
    sourceName: `Golpe Cirúrgico (${attackerNome})`,
    name: "Golpe Cirúrgico — próxima ação ofensiva",
    durationType: "manual",
    stackingMode: "manual",
    modifiers: [
      { target: "skill", operation: "add", value: valor, appliesTo: ["luta", "precisao", "balistica"], label: `${valor} próxima ação ofensiva` },
    ],
    active: true,
    createdAt: nowIso,
  };
}

// ---------------------------------------------------------------------
// Dissecador — Fincada (N2): reduzir dano em 1 para aplicar Lento/Caído.
// ---------------------------------------------------------------------

export const FINCADA_USAGE_KEY = "dissecador_fincada:rodada";

export interface FincadaCondicaoOpcao {
  condicao: string;
  duracao?: string;
}

export function getFincadaAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisRound: boolean; reducaoDano: number; opcoes: FincadaCondicaoOpcao[] } {
  let acquired = false;
  let reducaoDano = 1;
  let opcoes: FincadaCondicaoOpcao[] = [];
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "trocar_dano_por_condicao") continue;
      acquired = true;
      if (typeof efeito.reducao_dano === "number") reducaoDano = efeito.reducao_dano;
      if (Array.isArray(efeito.opcoes_condicao)) {
        opcoes = efeito.opcoes_condicao
          .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
          .map((o) => ({
            condicao: typeof o.condicao === "string" ? o.condicao : "",
            duracao: typeof o.duracao === "string" ? o.duracao : undefined,
          }))
          .filter((o) => o.condicao);
      }
    }
  }
  const usedThisRound = (character.talentos_estado?.usos?.[FINCADA_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisRound, reducaoDano, opcoes };
}

export function markFincadaUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[FINCADA_USAGE_KEY] = { usados: 1, cadencia: "rodada", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Dissecador — Contra-medida (N3): Reação de contra-ataque ao errar
// corpo a corpo contra o dono do talento. `custo_pa: 0` no payload é só
// o custo do CONTRA-ATAQUE em si (a Reação consumida é o recurso real
// gasto aqui) — o contra-ataque continua sendo resolvido pelo fluxo
// normal de "Atacar" (arma restrita a desarmado/contundente por
// confirmação manual do narrador, sem dado estruturado de "lâmina"/
// "contundente por empunhadura" para checar automaticamente além do
// subtipo de dano já lido do item).
// ---------------------------------------------------------------------

export function hasContraMedida(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "reacao_gatilho" && efeito.gatilho === "inimigo_erra_ataque_corpo_a_corpo_contra_voce") return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Estrategista — Falcão (N1): marca alvo/detalhe, +2 real na próxima
// rolagem de UM aliado escolhido. O payload beneficia "o próximo
// personagem do grupo que agir sobre o alvo" — este sistema não rastreia
// ordem de ações do grupo nem tem conceito de "alvo" persistente e
// compartilhado entre fichas, então o token é concedido diretamente ao
// aliado que a mesa decide que vai agir (mesmo padrão já usado por Totem
// Benção), não inventado como fila compartilhada nova.
// ---------------------------------------------------------------------

export const FALCAO_USAGE_KEY = "estrategista_falcao:cena";

export function getFalcaoAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean; valor: number } {
  let acquired = false;
  let valor = 2;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "marcar_alvo_ou_detalhe") continue;
      acquired = true;
      const beneficio = efeito.beneficio as Record<string, unknown> | undefined;
      if (typeof beneficio?.valor === "number") valor = beneficio.valor;
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[FALCAO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene, valor };
}

export function markFalcaoUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[FALCAO_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Estrategista — Briefing de Campo (N2): registra até N aliados com
// perícia escolhida; próxima falha nessa perícia pode ser rerrolada
// (+1). N = 3, ou 6 se o personagem também tiver Imposição de Ritmo
// (meta_talento do próprio payload de Imposição de Ritmo, lido
// genericamente, nunca hardcoded).
// ---------------------------------------------------------------------

export function getBriefingDeCampoAvailability(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): { acquired: boolean; maxAliados: number; periciasOpcoes: string[]; bonusReroll: number } {
  let acquired = false;
  let maxAliados = 3;
  let periciasOpcoes: string[] = [];
  let bonusReroll = 1;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "briefing_pre_cena") {
        acquired = true;
        if (typeof efeito.max_aliados === "number") maxAliados = efeito.max_aliados;
        if (Array.isArray(efeito.pericias_opcoes)) {
          periciasOpcoes = efeito.pericias_opcoes.filter((p): p is string => typeof p === "string");
        }
        const beneficio = efeito.beneficio as Record<string, unknown> | undefined;
        if (typeof beneficio?.bonus === "number") bonusReroll = beneficio.bonus;
      }
      if (efeito.tipo === "modificar_talento_existente" && efeito.talento === "briefing_de_campo" && efeito.campo === "max_aliados" && typeof efeito.valor === "number") {
        maxAliados = efeito.valor;
      }
    }
  }
  return { acquired, maxAliados, periciasOpcoes, bonusReroll };
}

// ---------------------------------------------------------------------
// Estrategista — Imposição de Ritmo (N3): 1/cena, Reação, +1 PA real
// para um aliado a até 10m. "Ignora alternância PJ/PN" e "age com 3+ PA
// em turno rápido" referenciam um sistema de alternância/janela de
// turno que este VTT não implementa em nenhum lugar (`janela` do
// catálogo de ações é lido mas nunca aplicado como restrição — ver
// `actionConsole.ts`) — não há restrição nenhuma para "ignorar", então
// essas duas cláusulas ficam como lembrete narrativo em vez de código
// que desativaria uma trava inexistente.
// ---------------------------------------------------------------------

export const IMPOSICAO_DE_RITMO_USAGE_KEY = "estrategista_imposicao_de_ritmo:cena";

export function hasImposicaoDeRitmo(character: Pick<Character, "talentos_adquiridos">, talents: TalentContent[]): boolean {
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo === "override_turno_aliado") return true;
    }
  }
  return false;
}

export function getImposicaoDeRitmoAvailability(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado">,
  talents: TalentContent[],
): { acquired: boolean; usedThisScene: boolean; paBonus: number; alcanceM: number } {
  let acquired = false;
  let paBonus = 1;
  let alcanceM = 10;
  for (const { nivel } of getLearnedTalentLevels(character, talents)) {
    for (const efeito of getTalentLevelEffects(nivel)) {
      if (efeito.tipo !== "override_turno_aliado") continue;
      acquired = true;
      if (typeof efeito.pa_bonus === "number") paBonus = efeito.pa_bonus;
      if (typeof efeito.alcance_m === "number") alcanceM = efeito.alcance_m;
    }
  }
  const usedThisScene = (character.talentos_estado?.usos?.[IMPOSICAO_DE_RITMO_USAGE_KEY]?.usados ?? 0) >= 1;
  return { acquired, usedThisScene, paBonus, alcanceM };
}

export function markImposicaoDeRitmoUsed(character: Character, nowIso: string): Character {
  const usos = { ...(character.talentos_estado?.usos ?? {}) };
  usos[IMPOSICAO_DE_RITMO_USAGE_KEY] = { usados: 1, cadencia: "cena", atualizadoEm: nowIso };
  return { ...character, talentos_estado: { ...character.talentos_estado, usos } };
}

// ---------------------------------------------------------------------
// Construtores de log (texto formatado — nunca JSON cru)
// ---------------------------------------------------------------------

export interface TalentLogPayload {
  type: "talent_triggered" | "talent_opportunity_resolved" | "talent_resource_changed" | "talent_effect_applied";
  message: string;
  data: Record<string, unknown>;
}

export function buildTalentTriggeredLog(op: TalentContextualOpportunity, trigger: TalentTrigger): TalentLogPayload {
  return {
    type: "talent_triggered",
    message: `Gatilho de talento: ${op.rotulo} — ${op.descricao} (evento: ${trigger.type.replace(/_/g, " ")}).`,
    data: { nivelId: op.nivelId, efeitoIndex: op.efeitoIndex, trigger: trigger.type, rotulo: op.rotulo },
  };
}

export function buildTalentOpportunityResolvedLog(op: TalentContextualOpportunity, desfecho: string): TalentLogPayload {
  return {
    type: "talent_opportunity_resolved",
    message: `Oportunidade de talento resolvida: ${op.rotulo} — ${desfecho}.`,
    data: { id: op.id, nivelId: op.nivelId, efeitoIndex: op.efeitoIndex, desfecho },
  };
}

export function buildTalentResourceChangedLog(
  talentNome: string,
  state: TalentResourceState,
  delta: number,
): TalentLogPayload {
  const verbo = delta < 0 ? "gastou" : "recuperou";
  return {
    type: "talent_resource_changed",
    message: `${talentNome}: ${verbo} ${Math.abs(delta)} — reserva ${state.disponivel}/${state.max}.`,
    data: { key: state.key, disponivel: state.disponivel, max: state.max, delta },
  };
}

export function buildTalentEffectAppliedLog(
  talentNome: string,
  nivelNome: string,
  descricao: string,
  reminders: string[] = [],
): TalentLogPayload {
  const extras = reminders.length > 0 ? ` · ${reminders.join(" · ")}` : "";
  return {
    type: "talent_effect_applied",
    message: `${talentNome} — ${nivelNome}: ${descricao}${extras}.`,
    data: { talento: talentNome, nivel: nivelNome, descricao, reminders },
  };
}
