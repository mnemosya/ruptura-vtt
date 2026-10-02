import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CLASSES, CLASS_ART, CLASS_DOCS, VERTENTES, type Build, type Rank } from './data'
import { Key, Mono, Panel } from './ui'

/* Classe: resumo no painel direito + dossiê completo (Códex) em modal */

type Set = (p: Partial<Build>) => void
const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
const doc = (id: string) => CLASS_DOCS[id]
const meta = (id: string) => CLASSES.find(c => c.id === id)!
const vcol = (v: string) => VERTENTES.find(x => x.id === v)?.c ?? '#3ff0ff'

/* texto de regra: parágrafos, linhas em lista e **destaques** */
export function RuleText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {text.split('\n\n').map((p, i) => {
        const marked = p.includes('›'), multi = p.includes('\n')
        return (
          <div key={i} className={multi ? 'space-y-1.5' : ''}>
            {p.split('\n').map((raw, j) => {
              const item = marked ? raw.startsWith('›') : multi
              const line = raw.replace(/^›\s*/, '')
              return (
              <p key={j} className={item ? 'relative pl-5' : ''}>
                {item && <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rotate-45 bg-cy/70" />}
                {line.split(/(\*\*[^*]+\*\*)/).map((t, k) => t.startsWith('**') ? <strong key={k} className="font-semibold text-amb">{t.slice(2, -2)}</strong> : t)}
              </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function Feats({ rank, accent }: { rank: Rank; accent?: boolean }) {
  return (
    <div className="space-y-6">
      {rank.feats.map(f => (
        <article key={f.n}>
          <h5 className={`mb-2 font-display text-lg font-bold uppercase tracking-[0.1em] ${accent ? 'text-amb' : 'text-cy'}`}>{title(f.n)}</h5>
          <RuleText text={f.d} className="text-[17px] leading-relaxed text-ice/85" />
        </article>
      ))}
    </div>
  )
}

function Synergy({ id }: { id: string }) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {doc(id).syn.map(s => (
        <div key={s.v} title={s.d} className="flex items-center justify-between gap-3 border-b border-cy/10 pb-1.5">
          <span className="font-display text-sm font-semibold uppercase tracking-wider text-ice/85">{s.v}</span>
          <span className="flex gap-1">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="h-2 w-2 rotate-45" style={{ background: i < s.n ? vcol(s.v) : '#3ff0ff1a', boxShadow: i < s.n ? `0 0 6px ${vcol(s.v)}` : undefined }} />)}</span>
        </div>
      ))}
    </div>
  )
}

function Pick({ id, b, set }: { id: string; b: Build; set: Set }) {
  const on = b.cls === id
  return (
    <button onClick={() => set({ cls: id })} className={`ch px-6 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.22em] transition ${on ? 'bg-amb text-abyss shadow-[0_0_20px_#ff8a1f88]' : 'bg-cy text-abyss shadow-[0_0_20px_#3ff0ff66] hover:bg-ice'}`}>
      {on ? `✓ ${id} assumida` : 'Assumir classe'}
    </button>
  )
}

/* ================= painel direito: o "cheiro" da classe ================= */
export function ClassRight({ b, set, id }: { b: Build; set: Set; id: string }) {
  const [open, setOpen] = useState(false)
  const d = doc(id), c = meta(id), on = b.cls === id
  const now = d.feats.find(r => r.r === 'F')!.feats
  const top = [...d.syn].sort((a, z) => z.n - a.n).filter(s => s.n === 5)

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'i' || e.key === 'I') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setOpen(true) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <>
      <Panel title={c.id} right={<Mono className="!text-cy">{c.code}</Mono>} amber={on}>
        <div className={`-mx-4 -mt-4 mb-4 flex items-center justify-between px-4 py-1.5 ${on ? 'bg-amb text-abyss' : 'bg-cy/10 text-cy'}`}>
          <span className="font-mono text-[10px] tracking-[0.25em]">{on ? '✓ SELECIONADA' : 'VISUALIZANDO · NÃO CONFIRMADA'}</span>
          {!on && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cy" />}
        </div>

        <div key={id} className="boot">
          <Mono className="!text-amb">Papel · {d.role}</Mono>
          <p className="mt-1 font-display text-[22px] font-semibold leading-tight text-ice">{c.line}</p>
          <p className="mt-3 line-clamp-4 text-[15px] leading-snug text-ice/70">{d.intro[0]}</p>

          <dl className="mt-5 space-y-3 border-t border-cy/15 pt-4">
            <div><dt><Mono className="!text-[10px]">Você começa com</Mono></dt><dd className="mt-0.5 font-display text-[15px] font-bold uppercase tracking-wide text-amb">{now.map(f => title(f.n)).join(' · ')}</dd></div>
            <div><dt><Mono className="!text-[10px]">Afinidade máxima</Mono></dt><dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{top.map(s => <span key={s.v} className="flex items-center gap-1.5 text-[15px] font-semibold text-ice"><span className="h-2 w-2 rotate-45" style={{ background: vcol(s.v) }} />{s.v}</span>)}</dd></div>
            <div><dt><Mono className="!text-[10px]">Caminhos · Ranking E</Mono></dt><dd className="mt-0.5 text-[15px] text-ice/85">{d.subs.map(s => s.n).join(' · ')}</dd></div>
          </dl>
        </div>

        <button onClick={() => setOpen(true)} className="group relative mt-5 block w-full text-left">
          <span className="edge ch block transition group-hover:[filter:drop-shadow(0_0_10px_#3ff0ff66)]">
            <span className="ch relative flex items-center gap-4 overflow-hidden bg-gradient-to-r from-[#0b2a35] to-[#061820] py-3 pl-3 pr-4">
              {/* varredura no hover */}
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[20deg] bg-gradient-to-r from-transparent via-cy/20 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
              <span className="ch-hex relative h-12 w-14 shrink-0 overflow-hidden bg-cy/30 p-px">
                <img src={CLASS_ART[id]} alt="" className="ch-hex h-full w-full object-cover object-top grayscale transition group-hover:grayscale-0" />
              </span>
              <span className="relative min-w-0 flex-1">
                <Mono className="!text-[9px] !text-amb">Dossiê · {c.code}-01</Mono>
                <span className="block font-display text-[15px] font-bold uppercase tracking-[0.14em] text-ice transition group-hover:text-cy">Ler códex completo</span>
              </span>
              <span className="relative flex items-center gap-1 font-display text-lg text-cy">
                <span className="opacity-30 transition group-hover:translate-x-1 group-hover:opacity-60">›</span>
                <span className="opacity-60 transition group-hover:translate-x-1.5 group-hover:opacity-100">›</span>
              </span>
            </span>
          </span>
          <span className="mt-1.5 flex items-center justify-between px-1">
            <Mono className="!text-[9px]">Regras · Progressão · Subclasses</Mono>
            <span className="flex items-center gap-1.5"><Key k="I" /></span>
          </span>
        </button>

      </Panel>

      {open && createPortal(
        <Shell onClose={() => setOpen(false)}>
          <Codex id={id} b={b} set={set} onClose={() => setOpen(false)} />
        </Shell>, document.body)}
    </>
  )
}

export function Shell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-8" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-abyss/85 backdrop-blur-sm" onClick={onClose} />
      <div className="scan pointer-events-none absolute inset-0" />
      <div className="boot relative flex h-full max-h-[880px] w-full max-w-[1280px] flex-col">{children}</div>
    </div>
  )
}

function ModalHead({ id, kicker, onClose, children }: { id: string; kicker: string; onClose: () => void; children?: ReactNode }) {
  const c = meta(id)
  return (
    <header className="flex items-center gap-4 border-b border-cy/25 bg-gradient-to-r from-cy/15 to-transparent px-5 py-3">
      <span className="ch-hex grid h-9 w-10 shrink-0 place-items-center bg-cy/25 font-display text-[11px] font-extrabold text-ice">{c.code}</span>
      <div className="min-w-0">
        <Mono className="!text-[10px] !text-cy">{kicker}</Mono>
        <div className="font-display text-xl font-extrabold uppercase tracking-[0.12em] text-ice">{c.id}</div>
      </div>
      <div className="ml-auto flex items-center gap-4">{children}
        <button onClick={onClose} className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-ice/70 hover:text-ice"><Key k="ESC" /> Fechar</button>
      </div>
    </header>
  )
}

/* ================= Modal A · Códex — leitura contínua com índice ================= */
function Codex({ id, b, set, onClose }: { id: string; b: Build; set: Set; onClose: () => void }) {
  const d = doc(id)
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('visao')
  const toc = [
    { k: 'visao', label: 'Visão geral' },
    { k: 'criacao', label: 'Criação' },
    { k: 'prog', label: 'Progressão', kids: d.feats.filter(r => r.feats.length).map(r => ({ k: `r-${r.r}`, label: `${r.r} · ${title(r.feats[0].n)}` })) },
    { k: 'subs', label: 'Subclasses', kids: d.subs.map(s => ({ k: `s-${s.n}`, label: s.n })) },
  ]

  useEffect(() => {
    const root = scroller.current!
    const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, z) => a.boundingClientRect.top - z.boundingClientRect.top)[0]; if (v) setActive(v.target.id) }, { root, rootMargin: '0px 0px -70% 0px' })
    root.querySelectorAll('[data-sec]').forEach(n => io.observe(n))
    return () => io.disconnect()
  }, [id])
  const go = (k: string) => scroller.current?.querySelector(`[id="${k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="edge ch flex h-full flex-col"><div className="ch glass flex h-full min-h-0 flex-col">
      <ModalHead id={id} kicker="Dossiê de classe · Códex" onClose={onClose}><Pick id={id} b={b} set={set} /></ModalHead>
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

        <div ref={scroller} className="min-h-0 overflow-y-auto scroll-smooth">
          {/* hero */}
          <section id="visao" data-sec className="relative overflow-hidden border-b border-cy/15">
            <img src={CLASS_ART[id]} alt="" className="absolute inset-y-0 right-0 h-full w-[55%] object-cover object-top opacity-70 [mask-image:linear-gradient(to_left,black_40%,transparent)]" />
            <div className="relative max-w-[640px] px-8 py-10 md:px-12">
              <Mono className="!text-amb">Papel principal · {d.role}</Mono>
              <h2 className="mt-2 font-display text-[clamp(40px,5vw,68px)] font-extrabold uppercase leading-[0.9] tracking-[0.03em] text-ice glow">{id}</h2>
              <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-ice/85">{d.intro.map((p, i) => <p key={i}>{p}</p>)}</div>
              <p className="mt-5 text-[15px] text-dim">Papéis secundários — <span className="text-ice/85">{d.sec}</span></p>
            </div>
          </section>

          <div className="mx-auto max-w-[760px] px-8 md:px-12">
            <section id="criacao" data-sec className="py-10">
              <SecHead n="02" t="Criação" />
              <h4 className="mb-2 font-display text-sm font-bold uppercase tracking-[0.15em] text-cy">Perícias de especialidade</h4>
              <p className="text-[17px] leading-relaxed text-ice/85">{d.skills3.join(' · ')}</p>
              <h4 className="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-[0.15em] text-cy">Sinergia com Vertentes</h4>
              <Synergy id={id} />
              <p className="mt-3 text-sm text-dim">A Vertente Primária é livre — a sinergia só indica o quanto ela conversa com a classe.</p>
            </section>

            <section id="prog" data-sec className="border-t border-cy/15 py-10">
              <SecHead n="03" t="Progressão" />
              {d.feats.map(r => (
                <div key={r.r} id={`r-${r.r}`} data-sec className="relative mb-10 grid grid-cols-[48px_1fr] gap-5">
                  <div className="flex flex-col items-center">
                    <span className={`ch-hex grid h-11 w-12 place-items-center font-display text-lg font-extrabold ${r.r === 'F' ? 'bg-amb text-abyss' : 'bg-cy/20 text-ice'}`}>{r.r}</span>
                    <span className="mt-2 w-px flex-1 bg-cy/20" />
                  </div>
                  <div className="pt-2">
                    <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.12em] text-dim">{r.lead}</p>
                    {r.feats.length > 0 && <Feats rank={r} accent={r.r === 'F'} />}
                  </div>
                </div>
              ))}
            </section>

            <section id="subs" data-sec className="border-t border-cy/15 py-10">
              <SecHead n="04" t="Subclasses" />
              <p className="-mt-2 mb-8 text-[15px] text-dim">Escolhida ao alcançar o Ranking E. Aqui é só reconhecimento.</p>
              {d.subs.map(s => (
                <div key={s.n} id={`s-${s.n}`} data-sec className="mb-12">
                  <div className="ch-l mb-5 bg-gradient-to-r from-cy/20 to-transparent py-3 pl-6 pr-4">
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-ice">{s.n}</h3>
                    <p className="mt-1 text-[15px] text-ice/70">{s.tag}</p>
                  </div>
                  <p className="mb-6 text-[17px] leading-relaxed text-ice/85">{s.lore}</p>
                  {s.ranks.map(r => (
                    <div key={r.r} className="mb-6 border-l-2 border-cy/30 pl-5">
                      <Mono className="!text-cy">Ranking {r.r}</Mono>
                      <div className="mt-2"><Feats rank={r} /></div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div></div>
  )
}

export function SecHead({ n, t }: { n: string; t: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-4">
      <span className="font-mono text-sm text-amb">{n}</span>
      <h3 className="font-display text-3xl font-extrabold uppercase tracking-[0.08em] text-ice">{t}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-cy/40 to-transparent" />
    </div>
  )
}
