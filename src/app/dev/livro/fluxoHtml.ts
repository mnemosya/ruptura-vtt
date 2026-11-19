/**
 * O MIOLO EM HTML — os blocos de um capítulo viram uma fila PLANA de
 * elementos, que o compositor (`compositor.ts`) distribui nas páginas.
 *
 * Plana porque livro não aninha caixas: o verbete vira um intertítulo e
 * o que estava dentro dele segue como texto corrido. Assim uma tabela ou
 * uma imagem "de dentro" de um verbete pode atravessar as duas colunas.
 *
 * Marcas que o compositor lê:
 *   data-b="h1"   título principal, atravessa as colunas;
 *   data-b="tab"  tabela larga, atravessa as colunas e quebra por linha;
 *   data-b="vao"  outro bloco que atravessa as colunas;
 *   data-b="fig"  imagem: sobe para o alto de uma página;
 *   data-t        intertítulo (não pode ficar sozinho no pé da página);
 *   data-ancora   destino de remissão;
 *   data-ir/-anc  clique leva a outra página do livro;
 *   data-pag      recebe o número da página do destino.
 */
import type { BlocoCompendio, TrechoCompendio } from "../../../lib/compendio/tipos";
import { resolverTermo, type DestinoLivro } from "../../mesas/[campaignId]/vtt/_compendio/modelo";
import { CORES_VERTENTE } from "../../_design/coresVertente";
import { textoDe } from "./modelo";

export interface CtxFluxo {
  termos: Map<string, DestinoLivro>;
  titulos: Map<string, string>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Marcador do número de página de um destino (preenchido depois de compor). */
export const pagHtml = (id: string, ancora?: string) =>
  `<span class="lv-pag" data-pag="${esc(id)}"${ancora ? ` data-panc="${esc(ancora)}"` : ""}>···</span>`;

const destinoAttrs = (d: DestinoLivro) => `data-ir="${esc(d.pageId)}"${d.ancora ? ` data-anc="${esc(d.ancora)}"` : ""}`;

function texto(trechos: TrechoCompendio[], ctx: CtxFluxo, comTermos = true): string {
  return trechos.map((t) => {
    let no = esc(t.texto);
    if (t.termo) {
      const destino = comTermos ? resolverTermo(t.texto, ctx.termos) : null;
      no = destino ? `<button type="button" class="lv-termo lv-termo--link" ${destinoAttrs(destino)}>${no}</button>` : `<span class="lv-termo">${no}</span>`;
    } else if (t.negrito) {
      no = `<strong>${no}</strong>`;
    }
    if (t.italico && !t.termo) no = `<em>${no}</em>`;
    if (t.paginaNotionId) {
      const id = t.paginaNotionId;
      no = `<button type="button" class="lv-link" data-ir="${esc(id)}">${esc(ctx.titulos.get(id) ?? t.texto)}</button> <span class="lv-ver">p. ${pagHtml(id)}</span>`;
    } else if (t.url) {
      no = `<a class="lv-link" href="${esc(t.url)}" target="_blank" rel="noreferrer noopener">${no}</a>`;
    }
    return no;
  }).join("");
}

const vazio = (t: TrechoCompendio[]) => !textoDe(t).trim();

/** Rótulo de uma caixa: o texto inteiro, quando é só um título em negrito, ou o negrito curto que abre o texto. */
function rotuloDaCaixa(trechos: TrechoCompendio[]): { rotulo: string | null; resto: TrechoCompendio[] } {
  const plano = textoDe(trechos).trim();
  if (!plano) return { rotulo: null, resto: [] };
  if (trechos.every((t) => t.negrito || !t.texto.trim()) && plano.length <= 80) return { rotulo: plano.replace(/:$/, ""), resto: [] };
  const [primeiro, ...depois] = trechos;
  if (primeiro?.negrito && !primeiro.termo && primeiro.texto.trim().length <= 60) {
    const resto = [...depois];
    if (resto[0]) {
      const t = resto[0].texto.replace(/^\s+/, "");
      resto[0] = { ...resto[0], texto: t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1) };
    }
    return { rotulo: primeiro.texto.trim().replace(/:$/, ""), resto };
  }
  return { rotulo: null, resto: trechos };
}

