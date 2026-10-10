"use client";

/**
 * EQUIPAMENTO — o "ripperdoc" do protótipo
 * (`inventario equip magia/src/Equipment.tsx`), na linguagem da Forja.
 *
 * Encaixes quadrados ligados por fio ao ponto do corpo que ocupam;
 * clicar num encaixe abre uma gaveta que EMPURRA o palco (nunca cobre)
 * com o que está ali e o que pode ir ali. A ficha do item abre num
 * modal sobre o corpo do Console.
 *
 * A SILHUETA É A NOSSA (`bodySilhouette.tsx`), pintada pela armadura
 * de cada região. Os encaixes são os do modelo real (`slots.ts`): uma
 * armadura por região, armas primária/secundária (o escudo ocupa a
 * secundária) e dois acessos rápidos. Acessórios, traje e mobilidade
 * do protótipo ficaram de fora — esses encaixes não existem no sistema.
 *
 * Só apresentação: recebe as peças já resolvidas e manda as ações por
 * callback. Quem lê o inventário é o `EquipmentPanel`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BODY_PATHS, type BodyRegiao } from "../../bodySilhouette";
import { oxanium } from "../../../../_design/oxanium";
import "./hud-base.css";

export type EncaixeHud =
  | "cabeca" | "tronco" | "membro_superior" | "membro_inferior"
  | "arma_primaria" | "arma_secundaria" | "acesso_rapido_1" | "acesso_rapido_2";

export interface PecaHud {
  /** Id da INSTÂNCIA no inventário. */
  id: string;
  nome: string;
  categoria: string;
  categoriaRotulo: string;
  /** Vertente da categoria — a cor de itens que não protegem. */
  vertente: string;
  raridade?: string | null;
  onde: "equipado" | "mochila" | "abrigo";
  espacos: number;
  /** "fisica" | "energetica" | "hibrida" — armaduras e escudos. */
  protecao?: string | null;
  mit?: [number, number] | null;
  pd?: [number, number] | null;
  /** Regiões cobertas ("cabeca", "tronco", "bracos", "pernas"). */
  regioes?: string[];
  dano?: { dado: string; tipo?: string | null } | null;
  municao?: [number, number] | null;
  usavel?: boolean;
  descricao?: ReactNode;
  linhas?: { rotulo: string; valor: string }[];
}

export interface PropsEquipamentoHud {
  /** O que ocupa cada encaixe agora. */
  encaixes: Record<EncaixeHud, PecaHud | null>;
  /** Peças da mochila/abrigo que cabem no encaixe. */
  candidatos: (e: EncaixeHud) => PecaHud[];
  somenteLeitura?: boolean;
  onEquipar: (id: string, e: EncaixeHud) => void;
  onTirar: (id: string) => void;
  onTrazer: (id: string) => void;
  onDefinirMit: (id: string, valor: number) => void;
  onDefinirPd: (id: string, valor: number) => void;
  onAtacar: (e: "arma_primaria" | "arma_secundaria") => void;
  onRecarregar: (id: string) => void;
  onUsar: (id: string) => void;
}

const CY = "#00d4ff", AMB = "#ff8a1f", CASCO = "#081925", PERIGO = "#ff5f74", OK = "#22d3aa";
const RAR: Record<string, string> = { comum: "#7f95b3", incomum: OK, raro: "#8b5cf6" };
const corRar = (r?: string | null) => (r ? RAR[r.toLowerCase()] ?? "#7f95b3" : "#7f95b3");
const PROT: Record<string, { c: string; s: string; nome: string }> = {
  /* Físico = vermelho (cinética), energético = laranja (energética). */
  fisica: { c: "#e0455f", s: "FIS", nome: "Físico" },
  energetica: { c: "#f07a1f", s: "ENE", nome: "Energético" },
  hibrida: { c: "#8b5cf6", s: "HIB", nome: "Híbrido" },
};
const prot = (p?: string | null) => (p ? PROT[p.toLowerCase()] ?? null : null);
/** Cor da vertente por slug — mesma paleta canônica de `[data-vertente]`. */
const COR_VERTENTE: Record<string, string> = { cinetica: "#e0455f", energetica: "#f07a1f", material: "#f5a200", biotica: "#2f9e56", sinaptica: "#35c7d8", cognitiva: "#8b5cf6", nenhuma: "#7f95b3" };
const corDe = (p: PecaHud) => prot(p.protecao)?.c ?? COR_VERTENTE[p.vertente] ?? CY;

