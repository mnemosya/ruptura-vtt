import type { ItemContent } from "./inventory";

/** Aplica ao termo genérico o número declarado pela arma. */
export function itemPropertyPresentation(
  property: { slug: string; nome: string; descricao: string | null },
  item?: ItemContent,
): { nome: string; descricao: string | null } {
  if (property.slug !== "rajada" || !item?.rajadaX) return { nome: property.nome, descricao: property.descricao };
  return {
    nome: `Rajada (${item.rajadaX})`,
    descricao: property.descricao?.replace(/\bX\b/g, String(item.rajadaX)) ?? null,
  };
}
