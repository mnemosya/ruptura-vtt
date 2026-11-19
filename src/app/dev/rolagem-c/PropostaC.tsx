"use client";

/**
 * PROPOSTA C — MESA.
 *
 * Os dois dados são protagonistas na mesa: o Normal é matéria (aço sem
 * cor), o Sobrecarga é luz (cristal ciano que acende com a força). A
 * troca é oferecida onde todos olham — num rótulo junto do dado
 * assentado e, na janela, lado a lado — e, quando acontece, a mesa
 * reencena os dois dados por um instante: o Sobrecarga toma o lugar do
 * Normal diante de todos.
 *
 * Cor: "luz, não âmbar". O Sobrecarga é ciano-luz (#6ff0ff, emissivo —
 * a luz do conduto, a cor da marca); o Normal é aço neutro. O âmbar
 * fica onde já está (faixas limitadas e rampa da carga), sem recolorir
 * nada. A colisão migra para o ciano (cromo e Sucesso Padrão): o que
 * separa o Sobrecarga é luz (brilho, ciano claro) e a marca `Sparkle`.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Sparkle, Undo2 } from "lucide-react";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import { Prototipo } from "../rolagem/_base/Prototipo";
import { estiloTremor } from "../rolagem/_base/Janela";
import { useMesa, type MesaApi } from "../rolagem/_base/MesaDupla";
import {
  resolucao, trocada, useProto, useRolagemDaJanela, usado, type Proposta, type Rolagem,
} from "../rolagem/_base/estado";
import {
  CartaoTeste, Ficha, LinhaVeredito, PALETA_ATUAL, Pilula, corDaLeitura, margemTexto, pilulasDe, rotuloDaLeitura,
} from "../rolagem/_base/pecas";
import { ordinal, ordinalF, type Alvo, type Conduto, type CustoTroca, type Resolucao, type TrocaAplicada } from "../rolagem/_base/regra";
import type { Projecao } from "../rolagem/_base/ArenaDupla";

const ACO = "#cfd8df";
const LUZ = "#6ff0ff";
const PALETA = PALETA_ATUAL;

const idN = (r: Rolagem) => `${r.id}-normal`;
const idS = (r: Rolagem) => `${r.id}-sobrecarga`;

type Tom = "luz" | "ruptura" | "perigo";

/* ── textos de preço (fatos do cap. 18, nada além) ─────────────────── */

/** Legenda da barra antes da troca. */
function legendaCusto(c: CustoTroca): { texto: string; tom: Tom } {
  if (c.faixa === "abaixo") return { texto: `Trocar: +1 Sobrecarga · fica ${c.sobrecargaDepois} de ${c.limite}`, tom: "luz" };
  if (c.faixa === "alcanca") {
    return {
      texto: `Trocar: alcança o limite · ${ordinalF(c.ruptura)} Ruptura · Integridade −${c.perdaIntegridade}${c.ultimaVontade ? " · Última Vontade" : ""}`,
      tom: c.ultimaVontade ? "perigo" : "ruptura",
    };
  }
  return {
    texto: `Trocar: ${ordinal(c.excedente)} excedente · ${c.d4}d4 de Integridade${c.ultimaVontade === "certa" ? " · Última Vontade" : c.ultimaVontade === "pode" ? ` · zera com ${c.perdaQueZera}+` : ""}`,
    tom: "perigo",
  };
}

/** Preço curto, para o rótulo da mesa. */
function precoCurto(c: CustoTroca): { texto: string; tom: Tom } {
  if (c.faixa === "abaixo") return { texto: "+1 Sobrecarga", tom: "luz" };
  if (c.faixa === "alcanca") return c.ultimaVontade ? { texto: "Última Vontade", tom: "perigo" } : { texto: `Ruptura · Integridade −${c.perdaIntegridade}`, tom: "ruptura" };
  return c.ultimaVontade === "certa" ? { texto: "Última Vontade", tom: "perigo" } : { texto: `${c.d4}d4 de Integridade`, tom: "perigo" };
}

