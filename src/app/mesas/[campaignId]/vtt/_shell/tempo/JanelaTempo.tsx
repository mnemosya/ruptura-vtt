"use client";

/**
 * TEMPO E CLIMA — a janela em dois níveis, no vocabulário visual da
 * prancheta "Tempo e clima · A · painel de comando" (board `TempoA.dc.html`).
 *
 * - COMPACTO (o que o chip abre): condição, data/hora, próximo evento,
 *   atalhos de tempo e sortear — o uso de toda hora numa sessão.
 * - COMPLETO (botão expandir): uma coluna estreita com abas
 *   Calendário · Clima · Agenda — o resto, quando precisa.
 *
 * As classes vêm de `tempo-board.css` (copiado da prancheta) e os estilos
 * inline são strings de CSS no formato da prancheta, convertidas por
 * `css()`. Esta é só a VISTA: quem guarda e publica o tempo da campanha é
 * `TempoDaCampanha` (e a rota `/dev/tempo`, com os dados da prancheta).
 */

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudRainWind, CloudSnow, CloudSun, CloudSunRain,
  Gem, Maximize2, Minimize2, Snowflake, Sun, Wind, Zap, type LucideIcon,
} from "lucide-react";
import {
  MESES_IMPERIAIS, REGIOES, VENTOS, NOMES_VENTO, condicaoEspecial, diaDaSemanaImperial, estacaoDoMes,
  minutoImperial, mudarMesImperial, nomeCondicao, type Condicao, type Regiao, type TempoCampanha, type Vento,
} from "../../_dominio/tempoCampanha";
import {
  NOMES_TIPO_MARCACAO, NOMES_VISIBILIDADE, TIPOS_MARCACAO, TITULO_MARCACAO_MAX, VISIBILIDADES_MARCACAO,
  diasEntre, distanciaRelativa, type MarcacaoCalendario, type NovaMarcacao, type TipoMarcacao, type VisibilidadeMarcacao,
} from "../../_dominio/marcacoesCalendario";
import { HoraEditavel } from "./HoraEditavel";
import "./tempo-board.css";

/* ── estilos inline no formato da prancheta ──────────────────────── */
const FONTES: [RegExp, string][] = [
  [/'JetBrains Mono',monospace/g, "var(--font-mono),monospace"],
  [/Oxanium,sans-serif/g, "var(--font-oxanium),sans-serif"],
  [/'Exo 2',sans-serif/g, "var(--font-corpo),sans-serif"],
  [/Teko,sans-serif/g, "var(--font-teko),sans-serif"],
];
const CACHE = new Map<string, CSSProperties>();
/** String de estilo da prancheta → objeto de estilo React. */
export function css(texto: string): CSSProperties {
  const visto = CACHE.get(texto);
  if (visto) return visto;
  let s = texto;
  for (const [re, v] of FONTES) s = s.replace(re, v);
  const saida: Record<string, string> = {};
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (!k) continue;
    saida[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = decl.slice(i + 1).trim();
  }
  CACHE.set(texto, saida as CSSProperties);
  return saida as CSSProperties;
}

/* ── constantes da prancheta ─────────────────────────────────────── */
const CY = "#00d4ff", AM = "#f5a200", VERDE = "#22d3aa", APAGADO = "#7f95b3", ROXO = "#c48bff";
const COR_TIPO: Record<TipoMarcacao, string> = { lembrete: CY, prazo: AM, evento: ROXO, memoria: APAGADO };
const dotFundo = (t: TipoMarcacao) => (t === "memoria" ? "transparent" : COR_TIPO[t]);
const dotBorda = (t: TipoMarcacao) => (t === "memoria" ? `1px solid ${APAGADO}` : "0");
const ICONE: Record<Condicao, LucideIcon> = {
  ceu_limpo: Sun, parcialmente_nublado: CloudSun, nublado: Cloud, neblina: CloudFog, chuva_leve: CloudDrizzle,
  chuva: CloudRain, chuva_forte: CloudRainWind, tempestade: CloudLightning, neve_leve: Snowflake, neve: CloudSnow,
  nevasca: Wind, chuva_iridescente: CloudSunRain, nevoeiro_cristalino: Gem, tempestade_arcana: Zap,
};
const MIN_MAX = 10000 * 360 * 1440 - 1;
type Data = { ano: number; mes: number; dia: number };
type Aba = "calendario" | "clima" | "agenda";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "calendario", rotulo: "CALENDÁRIO" }, { id: "clima", rotulo: "CLIMA" }, { id: "agenda", rotulo: "AGENDA" },
];

