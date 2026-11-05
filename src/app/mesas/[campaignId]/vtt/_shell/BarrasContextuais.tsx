"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { ChevronDown, Eraser, Eye, EyeOff, Settings2, Trash2, X } from "lucide-react";
import { CORES_ANOTACAO, corAnotacaoValida, hexDaAnotacao, type CorPredefinida } from "../_dominio/anotacoes";
import { SINAIS_MARCA } from "../_dominio/sinaisDeMarca";
import { CORES_MARCA, DURACOES_MARCA, type PropsPainelMarcar } from "./PainelMarcar";
import type { PropsPainelMedir } from "./PainelMedir";
import type { PropsPainelAnotacoes } from "./PainelAnotacoes";

function CascaBarra({ nome, acento, children, config, onAbrirConfig }: { nome: string; acento: string; children: ReactNode; config?: ReactNode; onAbrirConfig?: () => void }) {
  const [aberta, setAberta] = useState(false);
  const raiz = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberta(false); };
    document.addEventListener("pointerdown", fechar);
    return () => document.removeEventListener("pointerdown", fechar);
  }, [aberta]);
  return <section ref={raiz} className="rv-barra-contextual" style={{ ["--rv-contextual-acento" as string]: acento }} aria-label={`Ferramenta ${nome}`}
    onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (e.key === "Escape" && aberta) { e.preventDefault(); e.stopPropagation(); setAberta(false); }
    }}>
    {aberta && config && <div className="rv-barra-contextual__config" role="group" aria-label={`Configurações de ${nome}`}>
      <header><strong>CONFIGURAÇÕES · {nome.toUpperCase()}</strong><button type="button" className="jf-mini" aria-label="Fechar configurações" onClick={() => setAberta(false)}><X size={15} /></button></header>
      {config}
    </div>}
    <div className="rv-barra-contextual__faixa"><div className="rv-barra-contextual__conteudo">{children}</div>
      {config && <><span className="rv-barra-contextual__sep" aria-hidden="true" /><button type="button" className="rv-barra-contextual__config-botao" aria-label={`Configurações de ${nome}`} aria-expanded={aberta} onClick={() => { if (!aberta) onAbrirConfig?.(); setAberta(!aberta); }}><Settings2 size={19} /></button></>}
    </div>
  </section>;
}

function Visibilidade({ privada, onPrivada, disabled = false }: { privada: boolean; onPrivada: (v: boolean) => void; disabled?: boolean }) {
  return <div className="jf-grupo"><span className="jf-rot">Quem vê</span><div className="jf-tiles" role="group" aria-label="Quem vê">
    <button type="button" className="jf-tile" aria-pressed={privada} disabled={disabled} onClick={() => onPrivada(true)}><EyeOff size={15} /> Só você</button>
    <button type="button" className="jf-tile" aria-pressed={!privada} disabled={disabled} onClick={() => onPrivada(false)}><Eye size={15} /> Pra mesa</button>
  </div></div>;
}

function SeletorMedidaAnotacao({ desenho, valor, disabled, onValor }: {
  desenho: boolean; valor: number; disabled: boolean; onValor: (v: number) => void;
}) {
  const valores = desenho ? [1, 2, 3, 4, 5, 6] : [12, 16, 20, 24, 28, 32];
  const titulo = desenho ? "Espessura do traço" : "Tamanho do texto";
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const indiceAtual = Math.max(0, valores.indexOf(valor));

  const alternar = () => {
    if (aberto) { setAberto(false); return; }
    const r = botaoRef.current?.getBoundingClientRect();
    if (!r) return;
    const largura = 208;
    const alturaEstimada = 150;
    setPosicao({
      left: Math.max(8, Math.min(window.innerWidth - largura - 8, r.right - largura)),
      ...(r.top >= alturaEstimada + 12
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    });
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: PointerEvent) => {
      if (!botaoRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAberto(false); botaoRef.current?.focus(); } };
    const aoMover = () => setAberto(false);
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("resize", aoMover);
    window.addEventListener("scroll", aoMover, true);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("resize", aoMover);
      window.removeEventListener("scroll", aoMover, true);
    };
  }, [aberto]);

  return <>
    <button ref={botaoRef} type="button" className="rv-barra-contextual__medida" aria-label={`${titulo}: ${valor} px`}
      title={titulo} aria-haspopup="true" aria-expanded={aberto} aria-controls="rv-anotar-medida-opcoes"
      disabled={disabled} onClick={alternar} onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const proximo = Math.max(0, Math.min(valores.length - 1, indiceAtual + (e.key === "ArrowDown" ? 1 : -1)));
          onValor(valores[proximo]);
        }
      }}>
      <span className="rv-barra-contextual__medida-preview" aria-hidden="true">
        {desenho ? <i style={{ height: valor }} /> : <em style={{ fontSize: 10 + indiceAtual * 2 }}>A</em>}
      </span>
      <strong>{valor}<small>px</small></strong><ChevronDown size={13} aria-hidden="true" />
    </button>
    {aberto && createPortal(<div ref={menuRef} id="rv-anotar-medida-opcoes" className="rv-barra-contextual__medida-menu"
      style={{ left: posicao.left, top: posicao.top, bottom: posicao.bottom }} role="group" aria-label={titulo}>
      <span className="rv-barra-contextual__medida-titulo">{titulo}</span>
      <div className="rv-barra-contextual__medida-grade">
        {valores.map((v, i) => <button key={v} type="button" className="rv-anot-passo rv-barra-contextual__medida-opcao"
          aria-label={`${v} pixels`} aria-pressed={valor === v} onClick={() => { onValor(v); setAberto(false); botaoRef.current?.focus(); }}>
          {desenho ? <i style={{ height: v }} /> : <em style={{ fontSize: 10 + i * 2 }}>A</em>}
          <small>{v} px</small>
        </button>)}
      </div>
    </div>, document.body)}
  </>;
}

