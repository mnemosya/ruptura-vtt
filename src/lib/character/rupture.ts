/**
 * Resolução de Ruptura pendente no fim de cena — checkpoint v0.45
 * (PRD 10.6/10.6-Integridade).
 *
 * Reaproveita os campos já existentes desde o v0.37
 * (`ruptura_pendente`, `ruptura_nivel_pendente`) — nenhum campo
 * duplicado. Módulo puro: recebe `Character`, devolve `Character`
 * atualizado + resumo; nunca acessa Supabase nem decide UI/mesa (isso
 * é `src/lib/table/endScene.ts`).
 *
 * Regra seguida (PRD 10.6, "No fim de uma cena em que o personagem
 * chegou a 3 sobrecargas"):
 *   1. Reduz Integridade em valor igual ao número da Ruptura
 *      (`ruptura_nivel_pendente` — hoje sempre 1, ver overload.ts:
 *      "sem modelo real de nível de Ruptura ainda"; fallback seguro 1
 *      com warning se o campo estiver ausente, como pedido).
 *   2. Aumenta Mana MÁXIMA em Ânimo + 2 (acumulado em
 *      `mana_bonus_ruptura`, somado pelo `computeDerivedStats` —
 *      nunca um número solto, nunca altera o atributo Ânimo).
 *   3/4. Marca/Traço ficam como pendência narrativa em texto livre
 *      (`pending_rupture_choices`) — nunca exigidos na hora.
 *   Integridade a 0 libera Última Vontade (`ultima_vontade_pendente`).
 *
 * NÃO reseta Sobrecarga diária aqui (isso é descanso longo, v0.36/rest.ts).
 */

import type { Character, PendingRuptureChoice, RuptureResolvedEntry } from "./types";

export interface PendingRuptureInfo {
  pending: boolean;
  level: number;
  warnings: string[];
}

/** Lê `ruptura_pendente`/`ruptura_nivel_pendente` sem mutar nada — fallback seguro 1 com warning se o nível estiver ausente. */
export function getPendingRupture(character: Pick<Character, "ruptura_pendente" | "ruptura_nivel_pendente">): PendingRuptureInfo {
  const pending = character.ruptura_pendente === true;
  if (!pending) return { pending: false, level: 0, warnings: [] };
  const warnings: string[] = [];
  let level = character.ruptura_nivel_pendente;
  if (typeof level !== "number" || !Number.isFinite(level) || level < 1) {
    warnings.push("ruptura_nivel_pendente ausente ou inválido — usando fallback seguro 1.");
    level = 1;
  }
  return { pending: true, level, warnings };
}

export type IntegrityBandLabel = "integro" | "distorcao_1" | "distorcao_2" | "distorcao_3" | "dissolucao" | "fim_da_ficha";

export interface IntegrityBand {
  label: IntegrityBandLabel;
  texto: string;
}

/** Faixas de Integridade do PRD 10.6 — função pura, sem acoplamento a UI. */
export function getIntegrityBand(value: number): IntegrityBand {
  if (value >= 7) return { label: "integro", texto: "Íntegro" };
  if (value >= 5) return { label: "distorcao_1", texto: "1 distorção" };
  if (value >= 3) return { label: "distorcao_2", texto: "2 distorções" };
  if (value === 2) return { label: "distorcao_3", texto: "3 distorções" };
  if (value === 1) return { label: "dissolucao", texto: "Eu em dissolução" };
  return { label: "fim_da_ficha", texto: "Fim da ficha" };
}

/** Ânimo + 2 (PRD 10.6) — nunca lê/altera outro campo do personagem. */
export function getRuptureManaBonus(character: Pick<Character, "atributos">): number {
  return character.atributos.animo + 2;
}

export function createPendingRuptureChoice(params: { ruptureLevel: number; scene: number; nowIso: string }): PendingRuptureChoice {
  return {
    id: crypto.randomUUID(),
    ruptureLevel: params.ruptureLevel,
    scene: params.scene,
    createdAt: params.nowIso,
    status: "pending",
  };
}

