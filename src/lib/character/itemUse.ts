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
      return `${item.nome}: estabilização (${typeof efeito.efeito === "string" ? efeito.efeito : "efeito não estruturado"}) — resolução manual.`;
    case "buff_temporario":
      return `${item.nome}: bônus temporário — resolução manual (${typeof efeito.nota === "string" ? efeito.nota : "ver payload"}).`;
    case "aplicar_condicao":
      return `${item.nome}: aplicaria a condição "${typeof efeito.condicao === "string" ? efeito.condicao : "?"}" — aplicação manual pelo narrador.`;
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

  const removalPrimary = isConditionRemovalPrimaryItem(item);
  // Fallback de 1 PA só para farmácia de cura (coerente com o custo de "Interagir", 1 PA no
  // conteúdo canônico) — itens de remoção de condição e granadas/explosivos sem custo_pa
  // estruturado NUNCA gastam PA automaticamente (checkpoint pós-v0.61).
  const paCost = item.custoPaUso ?? (useKind === "pharmacy" && !removalPrimary ? 1 : null);

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

  for (const efeito of getItemUseEffects(item)) {
    if (isConditionRemovalEffect(efeito) && useKind === "pharmacy") {
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
    reminders,
  };
}