const ROTULO: Record<EncaixeHud, string> = {
  cabeca: "Cabeça", tronco: "Tronco", membro_superior: "Braços", membro_inferior: "Pernas",
  arma_primaria: "Primária", arma_secundaria: "Secundária", acesso_rapido_1: "Acesso rápido #1", acesso_rapido_2: "Acesso rápido #2",
};
const ehArmadura = (e: EncaixeHud) => e === "cabeca" || e === "tronco" || e === "membro_superior" || e === "membro_inferior";
const ehArma = (e: EncaixeHud): e is "arma_primaria" | "arma_secundaria" => e === "arma_primaria" || e === "arma_secundaria";
const REGIOES = [{ id: "cabeca", nome: "Cabeça" }, { id: "tronco", nome: "Tronco" }, { id: "bracos", nome: "Braços" }, { id: "pernas", nome: "Pernas" }];

const G_ARMADURA = "M12 2 4 5v7c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5l-8-3Zm0 0v20M4 10h16";
const G_ESCUDO = "M4 3h16v9c0 5-4 8-8 10-4-2-8-5-8-10V3Zm8 4v10m-4-5h8";
const G_ARMA = "M3 21 14 10m0 0 3-7 4 4-7 3Zm-9 7 3 3M6 15l3 3";
const G_RAPIDO = "M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2Z";
const G_VAZIO: Record<EncaixeHud, string> = {
  cabeca: "M12 3a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5Zm-5 17c1-3 3-4 5-4s4 1 5 4",
  tronco: "M7 4h10l3 4-2 3v9H6v-9L4 8l3-4Zm5 0v16",
  membro_superior: "M8 3 5 12l2 9m9-18 3 9-2 9M8 3h8",
  membro_inferior: "M8 3h8l-1 9-1 9h-2l-0-9-0 9h-2l-1-9-1-9Z",
  arma_primaria: G_ARMA, arma_secundaria: G_ARMA, acesso_rapido_1: G_RAPIDO, acesso_rapido_2: G_RAPIDO,
};
const glifoDe = (p: PecaHud) => (p.categoria === "armadura" ? G_ARMADURA : p.categoria === "escudo" ? G_ESCUDO : p.categoria === "arma" ? G_ARMA : G_RAPIDO);

/* ── palco: a NOSSA silhueta (201 × 613) com os encaixes nas laterais ──
   A altura da figura acompanha a altura disponível (medida), e a
   altura de cada encaixe é uma FRAÇÃO dela — o corpo cresce e os fios
   continuam caindo no mesmo lugar. */
const GAVETA = 300, S = 48;
/** Distância horizontal dos encaixes à figura: folgada com a gaveta fechada, colada com ela aberta. */
const FOLGA_FECHADO = 150, FOLGA_ABERTO = 56;
const FIOS: { e: EncaixeHud; lado: "e" | "d"; y: number; pt: [number, number] }[] = [
  { e: "cabeca", lado: "e", y: .03, pt: [70, 38] },
  { e: "tronco", lado: "e", y: .23, pt: [85, 165] },
  { e: "membro_superior", lado: "e", y: .42, pt: [28, 200] },
  { e: "arma_primaria", lado: "e", y: .58, pt: [14, 322] },
  { e: "membro_inferior", lado: "e", y: .76, pt: [58, 440] },
  { e: "acesso_rapido_1", lado: "d", y: .30, pt: [134, 255] },
  { e: "acesso_rapido_2", lado: "d", y: .44, pt: [124, 268] },
  { e: "arma_secundaria", lado: "d", y: .58, pt: [150, 322] },
];
const ENCAIXE_DO_PATH: Record<BodyRegiao, EncaixeHud> = {
  cabeca: "cabeca", tronco: "tronco", membro_superior: "membro_superior", membro_inferior: "membro_inferior",
  arma_primaria: "arma_primaria", arma_secundaria: "arma_secundaria",
};

