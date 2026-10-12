"use client";

import { corCategoria } from "../../../../_design/itemCategoryColors";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";

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

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BODY_PATHS, type BodyRegiao } from "../../bodySilhouette";
import { oxanium } from "../../../../_design/oxanium";
import { useCentroDoConsole } from "../../useCentroDoConsole";
import { ArrowLeftRight, ArrowRight, Crosshair, Eye, Hand, Package, RotateCcw, Trash2, Warehouse, X, Zap } from "lucide-react";
import { useDicaPortal } from "../../../../mesas/[campaignId]/vtt/_painel/ui/DicaPortal";
import { ResourceValueCard } from "../ResourceValueCard";
import "./hud-base.css";
import "./equipamento-motion.css";

export type EncaixeHud =
  | "cabeca" | "tronco" | "membro_superior" | "membro_inferior"
  | "arma_primaria" | "arma_secundaria" | "acesso_rapido_1" | "acesso_rapido_2" | "traje" | "suporte_municao" | "acessorio_1" | "acessorio_2" | "estrutura_dorsal" | "locomocao" | "mochila_equipada" ;

export interface PecaHud {
  /** Nome do modelo preservado mesmo quando a instância é renomeada. */
  weaponName?: string;
  suporteMunicao?: boolean;
  modosAtaque?: {id:string;dado_dano:string}[];
  modoAtaqueEscolhido?: string;
  temaCategoria?: string;
  /** Id da INSTÂNCIA no inventário. */
  id: string;
  nome: string;
  categoria: string;
  tipo?: string | null;
  categoriaRotulo: string;
  /** Vertente da categoria — a cor de itens que não protegem. */
  vertente: string;
  raridade?: string | null;
  onde: "equipado" | "mochila" | "abrigo";
  espacos: number;
  /** Propriedades do item (Perfuração, Precisão…), com a regra de cada uma. */
  propriedades?: { nome: string; descricao: string | null }[];
  /** Arma de duas mãos — não oferece "equipar na outra mão". */
  duasMaos?: boolean;
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
  onModoAtaque?: (id:string,modo:string) => void;
  onEquipar: (id: string, e: EncaixeHud) => void;
  onTirar: (id: string) => void;
  onTrazer: (id: string) => void;
  onMover?: (id: string, estado: "acesso_rapido" | "abrigo" | "mochila") => void;
  onDescartar?: (id: string) => void;
  onDefinirMit: (id: string, valor: number) => void;
  onDefinirPd: (id: string, valor: number) => void;
  onDefinirMunicao?: (id: string, valor: number) => void;
  onAtacar: (e: "arma_primaria" | "arma_secundaria") => void;
  onRecarregar: (id: string) => void;
  onUsar: (id: string) => void;
}

const CY = "#00d4ff", AMB = "#ff8a1f", CASCO = "#081925", PERIGO = "#ff5f74", OK = "#22d3aa";
const RAR: Record<string, string> = { comum: "#7f95b3", incomum: OK, raro: "#8b5cf6" };
const corRar = (r?: string | null) => (r ? RAR[r.toLowerCase()] ?? "#7f95b3" : "#7f95b3");
const PROT: Record<string, { c: string; s: string; nome: string }> = {
  /* Físico e energético em vermelho; híbrido em roxo. */
  fisica: { c: "#e0455f", s: "FIS", nome: "Físico" },
  energetica: { c: "#e0455f", s: "ENE", nome: "Energético" },
  hibrida: { c: "#8b5cf6", s: "HIB", nome: "Híbrido" },
};
const prot = (p?: string | null) => (p ? PROT[p.toLowerCase()] ?? null : null);
/** Cor da vertente por slug — mesma paleta canônica de `[data-vertente]`. */
const COR_VERTENTE: Record<string, string> = { cinetica: "#e0455f", energetica: "#f07a1f", material: "#f5a200", biotica: "#3ccf6e", sinaptica: "#35c7d8", cognitiva: "#8b5cf6", nenhuma: "#7f95b3" };
const corDe = (p: PecaHud) => corCategoria(p.temaCategoria ?? p.categoria) ?? COR_VERTENTE[p.vertente] ?? CY;

const ROTULO: Record<EncaixeHud, string> = {
  acessorio_1: "Acessório 1",
  acessorio_2: "Acessório 2",
  estrutura_dorsal: "Estrutura dorsal",
  locomocao: "Locomoção",
  mochila_equipada: "Mochila",
  traje: "Traje", suporte_municao: "Suporte de munição",
  cabeca: "Cabeça", tronco: "Tronco", membro_superior: "Braços", membro_inferior: "Pernas",
  arma_primaria: "Primária", arma_secundaria: "Secundária", acesso_rapido_1: "Acesso rápido #1", acesso_rapido_2: "Acesso rápido #2",
};
const ehArmadura = (e: EncaixeHud) => e === "cabeca" || e === "tronco" || e === "membro_superior" || e === "membro_inferior";
const ehArma = (e: EncaixeHud): e is "arma_primaria" | "arma_secundaria" => e === "arma_primaria" || e === "arma_secundaria";
const REGIOES = [{ id: "cabeca", nome: "Cabeça" }, { id: "tronco", nome: "Tronco" }, { id: "bracos", nome: "Braços" }, { id: "pernas", nome: "Pernas" }];


/* ── palco: a NOSSA silhueta (201 × 613) com os encaixes nas laterais ──
   A altura da figura acompanha a altura disponível (medida), e a
   altura de cada encaixe é uma FRAÇÃO dela — o corpo cresce e os fios
   continuam caindo no mesmo lugar. */
