/**
 * Descanso curto/longo — checkpoint v0.36 (PRD seção 10.4, verbatim).
 *
 * Módulo puro: `applyShortRest`/`applyLongRest` recebem o personagem e
 * os derivados já calculados, devolvem um NOVO `Character` (nunca
 * mutam o argumento) mais um resumo antes/depois para log/UI. Não
 * tocam em `condicoes_ativas` — a interação com a remoção automática
 * por cura (v0.34) acontece no chamador (`CharacterSheetClient`),
 * exatamente como já acontece para qualquer outro aumento manual de
 * PV (`updateRecursoAtual`/`handleRestoreRecursosMax`) — reaproveitada
 * sem duplicar lógica aqui.
 *
 * Regra central do PRD 10.4, aplicada ao pé da letra:
 *   - Descanso curto (30 min): Mana += floor(manaMax / 2); recursos
 *     marcados "descanso curto" (sem estrutura implementada ainda —
 *     vira warning, nunca invenção de regra).
 *   - Descanso longo (8h): PV += Corpo + 2; PE += Mente + 2; Mana = max;
 *     remove PV/Mana temporários; reseta Sobrecarga; recursos marcados
 *     "descanso longo" (mesmo warning do curto). Integridade NUNCA
 *     recupera por descanso (PRD 10.4 não menciona Integridade —
 *     omissão deliberada, não esquecimento).
 */

import type { Character, CharacterResources, DerivedStats, TemporaryEffect } from "./types";
import { resetOverloadForLongRest } from "./overload";
import { expireRestTemporaryEffects } from "./temporaryEffects";

export interface RestResourceSnapshot {
  pv: number;
  pe: number;
  mana: number;
  integridade: number;
  pv_temporario: number;
  mana_temporaria: number;
  sobrecarga_usada_dia: number;
}

export interface RestResult {
  character: Character;
  before: RestResourceSnapshot;
  after: RestResourceSnapshot;
  /** `after - before` por campo — sempre presente, 0 quando o campo não mudou. */
  diff: RestResourceSnapshot;
  effectsApplied: string[];
  /** Efeitos temporários com `durationType: "rest"` expirados neste descanso (checkpoint pós-v0.71) — só no descanso longo. */
  expiredTemporaryEffects: TemporaryEffect[];
  warnings: string[];
}

function snapshot(character: Character): RestResourceSnapshot {
  const r = character.recursos_atuais ?? {};
  return {
    pv: r.pv ?? 0,
    pe: r.pe ?? 0,
    mana: r.mana ?? 0,
    integridade: r.integridade ?? 0,
    pv_temporario: r.pv_temporario ?? 0,
    mana_temporaria: r.mana_temporaria ?? 0,
    sobrecarga_usada_dia: character.sobrecarga_usada_dia ?? 0,
  };
}

function diffOf(before: RestResourceSnapshot, after: RestResourceSnapshot): RestResourceSnapshot {
  return {
    pv: after.pv - before.pv,
    pe: after.pe - before.pe,
    mana: after.mana - before.mana,
    integridade: after.integridade - before.integridade,
    pv_temporario: after.pv_temporario - before.pv_temporario,
    mana_temporaria: after.mana_temporaria - before.mana_temporaria,
    sobrecarga_usada_dia: after.sobrecarga_usada_dia - before.sobrecarga_usada_dia,
  };
}

/** Aviso comum: nenhuma estrutura de "recurso por cadência de descanso" existe ainda (item/carga/uso — fora de escopo). */
function cadenciaWarning(cadencia: "curto" | "longo"): string {
  return `Recursos marcados para recuperar em descanso ${cadencia} ainda não têm estrutura implementada — nenhum item/carga foi ajustado.`;
}

const CONDITION_DURATION_WARNING = "Revise condições com duração por descanso manualmente.";

