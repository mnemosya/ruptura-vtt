/**
 * LIVRO DIGITAL — modelo puro (sem React, sem rede).
 *
 * Estudo em `/dev/livro`: o Compêndio como LIVRO, não como página que rola.
 * O mesmo conteúdo do Notion (`content_documents`, tipo `capitulo`) é
 * composto em páginas de tamanho FIXO, vistas duas a duas. Como a página
 * tem sempre o mesmo tamanho (o livro inteiro é só ampliado ou reduzido
 * para caber na tela), a paginação é a mesma em qualquer monitor — e
 * "página 142" passa a significar a mesma coisa para a mesa inteira.
 */
import type { BlocoCompendio, TrechoCompendio } from "../../../lib/compendio/tipos";

/** Medidas da página, em px do desenho (o palco escala o livro inteiro). */
export const L = {
  pagW: 640,
  pagH: 860,
  /** Margem lateral, igual dos dois lados. */
  margem: 56,
  topo: 62,
  /** Mancha de texto: duas colunas de 252 com 24 de vão. */
  textoW: 528,
  textoH: 720,
} as const;

/** Muda quando a composição muda: invalida as medidas guardadas. */
export const VERSAO_LAYOUT = "11";

export interface LinhaLivro {
  pageId: string;
  numero: number | null;
  titulo: string;
  secao: string;
  ordem: number;
  paiPageId: string | null;
  editadoEm: string;
  /** Tamanho do JSON dos blocos: só para estimar a grossura antes de medir. */
  peso: number;
  capa: { url: string; largura: number; altura: number; posicao?: string } | null;
  verbetes: { titulo: string; ancora: string }[];
}

export type Caderno =
  | { tipo: "frente"; id: "frente" }
  | { tipo: "capitulo"; id: string; linha: LinhaLivro; pai: LinhaLivro | null }
  | { tipo: "indice"; id: "indice" };

export interface Posicao {
  /** Índice do caderno. */
  c: number;
  /** Página PAR dentro do caderno (a da esquerda). */
  p: number;
}

export const ID_INTRODUCAO = "introducao";

/** Ordem do livro: folha de rosto + sumário, introdução, capítulos (com as subpáginas logo depois do pai), índice. */
export function montarCadernos(indice: LinhaLivro[], introducao: LinhaLivro): Caderno[] {
  const porId = new Map(indice.map((l) => [l.pageId, l]));
  const capitulos = [...indice].sort((a, b) => a.ordem - b.ordem).map<Caderno>((linha) => ({
    tipo: "capitulo", id: linha.pageId, linha, pai: linha.paiPageId ? porId.get(linha.paiPageId) ?? null : null,
  }));
  return [
    { tipo: "frente", id: "frente" },
    { tipo: "capitulo", id: introducao.pageId, linha: introducao, pai: null },
    ...capitulos,
    { tipo: "indice", id: "indice" },
  ];
}

export function tituloDoCaderno(c: Caderno): string {
  return c.tipo === "frente" ? "Sumário" : c.tipo === "indice" ? "Índice remissivo" : c.linha.titulo;
}

