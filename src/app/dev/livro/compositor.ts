/**
 * O COMPOSITOR — distribui a fila de blocos de um capítulo em páginas.
 *
 * Cada página é montada numa bancada fora da tela, com o CSS de verdade,
 * e o navegador faz a parte difícil: quebrar linhas, equilibrar colunas,
 * respeitar viúvas, órfãs e "não separe o título do texto". Aqui só se
 * decide O QUE entra em cada página e ONDE ela é cortada.
 *
 * Uma página é uma pilha de faixas:
 *   · faixa de texto em duas colunas (`.lv-banda`);
 *   · bloco que atravessa as duas colunas (`.lv-vao`): título principal,
 *     tabela larga, linha de fichas;
 *   · imagem no alto, sangrando até a borda (`.lv-fig--topo`), ou de pé
 *     na coluna de fora (`.lv-fig--lado`), com o texto numa coluna só.
 *
 * O texto antes de um bloco que atravessa é equilibrado nas duas colunas;
 * a última faixa enche a página e o que não coube volta para a fila, com
 * o parágrafo (ou a lista, ou a tabela) cortado no ponto exato.
 */
import { L } from "./modelo";

export interface Composicao {
  paginas: string[];
  /** Âncora → índice da página composta. */
  ancoras: Record<string, number>;
}

/** Espaço mínimo de texto que tem de sobrar abaixo de um título principal. */
const MIN_APOS_TITULO = 96;
const LOTE = 24;

const div = (classe: string) => { const d = document.createElement("div"); d.className = classe; return d; };

function alturaFora(e: HTMLElement): number {
  const cs = getComputedStyle(e);
  return e.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}

const transborda = (b: HTMLElement) => b.scrollWidth > b.clientWidth + 2;

/** 0 = todo dentro da página · 1 = parte fora · 2 = todo fora · -1 = sem caixa (invisível). */
function situacao(rects: DOMRectList, limite: number): -1 | 0 | 1 | 2 {
  let total = 0, fora = 0;
  for (const r of rects) {
    if (r.width === 0 && r.height === 0) continue;
    total++;
    if (r.left >= limite) fora++;
  }
  if (!total) return -1;
  return fora === 0 ? 0 : fora === total ? 2 : 1;
}

const ATOMICO = "img, tr, figure, h2, h3, h4, h5, .lv-ficha, .lv-caixa__rotulo, .lv-remissao";

/** Primeiro ponto do conteúdo de `raiz` que caiu fora da página. */
function acharPonto(raiz: Node, limite: number): { no: Node; offset?: number } | null {
  for (const filho of Array.from(raiz.childNodes)) {
    if (filho.nodeType === Node.TEXT_NODE) {
      const t = filho as Text;
      if (!t.data.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      if (situacao(r.getClientRects(), limite) <= 0) continue;
      // Menor prefixo que já tem alguma linha fora: o caractere anterior a ele é o primeiro de fora.
      let lo = 1, hi = t.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        r.setStart(t, 0); r.setEnd(t, m);
        if (situacao(r.getClientRects(), limite) > 0) hi = m; else lo = m + 1;
      }
      return lo - 1 <= 0 ? { no: t } : { no: t, offset: lo - 1 };
    }
    if (filho.nodeType !== Node.ELEMENT_NODE) continue;
    const e = filho as HTMLElement;
    const s = situacao(e.getClientRects(), limite);
    if (s <= 0) continue;
    if (s === 2 || e.matches(ATOMICO)) return { no: e };
    const interno = acharPonto(e, limite);
    if (interno) return interno;
  }
  return null;
}

/**
 * Corta `el` no ponto em que ele saiu da página. Devolve a continuação
 * (uma casca igual, com o que sobrou), `"tudo"` se nada dele coube, ou
 * `null` se não achou onde cortar.
 */