const Tag = ({ children, style, className = "" }: { children: ReactNode; style?: React.CSSProperties; className?: string }) =>
  <span className={`hx-tag ${className}`} style={style}>{children}</span>;
const Svg = ({ d, tam, cor, traco = 1.5, opac = 1, style }: { d: string; tam: number; cor: string; traco?: number; opac?: number; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke={cor} strokeOpacity={opac} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={d} /></svg>
);

export function EquipamentoHud(props: PropsEquipamentoHud) {
  const { encaixes } = props;
  const [sel, setSel] = useState<EncaixeHud | null>(null);
  const [ver, setVer] = useState<PecaHud | null>(null);
  const [hover, setHover] = useState<EncaixeHud | null>(null);
  const abrir = (e: EncaixeHud | null) => { setSel(e); setVer(null); };
  /* Altura útil do palco → altura da figura. */
  const palcoRef = useRef<HTMLDivElement>(null);
  const [alturaPalco, setAlturaPalco] = useState(640);
  useEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAlturaPalco(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const FH = Math.max(420, Math.min(900, alturaPalco - 120)), FS = FH / 613, FW = 201 * FS;
  const TOPO = Math.max(16, (alturaPalco - FH) / 2);
  const folga = sel ? FOLGA_ABERTO : FOLGA_FECHADO;
  const PALCO = FW + 2 * (S + folga), FX = (PALCO - FW) / 2;

  return (
    <div className={`hx hx-grade ${oxanium.variable}`} style={{ position: "relative", height: "100%", minHeight: 620, overflow: "hidden" }}
      onKeyDown={(ev) => { if (ev.key === "Escape") { if (ver) setVer(null); else setSel(null); } }}>
      <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", height: "100%" }}>
        <div ref={palcoRef} style={{ position: "relative", minWidth: 0, flex: 1 }} onClick={(ev) => { if (!(ev.target as Element).closest("button,g[data-r]")) abrir(null); }}>
          <div style={{ position: "absolute", top: 0, height: "100%", width: PALCO, left: `calc(50% - ${PALCO / 2}px)`, transition: "width .3s ease-out, left .3s ease-out" }}>
            <div style={{ position: "absolute", top: TOPO, left: FX, height: FH }}>
              <Corpo encaixes={encaixes} sel={sel} hover={hover} altura={FH}
                onSel={(p) => abrir(ENCAIXE_DO_PATH[p])} onHover={(p) => setHover(p ? ENCAIXE_DO_PATH[p] : null)} />
            </div>
            <svg style={{ position: "absolute", left: 0, top: TOPO, pointerEvents: "none", overflow: "visible" }} width={PALCO} height={FH}>
              {FIOS.map((w) => {
                const on = sel === w.e || hover === w.e, bx = FX + w.pt[0] * FS, by = w.pt[1] * FS;
                /* O fio aceso segue a cor do item do encaixe (ciano quando vazio). */
                const ocupante = encaixes[w.e], cf = on && ocupante ? corDe(ocupante) : CY;
                const sx = w.lado === "e" ? S : PALCO - S, sy = w.y * FH + S / 2, ex = w.lado === "e" ? sx + 22 : sx - 22;
                return (
                  <g key={w.e} opacity={on ? 1 : .35}>
                    <polyline points={`${sx},${sy} ${ex},${sy} ${bx},${by}`} fill="none" stroke={cf} strokeOpacity={on ? .85 : .25} strokeWidth="1" />
                    <circle cx={bx} cy={by} r={on ? 3 : 2} fill={cf} fillOpacity={on ? 1 : .4} />
                  </g>
                );
              })}
            </svg>
            {FIOS.map((w) => {
              const p = encaixes[w.e];
              return (
                <div key={w.e} style={{ position: "absolute", top: TOPO + w.y * FH, [w.lado === "e" ? "left" : "right"]: 0, display: "flex", flexDirection: "column", alignItems: w.lado === "e" ? "flex-start" : "flex-end", gap: 4, transition: "top .3s ease-out" }}
                  onMouseEnter={() => setHover(w.e)} onMouseLeave={() => setHover(null)}>
                  <Encaixe peca={p} encaixe={w.e} ativo={sel === w.e} quente={hover === w.e} onClick={() => abrir(sel === w.e ? null : w.e)} />
                  <Tag className="hx-dim" style={{ fontSize: 8, opacity: .7 }}>{ROTULO[w.e]}</Tag>
                </div>
              );
            })}
          </div>
          {!sel && <Tag className="hx-dim" style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", fontSize: 9, opacity: .6, pointerEvents: "none" }}>selecione um encaixe</Tag>}
        </div>

        <aside aria-hidden={!sel} style={{ position: "relative", flexShrink: 0, overflow: "hidden", width: sel ? GAVETA : 0, transition: "width .3s ease-out", background: "rgba(12,31,43,.35)", backdropFilter: "blur(2px)" }}>
          <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, background: "linear-gradient(180deg, rgba(0,212,255,0), rgba(0,212,255,.5), rgba(0,212,255,0))" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: GAVETA, display: "flex", flexDirection: "column" }}>
            {sel && <Gaveta key={sel} {...props} sel={sel} onFechar={() => abrir(null)} onVer={setVer} />}
          </div>
        </aside>
      </div>

      {ver && (
        <div onClick={(ev) => { if (ev.target === ev.currentTarget) setVer(null); }}
          style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(6,18,28,.75)", backdropFilter: "blur(2px)" }}>
          <div className="hx-edge hx-ch hx-pop" role="dialog" aria-label={ver.nome} style={{ width: 420, maxWidth: "calc(100% - 32px)", boxShadow: "0 30px 80px -20px #000" }}>
            <div className="hx-ch" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "min(660px, calc(100vh - 160px))", background: CASCO }}>
              <Ficha p={ver} voltar={() => setVer(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Encaixe({ peca, encaixe, ativo, quente, onClick }: { peca: PecaHud | null; encaixe: EncaixeHud; ativo: boolean; quente?: boolean; onClick: () => void }) {
  const cor = peca ? corDe(peca) : CY;
  const selo = peca?.mit ? peca.mit[0] : peca?.pd ? peca.pd[0] : undefined;
  return (
    <button type="button" onClick={onClick} className="hx-encaixe" data-vazio={!peca || undefined} data-ativo={ativo || undefined} data-quente={quente || undefined}
      aria-label={`${ROTULO[encaixe]}: ${peca ? peca.nome : "vazio"}`} aria-pressed={ativo} style={{ width: S, height: S, ["--k" as string]: cor }}>
      <span className="hx-encaixe-placa" />
      {peca && <span style={{ position: "absolute", right: 0, top: 0, width: 0, height: 0, borderLeft: "8px solid transparent", borderTop: `8px solid ${corRar(peca.raridade)}` }} />}
      <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "grid" }}>
        <Svg d={peca ? glifoDe(peca) : G_VAZIO[encaixe]} tam={S * .46} cor={peca ? cor : CY} opac={peca ? 1 : .22} />
      </span>
      {selo != null && (
        <span className="hx-display" style={{ position: "absolute", right: -6, bottom: -6, display: "grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 2px", background: "var(--hx-abismo)", fontSize: 12, fontWeight: 900, lineHeight: 1, color: cor, boxShadow: `0 0 0 1px ${cor}80` }}>{selo}</span>
      )}
    </button>
  );
}

function Corpo({ encaixes, sel, hover, altura, onSel, onHover }: {
  encaixes: Record<EncaixeHud, PecaHud | null>; sel: EncaixeHud | null; hover: EncaixeHud | null; altura: number;
  onSel: (p: BodyRegiao) => void; onHover: (p: BodyRegiao | null) => void;
}) {
  return (
    <svg viewBox="0 0 201 613" height={altura} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <defs>
        {/* Contorno INTERNO: o traço é o dobro da largura e recortado
            pelo próprio path — só a metade de dentro aparece. */}
        {BODY_PATHS.map((path, i) => <clipPath key={i} id={`hx-corpo-recorte-${i}`}><path d={path.d} /></clipPath>)}
      </defs>
      {BODY_PATHS.map((path, i) => {
        const e = ENCAIXE_DO_PATH[path.regiao], p = encaixes[e];
        const pr = p && ehArmadura(e) ? p : null, c = pr ? corDe(pr) : CY;
        const f = pr?.mit ? .18 + .4 * (pr.mit[0] / Math.max(pr.mit[1], 1)) : pr ? .3 : 0;
        const on = sel === e || hover === e;
        return (
          <g key={i} data-r style={{ cursor: "pointer" }} onClick={() => onSel(path.regiao)} onMouseEnter={() => onHover(path.regiao)} onMouseLeave={() => onHover(null)}>
            <path d={path.d} fill={path.fill} />
            {pr && <path d={path.d} fill={c} fillOpacity={f} />}
            {/* Hover: a cor da PRÓPRIA região um pouco mais forte, chapada —
                sem degradê nem ciano por cima da armadura (virava rosa). */}
            {on && <path d={path.d} fill={c} fillOpacity={pr ? .14 : .08} />}
            <path d={path.d} fill="none" clipPath={`url(#hx-corpo-recorte-${i})`}
              stroke={c} strokeOpacity={on ? .75 : pr ? .35 : .1} strokeWidth={on ? 1.6 : 1.2}
              strokeDasharray="3 3" style={{ transition: "stroke-opacity .2s, stroke-width .2s", mixBlendMode: "screen" }} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── gaveta ── */
const ProtTag = ({ p }: { p?: string | null }) => { const x = prot(p); return x ? <span className="hx-mono" style={{ fontSize: 9, letterSpacing: ".16em", color: x.c }}>{x.s}</span> : null; };
const Cobertura = ({ p }: { p: PecaHud }) => (
  <span title={(p.regioes ?? []).join(", ")} style={{ display: "inline-flex", gap: 2 }}>
    {REGIOES.map((r) => <span key={r.id} style={{ width: 9, height: 7, transform: "skewX(-20deg)", background: p.regioes?.includes(r.id) ? corDe(p) : "rgba(0,212,255,.08)" }} />)}
  </span>
);
const Btn = ({ children, onClick, ambar }: { children: ReactNode; onClick: () => void; ambar?: boolean }) => (
  <button type="button" className="hx-btn-acao" data-ambar={ambar || undefined} onClick={(ev) => { ev.stopPropagation(); onClick(); }}>{children}</button>
);
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, transform: "rotate(45deg)", border: "1px solid rgba(0,212,255,.5)" }} />
        <span className="hx-display" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".22em", opacity: .8 }}>{titulo}</span>
        <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, rgba(0,212,255,.25), transparent)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}
const Vazio = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "grid", placeItems: "center", minHeight: 52, padding: "8px 12px", border: "1px dashed rgba(0,212,255,.2)", textAlign: "center" }}><Tag className="hx-dim" style={{ fontSize: 9 }}>{children}</Tag></div>
);