/** O que foi pago — a mesma frase na janela e no cartão. */
function consequencia(t: TrocaAplicada): { texto: string; tom: Tom } {
  const c = t.custo;
  if (c.faixa === "abaixo") return { texto: `${t.depois.sobrecarga} de ${c.limite}`, tom: "luz" };
  const fim = t.ultimaVontade ? " · Última Vontade" : "";
  if (c.faixa === "alcanca") return { texto: `${ordinalF(c.ruptura)} Ruptura · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`, tom: t.ultimaVontade ? "perigo" : "ruptura" };
  return { texto: `${c.d4}d4 (${t.d4.join(" + ")}) · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`, tom: "perigo" };
}

function leituraCurta(res: Resolucao | null): string {
  if (!res) return "";
  return `${res.total} · ${rotuloDaLeitura(res)}${res.margem != null ? ` ${margemTexto(res.margem)}` : ""}`;
}

/* ── janela: as duas colunas ────────────────────────────────────────── */

type Natureza = "normal" | "sobrecarga";

function Coluna({
  natureza, rotulo, res, valor, pronta, emVoo, vale, apagada, carga, tremendo, indice, acao, onAcao, ariaLabel, testId, rodape = false,
}: {
  natureza: Natureza;
  rotulo: string;
  res: Resolucao | null;
  valor: number | null;
  pronta: boolean;
  emVoo: boolean;
  vale: boolean;
  apagada: boolean;
  carga: number;
  tremendo: boolean;
  indice: number;
  acao?: "trocar" | "voltar";
  onAcao?: () => void;
  ariaLabel?: string;
  testId?: string;
  /** Reserva o rodapé (as duas colunas do magista, sempre — a janela não pula). */
  rodape?: boolean;
}) {
  const luz = natureza === "sobrecarga";
  const acento = luz ? LUZ : ACO;
  const soft = luz ? "rgba(111,240,255,.16)" : "rgba(207,216,223,.12)";
  const cor = pronta && res ? corDaLeitura(res, PALETA).hex : acento;
  // A luz do Sobrecarga reage à força: mesma cor, mais brilho. A leitura
  // da força continua no botão.
  const iconeEstilo: CSSProperties = {
    display: "block",
    ...(tremendo ? estiloTremor(carga, indice) : null),
    ...(luz && !emVoo ? { filter: `drop-shadow(0 0 ${(4 + carga * 14).toFixed(1)}px rgba(111,240,255,${(0.3 + carga * 0.6).toFixed(2)}))` } : null),
  };
  const conteudo = (
    <span className="rp-c-col-in">
      {/* Cabeça: nome da peça à esquerda; à direita, o estado da coluna —
          a que vale, ou a ação (trocar/voltar). Reservado desde o primeiro
          quadro nas duas colunas do magista: nada pula. */}
      <span className="rp-c-col-cab">
        <span className="rp-c-col-nome">
          {luz && <Sparkle size={11} strokeWidth={2.2} aria-hidden="true" />}
          <span className="rp-c-col-rot">{rotulo}</span>
        </span>
        {rodape && (
          <span className="rp-c-col-pe" data-acao={acao}>
            {acao === "trocar" && "Trocar"}
            {acao === "voltar" && <><Undo2 size={10} strokeWidth={2.4} aria-hidden="true" /> Voltar</>}
            {!acao && vale && "Vale"}
          </span>
        )}
      </span>
      {pronta && res ? (
        <span className="rp-c-col-corpo rp-entra" key="pronta">
          <PolyDie sides={10} value={valor ?? undefined} active={vale || acao === "trocar"} accent={acento} soft={soft} size={30} />
          <b className="rp-c-col-total" style={{ color: cor }}>{res.total}</b>
        </span>
      ) : (
        <span className="rp-c-col-corpo" key="espera">
          <span className={emVoo ? "rv-dados-rolando" : undefined} style={iconeEstilo}>
            <PolyDie sides={10} semValor active={!emVoo} accent={acento} soft={soft} size={36} />
          </span>
        </span>
      )}
      <span className="rp-c-col-faixa" style={pronta && res ? { color: cor } : undefined}>
        {pronta && res
          ? <>{rotuloDaLeitura(res)}{res.margem != null && <i>{margemTexto(res.margem)}</i>}</>
          : "d10"}
      </span>
    </span>
  );
  const comuns = {
    "data-natureza": natureza,
    "data-vale": vale || undefined,
    "data-apagada": apagada || undefined,
    "data-pronta": pronta || undefined,
    "data-acao": acao,
    "data-rodape": rodape || undefined,
    style: { ["--c-cor" as string]: cor, ["--c-acento" as string]: acento } as CSSProperties,
  };
  return acao ? (
    <button type="button" className="rp-c-col rp-acao" {...comuns} onClick={onAcao} aria-label={ariaLabel} data-testid={testId}>
      {conteudo}
    </button>
  ) : (
    <div className="rp-c-col" {...comuns} role="group" aria-label={ariaLabel ?? rotulo}>{conteudo}</div>
  );
}

