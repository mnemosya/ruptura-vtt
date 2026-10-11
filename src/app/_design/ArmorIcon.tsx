import type { LucideProps } from "lucide-react";

/** Colete do SVG fornecido pelo usuário, com traços e margens Lucide. */
export function ArmorIcon({ size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, children, ...props }: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M6 8V3h3v2c0 2 6 2 6 0V3h3v5l3 3v10H3V11l3-3Z" />
      <path d="M6 8h12M6 8v13M18 8v13M3 17h18M3 19h18" />
      <path d="M9 10h6v5H9z" />
      {children}
    </svg>
  );
}