export function BarraAnotar(p: PropsPainelAnotacoes & { onModo: (modo: "desenhar" | "texto") => void }) {
  const desenho = p.modo === "desenhar";
  const travada = p.bloqueada || p.oculta;
  const medidaTravada = p.bloqueada || !p.podeEditarSelecao;
  const nomeCor: Record<CorPredefinida, string> = { vermelho: "Cinética", laranja: "Energética", ambar: "Material", verde: "Biótica", ciano: "Sináptica", roxo: "Cognitiva", branco: "Branco" };
  return <CascaBarra nome="Anotar" acento="#00d4ff" onAbrirConfig={() => p.onCorRascunho(hexDaAnotacao(p.cor))} config={<>
    <Visibilidade privada={p.privada} onPrivada={p.onPrivada} disabled={travada || !p.podeMudarPrivacidade} />
    <div className="jf-grupo"><span className="jf-rot">Cor personalizada</span><HexColorPicker color={p.corRascunho} onChange={p.onCorRascunho} />
      <div className="rv-barra-contextual__cor-custom"><HexColorInput color={p.corRascunho} onChange={p.onCorRascunho} prefixed aria-label="Cor hexadecimal" />
        <button type="button" className="jf-prim" disabled={travada || !corAnotacaoValida(p.corRascunho)} onClick={p.onAplicarCorRascunho}>Aplicar</button></div>
    </div>
    {p.erro && <p role="alert" className="rv-barra-contextual__erro">{p.erro}</p>}
  </>}>
    <div className="rv-barra-contextual__opcoes" role="group" aria-label="Modo de anotação">
      <button type="button" className="rv-barra-contextual__opcao" aria-pressed={desenho} title="Desenho · F" onClick={() => p.onModo("desenhar")}><span>✎</span> Desenho</button>
      <button type="button" className="rv-barra-contextual__opcao" aria-pressed={!desenho} title="Texto · X" onClick={() => p.onModo("texto")}><span>T</span> Texto</button>
    </div>
    <span className="rv-barra-contextual__sep" aria-hidden="true" />
    <div className="jf-cores rv-barra-contextual__cores" role="group" aria-label="Cor da anotação">
      {(Object.keys(CORES_ANOTACAO) as CorPredefinida[]).map(c => <button key={c} type="button" className="jf-cor" style={{ ["--jf-k" as string]: CORES_ANOTACAO[c] }} aria-pressed={p.cor === c} aria-label={nomeCor[c]} title={nomeCor[c]} disabled={travada} onClick={() => p.onEscolherCor(c)}><span /></button>)}
    </div>
    <SeletorMedidaAnotacao desenho={desenho} valor={p.medida} disabled={medidaTravada} onValor={p.onMedida} />
    {p.temSelecao && <button type="button" className="rv-barra-contextual__icon" title="Remover anotação selecionada" aria-label="Remover anotação selecionada" disabled={p.bloqueada || !p.podeEditarSelecao} onClick={p.onRemover}><Trash2 size={17} /></button>}
  </CascaBarra>;
}

