import type { CSSProperties } from "react";
import { oxanium } from "./oxanium";
import "./marca.css";

/** O logotipo RUPTURA com o brilho e o eco da Forja. Veja `marca.css`. */
export function MarcaRuptura({ className = "", style, como: Tag = "h1" }: {
  className?: string;
  style?: CSSProperties;
  /** `span` quando a página já tem o próprio h1 (ex.: a marca da barra lateral). */
  como?: "h1" | "span";
}) {
  return (
    <Tag className={`ds-marca ${oxanium.variable} ${className}`} style={style}>
      <span className="ds-marca__logo">RUPTURA</span>
      <span aria-hidden="true" className="ds-marca__eco">RUPTURA</span>
    </Tag>
  );
}
