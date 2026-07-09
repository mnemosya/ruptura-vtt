/**
 * Uso de itens consumíveis — farmácia e granadas/explosivos
 * (checkpoint pós-v0.58). Puramente data-driven: nunca hardcoda slug/
 * nome de item; classifica pelo `payload_automacao.efeitos` do
 * conteúdo publicado (mesmo padrão de `getConditionEndRoundEffects`,
 * `endRoundConditions.ts`, e `getSpellEffects`/`castSpell`,
 * `spells.ts` — este módulo reaproveita a mesma forma de "efeito com
 * `tipo` livre", nunca duplica o parser de dado (`rollDamageFormula`,
 * `attack.ts`) nem o helper de cura/dano de personagem (`applyGmHealing`/
 * `applyGmDamage`, `gmActions.ts`).
 *
 * Escopo deliberado (mesmo critério de checkpoints anteriores): cura
 * (`tipo: "cura"`) é aplicada automaticamente ao recurso certo, com
 * remoção automática de Contundido/Envenenado/Sangrando via
 * `applyAutoHealRemoval` (já embutida em `applyGmHealing` quando o PV
 * sobe). Dano de granada/explosivo (`efeito_com_resistencia`/
 * `dano_em_area`) é ROLADO e registrado, mas NUNCA aplicado a nenhum
 * personagem — alvo é sempre teatro da mente, resolvido manualmente
 * pelo narrador nas ferramentas já existentes de `/dev/table`.
 * Remoção de condição (`remover_condicao`, checkpoint pós-v0.61) é
 * aplicada automaticamente quando a condição-alvo está ATIVA e veio da
 * Biblioteca (`conditionId` preenchido — mesmo critério conservador de
 * `applyAutoHealRemoval`, autoHeal.ts); UMA condição por uso ("remove
 * uma das condições" no conteúdo). Sem condição compatível ativa, o
 * uso é BLOQUEADO sem consumir nada. Todo efeito não coberto
 * (estabilizar, buff_temporario, aplicar_condicao, reduzir_pa,
 * ambiente, desativar_dispositivos) vira lembrete textual — nunca
 * inventado, nunca aplicado sozinho.
 */

import { rollDamageFormula } from "./attack";
import { stabilizeCollapse } from "./collapse";
import { applyGmHealing, type GmHealResult } from "./gmActions";
import { consumeItemCharge, getItemChargesAtual, type ItemContent, type InventoryItemInstance } from "./inventory";
import type { ActiveCondition, Character } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export interface ItemUseEffect {
  tipo: string;
  [key: string]: unknown;
}