function cortar(el: HTMLElement, limite: number): HTMLElement | "tudo" | null {
  const ponto = acharPonto(el, limite);
  if (!ponto) return null;
  const r = document.createRange();
  if (ponto.offset != null) r.setStart(ponto.no, ponto.offset); else r.setStartBefore(ponto.no);
  r.setEnd(el, el.childNodes.length);

  // Coube alguma coisa antes do corte? Cabeçalho de tabela sozinho não conta.
  const antes = document.createRange();
  antes.setStart(el, 0); antes.setEnd(r.startContainer, r.startOffset);
  const previa = antes.cloneContents();
  if (!previa.textContent?.trim() && !previa.querySelector("img")) return "tudo";
  if (el.querySelector("tr") && !previa.querySelector("tr:not(.lv-cab)") && (el.matches("table") || !previa.querySelector("p, li, h3, h4"))) return "tudo";

  // Ancestrais cortados ao meio, de fora para dentro (o primeiro é o próprio `el`).
  const cortados: HTMLElement[] = [];
  for (let a: Node | null = r.startContainer; a && a !== el; a = a.parentNode) if (a.nodeType === Node.ELEMENT_NODE) cortados.unshift(a as HTMLElement);
  cortados.unshift(el);
  // O que cada continuação precisa herdar: cabeçalho da tabela, número da lista.
  const heranca = cortados.map((a) => {
    if (a.tagName === "TBODY") return { cab: a.querySelector<HTMLElement>(":scope > tr.lv-cab")?.cloneNode(true) as HTMLElement | undefined };
    if (a.tagName === "OL") {
      const item = cortados[cortados.indexOf(a) + 1] ?? (r.startContainer === a ? a.childNodes[r.startOffset] : null);
      const base = Number(a.getAttribute("start") ?? 1);
      return { inicio: base + Math.max(0, Array.from(a.children).indexOf(item as Element)) };
    }
    return {};
  });

  const casca = el.cloneNode(false) as HTMLElement;
  casca.append(r.extractContents());
  casca.removeAttribute("data-ancora");
  let no: Element | null = casca;
  for (let i = 0; i < cortados.length && no; i++) {
    no.classList.add("lv-cont");
    const h = heranca[i];
    if (h.cab) no.prepend(h.cab);
    if (h.inicio != null) no.setAttribute("start", String(h.inicio));
    no = no.firstElementChild;
    // O cabeçalho recém-inserido não é o filho cortado: pula.
    if (h.cab && no?.nextElementSibling) no = no.nextElementSibling;
  }
  return casca;
}

/** Tira da faixa o que caiu fora da página e devolve, na ordem, o que volta para a fila. */
function recolher(banda: HTMLElement): HTMLElement[] {
  const limite = banda.getBoundingClientRect().right - 1;
  const filhos = Array.from(banda.children) as HTMLElement[];
  let i = filhos.length;
  while (i > 0) {
    const s = situacao(filhos[i - 1].getClientRects(), limite);
    if (s === 2 || s === -1) i--; else break;
  }
  const sobra = filhos.slice(i);
  for (const e of sobra) e.remove();
  const ultimo = filhos[i - 1];
  if (ultimo && situacao(ultimo.getClientRects(), limite) === 1) {
    const resto = cortar(ultimo, limite);
    if (resto === "tudo") { ultimo.remove(); sobra.unshift(ultimo); }
    else if (resto) sobra.unshift(resto);
  }
  // Intertítulo que ficou por último na página segue com o texto dele.
  while (banda.lastElementChild?.hasAttribute("data-t") && sobra.length) {
    const t = banda.lastElementChild as HTMLElement;
    t.remove(); sobra.unshift(t);
  }
  return sobra;
}