export interface PropsJanelaTempo {
  /** O estado mostrado — o rascunho do narrador, ou o publicado para os jogadores. */
  tempo: TempoCampanha;
  existeEstado: boolean;
  ehNarrador: boolean;
  temMudancas: boolean;
  salvando: boolean;
  /** Todas as marcações visíveis da campanha (a grade filtra o mês; a agenda usa todas). */
  marcacoes: MarcacaoCalendario[];
  /** Erro vindo de fora (salvar, carregar) — aparece no aviso. */
  erro?: string | null;
  estilo?: CSSProperties;
  aoFechar: () => void;
  aoEscolherDia: (data: Data) => void;
  aoAvancar: (minutos: number) => void;
  /** Sorteia e aplica no rascunho; devolve o nome da condição sorteada. */
  aoSortear: () => string | null;
  aoCiclarCondicao: (passo: number) => void;
  aoMudarData: (campos: Partial<TempoCampanha>) => void;
  aoAlterar: (campos: Partial<TempoCampanha>) => void;
  aoPublicar: () => Promise<boolean>;
  aoTornarDiaAtual: (data: Data) => void;
  aoCriarMarcacao: (nova: NovaMarcacao) => Promise<string | null>;
}

const iconeDado = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect width="12" height="12" x="2" y="10" rx="2"></rect><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"></path><path d="M6 18h.01M10 14h.01M15 6h.01M18 9h.01"></path></svg>;
const setaEsq = (n = 15) => <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>;
const setaDir = (n = 15) => <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>;

