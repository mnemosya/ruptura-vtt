import type { LucideProps } from "lucide-react";
import { WEAPON_ICON_DATA } from "./weaponIconData";

/** Preserva os desenhos da pasta icones e ajusta caixa, cor e peso óptico. */
export function WeaponIcon({ weapon, size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, children, ...props }: LucideProps & { weapon: keyof typeof WEAPON_ICON_DATA }) {
  const art = WEAPON_ICON_DATA[weapon];
  const weight = absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : Number(strokeWidth);
  const dimension = Math.max(art.width, art.height);
  const scale = Math.min(20 / dimension, (20 - weight) / (dimension - art.nativeStrokeWidth));
  // Os arquivos são contornos expandidos (fill), não linhas SVG. A borda
  // adicional compensa a espessura original após normalizar o tamanho.
  const extraStroke = Math.max(0, weight - art.nativeStrokeWidth * scale) / scale;
  const x = (24 - art.width * scale) / 2, y = (24 - art.height * scale) / 2;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" data-weapon-icon={weapon} aria-hidden="true" focusable="false" {...props}>
      <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color} stroke={color} strokeWidth={extraStroke} strokeLinecap="round" strokeLinejoin="round">
        {art.paths.map((path, i) => <path key={i} d={path.d} fillRule={path.fillRule} />)}
      </g>
      {children}
    </svg>
  );
}
