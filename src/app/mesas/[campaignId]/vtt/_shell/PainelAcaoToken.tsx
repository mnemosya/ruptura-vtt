"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { oxanium } from "../../../../_design/oxanium";
import { useCentroDoConsole } from "../../../../ficha/_console/useCentroDoConsole";
import "../../../../ficha/_console/panels/hud/hud-base.css";
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
  const [escolhida, setEscolhida] = useState<string | null>(pedido.opcaoId ?? null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [fase, setFase] = useState<"escolher" | "revisar" | "concluido">(pedido.opcaoId ? "revisar" : "escolher");
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
  const confirmarRotulo = ocupado ? "Executando…" : `${pedido.categoria === "atacar" ? "Confirmar ataque" : titulo}${opcao ? ` · ${opcao.custo.split(" · ")[0]}` : ""}`;
  return createPortal(
    <JanelaAcao titulo={titulo} chapeu={`ação · ${nome}`} onFechar={() => { if (!trava.current) onFechar(); }}
      rodape={fase === "revisar" ? <>
        <span className="pa-status">{faltaAlvo ? "Marque um alvo no mapa" : ""}</span>
        <button type="button" className="pa-confirmar" disabled={ocupado || !opcao || !!opcao.bloqueio || faltaAlvo || !!erroCatalogo} onClick={() => void confirmar()}>{confirmarRotulo}</button>
      </> : <span className="pa-status">Escolha para conferir alvo e custo.</span>}>
      <div aria-busy={ocupado} className="pa-corpo">
        {erroCatalogo && <p role="alert" className="pa-erro">{erroCatalogo}</p>}
        {fase === "escolher" && <>
          <Secao rotulo={pedido.categoria === "atacar" ? "Arma" : pedido.categoria === "conjurar" ? "Magia" : "Item"} />
          <div className="pa-lista">{opcoes.map((o) => (
            <button type="button" key={o.id} className="pa-opcao" disabled={!!o.bloqueio || !!erroCatalogo}
              onClick={() => { setEscolhida(o.id); setFase("revisar"); setErro(null); }}>
              <CartaoOpcao o={o} />
            </button>
          ))}</div>
          {!opcoes.length && !erroCatalogo && <p className="pa-vazio">Nenhuma opção disponível no personagem.</p>}
        </>}
        {fase === "revisar" && <>
          <Secao rotulo={titulo} acao={<button type="button" className="pa-trocar" disabled={ocupado} onClick={() => setFase("escolher")}>Trocar</button>} />
          <div className="pa-escolhida">{opcao ? <CartaoOpcao o={opcao} /> : <span className="pa-vazio">Opção indisponível</span>}</div>
          <Secao rotulo="Alvo" acao={<span className="hx-tag pa-dim">{opcao?.alvo === "proprio" ? "você" : `${alvos.length} marcado${alvos.length === 1 ? "" : "s"}`}</span>} />
          {opcao?.alvo === "proprio" ? <div className="pa-alvo-proprio"><span className="hx-display">{nome}</span><span className="hx-tag pa-dim">uso em si mesmo</span></div> : <>
            {!alvos.length && <div className="pa-alvo-vazio"><span aria-hidden="true">⌖</span><div><strong className="hx-display">Marque um token no mapa</strong><span className="hx-tag pa-dim"><kbd>Shift</kbd> + botão direito</span></div></div>}
            <div className="pa-alvos">{alvos.map(a => (
              <button className="pa-alvo" type="button" key={a.tokenId} data-lado={a.lado === "pn" ? "pn" : "pj"} aria-pressed={alvo?.tokenId === a.tokenId} disabled={ocupado} onClick={() => setAlvoId(a.tokenId)}>
                <span className="pa-alvo-face" aria-hidden="true">{a.retrato ? <img src={a.retrato} alt="" /> : (a.sigla || a.nome.slice(0, 3)).toUpperCase()}</span>
                <span className="hx-display pa-alvo-nome">{a.nome}</span>
              </button>
            ))}</div>
            {opcao?.alvo === "opcional" && <button type="button" className="pa-alvo pa-alvo-nenhum" aria-pressed={!alvo} disabled={ocupado} onClick={() => setAlvoId("")}><span className="hx-display pa-alvo-nome">Sem alvo / efeito em área</span></button>}
          </>}
          {opcao?.bloqueio && <p role="alert" className="pa-erro">{opcao.bloqueio}</p>}
        </>}
        {(erro || erroGravacao) && <p role="alert" className="pa-erro">{erro ?? erroGravacao}</p>}
      </div>
    </JanelaAcao>, document.body);
}