/** "07", "PN" — o que vai na dedeira e no fólio. */
export function seloDoCaderno(c: Caderno): string {
  if (c.tipo !== "capitulo") return "";
  if (c.linha.numero != null && !/patch/i.test(c.linha.secao)) return String(c.linha.numero).padStart(2, "0");
  return c.linha.titulo.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Só capítulos de primeiro nível ganham dedeira. */
export const temDedeira = (c: Caderno) => c.tipo !== "capitulo" || !c.pai;

/**
 * Abertura do capítulo, sempre em página dupla:
 *   faixa  — arte larga: atravessa o alto das duas páginas, cortada na diagonal;
 *   coluna — arte alta: ocupa a página esquerda e invade a direita pelo corte;
 *   cunha  — sem arte: uma cunha de cor chapada com o número vazado.
 */
export function varianteAbertura(l: LinhaLivro): "faixa" | "coluna" | "cunha" {
  if (!l.capa) return "cunha";
  return l.capa.largura / l.capa.altura >= 1.3 ? "faixa" : "coluna";
}

export const textoDe = (t: TrechoCompendio[]) => t.map((x) => x.texto).join("");

function textoPlano(blocos: BlocoCompendio[]): string {
  return blocos.map((b) => ("texto" in b ? textoDe(b.texto) : "") + ("filhos" in b ? " " + textoPlano(b.filhos) : "")).join(" ").trim();
}

export interface AberturaCapitulo {
  /** Citação que abre o capítulo. */
  epigrafe: Extract<BlocoCompendio, { tipo: "citacao" }> | null;
  /** Primeiro parágrafo, composto maior na página de abertura. */
  lide: TrechoCompendio[] | null;
  corpo: BlocoCompendio[];
}

/**
 * A epígrafe e o primeiro parágrafo sobem para a página de abertura; o resto é o texto corrido.
 * Quanto de texto cabe ao lado do título depende da abertura: a faixa tem duas colunas, as outras, uma.
 */
export function separarAbertura(blocos: BlocoCompendio[], variante: "faixa" | "coluna" | "cunha"): AberturaCapitulo {
  let i = 0;
  const pular = () => { while (blocos[i]?.tipo === "divisor") i++; };
  pular();
  let epigrafe: AberturaCapitulo["epigrafe"] = null;
  let lide: AberturaCapitulo["lide"] = null;
  const c = blocos[i];
  if (c?.tipo === "citacao" && textoPlano([c]).length <= 520) { epigrafe = c; i++; pular(); }
  const p = blocos[i];
  if (p?.tipo === "paragrafo") {
    const n = textoDe(p.texto).trim().length;
    const teto = variante === "faixa" ? (epigrafe ? 360 : 560) : (epigrafe ? 200 : 400);
    if (n >= 40 && n <= teto) { lide = p.texto; i++; pular(); }
  }
  return { epigrafe, lide, corpo: blocos.slice(i) };
}

export interface EntradaSecao { texto: string; ancora: string }

/** "Neste capítulo": os títulos principais; sem títulos, os verbetes de primeiro nível. */
export function nesteCapitulo(blocos: BlocoCompendio[], max = 7): { entradas: EntradaSecao[]; resto: number } {
  const titulos = blocos.filter((b): b is Extract<BlocoCompendio, { tipo: "titulo" }> => b.tipo === "titulo" && b.nivel <= 2);
  const fonte: EntradaSecao[] = titulos.length >= 2
    ? titulos.map((t) => ({ texto: textoDe(t.texto), ancora: t.ancora }))
    : blocos.filter((b): b is Extract<BlocoCompendio, { tipo: "verbete" }> => b.tipo === "verbete").map((v) => ({ texto: textoDe(v.titulo), ancora: v.ancora }));
  const limpas = fonte.filter((e) => e.texto.trim());
  return { entradas: limpas.slice(0, max), resto: Math.max(0, limpas.length - max) };
}

/* ---- índice remissivo --------------------------------------------- */

export interface EntradaIndice { titulo: string; pageId: string; ancora: string; origem: string }
export type ItemIndice = { tipo: "letra"; letra: string } | { tipo: "entrada"; e: EntradaIndice };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function entradasDoIndice(indice: LinhaLivro[]): EntradaIndice[] {
  const todas = indice.flatMap((l) => {
    const origem = l.numero != null && !l.paiPageId ? `cap. ${l.numero}` : l.titulo.toLocaleLowerCase("pt-BR");
    return l.verbetes.filter((v) => v.titulo.trim()).map((v) => ({ titulo: v.titulo.trim(), pageId: l.pageId, ancora: v.ancora, origem }));
  });
  return todas.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }));
}

/** Linhas por coluna do índice (18px cada) e quantas o título e a busca tomam do alto da primeira página. */
export const LINHAS_INDICE = 39;
const LINHAS_CABECALHO_INDICE = 8;

