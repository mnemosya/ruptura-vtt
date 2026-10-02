import { useMemo, useState, type ReactNode } from 'react'
import { BACKGROUNDS, CLASS_ART, CLASSES, TRAIT_CATS, COMPLICATIONS, DEFAULT_AVATAR, QUALITIES, REGIONS, STEPS, U, VERTENTES, type Build, type Trait } from './forge/data'
import { Key, Mono, Panel, Seg } from './forge/ui'
import { Hologram } from './forge/Hologram'
import { ClassRight } from './forge/ClassStep'
import { RegionRight } from './forge/RegionStep'
import { VertRight, spellNeed, vertArt } from './forge/VertStep'

export default function App() {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [b, setB] = useState<Build>({
    avatar: DEFAULT_AVATAR, name: 'Iara Voss', codename: 'VÉSPERA',
    concept: 'Ex-arquivista que viu o que não devia e agora carrega o arquivo dentro de si.',
    look: 'Cabelo tingido de verde, olhar cansado, casaco de chancelaria sem insígnias.',
    region: 'Beldran', town: '', bg: '', origin: '', q: {}, c: {}, cls: '', attr: [1, 1, 1], vert: '', spells: [],
  })
  const set = (p: Partial<Build>) => setB(o => ({ ...o, ...p }))
  const [view, setView] = useState({ region: 'Beldran', cls: CLASSES[0].id, vert: VERTENTES[0].id})
  const onView = (k: keyof typeof view) => (id: string) => setView(v => ({ ...v, [k]: id }))
  const vt = VERTENTES.find(v => v.id === b.vert)
  const reg = REGIONS.find(r => r.id === b.region)
  const progress = useMemo(() => [b.name, b.region, b.bg, Object.keys(b.q).length ? 1 : '', b.cls, b.attr.reduce((a, c) => a + c) >= 9 ? 1 : '', b.vert, b.vert && b.spells.length === spellNeed(b.vert) ? 1 : ''].filter(Boolean).length / 8, [b])

  const vars = { ['--vc' as string]: vt?.c ?? '#3ff0ff' }
  if (!started) return <div style={vars} className="h-full"><Title onStart={() => setStarted(true)} /></div>

  const cur = STEPS[step]
  return (
    <div style={vars} className="relative h-full overflow-hidden bg-abyss">
      {/* world backdrop reacts to region */}
      {reg && <img key={reg.id} src={reg.img} alt="" className="boot absolute inset-0 h-full w-full object-cover opacity-[0.18] blur-[2px] grayscale" />}
      <div className="absolute inset-0 bg-gradient-to-b from-abyss/70 via-deep/60 to-abyss" />
      <div className="absolute inset-0 mix-blend-color bg-cy/20" />
      <div className="hexgrid absolute inset-0 opacity-60" />
      <div className="scan pointer-events-none absolute inset-0" />

      <div className="relative flex h-full flex-col p-3 lg:p-5">
        <TopBar group={cur.group} label={cur.label} onExit={() => setStarted(false)} />

        <div className="no-sb grid min-h-0 flex-1 gap-5 overflow-y-auto px-2 py-4 xl:grid-cols-[220px_1fr_380px] xl:overflow-hidden lg:px-6">
          <SideMenu step={step} setStep={setStep} b={b} />
          <main key={step} className="boot relative min-h-[520px]">{center(step, b, set, progress, view, onView)}</main>
          <aside className="no-sb flex min-h-0 flex-col gap-4 xl:overflow-y-auto">
            <IdentityPlate b={b} progress={progress} step={step} />
            <div key={step} className="boot">{right(step, b, set, view)}</div>
          </aside>
        </div>

        <Dock step={step} setStep={setStep} />
      </div>
    </div>
  )
}


function TopBar({ group, label, onExit }: { group: string; label: string; onExit: () => void }) {
  return (
    <header className="relative flex items-start justify-between px-4 pt-3 lg:px-8">
      <button onClick={onExit} className="flex items-center gap-2 pt-2 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ice/80 hover:text-cy">
        <span className="text-xl text-cy">«</span> Sair da forja
      </button>
      <div className="absolute left-1/2 top-0 -translate-x-1/2 text-center">
        <div className="ch-plate relative bg-gradient-to-b from-cy/30 to-cy/5 px-16 pb-2 pt-2">
          <div className="font-mono text-[10px] tracking-[0.45em] text-cy">{group}</div>
          <div className="font-display text-xl font-extrabold uppercase tracking-[0.3em] text-ice glow">{label}</div>
        </div>
        <div className="mx-auto h-[2px] w-[80%] bg-cy shadow-[0_0_12px_#3ff0ff]" />
      </div>
      <div className="hidden items-center gap-4 pt-2 text-right md:flex">
        <div><Mono>Mesa ativa</Mono><div className="font-display text-sm font-bold uppercase text-ice">Cinzas de Beldran · S14</div></div>
        <span className="ch-hex grid h-9 w-10 place-items-center bg-amb font-display text-sm font-extrabold text-abyss">MJ</span>
      </div>
    </header>
  )
}

