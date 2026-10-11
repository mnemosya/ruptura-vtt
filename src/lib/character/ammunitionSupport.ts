import type { Character } from "./types";
import type { InventoryItemInstance, ItemContent } from "./inventory";
import type { AmmoItemProfile, ReloadResult } from "./ammunition";

export function ammoCapacityWeight(family: string | null): number {
  return family === "virotes" || family === "mun_escopeta" || family === "mun_precisao" ? 2 : 1;
}
export function supportAccepts(support: NonNullable<InventoryItemInstance["aljava"]>, family: string | null): boolean {
  if (!family || family.startsWith("celula_energia")) return false;
  return support.tipo === "cartucheira" ? /^mun_/.test(family) : /^flecha/.test(family) || (!support.autoalimentadora && family === "virotes");
}
/** Transfere estoque para o suporte escolhido, sem criar projéteis nem exceder sua capacidade. */
export function loadAmmoSupport(character: Character, id: string, profiles: AmmoItemProfile[]): ReloadResult {
  const target = character.inventario?.find(i => i.id === id);
  if (!target?.aljava) return { character, carregada: 0, motivoFalha: "modo_nao_suportado" };
  let support = { ...target.aljava, stacks: target.aljava.stacks.map(s => ({...s})) };
  let inventory = (character.inventario ?? []).map(i => ({...i}));
  let moved = 0;
  for (const instance of inventory) {
    if (instance.id === id || !["mochila", "acesso_rapido"].includes(instance.estado)) continue;
    const profile = profiles.find(p => p.slug === instance.itemSlug);
    if (!profile || !supportAccepts(support, profile.familia)) continue;
    const weight = ammoCapacityWeight(profile.familia);
    const occupied = support.stacks.reduce((n,s) => n + s.quantidade * (s.pesoCapacidade ?? 1),0);
    const amount = Math.min(instance.quantidade, Math.floor((support.capacidade - occupied) / weight));
    if (amount <= 0) continue;
    const stack = support.stacks.find(s => s.contentSlug === instance.itemSlug);
    if (stack) { stack.quantidade += amount; stack.pesoCapacidade = weight; }
    else support.stacks.push({contentSlug: instance.itemSlug, nome: profile.nome, quantidade: amount, pesoCapacidade: weight});
    instance.quantidade -= amount; moved += amount;
  }
  if (!moved) return {character,carregada:0,motivoFalha:"sem_estoque"};
  inventory = inventory.filter(i => i.quantidade > 0).map(i => i.id === id ? {...i,aljava:support} : i);
  return {character:{...character,inventario:inventory},carregada:moved,motivoFalha:null};
}

/** Uma recarga escolhe fontes acessíveis primeiro; Abrigo nunca é estoque de combate. */
export function reloadFromInventory(character: Character, weaponId: string, weapon: Pick<ItemContent,"slug" | "subtipo" | "usesAmmunition"> & {municaoMax?: number|null;municaoCompativelSlug?:string|null}, profiles: AmmoItemProfile[]): ReloadResult {
  const inventory = (character.inventario ?? []).map(i => ({...i,aljava:i.aljava ? {...i.aljava,stacks:i.aljava.stacks.map(s=>({...s}))} : undefined}));
  const instance = inventory.find(i => i.id === weaponId);
  if (!instance || !weapon.municaoMax) return {character,carregada:0,motivoFalha:"modo_nao_suportado"};
  const old = instance.municaoAtual ?? 0;
  if (old >= weapon.municaoMax) return {character,carregada:0,motivoFalha:"ja_cheio"};
  const family = weapon.municaoCompativelSlug;
  const compatible = (slug:string) => profiles.some(p => p.slug === slug && ((family?.startsWith("celula_energia") ? p.armasCompativeis.includes(weapon.slug) : p.familia === family || p.armasCompativeis.includes(weapon.slug))));
  if (family?.startsWith("celula_energia")) {
    const cell = inventory.filter(i => ["mochila","acesso_rapido"].includes(i.estado) && compatible(i.itemSlug) && (i.cargasAtual ?? weapon.municaoMax!) > 0).sort((a,b)=>Number(a.estado==="mochila")-Number(b.estado==="mochila"))[0];
    if (!cell) return {character,carregada:0,motivoFalha:"sem_estoque"};
    const charge = cell.cargasAtual ?? weapon.municaoMax;
    const cost = cell.estado === "acesso_rapido" ? 1 : 2;
    cell.quantidade -= 1;
    inventory.push({...cell,id:crypto.randomUUID(),quantidade:1,cargasAtual:old});
    instance.municaoAtual=charge;
    return {character:{...character,inventario:inventory.filter(i=>i.quantidade>0)},carregada:charge,motivoFalha:null,custoPa:cost};
  }
  let remaining = weapon.municaoMax - old;
  let cost: 1 | 2 = 1;
  for (const support of inventory.filter(i => i.estado === "equipado" && i.aljava)) {
    for (const stack of support.aljava!.stacks) {
      if (!compatible(stack.contentSlug)) continue;
      const amount = Math.min(remaining, stack.quantidade);
      if (amount > 0) instance.municaoCarregadaSlug=stack.contentSlug;
      remaining -= amount; stack.quantidade -= amount;
    }
    support.aljava!.stacks = support.aljava!.stacks.filter(s => s.quantidade > 0);
  }
  for (const ammo of inventory.filter(i => i.id !== weaponId && ["acesso_rapido","mochila"].includes(i.estado) && compatible(i.itemSlug)).sort((a,b)=>Number(a.estado==="mochila")-Number(b.estado==="mochila"))) {
    const amount = Math.min(remaining,ammo.quantidade);
    if (!amount) continue;
    if (ammo.estado === "mochila") cost = 2;
    instance.municaoCarregadaSlug=ammo.itemSlug;
    ammo.quantidade -= amount; remaining -= amount;
  }
  const loaded = weapon.municaoMax - old - remaining;
  if (!loaded) return {character,carregada:0,motivoFalha:"sem_estoque"};
  instance.municaoAtual = old + loaded;
  return {character:{...character,inventario:inventory.filter(i=>i.quantidade>0)},carregada:loaded,motivoFalha:null,custoPa:cost};
}