export function BarraMedir(p: PropsPainelMedir) {
  return <CascaBarra nome="Medir" acento="#00d4ff" config={<>
    <div className="jf-grupo"><span className="jf-rot">Quem vê</span><div className="jf-tiles" role="group" aria-label="Quem vê">
      <button type="button" className="jf-tile" aria-pressed={p.modo.visibilidade === "privada"} onClick={() => p.onModo({ ...p.modo, visibilidade: "privada" })}><EyeOff size={15} /> Só você</button>
      <button type="button" className="jf-tile" aria-pressed={p.modo.visibilidade === "mesa"} onClick={() => p.onModo({ ...p.modo, visibilidade: "mesa" })}><Eye size={15} /> Pra mesa</button>
    </div></div>
    {p.permanentesNaCena > 0 && <div className="rv-barra-contextual__limpar"><span>{p.permanentesNaCena} {p.permanentesNaCena === 1 ? "medição" : "medições"} na cena</span><button type="button" className="jf-quieto is-perigo" disabled={p.limpando || p.permanentesQuePodeLimpar === 0} onClick={p.onLimpar}><Eraser size={14} /> Limpar {p.permanentesQuePodeLimpar === p.permanentesNaCena ? "medições" : `as minhas (${p.permanentesQuePodeLimpar})`}</button></div>}
    {p.resumo && <div className="rv-barra-contextual__trechos"><span className="jf-rot">Trechos</span>{p.resumo.trechos.map((metros, i) => <span key={i}>{i + 1}. {metros} m</span>)}{p.resumo.custo > p.resumo.metros && <strong>Terreno difícil · +{p.resumo.custo - p.resumo.metros} de custo</strong>}{p.resumo.atravessaBloqueio && <strong>O percurso atravessa terreno bloqueado</strong>}</div>}
    <p className="jf-desc">Arraste para medir · Q dobra · Backspace desfaz · Enter conclui</p>
  </>}>
    <div className="rv-barra-contextual__opcoes" role="group" aria-label="Duração da medição">
      <button type="button" className="rv-barra-contextual__opcao" aria-pressed={p.modo.duracao === "instantanea"} onClick={() => p.onModo({ ...p.modo, duracao: "instantanea" })}>Instantânea</button>
      <button type="button" className="rv-barra-contextual__opcao" aria-pressed={p.modo.duracao === "permanente"} onClick={() => p.onModo({ ...p.modo, duracao: "permanente" })}>Permanente</button>
    </div>
    <div className="rv-barra-contextual__resultado" role="status" aria-live="polite">{p.resumo ? <><strong>{p.resumo.metros}<small> m</small></strong><span>Custo {p.resumo.custo} · {p.resumo.trechos.length} trecho(s){p.dobras > 0 ? ` · ${p.dobras} dobra(s)` : ""}{p.resumo.atravessaBloqueio ? " · bloqueado" : ""}</span></> : <span>Arraste no mapa para medir</span>}</div>
  </CascaBarra>;
}

export function BarraMarcar(p: PropsPainelMarcar) {
  return <CascaBarra nome="Marcar" acento="#c25a8c" config={<>
    <div className="jf-grupo"><span className="jf-rot">Rótulo</span><input className="jf-campo" value={p.texto} maxLength={80} placeholder="Rótulo (opcional)" aria-label="Rótulo" onChange={e => p.onTexto(e.target.value)} /></div>
    <div className="jf-grupo"><span className="jf-rot">Duração</span><div className="jf-tiles rv-barra-contextual__duracoes" role="group" aria-label="Duração da marcação">{DURACOES_MARCA.map(d => <button key={d.valor} type="button" className="jf-tile" aria-pressed={p.duracao === d.valor} disabled={d.valor === "rodada" && !p.emCombate} onClick={() => p.onDuracao(d.valor)}>{d.rotulo}</button>)}</div></div>
    <Visibilidade privada={p.privada} onPrivada={p.onPrivada} />
    {p.naCena > 0 && <div className="rv-barra-contextual__limpar"><span>{p.naCena} {p.naCena === 1 ? "marcação" : "marcações"} na cena</span><button type="button" className="jf-quieto is-perigo" disabled={p.limpando || p.quePodeLimpar === 0} onClick={p.onLimpar}><Eraser size={14} /> Limpar {p.quePodeLimpar === p.naCena ? "marcações" : `as minhas (${p.quePodeLimpar})`}</button></div>}
    <p className="jf-desc">Clique na célula para marcar; clique de novo para apagar.</p>
  </>}>
    <div className="rv-barra-contextual__opcoes" role="group" aria-label="Sinal da marcação">{SINAIS_MARCA.map(s => <button key={s.valor} type="button" className="rv-barra-contextual__opcao" aria-pressed={p.sinal === s.valor} onClick={() => p.onSinal(s.valor)}><s.Icone size={17} />{s.rotulo}</button>)}</div>
    <span className="rv-barra-contextual__sep" aria-hidden="true" />
    <div className="jf-cores rv-barra-contextual__cores" role="group" aria-label="Cor da marcação">{CORES_MARCA.map(c => <button key={c.valor} type="button" className="jf-cor" style={{ ["--jf-k" as string]: c.hex }} aria-pressed={p.cor === c.valor} aria-label={c.rotulo} title={c.rotulo} onClick={() => p.onCor(c.valor)}><span /></button>)}</div>
    {p.texto.trim() && <span className="rv-barra-contextual__rotulo">“{p.texto.trim()}”</span>}
  </CascaBarra>;
}
