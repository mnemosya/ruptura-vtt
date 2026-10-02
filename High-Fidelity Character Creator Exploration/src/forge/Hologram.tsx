import { CLASSES, REGIONS, VERTENTES, type Build } from './data'

export function Hologram({ b, progress, size = 'lg', solid = false }: { b: Build; progress: number; size?: 'md' | 'lg'; solid?: boolean }) {
  const reg = REGIONS.find(r => r.id === b.region)
  const cls = CLASSES.find(c => c.id === b.cls)
  const vt = VERTENTES.find(v => v.id === b.vert)
  const w = size === 'lg' ? 'w-[min(340px,70vw)]' : 'w-[230px]'
  return (
    <div className={`relative mx-auto ${w}`}>
      {/* light cone */}
      <div className="pointer-events-none absolute -bottom-6 left-1/2 h-[115%] w-[140%] -translate-x-1/2 opacity-60" style={{ background: 'linear-gradient(0deg, color-mix(in srgb, var(--vc) 35%, transparent), transparent 75%)', clipPath: 'polygon(30% 100%, 70% 100%, 100% 0, 0 0)' }} />

      {/* portrait */}
      <div className={`relative aspect-[4/5] ${solid ? '' : progress < 0.5 ? 'flick' : ''}`}>
        <div className="ch-shield absolute inset-0 p-[2px]" style={{ background: 'linear-gradient(180deg, var(--vc), color-mix(in srgb, var(--vc) 10%, transparent) 60%, var(--vc))' }}>
          <div className="ch-shield relative h-full w-full overflow-hidden bg-abyss">
            <img src={b.avatar} alt={`Avatar de ${b.name}`} className="h-full w-full object-cover transition-all duration-1000"
              style={{ filter: solid ? 'contrast(1.05)' : `grayscale(1) contrast(1.25) brightness(${0.8 + progress * 0.4})`, opacity: solid ? 1 : 0.55 + progress * 0.4 }} />
            {!solid && <div className="absolute inset-0 mix-blend-color transition-colors duration-700" style={{ background: 'var(--vc)' }} />}
            {!solid && <div className="absolute inset-0 mix-blend-overlay opacity-40" style={{ background: 'var(--vc)' }} />}
            <div className="scan absolute inset-0" style={{ opacity: solid ? 0.4 : 1 }} />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-abyss/90 to-transparent" />
            {!solid && <div className="beam absolute inset-x-0 h-10" style={{ background: 'linear-gradient(transparent, color-mix(in srgb, var(--vc) 45%, transparent), transparent)' }} />}
            <div className="absolute inset-x-4 bottom-[22%] text-center">
              <div className="font-display text-2xl font-extrabold uppercase tracking-[0.12em] text-ice glow">{b.name || '———'}</div>
              {b.codename && <div className="font-mono text-[11px] tracking-[0.4em]" style={{ color: 'var(--vc)' }}>«{b.codename}»</div>}
            </div>
          </div>
        </div>

        {/* attached shards */}
        <Shard on={!!reg} className="-left-16 top-6" label="ORIGEM" value={reg?.id} sub={reg?.sector} />
        <Shard on={!!b.bg} className="-left-20 top-28" label="ANTECEDENTE" value={b.bg} />
        {cls && (
          <div className="boot absolute -right-10 top-4 grid h-20 w-20 place-items-center">
            <span className="spin absolute inset-0 rounded-full border border-dashed" style={{ borderColor: 'var(--vc)' }} />
            <span className="ch-hex absolute inset-2 bg-abyss/90" style={{ boxShadow: 'inset 0 0 0 1px var(--vc)' }} />
            <div className="relative text-center"><div className="font-display text-lg font-extrabold leading-none" style={{ color: 'var(--vc)' }}>{cls.code}</div><div className="font-mono text-[8px] tracking-widest text-dim">CLASSE</div></div>
          </div>
        )}
        {vt && (
          <div className="boot absolute -right-14 top-28 flex items-center gap-2">
            <span className="ch-hex h-9 w-10 overflow-hidden" style={{ background: vt.c }}><img src={`https://images.unsplash.com/photo-${vt.img}?w=80&h=80&fit=crop`} alt="" className="h-full w-full object-cover mix-blend-luminosity" /></span>
            <span className="font-display text-sm font-bold uppercase" style={{ color: vt.c }}>{vt.id}</span>
          </div>
        )}
      </div>

      {/* projector pedestal */}
      <div className="relative -mt-2 h-16">
        <div className="absolute left-1/2 top-2 h-8 w-[95%] -translate-x-1/2 rounded-[50%] border" style={{ borderColor: 'color-mix(in srgb, var(--vc) 60%, transparent)', boxShadow: '0 0 30px -4px var(--vc), inset 0 0 20px -6px var(--vc)' }} />
        <div className="absolute left-1/2 top-4 h-5 w-[70%] -translate-x-1/2 rounded-[50%] border border-dashed" style={{ borderColor: 'var(--vc)' }} />
        <div className="absolute left-1/2 top-[22px] h-2 w-[40%] -translate-x-1/2 rounded-[50%]" style={{ background: 'var(--vc)', filter: 'blur(6px)' }} />
        <div className="absolute left-1/2 top-12 h-3 w-[110%] -translate-x-1/2 rounded-[50%] bg-cy/5 blur-sm" />
      </div>
      <div className="flex items-center justify-between px-1 font-mono text-[10px] tracking-widest text-dim">
        <span>{solid ? 'REGISTRO MATERIALIZADO' : 'PROJEÇÃO INSTÁVEL'}</span><span style={{ color: 'var(--vc)' }}>SINC {Math.round(progress * 100)}%</span>
      </div>
    </div>
  )
}

function Shard({ on, className, label, value, sub }: { on: boolean; className: string; label: string; value?: string; sub?: string }) {
  if (!on) return null
  return (
    <div className={`boot absolute hidden md:block ${className}`}>
      <div className="flex items-center gap-2">
        <div className="ch-l border-l-2 bg-abyss/85 px-3 py-1.5 text-right" style={{ borderColor: 'var(--vc)' }}>
          <div className="font-mono text-[8px] tracking-[0.25em] text-dim">{label}</div>
          <div className="font-display text-sm font-bold uppercase leading-tight text-ice">{value}</div>
          {sub && <div className="font-mono text-[8px] tracking-widest" style={{ color: 'var(--vc)' }}>{sub}</div>}
        </div>
        <span className="h-px w-6" style={{ background: 'var(--vc)' }} />
      </div>
    </div>
  )
}
