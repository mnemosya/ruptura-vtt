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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Dices, Eye, HeartPulse, MessageSquare, Search, Trash2, Zap } from "lucide-react";
import { oxanium } from "../../../../_design/oxanium";
import { IconeVertente } from "../../../../_design/IconeVertente";
import { CartaoListaHud } from "./CartaoListaHud";
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
export const corTipo = (t: string) => COR_TIPO[t.toLowerCase()] ?? "#7f95b3";
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
  /** Conjuração que não é em PA: "10 MINUTOS", "1 HORA", "REAÇÃO", "TEMPO VARIÁVEL". `null` = custa `pa`. */
  conjuracao?: string | null;
  /** Ex.: "Medicina 5". */
  preRequisito?: string | null;
  reacao?: boolean;
  /** Texto de sabor (nó: o painel passa com glossário). */
  descricao?: ReactNode;
  /** O que a magia faz (nó). Com tabela de níveis, é o texto ANTES dela. */
  efeito?: ReactNode;
  /** Texto depois da tabela de níveis (quando há `escolha` por nível). */
  efeitoDepois?: ReactNode;
  /** Custo escolhido ao conjurar: linha da tabela de níveis ou valor de mana. */
  escolha?: EscolhaHud | null;
  /** Manifestação/forma/efeito escolhidos ao conjurar (Rajada Elemental: Ígnea/Gélida/Elétrica). */
  escolhasConjuracao?: { id: string; rotulo: string; opcoes: { id: string; nome: string; resumo?: string }[] }[];
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

/**
 * O que a magia custa para conjurar: PA, ou tempo/reação quando não usa PA.
 * "10 MINUTOS" → 10 min; "1 HORA" → 1 h; "REAÇÃO" e outros → o texto.
 */
export function acaoDaMagia(m: Pick<MagiaHud, "pa" | "conjuracao">): { valor: string; unidade: string; pa: number | null } {
  if (!m.conjuracao) return { valor: String(m.pa), unidade: "PA", pa: m.pa };
  const tempo = /^(\d+)\s*(minutos?|horas?)$/i.exec(m.conjuracao.trim());
  if (tempo) return { valor: tempo[1], unidade: /^h/i.test(tempo[2]) ? "h" : "min", pa: null };
  return { valor: m.conjuracao.trim().toLowerCase(), unidade: "", pa: null };
}

export type EscolhaHud =
  | { tipo: "nivel"; colunas: string[]; linhas: { nivel: number; celulas: string[]; mana: number; bloqueada: boolean }[] }
  | { tipo: "valor"; min: number; max: number | null };

/** Opções de custo em ordem (nível → mana da linha; valor → o próprio valor). Só as liberadas. */
function opcoesDeCusto(e: EscolhaHud, manaAtual: number): { chave: number; mana: number; rotulo: string }[] {
  if (e.tipo === "nivel") return e.linhas.filter((l) => !l.bloqueada).map((l) => ({ chave: l.nivel, mana: l.mana, rotulo: `nv ${l.nivel}` }));
  const max = e.max ?? Math.max(e.min, manaAtual);
  return Array.from({ length: Math.max(0, max - e.min + 1) }, (_, i) => ({ chave: e.min + i, mana: e.min + i, rotulo: `${e.min + i} mana` }));
}

