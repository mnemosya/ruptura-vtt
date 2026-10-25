"use client";

import { useState, type ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import type { ConsoleApi } from "../../types";
import { classResource, readClassPlay, reached, type ClassCommand, type MarcaPontoFraco } from "../../../../../lib/character/classManagement";
import { CabecalhoModulo } from "../CabecalhoModulo";
import { oxanium } from "../../../../_design/oxanium";
import combatente from "../../../../../../content/v12/db_classe_combatente_v1_2.json";
import { ListaHabilidades, Painel, type Caracteristica } from "./painelClasse";
import { MANOBRAS, MODULACOES, REGIOES, REGRAS, manobraPorId, manobrasConhecidas, rolarDado, type Manobra } from "./combatenteDados";
import "./ancoraRede.css";
import "./combatenteAnel.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

type Api = Pick<ConsoleApi, "character" | "somenteLeitura"> & Partial<Pick<ConsoleApi, "classe" | "derivados" | "glossario">>;
type Livro = { nome: string; caracteristicas: Record<string, Caracteristica[]> };
type Alvo = NonNullable<ConsoleApi["classe"]>["alvos"][number];

const classe = combatente.classes[0] as unknown as Livro;
const subclasses = combatente.subclasses as unknown as (Livro & { slug: string })[];

/* Geometria do anel: 360×360, centro 180, raio 140. Dados nas diagonais, ferramentas nos vãos. */
const C = 180, R = 140;
const ponto = (graus: number, r = R) => { const t = graus * Math.PI / 180; return { x: C + r * Math.cos(t), y: C + r * Math.sin(t) }; };
const DIAGONAIS = [-135, -45, 45, 135];
const f1 = (n: number) => n.toFixed(1);

const Svg = ({ d, tam = 24, traco = 1.8 }: { d: string; tam?: number; traco?: number }) =>
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const Dica = ({ texto, pos }: { texto: string; pos: "dir" | "esq" | "cima" | "baixo" | "baixo-esq" | "baixo-dir" }) => <span className="ca-dica" data-pos={pos} role="tooltip">{texto}</span>;

function Losango({ nome, status, icone, estado, onClick, dica, posDica = "cima", desligado }: { nome: string; status: string; icone: string; estado: "pronto" | "ativo" | "usado" | "travado"; onClick?: () => void; dica?: string; posDica?: "cima" | "baixo"; desligado?: boolean }) {
  return <button type="button" className={`ca-losango${dica ? " ca-tem-dica" : ""}`} data-estado={estado} onClick={onClick} disabled={desligado || !onClick} aria-pressed={estado === "ativo" ? true : undefined}>
    <span className="ca-losango-forma"><span><Svg d={icone} tam={16} traco={2} /></span></span>
    <span className="ca-losango-texto"><strong>{nome}</strong><small>{status}</small></span>
    {dica && <Dica texto={dica} pos={posDica} />}
  </button>;
}

/** Silhueta do alvo, com a região marcada acesa. */
function Silhueta({ marca, largura = 104, altura = 200 }: { marca?: MarcaPontoFraco; largura?: number; altura?: number }) {
  const cor = (id: string) => marca?.regiao === id ? { fill: marca.comp ? "var(--ca)" : "var(--ca-medio)", stroke: "var(--ca-claro)" } : { fill: "#102331", stroke: "#2b4456" };
  return <svg width={largura} height={altura} viewBox="8 0 104 200" aria-hidden="true">
    <circle cx="60" cy="19" r="15" strokeWidth="2" {...cor("cabeca")} />
    <path d="M38 42h44l6 62H32Z" strokeWidth="2" {...cor("tronco")} />
    <path d="M34 44 22 48l-8 58h10l8-42Z" strokeWidth="2" {...cor("bracos")} />
    <path d="m86 44 12 4 8 58H96l-8-42Z" strokeWidth="2" {...cor("bracos")} />
    <path d="M33 108h25l-3 88H39Z" strokeWidth="2" {...cor("pernas")} />
    <path d="M62 108h25l-6 88H65Z" strokeWidth="2" {...cor("pernas")} />
  </svg>;
}

/** Efeito da manobra escrito com o dado (D8, 2×D8, D8÷2) em vez de um resultado. */
function efeitoComDado(m: Manobra, faces: number) {
  const x = 7919, d = `D${faces}`;
  return m.efeito(x).replace(String(x * 2), `2×${d}`).replace(String(Math.floor(x / 2)), `${d}÷2`).replaceAll(String(x), d);
}

function Avatar({ alvo, marca, tam = 56 }: { alvo: Alvo; marca?: MarcaPontoFraco; tam?: number }) {
  return <span className="ca-avatar-disco" data-marcado={!!marca || undefined} data-comp={marca?.comp || undefined} style={{ width: tam, height: tam }}>
    {alvo.avatarUrl ? <img src={alvo.avatarUrl} alt="" draggable={false} /> : <span>{alvo.nome.slice(0, 2).toUpperCase()}</span>}
  </span>;
}

export function CombatenteAnel({ api, rank, subclassId }: { api: Api; rank: string; subclassId?: string }) {
  const [painel, setPainel] = useState<null | "habilidades" | "gastos" | "manobras" | "ponto">(null);
  const [modo, setModo] = useState<null | "composta" | "modulacao" | "dano">(null);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [recentes, setRecentes] = useState<number[]>([]);
  const [dadoEmFoco, setDadoEmFoco] = useState<number | null>(null);
  const [ladoRep, setLadoRep] = useState<"ataque" | "defesa">("ataque");
  const [regraAberta, setRegraAberta] = useState<string | null>(null);
  const [alvoSel, setAlvoSel] = useState<string | null>(null);
  const [mods, setMods] = useState<string[]>(["concentrar"]);
  const [resultadoMod, setResultadoMod] = useState<{ valor: number; nomes: string; texto: string } | null>(null);

  const st = readClassPlay(api.character);
  const res = classResource(api.character);
  const faces = res.die ?? 4;
  const send = api.classe?.executar;
  const locked = !!api.somenteLeitura || !send;
  const at = (r: string) => reached(rank, r);
  const sub = subclasses.find(item => item.slug === subclassId);
  const temSub = !!sub && at("E");
  const gasto = st.spentDice ?? [];
  const valores = st.valoresDados ?? [null, null, null, null];
  const prontos = 4 - gasto.length;
  const livres = [0, 1, 2, 3].filter(i => !gasto.includes(i));
  const usado = (chave: string) => !!st.uses[chave];
  const topoPilha = st.pilha?.[st.pilha.length - 1]?.nome;
  const enviar = (cmd: ClassCommand) => { if (!locked) send?.(cmd); };
  const desfazer = () => enviar({ type: "desfazerCombate" });

  /** Gasta N dados (os próximos prontos), rolando cada um. */
  const gastar = (itens: { nome: string; texto: (n: number) => string }[], uso?: string, passo?: string) => {
    if (locked || itens.length > livres.length) return null;
    const valoresRolados = itens.map(() => rolarDado(faces));
    setRecentes(livres.slice(0, itens.length));
    // Impulso Contínuo e Ataque Encadeado tiram 1 PA da ação: o PA volta ao personagem (e sai de novo no DESFAZER).
    const desconto = (uso === "round:impulso" ? 1 : 0) + (itens.some(x => x.nome === "Ataque Encadeado") ? 1 : 0);
    enviar({ type: "gastarManobra", itens: itens.map((x, i) => ({ nome: x.nome, valor: valoresRolados[i], texto: x.texto(valoresRolados[i]) })), uso, passo, pa: -desconto });
    return valoresRolados;
  };

  /* ── Manobras conhecidas ── */
  const conhecidas = (st.selections.manobras ?? "").split("|").map(manobraPorId).filter((x): x is Manobra => !!x && at(x.rank));
  const maxConhecidas = manobrasConhecidas(at);
  const trocarManobra = (x: Manobra) => {
    const sim = conhecidas.some(k => k.id === x.id);
    enviar({ type: "select", key: "manobras", value: (sim ? conhecidas.filter(k => k.id !== x.id) : [...conhecidas, x]).map(k => k.id).join("|") });
  };
  const compostaArmada = modo === "composta";
  const acaoEscolhida = compostaArmada && escolhidas.length ? manobraPorId(escolhidas[0])?.acao : null;
  const declarar = (m: Manobra) => {
    if (compostaArmada) {
      const proximas = escolhidas.includes(m.id) ? escolhidas.filter(x => x !== m.id) : [...escolhidas, m.id];
      if (proximas.length < 2) { setEscolhidas(proximas); return; }
      const par = proximas.map(id => manobraPorId(id)!);
      gastar(par.map(x => ({ nome: x.nome, texto: x.efeito })), "round:composta", "Manobra Composta");
      setEscolhidas([]); setModo(null);
      return;
    }
    gastar([{ nome: m.nome, texto: m.efeito }], m.limite ? `round:m:${m.id}` : undefined);
  };
  const no = (m: Manobra) => {
    const escolhida = escolhidas.includes(m.id);
    const outra = !!acaoEscolhida && m.acao !== acaoEscolhida;
    const desligado = locked || (!escolhida && (prontos < (compostaArmada ? 2 : 1) || outra));
    const usada = m.limite && usado(`round:m:${m.id}`);
    const apagado = modo === "modulacao" || modo === "dano";
    const status = escolhida ? "NA MANOBRA COMPOSTA" : usada ? "USADA NESTA RODADA" : outra ? "OUTRA AÇÃO" : !prontos ? "SEM DADOS" : m.reacao ? `REAÇÃO · ${m.gatilho}` : m.gatilho;
    return <button key={m.id} type="button" className="ca-no ca-tem-dica" data-estado={escolhida ? "escolhida" : apagado ? "apagado" : desligado ? "desligado" : "pronto"} disabled={desligado} aria-pressed={compostaArmada ? escolhida : undefined} onClick={() => declarar(m)}>
      <span className="ca-hexa">
        <svg width="58" height="64" viewBox="0 0 58 64" aria-hidden="true"><path d="M29 2 55 17v30L29 62 3 47V17Z" fill={escolhida ? "var(--ca-medio)" : "var(--ca-fundo)"} stroke={escolhida ? "var(--ca-claro)" : "var(--ca)"} strokeWidth={escolhida ? 2.6 : 1.6} /></svg>
        <span style={{ color: "var(--ca-claro)", display: "flex" }}><Svg d={m.icone} /></span>
      </span>
      <span className="ca-no-texto"><span className="ca-no-nome">{m.nome}{m.limite && <i aria-label="1× por rodada" />}</span><span className="ca-no-status">{status}</span></span>
      <Dica texto={m.regra} pos={m.lado === "ataque" ? "dir" : "esq"} />
    </button>;
  };
  const ataque = conhecidas.filter(m => m.lado === "ataque"), defesa = conhecidas.filter(m => m.lado === "defesa");

  /* ── Anel ── */
  const arcos = DIAGONAIS.map((g, i) => {
    const a = ponto(g - 43.5), b = ponto(g + 43.5);
    const pronto = !gasto.includes(i);
    return <path key={i} className="ca-arco" data-foco={dadoEmFoco === i && !locked || undefined} data-pronto={pronto} d={`M${f1(a.x)} ${f1(a.y)}A${R} ${R} 0 0 1 ${f1(b.x)} ${f1(b.y)}`} stroke={pronto ? (modo === "modulacao" || modo === "dano" ? "var(--ca-borda)" : "var(--ca)") : "#1d3242"} strokeWidth="10" />;
  });
  const marcas = marcasDoAnel();
  function marcasDoAnel() {
    let menores = "", maiores = "";
    for (let g = 0; g < 360; g += 6) {
      const maior = g % 30 === 0, a = ponto(g, maior ? 150 : 152), b = ponto(g, maior ? 162 : 157);
      if (maior) maiores += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`; else menores += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`;
    }
    return { menores, maiores };
  }
  const dados = DIAGONAIS.map((g, i) => {
    const p = ponto(g), estaGasto = gasto.includes(i), recente = recentes.includes(i) && estaGasto, v = valores[i];
    const uso = st.gastos?.filter(x => x.idx === i).at(-1);
    const aria = estaGasto ? `Dado de manobra ${i + 1}: gasto${uso ? (uso.valor == null ? ", marcado à mão" : ` em ${uso.nome}, resultado ${uso.valor}`) : ""}; clicar para restaurar` : `Dado de manobra ${i + 1}: d${faces} pronto; clicar para marcar como gasto`;
    return <button key={i} type="button" className="ca-dado" data-pronto={!estaGasto} aria-pressed={estaGasto} aria-label={aria} disabled={locked}
      style={{ left: p.x - 31, top: p.y - 32, color: recente ? "var(--ca-claro)" : estaGasto ? "#3a5566" : "var(--ca)", filter: recente ? "drop-shadow(0 0 10px var(--ca-halo))" : estaGasto ? "none" : "drop-shadow(0 0 6px var(--ca-halo))" }}
      onMouseEnter={() => setDadoEmFoco(i)} onMouseLeave={() => setDadoEmFoco(null)} onFocus={() => setDadoEmFoco(i)} onBlur={() => setDadoEmFoco(null)}
      onClick={() => { setRecentes([]); enviar({ type: "toggleDie", index: i }); }}>
      <svg width="62" height="64" viewBox="0 0 48 50" fill={recente ? "var(--ca-medio)" : estaGasto ? "#0b161c" : "var(--ca-fundo)"} stroke="currentColor" strokeWidth={recente ? 2.4 : 1.8} strokeLinejoin="round" aria-hidden="true"><path d="M24 2 46 24 24 46 2 24Z" /><path d="M2 24 24 11l22 13-22 13Z" fill="none" strokeWidth="1" /></svg>
      <span style={{ color: recente ? "#fff" : estaGasto ? "#8fa6b4" : "var(--ca-claro)" }}>{estaGasto ? (v ?? "") : `D${faces}`}</span>
    </button>;
  });
  const pilula = (chave: string, graus: number, nome: string, sub: string, dica: string, opcoes: { ativa?: boolean; desligada?: boolean; usada?: boolean; clicar: () => void }) => {
    const p = ponto(graus);
    return <button key={chave} type="button" className="ca-pilula ca-tem-dica" style={{ left: p.x, top: p.y }} aria-pressed={opcoes.ativa} data-usada={opcoes.usada || undefined} disabled={locked || opcoes.desligada} onClick={opcoes.clicar}>
      <strong>{nome}</strong><small>{sub}</small><Dica texto={dica} pos={graus === -90 ? "baixo" : "cima"} />
    </button>;
  };

  /* ── Subclasses ── */
  const inimigos = (api.classe?.alvos ?? []).filter(a => !a.aliado);
  const marcasPF = st.marcas ?? {};
  const atributos = api.character.atributos;
  const andar = api.derivados?.andar_m ?? 10 + (atributos?.corpo ?? 0);
  const manobrar = 10 + (atributos?.corpo ?? 0) + 5;

  // Brutalista: bandeja de dano local; cada passo que mexe no motor é desfeito pelo motor também.
  const armaSalva = /^(\d)d(\d+)$/.exec(st.selections.armaDano ?? "");
  const arma = { qtd: armaSalva ? Number(armaSalva[1]) : 2, faces: armaSalva ? Number(armaSalva[2]) : 6 };
  const [dano, setDano] = useState<{ v: number; era?: number; saiu?: number }[]>([]);
  const [extras, setExtras] = useState<number[]>([]);
  const [historico, setHistorico] = useState<{ dano: typeof dano; extras: number[]; nome: string; motor?: string }[]>([]);
  const [ferramenta, setFerramenta] = useState<null | "mao" | "forcar" | "explodir">(null);
  const guardarPasso = (nome: string, motor?: string) => setHistorico(h => [...h, { dano, extras, nome, motor }]);
  const aplicar = (id: "mao" | "forcar" | "explodir", i: number) => {
    const d = dano[i]; if (!d) return;
    if (id === "mao") {
      const novo = rolarDado(arma.faces);
      guardarPasso("Mão Pesada", "Mão Pesada");
      enviar({ type: "marcarUso", chave: "round:maoPesada", valor: true, passo: "Mão Pesada" });
      setDano(dano.map((x, j) => j === i ? (novo > x.v ? { v: novo, era: x.v } : { ...x, saiu: novo }) : x));
    } else if (id === "forcar") {
      if (d.v >= arma.faces || !livres.length) return;
      const v = rolarDado(faces), novo = Math.min(arma.faces, d.v + v);
      guardarPasso("Forçar o Limite", "Forçar o Limite");
      setRecentes(livres.slice(0, 1));
      enviar({ type: "gastarManobra", itens: [{ nome: "Forçar o Limite", valor: v, texto: `d${arma.faces} de ${d.v} para ${novo}${novo === arma.faces ? " · explodiu" : ""}` }], uso: "round:forcar", passo: "Forçar o Limite" });
      setDano(dano.map((x, j) => j === i ? { v: novo, era: x.v } : x));
      if (novo === arma.faces) setExtras([...extras, rolarDado(arma.faces)]);
    } else {
      if (d.v !== arma.faces) return;
      guardarPasso("Dano Explosivo", "Dano Explosivo");
      enviar({ type: "marcarUso", chave: "round:explosivo", valor: true, passo: "Dano Explosivo" });
      setExtras([...extras, rolarDado(arma.faces)]);
    }
    setFerramenta(null);
  };
  const podeEm = (id: "mao" | "forcar" | "explodir", v: number) => id === "explodir" ? v === arma.faces : id === "forcar" ? v < arma.faces : true;
  const armarFerramenta = (id: "mao" | "forcar" | "explodir") => {
    if (ferramenta === id) { setFerramenta(null); return; }
    const eleg = dano.map((x, i) => podeEm(id, x.v) ? i : -1).filter(i => i >= 0);
    if (eleg.length === 1) aplicar(id, eleg[0]); else setFerramenta(id);
  };
  const desfazerDano = () => {
    const ult = historico.at(-1); if (!ult) return;
    if (ult.motor && topoPilha === ult.motor) desfazer();
    setDano(ult.dano); setExtras(ult.extras); setHistorico(historico.slice(0, -1)); setFerramenta(null);
  };
  const totalDano = dano.reduce((t, x) => t + x.v, 0) + extras.reduce((t, x) => t + x, 0);
  const algumMax = dano.some(x => x.v === arma.faces);

  // Mago: modulação no anel.
  const maxMods = at("C") ? 2 : 1;
  const modular = () => {
    if (!mods.length) return;
    const escolhidasMod = MODULACOES.filter(x => mods.includes(x.id));
    const v = gastar([{ nome: "Modulação de Combate", texto: n => `${escolhidasMod.map(x => x.nome).join(" + ")} · ${escolhidasMod.map(x => x.efeito(n)).join(" · ")}` }], "round:modulacao", "Modulação de Combate");
    if (v) setResultadoMod({ valor: v[0], nomes: escolhidasMod.map(x => x.nome.toUpperCase()).join(" + "), texto: escolhidasMod.map(x => x.efeito(v[0])).join(" · ") });
  };

  /* ── Centro do anel ── */
  let centro: ReactNode;
  if (compostaArmada) {
    centro = <>
      <span className="ca-centro-rotulo">MANOBRA COMPOSTA</span>
      {[0, 1].map(i => { const m = manobraPorId(escolhidas[i] ?? ""); return <span key={i} className="ca-vaga" data-cheia={!!m}>{m?.nome ?? "escolha uma manobra"}</span>; })}
      <span className="ca-dica-linha">duas manobras da mesma ação</span>
    </>;
  } else if (modo === "modulacao") {
    centro = resultadoMod ? <>
      <span className="ca-centro-rotulo">{resultadoMod.nomes}</span>
      <span className="ca-centro-numero" style={{ fontSize: 60 }}>{resultadoMod.valor}</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.4, color: "#c3d6df" }}>{resultadoMod.texto}</span>
      <span style={{ display: "flex", gap: 14 }}>
        {topoPilha === "Modulação de Combate" && <button type="button" className="ca-link" onClick={() => { desfazer(); setResultadoMod(null); }}>DESFAZER</button>}
        <button type="button" className="ca-link" data-tom="neutro" onClick={() => setResultadoMod(null)}>OK</button>
      </span>
    </> : <>
      <span className="ca-centro-rotulo">ATÉ {maxMods} · MESMO DADO</span>
      <span style={{ maxWidth: 148, font: "600 15px/1.3 var(--ar-oxa)", color: mods.length ? "#eef4f7" : "#8fa6b4" }}>{mods.length ? MODULACOES.filter(x => mods.includes(x.id)).map(x => x.nome).join(" + ") : "Toque no anel"}</span>
      <button type="button" className="ca-primario" style={{ width: 148, minHeight: 40, marginTop: 4 }} disabled={locked || !mods.length || !prontos} onClick={modular}>{!prontos ? "SEM DADOS" : mods.length ? `MODULAR · 1 DADO` : "ESCOLHA UMA"}</button>
    </>;
  } else if (modo === "dano") {
    centro = !dano.length ? <>
      <span className="ca-centro-rotulo">DANO DO ATAQUE</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" className="ca-passo" style={{ width: 32, height: 32 }} aria-label="Menos um dado" disabled={locked} onClick={() => enviar({ type: "select", key: "armaDano", value: `${Math.max(1, arma.qtd - 1)}d${arma.faces}` })}>−</button>
        <span style={{ minWidth: 74, textAlign: "center", font: "800 26px/1 var(--ar-oxa)", color: "#eef4f7" }}>{arma.qtd}D{arma.faces}</span>
        <button type="button" className="ca-passo" style={{ width: 32, height: 32 }} aria-label="Mais um dado" disabled={locked} onClick={() => enviar({ type: "select", key: "armaDano", value: `${Math.min(4, arma.qtd + 1)}d${arma.faces}` })}>+</button>
      </span>
      <button type="button" className="ca-link" data-tom="neutro" disabled={locked} onClick={() => { const fs = [4, 6, 8, 10, 12]; enviar({ type: "select", key: "armaDano", value: `${arma.qtd}d${fs[(fs.indexOf(arma.faces) + 1) % fs.length]}` }); }}>TROCAR DADO · D{arma.faces}</button>
      <button type="button" className="ca-primario" style={{ width: 150, minHeight: 40 }} disabled={locked} onClick={() => { guardarPasso("Rolagem"); setDano(Array.from({ length: arma.qtd }, () => ({ v: rolarDado(arma.faces) }))); setExtras([]); }}>ROLAR</button>
    </> : <div style={{ position: "relative", width: 240, height: 220, flex: "none" }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 4, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 10 }}><span className="ca-centro-rotulo">{arma.qtd}D{arma.faces}</span><span style={{ font: "800 34px/1 var(--ar-oxa)", color: "var(--ca-claro)" }}>{totalDano}</span></span>
      <span style={{ position: "absolute", left: 0, right: 0, top: 40, display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 8 }}>
        {dano.map((x, i) => {
          const eleg = !!ferramenta && podeEm(ferramenta, x.v), max = x.v === arma.faces;
          return <button key={i} type="button" className="ca-ddado" data-max={max} data-eleg={eleg} data-apagado={!!ferramenta && !eleg} disabled={locked} aria-label={`Dado de dano ${i + 1}: ${x.v} de ${arma.faces}${eleg ? ". Tocar para aplicar" : ""}`} onClick={() => { if (ferramenta && eleg) aplicar(ferramenta, i); }}>
            <span>{x.v}</span><small>{x.era != null ? `ERA ${x.era}` : x.saiu != null ? `SAIU ${x.saiu}` : max ? "MÁX" : ""}</small>
          </button>;
        })}
        {extras.map((x, i) => <span key={`e${i}`} className="ca-ddado" data-extra="true"><span>+{x}</span><small>EXPLODIU</small></span>)}
      </span>
      <span className="ca-dica-linha" data-acento={!!ferramenta || (algumMax && !extras.length)} style={{ position: "absolute", left: 36, right: 36, top: 124, maxWidth: "none" }}>
        {ferramenta === "mao" ? "TOQUE NO DADO PARA ROLAR DE NOVO" : ferramenta === "forcar" ? `TOQUE NO DADO QUE RECEBE O D${faces}` : ferramenta === "explodir" ? "TOQUE NO DADO NO MÁXIMO" : algumMax && !extras.length ? "DADO NO MÁXIMO · PODE EXPLODIR" : "PARA MELHORAR, TOQUE NUMA FERRAMENTA DO ANEL"}
      </span>
      <span style={{ position: "absolute", left: 0, right: 0, top: 164, display: "flex", justifyContent: "center", gap: 18 }}>
        {historico.length > 0 && <button type="button" className="ca-link" onClick={desfazerDano}>DESFAZER</button>}
        <button type="button" className="ca-link" data-tom="neutro" onClick={() => { guardarPasso("Nova rolagem"); setDano([]); setExtras([]); setFerramenta(null); }}>NOVA ROLAGEM</button>
      </span>
    </div>;
  } else {
    centro = <>
      <span className="ca-centro-rotulo">DADOS DE MANOBRA</span>
      <span className="ca-centro-numero">{prontos}<small> / 4</small></span>
      <span className="ca-centro-faces">D{faces}</span>
    </>;
  }

  const pilulas: ReactNode[] = [];
  if (modo === "modulacao") MODULACOES.forEach((x, i) => {
    const sim = mods.includes(x.id), cheio = !sim && mods.length >= maxMods;
    pilulas.push(pilula(x.id, [-90, 0, 90, 180][i], x.nome, sim ? "ESCOLHIDA" : x.id === "projetar" ? "+D M ALCANCE" : x.id === "concentrar" ? "+D NO DANO" : x.id === "expandir" ? "+½D M NA ÁREA" : "½D POUPADAS", `${x.regra}${x.composta ? `\n${x.composta}` : ""}`,
      { ativa: sim, desligada: cheio && maxMods > 1, clicar: () => { setResultadoMod(null); setMods(sim ? mods.filter(y => y !== x.id) : maxMods === 1 ? [x.id] : [...mods, x.id].slice(-maxMods)); } }));
  });
  if (modo === "dano" && dano.length) {
    const usos = { mao: usado("round:maoPesada"), forcar: usado("round:forcar"), explodir: usado("round:explosivo") };
    const ferramentas: ["mao" | "forcar" | "explodir", string, number, string, boolean][] = [
      ["mao", "Mão Pesada", -90, REGRAS.mao, false],
      ["forcar", "Forçar o Limite", 0, REGRAS.forcar, !at("C") || !prontos || !dano.some(x => x.v < arma.faces)],
      ["explodir", "Dano Explosivo", 180, REGRAS.explosivo, !algumMax],
    ];
    ferramentas.forEach(([id, nome, graus, dica, bloq]) => {
      const sub = ferramenta === id ? "TOQUE NUM DADO" : id === "forcar" && !at("C") ? "RANKING C" : id === "forcar" && !prontos ? "SEM DADOS" : id === "explodir" && !algumMax ? "PRECISA DE UM MÁX" : usos[id] ? "USADA NA RODADA" : id === "mao" ? "FICA O MAIOR" : id === "forcar" ? `+D${faces} ATÉ O MÁXIMO` : `+1D${arma.faces}`;
      pilulas.push(pilula(id, graus, nome, sub, dica, { ativa: ferramenta === id, desligada: bloq, usada: usos[id], clicar: () => armarFerramenta(id) }));
    });
  }

  /* ── Topo (etiquetas da subclasse) ── */
  let chipEsq: ReactNode = null, chipDir: ReactNode = null;
  if (temSub && subclassId === "dissecador") {
    const com = st.selections.acertoCom === "corpo" ? "corpo" : "mente";
    chipEsq = <div className="ca-seletor">
      <span className="ca-tem-dica" tabIndex={0}><Svg d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5" tam={13} traco={2} />TÉCNICA ANALÍTICA · ACERTO COM<Dica texto={REGRAS.tecnica} pos="baixo-esq" /></span>
      <div role="group" aria-label="Atributo do teste de acerto">
        {(["mente", "corpo"] as const).map(a => <button key={a} type="button" aria-pressed={com === a} disabled={locked} onClick={() => enviar({ type: "select", key: "acertoCom", value: a })}>{a.toUpperCase()}<b>{atributos?.[a] ?? 0}</b></button>)}
      </div>
    </div>;
  } else if (temSub && subclassId === "mago_de_batalha") {
    chipEsq = <span className="ca-chip ca-tem-dica" tabIndex={0}><Svg d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" tam={13} traco={2} />TREINADO EM MAGIA BÉLICA · MANOBRAS NAS MAGIAS<Dica texto={REGRAS.belica} pos="baixo-esq" /></span>;
  } else if (temSub && subclassId === "brutalista") {
    const postura = usado("scene:postura");
    chipEsq = <button type="button" className="ca-chip ca-tem-dica" data-usado={postura} disabled={locked} onClick={() => enviar({ type: "marcarUso", chave: "scene:postura", passo: "Postura Ofensiva" })}><Svg d="M13 2 4 14h7l-1 8 9-12h-7z" tam={13} traco={2} />POSTURA OFENSIVA SEM PA<b>· {postura ? "USADA NA CENA" : "1× POR CENA"}</b><Dica texto={REGRAS.postura} pos="baixo-esq" /></button>;
    chipDir = <span className="ca-chip ca-tem-dica" tabIndex={0}><Svg d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5" tam={13} traco={2} />DADOS ORIGINAIS<Dica texto={REGRAS.originais} pos="baixo-dir" /></span>;
  } else if (temSub && subclassId === "acrobata") {
    chipEsq = <span className="ca-chip ca-tem-dica" tabIndex={0}><Svg d="M4 18c3-9 9-13 16-12M14 4l6 2-2 6" tam={14} traco={2} />PERCURSO LIVRE · MANOBRAR {manobrar} M SEM TESTE<Dica texto={REGRAS.percurso} pos="baixo-esq" /></span>;
    chipDir = <span className="ca-chip ca-tem-dica" tabIndex={0}><Svg d="M12 3v14M6 11l6 6 6-6M4 21h16" tam={13} traco={2} />ATERRISSAGEM · QUEDAS −{andar} M<Dica texto={`${REGRAS.aterrissagem} Seu Andar é ${andar} m.`} pos="baixo-dir" /></span>;
  }

  /* ── Embaixo do anel (subclasse) ── */
  let baixo: ReactNode = null;
  if (temSub && subclassId === "dissecador") {
    const n = Object.keys(marcasPF).length;
    baixo = <div className="ca-ponto">
      <span className="ca-rotulo-secao ca-tem-dica" tabIndex={0}><i />PONTO FRACO<b>· {n} {n === 1 ? "MARCADO" : "MARCADOS"}{usado("round:pontoFraco") ? " · JÁ MARCOU NA RODADA" : ""}</b><Dica texto={REGRAS.ponto} pos="cima" /></span>
      {inimigos.length ? <div className="ca-avatares">
        {inimigos.map(a => { const mk = marcasPF[a.id]; const reg = REGIOES.find(r => r.id === mk?.regiao);
          return <button key={a.id} type="button" className="ca-avatar" aria-label={`${a.nome}: ${reg ? (mk?.comp ? reg.comp : `Ponto Fraco em ${reg.nome.toLowerCase()}`) : "sem Ponto Fraco"}. Abrir Ponto Fraco.`} onClick={() => { setAlvoSel(a.id); setPainel("ponto"); }}>
            <Avatar alvo={a} marca={mk} /><small data-vazio={!reg || undefined} data-comp={mk?.comp || undefined}>{reg ? reg.nome : "—"}</small>
          </button>; })}
      </div> : <span className="ca-vazio" style={{ maxWidth: 320, textAlign: "center" }}>Nenhuma criatura inimiga na cena.</span>}
    </div>;
  } else if (temSub && subclassId === "mago_de_batalha") {
    baixo = <Losango nome="Modulação de Combate" icone="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" estado={modo === "modulacao" ? "ativo" : usado("round:modulacao") ? "usado" : "pronto"}
      status={modo === "modulacao" ? "FECHAR" : usado("round:modulacao") ? "USADA NESTA RODADA" : !prontos ? "SEM DADOS" : "AO CONJURAR MAGIA DE ATAQUE"}
      onClick={() => { setResultadoMod(null); setEscolhidas([]); setModo(modo === "modulacao" ? null : "modulacao"); }} />;
  } else if (temSub && subclassId === "brutalista") {
    baixo = <Losango nome="Dano do Ataque" icone="M13 2 4 14h7l-1 8 9-12h-7z" estado={modo === "dano" ? "ativo" : "pronto"} status={modo === "dano" ? "FECHAR" : "ROLAR E MELHORAR O DANO"}
      onClick={() => { setEscolhidas([]); setFerramenta(null); setModo(modo === "dano" ? null : "dano"); }} />;
  } else if (temSub && subclassId === "acrobata") {
    const ultimoImpulso = usado("round:impulsoGratis")
      ? st.uses["scene:impulsoValor"]
      : usado("round:impulso") ? st.gastos?.filter(g => g.nome === "Impulso Contínuo").at(-1)?.valor : null;
    baixo = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div className="ca-losangos">
        {at("C") ? <Losango nome="Impulso Contínuo" icone="M4 18c3-9 9-13 16-12M14 4l6 2-2 6" dica={REGRAS.impulso} desligado={locked || !prontos || usado("round:impulso")}
          estado={!prontos ? "usado" : usado("round:impulso") ? "usado" : "pronto"} status={usado("round:impulso") ? "USADO NESTA RODADA" : !prontos ? "SEM DADOS" : `1 DADO · −1 PA · +D${faces} M`}
          onClick={() => gastar([{ nome: "Impulso Contínuo", texto: v => `−1 PA na ação ofensiva · +${v} m no Manobrar` }], "round:impulso")} />
          : <Losango nome="Impulso Contínuo" icone="M4 18c3-9 9-13 16-12M14 4l6 2-2 6" estado="travado" status="RANKING C" dica={REGRAS.impulso} />}
        {at("C") && <Losango nome="Impulso livre" icone="M12 3v18M4 12h16" dica="Uma vez por cena, role o Dado de Manobra sem gastá-lo. O resultado aumenta o deslocamento restante de Manobrar. Ainda vale o limite de uma vez por rodada."
          estado={usado("scene:impulsoGratis") ? "usado" : "pronto"} status={usado("scene:impulsoGratis") ? "USADO NESTA CENA" : `1/CENA · ROLAR D${faces}`}
          desligado={locked || usado("scene:impulsoGratis") || usado("round:impulso")}
          onClick={() => enviar({ type: "impulsoGratis", valor: rolarDado(faces), pa: -1 })} />}
        <Losango nome="+1 de vantagem" icone="M12 5v14M5 12h14" dica={`${REGRAS.vantagem} Toque para marcar o uso; toque de novo para desmarcar.`} estado={usado("round:vantagemTransitoria") ? "usado" : "pronto"}
          status={usado("round:vantagemTransitoria") ? "USADA NESTA RODADA" : "AÇÃO OFENSIVA TRANSITÓRIA"} desligado={locked}
          onClick={() => enviar({ type: "marcarUso", chave: "round:vantagemTransitoria", passo: "+1 de vantagem" })} />
      </div>
      <span className="ca-resultado">
        {ultimoImpulso != null && <span>IMPULSO · +{ultimoImpulso} M NO MANOBRAR · −1 PA NA AÇÃO</span>}
        {(topoPilha === "Impulso Contínuo" || topoPilha === "Impulso Contínuo livre" || topoPilha === "+1 de vantagem") && <button type="button" className="ca-link" onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}
      </span>
    </div>;
  }

  const composta = at("B")
    ? <Losango nome="Manobra Composta" icone="M5 12h14M12 5v14" dica={REGRAS.composta} posDica="baixo"
        estado={compostaArmada ? "ativo" : usado("round:composta") ? "usado" : "pronto"}
        status={compostaArmada ? "CANCELAR" : usado("round:composta") ? "USADA NESTA RODADA" : prontos < 2 ? "EXIGE 2 DADOS PRONTOS" : "PRONTA · 2 DADOS"}
        desligado={locked || (!compostaArmada && prontos < 2)}
        onClick={() => { setEscolhidas([]); setFerramenta(null); setModo(compostaArmada ? null : "composta"); }} />
    : <Losango nome="Manobra Composta" icone="M5 12h14M12 5v14" estado="travado" status="RANKING B" dica={REGRAS.composta} posDica="baixo" />;

  const alvoAberto = inimigos.find(a => a.id === alvoSel) ?? inimigos[0];
  const rotulo = temSub ? `${sub!.nome.toUpperCase()} · ${rank}` : `RANKING ${rank}`;

  return <section className={`rc-eq-outer ar-raiz ca-raiz ${oxanium.variable} ${plex.variable}`} aria-label="Classe Combatente">
    <div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://CLASSE" mod="MOD.CLASS // 10" />
    <div className="ar-tela">
    <div className="ar-rolagem">
      <header className="ar-cab">
        <h2>COMBATENTE</h2>
        <span>{rotulo}</span>
        <span className="ca-legenda" aria-hidden="true">
          <span><svg width="11" height="12" viewBox="0 0 22 24" fill="none" stroke="#8fa6b4" strokeWidth="2.4"><path d="M11 1 21 6.5v11L11 23 1 17.5v-11Z" /></svg>GASTA 1 DADO</span>
          <span><i />1× POR RODADA</span>
        </span>
      </header>
      {(chipEsq || chipDir) && <div className="ca-chips"><span>{chipEsq}</span><span>{chipDir}</span></div>}

      <div className="ca-palco">
        {composta}
        <div className="ca-linha">
          <div className="ca-lado" data-lado="esq">
            <span className="ca-lado-rotulo">AO ATACAR</span>
            {ataque.length ? ataque.map(no) : <span className="ca-vazio">Nenhuma manobra de ataque no repertório.</span>}
          </div>
          <div className="ca-anel">
            <svg viewBox="0 0 360 360" fill="none" aria-hidden="true">
              <path d={marcas.menores} stroke="#1f3a4b" strokeWidth="1.5" />
              <path d={marcas.maiores} stroke="#3a5566" strokeWidth="2" />
              {arcos}
              {(compostaArmada || modo === "modulacao" || modo === "dano") && <circle cx={C} cy={C} r="128" stroke="var(--ca)" strokeWidth="1.5" strokeDasharray="4 6" />}
              <circle cx={C} cy={C} r="116" stroke="#15293a" strokeWidth="1" />
            </svg>
            {dados}
            <div className="ca-centro">{centro}</div>
            {pilulas}
          </div>
          <div className="ca-lado" data-lado="dir">
            <span className="ca-lado-rotulo">AO SER ATACADO</span>
            {defesa.length ? defesa.map(no) : <span className="ca-vazio">Nenhuma manobra de defesa no repertório.</span>}
          </div>
        </div>
        {baixo}
      </div>
    </div>

    <footer className="ar-rodape">
      <button type="button" onClick={() => setPainel("manobras")}>TROCAR MANOBRAS</button>
      <button type="button" onClick={() => setPainel("gastos")} style={{ display: "flex", alignItems: "center", gap: 10 }}>DADOS GASTOS<span style={{ minWidth: 22, height: 22, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", background: gasto.length ? "var(--ca-fundo)" : "transparent", border: `1px solid ${gasto.length ? "var(--ca-borda)" : "#24394a"}`, font: "700 11px/1 var(--ar-mono)", color: gasto.length ? "var(--ca-claro)" : "#6f8799" }}>{gasto.length}</span></button>
      <button type="button" onClick={() => setPainel("habilidades")}>HABILIDADES ›</button>
    </footer>

    {painel === "habilidades" && <Painel titulo="HABILIDADES" fechar={() => setPainel(null)}>
      <ListaHabilidades classe={classe} sub={temSub ? sub : undefined} rank={rank} glossario={api.glossario} iconeClasse={<Svg d="M24 2 46 24 24 46 2 24Z" tam={16} />} />
    </Painel>}

    {painel === "gastos" && <Painel baixo titulo="DADOS GASTOS" intro="Do mais recente ao mais antigo. Os dados voltam ao concluir um descanso longo." fechar={() => setPainel(null)}>
      {(st.gastos ?? []).length ? [...(st.gastos ?? [])].reverse().map((g, i) => <div key={i} className="ca-gasto">
        <span className="ca-gasto-dado"><svg width="40" height="42" viewBox="0 0 48 50" fill="#0b161c" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M24 2 46 24 24 46 2 24Z" /></svg><span>{g.valor ?? "—"}</span></span>
        <div><strong>{g.nome.toUpperCase()}</strong>{g.texto && <p>{g.texto}</p>}</div>
      </div>) : <p className="ar-painel-intro" style={{ margin: 0 }}>Os 4 dados estão prontos.</p>}
      <div className="ca-gastos-fim">{topoPilha && <button type="button" className="ca-link" disabled={locked} onClick={desfazer}>DESFAZER · {topoPilha.toUpperCase()}</button>}</div>
    </Painel>}

    {painel === "manobras" && <Painel titulo="TROCAR MANOBRAS" intro={at("D") ? "Ao concluir um descanso longo, troque uma manobra por outra de uma categoria liberada." : "Escolha as Manobras Básicas que você conhece."} fechar={() => setPainel(null)}>
      <div className="ca-rep-vagas">
        {Array.from({ length: maxConhecidas }, (_, i) => { const k = conhecidas[i];
          return k ? <button key={k.id} type="button" className="ca-rep-vaga" disabled={locked} aria-label={`Tirar ${k.nome} do repertório`} onClick={() => trocarManobra(k)}>
            <span className="ca-rep-icone"><Svg d={k.icone} tam={16} /></span><span>{k.nome}</span><i aria-hidden="true">×</i>
          </button> : <span key={`v${i}`} className="ca-rep-vaga" data-vazia="true">VAGA</span>; })}
      </div>
      <div className="ca-rep-abas" role="tablist">
        {(["ataque", "defesa"] as const).map(l => <button key={l} type="button" role="tab" aria-selected={ladoRep === l} onClick={() => setLadoRep(l)}>
          {l === "ataque" ? "AO ATACAR" : "AO SER ATACADO"}<b>{conhecidas.filter(k => k.lado === l).length}</b>
        </button>)}
      </div>
      {(["Básica", "Tática", "Avançada"] as const).filter(cat => at(cat === "Básica" ? "F" : cat === "Tática" ? "D" : "B")).map(cat => {
        const lista = MANOBRAS.filter(x => x.categoria === cat && x.lado === ladoRep);
        if (!lista.length) return null;
        return <div key={cat}>
          <h4 className="ca-categoria">{cat === "Básica" ? "BÁSICAS" : cat === "Tática" ? "TÁTICAS" : "AVANÇADAS"}</h4>
          {lista.map(x => { const sim = conhecidas.some(k => k.id === x.id), cheio = !sim && conhecidas.length >= maxConhecidas, aberta = regraAberta === x.id;
            return <div key={x.id} className="ca-rep-linha" data-sim={sim} data-cheio={cheio}>
              <button type="button" className="ca-rep-escolher" aria-pressed={sim} disabled={locked || cheio} onClick={() => trocarManobra(x)}>
                <span className="ca-rep-icone"><Svg d={x.icone} tam={18} /></span>
                <span className="ca-rep-texto">
                  <strong>{x.nome}{x.limite && <em>1× POR RODADA</em>}</strong>
                  <small>{x.reacao ? `REAÇÃO · ${x.gatilho}` : x.gatilho}</small>
                  <span>{efeitoComDado(x, faces)}</span>
                </span>
                <span className="ca-rep-estado">{sim ? "✓ CONHECIDA" : cheio ? "REPERTÓRIO CHEIO" : "+ APRENDER"}</span>
              </button>
              <button type="button" className="ca-rep-regra" aria-expanded={aberta} onClick={() => setRegraAberta(aberta ? null : x.id)}>{aberta ? "FECHAR REGRA" : "REGRA"}</button>
              {aberta && <p>{x.regra}</p>}
            </div>; })}
        </div>; })}
    </Painel>}

    {painel === "ponto" && alvoAberto && <Painel baixo titulo="PONTO FRACO" fechar={() => setPainel(null)}>
      <FolhaPonto alvos={inimigos} alvo={alvoAberto} marcas={marcasPF} locked={locked} podeComprometer={at("C")} prontos={prontos}
        trocar={setAlvoSel} marcar={(regiao) => enviar({ type: "pontoFraco", alvo: alvoAberto.id, regiao })}
        comprometer={() => { if (!livres.length) return; setRecentes(livres.slice(0, 1)); enviar({ type: "comprometer", alvo: alvoAberto.id, valor: rolarDado(faces) }); }}
        usouComprometer={usado("round:comprometer")} />
    </Painel>}
    </div>
    </div>
  </section>;
}

/* Folha do Ponto Fraco: uma criatura por vez, silhueta clicável e o efeito de cada região. */
function FolhaPonto({ alvos, alvo, marcas, locked, podeComprometer, prontos, trocar, marcar, comprometer, usouComprometer }: {
  alvos: Alvo[]; alvo: Alvo; marcas: Record<string, MarcaPontoFraco>; locked: boolean; podeComprometer: boolean; prontos: number;
  trocar: (id: string) => void; marcar: (regiao: string | null) => void; comprometer: () => void; usouComprometer: boolean;
}) {
  const marca = marcas[alvo.id];
  const reg = REGIOES.find(r => r.id === marca?.regiao);
  const podeComp = !!reg && !marca?.comp && prontos > 0 && podeComprometer && !locked;
  const partes: [string, string, number, number, number, number][] = [["cabeca", "Cabeça", 37, 4, 30, 30], ["tronco", "Tronco", 30, 42, 44, 62], ["bracos", "Braços", 6, 44, 21, 62], ["bracos", "Braços", 77, 44, 21, 62], ["pernas", "Pernas", 25, 108, 54, 88]];
  const tocar = (id: string) => marcar(marca?.regiao === id ? null : id);
  const rodape = !reg ? "Marque a região quando acertar esta criatura." : marca?.comp ? `${reg.comp} até o fim do próximo turno dela.` : !podeComprometer ? "Comprometer chega no Ranking C." : usouComprometer ? "Comprometer já foi usado nesta rodada." : "Ao acertar o Ponto Fraco: gaste 1 Dado de Manobra e some ao dano.";
  return <>
    {alvos.length > 1 && <div className="ca-folha-abas">{alvos.map(a => <button key={a.id} type="button" aria-pressed={a.id === alvo.id} aria-label={a.nome} onClick={() => trocar(a.id)}><Avatar alvo={a} marca={marcas[a.id]} tam={40} /></button>)}</div>}
    <div className="ca-folha-corpo">
      <div className="ca-silhueta">
        <Silhueta marca={marca} />
        {partes.map(([id, nome, x, y, w, h], i) => <button key={i} type="button" className="ca-parte" disabled={locked} aria-pressed={marca?.regiao === id} aria-label={`Marcar ${nome} como Ponto Fraco`} style={{ left: x, top: y, width: w, height: h }} onClick={() => tocar(id)} />)}
      </div>
      <div className="ca-regioes">
        <div className="ca-regioes-topo"><strong>{alvo.nome}</strong><small>{reg ? (marca?.comp ? reg.comp.toUpperCase() : `PONTO FRACO · ${reg.nome}`) : "MARQUE AO ACERTAR"}</small>{reg && <button type="button" className="ca-link" disabled={locked} onClick={() => marcar(null)}>TIRAR MARCA</button>}</div>
        <p>Toque na região atingida para marcar; toque de novo para tirar. Ao comprometer, ela sofre:</p>
        {REGIOES.map(r => <button key={r.id} type="button" className="ca-regiao" aria-pressed={marca?.regiao === r.id} data-comp={(marca?.regiao === r.id && marca.comp) || undefined} disabled={locked} onClick={() => tocar(r.id)}>
          <strong>{r.nome}</strong><span>{r.efeito.charAt(0).toUpperCase() + r.efeito.slice(1)}.</span>{marca?.regiao === r.id && <em>PONTO FRACO</em>}
        </button>)}
      </div>
    </div>
    <div className="ca-folha-fim">
      <span>{rodape}</span>
      <button type="button" className="ca-primario" disabled={!podeComp} onClick={comprometer}>{marca?.comp && reg ? reg.comp.toUpperCase() : `COMPROMETER${reg ? " " + reg.nome : ""} · 1 DADO`}</button>
    </div>
  </>;
}

