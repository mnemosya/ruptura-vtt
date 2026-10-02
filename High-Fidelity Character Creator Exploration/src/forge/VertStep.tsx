import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import raw from './vertentes.json'
import { VERTENTES, type Build } from './data'
import { Key, Mono, Panel } from './ui'
import { RuleText, SecHead, Shell } from './ClassStep'
import cinetica from '../imports/cinetica.png'
import cognitiva from '../imports/cognitiva.png'
import energetica from '../imports/energetica.png'
import material from '../imports/material.png'
import sinaptica from '../imports/sinaptica.png'
import biotica from '../imports/biotica.png'

/* Vertente: resumo no painel direito + escolha de magias no Códex completo */
type Spell = { n: string; tags: string[]; type: string; range: string; dur: string; req: string; d: string }
type VertDoc = {
  desc: string; house: string; diff: string; lead: string; quote: string[]; attr: string; body: string[]
  cast: string; castLabel: string; manif: string; prog: { lv: number; n: number; cd: number }[]
  levels: { lv: number; note: string; spells: Spell[] }[]
}
const DOCS = raw as Record<string, VertDoc>
export const VERT_ART: Record<string, string> = { 'Biótica': biotica, 'Cinética': cinetica, 'Cognitiva': cognitiva, 'Energética': energetica, 'Material': material, 'Sináptica': sinaptica }
export const vertArt = (id: string) => VERT_ART[id]
/* magias iniciais = magias aprendidas no nível 1 (tabela da vertente) */
export const spellNeed = (id: string) => DOCS[id].prog[0].n

type Set = (p: Partial<Build>) => void
const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
const vmeta = (id: string) => VERTENTES.find(v => v.id === id)!

function useSpells(id: string, b: Build, set: Set) {
  const tuned = b.vert === id, need = spellNeed(id)
  const spells = tuned ? b.spells : []
  const toggle = (n: string) => {
    const on = spells.includes(n)
    set({ vert: id, spells: on ? spells.filter(x => x !== n) : spells.length < need ? [...spells, n] : spells })
  }
  return { tuned, need, spells, toggle }
}

/* ================= painel direito ================= */
/* resumo curto de como cada vertente é conjurada (dos documentos) */
const TRIGGER: Record<string, string> = {
  'Biótica': 'Foco mental + domínio corporal', 'Cinética': 'Movimento corporal', 'Cognitiva': 'Silêncio — só o pensamento',
  'Energética': 'Controle preciso das mãos', 'Material': 'Cálculo + gestos precisos', 'Sináptica': 'Mente, com gestos de interface',
}
const DIFF = { 'Fácil': 1, 'Média': 2, 'Difícil': 3 } as Record<string, number>
const plain = (s: string) => s.replace(/\*\*/g, '')

function DiffPips({ diff, col }: { diff: string; col: string }) {
  const n = DIFF[diff] ?? 2
  return <span className="inline-flex items-center gap-2"><span className="flex gap-1">{[1, 2, 3].map(i => <span key={i} className="h-2.5 w-4 -skew-x-[20deg]" style={{ background: i <= n ? col : '#3ff0ff1a' }} />)}</span><span className="text-ice">{diff}</span></span>
}

function Slots({ id, b }: { id: string; b: Build }) {
  const need = spellNeed(id), have = b.vert === id ? b.spells.length : 0
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex gap-1.5">{Array.from({ length: need }).map((_, i) => <span key={i} className={`h-3 w-3 rotate-45 border ${i < have ? 'border-amb bg-amb shadow-[0_0_8px_#ff8a1f]' : 'border-cy/40'}`} />)}</span>
      <Mono className="!text-[10px]">{have}/{need} magias · escolha no códex</Mono>
    </div>
  )
}

