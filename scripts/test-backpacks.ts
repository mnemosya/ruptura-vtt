import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeItemContent, setItemEmEncaixe, setItemLoadoutState, purchaseItem } from "../src/lib/character/inventory";
import { createInitialCharacter } from "../src/lib/character/createCharacter";
import { capacidadeDeEspacos, resumoDeCarga, espacosDoItem } from "../src/lib/character/carga";
import { normalizeCharacter } from "../src/lib/character/normalizeCharacter";
import { projectBodySlots } from "../src/app/ficha/_console/slots";
import { equipmentPositions } from "../src/lib/character/equipmentPositions";
const raw = JSON.parse(readFileSync("content/v12/sincronizacao-mochilas-2026-10-11.json","utf8"));
const items = raw.map(normalizeItemContent);
const catalog = new Map(items.map((i:any) => [i.slug,i])) as Map<string, ReturnType<typeof normalizeItemContent>>;
const [mk1,mk2,mk3] = ["i","ii","iii"].map(n=>catalog.get(`ferramentas_mochila_mk_${n}`)!);
let c = createInitialCharacter(null);
assert.equal(c.inventario?.length,1);
assert.equal(c.inventario![0].precoPago,0);
assert.equal(capacidadeDeEspacos(c,catalog),10);
assert.equal(projectBodySlots(c.inventario!,catalog).slots.length,15);
assert.equal(resumoDeCarga(c,catalog).ocupados,0);
for(const [i,cap,rarity,price] of [[mk1,10,"comum",200],[mk2,15,"incomum",600],[mk3,20,"raro",1500]] as const) {
 assert.equal(i.capacidadeMochila,cap);assert.equal(i.raridade,rarity);assert.equal(i.preco,price);assert.equal(espacosDoItem(i),2);
 assert.deepEqual(equipmentPositions(i),["mochila_equipada"]);
}
c.carteira={aretz_informal:5000,cdi:0,cdi_craqueada:0};
const buy=purchaseItem({character:c,item:mk2,quantidade:2,walletId:"aretz_informal",nowIso:"2026-10-11"});
assert(buy.ok);c=buy.character;
assert.equal(c.inventario!.filter(i=>i.itemSlug===mk2.slug).length,2);
assert(c.inventario!.every(i=>i.quantidade===1));
assert.equal(resumoDeCarga(c,catalog).ocupados,4);
c=setItemEmEncaixe(c,buy.instance!.id,"mochila_equipada",catalog);
assert.equal(capacidadeDeEspacos(c,catalog),15);
assert.equal(c.inventario!.filter(i=>i.estado==="equipado").length,1);
assert.equal(resumoDeCarga(c,catalog).ocupados,4);
assert.strictEqual(setItemLoadoutState(c,buy.instance!.id,"mochila",catalog),c,"Mochila cheia não pode ser guardada dentro da própria mochila");
const loaded={...c,inventario:[...c.inventario!,{id:"load",itemSlug:"unknown",itemNome:"Carga legada",categoria:"ferramenta",quantidade:10,estado:"mochila" as const,adquiridoEm:"2026-10-11"}]};
// Falta de espaço não barra: trocar para a MK-I passa e o excesso só fica contabilizado.
const trocada=setItemEmEncaixe(loaded,c.inventario![0].id,"mochila_equipada",catalog);
assert.notStrictEqual(trocada,loaded,"Troca por MK-I não é barrada pela capacidade");
assert.equal(capacidadeDeEspacos(trocada,catalog),10);
assert(resumoDeCarga(trocada,catalog).excedido,"O excesso continua contabilizado");
// A troca de armas guarda a anterior mesmo quando aumenta uma sobrecarga.
const rifle = {...mk1,slug:"test-rifle",nome:"Rifle",categoria:"arma" as const,maos:2 as const,espacosTexto:"3",capacidadeMochila:null};
const pistol = {...rifle,slug:"test-pistol",nome:"Pistola",maos:1 as const,espacosTexto:"1"};
const weapons = new Map([...catalog,[rifle.slug,rifle] as const,[pistol.slug,pistol] as const]);
for (const hand of ["arma_primaria","arma_secundaria"] as const) {
 const before={...loaded,inventario:[...loaded.inventario!,{id:"rifle",itemSlug:rifle.slug,itemNome:rifle.nome,categoria:"arma",quantidade:1,estado:"empunhado" as const,encaixeEscolhido:"arma_primaria" as const,adquiridoEm:"2026-10-11"},{id:"pistol",itemSlug:pistol.slug,itemNome:pistol.nome,categoria:"arma",quantidade:1,estado:"mochila" as const,adquiridoEm:"2026-10-11"}]};
 const after=setItemEmEncaixe(before,"pistol",hand,weapons);
 assert.equal(after.inventario!.length,before.inventario.length);
 assert.equal(after.inventario!.find(i=>i.id==="rifle")!.estado,"mochila");
 assert.equal(after.inventario!.find(i=>i.id==="rifle")!.encaixeEscolhido,undefined);
 const slots=projectBodySlots(after.inventario!,weapons).slots;
 assert.equal(slots.find(s=>s.id===hand)!.instance?.id,"pistol");
 assert.equal(slots.find(s=>s.id===(hand==="arma_primaria"?"arma_secundaria":"arma_primaria"))!.instance,null);
 assert.equal(resumoDeCarga(after,weapons).ocupados,resumoDeCarga(before,weapons).ocupados+2);
}
const gloves=catalog.get("mobilidade_luvas_de_escalada")!;
assert.equal(gloves.categoria,"ferramenta");assert.equal(gloves.preco,120);assert.equal(espacosDoItem(gloves),1);assert.deepEqual(equipmentPositions(gloves),[]);
const legacy={...c,inventario:[{id:"glove-original",itemSlug:gloves.slug,itemNome:gloves.nome,categoria:"mobilidade",quantidade:1,estado:"equipado",encaixeEscolhido:"luvas",adquiridoEm:"2026-10-11",notas:"Preservar"}]};
const normalized=normalizeCharacter(legacy);
assert.equal(normalized.inventario![0].id,"glove-original");assert.equal(normalized.inventario![0].estado,"mochila");assert.equal(normalized.inventario![0].categoria,"ferramenta");assert.equal(normalized.inventario![0].encaixeEscolhido,undefined);
console.log("✓ 15 slots, mochilas 10/15/20, criação gratuita, exclusividade, custos, troca com sobrecarga e migração sem perda");
