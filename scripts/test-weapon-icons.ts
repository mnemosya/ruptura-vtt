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
assert.equal(filledCategoryIcon("mobilidade", "Bicicleta"), null);
assert.equal(filledCategoryIcon("estrutura_dorsal"), "dorsal");
assert.equal(ammunitionType({nome:"Pistola",subtipo:"Munição"}), "Munição");
assert.equal(filledCategoryIcon("municao", "Pistola", "Bala"), "bullets");
console.log("✓ Ícones filled: tipos distintos, munições e estrutura dorsal independente");

assert.equal(filledCategoryIcon("mobilidade", "Aérovoile", "Estrutura dorsal"), "dorsal");
assert.equal(filledCategoryIcon("mobilidade", "Cabestan I", "Estrutura dorsal"), "dorsal");
assert.equal(filledCategoryIcon("mobilidade", "Icarus III", "Estrutura dorsal"), "icarus");