function Cartao({ p, acoes, apagado, marca, pe, onVer, ativo }: { p: PecaHud; acoes?: ReactNode; apagado?: boolean; marca?: string; pe?: ReactNode; onVer: () => void; ativo?: boolean }) {
  return (
    <div onClick={onVer} className={`hx-ch hx-cartao ${ativo ? "hx-edge" : ""}`} style={{ cursor: "pointer", opacity: apagado ? .6 : 1 }}>
      <div className="hx-ch hx-cartao-miolo" style={{ position: "relative" }}>
        {marca && <span className="hx-mono" style={{ position: "absolute", right: 12, top: 0, padding: "1px 6px", background: "rgba(255,138,31,.15)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".16em", color: AMB }}>{marca}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
          <span title={p.raridade ?? undefined} style={{ width: 3, alignSelf: "stretch", background: corRar(p.raridade) }} />
          <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
            <div className="hx-display" style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.15, letterSpacing: ".04em" }}>{p.nome}</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
              <ProtTag p={p.protecao} />
              {p.regioes && p.regioes.length > 0 && <Cobertura p={p} />}
              {p.mit && <span className="hx-display" style={{ fontSize: 12, fontWeight: 700, opacity: .75 }}>{p.mit[0]}<span className="hx-dim">/{p.mit[1]}</span></span>}
              {p.pd && <span className="hx-display" style={{ fontSize: 12, fontWeight: 700, opacity: .75 }}>PD {p.pd[0]}<span className="hx-dim">/{p.pd[1]}</span></span>}
              {p.dano && <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}><span className="hx-display" style={{ fontSize: 15, fontWeight: 900, color: PERIGO }}>{p.dano.dado}</span>{p.dano.tipo && <Tag style={{ fontSize: 8, color: PERIGO, opacity: .7 }}>{p.dano.tipo}</Tag>}</span>}
              {!p.protecao && !p.dano && <Tag className="hx-dim" style={{ fontSize: 8 }}>{p.categoriaRotulo}</Tag>}
            </div>
          </div>
          {acoes && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{acoes}</div>}
        </div>
        {pe && <div onClick={(ev) => ev.stopPropagation()} style={{ borderTop: "1px solid rgba(0,212,255,.1)", background: "rgba(6,18,28,.4)", padding: "8px 12px" }}>{pe}</div>}
      </div>
    </div>
  );
}

