"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import { oxanium } from "../../../../_design/oxanium";
import { useCentroDoConsole } from "../../../../ficha/_console/useCentroDoConsole";
import { CartaoListaHud } from "../../../../ficha/_console/panels/hud/CartaoListaHud";
import { corTipo, Glifo, VERTENTES_HUD } from "../../../../ficha/_console/panels/hud/MagiasHud";
import { ItemCategoryIcon } from "../../../../_design/itemIcons";
import { corCategoria } from "../../../../_design/itemCategoryColors";
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
  /** Rótulo do botão "sem alvo" quando `alvo` é opcional (padrão: efeito em área). */
  rotuloSemAlvo?: string;
  fatos?: { rotulo: string; valor: string }[];
  /** Como a opção aparece no Console: magia como no grimório, item como no inventário. */
  visual?: VisualMagia | VisualItem | VisualArma;
  /** Arma que não está cheia: as fontes de munição para recarregar ali mesmo. */
  recarga?: { municao: { atual: number; max: number }; fontes: { id: string; nome: string; local: string; quantidade: number; custoPa: number }[] };
}
export interface VisualMagia { tipo: "magia"; nivel: number; vertente: string; tipoMagia: string; mana: number | null; acao: { valor: string; unidade: string } }
export interface VisualArma { tipo: "arma"; nome: string; categoria: string; pericia: string | null; dano: string | null; pa: number | null }
export interface VisualItem { tipo: "item"; nome: string; quantidade: number; categoria: string; categoriaRotulo: string; pa: number | null }

const CY = "#00d4ff", AMB = "#ff8a1f";

/** Apresentação somente. O controlador da ficha valida e executa a ação. */
export function PainelAcaoToken({ pedido, nome, opcoes, alvos, erroCatalogo, onExecutar, onFechar, onConcluir, erroGravacao, onRecarregar }: {
  pedido: PedidoAcaoToken; nome: string; opcoes: OpcaoAcaoToken[]; alvos: AlvoAcaoToken[];
  erroCatalogo?: string | null; erroGravacao?: string | null;
  onExecutar: (opcao: OpcaoAcaoToken, alvoId: string | null) => Promise<void>;
  onFechar: () => void;
  /** Sucesso encerra esta janela; o chamador decide se há um próximo painel (rolagem). */
  onConcluir: () => void;
  /** Recarrega a arma da opção com a fonte escolhida; a lista de opções volta atualizada. */
  onRecarregar?: (opcaoId: string, fonteId: string) => { ok: boolean; mensagem: string };
}) {
  const [recarregando, setRecarregando] = useState<string | null>(null);
  const [avisoRecarga, setAvisoRecarga] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const recarregar = (opcaoId: string, fonteId: string) => {
    const r = onRecarregar?.(opcaoId, fonteId);
    if (r) setAvisoRecarga(r);
    if (r?.ok) setRecarregando(null);
  };
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
          {grupos(pedido.categoria, opcoes).map(g => (
            <div key={g.rotulo} className="pa-grupo">
              <Secao rotulo={g.rotulo} cor={g.cor} acao={g.nivel != null ? <Pips n={Math.min(g.nivel, 5)} c={g.cor ?? CY} /> : undefined} />
              <div className="pa-lista">{g.opcoes.map((o) => o.visual
                ? <div key={o.id} className="pa-item">
                    <CartaoVisual o={o} disabled={!!o.bloqueio || !!erroCatalogo} onClick={() => { setEscolhida(o.id); setFase("revisar"); setErro(null); }} />
                    {o.recarga && onRecarregar && o.recarga.fontes.length > 0 && (
                      <Recarga r={o.recarga} aberta={recarregando === o.id}
                        onAbrir={() => o.recarga!.fontes.length === 1 ? recarregar(o.id, o.recarga!.fontes[0].id) : setRecarregando(v => v === o.id ? null : o.id)}
                        onEscolher={(fonteId) => recarregar(o.id, fonteId)} />
                    )}
                  </div>
                : <button type="button" key={o.id} className="pa-opcao" disabled={!!o.bloqueio || !!erroCatalogo}
                    onClick={() => { setEscolhida(o.id); setFase("revisar"); setErro(null); }}>
                    <CartaoOpcao o={o} />
                  </button>
              )}</div>
            </div>
          ))}
          {!opcoes.length && !erroCatalogo && <p className="pa-vazio">Nenhuma opção disponível no personagem.</p>}
        </>}
        {fase === "revisar" && <>
          <Secao rotulo={titulo} acao={<button type="button" className="pa-trocar" disabled={ocupado} onClick={() => setFase("escolher")}>Trocar</button>} />
          {opcao?.visual ? <CartaoVisual o={opcao} onClick={() => !ocupado && setFase("escolher")} /> : <div className="pa-escolhida">{opcao ? <CartaoOpcao o={opcao} /> : <span className="pa-vazio">Opção indisponível</span>}</div>}
          <Secao rotulo="Alvo" acao={<span className="hx-tag pa-dim">{opcao?.alvo === "proprio" ? "você" : `${alvos.length} marcado${alvos.length === 1 ? "" : "s"}`}</span>} />
          {opcao?.alvo === "proprio" ? <div className="pa-alvo-proprio"><span className="hx-display">{nome}</span><span className="hx-tag pa-dim">uso em si mesmo</span></div> : <>
            {!alvos.length && <div className="pa-alvo-vazio"><span aria-hidden="true">⌖</span><div><strong className="hx-display">Marque um token no mapa</strong><span className="hx-tag pa-dim"><kbd>Shift</kbd> + botão direito</span></div></div>}
            <div className="pa-alvos">{alvos.map(a => (
              <button className="pa-alvo" type="button" key={a.tokenId} data-lado={a.lado === "pn" ? "pn" : "pj"} aria-pressed={alvo?.tokenId === a.tokenId} disabled={ocupado} onClick={() => setAlvoId(a.tokenId)}>
                <span className="pa-alvo-face" aria-hidden="true">{a.retrato ? <img src={a.retrato} alt="" /> : (a.sigla || a.nome.slice(0, 3)).toUpperCase()}</span>
                <span className="hx-display pa-alvo-nome">{a.nome}</span>
              </button>
            ))}</div>
            {opcao?.alvo === "opcional" && <button type="button" className="pa-alvo pa-alvo-nenhum" aria-pressed={!alvo} disabled={ocupado} onClick={() => setAlvoId("")}><span className="hx-display pa-alvo-nome">{opcao.rotuloSemAlvo ?? "Sem alvo / efeito em área"}</span></button>}
          </>}
          {opcao?.bloqueio && <p role="alert" className="pa-erro">{opcao.bloqueio}</p>}
        </>}
        {avisoRecarga && fase === "escolher" && <p role="status" className={avisoRecarga.ok ? "pa-ok" : "pa-erro"}>{avisoRecarga.mensagem}</p>}
        {(erro || erroGravacao) && <p role="alert" className="pa-erro">{erro ?? erroGravacao}</p>}
      </div>
    </JanelaAcao>, document.body);
}

