import assert from 'node:assert/strict';
import { createInitialCharacter } from '../src/lib/character';
import { applyWorkshop } from '../src/lib/character/workshop';
import { readClassPlay } from '../src/lib/character/classManagement';
import { removeQuantityFromInventory, setItemPdAtual, normalizeItemTechnicalState } from '../src/lib/character/inventory';
let c={...createInitialCharacter(null,'Artífice'),progressao:{classe_id:'tecnico',subclasse_id:'artifice',ranking:'E'},inventario:[{id:'shield',itemSlug:'shield',itemNome:'Escudo',categoria:'escudo',quantidade:1,estado:'mochila' as const,adquiridoEm:'2026-10-15',pdAtual:8}]};
const initial=structuredClone(c);
let result=applyWorkshop(c,{itemId:'shield',modification:'reforco'},'author');assert.equal(result.error,undefined);assert.equal(result.character.inventario![0].pdAtual,13);assert.deepEqual(c,initial);
result=applyWorkshop(result.character,{itemId:'shield',modification:'reforco'},'author');assert.equal(result.character.inventario![0].pdAtual,13,'Replacement cannot stack');
assert.equal(setItemPdAtual(result.character,'shield',13,8).inventario![0].pdAtual,13);
const removed=removeQuantityFromInventory(result.character,'shield',1,'2026-10-15');assert.equal(removed.ok,true);
if(removed.ok){assert.equal(removed.removedInstance.propriedadesTecnicas![0].workshopAuthor,'author');assert.deepEqual(JSON.parse(readClassPlay(removed.character).selections.workshopItems),['shield']);assert.equal(normalizeItemTechnicalState(removed.removedInstance).propriedadesTecnicas[0].workshopAuthor,'author');}
result=applyWorkshop(result.character,{itemId:'shield',modification:null},'author');assert.equal(result.character.inventario![0].pdAtual,8);assert.deepEqual(JSON.parse(readClassPlay(result.character).selections.workshopItems),[]);
assert.ok(applyWorkshop(c,{itemId:'shield',modification:'potencializacao'},'author').error);
console.log('Oficina: instância, compatibilidade, substituição, remoção, limites de PD e autoria após transferência OK.');
