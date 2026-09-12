/**
 * Lógica PURA do Compêndio: catálogo de categorias, extração dos
 * termos pesquisáveis e resumo curto de um payload.
 *
 * Vive fora da Server Action (`acoes/compendioPainel.ts`) e fora do
 * componente porque os dois usam as MESMAS regras — o servidor pra
 * filtrar de verdade, o cliente pra filtrar o cache local sem
 * round-trip — e porque assim `scripts/test-vtt-painel.ts` exercita
 * tudo sem banco.
 */

export type CategoriaCompendio = "magias" | "talentos" | "itens" | "runas" | "condicoes" | "companheiros";

export const CATEGORIAS_COMPENDIO: readonly CategoriaCompendio[] = [
  "magias",
  "talentos",
  "itens",
  "runas",
  "condicoes",
  "companheiros",
];

const ROTULOS: Record<CategoriaCompendio, string> = {
  magias: "Magias",
  talentos: "Talentos",
  itens: "Itens",
  runas: "Runas",
  condicoes: "Condições",
  companheiros: "Companheiros, drones e robôs",
};

export function rotuloDaCategoria(categoria: CategoriaCompendio): string {
  return ROTULOS[categoria];
}

export function ehCategoriaCompendio(valor: unknown): valor is CategoriaCompendio {
  return typeof valor === "string" && (CATEGORIAS_COMPENDIO as readonly string[]).includes(valor);
}

/** Procedência do conteúdo efetivo, na linguagem do painel. */
export type OrigemCompendio = "oficial" | "modificado" | "homebrew";

const ROTULOS_ORIGEM: Record<OrigemCompendio, string> = {
  oficial: "Oficial",
  modificado: "Modificado pela mesa",
  homebrew: "Homebrew da mesa",
};

export function rotuloDaOrigem(origem: OrigemCompendio): string {
  return ROTULOS_ORIGEM[origem];
}

export interface LinhaCompendio {
  categoria: CategoriaCompendio;
  slug: string;
  nome: string;
  origem: OrigemCompendio;
  /** Uma linha curta de contexto (vertente, categoria de item, tipo…) — nunca o payload inteiro. */
  subtitulo: string | null;
}

/**
 * Campos de topo do payload que valem como "termo relevante" numa
 * busca. Lista fechada de propósito: varrer o payload inteiro faria a
 * busca casar com texto de regra comprido e devolver quase tudo pra
 * qualquer consulta de 3 letras.
 */
const CAMPOS_PESQUISAVEIS = ["nome", "categoria", "subtipo", "vertente", "tipo", "tipo_magia", "slot", "modelo", "classe"] as const;

/**
 * Termos, já em minúsculas, contra os quais uma consulta é comparada:
 * slug, nome e os campos relevantes do payload (topo e um nível de
 * `estatisticas`, onde vivem `tipo_magia`/`nivel`/`resolucao`).
 * Nunca inclui descrição/efeito — ver a nota acima.
 */
export function termosDeBusca(doc: { slug: string; nome: string | null; payload: Record<string, unknown> | null }): string[] {
  const termos: string[] = [doc.slug.toLocaleLowerCase("pt-BR")];
  if (doc.nome) termos.push(doc.nome.toLocaleLowerCase("pt-BR"));
  const p = doc.payload ?? {};
  for (const campo of CAMPOS_PESQUISAVEIS) {
    const v = p[campo];
    if (typeof v === "string" && v.trim()) termos.push(v.toLocaleLowerCase("pt-BR"));
  }
  const estatisticas = p.estatisticas;
  if (estatisticas && typeof estatisticas === "object") {
    for (const campo of CAMPOS_PESQUISAVEIS) {
      const v = (estatisticas as Record<string, unknown>)[campo];
      if (typeof v === "string" && v.trim()) termos.push(v.toLocaleLowerCase("pt-BR"));
    }
  }
  return termos;
}

/** Um valor escalar de `chaves`, na ordem, ou `null`. Busca no topo e em `estatisticas`. */
function primeiroCampo(payload: Record<string, unknown>, chaves: readonly string[]): string | null {
  const estatisticas = (payload.estatisticas && typeof payload.estatisticas === "object" ? payload.estatisticas : {}) as Record<string, unknown>;
  for (const chave of chaves) {
    const v = payload[chave] ?? estatisticas[chave];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Linha curta de contexto de um documento — o que a linha do diretório
 * mostra sob o nome, e o resumo que vai no cartão do Chat. Sempre uma
 * frase curta montada de campos escalares; nunca JSON, nunca o texto
 * de regra inteiro.
 */
export function resumoDoPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const partes: string[] = [];
  const categoria = primeiroCampo(payload, ["categoria", "tipo", "tipo_magia", "classe"]);
  if (categoria) partes.push(categoria);
  const subtipo = primeiroCampo(payload, ["subtipo", "vertente", "slot", "modelo"]);
  if (subtipo && subtipo !== categoria) partes.push(subtipo);
  const nivel = payload.nivel ?? (payload.estatisticas as Record<string, unknown> | undefined)?.nivel;
  if (typeof nivel === "number") partes.push(`nível ${nivel}`);
  const curta = payload.descricao_curta;
  if (partes.length === 0 && typeof curta === "string" && curta.trim()) {
    return curta.trim().slice(0, 160);
  }
  return partes.join(" · ");
}

/**
 * Filtro local do cache da sessão — a MESMA regra do servidor, para o
 * painel poder refinar uma consulta já carregada sem nova ida à rede.
 * Nunca substitui a busca do servidor (que enxerga a categoria
 * inteira, não só o que já veio).
 */
export function filtrarLinhas(linhas: readonly LinhaCompendio[], consulta: string): LinhaCompendio[] {
  const alvo = consulta.trim().toLocaleLowerCase("pt-BR");
  if (!alvo) return [...linhas];
  return linhas.filter(
    (l) => l.nome.toLocaleLowerCase("pt-BR").includes(alvo) || l.slug.toLocaleLowerCase("pt-BR").includes(alvo),
  );
}

/** Chave do cache de sessão de uma consulta. Consulta vazia e "  " são a mesma coisa. */
export function chaveCache(categoria: CategoriaCompendio, consulta: string): string {
  return `${categoria}::${consulta.trim().toLocaleLowerCase("pt-BR")}`;
}