function corDaVertente(titulo: string): string | undefined {
  const id = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return (CORES_VERTENTE as Record<string, string>)[id];
}

type Item = { k: "t" | "hr" | "x"; html: string };

function tabela(b: Extract<BlocoCompendio, { tipo: "tabela" }>, ctx: CtxFluxo, podeAtravessar: boolean): string {
  const colunas = Math.max(0, ...b.linhas.map((l) => l.length));
  const larga = podeAtravessar && colunas >= 4;
  const linhas = b.linhas.map((linha, i) => {
    const cab = b.cabecalhoLinha && i === 0;
    const celulas = linha.map((c, j) => {
      const tag = cab || (b.cabecalhoColuna && j === 0) ? "th" : "td";
      return `<${tag}>${texto(c, ctx)}</${tag}>`;
    }).join("");
    return `<tr${cab ? ' class="lv-cab"' : ""}>${celulas}</tr>`;
  }).join("");
  return `<table class="lv-tabela${larga ? " lv-tabela--larga" : ""}${colunas >= 7 ? " lv-tabela--miuda" : ""}"${larga ? ' data-b="tab"' : ""}><tbody>${linhas}</tbody></table>`;
}

/** Blocos aninhados (dentro de caixa, lista ou citação): ficam na coluna. */
function dentro(blocos: BlocoCompendio[], ctx: CtxFluxo): string {
  return itens(blocos, ctx, 9).map((i) => i.html).join("");
}