/** A rolagem da janela, se ainda corresponde ao "magista ou não" de agora. */
function useRolagemC(): Rolagem | null {
  const s = useProto();
  const r = useRolagemDaJanela();
  if (!r) return null;
  // Rolando: vale o que foi congelado. Depois de assentar, se a bancada
  // mudou "magista", a janela volta ao estado de espera do novo arranjo.
  if (r.fase !== "completa") return r;
  return r.teste.magista === s.magista ? r : null;
}

function PoolC() {
  const s = useProto();
  const r = useRolagemC();
  const magista = r ? r.teste.magista : s.magista;
  const emVoo = !!r && r.fase === "rolando";
  const tremendo = s.carga > 0 && !s.rolando;
  const resN = r ? resolucao(r, "normal") : null;
  const resS = r ? resolucao(r, "sobrecarga") : null;
  const nPronta = !!r && r.normal != null;
  const sPronta = !!r && r.sobrecarga != null;
  const tr = !!r && trocada(r);
  const u = r ? usado(r) : "normal";

  if (!magista) {
    return (
      <div className="rp-c-pool is-unica" aria-label="Dado Normal">
        <Coluna natureza="normal" rotulo="Dado Normal" res={resN} valor={r?.normal ?? null} pronta={nPronta}
          emVoo={emVoo && !nPronta} vale={nPronta} apagada={false} carga={s.carga} tremendo={tremendo} indice={0} />
      </div>
    );
  }

  const podeTrocar = s.papel === "rola" && !!r && r.fase === "completa" && sPronta && !tr;
  const podeVoltar = s.papel === "rola" && !!r && tr;
  const preco = legendaCusto(s.custo);
  return (
    <div className="rp-c-pool" aria-label="Dado Normal e Dado de Sobrecarga">
      <Coluna natureza="normal" rotulo="Normal" res={resN} valor={r?.normal ?? null} pronta={nPronta}
        emVoo={emVoo && !nPronta} vale={nPronta && u === "normal"} apagada={nPronta && u !== "normal"}
        carga={s.carga} tremendo={tremendo} indice={0} rodape
        acao={podeVoltar ? "voltar" : undefined}
        onAcao={podeVoltar && r ? () => s.desfazer(r.id) : undefined}
        ariaLabel={podeVoltar && resN ? `Desfazer a troca: voltar ao Dado Normal, ${resN.total}, ${rotuloDaLeitura(resN)}` : "Dado Normal"} />
      <Coluna natureza="sobrecarga" rotulo="Sobrecarga" res={resS} valor={r?.sobrecarga ?? null} pronta={sPronta}
        emVoo={!!r && r.fase !== "completa" && !sPronta} vale={sPronta && u === "sobrecarga"}
        apagada={sPronta && u !== "sobrecarga"}
        carga={s.carga} tremendo={tremendo} indice={1} rodape
        acao={podeTrocar ? "trocar" : undefined}
        onAcao={podeTrocar && r ? () => void s.trocar(r.id) : undefined}
        ariaLabel={podeTrocar && resS ? `Trocar pelo Dado de Sobrecarga: ${resS.total}, ${rotuloDaLeitura(resS)}. ${preco.texto.replace(/^Trocar: /, "Custo: ")}` : "Dado de Sobrecarga"}
        testId={podeTrocar ? "trocar" : undefined} />
    </div>
  );
}

