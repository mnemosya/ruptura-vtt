import type { LucideProps } from "lucide-react";

/** Armação dorsal com eixo e suportes, distinta da bolsa da mochila. */
export function DorsalStructureIcon({ size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, children, ...props }: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M10 3h4v18h-4zM10 5H6v14h4M14 5h4v14h-4M6 10h4M14 10h4M6 15h4M14 15h4" />
      {children}
    </svg>
  );
}
