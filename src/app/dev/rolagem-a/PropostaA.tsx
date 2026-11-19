"use client";

/**
 * PROPOSTA A — RESERVA.
 *
 * O Dado de Sobrecarga é uma brasa guardada: cai junto, aceso por
 * dentro, e fica numa linha de reserva logo abaixo do veredito, com o
 * preço escrito no próprio botão. Trocar é um clique ali; o chat registra.
 *
 * Cor: âmbar passa a ser SÓ do Sobrecarga. As faixas limitadas (que
 * hoje são âmbar) vão para o gelo — o meio da régua, sem cor de estado.
 * A rampa da carga do botão não muda: ela mede força, vive no botão e
 * acontece antes de existir veredito na tela.
 */

import { Undo2, Zap } from "lucide-react";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import { Half, Warn } from "../../mesas/[campaignId]/vtt/_dados3d/icones";
import { Prototipo } from "../rolagem/_base/Prototipo";
import { estiloTremor } from "../rolagem/_base/Janela";
import { resolucao, useProto, useRolagemDaJanela, usado, type Proposta, type Rolagem } from "../rolagem/_base/estado";
import {
  CartaoTeste, FaixaTeste, Ficha, LinhaVeredito, PALETA_ATUAL, Pilula,
  corDaLeitura, margemTexto, pilulasDe, rotuloDaLeitura, type Paleta,
} from "../rolagem/_base/pecas";
import { ordinal, ordinalF, type CustoTroca, type TrocaAplicada } from "../rolagem/_base/regra";
import type { MesaApi } from "../rolagem/_base/MesaDupla";

const AMBAR = "#ff8a1f";
const CIANO = "#00d4ff";
const GELO = "#d6e6ee";

/** Faixas limitadas no gelo; o resto igual a hoje. */
const PALETA_A: Paleta = {
  ...PALETA_ATUAL,
  sucesso_limitado: { hex: GELO, soft: "rgba(214,230,238,0.06)", acento: "gelo", Icone: Half },
  falha_limitada: { hex: GELO, soft: "rgba(214,230,238,0.06)", acento: "gelo", Icone: Warn },
};


/* ── janela: pool ───────────────────────────────────────────────────── */

function PoolA() {
  const s = useProto();
  const r = useRolagemDaJanela();
  const emVoo = !!r && r.fase === "rolando";
  const magista = r && (emVoo || r.fase !== "completa") ? r.teste.magista : s.magista;
  const tremendo = s.carga > 0 && !s.rolando;

  // Parado com resultado: as fichas (a mesma leitura do cartão).
  if (r && r.normal != null && !tremendo) {
    const res = resolucao(r);
    const cor = corDaLeitura(res, PALETA_A).hex;
    const u = usado(r);
    return (
      <div className="rv-rf-dados rp-a-pool" aria-label="Dados da última rolagem">
        <span className="rp-a-pool-rot">d10</span>
        <Ficha valor={r.normal} aceso={u === "normal"} cor={cor} riscada={!!r.troca} rotulo={`Dado Normal ${r.normal}`} tamanho={26} />
        {r.teste.magista && (
          r.sobrecarga == null
            ? <span className="rv-dados-rolando rp-a-pool-voo"><PolyDie sides={10} semValor accent={AMBAR} soft="rgba(255,138,31,.14)" active size={30} /></span>
            : <Ficha valor={r.sobrecarga} aceso={u === "sobrecarga"} cor={cor} tamanho={26} rotulo={`Dado de Sobrecarga ${r.sobrecarga}`}
                marca={<Zap size={11} strokeWidth={2.4} color={AMBAR} aria-hidden="true" />} />
        )}
      </div>
    );
  }

  const brilho = s.carga;
  return (
    <div className="rv-rf-dados rp-a-pool" aria-label={magista ? "Dado Normal e Dado de Sobrecarga" : "Dado Normal"}>
      <span className={emVoo ? "rv-dados-rolando" : undefined} style={tremendo ? { display: "block", ...estiloTremor(s.carga, 0) } : undefined}>
        <PolyDie sides={10} semValor active={!emVoo} accent={CIANO} soft="rgba(0,212,255,.14)" size={40} />
      </span>
      {magista && (
        <span className={`rp-a-brasa${emVoo ? " rv-dados-rolando" : ""}`}
          style={{
            display: "block",
            ...(tremendo ? estiloTremor(s.carga, 1) : null),
            // A brasa reage à força: mesma cor, mais luz. A leitura da
            // força continua no botão.
            filter: `drop-shadow(0 0 ${(3 + brilho * 13).toFixed(1)}px rgba(255,138,31,${(0.35 + brilho * 0.55).toFixed(2)}))`,
          }}>
          <PolyDie sides={10} semValor active accent={AMBAR} soft="rgba(255,138,31,.16)" size={40} />
        </span>
      )}
    </div>
  );
}

