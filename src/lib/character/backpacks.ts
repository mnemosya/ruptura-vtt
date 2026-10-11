import type { ItemContent } from "./inventory";

export const MOCHILA_INICIAL_SLUG = "ferramentas_mochila_mk_i";
export function mochilaInicial(id: string, adquiridoEm: string) {
  return { id, itemSlug: MOCHILA_INICIAL_SLUG, itemNome: "Mochila MK-I", categoria: "ferramenta", quantidade: 1, estado: "equipado" as const, encaixeEscolhido: "mochila_equipada" as const, precoPago: 0, adquiridoEm };
}
export function ehMochilaMk(item?: Pick<ItemContent, "nome" | "capacidadeMochila">): boolean {
  return !!item && /^mochila mk-(?:i|ii|iii)$/i.test(item.nome.trim()) && [10,15,20].includes(item.capacidadeMochila ?? 0);
}
