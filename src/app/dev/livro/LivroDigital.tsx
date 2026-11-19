"use client";

/**
 * O LIVRO — palco, página dupla, virar, folhear, marcas de capítulo, fita
 * e orelhas.
 *
 *   · o livro tem tamanho FIXO de desenho (`L`) e o palco só o amplia ou
 *     reduz; por isso a paginação não depende da tela;
 *   · cada capítulo é composto em páginas pelo `compositor` (duas colunas,
 *     blocos que atravessam, arte no alto), numa bancada fora da tela;
 *   · virar a página é uma View Transition: o navegador fotografa as duas
 *     páginas antes e depois, e o CSS gira as fotos em torno da lombada.
 */
import { ArrowDownAZ, List, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { BlocoCompendio } from "../../../lib/compendio/tipos";
import { indiceDeTermos, type DestinoLivro } from "../../mesas/[campaignId]/vtt/_compendio/modelo";
import { CORES_VERTENTE } from "../../_design/coresVertente";
import cidadeVosek from "../../../../content/v12/capas/sylvain-sarrailh-g2-esports.jpg";
import { carregarLivroAction } from "./acoes";
import { compor } from "./compositor";
import { htmlDoCapitulo, type CtxFluxo } from "./fluxoHtml";
import {
  BLOCOS_INTRODUCAO, ID_INTRODUCAO, L, entradasDoIndice, montarCadernos, paginarIndice, par, seloDoCaderno, separarAbertura,
  temDedeira, tituloDoCaderno, varianteAbertura, type Caderno, type LinhaLivro, type Posicao,
} from "./modelo";
import { ContextoPaginacao, LojaPaginacao, usePaginacao } from "./paginacao";
import { PlacaAbertura, PlacaCapa, PlacaFim, PlacaIndice, PlacaRosto, PlacaSumario } from "./Placas";

/* ---- virar a página ------------------------------------------------- */

type Vira = "frente" | "tras" | "abre" | "fecha";
type Transicao = { finished: Promise<void>; ready: Promise<void>; skipTransition(): void };
let emCurso: Transicao | null = null;

/** Troca o que as páginas mostram dentro de uma View Transition; o CSS (`livro.css`) decide o giro pelo `data-lv-vira`. */
function transicionar(tipo: Vira, aplicar: () => void, rapido = false) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Transicao };
  if (!doc.startViewTransition) { aplicar(); return; }
  // Virar de novo antes de a página assentar: a anterior termina na hora e esta vai mais rápido.
  const apressar = rapido || emCurso != null;
  emCurso?.skipTransition();
  const raiz = document.documentElement;
  raiz.dataset.lvVira = tipo;
  raiz.style.setProperty("--lv-dur", tipo === "abre" ? "780ms" : tipo === "fecha" ? "260ms" : apressar ? "250ms" : "560ms");
  const vt = doc.startViewTransition(() => { flushSync(aplicar); });
  emCurso = vt;
  // Pular uma virada (ou a aba ficar oculta) rejeita `ready`: é esperado, não é erro.
  void vt.ready.catch(() => undefined);
  void vt.finished.catch(() => undefined).finally(() => {
    if (emCurso !== vt) return;
    emCurso = null;
    delete raiz.dataset.lvVira;
  });
}

/** Garante as fontes do livro carregadas ANTES de compor: fonte que chega depois muda a altura das linhas. */
async function carregarFontes() {
  const cs = getComputedStyle(document.documentElement);
  const pedidos: string[] = [];
  const familias: [string, string[]][] = [
    ["--font-corpo", ["400", "500", "600", "700", "italic 400", "italic 500"]],
    ["--font-oxanium", ["600", "700", "800"]],
    ["--font-mono", ["400", "500", "600", "700"]],
    ["--font-teko", ["500", "600", "700"]],
  ];
  for (const [variavel, pesos] of familias) {
    const familia = cs.getPropertyValue(variavel).trim();
    if (familia) for (const peso of pesos) pedidos.push(`${peso} 16px ${familia}`);
  }
  await Promise.all(pedidos.map((p) => document.fonts.load(p, "Ação 0123").catch(() => [])));
  await document.fonts.ready;
}