/** Efeitos de `payload_automacao.efeitos` do item — array vazio se ausente/malformado. Nunca inventa efeito. */
export function getItemUseEffects(item: Pick<ItemContent, "payloadAutomacao">): ItemUseEffect[] {
  const payload = asRecord(item.payloadAutomacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? (efeitos as ItemUseEffect[]) : [];
}

export type ItemUseKind = "pharmacy" | "grenade" | "explosive" | "manual";

/**
 * Um efeito é "remoção de condição" se declarar `tipo:
 * "remover_condicao"` OU um campo `remover_condicao` com slug(s) —
 * cobre as variações de payload conhecidas sem depender do nome do
 * item (checkpoint pós-v0.61).
 */
function isConditionRemovalEffect(efeito: ItemUseEffect): boolean {
  return (
    efeito.tipo === "remover_condicao" ||
    typeof efeito.remover_condicao === "string" ||
    (Array.isArray(efeito.remover_condicao) && efeito.remover_condicao.length > 0)
  );
}

/** Slugs de condição que um efeito de remoção declara — `condicao` (string), `remover_condicao` (string/array) e `condicoes_possiveis` (array). */
function getEffectRemovalSlugs(efeito: ItemUseEffect): string[] {
  const slugs = new Set<string>();
  if (typeof efeito.condicao === "string") slugs.add(efeito.condicao);
  if (typeof efeito.remover_condicao === "string") slugs.add(efeito.remover_condicao);
  for (const s of asStringArray(efeito.remover_condicao)) slugs.add(s);
  for (const s of asStringArray(efeito.condicoes_possiveis)) slugs.add(s);
  return [...slugs];
}

export interface ConditionRemovalOptions {
  /** Slugs de condição que o payload do item declara poder remover — vazio se o item não tem efeito de remoção. */
  possibleSlugs: string[];
  /**
   * Condições ATIVAS do personagem compatíveis com o item — só as com
   * `conditionId` da Biblioteca (condição manual digitada à mão nunca é
   * removida automaticamente, mesmo critério de `applyAutoHealRemoval`).
   */
  compatibleActive: ActiveCondition[];
}

/** Opções de remoção de condição de um item para um personagem (checkpoint pós-v0.61) — usado pelo card do item e por `useItemOnCharacter`. */
export function getConditionRemovalOptions(
  item: Pick<ItemContent, "payloadAutomacao">,
  character: Pick<Character, "condicoes_ativas">,
): ConditionRemovalOptions {
  const slugs = new Set<string>();
  for (const efeito of getItemUseEffects(item)) {
    if (!isConditionRemovalEffect(efeito)) continue;
    for (const s of getEffectRemovalSlugs(efeito)) slugs.add(s);
  }
  const compatibleActive = (character.condicoes_ativas ?? []).filter(
    (c) => c.ativa && c.conditionId != null && slugs.has(c.conditionId),
  );
  return { possibleSlugs: [...slugs], compatibleActive };
}

/**
 * Item cujo efeito PRINCIPAL é remover condição (tem efeito de remoção
 * e nenhuma cura automática) — nesses, PA só é gasto se `custo_pa_uso`
 * for numérico estruturado (sem o fallback de 1 PA de farmácia), e o
 * uso é bloqueado sem condição compatível ativa.
 */
export function isConditionRemovalPrimaryItem(item: Pick<ItemContent, "payloadAutomacao">): boolean {
  const effects = getItemUseEffects(item);
  return effects.some(isConditionRemovalEffect) && !effects.some((e) => HEAL_EFFECT_TYPES.has(e.tipo));
}

/** Cura aplicável AGORA — `tipo: "cura"` sem `gatilho` textual (ex.: `descanso_curto`). Cura com gatilho nunca é aplicada no uso, vira lembrete (checkpoint pós-v0.62). */
function isImmediateHealEffect(efeito: ItemUseEffect): boolean {
  return HEAL_EFFECT_TYPES.has(efeito.tipo) && typeof efeito.gatilho !== "string";
}

/**
 * Alvo do efeito `estabilizar` derivado de `pausa_marcador` — mesma
 * correspondência físico→PV / mental→PE da regra canônica de Colapso
 * (`regras_personagem.colapso.gatilhos[].tipo`/`recurso`). `null` quando
 * o marcador não é reconhecido (nunca inventa o alvo).
 */
function parseStabilizeTarget(efeito: ItemUseEffect): "pv" | "pe" | null {
  const marcador = typeof efeito.pausa_marcador === "string" ? efeito.pausa_marcador : "";
  if (marcador.includes("fisico")) return "pv";
  if (marcador.includes("mental")) return "pe";
  return null;
}

/**
 * Um efeito `estabilizar` é aplicável AGORA se o personagem tem colapso
 * ATIVO do tipo declarado em `pausa_marcador` e ainda não estabilizado.
 * Devolve o motivo textual quando não aplicável (para bloqueio/aviso).
 */
function getStabilizeApplicability(
  efeito: ItemUseEffect,
  character: Pick<Character, "colapso">,
): { applicable: boolean; target: "pv" | "pe" | null; reason: string | null } {
  const target = parseStabilizeTarget(efeito);
  if (target == null) {
    return { applicable: false, target, reason: "Efeito de estabilização sem marcador de colapso estruturado — resolução manual." };
  }
  const colapso = character.colapso;
  const label = target === "pv" ? "físico (PV)" : "mental (PE)";
  if (!colapso?.ativo) {
    return { applicable: false, target, reason: `Nenhum colapso ${label} ativo — uso em outro personagem ainda não implementado.` };
  }
  if (colapso.tipo !== target) {
    return { applicable: false, target, reason: `O colapso ativo é de outro tipo — este item estabiliza colapso ${label}.` };
  }
  if (colapso.estabilizado) {
    return { applicable: false, target, reason: `Colapso ${label} já está estabilizado.` };
  }
  return { applicable: true, target, reason: null };
}

const HEAL_EFFECT_TYPES = new Set(["cura"]);
const DAMAGE_EFFECT_TYPES = new Set(["efeito_com_resistencia", "dano_em_area"]);

/**
 * Classifica o item para fins de "pode ser usado?" — data-driven via
 * categoria/tags/efeitos, nunca por nome. `null` = nenhum indício de
 * uso (o botão "Usar" não aparece). "grenade" vs "explosive" distingue
 * pelo único sinal estrutural disponível: `alcance_arremesso_m`
 * presente = arremessável (granada); ausente = dispositivo posicionado
 * (mina/carga remota) — ambos tratados igual no resto do fluxo.
 */
export function deriveItemUseKind(item: Pick<ItemContent, "categoria" | "tags" | "payloadAutomacao" | "alcanceArremessoMetros">): ItemUseKind | null {
  const effects = getItemUseEffects(item);
  const hasHeal = effects.some((e) => HEAL_EFFECT_TYPES.has(e.tipo));
  const hasDamageOrAreaEffect = effects.some((e) => DAMAGE_EFFECT_TYPES.has(e.tipo) || e.tipo === "ambiente" || e.tipo === "desativar_dispositivos");

  if (item.categoria === "farmacia" || item.tags.includes("cura") || hasHeal) return "pharmacy";
  if (item.categoria === "explosivo" || hasDamageOrAreaEffect) {
    return item.alcanceArremessoMetros != null ? "grenade" : "explosive";
  }
  // Item com efeitos declarados mas sem categoria farmácia/explosivo reconhecida — ainda assim
  // permite uso manual (algum efeito existe, mesmo que não seja cura/dano estruturado).
  if (effects.length > 0) return "manual";
  return null;
}

export interface ItemUseResourceChange {
  resource: "pv" | "pe";
  before: number;
  after: number;
}

export interface ItemUseDamageRoll {
  formula: string;
  result: number;
  damageType: string | null;
  damageSubtype: string | null;
}

export interface ItemUseResult {
  character: Character;
  ok: boolean;
  reason?: string;
  useKind: ItemUseKind;
  paCost: number | null;
  paCostTexto: string | null;
  paBefore: number;
  paAfter: number;
  quantityBefore: number;
  quantityAfter: number;
  chargesBefore: number | null;
  chargesAfter: number | null;
  resourceChanges: ItemUseResourceChange[];
  healingRolled: number | null;
  damageRolled: ItemUseDamageRoll[];
  removedConditions: string[];
  /** Colapso estabilizado por este uso (checkpoint pós-v0.62, efeito `estabilizar` via `stabilizeCollapse`) — null quando nada foi estabilizado. */
  stabilizedCollapse: "pv" | "pe" | null;
  reminders: string[];
}

/** Descreve textualmente um efeito não automatizado — nunca aplica, só documenta o que o payload declara. */
function describeUnhandledEffect(item: ItemContent, efeito: ItemUseEffect): string {
  switch (efeito.tipo) {
    case "remover_condicao": {
      const opcoes = getEffectRemovalSlugs(efeito);
      return `${item.nome}: remover manualmente uma das condições — ${opcoes.join(", ") || "condição não estruturada"}.`;
    }
    case "estabilizar":
      return `${item.nome}: estabilização (${typeof efeito.efeito === "string" ? efeito.efeito.replace(/_/g, " ") : "efeito não estruturado"}) — resolução manual.`;
    case "buff_temporario": {
      const partes: string[] = [];
      if (typeof efeito.valor === "number") {
        const tags = asStringArray(efeito.alvo_tags);
        partes.push(`+${efeito.valor}${tags.length > 0 ? ` em ${tags.join("/")}` : ""}`);
      }
      const bonusPericia = asRecord(efeito.bonus_pericia);
      if (bonusPericia && typeof bonusPericia.pericia === "string" && typeof bonusPericia.valor === "number") {
        partes.push(`+${bonusPericia.valor} em ${bonusPericia.pericia}`);
      }
      if (typeof efeito.pa_bonus === "number") partes.push(`+${efeito.pa_bonus} PA`);
      const duracao =
        typeof efeito.duracao === "string"
          ? efeito.duracao.replace(/_/g, " ")
          : typeof efeito.cadencia === "string"
            ? `cadência ${efeito.cadencia}`
            : null;
      return `${item.nome}: bônus temporário ${partes.join(", ") || "(ver payload)"}${duracao ? ` por ${duracao}` : ""} — aplicação MANUAL (sem modelo canônico de buff de item; duração não é rastreada).${typeof efeito.nota === "string" ? ` Nota: ${efeito.nota}.` : ""}`;
    }
    case "aplicar_condicao": {
      const duracao = typeof efeito.duracao === "string" ? efeito.duracao.replace(/_/g, " ") : null;
      const momento = typeof efeito.momento === "string" ? efeito.momento.replace(/_/g, " ") : null;
      return `${item.nome}: aplicar a condição "${typeof efeito.condicao === "string" ? efeito.condicao : "?"}"${duracao ? ` (${duracao})` : ""}${momento ? ` — momento: ${momento}` : ""} — aplicação manual pelo narrador (timing não automatizado).${typeof efeito.nota === "string" ? ` Nota: ${efeito.nota}.` : ""}`;
    }
    case "reduzir_pa":
      return `${item.nome}: reduz ${typeof efeito.valor === "number" ? efeito.valor : "?"} PA em gatilho (${typeof efeito.gatilho === "string" ? efeito.gatilho : "?"}) — resolução manual.`;
    case "ambiente":
      return `${item.nome}: efeito de ambiente (${typeof efeito.efeito === "string" ? efeito.efeito : "?"}) — resolução manual.`;
    case "desativar_dispositivos":
      return `${item.nome}: desativa dispositivos (${typeof efeito.alvo === "string" ? efeito.alvo : "?"}) — resolução manual.`;
    default:
      return `${item.nome}: efeito "${efeito.tipo}" — resolução manual (não automatizado neste checkpoint).`;
  }
}

/**
 * Usa 1 unidade de um item consumível — checa PA/carga/condição
 * compatível ANTES de mudar qualquer estado (bloqueia sem gastar nada
 * quando indisponível, mesmo padrão de `castSpell`/`canPayActionCost`).
 * Cura é aplicada via `applyGmHealing` (clamp no máximo, remoção
 * automática de condição por PV — já embutida nele). Dano de granada/
 * explosivo é só ROLADO — nunca aplicado a nenhum personagem.
 * Remoção de condição (checkpoint pós-v0.61): com UMA condição
 * compatível ativa, remove automaticamente; com várias, exige
 * `selectedConditionInstanceId` (seletor no card); com nenhuma,
 * bloqueia sem consumir carga nem PA.
 */
export function useItemOnCharacter(params: {
  character: Character;
  instance: InventoryItemInstance;
  item: ItemContent;
  paMax: number;
  pvMax: number;
  peMax: number;
  nowIso: string;
  /** id (uuid da instância de ActiveCondition) escolhido no seletor do card quando há várias condições compatíveis ativas. */
  selectedConditionInstanceId?: string | null;
  rng?: () => number;
}): ItemUseResult {
  const { character, instance, item, paMax, pvMax, peMax, nowIso, selectedConditionInstanceId, rng } = params;
  const useKind = deriveItemUseKind(item) ?? "manual";

  const chargesMax = item.cargasMax;
  const chargesBefore = getItemChargesAtual(instance, item);
  const quantityBefore = instance.quantidade;
  const paGastosAntes = character.estado_jogo?.pa_gastos ?? 0;
  const paBefore = Math.max(0, paMax - paGastosAntes);

  const effects = getItemUseEffects(item);
  const removalPrimary = isConditionRemovalPrimaryItem(item);
  // Fallback de 1 PA só para farmácia com CURA imediata e sem custo textual declarado
  // (coerente com o custo de "Interagir", 1 PA no conteúdo canônico) — itens de remoção de
  // condição/estabilização/efeito manual e granadas/explosivos sem custo_pa estruturado
  // NUNCA gastam PA automaticamente (checkpoints pós-v0.61/v0.62).
  const hasImmediateHeal = useKind === "pharmacy" && effects.some(isImmediateHealEffect);
  const paCost = item.custoPaUso ?? (hasImmediateHeal && item.custoPaUsoTexto == null ? 1 : null);

  const blocked = (reason: string): ItemUseResult => ({
    character,
    ok: false,
    reason,
    useKind,
    paCost,
    paCostTexto: item.custoPaUsoTexto,
    paBefore,
    paAfter: paBefore,
    quantityBefore,
    quantityAfter: quantityBefore,
    chargesBefore,
    chargesAfter: chargesBefore,
    resourceChanges: [],
    healingRolled: null,
    damageRolled: [],
    removedConditions: [],
    stabilizedCollapse: null,
    reminders: [],
  });

  const available = chargesMax != null ? (chargesBefore ?? 0) > 0 : quantityBefore > 0;
  if (!available) {
    return blocked("Sem cargas/quantidade disponíveis para usar este item.");
  }

  if (paCost != null && paCost > paBefore) {
    return blocked(`PA insuficiente (atual: ${paBefore}, necessário: ${paCost}).`);
  }

  // Remoção de condição é resolvida ANTES do consumo: item de remoção sem alvo válido
  // bloqueia sem gastar carga/PA (browser check do checkpoint pós-v0.61). Só farmácia —
  // outros tipos de uso com remover_condicao no payload continuam virando lembrete.
  let conditionToRemove: ActiveCondition | null = null;
  const removal = getConditionRemovalOptions(item, character);
  if (useKind === "pharmacy" && removal.possibleSlugs.length > 0) {
    if (selectedConditionInstanceId) {
      conditionToRemove = removal.compatibleActive.find((c) => c.id === selectedConditionInstanceId) ?? null;
      if (!conditionToRemove) {
        return blocked("A condição selecionada não está mais ativa/compatível — item não consumido.");
      }
    } else if (removal.compatibleActive.length === 1) {
      conditionToRemove = removal.compatibleActive[0];
    } else if (removal.compatibleActive.length > 1) {
      return blocked("Escolha qual condição remover antes de usar o item.");
    } else if (removalPrimary) {
      return blocked(
        `Nenhuma condição compatível ativa (${removal.possibleSlugs.join(", ")}) — item não consumido.`,
      );
    }
    // Item misto (remoção + cura) sem condição compatível: segue para a cura; a remoção vira lembrete no loop abaixo.
  }

  // Estabilização (checkpoint pós-v0.62) também é resolvida ANTES do consumo: item cujo
  // único propósito é estabilizar colapso bloqueia (sem consumir) quando não há colapso
  // aplicável — evita gastar o kit à toa. Item misto nunca bloqueia por isso.
  const stabilizeEffects = useKind === "pharmacy" ? effects.filter((e) => e.tipo === "estabilizar") : [];
  const stabilizeApplicabilities = stabilizeEffects.map((e) => getStabilizeApplicability(e, character));
  const stabilizePrimary =
    stabilizeEffects.length > 0 && effects.every((e) => e.tipo === "estabilizar");
  if (stabilizePrimary && !stabilizeApplicabilities.some((a) => a.applicable)) {
    return blocked(stabilizeApplicabilities[0]?.reason ?? "Nenhum colapso aplicável — item não consumido.");
  }

  const consumed = consumeItemCharge(character, instance.id, item);
  if (!consumed) {
    // Corrida rara entre a checagem `available` acima e aqui (estado mudou) — nunca aplica efeito.
    return blocked("Sem cargas/quantidade disponíveis para usar este item.");
  }

  let nextCharacter = consumed.character;
  if (paCost != null) {
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, pa_gastos: paGastosAntes + paCost } };
  }

  const resourceChanges: ItemUseResourceChange[] = [];
  const removedConditions: string[] = [];
  const reminders: string[] = [];
  let healingRolled: number | null = null;
  const damageRolled: ItemUseDamageRoll[] = [];
  let conditionRemovalApplied = false;
  let stabilizedCollapse: "pv" | "pe" | null = null;

  for (const efeito of effects) {
    if (efeito.tipo === "estabilizar" && useKind === "pharmacy") {
      const applicability = getStabilizeApplicability(efeito, nextCharacter);
      if (applicability.applicable && applicability.target != null && stabilizedCollapse == null) {
        // Helper canônico (PRD 10.7): pausa o avanço de segmento — NÃO cura, NÃO remove Inconsciente.
        nextCharacter = stabilizeCollapse(nextCharacter, nowIso);
        stabilizedCollapse = applicability.target;
        reminders.push(
          `${item.nome}: colapso ${applicability.target === "pv" ? "físico" : "mental"} estabilizado — avanço de segmento pausado (não cura, não remove Inconsciente).`,
        );
        if (item.periciaUso) {
          reminders.push(
            `${item.nome}: o conteúdo declara teste de ${item.periciaUso} para o uso — role manualmente; se o narrador considerar falha, desfaça a estabilização no painel.`,
          );
        }
      } else if (applicability.reason) {
        // Item misto com estabilização não aplicável agora — documenta sem aplicar.
        reminders.push(`${item.nome}: ${applicability.reason}`);
      }
    } else if (efeito.tipo === "cura" && useKind === "pharmacy" && typeof efeito.gatilho === "string") {
      // Cura vinculada a gatilho (ex.: descanso_curto) NUNCA é aplicada no uso — o item é
      // consumido agora e a cura fica como lembrete para o momento do gatilho (checkpoint
      // pós-v0.62; sem modelo de "efeito pendente de descanso" ainda).
      const dado = typeof efeito.dado === "string" ? efeito.dado : "?";
      const recurso = efeito.recurso === "pe" ? "PE" : "PV";
      reminders.push(
        `${item.nome}: cura ${dado} de ${recurso} vinculada ao gatilho "${efeito.gatilho.replace(/_/g, " ")}" — aplicar manualmente quando o gatilho ocorrer (nada foi aplicado agora).`,
      );
    } else if (isConditionRemovalEffect(efeito) && useKind === "pharmacy") {
      const effectSlugs = getEffectRemovalSlugs(efeito);
      if (conditionToRemove && effectSlugs.includes(conditionToRemove.conditionId ?? "")) {
        if (!conditionRemovalApplied) {
          // UMA condição por uso ("remove uma das condições") — efeitos seguintes que
          // apontam para a mesma condição já removida não removem uma segunda.
          const alvo = conditionToRemove;
          nextCharacter = {
            ...nextCharacter,
            condicoes_ativas: (nextCharacter.condicoes_ativas ?? []).map((c) =>
              c.id === alvo.id ? { ...c, ativa: false, removidaEm: nowIso, removidaOrigem: "item_use" as const } : c,
            ),
          };
          removedConditions.push(conditionToRemove.nome);
          conditionRemovalApplied = true;
        }
        // Complemento textual do efeito (ex.: "neutraliza_venenos_ativos") — nunca automatizado.
        if (typeof efeito.efeito === "string") {
          reminders.push(`${item.nome}: ${efeito.efeito.replace(/_/g, " ")} — resolução manual.`);
        }
      } else {
        // Sem alvo compatível para ESTE efeito (item misto, ou efeito apontando para outra condição) — só documenta.
        reminders.push(describeUnhandledEffect(item, { ...efeito, tipo: "remover_condicao" }));
      }
    } else if (efeito.tipo === "cura" && useKind === "pharmacy") {
      const recurso = efeito.recurso === "pe" ? "pe" : efeito.recurso === "pv" ? "pv" : null;
      const dado = typeof efeito.dado === "string" ? efeito.dado : null;
      if (!recurso || !dado) {
        reminders.push(`${item.nome}: cura sem fórmula estruturada — aplicar manualmente.`);
        continue;
      }
      const bonus = typeof efeito.bonus === "number" ? efeito.bonus : 0;
      const rolled = Math.max(0, rollDamageFormula(dado, rng) + bonus);
      healingRolled = (healingRolled ?? 0) + rolled;
      const max = recurso === "pv" ? pvMax : peMax;
      const healResult: GmHealResult = applyGmHealing(nextCharacter, recurso, rolled, max, nowIso);
      nextCharacter = healResult.character;
      resourceChanges.push({ resource: recurso, before: healResult.before, after: healResult.after });
      if (healResult.removidasPorCura.length > 0) {
        removedConditions.push(...healResult.removidasPorCura.map((c) => c.nome));
      }
      if (typeof efeito.falha === "string") {
        reminders.push(`${item.nome}: em falha no teste, cura vira "${efeito.falha}" — ajuste manualmente se aplicável.`);
      }
    } else if ((efeito.tipo === "efeito_com_resistencia" || efeito.tipo === "dano_em_area") && useKind !== "pharmacy") {
      const formula = typeof efeito.dano === "string" ? efeito.dano : typeof efeito.dado === "string" ? efeito.dado : null;
      const tipoDano = typeof efeito.tipo_dano === "string" ? efeito.tipo_dano : null;
      const subtipoDano = typeof efeito.subtipo_dano === "string" ? efeito.subtipo_dano : null;
      if (formula) {
        damageRolled.push({ formula, result: rollDamageFormula(formula, rng), damageType: tipoDano, damageSubtype: subtipoDano });
      }
      const resistencia = asRecord(efeito.resistencia);
      if (resistencia) {
        const pericia = typeof resistencia.pericia === "string" ? resistencia.pericia : "?";
        const cd = typeof resistencia.cd === "number" ? String(resistencia.cd) : "CD não estruturada";
        reminders.push(`Resistência esperada: ${pericia} (${cd}).`);
      }
      if (typeof efeito.condicao_falha === "string") {
        reminders.push(
          `Condição em falha: ${efeito.condicao_falha}${typeof efeito.duracao_condicao === "string" ? ` (${efeito.duracao_condicao})` : ""}.`,
        );
      }
      if (typeof efeito.sucesso === "string") {
        reminders.push(`Em sucesso do alvo: ${efeito.sucesso.replace(/_/g, " ")}.`);
      }
    } else if (efeito.tipo === "cura" || DAMAGE_EFFECT_TYPES.has(efeito.tipo)) {
      // "cura" fora do contexto farmácia, ou dano fora do contexto granada/explosivo — não esperado no catálogo atual; documenta sem aplicar.
      reminders.push(describeUnhandledEffect(item, efeito));
    } else {
      reminders.push(describeUnhandledEffect(item, efeito));
    }
  }

  if (useKind === "grenade" || useKind === "explosive") {
    reminders.push("Escolha alvos manualmente e resolva dano/condições pelo painel do narrador (/dev/table).");
  }

  return {
    character: nextCharacter,
    ok: true,
    useKind,
    paCost,
    paCostTexto: item.custoPaUsoTexto,
    paBefore,
    paAfter: paCost != null ? paBefore - paCost : paBefore,
    quantityBefore: consumed.quantityBefore,
    quantityAfter: consumed.quantityAfter,
    chargesBefore: consumed.chargesBefore,
    chargesAfter: consumed.chargesAfter,
    resourceChanges,
    healingRolled,
    damageRolled,
    removedConditions,
    stabilizedCollapse,
    reminders,
  };
}

