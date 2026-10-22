"use client";

/**
 * ENVIO DE IMAGEM — o modal único dos envios de dentro da mesa (avatar da
 * ficha, retrato e token, companheiro, chat, mapa, capa da campanha).
 *
 * Um fluxo só: o scanner (soltar ou escolher o arquivo), o enquadramento
 * (ou a prévia, quando a imagem vai inteira) e o "usar". Quem abre diz a
 * forma do destino — quadrado, círculo, hexágono ou livre — e faz o
 * envio em `onUsar`; o modal só cuida do arquivo e do recorte.
 *
 * Portal para o `body` pelo mesmo motivo da janela de recorte antiga: no
 * VTT ele nasce dentro do HUD, e um ancestral com `filter`/`transform`
 * prenderia o `position: fixed` dentro dele.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IBM_Plex_Sans } from "next/font/google";
import { oxanium } from "../../_design/oxanium";
import { BYTES_ORIGINAL_MAXIMO } from "../../../lib/vtt/imagePreparation";
import { useCentroDoConsole } from "./useCentroDoConsole";
import "./envioImagem.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

export type FormaEnvio = "quadrado" | "circulo" | "hexagono" | "livre";
export type RecorteEnvio = { x: number; y: number; tamanho: number };

/** Hexágono de ponta para cima, ocupando a caixa de ponta a ponta. */
export const HEXAGONO = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const LARGURA_HEX = Math.sqrt(3) / 2;
const JANELA = 248;
const PREVIA = 92;
const ZOOM_MAX = 4;
const MASCARA: Record<Exclude<FormaEnvio, "livre">, string> = {
  quadrado: "M0 0h200v200H0Z",
  circulo: "M100 0a100 100 0 1 1 0 200a100 100 0 1 1 0-200Z",
  hexagono: "M100 0 186.6 50v100L100 200 13.4 150V50Z",
};

/**
 * "Como vai ficar" no mapa: o token como `MapaHex` desenha — célula
 * hexagonal de ponta para cima, disco escuro com o anel na cor do lado,
 * sombra de contato e a imagem recortada no círculo.
 */