/* ── janela: conta + barra do conduto ───────────────────────────────── */

function alvoConta(alvo: Alvo): string {
  return alvo.tipo === "cd" ? `· cd ${alvo.cd}` : alvo.tipo === "contestado" ? `· oponente ${alvo.oponente}` : "· sem cd";
}

/**
 * Barra do conduto: uma célula por ponto de Sobrecarga até o limite
 * (a do limite é a da Ruptura) e, além dele, os excedentes com o preço
 * de cada um (1d4, 2d4, 3d4…). A célula que a troca preencheria pulsa.
 */
function Barra({ conduto, previa, paga }: { conduto: Conduto; previa: CustoTroca | null; paga: TrocaAplicada | null }) {
  const L = conduto.limite;
  const excedentes = Math.max(3, conduto.sobrecarga - L + 1);
  const celulas = Array.from({ length: L + excedentes }, (_, i) => i + 1);
  return (
    <div className="rp-c-barra" role="img"
      aria-label={`Sobrecarga ${conduto.sobrecarga} de ${L}. A Ruptura vem ao alcançar ${L}; cada ponto além custa Integridade.`}>
      {celulas.map((n) => {
        const tipo = n < L ? "base" : n === L ? "ruptura" : "excedente";
        const cheia = n <= conduto.sobrecarga;
        const ePrevia = !!previa && n === conduto.sobrecarga + 1;
        const ePaga = !!paga && n === paga.depois.sobrecarga && conduto.sobrecarga >= n;
        return (
          <span key={n} className="rp-c-cel" data-tipo={tipo} data-cheia={cheia || undefined}
            data-previa={ePrevia || undefined} data-paga={ePaga || undefined}>
            {tipo === "ruptura" ? "Ruptura" : tipo === "excedente" ? `${n - L}d4` : ""}
          </span>
        );
      })}
      <span className="rp-c-barra-num">{conduto.sobrecarga}<small>/{L}</small></span>
    </div>
  );
}

function ResultadoC() {
  const s = useProto();
  const r = useRolagemC();
  const magista = r ? r.teste.magista : s.magista;
  // Sem rolagem, a conta mostra o que vai entrar (a seleção da janela).
  const atributo = r ? r.teste.atributo : (() => { const a = s.personagem.atributos.find((x) => x.id === s.teste.atributoId) ?? s.personagem.atributos[0]; return { nome: a.nome, valor: a.valor }; })();
  const pericia = r ? r.teste.pericia : (() => { const p = s.personagem.pericias.find((x) => x.id === s.teste.periciaId); return p ? { nome: p.nome, valor: p.valor } : null; })();
  const mod = r ? r.teste.modificador : s.teste.modificador;
  const alvo: Alvo = r ? r.teste.alvo : s.teste.alvoTipo === "contestado"
    ? { tipo: "contestado", oponente: Number(s.teste.oponente) || 0, iniciou: s.teste.iniciou }
    : s.teste.cd.trim() ? { tipo: "cd", cd: Number(s.teste.cd) } : { tipo: "livre" };
  const res = r ? resolucao(r) : null;
  const tr = !!r && trocada(r);
  const cor = res ? corDaLeitura(res, PALETA).hex : undefined;
  const dado = res?.dado;

  const legenda = r?.troca ? consequencia(r.troca) : legendaCusto(s.custo);
  return (
    <div className="rp-c-res">
      <p className="rp-c-conta" data-testid="resultado-conta">
        <span>d10 {dado != null && <b style={{ color: cor }}>{dado}</b>}</span>
        <span>+ {atributo.nome.toLowerCase()} <b style={{ color: cor }}>+{atributo.valor}</b></span>
        {pericia ? <span>+ {pericia.nome.toLowerCase()} <b style={{ color: cor }}>+{pericia.valor}</b></span> : <span>· sem perícia</span>}
        {mod !== 0 && <span>+ mod <b style={{ color: cor }}>{mod > 0 ? `+${mod}` : `−${Math.abs(mod)}`}</b></span>}
        <span>{alvoConta(alvo)}</span>
        {tr && <span className="rp-c-conta-luz"><Sparkle size={10} strokeWidth={2.4} aria-hidden="true" /> d10 de Sobrecarga</span>}
      </p>
      {magista && (
        <>
          <Barra conduto={s.conduto} previa={tr ? null : s.custo} paga={r?.troca ?? null} />
          <div className="rp-c-legenda" data-tom={legenda.tom} data-usada={r?.troca ? "true" : undefined}>
            <span data-testid={r?.troca ? "consequencia" : "preco"}>
              {r?.troca && <b>Sobrecarga usada · </b>}{legenda.texto}
            </span>
            {r && tr && s.papel === "rola" && (
              <button type="button" className="jf-quieto rp-acao rp-c-desfazer" onClick={() => s.desfazer(r.id)} data-testid="desfazer">
                <Undo2 size={13} strokeWidth={2} aria-hidden="true" /> Desfazer
              </button>
            )}
          </div>
        </>
      )}
      {r?.substituicaoNaAcao && magista && <p className="rp-c-acao">Esta ação já teve uma substituição</p>}
    </div>
  );
}

