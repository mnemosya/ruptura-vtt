"use client";

/**
 * MAGIAS — o "anel de vertentes" do protótipo
 * (`inventario equip magia/src/Spells.tsx`), na linguagem da Forja.
 *
 * As seis vertentes num anel hexagonal; escolher uma desdobra o
 * grimório dela por nível, e a leitura completa abre num modal sobre o
 * corpo do Console.
 *
 * Só apresentação: recebe as magias já resolvidas (`MagiaHud`) e manda
 * as ações por callback. Quem lê `SpellContent`, nível de vertente e
 * mana é o `MagiasPanel`; a galeria (`/dev/estilos`) alimenta com dados
 * de exemplo.
 *
 * Cor de vertente = a paleta canônica do VTT, não a do protótipo.
 */

import { useEffect, useState, type ReactNode } from "react";
import { oxanium } from "../../../../_design/oxanium";
import "./hud-base.css";

export const VERTENTES_HUD = [
  { id: "cinetica", nome: "Cinética", c: "#e0455f", s: "CIN", g: "M4 12h10m-4-5 5 5-5 5M17 5v14" },
  { id: "energetica", nome: "Energética", c: "#f07a1f", s: "ENE", g: "M13 2 5 14h6l-1 8 8-12h-6l1-8Z" },
  { id: "material", nome: "Material", c: "#f5a200", s: "MAT", g: "M12 3 20 8v8l-8 5-8-5V8l8-5Zm0 0v18M4 8l8 5 8-5" },
  { id: "biotica", nome: "Biótica", c: "#2f9e56", s: "BIO", g: "M12 21c-5-3-8-7-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11Z" },
  { id: "sinaptica", nome: "Sináptica", c: "#35c7d8", s: "SIN", g: "M5 6a2 2 0 1 0 0 .1M19 6a2 2 0 1 0 0 .1M12 19a2 2 0 1 0 0 .1M6.5 7.5 11 17.5M17.5 7.5 13 17.5M7 6h10" },
  { id: "cognitiva", nome: "Cognitiva", c: "#8b5cf6", s: "COG", g: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" },
] as const;
type VertDef = (typeof VERTENTES_HUD)[number];
const VERT = (id: string): VertDef => VERTENTES_HUD.find((v) => v.id === id) ?? VERTENTES_HUD[0];
const COR_TIPO: Record<string, string> = { ataque: "#ff5f74", suporte: "#22d3aa", controle: "#f5a200", utilidade: "#6ff0ff", defesa: "#f5a200" };
const corTipo = (t: string) => COR_TIPO[t.toLowerCase()] ?? "#7f95b3";
const CY = "#00d4ff", AMB = "#ff8a1f", GELO = "#cfeff4", CASCO = "#081925";

export interface MagiaHud {
  slug: string;
  nome: string;
  /** Slug CANÔNICO da vertente (`cinetica`, `biotica`…). */
  vertente: string;
  nivel: number;
  tipo: string;
  mana: number | null;
  pa: number;
  alcance?: string | null;
  area?: string | null;
  duracao?: string | null;
  reacao?: boolean;
  /** Texto de sabor (nó: o painel passa com glossário). */
  descricao?: ReactNode;
  /** O que a magia faz (nó). */
  efeito?: ReactNode;
  /** "1d6" ou valor fixo — presente = a magia tem dano para rolar. */
  dano?: string | null;
  /** Ex.: "Vigor · CD 8 (condicional)". */
  resistencia?: string | null;
  /** Efeitos que a mesa resolve na mão. */
  manuais?: ReactNode[];
  /** Nível de vertente insuficiente para conjurar. */
  bloqueada: boolean;
}

export interface PropsMagiasHud {
  magias: MagiaHud[];
  /** Nível investido por vertente (canônica). `null`/ausente = desconhecido. */
  niveis: Record<string, number | null | undefined>;
  mana: { atual: number; max: number };
  somenteLeitura?: boolean;
  onConjurar: (slug: string) => void;
  onConjurarComFusao: (slug: string, fundida: string) => void;
  onRolarDano: (slug: string) => void;
  /** Mensagem do grimório vazio quando não há magia aprendida nenhuma. */
  vazio?: string;
}

/** CD = 6 + nível — nunca 5 + nível (regra do VTT, `getVertenteCd`). */
const cdDe = (n: number | null | undefined) => (n == null ? null : 6 + n);

/* ── primitivas ── */
function Glifo({ v, tam = 20, traco = 1.6, cor }: { v: VertDef; tam?: number; traco?: number; cor?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke={cor ?? v.c} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={v.g} />
    </svg>
  );
}
const Pips = ({ n, c, max = 5 }: { n: number; c: string; max?: number }) => (
  <span style={{ display: "inline-flex", gap: 2 }}>
    {Array.from({ length: max }, (_, i) => <span key={i} style={{ width: 5, height: 7, transform: "skewX(-20deg)", background: i < n ? c : "rgba(0,212,255,.08)" }} />)}
  </span>
);
const Tag = ({ children, style, className = "" }: { children: ReactNode; style?: React.CSSProperties; className?: string }) =>
  <span className={`hx-tag ${className}`} style={style}>{children}</span>;

function Secao({ titulo, lado, children }: { titulo: string; lado?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, transform: "rotate(45deg)", border: "1px solid rgba(0,212,255,.5)" }} />
        <span className="hx-display" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".22em", color: GELO, opacity: .8 }}>{titulo}</span>
        <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, rgba(0,212,255,.25), transparent)" }} />{lado}
      </div>
      {children}
    </section>
  );
}