/* ── janela: resultado + reserva ────────────────────────────────────── */

/** O preço, do jeito que vai NO botão. */
function preco(c: CustoTroca): { titulo: string; detalhe: string; tom: "ambar" | "ruptura" | "perigo" } {
  if (c.faixa === "abaixo") return { titulo: "+1 Sobrecarga", detalhe: `fica ${c.sobrecargaDepois} de ${c.limite}`, tom: "ambar" };
  if (c.faixa === "alcanca") {
    return c.ultimaVontade
      ? { titulo: "Última Vontade", detalhe: `Ruptura · Integridade −${c.perdaIntegridade} zera`, tom: "perigo" }
      : { titulo: `Ruptura · Integridade −${c.perdaIntegridade}`, detalhe: `alcança o limite · ${c.sobrecargaDepois} de ${c.limite}`, tom: "ruptura" };
  }
  if (c.ultimaVontade === "certa") return { titulo: "Última Vontade", detalhe: `${c.d4}d4 de Integridade zera`, tom: "perigo" };
  return {
    titulo: `${c.d4}d4 de Integridade`,
    detalhe: `${ordinal(c.excedente)} excedente${c.ultimaVontade === "pode" ? ` · zera com ${c.perdaQueZera}+` : ""}`,
    tom: "perigo",
  };
}

function consequencia(t: TrocaAplicada): string {
  const c = t.custo;
  if (c.faixa === "abaixo") return `${t.depois.sobrecarga} de ${c.limite}`;
  const fim = t.ultimaVontade ? " · Última Vontade" : "";
  if (c.faixa === "alcanca") return `${ordinalF(c.ruptura)} Ruptura · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`;
  return `${c.d4}d4 (${t.d4.join(" + ")}) · Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}`;
}

function Reserva({ r }: { r: Rolagem }) {
  const s = useProto();
  if (r.sobrecarga == null) {
    return (
      <div className="rp-a-reserva is-voo" aria-hidden="true">
        <span className="rp-a-reserva-in">
          <span className="rp-a-chip rv-dados-rolando"><PolyDie sides={10} semValor active accent={AMBAR} soft="rgba(255,138,31,.16)" size={34} /></span>
          <span className="rp-a-texto"><span className="rp-a-linha1 is-apagada">Sobrecarga no ar…</span></span>
        </span>
      </div>
    );
  }

  if (r.troca) {
    const t = r.troca;
    return (
      <div className="rp-a-usada rp-entra" data-tom={t.ultimaVontade ? "perigo" : t.custo.faixa === "alcanca" ? "ruptura" : t.custo.faixa === "ultrapassa" ? "perigo" : "ambar"}>
        <Zap size={14} strokeWidth={2.2} aria-hidden="true" />
        <span className="rp-a-usada-txt">
          <b>Sobrecarga usada</b>
          <span data-testid="consequencia">{consequencia(t)}</span>
        </span>
        <button type="button" className="jf-quieto rp-acao rp-a-desfazer" onClick={() => s.desfazer(r.id)} data-testid="desfazer">
          <Undo2 size={13} strokeWidth={2} aria-hidden="true" /> Desfazer
        </button>
      </div>
    );
  }

  const alt = resolucao(r, "sobrecarga");
  const atual = resolucao(r, "normal");
  const melhora = !!alt && !!atual && alt.total > atual.total;
  const corAlt = corDaLeitura(alt, PALETA_A).hex;
  const p = preco(s.custo);
  const rotulo = `Trocar pelo Dado de Sobrecarga: ${alt?.total}, ${rotuloDaLeitura(alt)}. Custo: ${p.titulo}, ${p.detalhe}.`;
  return (
    <>
      <button type="button" className="rp-a-reserva rp-acao rp-entra" data-melhora={melhora || undefined} data-tom={p.tom}
        onClick={() => void s.trocar(r.id)} aria-label={rotulo} data-testid="trocar" disabled={s.trocando === r.id}>
        <span className="rp-a-reserva-in">
          <span className="rp-a-chip"><PolyDie sides={10} value={r.sobrecarga} active accent={AMBAR} soft="rgba(255,138,31,.16)" size={34} /></span>
          <span className="rp-a-texto">
            <span className="rp-a-linha1">
              <span className="rp-a-seta" aria-hidden="true">→</span>
              <b style={{ color: corAlt }}>{alt?.total}</b>
              <span style={{ color: corAlt }}>{rotuloDaLeitura(alt)}</span>
              {alt?.margem != null && <span className="rp-a-margem" style={{ color: corAlt }}>{margemTexto(alt.margem)}</span>}
            </span>
            <span className="rp-a-preco">
              <b>{p.titulo}</b>
              <small>{p.detalhe}</small>
            </span>
          </span>
          <span className="rp-a-trocar" aria-hidden="true">Trocar</span>
        </span>
      </button>
      {r.substituicaoNaAcao && <p className="rp-a-acao">Esta ação já teve uma substituição</p>}
    </>
  );
}

