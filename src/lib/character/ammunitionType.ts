/** Tipo visual da munição, compartilhado por mercado, inventário e equipamentos. */
export function ammunitionType(item: { subtipo?: string | null; ammoFamilia?: string | null; nome: string }): "Flecha" | "Virote" | "Munição" | "Célula" | null {
  const normalize = (s: string) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const subtype = normalize(item.subtipo ?? "");
  const types = { flecha: "Flecha", virote: "Virote", municao: "Munição", celula: "Célula" } as const;
  const explicit = types[subtype as keyof typeof types];
  if (explicit) return explicit;
  const family = normalize(item.ammoFamilia ?? "");
  if (/(^|[^a-z])flechas?([^a-z]|$)/.test(family)) return "Flecha";
  if (/(^|[^a-z])virotes?([^a-z]|$)/.test(family)) return "Virote";
  // Os dois modelos básicos vieram do conteúdo com subtipo genérico "Tipo".
  const name = normalize(item.nome);
  if (name === "flecha simples") return "Flecha";
  if (name === "virotes") return "Virote";
  return null;
}
