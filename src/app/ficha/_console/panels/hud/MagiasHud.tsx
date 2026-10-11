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
import { IconeVertente } from "../../../../_design/IconeVertente";
import "./hud-base.css";

export const VERTENTES_HUD = [
  { id: "cinetica", nome: "Cinética", c: "#e0455f", s: "CIN" },
  { id: "energetica", nome: "Energética", c: "#f07a1f", s: "ENE" },
  { id: "material", nome: "Material", c: "#f5a200", s: "MAT" },
  { id: "biotica", nome: "Biótica", c: "#3ccf6e", s: "BIO" },
  { id: "sinaptica", nome: "Sináptica", c: "#35c7d8", s: "SIN" },
  { id: "cognitiva", nome: "Cognitiva", c: "#8b5cf6", s: "COG" },
] as const;
type VertDef = (typeof VERTENTES_HUD)[number];
const VERT = (id: string): VertDef => VERTENTES_HUD.find((v) => v.id === id) ?? VERTENTES_HUD[0];
/** Os quatro tipos de magia de Ruptura. */
const COR_TIPO: Record<string, string> = { ataque: "#ff5f74", controle: "#f5a200", movimento: "#6ff0ff", suporte: "#22d3aa" };
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
  /** "1d6" ou valor fixo — presente = a magia cura (PV, ou PE quando `curaPe`). */
  cura?: string | null;
  curaPe?: boolean;
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
  /** Slug canônico da vertente primária (v1.2) — ganha moldura dupla no anel. */
  primaria?: string | null;
  mana: { atual: number; max: number };
  somenteLeitura?: boolean;
  onConjurar: (slug: string) => void;
  onRolarDano: (slug: string) => void;
  onRolarCura?: (slug: string) => void;
  onAbrirCatalogo?: () => void;
  /** Surto de Energia (+1 Sobrecarga, +5 de mana temporária). Ausente = surto indisponível. */
  onSurtoDeEnergia?: () => void;
  /** Mensagem do grimório vazio quando não há magia aprendida nenhuma. */
  vazio?: string;
}

/** CD = 6 + nível — nunca 5 + nível (regra do VTT, `getVertenteCd`). */
const cdDe = (n: number | null | undefined) => (n == null ? null : 6 + n);

/* ── primitivas ── */
/** Ícone da vertente — os do Códex (`IconeVertente`); `traco` fica por compatibilidade. */
export function Glifo({ v, tam = 20, cor }: { v: VertDef; tam?: number; traco?: number; cor?: string }) {
  return <IconeVertente vertente={v.id} tam={tam} cor={cor ?? v.c} />;
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
      <Tag className="hx-dim" style={{ fontSize: 10 }}>mana</Tag>
      <span style={{ display: "flex", flex: 1, gap: 3 }}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{ height: 10, flex: 1, transform: "skewX(-20deg)", background: i < cheias ? CY : "rgba(0,212,255,.08)", boxShadow: i < cheias ? `0 0 8px -2px ${CY}` : undefined }} />
        ))}
      </span>
      <span className="hx-display hx-cy" style={{ fontSize: 15, fontWeight: 900 }}>{mana.atual}<span className="hx-dim" style={{ fontSize: 10 }}>/{mana.max}</span></span>
    </div>
  );
}