function Passo({ rotulo, atual, max, cor, onMudar }: { rotulo: string; atual: number; max: number; cor: string; onMudar?: (v: number) => void }) {
  const b = (d: number, dis: boolean) => (
    <button type="button" disabled={dis || !onMudar} onClick={(ev) => { ev.stopPropagation(); onMudar?.(atual + d); }} aria-label={`${d > 0 ? "Aumentar" : "Reduzir"} ${rotulo}`} className="hx-ch-hex hx-passo-mit">{d > 0 ? "+" : "−"}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Tag className="hx-dim" style={{ fontSize: 8 }}>{rotulo}</Tag>
      {onMudar && b(-1, atual <= 0)}
      <span style={{ display: "flex", flex: 1, gap: 3, padding: "0 2px" }}>
        {Array.from({ length: Math.max(max, 1) }, (_, i) => <span key={i} style={{ height: 8, flex: 1, transform: "skewX(-20deg)", transition: "background .15s", background: i < atual ? cor : "rgba(0,212,255,.07)", boxShadow: i < atual ? `0 0 8px -1px ${cor}` : undefined }} />)}
      </span>
      {onMudar && b(1, atual >= max)}
      <span className="hx-display" style={{ width: 32, textAlign: "right", fontSize: 15, fontWeight: 900, lineHeight: 1, color: atual ? cor : PERIGO }}>{atual}<span className="hx-dim" style={{ fontSize: 10 }}>/{max}</span></span>
    </div>
  );
}

