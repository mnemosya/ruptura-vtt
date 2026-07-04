/**
 * Biblioteca Técnica (checkpoint v0.53, PRD §0/2.1/4/8/11 — achado
 * "conteúdo pronto mas não exposto" da auditoria v0.50): normalização
 * genérica de Propriedades, Runas e Escalpos (`content_documents`,
 * `listProperties`/`listRunes`/`listEscalpos`, já existentes) para uma
 * aba de CONSULTA/LEITURA na ficha — nunca instância/equipamento.
 *
 * Os três catálogos compartilham o mesmo formato-base (id/slug/nome/
 * categoria/descrição/tags/payload_automacao), mas com campos
 * adicionais que variam por catálogo (preço e raridade em runas/
 * escalpos; requisitos em escalpos; `aplica_em`/gatilhos em
 * propriedades). Este módulo normaliza só o subconjunto COMUM de forma
 * defensiva (nenhum campo além de id/slug/nome é obrigatório) e
 * preserva o restante em `raw` para exibição best-effort — nunca
 * inventa um valor ausente, nunca vira catálogo manual hardcoded (o
 * conteúdo em si sempre vem do `raw` lido de `content_documents`).
 */

export interface TechnicalContentItem {
  id: string;
  slug: string;
  nome: string;
  categoria?: string;
  categoriaLabel?: string;
  raridade?: string;
  raridadeLabel?: string;
  descricaoCurta?: string;
  descricaoLonga?: string;
  /** `null` = ausente no payload (nunca inventado); `undefined` nunca usado para diferenciar dos dois casos. */
  preco: number | null;
  tags: string[];
  /** Bruto — formato varia por catálogo (array de strings em escalpos, ausente em propriedades/runas). Renderizado defensivamente. */
  requisitos?: unknown;
  /** Bruto — `payload_automacao.efeitos[]` (formato varia por catálogo). Nunca interpretado como regra automática aqui, só resumido para leitura. */
  payloadAutomacao?: unknown;
  status: string;
  /** Registro original completo — fallback de exibição (ex.: `<details>`) para qualquer campo não coberto acima. */
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Normaliza um registro bruto (qualquer um dos 3 catálogos) para
 * `TechnicalContentItem`. Único campo tratado como obrigatório é o
 * "nome de exibição" — cai em `slug`/`id`/"Sem nome" em cascata, nunca
 * lança erro por payload incompleto.
 */
export function normalizeTechnicalContentItem(raw: Record<string, unknown>): TechnicalContentItem {
  const id = String(raw.id ?? raw.slug ?? "");
  const slug = String(raw.slug ?? raw.id ?? "");
  return {
    id,
    slug,
    nome: typeof raw.nome === "string" && raw.nome.trim() !== "" ? raw.nome : slug || id || "Sem nome",
    categoria: typeof raw.categoria === "string" ? raw.categoria : undefined,
    categoriaLabel: typeof raw.categoria_label === "string" ? raw.categoria_label : undefined,
    raridade: typeof raw.raridade === "string" ? raw.raridade : undefined,
    raridadeLabel: typeof raw.raridade_label === "string" ? raw.raridade_label : undefined,
    descricaoCurta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    descricaoLonga: typeof raw.descricao_longa === "string" ? raw.descricao_longa : undefined,
    preco: typeof raw.preco === "number" ? raw.preco : null,
    tags: asStringArray(raw.tags),
    requisitos: raw.requisitos,
    payloadAutomacao: raw.payload_automacao,
    status: typeof raw.status === "string" ? raw.status : "published",
    raw,
  };
}

/**
 * Busca por texto — nome, slug, descrições e tags (case-insensitive,
 * sem acentuação diferenciada). Query vazia devolve a lista inteira.
 */
export function searchTechnicalContent(items: TechnicalContentItem[], query: string): TechnicalContentItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = [item.nome, item.slug, item.descricaoCurta ?? "", item.descricaoLonga ?? "", ...item.tags]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Agrupa por `categoria` (ou `categoriaLabel`, se preferível na UI) — "Sem categoria" quando ausente, nunca omite o item. */
export function groupTechnicalContentByCategory(items: TechnicalContentItem[]): Map<string, TechnicalContentItem[]> {
  const groups = new Map<string, TechnicalContentItem[]>();
  for (const item of items) {
    const key = item.categoriaLabel ?? item.categoria ?? "Sem categoria";
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Categorias distintas presentes na lista, para popular um filtro — vazio se nenhum item tiver `categoria`. */
export function listTechnicalContentCategories(items: TechnicalContentItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.categoriaLabel ?? item.categoria) set.add(item.categoriaLabel ?? item.categoria!);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Formata QUALQUER valor de payload (string/número/booleano/array/
 * objeto/null) como texto legível de uma linha — nunca `JSON.stringify`
 * bruto na UI principal (isso fica só no fallback `<details>`).
 * Objetos com `tipo` (formato comum de `payload_automacao.efeitos[]`
 * nos 3 catálogos) viram "tipo — chave: valor, chave: valor…".
 */
export function formatTechnicalContentField(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => formatTechnicalContentField(v))
      .filter((v) => v !== "")
      .join(", ");
  }
  const rec = asRecord(value);
  if (rec) {
    const parts: string[] = [];
    if (typeof rec.tipo === "string") parts.push(rec.tipo);
    for (const [key, val] of Object.entries(rec)) {
      if (key === "tipo" || val == null) continue;
      const formatted = formatTechnicalContentField(val);
      if (formatted !== "") parts.push(`${key}: ${formatted}`);
    }
    return parts.join(" — ");
  }
  return String(value);
}

/**
 * Linhas de resumo legível de `payload_automacao.efeitos[]` (formato
 * comum aos 3 catálogos) — array vazio se ausente/malformado (nunca
 * inventa efeito). A UI usa isso como texto simples; o payload bruto
 * completo fica disponível num `<details>` como fallback.
 */
export function describeTechnicalContentEffects(item: TechnicalContentItem): string[] {
  const payload = asRecord(item.payloadAutomacao);
  const efeitos = payload?.efeitos;
  if (!Array.isArray(efeitos)) return [];
  return efeitos.map((efeito) => formatTechnicalContentField(efeito)).filter((line) => line !== "");
}
