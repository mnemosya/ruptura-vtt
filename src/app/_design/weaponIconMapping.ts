export const WEAPON_ICON_TYPES = {
  faca: "knife", adaga: "knife", soco_ingles: "knuckles", manoplas: "gauntlet", tonfa: "tonfa",
  rapieira: "rapier", espada_curta: "sword", espada_longa: "great sword",
  machado_de_mao: "handaxe", machado_de_guerra: "handaxe", martelo_pesado: "hammer",
  bastao: "bat", corrente_leve: "chains", alabarda: "spear",
  lanca: "spear", shuriken: "shuriken", arco_curto: "bow", arco_longo: "bow", arco_composto: "bow",
  besta_leve: "crossbow", besta_pesada: "crossbow",
  pistola_de_bolso: "pistol", revolver: "pistol", pistola_pesada: "pistol", pistola_automatica: "pistol",
  submetralhadora: "smg", carabina: "rifle", rifle_de_assalto: "assult rifle",
  escopeta_curta: "shotgun", escopeta_pesada: "shotgun", espingarda: "shotgun",
  rifle_de_precisao: "sniper", rifle_antimaterial: "sniper", metralhadora: "machinegun",
  pistola_de_feixe: "lasergun", pistola_voltaica: "lasergun", crioagulha: "lasergun", ofuscador: "lasergun",
  fundidora: "blaster", carabina_de_feixe: "blaster", repetidora_termica: "blaster", fuzil_voltaico: "blaster",
  disruptor: "blaster", criojetor: "blaster", ressonador: "blaster", incinerador: "blaster",
  rifle_de_feixe_concentrado: "blaster", canhao_de_plasma: "blaster", metralhadora_de_arco: "blaster",
  lanca_crio: "blaster", ressonador_de_cerco: "blaster",
} as const;

/** Modelos especiais herdam o tipo entre parênteses, sem depender da marca. */
export function weaponIconForName(name?: string) {
  if (!name) return null;
  const type = /\(([^()]+)\)\s*$/.exec(name)?.[1] ?? name;
  const normalized = type.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return WEAPON_ICON_TYPES[normalized as keyof typeof WEAPON_ICON_TYPES] ?? null;
}
