import type { InventoryItemInstance, ItemContent } from "./inventory";

// Identidades preservadas após a revisão do Notion; apenas nomes antigos
// de catálogo são substituídos. Nomes personalizados continuam na instância.
const legacyNames: Record<string, string> = {
  armas_sw_80_parallax_rifle_de_precisao: "SW-80 Parallax",
  armas_dl_66_widowmaker_metralhadora: "DL-66 Widowmaker",
};

export function itemDisplayName(instance: Pick<InventoryItemInstance, "itemSlug" | "itemNome">, model?: Pick<ItemContent, "nome">): string {
  const legacy = legacyNames[instance.itemSlug];
  const baseName = instance.itemNome.replace(/\s*\([^()]+\)\s*$/, "").trim();
  return model && legacy && baseName.toLocaleLowerCase("pt-BR") === legacy.toLocaleLowerCase("pt-BR")
    ? model.nome
    : instance.itemNome;
}
