import assert from "node:assert/strict";
import { WEAPON_ICON_TYPES, weaponIconForName } from "../src/app/_design/weaponIconMapping";
import { WEAPON_ICON_DATA } from "../src/app/_design/weaponIconData";
import { filledCategoryIcon, filledWeaponIconForName } from "../src/app/_design/filledIconMapping";
import { FILLED_ICON_DATA } from "../src/app/_design/filledIconData";

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
] as const) {
  assert.equal(filledWeaponIconForName(name), expected);
  assert.ok(FILLED_ICON_DATA[expected].paths.length);
}
assert.equal(filledWeaponIconForName("Pistola pesada"), null);
assert.equal(filledCategoryIcon("estrutura_dorsal"), null);
assert.equal(filledCategoryIcon("mochila_equipada"), "backpack");
for (const model of ["I", "II", "III"]) {
  assert.equal(filledCategoryIcon("ferramenta", `Mochila MK-${model}`), "backpack");
}
assert.equal(filledCategoryIcon("ferramenta", "Kit de ferramentas"), null);
assert.equal(filledCategoryIcon("municao", "Flecha simples"), "arrows");
assert.equal(filledCategoryIcon("municao", "Munição 9 mm"), "bullets");
assert.equal(filledCategoryIcon("acessorio", "Aljava"), "quiver");
assert.equal(filledCategoryIcon("farmacia", "Poção de cura"), "potion");
assert.equal(filledCategoryIcon("farmacia", "Antibiótico"), null);
assert.equal(filledCategoryIcon("veneno", "Veneno"), null);
console.log("✓ Ícones filled: tipos distintos, munições e estrutura dorsal independente");
