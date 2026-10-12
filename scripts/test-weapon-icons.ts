import assert from "node:assert/strict";
import { WEAPON_ICON_TYPES, weaponIconForName } from "../src/app/_design/weaponIconMapping";
import { WEAPON_ICON_DATA } from "../src/app/_design/weaponIconData";
import { filledCategoryIcon, filledWeaponIconForName } from "../src/app/_design/filledIconMapping";
import { FILLED_ICON_DATA } from "../src/app/_design/filledIconData";
import { ammunitionType } from "../src/lib/character/ammunitionType";

for (const icon of Object.values(WEAPON_ICON_TYPES)) {
  assert.ok(WEAPON_ICON_DATA[icon], `SVG ausente: ${icon}`);
}
assert.equal(weaponIconForName("SW-9 Ghostline (Pistola pesada)"), "pistol");
assert.equal(weaponIconForName("FL-2 Edgelord (Espada longa)"), "great sword");
assert.equal(weaponIconForName("KO-40 Sledge (Manoplas)"), "gauntlet");
assert.equal(weaponIconForName("SK-24 Blue Hawk (Arco composto)"), "bow");
assert.equal(weaponIconForName("AS-127 Wrecker (Rifle antimaterial)"), "sniper");
assert.equal(weaponIconForName("Rifle de assalto"), "assult rifle");
assert.equal(weaponIconForName("Rifle de feixe concentrado"), "blaster");
assert.equal(weaponIconForName("  SOCÓ-INGLÊS  "), "knuckles");
assert.equal(weaponIconForName("Bastão"), "bat");
assert.equal(weaponIconForName("Corrente leve"), "chains");
assert.equal(weaponIconForName("Alabarda"), "spear");
for (const name of ["Dardos", "Minha arma renomeada"]) {
  assert.equal(weaponIconForName(name), null, `Não forçar um desenho incompatível para ${name}`);
}
console.log("✓ Ícones de armas: modelos especiais, tipos de energia e fallback genérico");

