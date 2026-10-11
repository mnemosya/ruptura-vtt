import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMarketTechnicalFields } from "../src/lib/character/marketTechnicalFields";
import { normalizeItemContent } from "../src/lib/character/inventory";
import { itemCabeNoSlot } from "../src/app/ficha/_console/slots";
const source=JSON.parse(readFileSync("content/v12/db_mercado_itens_v1_2.json","utf8")).itens;
const traje=source.find((i:any)=>i.nome==="Traje urbano híbrido");
const model=normalizeItemContent(traje);
assert.deepEqual(model.regioes,["tronco"]);assert.equal(model.mitMax,2);assert.equal(model.tipoProtecao,"hibrida");
assert(itemCabeNoSlot(model,"tronco"));assert(!itemCabeNoSlot(model,"cabeca"));
assert.deepEqual(traje.estatisticas.regioes,undefined,"Não mutar fonte");
const protectedInput={...traje,estatisticas:{...traje.estatisticas,mit_base:7,regioes:["cabeca"]}};
const preserved=normalizeMarketTechnicalFields(protectedInput);
assert.equal((preserved.raw.estatisticas as any).mit_base,7);assert.equal(preserved.warnings.length,2);
assert.deepEqual(normalizeItemContent({categoria:"armadura",estatisticas:{campos_tabela:{"Região":"tronco ou cabeça",MIT:"variável"}}}).regioes,[]);
for(const item of source.filter((i:any)=>i.categoria==="armadura")){
 const normalized=normalizeItemContent(item);
 if(item.nome==="Exotraje pesado") {
  assert.deepEqual(normalized.regioes,[],"Não escolher entre regiões conflitantes");
  assert(normalizeMarketTechnicalFields(item).warnings.some(w=>w.includes("diverge")));
 } else assert(normalized.regioes.length>0,item.nome);
 assert(normalized.mitMax!==null,item.nome);
}
for(const item of source.filter((i:any)=>i.categoria==="escudo"))assert(normalizeItemContent(item).pdMax!==null,item.nome);
assert.equal(normalizeItemContent({categoria:"arma",estatisticas:{campos_tabela:{"Munição":"8"}}}).municaoMax,null,"Não inferir modo de recarga sem vínculo");
assert.equal(normalizeItemContent({categoria:"arma",estatisticas:{campos_tabela:{Dano:"Corpo + 1d6 cortante/perfurante"}}}).danoBase,"1d6");
assert.equal(normalizeItemContent({categoria:"arma",estatisticas:{campos_tabela:{Dano:"2d8 ígneo"}}}).tipoDano,"energetico");
assert.equal(normalizeItemContent({categoria:"arma",estatisticas:{campos_tabela:{Dano:"Corpo + 1d6 cortante ou perfurante"}}}).subtiposDanoPossiveis.length,2);
console.log("✓ Tradução de tabelas: regiões, MIT, PD, dano; fonte intacta, conflitos preservados e dados ambíguos bloqueados");
