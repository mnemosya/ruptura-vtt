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

import { useMemo, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./hud-base.css";

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
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MercadoHud({ produtos, saldo, usados, capacidade, onComprar, onFechar }: PropsMercadoHud) {
  const categorias = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; vertente: string; n: number; g: string }>();
    for (const p of produtos) {
      const c = m.get(p.categoria) ?? { id: p.categoria, nome: p.categoriaRotulo, vertente: p.vertente, n: 0, g: p.glifo ?? glifo(p.categoria) };
      c.n++; m.set(p.categoria, c);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selSlug, setSel] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const [feito, setFeito] = useState(false);
  const lista = useMemo(() => produtos.filter((p) => (!cat || p.categoria === cat) && sem(p.nome).includes(sem(q))), [produtos, cat, q]);
  const sel = produtos.find((p) => p.slug === selSlug) ?? lista[0] ?? produtos[0] ?? null;
  const grupos = categorias.filter((c) => !cat || c.id === cat).map((c) => ({ c, xs: lista.filter((p) => p.categoria === c.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) })).filter((g) => g.xs.length);

  const custo = sel ? sel.preco * n : 0;
  const cabe = !!sel && usados + sel.espacos * n <= capacidade;
  const comprar = () => {
    if (!sel) return;
    onComprar(sel.slug, n);
    setFeito(true); setTimeout(() => setFeito(false), 1200); setN(1);
  };

  return (
    <div className={`hx ${oxanium.variable}`} style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", border: "1px solid rgba(255,138,31,.4)", boxShadow: "0 0 0 6px var(--hx-abismo), 0 0 0 7px rgba(255,138,31,.13), 0 60px 120px #000" }}
      onKeyDown={(e) => { if (e.key === "Escape" && onFechar) { e.stopPropagation(); onFechar(); } }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: AMB, boxShadow: `0 0 14px ${AMB}` }} />
      <header style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 24px", borderBottom: "1px solid rgba(0,212,255,.1)" }}>
        <div>
          <Tag style={{ color: AMB, opacity: .8 }}>// lista de mercadorias</Tag>
          <h2 className="hx-display" style={{ margin: 0, fontSize: 28, fontWeight: 900, textTransform: "uppercase", lineHeight: 1 }}>Mercado<span className="hx-amb">.</span></h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "right" }}><Tag className="hx-dim">mochila</Tag><div className="hx-display" style={{ fontSize: 18, fontWeight: 700 }}>{usados}<span className="hx-dim">/{capacidade}</span></div></div>
          <div style={{ textAlign: "right" }}><Tag style={{ color: AMB, opacity: .7 }}>aretz</Tag><div className="hx-display" style={{ fontSize: 22, fontWeight: 900 }}><Aretz /> {fmt(saldo)}</div></div>
          {onFechar && <button type="button" aria-label="Fechar mercado" className="hx-fechar-quad" onClick={onFechar}><Svg d="M6 6l12 12M18 6 6 18" tam={16} /></button>}
        </div>
      </header>

      <div style={{ display: "grid", minHeight: 0, flex: 1, gridTemplateColumns: "minmax(140px, 220px) minmax(0, 1fr) minmax(240px, 320px)" }}>
        <nav className="hx-semsb" aria-label="Categorias" style={{ overflowY: "auto", borderRight: "1px solid rgba(0,212,255,.1)", padding: "16px 12px" }}>
          <button type="button" onClick={() => setCat(null)} className="hx-cat-linha" data-ativo={!cat || undefined} style={{ marginBottom: 8 }}>
            <span className="hx-display" style={{ flex: 1, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em" }}>Tudo</span><Tag className="hx-dim">{produtos.length}</Tag>
          </button>
          {categorias.map((c) => {
            const on = cat === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setCat(on ? null : c.id)} className="hx-cat-linha" data-ativo={on || undefined} data-vertente={c.vertente}>
                <span className="hx-cat-fio" />
                <span className="hx-cat-ico"><Svg d={c.g} tam={18} /></span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{c.nome}</span>
                <Tag className="hx-dim" style={{ opacity: .7 }}>{c.n}</Tag>
              </button>
            );
          })}
        </nav>

        <div style={{ display: "flex", minHeight: 0, flexDirection: "column" }}>
          <div style={{ padding: "16px 24px 0" }}>
            <label className="hx-busca">
              <Svg d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" tam={16} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar mercadoria…" aria-label="Buscar mercadoria" />
            </label>
          </div>
          <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 28 }}>
            {grupos.map(({ c, xs }) => (
              <section key={c.id} data-vertente={c.vertente}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, color: "var(--k)" }}>
                  <Svg d={c.g} tam={16} />
                  <span className="hx-display" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".18em" }}>{c.nome}</span>
                  <Tag className="hx-dim" style={{ opacity: .6 }}>{xs.length}</Tag>
                  <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, color-mix(in srgb, var(--k) 27%, transparent), transparent)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                  {xs.map((p) => {
                    const on = p.slug === sel?.slug, pobre = p.preco > saldo;
                    return (
                      <button key={p.slug} type="button" onClick={() => { setSel(p.slug); setN(1); }} className="hx-produto" data-ativo={on || undefined} aria-pressed={on}>
                        <span className="hx-produto-arte">
                          <span className="hx-produto-trama" />
                          <Svg d={p.glifo ?? glifo(p.categoria)} tam={52} cor="var(--k)" traco={1.1} style={{ opacity: .85, filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--k) 50%, transparent))" }} />
                          <span style={{ position: "absolute", right: 0, top: 0, width: 0, height: 0, borderLeft: "14px solid transparent", borderTop: `14px solid ${corRaridade(p.raridade)}` }} />
                        </span>
                        <span className="hx-produto-fio" />
                        <span style={{ display: "block", borderTop: "1px solid rgba(0,212,255,.1)", background: CASCO, padding: "10px 12px", textAlign: "left" }}>
                          <span className="hx-display" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>{p.nome}</span>
                          <span style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span className="hx-display" style={{ fontSize: 15, fontWeight: 700, color: pobre ? "var(--hx-dim)" : undefined, textDecoration: pobre ? "line-through" : undefined }}><Aretz /> {fmt(p.preco)}</span>
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
          <aside key={sel.slug} className="hx-boot" data-vertente={sel.vertente} style={{ display: "flex", minHeight: 0, flexDirection: "column", borderLeft: "1px solid rgba(0,212,255,.1)", background: CASCO }}>
            <div style={{ position: "relative", height: 120, flexShrink: 0, overflow: "hidden", background: `radial-gradient(ellipse at 70% 50%, color-mix(in srgb, var(--k) 35%, ${CASCO}) 0%, ${CASCO} 70%)` }}>
              <span style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--k) 12%, transparent) 0 1px, transparent 1px 7px)" }} />
              <span style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", opacity: .8 }}><Svg d={sel.glifo ?? glifo(sel.categoria)} tam={140} cor="var(--k)" traco={.9} style={{ filter: "drop-shadow(0 0 24px var(--k))" }} /></span>
              <div style={{ position: "absolute", left: 16, top: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Tag style={{ color: "var(--k)" }}>{sel.categoriaRotulo}</Tag>
                {sel.raridade && <><span style={{ width: 4, height: 4, transform: "rotate(45deg)", background: corRaridade(sel.raridade) }} /><Tag style={{ color: corRaridade(sel.raridade) }}>{sel.raridade}</Tag></>}
              </div>
              <h3 className="hx-display" style={{ position: "absolute", bottom: 12, left: 16, margin: 0, maxWidth: 230, fontSize: 26, fontWeight: 900, textTransform: "uppercase", lineHeight: .95, letterSpacing: ".02em", textShadow: "0 2px 0 #000" }}>{sel.nome}</h3>
            </div>
            <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
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
            <div style={{ borderTop: "1px solid rgba(255,138,31,.25)", background: "rgba(0,0,0,.3)", padding: 16 }}>
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
                  {custo > saldo ? "Saldo insuficiente" : !cabe ? "Sem espaço na mochila" : "Comprar → mochila"}
                </button>
              )}
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}><Tag className="hx-dim" style={{ opacity: .7 }}>saldo após</Tag><Tag className="hx-dim">₳ {fmt(Math.max(0, saldo - custo))}</Tag></div>
            </div>
          </aside>
        ) : <aside style={{ borderLeft: "1px solid rgba(0,212,255,.1)" }} />}
      </div>
    </div>
  );
}