for (const [name, expected] of [
  ["Faca", "dagger"], ["Facas de arremesso", "throwing knife"],
  ["Machado de mão", "axe"], ["Machado de guerra", "battleaxe"],
  ["Alabarda", "halberd"], ["Lança", "lance"],
  ["Modelo especial (Revólver)", "revolver"], ["FL-2 Edgelord (Espada longa)", "longsword"],
  ["Pistola de bolso", "pocket gun"], ["Modelo especial (Pistola de bolso)", "pocket gun"],
  ["RV-4 Shiv (Faca)", "throwing knife"], ["Shiv", "throwing knife"],
] as const) {
  assert.equal(filledWeaponIconForName(name), expected);
  assert.ok(FILLED_ICON_DATA[expected].paths.length);
}
for (const [name, expected] of [
  ["Pistola pesada", "pistol"], ["Pistola automática", "pistol"],
  ["Submetralhadora", "smg"], ["Carabina", "rifle"], ["Rifle de assalto", "assault rifle"],
  ["AS-127 Wrecker (Rifle antimaterial)", "sniper 2"], ["Rifle de precisão", "sniper 1"],
  ["Pistola de feixe", "noun_Blaster_4232599"], ["Pistola voltaica", "noun_Blaster_4232589"],
  ["Crioagulha", "noun_Blaster_4232591"], ["Ofuscador", "noun_Blaster_4232597"],
  ["Fundidora", "noun_Blaster_4232590"], ["Carabina de feixe", "pistol"],
  ["Repetidora térmica", "noun_Blaster_4232588"], ["Fuzil voltaico", "noun_Blaster_4232594"],
  ["Disruptor", "noun_LaserGun_4232600"], ["Ressonador", "noun_LaserGun_4232596"],
  ["Incinerador", "noun_Blaster_4232601"],
] as const) {
  assert.equal(filledWeaponIconForName(name), expected);
  assert.ok(FILLED_ICON_DATA[expected].paths.length);
}
assert.equal(filledWeaponIconForName("Canhão de plasma"), null);
assert.equal(filledWeaponIconForName("Escopeta pesada"), null);
assert.equal(filledCategoryIcon("estrutura_dorsal"), "dorsal");
assert.equal(filledCategoryIcon("mochila_equipada"), "backpack");
for (const model of ["I", "II", "III"]) {
  assert.equal(filledCategoryIcon("ferramenta", `Mochila MK-${model}`), "backpack");
}
assert.equal(filledCategoryIcon("ferramenta", "Kit de ferramentas"), null);
assert.equal(filledCategoryIcon("municao", "Flecha simples"), "arrows");
assert.equal(filledCategoryIcon("municao", "Munição 9 mm"), "bullets");
assert.equal(filledCategoryIcon("acessorio", "Aljava"), "quiver");
assert.equal(filledCategoryIcon("farmacia", "Poção de cura"), "potion");
assert.equal(filledCategoryIcon("farmacia", "Antibiótico"), "noun_drugs_7809670");
assert.equal(filledCategoryIcon("Farmácia"), "noun_drugs_7809670");
assert.deepEqual(FILLED_ICON_DATA.noun_drugs_7809670.viewBox, [0, 0, 100, 100]);
assert.equal(filledCategoryIcon("vertina"), "potion");
assert.equal(filledCategoryIcon("Vertinas"), "potion");
assert.equal(filledCategoryIcon("veneno", "Veneno"), null);
for (const [nome, subtipo] of [["Flecha simples", "Tipo"], ["Virotes", "Tipo"], ["Arpão", "Flecha"], ["Elétrica", "Flecha"], ["Explosiva", "Flecha"], ["Fixação", "Flecha"], ["Flamejante", "Flecha"], ["Tóxica", "Flecha"]]) {
  const tipo = ammunitionType({ nome, subtipo });
  assert.ok(tipo === "Flecha" || tipo === "Virote", nome);
  assert.equal(filledCategoryIcon("municao", nome, tipo), "arrows", nome);
}
assert.equal(filledCategoryIcon("Flechas e virotes"), "arrows");
assert.equal(filledCategoryIcon("municao", "Alta densidade", "Célula"), "energy cell");
assert.equal(filledCategoryIcon("Células de energia"), "energy cell");
assert.equal(filledCategoryIcon("ferramenta", "Bateria rúnica"), "runic battery");
assert.equal(filledCategoryIcon("ferramenta", "Cartucheira"), "cartucheira");
for (const [name, expected] of [["SORYN M2", "bike"], ["SORYN VANTA", "bike"], ["NYXEN LARK", "flying bike"], ["NYXEN RAZE", "flying bike"], ["VELYS IRIS", "flying bike"], ["AERA C2", "flying car"], ["VELYS ATRIUM", "flying car"], ["AERA L8", "flying car"], ["VEYRA N4", "car"]] as const) {
  assert.equal(filledCategoryIcon("veiculo", name), expected);
  assert.ok(FILLED_ICON_DATA[expected].paths.length);
}
for (const name of ["Icarus I", "Icarus II", "Icarus III"]) assert.equal(filledCategoryIcon("mobilidade", name), "icarus");
assert.equal(filledCategoryIcon("mobilidade", "Bicicleta"), "noun_Bike_8339085");
assert.equal(filledCategoryIcon("Mobilidade"), "noun_Bike_8339085");
assert.equal(filledCategoryIcon("Equipamentos de mobilidade"), "noun_Bike_8339085");
assert.equal(filledCategoryIcon("estrutura_dorsal"), "dorsal");
assert.equal(ammunitionType({nome:"Pistola",subtipo:"Munição"}), "Munição");
assert.equal(filledCategoryIcon("municao", "Pistola", "Bala"), "bullets");
console.log("✓ Ícones filled: tipos distintos, munições e estrutura dorsal independente");