/** Índice em páginas de três colunas, calculadas na conta (toda linha tem a mesma altura). */
export function paginarIndice(entradas: EntradaIndice[], filtro: string): ItemIndice[][][] {
  const q = semAcento(filtro.trim());
  const filtradas = q ? entradas.filter((e) => semAcento(e.titulo).includes(q)) : entradas;
  const colunas: ItemIndice[][] = [[]];
  let usadas = LINHAS_CABECALHO_INDICE;
  let letraAtual = "";
  // O cabeçalho atravessa as três colunas da primeira página.
  const novaColuna = () => { colunas.push([]); usadas = colunas.length <= 3 ? LINHAS_CABECALHO_INDICE : 0; };
  for (const e of filtradas) {
    const inicial = semAcento(e.titulo)[0]?.toUpperCase() ?? "#";
    const letra = /[A-Z]/.test(inicial) ? inicial : "#";
    if (letra !== letraAtual) {
      letraAtual = letra;
      // A letra pede duas linhas e não pode ficar sozinha no pé da coluna.
      if (usadas + 3 > LINHAS_INDICE) novaColuna();
      colunas[colunas.length - 1].push({ tipo: "letra", letra });
      usadas += 2;
    }
    if (usadas + 1 > LINHAS_INDICE) novaColuna();
    colunas[colunas.length - 1].push({ tipo: "entrada", e });
    usadas += 1;
  }
  const paginas: ItemIndice[][][] = [];
  for (let i = 0; i < colunas.length; i += 3) paginas.push([colunas[i], colunas[i + 1] ?? [], colunas[i + 2] ?? []]);
  return paginas;
}

export const par = (n: number) => n + (n % 2);

/* ---- introdução ---------------------------------------------------- */

const p = (texto: string): BlocoCompendio => ({ tipo: "paragrafo", texto: [{ texto }] });

/**
 * Texto da Introdução. Hoje ele mora escrito à mão em
 * `_compendio/CapaLivro.tsx` (não vem do Notion); aqui é a mesma redação.
 */
export const BLOCOS_INTRODUCAO: BlocoCompendio[] = [
  p("Há milênios ele molda a vida em Braxus. Derrubou cidades, alimentou máquinas, acendeu guerras e ergueu impérios. O maior deles, o Império Central, nasceu quando o poder dos magistas saiu do controle e o planeta quase rachou. Durante séculos, esse regime manteve as Casas-Vertente sob uma única bandeira, centralizando o controle do arcano na ponta de uma só lança. Só que nada dura para sempre, e o que parecia inquebrável começa a se desfazer no silêncio das disputas internas."),
  p("Foi o sumiço do Imperador Aretzal que abriu espaço pra essa desordem. Seu nome, um dia, já foi suficiente pra calar qualquer confronto. Hoje, as Casas-Vertente expandem seus próprios domínios sem pensar no todo, enquanto blocos corporativos crescem de dentro delas, transvertendo controle por lucro. A promessa de estabilidade ainda ecoa nos corredores do poder, mas soa vazia. O brasão imperial ainda tremula, só que ao lado das logos que de fato sustentam distritos, fábricas e sistemas inteiros."),
  p("No submundo e nas zonas periféricas, refratários se aproveitam das frestas abertas por essa disputa pra desafiar o protocolo, seja por sobrevivência, seja por ambição. Vosek, a capital, é a vitrine dessa transição. Erguida pra ser o coração do controle, opera sobre uma malha de sensores, catracas, drones e vigilância constante. Mas por baixo das megatorres e avenidas monitoradas de Vosek, circulam rumores e barganhas. Alianças feitas à base da desconfiança que ligam refratários, gangues e corporações em operações que nunca aparecem nos registros oficiais. Cada empreitada sutil, cada quebra no protocolo, vai esburacando o que ainda resta da fachada do controle imperial."),
  p("O Império Central já não governa por convicção, mas por inércia. É nesse espaço de dúvida que você existe. Você é um magista refratário. Um erro fora dos planos do Império. Uma fagulha que não deveria existir. E agora a escolha está diante de você: se esconda, se venda ou incendeie o que ainda resta da ordem Imperial."),
  p("Este livro te dá a munição, o terreno e as escolhas. O que vai restar, e quem você vai ser quando tudo desabar, depende de quais marcas você decidir cravar."),
];