/* ── chat ───────────────────────────────────────────────────────────── */

function CartaoC({ r }: { r: Rolagem }) {
  const s = useProto();
  const res = resolucao(r);
  const tr = trocada(r);
  const antes = tr ? resolucao(r, "normal") : null;
  const cor = corDaLeitura(res, PALETA).hex;
  const u = usado(r);
  const cons = r.troca ? consequencia(r.troca) : null;
  return (
    <CartaoTeste r={r} paleta={PALETA} atributos={{ "data-trocado": tr ? "true" : "false" }}>
      <LinhaVeredito res={res} paleta={PALETA} r={r}
        antes={antes && (
          <span className="rp-c-traco" data-testid="cartao-antes">
            <span>Sobrecarga {r.sobrecarga} no lugar do Normal {r.normal}</span>
            <s>antes {leituraCurta(antes)}</s>
          </span>
        )} />
      <div className="rp-c-fichas">
        <Ficha valor={r.normal} aceso={u === "normal"} cor={cor} riscada={tr} rotulo={`Dado Normal ${r.normal}`} />
        {r.teste.magista && (
          <Ficha valor={r.sobrecarga} aceso={u === "sobrecarga"} cor={cor} rotulo={`Dado de Sobrecarga ${r.sobrecarga}`}
            marca={<Sparkle size={10} strokeWidth={2.4} color={LUZ} aria-hidden="true" />} />
        )}
        {pilulasDe(r).map((p) => <Pilula key={p}>{p}</Pilula>)}
      </div>
      {cons && (
        <div className="rp-c-cartao-sobre" data-tom={cons.tom}>
          <Sparkle size={12} strokeWidth={2.2} aria-hidden="true" />
          <span><b>Sobrecarga usada</b> · {cons.texto}</span>
          {s.papel === "rola" && (
            <button type="button" className="rp-c-cartao-desfazer rp-acao" onClick={() => s.desfazer(r.id)} data-testid="cartao-desfazer">
              <Undo2 size={11} strokeWidth={2.2} aria-hidden="true" /> Desfazer
            </button>
          )}
        </div>
      )}
    </CartaoTeste>
  );
}

/* ── mesa: rótulos junto dos dados ──────────────────────────────────── */

/**
 * Rótulos na mesa — portal no `body`, acima da camada dos dados (900).
 * O contêiner não pega clique; só o rótulo acionável do Sobrecarga, e
 * só para quem rola. Posição por `transform`, quadro a quadro, sem
 * passar pelo React.
 */