function comporPagina(bancada: HTMLElement, fila: HTMLElement[], flutuantes: HTMLElement[]): HTMLElement {
  const pg = div("lv-pg");
  bancada.replaceChildren(pg);
  let livre: number = L.textoH;
  let vazia = true;
  let lado = false;
  let banda = null as HTMLElement | null;

  const abrirBanda = () => {
    banda = div("lv-banda lv-banda--fim");
    banda.style.height = `${Math.max(0, Math.floor(livre))}px`;
    pg.append(banda);
  };
  /** Fecha a faixa de texto equilibrando as colunas; devolve a altura que ela passou a ocupar. */
  const fecharBanda = (): number => {
    const b = banda;
    banda = null;
    if (!b) return 0;
    if (!b.childElementCount) { b.remove(); return 0; }
    if (lado) return b.offsetHeight;
    b.className = "lv-banda lv-banda--eq";
    b.style.height = "";
    return alturaFora(b);
  };
  const porImagem = (f: HTMLElement) => {
    const razao = Number(f.dataset.razao) || 1.6;
    if (razao < 1.05) {
      // Arte de pé: ocupa a coluna de fora inteira; o texto fica numa coluna só.
      lado = true;
      pg.classList.add("lv-pg--lado");
      f.classList.add("lv-fig--lado");
      pg.append(f);
    } else {
      f.classList.add("lv-fig--topo");
      f.style.height = `${Math.round(Math.min(400, Math.max(210, L.pagW / razao)))}px`;
      pg.prepend(f);
      livre -= alturaFora(f);
    }
    vazia = false;
  };

  const pendente = flutuantes.shift();
  if (pendente) porImagem(pendente);
  abrirBanda();

  for (let voltas = 0; voltas < 400; voltas++) {
    const b = fila[0];
    if (!b) { fecharBanda(); break; }
    const tipo = b.dataset.b;

    if (tipo === "fig") {
      fila.shift();
      if (vazia) { banda!.remove(); porImagem(b); abrirBanda(); }
      else flutuantes.push(b);
      continue;
    }

    if (tipo === "h1" || tipo === "tab" || tipo === "vao") {
      if (lado) { fecharBanda(); break; }
      const ocupado = fecharBanda();
      const resto = livre - ocupado;
      const anterior = pg.lastElementChild as HTMLElement | null;
      const vao = div("lv-vao");
      vao.append(b);
      pg.append(vao);
      const altura = vao.offsetHeight;
      if (altura + (tipo === "h1" ? MIN_APOS_TITULO : 0) <= resto) {
        fila.shift();
        livre = resto - altura;
        vazia = false;
        abrirBanda();
        continue;
      }
      // Não coube inteiro. Tabela quebra por linha; o resto abre a página seguinte.
      if (tipo === "tab" && resto > 150) {
        vao.className = "lv-banda lv-banda--uma lv-banda--fim";
        vao.style.height = `${Math.floor(resto)}px`;
        const sobra = recolher(vao);
        fila.shift();
        fila.unshift(...sobra);
        if (vao.childElementCount) { vazia = false; break; }
      }
      vao.remove();
      if (vazia) {
        // Maior que a página inteira: entra assim mesmo, para o livro não parar.
        const forcado = div("lv-vao");
        forcado.append(fila.shift()!);
        pg.append(forcado);
        break;
      }
      // O intertítulo que apresentava o bloco vai junto com ele.
      const titulo = anterior?.classList.contains("lv-banda") ? anterior.lastElementChild : null;
      if (titulo?.hasAttribute("data-t")) {
        titulo.remove();
        fila.unshift(titulo as HTMLElement);
        if (!anterior!.childElementCount) anterior!.remove();
      }
      break;
    }

    // Texto corrido: entra em lotes e o que transbordar volta.
    const faixa: HTMLElement = banda!;
    let n = 0;
    while (fila[0] && !fila[0].dataset.b && n < LOTE) { faixa.append(fila.shift()!); n++; }
    if (!transborda(faixa)) { vazia = false; continue; }
    let sobra = recolher(faixa);
    for (let k = 0; k < 3 && transborda(faixa); k++) sobra = [...recolher(faixa), ...sobra];
    if (!faixa.childElementCount && vazia && sobra.length) faixa.append(sobra.shift()!); // bloco maior que a página
    fila.unshift(...sobra);
    break;
  }
  return pg;
}

/** Compõe um capítulo. `ceder` devolve o controle ao navegador de tempos em tempos. */
export async function compor(bancada: HTMLElement, html: string, ceder: () => Promise<void>): Promise<Composicao> {
  const molde = document.createElement("template");
  molde.innerHTML = html;
  const fila = Array.from(molde.content.children) as HTMLElement[];
  const flutuantes: HTMLElement[] = [];
  const paginas: string[] = [];
  const ancoras: Record<string, number> = {};
  while ((fila.length || flutuantes.length) && paginas.length < 3000) {
    const pg = comporPagina(bancada, fila, flutuantes);
    for (const a of pg.querySelectorAll<HTMLElement>("[data-ancora]")) {
      const chave = a.dataset.ancora!;
      if (!(chave in ancoras)) ancoras[chave] = paginas.length;
    }
    paginas.push(pg.outerHTML);
    if (paginas.length % 4 === 0) await ceder();
  }
  bancada.replaceChildren();
  if (!paginas.length) paginas.push('<div class="lv-pg"></div>');
  return { paginas, ancoras };
}