export interface PropsMagiasHud {
  magias: MagiaHud[];
  /** Nível investido por vertente (canônica). `null`/ausente = desconhecido. */
  niveis: Record<string, number | null | undefined>;
  /** Slug canônico da vertente primária (v1.2) — ganha moldura dupla no anel. */
  primaria?: string | null;
  mana: { atual: number; max: number };
  somenteLeitura?: boolean;
  /** `custoMana`: presente quando a magia tem `escolha` — o custo escolhido. */
  onConjurar: (slug: string, custoMana?: number, escolhas?: Record<string, string>) => void;
  onRolarDano: (slug: string) => void;
  onRolarCura?: (slug: string) => void;
  onAbrirCatalogo?: () => void;
  /** "Enviar ao chat" no menu do card (só na mesa). Devolve erro para avisar. */
  onEnviarAoChat?: (slug: string) => Promise<{ ok: boolean; erro?: string }>;
  /** "Esquecer magia" no menu do card (Modo Evolução). */
  onEsquecer?: (slug: string) => void;
  /** Modo Evolução ("Ajustar"): − e + no nível da vertente. Ausente = só leitura do nível. */
  onAjustarNivel?: (vertente: string, nivel: number) => void;
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

function Secao({ titulo, lado, cor = "rgba(0,212,255,.6)", children }: { titulo: string; lado?: ReactNode; cor?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {/* losango por clip-path (não rotação): fica dentro da própria caixa e não é cortado pela borda da área de rolagem */}
        <span style={{ width: 10, height: 10, flexShrink: 0, clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", background: cor }} />
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
export function Faixa({ m, nivel, semPersonagem, children }: { m: MagiaHud; nivel: number | null | undefined; /** Fora de uma ficha (card do chat): sem o box de NV/CD do personagem. */ semPersonagem?: boolean; children?: ReactNode }) {
  const v = VERT(m.vertente), c = v.c, cd = cdDe(nivel);
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", height: 170, flexShrink: 0, overflow: "hidden", background: `radial-gradient(circle at 50% 55%, ${c}38, transparent 62%)` }}>
      <span className="hx-hexgrid" style={{ position: "absolute", inset: 0, opacity: .6 }} />
      <span className="hx-scan" style={{ position: "absolute", inset: 0 }} />
      <span className="hx-spin" style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", border: `1px dashed ${c}44` }} />
      <span className="hx-spinr" style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `1px solid ${c}30` }} />
      {[18, 34, 52, 66, 80].map((x, i) => <span key={i} className="hx-mote" style={{ position: "absolute", bottom: 16, left: `${x}%`, width: 3, height: 3, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}`, animationDelay: `${i * .8}s` }} />)}
      <span className="hx-floaty" style={{ position: "relative" }}><Glifo v={v} tam={56} traco={1.2} /></span>
      {!semPersonagem && <span style={{ position: "absolute", left: 12, top: 12, display: "flex", background: CASCO + "cc" }}>
        {/* NV e CD na mesma linha de base: rótulo, número e "/5" alinhados pela base do texto */}
        <span title="seu nível na vertente" style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", lineHeight: 1, background: "rgba(0,212,255,.07)" }}>
          <Tag className="hx-dim" style={{ fontSize: 10 }}>nv</Tag>
          <span className="hx-display" style={{ fontSize: 15, fontWeight: 900, color: c }}>{nivel ?? "—"}<span className="hx-dim" style={{ fontSize: 10 }}>/5</span></span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", lineHeight: 1, background: c + "24" }}>
          <Tag style={{ fontSize: 10, color: c }}>cd</Tag>
          <span className="hx-display" style={{ fontSize: 15, fontWeight: 900 }}>{cd ?? "—"}</span>
        </span>
      </span>}
      {children}
    </div>
  );
}

export function Titulo({ m, primaria }: { m: MagiaHud; primaria?: boolean }) {
  const v = VERT(m.vertente), c = v.c;
  const sep = <span style={{ width: 1, height: 12, background: "rgba(0,212,255,.2)" }} />;
  return (
    /* sticky: gruda no topo da área que rola (modal e catálogo); fundo sólido para cobrir o texto que passa por baixo */
    <div style={{ position: "sticky", top: 0, zIndex: 2, padding: "20px 52px 14px 16px", borderBottom: "1px solid rgba(0,212,255,.1)", background: `linear-gradient(180deg, ${c}0f, transparent), ${CASCO}` }}>
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

/** Tabela de níveis da magia como seletor: cada linha é uma opção de conjuração com o custo dela. */
function TabelaDeNiveis({ e, cor, escolhido, onEscolher }: { e: Extract<EscolhaHud, { tipo: "nivel" }>; cor: string; escolhido?: number; onEscolher?: (nivel: number) => void }) {
  const grade = `28px repeat(${e.colunas.length}, minmax(0, 1fr)) 48px`;
  const celula: React.CSSProperties = { minWidth: 0, overflowWrap: "break-word" };
  return (
    <div style={{ marginTop: 12 }}>
      {onEscolher && <Tag className="hx-dim" style={{ display: "block", fontSize: 10, marginBottom: 6 }}>escolha o nível</Tag>}
      <div role={onEscolher ? "radiogroup" : undefined} aria-label="Nível da conjuração">
        <div style={{ display: "grid", gridTemplateColumns: grade, gap: 8, padding: "6px 8px", borderBottom: "1px solid rgba(0,212,255,.15)" }}>
          <span />{e.colunas.map((c) => <Tag key={c} className="hx-dim" style={{ minWidth: 0, fontSize: 10, letterSpacing: ".06em", lineHeight: 1.3 }}>{c}</Tag>)}<Tag className="hx-dim" style={{ fontSize: 10, textAlign: "right" }}>mana</Tag>
        </div>
        {e.linhas.map((l) => {
          const on = escolhido === l.nivel;
          const conteudo = <>
            <span className="hx-display" style={{ fontWeight: 900, color: on ? cor : "var(--hx-dim)" }}>{l.nivel}</span>
            {l.celulas.map((c, i) => <span key={i} style={celula}>{c}</span>)}
            <span className="hx-display hx-cy" style={{ fontWeight: 900, textAlign: "right" }}>{l.mana}</span>
          </>;
          const estilo: React.CSSProperties = { display: "grid", gridTemplateColumns: grade, gap: 8, alignItems: "center", width: "100%", padding: "7px 8px", fontSize: 13, textAlign: "left", color: "var(--hx-texto)", borderBottom: "1px solid rgba(0,212,255,.08)", background: on ? cor + "1f" : "transparent", boxShadow: on ? `inset 2px 0 0 ${cor}` : undefined, opacity: l.bloqueada ? .3 : 1 };
          return onEscolher
            /* div com role="radio" (não <button>): fica fora da regra global de botões do chassi, que chanfra tudo */
            ? <div key={l.nivel} role="radio" aria-checked={on} aria-disabled={l.bloqueada || undefined} tabIndex={l.bloqueada ? -1 : on ? 0 : -1}
                title={l.bloqueada ? `Exige nível ${l.nivel} na vertente` : undefined} className="hx-linha-nivel" style={estilo}
                onClick={() => !l.bloqueada && onEscolher(l.nivel)}
                onKeyDown={(ev) => {
                  if ((ev.key === " " || ev.key === "Enter") && !l.bloqueada) { ev.preventDefault(); onEscolher(l.nivel); }
                  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                    ev.preventDefault();
                    const livres = e.linhas.filter((x) => !x.bloqueada), i = livres.findIndex((x) => x.nivel === (escolhido ?? l.nivel));
                    const alvo = livres[i + (ev.key === "ArrowDown" ? 1 : -1)];
                    if (alvo) { onEscolher(alvo.nivel); (ev.currentTarget.parentElement?.querySelector(`[data-nivel="${alvo.nivel}"]`) as HTMLElement | null)?.focus(); }
                  }
                }} data-nivel={l.nivel}>{conteudo}</div>
            : <div key={l.nivel} style={estilo}>{conteudo}</div>;
        })}
      </div>
    </div>
  );
}

/** Opções de manifestação/forma: cartões selecionáveis (role="radio" — fora da regra global que chanfra <button>). */
function EscolhasDeConjuracao({ m, cor, valores, onEscolher }: { m: MagiaHud; cor: string; valores?: Record<string, string>; onEscolher?: (id: string, opcao: string) => void }) {
  return <>
    {m.escolhasConjuracao?.map((e) => (
      <div key={e.id} style={{ marginTop: 14 }}>
        <Tag className="hx-dim" style={{ display: "block", fontSize: 10, marginBottom: 6 }}>{e.rotulo}{onEscolher && <span style={{ opacity: .6 }}> · opcional</span>}</Tag>
        {/* grade compacta só com nomes curtos e sem resumo; senão, lista (nomes longos quebravam a grade) */}
        <div role={onEscolher ? "radiogroup" : undefined} aria-label={e.rotulo} style={{ display: "grid", gridTemplateColumns: e.opcoes.length > 2 && e.opcoes.every((o) => !o.resumo && o.nome.length <= 12) ? "repeat(auto-fill, minmax(120px, 1fr))" : "1fr", gap: 4 }}>
          {e.opcoes.map((o) => {
            const on = valores?.[e.id] === o.id;
            return (
              <div key={o.id} role={onEscolher ? "radio" : undefined} aria-checked={onEscolher ? on : undefined} tabIndex={onEscolher ? 0 : undefined}
                className={onEscolher ? "hx-linha-nivel" : undefined}
                onClick={() => onEscolher?.(e.id, o.id)}
                onKeyDown={(ev) => { if (onEscolher && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); onEscolher(e.id, o.id); } }}
                style={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", minWidth: 0, boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${on ? cor : "rgba(0,212,255,.14)"}`, background: on ? cor + "1f" : "transparent", boxShadow: on ? `inset 2px 0 0 ${cor}` : undefined }}>
                <span className="hx-display" style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: on ? cor : "var(--hx-ice)" }}>{o.nome}</span>
                {o.resumo && <span style={{ display: "block", marginTop: 3, fontSize: 13, lineHeight: 1.4, color: "var(--hx-texto)", opacity: .8 }}>{o.resumo}</span>}
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </>;
}

export function Leitura({ m, mana, onRolarDano, onRolarCura, escolhido, onEscolher, escolhas, onEscolherOpcao }: { m: MagiaHud; mana: { atual: number; max: number }; onRolarDano?: () => void; onRolarCura?: () => void; escolhido?: number; onEscolher?: (chave: number) => void; escolhas?: Record<string, string>; onEscolherOpcao?: (id: string, opcao: string) => void }) {
  const custo = m.mana ?? 0, falta = custo > mana.atual, mc = falta ? "#ff5f74" : CY;
  const acao = acaoDaMagia(m);
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
    // `--k`: o negrito do texto (`.rc-negrito`) sai na cor da vertente.
    <div style={{ ["--k" as string]: c }}>
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
          <Tag className="hx-dim" style={{ fontSize: 10, display: "block" }}>{acao.pa == null ? "conjuração" : "ação"}</Tag>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            {/* texto (reação, tempo variável) sai menor que número, para caber no bloco */}
            <span className="hx-display hx-amb" style={{ fontSize: /^\d/.test(acao.valor) ? 24 : 15, fontWeight: 900, lineHeight: 1, textTransform: "uppercase" }}>{acao.valor}</span>
            {acao.unidade && <span className="hx-mono hx-dim" style={{ fontSize: 10 }}>{acao.unidade}</span>}
            {acao.pa != null && <span style={{ marginLeft: "auto" }}><Dia n={acao.pa} on={acao.pa} c={AMB} /></span>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {m.alcance && <Fato l="alcance" v={m.alcance} />}
        {m.area && <Fato l="área" v={m.area} />}
        {m.duracao && <Fato l="duração" v={m.duracao} />}
        {m.preRequisito && <Fato l="pré-requisito" v={<span className="hx-mono hx-amb" style={{ fontSize: 12, letterSpacing: ".06em" }}>{m.preRequisito}</span>} />}
        {m.reacao && <Fato l="reação" v="Sim" />}
        {m.dano && <LinhaRolagem rotulo="dano" valor={m.dano} cor={COR_DANO} onRolar={onRolarDano} />}
        {m.cura && <LinhaRolagem rotulo={m.curaPe ? "cura de PE" : "cura"} valor={m.cura} cor={COR_CURA} onRolar={onRolarCura} />}
      </div>
      {m.descricao && <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "var(--hx-texto)", opacity: .8 }}>{m.descricao}</div>}
      {(m.efeito || m.efeitoDepois || m.escolha?.tipo === "nivel") && (
        /* --rv-vertente-cor: o texto da regra (fórmulas, links do livro) pinta na cor da vertente */
        <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: `2px solid ${c}`, fontSize: 14, lineHeight: 1.6, color: "var(--hx-texto)", ["--rv-vertente-cor" as string]: c }}>
          {m.efeito}
          {m.escolha?.tipo === "nivel" && <TabelaDeNiveis e={m.escolha} cor={c} escolhido={escolhido} onEscolher={onEscolher} />}
          {m.efeitoDepois && <div style={{ marginTop: 12 }}>{m.efeitoDepois}</div>}
        </div>
      )}
      {!!m.escolhasConjuracao?.length && <EscolhasDeConjuracao m={m} cor={c} valores={escolhas} onEscolher={onEscolherOpcao} />}
      {m.resistencia && <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>Resistência: {m.resistencia}. Resolvida pelo alvo após conjurar.</p>}
      {m.manuais?.map((t, i) => <div key={i} style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>{t}</div>)}
    </div>
  );
}