function CodexButton({ id, onOpen }: { id: string; onOpen: () => void }) {
  const v = vmeta(id), d = DOCS[id]
  return (
    <button onClick={onOpen} className="group relative block w-full text-left">
      <span className="edge ch block transition group-hover:[filter:drop-shadow(0_0_10px_#3ff0ff66)]">
        <span className="ch relative flex items-center gap-4 overflow-hidden bg-gradient-to-r from-[#0b2a35] to-[#061820] py-3 pl-3 pr-4">
          <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[20deg] bg-gradient-to-r from-transparent via-cy/20 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
          <span className="ch-hex relative h-12 w-14 shrink-0 overflow-hidden p-px" style={{ background: v.c + '55' }}>
            <img src={vertArt(id)} alt="" className="ch-hex h-full w-full object-cover grayscale transition group-hover:grayscale-0" />
          </span>
          <span className="relative min-w-0 flex-1">
            <Mono className="!text-[9px] !text-amb">Grimório · {d.house}</Mono>
            <span className="block font-display text-[15px] font-bold uppercase tracking-[0.14em] text-ice transition group-hover:text-cy">Abrir códex e magias</span>
          </span>
          <span className="relative flex items-center gap-1 font-display text-lg text-cy">
            <span className="opacity-30 transition group-hover:translate-x-1 group-hover:opacity-60">›</span>
            <span className="opacity-60 transition group-hover:translate-x-1.5 group-hover:opacity-100">›</span>
          </span>
        </span>
      </span>
      <span className="mt-1.5 flex justify-end px-1"><Key k="I" /></span>
    </button>
  )
}

/* Essência — imagem e uma frase; o resto fica no códex */
function Essence({ id, b }: { id: string; b: Build }) {
  const v = vmeta(id), d = DOCS[id]
  return (
    <div className="space-y-5">
      <div className="relative -mx-4 h-48 overflow-hidden">
        <img src={vertArt(id)} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071820] via-[#071820]/20 to-transparent" />
        <div className="absolute inset-x-4 bottom-3">
          <Mono className="!text-[10px]" >{d.house}</Mono>
          <div className="mt-1 h-[2px] w-12" style={{ background: v.c, boxShadow: `0 0 10px ${v.c}` }} />
        </div>
      </div>
      <div>
        <p className="font-display text-[22px] font-semibold leading-tight text-ice">{d.desc}</p>
        <p className="mt-2 text-[16px] leading-snug text-ice/70">{plain(d.lead).split('. ').slice(1).join('. ') || plain(d.lead)}</p>
      </div>
      <div className="flex items-center justify-between border-y border-cy/15 py-2.5 font-sans text-[15px]">
        <DiffPips diff={d.diff} col={v.c} />
        <span className="text-right text-ice/70">{TRIGGER[id]}</span>
      </div>
      <Slots id={id} b={b} />
    </div>
  )
}

export function VertRight({ b, set, id }: { b: Build; set: Set; id: string }) {
  const [open, setOpen] = useState(false)
  const v = vmeta(id), tuned = b.vert === id

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'i' || e.key === 'I') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setOpen(true) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <>
      <Panel title={v.id} amber={tuned}>
        <div className={`-mx-4 -mt-4 flex items-center justify-between px-4 py-1.5 ${tuned ? 'bg-amb text-abyss' : 'bg-cy/10 text-cy'}`}>
          <span className="font-mono text-[10px] tracking-[0.25em]">{tuned ? '✓ SINTONIZADA' : 'VISUALIZANDO · NÃO SINTONIZADA'}</span>
          {!tuned && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cy" />}
        </div>
        <div key={id} className="boot"><Essence id={id} b={b} /></div>
        <div className="mt-5"><CodexButton id={id} onOpen={() => setOpen(true)} /></div>
      </Panel>

      {open && createPortal(<Shell onClose={() => setOpen(false)}><VertCodex id={id} b={b} set={set} onClose={() => setOpen(false)} /></Shell>, document.body)}
    </>
  )
}

