"use client";

/**
 * O véu de carregamento da Forja, na mesma linguagem da chegada à área
 * autenticada ("ENTRANDO NA MALHA", em areaV1.css): escuro radial, ponto
 * pulsando e o rótulo em mono. Quando a Forja fica pronta o véu não some de
 * uma vez: dissolve (0,7s após 0,25s) enquanto a Forja pousa por baixo.
 */

import { useState } from "react";

export function VeuForja({ pronto }: { pronto: boolean }) {
  const [foi, setFoi] = useState(false);
  if (foi) return null;
  return (
    <div
      className="fj-veu"
      data-sai={pronto ? "" : undefined}
      aria-hidden={pronto}
      role={pronto ? undefined : "status"}
      onAnimationEnd={(e) => { if (e.animationName === "fj-veu-abre") setFoi(true); }}
    >
      <span className="fj-veu-ponto" />
      Preparando a Forja
    </div>
  );
}