// ---------------------------------------------------------------------
// Preview de uso (checkpoint pós-v0.62) — o que será automático vs.
// manual, calculado do payload + estado atual do personagem. Usado pelo
// card do item na aba Inventário; nunca aplica nada.
// ---------------------------------------------------------------------

export interface ItemUsePreview {
  /** Efeitos aplicados automaticamente ao usar (com o estado atual do personagem). */
  automatic: string[];
  /** Efeitos que ficam manuais (lembretes no log) — nunca aplicados sozinhos. */
  manual: string[];
  /** Preenchido quando o uso está BLOQUEADO agora (nada seria consumido) — null quando o uso é permitido. */
  blockedReason: string | null;
}

/** Preview do que acontece ao usar o item AGORA — espelha a classificação de `useItemOnCharacter` sem aplicar nada. */
export function getItemUsePreview(
  item: ItemContent,
  character: Pick<Character, "condicoes_ativas" | "colapso">,
): ItemUsePreview {
  const useKind = deriveItemUseKind(item) ?? "manual";
  const effects = getItemUseEffects(item);
  const automatic: string[] = [];
  const manual: string[] = [];
  let blockedReason: string | null = null;

  const removal = getConditionRemovalOptions(item, character);
  if (useKind === "pharmacy" && removal.possibleSlugs.length > 0) {
    if (removal.compatibleActive.length > 0) {
      automatic.push(
        `Remove condição (uma por uso): ${removal.possibleSlugs.join(", ")} — ativa(s) compatível(is): ${removal.compatibleActive.map((c) => c.nome).join(", ")}.`,
      );
    } else if (isConditionRemovalPrimaryItem(item)) {
      blockedReason = `Nenhuma condição compatível ativa (${removal.possibleSlugs.join(", ")}) — uso bloqueado, nada será consumido.`;
    } else {
      manual.push(`Remoção de condição (${removal.possibleSlugs.join(", ")}) sem alvo ativo — viraria lembrete.`);
    }
  }

  const stabilizeEffects = useKind === "pharmacy" ? effects.filter((e) => e.tipo === "estabilizar") : [];
  if (stabilizeEffects.length > 0) {
    const applicabilities = stabilizeEffects.map((e) => getStabilizeApplicability(e, character));
    const applicable = applicabilities.find((a) => a.applicable);
    if (applicable) {
      automatic.push(
        `Estabiliza o colapso ${applicable.target === "pv" ? "físico (PV)" : "mental (PE)"} — pausa o avanço de segmento (não cura, não remove Inconsciente).`,
      );
      if (item.periciaUso) manual.push(`Teste de ${item.periciaUso} declarado pelo conteúdo — rolar manualmente.`);
    } else if (effects.every((e) => e.tipo === "estabilizar")) {
      blockedReason = applicabilities[0]?.reason ?? "Nenhum colapso aplicável — uso bloqueado.";
    } else if (applicabilities[0]?.reason) {
      manual.push(applicabilities[0].reason);
    }
  }

  for (const efeito of effects) {
    if (efeito.tipo === "estabilizar" || isConditionRemovalEffect(efeito)) continue; // já tratados acima
    if (efeito.tipo === "cura" && useKind === "pharmacy") {
      const dado = typeof efeito.dado === "string" ? efeito.dado : null;
      const recurso = efeito.recurso === "pe" ? "PE" : efeito.recurso === "pv" ? "PV" : null;
      if (typeof efeito.gatilho === "string") {
        manual.push(
          `Cura ${dado ?? "?"} de ${recurso ?? "?"} só no gatilho "${efeito.gatilho.replace(/_/g, " ")}" — não aplicada no uso.`,
        );
      } else if (dado && recurso) {
        automatic.push(`Cura ${dado}${typeof efeito.bonus === "number" ? ` + ${efeito.bonus}` : ""} de ${recurso} aplicada automaticamente.`);
        if (typeof efeito.falha === "string") manual.push(`Em falha no teste, cura vira "${efeito.falha}" — ajuste manual.`);
      } else {
        manual.push("Cura sem fórmula estruturada — aplicação manual.");
      }
    } else if ((efeito.tipo === "efeito_com_resistencia" || efeito.tipo === "dano_em_area") && useKind !== "pharmacy") {
      const formula = typeof efeito.dano === "string" ? efeito.dano : typeof efeito.dado === "string" ? efeito.dado : null;
      if (formula) automatic.push(`Rola dano ${formula} — NUNCA aplicado a alvo automaticamente.`);
      manual.push("Alvos, resistência e condições resolvidos pelo narrador.");
    } else {
      manual.push(describeUnhandledEffect(item, efeito));
    }
  }

  return { automatic, manual, blockedReason };
}
