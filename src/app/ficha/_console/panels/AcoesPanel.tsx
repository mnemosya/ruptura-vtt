"use client";

/**
 * Aba AÇÕES do Console: tudo o que o personagem FAZ numa cena de combate,
 * investigação ou Trama. Partiu de `work/mockups/aba-acoes.html`; a
 * composição foi revista depois, pela ordem de USO na mesa:
 * - topo em duas faixas: cenas + busca/visão, e os recursos do turno;
 * - a Postura é estado, não item de lista: par de alternância ao lado
 *   de PA e Reação (abre a mesma gaveta de antes);
 * - "Na mão": um cartão por arma empunhada, que ataca com ela direto;
 * - grupos na ordem em que se usa (Ofensivas primeiro), não na do livro;
 * - fixar tem botão visível (estrela na margem do cartão; o botão
 *   direito continua valendo);
 * - as ações Livres viram uma linha compacta no fim.
 *
 * O modelo de visão (o que mostrar, avisos, recursos) vive em
 * `lib/character/abaAcoes.ts`; aqui só desenho e fluxo:
 * - toda ação abre a gaveta (com teste: "Rolar"; sem teste: "Usar");
 * - NADA TRAVA: o que a ficha contradiz aparece como aviso e a ação segue;
 * - o gasto de PA/Reação acontece ao confirmar, e pode ser desfeito.
 *
 * Movimento e resposta (a regra "nada trava" vale aqui também — tudo o
 * que segue é INDICAÇÃO, nunca condição):
 * - passar o ponteiro (ou o foco) num cartão faz piscar, no recurso do
 *   topo, os losangos que aquela ação gastaria; se não há o bastante, a
 *   célula avisa. É DOM direto, sem estado: não re-renderiza a lista;
 * - o custo de uma ação que passa do que resta fica apagado no cartão;
 * - gastar ou recuperar PA/Reação anima o número e o losango que mudou;
 * - a gaveta sai deslizando quando é dispensada (confirmar fecha na hora).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crosshair, LayoutGrid, List, Lock, Search, Star, Sword, TriangleAlert, X } from "lucide-react";
import catalogoJson from "../../../../../content/v12/db_acoes_v1_2.json";
import {
  buscarAcoes, montarAbaAcoes, type AcaoV12, type AtaqueAtalho, type CustoAcaoV12, type OpcaoAcaoV12, type CatalogoAcoesV12, type CenaAcao, type GrupoAbaAcao, type ItemAbaAcao,
} from "../../../../lib/character/abaAcoes";
import { oxanium } from "../../../_design/oxanium";
import { TextoComRegras } from "../TextoComRegras";
import type { ConsoleApi } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";
import type { PrefillRolagem } from "./PainelRolagem";
import "./hud/hud-base.css";
import "./hud/acoes.css";
import { iconeDaAcao } from "./iconeAcao";

const CATALOGO = catalogoJson as unknown as CatalogoAcoesV12;
const NOME_CENA: Record<CenaAcao, string> = { combate: "Combate", investigacao: "Investigação", trama: "Trama" };
const COR_CENA: Record<CenaAcao, string> = { combate: "#ff8a1f", investigacao: "#c578d9", trama: "#00d4ff" };
// Cor por tipo de ação; grupos sem entrada caem na cor da cena.
const COR_GRUPO: Record<string, string> = {
  movimento: "#4d9fff", ofensiva: "#ff5a4e", defensiva: "#3ddc97", postura: "#ffd23f", diversa: "#a3b1c2", livre: "#7ee8fa",
  investigacao: "#c578d9", comando: "#00d4ff", protocolo_ofensiva: "#6ff0ff", protocolo_trilha: "#2aa8c4",
};
const corDoGrupo = (slug: string, cena: CenaAcao) => COR_GRUPO[slug] ?? COR_CENA[cena];
/** Ordem de uso em combate. Grupo fora do mapa (o da classe) fica depois, na posição relativa que já tinha. */
const ORDEM_USO: Record<string, number> = { ofensiva: 0, movimento: 1, defensiva: 2, diversa: 3 };
/** A arma empunhada com o id da perícia, pra mostrar o bônus no cartão de "Na mão". */
type AtaqueNaMao = AtaqueAtalho & { periciaId: string };
const CHAVE_FIXADAS = "ruptura:acoes:fixadas";
const CHAVE_CENA = "ruptura:acoes:cena";
// Chave nova: as visões mudaram (cartão/lista), e a escolha antiga não significa mais a mesma coisa.
const CHAVE_VISAO = "ruptura:acoes:visao-v2";
type Visao = "cartao" | "lista";

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
function ataquesDaFicha(api: AcoesApi, nomePericia: (id: string) => string): AtaqueNaMao[] {
  const out: AtaqueNaMao[] = [];
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
      periciaId: pericia,
      dano: modo?.dado_dano ?? modelo.danoBase,
    });
  }
  return out;
}