/* ================= Códex da vertente ================= */
function VertCodex({ id, b, set, onClose }: { id: string; b: Build; set: Set; onClose: () => void }) {
  const d = DOCS[id], v = vmeta(id)
  const { tuned, need, spells, toggle } = useSpells(id, b, set)
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('visao')
  const toc = [
    { k: 'visao', label: 'Visão geral' },
    { k: 'pratica', label: 'Prática', kids: [{ k: 'cast', label: d.castLabel }, { k: 'manif', label: 'Manifestação' }, { k: 'prog', label: 'Progressão' }] },
    { k: 'magias', label: 'Magias', kids: d.levels.map(l => ({ k: `lv-${l.lv}`, label: `Nível ${l.lv} · ${l.spells.length}` })) },
  ]

  useEffect(() => {
    const root = scroller.current!
    const io = new IntersectionObserver(es => { const x = es.filter(e => e.isIntersecting).sort((a, z) => a.boundingClientRect.top - z.boundingClientRect.top)[0]; if (x) setActive(x.target.id) }, { root, rootMargin: '0px 0px -70% 0px' })
    root.querySelectorAll('[data-sec]').forEach(n => io.observe(n))
    return () => io.disconnect()
  }, [id])
  const go = (k: string) => scroller.current?.querySelector(`[id="${k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="edge ch flex h-full flex-col" style={{ '--vc': v.c } as CSSProperties}><div className="ch glass flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-4 border-b border-cy/25 bg-gradient-to-r from-cy/15 to-transparent px-5 py-3">
        <span className="ch-hex h-9 w-10 shrink-0" style={{ background: v.c, boxShadow: `0 0 14px ${v.c}` }} />
        <div className="min-w-0">
          <Mono className="!text-[10px] !text-cy">Grimório de vertente · Códex</Mono>
          <div className="font-display text-xl font-extrabold uppercase tracking-[0.12em] text-ice">{id}</div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-right sm:block"><Mono className="!text-[9px]">Magias iniciais</Mono><span className="block font-display text-lg font-extrabold text-amb">{spells.length}/{need}</span></span>
          <button onClick={() => set({ vert: id, spells: tuned ? spells : [] })} className={`ch px-6 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.22em] transition ${tuned ? 'bg-amb text-abyss shadow-[0_0_20px_#ff8a1f88]' : 'bg-cy text-abyss shadow-[0_0_20px_#3ff0ff66] hover:bg-ice'}`}>{tuned ? '✓ Sintonizada' : 'Sintonizar'}</button>
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
          <section id="visao" data-sec className="relative overflow-hidden border-b border-cy/15">
            <img src={vertArt(id)} alt="" className="absolute inset-y-0 right-0 h-full w-[55%] object-cover opacity-70 [mask-image:linear-gradient(to_left,black_40%,transparent)]" />
            <div className="relative max-w-[640px] px-8 py-10 md:px-12">
              <Mono className="!text-amb">{d.house} · Dificuldade {d.diff}</Mono>
              <h2 className="mt-2 font-display text-[clamp(40px,5vw,68px)] font-extrabold uppercase leading-[0.9] tracking-[0.03em] text-ice" style={{ textShadow: `0 0 18px ${v.c}88` }}>{id}</h2>
              <RuleText text={d.lead} className="mt-6 text-[19px] leading-relaxed text-ice" />
              <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-ice/80">{d.body.map((p, i) => <p key={i}>{p}</p>)}</div>
              <blockquote className="mt-8 border-l-2 pl-5" style={{ borderColor: v.c }}>
                <div className="space-y-3 text-[16px] italic leading-relaxed text-ice/70">{d.quote.map((q, i) => <p key={i}>{q}</p>)}</div>
                <footer className="mt-3 font-display text-sm font-bold uppercase tracking-[0.2em]" style={{ color: v.c }}>— {d.attr}</footer>
              </blockquote>
            </div>
          </section>

          <div className="mx-auto max-w-[780px] px-8 md:px-12">
            <section id="pratica" data-sec className="py-10">
              <SecHead n="02" t="Prática" />
              <div id="cast" data-sec className="mb-8">
                <h4 className="mb-2 font-display text-lg font-bold uppercase tracking-[0.1em] text-cy">{d.castLabel}</h4>
                <RuleText text={d.cast} className="text-[17px] leading-relaxed text-ice/85" />
              </div>
              <div id="manif" data-sec className="mb-8">
                <h4 className="mb-2 font-display text-lg font-bold uppercase tracking-[0.1em] text-cy">Manifestação</h4>
                <RuleText text={d.manif} className="text-[17px] leading-relaxed text-ice/85" />
              </div>
              <div id="prog" data-sec>
                <h4 className="mb-3 font-display text-lg font-bold uppercase tracking-[0.1em] text-cy">Progressão</h4>
                <div className="grid grid-cols-5 gap-1.5">
                  {d.prog.map(p => (
                    <div key={p.lv} className={`ch px-3 py-3 text-center ${p.lv === 1 ? 'bg-amb/15 ring-1 ring-amb/60' : 'bg-cy/[0.06]'}`}>
                      <Mono className="!text-[9px]">Nível {p.lv}</Mono>
                      <div className="font-display text-2xl font-extrabold text-ice">{p.n}</div>
                      <Mono className="!text-[9px] !text-cy">magias · CD {p.cd}</Mono>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-dim">CD da vertente = 6 + nível. Na criação, a Vertente Primária começa no nível 1.</p>
              </div>
            </section>

            <section id="magias" data-sec className="border-t border-cy/15 py-10">
              <SecHead n="03" t="Magias" />
              {d.levels.map(l => (
                <div key={l.lv} id={`lv-${l.lv}`} data-sec className="mb-12">
                  <div className="ch-l mb-5 flex items-baseline justify-between gap-4 bg-gradient-to-r from-cy/20 to-transparent py-3 pl-6 pr-4">
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-ice">Nível {l.lv}</h3>
                    {l.lv === 1 ? <Mono className="!text-amb">Escolha {need} · {spells.length}/{need}</Mono> : <Mono>Desbloqueia depois</Mono>}
                  </div>
                  {l.note && <p className="mb-5 text-[15px] italic text-dim">{l.note}</p>}
                  <div className="space-y-4">
                    {l.spells.map(s => <SpellCard key={s.n} s={s} col={v.c} pick={l.lv === 1 ? { on: spells.includes(s.n), full: spells.length >= need, toggle: () => toggle(s.n) } : undefined} />)}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div></div>
  )
}

function SpellCard({ s, col, pick }: { s: Spell; col: string; pick?: { on: boolean; full: boolean; toggle: () => void } }) {
  const on = pick?.on
  return (
    <article className={`border-l-2 py-4 pl-5 pr-4 transition ${on ? 'bg-amb/[0.07]' : 'bg-cy/[0.03]'}`} style={{ borderColor: on ? 'var(--color-amb)' : col + '88' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="font-display text-xl font-bold uppercase tracking-[0.08em] text-ice">{title(s.n)}</h5>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {s.tags.map(t => <span key={t} className="bg-cy/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-cy">{t}</span>)}
            {s.type && <span className="px-1.5 py-0.5 font-mono text-[10px] tracking-wider" style={{ color: col, background: col + '1a' }}>{s.type.toUpperCase()}</span>}
          </div>
        </div>
        {pick && (
          <button onClick={pick.toggle} disabled={!on && pick.full} className={`ch-tab py-1.5 pl-3 pr-6 font-display text-[12px] font-extrabold uppercase tracking-[0.15em] transition disabled:opacity-30 ${on ? 'bg-amb text-abyss' : 'bg-cy/10 text-cy hover:bg-cy hover:text-abyss'}`}>{on ? '✓ Vinculada' : '+ Vincular'}</button>
        )}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
        {[['Alcance', s.range], ['Duração', s.dur], ['Requisito', s.req]].filter(([, x]) => x).map(([k, x]) => (
          <div key={k}><dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-dim">{k}</dt><dd className="text-ice/90">{x}</dd></div>
        ))}
      </dl>
      <RuleText text={s.d} className="mt-3 text-[16px] leading-relaxed text-ice/80" />
    </article>
  )
}
