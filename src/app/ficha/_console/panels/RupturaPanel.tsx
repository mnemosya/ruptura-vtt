"use client";

/**
 * Aba Ruptura do Console (RUPTURA 1.2, cap. 18).
 *
 * Visão: anel de Integridade com a perda da próxima Ruptura, o estado
 * (Rupturas sofridas, quanto custa a próxima, Sobrecarga do dia, Mana
 * ganha), a coleção de Marcas e Traços em slots e a escada de faixas de
 * Integridade. Com uma Ruptura pendente, "Resolver" abre dois passos:
 * a Marca (grade de 15) e o Traço (roleta 4 × 8). O preço (Integridade,
 * Mana, limite) só é aplicado ao concluir, junto com as escolhas —
 * fechar no meio não gasta nada. Nada espera o fim da cena.
 *
 * O Console é uma janela redimensionável (até ~300 px de largura): o
 * layout se reorganiza pela largura do próprio painel (container
 * queries em `ruptura.css`), não pela tela.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getIntegrityBand,
  previaRuptura,
  rupturasSofridas,
  type IntegrityBandLabel,
  type OverloadRulesPayload,
} from "../../../../lib/character";
import { FAMILIAS_MARCA, MARCAS_RUPTURA, TIPOS_TRACO, marcaPorId, tracoPorDados } from "../../../../lib/rulesetV12/ruptura";
import { useRolarNaMesa } from "../../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { oxanium } from "../../../_design/oxanium";
import type { ConsoleApi } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { COR_FAMILIA, COR_TIPO_TRACO, FUNDO_FAMILIA, FUNDO_TIPO_TRACO, ICONE_MARCA, ICONE_TIPO_TRACO, romano } from "./ruptura/iconesMarca";
import { RodaTracos, type EscolhaTraco } from "./ruptura/RodaTracos";
import { rotulo as rotuloVertente } from "./MagiasPanel";
import "./hud/hud-base.css";
import "./hud/ruptura.css";

type Passo = "visao" | "marca" | "traco";

function Glifo({ id, cor, tamanho = 22 }: { id: string; cor: string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_MARCA[id] ?? ""} />
    </svg>
  );
}

/**
 * Card de slot da coleção (Marca ou Traço), à moda das runas de jogo:
 * medalhão com anel duplo na cor da família, fita com o numeral da
 * Ruptura, nome e categoria. `aberto` = espera escolha; `bloqueado` =
 * a próxima Ruptura, com o custo.
 */
function SlotCard({ estado, numero, nome, sub, cor = "#2a4a5c", fundo = "#0b1822", icone, titulo, onClick, desabilitado }: {
  estado: "cheio" | "aberto" | "bloqueado";
  numero: string;
  nome: string;
  sub: string;
  cor?: string;
  fundo?: string;
  icone: React.ReactNode;
  titulo?: string;
  onClick?: () => void;
  desabilitado?: boolean;
}) {
  const conteudo = (
    <>
      <span className="rp-card-brilho" aria-hidden="true" />
      <span className="rp-card-medalha">
        <span className="rp-card-anel" aria-hidden="true" />
        <span className="rp-card-anel-giro" aria-hidden="true" />
        <span className="rp-card-icone">{icone}</span>
        <span className="rp-card-fita">{numero}</span>
      </span>
      <span className="rp-card-nome">{nome}</span>
      <span className="rp-card-sub">{sub}</span>
    </>
  );
  const estilo = { ["--rp-cor" as string]: cor, ["--rp-fundo" as string]: fundo };
  return onClick ? (
    <button type="button" className="rp-card" data-estado={estado} style={estilo} title={titulo} onClick={onClick} disabled={desabilitado}
      aria-haspopup={estado === "aberto" ? undefined : "dialog"}>{conteudo}</button>
  ) : (
    <div className="rp-card" data-estado={estado} style={estilo} title={titulo}>{conteudo}</div>
  );
}