function SideMenu({ step, setStep, b }: { step: number; setStep: (n: number) => void; b: Build }) {
  const done = [!!b.name, !!b.region, !!b.bg, Object.keys(b.q).length > 0, !!b.cls, b.attr.reduce((a, c) => a + c) >= 9, !!b.vert, false]
  let last = ''
  return (
    <nav className="hidden flex-col xl:flex">
      <div className="ch-tab mb-3 bg-gradient-to-r from-cy/40 to-cy/5 py-2 pl-4 font-display text-2xl font-extrabold uppercase tracking-[0.1em] text-ice glow">Forja</div>
      <div className="flex flex-col gap-1.5">
        {STEPS.map((s, i) => {
          const hdr = s.group !== last; last = s.group
          const on = i === step
          return (
            <div key={s.key}>
              {hdr && <div className="mb-1 mt-3 flex items-center gap-2"><Mono className="!text-[9px] text-cy/70">{s.group}</Mono><span className="h-px flex-1 bg-cy/15" /></div>}
              <button onClick={() => setStep(i)} className={`ch-tab group relative flex w-full items-center gap-3 py-2 pl-3 text-left transition ${on ? 'bg-gradient-to-r from-cy/25 to-cy/5 text-ice' : 'bg-cy/[0.04] text-ice/60 hover:bg-cy/10 hover:text-ice'}`}>
                {on && <span className="absolute bottom-0 left-0 h-[3px] w-[85%] bg-amb shadow-[0_0_10px_#ff8a1f]" />}
                <span className={`font-mono text-[10px] ${on ? 'text-amb' : 'text-dim'}`}>0{i + 1}</span>
                <span className="font-display text-[15px] font-semibold uppercase tracking-[0.1em]">{s.label}</span>
                <span className={`ml-auto mr-5 h-1.5 w-1.5 rotate-45 ${done[i] ? 'bg-cy shadow-[0_0_6px_#3ff0ff]' : 'border border-dim/60'}`} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-auto pt-6">
        <Panel amber title="Aviso">
          <p className="text-sm leading-snug text-ice/80">Registro não selado. Refratários sem RPI forjado não podem entrar na mesa.</p>
          <div className="hazard-a mt-3 h-2" />
        </Panel>
      </div>
    </nav>
  )
}

function IdentityPlate({ b, progress, step }: { b: Build; progress: number; step: number }) {
  return (
    <div>
      <div className="flex items-stretch justify-end gap-2">
        <div className="ch-l flex flex-1 items-center gap-3 bg-gradient-to-r from-cy/5 to-cy/30 py-2 pl-6 pr-3">
          <span className="ch-hex h-11 w-12 shrink-0 overflow-hidden bg-cy/30"><img src={b.avatar} alt="" className="h-full w-full object-cover" /></span>
          <div className="min-w-0 flex-1 text-right">
            <div className="truncate font-display text-xl font-bold text-ice">{b.name || 'Sem nome'}</div>
            <Mono className="!text-cy">RPI #0417 · {b.codename || '—'}</Mono>
          </div>
        </div>
        <div className="grid w-12 place-items-center border border-cy/60 bg-cy/15 font-display text-2xl font-extrabold text-ice glow">{step + 1}</div>
      </div>
      <div className="mt-2 flex items-center gap-2 px-1">
        <Mono>Sincronia</Mono>
        <div className="relative h-3 flex-1 bg-cy/10">
          <div className="hazard absolute inset-0" />
          <div className="absolute inset-y-0 left-0 bg-amb shadow-[0_0_10px_#ff8a1f] transition-all duration-700" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="font-display text-sm font-bold text-amb">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  )
}

function Dock({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return (
    <footer className="relative flex items-center justify-between gap-4 px-4 pb-2 lg:px-8">
      <button onClick={() => setStep(Math.max(0, step - 1))} className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-ice/70 hover:text-ice"><Key k="Q" /> Voltar</button>
      {step < STEPS.length - 1 ? (
        <button onClick={() => setStep(step + 1)} className="group relative flex items-center gap-3 font-display text-sm font-bold uppercase tracking-widest">
          <span className="text-ice/70 group-hover:text-ice">Confirmar</span>
          <span className="ch bg-cy px-5 py-2 text-abyss shadow-[0_0_20px_#3ff0ff88] transition group-hover:bg-ice">{STEPS[step + 1].label} ›</span>
          <Key k="E" />
        </button>
      ) : (
        <button className="ch bg-amb px-7 py-3 font-display text-base font-extrabold uppercase tracking-[0.2em] text-abyss shadow-[0_0_24px_#ff8a1f]">Selar refratário</button>
      )}
    </footer>
  )
}

/* ================= TITLE ================= */
function Title({ onStart }: { onStart: () => void }) {
  const items: [string, string, boolean][] = [['Novo refratário', 'Iniciar protocolo de forja', true], ['Continuar rascunho', 'Iara Voss · 38% sincronizado', false], ['Importar registro', 'Arquivo .rpi', false], ['Voltar à mesa', 'Cinzas de Beldran', false]]
  return (
    <div className="relative h-full overflow-hidden bg-abyss">
      <img src={U('1672872476232-da16b45c9001', 2000, 1200)} alt="Metrópole futurista à noite" className="absolute inset-0 h-full w-full object-cover opacity-50" />
      <div className="absolute inset-0 mix-blend-color bg-cy/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-abyss via-abyss/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss via-transparent to-abyss/60" />
      <div className="scan absolute inset-0" />
      <div className="relative flex h-full flex-col justify-center px-10 lg:px-24">
        <Mono className="!text-amb">// ANOMALIA DETECTADA · NOVO SINAL REFRATÁRIO</Mono>
        <div className="relative mt-4">
          <h1 className="font-display text-[clamp(4rem,11vw,9.5rem)] font-extrabold leading-[0.85] tracking-[0.04em] text-ice glow">RUPTURA</h1>
          <h1 aria-hidden className="glitch absolute inset-0 font-display text-[clamp(4rem,11vw,9.5rem)] font-extrabold leading-[0.85] tracking-[0.04em] text-amb/60 mix-blend-screen">RUPTURA</h1>
        </div>
        <div className="mt-3 flex items-center gap-3"><span className="h-[2px] w-16 bg-cy shadow-[0_0_10px_#3ff0ff]" /><span className="font-display text-lg font-semibold uppercase tracking-[0.5em] text-cy">Forja de Refratário</span></div>
        <div className="mt-12 flex max-w-md flex-col gap-2">
          {items.map(([t, s, primary], i) => (
            <button key={t} onClick={i < 2 ? onStart : undefined} className={`ch-tab group relative flex items-center justify-between py-3 pl-5 pr-10 text-left transition ${primary ? 'bg-gradient-to-r from-cy/35 to-cy/5' : 'bg-cy/[0.05] hover:bg-cy/15'}`}>
              {primary && <span className="absolute bottom-0 left-0 h-[3px] w-[90%] bg-amb shadow-[0_0_10px_#ff8a1f]" />}
              <div><div className="font-display text-xl font-bold uppercase tracking-[0.12em] text-ice">{t}</div><Mono>{s}</Mono></div>
              <span className="font-display text-2xl text-cy opacity-0 transition group-hover:opacity-100">›</span>
            </button>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-3 font-display text-sm uppercase tracking-[0.3em] text-ice/70"><Key k="ENTER" /><span className="pulse-o">Pressione para iniciar</span></div>
      </div>
      <div className="absolute bottom-8 right-10 text-right"><Mono>Build 0.1 · Concept</Mono><br /><Mono className="!text-cy">VTT · Sistema RUPTURA</Mono></div>
    </div>
  )
}

/* ================= CENTER STAGES ================= */
type View = { region: string; cls: string; vert: string }
function center(step: number, b: Build, set: (p: Partial<Build>) => void, progress: number, view: View, onView: (k: keyof View) => (id: string) => void): ReactNode {
  switch (step) {
    case 0: return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <label className="group relative cursor-pointer">
          <Hologram b={b} progress={progress} />
          <span className="absolute left-1/2 top-[40%] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap bg-abyss/85 px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-cy opacity-0 transition group-hover:opacity-100"><Key k="U" /> Carregar avatar</span>
          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) set({ avatar: URL.createObjectURL(f) }) }} />
        </label>
        <Mono>Avatar enviado pelo jogador · projetado como registro holográfico</Mono>
      </div>
    )
    case 1: return <Carousel items={REGIONS.map(r => ({ id: r.id, img: r.img, top: `CAPITAL · ${r.capital.toUpperCase()}`, sub: r.tag, color: r.tint }))} value={b.region} viewId={view.region} onView={onView('region')} onPick={id => set({ region: id })} cta="Fixar origem" />
    case 2: return <Antecedente b={b} set={set} />
    case 3: return <Tracos b={b} set={set} />
    case 4: return <Carousel items={CLASSES.map(c => ({ id: c.id, img: CLASS_ART[c.id] ?? c.img, top: `CLASSE · ${c.code}`, sub: c.role }))} value={b.cls} viewId={view.cls} onView={onView('cls')} onPick={id => set({ cls: id })} cta="Assumir classe" />
    case 5: return <Atributos b={b} set={set} progress={progress} />
    case 6: return <Carousel items={VERTENTES.map(v => ({ id: v.id, img: vertArt(v.id), top: 'VERTENTE PRIMÁRIA', sub: v.g.split('.')[0], color: v.c }))} value={b.vert} viewId={view.vert} onView={onView('vert')} onPick={id => set({ vert: id, spells: b.vert === id ? b.spells : [] })} cta="Sintonizar" />
    default: return <div className="flex h-full items-center justify-center"><Hologram b={b} progress={1} solid /></div>
  }
}

function Carousel({ items, value, viewId, onView, onPick, cta }: { items: { id: string; img: string; top: string; sub: string; color?: string }[]; value: string; viewId: string; onView: (id: string) => void; onPick: (id: string) => void; cta: string }) {
  const sel = Math.max(0, items.findIndex(i => i.id === viewId))
  const setSel = (i: number) => onView(items[i].id)
  const go = (d: number) => setSel((sel + d + items.length) % items.length)
  const picked = value === items[sel].id
  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      {/* curved rail */}
      <div className="absolute inset-x-0 top-[8%] h-[78%] rounded-[50%/12%] border-x-2 border-cy/20" />
      <div className="relative h-[440px] w-full [perspective:1400px]">
        {items.map((it, i) => {
          let d = i - sel
          if (d > items.length / 2) d -= items.length
          if (d < -items.length / 2) d += items.length
          const ad = Math.abs(d)
          const on = d === 0
          return (
            <button key={it.id} onClick={() => (on ? onPick(it.id) : setSel(i))}
              className="absolute left-1/2 top-1/2 h-[400px] w-[270px] transition-all duration-500 ease-out"
              style={{ transform: `translate(-50%,-50%) translateX(${d * 62}%) rotateY(${d * -32}deg) scale(${1 - ad * 0.14})`, zIndex: 10 - ad, opacity: ad > 2 ? 0 : 1 - ad * 0.25, filter: on ? 'none' : `brightness(${0.55 - ad * 0.1}) saturate(.4)` }}>
              <div className={`ch h-full w-full p-[2px] ${on ? (picked ? 'bg-amb' : 'bg-cy') : 'bg-cy/30'}`} style={on ? { boxShadow: '0 0 40px -6px var(--color-cy)' } : undefined}>
                <div className="ch relative h-full w-full overflow-hidden bg-deep">
                  <img src={/^(\/|http|data:)/.test(it.img) ? it.img : U(it.img, 540, 800)} alt={it.id} className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/20 to-transparent" />
                  <div className="scan absolute inset-0 opacity-60" />
                  <div className="absolute left-3 top-3 font-mono text-[10px] tracking-widest text-cy">{it.top}</div>
                  <div className={`absolute inset-x-0 bottom-0 px-4 pb-4 text-left`}>
                    <div className={`mb-2 h-[2px] w-10 ${picked && on ? 'bg-amb' : 'bg-cy'}`} style={it.color ? { background: it.color, boxShadow: `0 0 10px ${it.color}` } : undefined} />
                    <div className="font-display text-3xl font-extrabold uppercase tracking-[0.06em] text-ice">{it.id}</div>
                    <div className="font-sans text-base font-medium text-ice/70">{it.sub}</div>
                  </div>
                  {picked && on && <div className="absolute right-3 top-3 bg-amb px-2 py-0.5 font-display text-[11px] font-extrabold uppercase tracking-widest text-abyss">Selecionado</div>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <div className="relative z-20 mt-2 flex items-center gap-6">
        <button onClick={() => go(-1)} className="h-0 w-0 border-y-[14px] border-r-[20px] border-y-transparent border-r-cy drop-shadow-[0_0_8px_#3ff0ff] hover:border-r-ice" aria-label="Anterior" />
        <button onClick={() => onPick(items[sel].id)} className={`ch px-10 py-2.5 font-display text-base font-extrabold uppercase tracking-[0.25em] transition ${picked ? 'bg-amb text-abyss' : 'border border-cy bg-cy/10 text-cy hover:bg-cy hover:text-abyss'}`}>{picked ? '✓ ' + items[sel].id : cta}</button>
        <button onClick={() => go(1)} className="h-0 w-0 border-y-[14px] border-l-[20px] border-y-transparent border-l-cy drop-shadow-[0_0_8px_#3ff0ff] hover:border-l-ice" aria-label="Próximo" />
      </div>
      <div className="mt-3 flex gap-1.5">{items.map((_, i) => <span key={i} className={`h-1 transition-all ${i === sel ? 'w-8 bg-cy' : 'w-3 bg-cy/25'}`} />)}</div>
    </div>
  )
}

const pad = (i: number) => String(i + 1).padStart(2, '0')

/* inline **negrito** do texto de regras */
function Rich({ text, className = '' }: { text: string; className?: string }) {
  return <p className={className}>{text.split(/(\*\*[^*]+\*\*)/).map((t, i) => t.startsWith('**') ? <strong key={i} className="font-semibold text-amb">{t.slice(2, -2)}</strong> : t)}</p>
}

function Header({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><Mono className="!text-cy">{kicker}</Mono><h2 className="font-display text-4xl font-extrabold uppercase tracking-[0.06em] text-ice">{title}</h2></div>
      {right}
    </div>
  )
}

/* Dossiê — índice vertical + registro selecionado */
function Antecedente({ b, set }: { b: Build; set: (p: Partial<Build>) => void }) {
  const idx = Math.max(0, BACKGROUNDS.findIndex(x => x.id === b.bg))
  const cur = BACKGROUNDS[idx], linked = b.bg === cur.id
  return (
    <div className="flex h-full flex-col gap-4">
      <Header kicker="Trajetória · 02" title="Antecedente" right={<Mono>{BACKGROUNDS.length} registros</Mono>} />
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(220px,0.75fr)_1.6fr]">
        <div className="edge ch min-h-0"><div className="ch glass no-sb h-full max-h-[560px] overflow-y-auto py-2">
          {BACKGROUNDS.map((bg, i) => {
            const on = bg.id === b.bg
            return (
              <button key={bg.id} onClick={() => set({ bg: bg.id })} className={`group flex w-full items-center gap-3 border-l-2 px-4 py-[7px] text-left transition ${on ? 'border-amb bg-gradient-to-r from-amb/25 to-transparent' : 'border-transparent hover:border-cy/60 hover:bg-cy/5'}`}>
                <span className={`font-mono text-[10px] ${on ? 'text-amb' : 'text-dim'}`}>{pad(i)}</span>
                <span className={`font-display text-[14px] font-bold uppercase tracking-[0.05em] ${on ? 'text-ice' : 'text-ice/60 group-hover:text-ice'}`}>{bg.id}</span>
                {on && <span className="ml-auto h-1.5 w-1.5 rotate-45 bg-amb shadow-[0_0_8px_#ff9a2e]" />}
              </button>
            )
          })}
        </div></div>
        <div className={`${linked ? 'edge-amb' : 'edge'} ch min-h-0`}><div key={cur.id} className="ch glass boot no-sb relative h-full max-h-[560px] overflow-y-auto p-6">
          <span className="pointer-events-none absolute -right-2 -top-6 font-display text-[140px] font-extrabold leading-none text-amb/[0.07]">{pad(idx)}</span>
          <div className="flex items-center gap-3"><Mono className="!text-amb">ANT-{pad(idx)}</Mono><span className="h-px flex-1 bg-gradient-to-r from-amb/50 to-transparent" /><Mono className={linked ? '!text-amb' : ''}>{linked ? '✓ Vinculado' : 'Não vinculado'}</Mono></div>
          <h3 className="mt-3 font-display text-[clamp(28px,3.4vw,44px)] font-extrabold uppercase leading-none tracking-[0.04em] text-ice glow">{cur.id}</h3>
          <p className="mt-4 max-w-[62ch] font-sans text-lg leading-snug text-ice/80">{cur.d}</p>
          <div className="mt-5 border-l-2 border-cy/50 bg-cy/[0.06] py-3 pl-4 pr-3">
            <Mono className="!text-cy">Familiaridade</Mono>
            <p className="mt-1 max-w-[62ch] font-sans text-base leading-snug text-ice/70">{cur.f}</p>
          </div>
          <div className="mt-5 flex gap-[3px]">{BACKGROUNDS.map((_, i) => <span key={i} className={`h-1 flex-1 -skew-x-[20deg] ${i === idx ? 'bg-amb' : i < idx ? 'bg-cy/40' : 'bg-cy/10'}`} />)}</div>
        </div></div>
      </div>
    </div>
  )
}

/* ---- Qualidades & Complicações ---- */
const BUDGET = { q: 3, c: 2 }
type Kind = keyof typeof BUDGET
const spentOf = (m: Record<string, number>) => Object.values(m).reduce((a, c) => a + c, 0)
const fmt = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k} (${v})`).join(', ')

function Pips({ n, max, col }: { n: number; max: number; col: string }) {
  return <span className="flex gap-1.5">{Array.from({ length: max }).map((_, i) => <span key={i} className={`h-3.5 w-3.5 rotate-45 border transition ${i < n ? `${col} border-transparent shadow-[0_0_8px_currentColor]` : 'border-cy/40'}`} />)}</span>
}

function Tracos({ b, set }: { b: Build; set: (p: Partial<Build>) => void }) {
  const [kind, setKind] = useState<Kind>('q')
  const [viewId, setViewId] = useState<Record<Kind, string>>({ q: QUALITIES[0].id, c: COMPLICATIONS[0].id })
  const list = kind === 'q' ? QUALITIES : COMPLICATIONS
  const picked = b[kind], spent = spentOf(picked), max = BUDGET[kind]
  const cur = list.find(x => x.id === viewId[kind])!
  const ownCost = picked[cur.id]
  const [lvl, setLvl] = useState<number | null>(null)
  const level = lvl ?? ownCost ?? cur.cost[0]
  const room = max - spent + (ownCost ?? 0)
  const accent = kind === 'q' ? { bg: 'bg-cy', text: 'text-cy', edge: 'border-cy' } : { bg: 'bg-amb', text: 'text-amb', edge: 'border-amb' }
  const view = (id: string) => { setViewId({ ...viewId, [kind]: id }); setLvl(null) }
  const commit = (cost: number | null) => {
    const next = { ...picked }
    if (cost === null) delete next[cur.id]; else next[cur.id] = cost
    set({ [kind]: next } as Partial<Build>)
    setLvl(null)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Header kicker="Trajetória · 03" title="Qualidades & Complicações" right={
        <div className="flex gap-5">
          {(['q', 'c'] as const).map(k => (
            <div key={k} className="flex items-center gap-3"><Mono className={k === 'q' ? '!text-cy' : '!text-amb'}>{k === 'q' ? 'Qualidades' : 'Complicações'}</Mono><Pips n={spentOf(b[k])} max={BUDGET[k]} col={k === 'q' ? 'bg-cy text-cy' : 'bg-amb text-amb'} /></div>
          ))}
        </div>
      } />
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(250px,0.8fr)_1.5fr]">
        <div className="flex min-h-0 flex-col">
          <div className="flex">
            {(['q', 'c'] as const).map(k => (
              <button key={k} onClick={() => { setKind(k); setLvl(null) }} className={`ch-tab flex-1 py-2 pl-4 text-left font-display text-sm font-bold uppercase tracking-widest transition ${kind === k ? (k === 'q' ? 'bg-cy/30 text-ice' : 'bg-amb/30 text-ice') : 'bg-cy/5 text-dim hover:text-ice'}`}>
                {k === 'q' ? 'Qualidades' : 'Complicações'} <span className="ml-1 font-mono text-[10px] text-dim">{(k === 'q' ? QUALITIES : COMPLICATIONS).length}</span>
              </button>
            ))}
          </div>
          <div className="edge ch mt-2 min-h-0 flex-1"><div className="ch glass no-sb h-full max-h-[520px] overflow-y-auto py-1">
            {TRAIT_CATS.map(cat => {
              const items = list.filter(x => x.cat === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-deep/95 px-4 pb-1 pt-3 backdrop-blur"><Mono className="!text-[9px]">{cat}</Mono><span className="h-px flex-1 bg-cy/15" /></div>
                  {items.map(t => {
                    const on = t.id in picked, viewing = t.id === cur.id
                    return (
                      <button key={t.id} onClick={() => view(t.id)} className={`flex w-full items-center justify-between gap-2 border-l-2 px-4 py-[6px] text-left transition ${viewing ? `${accent.edge} bg-cy/10` : 'border-transparent hover:bg-cy/5'}`}>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rotate-45 ${on ? `${accent.bg} shadow-[0_0_6px_currentColor] ${accent.text}` : 'border border-dim/50'}`} />
                          <span className={`font-sans text-[15px] font-semibold ${on ? 'text-ice' : 'text-ice/70'}`}>{t.id}</span>
                        </span>
                        <CostTag t={t} on={on ? picked[t.id] : undefined} col={accent.text} />
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div></div>
        </div>

        <div className={`${ownCost ? (kind === 'q' ? 'edge' : 'edge-amb') : 'edge'} ch min-h-0`}><div key={kind + cur.id} className="ch glass boot no-sb relative flex h-full max-h-[562px] flex-col overflow-y-auto p-6">
          <div className="flex items-center gap-3"><Mono className={`${accent.text}`}>{kind === 'q' ? 'Qualidade' : 'Complicação'} · {cur.cat}</Mono><span className="h-px flex-1 bg-gradient-to-r from-cy/40 to-transparent" /><Mono className={ownCost ? accent.text : ''}>{ownCost ? `✓ Adquirida · ${ownCost} pt` : 'Disponível'}</Mono></div>
          <h3 className="mt-3 font-display text-[clamp(26px,3vw,40px)] font-extrabold uppercase leading-none tracking-[0.04em] text-ice glow">{cur.id}</h3>
          <div className="mt-4 space-y-3 font-sans text-[16px] leading-snug text-ice/75">
            {cur.t.map((x, i) => <Rich key={i} text={x} className={/^(Por|Use) \*\*\d/.test(x) ? 'border-l-2 border-cy/40 bg-cy/[0.05] py-1.5 pl-3' : x.startsWith('**Na campanha') ? 'border-l-2 border-amb/60 bg-amb/[0.06] py-1.5 pl-3' : ''} />)}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-cy/15 pt-4">
            <div className="flex items-center gap-2">
              <Mono>Custo</Mono>
              {cur.cost.map(c => (
                <button key={c} disabled={cur.cost.length < 2} onClick={() => setLvl(c)} className={`ch-tab py-1 pl-3 pr-5 font-display text-sm font-bold transition ${level === c ? `${accent.bg} text-abyss` : 'bg-cy/10 text-ice/70 hover:bg-cy/20'}`}>{c} pt</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {ownCost && <button onClick={() => commit(null)} className="ch border border-dim/50 px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-ice/70 hover:border-amb hover:text-amb">Remover</button>}
              {ownCost !== level && (
                <button disabled={level > room} onClick={() => commit(level)} className={`ch px-6 py-2 font-display text-sm font-extrabold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-30 ${accent.bg} text-abyss`}>
                  {level > room ? 'Sem pontos' : ownCost ? `Ajustar para ${level} pt` : 'Adquirir'}
                </button>
              )}
            </div>
          </div>
        </div></div>
      </div>
    </div>
  )
}

function CostTag({ t, on, col }: { t: Trait; on?: number; col: string }) {
  const n = on ?? Math.max(...t.cost)
  return (
    <span className="flex shrink-0 items-center gap-1">
      {t.cost.length > 1 && on === undefined && <span className="mr-1 font-mono text-[9px] text-dim">1–2</span>}
      {Array.from({ length: n }).map((_, i) => <span key={i} className={`h-2 w-2 rotate-45 ${on !== undefined ? `bg-current ${col}` : i < t.cost[0] ? 'bg-cy/60' : 'border border-cy/50'}`} />)}
    </span>
  )
}

/* painel lateral: narrativa do antecedente */
function BgBrief({ b, set }: { b: Build; set: (p: Partial<Build>) => void }) {
  return (
    <Panel title="Como se tornou refratário" right={<Mono className="!text-cy">Narrativo</Mono>}>
      <textarea rows={8} value={b.origin} onChange={e => set({ origin: e.target.value })} placeholder="O dia em que a ruptura te tocou…" className="w-full resize-none bg-transparent font-sans text-lg text-ice outline-none placeholder:text-dim" />
      <div className="mt-2 flex items-center justify-between border-t border-cy/15 pt-2"><Mono>RPI forjado</Mono><input value={b.codename} onChange={e => set({ codename: e.target.value.toUpperCase() })} className="w-40 border-b border-cy/40 bg-transparent text-right font-mono tracking-[0.3em] text-cy outline-none" /></div>
    </Panel>
  )
}

/* painel lateral: ficha de traços adquiridos */
function TraitSheet({ b, set }: { b: Build; set: (p: Partial<Build>) => void }) {
  const drop = (k: Kind, id: string) => { const n = { ...b[k] }; delete n[id]; set({ [k]: n } as Partial<Build>) }
  return (
    <div className="space-y-4">
      {(['q', 'c'] as const).map(k => {
        const entries = Object.entries(b[k]), left = BUDGET[k] - spentOf(b[k]), q = k === 'q'
        return (
          <Panel key={k} amber={!q} title={q ? 'Qualidades' : 'Complicações'} right={<span className={`font-display text-lg font-extrabold ${q ? 'text-cy' : 'text-abyss'}`}>{left}</span>}>
            <div className="mb-2 flex items-center justify-between"><Mono>Pontos restantes</Mono><Pips n={spentOf(b[k])} max={BUDGET[k]} col={q ? 'bg-cy text-cy' : 'bg-amb text-amb'} /></div>
            {entries.length ? entries.map(([id, v]) => (
              <div key={id} className="group flex items-center justify-between border-b border-cy/10 py-1.5">
                <span className="font-sans text-base font-semibold text-ice">{id}</span>
                <span className="flex items-center gap-3"><Mono className={q ? '!text-cy' : '!text-amb'}>{v} pt</Mono><button onClick={() => drop(k, id)} className="font-mono text-xs text-dim opacity-0 transition hover:text-amb group-hover:opacity-100">✕</button></span>
              </div>
            )) : <p className="text-sm text-dim">Nenhum registro adquirido.</p>}
          </Panel>
        )
      })}
    </div>
  )
}

function Atributos({ b, set, progress }: { b: Build; set: (p: Partial<Build>) => void; progress: number }) {
  const left = 9 - b.attr.reduce((a, c) => a + c)
  const bump = (i: number, d: number) => {
    const v = b.attr[i] + d
    if (v < 1 || v > 4 || (d > 0 && left <= 0)) return
    set({ attr: b.attr.map((x, j) => (j === i ? v : x)) })
  }
  const Node = ({ i, name, desc }: { i: number; name: string; desc: string }) => (
    <div className="w-full max-w-[220px]">
      <Panel title={name}>
        <p className="text-sm text-ice/60">{desc}</p>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => bump(i, -1)} className="ch grid h-9 w-9 place-items-center border border-cy/40 font-display text-xl text-cy hover:bg-cy/20">−</button>
          <span key={b.attr[i]} className="boot font-display text-6xl font-extrabold text-ice glow">{b.attr[i]}</span>
          <button onClick={() => bump(i, 1)} className="ch grid h-9 w-9 place-items-center border border-amb/60 font-display text-xl text-amb hover:bg-amb/20">+</button>
        </div>
        <div className="mt-2"><Seg value={b.attr[i]} max={4} w="flex-1" /></div>
      </Panel>
    </div>
  )
  return (
    <div className="relative mx-auto flex h-full max-w-[820px] flex-col items-center justify-center gap-6">
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-8">
        <div className="flex justify-end"><Node i={0} name="Corpo" desc="Força, resistência e reflexo." /></div>
        <Hologram b={b} progress={progress} size="md" />
        <div className="flex justify-start"><Node i={1} name="Mente" desc="Raciocínio, percepção e técnica." /></div>
      </div>
      <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-end gap-8">
        <div className="pl-2"><Mono>Pontos livres</Mono><div className="font-display text-6xl font-extrabold text-amb glow-a">{left}</div></div>
        <div className="w-[220px]"><Node i={2} name="Ânimo" desc="Vontade, presença e conexão." /></div>
        <div />
      </div>
    </div>
  )
}

/* ================= RIGHT PANELS ================= */
function right(step: number, b: Build, set: (p: Partial<Build>) => void, view: View): ReactNode {
  const inp = 'w-full border-b border-cy/30 bg-transparent pb-1 text-ice outline-none transition focus:border-amb'
  switch (step) {
    case 0: return (
      <Panel title="Identidade">
        <div className="space-y-4">
          <div><Mono>Nome</Mono><input value={b.name} onChange={e => set({ name: e.target.value })} className={`${inp} font-display text-2xl font-bold`} /></div>
          <div><Mono>Codinome</Mono><input value={b.codename} onChange={e => set({ codename: e.target.value.toUpperCase() })} className={`${inp} font-mono tracking-[0.3em] text-cy`} /></div>
          <div><Mono>Ideia geral</Mono><textarea rows={3} value={b.concept} onChange={e => set({ concept: e.target.value })} className={`${inp} resize-none text-lg`} /></div>
          <div><Mono>Aparência</Mono><textarea rows={3} value={b.look} onChange={e => set({ look: e.target.value })} className={`${inp} resize-none text-base text-ice/80`} /></div>
        </div>
      </Panel>
    )
    case 1: return <RegionRight b={b} set={set} id={view.region} />
    case 2: return <BgBrief b={b} set={set} />
    case 3: return <TraitSheet b={b} set={set} />
    case 4: return <ClassRight b={b} set={set} id={view.cls} />
    case 5: {
      const [c, m, a] = b.attr
      const rows: [string, number, number, string][] = [['Vitalidade', 8 + c * 3, 20, 'CORPO'], ['Foco', 4 + m * 2, 12, 'MENTE'], ['Resolução', 4 + a * 2, 12, 'ÂNIMO'], ['Defesa', 10 + Math.max(c, m), 14, 'MAIOR']]
      return (
        <Panel title="Recursos derivados" right={<Mono className="!text-cy">Ilustrativo</Mono>}>
          <div className="grid gap-4">
            {rows.map(([n, v, max, src]) => (
              <div key={n} className="border-b border-amb/40 pb-3">
                <div className="ch-l -skew-x-0 border-l-2 border-t-2 border-amb/80 pl-3 pt-1">
                  <div className="flex items-baseline justify-between"><span className="font-display text-lg font-bold uppercase text-amb">{n}</span><Mono className="!text-cy">← {src}</Mono></div>
                  <div className="relative mt-1 h-5 bg-amb/15"><div className="absolute inset-y-0 left-0 bg-amb/70 transition-all duration-500" style={{ width: `${(v / max) * 100}%` }} /><span className="absolute right-2 top-0 font-display text-sm font-extrabold text-ice">{v}</span></div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-dim">Próximo passo: perfil de Perícias sugerido a partir desta distribuição.</p>
        </Panel>
      )
    }
    case 6: return <VertRight b={b} set={set} id={view.vert} />
    default: {
      const rows: [string, string][] = [['Região', b.town ? `${b.region} · ${b.town}` : b.region], ['Antecedente', b.bg], ['Qualidades', fmt(b.q)], ['Complicações', fmt(b.c)], ['Classe', b.cls], ['Corpo · Mente · Ânimo', b.attr.join(' · ')], ['Vertente', b.vert], ['Magias', b.spells.join(', ')], ['Perícias', ''], ['Equipamento', '']]
      return (
        <Panel title="Registro final" right={<Mono className="!text-cy">RPI #0417</Mono>}>
          <p className="mb-3 text-lg italic leading-snug text-ice/80">“{b.concept}”</p>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 border-b border-cy/10 py-2">
              <Mono>{k}</Mono>
              <span className={`text-right font-display text-sm font-bold uppercase ${v ? 'text-ice' : 'text-amb'}`}>{v || '⚠ Pendente'}</span>
            </div>
          ))}
        </Panel>
      )
    }
  }
}

function Status({ on, label = 'Selecionado' }: { on: boolean; label?: string }) {
  return (
    <div className={`-mx-4 -mt-4 mb-3 flex items-center justify-between px-4 py-1.5 ${on ? 'bg-amb text-abyss' : 'bg-cy/10 text-cy'}`}>
      <span className="font-mono text-[10px] tracking-[0.25em]">{on ? `✓ ${label.toUpperCase()}` : 'VISUALIZANDO · NÃO CONFIRMADO'}</span>
      {!on && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cy" />}
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="border border-cy/15 bg-cy/5 px-2 py-1.5"><Mono className="!text-[9px]">{k}</Mono><div className="font-display text-base font-bold text-ice">{v}</div></div>
}
