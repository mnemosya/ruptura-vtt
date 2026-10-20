"use client";

/**
 * Aba AÇÕES do Console: tudo o que o personagem FAZ numa cena de combate,
 * investigação ou Trama, no layout aprovado em `work/mockups/aba-acoes.html`.
 *
 * O modelo de visão (o que mostrar, avisos, recursos) vive em
 * `lib/character/abaAcoes.ts`; aqui só desenho e fluxo:
 * - toda ação abre a gaveta (com teste: "Rolar"; sem teste: "Usar");
 * - NADA TRAVA: o que a ficha contradiz aparece como aviso e a ação segue;
 * - o gasto de PA/Reação acontece ao confirmar, e pode ser desfeito.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Archive, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, AudioWaveform, Ban, Bot, Bug, ChevronsRight, CircleSlash, Copy,
  Crosshair, Dices, LayoutGrid, List, Download, Eraser, Eye, EyeOff, FileX, Fingerprint, Flame, Footprints, GitBranch, Grab, Hammer, Hand,
  HandHelping, IdCard, KeyRound, Link, Lock, LockOpen, Mountain, MoveRight, Network, Package, Plug, Power, Radar, RefreshCcw,
  Route, ScanEye, ScanSearch, Search, Settings, Shield, ShieldHalf, Shuffle, Star, Sword, Swords, Target, Timer, TriangleAlert,
  Unlink, Unplug, Wind, X, Zap, type LucideProps,
} from "lucide-react";
import catalogoJson from "../../../../../content/v12/db_acoes_v1_2.json";
import {
  buscarAcoes, montarAbaAcoes, type AcaoV12, type AtaqueAtalho, type OpcaoAcaoV12, type CatalogoAcoesV12, type CenaAcao, type GrupoAbaAcao, type ItemAbaAcao,
} from "../../../../lib/character/abaAcoes";
import { oxanium } from "../../../_design/oxanium";
import { TextoComRegras } from "../TextoComRegras";
import type { ConsoleApi } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";
import type { PrefillRolagem } from "./PainelRolagem";
import "./hud/hud-base.css";
import "./hud/acoes.css";

const CATALOGO = catalogoJson as unknown as CatalogoAcoesV12;
const NOME_CENA: Record<CenaAcao, string> = { combate: "Combate", investigacao: "Investigação", trama: "Trama" };
const COR_CENA: Record<CenaAcao, string> = { combate: "#ff8a1f", investigacao: "#c578d9", trama: "#00d4ff" };
// Cor por tipo de ação; grupos sem entrada caem na cor da cena.
const COR_GRUPO: Record<string, string> = {
  movimento: "#4d9fff", ofensiva: "#ff5a4e", defensiva: "#3ddc97", postura: "#ffd23f", diversa: "#a3b1c2", livre: "#7ee8fa",
  investigacao: "#c578d9", comando: "#00d4ff", protocolo_ofensiva: "#6ff0ff", protocolo_trilha: "#2aa8c4",
};
const corDoGrupo = (slug: string, cena: CenaAcao) => COR_GRUPO[slug] ?? COR_CENA[cena];
const CHAVE_FIXADAS = "ruptura:acoes:fixadas";
const CHAVE_CENA = "ruptura:acoes:cena";
const CHAVE_VISAO = "ruptura:acoes:visao";
type Visao = "lista" | "grade";

type Icone = ComponentType<LucideProps>;
const ICONES: Record<string, Icone> = {
  deslocar: Footprints, levantar: ArrowUpFromLine, escapar: Unlink, esconder_se: EyeOff, interagir: Hand, sacar_guardar_trocar: ArrowLeftRight,
  recarregar: RefreshCcw, atacar: Sword, agarrar: Grab, estrangular: CircleSlash, derrubar: ArrowDownToLine, empurrar: MoveRight, desarmar: Ban,
  fintar: Shuffle, aparar: Swords, bloquear: Shield, esquivar: Wind, resistir: Mountain, mirar: Crosshair, acessar_trama: Network,
  preparar_turno: Timer, usar_pericia: Dices, postura_defensiva: ShieldHalf, postura_ofensiva: Flame, falar: Hand, gestos_rapidos: Hand,
  investigar: Search, vasculhar: ScanSearch, preservar: Archive, correlacionar: Link, acessar: KeyRound, arrombar: Hammer, auxiliar: HandHelping,
  utilizar_recurso: Package, conectar: Plug, avancar: ChevronsRight, sondar: Radar, examinar: ScanEye, monitorar: Eye, forcar_rota: Route,
  criar_ruido: AudioWaveform, desligar: Power, desplugar: Unplug, despistar: Shuffle, ofuscar: EyeOff, expor_nucleo: Target, pulso_sinaptico: Zap,
  controlar_sistema: Settings, controlar_unidade: Bot, quebrar_bloqueio: LockOpen, travar_acesso: Lock, extrair_dados: Download,
  corromper_dados: FileX, instalar_virus: Bug, forjar_credencial: IdCard, modificar_assinatura: Fingerprint, apagar_rastros: Eraser,
};
const iconeDe = (acao: AcaoV12): Icone => ICONES[acao.slug] ?? (acao.classe ? GitBranch : Copy);

type AcoesApi = Pick<ConsoleApi, "character" | "derivados" | "catalogo" | "glossario" | "regras" | "somenteLeitura" | "ajustarPa" | "ajustarReacoes" | "adicionarCondicao" | "removerCondicao">;

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = window.localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, valor: unknown) {
  try { window.localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento, segue sem lembrar */ }
}