const GAVETA = 300, S = 48;
/** Distância horizontal dos encaixes à figura: folgada com a gaveta fechada, colada com ela aberta. */
const FOLGA_FECHADO = 150, FOLGA_ABERTO = 56;
const FIOS: { e: EncaixeHud; lado: "e" | "d"; y: number; pt: [number, number] }[] = [
  { e: "cabeca", lado: "e", y: 0.035, pt: [70, 38] },
  { e: "tronco", lado: "e", y: 0.24, pt: [85, 165] },
  { e: "membro_superior", lado: "e", y: 0.42, pt: [28, 200] },
  { e: "arma_primaria", lado: "e", y: 0.6, pt: [14, 322] },
  { e: "membro_inferior", lado: "e", y: 0.78, pt: [58, 440] },
  { e: "estrutura_dorsal", lado: "d", y: 0.15, pt: [118, 165] },
  { e: "traje", lado: "d", y: 0.0, pt: [108, 142] },
  { e: "suporte_municao", lado: "d", y: 0.78, pt: [126, 278] },
  { e: "acesso_rapido_1", lado: "d", y: 0.32, pt: [134, 255] },
  { e: "acesso_rapido_2", lado: "d", y: 0.47, pt: [124, 268] },
  { e: "arma_secundaria", lado: "d", y: 0.62, pt: [150, 322] },
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
  const [entradaEncerrada, setEntradaEncerrada] = useState(false);
  const [sel, setSel] = useState<EncaixeHud | null>(null);
  const [ver, setVer] = useState<PecaHud | null>(null);
  const [hover, setHover] = useState<EncaixeHud | null>(null);
  const abrir = (e: EncaixeHud | null) => { setEntradaEncerrada(true); setSel(e); setVer(null); };
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
  const TOPO_SLOTS = Math.max(0, TOPO - 20);
  const topoSlot = (w: (typeof FIOS)[number]) => w.lado === "e"
    ? Math.max(0, TOPO_SLOTS - 20) + w.y * FH * .85
    : TOPO_SLOTS + w.y * FH;
  // Um mesmo valor interpola toda a geometria: gaveta, corpo, slots e fios.
  const gavetaAberta = sel !== null;
  const [aberturaGaveta, setAberturaGaveta] = useState(0);
  const aberturaGavetaRef = useRef(0);
  useEffect(() => {
    const destino = gavetaAberta ? 1 : 0;
    const origem = aberturaGavetaRef.current;
    if (origem === destino) return;
    const atualizar = (valor: number) => {
      aberturaGavetaRef.current = valor;
      setAberturaGaveta(valor);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      atualizar(destino);
      return;
    }
    let frame: number;
    const inicio = performance.now();
    const animar = (agora: number) => {
      const progresso = Math.min(1, (agora - inicio) / 340);
      const suavizado = 1 - Math.pow(1 - progresso, 3);
      atualizar(origem + (destino - origem) * suavizado);
      if (progresso < 1) frame = requestAnimationFrame(animar);
    };
    frame = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(frame);
  }, [gavetaAberta]);
  const folga = FOLGA_FECHADO + (FOLGA_ABERTO - FOLGA_FECHADO) * aberturaGaveta;
  const PALCO = FW + 2 * (S + folga), FX = (PALCO - FW) / 2;

  return (
    <div className={`hx hx-grade hx-eq-motion ${oxanium.variable}`} data-eq-entrada-encerrada={entradaEncerrada || undefined} onFocusCapture={() => setEntradaEncerrada(true)} style={{ position: "relative", height: "100%", minHeight: 620, overflow: "hidden" }}
      onKeyDown={(ev) => { if (ev.key === "Escape") { if (ver) setVer(null); else setSel(null); } }}>
      <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", height: "100%" }}>
        <div ref={palcoRef} style={{ position: "relative", minWidth: 0, flex: 1 }} onClick={(ev) => { if (!(ev.target as Element).closest("button,g[data-r]")) abrir(null); }}>
          <div style={{ position: "absolute", top: 0, height: "100%", width: PALCO, left: `calc(50% - ${PALCO / 2}px)` }}>
            <div className="hx-eq-corpo" style={{ position: "absolute", top: TOPO, left: FX, height: FH }}>
              <Corpo encaixes={encaixes} sel={sel} hover={hover} altura={FH}
                onSel={(p) => abrir(ENCAIXE_DO_PATH[p])} onHover={(p) => setHover(p ? ENCAIXE_DO_PATH[p] : null)} />
            </div>
            <svg style={{ position: "absolute", left: 0, top: TOPO, pointerEvents: "none", overflow: "visible" }} width={PALCO} height={FH}>
              {FIOS.filter(w => w.e !== "suporte_municao").map((w) => {
                const on = mesmoAlvo(encaixes, sel, w.e) || mesmoAlvo(encaixes, hover, w.e), bx = FX + w.pt[0] * FS, by = w.pt[1] * FS;
                /* O fio aceso segue a cor do item do encaixe (ciano quando vazio). */
                const ocupante = encaixes[w.e], cf = on && ocupante ? corDe(ocupante) : CY;
                const sx = w.lado === "e" ? S : PALCO - S, sy = topoSlot(w) - TOPO + S / 2, ex = w.lado === "e" ? sx + 22 : sx - 22;
                return (
                  <g key={w.e} opacity={on ? 1 : .35} style={{ ["--eq-fio-delay" as string]: `${60 + (w.pt[1] / 613) * 1050}ms` }}>
                    <polyline className="hx-eq-fio" pathLength="1" points={`${bx},${by} ${ex},${sy} ${sx},${sy}`} fill="none" stroke={cf} strokeOpacity={on ? .85 : .25} strokeWidth="1" />
                    <circle className="hx-eq-ponto" cx={bx} cy={by} r={on ? 3 : 2} fill={cf} fillOpacity={on ? 1 : .4} />
                  </g>
                );
              })}
            </svg>
            {FIOS.map((w) => {
              const p = encaixes[w.e];
              return (
                <div key={w.e} className="hx-eq-slot" data-lado={w.lado} style={{ ["--eq-slot-delay" as string]: `${160 + (w.pt[1] / 613) * 1050}ms`, ["--eq-item-cor" as string]: p ? corDe(p) : CY, position: "absolute", top: topoSlot(w), [w.lado === "e" ? "left" : "right"]: 0, display: "flex", flexDirection: "column", alignItems: w.lado === "e" ? "flex-start" : "flex-end", gap: 4 }}
                  onMouseEnter={() => setHover(w.e)} onMouseLeave={() => setHover(null)}>
                  <Encaixe peca={p} encaixe={w.e} lado={w.lado} ativo={sel === w.e} quente={mesmoAlvo(encaixes, hover, w.e)} onClick={() => abrir(sel === w.e ? null : w.e)} />
                  <Tag className="hx-dim" style={{ fontSize: 10, opacity: .7 }}>{ROTULO[w.e]}</Tag>
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", bottom: 38, left: `calc(50% - ${PALCO / 2}px)`, width: PALCO, display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${S}px minmax(0, 1fr)`, alignItems: "end", gap: 12 }}>
            {([["acessorio_1", "acessorio_2"], ["mochila_equipada"], ["locomocao"]] as EncaixeHud[][]).map((grupo, index) => <div key={index} style={{ display: "flex", flexDirection: index === 0 ? "column" : "row", gap: 20, alignItems: index === 0 ? "flex-start" : "center", justifyContent: index === 2 ? "flex-end" : "center" }}>
              {grupo.map(e => <div key={e} style={{ width: S, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}>
                <Encaixe peca={encaixes[e]} encaixe={e} lado={index === 2 ? "d" : "e"} ativo={sel === e} quente={hover === e} onClick={() => abrir(sel === e ? null : e)} />
                <Tag className="hx-dim" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{ROTULO[e]}</Tag>
              </div>)}
            </div>)}
          </div>
        </div>

        <aside aria-hidden={!sel} style={{ position: "relative", flexShrink: 0, overflow: "hidden", width: aberturaGaveta * GAVETA, background: "rgba(12,31,43,.35)", backdropFilter: "blur(2px)" }}>
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

/**
 * Termo de propriedade. A dica é PRÓPRIA (não a etiqueta curta do VTT):
 * nome na cor do item e a regra inteira em texto corrido, numa caixa com
 * espinha na cor do item — a regra é frase, não rótulo.
 */
function Propriedade({ nome, descricao, cor }: { nome: string; descricao: string | null; cor: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; acima: boolean } | null>(null);
  const abrir = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const acima = r.bottom + 90 > window.innerHeight;
    setPos({ x: Math.min(Math.max(r.left, 8), window.innerWidth - 268), y: acima ? r.top - 8 : r.bottom + 8, acima });
  };
  return (
    <>
      <span tabIndex={0} className="hx-prop" aria-describedby={pos ? `prop-${nome}` : undefined}
        onMouseEnter={(e) => abrir(e.currentTarget)} onMouseLeave={() => setPos(null)}
        onFocus={(e) => abrir(e.currentTarget)} onBlur={() => setPos(null)}>{nome}</span>
      {pos && descricao && typeof document !== "undefined" && createPortal(
        <span id={`prop-${nome}`} role="tooltip" className="hx-prop-dica" data-acima={pos.acima || undefined}
          style={{ left: pos.x, top: pos.y, ["--k" as string]: cor }}>
          <b>{nome}</b>{descricao}
        </span>,
        document.body,
      )}
    </>
  );
}

/** Mais de um tipo de dano: "cortante ou perfurante" → "cortante/perfurante" (a prévia não quebra linha). */
function abreviarDano(tipo: string): string {
  const partes = tipo.split(/\s+ou\s+|\s*\/\s*|\s*,\s*/).filter(Boolean);
  return partes.length < 2 ? tipo : partes.join("/");
}

/** "SW-80 Parallax (Rifle de precisão)" → título + tipo, como na lista do inventário. */
function separarTipo(nome: string): { titulo: string; tipo: string | null } {
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(nome);
  return m ? { titulo: m[1], tipo: m[2] } : { titulo: nome, tipo: null };
}

function Encaixe({ peca, encaixe, ativo, quente, onClick, lado = "e" }: { peca: PecaHud | null; encaixe: EncaixeHud; ativo: boolean; quente?: boolean; onClick: () => void; lado?: "e" | "d" }) {
  const previaId = useId();
  const cor = peca ? corDe(peca) : CY;
  const resumo = peca?.categoria === "arma" && peca.dano
    ? `Dano ${peca.dano.dado}${peca.dano.tipo ? ` · ${abreviarDano(peca.dano.tipo)}` : ""}`
    : peca?.categoria === "armadura" && peca.mit
      ? `MIT ${peca.mit[0]}/${peca.mit[1]}`
      : peca?.categoria === "escudo" && peca.pd
        ? `PD ${peca.pd[0]}/${peca.pd[1]}` : null;
  const selo = peca?.mit ? peca.mit[0] : peca?.pd ? peca.pd[0] : undefined;
  return (
    <button type="button" onClick={onClick} className="hx-encaixe" data-vazio={!peca || undefined} data-ativo={ativo || undefined} data-quente={quente || undefined}
      aria-label={`${ROTULO[encaixe]}: ${peca ? peca.nome : "vazio"}`} aria-pressed={ativo} aria-describedby={peca ? previaId : undefined} style={{ width: S, height: S, ["--k" as string]: cor }}>
      <span className="hx-encaixe-placa" />
      {peca && (
        <span id={previaId} role="tooltip" className="hx-eq-previa">
          <span className="hx-eq-previa-nome">{peca.nome}</span>
          {resumo && <span className="hx-eq-previa-stat">{resumo}</span>}
        </span>
      )}
      {peca && <span style={{ position: "absolute", right: 0, top: 0, width: 0, height: 0, borderLeft: "8px solid transparent", borderTop: `8px solid ${corRar(peca.raridade)}` }} />}
      <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "grid" }}>
        <ItemCategoryIcon category={ehArmadura(encaixe) ? encaixe : encaixe === "mochila_equipada" ? "mochila_equipada" : peca?.categoria ?? (encaixe === "arma_secundaria" ? "escudo" : ehArma(encaixe) ? "arma" : encaixe.startsWith("acesso_rapido") ? "acesso_rapido" : encaixe)} weaponName={peca?.weaponName ?? peca?.nome} itemType={peca?.tipo} size={S * .46} color={peca ? cor : CY} strokeWidth={1.5} style={{ opacity: peca ? 1 : .22 }} />
      </span>
      {selo != null && (
        <span className="hx-display" style={{ position: "absolute", top: "50%", transform: "translateY(-50%)",
          /* Sobre o FIO: fora do encaixe, do lado do corpo, na altura em que o conector chega. */
          [lado === "e" ? "left" : "right"]: "calc(100% - 9px)", display: "grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 2px", background: "var(--hx-abismo)", fontSize: 12, fontWeight: 900, lineHeight: 1, color: cor, boxShadow: `0 0 0 1px ${cor}80` }}>{selo}</span>
      )}
    </button>
  );
}

function Corpo({ encaixes, sel, hover, altura, onSel, onHover }: {
  encaixes: Record<EncaixeHud, PecaHud | null>; sel: EncaixeHud | null; hover: EncaixeHud | null; altura: number;
  onSel: (p: BodyRegiao) => void; onHover: (p: BodyRegiao | null) => void;
}) {
  const recorteId = useId();
  return (
    <svg viewBox="0 0 201 613" height={altura} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <defs>
        <clipPath id={`${recorteId}-scan`}>{BODY_PATHS.map((path, i) => <path key={i} d={path.d} />)}</clipPath>
        <linearGradient id={`${recorteId}-luz`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CY} stopOpacity="0" />
          <stop offset=".8" stopColor={CY} stopOpacity=".16" />
          <stop offset="1" stopColor="#6ff0ff" stopOpacity=".65" />
        </linearGradient>
        {/* Contorno INTERNO: o traço é o dobro da largura e recortado
            pelo próprio path — só a metade de dentro aparece. */}
        {BODY_PATHS.map((path, i) => <clipPath key={i} id={`${recorteId}-regiao-${i}`}><path d={path.d} /></clipPath>)}
      </defs>
      {BODY_PATHS.map((path, i) => {
        const e = ENCAIXE_DO_PATH[path.regiao], p = encaixes[e];
        // Armadura vestida E arma empunhada preenchem a região (a mão, no caso da arma).
        const pr = p && (ehArmadura(e) || ehArma(e)) ? p : null, c = pr ? corDe(pr) : CY;
        const f = pr?.mit ? .18 + .4 * (pr.mit[0] / Math.max(pr.mit[1], 1)) : pr ? .5 : 0;
        const on = mesmoAlvo(encaixes, sel, e) || mesmoAlvo(encaixes, hover, e);
        return (
          <g key={i} data-r style={{ cursor: "pointer" }} onClick={() => onSel(path.regiao)} onMouseEnter={() => onHover(path.regiao)} onMouseLeave={() => onHover(null)}>
            <path d={path.d} fill={path.fill} />
            <path d={path.d} fill={c} fillOpacity={on && pr ? .24 : 0}
              pointerEvents="none" style={{ transition: "fill-opacity .2s ease-out" }} />
            {/* Coberta: véu translúcido + listras diagonais finas e juntas
                (4 px) na cor da armadura, mais fortes quanto mais MIT resta;
                contorno sólido. A anatomia segue visível. */}
            {pr && (
              <>
                <defs>
                  <pattern id={`${recorteId}-placa-${i}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill={c} fillOpacity={f * .5} />
                    <line x1="0.5" y1="0" x2="0.5" y2="4" stroke={c} strokeOpacity={Math.min(.75, f + .2)} strokeWidth="1" />
                  </pattern>
                </defs>
                <path d={path.d} fill={`url(#${recorteId}-placa-${i})`} />
              </>
            )}
            {/* A luz acompanha a região sem encobrir a textura holográfica. */}
            <path d={path.d} fill={c} fillOpacity={on ? .08 : 0}
              pointerEvents="none" style={{ transition: "fill-opacity .2s ease-out" }} />
            <path d={path.d} fill="none" clipPath={`url(#${recorteId}-regiao-${i})`}
              stroke={c} strokeOpacity={on ? (pr ? 1 : .9) : pr ? .8 : .1} strokeWidth={pr ? (on ? 2.6 : 2) : on ? 1.6 : 1.2}
              strokeDasharray={pr ? undefined : "3 3"} style={{ transition: "stroke-opacity .2s, stroke-width .2s, filter .2s", filter: on && pr ? `drop-shadow(0 0 3px ${c})` : "none", mixBlendMode: "screen" }} />
          </g>
        );
      })}
      <g clipPath={`url(#${recorteId}-scan)`} pointerEvents="none">
        <rect className="hx-eq-varredura" x="0" y="0" width="201" height="44" fill={`url(#${recorteId}-luz)`} />
      </g>
    </svg>
  );
}

/**
 * Mesmo encaixe — ou o PAR de mãos de uma arma de duas mãos (o mesmo item
 * em Primária e Secundária): o hover/seleção de um acende os dois.
 */
function mesmoAlvo(encaixes: Record<EncaixeHud, PecaHud | null>, a: EncaixeHud | null, b: EncaixeHud): boolean {
  if (a === b) return true;
  if (!a || !ehArma(a) || !ehArma(b)) return false;
  const pa = encaixes[a], pb = encaixes[b];
  return !!pa && !!pb && pa.id === pb.id;
}

/* ── gaveta ── */
/* `cor`: a do ITEM — o tipo de proteção acompanha a cor da peça (que já
   varia com física/energética/híbrida), não uma paleta paralela. */
const ProtTag = ({ p, cor }: { p?: string | null; cor?: string }) => { const x = prot(p); return x ? <span className="hx-mono" style={{ fontSize: 10, letterSpacing: ".16em", color: cor ?? x.c }}>{x.s}</span> : null; };
/* Cobertura por extenso — só quando a armadura protege MAIS de uma
   região; com uma só, o encaixe onde ela está já diz qual é. Os pips de
   antes, colados no "2/2" da MIT, liam como contagem. */
const Cobertura = ({ p }: { p: PecaHud }) => {
  const nomes = REGIOES.filter((r) => p.regioes?.includes(r.id)).map((r) => r.nome);
  if (nomes.length <= 1) return null;
  return <Tag className="hx-dim" style={{ display: "block", fontSize: 10, lineHeight: 1.4 }}>{nomes.length === REGIOES.length ? "Corpo inteiro" : nomes.join(", ")}</Tag>;
};
const Btn = ({ children, onClick, ambar }: { children: ReactNode; onClick: () => void; ambar?: boolean }) => (
  <button type="button" className="hx-btn-acao" data-ambar={ambar || undefined} onClick={(ev) => { ev.stopPropagation(); onClick(); }}>{children}</button>
);
function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, transform: "rotate(45deg)", border: "1px solid rgba(0,212,255,.5)" }} />
        <span className="hx-display" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".22em", opacity: .8 }}>{titulo}</span>
        <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, rgba(0,212,255,.25), transparent)" }} />
        {acao}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}