export function JanelaTempo(p: PropsJanelaTempo) {
  const { tempo: t, ehNarrador } = p;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [completo, setCompleto] = useState(false);
  const [aba, setAba] = useState<Aba>("calendario");
  const [mesNav, setMesNav] = useState<{ ano: number; mes: number } | null>(null);
  const [menu, setMenu] = useState<{ dia: number; x: number; y: number } | null>(null);
  const [compondo, setCompondo] = useState<{ dia: number } | null>(null);
  const [novaTitulo, setNovaTitulo] = useState("");
  const [novaTipo, setNovaTipo] = useState<TipoMarcacao>("lembrete");
  const [novaVis, setNovaVis] = useState<VisibilidadeMarcacao>("mesa");
  const [toast, setToast] = useState<{ txt: string; n: number } | null>(null);
  const tituloRef = useRef<HTMLInputElement | null>(null);

  const avisar = (txt: string) => setToast((a) => ({ txt, n: (a?.n ?? 0) + 1 }));
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast((a) => (a?.n === toast.n ? null : a)), 1900);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => { if (p.erro) avisar(p.erro); }, [p.erro]);
  useEffect(() => { if (compondo) tituloRef.current?.focus(); }, [compondo]);
  useEffect(() => {
    if (!menu && !compondo) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setCompondo(null); } };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [menu, compondo]);

  const { ano, mes } = mesNav ?? { ano: t.ano ?? 186, mes: t.mes ?? 1 };
  const esp = condicaoEspecial(t.condicao);
  const foraDoMes = mesNav !== null && (mesNav.ano !== t.ano || mesNav.mes !== t.mes);
  const temData = minutoImperial(t) !== null;
  const hoje: Data = { ano: t.ano ?? 186, mes: t.mes ?? 1, dia: t.dia ?? 1 };
  const marcasMes = p.marcacoes.filter((m) => m.ano === ano && m.mes === mes);
  const navMes = (d: number) => { const n = mudarMesImperial(ano, mes, d); if (n) { setMesNav(n); setMenu(null); } };
  const abrir = (a: Aba) => { setCompleto(true); setAba(a); };

  const abrirMenu = (e: ReactMouseEvent, dia: number) => {
    e.preventDefault();
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(e.clientX - r.left, r.width - 196), y = Math.min(e.clientY - r.top, r.height - 110);
    setMenu({ dia, x: Math.max(4, x), y: Math.max(4, y) });
  };
  const salvarNova = async () => {
    const titulo = novaTitulo.trim();
    if (!titulo || !compondo) return;
    const erro = await p.aoCriarMarcacao({ ano, mes, dia: compondo.dia, tipo: novaTipo, titulo, visibilidade: novaVis });
    if (erro) { avisar(erro); return; }
    setCompondo(null); setNovaTitulo(""); avisar("Marcação salva");
  };
  const avancar = (min: number, txt: string) => { p.aoAvancar(min); setMesNav(null); avisar(txt); };
  const sortear = () => { const nome = p.aoSortear(); if (nome) avisar(`Clima sorteado · ${nome}`); };

  const duracao = t.climaAteMinuto === null || !temData ? "" : Math.max(0, Math.round((t.climaAteMinuto - minutoImperial(t)!) / 60));
  const mud = p.temMudancas;
  const avisoClima = !p.existeEstado ? ""
    : t.condicao === "tempestade_arcana" ? "Saturação atmosférica · criaturas expostas ficam Saturado"
    : t.aurora ? "Aurora visível no céu"
    : esp ? "Condição anômala · fenômeno arcano no clima" : "";
  const eventos = p.marcacoes
    .map((m) => ({ m, dias: diasEntre(hoje, { ano: m.ano, mes: m.mes, dia: m.dia }) }))
    .sort((a, b) => { const fa = a.dias < 0 ? 1 : 0, fb = b.dias < 0 ? 1 : 0; return fa !== fb ? fa - fb : Math.abs(a.dias) - Math.abs(b.dias); });
  const proximo = eventos.find((e) => e.dias >= 0) ?? null;
  const IconeCond = ICONE[t.condicao];
  const heroBg = esp ? "linear-gradient(135deg,rgba(0,212,255,.06),rgba(196,139,255,.1)),#06121c" : "#06121c";
  const tag = esp ? "◇ ANÔMALA" : estacaoDoMes(t.mes ?? 1).toUpperCase();
  const tagCor = esp ? ROXO : APAGADO;
  const condCor = esp ? ROXO : CY;
  const condBorda = esp ? "rgba(196,139,255,.3)" : "rgba(0,212,255,.25)";
  const condBg2 = esp ? "rgba(196,139,255,.08)" : "rgba(0,212,255,.06)";
  const condNome = p.existeEstado ? nomeCondicao(t.condicao).toUpperCase() : "CLIMA NÃO DEFINIDO";
  const regVento = p.existeEstado ? `${t.regiao} · vento ${t.vento}` : "Aguardando o narrador";
  const temp = p.existeEstado && t.temperaturaC !== null ? t.temperaturaC : "—";
  const pubDot = mud ? AM : VERDE;
  const pubTxt = !p.existeEstado ? "Defina a data inicial da campanha" : mud ? "Alterações ainda não publicadas" : "Todos veem o estado da campanha";
  const dataTxt = temData ? `D${diaDaSemanaImperial(t.mes!, t.dia!)} · ${t.dia} ${MESES_IMPERIAIS[t.mes! - 1].toUpperCase()} · ${t.ano} CI` : "DATA NÃO DEFINIDA";

  /* ── peças ─────────────────────────────────────────────────────── */
  const hero = (grande: boolean) => (
    <div className="painelc" style={css(`flex:none;background:${heroBg}`)}>
      <div className="idhead" style={css("border-bottom-color:rgba(0,212,255,.14)")}><span className="idlab" style={css("color:var(--apagado)")}>CONDIÇÕES ATUAIS</span><span className="idlab" style={{ color: tagCor }}>{tag}</span></div>
      <div style={css(grande ? "padding:16px;display:flex;align-items:center;gap:16px" : "padding:12px;display:flex;align-items:center;gap:12px")}>
        <span style={css(`flex:none;width:${grande ? 58 : 46}px;height:${grande ? 58 : 46}px;display:grid;place-items:center;color:${condCor};border:1px solid ${condBorda};background:${condBg2}`)}><IconeCond size={grande ? 30 : 24} strokeWidth={1.8} aria-hidden="true" /></span>
        <div style={css("flex:1;min-width:0;display:flex;flex-direction:column;gap:4px")}>
          <span style={css(`font-family:Oxanium,sans-serif;font-weight:800;font-size:${grande ? 17 : 15}px;letter-spacing:.03em;color:var(--gelo);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{condNome}</span>
          <span style={css("font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em;color:var(--apagado)")}>{regVento}</span>
        </div>
        <div style={css("flex:none;text-align:right;line-height:.8")}>
          <span style={css(`font-family:Teko,sans-serif;font-weight:600;font-size:${grande ? 50 : 42}px;color:var(--gelo)`)}>{temp}</span><span style={css("font-family:Teko,sans-serif;font-weight:500;font-size:22px;color:var(--apagado)")}>°C</span>
        </div>
      </div>
    </div>
  );
  const aviso = avisoClima && <p style={css("flex:none;margin:0;padding:9px 11px;background:rgba(196,139,255,.08);border:1px solid rgba(196,139,255,.3);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.04em;color:var(--roxo)")}>{avisoClima}</p>;
  const atalhos = ehNarrador && (
    <div style={css("flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:7px")}>
      <button type="button" className="rv-btn tb-acao" disabled={p.salvando} onClick={() => avancar(10, "+10 minutos")} style={css("cursor:pointer")}>+10 MIN</button>
      <button type="button" className="rv-btn tb-acao" disabled={p.salvando} onClick={() => avancar(60, "+1 hora")} style={css("cursor:pointer")}>+1 HORA</button>
      <button type="button" className="rv-btn tb-acao" disabled={p.salvando} onClick={() => avancar(1440, "+1 dia")} style={css("cursor:pointer")}>+1 DIA</button>
    </div>
  );
  const linhaEvento = ({ m, dias: dd }: { m: MarcacaoCalendario; dias: number }, aoClicar: () => void) => (
    <button type="button" key={m.id} className="u ev" style={css("cursor:pointer;flex:none")}
      aria-label={`${m.titulo}, ${m.dia} de ${MESES_IMPERIAIS[m.mes - 1]}, ${distanciaRelativa(dd)}`} onClick={aoClicar}>
      <span className="ev-bar" style={{ background: COR_TIPO[m.tipo] }}></span>
      <span className="ev-dot" style={{ background: dotFundo(m.tipo), border: dotBorda(m.tipo) }}></span>
      <span style={css("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left")}>
        <span style={css("font-family:'Exo 2',sans-serif;font-weight:600;font-size:13px;color:var(--gelo);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{m.titulo}</span>
        <span style={css("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.04em;color:var(--apagado);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{m.dia}/{m.mes} · D{diaDaSemanaImperial(m.mes, m.dia)} · {NOMES_TIPO_MARCACAO[m.tipo]}</span>
      </span>
      <span style={{ ...css("flex:none;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:10px;letter-spacing:.04em"), color: dd === 0 ? AM : dd > 0 ? CY : APAGADO }}>{distanciaRelativa(dd)}</span>
    </button>
  );
  const irParaMes = (m: MarcacaoCalendario) => { setMesNav(m.ano === t.ano && m.mes === t.mes ? null : { ano: m.ano, mes: m.mes }); setMenu(null); };
  const publicar = (
    <button type="button" className="rv-btn rv-btn--pri" disabled={p.salvando || (p.existeEstado && !mud)}
      onClick={async () => { if (await p.aoPublicar()) avisar("Alterações publicadas"); }}>Publicar</button>
  );
  const barraPublicar = (
    <div style={css("flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#06121c;border-top:1px solid rgba(0,212,255,.16)")}>
      <span style={css("display:flex;align-items:center;gap:9px;min-width:0")}><span style={css(`flex:none;width:7px;height:7px;border-radius:50%;background:${pubDot};box-shadow:0 0 8px ${pubDot}`)}></span><span style={{ ...css("font-family:'Exo 2',sans-serif;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"), color: mud ? AM : APAGADO }}>{pubTxt}</span></span>
      {publicar}
    </div>
  );
  const winbtn = (rotulo: string, aoClicar: () => void, icone: ReactNode, fecha = false) => (
    <button type="button" className={`u winbtn ${fecha ? "fecha" : ""}`} aria-label={rotulo} title={rotulo} onClick={aoClicar} style={css("cursor:pointer;width:28px;height:28px")}>{icone}</button>
  );

  /* ── calendário (aba) ──────────────────────────────────────────── */
  const calendario = (
    <div style={css("flex:1;min-height:0;padding:12px;display:flex;flex-direction:column;gap:10px")}>
      <div style={css("flex:none;display:flex;align-items:flex-end;justify-content:space-between")}>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          <span style={css("display:flex;align-items:baseline;gap:8px")}><span style={css("font-family:Teko,sans-serif;font-weight:600;font-size:30px;line-height:.8;color:var(--gelo);letter-spacing:.02em")}>{MESES_IMPERIAIS[mes - 1].toUpperCase()}</span><span style={css("font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--cy)")}>({String(mes).padStart(2, "0")})</span></span>
          <span className="idlab" style={css("color:var(--apagado)")}>{ano} CI · {estacaoDoMes(mes).toUpperCase()}</span>
        </div>
        <div style={css("display:flex;align-items:center;gap:6px")}>
          {foraDoMes && <button type="button" className="u hojeb" onClick={() => setMesNav(null)} style={css("cursor:pointer")}>HOJE</button>}
          <button type="button" className="u navb" aria-label="Mês anterior" onClick={() => navMes(-1)} style={css("cursor:pointer")}>{setaEsq()}</button>
          <button type="button" className="u navb" aria-label="Próximo mês" onClick={() => navMes(1)} style={css("cursor:pointer")}>{setaDir()}</button>
        </div>
      </div>
      <div style={css("flex:none;display:grid;grid-template-columns:repeat(6,1fr);gap:6px")}>
        {[1, 2, 3, 4, 5, 6].map((d) => <span key={d} className="diasem">D{d}</span>)}
      </div>
      <div style={css("flex:1;min-height:0;display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(5,1fr);gap:6px")}>
        {Array.from({ length: 30 }, (_, i) => i + 1).map((dia) => {
          const ms = marcasMes.filter((m) => m.dia === dia);
          const sel = t.ano === ano && t.mes === mes && t.dia === dia;
          return (
            <button type="button" key={dia} className={`u dia ${sel ? "sel" : ""}`} style={css("cursor:pointer;min-height:0")}
              aria-label={`Dia ${dia} de ${MESES_IMPERIAIS[mes - 1]}${ms.length ? `, ${ms.length} ${ms.length === 1 ? "marcação" : "marcações"}` : ""}`}
              onClick={() => { if (ehNarrador) { p.aoEscolherDia({ ano, mes, dia }); setMenu(null); } }}
              onContextMenu={(e) => abrirMenu(e, dia)}>
              {dia}
              {ms.length > 0 && <>
                <span className="marcas">{ms.slice(0, 3).map((m) => <span key={m.id} className="marca" style={{ background: dotFundo(m.tipo), border: dotBorda(m.tipo) }}></span>)}</span>
                <span className={`tt ${dia <= 12 ? "baixo" : ""} ${dia % 6 === 1 ? "esq" : dia % 6 === 0 ? "dir" : ""}`}>
                  <span className="tt-cab"><span>{dia} {MESES_IMPERIAIS[mes - 1]} · D{diaDaSemanaImperial(mes, dia)}</span><span>{distanciaRelativa(diasEntre(hoje, { ano, mes, dia }))}</span></span>
                  {ms.map((m) => <span key={m.id} className="tt-item"><span className="marca" style={{ marginTop: 4, flex: "none", background: dotFundo(m.tipo), border: dotBorda(m.tipo) }}></span><span><b>{m.titulo}</b><small>{m.autorNome} · {NOMES_VISIBILIDADE[m.visibilidade]}</small></span></span>)}
                </span>
              </>}
            </button>
          );
        })}
      </div>
      <div style={css("flex:none;display:flex;align-items:center;justify-content:space-between;padding-top:3px;border-top:1px solid rgba(0,212,255,.1)")}>
        <span className="idlab" style={css("color:var(--cy)")}>{temData ? `D${diaDaSemanaImperial(t.mes!, t.dia!)} · DIA ${t.dia}` : "DATA NÃO DEFINIDA"}</span>
        <HoraEditavel hora={t.hora} editavel={ehNarrador} aoMudar={(hora) => p.aoMudarData({ hora })} estilo={css("font-family:Teko,sans-serif;font-weight:600;font-size:26px;line-height:.8;color:var(--gelo)")} />
      </div>
      {atalhos}
    </div>
  );

  /* ── clima (aba) ───────────────────────────────────────────────── */
  const clima = (
    <div className="colD-rol" style={css("flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px")}>
      {hero(true)}
      {aviso}
      {!ehNarrador && p.existeEstado && t.descricao && <p style={css("margin:0;font-family:'Exo 2',sans-serif;font-size:13px;line-height:1.5;color:var(--texto)")}>{t.descricao}</p>}
      {ehNarrador && <>
        <button type="button" className="rv-btn rv-btn--pri tb-acao" disabled={p.salvando} onClick={sortear}>{iconeDado}Sortear clima</button>
        <div className="editwrap" style={css("flex:none;display:flex;flex-direction:column;gap:13px")}>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <span className="idlab" style={css("color:var(--cy)")}>CONDIÇÃO</span>
            <div style={css("display:flex;align-items:center;gap:8px")}>
              <button type="button" className="u navb" aria-label="Condição anterior" onClick={() => p.aoCiclarCondicao(-1)} style={css("cursor:pointer")}>{setaEsq(14)}</button>
              <span style={css("flex:1;text-align:center;font-family:Oxanium,sans-serif;font-weight:700;font-size:13px;letter-spacing:.04em;color:var(--gelo)")}>{nomeCondicao(t.condicao).toUpperCase()}</span>
              <button type="button" className="u navb" aria-label="Próxima condição" onClick={() => p.aoCiclarCondicao(1)} style={css("cursor:pointer")}>{setaDir(14)}</button>
            </div>
          </div>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <span className="idlab" style={css("color:var(--apagado)")}>REGIÃO</span>
            <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
              {REGIOES.map((r) => <button type="button" key={r} className={`u chip ${t.regiao === r ? "on" : ""}`} onClick={() => p.aoMudarData({ regiao: r as Regiao })} style={css("cursor:pointer")}>{r}</button>)}
            </div>
          </div>
          <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
            <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>ANO CI</span><input className="u cmp" type="number" min={0} max={9999} value={t.ano ?? ""} onChange={(e) => p.aoMudarData({ ano: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>HORÁRIO</span><span className="u cmp"><HoraEditavel hora={t.hora ?? "12:00"} editavel setas={false} aoMudar={(hora) => p.aoMudarData({ hora })} /></span></label>
          </div>
          <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
            <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>TEMPERATURA °C</span><input className="u cmp" type="number" min={-100} max={100} step="0.1" value={t.temperaturaC ?? ""} onChange={(e) => p.aoAlterar({ temperaturaC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>TEMP. ALVO °C</span><input className="u cmp" type="number" min={-100} max={100} step="0.1" value={t.temperaturaAlvoC ?? ""} onChange={(e) => p.aoAlterar({ temperaturaAlvoC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          </div>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <span className="idlab" style={css("color:var(--apagado)")}>VENTO</span>
            <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
              {VENTOS.map((w) => <button type="button" key={w} className={`u chip ${t.vento === w ? "on" : ""}`} onClick={() => p.aoAlterar({ vento: w as Vento })} style={css("cursor:pointer")}>{NOMES_VENTO[w]}</button>)}
            </div>
          </div>
          <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end")}>
            <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>DURAÇÃO REST. (H)</span><input className="u cmp" type="number" min={1} max={720} value={duracao} onChange={(e) => { const agora = minutoImperial(t); if (agora !== null && e.target.value !== "") p.aoAlterar({ climaAteMinuto: Math.min(agora + Number(e.target.value) * 60, MIN_MAX) }); }} /></label>
            <button type="button" className={`u chip ${t.aurora ? "on" : ""}`} onClick={() => p.aoAlterar({ aurora: !t.aurora })} style={css("cursor:pointer;padding:9px 10px;text-align:center")}>AURORA VISÍVEL</button>
          </div>
          <label style={css("display:flex;flex-direction:column;gap:5px")}><span className="idlab" style={css("color:var(--apagado)")}>OBSERVAÇÃO</span><textarea className="u cmp" maxLength={300} rows={2} value={t.descricao} onChange={(e) => p.aoAlterar({ descricao: e.target.value.slice(0, 300) })} style={css("resize:none;font-family:'Exo 2',sans-serif;font-size:13px")}></textarea></label>
        </div>
      </>}
    </div>
  );

  /* ── agenda (aba) ──────────────────────────────────────────────── */
  const agenda = (
    <div className="colD-rol" style={css("flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:7px")}>
      {eventos.map((e) => linhaEvento(e, () => { irParaMes(e.m); setAba("calendario"); }))}
      {eventos.length === 0 && <span style={css("padding:16px 2px;text-align:center;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;color:var(--apagado)")}>Nenhum evento marcado · botão direito num dia para criar</span>}
    </div>
  );

  return (
    <div className="tb raiz" ref={rootRef} data-testid="tempo-board" data-modo={completo ? "completo" : "compacto"} role="dialog" aria-label="Tempo e clima da campanha"
      style={{ ...css(`position:relative;width:${completo ? 420 : 380}px;${completo ? "height:600px;" : ""}display:flex;flex-direction:column;background:#050d14;color:var(--texto);font-family:'Exo 2',sans-serif;overflow:hidden;border:1px solid rgba(0,212,255,.22)`), ...p.estilo }}>
      <div aria-hidden="true" style={css("position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(0,212,255,.06) 1px,transparent 1.5px);background-size:22px 22px")}></div>

      {/* cabeçalho */}
      <div style={css("position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;height:46px;padding:0 10px 0 14px;background:#06121c;border-bottom:1px solid rgba(0,212,255,.22)")}>
        <div style={css("display:flex;align-items:center;gap:11px")}>
          <span style={css("width:9px;height:9px;background:var(--cy);rotate:45deg;box-shadow:0 0 10px var(--cy)")}></span>
          <span style={css("font-family:Oxanium,sans-serif;font-weight:800;font-size:13px;letter-spacing:.24em;color:var(--gelo)")}>TEMPO E CLIMA</span>
        </div>
        <div style={css("display:flex;align-items:center;gap:6px")}>
          {completo
            ? winbtn("Recolher", () => setCompleto(false), <Minimize2 size={13} strokeWidth={2.2} aria-hidden="true" />)
            : winbtn("Expandir", () => abrir("calendario"), <Maximize2 size={13} strokeWidth={2.2} aria-hidden="true" />)}
          {winbtn("Fechar", p.aoFechar, <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>, true)}
        </div>
      </div>

      {/* COMPACTO */}
      {!completo && <div style={css("position:relative;padding:12px;display:flex;flex-direction:column;gap:10px")}>
        {hero(false)}
        {aviso}
        <div style={css("display:flex;align-items:center;justify-content:space-between;padding:2px 2px 0")}>
          <span className="idlab" style={css("color:var(--cy)")}>{dataTxt}</span>
          <HoraEditavel hora={t.hora} editavel={ehNarrador} aoMudar={(hora) => p.aoMudarData({ hora })} estilo={css("font-family:Teko,sans-serif;font-weight:600;font-size:28px;line-height:.8;color:var(--gelo)")} />
        </div>
        {proximo && <div style={css("display:flex;flex-direction:column;gap:6px")}>
          <span className="idlab" style={css("color:var(--apagado)")}>PRÓXIMO EVENTO</span>
          {linhaEvento(proximo, () => { irParaMes(proximo.m); abrir("agenda"); })}
        </div>}
        {atalhos}
        <div style={css(ehNarrador ? "display:grid;grid-template-columns:1fr 1fr;gap:10px" : "display:grid;grid-template-columns:1fr;gap:10px")}>
          {ehNarrador && <button type="button" className="rv-btn rv-btn--pri tb-acao" disabled={p.salvando} onClick={sortear}>{iconeDado}Sortear clima</button>}
          <button type="button" className="rv-btn tb-acao" onClick={() => abrir("calendario")}>Calendário</button>
        </div>
      </div>}
      {!completo && ehNarrador && <div style={css("position:relative")}>{barraPublicar}</div>}

      {/* COMPLETO · abas */}
      {completo && <>
        <div role="tablist" aria-label="Seções" style={css("position:relative;flex:none;display:flex;background:#06121c;border-bottom:1px solid rgba(0,212,255,.16)")}>
          {ABAS.map((a) => (
            <button type="button" key={a.id} role="tab" aria-selected={aba === a.id} className={`u aba ${aba === a.id ? "on" : ""}`} onClick={() => { setAba(a.id); setMenu(null); }} style={css("cursor:pointer")}>
              {a.rotulo}{a.id === "agenda" && eventos.length > 0 && <span style={css("color:var(--cy);margin-left:6px")}>{eventos.length}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel" style={css("position:relative;flex:1;min-height:0;display:flex;flex-direction:column")}>
          {aba === "calendario" && calendario}
          {aba === "clima" && clima}
          {aba === "agenda" && agenda}
        </div>
        {ehNarrador && <div style={css("position:relative")}>{barraPublicar}</div>}
      </>}

      {/* backdrop p/ menu e dialog */}
      {(menu || compondo) && <div className="backdrop" onClick={() => { setMenu(null); setCompondo(null); }} style={{ background: compondo ? "rgba(5,13,20,.55)" : "transparent" }}></div>}

      {/* menu de contexto do dia */}
      {menu && <div className="menu" role="menu" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
        <div style={css("padding:8px 12px;border-bottom:1px solid rgba(0,212,255,.14)")}><span className="idlab" style={css("color:var(--apagado)")}>DIA {menu.dia} · {MESES_IMPERIAIS[mes - 1]} {ano}</span></div>
        <button type="button" role="menuitem" className="u menu-item" onClick={() => { setCompondo({ dia: menu.dia }); setMenu(null); setNovaTitulo(""); setNovaTipo("lembrete"); setNovaVis("mesa"); }} style={css("cursor:pointer")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>Nova marcação</button>
        {ehNarrador && <>
          <div style={css("height:1px;background:rgba(0,212,255,.12)")}></div>
          <button type="button" role="menuitem" className="u menu-item" onClick={() => { p.aoTornarDiaAtual({ ano, mes, dia: menu.dia }); setMenu(null); setMesNav(null); avisar("Dia definido como atual"); }} style={css("cursor:pointer")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>Tornar dia atual</button>
        </>}
      </div>}

      {/* nova marcação */}
      {compondo && <div role="dialog" aria-label={`Nova marcação em ${compondo.dia} de ${MESES_IMPERIAIS[mes - 1]}`} style={css("position:absolute;z-index:50;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;max-width:calc(100% - 20px);background:#06121c;border:1px solid rgba(0,212,255,.3);box-shadow:0 20px 60px rgba(0,0,0,.7)")}>
        <div style={css("display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(0,212,255,.16)")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}><span style={css("display:flex;align-items:center;gap:8px")}><span style={css("width:8px;height:8px;background:var(--cy);rotate:45deg")}></span><span style={css("font-family:Oxanium,sans-serif;font-weight:800;font-size:13px;letter-spacing:.16em;color:var(--gelo)")}>NOVA MARCAÇÃO</span></span><span className="idlab" style={css("color:var(--apagado);padding-left:16px")}>{compondo.dia} {MESES_IMPERIAIS[mes - 1]} · {distanciaRelativa(diasEntre(hoje, { ano, mes, dia: compondo.dia }))}</span></div>
          <button type="button" className="u winbtn fecha" aria-label="Fechar" onClick={() => setCompondo(null)} style={css("cursor:pointer;width:26px;height:26px")}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void salvarNova(); }} style={css("padding:16px;display:flex;flex-direction:column;gap:14px")}>
          <label style={css("display:flex;flex-direction:column;gap:6px")}><span className="idlab" style={css("color:var(--apagado)")}>TÍTULO</span><input ref={tituloRef} className="u novain" type="text" maxLength={TITULO_MARCACAO_MAX} placeholder="O que acontece neste dia?" value={novaTitulo} onChange={(e) => setNovaTitulo(e.target.value)} /></label>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <span className="idlab" style={css("color:var(--apagado)")}>TIPO</span>
            <div style={css("display:grid;grid-template-columns:1fr 1fr;gap:7px")}>
              {TIPOS_MARCACAO.map((tp) => <button type="button" key={tp} className={`u nbtn ${novaTipo === tp ? "on" : ""}`} aria-pressed={novaTipo === tp} onClick={() => setNovaTipo(tp)} style={css("cursor:pointer")}><span className="marca" style={{ background: dotFundo(tp), border: dotBorda(tp) }}></span>{NOMES_TIPO_MARCACAO[tp]}</button>)}
            </div>
          </div>
          <div style={css("display:flex;flex-direction:column;gap:6px")}>
            <span className="idlab" style={css("color:var(--apagado)")}>QUEM VÊ</span>
            <div style={css("display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px")}>
              {VISIBILIDADES_MARCACAO.map((v) => <button type="button" key={v} className={`u nbtn ${novaVis === v ? "on" : ""}`} aria-pressed={novaVis === v} onClick={() => setNovaVis(v)} style={css("cursor:pointer")}>{NOMES_VISIBILIDADE[v]}</button>)}
            </div>
          </div>
          <div style={css("display:flex;align-items:center;justify-content:space-between;padding-top:2px")}>
            <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--apagado)")}>Enter salva · Esc fecha</span>
            <button type="submit" className="rv-btn rv-btn--pri" disabled={!novaTitulo.trim()}>Salvar marcação</button>
          </div>
        </form>
      </div>}

      {toast && <div className="aviso" role="status" style={css("white-space:nowrap")}>{toast.txt}</div>}
    </div>
  );
}