/** Painel de detalhes de um card da coleção, por cima da aba. Esc ou clique fora fecha. */
function DetalheCard({ cor, fundo, icone, fita, kicker, nome, onFechar, children }: {
  cor: string;
  fundo: string;
  icone: React.ReactNode;
  fita: string;
  kicker: string;
  nome: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => { fechar.current?.focus(); }, []);
  return (
    <div className="rp-ficha-fundo" onClick={onFechar}>
      <div
        className="rp-ficha" role="dialog" aria-modal="true" aria-label={nome}
        style={{ ["--rp-cor" as string]: cor, ["--rp-fundo" as string]: fundo }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onFechar(); } }}
      >
        <span className="rp-card-brilho" aria-hidden="true" />
        <button ref={fechar} type="button" className="rp-fechar rp-ficha-fechar" aria-label="Fechar detalhes" onClick={onFechar}>✕</button>
        <div className="rp-ficha-cab">
          <span className="rp-card-medalha rp-card-medalha-grande">
            <span className="rp-card-anel" aria-hidden="true" />
            <span className="rp-card-anel-giro" aria-hidden="true" />
            <span className="rp-card-icone">{icone}</span>
            <span className="rp-card-fita">{fita}</span>
          </span>
          <div className="rp-ficha-titulo">
            <span className="rp-k" style={{ color: cor }}>{kicker}</span>
            <h3 className="rp-ficha-nome">{nome}</h3>
          </div>
        </div>
        <div className="rp-ficha-corpo">{children}</div>
      </div>
    </div>
  );
}

function dataCurta(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Carcaça padrão das abas do Console: moldura + cabeçalho de módulo (igual a Ações). */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <section className="rc-eq-outer" aria-label="Ruptura">
      <div className="rc-eq-card-outer rc-inv-moldura">
        <CabecalhoModulo id="ID://RUPTURA" mod="MOD.FRATURA // 08" />
        {children}
      </div>
    </section>
  );
}

