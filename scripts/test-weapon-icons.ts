import assert from "node:assert/strict";
import { WEAPON_ICON_TYPES, weaponIconForName } from "../src/app/_design/weaponIconMapping";
import { WEAPON_ICON_DATA } from "../src/app/_design/weaponIconData";

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
