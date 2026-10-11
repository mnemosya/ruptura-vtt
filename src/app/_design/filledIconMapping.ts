import type { FilledIconName } from "./FilledIcon";

export const normalizeIconKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

const WEAPONS: Record<string, FilledIconName> = {
  faca: "dagger", adaga: "dagger", facas_de_arremesso: "throwing knife",
  soco_ingles: "knuckles", rapieira: "rapier", espada_curta: "sword", espada_longa: "longsword",
  machado_de_mao: "axe", machado_de_guerra: "battleaxe", alabarda: "halberd", lanca: "lance",
  shuriken: "shuriken", arco_curto: "bow", arco_longo: "bow", arco_composto: "bow",
  besta_leve: "crossbow", besta_pesada: "crossbow", revolver: "revolver",
};

const CATEGORIES: Record<string, FilledIconName> = {
  arma: "sword", armas: "sword",
  armadura: "armor", armaduras: "armor", armaduras_e_escudos: "armor",
  escudo: "shield", escudos: "shield",
  acessorio: "acessory", acessorios: "acessory", acessorio_1: "acessory", acessorio_2: "acessory",
  traje: "suit", trajes: "suit", mochila: "backpack", mochila_equipada: "backpack",
  explosivo: "explosive", explosivos: "explosive", municao: "bullets",
  pocao: "potion", pocoes: "potion", aljava: "quiver", flecha: "arrows", flechas: "arrows", virotes: "arrows",
};

export function filledWeaponIconForName(name?: string): FilledIconName | null {
  if (!name) return null;
  const type = /\(([^()]+)\)\s*$/.exec(name)?.[1] ?? name;
  return WEAPONS[normalizeIconKey(type.trim())] ?? null;
}

export function filledCategoryIcon(category: string, name?: string): FilledIconName | null {
  const categoryKey = normalizeIconKey(category);
  const nameKey = normalizeIconKey((name ?? "").trim());
  if (categoryKey === "ferramenta" && /^mochila_mk_(i|ii|iii)$/.test(nameKey)) return "backpack";
  // Só distinguir itens dentro da categoria apropriada, sem confundir armas com munição.
  if (categoryKey === "municao" && /(^|_)(flecha|flechas|virote|virotes)(_|$)/.test(nameKey)) return "arrows";
  if (["acessorio", "ferramenta", "suporte_municao"].includes(categoryKey) && /(^|_)aljava(_|$)/.test(nameKey)) return "quiver";
  if (["farmacia", "consumivel", "pocao", "pocoes"].includes(categoryKey) && /(^|_)(pocao|pocoes)(_|$)/.test(nameKey)) return "potion";
  return CATEGORIES[categoryKey] ?? null;
}
