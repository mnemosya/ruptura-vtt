import type { TechnicalContentItem } from "../content/technicalLibrary";
import { normalizeItemContent, type ItemContent } from "./inventory";

/** A compra guarda o escalpo na mochila; não registra instalação ou efeitos. */
export function catalogWithMarketEscalpos(items: ItemContent[], escalpos: TechnicalContentItem[]): Map<string, ItemContent> {
  const catalog = new Map(items.map(item => [item.slug, item]));
  for (const escalpo of escalpos) {
    if (escalpo.status !== "published" || !escalpo.slug || escalpo.preco === null || !Number.isFinite(escalpo.preco) || escalpo.preco <= 0) continue;
    const notion = escalpo.raw.dados_notion as { secao?: string[] } | undefined;
    const labels: Record<string, string> = {
      "ESCALPOS AUDITIVOS": "Audição", "ESCALPOS DE BRAÇO": "Braço", "ESCALPOS DE PERNA": "Perna",
      "ESCALPOS INTERNOS": "Interno", "ESCALPOS ÓPTICOS": "Óptica", "ESCALPOS NEURAIS": "Neural",
      "ESCALPOS DE MODA": "Moda", "REGISTRO PESSOAL IMPERIAL (RPI)": "Identidade",
    };
    const sub = escalpo.categoriaLabel ?? escalpo.categoria ?? notion?.secao?.map(s => labels[s]).find(Boolean);
    catalog.set(escalpo.slug, normalizeItemContent({
      ...escalpo.raw,
      id: escalpo.id,
      slug: escalpo.slug,
      nome: escalpo.nome,
      categoria: "escalpo",
      categoria_label: "Escalpo",
      subtipo: sub,
      preco: escalpo.preco,
      raridade: escalpo.raridade,
      descricao_curta: escalpo.descricaoCurta,
      descricao_longa: escalpo.descricaoLonga,
      tags: escalpo.tags,
    }));
  }
  return catalog;
}

/** Vínculos de apresentação; não alteram regras de instalação. */
export function marketEscalpoParents(item: ItemContent, catalog: Map<string, ItemContent>): string[] {
  if (item.nome.toLocaleLowerCase("pt-BR") === "cdi craqueada") return [];
  if (!["modulo_escalpo", "veneno"].includes(item.categoria)) return [];
  // As doses da seção Escalpos acompanham a tabela de Beijo da Morte.
  const slugs = item.marketEscalpoSlugs?.length ? item.marketEscalpoSlugs
    : item.categoria === "veneno" && item.slug.startsWith("escalpos_") ? ["escalpos_beijo_da_morte"] : [];
  return [...new Set(slugs.flatMap(slug => {
    if (typeof slug !== "string") return [];
    const model = catalog.get(slug) ?? catalog.get(slug.replace(/^escalpos_/, ""));
    return model?.categoria === "escalpo" ? [model.slug] : [];
  }))];
}