export function applyShortRest(character: Character, derived: DerivedStats, nowIso: string): RestResult {
  const before = snapshot(character);
  const manaMax = derived.mana_max ?? 0;
  const ganho = Math.floor(manaMax / 2);
  const manaNova = Math.min(manaMax, before.mana + ganho);

  const recursos_atuais: CharacterResources = {
    ...character.recursos_atuais,
    mana: manaNova,
  };

  const nextCharacter: Character = {
    ...character,
    recursos_atuais,
    metadados: { ...character.metadados, schema_version: character.metadados?.schema_version ?? 1, atualizado_em: nowIso },
  };

  const after = snapshot(nextCharacter);
  const effectsApplied = [`Mana +${manaNova - before.mana} (floor(${manaMax}/2) = ${ganho}, sem ultrapassar ${manaMax})`];
  const warnings = [cadenciaWarning("curto")];

  // Descanso curto NÃO expira efeitos temporários "rest" (regra do PRD 10.4: só o longo reseta).
  return { character: nextCharacter, before, after, diff: diffOf(before, after), effectsApplied, expiredTemporaryEffects: [], warnings };
}

export function applyLongRest(character: Character, derived: DerivedStats, nowIso: string): RestResult {
  const before = snapshot(character);
  const pvMax = derived.pv_max ?? 0;
  const peMax = derived.pe_max ?? 0;
  const manaMax = derived.mana_max ?? 0;
  const corpo = character.atributos.corpo;
  const mente = character.atributos.mente;

  const ganhoPv = corpo + 2;
  const ganhoPe = mente + 2;
  const pvNovo = Math.min(pvMax, before.pv + ganhoPv);
  const peNovo = Math.min(peMax, before.pe + ganhoPe);

  const recursos_atuais: CharacterResources = {
    ...character.recursos_atuais,
    pv: pvNovo,
    pe: peNovo,
    mana: manaMax,
    pv_temporario: 0,
    mana_temporaria: 0,
    // integridade deliberadamente ausente daqui — nunca tocada.
  };

  // Efeitos temporários "até o próximo descanso longo" expiram aqui (checkpoint pós-v0.71).
  const restExpiry = expireRestTemporaryEffects(resetOverloadForLongRest(character), nowIso);
  const nextCharacter: Character = {
    ...restExpiry.character,
    recursos_atuais,
    metadados: { ...character.metadados, schema_version: character.metadados?.schema_version ?? 1, atualizado_em: nowIso },
  };

  const after = snapshot(nextCharacter);
  const effectsApplied = [
    `PV +${pvNovo - before.pv} (Corpo(${corpo}) + 2 = ${ganhoPv}, sem ultrapassar ${pvMax})`,
    `PE +${peNovo - before.pe} (Mente(${mente}) + 2 = ${ganhoPe}, sem ultrapassar ${peMax})`,
    `Mana definida ao máximo (${manaMax})`,
    before.pv_temporario > 0 ? `PV temporário removido (era ${before.pv_temporario})` : "PV temporário já estava zerado",
    before.mana_temporaria > 0
      ? `Mana temporária removida (era ${before.mana_temporaria})`
      : "Mana temporária já estava zerada",
    before.sobrecarga_usada_dia > 0
      ? `Sobrecarga resetada (era ${before.sobrecarga_usada_dia} surto(s) usado(s) no dia)`
      : "Sobrecarga já estava zerada",
  ];

  if (restExpiry.expired.length > 0) {
    effectsApplied.push(`Efeito(s) temporário(s) de descanso expirado(s): ${restExpiry.expired.map((e) => e.name).join(", ")}`);
  }

  const warnings = [cadenciaWarning("longo")];
  if ((character.condicoes_ativas ?? []).some((c) => c.ativa)) {
    warnings.push(CONDITION_DURATION_WARNING);
  }

  return {
    character: nextCharacter,
    before,
    after,
    diff: diffOf(before, after),
    effectsApplied,
    expiredTemporaryEffects: restExpiry.expired,
    warnings,
  };
}
