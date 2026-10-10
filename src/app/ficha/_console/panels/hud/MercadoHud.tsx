"use client";

/**
 * MERCADO — a opção "Catálogo" do protótipo
 * (`inventario equip magia/src/Market.tsx`), na linguagem da Forja.
 * Categorias à esquerda, cartões no meio, ficha do produto à direita.
 *
 * Só apresentação: recebe os produtos já resolvidos (`ProdutoHud`) e a
 * compra sai por `onComprar`. Quem lê o catálogo publicado e chama
 * `comprarItem` é o `InventarioPanel`; a galeria alimenta com dados de
 * exemplo. A compra vai para a mochila — é o que `comprarItem` faz.
 *
 * Cor de categoria: a vertente dela (`data-vertente`), como no
 * Inventário.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./hud-base.css";
import "./mercado-layout.css";

const AMB = "#ff8a1f", CASCO = "#081925", PERIGO = "#ff5f74", OK = "#22d3aa";
const RAR: Record<string, string> = { comum: "#7f95b3", incomum: OK, raro: "#8b5cf6", "muito raro": "#8b5cf6", lendario: AMB, lendário: AMB };
const corRaridade = (r?: string | null) => (r ? RAR[r.toLowerCase()] ?? "#7f95b3" : "#7f95b3");
const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Glifo por categoria (mesmos traços do Inventário). */
export const GLIFO_CATEGORIA: Record<string, string> = {
  arma: "M3 21 14 10m0 0 3-7 4 4-7 3Zm-9 7 3 3M6 15l3 3",
  armadura: "M12 2 4 5v7c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3Zm0 0v20M4 10h16",
  escudo: "M4 3h16v9c0 5-4 8-8 10-4-2-8-5-8-10V3Zm8 4v10m-4-5h8",
  ferramenta: "M14 5a5 5 0 0 0 5 6l-9 10-4-4 10-9a5 5 0 0 1-2-3Z",
  farmacia: "M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2Z",
  dispositivo: "M5 3h14v18H5V3Zm3 3h8v6H8V6Zm1 10h2m2 0h2",
  veiculo: "M3 15l2-6h14l2 6v4H3v-4Zm3 4v2m12-2v2M6 15h2m8 0h2",
  vertina: "M12 1 19 12 12 23 5 12 12 1Zm0 6-3 5 3 5 3-5-3-5Z",
  municao: "M6 22V9l2-6 2 6v13m4 0V9l2-6 2 6v13",
  explosivo: "M12 8a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm3-1 3-4m0 0 2 1m-2-1-1-2",
};
const GLIFO_PADRAO = "M4 4h16v16H4V4Zm4 4h8v8H8V8Z";
const glifo = (cat: string) => GLIFO_CATEGORIA[cat] ?? GLIFO_PADRAO;

export interface ProdutoHud {
  slug: string;
  nome: string;
  categoria: string;
  categoriaRotulo: string;
  /** Vertente da categoria — escolhe a cor (`--rv-vertente-cor`). */
  vertente: string;
  preco: number;
  espacos: number;
  raridade?: string | null;
  descricao?: ReactNode;
  destaque?: { rotulo: string; valor: string; sufixo?: string | null } | null;
  propriedades?: string[];
  linhas?: { rotulo: string; valor: string }[];
  pa?: number | null;
  municao?: number | null;
  cargas?: number | null;
  /** Traço próprio do ícone; ausente = o da categoria. */
  glifo?: string;
  /**
   * Grupo de topo da lista lateral (ex.: "Armaduras e escudos", que junta
   * duas categorias). Ausente = a própria categoria.
   */
  grupo?: { id: string; nome: string; glifo?: string };
  /** Subcategoria dentro do grupo (ex.: "Armas de fogo"). Null = nenhuma. */
  sub?: string | null;
  /** Posição da subcategoria na lista lateral; sem ela, a ordem de chegada. */
  subOrdem?: number;
  /**
   * Etiqueta de tipo no cartão e subtítulo na ficha (ex.: "Flecha" numa
   * munição chamada só "Explosiva"). Ausente = o que estiver entre
   * parênteses no nome.
   */
  tipo?: string | null;
}

