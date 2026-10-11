import type { LucideProps } from "lucide-react";

/** Desenho fornecido pelo usuário, reconstruído por linhas centrais.
 * Usa a mesma caixa, margens e contrato de stroke do Lucide. */
export function AmmoIcon({ size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, children, ...props }: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M5.5 9.5 8 3l2.5 6.5V17l-.6 1.5.6 1.5v1h-5v-1l.6-1.5-.6-1.5V9.5Z" />
      <path d="M5.5 15.5h5" />
      <path d="M13.5 9.5 16 3l2.5 6.5V17l-.6 1.5.6 1.5v1h-5v-1l.6-1.5-.6-1.5V9.5Z" />
      <path d="M13.5 15.5h5" />
      {children}
    </svg>
  );
}
