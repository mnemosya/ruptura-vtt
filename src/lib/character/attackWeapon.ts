/**
 * Resolução de arma/perícia/dano para a ação "Atacar" do Console de Ação —
 * checkpoint pós-v0.50 (conectar Atacar às armas do inventário).
 *
 * Puramente data-driven: perícia/atributo/dano vêm do modelo do item
 * (ItemContent.periciaAtaque/atributoAtaque/danoBase/tipoDano/subtipoDano,
 * lidos de estatisticas.* no catálogo) ou, no caso de ataque desarmado,
 * do bloco `modos[].desarmado` já publicado no próprio conteúdo da ação
 * "Atacar" (db_acoes_combate_normalizado). Nunca hardcoda arma por nome.
 */

import type { Character } from "./types";
import type { ItemContent } from "./inventory";
import type { CombatActionContent } from "./actionConsole";

export interface AttackWeaponCandidate {
  /** id da instância de inventário, ou null para "Ataque desarmado". */
  instanceId: string | null;
  nome: string;
  itemSlug: string | null;
}

/** Armas empunhadas elegíveis para "Atacar", mais a opção de ataque desarmado (sempre disponível). */
export function getAttackWeaponCandidates(
  character: Pick<Character, "inventario">,
  itemsModelo: ItemContent[],
): AttackWeaponCandidate[] {
  const empunhadas = (character.inventario ?? []).filter((inst) => inst.estado === "empunhado");
  const candidatos: AttackWeaponCandidate[] = [];
  for (const inst of empunhadas) {
    const modelo = itemsModelo.find((m) => m.slug === inst.itemSlug);
    if (!modelo || modelo.categoria !== "arma") continue;
    candidatos.push({ instanceId: inst.id, nome: inst.itemNome || modelo.nome, itemSlug: inst.itemSlug });
  }
  candidatos.push({ instanceId: null, nome: "Ataque desarmado", itemSlug: null });
  return candidatos;
}

export interface AttackResolution {
  skill: string | null;
  attribute: string | null;
  danoBase: string | null;
  tipoDano: string | null;
  subtipoDano: string | null;
  /** false quando dano/tipo não estão estruturados no payload — exibir "dano não estruturado". */
  danoEstruturado: boolean;
}

function findModoDesarmado(action: CombatActionContent): Record<string, unknown> | null {
  const modos = (action as unknown as Record<string, unknown>).modos;
  if (!Array.isArray(modos)) return null;
  const corpoACorpo = modos.find(
    (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).id === "corpo_a_corpo",
  ) as Record<string, unknown> | undefined;
  if (!corpoACorpo) return null;
  const desarmado = corpoACorpo.desarmado;
  return typeof desarmado === "object" && desarmado !== null ? (desarmado as Record<string, unknown>) : null;
}

/**
 * Resolve perícia/atributo/dano para o ataque. `weaponItem` null = desarmado.
 * Fallbacks (só quando o modelo não declara pericia_teste): corpo_a_corpo -> luta,
 * arremesso_disparo -> precisao, fogo -> balistica.
 */
export function resolveAttackDetails(
  character: Pick<Character, "atributos">,
  action: CombatActionContent,
  weaponItem: ItemContent | null,
): AttackResolution {
  if (!weaponItem) {
    const desarmado = findModoDesarmado(action);
    if (!desarmado) {
      return { skill: "luta", attribute: "corpo", danoBase: null, tipoDano: null, subtipoDano: null, danoEstruturado: false };
    }
    const tipoDano = typeof desarmado.tipo_dano === "string" ? desarmado.tipo_dano : null;
    const subtipoDano = typeof desarmado.subtipo_dano === "string" ? desarmado.subtipo_dano : null;
    const formula = desarmado.dano_formula as Record<string, unknown> | undefined;
    const attribute = formula && formula.ref === "atributo" && typeof formula.id === "string" ? formula.id : "corpo";
    const valorAtributo =
      attribute === "corpo" ? character.atributos.corpo : attribute === "mente" ? character.atributos.mente : character.atributos.animo;
    return {
      skill: "luta",
      attribute,
      danoBase: String(valorAtributo),
      tipoDano,
      subtipoDano,
      danoEstruturado: tipoDano != null,
    };
  }

  const skill =
    weaponItem.periciaAtaque ??
    (weaponItem.subtipo === "corpo_a_corpo"
      ? "luta"
      : weaponItem.subtipo === "arremesso_disparo"
        ? "precisao"
        : weaponItem.subtipo === "fogo"
          ? "balistica"
          : null);
  const attribute = weaponItem.atributoAtaque ?? (weaponItem.subtipo === "corpo_a_corpo" ? "corpo" : null);
  return {
    skill,
    attribute,
    danoBase: weaponItem.danoBase,
    tipoDano: weaponItem.tipoDano,
    subtipoDano: weaponItem.subtipoDano,
    danoEstruturado: weaponItem.danoBase != null && weaponItem.tipoDano != null,
  };
}