function Cadeado() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Anel de Integridade: segmentos acesos, os que a próxima Ruptura leva (listrados) e os já perdidos. */
function AnelIntegridade({ atual, max, perda }: { atual: number; max: number; perda: number }) {
  const total = Math.max(1, Math.round(max));
  const tam = 300, c = tam / 2, r0 = 124, r1 = 140, inicio = -150, faixa = 300;
  const passo = faixa / total, folga = Math.min(2.6, passo * 0.28);
  const pt = (r: number, g: number) => { const t = ((g - 90) * Math.PI) / 180; return [c + r * Math.cos(t), c + r * Math.sin(t)]; };
  const segs = Array.from({ length: total }, (_, i) => {
    const a0 = inicio + i * passo + folga / 2, a1 = inicio + (i + 1) * passo - folga / 2;
    const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
    const d = `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
    const estado = i < atual - perda ? "ok" : i < atual ? "perda" : "vazio";
    return { d, estado };
  });
  const [mx0, my0] = pt(112, inicio), [mx1, my1] = pt(112, inicio + faixa);
  return (
    <svg viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
      <defs>
        <pattern id="rp-listra" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#2a1a0c" /><rect width="2" height="5" fill="#ff8a1f" />
        </pattern>
        <radialGradient id="rp-nucleo-luz">
          <stop offset="0%" stopColor="#0f2230" /><stop offset="100%" stopColor="#050d14" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={104} fill="url(#rp-nucleo-luz)" stroke="#16303f" />
      <circle cx={c} cy={c} r={92} fill="none" stroke="#ff8a1f" strokeOpacity={0.22} strokeDasharray="2 6" />
      <path d={`M${mx0} ${my0}A112 112 0 1 1 ${mx1} ${my1}`} fill="none" stroke="#12283a" strokeDasharray="1 5" />
      {segs.map((s, i) => (
        <path key={i} d={s.d} className={s.estado === "perda" ? "rp-respira" : undefined}
          fill={s.estado === "ok" ? "#00b8dc" : s.estado === "perda" ? "url(#rp-listra)" : "#10232e"} />
      ))}
    </svg>
  );
}

const ESCADA: { label: IntegrityBandLabel; nome: string; faixa: string }[] = [
  { label: "integro", nome: "Íntegro", faixa: "7+" },
  { label: "distorcao_1", nome: "1 distorção", faixa: "5–6" },
  { label: "distorcao_2", nome: "2 distorções", faixa: "3–4" },
  { label: "distorcao_3", nome: "3 distorções", faixa: "2" },
  { label: "dissolucao", nome: "Dissolução", faixa: "1" },
  { label: "fim_da_ficha", nome: "Vestígio", faixa: "0" },
];

function Stat({ rotulo, valor, sub, tom }: { rotulo: string; valor: React.ReactNode; sub?: string; tom?: "am" | "cy" }) {
  return (
    <div className="rp-stat" data-tom={tom}>
      <span className="rp-k">{rotulo}</span>
      <span className="rp-stat-valor">{valor}</span>
      {sub && <span className="rp-stat-sub">{sub}</span>}
    </div>
  );
}

export function RupturaPanel({ api }: { api: ConsoleApi }) {
  const c = api.character;
  const regras = (api.regras as { sobrecarga?: OverloadRulesPayload } | null)?.sobrecarga ?? null;
  const pendente = c.ruptura_pendente === true;
  const previa = previaRuptura(c, regras);
  const leitura = !!api.somenteLeitura;
  const rolarNaMesa = useRolarNaMesa();

  const [passo, setPasso] = useState<Passo>("visao");
  const [marcaId, setMarcaId] = useState<string>(MARCAS_RUPTURA[0].id);
  const [marcaMagia, setMarcaMagia] = useState("");
  const [traco, setTraco] = useState<EscolhaTraco | null>(null);
  const [tipoVisto, setTipoVisto] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [concluida, setConcluida] = useState<string | null>(null);
  /** Card da coleção aberto em detalhe: a entrada do histórico (Marca ou Traço) ou a próxima Ruptura. */
  const [detalhe, setDetalhe] = useState<{ tipo: "marca" | "traco"; id: string } | { tipo: "bloqueado" } | null>(null);

  const historico = c.historico_ruptura ?? [];
  const sofridas = rupturasSofridas(c);
  const integMax = api.derivados.integridade_max ?? 0;
  const integAtual = c.recursos_atuais?.integridade ?? integMax;
  const faixaAgora = getIntegrityBand(integAtual).label;
  const faixaDepois = getIntegrityBand(previa.integridadeDepois).label;
  /** Repertório como o Grimório mostra: só magias publicadas e aprendidas. */
  const magias = useMemo(() => {
    const aprendidas = new Set((api.magias.magiasAprendidas ?? []).map((m) => m.spellSlug));
    return api.magias.spells
      .filter((s) => s.status === "published" && aprendidas.has(s.slug))
      .map((s) => ({ slug: s.slug, nome: s.nome, vertente: rotuloVertente(s.vertente), nivel: s.estatisticas.nivel }))
      .sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [api.magias.spells, api.magias.magiasAprendidas]);
  const marca = marcaPorId(marcaId)!;
  /** Marcas que a ficha soma sozinha num derivado: mostra o antes ▸ depois. */
  const automatico = marca.id === "carapaca_arcana"
    ? { rotulo: "PV máx.", antes: api.derivados.pv_max ?? 0, soma: (c.atributos.corpo ?? 0) + 3 }
    : marca.id === "escudo_psiquico"
      ? { rotulo: "PE máx.", antes: api.derivados.pe_max ?? 0, soma: (c.atributos.mente ?? 0) + 3 }
      : null;
  const tracoAtual = traco ? tracoPorDados(traco.tipo, traco.numero) : undefined;

  function abrirResolucao() {
    setErro(null);
    setConcluida(null);
    setTraco(null);
    setTipoVisto(1);
    setPasso("marca");
  }

  function escolherTraco(t: EscolhaTraco) {
    setTraco(t);
    setTipoVisto(t.tipo);
  }

  function concluir() {
    if (!traco || !api.ruptura) return;
    const falha = api.ruptura.resolver({ marcaId, marcaMagia: marca.pedeMagia ? marcaMagia : undefined, traco });
    if (falha) { setErro(falha); return; }
    setConcluida(`Ruptura ${romano(previa.numero)} gravada: ${marca.nome} · ${tracoAtual?.nome ?? ""}`);
    setPasso("visao");
  }

  async function rolarTraco(): Promise<EscolhaTraco> {
    if (!rolarNaMesa) throw new Error("sem mesa");
    const dados = await rolarNaMesa([{ id: "traco-d4", sides: 4 }, { id: "traco-d8", sides: 8 }], "#ff8a1f");
    return { tipo: dados.find((d) => d.id === "traco-d4")?.value ?? 1, numero: dados.find((d) => d.id === "traco-d8")?.value ?? 1 };
  }

  const cabecalhoPasso = (
    <header className="rp-topo">
      <span className="rp-k rp-k-am rp-topo-titulo">Ruptura {romano(previa.numero)}</span>
      <ol className="rp-etapas" aria-label="Etapas da Ruptura">
        <li className="rp-etapa" data-estado="feita"><i />Preço</li>
        <li className="rp-etapa-fio" data-feito={passo === "traco" || undefined} aria-hidden="true" />
        <li className="rp-etapa" data-estado={passo === "marca" ? "atual" : "feita"} aria-current={passo === "marca" ? "step" : undefined}><i />Marca</li>
        <li className="rp-etapa-fio" aria-hidden="true" />
        <li className="rp-etapa" data-estado={passo === "traco" ? "atual" : "proxima"} aria-current={passo === "traco" ? "step" : undefined}><i />Traço</li>
      </ol>
      <button type="button" className="rp-fechar" aria-label="Fechar sem resolver" title="Fechar sem resolver" onClick={() => setPasso("visao")}>✕</button>
    </header>
  );

  // ---------------------------------------------------------------- Marca
  if (passo === "marca") {
    const cor = COR_FAMILIA[marca.familia];
    return (
      <Moldura><div className={`hx hx-grade rp ${oxanium.variable}`} data-passo="marca" data-testid="console-ruptura">
        {cabecalhoPasso}
        <div className="rp-marca-legenda" aria-hidden="true">
          <span className="rp-k">Escolha 1 Marca · é permanente</span>
          <span className="rp-marca-familias">
            {(Object.keys(FAMILIAS_MARCA) as (keyof typeof FAMILIAS_MARCA)[]).map((f) => (
              <span key={f} className="rp-k" style={{ ["--rp-cor" as string]: COR_FAMILIA[f] }}><i />{FAMILIAS_MARCA[f].nome}</span>
            ))}
          </span>
        </div>
        <div className="rp-marca-grade" role="listbox" aria-label="Marcas">
          {MARCAS_RUPTURA.map((m) => {
            const sel = m.id === marcaId;
            const ja = historico.filter((h) => h.marcaId === m.id).length;
            return (
              <button key={m.id} type="button" role="option" aria-selected={sel} className="rp-tile" data-sel={sel || undefined}
                style={{ ["--rp-cor" as string]: COR_FAMILIA[m.familia], ["--rp-fundo" as string]: FUNDO_FAMILIA[m.familia] }}
                onClick={() => setMarcaId(m.id)} data-testid={`ruptura-marca-${m.id}`}>
                <span className="rp-tile-tick" aria-hidden="true" />
                {ja > 0 && <span className="rp-tile-ja">×{ja}</span>}
                <span className="rp-tile-glifo"><Glifo id={m.id} cor={sel ? COR_FAMILIA[m.familia] : "#8aa0b2"} tamanho={28} /></span>
                <span className="rp-tile-nome">{m.nome}</span>
                <span className="rp-tile-resumo">{m.resumo}</span>
              </button>
            );
          })}
        </div>
        <section className="rp-marca-detalhe" style={{ ["--rp-cor" as string]: cor, ["--rp-fundo" as string]: FUNDO_FAMILIA[marca.familia] }} aria-live="polite">
          <span className="rp-detalhe-glifo"><Glifo id={marca.id} cor={cor} tamanho={30} /></span>
          <div className="rp-detalhe-corpo">
            <span className="rp-k" style={{ color: cor }}>{[FAMILIAS_MARCA[marca.familia].nome, marca.selo].filter(Boolean).join(" · ")}</span>
            <h3 className="rp-detalhe-nome">{marca.nome}</h3>
            <p className="rp-detalhe-texto">{marca.texto}</p>
            {automatico ? (
              <p className="rp-efeito" data-auto>
                <span className="rp-k">Automático</span>
                <span>{automatico.rotulo} {automatico.antes} <i aria-hidden="true">▸</i> <b>{automatico.antes + automatico.soma}</b></span>
              </p>
            ) : marca.emJogo ? (
              <p className="rp-efeito"><span className="rp-k">Em jogo</span><span>{marca.emJogo}</span></p>
            ) : null}
          </div>
          <div className="rp-detalhe-lado">
            {marca.pedeMagia && (
              <div className="rp-campo">
                <span className="rp-k">Magia</span>
                {magias.length ? (
                  <div className="rp-magias" role="listbox" aria-label="Magia da Marca">
                    {magias.map((m) => (
                      <button key={m.slug} type="button" role="option" aria-selected={marcaMagia === m.slug} className="rp-magia"
                        data-sel={marcaMagia === m.slug || undefined} onClick={() => setMarcaMagia(m.slug)}>
                        <span className="rp-magia-nome">{m.nome}</span>
                        <span className="rp-magia-sub">{m.vertente} · Nv {m.nivel}</span>
                      </button>
                    ))}
                  </div>
                ) : <span className="rp-nota">Nenhuma magia aprendida.</span>}
              </div>
            )}
            <div className="rp-acoes">
              <button type="button" className="rp-btn-sec" onClick={() => setPasso("visao")}>Voltar</button>
              <button type="button" className="rp-btn" disabled={marca.pedeMagia && !marcaMagia} onClick={() => setPasso("traco")} data-testid="ruptura-escolher-marca">Escolher</button>
            </div>
          </div>
        </section>
      </div></Moldura>
    );
  }

  // ---------------------------------------------------------------- Traço
  if (passo === "traco") {
    const tipo = TIPOS_TRACO[tipoVisto - 1];
    const corTipo = COR_TIPO_TRACO[tipoVisto - 1];
    return (
      <Moldura><div className={`hx hx-grade rp ${oxanium.variable}`} data-passo="traco" data-testid="console-ruptura">
        {cabecalhoPasso}
        <div className="rp-traco">
          <div className="rp-traco-roda">
            <RodaTracos valor={traco} onEscolher={escolherTraco} rolarDados={rolarNaMesa ? rolarTraco : undefined} />
          </div>
          <div className="rp-traco-card" style={{ ["--rp-cor" as string]: traco ? COR_TIPO_TRACO[traco.tipo - 1] : "#2a4a5c" }}>
            {tracoAtual && traco ? (
              <div key={`${traco.tipo}-${traco.numero}`} className="rp-surge">
                <span className="rp-k" style={{ color: COR_TIPO_TRACO[traco.tipo - 1] }}>{tracoAtual.tipo.nome} · {traco.tipo}–{traco.numero}</span>
                <h3 className="rp-traco-nome">{tracoAtual.nome}</h3>
                <p className="rp-traco-texto">{tracoAtual.texto}</p>
              </div>
            ) : (
              <div>
                <span className="rp-k">Traço</span>
                <h3 className="rp-traco-nome rp-apagado">Gire ou escolha</h3>
              </div>
            )}
          </div>
          <div className="rp-traco-escolha">
            <div className="rp-tipos" role="tablist" aria-label="Tipos de Traço">
              {TIPOS_TRACO.map((t, i) => (
                <button key={t.id} type="button" role="tab" aria-selected={tipoVisto === i + 1} className="rp-tipo" style={{ ["--rp-cor" as string]: COR_TIPO_TRACO[i] }}
                  onClick={() => setTipoVisto(i + 1)}>
                  <span className="rp-tipo-n">{i + 1}</span><span className="rp-tipo-nome">{t.nome}</span>
                  {traco?.tipo === i + 1 && <i className="rp-tipo-marca" aria-label="tipo escolhido" />}
                </button>
              ))}
            </div>
            <div className="rp-traco-lista" role="listbox" aria-label={`Traços ${tipo.nome}`} style={{ ["--rp-cor" as string]: corTipo }}>
              {tipo.tracos.map((t, i) => {
                const sel = traco?.tipo === tipoVisto && traco.numero === i + 1;
                return (
                  <button key={t.nome} type="button" role="option" aria-selected={sel} className="rp-traco-item" data-sel={sel || undefined}
                    onClick={() => escolherTraco({ tipo: tipoVisto, numero: i + 1 })}>
                    <span className="rp-traco-n">{i + 1}</span><span className="rp-traco-item-nome">{t.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {erro && <p className="rp-erro" role="alert">{erro}</p>}
        <div className="rp-acoes rp-acoes-rodape">
          <button type="button" className="rp-btn-sec" onClick={() => setPasso("marca")}>Voltar</button>
          <button type="button" className="rp-btn" disabled={!traco || leitura} onClick={concluir} data-testid="ruptura-concluir">Concluir Ruptura {romano(previa.numero)}</button>
        </div>
      </div></Moldura>
    );
  }

  // ---------------------------------------------------------------- Visão
  const usada = c.sobrecarga_usada_dia ?? 0;
  const limiteFuturo = previa.limiteAntes > api.limiteSobrecarga ? previa.limiteAntes : null;
  const comMarca = historico.filter((h) => h.marcaId);
  const comTraco = historico.filter((h) => h.traco);
  const proximoBloqueado = previa.numero + (pendente ? 1 : 0);
  const bloqueado = (
    <SlotCard estado="bloqueado" numero={romano(proximoBloqueado)} nome="Bloqueado" sub={`−${proximoBloqueado} Integ.`} icone={<Cadeado />}
      titulo={`A Ruptura ${romano(proximoBloqueado)} custará ${proximoBloqueado} de Integridade`} onClick={() => setDetalhe({ tipo: "bloqueado" })} />
  );

  return (
    <Moldura><div className={`hx hx-grade rp ${oxanium.variable}`} data-passo="visao" data-testid="console-ruptura">

      <section className="rp-hero" data-pendente={pendente || undefined}>
        <div className="rp-anel">
          <AnelIntegridade atual={integAtual} max={integMax} perda={pendente ? previa.perda : 0} />
          <div className="rp-anel-centro">
            <span className="rp-k">Integridade</span>
            <span className="rp-integ"><b>{integAtual}</b><small>/{integMax}</small></span>
            {pendente ? (
              <span className="rp-integ-depois"><span><i aria-hidden="true">▸</i> {previa.integridadeDepois}</span><span className="rp-k rp-k-am">após a Ruptura {romano(previa.numero)}</span></span>
            ) : (
              <span className="rp-k rp-integ-faixa" data-faixa={faixaAgora}>{getIntegrityBand(integAtual).texto}</span>
            )}
          </div>
        </div>

        <div className="rp-hero-lado">
          <div className="rp-stats">
            <Stat rotulo="Rupturas" valor={sofridas} sub={sofridas === 1 ? "sofrida" : "sofridas"} />
            <Stat rotulo="Próxima custa" valor={`−${previa.perda}`} tom="am" sub="de Integridade" />
            <Stat rotulo="Sobrecarga" valor={<>{usada}<small>/{api.limiteSobrecarga}</small></>} sub={limiteFuturo ? `limite ${limiteFuturo} após descanso longo` : "limite do dia"} />
            <Stat rotulo="Mana máx." valor={`+${c.mana_bonus_ruptura ?? 0}`} tom="cy" sub={`+${previa.manaBonus} por Ruptura`} />
          </div>
          {pendente ? (
            <div className="rp-cta">
              <button type="button" className="rp-btn rp-btn-grande" onClick={abrirResolucao} disabled={leitura} data-testid="ruptura-resolver">
                Resolver Ruptura {romano(previa.numero)}
              </button>
              {previa.ultimaVontade && (
                <p className="rp-nota" data-alerta>Esta Ruptura leva a Integridade a 0: resolva já. Em seguida vem a Última Vontade.</p>
              )}
            </div>
          ) : concluida ? (
            <p className="rp-status">{concluida}</p>
          ) : null}
        </div>
      </section>

      <section className="rp-colecao" aria-label="Marcas e Traços">
        <div className="rp-trilho">
          <span className="rp-k rp-trilho-titulo">Marcas <b>{comMarca.length}</b></span>
          <div className="rp-slots">
            {comMarca.map((h) => {
              const m = marcaPorId(h.marcaId);
              if (!m) return null;
              return (
                <SlotCard key={h.id} estado="cheio" numero={romano(h.ruptureLevel)} nome={m.nome} sub={FAMILIAS_MARCA[m.familia].nome}
                  cor={COR_FAMILIA[m.familia]} fundo={FUNDO_FAMILIA[m.familia]} icone={<Glifo id={m.id} cor={COR_FAMILIA[m.familia]} tamanho={22} />} titulo={`${m.nome} — ver detalhes`} onClick={() => setDetalhe({ tipo: "marca", id: h.id })} />
              );
            })}
            {pendente && (
              <SlotCard estado="aberto" numero={romano(previa.numero)} nome="Escolher" sub="Slot aberto" cor="#ff8a1f" fundo="#1d1309"
                icone={<span className="rp-card-mais">+</span>} onClick={abrirResolucao} desabilitado={leitura} />
            )}
            {bloqueado}
            {!comMarca.length && !pendente && <span className="rp-slots-vazio">Cada Ruptura deixa uma Marca: uma adaptação permanente do corpo ou das magias.</span>}
          </div>
        </div>
        <div className="rp-trilho">
          <span className="rp-k rp-trilho-titulo">Traços <b>{comTraco.length}</b></span>
          <div className="rp-slots">
            {comTraco.map((h) => {
              const t = h.traco ? tracoPorDados(h.traco.tipo, h.traco.numero) : undefined;
              if (!t || !h.traco) return null;
              return (
                <SlotCard key={h.id} estado="cheio" numero={romano(h.ruptureLevel)} nome={t.nome} sub={t.tipo.nome}
                  cor={COR_TIPO_TRACO[h.traco.tipo - 1]} fundo={FUNDO_TIPO_TRACO[h.traco.tipo - 1]} titulo={`${t.nome} — ver detalhes`} onClick={() => setDetalhe({ tipo: "traco", id: h.id })}
                  icone={<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={COR_TIPO_TRACO[h.traco.tipo - 1]} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONE_TIPO_TRACO[h.traco.tipo - 1]} /></svg>} />
              );
            })}
            {pendente && (
              <SlotCard estado="aberto" numero={romano(previa.numero)} nome="Escolher" sub="Slot aberto" cor="#ff8a1f" fundo="#1d1309"
                icone={<span className="rp-card-mais">+</span>} onClick={abrirResolucao} desabilitado={leitura} />
            )}
            {bloqueado}
            {!comTraco.length && !pendente && <span className="rp-slots-vazio">E um Traço: como o personagem aparece, sente e afeta o lugar.</span>}
          </div>
        </div>
      </section>

      <section className="rp-escada" aria-label="Faixas de Integridade">
        <span className="rp-k rp-trilho-titulo">Faixas de Integridade</span>
        <ol className="rp-escada-faixas">
          {ESCADA.map((f) => {
            const agora = f.label === faixaAgora;
            const depois = pendente && f.label === faixaDepois && faixaDepois !== faixaAgora;
            return (
              <li key={f.label} className="rp-faixa" data-agora={agora || undefined} data-depois={depois || undefined} data-fim={f.label === "fim_da_ficha" || undefined}>
                <span className="rp-faixa-barra" />
                <span className="rp-faixa-nome">{f.nome}</span>
                <span className="rp-faixa-num">{f.faixa}</span>
                {agora && <span className="rp-faixa-tag">Agora</span>}
                {depois && <span className="rp-faixa-tag rp-faixa-tag-depois">Depois</span>}
              </li>
            );
          })}
        </ol>
      </section>
      {detalhe && renderDetalhe()}
    </div></Moldura>
  );

  function renderDetalhe() {
    if (!detalhe) return null;
    const fechar = () => setDetalhe(null);
    if (detalhe.tipo === "bloqueado") {
      const base = pendente ? previa.integridadeDepois : integAtual;
      const depois = Math.max(0, base - proximoBloqueado);
      return (
        <DetalheCard cor="#5a7486" fundo="#0b1822" icone={<Cadeado />} fita={romano(proximoBloqueado)} kicker="Próxima Ruptura" nome={`Ruptura ${romano(proximoBloqueado)}`} onFechar={fechar}>
          <p className="rp-ficha-texto">Acontece quando a Sobrecarga chegar ao limite de novo. Cada Ruptura custa uma Integridade a mais que a anterior.</p>
          <dl className="rp-ficha-dados">
            <div><dt>Integridade</dt><dd>{base} ▸ <b className="rp-am">{depois}</b></dd></div>
            <div><dt>Faixa depois</dt><dd>{getIntegrityBand(depois).texto}</dd></div>
            <div><dt>Mana máx.</dt><dd className="rp-cy">+{previa.manaBonus}</dd></div>
            <div><dt>Ganha</dt><dd>1 Marca · 1 Traço</dd></div>
          </dl>
          {depois === 0 && <p className="rp-ficha-texto rp-perigo">Ela leva a Integridade a 0: viria a Última Vontade.</p>}
        </DetalheCard>
      );
    }
    const h = historico.find((x) => x.id === detalhe.id);
    if (!h) return null;
    const quando = [`Ruptura ${romano(h.ruptureLevel)}`, h.scene ? `cena ${h.scene}` : "", dataCurta(h.resolvidoEm)].filter(Boolean).join(" · ");
    if (detalhe.tipo === "marca") {
      const m = marcaPorId(h.marcaId);
      if (!m) return null;
      const magiaNome = h.marcaMagia ? magias.find((x) => x.slug === h.marcaMagia)?.nome ?? h.marcaMagia.replace(/_/g, " ") : null;
      return (
        <DetalheCard cor={COR_FAMILIA[m.familia]} fundo={FUNDO_FAMILIA[m.familia]} icone={<Glifo id={m.id} cor={COR_FAMILIA[m.familia]} tamanho={34} />}
          fita={romano(h.ruptureLevel)} kicker={["Marca", FAMILIAS_MARCA[m.familia].nome, m.selo].filter(Boolean).join(" · ")} nome={m.nome} onFechar={fechar}>
          <p className="rp-ficha-resumo">{m.resumo}</p>
          <p className="rp-ficha-texto">{m.texto}</p>
          <dl className="rp-ficha-dados">
            {magiaNome && <div><dt>Magia</dt><dd>{magiaNome}</dd></div>}
            <div><dt>Adquirida em</dt><dd>{quando}</dd></div>
          </dl>
        </DetalheCard>
      );
    }
    const t = h.traco ? tracoPorDados(h.traco.tipo, h.traco.numero) : undefined;
    if (!t || !h.traco) return null;
    const cor = COR_TIPO_TRACO[h.traco.tipo - 1];
    return (
      <DetalheCard cor={cor} fundo={FUNDO_TIPO_TRACO[h.traco.tipo - 1]} fita={romano(h.ruptureLevel)} kicker={`Traço ${t.tipo.nome} · ${h.traco.numero}`} nome={t.nome} onFechar={fechar}
        icone={<svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONE_TIPO_TRACO[h.traco.tipo - 1]} /></svg>}>
        <p className="rp-ficha-texto rp-ficha-texto-forte">{t.texto}</p>
        <dl className="rp-ficha-dados">
          <div><dt>Adquirido em</dt><dd>{quando}</dd></div>
        </dl>
      </DetalheCard>
    );
  }
}
