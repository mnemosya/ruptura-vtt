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
import type { Character } from "./types";
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
      for (const periciaId of pericias) {
        out.push({ periciaId, de: efeito.de, para: efeito.para, origem: `${talent.nome} — ${nivel.nome}` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Atirador de Elite — 1 Tiro, 1 Acerto (N1): estado real de Mirar.
// ---------------------------------------------------------------------

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