/** Cabeçalho de seção do HUD: losango, rótulo e o fio que corre até a ação. */
function Secao({ rotulo, acao, cor }: { rotulo: string; acao?: ReactNode; cor?: string }) {
  return (
    <div className="pa-secao">
      <span className="pa-secao-losango" aria-hidden="true" style={cor ? { background: cor } : undefined} />
      <span className="hx-display pa-secao-rotulo">{rotulo}</span>
      <span className="pa-secao-fio" aria-hidden="true" />
      {acao}
    </div>
  );
}

const LOCAL_MUNICAO: Record<string, string> = { suporte: "Espaço de munição", acesso_rapido: "Acesso rápido", mochila: "Mochila" };

/** Recarregar sem sair da janela: uma fonte carrega direto; várias abrem a lista embaixo do card. */
function Recarga({ r, aberta, onAbrir, onEscolher }: {
  r: NonNullable<OpcaoAcaoToken["recarga"]>; aberta: boolean; onAbrir: () => void; onEscolher: (fonteId: string) => void;
}) {
  const unica = r.fontes.length === 1 ? r.fontes[0] : null;
  return (
    <div className="pa-recarga" data-aberta={aberta || undefined}>
      <button type="button" className="pa-recarga-botao" onClick={onAbrir} aria-expanded={unica ? undefined : aberta}>
        <RotateCcw size={13} aria-hidden="true" />
        <span>{unica ? `Recarregar com ${unica.nome}` : "Recarregar"}</span>
        <span className="pa-recarga-mun">{r.municao.atual}<span>/{r.municao.max}</span></span>
        {unica && <span className="pa-recarga-pa" data-caro={unica.custoPa > 1 || undefined}>{unica.custoPa} PA</span>}
      </button>
      {aberta && !unica && (
        <div className="pa-recarga-lista" role="list">
          {r.fontes.map(f => (
            <button type="button" role="listitem" key={f.id} className="pa-recarga-fonte" onClick={() => onEscolher(f.id)}>
              <span className="pa-recarga-fonte-nome">{f.nome}<span>{LOCAL_MUNICAO[f.local] ?? f.local} · {f.quantidade}</span></span>
              <span className="pa-recarga-pa" data-caro={f.custoPa > 1 || undefined}>{f.custoPa} PA</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Magias por nível (como o grimório); o resto numa seção só. */
function grupos(categoria: PedidoAcaoToken["categoria"], opcoes: OpcaoAcaoToken[]): { rotulo: string; nivel?: number; cor?: string; opcoes: OpcaoAcaoToken[] }[] {
  const base = categoria === "atacar" ? "Arma" : categoria === "conjurar" ? "Magia" : "Item";
  if (categoria !== "conjurar" || !opcoes.length || !opcoes.every(o => o.visual?.tipo === "magia")) return [{ rotulo: base, opcoes }];
  const nivel = (o: OpcaoAcaoToken) => (o.visual as VisualMagia).nivel;
  return [...new Set(opcoes.map(nivel))].sort((a, b) => a - b)
    .map(n => ({ rotulo: `Nível ${n}`, nivel: n, cor: CY, opcoes: opcoes.filter(o => nivel(o) === n) }));
}

const Pips = ({ n, c, max = 5 }: { n: number; c: string; max?: number }) => (
  <span aria-hidden="true" style={{ display: "inline-flex", gap: 2 }}>
    {Array.from({ length: max }, (_, i) => <span key={i} style={{ width: 5, height: 7, transform: "skewX(-20deg)", background: i < n ? c : "rgba(0,212,255,.08)" }} />)}
  </span>
);

/** O cartão do Console: magia com tipo, mana e PA; item com ícone, quantidade e categoria. */
function CartaoVisual({ o, onClick, disabled }: { o: OpcaoAcaoToken; onClick: () => void; disabled?: boolean }) {
  const v = o.visual!;
  // Só o recurso que falta: o detalhe (atual/necessário) já está nos números do cartão.
  const curto = (t: string) => /^PA insuficiente/i.test(t) ? "PA insuficiente" : /^mana insuficiente/i.test(t) ? "Mana insuficiente" : /^arma descarregada/i.test(t) ? "Arma descarregada" : t;
  const nota = o.bloqueio ? <span className="pa-bloqueio">{curto(o.bloqueio)}</span> : o.aviso ? <span className="pa-aviso">{curto(o.aviso)}</span> : null;
  if (v.tipo === "magia") {
    const numerico = /^\d/.test(v.acao.valor);
    const vert = VERTENTES_HUD.find(x => x.id === v.vertente);
    return <CartaoListaHud nome={o.nome}
      icone={vert && <span aria-hidden="true" style={{ position: "relative", display: "grid", placeItems: "center", width: 36, height: 32, flexShrink: 0 }}>
        <span className="hx-ch-hex" style={{ position: "absolute", inset: 0, background: vert.c + "55" }} />
        <span className="hx-ch-hex" style={{ position: "absolute", inset: 1.5, background: "#081925" }} />
        <span style={{ position: "relative", display: "grid" }}><Glifo v={vert} tam={16} /></span>
      </span>} subtitulo={v.tipoMagia || "—"} cor={corTipo(v.tipoMagia)} nota={nota} disabled={disabled} opacidade={o.bloqueio ? .55 : 1} onClick={onClick}
      metricas={[{ valor: v.mana ?? "—", unidade: "mana", cor: CY }, { valor: v.acao.valor, unidade: v.acao.unidade || "ação", cor: AMB, tamanho: numerico ? 18 : 11 }]} />;
  }
  if (v.tipo === "arma") {
    const c = corCategoria(v.categoria) ?? "#ff5f74";
    // Mesmo molde do item: ícone da arma, perícia no lugar da categoria, dano e PA à direita.
    return <CartaoListaHud nome={v.nome} subtitulo={v.pericia ?? "perícia não definida"} cor={c} nota={nota} disabled={disabled} opacidade={o.bloqueio ? .55 : 1} onClick={onClick}
      icone={<span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, border: `1px solid ${c}66`, background: c + "14" }}>
        <ItemCategoryIcon category={v.categoria} weaponName={v.nome} size={18} color={c} strokeWidth={1.5} />
      </span>}
      metricas={[
        ...(v.dano && v.dano !== "—" ? [{ valor: v.dano, unidade: "dano", cor: "#ff5f74" }] : []),
        ...(v.pa != null ? [{ valor: v.pa, unidade: "PA", cor: AMB }] : []),
      ]} />;
  }
  const c = corCategoria(v.categoria) ?? CY;
  return <CartaoListaHud nome={<>{v.nome}<span className="hx-dim" style={{ fontSize: 11, fontWeight: 500 }}>×{v.quantidade}</span></>}
    subtitulo={v.categoriaRotulo} cor={c} nota={nota} disabled={disabled} opacidade={o.bloqueio ? .55 : 1} onClick={onClick}
    icone={<span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, border: `1px solid ${c}66`, background: c + "14" }}>
      <ItemCategoryIcon category={v.categoria} weaponName={v.nome} size={18} color={c} strokeWidth={1.5} />
    </span>}
    metricas={v.pa != null ? [{ valor: v.pa, unidade: "PA", cor: AMB }] : []} />;
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