/** Busca no mesmo desenho da do inventário (`.ih-busca`): caixa com borda, ícone e "esc" para limpar. */
function Busca({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  return (
    <label className="hx-busca">
      <Search size={15} strokeWidth={1.6} aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar magia…" aria-label="Buscar magia"
        /* Esc limpa a busca (é o que a dica "esc" promete) sem fechar o Console */
        onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); } }} />
      {q && <button type="button" className="hx-busca-tecla" onClick={() => setQ("")}>esc</button>}
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

/**
 * Menu de clique direito do card de magia — mesmo desenho do menu do
 * inventário (`.hx-menu`): ação principal em destaque, secundárias,
 * destrutiva por último com confirmação.
 */
function MenuDaMagia({ m, x, y, motivo, conjurarDireto, semMana, props, onFechar, onVer, onAviso }: {
  m: MagiaHud; x: number; y: number;
  /** Por que não dá para conjurar agora (null = dá). */
  motivo: string | null;
  /** Sem escolha pendente: conjura daqui. Com escolha: abre o modal. */
  conjurarDireto: boolean;
  semMana: boolean;
  props: PropsMagiasHud; onFechar: () => void; onVer: () => void; onAviso: (t: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setPos({ left: Math.min(x, window.innerWidth - el.offsetWidth - 8), top: Math.min(y, window.innerHeight - el.offsetHeight - 8) });
    el?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const fora = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) onFechar(); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onFechar(); } };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [x, y, onFechar]);
  const fazer = (f: () => void) => () => { f(); onFechar(); };
  const v = VERT(m.vertente), acao = acaoDaMagia(m);
  const custo = `${m.mana ?? "—"} mana · ${acao.valor}${acao.unidade ? ` ${acao.unidade}` : ""}`;
  const leitura = props.somenteLeitura;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="hx-menu" role="menu" aria-label={`Ações de ${m.nome}`} style={{ ["--k" as string]: v.c, left: pos.left, top: pos.top }}
      onContextMenu={(ev) => ev.preventDefault()}>
      <div className="hx-menu-cab">
        <span className="hx-menu-icone" aria-hidden="true"><Glifo v={v} tam={18} /></span>
        <span className="hx-menu-id">
          <span className="hx-menu-nome">{m.nome}</span>
          <span className="hx-menu-meta"><span>{v.nome} · nv {m.nivel}</span><span>{custo}</span></span>
        </span>
      </div>
      {!leitura && (motivo
        ? <button type="button" role="menuitem" className="hx-menu-acao" disabled title={motivo} style={{ opacity: .45, cursor: "not-allowed" }}>Conjurar<span style={{ fontSize: 11, textTransform: "none", letterSpacing: 0 }}>{motivo}</span></button>
        : conjurarDireto
          ? <button type="button" role="menuitem" className="hx-menu-acao" onClick={fazer(() => props.onConjurar(m.slug))}>Conjurar<ArrowRight aria-hidden="true" /></button>
          : <button type="button" role="menuitem" className="hx-menu-acao" onClick={fazer(onVer)}>Conjurar…<ArrowRight aria-hidden="true" /></button>)}
      <div className="hx-menu-secao">
        <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(onVer)}><Eye aria-hidden="true" />Ver magia</button>
        {!leitura && m.dano && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => props.onRolarDano(m.slug))}><Dices aria-hidden="true" />Rolar dano {m.dano}</button>}
        {!leitura && m.cura && props.onRolarCura && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => props.onRolarCura!(m.slug))}><HeartPulse aria-hidden="true" />Rolar cura {m.cura}</button>}
        {!leitura && semMana && !m.bloqueada && props.onSurtoDeEnergia && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(props.onSurtoDeEnergia)}><Zap aria-hidden="true" />Surto de energia (+5 mana)</button>}
        {props.onEnviarAoChat && <button type="button" role="menuitem" className="hx-menu-item" onClick={fazer(() => {
          void props.onEnviarAoChat!(m.slug).then((r) => onAviso(r.ok ? `${m.nome} enviada ao chat` : r.erro ?? "Falha ao enviar."));
        })}><MessageSquare aria-hidden="true" />Enviar ao chat</button>}
      </div>
      {!leitura && props.onEsquecer && (
        <div className="hx-menu-secao">
          <button type="button" role="menuitem" className="hx-menu-item" data-perigo data-confirmando={confirmando || undefined}
            onClick={() => { if (confirmando) { props.onEsquecer!(m.slug); onFechar(); } else setConfirmando(true); }}>
            <Trash2 aria-hidden="true" />{confirmando ? "Clique de novo para esquecer" : "Esquecer magia"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MagiasHud(props: PropsMagiasHud) {
  const { magias, niveis, mana } = props;
  /* Vertente inicial: a primária; sem ela, a de maior nível (empate cai na primeira com magia). */
  const inicial = VERTENTES_HUD.find((x) => x.id === props.primaria)?.id ?? [...VERTENTES_HUD].sort((a, b) => (niveis[b.id] ?? -1) - (niveis[a.id] ?? -1)
    || magias.filter((m) => m.vertente === b.id).length - magias.filter((m) => m.vertente === a.id).length)[0].id;
  const [vid, setVid] = useState<string>(inicial);
  const [aberta, setAberta] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [opcoesEscolhidas, setOpcoesEscolhidas] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<{ slug: string; x: number; y: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 3000); return () => window.clearTimeout(t); }, [aviso]);
  /* escolha opcional: clicar de novo na mesma opção desmarca */
  const alternarOpcao = (id: string, o: string) => setOpcoesEscolhidas((v) => {
    const { [id]: atual, ...resto } = v;
    return atual === o ? resto : { ...resto, [id]: o };
  });
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [vid]);
  useEffect(() => { setEscolhido(null); setOpcoesEscolhidas({}); }, [aberta]);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setAberta(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  const v = VERT(vid), c = v.c, nv = niveis[vid];
  const daVertente = magias.filter((m) => m.vertente === vid);
  /* com busca, procura no grimório inteiro (todas as vertentes); sem busca, só a vertente do anel */
  const lista = (q ? magias : daVertente).filter((m) => sem(m.nome).includes(sem(q))).sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const nivelMax = Math.max(5, ...lista.map((m) => m.nivel));
  const magiaAberta = magias.find((m) => m.slug === aberta) ?? null;
  /* custo escolhido (nível da tabela / valor); começa na opção mais barata liberada */
  const opcoes = magiaAberta?.escolha ? opcoesDeCusto(magiaAberta.escolha, mana.atual) : [];
  const opcao = opcoes.find((o) => o.chave === escolhido) ?? opcoes[0] ?? null;
  const custoEfetivo = opcao ? opcao.mana : magiaAberta?.mana ?? null;
  const magiaComCusto = magiaAberta && opcao ? { ...magiaAberta, mana: custoEfetivo } : magiaAberta;
  const semMana = !!magiaAberta && custoEfetivo != null && custoEfetivo > mana.atual;
  const nomesEscolhidos = (magiaAberta?.escolhasConjuracao ?? []).map((e) => e.opcoes.find((o) => o.id === opcoesEscolhidas[e.id])?.nome).filter(Boolean);
  const conjuravel = (m: MagiaHud) => !m.bloqueada && (m.mana == null || m.mana <= mana.atual) && (!m.escolha || opcao != null);
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
            <Tag className="hx-dim" style={{ marginTop: 8, display: "block", fontSize: 10 }}>{vid === props.primaria ? "vertente primária" : nv ? "vertente aprendida" : "vertente adormecida"}</Tag>
            <div className="hx-ch" style={{ marginTop: 16, padding: 1, background: "rgba(0,212,255,.1)" }}>
              <div className="hx-ch" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: CASCO }}>
                {([
                  ["nível", props.onAjustarNivel
                    ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" className="hx-seta-custo" aria-label={`Diminuir nível de ${v.nome}`} disabled={(nv ?? 0) <= 0} onClick={() => props.onAjustarNivel!(vid, Math.max(0, (nv ?? 0) - 1))} style={{ padding: 2, opacity: (nv ?? 0) <= 0 ? .25 : 1 }}><svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M6 12h12" /></svg></button>
                        <span>{nv ?? 0}<span className="hx-dim" style={{ fontSize: 12 }}>/5</span></span>
                        <button type="button" className="hx-seta-custo" aria-label={`Aumentar nível de ${v.nome}`} disabled={(nv ?? 0) >= 5} onClick={() => props.onAjustarNivel!(vid, Math.min(5, (nv ?? 0) + 1))} style={{ padding: 2, opacity: (nv ?? 0) >= 5 ? .25 : 1 }}><svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg></button>
                      </span>
                    : <>{nv ?? "—"}<span className="hx-dim" style={{ fontSize: 12 }}>/5</span></>, <Pips key="p" n={nv ?? 0} c={c} />],
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
          {/* mesma barra do inventário: busca ocupando a largura + botão com contorno ao lado */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Busca q={q} setQ={setQ} />
            {props.onAbrirCatalogo && (
              <button type="button" className="hx-catalogo" onClick={props.onAbrirCatalogo}>
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13" /></svg>
                <span className="hx-catalogo-rot">Catálogo</span>
              </button>
            )}
          </div>
          <div className="hx-semsb" style={{ marginTop: 8, minHeight: 0, flex: 1, overflowY: "auto", paddingBottom: 20 }}>
            {Array.from({ length: nivelMax }, (_, i) => i + 1).map((n) => {
              const linha = lista.filter((m) => m.nivel === n);
              if (!linha.length) return null;
              return (
                <Secao key={n} titulo={`nível ${n}`} cor={c} lado={<Pips n={Math.min(n, 5)} c={c} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {linha.map((m, i) => (
                      <div key={vid + m.slug} className="hx-rise" style={{ animationDelay: `${i * 45 + (n - 1) * 70}ms` }}>
                        <CartaoListaHud
                          nome={<>{q && <Glifo v={VERT(m.vertente)} tam={13} />}{m.nome}</>}
                          subtitulo={m.tipo || "—"} cor={corTipo(m.tipo)} opacidade={conjuravel(m) ? 1 : .5}
                          onClick={() => setAberta(m.slug)}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ slug: m.slug, x: e.clientX, y: e.clientY }); }}
                          metricas={[
                            { valor: m.mana ?? "—", unidade: "mana", cor: CY },
                            { valor: acaoDaMagia(m).valor, unidade: acaoDaMagia(m).unidade || "ação", cor: AMB, tamanho: /^\d/.test(acaoDaMagia(m).valor) ? 18 : 11 },
                          ]}
                        />
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
                  {q ? <>Nenhuma magia do grimório corresponde a “{q}”.</>
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

      {menu && (() => {
        const mm = magias.find((x) => x.slug === menu.slug);
        if (!mm) return null;
        const motivo = mm.bloqueada ? `exige ${VERT(mm.vertente).nome} ${mm.nivel}`
          : mm.mana != null && !mm.escolha && mm.mana > mana.atual ? `falta ${mm.mana - mana.atual} de mana` : null;
        return <MenuDaMagia m={mm} x={menu.x} y={menu.y} motivo={motivo}
          conjurarDireto={!mm.escolha && !mm.escolhasConjuracao?.length}
          semMana={mm.mana != null && mm.mana > mana.atual}
          props={props} onFechar={() => setMenu(null)} onVer={() => setAberta(mm.slug)} onAviso={setAviso} />;
      })()}
      {aviso && <div role="status" className="hx-display" style={{ position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 30, padding: "8px 14px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", background: CASCO, border: "1px solid rgba(0,212,255,.35)", color: "var(--hx-ice)" }}>{aviso}</div>}
      {magiaAberta && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setAberta(null); }}
          style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(6,18,28,.75)", backdropFilter: "blur(2px)" }}>
          <div className="hx-edge hx-ch hx-pop" role="dialog" aria-label={magiaAberta.nome} style={{ width: 420, maxWidth: "calc(100% - 32px)", boxShadow: "0 30px 80px -20px #000" }}>
            <div className="hx-ch" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "min(660px, calc(100vh - 160px))", background: CASCO }}>
              {/* fechar fica fora da rolagem: sempre no canto, mesmo com a faixa rolada para fora */}
              <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12, zIndex: 3 }}>
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
              {/* faixa, título e leitura rolam juntos; o título gruda no topo e a faixa sai de cena */}
              <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
                <Faixa m={magiaAberta} nivel={niveis[magiaAberta.vertente]} />
                <Titulo m={magiaAberta} primaria={magiaAberta.vertente === props.primaria} />
                <div style={{ padding: 16 }}><Leitura m={magiaComCusto!} mana={mana} escolhido={opcao?.chave} onEscolher={props.somenteLeitura ? undefined : setEscolhido}
                  escolhas={opcoesEscolhidas} onEscolherOpcao={props.somenteLeitura ? undefined : alternarOpcao}
                  onRolarDano={props.somenteLeitura ? undefined : () => props.onRolarDano(magiaAberta.slug)}
                  onRolarCura={props.somenteLeitura || !props.onRolarCura ? undefined : () => props.onRolarCura?.(magiaAberta.slug)} /></div>
              </div>
              {!props.somenteLeitura && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px 16px", borderTop: "1px solid rgba(0,212,255,.08)" }}>
                  {/* nível de vertente abaixo do da magia: diz o porquê do conjurar apagado (vem antes da mana — sem nível, surto não resolve) */}
                  {magiaAberta.bloqueada && (
                    <div style={{ padding: "10px 12px", border: "1px solid #ff5f7455", background: "#ff5f7412" }}>
                      <Tag style={{ display: "block", fontSize: 11, letterSpacing: ".16em", color: "#ff5f74" }}>nível de vertente insuficiente</Tag>
                      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>
                        Magia de nível {magiaAberta.nivel}; seu nível em {VERT(magiaAberta.vertente).nome} é {niveis[magiaAberta.vertente] ?? "—"}.
                      </p>
                    </div>
                  )}
                  {/* sem mana: aviso com o que falta e, se der, o Surto de Energia com o preço à vista */}
                  {semMana && !magiaAberta.bloqueada && custoEfetivo != null && (
                    <div style={{ padding: 12, border: `1px solid ${AMB}55`, background: AMB + "12" }}>
                      <Tag className="hx-amb" style={{ display: "block", fontSize: 11, letterSpacing: ".16em" }}>falta {custoEfetivo - mana.atual} de mana</Tag>
                      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--hx-texto)", opacity: .8 }}>
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
                    {opcao && (
                      <span style={{ display: "flex", alignItems: "center", background: "rgba(0,212,255,.06)" }}>
                        {([-1, 1] as const).map((passo) => {
                          const i = opcoes.findIndex((o) => o.chave === opcao.chave) + passo, alvo = opcoes[i];
                          const seta = <button key={passo} type="button" aria-label={passo < 0 ? "Diminuir" : "Aumentar"} disabled={!alvo} onClick={() => alvo && setEscolhido(alvo.chave)} className="hx-seta-custo" style={{ padding: "0 8px", alignSelf: "stretch", opacity: alvo ? 1 : .25 }}><svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d={passo < 0 ? "M6 12h12" : "M12 6v12M6 12h12"} /></svg></button>;
                          return passo < 0 ? [seta, <Tag key="r" style={{ fontSize: 11, color: "var(--hx-ice)", whiteSpace: "nowrap" }}>{opcao.rotulo}</Tag>] : seta;
                        })}
                      </span>
                    )}
                    <button type="button" disabled={!conjuravel(magiaComCusto!)} className="hx-btn-conjurar"
                      style={{ flex: 1, padding: "12px 0", fontFamily: "var(--hx-display)", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3em" }}
                      onClick={() => { props.onConjurar(magiaAberta.slug, opcao ? opcao.mana : undefined, nomesEscolhidos.length ? opcoesEscolhidas : undefined); setAberta(null); }}>
                      {["conjurar", ...nomesEscolhidos, ...(opcao ? [`${opcao.mana} mana`] : [])].join(" · ")}
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
