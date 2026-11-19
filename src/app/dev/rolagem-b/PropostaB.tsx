"use client";

/**
 * PROPOSTA B — REGISTRO.
 *
 * A janela continua como hoje: rola e mostra o veredito do Dado Normal;
 * o Dado de Sobrecarga aparece só como uma ficha apagada ao lado dele.
 * A decisão mora no cartão do Chat Log, o registro que a mesa inteira
 * lê: quem rolou vê ali o selo do preço e o botão de usar; todos veem o
 * cartão mudar quando a troca acontece; acima do limite, os d4 da perda
 * de Integridade caem na mesa diante de todos.
 *
 * Cor: o âmbar fica onde está (faixas limitadas e rampa da carga). O
 * Sobrecarga não tem cor fixa — a cor dele É o preço da próxima troca,
 * com cores que já querem dizer isso no VTT: violeta (arcano/magia,
 * acento `mana`), magenta (Ruptura) e vermelho (dano, Integridade).
 */

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Undo2, Zap } from "lucide-react";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import { Prototipo } from "../rolagem/_base/Prototipo";
import { estiloTremor } from "../rolagem/_base/Janela";
import { resolucao, trocada, useProto, useRolagemDaJanela, usado, type Proposta, type Rolagem } from "../rolagem/_base/estado";
import {
  CartaoTeste, FaixaTeste, Ficha, LinhaVeredito, PALETA_ATUAL, Pilula,
  corDaLeitura, margemTexto, pilulasDe, rotuloDaLeitura,
} from "../rolagem/_base/pecas";
import { custoDaTroca, ordinal, ordinalF, type Conduto, type CustoTroca } from "../rolagem/_base/regra";
import type { MesaApi } from "../rolagem/_base/MesaDupla";

const CIANO = "#00d4ff";

/** A faixa do preço — é ela que dá a cor do Dado de Sobrecarga. */
type Tom = CustoTroca["faixa"];

const COR_PRECO: Record<Tom, { hex: string; soft: string; respiracao: number; nome: string }> = {
  abaixo: { hex: "#9d8cff", soft: "rgba(157,140,255,.16)", respiracao: 0.35, nome: "abaixo do limite" },
  alcanca: { hex: "#ff4fd8", soft: "rgba(255,79,216,.16)", respiracao: 0.8, nome: "alcança o limite" },
  ultrapassa: { hex: "#ff5f74", soft: "rgba(255,95,116,.16)", respiracao: 1.3, nome: "ultrapassa o limite" },
};

/** Tom que a troca desta rolagem PAGOU (ou `null` se não houve troca). */
function tomPago(r: Rolagem): Tom | null {
  if (r.troca) return r.troca.custo.faixa;
  if (r.perdaPendente) return "ultrapassa";
  return null;
}

/* ── o preço, como selo ─────────────────────────────────────────────── */

function selo(c: CustoTroca): { titulo: string; detalhe: string; tom: Tom; ultima: boolean } {
  if (c.faixa === "abaixo") {
    return { titulo: "+1 Sobrecarga", detalhe: `fica ${c.sobrecargaDepois} de ${c.limite}`, tom: "abaixo", ultima: false };
  }
  if (c.faixa === "alcanca") {
    return {
      titulo: `${ordinalF(c.ruptura)} Ruptura · Integridade −${c.perdaIntegridade}`,
      detalhe: c.ultimaVontade ? "Última Vontade" : `alcança o limite · ${c.sobrecargaDepois} de ${c.limite}`,
      tom: "alcanca",
      ultima: c.ultimaVontade,
    };
  }
  return {
    titulo: `${c.d4}d4 de Integridade`,
    detalhe: `${ordinal(c.excedente)} excedente${c.ultimaVontade === "pode" ? ` · zera com ${c.perdaQueZera}+` : c.ultimaVontade === "certa" ? " · Última Vontade" : ""}`,
    tom: "ultrapassa",
    ultima: c.ultimaVontade === "certa",
  };
}

/** O que a troca cobrou, em uma linha. */
function consequencia(r: Rolagem): { texto: string; pendente: boolean } | null {
  if (r.perdaPendente) {
    const a = r.perdaPendente.antes;
    return { texto: `Sobrecarga ${a.sobrecarga + 1} de ${a.limite} · ${r.perdaPendente.d4}d4 de Integridade caindo na mesa`, pendente: true };
  }
  const t = r.troca;
  if (!t) return null;
  const c = t.custo;
  const base = `Sobrecarga ${t.depois.sobrecarga} de ${c.limite}`;
  const fim = t.ultimaVontade ? " · Última Vontade" : "";
  if (c.faixa === "abaixo") return { texto: base, pendente: false };
  if (c.faixa === "alcanca") {
    return { texto: `${base} · ${ordinalF(c.ruptura)} Ruptura · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`, pendente: false };
  }
  return { texto: `${base} · ${c.d4}d4 (${t.d4.join(" + ")}) · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`, pendente: false };
}

