"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConsolePicker } from "../../../../ficha/_console/panels/AuxModals";
import type { AlvoAcaoToken, PedidoAcaoToken } from "../_dominio/targets";

export interface OpcaoAcaoToken {
  id: string;
  nome: string;
  custo: string;
  detalhe: string;
  bloqueio?: string | null;
  aviso?: string;
  alvo: "proprio" | "opcional" | "obrigatorio";
  pericia?: string | null;
  fatos?: { rotulo: string; valor: string }[];
}

/** Apresentação somente. O controlador da ficha valida e executa a ação. */
export function PainelAcaoToken({ pedido, nome, opcoes, alvos, erroCatalogo, onExecutar, onFechar, onConcluir, erroGravacao }: {
  pedido: PedidoAcaoToken; nome: string; opcoes: OpcaoAcaoToken[]; alvos: AlvoAcaoToken[];
  erroCatalogo?: string | null; erroGravacao?: string | null;
  onExecutar: (opcao: OpcaoAcaoToken, alvoId: string | null) => Promise<void>;
  onFechar: () => void;
  /** Sucesso encerra esta janela; o chamador decide se há um próximo painel (rolagem). */
  onConcluir: () => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [fase, setFase] = useState<"escolher" | "revisar" | "concluido">("escolher");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcao = opcoes.find(o => o.id === escolhida);
  // Alvo removido/oculto nunca fica preso no formulário.
  const alvo = alvos.find(a => a.tokenId === alvoId) ?? (alvoId === null && alvos.length === 1 ? alvos[0] : null);
  const faltaAlvo = opcao?.alvo === "obrigatorio" && !alvo;
  const confirmar = async () => {
    if (trava.current || !opcao || opcao.bloqueio || faltaAlvo) return;
    trava.current = true; setOcupado(true); setErro(null);
    try {
      await onExecutar(opcao, opcao.alvo === "proprio" ? pedido.tokenId : alvo?.tokenId ?? null);
      setFase("concluido");
      onConcluir();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível executar a ação."); }
    finally { trava.current = false; setOcupado(false); }
  };
  const titulo = { atacar: "Atacar", conjurar: "Conjurar", item: "Usar item" }[pedido.categoria];
  if (!montado || fase === "concluido") return null;
  return createPortal(<ConsolePicker modal={false} arrastavel titulo={`${titulo} · ${nome}`} id={fase === "escolher" ? "01 // SELECIONAR" : fase === "revisar" ? "02 // CONFIRMAR" : "03 // EXECUTADO"} modulo="MOD.AÇÃO" onFechar={() => { if (!trava.current) onFechar(); }} testId="token-acao-painel"
    rodape={fase === "revisar" ? <><span className="rc-picker-status">{faltaAlvo ? "Marque um alvo no mapa" : "Custo registrado ao confirmar"}</span><button type="button" className="rc-picker-aplicar" disabled={ocupado || !opcao || !!opcao.bloqueio || faltaAlvo || !!erroCatalogo} onClick={() => void confirmar()}>{ocupado ? "Executando…" : pedido.categoria === "atacar" ? "Confirmar ataque" : titulo}</button></> : <span className="rc-picker-status">{fase === "escolher" ? "Escolha para conferir alvo e custo." : "Ação registrada."}</span>}>
    <div className="rv-token-picker" aria-busy={ocupado}>
      {erroCatalogo && <p role="alert">{erroCatalogo}</p>}
      {fase === "escolher" && <>
        <div className="rc-picker-grade" data-colunas="1">{opcoes.map((o, i) => <button type="button" key={o.id} className="rc-picker-opcao" disabled={!!o.bloqueio || !!erroCatalogo} onClick={() => { setEscolhida(o.id); setFase("revisar"); setErro(null); }}>
          <span className="rc-picker-indice">{String(i + 1).padStart(2, "0")}</span><span className="rc-picker-nome">{o.nome}<small>{o.bloqueio ?? o.custo}</small>{o.aviso && <small className="rv-token-picker__aviso">{o.aviso}</small>}</span>
        </button>)}</div>
        {!opcoes.length && !erroCatalogo && <p>Nenhuma opção disponível no personagem.</p>}
      </>}
      {fase === "revisar" && <>
        <section className="rv-token-picker__resumo" aria-label="Ação escolhida">
          <div className="rv-token-flow__resumo-top"><span className="rv-token-flow__rotulo">{titulo}</span><button type="button" className="rc-picker-aplicar" disabled={ocupado} onClick={() => setFase("escolher")}>Trocar</button></div>
          <h3>{opcao?.nome ?? "Opção indisponível"}</h3>
          <dl className="rv-token-flow__fatos"><div><dt>Custo</dt><dd>{opcao?.custo}</dd></div>{opcao?.fatos?.map(f => <div key={f.rotulo}><dt>{f.rotulo}</dt><dd>{f.valor}</dd></div>)}</dl>
        </section>
        {opcao?.aviso && <p role="status" className="rv-token-picker__aviso">{opcao.aviso}</p>}
        <section className="rv-token-picker__alvos" aria-label="Alvo desta ação">
          <div className="rv-token-flow__secao"><span className="rv-token-flow__rotulo">Alvo</span><span>{opcao?.alvo === "proprio" ? "Você" : `${alvos.length} marcado${alvos.length === 1 ? "" : "s"}`}</span></div>
          {opcao?.alvo === "proprio" ? <div className="rv-token-flow__alvo-proprio">{nome}<small>Uso em si mesmo</small></div> : <>
            {!alvos.length && <div className="rv-token-flow__alvo-vazio"><span className="rv-token-flow__mira" aria-hidden="true">⌖</span><div><strong>Marque um token no mapa</strong><p><kbd>Shift</kbd> + botão direito</p></div></div>}
            {/* Alvo no molde do cartão da aba Personagens: o acento é o do
                lado (ciano PJ, vermelho PN), e o escolhido se diz pela
                barra lateral e pelo tom — sem "Selecionar/Selecionado". */}
            <div className="rv-token-picker__lista-alvos">{alvos.map(a => <button className="rv-alvo-cartao" type="button" key={a.tokenId} data-lado={a.lado === "pn" ? "pn" : "pj"} aria-pressed={alvo?.tokenId === a.tokenId} disabled={ocupado} onClick={() => setAlvoId(a.tokenId)}>
              <span className="rv-alvo-cartao-face" aria-hidden="true">
                {a.retrato ? <img src={a.retrato} alt="" /> : (a.sigla || a.nome.slice(0, 3)).toUpperCase()}
              </span>
              <span className="rv-alvo-cartao-nome">{a.nome}</span>
            </button>)}</div>
            {opcao?.alvo === "opcional" && <button type="button" className="rc-picker-opcao" aria-pressed={!alvo} disabled={ocupado} onClick={() => setAlvoId("")}>Sem alvo / efeito em área</button>}
            {!!alvos.length && <small>Shift + clique direito marca um alvo.</small>}
          </>}
        </section>
        {opcao?.bloqueio && <p role="alert">{opcao.bloqueio}</p>}
      </>}
      {(erro || erroGravacao) && <p role="alert">{erro ?? erroGravacao}</p>}
    </div>
  </ConsolePicker>, document.body);
}
