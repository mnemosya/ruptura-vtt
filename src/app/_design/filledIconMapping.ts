import type { FilledIconName } from "./FilledIcon";

export const normalizeIconKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

const WEAPONS: Record<string, FilledIconName> = {
  faca: "dagger", adaga: "dagger", facas_de_arremesso: "throwing knife",
  soco_ingles: "knuckles", rapieira: "rapier", espada_curta: "sword", espada_longa: "longsword",
  machado_de_mao: "axe", machado_de_guerra: "battleaxe", alabarda: "halberd", lanca: "lance",
  shuriken: "shuriken", arco_curto: "bow", arco_longo: "bow", arco_composto: "bow",
  besta_leve: "crossbow", besta_pesada: "crossbow", revolver: "revolver",
  pistola_de_bolso: "pocket gun",
  pistola_pesada: "pistol", pistola_automatica: "pistol",
  submetralhadora: "smg", carabina: "rifle", rifle_de_assalto: "assault rifle",
  rifle_de_precisao: "sniper 1", rifle_antimaterial: "sniper 2",
  pistola_de_feixe: "noun_Blaster_4232599",
  pistola_voltaica: "noun_Blaster_4232589",
  crioagulha: "noun_Blaster_4232591", ofuscador: "noun_Blaster_4232597",
  fundidora: "noun_Blaster_4232590", carabina_de_feixe: "pistol",
  repetidora_termica: "noun_Blaster_4232588", fuzil_voltaico: "noun_Blaster_4232594",
  disruptor: "noun_LaserGun_4232600", ressonador: "noun_LaserGun_4232596",
  incinerador: "noun_Blaster_4232601",
};

const CATEGORIES: Record<string, FilledIconName> = {
  arma: "sword", armas: "sword",
  armadura: "armor", armaduras: "armor", armaduras_e_escudos: "armor",
  escudo: "shield", escudos: "shield",
  acessorio: "acessory", acessorios: "acessory", acessorio_1: "acessory", acessorio_2: "acessory",
  traje: "suit", trajes: "suit", mochila: "backpack", mochila_equipada: "backpack",
  explosivo: "explosive", explosivos: "explosive", municao: "bullets",
  pocao: "potion", pocoes: "potion", aljava: "quiver", flecha: "arrows", flechas: "arrows", virotes: "arrows",
  vertina: "potion", vertinas: "potion",
  farmacia: "noun_drugs_7809670",
};

export function filledWeaponIconForName(name?: string): FilledIconName | null {
  if (!name) return null;
  const model = normalizeIconKey(name.replace(/\s*\([^()]+\)\s*$/, "").trim());
  if (model === "rv_4_shiv" || model === "shiv") return "throwing knife";
  const type = /\(([^()]+)\)\s*$/.exec(name)?.[1] ?? name;
  return WEAPONS[normalizeIconKey(type.trim())] ?? null;
}

export function filledCategoryIcon(category: string, name?: string, itemType?: string | null): FilledIconName | null {
  const categoryKey = normalizeIconKey(category);
  if (categoryKey === "flechas_e_virotes") return "arrows";
  if (categoryKey === "celulas_de_energia") return "energy cell";
  if (categoryKey === "municao" && normalizeIconKey(itemType ?? "") === "celula") return "energy cell";
  if (categoryKey === "municao" && ["flecha", "virote"].includes(normalizeIconKey(itemType ?? ""))) return "arrows";
  const nameKey = normalizeIconKey((name ?? "").trim());
  if (categoryKey === "mobilidade" && /^icarus_(i|ii|iii)$/.test(nameKey)) return "icarus";
  if (["veiculo", "veiculos"].includes(categoryKey)) {
    if (["nyxen_lark", "nyxen_raze", "velys_iris"].includes(nameKey)) return "flying bike";
    if (["soryn_m2", "soryn_vanta"].includes(nameKey)) return "bike";
    if (["aera_c2", "velys_atrium", "aera_l8"].includes(nameKey)) return "flying car";
    return "car";
  }
  if (["ferramenta", "utilidade", "ferramentas_e_utilidades"].includes(categoryKey) && nameKey === "bateria_runica") return "runic battery";
  if (["acessorio", "ferramenta", "suporte_municao", "utilidade"].includes(categoryKey) && /(^|_)cartucheira(_|$)/.test(nameKey)) return "cartucheira";
  if (categoryKey === "ferramenta" && /^mochila_mk_(i|ii|iii)$/.test(nameKey)) return "backpack";
  // Só distinguir itens dentro da categoria apropriada, sem confundir armas com munição.
  if (categoryKey === "municao" && /(^|_)(flecha|flechas|virote|virotes)(_|$)/.test(nameKey)) return "arrows";
  if (["acessorio", "ferramenta", "suporte_municao"].includes(categoryKey) && /(^|_)aljava(_|$)/.test(nameKey)) return "quiver";
  if (["farmacia", "consumivel", "pocao", "pocoes"].includes(categoryKey) && /(^|_)(pocao|pocoes)(_|$)/.test(nameKey)) return "potion";
  return CATEGORIES[categoryKey] ?? null;
}
