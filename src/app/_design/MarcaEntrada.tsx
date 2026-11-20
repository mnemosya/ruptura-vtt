"use client";

import { useEffect, useRef, useState } from "react";
import { oxanium } from "./oxanium";
import "./marca.css";

const TEXTO = "RUPTURA";
const GLIFOS = "ABCDEFGHJKLMNPRSTUVXZ0123456789/#%<>";

/**
 * A marca RUPTURA com entrada "decodifica" (~550ms, uma vez ao montar):
 * cada letra começa como glifo ciano e assenta da esquerda pra direita.
 * A letra real fica embaixo guardando a largura, então nada pula. O eco
 * laranja só começa a falhar depois. Com "reduzir movimento", aparece
 * pronta. Fora do login, use `MarcaRuptura`.
 */
export function MarcaEntrada({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPronto(true); return; }
    const letras = Array.from(el.querySelectorAll<HTMLElement>(".ds-marca__letra"));
    const inicio = performance.now() + 120;
    // setInterval e não rAF: numa aba que carrega escondida o rAF não roda
    // e as letras ficariam transparentes até alguém olhar.
    const id = window.setInterval(() => {
      const t = performance.now();
      let todas = true;
      letras.forEach((l, i) => {
        const fixa = t >= inicio + i * 60 + 60;
        l.dataset.fixa = fixa ? "1" : "0";
        if (!fixa) {
          todas = false;
          l.dataset.glifo = GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
        }
      });
      if (todas) { window.clearInterval(id); setPronto(true); }
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  return (
    <h1
      ref={ref}
      className={`ds-marca ds-marca--entrada ${oxanium.variable} ${className}`}
      data-pronto={pronto ? "1" : "0"}
      aria-label={TEXTO}
    >
      <span className="ds-marca__logo" aria-hidden="true">
        {TEXTO.split("").map((c, i) => (
          <span key={i} className="ds-marca__letra" data-fixa="0">{c}</span>
        ))}
      </span>
      <span aria-hidden="true" className="ds-marca__eco">{TEXTO}</span>
    </h1>
  );
}
