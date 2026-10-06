"use client";

import { useEffect, useRef, useState } from "react";

export interface ItemCarrossel {
  id: string;
  nome: string;
  img: string;
  top: string;
  sub: string;
  /** Cor própria do item (região, vertente). Sem ela, a marca é ciano. */
  color?: string;
}

/**
 * Carrossel 3D em trilho curvo. `viewId` é o item em foco (só olhar);
 * `value` é o escolhido. Clicar numa carta lateral traz ela ao centro;
 * clicar na central escolhe.
 *
 * Também ARRASTA (mouse, caneta ou dedo): o trilho acompanha o ponteiro
 * e, ao soltar, para na carta mais próxima. Um arrasto não vira clique —
 * soltar em cima de uma carta depois de mover não a escolhe.
 */
export function Carrossel({ items, value, viewId, onView, onPick, cta }: {
  items: ItemCarrossel[];
  value: string;
  viewId: string;
  onView: (id: string) => void;
  onPick: (id: string) => void;
  cta: string;
}) {
  const sel = Math.max(0, items.findIndex((i) => i.id === viewId));
  const setSel = (i: number) => onView(items[i].id);
  const go = (d: number) => setSel((sel + d + items.length) % items.length);
  const atual = items[sel];
  const picked = value === atual.id;

  /* Arrasto: `arrasto` é o deslocamento em CARTAS (fração), não em px. */
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const gestoRef = useRef<{ x: number; id: number; moveu: boolean; ultX: number; ultT: number; vx: number } | null>(null);
  const moveuRef = useRef(false);
  const [arrasto, setArrasto] = useState(0);
  // Uma carta anda 62% da própria largura por passo (o `translateX` abaixo).
  const passoPx = () => (palcoRef.current?.querySelector<HTMLElement>(".fj-carta")?.offsetWidth ?? 270) * 0.62;
  const aoPressionar = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    gestoRef.current = { x: e.clientX, id: e.pointerId, moveu: false, ultX: e.clientX, ultT: e.timeStamp, vx: 0 };
    moveuRef.current = false;
  };
  const aoMover = (e: React.PointerEvent) => {
    const g = gestoRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dt = e.timeStamp - g.ultT;
    if (dt > 0) { g.vx = (e.clientX - g.ultX) / dt; g.ultX = e.clientX; g.ultT = e.timeStamp; }
    if (!g.moveu && Math.abs(dx) > 6) {
      g.moveu = true; moveuRef.current = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
    }
    // Resistência nas pontas: o trilho nunca anda mais que meia volta.
    const limite = Math.max(1, Math.floor(items.length / 2));
    if (g.moveu) setArrasto(Math.max(-limite, Math.min(limite, -dx / passoPx())));
  };
  const aoSoltar = (e: React.PointerEvent) => {
    const g = gestoRef.current;
    gestoRef.current = null;
    if (!g || !g.moveu) return;
    let passos = Math.round(-(e.clientX - g.x) / passoPx());
    // Um "peteleco" rápido anda ao menos uma carta, mesmo curto.
    if (!passos && Math.abs(g.vx) > 0.45) passos = g.vx < 0 ? 1 : -1;
    setArrasto(0);
    if (passos) go(passos);
  };

  /* Rolagem horizontal (trackpad) ou Shift + roda: uma carta por gesto. */
  const rodaRef = useRef(0);
  useEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const aoRolar = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!delta) return;
      e.preventDefault();
      const agora = performance.now();
      if (agora - rodaRef.current < 320 || Math.abs(delta) < 8) return;
      rodaRef.current = agora;
      go(delta > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  });

  return (
    <div className="fj-carrossel">
      <div className="fj-carrossel__trilho" />
      <div
        ref={palcoRef}
        className={`fj-carrossel__palco ${arrasto ? "fj-carrossel__palco--arrastando" : ""}`}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={() => { gestoRef.current = null; setArrasto(0); }}
        // Depois de um arrasto, o clique que o navegador dispara ao soltar não escolhe nada.
        onClickCapture={(e) => { if (moveuRef.current) { e.stopPropagation(); e.preventDefault(); moveuRef.current = false; } }}
      >
        {items.map((it, i) => {
          let d = i - sel - arrasto;
          if (d > items.length / 2) d -= items.length;
          if (d < -items.length / 2) d += items.length;
          const ad = Math.abs(d);
          const on = i === sel;
          const escolhida = picked && on;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => (on ? onPick(it.id) : setSel(i))}
              aria-label={on ? `${cta}: ${it.nome}` : `Ver ${it.nome}`}
              tabIndex={ad > 1 ? -1 : 0}
              className="fj-carta"
              style={{
                transform: `translate(-50%,-50%) translateX(${d * 62}%) rotateY(${d * -32}deg) scale(${1 - ad * 0.14})`,
                zIndex: 10 - ad,
                // Esmaece contínuo com a distância (sem "estalo" em 2), e
                // some antes da costura da volta: a carta que troca de
                // ponta atravessa invisível, sem cruzar a tela.
                opacity: Math.max(0, Math.min(1, 1 - ad * 0.3, (items.length / 2 - ad) * 1.5)),
                visibility: ad > items.length / 2 - 0.4 ? "hidden" : undefined,
                filter: `brightness(${Math.max(0.3, 1 - ad * 0.45)}) saturate(${Math.max(0.4, 1 - ad * 0.6)})`,
              }}
            >
              <div className={`fj-ch fj-carta__borda ${on ? (picked ? "fj-carta__borda--escolhida" : "fj-carta__borda--foco") : ""}`}>
                <div className="fj-ch fj-carta__corpo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.img} alt="" className="fj-carta__arte" />
                  <div className="fj-carta__veu" />
                  <div className="fj-scan fj-cobre fj-carta__scan" />
                  <div className="fj-carta__topo">{it.top}</div>
                  <div className="fj-carta__base">
                    <div className={`fj-carta__marca ${escolhida ? "fj-carta__marca--escolhida" : ""}`} style={it.color ? { background: it.color, boxShadow: `0 0 10px ${it.color}` } : undefined} />
                    <div className="fj-carta__nome">{it.nome}</div>
                    <div className="fj-carta__sub">{it.sub}</div>
                  </div>
                  {escolhida && <div className="fj-carta__selo">Selecionado</div>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="fj-carrossel__controles">
        <button type="button" onClick={() => go(-1)} className="fj-seta fj-seta--esq" aria-label="Anterior" />
        <button type="button" onClick={() => onPick(atual.id)} className={`fj-ch fj-carrossel__cta ${picked ? "fj-carrossel__cta--escolhido" : ""}`}>
          {picked ? `✓ ${atual.nome}` : cta}
        </button>
        <button type="button" onClick={() => go(1)} className="fj-seta fj-seta--dir" aria-label="Próximo" />
      </div>
      <div className="fj-carrossel__pontos" aria-hidden="true">
        {items.map((it, i) => <span key={it.id} className={`fj-carrossel__ponto ${i === sel ? "fj-carrossel__ponto--atual" : ""}`} />)}
      </div>
    </div>
  );
}
