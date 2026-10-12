import type { LucideProps } from "lucide-react";
import { FILLED_ICON_DATA } from "./filledIconData";

export type FilledIconName = keyof typeof FILLED_ICON_DATA;

/** Normaliza os desenhos filled sem adicionar contornos às silhuetas. */
export function FilledIcon({ icon, size = 24, color = "currentColor", strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, children, ...props }: LucideProps & { icon: FilledIconName }) {
  const art = FILLED_ICON_DATA[icon];
  const [vx, vy, width, height] = art.viewBox;
  const scale = 20 / Math.max(width, height);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-filled-icon={icon} {...props}>
      <g transform={`translate(${(24 - width * scale) / 2 - vx * scale} ${(24 - height * scale) / 2 - vy * scale}) scale(${scale})`} fill={color} stroke="none">
        {art.paths.map((path, i) => <path key={i} d={path.d} fillRule={path.fillRule} transform={"transform" in path ? path.transform : undefined} />)}
      </g>
      {children}
    </svg>
  );
}
