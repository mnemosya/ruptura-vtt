"use client";

import { useId, useMemo } from "react";
import type { IluminacaoCena } from "../../../../../lib/vtt/lightStorage";
import { paredesEmPixels, poligonoLuz } from "../_dominio/iluminacao";
import { hexParaPixel, type Hex } from "./hex";

export function CamadaIluminacao({ iluminacao, visoes, tokens, tamanho, limites, narrador }: {
  iluminacao: IluminacaoCena | null;
  visoes: { pos: Hex; noturna: boolean }[];
  tokens: { id: string; pos: Hex; direcao: number; visivel: boolean }[];
  tamanho: number;
  limites: { minX: number; minY: number; maxX: number; maxY: number };
  narrador: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const modo = iluminacao?.modo ?? "escuro"; // falha de leitura: fechar a máscara, nunca revelar.
  const paths = useMemo(() => {
    if (!iluminacao || narrador || modo === "claro") return { visao: [], luz: [] };
    const paredesVisao = paredesEmPixels(iluminacao.paredes, tamanho, "visao");
    const paredesLuz = paredesEmPixels(iluminacao.paredes, tamanho, "luz");
    const visao = visoes.map((v) => poligonoLuz(v.pos, 12, paredesVisao, tamanho));
    const luz = iluminacao.fontes.filter((f) => f.ativa && f.visivel).flatMap((f) => {
      const token = f.tokenId ? tokens.find((t) => t.id === f.tokenId && t.visivel) : null;
      const origem = token?.pos ?? f.origem;
      if (!origem) return [];
      const direcao = (f.direcaoGraus + (token?.direcao ?? 0) * 60) % 360;
      return [poligonoLuz(origem, f.raioM, paredesLuz, tamanho,
        f.formato === "cone" && f.aberturaGraus ? { direcaoGraus: direcao, aberturaGraus: f.aberturaGraus } : undefined)];
    });
    if (modo === "escuro") for (const v of visoes) {
      if (v.noturna) luz.push(poligonoLuz(v.pos, 12, paredesVisao, tamanho));
    }
    return { visao, luz };
  }, [iluminacao, narrador, modo, tamanho, visoes, tokens]);
  if (narrador || modo === "claro") return null;
  const { minX, minY, maxX, maxY } = limites;
  return <g className="rv-camada-iluminacao" pointerEvents="none" aria-hidden="true">
    <defs>
      <clipPath id={`${id}-visao`} clipPathUnits="userSpaceOnUse">
        {paths.visao.map((d, i) => <path key={i} d={d} />)}
      </clipPath>
      <mask id={`${id}-mascara`} maskUnits="userSpaceOnUse" x={minX} y={minY} width={maxX - minX} height={maxY - minY}>
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="white" />
        {modo === "penumbra" ? paths.visao.map((d, i) => <path key={i} d={d} fill="black" />)
          : <g clipPath={`url(#${id}-visao)`}>
            {paths.luz.map((d, i) => <path key={i} d={d} fill="black" />)}
            {visoes.map((v, i) => { const c = hexParaPixel(v.pos, tamanho); return <circle key={`self-${i}`} cx={c.x} cy={c.y} r={tamanho * 0.95} fill="black" />; })}
          </g>}
      </mask>
    </defs>
    <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
      fill="#02040a" opacity={modo === "penumbra" ? 0.68 : 0.96} mask={`url(#${id}-mascara)`} />
  </g>;
}