assert.equal(filledCategoryIcon("mobilidade", "Aérovoile", "Estrutura dorsal"), "noun_HangGlider_8112644");
assert.equal(filledCategoryIcon("mobilidade", "Cabestan I", "Estrutura dorsal"), "dorsal");
assert.equal(filledCategoryIcon("mobilidade", "Icarus III", "Estrutura dorsal"), "icarus");
for (const [name, icon] of [["Patinete Elétrico", "noun_ElectricScooter_8291684"], ["Hoverboard", "noun_Hoverboard_7742758"], ["Rollsyns", "noun_RollerSkate_5192593"], ["Skate", "noun_Skateboard_1293918"]] as const) {
  assert.equal(filledCategoryIcon("mobilidade", name), icon);
  assert.ok(FILLED_ICON_DATA[icon].paths.length);
}
assert.equal(filledCategoryIcon("drone", "Mosca"), "noun_Drone_8335890");
assert.equal(filledCategoryIcon("robô", "Ceifador"), "noun_Robot_8483832");
assert.equal(filledCategoryIcon("acessorio", "Máscara Filtrante"), "noun_respiratormask_6792995");
assert.ok(FILLED_ICON_DATA.noun_respiratormask_6792995.paths.every(p => p.fillRule === "evenodd"));
assert.ok(FILLED_ICON_DATA.noun_Skateboard_1293918.paths.every(p => p.transform === "translate(0,-952.36218)"));
for (const [type, icon] of [["Óptica", "noun_bioniccontact_6410565"], ["opticos", "noun_bioniccontact_6410565"], ["de braco", "noun_bionicrobotarm_7001919"], ["Perna", "noun_bionicleg_7356680"], ["auditivos", "noun_earlistening_5252153"]] as const) {
  assert.equal(filledCategoryIcon("escalpo", "Modelo", type), icon);
  assert.ok(FILLED_ICON_DATA[icon].paths.length);
}
assert.equal(filledCategoryIcon("farmacia", "Medkit"), "noun_medkit_5794368");
assert.equal(filledCategoryIcon("farmacia", "Kit de estabilização (PV)"), "noun_medkit_5794368");
assert.equal(filledCategoryIcon("farmacia", "Ansiolítico"), "noun_drugs_7809670");
assert.equal(filledCategoryIcon("ferramenta", "Lanterna rúnica"), "noun_Flashlight_8418741");
assert.equal(filledCategoryIcon("ferramenta", "Papel rúnico"), "noun_Paper_8227159");

assert.equal(filledCategoryIcon("dispositivo", "Chip de dados"), "noun_flashdrive_4483089");
assert.equal(filledCategoryIcon("ferramenta", "Kit de contenção"), "noun_Handcuffs_699304");
assert.equal(filledCategoryIcon("acessorio", "Óculos de Realidade Aumentada"), "noun_vr_2226896");
assert.equal(filledCategoryIcon("escalpo", "Biomonitor", "Interno"), "noun_Heart_5999211");
assert.equal(filledCategoryIcon("escalpo", "Neuroprocessador", "neurais"), "noun_neural_4128305");
assert.equal(filledCategoryIcon("escalpo", "RPI Forjado (Nível 1)", "Identidade"), "noun_id_7920951");
assert.equal(filledCategoryIcon("escalpo", "Modelo", "Moda"), "noun_beauty_3677917");
assert.equal(filledCategoryIcon("escalpo", "Pele Polimórfica", "de moda"), "noun_beauty_3677917");
assert.equal(filledCategoryIcon("escalpo", "Pele Polimórfica", "ESCALPOS DE MODA"), "noun_beauty_3677917");
assert.equal(filledCategoryIcon("Escalpos", undefined, "De moda"), "noun_beauty_3677917");
assert.equal(FILLED_ICON_DATA.noun_hacker_5879592.paths[0].fillRule, "evenodd");
assert.equal(filledCategoryIcon("dispositivo", "Scanner de sensores"), "noun_Scanner_7959164");
assert.equal(filledCategoryIcon("escalpo", "Armadura Reativa Subdérmica (ARS)", "Interno"), "noun_armadurasubdermica_7991712");
assert.equal(filledCategoryIcon("escalpo", "Beijo da Morte", "internos"), "noun_kiss_6493561");
assert.equal(filledCategoryIcon("escalpo", "Catalisador Imunológico", "internos"), "noun_immunity_3883965");
assert.equal(filledCategoryIcon("escalpo", "Reserva de Mana", "internos"), "noun_mana_8219198");
assert.equal(filledCategoryIcon("escalpo", "Filtro Hematológico", "internos"), "noun_elixir_8401397");
assert.equal(filledCategoryIcon("escalpo", "Reserva Pulmonar", "internos"), "noun_Lung_4303915");
assert.equal(filledCategoryIcon("mobilidade", "Magboots"), "noun_Boot_2249240");