function Cabeca({ chapeu, titulo, onFechar }: { chapeu: string; titulo: string; onFechar: () => void }) {
  return (
    <div style={{ position: "relative", flexShrink: 0, paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 0 16px" }}>
        <Tag style={{ fontSize: 9, color: "rgba(0,212,255,.6)" }}>{chapeu}</Tag>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="hx-ch-hex hx-fechar"><Svg d="M6 6l12 12M18 6 6 18" tam={14} cor="currentColor" traco={2} /></button>
      </div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "center" }}>
        <div className="hx-ch-tab" style={{ padding: "6px 32px 6px 16px", background: "linear-gradient(90deg, rgba(0,212,255,.3), rgba(0,212,255,.05))" }}>
          <span className="hx-display" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".14em" }}>{titulo}</span>
        </div>
        <span style={{ height: 1, flex: 1, background: "rgba(0,212,255,.2)" }} />
      </div>
    </div>
  );
}

function Gaveta(props: PropsEquipamentoHud & { sel: EncaixeHud; onFechar: () => void; onVer: (p: PecaHud) => void }) {
  const { sel: e, encaixes, somenteLeitura: leitura, onVer } = props;
  const atual = encaixes[e];
  const cands = props.candidatos(e).sort((a, b) => (a.onde === "abrigo" ? 1 : 0) - (b.onde === "abrigo" ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  const corpo = (c: ReactNode) => <div className="hx-boot hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>{c}</div>;
  const chapeu = ehArmadura(e) ? "proteção" : ehArma(e) ? "mãos" : "acesso rápido";

  const acoesDoAtual = (p: PecaHud) => leitura ? undefined : (
    <>
      {ehArma(e) && p.dano && <Btn onClick={() => props.onAtacar(e)}>atacar</Btn>}
      {p.municao && <Btn onClick={() => props.onRecarregar(p.id)}>recarregar</Btn>}
      {!ehArma(e) && !ehArmadura(e) && p.usavel && <Btn onClick={() => props.onUsar(p.id)}>usar</Btn>}
      <Btn ambar onClick={() => props.onTirar(p.id)}>tirar</Btn>
    </>
  );
  const peDoAtual = (p: PecaHud) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {p.mit && <Passo rotulo="mit" atual={p.mit[0]} max={p.mit[1]} cor={corDe(p)} onMudar={leitura ? undefined : (v) => props.onDefinirMit(p.id, v)} />}
      {p.pd && <Passo rotulo="pd" atual={p.pd[0]} max={p.pd[1]} cor={corDe(p)} onMudar={leitura ? undefined : (v) => props.onDefinirPd(p.id, v)} />}
      {p.municao && <Passo rotulo="mun." atual={p.municao[0]} max={p.municao[1]} cor={PERIGO} />}
    </div>
  );
  const temPe = (p: PecaHud) => !!(p.mit || p.pd || p.municao);

  return (
    <>
      <Cabeca chapeu={chapeu} titulo={ROTULO[e]} onFechar={props.onFechar} />
      {corpo(<>
        {ehArmadura(e) && (() => {
          const pr = atual ? prot(atual.protecao) : null, base = atual?.mit?.[0] ?? 0, hc = pr?.c ?? PERIGO;
          return (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, padding: "8px 4px" }}>
              <span className="hx-display" style={{ fontSize: 46, fontWeight: 900, lineHeight: .8, color: hc, textShadow: `0 0 24px ${hc}66` }}>{base}</span>
              <div style={{ lineHeight: 1.2 }}>
                <Tag className="hx-dim" style={{ display: "block", fontSize: 9 }}>mitigação</Tag>
                <span className="hx-display" style={{ marginTop: 4, display: "block", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: hc }}>{atual ? pr?.nome ?? "—" : "desprotegido"}</span>
              </div>
            </div>
          );
        })()}
        <Secao titulo={ehArmadura(e) ? "vestido" : "equipado"}>
          {atual ? <Cartao p={atual} ativo onVer={() => onVer(atual)} acoes={acoesDoAtual(atual)} pe={temPe(atual) ? peDoAtual(atual) : undefined} />
            : <Vazio>{ehArmadura(e) ? "nada vestido" : "vazio"}</Vazio>}
        </Secao>
        {!leitura && (
          <Secao titulo="disponível">
            {cands.length ? cands.map((p) => {
              const ab = p.onde === "abrigo";
              const ganho = ehArmadura(e) && p.mit ? p.mit[0] - (atual?.mit?.[0] ?? 0) : 0;
              return <Cartao key={p.id} p={p} apagado={ab} marca={ab ? "abrigo" : undefined} onVer={() => onVer(p)}
                acoes={<>{ganho > 0 && <span className="hx-display" style={{ textAlign: "center", fontSize: 12, fontWeight: 900, color: OK }}>▲{ganho}</span>}
                  <Btn ambar={ab} onClick={() => (ab ? props.onTrazer(p.id) : props.onEquipar(p.id, e))}>{ab ? "trazer" : ehArmadura(e) ? "vestir" : "equipar"}</Btn></>} />;
            }) : <Vazio>nenhum item compatível na mochila ou no abrigo</Vazio>}
          </Secao>
        )}
      </>)}
    </>
  );
}