const Vazio = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "grid", placeItems: "center", minHeight: 52, padding: "8px 12px", border: "1px dashed rgba(0,212,255,.2)", textAlign: "center" }}><Tag className="hx-dim" style={{ fontSize: 10 }}>{children}</Tag></div>
);

/**
 * `acao`: o cartão INTEIRO é o botão (itens disponíveis). Clicar faz a
 * ação; o prompt "↵ vestir" no canto acende no hover. Ver o item fica no
 * olho ao lado do prompt (ou no clique direito).
 */
function Cartao({ p, acoes, comando, apagado, marca, pe, onVer, ativo, ganho, acao, onMenu }: { p: PecaHud; acoes?: ReactNode; comando?: ReactNode; apagado?: boolean; marca?: string; pe?: ReactNode; onVer: () => void; ativo?: boolean; ganho?: number; acao?: { rotulo: string; onClick: () => void; ambar?: boolean }; onMenu?: (x: number, y: number) => void }) {
  return (
    <div onClick={acao ? acao.onClick : onVer} onContextMenu={acao ? (ev) => { ev.preventDefault(); if (onMenu) onMenu(ev.clientX, ev.clientY); else onVer(); } : undefined}
      role={acao ? "button" : undefined} tabIndex={acao ? 0 : undefined} aria-label={acao ? `${acao.rotulo} ${p.nome}` : undefined}
      onKeyDown={acao ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); acao.onClick(); } } : undefined}
      data-acao={acao ? "true" : undefined}
      className={`hx-ch hx-cartao ${ativo ? "hx-edge" : ""}`} style={{ ["--k" as string]: acao?.ambar ? AMB : corDe(p), cursor: "pointer", opacity: apagado ? .6 : 1 }}>
      {acao && (
        <span className="hx-cartao-prompt">
          <button type="button" className="hx-cartao-ver" aria-label={`Ver ${p.nome}`} title="Ver item"
            onClick={(ev) => { ev.stopPropagation(); onVer(); }}><Eye size={14} strokeWidth={1.8} aria-hidden="true" /></button>
          <span className="hx-cartao-acao"><span className="hx-cartao-tecla" aria-hidden="true">↵</span>{acao.rotulo}</span>
        </span>
      )}
      <div className="hx-ch hx-cartao-miolo" style={{ position: "relative" }}>
        {marca && <span className="hx-mono" style={{ position: "absolute", right: 12, top: 0, padding: "1px 6px", background: "rgba(255,138,31,.15)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".16em", color: AMB }}>{marca}</span>}
        <div style={comando ? { display: "grid", gridTemplateColumns: "minmax(0,1fr) 46px" } : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
            {/* O tipo de proteção (FIS/HIB/ENE) mora no canto direito da linha do nome. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div className="hx-display" style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.15, letterSpacing: ".04em" }}>{separarTipo(p.nome).titulo}</div>
              <ProtTag p={p.protecao} cor={corDe(p)} />
            </div>
            {separarTipo(p.nome).tipo && <Tag className="hx-dim" style={{ display: "block", marginTop: 3, fontSize: 10, opacity: .75 }}>{separarTipo(p.nome).tipo}</Tag>}
            {/* Cobertura em linha própria: na linha dos números ela quebrava e empurrava a MIT. */}
            {p.regioes && p.regioes.length > 1 && <div style={{ marginTop: 3 }}><Cobertura p={p} /></div>}
            {/* Com o pé (MIT/PD em barra), a linha de números repetiria o mesmo valor: some. */}
            {!(pe && (p.mit || p.pd) && !p.dano) && <div className="hx-cartao-stats" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
              {p.mit && <span className="hx-display" style={{ fontSize: 12, fontWeight: 700, opacity: .75 }}>{p.mit[0]}<span className="hx-dim">/{p.mit[1]}</span></span>}
              {/* Quanto de MIT a troca ganha — junto do número que ela muda. */}
              {ganho != null && ganho > 0 && <span className="hx-display" style={{ fontSize: 12, fontWeight: 900, color: OK }}>▲{ganho}</span>}
              {p.pd && <span className="hx-display" style={{ fontSize: 12, fontWeight: 700, opacity: .75 }}>PD {p.pd[0]}<span className="hx-dim">/{p.pd[1]}</span></span>}
              {p.dano && <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}><span className="hx-display" style={{ fontSize: 15, fontWeight: 900, color: PERIGO }}>{p.dano.dado}</span>{p.dano.tipo && <Tag style={{ fontSize: 10, color: PERIGO, opacity: .7 }}>{p.dano.tipo}</Tag>}</span>}
              {!p.protecao && !p.dano && <Tag className="hx-dim" style={{ fontSize: 10 }}>{p.categoriaRotulo}</Tag>}
            </div>}
          </div>
          {acoes && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{acoes}</div>}
        </div>
        {comando && <div className="hx-comando" onClick={(ev) => ev.stopPropagation()}>{comando}</div>}
        </div>
        {pe && <div onClick={(ev) => ev.stopPropagation()} style={{ borderTop: "1px solid rgba(0,212,255,.1)", background: "rgba(6,18,28,.4)", padding: "8px 12px" }}>{pe}</div>}
      </div>
    </div>
  );
}

/**
 * Botão da COLUNA DE COMANDO do cartão equipado: só ícone, colado na
 * borda direita, com a dica do VTT. `primario` é o bloco ciano cheio
 * (Atacar); `perigo` acende em âmbar no hover (Tirar).
 */
function Comando({ rotulo, icone, onClick, primario, perigo }: { rotulo: string; icone: ReactNode; onClick: () => void; primario?: boolean; perigo?: boolean }) {
  const { alvo, dica } = useDicaPortal(rotulo, { lado: "acima" });
  return (
    <>
      <button {...alvo} type="button" className="hx-comando-btn" data-primario={primario || undefined} data-perigo={perigo || undefined}
        aria-label={rotulo} onClick={(ev) => { ev.stopPropagation(); onClick(); }}>{icone}</button>
      {dica}
    </>
  );
}

/**
 * Munição carregada: barra contínua (com marcas a cada 10 tiros, ou 20
 * em armas de 60+) e o valor entre − e +. O valor é o MESMO editor dos
 * recursos (`ResourceValueCard`): clicar abre o campo, que aceita
 * absoluto ("12"), "+N" ou "-N".
 */
function Municao({ atual, max, onMudar }: { atual: number; max: number; onMudar?: (v: number) => void }) {
  const passo = max >= 60 ? 20 : 10;
  const marcas: number[] = [];
  for (let i = passo; i < max; i += passo) marcas.push(i);
  const b = (d: number) => (
    <button type="button" disabled={!onMudar || (d < 0 ? atual <= 0 : atual >= max)} onClick={(ev) => { ev.stopPropagation(); onMudar?.(atual + d); }}
      aria-label={`${d > 0 ? "Aumentar" : "Reduzir"} munição`} className="hx-ch-hex hx-passo-mit">{d > 0 ? "+" : "−"}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Tag className="hx-dim" style={{ fontSize: 10 }}>mun.</Tag>
      <span className="hx-mun-barra" aria-hidden="true">
        <i style={{ width: `${max > 0 ? Math.min(100, (atual / max) * 100) : 0}%` }} />
        {marcas.map((m) => <b key={m} style={{ left: `${(m / max) * 100}%` }} />)}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {onMudar && b(-1)}
        <ResourceValueCard atual={atual} max={max} rotulo="Munição" className="hx-mun-valor" inputClassName="hx-mun-input" maxClassName="hx-mun-max"
          onGravar={(v) => onMudar?.(v)} readOnly={!onMudar} testIdPrefix="console-eq" />
        {onMudar && b(1)}
      </span>
    </div>
  );
}

function Passo({ rotulo, atual, max, cor, onMudar }: { rotulo: string; atual: number; max: number; cor: string; onMudar?: (v: number) => void }) {
  const b = (d: number, dis: boolean) => (
    <button type="button" disabled={dis || !onMudar} onClick={(ev) => { ev.stopPropagation(); onMudar?.(atual + d); }} aria-label={`${d > 0 ? "Aumentar" : "Reduzir"} ${rotulo}`} className="hx-ch-hex hx-passo-mit">{d > 0 ? "+" : "−"}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Tag className="hx-dim" style={{ fontSize: 10 }}>{rotulo}</Tag>
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
        <Tag style={{ fontSize: 10, color: "rgba(0,212,255,.6)" }}>{chapeu}</Tag>
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
  const [menu, setMenu] = useState<{ p: PecaHud; x: number; y: number } | null>(null);
  const corpo = (c: ReactNode) => <div className="hx-boot hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>{c}</div>;
  const chapeu = ehArmadura(e) ? "proteção" : ehArma(e) ? "mãos" : e === "traje" ? "vestuário" : e === "suporte_municao" ? "munição" : e.startsWith("acessorio") ? "acessórios" : e === "mochila_equipada" ? "armazenamento" : e === "estrutura_dorsal" || e === "locomocao" ? "mobilidade" : "acesso rápido";

  /* Sem nenhuma ação (armadura, traje…), a coluna não existe: vazia,
     ela sobrava como um retângulo morto no canto do cartão. */
  const temComando = (p: PecaHud) => !!((ehArma(e) && (p.dano || p.modosAtaque?.length)) || p.municao || p.suporteMunicao || (!ehArma(e) && !ehArmadura(e) && p.usavel));
  const comandoDoAtual = (p: PecaHud) => leitura || !temComando(p) ? undefined : (
    <>
      {ehArma(e) && (p.dano || p.modosAtaque?.length) && <Comando primario rotulo="Atacar" icone={<Crosshair size={17} strokeWidth={1.8} />} onClick={() => props.onAtacar(e)} />}
      {(p.municao || p.suporteMunicao) && <Comando rotulo="Recarregar" icone={<RotateCcw size={17} strokeWidth={1.8} />} onClick={() => props.onRecarregar(p.id)} />}
      {!ehArma(e) && !ehArmadura(e) && p.usavel && <Comando primario rotulo="Usar" icone={<Hand size={17} strokeWidth={1.8} />} onClick={() => props.onUsar(p.id)} />}
    </>
  );
  /* O modo de ataque é escolha, não ação: fica no pé, junto da munição. */
  const modoDoAtual = (p: PecaHud) => !leitura && p.modosAtaque && p.modosAtaque.length > 1 ? (
    <>
      {p.modosAtaque && p.modosAtaque.length > 1 && <label style={{display:"grid",gap:6,fontSize:12}}>Modo de ataque<select aria-label="Modo de ataque" value={p.modoAtaqueEscolhido ?? p.modosAtaque[0].id} disabled={props.somenteLeitura} onChange={ev=>props.onModoAtaque?.(p.id,ev.target.value)} style={{background:CASCO,color:"inherit",border:"1px solid rgba(0,212,255,.25)",padding:8}}>{p.modosAtaque.map(m=><option key={m.id} value={m.id}>{m.id === "arremesso" ? "Arremesso" : "Corpo a corpo"} · Corpo + {m.dado_dano}</option>)}</select></label>}
    </>
  ) : null;
  const peDoAtual = (p: PecaHud) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {p.mit && <Passo rotulo="mit" atual={p.mit[0]} max={p.mit[1]} cor={corDe(p)} onMudar={leitura ? undefined : (v) => props.onDefinirMit(p.id, v)} />}
      {p.pd && <Passo rotulo="pd" atual={p.pd[0]} max={p.pd[1]} cor={corDe(p)} onMudar={leitura ? undefined : (v) => props.onDefinirPd(p.id, v)} />}
      {modoDoAtual(p)}
      {p.municao && <Municao atual={p.municao[0]} max={p.municao[1]} onMudar={leitura || !props.onDefinirMunicao ? undefined : (v) => props.onDefinirMunicao?.(p.id, v)} />}
    </div>
  );
  const temPe = (p: PecaHud) => !!(p.mit || p.pd || p.municao || modoDoAtual(p));

  return (
    <>
      <Cabeca chapeu={chapeu} titulo={ROTULO[e]} onFechar={props.onFechar} />
      {corpo(<>
        {ehArmadura(e) && (() => {
          const pr = atual ? prot(atual.protecao) : null, base = atual?.mit?.[0] ?? 0, hc = atual ? corDe(atual) : PERIGO;
          return (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, padding: "8px 4px" }}>
              <span className="hx-display" style={{ fontSize: 46, fontWeight: 900, lineHeight: .8, color: hc, textShadow: `0 0 24px ${hc}66` }}>{base}</span>
              <div style={{ lineHeight: 1.2 }}>
                <Tag className="hx-dim" style={{ display: "block", fontSize: 10 }}>mitigação</Tag>
                <span className="hx-display" style={{ marginTop: 4, display: "block", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: hc }}>{atual ? pr?.nome ?? "—" : "desprotegido"}</span>
              </div>
            </div>
          );
        })()}
        {/* "Tirar" esvazia o ENCAIXE: mora no cabeçalho da seção, longe do
            Atacar, e não divide a coluna de comando com o uso da arma. */}
        <Secao titulo={ehArmadura(e) ? "vestido" : "equipado"}
          acao={atual && !leitura ? (
            <button type="button" className="hx-secao-acao" onClick={() => props.onTirar(atual.id)} data-testid="console-eq-tirar">
              remover <X size={11} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : undefined}>
          {atual ? <Cartao p={atual} ativo onVer={() => onVer(atual)} comando={comandoDoAtual(atual)} pe={temPe(atual) ? peDoAtual(atual) : undefined} />
            : <Vazio>{ehArmadura(e) ? "nada vestido" : "vazio"}</Vazio>}
        </Secao>
        {!leitura && (
          <Secao titulo="disponível">
            {cands.length ? cands.map((p) => {
              const ab = p.onde === "abrigo";
              const ganho = ehArmadura(e) && p.mit ? p.mit[0] - (atual?.mit?.[0] ?? 0) : 0;
              return <Cartao key={p.id} p={p} apagado={ab} marca={ab ? "abrigo" : undefined} onVer={() => onVer(p)} ganho={ganho}
                acao={{ rotulo: ab ? "trazer" : ehArmadura(e) ? "vestir" : "equipar", ambar: ab, onClick: () => (ab ? props.onTrazer(p.id) : props.onEquipar(p.id, e)) }}
                onMenu={(x, y) => setMenu({ p, x, y })} />;
            }) : <Vazio>nenhum item compatível na mochila ou no abrigo</Vazio>}
          </Secao>
        )}
      </>)}
      {menu && (
        <MenuDoItem
          p={menu.p} x={menu.x} y={menu.y} encaixe={e}
          onFechar={() => setMenu(null)}
          onEquipar={(enc) => props.onEquipar(menu.p.id, enc)}
          onTrazer={() => props.onTrazer(menu.p.id)}
          onVer={() => onVer(menu.p)}
          onMover={props.onMover ? (estado) => props.onMover?.(menu.p.id, estado) : undefined}
          onDescartar={props.onDescartar ? () => props.onDescartar?.(menu.p.id) : undefined}
        />
      )}
    </>
  );
}

