import type { Character } from './types';
import type { InventoryItemInstance, ItemContent } from './inventory';
import { progression, readClassPlay, reached, applyClassCommand } from './classManagement';
export const WORKSHOP_OPTIONS = [
 {id:'balanceamento',name:'Balanceamento',effect:'Adiciona uma propriedade à arma.'},
 {id:'blindagem',name:'Blindagem Adicional',effect:'+3 MIT máxima e atual.'},
 {id:'calibracao',name:'Calibração',effect:'+2 nos testes de uma função técnica; não inclui ataques ou defesas.'},
 {id:'potencializacao',name:'Potencialização',effect:'+1d4 de dano.'},
 {id:'reforco',name:'Reforço Estrutural',effect:'+5 PD máximos e atuais.'},
 {id:'sobregravacao',name:'Sobregravação',effect:'+1 espaço de runa.'},
] as const;
export type WorkshopCommand={itemId:string;modification:string|null;configuration?:string};
export function workshopCompatible(item:InventoryItemInstance,mod:string,model?:ItemContent){
 if(['balanceamento','potencializacao'].includes(mod))return item.categoria==='arma';
 if(mod==='blindagem')return item.categoria==='armadura';
 if(mod==='reforco')return (model?.pdMax??item.pdAtual??0)>0;
 if(mod==='sobregravacao')return (model?.slotsRunaMax??0)>0;
 return mod==='calibracao' && /ferramenta|dispositivo|escalpo|equipamento/.test(item.categoria);
}
export function applyWorkshop(c:Character,cmd:WorkshopCommand,authorId:string,model?:ItemContent):{character:Character;error?:string}{
 const fail=(error:string)=>({character:c,error});const p=progression(c);
 if(p?.subclasse_id!=='artifice'||!reached(p.ranking,'E'))return fail('Oficina exige Artífice de ranking E.');
 const item=c.inventario?.find(i=>i.id===cmd.itemId);if(!item)return fail('Equipamento não encontrado.');
 if(item.quantidade!==1)return fail('Separe uma unidade da pilha antes de modificá-la.');
 const existing=item.propriedadesTecnicas?.find(m=>m.workshopAuthor===authorId);
 const option=WORKSHOP_OPTIONS.find(o=>o.id===cmd.modification);
 if(cmd.modification && (!option||!workshopCompatible(item,cmd.modification,model)))return fail('Modificação incompatível.');
 if(cmd.modification==='balanceamento'&&!['Alcance','Arremesso (6 m/12 m)','Silencioso'].includes(cmd.configuration??''))return fail('Escolha a propriedade da arma.');
 if(cmd.modification==='calibracao'&&!cmd.configuration?.trim())return fail('Defina a função técnica beneficiada.');
 const state=readClassPlay(c);let ledger:string[]=[];try{const raw=JSON.parse(state.selections.workshopItems??'[]');if(Array.isArray(raw))ledger=raw.filter((id):id is string=>typeof id==='string')}catch{}
 const limit=reached(p.ranking,'A')?4:reached(p.ranking,'C')?3:2;
 if(option&&!ledger.includes(item.id)&&ledger.length>=limit)return fail(`Limite de ${limit} Modificações instalado. Recolha um item modificado para remover sua Modificação.`);
 let next={...item,propriedadesTecnicas:(item.propriedadesTecnicas??[]).filter(m=>m!==existing)};
 if(existing?.key==='blindagem')next.mitAtual=Math.max(0,(next.mitAtual??0)-3);
 if(existing?.key==='reforco')next.pdAtual=Math.max(0,(next.pdAtual??0)-5);
 if(option){
 next.propriedadesTecnicas.push({id:existing?.id??crypto.randomUUID(),sourceType:'manual',sourceContentId:'artifice-modificacoes',sourceInstanceId:authorId,sourceLabel:`Oficina de ${c.nome}`,workshopAuthor:authorId,key:option.id,label:option.name,value:cmd.configuration??'',description:`${option.effect}${cmd.configuration?` ${cmd.configuration}.`:''}`,mechanicalEffectAutomated:['blindagem','reforco','sobregravacao'].includes(option.id),createdAt:existing?.createdAt??new Date().toISOString()});
 if(option.id==='blindagem')next.mitAtual=(next.mitAtual??model?.mitMax??0)+3;
 if(option.id==='reforco')next.pdAtual=(next.pdAtual??model?.pdMax??0)+5;
 ledger=Array.from(new Set([...ledger,item.id]));
 }else ledger=ledger.filter(id=>id!==item.id);
 const changed={...c,inventario:c.inventario?.map(i=>i.id===item.id?next:i)};
 return {character:applyClassCommand(changed,{type:'select',key:'workshopItems',value:JSON.stringify(ledger)},0).character};
}