/* ── janela: pool ───────────────────────────────────────────────────── */

function PoolB() {
  const s = useProto();
  const r = useRolagemDaJanela();
  const emVoo = !!r && r.fase === "rolando";
  const magista = r && r.fase !== "completa" ? r.teste.magista : s.magista;
  const tremendo = s.carga > 0 && !s.rolando;
  const preco = COR_PRECO[s.custo.faixa];

  // Parado com resultado: as mesmas fichas do cartão. A do Sobrecarga é
  // um botão pequeno: leva ao cartão, onde a decisão mora.
  if (r && r.normal != null && !tremendo) {
    const res = resolucao(r);
    const cor = corDaLeitura(res, PALETA_ATUAL).hex;
    const u = usado(r);
    const pago = tomPago(r);
    const corMarca = COR_PRECO[pago ?? s.custo.faixa].hex;
    return (
      <div className="rv-rf-dados rp-b-pool" aria-label="Dados da última rolagem">
        <span className="rp-b-pool-rot">d10</span>
        <Ficha valor={r.normal} aceso={u === "normal"} cor={cor} riscada={trocada(r)} rotulo={`Dado Normal ${r.normal}`} tamanho={26} />
        {r.teste.magista && (
          r.sobrecarga == null
            ? <span className="rv-dados-rolando rp-b-pool-voo"><PolyDie sides={10} semValor active accent={preco.hex} soft={preco.soft} size={30} /></span>
            : (
              <button type="button" className="rp-b-ficha-s rp-acao" onClick={() => s.focarCartao(r.id)}
                data-testid="ficha-sobrecarga" style={{ ["--pb-tom" as string]: corMarca }}
                aria-label={pago
                  ? `Dado de Sobrecarga ${r.sobrecarga}, usado. Ver a troca no cartão do chat`
                  : `Dado de Sobrecarga ${r.sobrecarga}. Decidir no cartão do chat: ${selo(s.custo).titulo}`}
                title={pago ? "Ver a troca no cartão do chat" : "Decidir no cartão do chat"}>
                <Ficha valor={r.sobrecarga} aceso={u === "sobrecarga"} cor={cor} tamanho={26}
                  marca={<span className="rp-b-losango" aria-hidden="true" />} />
              </button>
            )
        )}
      </div>
    );
  }

  return (
    <div className="rv-rf-dados rp-b-pool" aria-label={magista ? "Dado Normal e Dado de Sobrecarga" : "Dado Normal"}>
      <span className={emVoo ? "rv-dados-rolando" : undefined} style={tremendo ? { display: "block", ...estiloTremor(s.carga, 0) } : undefined}>
        <PolyDie sides={10} semValor active={!emVoo} accent={CIANO} soft="rgba(0,212,255,.14)" size={40} />
      </span>
      {magista && (
        <span className={emVoo ? "rv-dados-rolando" : undefined} data-testid="pool-sobrecarga" data-tom={s.custo.faixa}
          style={{
            display: "block",
            ...(tremendo ? estiloTremor(s.carga, 1) : null),
            // Mesma cor (o preço), mais luz com a força. A leitura da
            // força continua sendo do botão.
            filter: `drop-shadow(0 0 ${(3 + s.carga * 13).toFixed(1)}px color-mix(in srgb, ${preco.hex} ${Math.round(40 + s.carga * 55)}%, transparent))`,
          }}>
          <PolyDie sides={10} semValor active accent={preco.hex} soft={preco.soft} size={40} />
        </span>
      )}
    </div>
  );
}

/* ── janela: resultado (sem linha nova) ─────────────────────────────── */

function ResultadoB() {
  const r = useRolagemDaJanela();
  if (!r || r.normal == null) return null;
  const res = resolucao(r);
  const pago = tomPago(r);
  return (
    <div className="rv-rf-faixa rp-b-resultado">
      <FaixaTeste key={`${r.id}-${usado(r)}`} r={r} res={res} paleta={PALETA_ATUAL} testId="resultado-total"
        style={{ animation: "rp-entra 180ms cubic-bezier(.23,1,.32,1) both" }}
        nota={pago ? (
          <span className="rp-b-nota-faixa" style={{ ["--pb-tom" as string]: COR_PRECO[pago].hex }} data-testid="nota-faixa">
            <span className="rp-b-losango" aria-hidden="true" /> d10 de Sobrecarga
            {r.perdaPendente && <span className="rp-b-nota-pend"> · {r.perdaPendente.d4}d4 de Integridade na mesa</span>}
          </span>
        ) : undefined} />
    </div>
  );
}