/**
 * Menu do botão direito de um item DISPONÍVEL. Cabeçalho com o item e
 * de onde ele vem; as duas ações mais usadas (equipar e ver) como blocos;
 * o resto em lista; "Descartar" isolado embaixo, com segundo clique de
 * confirmação (não dá para desfazer pela ficha). Só aparece o que faz
 * sentido para aquele item.
 */
function MenuDoItem({ p, x, y, encaixe, onFechar, onEquipar, onTrazer, onVer, onMover, onDescartar }: {
  p: PecaHud; x: number; y: number; encaixe: EncaixeHud;
  onFechar: () => void; onEquipar: (e: EncaixeHud) => void; onTrazer: () => void; onVer: () => void;
  onMover?: (estado: "acesso_rapido" | "abrigo" | "mochila") => void; onDescartar?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setPos({ left: Math.min(x, window.innerWidth - el.offsetWidth - 8), top: Math.min(y, window.innerHeight - el.offsetHeight - 8) });
    el?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const fora = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) onFechar(); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onFechar(); } };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [x, y, onFechar]);
  const fazer = (f: () => void) => () => { f(); onFechar(); };
  const noAbrigo = p.onde === "abrigo";
  const verbo = noAbrigo ? "Trazer" : ehArmadura(encaixe) ? "Vestir" : "Equipar";
  const outra: EncaixeHud | null = ehArma(encaixe) && !p.duasMaos && !noAbrigo ? (encaixe === "arma_primaria" ? "arma_secundaria" : "arma_primaria") : null;
  const titulo = separarTipo(p.nome).titulo;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="hx-menu" role="menu" aria-label={`Ações de ${p.nome}`} style={{ left: pos.left, top: pos.top, ["--k" as string]: corDe(p) }}
      onContextMenu={(ev) => ev.preventDefault()}>
      <div className="hx-menu-cab">
        <span className="hx-menu-icone" aria-hidden="true">
          <ItemCategoryIcon category={p.categoria} weaponName={p.weaponName ?? p.nome} itemType={p.tipo} armorRegions={p.regioes} size={18} color={corDe(p)} strokeWidth={1.6} />
        </span>
        <span className="hx-menu-id">
          <span className="hx-menu-nome">{titulo}</span>
          <span className="hx-menu-meta">
            {p.dano ? <><b>{p.dano.dado}</b>{p.dano.tipo && <span>{p.dano.tipo}</span>}</>
              : p.mit ? <span>MIT {p.mit[0]}/{p.mit[1]}</span>
              : p.pd ? <span>PD {p.pd[0]}/{p.pd[1]}</span>
              : <span>{separarTipo(p.nome).tipo ?? p.categoriaRotulo}</span>}
          </span>
        </span>
      </div>
      <button type="button" role="menuitem" className="hx-menu-acao" onClick={fazer(noAbrigo ? onTrazer : () => onEquipar(encaixe))}>
        {verbo}<ArrowRight aria-hidden="true" />
      </button>
      <div className="hx-menu-secao">
        <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(onVer)}><Eye aria-hidden="true" />Ver item</button>
        {outra && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => onEquipar(outra))}><ArrowLeftRight aria-hidden="true" />Equipar na outra mão</button>}
        {onMover && !noAbrigo && p.espacos <= 1 && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => onMover("acesso_rapido"))}><Zap aria-hidden="true" />Mover para acesso rápido</button>}
        {onMover && (noAbrigo
          ? <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => onMover("mochila"))}><Package aria-hidden="true" />Trazer para a mochila</button>
          : <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => onMover("abrigo"))}><Warehouse aria-hidden="true" />Guardar no abrigo</button>)}
      </div>
      {onDescartar && (
        <div className="hx-menu-secao">
          <button type="button" role="menuitem" className="hx-menu-item" data-perigo data-confirmando={confirmando || undefined}
            onClick={() => { if (confirmando) { onDescartar(); onFechar(); } else setConfirmando(true); }}>
            <Trash2 aria-hidden="true" />{confirmando ? "Clique de novo para descartar" : "Descartar"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ── ficha completa ── */
/**
 * O MODAL DE ITEM — o mesmo da aba Equipamentos, reaproveitado pelo
 * Inventário. `rodape` recebe as ações de quem abriu (quantidade, usar,
 * mover, descartar…). `fixo`: posição fixa (cobre a janela do Console)
 * em vez de absoluta no palco de quem chama.
 */
export function FichaItemModal({ p, onFechar, rodape, fixo = false }: { p: PecaHud; onFechar: () => void; rodape?: ReactNode; fixo?: boolean }) {
  /* `fixo` sai por PORTAL no body: dentro do palco rolável do Inventário,
     o modal ficava preso ao contexto de empilhamento dele e a régua de
     espaços (irmã de fora) passava por cima. */
  // Centro da janela do Console: o modal sai pelo body, mas centraliza NELE, não na tela.
  const centro = useCentroDoConsole();
  const noCentro = fixo && centro ? { position: "absolute" as const, left: centro.x, top: centro.y, transform: "translate(-50%, -50%)" } : undefined;
  const modal = (
    <div className={`hx ${oxanium.variable}`} onClick={(ev) => { if (ev.target === ev.currentTarget) onFechar(); }}
      style={{ position: fixo ? "fixed" : "absolute", inset: 0, zIndex: fixo ? 700 : 40, display: "grid", placeItems: "center", background: "rgba(6,18,28,.75)", backdropFilter: "blur(2px)" }}>
      <div style={noCentro ? { ...noCentro, width: 420, maxWidth: "calc(100% - 32px)" } : { display: "contents" }}>
      <div className="hx-edge hx-ch hx-pop" role="dialog" aria-label={p.nome} style={{ width: 420, maxWidth: noCentro ? "100%" : "calc(100% - 32px)", boxShadow: "0 30px 80px -20px #000" }}>
        <div className="hx-ch" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "min(660px, calc(100vh - 160px))", background: CASCO }}>
          <Ficha p={p} voltar={onFechar} />
          {rodape && <div style={{ flexShrink: 0, borderTop: "1px solid rgba(0,212,255,.1)", padding: "10px 16px" }}>{rodape}</div>}
        </div>
      </div>
      </div>
    </div>
  );
  return fixo && typeof document !== "undefined" ? createPortal(<div className="rc-cursor-scope">{modal}</div>, document.body) : modal;
}

function Ficha({ p, voltar }: { p: PecaHud; voltar: () => void }) {
  const c = corDe(p), pr = prot(p.protecao);
  return (
    <>
      <div style={{ position: "relative", display: "grid", placeItems: "center", height: 160, flexShrink: 0, overflow: "hidden", background: `radial-gradient(circle at 50% 55%, ${c}38, transparent 62%)` }}>
        <span className="hx-hexgrid" style={{ position: "absolute", inset: 0, opacity: .6 }} /><span className="hx-scan" style={{ position: "absolute", inset: 0 }} />
        <span className="hx-spin" style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%", border: `1px dashed ${c}44` }} />
        <span className="hx-spinr" style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: `1px solid ${c}30` }} />
        <span className="hx-floaty" style={{ position: "relative" }}><ItemCategoryIcon category={p.categoria} weaponName={p.weaponName ?? p.nome} itemType={p.tipo} armorRegions={p.regioes} size={52} color={c} strokeWidth={1.2} style={{ filter: `drop-shadow(0 0 12px ${c})` }} /></span>
        <button type="button" onClick={voltar} aria-label="Fechar" className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12 }}><Svg d="M6 6l12 12M18 6 6 18" tam={14} cor="currentColor" traco={2} /></button>
      </div>
      <div style={{ position: "relative", padding: "18px 16px 14px", borderBottom: "1px solid rgba(0,212,255,.1)", background: `linear-gradient(180deg, ${c}0f, transparent)` }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, ${c}, ${c}00 70%)` }} />
        <div className="hx-display" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, letterSpacing: ".06em" }}>{separarTipo(p.nome).titulo}</div>
        {separarTipo(p.nome).tipo && <Tag className="hx-dim" style={{ display: "block", marginTop: 6, fontSize: 10, opacity: .75 }}>{separarTipo(p.nome).tipo}</Tag>}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag style={{ fontSize: 10, letterSpacing: ".16em", color: c }}>{p.categoriaRotulo}</Tag>
          {p.raridade && <><span style={{ width: 1, height: 12, background: "rgba(0,212,255,.2)" }} /><Tag style={{ fontSize: 10, letterSpacing: ".16em", color: corRar(p.raridade) }}>{p.raridade}</Tag></>}
          <span style={{ marginLeft: "auto", display: "flex" }}>
            <span style={{ display: "flex", alignItems: "center", padding: "4px 8px", background: "rgba(0,212,255,.07)" }}><Tag className="hx-dim" style={{ fontSize: 10 }}>{p.onde}</Tag></span>
            {/* Espaços como os blocos do inventário: um quadradinho por espaço. */}
            <span title={`Ocupa ${p.espacos} ${p.espacos === 1 ? "espaço" : "espaços"}`} aria-label={`Ocupa ${p.espacos} espaços`}
              style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 8px", background: c + "24" }}>
              <span className="hx-display" style={{ fontSize: 15, fontWeight: 900, lineHeight: 1, marginRight: 6 }}>{p.espacos}</span>
              {Array.from({ length: Math.max(p.espacos, 0) }, (_, i) => <span key={i} style={{ width: 14, height: 12, background: c }} />)}
            </span>
          </span>
        </div>
      </div>
      <div className="hx-semsb" style={{ minHeight: 0, flex: "0 1 auto", overflowY: "auto", padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {p.dano && (
          <div style={{ display: "flex", alignItems: "center", borderLeft: `2px solid ${PERIGO}`, background: "#0a1b26", padding: "10px 0 10px 12px" }}>
            <Tag className="hx-dim" style={{ fontSize: 10 }}>dano</Tag>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6 }}><span className="hx-display" style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: PERIGO }}>{p.dano.dado}</span>{p.dano.tipo && <Tag style={{ fontSize: 10, color: PERIGO, opacity: .7 }}>{p.dano.tipo}</Tag>}</span>
          </div>
        )}
        {pr && (p.mit || p.pd) && (
          <div style={{ borderLeft: `2px solid ${c}`, background: "#0a1b26", padding: "10px 0 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><Tag className="hx-dim" style={{ fontSize: 10 }}>resistência</Tag><span className="hx-display" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: c }}>{pr.nome}</span></span>
              {p.regioes && p.regioes.length > 0 && <Cobertura p={p} />}
            </div>
            {p.mit && <Passo rotulo="mit" atual={p.mit[0]} max={p.mit[1]} cor={c} />}
            {p.pd && <Passo rotulo="pd" atual={p.pd[0]} max={p.pd[1]} cor={c} />}
          </div>
        )}
        {p.linhas && p.linhas.length > 0 && (
          <div>{p.linhas.map((l) => (
            <div key={l.rotulo} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(0,212,255,.08)" }}>
              <Tag className="hx-dim" style={{ fontSize: 10 }}>{l.rotulo}</Tag><span style={{ textAlign: "right", fontSize: 14, fontWeight: 600 }}>{l.valor}</span>
            </div>
          ))}</div>
        )}
        {/* Propriedades: uma linha da tabela, como Alcance e Mãos — rótulo à esquerda, termos à direita. */}
        {p.propriedades && p.propriedades.length > 0 && (
          <div className="hx-props" style={{ ["--k" as string]: corDe(p), display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(0,212,255,.08)", marginTop: p.linhas?.length ? -10 : 0 }}>
            <Tag className="hx-dim" style={{ fontSize: 10, flex: "none" }}>propriedades</Tag>
            <div className="hx-props-lista" style={{ justifyContent: "flex-end", textAlign: "right" }}>
              {p.propriedades.map((x) => <Propriedade key={x.nome} nome={x.nome} descricao={x.descricao} cor={corDe(p)} />)}
            </div>
          </div>
        )}
        {p.descricao && <div style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.6, color: "var(--hx-texto)", opacity: .85 }}>{p.descricao}</div>}
      </div>
    </>
  );
}
