import type { Character } from "./types";
import { arsDaRegiao, setArsMitAtual, type ArsRegiao } from "./escalpos";
import { resolveDamageWithMitPd } from "./defense";
import { armaduraDaRegiao, setItemMitAtual, setItemPdAtual, type EquippedDefenseProfile } from "./inventory";

/** Resolve a camada externa antes da ARS; cada uma perde MIT apenas se absorver dano. */
export function resolveLayeredDefense(params: {
  character: Character;
  damageAmount: number;
  damageType?: string;
  damageSubtype?: string;
  wasBlocked: boolean;
  defense?: EquippedDefenseProfile;
  region?: ArsRegiao;
}) {
  const { character, defense, region, wasBlocked } = params;
  const armadura = !wasBlocked && region ? armaduraDaRegiao(defense, region) : !wasBlocked ? defense?.armadura : undefined;
  const escudo = wasBlocked ? defense?.escudo : undefined;
  const externa = resolveDamageWithMitPd({
    damageAmount: params.damageAmount,
    damageType: params.damageType,
    damageSubtype: params.damageSubtype,
    wasBlocked,
    armor: armadura ? { atual: armadura.mitAtual, max: armadura.mitMax, tipoProtecao: armadura.tipoProtecao } : undefined,
    shield: escudo ? { atual: escudo.pdAtual, max: escudo.pdMax, tipoProtecao: escudo.tipoProtecao } : undefined,
  });
  let next = character;
  if (armadura && externa.mitigatedByMit > 0) next = setItemMitAtual(next, armadura.instance.id, externa.mitAfter ?? armadura.mitAtual, armadura.mitMax);
  if (escudo && externa.mitigatedByPd > 0) next = setItemPdAtual(next, escudo.instance.id, externa.pdAfter ?? escudo.pdAtual, escudo.pdMax);

  // Bloquear já escolheu PD; a ARS cobre apenas dano físico de ataques não bloqueados.
  const ars = !wasBlocked && region && params.damageType === "fisico" ? arsDaRegiao(next, region) : null;
  if (!ars || externa.finalDamage <= 0) return { character: next, externa, ars: null, finalDamage: externa.finalDamage, mitigatedByArs: 0, summary: externa.summary };

  const mitEfetivo = Math.max(0, ars.atual - (params.damageSubtype === "perfurante" ? 1 : 0));
  const absorvido = Math.min(mitEfetivo, externa.finalDamage);
  const mitDepois = Math.max(0, ars.atual - (absorvido > 0 ? params.damageSubtype === "acido" ? 2 : 1 : 0));
  if (absorvido > 0) next = setArsMitAtual(next, ars.instancia.id, mitDepois);
  return {
    character: next,
    externa,
    ars: { instanceId: ars.instancia.id, before: ars.atual, after: mitDepois, max: ars.max },
    finalDamage: externa.finalDamage - absorvido,
    mitigatedByArs: absorvido,
    summary: `${armadura || escudo ? externa.summary : "Sem proteção externa."} ARS (${region}) absorveu ${absorvido} (MIT ${ars.atual} → ${mitDepois}); ${externa.finalDamage - absorvido} de dano passou ao defensor.`,
  };
}