export interface PropsMercadoHud {
  produtos: ProdutoHud[];
  saldo: number;
  /** Espaços ocupados agora e capacidade — avisa antes de estourar a mochila. */
  usados: number;
  capacidade: number;
  onComprar: (slug: string, quantidade: number) => void;
  onFechar?: () => void;
}

const Tag = ({ children, style, className = "" }: { children: ReactNode; style?: React.CSSProperties; className?: string }) =>
  <span className={`hx-tag ${className}`} style={style}>{children}</span>;
const Svg = ({ d, tam, cor = "currentColor", traco = 1.6, style }: { d: string; tam: number; cor?: string; traco?: number; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={d} /></svg>
);
const Aretz = () => <span className="hx-amb">₳</span>;
const Espacos = ({ n }: { n: number }) => (
  <span title={`${n} espaço${n === 1 ? "" : "s"}`} style={{ display: "flex", gap: 2 }}>
    {Array.from({ length: Math.max(n, 1) }, (_, i) => <span key={i} style={{ width: 10, height: 8, background: "var(--k)" }} />)}
  </span>
);
const Stat = ({ k, v }: { k: string; v: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
    <Tag className="hx-dim">{k}</Tag><span style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{v}</span>
  </div>
);
/** "AS-10 Overdrive (Pistola pesada)" → título e tipo. Sem parênteses, o tipo é null. */
const separarTipo = (nome: string): { titulo: string; tipo: string | null } => {
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(nome);
  return m ? { titulo: m[1], tipo: m[2] } : { titulo: nome, tipo: null };
};
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Cada grupo do mercado tem uma cor própria, independente da vertente. */
const CORES_CATEGORIAS: Record<string, string> = {
  acessorios: "#5ccbb3",
  armaduras: "#f5a200",
  "armaduras e escudos": "#f5a200",
  escudos: "#7894f4",
  armas: "#e0455f",
  "dispositivos tecnologicos": "#35c7d8",
  "drones e robos": "#b2ce62",
  escalpos: "#c578d9",
  explosivos: "#f07a1f",
  farmacia: "#4fb36e",
  "ferramentas e utilidades": "#ddd27b",
  municao: "#c3a06c",
  mobilidade: "#569fdf",
  trajes: "#c88456",
  vertinas: "#8b5cf6",
};
const estiloGrupo = (nome: string, vertente: string): React.CSSProperties | undefined => {
  const cor = CORES_CATEGORIAS[sem(nome)] ?? (vertente === "nenhuma" ? "#8eaef0" : undefined);
  return cor ? { ["--k" as string]: cor } : undefined;
};

export function MercadoHud({ produtos, saldo, usados, capacidade, onComprar, onFechar }: PropsMercadoHud) {
  const raiz = useRef<HTMLDivElement>(null);
  const botaoCategorias = useRef<HTMLButtonElement>(null);
  const tituloDetalhe = useRef<HTMLHeadingElement>(null);
  const ultimoCartao = useRef<HTMLButtonElement | null>(null);
  const navId = useId();
  const [layout, setLayout] = useState<"amplo" | "medio" | "compacto">("amplo");
  const [categoriasAbertas, setCategoriasAbertas] = useState(false);
  const [categoriasOcultas, setCategoriasOcultas] = useState(false);
  const categoriasVisiveis = layout === "amplo" ? !categoriasOcultas : categoriasAbertas;
  const [detalheAberto, setDetalheAberto] = useState(false);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const largura = entry.contentRect.width;
      setLayout(largura < 720 ? "compacto" : largura < 1120 ? "medio" : "amplo");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (layout === "compacto" && detalheAberto) tituloDetalhe.current?.focus();
  }, [layout, detalheAberto]);
  useEffect(() => {
    if (categoriasAbertas && layout !== "amplo") raiz.current?.querySelector<HTMLButtonElement>(".hm-categorias button")?.focus();
  }, [categoriasAbertas, layout]);
  const fecharCategorias = () => {
    if (layout === "amplo") setCategoriasOcultas(true);
    else setCategoriasAbertas(false);
    requestAnimationFrame(() => botaoCategorias.current?.focus());
  };
  const voltarCatalogo = () => {
    setDetalheAberto(false);
    requestAnimationFrame(() => ultimoCartao.current?.focus());
  };
  const grupoDe = (p: ProdutoHud) => p.grupo?.id ?? p.categoria;
  const categorias = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; vertente: string; n: number; g: string; subs: Map<string, number> }>();
    const ordem = new Map<string, number>();
    for (const p of produtos) {
      const id = grupoDe(p);
      const c = m.get(id) ?? {
        id, nome: p.grupo?.nome ?? p.categoriaRotulo, vertente: p.vertente, n: 0,
        g: p.grupo?.glifo ?? p.glifo ?? glifo(p.categoria), subs: new Map<string, number>(),
      };
      c.n++;
      if (p.sub) {
        c.subs.set(p.sub, (c.subs.get(p.sub) ?? 0) + 1);
        if (p.subOrdem != null) ordem.set(p.sub, p.subOrdem);
      }
      m.set(id, c);
    }
    for (const c of m.values()) {
      c.subs = new Map([...c.subs.entries()].sort(([a], [b]) => (ordem.get(a) ?? 50) - (ordem.get(b) ?? 50)));
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos]);
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selSlug, setSel] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const [feito, setFeito] = useState(false);
  const lista = useMemo(
    () => produtos.filter((p) => (!cat || grupoDe(p) === cat) && (!sub || p.sub === sub) && sem(p.nome).includes(sem(q))),
    [produtos, cat, sub, q],
  );
  const sel = produtos.find((p) => p.slug === selSlug) ?? lista[0] ?? produtos[0] ?? null;
  const porNome = (a: ProdutoHud, b: ProdutoHud) => a.nome.localeCompare(b.nome, "pt-BR");
  /* Com um grupo aberto que tem subcategorias, as seções são as
     subcategorias (na ordem da lista lateral); senão, uma por grupo. */
  const aberto = categorias.find((c) => c.id === cat);
  const grupos = aberto && aberto.subs.size > 0
    ? [...aberto.subs.keys()].filter((s) => !sub || s === sub)
        .map((s) => ({ c: { ...aberto, id: `${aberto.id}/${s}`, nome: s }, xs: lista.filter((p) => p.sub === s).sort(porNome) }))
        .concat([{ c: { ...aberto, id: `${aberto.id}/-`, nome: `Outros ${aberto.nome.toLocaleLowerCase("pt-BR")}` }, xs: sub ? [] : lista.filter((p) => !p.sub).sort(porNome) }])
        .filter((g) => g.xs.length)
    : categorias.filter((c) => !cat || c.id === cat)
        .map((c) => ({ c, xs: lista.filter((p) => grupoDe(p) === c.id).sort(porNome) }))
        .filter((g) => g.xs.length);
  const abrirGrupo = (id: string | null) => { setCat(id); setSub(null); setSel(null); setN(1); };

  const custo = sel ? sel.preco * n : 0;
  const cabe = !!sel && usados + sel.espacos * n <= capacidade;
  const comprar = () => {
    if (!sel) return;
    onComprar(sel.slug, n);
    setFeito(true); setTimeout(() => setFeito(false), 1200); setN(1);
  };

  return (
    <div ref={raiz} className={`hx hm-mercado ${oxanium.variable}`} data-detalhe={detalheAberto || undefined} data-categorias={categoriasAbertas || undefined} data-categorias-ocultas={categoriasOcultas || undefined} style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", border: "1px solid rgba(255,138,31,.4)", boxShadow: "0 0 0 6px var(--hx-abismo), 0 0 0 7px rgba(255,138,31,.13), 0 60px 120px #000" }}
      onKeyDown={(e) => { if (e.key === "Escape" && onFechar) { e.stopPropagation(); onFechar(); } }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: AMB, boxShadow: `0 0 14px ${AMB}` }} />
      <header className="hm-cabecalho">
        <div className="hm-identidade">
          <Tag style={{ color: AMB, opacity: .8 }}>// lista de mercadorias</Tag>
          <h2 className="hx-display hm-titulo">Mercado noturno<span className="hx-amb">.</span></h2>
        </div>
        <div className="hm-carteira">
          <div style={{ textAlign: "right" }}><Tag className="hx-dim">mochila</Tag><div className="hx-display" style={{ fontSize: 18, fontWeight: 700 }}>{usados}<span className="hx-dim">/{capacidade}</span></div></div>
          <div style={{ textAlign: "right" }}><Tag style={{ color: AMB, opacity: .7 }}>aretz</Tag><div className="hx-display" style={{ fontSize: 22, fontWeight: 900 }}><Aretz /> {fmt(saldo)}</div></div>
        </div>
        {onFechar && <button type="button" aria-label="Fechar mercado" className="hx-fechar-quad hm-fechar" onClick={onFechar}><Svg d="M6 6l12 12M18 6 6 18" tam={16} /></button>}
      </header>

      <div className="hm-corpo">
        {layout !== "amplo" && categoriasAbertas && <button type="button" className="hm-filtro-fundo" aria-label="Fechar categorias" onClick={fecharCategorias} />}
        <nav id={navId} className="hm-categorias" aria-label="Categorias" inert={!categoriasVisiveis}>
          <div className="hm-categorias-cab"><Tag className="hx-amb">Categorias</Tag><button type="button" className="hm-recolher" data-tooltip="Esconder categorias" aria-label="Esconder painel de categorias" onClick={fecharCategorias}><Svg d="M3 4h18v16H3V4Zm5 0v16m8-12-4 4 4 4m-4-4h7" tam={18} /></button></div>
          <button type="button" onClick={() => { abrirGrupo(null); if (layout !== "amplo") fecharCategorias(); }} className="hx-cat-linha" data-ativo={!cat || undefined} style={{ marginBottom: 8 }}>
            <span className="hx-display" style={{ flex: 1, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em" }}>Tudo</span><Tag className="hx-dim">{produtos.length}</Tag>
          </button>
          {categorias.map((c) => {
            const on = cat === c.id;
            const temSubs = c.subs.size > 0;
            return (
              <div key={c.id}>
                <button type="button" onClick={() => { abrirGrupo(on ? null : c.id); if (!temSubs && layout !== "amplo") fecharCategorias(); }} className="hx-cat-linha"
                  data-ativo={on || undefined} data-vertente={c.vertente} style={estiloGrupo(c.nome, c.vertente)} aria-expanded={temSubs ? on : undefined}>
                  <span className="hx-cat-fio" />
                  <span className="hx-cat-ico"><Svg d={c.g} tam={18} /></span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{c.nome}</span>
                  <Tag className="hx-dim" style={{ opacity: .7 }}>{c.n}</Tag>
                  {temSubs && <Svg d={on ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} tam={12} style={{ opacity: .6 }} />}
                </button>
                {on && temSubs && (
                  <div className="hx-subs" data-vertente={c.vertente} style={estiloGrupo(c.nome, c.vertente)}>
                    <button type="button" className="hx-sub-linha" data-ativo={!sub || undefined} onClick={() => { setSub(null); if (layout !== "amplo") fecharCategorias(); }}>Todos de {c.nome}</button>
                    {[...c.subs.entries()].map(([nome, qtd]) => (
                      <button key={nome} type="button" className="hx-sub-linha" data-ativo={sub === nome || undefined}
                        onClick={() => { setSub(sub === nome ? null : nome); setSel(null); setN(1); if (layout !== "amplo") fecharCategorias(); }}>
                        <span className="hx-sub-ponto" />
                        <span style={{ flex: 1 }}>{nome}</span>
                        <Tag className="hx-dim" style={{ opacity: .6 }}>{qtd}</Tag>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="hm-catalogo" inert={(layout === "compacto" && detalheAberto) || (layout !== "amplo" && categoriasAbertas)}>
          <div className="hm-ferramentas">
            <button ref={botaoCategorias} type="button" className="hm-filtro" hidden={categoriasVisiveis} data-tooltip="Mostrar categorias" aria-label="Mostrar categorias" aria-expanded={categoriasVisiveis} aria-controls={navId} onClick={() => { if (layout === "amplo") setCategoriasOcultas(false); else setCategoriasAbertas(true); }}>
              <Svg d={categoriasVisiveis ? "M3 4h18v16H3V4Zm5 0v16m8-12-4 4 4 4m-4-4h7" : "M3 4h18v16H3V4Zm5 0v16m5-12 4 4-4 4m4-4h-7"} tam={20} />
            </button>
            <label className="hx-busca">
              <Svg d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" tam={16} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mercadoria…" aria-label="Buscar mercadoria" />
            </label>
          </div>
          <div className="hm-lista">
            {grupos.map(({ c, xs }) => (
              <section key={c.id} data-vertente={c.vertente} style={estiloGrupo(xs[0].grupo?.nome ?? xs[0].categoriaRotulo, c.vertente)}>
                <div className="hm-secao-titulo" style={{ color: "var(--k)" }}>
                  <Svg d={c.g} tam={16} />
                  <span className="hx-display" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".18em" }}>{c.nome}</span>
                  <Tag className="hx-dim" style={{ opacity: .6 }}>{xs.length}</Tag>
                  <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, color-mix(in srgb, var(--k) 27%, transparent), transparent)" }} />
                </div>
                <div className="hm-grade">
                  {xs.map((p) => {
                    const on = p.slug === sel?.slug, pobre = p.preco > saldo;
                    return (
                      <button key={p.slug} type="button" onClick={(e) => { ultimoCartao.current = e.currentTarget; setSel(p.slug); setN(1); setDetalheAberto(true); }} className="hx-produto" data-ativo={on || undefined} aria-pressed={on}>
                        <span className="hx-produto-arte">
                          <span className="hx-produto-trama" />
                          <Svg d={p.glifo ?? glifo(p.categoria)} tam={52} cor="var(--k)" traco={1.1} style={{ opacity: .85, filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--k) 50%, transparent))" }} />
                          <span style={{ position: "absolute", right: 0, top: 0, width: 0, height: 0, borderLeft: "14px solid transparent", borderTop: `14px solid ${corRaridade(p.raridade)}` }} />
                          {/* O tipo vai no pé da arte, logo acima do nome: no rodapé ele quebrava o cartão. */}
                          {(p.tipo ?? separarTipo(p.nome).tipo) && (
                            <Tag className="hx-dim" style={{ position: "absolute", left: 12, right: 12, bottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", opacity: .8 }}>{p.tipo ?? separarTipo(p.nome).tipo}</Tag>
                          )}
                        </span>
                        <span className="hx-produto-fio" />
                        <span className="hm-card-info">
                          <span className="hx-display hm-card-nome">{separarTipo(p.nome).titulo}</span>
                          <span className="hm-card-preco hx-display" style={{ color: pobre ? "var(--hx-dim)" : undefined, textDecoration: pobre ? "line-through" : undefined }}><Aretz /> {fmt(p.preco)}</span>
                          <span className="hm-card-espacos">
                            <Espacos n={p.espacos} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!lista.length && <div style={{ padding: "80px 0", textAlign: "center" }}><Tag className="hx-dim">nenhuma mercadoria encontrada</Tag></div>}
          </div>
        </div>

        {sel ? (
          <aside className="hm-detalhe" data-vertente={sel.vertente} style={estiloGrupo(sel.grupo?.nome ?? sel.categoriaRotulo, sel.vertente)} inert={(layout === "compacto" && !detalheAberto) || (layout !== "amplo" && categoriasAbertas)} aria-label="Detalhes do produto">
            <button type="button" className="hm-voltar" onClick={voltarCatalogo}><Svg d="m14 5-7 7 7 7" tam={16} />Voltar ao catálogo</button>
            <div key={sel.slug} className="hm-leitura">
              {/* Cabeçalho no fluxo: cresce com o título em vez de subir por
                  cima da categoria. O título vai até perto do ícone, e o tipo
                  entre parênteses ("AS-10 Overdrive (Pistola pesada)") vira
                  subtítulo. */}
              <div className="hm-produto-cab" style={{ background: `radial-gradient(ellipse at 70% 50%, color-mix(in srgb, var(--k) 35%, ${CASCO}) 0%, ${CASCO} 70%)` }}>
                <span style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--k) 12%, transparent) 0 1px, transparent 1px 7px)" }} />
                <span className="hm-produto-glifo"><Svg d={sel.glifo ?? glifo(sel.categoria)} tam={140} cor="var(--k)" traco={.9} style={{ filter: "drop-shadow(0 0 24px var(--k))" }} /></span>
                <div className="hm-produto-tags">
                  <Tag style={{ color: "var(--k)" }}>{sel.categoriaRotulo}</Tag>
                  {sel.raridade && <><span style={{ width: 4, height: 4, transform: "rotate(45deg)", background: corRaridade(sel.raridade) }} /><Tag style={{ color: corRaridade(sel.raridade) }}>{sel.raridade}</Tag></>}
                </div>
                {(() => {
                  const separado = separarTipo(sel.nome);
                  const titulo = separado.titulo, tipo = sel.tipo ?? separado.tipo;
                  return (
                    <div className="hm-produto-identidade">
                      <h3 ref={tituloDetalhe} tabIndex={-1} className="hx-display hm-produto-nome">{titulo}</h3>
                      {tipo && <Tag style={{ display: "block", marginTop: 6, color: "var(--hx-ice)", opacity: .7 }}>{tipo}</Tag>}
                    </div>
                  );
                })()}
              </div>
              <div className="hm-descricao">
                {sel.descricao && <div style={{ fontSize: 15, lineHeight: 1.35, color: "var(--hx-texto)" }}>{sel.descricao}</div>}
                {sel.destaque && (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                    <span className="hx-display" style={{ fontSize: 40, fontWeight: 900, lineHeight: .85, color: "var(--k)" }}>{sel.destaque.valor}</span>
                    <div style={{ paddingBottom: 2, lineHeight: 1.2 }}><Tag className="hx-dim">{sel.destaque.rotulo}</Tag><div style={{ fontSize: 14, color: "var(--hx-texto)" }}>{sel.destaque.sufixo}</div></div>
                  </div>
                )}
                <div>
                  <Stat k="Espaços / item" v={sel.espacos} />
                  {sel.pa != null && <Stat k="Custo" v={`${sel.pa} PA`} />}
                  {sel.municao != null && <Stat k="Munição" v={sel.municao} />}
                  {sel.cargas != null && <Stat k="Cargas" v={sel.cargas} />}
                  {sel.linhas?.map((l) => <Stat key={l.rotulo} k={l.rotulo} v={l.valor} />)}
                </div>
                {sel.propriedades && sel.propriedades.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {sel.propriedades.map((x) => <span key={x} className="hx-display" style={{ padding: "2px 8px", background: "color-mix(in srgb, var(--k) 15%, transparent)", color: "var(--k)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>{x}</span>)}
                  </div>
                )}
              </div>
            </div>
            <div className="hm-compra">
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <div className="hx-passo">
                  <button type="button" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label="Menos">−</button>
                  <span className="hx-display" aria-live="polite">{n}</span>
                  <button type="button" onClick={() => setN(n + 1)} aria-label="Mais">+</button>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <Tag className="hx-dim">total</Tag>
                  <div className="hx-display" style={{ fontSize: 22, fontWeight: 900, color: custo > saldo ? PERIGO : undefined }}><Aretz /> {fmt(custo)}</div>
                </div>
              </div>
              {feito ? (
                <div className="hx-display" role="status" style={{ display: "grid", placeItems: "center", height: 44, border: `1px solid ${OK}80`, background: `${OK}1a`, color: OK, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".2em" }}>✓ Comprado</div>
              ) : (
                <button type="button" disabled={custo > saldo || !cabe} onClick={comprar} className="hx-btn-ambar" style={{ width: "100%" }}>
                  {custo > saldo ? "Saldo insuficiente" : !cabe ? "Sem espaço na mochila" : "Comprar"}
                </button>
              )}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}><Tag className="hx-dim" style={{ opacity: .7 }}>saldo após</Tag><Tag className="hx-dim">₳ {fmt(Math.max(0, saldo - custo))}</Tag></div>
            </div>
          </aside>
        ) : <aside className="hm-detalhe" />}
      </div>
    </div>
  );
}