export function AcoesPanel({ api, onRolar, onAtacar, acaoInicial }: {
  api: AcoesApi;
  acaoInicial?: string | null;
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
  const [visao, setVisao] = useState<Visao>("cartao");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<ItemAbaAcao | null>(null);
  const [toast, setToast] = useState<{ id: number; texto: string; desfazer?: () => void } | null>(null);
  const toastN = useRef(0);
  /** Cada aviso ganha um id: é a chave do elemento, pra contagem de 4s recomeçar. */
  const avisar = (t: { texto: string; desfazer?: () => void }) => setToast({ ...t, id: ++toastN.current });
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  /** Depois da entrada, as trocas de cena e de seção usam uma cascata mais curta. */
  const [vivo, setVivo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVivo(true), 900); return () => clearTimeout(t); }, []);

  // Gaveta: dispensar (Esc, X, Cancelar, véu) sai deslizando; confirmar e trocar de cena fecham na hora.
  const [fechando, setFechando] = useState(false);
  const saidaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abertaRef = useRef<ItemAbaAcao | null>(null);
  useEffect(() => { abertaRef.current = aberta; }, [aberta]);
  const cancelarSaida = () => { if (saidaRef.current) { clearTimeout(saidaRef.current); saidaRef.current = null; } };
  useEffect(() => cancelarSaida, []);
  const fecharJa = () => { cancelarSaida(); setFechando(false); setAberta(null); };
  const fecharGaveta = useCallback(() => {
    if (!abertaRef.current || saidaRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setAberta(null); return; }
    setFechando(true);
    saidaRef.current = setTimeout(() => { saidaRef.current = null; setFechando(false); setAberta(null); }, 200);
  }, []);

  // Prévia do custo nos recursos do topo: marca os losangos que a ação gastaria.
  const recPa = useRef<HTMLDivElement | null>(null);
  const recReacao = useRef<HTMLDivElement | null>(null);
  const previa = useCallback((custo: CustoAcaoV12 | null) => {
    const marcar = (el: HTMLDivElement | null, n: number) => {
      if (!el) return;
      const pips = [...el.querySelectorAll<HTMLElement>(".ha-pip")];
      pips.forEach((pip) => pip.removeAttribute("data-previa"));
      el.removeAttribute("data-falta");
      if (!n) return;
      const cheios = pips.filter((pip) => !pip.hasAttribute("data-gasto"));
      cheios.slice(Math.max(0, cheios.length - n)).forEach((pip) => pip.setAttribute("data-previa", ""));
      if (n > cheios.length) el.setAttribute("data-falta", "");
    };
    marcar(recPa.current, custo?.reacao ? 0 : custo?.pa ?? 0);
    marcar(recReacao.current, custo?.reacao ?? 0);
  }, []);
  const abrirGaveta = useCallback((i: ItemAbaAcao) => { cancelarSaida(); setFechando(false); previa(null); setAberta(i); }, [previa]);
  /** Repetições no turno (Deslocar: +1 PA a cada uma). Zera quando o PA volta ao início. */
  const [repeticoes, setRepeticoes] = useState<Record<string, number>>({});
  const paGastos = api.character.estado_jogo?.pa_gastos ?? 0;
  useEffect(() => { if (paGastos === 0) setRepeticoes({}); }, [paGastos]);
  const extraDe = (acao: AcaoV12) => (repeticoes[acao.slug] ?? 0) * (acao.custo.repeticao_incremento ?? 0);

  useEffect(() => {
    setFixadas(lerLocal<string[]>(CHAVE_FIXADAS, []));
    const salva = lerLocal<CenaAcao | null>(CHAVE_CENA, null);
    if (salva) setUltimaCena(salva);
    setVisao(lerLocal<Visao>(CHAVE_VISAO, "cartao") === "lista" ? "lista" : "cartao");
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

  const ataques = useMemo(() => ataquesDaFicha(api, nomePericia), [api, nomePericia]);
  const aba = useMemo(() => montarAbaAcoes(CATALOGO, api.character, {
    paMax: api.derivados.pa_max,
    reacoesPorRodada: api.derivados.reacoes_por_rodada,
    ataques,
    fixadas,
    ultimaCena,
  }), [api, ataques, fixadas, ultimaCena]);
  const comandoTratadoRef = useRef<string | null>(null);
  const [autoExecutarComando, setAutoExecutarComando] = useState<string | null>(null);
  useEffect(() => {
    if (!acaoInicial || comandoTratadoRef.current === acaoInicial) return;
    const item = aba.grupos.flatMap((g) => g.itens).find((i) => i.chave === acaoInicial);
    if (item) {
      comandoTratadoRef.current = acaoInicial;
      setCenaEscolhida(item.acao.cena);
      setAutoExecutarComando(!item.acao.opcoes?.length && !item.acao.teste && !item.acao.alvo && !item.acao.custo.pa_preparado && typeof item.acao.custo.pa === "number" ? item.chave : null);
      setAberta(item);
    }
  }, [acaoInicial, aba]);

  // Sessão ativa → Trama; senão a última cena usada. A escolha da pessoa vence enquanto a aba estiver aberta.
  const cena = cenaEscolhida ?? aba.cenaSugerida;
  const escolherCena = (c: CenaAcao) => { setCenaEscolhida(c); gravarLocal(CHAVE_CENA, c); fecharJa(); };
  // Cena nova começa do topo: a rolagem da anterior não significa nada nela.
  useEffect(() => { listaRef.current?.scrollTo({ top: 0 }); }, [cena]);
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
      if (e.key === "Escape") fecharGaveta();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fecharGaveta]);

  /** Gasta o custo e devolve como desfazer. Nada é bloqueado: sem PA, age assim mesmo. O desfazer devolve só o que saiu de fato. */
  function gastar(acao: AcaoV12, pa: number) {
    const saiu = pa ? api.ajustarPa(pa) : 0;
    return () => { if (saiu) api.ajustarPa(-saiu); };
  }

  function confirmar(item: ItemAbaAcao, escolha: { pa: number; pericia: string | null; opcao: string | null }) {
    const { acao } = item;
    setAutoExecutarComando(null);
    fecharJa();
    if (acao.estado === "postura") {
      const ativa = item.ativa;
      const outra = acao.slug === "postura_ofensiva" ? "postura_defensiva" : "postura_ofensiva";
      for (const c of api.character.condicoes_ativas ?? []) {
        if (c.ativa && (c.conditionId === outra || (ativa && c.conditionId === acao.slug))) api.removerCondicao(c.id);
      }
      if (!ativa) api.adicionarCondicao({ conditionId: acao.slug, nome: acao.nome, descricao: acao.funcao, origem: "Aba Ações", duracao: "até encerrar ou trocar" });
      const desfazer = gastar(acao, 1);
      avisar({ texto: `${acao.nome} ${ativa ? "encerrada" : "ativada"} · −1 PA`, desfazer });
      return;
    }
    if (acao.slug === "atacar") {
      // O ataque tem fluxo próprio (alvo no mapa, arma, dano): a arma empunhada que casa com a forma escolhida.
      if (escolha.opcao === "secundario") {
        const segunda = aba.ataques[1];
        if (segunda) onAtacar(segunda.instanceId);
        else avisar({ texto: "Ataque secundário pede uma segunda arma leve empunhada" });
        return;
      }
      const forma = escolha.opcao === "corpo_a_corpo" ? "Corpo a corpo" : escolha.opcao === "distancia" ? "À distância" : null;
      const arma = aba.ataques.find((a) => !forma || a.forma === forma);
      if (arma) { onAtacar(arma.instanceId); return; }
      if (escolha.opcao === "corpo_a_corpo") { onRolar({ tipo: "acao", periciaId: "luta", acao: "Atacar · desarmado", custoPa: escolha.pa }); return; }
      avisar({ texto: "Nenhuma arma à distância empunhada" });
      return;
    }
    if (acao.custo.pa_preparado) {
      // Preparar Turno: 1 Reação + o PA das ações preparadas, gastos na declaração.
      api.ajustarReacoes(1);
      const saiu = escolha.pa ? api.ajustarPa(escolha.pa) : 0;
      avisar({ texto: `${acao.nome} · −1 Reação · −${escolha.pa} PA`, desfazer: () => { api.ajustarReacoes(-1); if (saiu) api.ajustarPa(-saiu); } });
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
    avisar({ texto: `${acao.nome} · ${escolha.pa ? `−${escolha.pa} PA` : "usado"}`, desfazer });
  }

  const resultados = busca.trim() ? buscarAcoes(aba, busca) : null;
  const daCena = aba.grupos.filter((g) => g.cena === cena);
  // Postura e Livres saem da lista: a primeira vai pros recursos, as outras viram linha no fim.
  const posturas = [...(daCena.find((g) => g.slug === "postura")?.itens ?? [])].sort((a) => (a.acao.slug === "postura_ofensiva" ? -1 : 1));
  const livres = daCena.find((g) => g.slug === "livre")?.itens ?? [];
  const gruposDaCena = daCena
    .filter((g) => g.slug !== "postura" && g.slug !== "livre")
    .map((g, n) => ({ g, peso: ORDEM_USO[g.slug] ?? 50 + n }))
    .sort((a, b) => a.peso - b.peso)
    .map((x) => x.g);
  /** A ação Atacar: dá o custo dos cartões de "Na mão". */
  const atacar = cena === "combate" ? daCena.flatMap((g) => g.itens).find((i) => i.acao.slug === "atacar") : undefined;
  const avisoCena = aba.avisoDaCena[cena];
  const r = aba.recursos;
  /** O custo mínimo passa do que resta? Só apaga o número no cartão — a ação segue disponível. */
  const falta = (i: ItemAbaAcao) => i.acao.custo.reacao ? i.acao.custo.reacao > r.reacoes.restantes : typeof i.acao.custo.pa === "number" && i.acao.custo.pa > r.pa.restantes;
  const cartao = (i: ItemAbaAcao, semIcone?: boolean) => <Cartao key={i.chave} item={i} semIcone={semIcone} falta={falta(i)} onPrevia={previa} onAbrir={() => abrirGaveta(i)} onFixar={leitura ? undefined : () => alternarFixada(i.chave)} />;

  return (
    <section className="rc-eq-outer" aria-label="Ações">
      <div className="rc-eq-card-outer rc-inv-moldura">
        <CabecalhoModulo id="ID://AÇÕES" mod="MOD.ACTIONS // 11" />
        <div className={`rc-inv hx hx-grade ha ${oxanium.variable}`} data-testid="console-acoes" data-vivo={vivo || undefined} style={{ ["--ha-k" as string]: COR_CENA[cena] }}>
          {/* Mesmo fundo de Magias: abismo + grade + varredura. */}
          <div className="hx-scan" style={{ position: "absolute", inset: 0, opacity: .6, pointerEvents: "none" }} aria-hidden="true" />
          <div className="ha-topo">
            <div className="ha-cenas" role="tablist" aria-label="Cena">
              {(["combate", "investigacao", "trama"] as CenaAcao[]).map((c) => (
                <button key={c} type="button" role="tab" aria-selected={c === cena} className="ha-cena" style={{ ["--ha-k" as string]: COR_CENA[c] }} onClick={() => escolherCena(c)}>
                  {NOME_CENA[c]}
                  {c === aba.cenaSugerida && c !== "combate" && <span className="ha-ao-vivo">ao vivo</span>}
                </button>
              ))}
            </div>
            <div className="ha-ferr">
              <label className="ha-busca">
                <Search size={14} aria-hidden="true" />
                <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ação nas três cenas…" aria-label="Buscar ação" />
                {busca ? <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")}><X size={13} /></button> : <span className="ha-tecla" aria-hidden="true">/</span>}
              </label>
              <div className="ha-visao" role="group" aria-label="Visualização">
                {([["cartao", LayoutGrid, "Cartões"], ["lista", List, "Lista"]] as const).map(([v, Ic, rotulo]) => (
                  <button key={v} type="button" aria-pressed={visao === v} aria-label={rotulo} title={rotulo} onClick={() => { setVisao(v); gravarLocal(CHAVE_VISAO, v); }}><Ic size={15} /></button>
                ))}
              </div>
            </div>
          </div>

          <div className="ha-recursos">
            <Recurso rotulo="PA" atual={r.pa.restantes} max={r.pa.max} forma="losango" refEl={recPa} />
            {cena === "combate" && <Recurso rotulo="Reação" atual={r.reacoes.restantes} max={r.reacoes.total} forma="losango" refEl={recReacao} />}
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
            {posturas.length > 0 && <Posturas itens={posturas} onAbrir={abrirGaveta} onPrevia={previa} />}
          </div>

          <div className="ha-lista hx-semsb" data-visao={visao} ref={listaRef}>
            {/* A chave troca com a cena: o conteúdo remonta e entra em cascata de novo. */}
            <div className="ha-cena-corpo" key={resultados ? "busca" : cena}>
            {resultados ? (
              resultados.length ? (
                (["combate", "investigacao", "trama"] as CenaAcao[]).map((c) => {
                  const itens = resultados.filter((i) => i.acao.cena === c);
                  return itens.length ? <Secao key={c} titulo={NOME_CENA[c]} nota={c === cena ? "cena atual" : "outra cena"} qtd={itens.length} cor={COR_CENA[c]}>
                    <div className="ha-grade">{itens.map((i) => cartao(i))}</div>
                  </Secao> : null;
                })
              ) : <p className="ha-vazio">Nenhuma ação com “{busca}”.</p>
            ) : <>
              {atacar && ataques.length > 0 && (
                <Secao titulo="Na mão" nota="armas empunhadas" cor={COR_CENA.combate} aberta={!fechados.has("na-mao")} onAlternar={() => alternar("na-mao")}>
                  <div className="ha-grade">
                    {ataques.map((a) => <CartaoArma key={a.instanceId ?? a.nome} ataque={a} bonus={api.character.pericias?.[a.periciaId] ?? 0} acao={atacar} falta={falta(atacar)} leitura={leitura} onPrevia={previa} onAtacar={() => { previa(null); onAtacar(a.instanceId); }} />)}
                  </div>
                </Secao>
              )}
              {/* Atalhos da cena aberta: com a estrela visível em todo cartão, fixar tem que dar resultado nas três cenas. */}
              {aba.fixadas.some((i) => i.acao.cena === cena) && (
                <Secao titulo="Atalhos" nota="fixadas por você" cor={COR_CENA[cena]} aberta={!fechados.has(`atalhos:${cena}`)} onAlternar={() => alternar(`atalhos:${cena}`)}>
                  <div className="ha-grade">
                    {aba.fixadas.filter((i) => i.acao.cena === cena).map((i) => cartao(i, true))}
                  </div>
                </Secao>
              )}
              {avisoCena && (
                <div className="ha-aviso-cena">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <p><b>Pela ficha, {avisoCena.charAt(0).toLowerCase() + avisoCena.slice(1)}.</b> Para entrar numa Sessão é preciso um Deck Sináptico ou a Vertente Sináptica. Se a ficha estiver desatualizada, as ações funcionam mesmo assim.</p>
                </div>
              )}
              {gruposDaCena.map((g) => <Grupo key={`${g.cena}:${g.slug}`} grupo={g} aberto={!fechados.has(`${g.cena}:${g.slug}`)} onAlternar={() => alternar(`${g.cena}:${g.slug}`)} cartao={cartao} />)}
              {livres.length > 0 && (
                <div className="ha-livres" style={{ ["--ha-k" as string]: COR_GRUPO.livre }}>
                  <span className="ha-livres-rot">Livres</span>
                  {livres.map((i) => {
                    const Ic = iconeDaAcao(i.acao.slug, false);
                    return <button key={i.chave} type="button" className="ha-livre" title={i.acao.funcao} onClick={() => abrirGaveta(i)}><Ic size={13} strokeWidth={1.7} aria-hidden="true" />{i.acao.nome}</button>;
                  })}
                </div>
              )}
            </>}
            </div>
          </div>

          {aberta && <Gaveta item={aberta} api={api} leitura={leitura} nomePericia={nomePericia} paRestantes={r.pa.restantes} paMax={r.pa.max} extraPa={extraDe(aberta.acao)} autoExecutar={autoExecutarComando === aberta.chave} saindo={fechando} onFechar={() => { setAutoExecutarComando(null); fecharGaveta(); }} onConfirmar={(e) => confirmar(aberta, e)} />}
          {toast && (
            <div className="ha-toast" role="status" key={toast.id}>
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

const SUAVE = "cubic-bezier(.16,1,.3,1)";

function Recurso({ rotulo, atual, max, forma, refEl }: { rotulo: string; atual: number; max: number; forma: "losango"; refEl?: React.MutableRefObject<HTMLDivElement | null> }) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const anterior = useRef(atual);
  // Gastar/recuperar: o número troca com um passo e o losango que mudou estala.
  // Web Animations, pra não depender de re-render nem remontar nada.
  useEffect(() => {
    const de = anterior.current;
    anterior.current = atual;
    const el = raiz.current;
    if (de === atual || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gastou = atual < de;
    el.querySelector(".ha-rec-num")?.animate([{ opacity: .2, transform: `translateY(${gastou ? -8 : 8}px)` }, { opacity: 1, transform: "none" }], { duration: 340, easing: SUAVE });
    const pips = el.querySelectorAll(".ha-pip");
    for (let i = Math.min(de, atual); i < Math.max(de, atual); i++) {
      pips[i]?.animate(gastou
        ? [{ transform: "rotate(45deg) scale(2)", opacity: .9 }, { transform: "rotate(45deg) scale(1)", opacity: 1 }]
        : [{ transform: "rotate(45deg) scale(.2)", opacity: 0 }, { transform: "rotate(45deg) scale(1)", opacity: 1 }], { duration: 420, easing: SUAVE });
    }
  }, [atual]);
  return (
    <div className="ha-rec" ref={(n) => { raiz.current = n; if (refEl) refEl.current = n; }} aria-label={`${rotulo}: ${atual} de ${max}`}>
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
  /** Depois que a pessoa recolhe/abre, os cartões voltam rápido, sem a espera da cascata de entrada. */
  const [alternada, setAlternada] = useState(false);
  return (
    <section className="ha-secao" data-alternada={alternada || undefined} style={{ ["--ha-k" as string]: cor }}>
      <button type="button" className="ha-sec" aria-expanded={aberta} onClick={onAlternar ? () => { setAlternada(true); onAlternar(); } : undefined} disabled={!onAlternar}>
        <span className="ha-sec-lo" aria-hidden="true" />
        <h3>{titulo}</h3>
        {nota && <span className="ha-sec-nota">{nota}</span>}
        <i aria-hidden="true" />
        {qtd != null && <small>{qtd}</small>}
        {onAlternar && <ChevronDown size={13} className="ha-sec-seta" aria-hidden="true" />}
      </button>
      {aberta && children}
    </section>
  );
}

function Grupo({ grupo, aberto, onAlternar, cartao }: { grupo: GrupoAbaAcao; aberto: boolean; onAlternar: () => void; cartao: (i: ItemAbaAcao) => React.ReactNode }) {
  return (
    <Secao titulo={grupo.nome} nota={grupo.nota} qtd={grupo.itens.length} cor={corDoGrupo(grupo.slug, grupo.cena)} aberta={aberto} onAlternar={onAlternar}>
      <div className="ha-grade">
        {grupo.itens.map((i) => cartao(i))}
      </div>
    </Secao>
  );
}

function Custo({ valor, unidade, ram, falta }: { valor: string; unidade: string; ram?: number | null; falta?: boolean }) {
  return (
    <span className="ha-custo" data-falta={falta || undefined}>
      <span>
        {/* Custo em losangos: aparece na visão em lista, no lugar do número. "1–2" = um cheio e um vazado. */}
        {unidade === "PA" && /^\d/.test(valor) && (() => { const [min, max] = valor.split("–").map(Number); return <span className="ha-custo-pips" aria-hidden="true">{Array.from({ length: max || min }, (_, n) => <i key={n} data-vazio={n >= min || undefined} />)}</span>; })()}
        <b>{valor}</b><small>{unidade}</small>
      </span>
      {ram != null && <span><b className="ha-ram">{ram}</b><small>RAM</small></span>}
    </span>
  );
}

function Cartao({ item, onAbrir, onFixar, semIcone, falta, onPrevia }: { item: ItemAbaAcao; onAbrir: () => void; onFixar?: () => void; semIcone?: boolean; falta?: boolean; onPrevia?: (custo: CustoAcaoV12 | null) => void }) {
  const Ic = iconeDaAcao(item.acao.slug, !!item.acao.classe);
  const avisos = item.avisos.filter((a) => a.alcance === "acao");
  return (
    <div className="ha-card-wrap" style={{ ["--ha-k" as string]: corDoGrupo(item.acao.grupo, item.acao.cena) }}>
      <button type="button" className="ha-card" data-ativa={item.ativa || undefined} data-com-icone={!semIcone || undefined} onClick={onAbrir}
        onMouseEnter={onPrevia ? () => onPrevia(item.acao.custo) : undefined} onMouseLeave={onPrevia ? () => onPrevia(null) : undefined}
        onFocus={onPrevia ? () => onPrevia(item.acao.custo) : undefined} onBlur={onPrevia ? () => onPrevia(null) : undefined}
        onContextMenu={onFixar ? (e) => { e.preventDefault(); onFixar(); } : undefined}>
        <span className="ha-ic" aria-hidden="true"><Ic size={17} strokeWidth={1.6} /></span>
        <span className="ha-txt">
          <span className="ha-nome">
            {item.acao.nome}
            {item.ativa && <span className="ha-etq">Ativa</span>}
            {avisos.length > 0 && <span className="ha-aviso" data-dica={avisos.map((a) => a.texto).join(" · ")} aria-label={`Aviso: ${avisos.map((a) => a.texto).join(". ")}`}>!</span>}
          </span>
          <span className="ha-sub">{item.acao.funcao}</span>
        </span>
        <Custo valor={item.custoValor} unidade={item.custoUnidade} ram={item.ram} falta={falta} />
      </button>
      {onFixar && (
        <button type="button" className="ha-fixar" aria-pressed={item.fixada} onClick={onFixar}
          aria-label={item.fixada ? `Tirar ${item.acao.nome} dos atalhos` : `Fixar ${item.acao.nome} nos atalhos`} title={item.fixada ? "Tirar dos atalhos" : "Fixar nos atalhos"}>
          <Star size={13} fill={item.fixada ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Arma empunhada: ataca com ela direto (o mesmo caminho que a gaveta de Atacar toma depois de escolher a forma). */
function CartaoArma({ ataque, bonus, acao, falta, leitura, onPrevia, onAtacar }: {
  ataque: AtaqueNaMao; bonus: number; acao: ItemAbaAcao; falta: boolean; leitura: boolean;
  onPrevia: (custo: CustoAcaoV12 | null) => void; onAtacar: () => void;
}) {
  const Ic = ataque.forma === "À distância" ? Crosshair : Sword;
  return (
    <div className="ha-card-wrap" style={{ ["--ha-k" as string]: COR_CENA.combate }}>
      <button type="button" className="ha-card ha-arma" data-com-icone disabled={leitura} onClick={onAtacar} aria-label={`Atacar com ${ataque.nome}`}
        onMouseEnter={() => onPrevia(acao.acao.custo)} onMouseLeave={() => onPrevia(null)} onFocus={() => onPrevia(acao.acao.custo)} onBlur={() => onPrevia(null)}>
        <span className="ha-ic" aria-hidden="true"><Ic size={17} strokeWidth={1.6} /></span>
        <span className="ha-txt">
          <span className="ha-nome">{ataque.nome}</span>
          <span className="ha-linha">
            <span>{ataque.forma}</span>
            {ataque.pericia && <span>{ataque.pericia} <em>{bonus >= 0 ? "+" : ""}{bonus}</em></span>}
            {ataque.dano && <span>Dano <em>{ataque.dano}</em></span>}
          </span>
        </span>
        <Custo valor={acao.custoValor} unidade={acao.custoUnidade} falta={falta} />
      </button>
    </div>
  );
}

/** Postura: estado do turno, ao lado de PA e Reação. O clique abre a gaveta da postura, como o cartão fazia. */
function Posturas({ itens, onAbrir, onPrevia }: { itens: ItemAbaAcao[]; onAbrir: (i: ItemAbaAcao) => void; onPrevia: (custo: CustoAcaoV12 | null) => void }) {
  return (
    <div className="ha-postura" role="group" aria-label="Postura">
      <span className="ha-rec-rot">Postura</span>
      <span className="ha-postura-ops">
        {itens.map((i) => {
          const Ic = iconeDaAcao(i.acao.slug, false);
          const nome = i.acao.nome.replace(/^Postura\s+/i, "");
          return (
            <button key={i.chave} type="button" className="ha-postura-op" aria-pressed={i.ativa} title={i.acao.funcao} onClick={() => onAbrir(i)}
              onMouseEnter={() => onPrevia(i.acao.custo)} onMouseLeave={() => onPrevia(null)} onFocus={() => onPrevia(i.acao.custo)} onBlur={() => onPrevia(null)}>
              <Ic size={14} strokeWidth={1.7} aria-hidden="true" />{nome.charAt(0).toUpperCase() + nome.slice(1)}
            </button>
          );
        })}
      </span>
    </div>
  );
}

function periciasDaAcao(acao: AcaoV12, opcao: OpcaoAcaoV12 | null, todas: string[]): string[] {
  const p = opcao?.teste?.pericias ?? acao.teste?.pericias;
  if (p === "qualquer") return todas;
  return p ?? [];
}

function Gaveta({ item, api, leitura, nomePericia, paRestantes, paMax, extraPa, autoExecutar, saindo, onFechar, onConfirmar }: {
  item: ItemAbaAcao;
  api: AcoesApi;
  leitura: boolean;
  nomePericia: (id: string) => string;
  paRestantes: number;
  paMax: number;
  /** PA a mais por repetição no turno (Deslocar). */
  extraPa: number;
  autoExecutar: boolean;
  /** Dispensada: toca a saída antes de desmontar. */
  saindo?: boolean;
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
  const executadoRef = useRef(false);
  useEffect(() => {
    if (!autoExecutar || leitura || executadoRef.current) return;
    executadoRef.current = true;
    onConfirmar({ pa: ehPostura ? 1 : custoPa, pericia: null, opcao: null });
  }, [autoExecutar, leitura, custoPa, ehPostura, onConfirmar]);

  return (
    <>
      <div className="ha-veu" data-saindo={saindo || undefined} onClick={onFechar} aria-hidden="true" />
      <aside className="ha-gaveta" data-saindo={saindo || undefined} style={{ ["--ha-k" as string]: k }} role="dialog" aria-label={`Executar ${acao.nome}`}>
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