/** Cabeçalho de seção do HUD: losango, rótulo e o fio que corre até a ação. */
function Secao({ rotulo, acao }: { rotulo: string; acao?: ReactNode }) {
  return (
    <div className="pa-secao">
      <span className="pa-secao-losango" aria-hidden="true" />
      <span className="hx-display pa-secao-rotulo">{rotulo}</span>
      <span className="pa-secao-fio" aria-hidden="true" />
      {acao}
    </div>
  );
}

/** A opção no molde do cartão da aba Equipamentos: nome, dano em vermelho, custo e avisos. */
function CartaoOpcao({ o }: { o: OpcaoAcaoToken }) {
  const dano = o.fatos?.find(f => f.rotulo === "Dano-base")?.valor;
  const outros = (o.fatos ?? []).filter(f => f.rotulo !== "Dano-base");
  return (
    <span className="pa-cartao">
      <span className="pa-cartao-topo">
        <span className="hx-display pa-cartao-nome">{o.nome}</span>
        <span className="hx-tag pa-custo">{o.custo.split(" · ")[0]}</span>
      </span>
      <span className="pa-cartao-stats">
        {dano && dano !== "—" && <span className="hx-display pa-dano">{dano}</span>}
        {outros.map(f => <span key={f.rotulo} className="hx-tag pa-dim">{f.rotulo} <b>{f.valor}</b></span>)}
        {o.custo.includes(" · ") && <span className="hx-tag pa-dim">{o.custo.split(" · ").slice(1).join(" · ")}</span>}
      </span>
      {o.bloqueio && <span className="pa-bloqueio">{o.bloqueio}</span>}
      {!o.bloqueio && o.aviso && <span className="pa-aviso">{o.aviso}</span>}
    </span>
  );
}

/** Janela do HUD (a mesma moldura da gaveta de Equipamentos), arrastável pelo cabeçalho. */
function JanelaAcao({ titulo, chapeu, onFechar, rodape, children }: { titulo: string; chapeu: string; onFechar: () => void; rodape: ReactNode; children: ReactNode }) {
  const centro = useCentroDoConsole();
  const janelaRef = useRef<HTMLDivElement>(null);
  const gestoRef = useRef<{ x: number; y: number } | null>(null);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onFechar(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onFechar]);
  const iniciar = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as Element).closest("button, a, input, select, textarea")) return;
    gestoRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: React.PointerEvent<HTMLElement>) => {
    const g = gestoRef.current, j = janelaRef.current;
    if (!g || !j) return;
    const c = j.getBoundingClientRect(), m = 8;
    const dx = Math.max(m - c.left, Math.min(e.clientX - g.x, window.innerWidth - m - c.right));
    const dy = Math.max(m - c.top, Math.min(e.clientY - g.y, window.innerHeight - m - c.bottom));
    setDesloc(p => ({ x: p.x + dx, y: p.y + dy }));
    gestoRef.current = { x: e.clientX, y: e.clientY };
  };
  const soltar = (e: React.PointerEvent<HTMLElement>) => { if (!gestoRef.current) return; gestoRef.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };
  return (
    <div className={`hx ${oxanium.variable} pa-camada`}>
      {/* Posição num invólucro próprio: a animação de entrada (hx-pop) usa
          transform e, com fill "both", engolia o translate do arraste. */}
      <div ref={janelaRef} className="pa-janela"
        style={{ left: centro?.x ?? window.innerWidth / 2, top: centro?.y ?? window.innerHeight / 2, transform: `translate(calc(-50% + ${desloc.x}px), calc(-50% + ${desloc.y}px))` }}>
      <section role="dialog" aria-label={titulo} data-testid="token-acao-painel" className="hx-edge hx-ch hx-pop">
        <div className="hx-ch pa-casco">
          <header className="pa-cab" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
            <div className="pa-cab-linha">
              <span className="hx-tag pa-chapeu">{chapeu}</span>
              <button type="button" onClick={onFechar} aria-label={`Fechar ${titulo.toLowerCase()}`} className="hx-ch-hex hx-fechar"><X size={14} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className="hx-ch-tab pa-cab-aba"><span className="hx-display">{titulo}</span></div>
          </header>
          <div className="pa-rolagem">{children}</div>
          <footer className="pa-rodape">{rodape}</footer>
        </div>
      </section>
      </div>
    </div>
  );
}