/** Faixa do topo do modal; o nível do personagem na vertente e a CD ficam no canto superior esquerdo. */
export function Faixa({ m, nivel, children }: { m: MagiaHud; nivel: number | null | undefined; children?: ReactNode }) {
  const v = VERT(m.vertente), c = v.c, cd = cdDe(nivel);
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", height: 170, flexShrink: 0, overflow: "hidden", background: `radial-gradient(circle at 50% 55%, ${c}38, transparent 62%)` }}>
      <span className="hx-hexgrid" style={{ position: "absolute", inset: 0, opacity: .6 }} />
      <span className="hx-scan" style={{ position: "absolute", inset: 0 }} />
      <span className="hx-spin" style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", border: `1px dashed ${c}44` }} />
      <span className="hx-spinr" style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `1px solid ${c}30` }} />
      {[18, 34, 52, 66, 80].map((x, i) => <span key={i} className="hx-mote" style={{ position: "absolute", bottom: 16, left: `${x}%`, width: 3, height: 3, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}`, animationDelay: `${i * .8}s` }} />)}
      <span className="hx-floaty" style={{ position: "relative" }}><Glifo v={v} tam={56} traco={1.2} /></span>
      <span style={{ position: "absolute", left: 12, top: 12, display: "flex", background: CASCO + "cc" }}>
        {/* NV e CD na mesma linha de base: rótulo, número e "/5" alinhados pela base do texto */}
        <span title="seu nível na vertente" style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", lineHeight: 1, background: "rgba(0,212,255,.07)" }}>
          <Tag className="hx-dim" style={{ fontSize: 10 }}>nv</Tag>
          <span className="hx-display" style={{ fontSize: 15, fontWeight: 900, color: c }}>{nivel ?? "—"}<span className="hx-dim" style={{ fontSize: 10 }}>/5</span></span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", lineHeight: 1, background: c + "24" }}>
          <Tag style={{ fontSize: 10, color: c }}>cd</Tag>
          <span className="hx-display" style={{ fontSize: 15, fontWeight: 900 }}>{cd ?? "—"}</span>
        </span>
      </span>
      {children}
    </div>
  );
}

export function Titulo({ m, primaria }: { m: MagiaHud; primaria?: boolean }) {
  const v = VERT(m.vertente), c = v.c;
  const sep = <span style={{ width: 1, height: 12, background: "rgba(0,212,255,.2)" }} />;
  return (
    <div style={{ position: "relative", padding: "20px 16px 14px", borderBottom: "1px solid rgba(0,212,255,.1)", background: `linear-gradient(180deg, ${c}0f, transparent)` }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, ${c}, ${c}00 70%)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* selo do nível da magia — mesmo hexágono (e proporção) do anel */}
        <span className="hx-ch-hex" title={`magia de nível ${m.nivel}`} style={{ flexShrink: 0, display: "grid", placeItems: "center", width: HEX_OFF.w, height: HEX_OFF.h, background: c + "22", textAlign: "center", lineHeight: 1 }}>
          {/* o recuo à esquerda compensa o espaçamento que sobra depois da última letra */}
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span className="hx-display" style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, color: c }}>{m.nivel}</span>
            <Tag style={{ fontSize: 10, lineHeight: 1, letterSpacing: ".12em", paddingLeft: ".12em", color: c, opacity: .7 }}>nv</Tag>
          </span>
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="hx-display" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".06em" }}>{m.nome}</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px", whiteSpace: "nowrap" }}>
            <Tag style={{ fontSize: 10, letterSpacing: ".16em", color: c }}>{v.nome}{primaria && <span style={{ opacity: .6 }}> · primária</span>}</Tag>
            {m.tipo && <>{sep}<Tag style={{ fontSize: 10, letterSpacing: ".16em", color: corTipo(m.tipo) }}>{m.tipo}</Tag></>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Linha de dano/cura com "rolar" ao lado do número — vermelho dano, verde cura. */
function LinhaRolagem({ rotulo, valor, cor, onRolar }: { rotulo: string; valor: string; cor: string; onRolar?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
      <Tag className="hx-dim" style={{ fontSize: 10 }}>{rotulo}</Tag>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="hx-display" style={{ fontSize: 14, fontWeight: 900, color: cor }}>{valor}</span>
        {onRolar && (
          <button type="button" className="hx-btn-rolar" aria-label={`Rolar ${rotulo}`} onClick={onRolar} style={{ ["--k" as string]: cor, display: "flex", alignItems: "center", gap: 5, padding: "3px 8px" }}>
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></svg>
            <Tag style={{ fontSize: 10 }}>rolar</Tag>
          </button>
        )}
      </span>
    </div>
  );
}

const COR_DANO = "#ff5f74", COR_CURA = "#22d3aa";

export function Leitura({ m, mana, onRolarDano, onRolarCura }: { m: MagiaHud; mana: { atual: number; max: number }; onRolarDano?: () => void; onRolarCura?: () => void }) {
  const custo = m.mana ?? 0, falta = custo > mana.atual, mc = falta ? "#ff5f74" : CY;
  const c = VERT(m.vertente).c;
  const Fato = ({ l, v }: { l: string; v: ReactNode }) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
      <Tag className="hx-dim" style={{ fontSize: 10 }}>{l}</Tag><span style={{ fontSize: 14, fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
  const Dia = ({ n, on, c: cc }: { n: number; on: number; c: string }) => (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {Array.from({ length: Math.min(n, 6) }, (_, i) => <i key={i} style={{ width: 7, height: 7, transform: "rotate(45deg)", background: i < on ? cc : "transparent", border: `1px solid ${cc}`, opacity: i < on ? 1 : .55 }} />)}
      {n > 6 && <span className="hx-mono" style={{ fontSize: 10, color: cc }}>+{n - 6}</span>}
    </span>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", borderLeft: `2px solid ${mc}`, background: CASCO }}>
        <div style={{ flex: 1, padding: "10px 16px 10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Tag className="hx-dim" style={{ fontSize: 10 }}>custo</Tag>
            {m.mana != null && falta && <span className="hx-mono" style={{ fontSize: 10, color: mc }}>você tem {mana.atual}</span>}
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hx-display" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: mc }}>{m.mana ?? "—"}</span>
            <span className="hx-mono hx-dim" style={{ fontSize: 10 }}>mana</span>
            <span style={{ marginLeft: "auto" }}><Dia n={custo} on={Math.min(custo, mana.atual)} c={mc} /></span>
          </div>
        </div>
        <div style={{ margin: 8, width: 1, transform: "skewX(-20deg)", background: "rgba(0,212,255,.2)" }} />
        <div style={{ flex: 1, padding: "10px 0 10px 16px" }}>
          <Tag className="hx-dim" style={{ fontSize: 10, display: "block" }}>ação</Tag>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hx-display hx-amb" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{m.pa}</span>
            <span className="hx-mono hx-dim" style={{ fontSize: 10 }}>PA</span>
            <span style={{ marginLeft: "auto" }}><Dia n={m.pa} on={m.pa} c={AMB} /></span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {m.alcance && <Fato l="alcance" v={m.alcance} />}
        {m.area && <Fato l="área" v={m.area} />}
        {m.duracao && <Fato l="duração" v={m.duracao} />}
        {m.reacao && <Fato l="reação" v="Sim" />}
        {m.dano && <LinhaRolagem rotulo="dano" valor={m.dano} cor={COR_DANO} onRolar={onRolarDano} />}
        {m.cura && <LinhaRolagem rotulo={m.curaPe ? "cura de PE" : "cura"} valor={m.cura} cor={COR_CURA} onRolar={onRolarCura} />}
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

/* Anel: hexágonos de pontas laterais (clip `hx-ch-hex`) e núcleo circular. */
const HEX_ON = { w: 63, h: 56 }, HEX_OFF = { w: 54, h: 48 }, NUCLEO = 59, ROTULO_H = 12, ROTULO_GAP = 4;
/** Distância do centro do hexágono até a borda na direção `ang`. */
function bordaHex(ang: number, { w, h }: { w: number; h: number }) {
  const dx = Math.abs(Math.cos(ang)), dy = Math.abs(Math.sin(ang));
  const topo = dy > 1e-6 ? (h / 2) / dy : Infinity;
  /* lado inclinado de (w/2, 0) a (w/4, h/2): 2h·x + w·y = h·w */
  const inclinado = (h * w) / (2 * h * dx + w * dy);
  return Math.min(topo, inclinado);
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MagiasHud(props: PropsMagiasHud) {
  const { magias, niveis, mana } = props;
  /* Vertente inicial: a primária; sem ela, a de maior nível (empate cai na primeira com magia). */
  const inicial = VERTENTES_HUD.find((x) => x.id === props.primaria)?.id ?? [...VERTENTES_HUD].sort((a, b) => (niveis[b.id] ?? -1) - (niveis[a.id] ?? -1)
    || magias.filter((m) => m.vertente === b.id).length - magias.filter((m) => m.vertente === a.id).length)[0].id;
  const [vid, setVid] = useState<string>(inicial);
  const [aberta, setAberta] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [vid]);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setAberta(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  const v = VERT(vid), c = v.c, nv = niveis[vid];
  const daVertente = magias.filter((m) => m.vertente === vid);
  const lista = daVertente.filter((m) => sem(m.nome).includes(sem(q))).sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const nivelMax = Math.max(5, ...lista.map((m) => m.nivel));
  const magiaAberta = magias.find((m) => m.slug === aberta) ?? null;
  const semMana = !!magiaAberta && magiaAberta.mana != null && magiaAberta.mana > mana.atual;
  const conjuravel = (m: MagiaHud) => !m.bloqueada && (m.mana == null || m.mana <= mana.atual);
  const R = 120, C = 170;

  return (
    <div className={`hx hx-grade ${oxanium.variable}`} style={{ position: "relative", height: "100%", minHeight: 620, overflow: "hidden" }}>
      <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "360px 1fr", height: "100%" }}>
        {/* anel */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", borderRight: "1px solid rgba(0,212,255,.1)" }}>
          <div className="hx-anel" style={{ position: "relative", marginTop: 32, width: C * 2, height: C * 2 }}>
            <svg style={{ position: "absolute", inset: 0 }} width={C * 2} height={C * 2}>
              <circle cx={C} cy={C} r={R} fill="none" stroke={CY} strokeOpacity=".12" strokeDasharray="2 6" />
              <circle className="hx-anel-fundo" cx={C} cy={C} r={R + 44} fill={CASCO} stroke={CY} strokeOpacity=".14" />
              {VERTENTES_HUD.map((x, i) => {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                /* do contorno do núcleo até a borda do hexágono da vertente */
                /* o grupo hexágono + rótulo é centrado no anel, então o hexágono fica um pouco acima do ponto */
                const hx = Math.cos(a) * R, hy = Math.sin(a) * R - (ROTULO_H + ROTULO_GAP) / 2;
                const dir = Math.atan2(hy, hx), fim = Math.hypot(hx, hy) - bordaHex(dir + Math.PI, x.id === vid ? HEX_ON : HEX_OFF);
                return <line key={x.id + (x.id === vid ? vid : "")} className={x.id === vid ? "hx-drawln" : ""} x1={C + Math.cos(dir) * NUCLEO} y1={C + Math.sin(dir) * NUCLEO} x2={C + Math.cos(dir) * fim} y2={C + Math.sin(dir) * fim} stroke={x.id === vid ? x.c : CY} strokeOpacity={x.id === vid ? .7 : .08} />;
              })}
            </svg>
            {VERTENTES_HUD.map((x, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2, on = x.id === vid, n = magias.filter((m) => m.vertente === x.id).length;
              const lado = on ? HEX_ON : HEX_OFF, prim = x.id === props.primaria;
              return (
                <button key={x.id} type="button" className="hx-anel-vert" onClick={() => setVid(x.id)} aria-pressed={on} aria-label={`${x.nome}${prim ? " (primária)" : ""}: ${n} magia${n === 1 ? "" : "s"}`}
                  style={{ position: "absolute", left: C + Math.cos(a) * R, top: C + Math.sin(a) * R, transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: ROTULO_GAP }}>
                  {/* primária = moldura hexagonal dupla */}
                  <span className="hx-ch-hex hx-anel-hex" data-on={on || undefined} style={{ display: "grid", placeItems: "center", width: lado.w, height: lado.h, background: prim ? x.c : "transparent", padding: prim ? 2 : 0 }}>
                    <span className="hx-ch-hex" style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", background: prim ? CASCO : "transparent", padding: prim ? 3 : 0 }}>
                      <span className="hx-ch-hex" style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", transition: "background .3s", background: on ? x.c : x.c + "1f" }}>
                        <Glifo v={x} tam={on ? 24 : 20} traco={1.8} cor={on ? "#031014" : x.c} />
                      </span>
                    </span>
                  </span>
                  <span className="hx-mono" style={{ height: ROTULO_H, lineHeight: `${ROTULO_H}px`, fontSize: 10, letterSpacing: ".16em", color: on ? x.c : niveis[x.id] ? "var(--hx-dim)" : "#46647a" }}>{x.s} <span className="hx-dim">{n}</span></span>
                </button>
              );
            })}
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "grid", placeItems: "center", width: NUCLEO * 2, height: NUCLEO * 2, borderRadius: "50%", border: `1px solid ${c}55`, background: `radial-gradient(circle, ${c}22, transparent 70%)`, transition: "all .5s" }}>
              <div style={{ textAlign: "center" }}>
                <div className="hx-display" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: c }}>{nv ?? "—"}</div>
                <Tag className="hx-dim" style={{ fontSize: 10 }}>nível / 5</Tag>
              </div>
            </div>
          </div>
          <div key={vid} className="hx-rise" style={{ marginTop: 24, width: "100%", padding: "0 24px", textAlign: "center" }}>
            <div className="hx-display" style={{ fontSize: 24, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".18em", color: c }}>{v.nome}</div>
            <Tag className="hx-dim" style={{ marginTop: 8, display: "block", fontSize: 10 }}>{vid === props.primaria ? "vertente primária" : nv ? "vertente aprendida" : nv === 0 ? "vertente não aprendida" : "nível não definido"}</Tag>
            <div className="hx-ch" style={{ marginTop: 16, padding: 1, background: "rgba(0,212,255,.1)" }}>
              <div className="hx-ch" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: CASCO }}>
                {([
                  ["nível", <>{nv ?? "—"}<span className="hx-dim" style={{ fontSize: 12 }}>/5</span></>, <Pips key="p" n={nv ?? 0} c={c} />],
                  ["cd", cdDe(nv) ?? "—", <span key="s" className="hx-mono hx-dim" style={{ fontSize: 10 }}>{nv != null ? `6 + ${nv}` : "indisponível"}</span>],
                  ["magias", daVertente.length, <span key="m" className="hx-mono hx-dim" style={{ fontSize: 10 }}>conhecidas</span>],
                ] as [string, ReactNode, ReactNode][]).map(([l, val, sub], i) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 0", borderLeft: i ? "1px solid rgba(0,212,255,.1)" : undefined }}>
                    <Tag className="hx-dim" style={{ fontSize: 10 }}>{l}</Tag>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span className="hx-display" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".22em", opacity: .7 }}>grimório</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10 }}>
              <Busca q={q} setQ={setQ} />
              {props.onAbrirCatalogo && <button type="button" className="hx-btn-acao" onClick={props.onAbrirCatalogo} style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em" }}>Catálogo de magias</button>}
            </div>
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
                              <span className="hx-mono hx-dim" style={{ display: "block", marginTop: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em" }}>
                                <span style={{ color: corTipo(m.tipo) }}>{m.tipo || "—"}</span>
                              </span>
                            </span>
                            <span style={{ textAlign: "right" }}><span className="hx-display hx-cy" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{m.mana ?? "—"}</span><Tag className="hx-dim" style={{ display: "block", fontSize: 10 }}>mana</Tag></span>
                            <span style={{ textAlign: "right" }}><span className="hx-display hx-amb" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{m.pa}</span><Tag className="hx-dim" style={{ display: "block", fontSize: 10 }}>pa</Tag></span>
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
                <span style={{ position: "relative", display: "grid", placeItems: "center", width: 94, height: 84 }}>
                  <span className="hx-ch-hex" style={{ position: "absolute", inset: 0, background: c + "30" }} />
                  <span className="hx-ch-hex" style={{ position: "absolute", inset: 2, background: CASCO }} />
                  <span className="hx-ch-hex hx-hexgrid" style={{ position: "absolute", inset: 8, opacity: .6, backgroundColor: c + "0d" }} />
                  <span className="hx-floaty" style={{ position: "relative", opacity: .7 }}><Glifo v={v} tam={32} traco={1.4} /></span>
                </span>
                <div className="hx-display" style={{ marginTop: 20, fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".2em" }}>
                  {q ? "nada encontrado" : !magias.length ? "grimório vazio" : !nv ? "vertente adormecida" : "grimório vazio"}
                </div>
                <p style={{ marginTop: 8, maxWidth: 280, fontSize: 14, lineHeight: 1.35, color: "var(--hx-texto)", opacity: .7 }}>
                  {q ? <>Nenhuma magia de <span style={{ color: c }}>{v.nome}</span> corresponde a “{q}”.</>
                    : !magias.length ? (props.vazio ?? "Nenhuma magia aprendida.")
                      : !nv ? <>Você ainda não tem nível em <span style={{ color: c }}>{v.nome}</span>. Ganhe o primeiro ponto para aprender magias de nível 1.</>
                      : <>Nenhuma magia de <span style={{ color: c }}>{v.nome}</span> aprendida ainda.</>}
                </p>
                {!q && !!magias.length && !nv && (
                  <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
                    <Pips n={0} c={c} />
                    <Tag style={{ fontSize: 10, letterSpacing: ".16em", color: c }}>0 / 5</Tag>
                  </div>
                )}
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
              <Faixa m={magiaAberta} nivel={niveis[magiaAberta.vertente]}>
                <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12 }}>
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </Faixa>
              <Titulo m={magiaAberta} primaria={magiaAberta.vertente === props.primaria} />
              <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: 16 }}><Leitura m={magiaAberta} mana={mana}
                onRolarDano={props.somenteLeitura ? undefined : () => props.onRolarDano(magiaAberta.slug)}
                onRolarCura={props.somenteLeitura || !props.onRolarCura ? undefined : () => props.onRolarCura?.(magiaAberta.slug)} /></div>
              {!props.somenteLeitura && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 16px" }}>
                  {/* sem mana: aviso com o que falta e, se der, o Surto de Energia com o preço à vista */}
                  {semMana && magiaAberta.mana != null && (
                    <div style={{ padding: 12, border: `1px solid ${AMB}55`, background: AMB + "12" }}>
                      <Tag className="hx-amb" style={{ display: "block", fontSize: 11, letterSpacing: ".16em" }}>falta {magiaAberta.mana - mana.atual} de mana</Tag>
                      <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>
                        {props.onSurtoDeEnergia
                          ? "Libere um Surto de Energia: +5 de mana temporária, ao custo de 1 Sobrecarga e 1d4 de dano psíquico."
                          : "Sem Surtos disponíveis até o próximo descanso longo."}
                      </p>
                      {props.onSurtoDeEnergia && (
                        <button type="button" className="hx-btn-surto" onClick={props.onSurtoDeEnergia}
                          style={{ marginTop: 10, width: "100%", padding: "10px 0", fontFamily: "var(--hx-display)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".2em" }}>
                          surto de energia
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" disabled={!conjuravel(magiaAberta)} className="hx-btn-conjurar"
                      style={{ flex: 1, padding: "12px 0", fontFamily: "var(--hx-display)", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3em" }}
                      onClick={() => { props.onConjurar(magiaAberta.slug); setAberta(null); }}>
                      conjurar
                    </button>
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
