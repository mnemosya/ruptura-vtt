import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CAMPAIGN_REGION, REGION_RULES, REGIONS, WORLD_MAP, languages, type Build } from './data'
import { Key, Mono, Panel } from './ui'
import { SecHead, Shell } from './ClassStep'

type Set = (p: Partial<Build>) => void
/* dissolve a arte no painel: esquerda e base transparentes */
const FADE = 'linear-gradient(to left, black 35%, transparent), linear-gradient(to top, transparent, black 30%)'
const reg = (id: string) => REGIONS.find(r => r.id === id)!

/* troca primeiro nome ou sobrenome no campo Nome */
const swapName = (b: Build, part: 'given' | 'last', n: string) => {
  const [g = '', ...rest] = b.name.trim().split(/\s+/)
  return part === 'given' ? [n, ...rest].join(' ') : [g, n].filter(Boolean).join(' ')
}

export function RegionRight({ b, set, id }: { b: Build; set: Set; id: string }) {
  const [open, setOpen] = useState(false)
  const r = reg(id), on = b.region === id
  const langs = languages(id)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'i' || e.key === 'I') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setOpen(true) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <>
      <Panel title={r.id} right={<Mono className="!text-cy">{r.lang}</Mono>} amber={on}>
        <div className={`-mx-4 -mt-4 mb-4 flex items-center justify-between px-4 py-1.5 ${on ? 'bg-amb text-abyss' : 'bg-cy/10 text-cy'}`}>
          <span className="font-mono text-[10px] tracking-[0.25em]">{on ? '✓ ORIGEM FIXADA' : 'VISUALIZANDO · NÃO CONFIRMADA'}</span>
          {!on && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cy" />}
        </div>

        <div key={id} className="boot">
          <Mono className="!text-amb">Como é crescer aqui</Mono>
          <p className="mt-1 font-display text-[19px] font-semibold leading-snug text-ice">{r.grow}</p>
          <p className="mt-3 border-l-2 pl-3 text-[15px] italic leading-snug text-ice/75" style={{ borderColor: r.tint }}>{r.mark}</p>

          <dl className="mt-5 divide-y divide-cy/10 border-y border-cy/15">
            <div className="flex items-baseline justify-between gap-3 py-2"><dt><Mono className="!text-[10px]">Capital</Mono></dt><dd className="font-display text-base font-bold text-ice">{r.capital}</dd></div>
            <div className="flex items-baseline justify-between gap-3 py-2"><dt><Mono className="!text-[10px]">Idiomas</Mono></dt><dd className="text-right font-display text-base font-bold text-amb">{langs.join(' · ')}</dd></div>
          </dl>
          <p className="mt-2 text-[12px] leading-snug text-dim">Mesa começa em {CAMPAIGN_REGION}. {langs.length === 1 ? 'Mesma língua — apenas um idioma.' : `Inclui ${langs[1]} da região da campanha.`}</p>

          <label className="mt-4 block">
            <Mono className="!text-[10px]">Cidade, distrito ou comunidade</Mono>
            <input value={on ? b.town : ''} disabled={!on} onChange={e => set({ town: e.target.value })} placeholder={on ? `Ex.: níveis baixos de ${r.capital}` : 'Fixe a origem para especificar'}
              className="mt-1 w-full border-b border-cy/30 bg-transparent pb-1 font-display text-lg text-ice outline-none transition placeholder:text-dim/70 focus:border-amb disabled:opacity-50" />
          </label>
        </div>

        <button onClick={() => setOpen(true)} className="group relative mt-5 block w-full text-left">
          <span className="edge ch block transition group-hover:[filter:drop-shadow(0_0_10px_#3ff0ff66)]">
            <span className="ch relative flex items-center gap-4 overflow-hidden bg-gradient-to-r from-[#0b2a35] to-[#061820] py-3 pl-3 pr-4">
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[20deg] bg-gradient-to-r from-transparent via-cy/20 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
              <span className="ch-hex relative h-12 w-14 shrink-0 overflow-hidden bg-cy/30 p-px">
                <img src={r.img} alt="" className="ch-hex h-full w-full object-cover grayscale transition group-hover:grayscale-0" />
              </span>
              <span className="relative min-w-0 flex-1">
                <Mono className="!text-[9px] !text-amb">Atlas · Braxus Vantahl</Mono>
                <span className="block font-display text-[15px] font-bold uppercase tracking-[0.14em] text-ice transition group-hover:text-cy">Abrir códex regional</span>
              </span>
              <span className="relative flex items-center gap-1 font-display text-lg text-cy">
                <span className="opacity-30 transition group-hover:translate-x-1 group-hover:opacity-60">›</span>
                <span className="opacity-60 transition group-hover:translate-x-1.5 group-hover:opacity-100">›</span>
              </span>
            </span>
          </span>
          <span className="mt-1.5 flex items-center justify-between px-1">
            <Mono className="!text-[9px]">Mapa · Cultura · Nomes · Regras</Mono>
            <Key k="I" />
          </span>
        </button>
      </Panel>

      {open && createPortal(<Shell onClose={() => setOpen(false)}><RegionCodex start={id} b={b} set={set} onClose={() => setOpen(false)} /></Shell>, document.body)}
    </>
  )
}

