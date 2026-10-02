import type { CSSProperties } from "react";
import { oxanium } from "./oxanium";
import "./marca.css";

/** O logotipo RUPTURA com o brilho e o eco da Forja. Veja `marca.css`. */
export function MarcaRuptura({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <h1 className={`ds-marca ${oxanium.variable} ${className}`} style={style}>
      <span className="ds-marca__logo">RUPTURA</span>
      <span aria-hidden="true" className="ds-marca__eco">RUPTURA</span>
    </h1>
  );
}