/* ── chat: o cartão é a superfície da decisão ───────────────────────── */

/**
 * Trocar some com o botão de usar; desfazer some com o de desfazer. O
 * foco segue para o par do outro estado, no mesmo cartão — sem isso,
 * quem usa teclado cairia no começo da página.
 */
function focarNoCartao(id: string, testId: "trocar" | "desfazer") {
  setTimeout(() => {
    document.querySelector<HTMLElement>(`[data-rolagem="${id}"] [data-testid="${testId}"]`)?.focus({ preventScroll: true });
  }, 0);
}

function Decisao({ r }: { r: Rolagem }) {
  const s = useProto();
  const alt = resolucao(r, "sobrecarga");
  const corAlt = corDaLeitura(alt, PALETA_ATUAL).hex;
  const p = selo(s.custo);
  const tom = COR_PRECO[p.tom];
  const rotulo = `Usar o Dado de Sobrecarga: ${alt?.total}, ${rotuloDaLeitura(alt)}${alt?.margem != null ? ` ${margemTexto(alt.margem)}` : ""}. Preço: ${p.titulo}, ${p.detalhe}.`;
  return (
    <div className="rp-b-decisao rp-entra" style={{ ["--pb-tom" as string]: tom.hex }} data-tom={p.tom} data-testid="decisao">
      <span className="rp-b-selo" data-ultima={p.ultima || undefined} data-testid="selo">
        <span className="rp-b-selo-in">
          <span className="rp-b-losango" aria-hidden="true" />
          <span className="rp-b-selo-txt">
            <b>{p.titulo}</b>
            <small>{p.detalhe}</small>
          </span>
        </span>
      </span>
      <button type="button" className="rp-b-usar rp-acao" data-foco-cartao data-testid="trocar"
        onClick={() => { void s.trocar(r.id); focarNoCartao(r.id, "desfazer"); }} disabled={s.trocando === r.id} aria-label={rotulo}>
        <span className="rp-b-usar-in">
          <span className="rp-b-usar-txt">
            <b><Zap size={12} strokeWidth={2.4} aria-hidden="true" /> Usar Sobrecarga</b>
            <small style={{ color: corAlt }}>→ {rotuloDaLeitura(alt)}{alt?.margem != null ? ` ${margemTexto(alt.margem)}` : ""}</small>
          </span>
          <span className="rp-b-usar-total" style={{ color: corAlt }}>{alt?.total}</span>
        </span>
      </button>
      {r.substituicaoNaAcao && <p className="rp-b-acao">Esta ação já teve uma substituição</p>}
    </div>
  );
}

/**
 * Cartão ANTIGO (o personagem já rolou de novo): a decisão recolhe numa
 * linha. Trocar um teste passado é raro e continua possível — um clique
 * abre o selo e o botão; o cartão de agora é que leva o bloco inteiro.
 */