/** Armas empunhadas → atalhos de Atacar. Perícia vem do modelo; sem ela, pelo subtipo. */
function ataquesDaFicha(api: AcoesApi, nomePericia: (id: string) => string): AtaqueAtalho[] {
  const out: AtaqueAtalho[] = [];
  for (const inst of api.character.inventario ?? []) {
    if (inst.estado !== "empunhado") continue;
    const modelo = api.catalogo.get(inst.itemSlug);
    if (!modelo || modelo.categoria !== "arma") continue;
    const modo = modelo.modosAtaque?.[0];
    const subtipo = (modelo.subtipo ?? "").toLowerCase();
    const corpo = subtipo.includes("corpo") || subtipo.includes("branca");
    const pericia = modo?.pericia_teste ?? modelo.periciaAtaque ?? (corpo ? "luta" : subtipo.includes("fogo") ? "balistica" : "precisao");
    out.push({
      instanceId: inst.id,
      nome: inst.itemNome || modelo.nome,
      forma: corpo ? "Corpo a corpo" : "À distância",
      pericia: nomePericia(pericia),
      dano: modo?.dado_dano ?? modelo.danoBase,
    });
  }
  return out;
}

export function AcoesPanel({ api, onRolar, onAtacar }: {
  api: AcoesApi;
  /** Abre o painel de rolagem com a ação como intenção. */
  onRolar: (prefill: PrefillRolagem) => void;
  /** Fluxo de ataque do Console (alvo no mapa na mesa, janela da arma fora dela). `null` = desarmado. */
  onAtacar: (instanceId: string | null) => void;
}) {
  const leitura = !!api.somenteLeitura;
  const [fixadas, setFixadas] = useState<string[]>([]);
  /** Escolha feita nesta abertura; vence a sugestão até a aba ser desmontada. */
  const [cenaEscolhida, setCenaEscolhida] = useState<CenaAcao | null>(null);
  /** Última cena usada (navegador): só vale quando nada indica a cena ao vivo. */
  const [ultimaCena, setUltimaCena] = useState<CenaAcao | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<Visao>("lista");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<ItemAbaAcao | null>(null);
  const [toast, setToast] = useState<{ texto: string; desfazer?: () => void } | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  /** Repetições no turno (Deslocar: +1 PA a cada uma). Zera quando o PA volta ao início. */
  const [repeticoes, setRepeticoes] = useState<Record<string, number>>({});
  const paGastos = api.character.estado_jogo?.pa_gastos ?? 0;
  useEffect(() => { if (paGastos === 0) setRepeticoes({}); }, [paGastos]);
  const extraDe = (acao: AcaoV12) => (repeticoes[acao.slug] ?? 0) * (acao.custo.repeticao_incremento ?? 0);

  useEffect(() => {
    setFixadas(lerLocal<string[]>(CHAVE_FIXADAS, []));
    const salva = lerLocal<CenaAcao | null>(CHAVE_CENA, null);
    if (salva) setUltimaCena(salva);
    setVisao(lerLocal<Visao>(CHAVE_VISAO, "lista"));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const nomePericia = useMemo(() => {
    const mapa = new Map((api.regras?.pericias ?? []).map((p) => [p.id, p.nome]));
    return (id: string) => mapa.get(id) ?? id;
  }, [api.regras]);

  const aba = useMemo(() => montarAbaAcoes(CATALOGO, api.character, {
    paMax: api.derivados.pa_max,
    reacoesPorRodada: api.derivados.reacoes_por_rodada,
    ataques: ataquesDaFicha(api, nomePericia),
    fixadas,
    ultimaCena,
  }), [api, fixadas, nomePericia, ultimaCena]);

  // Sessão ativa → Trama; senão a última cena usada. A escolha da pessoa vence enquanto a aba estiver aberta.
  const cena = cenaEscolhida ?? aba.cenaSugerida;
  const escolherCena = (c: CenaAcao) => { setCenaEscolhida(c); gravarLocal(CHAVE_CENA, c); setAberta(null); };
  const alternarFixada = (chave: string) => setFixadas((f) => {
    const nova = f.includes(chave) ? f.filter((x) => x !== chave) : [...f, chave];
    gravarLocal(CHAVE_FIXADAS, nova);
    return nova;
  });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "/" && !digitando) { e.preventDefault(); buscaRef.current?.focus(); }
      if (e.key === "Escape") setAberta(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  /** Gasta o custo e devolve como desfazer. Nada é bloqueado: sem PA, gasta assim mesmo. */
  function gastar(acao: AcaoV12, pa: number) {
    if (pa) api.ajustarPa(pa);
    return () => { if (pa) api.ajustarPa(-pa); };
  }

  function confirmar(item: ItemAbaAcao, escolha: { pa: number; pericia: string | null; opcao: string | null }) {
    const { acao } = item;
    setAberta(null);
    if (acao.estado === "postura") {
      const ativa = item.ativa;
      const outra = acao.slug === "postura_ofensiva" ? "postura_defensiva" : "postura_ofensiva";
      for (const c of api.character.condicoes_ativas ?? []) {
        if (c.ativa && (c.conditionId === outra || (ativa && c.conditionId === acao.slug))) api.removerCondicao(c.id);
      }
      if (!ativa) api.adicionarCondicao({ conditionId: acao.slug, nome: acao.nome, descricao: acao.funcao, origem: "Aba Ações", duracao: "até encerrar ou trocar" });
      const desfazer = gastar(acao, 1);
      setToast({ texto: `${acao.nome} ${ativa ? "encerrada" : "ativada"} · −1 PA`, desfazer });
      return;
    }
    if (acao.slug === "atacar") {
      // O ataque tem fluxo próprio (alvo no mapa, arma, dano): a arma empunhada que casa com a forma escolhida.
      if (escolha.opcao === "secundario") {
        const segunda = aba.ataques[1];
        if (segunda) onAtacar(segunda.instanceId);
        else setToast({ texto: "Ataque secundário pede uma segunda arma leve empunhada" });
        return;
      }
      const forma = escolha.opcao === "corpo_a_corpo" ? "Corpo a corpo" : escolha.opcao === "distancia" ? "À distância" : null;
      const arma = aba.ataques.find((a) => !forma || a.forma === forma);
      if (arma) { onAtacar(arma.instanceId); return; }
      if (escolha.opcao === "corpo_a_corpo") { onRolar({ tipo: "acao", periciaId: "luta", acao: "Atacar · desarmado", custoPa: escolha.pa }); return; }
      setToast({ texto: "Nenhuma arma à distância empunhada" });
      return;
    }
    if (acao.custo.pa_preparado) {
      // Preparar Turno: 1 Reação + o PA das ações preparadas, gastos na declaração.
      api.ajustarReacoes(1);
      if (escolha.pa) api.ajustarPa(escolha.pa);
      setToast({ texto: `${acao.nome} · −1 Reação · −${escolha.pa} PA`, desfazer: () => { api.ajustarReacoes(-1); if (escolha.pa) api.ajustarPa(-escolha.pa); } });
      return;
    }
    if (acao.tipo === "reacao" && escolha.pericia) {
      // Defesas gastam a Reação no próprio painel de rolagem (prepararDefesa).
      onRolar({ tipo: "defesa", periciaId: escolha.pericia, acao: acao.nome });
      return;
    }
    const repete = !!acao.custo.repeticao_incremento;
    if (repete) setRepeticoes((m) => ({ ...m, [acao.slug]: (m[acao.slug] ?? 0) + 1 }));
    const nomeOpcao = acao.opcoes?.find((o) => o.slug === escolha.opcao)?.nome;
    if (escolha.pericia) {
      // O PA sai na rolagem: fechar o painel sem rolar não cobra nada.
      onRolar({ tipo: "acao", periciaId: escolha.pericia, acao: nomeOpcao && repete ? `${acao.nome} · ${nomeOpcao}` : acao.nome, custoPa: escolha.pa });
      return;
    }
    const gasto = gastar(acao, escolha.pa);
    const desfazer = () => { gasto(); if (repete) setRepeticoes((m) => ({ ...m, [acao.slug]: Math.max(0, (m[acao.slug] ?? 0) - 1) })); };
    setToast({ texto: `${acao.nome} · ${escolha.pa ? `−${escolha.pa} PA` : "usado"}`, desfazer });
  }

  const resultados = busca.trim() ? buscarAcoes(aba, busca) : null;
  const gruposDaCena = aba.grupos.filter((g) => g.cena === cena);
  const avisoCena = aba.avisoDaCena[cena];
  const r = aba.recursos;

  return (
    <section className="rc-eq-outer" aria-label="Ações">
      <div className="rc-eq-card-outer rc-inv-moldura">
        <CabecalhoModulo id="ID://AÇÕES" mod="MOD.ACTIONS // 11" />
        <div className={`rc-inv hx hx-grade ha ${oxanium.variable}`} data-testid="console-acoes" style={{ ["--ha-k" as string]: COR_CENA[cena] }}>
          {/* Mesmo fundo de Magias: abismo + grade + varredura. */}
          <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} aria-hidden="true" />
          <div className="ha-cenas" role="tablist" aria-label="Cena">
            {(["combate", "investigacao", "trama"] as CenaAcao[]).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={c === cena} className="ha-cena" style={{ ["--ha-k" as string]: COR_CENA[c] }} onClick={() => escolherCena(c)}>
                {NOME_CENA[c]}
                {c === aba.cenaSugerida && c !== "combate" && <span className="ha-ao-vivo">ao vivo</span>}
              </button>
            ))}
          </div>

          <div className="ha-recursos">
            <Recurso rotulo="PA" atual={r.pa.restantes} max={r.pa.max} forma="losango" />
            {cena === "combate" && <Recurso rotulo="Reação" atual={r.reacoes.restantes} max={r.reacoes.total} forma="losango" />}
            {cena === "trama" && r.trama && <>
              <Barra rotulo="RAM" atual={r.trama.ram} max={r.trama.ramMax} cor="#00d4ff" />
              <Barra rotulo="Detecção" atual={r.trama.deteccao} max={r.trama.limite ?? 10} cor={r.trama.limite && r.trama.deteccao >= r.trama.limite - 2 ? "#ff5f74" : "#ff8a1f"} />
              <div className="ha-rec" aria-label={`Rastro: ${r.trama.rastro}`}><b className="ha-rec-num ha-rec-num--cena">{r.trama.rastro}</b><span className="ha-rec-lado"><span className="ha-rec-rot">Rastro</span></span></div>
            </>}
            {cena === "trama" && !r.trama && (
              <div className="ha-rec ha-rec--off">
                <Lock size={18} aria-hidden="true" />
                <span className="ha-rec-lado"><span className="ha-rec-rot">Sessão</span><b className="ha-estado">{avisoCena ? "sem acesso" : "desconectada"}</b></span>
              </div>
            )}
          </div>

          <div className="ha-ferr">
            <label className="ha-busca">
              <Search size={14} aria-hidden="true" />
              <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ação nas três cenas…" aria-label="Buscar ação" />
              {busca ? <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")}><X size={13} /></button> : <span className="ha-tecla" aria-hidden="true">/</span>}
            </label>
            <div className="ha-visao" role="group" aria-label="Visualização">
              {([["lista", List, "Lista"], ["grade", LayoutGrid, "Grade"]] as const).map(([v, Ic, rotulo]) => (
                <button key={v} type="button" aria-pressed={visao === v} aria-label={rotulo} title={rotulo} onClick={() => { setVisao(v); gravarLocal(CHAVE_VISAO, v); }}><Ic size={15} /></button>
              ))}
            </div>
          </div>

          <div className="ha-lista hx-semsb" data-visao={visao}>
            {resultados ? (
              resultados.length ? (
                (["combate", "investigacao", "trama"] as CenaAcao[]).map((c) => {
                  const itens = resultados.filter((i) => i.acao.cena === c);
                  return itens.length ? <Secao key={c} titulo={NOME_CENA[c]} nota={c === cena ? "cena atual" : "outra cena"} qtd={itens.length} cor={COR_CENA[c]}>
                    <div className="ha-grade">{itens.map((i) => <Cartao key={i.chave} item={i} onAbrir={() => setAberta(i)} onFixar={leitura ? undefined : () => alternarFixada(i.chave)} />)}</div>
                  </Secao> : null;
                })
              ) : <p className="ha-vazio">Nenhuma ação com “{busca}”.</p>
            ) : <>
              {cena === "combate" && aba.fixadas.some((i) => i.acao.cena === "combate") && (
                <Secao titulo="Atalhos" nota="fixadas por você" cor={COR_CENA.combate} aberta={!fechados.has("atalhos")} onAlternar={() => alternar("atalhos")}>
                  <div className="ha-grade">
                    {aba.fixadas.filter((i) => i.acao.cena === "combate").map((i) => <Cartao key={i.chave} item={i} semIcone onAbrir={() => setAberta(i)} onFixar={leitura ? undefined : () => alternarFixada(i.chave)} />)}
                  </div>
                </Secao>
              )}
              {avisoCena && (
                <div className="ha-aviso-cena">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <p><b>Pela ficha, {avisoCena.charAt(0).toLowerCase() + avisoCena.slice(1)}.</b> Para entrar numa Sessão é preciso um Deck Sináptico ou a Vertente Sináptica. Se a ficha estiver desatualizada, as ações funcionam mesmo assim.</p>
                </div>
              )}
              {gruposDaCena.map((g) => <Grupo key={`${g.cena}:${g.slug}`} grupo={g} aberto={!fechados.has(`${g.cena}:${g.slug}`)} onAlternar={() => alternar(`${g.cena}:${g.slug}`)} onAbrir={setAberta} onFixar={leitura ? undefined : alternarFixada} />)}
            </>}
          </div>

          {aberta && <Gaveta item={aberta} api={api} leitura={leitura} nomePericia={nomePericia} paRestantes={r.pa.restantes} paMax={r.pa.max} extraPa={extraDe(aberta.acao)} onFechar={() => setAberta(null)} onConfirmar={(e) => confirmar(aberta, e)} />}
          {toast && (
            <div className="ha-toast" role="status">
              <span>{toast.texto}</span>
              {toast.desfazer && <button type="button" onClick={() => { toast.desfazer?.(); setToast(null); }}>Desfazer</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  function alternar(id: string) {
    setFechados((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
}

// ---------------------------------------------------------------------------

function Recurso({ rotulo, atual, max, forma }: { rotulo: string; atual: number; max: number; forma: "losango" }) {
  return (
    <div className="ha-rec" aria-label={`${rotulo}: ${atual} de ${max}`}>
      <Contagem atual={atual} max={max} />
      <span className="ha-rec-lado">
        <span className="ha-rec-rot">{rotulo}</span>
        <span className="ha-pips">{Array.from({ length: max }, (_, i) => <i key={i} className={`ha-pip ha-pip--${forma}`} data-gasto={i >= atual || undefined} />)}</span>
      </span>
    </div>
  );
}

function Barra({ rotulo, atual, max, cor }: { rotulo: string; atual: number; max: number; cor: string }) {
  return (
    <div className="ha-rec" style={{ ["--ha-k" as string]: cor }} aria-label={`${rotulo}: ${atual} de ${max}`}>
      <Contagem atual={atual} max={max} />
      <span className="ha-rec-lado">
        <span className="ha-rec-rot">{rotulo}</span>
        <span className="ha-barra"><i style={{ width: `${Math.min(100, (atual / Math.max(1, max)) * 100)}%` }} /></span>
      </span>
    </div>
  );
}

function Contagem({ atual, max }: { atual: number; max: number }) {
  return <b className="ha-rec-num" data-zerado={atual <= 0 || undefined} aria-hidden="true">{atual}<small>/{max}</small></b>;
}

function Secao({ titulo, nota, qtd, cor, aberta = true, onAlternar, children }: { titulo: string; nota?: string; qtd?: number; cor: string; aberta?: boolean; onAlternar?: () => void; children: React.ReactNode }) {
  return (
    <section className="ha-secao" style={{ ["--ha-k" as string]: cor }}>
      <button type="button" className="ha-sec" aria-expanded={aberta} onClick={onAlternar} disabled={!onAlternar}>
        <span className="ha-sec-lo" aria-hidden="true" />
        <h3>{titulo}</h3>
        {nota && <span className="ha-sec-nota">{nota}</span>}
        <i aria-hidden="true" />
        {qtd != null && <small>{qtd}</small>}
      </button>
      {aberta && children}
    </section>
  );
}

function Grupo({ grupo, aberto, onAlternar, onAbrir, onFixar }: { grupo: GrupoAbaAcao; aberto: boolean; onAlternar: () => void; onAbrir: (i: ItemAbaAcao) => void; onFixar?: (chave: string) => void }) {
  return (
    <Secao titulo={grupo.nome} nota={grupo.nota} qtd={grupo.itens.length} cor={corDoGrupo(grupo.slug, grupo.cena)} aberta={aberto} onAlternar={onAlternar}>
      <div className="ha-grade">
        {grupo.itens.map((i) => <Cartao key={i.chave} item={i} onAbrir={() => onAbrir(i)} onFixar={onFixar ? () => onFixar(i.chave) : undefined} />)}
      </div>
    </Secao>
  );
}

function Custo({ valor, unidade, ram }: { valor: string; unidade: string; ram?: number | null }) {
  return (
    <span className="ha-custo">
      <span><b>{valor}</b><small>{unidade}</small></span>
      {ram != null && <span><b className="ha-ram">{ram}</b><small>RAM</small></span>}
    </span>
  );
}

function Cartao({ item, onAbrir, onFixar, semIcone }: { item: ItemAbaAcao; onAbrir: () => void; onFixar?: () => void; semIcone?: boolean }) {
  const Ic = iconeDe(item.acao);
  const avisos = item.avisos.filter((a) => a.alcance === "acao");
  return (
    <div className="ha-card-wrap" style={{ ["--ha-k" as string]: corDoGrupo(item.acao.grupo, item.acao.cena) }}>
      <button type="button" className="ha-card" data-ativa={item.ativa || undefined} data-com-icone={!semIcone || undefined} onClick={onAbrir}
        onContextMenu={onFixar ? (e) => { e.preventDefault(); onFixar(); } : undefined}>
        <span className="ha-ic" aria-hidden="true"><Ic size={17} strokeWidth={1.6} /></span>
        <span className="ha-txt">
          <span className="ha-nome">
            {item.acao.nome}
            {item.fixada && <Star size={11} className="ha-estrela" aria-label="Fixada" fill="currentColor" />}
            {item.ativa && <span className="ha-etq">Ativa</span>}
            {avisos.length > 0 && <span className="ha-aviso" data-dica={avisos.map((a) => a.texto).join(" · ")} aria-label={`Aviso: ${avisos.map((a) => a.texto).join(". ")}`}>!</span>}
          </span>
          <span className="ha-sub">{item.acao.funcao}</span>
        </span>
        <Custo valor={item.custoValor} unidade={item.custoUnidade} ram={item.ram} />
      </button>
    </div>
  );
}

function periciasDaAcao(acao: AcaoV12, opcao: OpcaoAcaoV12 | null, todas: string[]): string[] {
  const p = opcao?.teste?.pericias ?? acao.teste?.pericias;
  if (p === "qualquer") return todas;
  return p ?? [];
}

function Gaveta({ item, api, leitura, nomePericia, paRestantes, paMax, extraPa, onFechar, onConfirmar }: {
  item: ItemAbaAcao;
  api: AcoesApi;
  leitura: boolean;
  nomePericia: (id: string) => string;
  paRestantes: number;
  paMax: number;
  /** PA a mais por repetição no turno (Deslocar). */
  extraPa: number;
  onFechar: () => void;
  onConfirmar: (e: { pa: number; pericia: string | null; opcao: string | null }) => void;
}) {
  const { acao } = item;
  const [opcaoSlug, setOpcaoSlug] = useState<string | null>(acao.opcoes?.[0]?.slug ?? null);
  const opcao = acao.opcoes?.find((o) => o.slug === opcaoSlug) ?? null;
  const todasPericias = (api.regras?.pericias ?? []).map((p) => p.id);
  const pericias = periciasDaAcao(acao, opcao, todasPericias);
  const [pericia, setPericia] = useState<string | null>(pericias[0] ?? null);
  useEffect(() => { setPericia((p) => (p && pericias.includes(p) ? p : pericias[0] ?? null)); }, [opcaoSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorPericia = (id: string) => api.character.pericias?.[id] ?? 0;
  const preparar = !!acao.custo.pa_preparado;
  const [paPreparado, setPaPreparado] = useState(Math.max(1, Math.min(2, paRestantes)));
  const custoPa = preparar ? paPreparado : (opcao?.custo.pa ?? acao.custo.pa ?? 0) + extraPa;
  const avisos = item.avisos.map((a) => a.texto);
  const temTeste = pericias.length > 0;
  const k = COR_CENA[acao.cena];
  const ehPostura = acao.estado === "postura";
  const verbo = ehPostura ? (item.ativa ? "Encerrar" : "Ativar") : temTeste ? "Rolar" : "Usar";

  return (
    <>
      <div className="ha-veu" onClick={onFechar} aria-hidden="true" />
      <aside className="ha-gaveta" style={{ ["--ha-k" as string]: k }} role="dialog" aria-label={`Executar ${acao.nome}`}>
        <header className="ha-g-cab">
          <div className="ha-g-topo"><span>{NOME_CENA[acao.cena]} · executar</span><button type="button" onClick={onFechar} aria-label="Fechar"><X size={15} /></button></div>
          <h2>{acao.nome}</h2>
          <p>{acao.funcao}</p>
          <div className="ha-g-custos">
            <span>{item.custoValor} {item.custoUnidade}</span>
            {acao.custo.ram != null && acao.cena === "trama" && <span className="ha-vio">{acao.custo.ram} RAM</span>}
            {acao.tipo === "comando" && <span className="ha-vio">+1 Rastro</span>}
            {acao.tipo === "protocolo" && <span className="ha-vio">sem Rastro</span>}
            {acao.teste?.contra && <span>vs {acao.teste.contra}</span>}
          </div>
        </header>
        <div className="ha-g-corpo hx-semsb">
          {avisos.length > 0 && (
            <div className="ha-g-aviso"><b>Ficha:</b>{avisos.join(". ")}.</div>
          )}
          {acao.opcoes && (
            <Campo rotulo="Forma">
              <div className="ha-ops">
                {acao.opcoes.map((o) => (
                  <button key={o.slug} type="button" className="ha-op" aria-pressed={o.slug === opcaoSlug} onClick={() => setOpcaoSlug(o.slug)} title={o.funcao}>
                    <b>{o.nome}</b>{o.custo.pa != null && o.custo.pa !== acao.custo.pa || acao.custo.pa_max ? <span>{o.custo.pa} PA</span> : null}
                  </button>
                ))}
              </div>
              {opcao && <p className="ha-op-funcao">{opcao.funcao}</p>}
            </Campo>
          )}
          {preparar && (
            <Campo rotulo="PA preparados" dica="custo total das ações">
              <div className="ha-ops">
                {Array.from({ length: Math.max(1, paMax) }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className="ha-op" aria-pressed={n === paPreparado} onClick={() => setPaPreparado(n)}><b>{n} PA</b></button>
                ))}
              </div>
            </Campo>
          )}
          {temTeste && (
            <Campo rotulo="Perícia" dica={pericias.length > 1 ? "sugerida · pode trocar" : undefined}>
              <div className="ha-ops">
                {pericias.slice(0, acao.teste?.pericias === "qualquer" ? 24 : 6).map((p) => (
                  <button key={p} type="button" className="ha-op" aria-pressed={p === pericia} onClick={() => setPericia(p)}>
                    <b>{nomePericia(p)}</b><span>{valorPericia(p) >= 0 ? "+" : ""}{valorPericia(p)}</span>
                  </button>
                ))}
              </div>
            </Campo>
          )}
          <div className="ha-previa">
            {custoPa > 0 && <div><span>Gasta</span><span>{custoPa} PA{extraPa ? ` (+${extraPa} repetição)` : ""} · {paRestantes - custoPa >= 0 ? `sobra ${paRestantes - custoPa}` : `faltam ${custoPa - paRestantes}`}</span></div>}
            {acao.custo.reacao && <div><span>Gasta</span><span>1 Reação</span></div>}
            {acao.cena === "trama" && <div className="ha-risco"><span>Se falhar</span><span>padrão +1 Detecção · crítica +3</span></div>}
            {acao.duracao && <div><span>Duração</span><span>{acao.duracao}</span></div>}
            {acao.alvo && <div><span>Alvo</span><span>{acao.alvo}</span></div>}
          </div>
          <details className="ha-regra">
            <summary>Ver regra completa</summary>
            <TextoComRegras texto={opcao?.descricao ? `${acao.descricao}\n\n${opcao.descricao}` : acao.descricao} glossario={api.glossario} />
          </details>
        </div>
        <footer className="ha-g-pe">
          <button type="button" className="ha-btn ha-btn--sec" onClick={onFechar}>Cancelar</button>
          <button type="button" className="ha-btn" disabled={leitura} onClick={() => onConfirmar({ pa: ehPostura ? 1 : custoPa, pericia: temTeste ? pericia : null, opcao: opcaoSlug })}>
            {verbo} {acao.nome}{opcao && acao.slug !== "sacar_guardar_trocar" && acao.slug !== "recarregar" ? ` · ${opcao.nome}` : ""}
          </button>
        </footer>
      </aside>
    </>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="ha-campo">
      <div className="ha-rot"><span>{rotulo}</span>{dica && <span>{dica}</span>}</div>
      {children}
    </div>
  );
}