function itens(blocos: BlocoCompendio[], ctx: CtxFluxo, nivel: number): Item[] {
  const topo = nivel < 9;
  const saida: Item[] = [];
  for (const b of blocos) {
    switch (b.tipo) {
      case "titulo": {
        const principal = topo && b.nivel === 1;
        saida.push({ k: "t", html: principal
          ? `<h2 class="lv-h1" data-b="h1" data-t data-ancora="${esc(b.ancora)}"><span>${texto(b.texto, ctx)}</span></h2>`
          : `<h3 class="lv-t lv-t--${b.nivel}" data-t data-ancora="${esc(b.ancora)}">${texto(b.texto, ctx)}</h3>` });
        break;
      }
      case "paragrafo": {
        if (vazio(b.texto)) break;
        // "Dano: 1d12 + Corpo" — linha de ficha: rótulo em negrito e valor curto. Compõe apertada, em bloco.
        const [rotulo] = b.texto;
        const doisPontos = /:\s*$/.test(rotulo?.texto ?? "") || /^\s*:/.test(b.texto[1]?.texto ?? "");
        const ficha = !!rotulo?.negrito && doisPontos && rotulo.texto.length <= 28 && textoDe(b.texto).length <= 110;
        saida.push({ k: "x", html: `<p class="lv-par${ficha ? " lv-dado" : ""}">${texto(b.texto, ctx)}</p>` });
        break;
      }
      case "lista": {
        const tag = b.ordenada ? "ol" : "ul";
        const li = b.itens.map((item) => `<li>${texto(item.texto, ctx)}${item.filhos.length ? `<div class="lv-lista__filhos">${dentro(item.filhos, ctx)}</div>` : ""}</li>`).join("");
        saida.push({ k: "x", html: `<${tag} class="lv-lista">${li}</${tag}>` });
        break;
      }
      case "citacao":
        saida.push({ k: "x", html: `<blockquote class="lv-citacao">${vazio(b.texto) ? "" : `<p>${texto(b.texto, ctx)}</p>`}${dentro(b.filhos, ctx)}</blockquote>` });
        break;
      case "destaque": {
        const { rotulo, resto } = rotuloDaCaixa(b.texto);
        const filhos = b.filhos[0]?.tipo === "divisor" ? b.filhos.slice(1) : b.filhos;
        if (!rotulo && resto.length === 0 && filhos.length > 0 && filhos.every((f) => f.tipo === "link_pagina")) { saida.push(...itens(filhos, ctx, nivel)); break; }
        saida.push({ k: "x", html: `<aside class="lv-caixa">${rotulo ? `<div class="lv-caixa__rotulo">${esc(rotulo)}</div>` : ""}${resto.length ? `<p class="lv-par">${texto(resto, ctx)}</p>` : ""}${dentro(filhos, ctx)}</aside>` });
        break;
      }
      case "verbete":
        // Verbete é intertítulo: o conteúdo dele segue como texto corrido, no mesmo nível.
        saida.push({ k: "t", html: `<h4 class="lv-v lv-v--${Math.min(nivel, 2)}" data-t data-ancora="${esc(b.ancora)}">${texto(b.titulo, ctx, false)}</h4>` });
        saida.push(...itens(b.filhos, ctx, topo ? nivel + 1 : nivel));
        break;
      case "tabela":
        saida.push({ k: "x", html: tabela(b, ctx, topo) });
        break;
      case "imagem": {
        const razao = b.largura && b.altura ? b.largura / b.altura : 1.6;
        const legenda = vazio(b.legenda) ? "" : `<figcaption>${texto(b.legenda, ctx)}</figcaption>`;
        saida.push({ k: "x", html: `<figure class="lv-fig"${topo ? ` data-b="fig" data-razao="${razao.toFixed(3)}"` : ""}><img src="${esc(b.url)}" alt="${esc(textoDe(b.legenda))}"${b.largura ? ` width="${b.largura}" height="${b.altura}"` : ""}>${legenda}</figure>` });
        break;
      }
      case "link_pagina":
        saida.push({ k: "x", html: `<button type="button" class="lv-remissao" data-ir="${esc(b.paginaNotionId)}"><span class="lv-remissao__nome">${esc(ctx.titulos.get(b.paginaNotionId) ?? b.titulo ?? "Página")}</span><span class="lv-fio"></span>${pagHtml(b.paginaNotionId)}</button>` });
        break;
      case "galeria":
        // Três fichas por linha; cada linha é um bloco, para a galeria poder quebrar de página.
        for (let i = 0; i < b.itens.length; i += 3) {
          const fichas = b.itens.slice(i, i + 3).map((c) => {
            const cor = corDaVertente(c.titulo);
            return `<button type="button" class="lv-ficha" data-ir="${esc(c.pageId)}"${cor ? ` style="--lv-acento:${cor}"` : ""}>`
              + `<span class="lv-ficha__arte">${c.imagem ? `<img src="${esc(c.imagem)}" alt="" loading="lazy">` : ""}</span>`
              + `<span class="lv-ficha__pag">${pagHtml(c.pageId)}</span>`
              + `<span class="lv-ficha__nome">${esc(c.titulo)}</span>`
              + (c.rotulo ? `<span class="lv-ficha__rotulo">${esc(c.rotulo)}</span>` : "")
              + (c.descricao ? `<span class="lv-ficha__descricao">${esc(c.descricao)}</span>` : "")
              + `</button>`;
          }).join("");
          saida.push({ k: "x", html: `<div class="lv-fichas"${topo ? ' data-b="vao"' : ""}>${fichas}</div>` });
        }
        break;
      case "divisor":
        saida.push({ k: "hr", html: `<hr class="lv-divisor">` });
        break;
      case "nao_suportado":
        break;
    }
  }
  return saida;
}

/** HTML da fila de um capítulo. Fios que encostam em intertítulo (ou nas pontas) somem: o título já separa. */
export function htmlDoCapitulo(blocos: BlocoCompendio[], ctx: CtxFluxo): string {
  const fila = itens(blocos, ctx, 0);
  const limpa = fila.filter((it, i) => {
    if (it.k !== "hr") return true;
    const antes = fila[i - 1], depois = fila[i + 1];
    return !!antes && !!depois && antes.k === "x" && depois.k === "x";
  });
  // Capitular no primeiro parágrafo, quando o capítulo abre com texto.
  const primeiro = limpa[0];
  if (primeiro?.k === "x" && primeiro.html.startsWith('<p class="lv-par">')) primeiro.html = primeiro.html.replace('<p class="lv-par">', '<p class="lv-par lv-capitular">');
  return limpa.map((i) => i.html).join("");
}

/** Texto simples de trechos (epígrafe e lide na página de abertura). */
export function htmlSimples(trechos: TrechoCompendio[]): string {
  return trechos.map((t) => (t.italico ? `<em>${esc(t.texto)}</em>` : t.negrito ? `<strong>${esc(t.texto)}</strong>` : esc(t.texto))).join("");
}