/* ---- persistência pequena ----------------------------------------- */

interface Marca { id: string; p: number }
const CHAVE_FITA = "lv-fita";
const CHAVE_ORELHAS = "lv-orelhas";
function ler<T>(chave: string, padrao: T): T {
  try { const b = window.localStorage.getItem(chave); return b ? (JSON.parse(b) as T) : padrao; } catch { return padrao; }
}
function gravar(chave: string, valor: unknown) {
  try { window.localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

const CORES_SECAO = ["#00d4ff", "#ff8a1f", "#7f95b3"];

function acentoDe(c: Caderno): string | undefined {
  if (c.tipo !== "capitulo") return undefined;
  const id = c.linha.titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return (CORES_VERTENTE as Record<string, string>)[id];
}

/* ---- o livro --------------------------------------------------------- */

export function LivroDigital({ indice }: { indice: LinhaLivro[] }) {
  const cadernos = useMemo(() => montarCadernos(indice, {
    pageId: ID_INTRODUCAO, numero: 0, titulo: "INTRODUÇÃO", secao: "", ordem: 0, paiPageId: null, editadoEm: "local-2",
    peso: JSON.stringify(BLOCOS_INTRODUCAO).length,
    capa: { url: cidadeVosek.src, largura: cidadeVosek.width, altura: cidadeVosek.height, posicao: "50% 45%" },
    verbetes: [],
  }), [indice]);
  const loja = useMemo(() => new LojaPaginacao(cadernos), [cadernos]);
  return (
    <ContextoPaginacao.Provider value={loja}>
      <Livro cadernos={cadernos} indice={indice} />
    </ContextoPaginacao.Provider>
  );
}

function Livro({ cadernos, indice }: { cadernos: Caderno[]; indice: LinhaLivro[] }) {
  const loja = usePaginacao();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<Posicao>({ c: 0, p: 0 });
  const [miolo, setMiolo] = useState<Map<string, BlocoCompendio[]> | null>(null);
  const [fontes, setFontes] = useState(false);
  const [tique, setTique] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [fita, setFita] = useState<Marca | null>(null);
  const [orelhas, setOrelhas] = useState<Marca[]>([]);
  const [folheando, setFolheando] = useState<{ x: number; c: number } | null>(null);
  const [realce, setRealce] = useState<{ ancora: string; vez: number } | null>(null);

  const posRef = useRef(pos); posRef.current = pos;
  const abertoRef = useRef(aberto); abertoRef.current = aberto;
  const pendente = useRef<DestinoLivro | null>(null);
  const compondo = useRef(false);
  const palco = useRef<HTMLDivElement>(null);
  const livro = useRef<HTMLDivElement>(null);
  const bancada = useRef<HTMLDivElement>(null);

  /* -- carga ------------------------------------------------------- */
  useEffect(() => {
    loja.carregar();
    setFita(ler<Marca | null>(CHAVE_FITA, null));
    setOrelhas(ler<Marca[]>(CHAVE_ORELHAS, []));
    void carregarFontes().then(() => setFontes(true));
    let vivo = true;
    void carregarLivroAction().then((pares) => {
      if (!vivo) return;
      const mapa = new Map<string, BlocoCompendio[]>([[ID_INTRODUCAO, BLOCOS_INTRODUCAO]]);
      for (const [id, blocos] of pares) mapa.set(id, blocos);
      setMiolo(mapa);
    });
    // Abrir direto numa página: `#<caderno>/<página>` (ao chegar e quando o endereço muda).
    const doEndereco = () => {
      const m = window.location.hash.match(/^#([^/]+)\/(\d+)$/);
      const c = m ? loja.indiceDe(decodeURIComponent(m[1])) : -1;
      if (!m || c < 0) return;
      setPos({ c, p: Number(m[2]) - (Number(m[2]) % 2) });
      setAberto(true);
    };
    doEndereco();
    window.addEventListener("hashchange", doEndereco);
    return () => { vivo = false; window.removeEventListener("hashchange", doEndereco); };
  }, [loja]);

  /* -- escala do palco ---------------------------------------------- */
  useLayoutEffect(() => {
    const el = palco.current;
    if (!el) return;
    const ajustar = () => el.style.setProperty("--lv-escala", String(Math.min(el.clientWidth / 1340, el.clientHeight / 952, 1.7)));
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* -- índice remissivo --------------------------------------------- */
  const entradas = useMemo(() => entradasDoIndice(indice), [indice]);
  const paginasIndice = useMemo(() => paginarIndice(entradas, filtro), [entradas, filtro]);
  useEffect(() => { loja.definirPaginasIndice(Math.max(1, paginasIndice.length)); }, [loja, paginasIndice]);

  /* -- composição dos capítulos -------------------------------------- */
  const ctx = useMemo<CtxFluxo>(() => ({
    termos: indiceDeTermos(indice),
    titulos: new Map(indice.map((l) => [l.pageId, l.titulo])),
  }), [indice]);

  useEffect(() => {
    const banco = bancada.current;
    if (!miolo || !fontes || compondo.current || !banco) return;
    // Ordem: o capítulo pedido por uma remissão, o que está aberto, os vizinhos e, por fim, o livro em ordem.
    const semPaginas = (i: number) => { const c = cadernos[i]; return c?.tipo === "capitulo" && miolo.has(c.id) && !loja.paginasCompostas(c.id) ? c : null; };
    const semMedida = (i: number) => { const c = cadernos[i]; return c?.tipo === "capitulo" && miolo.has(c.id) && !loja.medida(c.id) ? c : null; };
    const pedido = pendente.current ? loja.indiceDe(pendente.current.pageId) : -1;
    const alvo = (pedido >= 0 ? semPaginas(pedido) : null) ?? semPaginas(pos.c) ?? semMedida(pos.c - 1) ?? semPaginas(pos.c + 1)
      ?? cadernos.map((_, i) => semMedida(i)).find((c) => c != null) ?? semPaginas(pos.c - 1) ?? null;
    if (!alvo) return;
    compondo.current = true;
    const html = htmlDoCapitulo(separarAbertura(miolo.get(alvo.id)!, varianteAbertura(alvo.linha)).corpo, ctx);
    // Sem cancelamento: uma composição começada termina, e só então a próxima é escolhida (`tique`).
    setTimeout(() => {
      void compor(banco, html, () => new Promise((r) => setTimeout(r, 0)))
        .then((r) => loja.guardar(alvo.id, alvo.linha.editadoEm, r.paginas, r.ancoras))
        .finally(() => { compondo.current = false; setTique((t) => t + 1); });
    }, 8);
  }, [miolo, fontes, cadernos, loja, ctx, pos.c, loja.versao, tique]);

  /* -- navegação ----------------------------------------------------- */
  const mudar = useCallback((nova: Posicao, rapido = false) => {
    const atual = posRef.current;
    if (!abertoRef.current) { transicionar("abre", () => { setAberto(true); setPos(nova); }); return; }
    if (nova.c === atual.c && nova.p === atual.p) return;
    const frente = nova.c > atual.c || (nova.c === atual.c && nova.p > atual.p);
    transicionar(frente ? "frente" : "tras", () => setPos(nova), rapido);
  }, []);

  const avancar = useCallback(() => {
    const { c, p } = posRef.current;
    const total = loja.paginasDe(c);
    if (total == null ? p === 0 : p + 2 < total) mudar({ c, p: p + 2 });
    else if (total != null && c + 1 < cadernos.length) mudar({ c: c + 1, p: 0 });
  }, [loja, cadernos, mudar]);

  const voltar = useCallback(() => {
    const { c, p } = posRef.current;
    if (p > 0) mudar({ c, p: p - 2 });
    else if (c > 0) { const total = loja.paginasDe(c - 1); mudar({ c: c - 1, p: total ? total - 2 : 0 }); }
  }, [loja, mudar]);

  const ir = useCallback((destino: DestinoLivro) => {
    const c = loja.indiceDe(destino.pageId);
    if (c < 0) return;
    let p = 0;
    if (destino.ancora) {
      const pa = loja.paginaDaAncora(destino.pageId, destino.ancora);
      if (pa != null) p = pa - (pa % 2);
      else pendente.current = destino;
      setRealce({ ancora: destino.ancora, vez: Date.now() });
    }
    mudar({ c, p });
  }, [loja, mudar]);

  const fechar = useCallback(() => {
    if (!abertoRef.current) return;
    const { c, p } = posRef.current;
    if (c > 0) { const m = { id: cadernos[c].id, p }; setFita(m); gravar(CHAVE_FITA, m); }
    transicionar("fecha", () => setAberto(false));
  }, [cadernos]);

  // Um verbete pedido antes de o capítulo estar composto: chega na abertura e segue assim que a página existe.
  useEffect(() => {
    const d = pendente.current;
    if (!d?.ancora) return;
    const pa = loja.paginaDaAncora(d.pageId, d.ancora);
    if (pa == null) return;
    pendente.current = null;
    const c = loja.indiceDe(d.pageId);
    if (posRef.current.c === c) mudar({ c, p: pa - (pa % 2) });
  });

  // A contagem mudou e a página atual deixou de existir: recua.
  const totalAtual = loja.paginasDe(pos.c);
  useEffect(() => {
    if (totalAtual != null && pos.p > totalAtual - 2) setPos({ c: pos.c, p: Math.max(0, totalAtual - 2) });
  }, [totalAtual, pos]);

  // Números de página das remissões dentro do texto composto, e o verbete de destino aceso.
  useEffect(() => {
    const el = livro.current;
    if (!el) return;
    for (const s of el.querySelectorAll<HTMLElement>("[data-pag]")) {
      const n = loja.numeroDe(s.dataset.pag!, s.dataset.panc);
      const t = n != null ? String(n) : "···";
      if (s.textContent !== t) s.textContent = t;
    }
    if (!realce) return;
    const nos = el.querySelectorAll<HTMLElement>(`[data-ancora="${CSS.escape(realce.ancora)}"]`);
    for (const n of nos) n.classList.add("lv-realce");
    const h = setTimeout(() => { for (const n of nos) n.classList.remove("lv-realce"); }, 1800);
    return () => { clearTimeout(h); for (const n of nos) n.classList.remove("lv-realce"); };
  });

  // Endereço da página aberta.
  useEffect(() => {
    window.history.replaceState(null, "", aberto ? `#${encodeURIComponent(cadernos[pos.c].id)}/${pos.p}` : window.location.pathname);
  }, [aberto, pos, cadernos]);

  // Sair da página deixa a fita onde a leitura parou.
  useEffect(() => {
    const aoSair = () => {
      const { c, p } = posRef.current;
      if (abertoRef.current && c > 0) gravar(CHAVE_FITA, { id: cadernos[c].id, p });
    };
    window.addEventListener("pagehide", aoSair);
    return () => window.removeEventListener("pagehide", aoSair);
  }, [cadernos]);

  /* -- teclado, roda e cliques no texto ------------------------------- */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) { if (e.key === "Escape") alvo.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!abertoRef.current) { if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); mudar({ c: 0, p: 0 }); } return; }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); avancar(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); voltar(); }
      else if (e.key === "Home") { e.preventDefault(); mudar({ c: 0, p: 0 }); }
      else if (e.key === "End") { e.preventDefault(); mudar({ c: cadernos.length - 1, p: 0 }); }
      else if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [avancar, voltar, mudar, fechar, cadernos]);

  const ultimaRoda = useRef(0);
  const aoRolar = (e: React.WheelEvent) => {
    if (!aberto) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 12 || e.timeStamp - ultimaRoda.current < 420) return;
    ultimaRoda.current = e.timeStamp;
    if (d > 0) avancar(); else voltar();
  };

  /** Remissões dentro do texto composto (HTML estático): um ouvinte só, no livro. */
  const aoClicar = (e: React.MouseEvent) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-ir]");
    if (alvo) ir({ pageId: alvo.dataset.ir!, ancora: alvo.dataset.anc });
  };

  /* -- marcas de capítulo --------------------------------------------- */
  const caderno = cadernos[pos.c];
  const inicio = loja.inicioDe(pos.c);
  const comDedeira = cadernos.map((c, i) => ({ c, i })).filter(({ c }) => temDedeira(c));
  let raiz = pos.c;
  while (raiz > 0 && !temDedeira(cadernos[raiz])) raiz--;
  const ordemRaiz = comDedeira.findIndex((d) => d.i === raiz);
  const secoes = [...new Set(cadernos.flatMap((c) => (c.tipo === "capitulo" && !c.pai && c.linha.secao ? [c.linha.secao] : [])))];
  const corDe = (c: Caderno) => {
    const s = c.tipo === "capitulo" ? secoes.indexOf((c.pai ?? c.linha).secao) : -1;
    return s < 0 ? "#cfeff4" : CORES_SECAO[Math.min(s, CORES_SECAO.length - 1)];
  };
  const passo = (L.pagH - 132) / comDedeira.length;
  const topoDaMarca = (k: number) => 66 + k * passo;

  /* -- desenho de uma página ----------------------------------------- */
  function pagina(lado: "esq" | "dir"): ReactNode {
    const p = pos.p + (lado === "dir" ? 1 : 0);
    let conteudo: ReactNode;
    let folio = true;
    let marca = true;
    let tom = "";
    if (caderno.tipo === "frente") {
      if (lado === "esq") { conteudo = <PlacaRosto />; folio = false; marca = false; }
      else conteudo = <PlacaSumario cadernos={cadernos} ir={ir} />;
    } else if (caderno.tipo === "indice") {
      conteudo = <PlacaIndice colunas={paginasIndice[p]} primeira={p === 0} filtro={filtro} onFiltro={(v) => { setFiltro(v); setPos({ c: pos.c, p: 0 }); }} ir={ir} />;
    } else if (p < 2) {
      const variante = varianteAbertura(caderno.linha);
      conteudo = <PlacaAbertura c={caderno} lado={lado} blocos={miolo?.get(caderno.id) ?? null} ir={ir} />;
      folio = lado === "dir";
      marca = lado === "dir";
      tom = variante === "cunha" && lado === "esq" ? "lv-pagina--cor" : "";
    } else {
      const paginas = loja.paginasCompostas(caderno.id);
      if (!paginas) conteudo = <div className="lv-espera" aria-hidden="true" />;
      else if (p - 2 >= paginas.length) conteudo = <PlacaFim proximo={cadernos[pos.c + 1] ?? null} ir={ir} />;
      else conteudo = <div className="lv-miolo" dangerouslySetInnerHTML={{ __html: paginas[p - 2] }} />;
    }
    const marcada = orelhas.some((o) => o.id === caderno.id && o.p === p);
    const podeVirar = lado === "dir" ? !(pos.c === cadernos.length - 1 && totalAtual != null && pos.p + 2 >= totalAtual) : !(pos.c === 0 && pos.p === 0);
    const rotulo = caderno.tipo === "capitulo" && caderno.pai ? `${caderno.pai.titulo} · ${caderno.linha.titulo}` : tituloDoCaderno(caderno);
    return (
      <div className={`lv-pagina lv-pagina--${lado} ${tom}`} style={{ "--lv-acento": acentoDe(caderno), "--lv-cor": corDe(cadernos[raiz]) } as CSSProperties} data-testid={`livro-pagina-${lado}`}>
        {conteudo}
        {folio && (
          <div className="lv-folio" data-testid={`livro-folio-${lado}`}>
            <b>{inicio != null ? inicio + p : "···"}</b>
            <span>{rotulo}</span>
          </div>
        )}
        {marca && seloDoCaderno(cadernos[raiz]) && <span className="lv-unha" style={{ top: topoDaMarca(ordemRaiz) }} aria-hidden="true">{seloDoCaderno(cadernos[raiz])}</span>}
        {podeVirar && <button type="button" className="lv-virar" aria-label={lado === "dir" ? "Próxima página" : "Página anterior"} onClick={lado === "dir" ? avancar : voltar} data-testid={`livro-virar-${lado}`} />}
        {caderno.tipo !== "frente" && (
          <button type="button" className={`lv-orelha ${marcada ? "lv-orelha--dobrada" : ""}`} aria-pressed={marcada}
            aria-label={marcada ? "Desfazer a orelha desta página" : "Dobrar a orelha desta página"}
            onClick={() => {
              const novas = marcada ? orelhas.filter((o) => !(o.id === caderno.id && o.p === p)) : [...orelhas, { id: caderno.id, p }];
              setOrelhas(novas); gravar(CHAVE_ORELHAS, novas);
            }} />
        )}
      </div>
    );
  }

  /* -- corte (folhear) ------------------------------------------------ */
  const pesos = cadernos.map((c, i) => loja.paginasDe(i) ?? (c.tipo === "capitulo" ? 2 + par(Math.ceil(c.linha.peso / 4200)) : 2));
  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  const cadernoEm = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const alvo = Math.min(0.9999, Math.max(0, (clientX - r.left) / r.width)) * totalPesos;
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) { soma += pesos[i]; if (alvo < soma) return i; }
    return pesos.length - 1;
  };
  const folhear = (e: React.PointerEvent<HTMLDivElement>) => {
    const trilho = e.currentTarget.querySelector<HTMLElement>(".lv-corte__trilho")!;
    const c = cadernoEm(e.clientX, trilho);
    const r = e.currentTarget.getBoundingClientRect();
    setFolheando({ x: ((e.clientX - r.left) / r.width) * 100, c });
    if (e.buttons === 1 && c !== posRef.current.c) mudar({ c, p: 0 }, true);
  };

  const fitaAqui = !!fita && aberto && fita.id === caderno.id && fita.p === pos.p;
  const fitaIndice = fita ? loja.indiceDe(fita.id) : -1;
  const fitaAntes = fitaIndice >= 0 && (fitaIndice < pos.c || (fitaIndice === pos.c && fita!.p < pos.p));
  const irParaFita = () => { if (fita && fitaIndice >= 0) mudar({ c: fitaIndice, p: fita.p }); };
  const numeroDaFita = fita && fitaIndice >= 0 ? loja.inicioDe(fitaIndice) : null;
  const antesDaqui = (o: Marca) => { const i = loja.indiceDe(o.id); return i < pos.c || (i === pos.c && o.p < pos.p); };

  return (
    <div className="lv-raiz" ref={palco} onWheel={aoRolar} data-aberto={aberto} data-testid="livro">
      <div className="lv-mesa">
        {aberto && (
          <button type="button" className="lv-fechar" onClick={fechar} data-testid="livro-fechar">
            <kbd>ESC</kbd>Fechar<X aria-hidden="true" />
          </button>
        )}

        <div className="lv-livro" ref={livro} onClick={aoClicar}>
          {!aberto ? (
            <>
              <button type="button" className="lv-capa" onClick={() => mudar({ c: 0, p: 0 })} aria-label="Abrir o livro" data-testid="livro-capa">
                <PlacaCapa arte={cidadeVosek.src} />
              </button>
              {fita && fitaIndice >= 0 && (
                <button type="button" className="lv-fita lv-fita--capa" onClick={irParaFita} data-testid="livro-fita">
                  <span className="lv-dica">Abrir na fita{numeroDaFita != null ? ` · p. ${numeroDaFita + fita.p}` : ""} · {tituloDoCaderno(cadernos[fitaIndice])}</span>
                </button>
              )}
            </>
          ) : (
            <>
              <div className="lv-prancha" aria-hidden="true" />

              <nav className="lv-unhas" aria-label="Capítulos">
                {comDedeira.map(({ c, i }, k) => i === raiz ? null : (
                  <button key={c.id} type="button" className={`lv-unha-fora lv-unha-fora--${i < raiz ? "esq" : "dir"}`}
                    style={{ top: topoDaMarca(k), "--lv-cor": corDe(c) } as CSSProperties} onClick={() => mudar({ c: i, p: 0 })} data-testid={`livro-dedeira-${k}`}>
                    <span className="lv-dica">
                      {c.tipo === "frente" ? <List aria-hidden="true" /> : c.tipo === "indice" ? <ArrowDownAZ aria-hidden="true" /> : <b>{seloDoCaderno(c)}</b>}
                      {tituloDoCaderno(c)}
                    </span>
                  </button>
                ))}
              </nav>

              {pagina("esq")}
              {pagina("dir")}
              <div className="lv-lombada" aria-hidden="true" />

              {orelhas.map((o) => {
                const i = loja.indiceDe(o.id);
                if (i < 0) return null;
                const n = loja.inicioDe(i);
                const antes = antesDaqui(o);
                const ordem = orelhas.filter((x) => antesDaqui(x) === antes).indexOf(o);
                return (
                  <button key={`${o.id}/${o.p}`} type="button" className="lv-marca" style={antes ? { right: L.pagW + 34 + ordem * 30 } : { left: L.pagW + 34 + ordem * 30 }}
                    onClick={() => mudar({ c: i, p: o.p - (o.p % 2) })}>
                    {n != null ? n + o.p : "·"}
                    <span className="lv-dica">{tituloDoCaderno(cadernos[i])}</span>
                  </button>
                );
              })}

              {fitaAqui ? (
                <div className="lv-fita lv-fita--aqui" aria-hidden="true" />
              ) : (
                <>
                  {caderno.tipo !== "frente" && (
                    <button type="button" className="lv-fita lv-fita--ponta" onClick={() => { const m = { id: caderno.id, p: pos.p }; setFita(m); gravar(CHAVE_FITA, m); }} data-testid="livro-por-fita">
                      <span className="lv-dica">Pôr a fita aqui</span>
                    </button>
                  )}
                  {fita && fitaIndice >= 0 && (
                    <button type="button" className={`lv-fita lv-fita--rabo ${fitaAntes ? "lv-fita--antes" : "lv-fita--depois"}`} onClick={irParaFita} data-testid="livro-fita">
                      <span className="lv-dica">Ir para a fita{numeroDaFita != null ? ` · p. ${numeroDaFita + fita.p}` : ""}</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {aberto && (
          <div className="lv-corte" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); folhear(e); }} onPointerMove={folhear}
            onPointerLeave={() => setFolheando(null)} onPointerUp={(e) => { if (e.pointerType !== "mouse") setFolheando(null); }} data-testid="livro-corte">
            <span className="lv-corte__rotulo">Folhear</span>
            <div className="lv-corte__trilho">
              {cadernos.map((c, i) => (
                <i key={c.id} className={`${i === pos.c ? "lv-corte__aqui" : ""} ${temDedeira(c) ? "lv-corte__cap" : ""}`} style={{ flexGrow: pesos[i], "--lv-cor": corDe(c) } as CSSProperties} />
              ))}
            </div>
            {folheando && (
              <span className="lv-dica lv-dica--corte" style={{ left: `${folheando.x}%` }}>
                {seloDoCaderno(cadernos[folheando.c]) && <b>{seloDoCaderno(cadernos[folheando.c])}</b>}{tituloDoCaderno(cadernos[folheando.c])}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bancada do compositor: fora da tela, com o CSS de verdade. */}
      <div className="lv-bancada" ref={bancada} aria-hidden="true" />
    </div>
  );
}
