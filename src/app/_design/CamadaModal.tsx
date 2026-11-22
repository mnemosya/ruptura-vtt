"use client";

/**
 * Caixa de modal que entra na pilha de camadas (`camadas.ts`): Esc fecha
 * só ela, Tab fica contido, foco entra ao abrir e volta a quem abriu.
 *
 * Para modais que moram no meio de um componente grande e condicional
 * (`{aberto && <div role="dialog">…}`), onde o hook não pode ser chamado
 * no lugar. Troca-se a `<div>` do diálogo por esta; o resto do markup e
 * o CSS ficam iguais.
 */

import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { useCamada } from "./camadas";

export const CamadaModal = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  /** `null`: consome o Esc sem fechar (fluxo que não se dispensa). */
  fechar: (() => void) | null;
}>(function CamadaModal({ fechar, children, ...resto }, refExterno) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(refExterno, () => ref.current as HTMLDivElement);
  useCamada({ aberta: true, fechar, raiz: ref, modal: true });
  return (
    <div ref={ref} {...resto}>
      {children}
    </div>
  );
});
