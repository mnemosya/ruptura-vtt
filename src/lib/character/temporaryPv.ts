import type { Character } from "./types";

export interface TemporaryPvDamageResult {
  character: Character;
  pvBefore: number;
  pvAfter: number;
  temporaryPvBefore: number;
  temporaryPvAfter: number;
  absorbedByTemporaryPv: number;
  appliedToPv: number;
}

/** Consome PV temporário antes de reduzir o PV normal. */
export function applyDamageThroughTemporaryPv(character: Character, amount: number): TemporaryPvDamageResult {
  const damage = Math.max(0, Math.trunc(amount));
  const pvBefore = character.recursos_atuais?.pv ?? 0;
  const temporaryPvBefore = character.recursos_atuais?.pv_temporario ?? 0;
  const absorbedByTemporaryPv = Math.min(temporaryPvBefore, damage);
  // Representa o dano que alcançou o PV normal, mesmo quando ele já está em
  // zero. Essa distinção é necessária para regras como dano adicional durante
  // Colapso: o PV não pode ficar negativo, mas o golpe ainda aconteceu.
  const appliedToPv = damage - absorbedByTemporaryPv;
  const temporaryPvAfter = temporaryPvBefore - absorbedByTemporaryPv;
  const pvAfter = Math.max(0, pvBefore - appliedToPv);

  return {
    character: {
      ...character,
      recursos_atuais: {
        ...character.recursos_atuais,
        pv: pvAfter,
        pv_temporario: temporaryPvAfter,
      },
    },
    pvBefore,
    pvAfter,
    temporaryPvBefore,
    temporaryPvAfter,
    absorbedByTemporaryPv,
    appliedToPv,
  };
}