function ExtrasC() {
  const s = useProto();
  const mesa = useMesa();
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  const pedido = mesa.pedido;
  const rid = pedido?.dados.find((d) => d.id.endsWith("-normal"))?.id.replace(/-normal$/, "") ?? null;
  const r = rid ? s.rolagens.find((x) => x.id === rid) ?? null : null;
  const visivel = !!r && !!pedido && r.fase === "completa" && !mesa.saindo;
  const cena = pedido?.tipo === "cena";
  const tr = !!r && trocada(r);
  const resN = r ? resolucao(r, "normal") : null;
  const resS = r ? resolucao(r, "sobrecarga") : null;
  const magista = !!r && r.teste.magista && r.sobrecarga != null;
  const acionavel = visivel && !cena && magista && !tr && s.papel === "rola";
  const mostraS = visivel && magista && (tr || acionavel);
  const mostraN = visivel && (!tr || !cena);

  const refN = useRef<HTMLDivElement>(null);
  const refS = useRef<HTMLDivElement>(null);
  const ultimas = useRef<Projecao[]>([]);
  const idsRef = useRef<{ n: string; s: string } | null>(null);
  idsRef.current = rid ? { n: `${rid}-normal`, s: `${rid}-sobrecarga` } : null;

  useEffect(() => {
    const colocar = (el: HTMLElement | null, p: Projecao | undefined, ancora: "centro" | "esq" | "dir") => {
      if (!el || !p) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = ancora === "centro" ? p.x - w / 2 : ancora === "esq" ? p.x - w + 26 : p.x - 26;
      left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      let top = p.y + 64;
      if (top + h > window.innerHeight - 8) top = p.y - 64 - h;
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const posicionar = () => {
      const ids = idsRef.current;
      if (!ids) return;
      const p = ultimas.current;
      const n = p.find((q) => q.id === ids.n);
      const sp = p.find((q) => q.id === ids.s);
      const juntos = !!n && !!sp && Math.abs(n.x - sp.x) < 240 && Math.abs(n.y - sp.y) < 70;
      const nEsq = !!n && !!sp && n.x <= sp.x;
      colocar(refN.current, n, juntos ? (nEsq ? "esq" : "dir") : "centro");
      colocar(refS.current, sp, juntos ? (nEsq ? "dir" : "esq") : "centro");
    };
    const sair = mesa.inscreverProjecao((p) => { ultimas.current = p; posicionar(); });
    posicionar();
    return sair;
  }, [mesa, mostraN, mostraS, tr]);

  // Ponteiro (ou foco) no rótulo acionável segura os dados na mesa.
  const segurando = useRef(false);
  const segurarRef = useRef(mesa.segurar);
  segurarRef.current = mesa.segurar;
  const segurar = (sim: boolean) => {
    if (segurando.current === sim) return;
    segurando.current = sim;
    segurarRef.current(sim);
  };
  useEffect(() => {
    if (!acionavel && segurando.current) { segurando.current = false; segurarRef.current(false); }
  }, [acionavel]);

  if (!montado || !r || !visivel) return null;
  const corN = corDaLeitura(resN, PALETA).hex;
  const corS = corDaLeitura(resS, PALETA).hex;
  const preco = precoCurto(s.custo);

  return createPortal(
    <div className="rp-c-mesa" aria-hidden={acionavel ? undefined : true}>
      {mostraN && resN && (
        <div ref={refN} className="rp-c-rot" data-natureza="normal" data-apagado={tr || undefined}
          style={{ ["--c-cor" as string]: corN } as CSSProperties} data-testid="mesa-rotulo-normal">
          <span className="rp-c-rot-in">
            <b>{resN.total}</b>
            <span>{rotuloDaLeitura(resN)}{resN.margem != null ? ` ${margemTexto(resN.margem)}` : ""}</span>
          </span>
        </div>
      )}
      {mostraS && resS && (
        acionavel ? (
          <div ref={refS} className="rp-c-rot is-acao" data-natureza="sobrecarga"
            style={{ ["--c-cor" as string]: corS } as CSSProperties}
            onPointerEnter={() => segurar(true)} onPointerLeave={() => segurar(false)}>
            <button type="button" className="rp-c-rot-in" data-tom={preco.tom}
              onFocus={() => segurar(true)} onBlur={() => segurar(false)}
              onClick={() => void s.trocar(r.id)} data-testid="mesa-trocar"
              aria-label={`Trocar pelo Dado de Sobrecarga: ${resS.total}, ${rotuloDaLeitura(resS)}. Custo: ${preco.texto}.`}>
              <Sparkle size={11} strokeWidth={2.4} aria-hidden="true" />
              <b>{resS.total}</b>
              <span>{rotuloDaLeitura(resS)}{resS.margem != null ? ` ${margemTexto(resS.margem)}` : ""}</span>
              <span className="rp-c-rot-trocar">Trocar</span>
              <small>{preco.texto}</small>
            </button>
          </div>
        ) : (
          <div ref={refS} className="rp-c-rot" data-natureza="sobrecarga" data-oficial="true"
            style={{ ["--c-cor" as string]: corS } as CSSProperties} data-testid="mesa-rotulo-sobrecarga">
            <span className="rp-c-rot-in">
              <Sparkle size={11} strokeWidth={2.4} aria-hidden="true" />
              <b>{resS.total}</b>
              <span>{rotuloDaLeitura(resS)}{resS.margem != null ? ` ${margemTexto(resS.margem)}` : ""}</span>
            </span>
          </div>
        )
      )}
    </div>,
    document.body,
  );
}

/* ── mesa 3D: a troca acontece diante de todos ──────────────────────── */

function reagir(r: Rolagem, mesa: MesaApi, trocou: boolean) {
  const N = idN(r), S = idS(r);
  const destinoN = trocou ? "apagado" : "neutro";
  const destinoS = trocou ? "usado" : "reserva";
  const c = mesa.controle.current;
  // Os dados ainda estão na mesa: a troca acontece ali mesmo.
  if (c && mesa.naMesa() && mesa.pedido?.dados.some((d) => d.id === S)) {
    c.marcar(N, destinoN);
    c.marcar(S, destinoS);
    return;
  }
  // Já saíram: a mesa reencena os dois, parados onde assentaram.
  if (mesa.reduzido || !r.poses || !r.rotulos) return;
  const dados = r.dados.filter((d) => d.id === N || d.id === S);
  if (dados.length < 2 || !r.poses[N] || !r.poses[S]) return;
  void mesa.encenar(
    dados,
    {
      poses: { [N]: r.poses[N], [S]: r.poses[S] },
      rotulos: { [N]: r.rotulos[N], [S]: r.rotulos[S] },
      estados: { [N]: trocou ? "neutro" : "apagado", [S]: trocou ? "reserva" : "usado" },
    },
    (ctl) => { setTimeout(() => { ctl.marcar(N, destinoN); ctl.marcar(S, destinoS); }, 160); },
    1300,
  );
}

export const PROPOSTA_C: Proposta = {
  id: "c",
  letra: "C",
  nome: "Mesa",
  classe: "pc",
  aparencias: {
    normal: { corpo: "aco", acento: ACO, numero: "#e3edf3" },
    sobrecarga: () => ({
      corpo: "vidro", acento: "#00d4ff", numero: "#ffffff",
      luz: { cor: LUZ, repouso: 0.6, lancamento: 1.3, respiracao: 0.7 },
      fisica: { massa: 0.8, quique: 0.08, giro: 1.25 },
    }),
  },
  estadoSobrecarga: "reserva",
  etiquetaNaMesa: true,
  aoTrocar: (r, mesa) => reagir(r, mesa, true),
  aoDesfazer: (r, mesa) => reagir(r, mesa, false),
  Pool: PoolC,
  Resultado: ResultadoC,
  Cartao: CartaoC,
  Extras: ExtrasC,
  rotuloBotao: (r, rolando, magista) => (rolando ? "Rolando…" : r ? "Rolar de novo" : magista ? "Rolar d10 + Sobrecarga" : "Rolar d10"),
};

export function PropostaC() {
  return <Prototipo proposta={PROPOSTA_C} />;
}