function DecisaoRecolhida({ r }: { r: Rolagem }) {
  const s = useProto();
  const [aberta, setAberta] = useState(false);
  const alt = resolucao(r, "sobrecarga");
  const tom = COR_PRECO[s.custo.faixa];
  if (aberta) return <Decisao r={r} />;
  return (
    <button type="button" className="rp-b-recolhida rp-acao" aria-expanded={false} data-testid="decisao-recolhida"
      style={{ ["--pb-tom" as string]: tom.hex }}
      onClick={() => { setAberta(true); focarNoCartao(r.id, "trocar"); }}>
      <span className="rp-b-losango" aria-hidden="true" />
      <span>Sobrecarga {r.sobrecarga} → {alt?.total}</span>
      <ChevronDown size={12} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

function Consequencia({ r }: { r: Rolagem }) {
  const s = useProto();
  const c = consequencia(r);
  const pago = tomPago(r);
  if (!c || !pago) return null;
  return (
    <div className="rp-b-consequencia rp-entra" data-tom={pago} data-pendente={c.pendente || undefined}
      data-ultima={r.troca?.ultimaVontade || undefined} style={{ ["--pb-tom" as string]: COR_PRECO[pago].hex }}>
      <span className="rp-b-cons-cab">
        <Zap size={12} strokeWidth={2.4} aria-hidden="true" />
        <b>Sobrecarga usada</b>
        {s.papel === "rola" && (
          <button type="button" className="rp-b-desfazer rp-acao" data-foco-cartao data-testid="desfazer"
            onClick={() => { s.desfazer(r.id); focarNoCartao(r.id, "trocar"); }}>
            <Undo2 size={11} strokeWidth={2.2} aria-hidden="true" /> Desfazer
          </button>
        )}
      </span>
      <span className="rp-b-cons-txt" data-testid="consequencia">
        {c.pendente && <span className="rp-b-pulso" aria-hidden="true" />}
        {c.texto}
      </span>
    </div>
  );
}

/**
 * Uma entrada por recipiente: o cartão já entra inteiro no chat. O
 * veredito só anima quando MUDA (troca ou desfazer), não na chegada.
 */
function Animar({ chave, children }: { chave: string; children: ReactNode }) {
  const anterior = useRef(chave);
  const mudou = useRef(false);
  if (anterior.current !== chave) { mudou.current = true; anterior.current = chave; }
  return <div key={chave} className={mudou.current ? "rp-entra" : undefined}>{children}</div>;
}

function CartaoB({ r }: { r: Rolagem }) {
  const s = useProto();
  const res = resolucao(r);
  const antes = trocada(r) ? resolucao(r, "normal") : null;
  const cor = corDaLeitura(res, PALETA_ATUAL).hex;
  const u = usado(r);
  const pago = tomPago(r);
  // Sem troca, a marca da ficha S mostra o preço de AGORA (o termômetro).
  const corMarca = COR_PRECO[pago ?? s.custo.faixa].hex;
  const podeDecidir = s.papel === "rola" && r.teste.magista && r.sobrecarga != null && !trocada(r);
  const maisRecente = s.rolagens.filter((x) => x.teste.personagemId === r.teste.personagemId && x.fase === "completa").at(-1)?.id === r.id;
  return (
    <CartaoTeste r={r} paleta={PALETA_ATUAL} atributos={{ "data-trocado": trocada(r) ? "true" : "false" }}>
      <Animar chave={u}>
        <LinhaVeredito res={res} paleta={PALETA_ATUAL} r={r}
          antes={antes && (
            <span className="rp-b-antes" data-testid="cartao-antes">
              antes {antes.total} · {rotuloDaLeitura(antes)}{antes.margem != null ? ` ${margemTexto(antes.margem)}` : ""}
            </span>
          )} />
      </Animar>
      <div className="rp-b-fichas">
        <Ficha valor={r.normal} aceso={u === "normal"} cor={cor} riscada={trocada(r)} rotulo={`Dado Normal ${r.normal}`} />
        {r.teste.magista && (
          <span style={{ ["--pb-tom" as string]: corMarca, display: "inline-flex" }}>
            <Ficha valor={r.sobrecarga} aceso={u === "sobrecarga"} cor={cor} rotulo={`Dado de Sobrecarga ${r.sobrecarga}`}
              marca={<span className="rp-b-losango" aria-hidden="true" />} />
          </span>
        )}
        {pilulasDe(r).map((p) => <Pilula key={p}>{p}</Pilula>)}
      </div>
      {podeDecidir && (maisRecente ? <Decisao r={r} /> : <DecisaoRecolhida r={r} />)}
      {trocada(r) && <Consequencia r={r} />}
    </CartaoTeste>
  );
}

/* ── mesa 3D ────────────────────────────────────────────────────────── */

function reagir(r: Rolagem, mesa: MesaApi, trocou: boolean) {
  const c = mesa.controle.current;
  if (!c || !mesa.naMesa()) return; // os dados já saíram: o registro carrega a troca
  c.marcar(`${r.id}-sobrecarga`, trocou ? "usado" : "reserva");
  c.marcar(`${r.id}-normal`, trocou ? "apagado" : "neutro");
}

/** Termômetro: o Dado de Sobrecarga sai da mão na cor do preço da próxima troca. */
function aparenciaSobrecarga(c: Conduto) {
  const tom = COR_PRECO[custoDaTroca(c).faixa];
  return {
    corpo: "vidro" as const, acento: tom.hex, numero: "#ffffff",
    luz: { cor: tom.hex, repouso: 0.55, lancamento: 1.2, respiracao: tom.respiracao },
    fisica: { giro: 1.15 },
  };
}

export const PROPOSTA_B: Proposta = {
  id: "b",
  letra: "B",
  nome: "Registro",
  classe: "pb",
  aparencias: {
    normal: { corpo: "metal", acento: CIANO },
    sobrecarga: aparenciaSobrecarga,
    perda: { corpo: "metal", acento: "#ff5f74" },
  },
  estadoSobrecarga: "reserva",
  perdaNaMesa: true,
  aoTrocar: (r, mesa) => reagir(r, mesa, true),
  aoDesfazer: (r, mesa) => reagir(r, mesa, false),
  Pool: PoolB,
  Resultado: ResultadoB,
  Cartao: CartaoB,
  rotuloBotao: (r, rolando) => (rolando ? "Rolando…" : r ? "Rolar de novo" : "Rolar d10"),
};

export function PropostaB() {
  return <Prototipo proposta={PROPOSTA_B} />;
}
