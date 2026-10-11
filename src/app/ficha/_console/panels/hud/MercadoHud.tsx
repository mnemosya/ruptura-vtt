"use client";

import { estiloCategoria as estiloGrupo } from "../../../../_design/itemCategoryColors";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";

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
 * Cor de categoria: paleta compartilhada com Inventário e Equipamentos.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./hud-base.css";
import "./mercado-layout.css";

const AMB = "#ff8a1f", CASCO = "#081925", PERIGO = "#ff5f74", OK = "#22d3aa";
const RAR: Record<string, string> = { comum: "#7f95b3", incomum: OK, raro: "#8b5cf6", "muito raro": "#8b5cf6", lendario: AMB, lendário: AMB };
const corRaridade = (r?: string | null) => (r ? RAR[r.toLowerCase()] ?? "#7f95b3" : "#7f95b3");
const fmt = (n: number) => n.toLocaleString("pt-BR");

import { X, Search, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";

export interface ProdutoHud {
  /** Complementos aparecem na ficha de seus escalpos base. */
  parentSlugs?: string[];
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
  const bases = useMemo(() => produtos.filter(p => !p.parentSlugs?.length), [produtos]);
  const categorias = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; vertente: string; n: number; subs: Map<string, number> }>();
    const ordem = new Map<string, number>();
    for (const p of bases) {
      const id = grupoDe(p);
      const c = m.get(id) ?? {
        id, nome: p.grupo?.nome ?? p.categoriaRotulo, vertente: p.vertente, n: 0,
        subs: new Map<string, number>(),
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
  }, [bases]);
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selSlug, setSel] = useState<string | null>(null);
  const [complementoSlug, setComplemento] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const [feito, setFeito] = useState(false);
  const lista = useMemo(
    () => bases.filter((p) => (!cat || grupoDe(p) === cat) && (!sub || p.sub === sub) && (sem(p.nome).includes(sem(q)) || produtos.some(c => c.parentSlugs?.includes(p.slug) && sem(c.nome).includes(sem(q))))),
    [bases, produtos, cat, sub, q],
  );
  const sel = lista.find((p) => p.slug === selSlug) ?? lista[0] ?? null;
  const complementos = produtos.filter(p => sel && p.parentSlugs?.includes(sel.slug));
  const alvo = complementos.find(p => p.slug === complementoSlug) ?? sel;
  const familiaEscalpo = sel?.grupo?.id === "escalpos" && sel.categoria !== "modulo_escalpo" && sel.categoria !== "veneno";
  const escolherComplemento = (slug: string | null) => { setComplemento(slug); setN(1); setFeito(false); };
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
  const abrirGrupo = (id: string | null) => { setCat(id); setSub(null); setSel(null); setComplemento(null); setFeito(false); setN(1); };

  const custo = alvo ? alvo.preco * n : 0;
  const cabe = !!alvo && usados + alvo.espacos * n <= capacidade;
  const comprar = () => {
    if (!alvo) return;
    onComprar(alvo.slug, n);
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
        {onFechar && <button type="button" aria-label="Fechar mercado" className="hx-fechar-quad hm-fechar" onClick={onFechar}><X size={16} aria-hidden="true" /></button>}
      </header>

      <div className="hm-corpo">
        {layout !== "amplo" && categoriasAbertas && <button type="button" className="hm-filtro-fundo" aria-label="Fechar categorias" onClick={fecharCategorias} />}
        <nav id={navId} className="hm-categorias" aria-label="Categorias" inert={!categoriasVisiveis}>
          <div className="hm-categorias-cab"><Tag className="hx-amb">Categorias</Tag><button type="button" className="hm-recolher" data-tooltip="Esconder categorias" aria-label="Esconder painel de categorias" onClick={fecharCategorias}><PanelLeftClose size={18} aria-hidden="true" /></button></div>
          <button type="button" onClick={() => { abrirGrupo(null); if (layout !== "amplo") fecharCategorias(); }} className="hx-cat-linha" data-ativo={!cat || undefined} style={{ marginBottom: 8 }}>
            <span className="hx-display" style={{ flex: 1, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em" }}>Tudo</span><Tag className="hx-dim">{bases.length}</Tag>
          </button>
          {categorias.map((c) => {
            const on = cat === c.id;
            const temSubs = c.subs.size > 0;
            return (
              <div key={c.id}>
                <button type="button" onClick={() => { abrirGrupo(on ? null : c.id); if (!temSubs && layout !== "amplo") fecharCategorias(); }} className="hx-cat-linha"
                  data-ativo={on || undefined} data-vertente={c.vertente} style={estiloGrupo(c.nome, c.vertente)} aria-expanded={temSubs ? on : undefined}>
                  <span className="hx-cat-fio" />
                  <span className="hx-cat-ico"><ItemCategoryIcon category={c.nome} size={18} /></span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{c.nome}</span>
                  <Tag className="hx-dim" style={{ opacity: .7 }}>{c.n}</Tag>
                  {temSubs && (on ? <ChevronDown size={12} aria-hidden="true" style={{ opacity: .6 }} /> : <ChevronRight size={12} aria-hidden="true" style={{ opacity: .6 }} />)}
                </button>
                {on && temSubs && (
                  <div className="hx-subs" data-vertente={c.vertente} style={estiloGrupo(c.nome, c.vertente)}>
                    <button type="button" className="hx-sub-linha" data-ativo={!sub || undefined} onClick={() => { setSub(null); if (layout !== "amplo") fecharCategorias(); }}>Todos de {c.nome}</button>
                    {[...c.subs.entries()].map(([nome, qtd]) => (
                      <button key={nome} type="button" className="hx-sub-linha" data-ativo={sub === nome || undefined}
                        onClick={() => { setSub(sub === nome ? null : nome); setSel(null); escolherComplemento(null); if (layout !== "amplo") fecharCategorias(); }}>
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
              {categoriasVisiveis ? <PanelLeftClose size={20} aria-hidden="true" /> : <PanelLeftOpen size={20} aria-hidden="true" />}
            </button>
            <label className="hx-busca">
              <Search size={16} aria-hidden="true" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mercadoria…" aria-label="Buscar mercadoria" />
            </label>
          </div>
          <div className="hm-lista">
            {grupos.map(({ c, xs }) => (
              <section key={c.id} data-vertente={c.vertente} style={estiloGrupo(xs[0].grupo?.nome ?? xs[0].categoriaRotulo, c.vertente)}>
                <div className="hm-secao-titulo" style={{ color: "var(--k)" }}>
                  <ItemCategoryIcon category={xs[0].grupo?.nome ?? xs[0].categoriaRotulo} size={16} />
                  <span className="hx-display" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".18em" }}>{c.nome}</span>
                  <Tag className="hx-dim" style={{ opacity: .6 }}>{xs.length}</Tag>
                  <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, color-mix(in srgb, var(--k) 27%, transparent), transparent)" }} />
                </div>
                <div className="hm-grade">
                  {xs.map((p) => {
                    const on = p.slug === sel?.slug, pobre = p.preco > saldo;
                    const filhos = produtos.filter(c => c.parentSlugs?.includes(p.slug));
                    const rotulo = filhos.every(c => c.categoria === "veneno") ? "veneno" : "módulo";
                    return (
                      <button key={p.slug} type="button" onClick={(e) => { ultimoCartao.current = e.currentTarget; setSel(p.slug); escolherComplemento(null); setDetalheAberto(true); }} className="hx-produto" data-ativo={on || undefined} aria-pressed={on}>
                        <span className="hx-produto-arte">
                          <span className="hx-produto-trama" />
                          <ItemCategoryIcon category={p.categoria} group={p.grupo?.nome} weaponName={p.nome} size={52} color="var(--k)" strokeWidth={1.1} style={{ opacity: .85, filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--k) 50%, transparent))" }} />
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
                            {filhos.length > 0 && <span className="hm-card-complementos">{filhos.length} {rotulo}{filhos.length !== 1 ? "s" : ""}</span>}
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
          <aside className="hm-detalhe" data-escalpo={familiaEscalpo || undefined} data-vertente={sel.vertente} style={estiloGrupo(sel.grupo?.nome ?? sel.categoriaRotulo, sel.vertente)} inert={(layout === "compacto" && !detalheAberto) || (layout !== "amplo" && categoriasAbertas)} aria-label="Detalhes do produto">
            <button type="button" className="hm-voltar" onClick={voltarCatalogo}><ChevronLeft size={16} aria-hidden="true" />Voltar ao catálogo</button>
            <div key={sel.slug} className="hm-leitura">
              {/* Cabeçalho no fluxo: cresce com o título em vez de subir por
                  cima da categoria. O título vai até perto do ícone, e o tipo
                  entre parênteses ("AS-10 Overdrive (Pistola pesada)") vira
                  subtítulo. */}
              <div className="hm-produto-cab" style={{ background: `radial-gradient(ellipse at 70% 50%, color-mix(in srgb, var(--k) 35%, ${CASCO}) 0%, ${CASCO} 70%)` }}>
                <span style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--k) 12%, transparent) 0 1px, transparent 1px 7px)" }} />
                <span className="hm-produto-glifo"><ItemCategoryIcon category={sel.categoria} group={sel.grupo?.nome} weaponName={sel.nome} size={140} color="var(--k)" strokeWidth={.9} style={{ filter: "drop-shadow(0 0 24px var(--k))" }} /></span>
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
                {familiaEscalpo && <button type="button" className="hm-escalpo-base" aria-pressed={alvo === sel} onClick={() => escolherComplemento(null)}>
                  <span className="hm-base-identidade"><strong>{sel.sub === "Identidade" ? "Item de identidade" : "Escalpo base"}</strong><span>{alvo === sel ? "Selecionado para compra" : "Selecionar para compra"}</span></span>
                  <strong className="hm-base-preco">₳ {fmt(sel.preco)}</strong>
                </button>}
              </div>
              {complementos.length > 0 && <section className="hm-complementos" aria-label="Complementos do escalpo">
                <div className="hm-complementos-cab"><Tag className="hx-dim">{complementos.every(p => p.categoria === "veneno") ? "Venenos compatíveis" : "Módulos compatíveis"}</Tag><Tag>{complementos.length}</Tag></div>
                <div className="hm-complementos-lista">{complementos.map(p => <button key={p.slug} type="button" className="hm-complemento" aria-pressed={alvo?.slug === p.slug} onClick={() => escolherComplemento(p.slug)}>
                  <ItemCategoryIcon category={p.categoria} size={16} />
                  <span className="hm-complemento-texto"><strong>{p.nome}</strong>{alvo?.slug === p.slug && <span className="hm-complemento-descricao">{p.descricao}<span>{p.espacos} espaço{p.espacos !== 1 ? "s" : ""} / item</span></span>}</span><span className="hm-complemento-preco">₳ {fmt(p.preco)}</span>
                </button>)}</div>
              </section>}
            </div>
            <div className="hm-compra">
              {familiaEscalpo && alvo && <div className="hm-compra-alvo"><Tag className="hx-dim">{alvo === sel ? (sel.sub === "Identidade" ? "Identidade" : "Escalpo base") : alvo.categoria === "veneno" ? "Dose de veneno" : "Módulo"}</Tag><strong>{alvo.nome}</strong></div>}
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
                <button type="button" disabled={custo > saldo} onClick={comprar} className="hx-btn-ambar" style={{ width: "100%" }}>
                  {custo > saldo ? "Saldo insuficiente" : familiaEscalpo ? `Comprar ${alvo === sel ? (sel.sub === "Identidade" ? "item" : "escalpo") : alvo?.categoria === "veneno" ? "veneno" : "módulo"}` : "Comprar"}
                </button>
              )}
              {/* Sem espaço NÃO bloqueia: a compra vai para a mochila e a régua
                  mostra o excesso — é para isso que o estado de excesso existe. */}
              {!cabe && !feito && custo <= saldo && (
                <div role="note" style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}><Tag style={{ color: AMB }}>vai exceder a mochila</Tag><Tag style={{ color: AMB }}>{usados + (alvo?.espacos ?? 0) * n}/{capacidade}</Tag></div>
              )}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}><Tag className="hx-dim" style={{ opacity: .7 }}>saldo após</Tag><Tag className="hx-dim">₳ {fmt(Math.max(0, saldo - custo))}</Tag></div>
            </div>
          </aside>
        ) : <aside className="hm-detalhe" />}
      </div>
    </div>
  );
}