export interface ResolvePendingRuptureResult {
  character: Character;
  resolved: boolean;
  level: number;
  integridadeAntes: number;
  integridadeDepois: number;
  manaMaxBonusAntes: number;
  manaMaxBonusDepois: number;
  manaBonusAplicado: number;
  pendingChoiceId?: string;
  ultimaVontadePendente: boolean;
  warnings: string[];
}

/**
 * Resolve UMA Ruptura pendente (a estrutura atual só suporta uma
 * pendência por vez — `ruptura_pendente` é booleano, não pilha — ver
 * pendência documentada no relatório). Sem efeito se não houver
 * Ruptura pendente (`resolved: false`, personagem inalterado).
 */
export function resolvePendingRupture(character: Character, params: { scene: number; nowIso: string }): ResolvePendingRuptureResult {
  const info = getPendingRupture(character);
  const manaMaxBonusAntes = character.mana_bonus_ruptura ?? 0;
  if (!info.pending) {
    return {
      character,
      resolved: false,
      level: 0,
      integridadeAntes: character.recursos_atuais?.integridade ?? 0,
      integridadeDepois: character.recursos_atuais?.integridade ?? 0,
      manaMaxBonusAntes,
      manaMaxBonusDepois: manaMaxBonusAntes,
      manaBonusAplicado: 0,
      ultimaVontadePendente: character.ultima_vontade_pendente === true,
      warnings: [],
    };
  }

  const integridadeAntes = character.recursos_atuais?.integridade ?? 0;
  const integridadeDepois = Math.max(0, integridadeAntes - info.level);
  const manaBonusAplicado = getRuptureManaBonus(character);
  const manaMaxBonusDepois = manaMaxBonusAntes + manaBonusAplicado;
  const ultimaVontadePendente = character.ultima_vontade_pendente === true || integridadeDepois === 0;

  const pendingChoice = createPendingRuptureChoice({ ruptureLevel: info.level, scene: params.scene, nowIso: params.nowIso });

  const historicoEntry: RuptureResolvedEntry = {
    id: crypto.randomUUID(),
    scene: params.scene,
    ruptureLevel: info.level,
    integridadeAntes,
    integridadeDepois,
    manaMaxBonusAntes,
    manaMaxBonusDepois,
    manaBonusAplicado,
    pendingChoiceId: pendingChoice.id,
    ultimaVontadePendente,
    resolvidoEm: params.nowIso,
  };

  const nextCharacter: Character = {
    ...character,
    recursos_atuais: { ...character.recursos_atuais, integridade: integridadeDepois },
    mana_bonus_ruptura: manaMaxBonusDepois,
    ruptura_pendente: false,
    ruptura_nivel_pendente: 0,
    ultima_vontade_pendente: ultimaVontadePendente,
    pending_rupture_choices: [...(character.pending_rupture_choices ?? []), pendingChoice],
    historico_ruptura: [...(character.historico_ruptura ?? []), historicoEntry],
  };

  return {
    character: nextCharacter,
    resolved: true,
    level: info.level,
    integridadeAntes,
    integridadeDepois,
    manaMaxBonusAntes,
    manaMaxBonusDepois,
    manaBonusAplicado,
    pendingChoiceId: pendingChoice.id,
    ultimaVontadePendente,
    warnings: info.warnings,
  };
}

/** Preenche Marca/Traço de uma pendência (texto livre, nunca obrigatório) — marca `status: "resolved"`. */
export function resolvePendingRuptureChoice(
  character: Character,
  choiceId: string,
  marca: string,
  traco: string,
  nowIso: string,
): Character {
  const choices = character.pending_rupture_choices ?? [];
  const next = choices.map((c) =>
    c.id === choiceId && c.status === "pending"
      ? { ...c, marca: marca.trim() || undefined, traco: traco.trim() || undefined, status: "resolved" as const, resolvedAt: nowIso }
      : c,
  );
  return { ...character, pending_rupture_choices: next };
}