function ResultadoA() {
  const r = useRolagemDaJanela();
  if (!r || r.normal == null) return null;
  const res = resolucao(r);
  return (
    <div className="rv-rf-faixa rp-a-resultado">
      <FaixaTeste key={`${r.id}-${usado(r)}`} r={r} res={res} paleta={PALETA_A} testId="resultado-total"
        style={{ animation: "rp-entra 180ms cubic-bezier(.23,1,.32,1) both" }}
        nota={r.troca ? <span className="rp-a-nota-faixa"><Zap size={10} strokeWidth={2.4} aria-hidden="true" /> d10 de Sobrecarga</span> : undefined} />
      {r.teste.magista && <Reserva r={r} />}
    </div>
  );
}

/* ── chat ───────────────────────────────────────────────────────────── */

function CartaoA({ r }: { r: Rolagem }) {
  const s = useProto();
  const res = resolucao(r);
  const antes = r.troca ? resolucao(r, "normal") : null;
  const cor = corDaLeitura(res, PALETA_A).hex;
  const u = usado(r);
  return (
    <CartaoTeste r={r} paleta={PALETA_A} atributos={{ "data-trocado": r.troca ? "true" : "false" }}>
      <LinhaVeredito res={res} paleta={PALETA_A} r={r}
        antes={antes && (
          <span className="rp-a-antes" data-testid="cartao-antes">
            antes {antes.total} · {rotuloDaLeitura(antes)}{antes.margem != null ? ` ${margemTexto(antes.margem)}` : ""}
          </span>
        )} />
      <div className="rp-a-fichas">
        <Ficha valor={r.normal} aceso={u === "normal"} cor={cor} riscada={!!r.troca} rotulo={`Dado Normal ${r.normal}`} />
        {r.teste.magista && (
          <Ficha valor={r.sobrecarga} aceso={u === "sobrecarga"} cor={cor} rotulo={`Dado de Sobrecarga ${r.sobrecarga}`}
            marca={<Zap size={10} strokeWidth={2.4} color={AMBAR} aria-hidden="true" />} />
        )}
        {pilulasDe(r).map((p) => <Pilula key={p}>{p}</Pilula>)}
      </div>
      {r.troca && (
        <div className="rp-a-cartao-sobre" data-tom={r.troca.ultimaVontade || r.troca.custo.faixa === "ultrapassa" ? "perigo" : r.troca.custo.faixa === "alcanca" ? "ruptura" : "ambar"}>
          <Zap size={12} strokeWidth={2.2} aria-hidden="true" />
          <span><b>Sobrecarga usada</b> · {consequencia(r.troca)}</span>
          {s.papel === "rola" && (
            <button type="button" className="rp-a-cartao-desfazer rp-acao" onClick={() => s.desfazer(r.id)}>
              <Undo2 size={11} strokeWidth={2.2} aria-hidden="true" /> Desfazer
            </button>
          )}
        </div>
      )}
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

export const PROPOSTA_A: Proposta = {
  id: "a",
  letra: "A",
  nome: "Reserva",
  classe: "pa",
  aparencias: {
    normal: { corpo: "metal", acento: CIANO },
    sobrecarga: () => ({
      corpo: "brasa", acento: AMBAR, numero: "#ffd9b8",
      luz: { cor: AMBAR, repouso: 0.5, lancamento: 1.15, respiracao: 0.5 },
      fisica: { giro: 1.2 },
    }),
  },
  estadoSobrecarga: "reserva",
  aoTrocar: (r, mesa) => reagir(r, mesa, true),
  aoDesfazer: (r, mesa) => reagir(r, mesa, false),
  Pool: PoolA,
  Resultado: ResultadoA,
  Cartao: CartaoA,
  rotuloBotao: (r, rolando, magista) => (rolando ? "Rolando…" : r ? "Rolar de novo" : magista ? "Rolar d10 + Sobrecarga" : "Rolar d10"),
};

export function PropostaA() {
  return <Prototipo proposta={PROPOSTA_A} />;
}