/* ================= Códex regional ================= */
function RegionCodex({ start, b, set, onClose }: { start: string; b: Build; set: Set; onClose: () => void }) {
  const [id, setId] = useState(start)
  const r = reg(id), on = b.region === id
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('visao')
  const toc = [
    { k: 'visao', label: 'Visão geral' },
    { k: 'mapa', label: 'Mapa do Império' },
    { k: 'nomes', label: 'Nomes', kids: [{ k: 'n-f', label: 'Femininos' }, { k: 'n-m', label: 'Masculinos' }, { k: 'n-s', label: 'Sobrenomes' }] },
    { k: 'regra', label: 'Regra de origem', kids: [{ k: 'comparar', label: 'Comparar regiões' }] },
  ]

  useEffect(() => {
    const root = scroller.current!
    const io = new IntersectionObserver(es => { const x = es.filter(e => e.isIntersecting).sort((a, z) => a.boundingClientRect.top - z.boundingClientRect.top)[0]; if (x) setActive(x.target.id) }, { root, rootMargin: '0px 0px -70% 0px' })
    root.querySelectorAll('[data-sec]').forEach(n => io.observe(n))
    return () => io.disconnect()
  }, [])
  const go = (k: string) => scroller.current?.querySelector(`[id="${k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!big) return
    // captura o ESC antes do Shell para fechar só o mapa
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setBig(false) } }
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true)
  }, [big])
  const pick = () => set({ region: id, town: on ? b.town : '' })

  return (
    <div className="edge ch flex h-full flex-col" style={{ '--rt': r.tint } as CSSProperties}><div className="ch glass flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-cy/25 bg-gradient-to-r from-cy/15 to-transparent px-5 py-3">
        <span className="ch-hex h-9 w-10 shrink-0 overflow-hidden"><img src={r.img} alt="" className="h-full w-full object-cover" /></span>
        <div className="min-w-0">
          <Mono className="!text-[10px] !text-cy">Região de origem · Códex</Mono>
          <div className="font-display text-xl font-extrabold uppercase tracking-[0.12em] text-ice">{r.id}</div>
        </div>
        {/* troca rápida de região sem sair do códex */}
        <div className="hidden gap-1 lg:flex">
          {REGIONS.map(x => (
            <button key={x.id} onClick={() => setId(x.id)} className={`-skew-x-[20deg] border px-3 py-1 font-display text-[12px] font-bold uppercase tracking-[0.14em] transition ${x.id === id ? 'border-cy bg-cy/20 text-ice' : 'border-cy/20 text-dim hover:text-ice'}`}>
              <span className="inline-block skew-x-[20deg]">{x.id}{b.region === x.id && <span className="ml-1 text-amb">●</span>}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <button onClick={pick} className={`ch px-6 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.22em] transition ${on ? 'bg-amb text-abyss shadow-[0_0_20px_#ff8a1f88]' : 'bg-cy text-abyss shadow-[0_0_20px_#3ff0ff66] hover:bg-ice'}`}>{on ? '✓ Origem fixada' : 'Fixar origem'}</button>
          <button onClick={onClose} className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-ice/70 hover:text-ice"><Key k="ESC" /> Fechar</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[250px_1fr]">
        <nav className="no-sb hidden overflow-y-auto border-r border-cy/15 bg-abyss/40 py-5 md:block">
          {toc.map((t, i) => (
            <div key={t.k} className="mb-3">
              <button onClick={() => go(t.k)} className={`flex w-full items-center gap-3 border-l-2 px-5 py-1.5 text-left ${active === t.k ? 'border-amb text-ice' : 'border-transparent text-ice/70 hover:text-ice'}`}>
                <span className="font-mono text-[10px] text-cy">0{i + 1}</span>
                <span className="font-display text-[14px] font-bold uppercase tracking-[0.12em]">{t.label}</span>
              </button>
              {t.kids?.map(k => (
                <button key={k.k} onClick={() => go(k.k)} className={`block w-full border-l-2 py-1 pl-12 pr-4 text-left text-[14px] transition ${active === k.k ? 'border-amb bg-amb/10 text-amb' : 'border-transparent text-dim hover:text-ice'}`}>{k.label}</button>
              ))}
            </div>
          ))}
        </nav>

        <div ref={scroller} className="min-h-0 overflow-y-auto">
          <section id="visao" data-sec key={id} className="boot relative overflow-hidden border-b border-cy/15">
            {/* arte à direita, como no códex de classe; paisagens são claras, então escurecemos e fundimos à esquerda */}
            <div className="absolute inset-y-0 right-0 w-[60%]" style={{ maskImage: FADE, WebkitMaskImage: FADE, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}>
              <img src={r.img} alt={r.capital} className="h-full w-full object-cover opacity-70" />
            </div>
            <span className="absolute bottom-3 right-4 font-mono text-[10px] tracking-[0.2em] text-ice/70">{r.capital.toUpperCase()}</span>
            <div className="relative max-w-[640px] px-8 py-10 md:px-12">
              <Mono className="!text-amb">Capital · {r.capital} &nbsp;/&nbsp; Idioma · {r.lang}</Mono>
              <h2 className="mt-2 font-display text-[clamp(40px,5vw,68px)] font-extrabold uppercase leading-[0.9] tracking-[0.03em] text-ice" style={{ textShadow: `0 0 18px ${r.tint}88` }}>{r.id}</h2>
              <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-ice/85">{r.lore.map((p, i) => <p key={i} className={i === 0 ? 'text-[19px] text-ice' : ''}>{p}</p>)}</div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="border-l-2 border-cy/60 bg-abyss/60 px-4 py-3"><Mono className="!text-[10px] !text-cy">Como é crescer aqui</Mono><p className="mt-1 text-[15px] leading-snug text-ice/85">{r.grow}</p></div>
                <div className="border-l-2 bg-abyss/60 px-4 py-3" style={{ borderColor: r.tint }}><Mono className="!text-[10px]" >O que marca alguém daqui</Mono><p className="mt-1 text-[15px] leading-snug text-ice/85">{r.mark}</p></div>
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-[880px] px-8 md:px-12">
            <section id="mapa" data-sec className="scroll-mt-4 py-10">
              <SecHead n="02" t="Mapa do Império" />
              <div className="edge ch"><div className="ch relative overflow-hidden bg-deep">
                <WorldMap id={id} origin={b.region} onPin={setId} />
                <button onClick={() => setBig(true)} className="absolute right-3 top-3 flex items-center gap-2 border border-cy/50 bg-abyss/85 px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-cy transition hover:bg-cy hover:text-abyss">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg> Expandir
                </button>
              </div></div>
              <p className="mt-2 text-sm text-dim">Toque em uma capital para trocar a região exibida no códex.</p>
            </section>

            <section id="nomes" data-sec className="scroll-mt-4 border-t border-cy/15 py-10">
              <SecHead n="03" t="Nomes" />
              <p className="mb-6 text-[17px] italic leading-relaxed text-ice/80">{r.namesNote}</p>
              {([['n-f', 'Femininos', r.names.f, 'given'], ['n-m', 'Masculinos', r.names.m, 'given'], ['n-s', 'Sobrenomes', r.names.s, 'last']] as const).map(([k, t, list, part]) => (
                <div key={k} id={k} data-sec className="mb-6 scroll-mt-4">
                  <Mono className="!text-cy">{t}</Mono>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {list.map(n => {
                      const used = b.name.split(/\s+/).includes(n)
                      return <button key={n} onClick={() => set({ name: swapName(b, part, n) })} title={part === 'given' ? 'Usar como primeiro nome' : 'Usar como sobrenome'}
                        className={`border px-3 py-1 font-display text-[15px] font-semibold transition ${used ? 'border-amb bg-amb/15 text-amb' : 'border-cy/20 bg-cy/5 text-ice/85 hover:border-cy hover:text-ice'}`}>{n}</button>
                    })}
                  </div>
                </div>
              ))}
              <p className="text-sm text-dim">Clique para aplicar ao nome do refratário · atual: <span className="font-display font-bold text-ice">{b.name || '—'}</span></p>
            </section>

            <section id="regra" data-sec className="scroll-mt-4 border-t border-cy/15 py-10">
              <SecHead n="04" t="Regra de origem" />
              <div className="space-y-4 text-[17px] leading-relaxed text-ice/85">{REGION_RULES.map((p, i) => <p key={i}>{p}</p>)}</div>
              <div id="comparar" data-sec className="mt-10 scroll-mt-4">
                <Mono className="!text-cy">Comparar regiões</Mono>
                <div className="mt-3 divide-y divide-cy/10 border-y border-cy/15">
                  {REGIONS.map(x => (
                    <button key={x.id} onClick={() => setId(x.id)} className={`grid w-full gap-x-6 gap-y-1 px-3 py-3 text-left transition md:grid-cols-[120px_1fr_1fr] ${x.id === id ? 'bg-cy/10' : 'hover:bg-cy/5'}`}>
                      <span className="flex items-center gap-2 font-display text-[16px] font-extrabold uppercase tracking-wide text-ice"><span className="h-2 w-2 rotate-45" style={{ background: x.tint }} />{x.id}</span>
                      <span className="text-[14px] leading-snug text-ice/75">{x.grow}</span>
                      <span className="text-[14px] italic leading-snug text-dim">{x.mark}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* portal no body: o Shell usa transform, o que prenderia o fixed dentro do códex */}
      {big && createPortal(
        <div onClick={() => setBig(false)} style={{ zIndex: 1000 }} className="fixed inset-0 flex flex-col bg-abyss/90 p-3 backdrop-blur md:p-6" role="dialog" aria-modal aria-label="Mapa do Império">
          <div onClick={e => e.stopPropagation()} className="mb-3 flex w-full flex-wrap items-center gap-4">
            <div><Mono className="!text-[10px] !text-cy">Atlas imperial</Mono><div className="font-display text-xl font-extrabold uppercase tracking-[0.14em] text-ice">Braxus Vantahl</div></div>
            <div className="flex flex-wrap gap-1">
              {REGIONS.map(x => (
                <button key={x.id} onClick={() => setId(x.id)} className={`flex items-center gap-2 border px-3 py-1 font-display text-[12px] font-bold uppercase tracking-[0.14em] transition ${x.id === id ? 'border-cy bg-cy/20 text-ice' : 'border-cy/20 text-dim hover:text-ice'}`}>
                  <span className="h-2 w-2 rotate-45" style={{ background: x.tint }} />{x.id}
                </button>
              ))}
            </div>
            <button onClick={() => setBig(false)} className="ml-auto flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-ice/70 hover:text-ice"><Key k="ESC" /> Fechar mapa</button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center">
            <div onClick={e => e.stopPropagation()} className="edge ch max-h-full w-full max-w-[min(100%,calc((100vh-8rem)*2.56))]"><div className="ch relative overflow-hidden bg-deep">
              <WorldMap id={id} origin={b.region} onPin={setId} big />
            </div></div>
          </div>
          <div onClick={e => e.stopPropagation()} className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 self-start">
            <span className="font-display text-lg font-extrabold uppercase tracking-wide text-ice">{r.id}</span>
            <Mono>Capital · {r.capital}</Mono>
            <span className="text-[15px] text-ice/75">{r.grow}</span>
          </div>
        </div>, document.body)}
    </div></div>
  )
}

function WorldMap({ id, origin, onPin, big }: { id: string; origin: string; onPin: (id: string) => void; big?: boolean }) {
  return (
    <>
      <img src={WORLD_MAP} alt="Mapa de Braxus Vantahl" className="block w-full" />
      <div className="pointer-events-none absolute inset-0 bg-cy/10 mix-blend-color" />
      {REGIONS.map(x => {
        const cur = x.id === id
        return (
          <button key={x.id} onClick={() => onPin(x.id)} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x.pin.x}%`, top: `${x.pin.y}%` }} aria-label={x.id}>
            {cur && <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border ${big ? 'h-20 w-20' : 'h-14 w-14'}`} style={{ borderColor: x.tint }} />}
            <span className={`block rotate-45 border-2 transition ${big ? 'h-5 w-5' : 'h-4 w-4'} ${cur ? 'scale-125' : 'opacity-70 group-hover:opacity-100'}`} style={{ borderColor: x.tint, background: cur ? x.tint : '#04131acc', boxShadow: `0 0 12px ${x.tint}` }} />
            <span className={`absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap bg-abyss/85 px-2 py-0.5 font-mono tracking-[0.18em] transition ${big ? 'text-[12px]' : 'text-[10px]'} ${cur || big ? 'text-ice' : 'text-dim opacity-0 group-hover:opacity-100'}`}>{x.capital.toUpperCase()}{origin === x.id && <span className="text-amb"> · ORIGEM</span>}</span>
          </button>
        )
      })}
    </>
  )
}
