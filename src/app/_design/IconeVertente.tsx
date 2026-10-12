import { Radio } from "lucide-react";
import { ICONES_VERTENTE } from "./iconesVertente";

/** Ícone da Vertente no tamanho `tam`, pintado em `cor`. Slug canônico (`biotica`…). */
export function IconeVertente({ vertente, tam = 20, cor }: { vertente: string; tam?: number; cor: string }) {
  const icone = ICONES_VERTENTE[vertente as keyof typeof ICONES_VERTENTE];
  if (!icone) return <Radio size={tam} color={cor} strokeWidth={1.8} aria-hidden="true" />;
  return (
    <svg viewBox={icone.viewBox ?? "0 0 90 90"} width={tam} height={tam} fill={cor} aria-hidden="true">
      {icone.paths.map((d, i) => <path key={i} d={d} fillRule={icone.evenodd ? "evenodd" : undefined} clipRule={icone.evenodd ? "evenodd" : undefined} />)}
    </svg>
  );
}
