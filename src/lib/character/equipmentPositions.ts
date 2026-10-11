import type { InventoryItemInstance, ItemContent, EncaixeEscolhido } from "./inventory";

/** Posições canônicas do Inventário. Mãos é sempre lido da ficha da arma. */
export function equipmentPositions(item: ItemContent, chosen?: EncaixeEscolhido): string[] {
  if (item.categoria === "arma") return item.maos === 2 ? ["arma_primaria", "arma_secundaria"] : [chosen === "arma_secundaria" ? chosen : "arma_primaria"];
  if (item.categoria === "escudo") return ["arma_secundaria"];
  if (item.categoria === "armadura") return item.regioes.map(r => "armadura_" + r);
  if (item.categoria === "traje") return ["traje"];
  if (item.suporteMunicao) return ["suporte_municao"];
  if (item.categoria === "acessorio") return [chosen === "acessorio_2" ? chosen : "acessorio_1"];
  if (item.categoria === "mobilidade" || item.categoria === "veiculo") {
    if (item.posicaoMobilidade) return [item.posicaoMobilidade];
    const type = (item.subtipo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/dorsa[li]/.test(type)) return ["estrutura_dorsal"];
    if (/luvas/.test(type)) return ["luvas"];
    if (/locomocao/.test(type) || item.categoria === "veiculo") return ["locomocao"];
  }
  return chosen ? [chosen] : [];
}
export function occupiedEquipmentPositions(instance: InventoryItemInstance, item?: ItemContent): string[] {
  if (!item) return [];
  if (instance.estado === "acesso_rapido") return [instance.encaixeEscolhido ?? "acesso_rapido_1"];
  if (!["equipado", "empunhado"].includes(instance.estado) && !instance.equipadoDefensivo) return [];
  return equipmentPositions(item, instance.encaixeEscolhido);
}
