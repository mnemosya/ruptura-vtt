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
  estrutura_dorsal: "dorsal",
  drone: "noun_Drone_8335890", drones: "noun_Drone_8335890", drones_e_robos: "noun_Drone_8335890",
  robo: "noun_Robot_8483832", robos: "noun_Robot_8483832",
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
  const namedItems: Record<string, FilledIconName> = {
    escuta: "noun_Audio_8196748", ascensor_motorizado: "noun_Climbing_5026510(ascensor)",
    luvas_de_escalada: "noun_Gloves_8340735", kit_de_contencao: "noun_Handcuffs_699304",
    aerovoile: "noun_HangGlider_8112644", pulseira_vital: "noun_Heart_5999211", biomonitor: "noun_Heart_5999211",
    kit_de_lock_picking: "noun_Lockpick_6989497", kit_de_tirolesa: "noun_Zipline_268825",
    bloqueador_de_sinal: "noun_block_5432800", cdi_craqueada: "noun_digitalwallet_8310695",
    chip_de_dados: "noun_flashdrive_4483089", rastreador: "noun_globaltracking_6583453",
    kit_de_rastreamento: "noun_globaltracking_6583453", kit_de_intrusao_digital: "noun_hacker_5879592",
    tinta_runica_invisivel: "noun_paint_6045428", solas_antiderrapantes: "noun_runningshoe_8228716(antiderrapantes)",
    corda_runica: "noun_skippingrope_1553123", spray_adesivo: "noun_spray_8421659",
    oculos_de_realidade_aumentada: "noun_vr_2226896",
  };
  if (["acessorio", "ferramenta", "utilidade", "dispositivo", "mobilidade", "escalpo"].includes(categoryKey) && namedItems[nameKey]) return namedItems[nameKey];
  if (["ferramenta", "utilidade"].includes(categoryKey)) {
    if (nameKey === "lanterna_runica") return "noun_Flashlight_8418741";
    if (nameKey === "papel_runico") return "noun_Paper_8227159";
  }
  if (categoryKey === "farmacia" && (nameKey === "medkit" || /^kit_de_estabilizacao_/.test(nameKey))) return "noun_medkit_5794368";
  if (categoryKey === "escalpo") {
    const implants: Record<string, FilledIconName> = {
      optica: "noun_bioniccontact_6410565", opticos: "noun_bioniccontact_6410565",
      braco: "noun_bionicrobotarm_7001919", de_braco: "noun_bionicrobotarm_7001919",
      perna: "noun_bionicleg_7356680", de_perna: "noun_bionicleg_7356680",
      audicao: "noun_earlistening_5252153", auditivos: "noun_earlistening_5252153",
      neural: "noun_neural_4128305", neurais: "noun_neural_4128305",
      moda: "noun_beauty_3677917", identidade: "noun_id_7920951",
    };
    const implant = implants[normalizeIconKey(itemType ?? "")];
    if (implant) return implant;
  }
  if (categoryKey === "mobilidade") {
    const mobility: Record<string, FilledIconName> = {
      patinete_eletrico: "noun_ElectricScooter_8291684", hoverboard: "noun_Hoverboard_7742758",
      rollsyns: "noun_RollerSkate_5192593", skate: "noun_Skateboard_1293918",
    };
    if (mobility[nameKey]) return mobility[nameKey];
  }
  if (categoryKey === "acessorio" && nameKey === "mascara_filtrante") return "noun_respiratormask_6792995";
  if (categoryKey === "mobilidade" && /^icarus_(i|ii|iii)$/.test(nameKey)) return "icarus";
  if (categoryKey === "mobilidade" && normalizeIconKey(itemType ?? "") === "estrutura_dorsal") return "dorsal";
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
