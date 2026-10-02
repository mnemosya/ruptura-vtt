import type { ReactNode } from 'react'

export function Panel({ title, right, children, className = '', amber }: { title?: string; right?: ReactNode; children: ReactNode; className?: string; amber?: boolean }) {
  return (
    <div className={`relative ${className}`}>
      {title && (
        <div className="flex items-end justify-end">
          <div className={`ch-l relative flex items-center gap-3 px-5 py-1.5 pl-8 ${amber ? 'bg-amb/90 text-abyss' : 'bg-gradient-to-r from-cy/5 to-cy/25 text-ice'}`}>
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.18em]">{title}</span>
            {right}
          </div>
        </div>
      )}
      <div className={`${amber ? 'edge-amb' : 'edge'} ch`}>
        <div className="ch glass relative p-4">{children}</div>
      </div>
    </div>
  )
}

export function Brackets({ c = 'border-cy', s = 'h-5 w-5' }: { c?: string; s?: string }) {
  return (
    <>
      <span className={`pointer-events-none absolute left-0 top-0 border-l-2 border-t-2 ${c} ${s}`} />
      <span className={`pointer-events-none absolute right-0 top-0 border-r-2 border-t-2 ${c} ${s}`} />
      <span className={`pointer-events-none absolute bottom-0 left-0 border-b-2 border-l-2 ${c} ${s}`} />
      <span className={`pointer-events-none absolute bottom-0 right-0 border-b-2 border-r-2 ${c} ${s}`} />
    </>
  )
}

export function Seg({ value, max, color = 'bg-cy', w = 'w-3' }: { value: number; max: number; color?: string; w?: string }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`h-2.5 ${w} -skew-x-[20deg] transition ${i < value ? `${color} shadow-[0_0_8px_currentColor]` : 'bg-cy/10'}`} />
      ))}
    </div>
  )
}

export const Mono = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`font-mono text-[11px] uppercase tracking-[0.18em] text-dim ${className}`}>{children}</span>
)

export function Key({ k }: { k: string }) {
  return <span className="grid h-6 min-w-6 place-items-center border border-cy/60 bg-cy/10 px-1 font-mono text-[11px] text-cy">{k}</span>
}

/* simple line glyphs */
const P: Record<string, string> = {
  conceito: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-7 18c0-4 3-7 7-7s7 3 7 7',
  regiao: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5',
  antecedente: 'M5 3h10l4 4v14H5V3Zm10 0v4h4M8 11h8M8 15h8M8 19h5',
  classe: 'M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Zm0 5v10M7 11h10',
  atributos: 'M12 3 21 19H3L12 3Zm0 6v4m0 3v.5',
  vertente: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4 5 9H7l5-9Z',
  revisao: 'M4 12l5 5L20 6M4 4h6M4 20h16',
}
export function Glyph({ k, className = 'h-6 w-6' }: { k: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"><path d={P[k]} /></svg>
}