function BarraMana({ mana }: { mana: { atual: number; max: number } }) {
  const max = Math.max(mana.max, 0), cheias = Math.max(0, Math.min(mana.atual, max));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Tag className="hx-dim" style={{ fontSize: 9 }}>mana</Tag>
      <span style={{ display: "flex", flex: 1, gap: 3 }}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{ height: 10, flex: 1, transform: "skewX(-20deg)", background: i < cheias ? CY : "rgba(0,212,255,.08)", boxShadow: i < cheias ? `0 0 8px -2px ${CY}` : undefined }} />
        ))}
      </span>
      <span className="hx-display hx-cy" style={{ fontSize: 15, fontWeight: 900 }}>{mana.atual}<span className="hx-dim" style={{ fontSize: 10 }}>/{mana.max}</span></span>
    </div>
  );
}

function Faixa({ m, children }: { m: MagiaHud; children?: ReactNode }) {
  const v = VERT(m.vertente), c = v.c;
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", height: 170, flexShrink: 0, overflow: "hidden", background: `radial-gradient(circle at 50% 55%, ${c}38, transparent 62%)` }}>
      <span className="hx-hexgrid" style={{ position: "absolute", inset: 0, opacity: .6 }} />
      <span className="hx-scan" style={{ position: "absolute", inset: 0 }} />
      <span className="hx-spin" style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", border: `1px dashed ${c}44` }} />
      <span className="hx-spinr" style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `1px solid ${c}30` }} />
      {[18, 34, 52, 66, 80].map((x, i) => <span key={i} className="hx-mote" style={{ position: "absolute", bottom: 16, left: `${x}%`, width: 3, height: 3, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}`, animationDelay: `${i * .8}s` }} />)}
      <span className="hx-floaty" style={{ position: "relative" }}><Glifo v={v} tam={56} traco={1.2} /></span>
      {children}
    </div>
  );
}

function Titulo({ m, nivel }: { m: MagiaHud; nivel: number | null | undefined }) {
  const v = VERT(m.vertente), c = v.c, cd = cdDe(nivel);
  const sep = <span style={{ width: 1, height: 12, background: "rgba(0,212,255,.2)" }} />;
  return (
    <div style={{ position: "relative", padding: "20px 16px 14px", borderBottom: "1px solid rgba(0,212,255,.1)", background: `linear-gradient(180deg, ${c}0f, transparent)` }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, ${c}, ${c}00 70%)` }} />
      <div className="hx-display" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".06em" }}>{m.nome}</div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Tag style={{ fontSize: 9, letterSpacing: ".16em", color: c }}>{v.nome}</Tag>
        {sep}
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Tag className="hx-dim" style={{ fontSize: 8 }}>nv</Tag><Pips n={m.nivel} c={c} /></span>
        {m.tipo && <>{sep}<Tag style={{ fontSize: 9, letterSpacing: ".16em", color: corTipo(m.tipo) }}>{m.tipo}</Tag></>}
        <span style={{ marginLeft: "auto", display: "flex" }}>
          <span title="seu nível na vertente" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(0,212,255,.07)" }}>
            <Tag className="hx-dim" style={{ fontSize: 8 }}>nv</Tag>
            <span className="hx-display" style={{ fontSize: 13, fontWeight: 900, color: c }}>{nivel ?? "—"}<span className="hx-dim" style={{ fontSize: 9 }}>/5</span></span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: c + "24" }}>
            <Tag style={{ fontSize: 8, color: c }}>cd</Tag>
            <span className="hx-display" style={{ fontSize: 15, fontWeight: 900 }}>{cd ?? "—"}</span>
          </span>
        </span>
      </div>
    </div>
  );
}