/* ── ficha completa ── */
function Ficha({ p, voltar }: { p: PecaHud; voltar: () => void }) {
  const c = corDe(p), pr = prot(p.protecao);
  return (
    <>
      <div style={{ position: "relative", display: "grid", placeItems: "center", height: 160, flexShrink: 0, overflow: "hidden", background: `radial-gradient(circle at 50% 55%, ${c}38, transparent 62%)` }}>
        <span className="hx-hexgrid" style={{ position: "absolute", inset: 0, opacity: .6 }} /><span className="hx-scan" style={{ position: "absolute", inset: 0 }} />
        <span className="hx-spin" style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%", border: `1px dashed ${c}44` }} />
        <span className="hx-spinr" style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: `1px solid ${c}30` }} />
        <span className="hx-floaty" style={{ position: "relative" }}><Svg d={glifoDe(p)} tam={52} cor={c} traco={1.2} style={{ filter: `drop-shadow(0 0 12px ${c})` }} /></span>
        <button type="button" onClick={voltar} aria-label="Fechar" className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12 }}><Svg d="M6 6l12 12M18 6 6 18" tam={14} cor="currentColor" traco={2} /></button>
      </div>
      <div style={{ position: "relative", padding: "18px 16px 14px", borderBottom: "1px solid rgba(0,212,255,.1)", background: `linear-gradient(180deg, ${c}0f, transparent)` }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, ${c}, ${c}00 70%)` }} />
        <div className="hx-display" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".06em" }}>{p.nome}</div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag style={{ fontSize: 9, letterSpacing: ".16em", color: c }}>{p.categoriaRotulo}</Tag>
          {p.raridade && <><span style={{ width: 1, height: 12, background: "rgba(0,212,255,.2)" }} /><Tag style={{ fontSize: 9, letterSpacing: ".16em", color: corRar(p.raridade) }}>{p.raridade}</Tag></>}
          <span style={{ marginLeft: "auto", display: "flex" }}>
            <span style={{ display: "flex", alignItems: "center", padding: "4px 8px", background: "rgba(0,212,255,.07)" }}><Tag className="hx-dim" style={{ fontSize: 8 }}>{p.onde}</Tag></span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: c + "24" }}><Tag style={{ fontSize: 8, color: c }}>esp</Tag><span className="hx-display" style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{p.espacos}</span></span>
          </span>
        </div>
      </div>
      <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {p.dano && (
          <div style={{ display: "flex", alignItems: "center", borderLeft: `2px solid ${PERIGO}`, background: "#0a1b26", padding: "10px 12px" }}>
            <Tag className="hx-dim" style={{ fontSize: 8 }}>dano</Tag>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6 }}><span className="hx-display" style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: PERIGO }}>{p.dano.dado}</span>{p.dano.tipo && <Tag style={{ fontSize: 10, color: PERIGO, opacity: .7 }}>{p.dano.tipo}</Tag>}</span>
          </div>
        )}
        {pr && (p.mit || p.pd) && (
          <div style={{ borderLeft: `2px solid ${c}`, background: "#0a1b26", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><Tag className="hx-dim" style={{ fontSize: 8 }}>resistência</Tag><span className="hx-display" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: c }}>{pr.nome}</span></span>
              {p.regioes && p.regioes.length > 0 && <Cobertura p={p} />}
            </div>
            {p.mit && <Passo rotulo="mit" atual={p.mit[0]} max={p.mit[1]} cor={c} />}
            {p.pd && <Passo rotulo="pd" atual={p.pd[0]} max={p.pd[1]} cor={c} />}
          </div>
        )}
        {p.linhas && p.linhas.length > 0 && (
          <div>{p.linhas.map((l) => (
            <div key={l.rotulo} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
              <Tag className="hx-dim" style={{ fontSize: 9 }}>{l.rotulo}</Tag><span style={{ textAlign: "right", fontSize: 14, fontWeight: 600 }}>{l.valor}</span>
            </div>
          ))}</div>
        )}
        {p.descricao && <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--hx-texto)", opacity: .85 }}>{p.descricao}</div>}
      </div>
    </>
  );
}