const GRADE = 42, RAIO_TOKEN = GRADE * 0.82, CENTRO = { x: 116, y: 76 };
const VIZINHOS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [-1, 1], [2, -1], [-2, 1], [1, 1], [-1, -1]];
const celula = (q: number, r: number) => {
  const cx = CENTRO.x + GRADE * Math.sqrt(3) * (q + r / 2), cy = CENTRO.y + GRADE * 1.5 * r;
  return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(cx + GRADE * Math.cos(a)).toFixed(1)},${(cy + GRADE * Math.sin(a)).toFixed(1)}`; }).join(" ");
};
function TokenNaGrade({ fonte, largura, altura, pos, cor }: { fonte: string; largura: number; altura: number; pos: { x: number; y: number }; cor: string }) {
  const k = (RAIO_TOKEN * 2) / JANELA;
  return <svg className="ev-grade" viewBox="0 0 232 152" width="232" height="152" aria-hidden="true">
    <defs><clipPath id="ev-token-recorte"><circle cx={CENTRO.x} cy={CENTRO.y} r={RAIO_TOKEN - 1} /></clipPath></defs>
    {VIZINHOS.map(([q, r]) => <polygon key={`${q},${r}`} points={celula(q, r)} className="ev-grade-celula" />)}
    <ellipse cx={CENTRO.x} cy={CENTRO.y + RAIO_TOKEN * 0.72} rx={RAIO_TOKEN * 0.78} ry={RAIO_TOKEN * 0.26} fill="#04070b" opacity="0.6" />
    <circle cx={CENTRO.x} cy={CENTRO.y} r={RAIO_TOKEN} fill="#0d141b" stroke={cor} strokeWidth="2" />
    <g clipPath="url(#ev-token-recorte)">
      <image href={fonte} x={CENTRO.x - RAIO_TOKEN + pos.x * k} y={CENTRO.y - RAIO_TOKEN + pos.y * k} width={largura * k} height={altura * k} preserveAspectRatio="none" />
    </g>
  </svg>;
}

function peso(bytes: number) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

export function EnvioImagem({
  titulo, contexto, canal = "UPLOAD://IMAGEM", forma, atual, arquivoInicial, rotuloUsar = "USAR IMAGEM",
  aviso, erro, enviando = false, cor, centralizarNoConsole = false, previaToken, onUsar, onRemover, fechar,
}: {
  /** "IMAGEM DO COMPANHEIRO", "AVATAR DA FICHA"… */
  titulo: string;
  /** Linha pequena acima do título: de quem é a imagem. */
  contexto?: string;
  /** Código da faixa de sistema no topo. */
  canal?: string;
  forma: FormaEnvio;
  /** Imagem que já está lá: aparece no scanner e libera o "remover". */
  atual?: string | null;
  /** Arquivo que a pessoa já soltou em outro lugar: abre direto no enquadramento. */
  arquivoInicial?: File | null;
  rotuloUsar?: string;
  /** Recado neutro (ex.: "fora de uma mesa a imagem vale só nesta sessão"). */
  aviso?: string | null;
  erro?: string | null;
  enviando?: boolean;
  /** Cor de destaque; o padrão é o ciano do VTT. */
  cor?: string;
  centralizarNoConsole?: boolean;
  /** A imagem vira token no mapa: a prévia mostra o token na grade, com o anel nesta cor. */
  previaToken?: string;
  /** Faz o envio. `recorte` é o quadrado escolhido (null na forma livre). Devolve se deu certo. */
  onUsar: (arquivo: File, recorte: RecorteEnvio | null) => Promise<boolean> | boolean;
  onRemover?: () => Promise<boolean> | boolean;
  fechar: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [fonte, setFonte] = useState<{ url: string; w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });
  const [arrastando, setArrastando] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [montado, setMontado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const arrasto = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const fecharBotao = useRef<HTMLButtonElement>(null);
  const centro = useCentroDoConsole();
  const sair = () => setSaindo(true);
  const livre = forma === "livre";

  useEffect(() => { setMontado(true); }, []);
  useEffect(() => { if (montado) fecharBotao.current?.focus({ preventScroll: true }); }, [montado]);
  useEffect(() => () => { if (fonte) URL.revokeObjectURL(fonte.url); }, [fonte]);

  const escolher = (f: File | null | undefined) => {
    setRecado(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setRecado("Formato inválido. Use PNG, JPEG ou WebP."); return; }
    if (f.size > BYTES_ORIGINAL_MAXIMO) { setRecado("Imagem grande demais. O limite é 30 MB."); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { setArquivo(f); setFonte({ url, w: img.naturalWidth, h: img.naturalHeight }); setZoom(1); setDesloc({ x: 0, y: 0 }); };
    img.onerror = () => { URL.revokeObjectURL(url); setRecado("Não foi possível abrir esta imagem."); };
    img.src = url;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (arquivoInicial) escolher(arquivoInicial); }, [arquivoInicial]);

  // Enquadramento: a imagem sempre cobre a janela; o deslocamento é preso às bordas.
  const escala = fonte ? (JANELA / Math.min(fonte.w, fonte.h)) * zoom : 1;
  const largura = fonte ? fonte.w * escala : 0, altura = fonte ? fonte.h * escala : 0;
  const prender = (x: number, y: number) => ({ x: Math.max(JANELA - largura, Math.min(0, x)), y: Math.max(JANELA - altura, Math.min(0, y)) });
  const pos = prender((JANELA - largura) / 2 + desloc.x, (JANELA - altura) / 2 + desloc.y);
  const mover = (x: number, y: number) => { const p = prender(x, y); setDesloc({ x: p.x - (JANELA - largura) / 2, y: p.y - (JANELA - altura) / 2 }); };
  const passo = (delta: number) => setZoom(z => Math.max(1, Math.min(ZOOM_MAX, Math.round((z + delta) * 100) / 100)));
  const k = PREVIA / JANELA;
  const larguraPrevia = forma === "hexagono" ? PREVIA * LARGURA_HEX : PREVIA;
  const recuo = forma === "hexagono" ? (JANELA * (1 - LARGURA_HEX)) / 2 : 0;
  const recortePrevia = forma === "hexagono" ? HEXAGONO : forma === "circulo" ? "circle(50%)" : undefined;

  const usar = async () => {
    if (!arquivo) return;
    const ok = await onUsar(arquivo, livre ? null : { x: -pos.x / escala, y: -pos.y / escala, tamanho: JANELA / escala });
    if (ok) sair();
  };
  const remover = async () => { if (onRemover && await onRemover()) sair(); };
  const canto = <><i className="ev-canto" data-c="1" /><i className="ev-canto" data-c="2" /><i className="ev-canto" data-c="3" /><i className="ev-canto" data-c="4" /></>;

  if (!montado) return null;
  const estilo = { ...(cor ? { "--ev": cor } : {}), ...(centralizarNoConsole && centro ? { "--ev-x": `${centro.x}px`, "--ev-y": `${centro.y}px` } : {}) } as React.CSSProperties;

  return createPortal(<div className={`rc-cursor-scope ev-modal ${oxanium.variable} ${plex.variable}`} data-saindo={saindo} data-console={centralizarNoConsole && !!centro} style={estilo} onAnimationEnd={e => { if (saindo && e.target === e.currentTarget) fechar(); }}>
    <div className="ev-veu" aria-hidden="true" onClick={sair} />
    <div className="ev-caixa" role="dialog" aria-modal="true" aria-label={titulo} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); sair(); } }}>
      <div className="ev-faixa" aria-hidden="true"><span>{canal}</span><span>{fonte ? `FONTE ${fonte.w}×${fonte.h} · ${peso(arquivo?.size ?? 0)}` : "AGUARDANDO SINAL"}</span></div>
      <header><div>{contexto && <small>{contexto}</small>}<h3>{titulo}</h3></div><button ref={fecharBotao} type="button" aria-label="Fechar" onClick={sair}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>

      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      {!fonte ? <button type="button" className="ev-solta" data-sobre={sobre} onClick={() => entrada.current?.click()}
        onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
        onDrop={e => { e.preventDefault(); setSobre(false); escolher(e.dataTransfer.files?.[0]); }}>
        {canto}
        <span className="ev-solta-forma" data-forma={forma}>
          {atual ? <span><img src={atual} alt="" /></span>
            : <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>}
        </span>
        <strong>{sobre ? "Solte para escanear" : atual ? "Trocar a imagem" : "Solte a imagem no scanner"}</strong>
        <span>ou clique para escolher · PNG, JPEG ou WebP · até 30 MB</span>
      </button> : livre ? <div className="ev-livre">
        <div className="ev-livre-quadro">{canto}<img src={fonte.url} alt="" draggable={false} /><span className="ev-varre" aria-hidden="true" /></div>
        <div className="ev-livre-lado">
          <span className="ev-rotulo">PRÉVIA</span>
          <p>A imagem vai inteira, sem recorte.</p>
          <dl className="ev-dados"><div><dt>DIMENSÕES</dt><dd>{fonte.w} × {fonte.h}</dd></div><div><dt>ARQUIVO</dt><dd>{peso(arquivo?.size ?? 0)}</dd></div></dl>
          <button type="button" className="ev-secundario" onClick={() => entrada.current?.click()}>ESCOLHER OUTRA</button>
        </div>
      </div> : <div className="ev-enquadra">
        <div className="ev-janela-moldura">
          <div className="ev-janela" data-arrastando={arrastando} style={{ width: JANELA, height: JANELA }}
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); arrasto.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y }; setArrastando(true); }}
            onPointerMove={e => { const a = arrasto.current; if (a) mover(a.ox + e.clientX - a.x, a.oy + e.clientY - a.y); }}
            onPointerUp={() => { arrasto.current = null; setArrastando(false); }}
            onWheel={e => setZoom(z => Math.max(1, Math.min(ZOOM_MAX, z - e.deltaY * 0.002)))}>
            <img src={fonte.url} alt="" draggable={false} style={{ width: largura, height: altura, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
            <svg className="ev-mascara" viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true">
              {forma !== "quadrado" && <path fillRule="evenodd" d={`M0 0h200v200H0Z ${MASCARA[forma]}`} />}
              <path className="ev-contorno" d={MASCARA[forma]} />
            </svg>
            <span className="ev-varre" aria-hidden="true" />
          </div>
          {canto}
          <span className="ev-leitura" aria-hidden="true"><span>ZOOM ×{zoom.toFixed(2)}</span><span>SAÍDA 512 PX</span></span>
        </div>
        <div className="ev-enquadra-lado">
          <span className="ev-rotulo">ENQUADRAR</span>
          <p>Arraste para posicionar. Use a roda ou a régua para aproximar.</p>
          <div className="ev-zoom">
            <button type="button" aria-label="Afastar" disabled={zoom <= 1} onClick={() => passo(-0.25)}>−</button>
            <input type="range" min={1} max={ZOOM_MAX} step={0.01} value={zoom} aria-label="Zoom" style={{ "--p": `${((zoom - 1) / (ZOOM_MAX - 1)) * 100}%` } as React.CSSProperties} onChange={e => setZoom(Number(e.target.value))} />
            <button type="button" aria-label="Aproximar" disabled={zoom >= ZOOM_MAX} onClick={() => passo(0.25)}>+</button>
          </div>
          <span className="ev-rotulo">{previaToken ? "COMO VAI FICAR NO MAPA" : "COMO VAI FICAR"}</span>
          {previaToken ? <TokenNaGrade fonte={fonte.url} largura={largura} altura={altura} pos={pos} cor={previaToken} />
            : <div className="ev-previa"><span style={{ width: larguraPrevia, height: PREVIA, clipPath: recortePrevia }}><img src={fonte.url} alt="" style={{ width: largura * k, height: altura * k, transform: `translate(${(pos.x - recuo) * k}px, ${pos.y * k}px)` }} /></span></div>}
          <button type="button" className="ev-secundario" onClick={() => entrada.current?.click()}>ESCOLHER OUTRA</button>
        </div>
      </div>}

      {(recado || erro || aviso) && <p className="ev-aviso" data-tom={recado || erro ? "erro" : undefined} role={recado || erro ? "alert" : undefined}>{recado ?? erro ?? aviso}</p>}
      {enviando && <div className="ev-transmite" role="status"><span>TRANSMITINDO</span><i /></div>}
      <footer>
        {atual && onRemover && !fonte ? <button type="button" className="ev-perigo" disabled={enviando} onClick={remover}>REMOVER IMAGEM</button> : <span />}
        <div>
          <button type="button" className="ev-link" onClick={sair}>CANCELAR</button>
          <button type="button" className="ev-primario" disabled={!fonte || enviando} onClick={usar}>{enviando ? "ENVIANDO…" : rotuloUsar}</button>
        </div>
      </footer>
    </div>
  </div>, document.body);
}