function Leitura({ m, mana }: { m: MagiaHud; mana: { atual: number; max: number } }) {
  const custo = m.mana ?? 0, falta = custo > mana.atual, mc = falta ? "#ff5f74" : CY;
  const c = VERT(m.vertente).c;
  const Fato = ({ l, v }: { l: string; v: ReactNode }) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
      <Tag className="hx-dim" style={{ fontSize: 9 }}>{l}</Tag><span style={{ fontSize: 14, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
  const Dia = ({ n, on, c: cc }: { n: number; on: number; c: string }) => (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {Array.from({ length: Math.min(n, 6) }, (_, i) => <i key={i} style={{ width: 7, height: 7, transform: "rotate(45deg)", background: i < on ? cc : "transparent", border: `1px solid ${cc}`, opacity: i < on ? 1 : .55 }} />)}
      {n > 6 && <span className="hx-mono" style={{ fontSize: 9, color: cc }}>+{n - 6}</span>}
    </span>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", borderLeft: `2px solid ${mc}`, background: CASCO }}>
        <div style={{ flex: 1, padding: "10px 16px 10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Tag className="hx-dim" style={{ fontSize: 8 }}>custo</Tag>
            {m.mana != null && <span className="hx-mono" style={{ fontSize: 9, color: falta ? mc : "var(--hx-dim)" }}>{falta ? `faltam ${custo - mana.atual}` : `resta ${mana.atual - custo}`}</span>}
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hx-display" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: mc }}>{m.mana ?? "—"}</span>
            <span className="hx-mono hx-dim" style={{ fontSize: 9 }}>mana</span>
            <span style={{ marginLeft: "auto" }}><Dia n={custo} on={Math.min(custo, mana.atual)} c={mc} /></span>
          </div>
        </div>
        <div style={{ margin: 8, width: 1, transform: "skewX(-20deg)", background: "rgba(0,212,255,.2)" }} />
        <div style={{ flex: 1, padding: "10px 16px" }}>
          <Tag className="hx-dim" style={{ fontSize: 8, display: "block" }}>ação</Tag>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hx-display hx-amb" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{m.pa}</span>
            <span className="hx-mono hx-dim" style={{ fontSize: 9 }}>PA</span>
            <span style={{ marginLeft: "auto" }}><Dia n={m.pa} on={m.pa} c={AMB} /></span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {m.alcance && <Fato l="alcance" v={m.alcance} />}
        {m.area && <Fato l="área" v={m.area} />}
        {m.duracao && <Fato l="duração" v={m.duracao} />}
        {m.reacao && <Fato l="reação" v="Sim" />}
        {m.dano && <Fato l="dano" v={<span className="hx-display" style={{ color: "#ff5f74", fontWeight: 900 }}>{m.dano}</span>} />}
      </div>
      {m.descricao && <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "var(--hx-texto)", opacity: .8 }}>{m.descricao}</div>}
      {m.efeito && <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: `2px solid ${c}`, fontSize: 14, lineHeight: 1.6, color: "var(--hx-texto)" }}>{m.efeito}</div>}
      {m.resistencia && <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>Resistência: {m.resistencia}. Resolvida pelo alvo após conjurar.</p>}
      {m.manuais?.map((t, i) => <div key={i} style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>{t}</div>)}
      {m.bloqueada && <p style={{ marginTop: 12, fontSize: 13, color: "#ff5f74" }}>Nível de vertente insuficiente para conjurar esta magia.</p>}
    </div>
  );
}

function Busca({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, width: 200, padding: "4px", borderBottom: "1px solid rgba(0,212,255,.2)" }}>
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} className="hx-dim"><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar magia" aria-label="Buscar magia" style={{ width: "100%", background: "transparent", border: 0, outline: "none", fontSize: 14 }} />
    </label>
  );
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MagiasHud(props: PropsMagiasHud) {
  const { magias, niveis, mana } = props;
  /* Vertente inicial: a de maior nível; empate cai na primeira com magia. */
  const inicial = [...VERTENTES_HUD].sort((a, b) => (niveis[b.id] ?? -1) - (niveis[a.id] ?? -1)
    || magias.filter((m) => m.vertente === b.id).length - magias.filter((m) => m.vertente === a.id).length)[0].id;
  const [vid, setVid] = useState<string>(inicial);
  const [aberta, setAberta] = useState<string | null>(null);
  const [fusao, setFusao] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [vid]);
  useEffect(() => { setFusao(""); }, [aberta]);

  const v = VERT(vid), c = v.c, nv = niveis[vid];
  const daVertente = magias.filter((m) => m.vertente === vid);
  const lista = daVertente.filter((m) => sem(m.nome).includes(sem(q))).sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const nivelMax = Math.max(5, ...lista.map((m) => m.nivel));
  const magiaAberta = magias.find((m) => m.slug === aberta) ?? null;
  const outras = magiaAberta ? magias.filter((m) => m.slug !== magiaAberta.slug) : [];
  const fundida = outras.find((m) => m.slug === fusao);
  const conjuravel = (m: MagiaHud) => !m.bloqueada && (m.mana == null || m.mana <= mana.atual);
  const R = 120, C = 170;

  return (
    <div className={`hx hx-grade ${oxanium.variable}`} style={{ position: "relative", height: "100%", minHeight: 620, overflow: "hidden" }}
      onKeyDown={(e) => { if (e.key === "Escape") setAberta(null); }}>
      <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "360px 1fr", height: "100%" }}>
        {/* anel */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", borderRight: "1px solid rgba(0,212,255,.1)" }}>
          <div style={{ position: "relative", marginTop: 24, width: C * 2, height: C * 2 }}>
            <svg style={{ position: "absolute", inset: 0 }} width={C * 2} height={C * 2}>
              <circle cx={C} cy={C} r={R} fill="none" stroke={CY} strokeOpacity=".12" strokeDasharray="2 6" />
              <circle cx={C} cy={C} r={R + 44} fill={CASCO} fillOpacity=".85" stroke={CY} strokeOpacity=".14" />
              {VERTENTES_HUD.map((x, i) => {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                return <line key={x.id + (x.id === vid ? vid : "")} className={x.id === vid ? "hx-drawln" : ""} x1={C + Math.cos(a) * 60} y1={C + Math.sin(a) * 60} x2={C + Math.cos(a) * (R - 38)} y2={C + Math.sin(a) * (R - 38)} stroke={x.id === vid ? x.c : CY} strokeOpacity={x.id === vid ? .7 : .08} />;
              })}
            </svg>
            {VERTENTES_HUD.map((x, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2, on = x.id === vid, n = magias.filter((m) => m.vertente === x.id).length;
              const lado = on ? { w: 63, h: 56 } : { w: 54, h: 48 };
              return (
                <button key={x.id} type="button" onClick={() => setVid(x.id)} aria-pressed={on} aria-label={`${x.nome}: ${n} magia${n === 1 ? "" : "s"}`}
                  style={{ position: "absolute", left: C + Math.cos(a) * R, top: C + Math.sin(a) * R, transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span className="hx-ch-hex" style={{ display: "grid", placeItems: "center", width: lado.w, height: lado.h, opacity: on || n ? 1 : .55, transition: "all .2s", background: on ? x.c : x.c + "1f" }}>
                    <Glifo v={x} tam={on ? 24 : 20} traco={1.8} cor={on ? "#031014" : x.c} />
                  </span>
                  <span className="hx-mono" style={{ fontSize: 9, letterSpacing: ".16em", color: on ? x.c : niveis[x.id] ? "var(--hx-dim)" : "#46647a" }}>{x.s} <span className="hx-dim">{n}</span></span>
                </button>
              );
            })}
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "grid", placeItems: "center", width: 118, height: 118, borderRadius: "50%", border: `1px solid ${c}55`, background: `radial-gradient(circle, ${c}22, transparent 70%)`, transition: "all .5s" }}>
              <div style={{ textAlign: "center" }}>
                <div className="hx-display" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: c }}>{nv ?? "—"}</div>
                <Tag className="hx-dim" style={{ fontSize: 8 }}>nível / 5</Tag>
              </div>
            </div>
          </div>
          <div key={vid} className="hx-rise" style={{ marginTop: 16, width: "100%", padding: "0 24px", textAlign: "center" }}>
            <div className="hx-display" style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".18em", color: c }}>{v.nome}</div>
            <Tag className="hx-dim" style={{ marginTop: 8, display: "block", fontSize: 9 }}>{nv ? "vertente aprendida" : nv === 0 ? "vertente não aprendida" : "nível não definido"}</Tag>
            <div className="hx-ch" style={{ marginTop: 16, padding: 1, background: "rgba(0,212,255,.1)" }}>
              <div className="hx-ch" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: CASCO }}>
                {([
                  ["nível", <>{nv ?? "—"}<span className="hx-dim" style={{ fontSize: 12 }}>/5</span></>, <Pips key="p" n={nv ?? 0} c={c} />],
                  ["cd", cdDe(nv) ?? "—", <span key="s" className="hx-mono hx-dim" style={{ fontSize: 9 }}>{nv != null ? `6 + ${nv}` : "indisponível"}</span>],
                  ["magias", daVertente.length, <span key="m" className="hx-mono hx-dim" style={{ fontSize: 9 }}>conhecidas</span>],
                ] as [string, ReactNode, ReactNode][]).map(([l, val, sub], i) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 0", borderLeft: i ? "1px solid rgba(0,212,255,.1)" : undefined }}>
                    <Tag className="hx-dim" style={{ fontSize: 8 }}>{l}</Tag>
                    <span className="hx-display" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: l === "nível" ? c : GELO }}>{val}</span>
                    <span style={{ display: "flex", height: 10, alignItems: "center" }}>{sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "auto", width: "100%", padding: "16px 24px 20px" }}><BarraMana mana={mana} /></div>
        </div>

        {/* grimório */}
        <div style={{ display: "flex", minHeight: 0, flexDirection: "column", padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="hx-display" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".22em", opacity: .7 }}>grimório</span>
            <Busca q={q} setQ={setQ} />
          </div>
          <div className="hx-semsb" style={{ marginTop: 8, minHeight: 0, flex: 1, overflowY: "auto", paddingBottom: 20 }}>
            {Array.from({ length: nivelMax }, (_, i) => i + 1).map((n) => {
              const linha = lista.filter((m) => m.nivel === n);
              if (!linha.length) return null;
              return (
                <Secao key={n} titulo={`nível ${n}`} lado={<Pips n={Math.min(n, 5)} c={c} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {linha.map((m, i) => (
                      <div key={vid + m.slug} className="hx-rise" style={{ animationDelay: `${i * 45 + (n - 1) * 70}ms` }}>
                        <button type="button" onClick={() => setAberta(m.slug)} className="hx-ch hx-cartao-magia" style={{ display: "block", width: "100%", padding: 1, opacity: conjuravel(m) ? 1 : .5 }}>
                          <span className="hx-ch" style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: CASCO, textAlign: "left" }}>
                            <span style={{ width: 3, alignSelf: "stretch", background: corTipo(m.tipo) }} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="hx-display" style={{ display: "block", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{m.nome}</span>
                              <span className="hx-mono hx-dim" style={{ display: "block", marginTop: 4, fontSize: 9, textTransform: "uppercase", letterSpacing: ".14em" }}>
                                {[m.alcance, m.duracao].filter(Boolean).join(" · ")}{m.tipo && <> · <span style={{ color: corTipo(m.tipo) }}>{m.tipo}</span></>}
                              </span>
                            </span>
                            <span style={{ textAlign: "right" }}><span className="hx-display hx-cy" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{m.mana ?? "—"}</span><Tag className="hx-dim" style={{ display: "block", fontSize: 8 }}>mana</Tag></span>
                            <span style={{ textAlign: "right" }}><span className="hx-display hx-amb" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{m.pa}</span><Tag className="hx-dim" style={{ display: "block", fontSize: 8 }}>pa</Tag></span>
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </Secao>
              );
            })}
            {!lista.length && (
              <div className="hx-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 24px 24px", textAlign: "center" }}>
                <span className="hx-floaty" style={{ opacity: .7 }}><Glifo v={v} tam={32} traco={1.4} /></span>
                <div className="hx-display" style={{ marginTop: 20, fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".2em" }}>
                  {q ? "nada encontrado" : !magias.length ? "grimório vazio" : !nv ? "vertente adormecida" : "grimório vazio"}
                </div>
                <p style={{ marginTop: 8, maxWidth: 280, fontSize: 14, lineHeight: 1.35, color: "var(--hx-texto)", opacity: .7 }}>
                  {q ? <>Nenhuma magia de <span style={{ color: c }}>{v.nome}</span> corresponde a “{q}”.</>
                    : !magias.length ? (props.vazio ?? "Nenhuma magia aprendida.")
                      : <>Nenhuma magia de <span style={{ color: c }}>{v.nome}</span> aprendida.</>}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {magiaAberta && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setAberta(null); }}
          style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(6,18,28,.75)", backdropFilter: "blur(2px)" }}>
          <div className="hx-edge hx-ch hx-pop" role="dialog" aria-label={magiaAberta.nome} style={{ width: 420, maxWidth: "calc(100% - 32px)", boxShadow: "0 30px 80px -20px #000" }}>
            <div className="hx-ch" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "min(660px, calc(100vh - 160px))", background: CASCO }}>
              <Faixa m={magiaAberta}>
                <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12 }}>
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </Faixa>
              <Titulo m={magiaAberta} nivel={niveis[magiaAberta.vertente]} />
              <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: 16 }}><Leitura m={magiaAberta} mana={mana} /></div>
              {!props.somenteLeitura && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 16px" }}>
                  {outras.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: fundida ? "rgba(255,138,31,.12)" : "rgba(255,255,255,.03)" }}>
                      <span className="hx-display hx-amb" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".16em" }}>fusão</span>
                      <select aria-label="Magia para fundir" value={fundida ? fusao : ""} onChange={(e) => setFusao(e.target.value)}
                        style={{ flex: 1, minWidth: 0, background: CASCO, color: "var(--hx-texto)", border: "1px solid rgba(255,138,31,.35)", padding: "4px 6px", fontSize: 13 }}>
                        <option value="">sem fusão</option>
                        {outras.map((o) => <option key={o.slug} value={o.slug}>{o.nome} ({VERT(o.vertente).nome})</option>)}
                      </select>
                      <span className="hx-mono hx-dim" style={{ fontSize: 9 }}>+1 sobrecarga</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" disabled={!conjuravel(magiaAberta) || (!!fundida && fundida.bloqueada)} className="hx-btn-conjurar"
                      style={{ flex: 1, padding: "12px 0", fontFamily: "var(--hx-display)", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3em" }}
                      onClick={() => { if (fundida) props.onConjurarComFusao(magiaAberta.slug, fundida.slug); else props.onConjurar(magiaAberta.slug); setAberta(null); }}>
                      {fundida ? "conjurar com fusão" : "conjurar"}
                    </button>
                    {magiaAberta.dano && (
                      <button type="button" className="hx-btn-acao" style={{ padding: "0 14px" }} onClick={() => props.onRolarDano(magiaAberta.slug)}>dano {magiaAberta.dano}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
