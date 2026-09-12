import { useState, type ReactNode, type ComponentType, type SVGProps } from "react";
import { ACCENTS, type Accent } from "./ui";
import {
  Cursor,
  Ruler,
  MapPin,
  Hexagon,
  Swords,
  Brush,
  Cube,
  UserPlus,
  Layers,
  Gear,
  X,
  Plus,
  Undo,
  Note,
  Target,
  Warn,
  Check,
  Chevron,
  Dice,
} from "../lib/icons";
import { DiceRollerPanel } from "./dice";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* ================================================================== */
/*  Shared tool primitives                                             */
/* ================================================================== */

export function Brackets({ color, size = 11, inset = 6 }: { color: string; size?: number; inset?: number }) {
  const s: React.CSSProperties = { position: "absolute", width: size, height: size, opacity: 0.55 };
  return (
    <>
      <span style={{ ...s, top: inset, left: inset, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <span style={{ ...s, top: inset, right: inset, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
      <span style={{ ...s, bottom: inset, left: inset, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` }} />
      <span style={{ ...s, bottom: inset, right: inset, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }} />
    </>
  );
}

function PanelShell({
  code,
  index,
  title,
  status,
  accent,
  children,
  primary,
  secondary,
  meta,
}: {
  code: string;
  index: string;
  title: string;
  status: string;
  accent: Accent;
  children: ReactNode;
  primary?: { label: string; hint?: string; onClick?: () => void; disabled?: boolean };
  secondary?: { label: string };
  meta?: ReactNode;
}) {
  return (
    <div
      className="relative flex max-h-full rounded-[2px]"
      style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f", boxShadow: "0 30px 70px rgba(0,0,0,0.55)" }}
    >
      <Brackets color={accent.hex} />
      {/* spine */}
      <div className="flex w-9 shrink-0 flex-col items-center justify-between py-3.5" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.015)" }}>
        <span className="font-mono text-[9px] font-700 tracking-widest" style={{ color: accent.hex }}>{index}</span>
        <span
          className="font-display text-[8.5px] font-700 uppercase tracking-[0.3em]"
          style={{ color: accent.hex, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.85 }}
        >
          {code}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent.hex, boxShadow: `0 0 6px ${accent.hex}` }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-3.5" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[16px] font-700 uppercase tracking-[0.12em] leading-none text-ink">{title}</h3>
            <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-faint">
              <span className="h-1 w-1 rounded-full" style={{ background: accent.hex }} />
              {status}
            </div>
          </div>
          {meta}
          <button className="flex h-6 w-6 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:text-ink" style={{ border: "1px solid #1c2b45" }}>
            <X width={12} height={12} />
          </button>
        </div>

        <div className="rup-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">{children}</div>

        {(primary || secondary) && (
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid #16233a", background: "rgba(255,255,255,0.015)" }}>
            {secondary && (
              <button className="px-3 py-2 font-display text-[10px] font-500 uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink-dim">
                {secondary.label}
              </button>
            )}
            {primary && (
              <CommandButton accent={accent} label={primary.label} hint={primary.hint} className="ml-auto" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommandButton({ accent, label, hint, className = "", block = false }: { accent: Accent; label: string; hint?: string; className?: string; block?: boolean }) {
  return (
    <button
      className={`flex items-center gap-2 rounded-[2px] px-5 py-2 font-display text-[11px] font-700 uppercase tracking-[0.22em] transition-colors ${block ? "w-full justify-center" : ""} ${className}`}
      style={{ color: accent.hex, background: `${accent.hex}16`, border: `1px solid ${accent.hex}88` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent.hex)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = accent.hex + "88")}
    >
      <span style={{ opacity: 0.7 }}>▹</span>
      {label}
      {hint && (
        <span className="rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] tracking-normal" style={{ border: `1px solid ${accent.hex}66` }}>
          {hint}
        </span>
      )}
    </button>
  );
}

export function Section({ n, title, right, children }: { n: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="font-mono text-[9px] font-700 tracking-widest text-cyan/70">{n}</span>
        <span className="font-display text-[9px] font-600 uppercase tracking-[0.2em] text-ink-faint">{title}</span>
        <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
        {right}
      </div>
      {children}
    </section>
  );
}

function OptionTile({
  icon: IconC,
  title,
  sub,
  selected,
  accent = ACCENTS.cyan,
  onClick,
}: {
  icon?: Icon;
  title: string;
  sub?: string;
  selected?: boolean;
  accent?: Accent;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1.5 rounded-[2px] px-2 py-3 text-center transition-colors"
      style={{ border: `1px solid ${selected ? accent.hex : "#16233a"}`, background: selected ? accent.soft : "transparent" }}
    >
      {selected && <span className="absolute left-1 top-1 h-1 w-1 rounded-full" style={{ background: accent.hex }} />}
      {IconC && (
        <span style={{ color: selected ? accent.hex : "#6f83a3" }} className="transition-colors group-hover:text-ink-dim">
          <IconC width={19} height={19} />
        </span>
      )}
      <div>
        <div className="font-display text-[11px] font-600 uppercase tracking-[0.08em]" style={{ color: selected ? accent.hex : "#c3d2e8" }}>{title}</div>
        {sub && <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-ink-faint">{sub}</div>}
      </div>
    </button>
  );
}

function Readout({ label, value, unit, accent = ACCENTS.cyan }: { label: string; value: string; unit?: string; accent?: Accent }) {
  return (
    <div className="relative overflow-hidden rounded-[2px] px-3 py-2.5" style={{ background: "#0c1420", border: "1px solid #16233a" }}>
      <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: accent.hex }} />
      <div className="pl-1.5 font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">{label}</div>
      <div className="pl-1.5 font-mono text-[22px] font-700 leading-tight" style={{ color: accent.hex }}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-400 text-ink-faint">{unit}</span>}
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange, accent = ACCENTS.cyan }: { options: { key: string; title: string; sub?: string }[]; value: string; onChange: (k: string) => void; accent?: Accent }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded-[2px] px-3 py-2.5 text-center transition-colors"
            style={{ border: `1px solid ${active ? accent.hex : "#16233a"}`, background: active ? accent.soft : "transparent" }}
          >
            <div className="font-display text-[11.5px] font-600 uppercase tracking-[0.08em]" style={{ color: active ? accent.hex : "#c3d2e8" }}>{o.title}</div>
            {o.sub && <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, placeholder, value }: { label: string; placeholder?: string; value?: string }) {
  return (
    <label className="block">
      <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">{label}</span>
      <input
        defaultValue={value}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-[2px] bg-transparent px-3 py-2 font-body text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
        style={{ border: "1px solid #16233a" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = ACCENTS.cyan.hex + "88")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#16233a")}
      />
    </label>
  );
}

function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">{label}</span>
      <div className="relative mt-1.5">
        <select className="w-full appearance-none rounded-[2px] bg-transparent px-3 py-2 pr-8 font-body text-[12px] text-ink focus:outline-none" style={{ border: "1px solid #16233a" }}>
          {options.map((o) => (
            <option key={o} className="bg-[#0b1322]">{o}</option>
          ))}
        </select>
        <Chevron width={14} height={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
      </div>
    </label>
  );
}

function CheckRow({ label, sub, defaultChecked = false }: { label: string; sub?: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button onClick={() => setOn((v) => !v)} className="flex w-full items-start gap-3 rounded-[2px] px-3 py-2.5 text-left transition-colors" style={{ border: "1px solid #16233a" }}>
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px]" style={{ border: `1px solid ${on ? ACCENTS.cyan.hex : "#2a3b58"}`, background: on ? ACCENTS.cyan.hex : "transparent" }}>
        {on && <Check width={11} height={11} style={{ color: "#08111c" }} />}
      </span>
      <span>
        <span className="block font-body text-[12px] text-ink">{label}</span>
        {sub && <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{sub}</span>}
      </span>
    </button>
  );
}

function KeyCap({ k, action }: { k: string; action: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex min-w-[22px] items-center justify-center rounded-[2px] px-1.5 py-1 font-mono text-[10px] font-500 text-ink-dim" style={{ border: "1px solid #2a3b58", background: "#0c1420" }}>{k}</span>
      <span className="font-mono text-[9px] text-ink-faint">{action}</span>
    </span>
  );
}

function NoteRow({ children, accent = ACCENTS.amber, icon: IconC = Warn }: { children: ReactNode; accent?: Accent; icon?: Icon }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[2px] px-3 py-2" style={{ background: `${accent.hex}0e`, border: `1px solid ${accent.hex}2a`, borderLeftWidth: 2, borderLeftColor: accent.hex }}>
      <IconC width={14} height={14} style={{ color: accent.hex, flexShrink: 0 }} />
      <span className="text-[11px] text-ink-dim">{children}</span>
    </div>
  );
}

function MiniTag({ children, accent }: { children: ReactNode; accent?: Accent }) {
  return (
    <span className="rounded-[2px] px-1.5 py-[2px] font-display text-[9px] font-600 uppercase tracking-[0.1em]" style={{ color: accent ? accent.hex : "#8496b4", border: "1px solid #1c2b45" }}>
      {children}
    </span>
  );
}

/* ================================================================== */
/*  Panel content (shared by both workspaces)                          */
/* ================================================================== */

function MeasureContent() {
  const [mode, setMode] = useState("inst");
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Readout label="Distância" value="18" unit="m" />
        <Readout label="Custo" value="24" accent={ACCENTS.amber} />
        <Readout label="Trechos" value="3" />
      </div>
      <NoteRow>O trecho 2 atravessa terreno difícil · +6 de custo</NoteRow>
      <Section n="01" title="Modo">
        <Segmented value={mode} onChange={setMode} options={[{ key: "inst", title: "Instantânea", sub: "só para você" }, { key: "perm", title: "Permanente", sub: "fica na mesa" }]} />
      </Section>
      <Section n="02" title="Atalhos do Gesto">
        <div className="flex flex-wrap gap-x-4 gap-y-2.5">
          <KeyCap k="Q" action="dobra" />
          <KeyCap k="⌫" action="desfaz ponto" />
          <KeyCap k="Enter" action="conclui" />
          <KeyCap k="Esc" action="cancela" />
        </div>
      </Section>
    </>
  );
}

function MarkContent() {
  const [sig, setSig] = useState("alvo");
  const [color, setColor] = useState(0);
  const swatches = [ACCENTS.cyan, ACCENTS.amber, ACCENTS.danger, ACCENTS.good, ACCENTS.arcane, ACCENTS.slate];
  return (
    <>
      <Section n="01" title="Tipo de Sinal">
        <div className="grid grid-cols-4 gap-2">
          <OptionTile icon={Target} title="Alvo" sub="prioridade" accent={swatches[color]} selected={sig === "alvo"} onClick={() => setSig("alvo")} />
          <OptionTile icon={Warn} title="Perigo" sub="ameaça" accent={swatches[color]} selected={sig === "perigo"} onClick={() => setSig("perigo")} />
          <OptionTile icon={Cursor} title="Rota" sub="deslocam." accent={swatches[color]} selected={sig === "rota"} onClick={() => setSig("rota")} />
          <OptionTile icon={Note} title="Nota" sub="informação" accent={swatches[color]} selected={sig === "nota"} onClick={() => setSig("nota")} />
        </div>
      </Section>
      <div className="flex items-center gap-3 rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: `${swatches[color].hex}08` }}>
        <span className="flex h-11 w-11 shrink-0 rotate-45 items-center justify-center rounded-[2px]" style={{ border: `1px solid ${swatches[color].hex}`, background: swatches[color].soft }}>
          <span className="-rotate-45" style={{ color: swatches[color].hex }}><Target width={18} height={18} /></span>
        </span>
        <div>
          <div className="font-display text-[12px] font-600 uppercase tracking-[0.1em] text-ink">Pré-visualização</div>
          <div className="text-[11px] text-ink-dim">Silhueta que aparecerá sobre a célula escolhida.</div>
        </div>
      </div>
      <Section n="02" title="Cor">
        <div className="flex gap-2">
          {swatches.map((s, i) => (
            <button key={i} onClick={() => setColor(i)} className="h-8 flex-1 rounded-[2px] transition-all" style={{ background: s.hex, opacity: color === i ? 1 : 0.45, outline: color === i ? `2px solid ${s.hex}` : "none", outlineOffset: 2 }} />
          ))}
        </div>
      </Section>
      <Section n="03" title="Rótulo & Duração">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rótulo opcional" placeholder="Ex.: rota de fuga" />
          <SelectField label="Duração" options={["Persistente", "1 rodada", "Até o fim da cena"]} />
        </div>
      </Section>
      <CheckRow label="Visível para todos" sub="jogadores veem o sinal e o rótulo" defaultChecked />
    </>
  );
}

function AreasContent() {
  const [fmt, setFmt] = useState("esfera");
  const shapes: { k: string; t: string; icon: Icon }[] = [
    { k: "esfera", t: "Esfera", icon: Target }, { k: "domo", t: "Domo", icon: Hexagon }, { k: "aura", t: "Aura", icon: Target },
    { k: "linha", t: "Linha", icon: Ruler }, { k: "faixa", t: "Faixa", icon: Ruler }, { k: "parede", t: "Parede", icon: Cube },
    { k: "cubo", t: "Cubo", icon: Cube }, { k: "cone", t: "Cone", icon: MapPin }, { k: "custom", t: "Person.", icon: Brush },
  ];
  return (
    <>
      <Section n="01" title="Formato">
        <div className="grid grid-cols-3 gap-2">
          {shapes.map((s) => <OptionTile key={s.k} icon={s.icon} title={s.t} accent={ACCENTS.arcane} selected={fmt === s.k} onClick={() => setFmt(s.k)} />)}
        </div>
      </Section>
      <Section n="02" title="Dimensões">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Raio" value="6" />
          <Field label="Altura opc." value="0" />
          <Field label="Nível origem" value="0" />
        </div>
      </Section>
      <Section n="03" title="Snap">
        <CheckRow label="Fixar origem no centro da célula" defaultChecked />
        <div className="h-2" />
        <CheckRow label="Fixar origem no token mais próximo" />
      </Section>
      <NoteRow accent={ACCENTS.arcane} icon={Hexagon}>Arraste no mapa para definir o raio da área.</NoteRow>
    </>
  );
}

function RoundsContent() {
  const [mode, setMode] = useState("combate");
  const parts = [
    { in: "MV", name: "Mara Venn", role: "personagem jogador · Reflexos 2", side: "PJ", accent: ACCENTS.cyan },
    { in: "#2", name: "Sentinela da Doca", role: "personagem do narrador · Reflexos 1", side: "PN", accent: ACCENTS.danger },
    { in: "#3", name: "Contrabandista", role: "personagem do narrador · Reflexos 0", side: "PN", accent: ACCENTS.danger },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Readout label="Participantes" value="4" accent={ACCENTS.amber} />
        <Readout label="Jogadores" value="2" />
        <Readout label="Narrador" value="2" accent={ACCENTS.danger} />
      </div>
      <Section n="01" title="Participantes · 4 selecionados">
        <div className="space-y-2">
          {parts.map((p) => (
            <div key={p.in} className="flex items-center gap-3 rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a" }}>
              <span className="flex h-4 w-4 items-center justify-center rounded-[2px]" style={{ background: ACCENTS.cyan.hex }}><Check width={11} height={11} style={{ color: "#08111c" }} /></span>
              <span className="flex h-8 w-8 items-center justify-center rounded-[2px] font-display text-[10px] font-700" style={{ color: p.accent.hex, border: `1px solid ${p.accent.hex}55` }}>{p.in}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[12px] font-600 uppercase tracking-[0.06em] text-ink">{p.name}</div>
                <div className="truncate font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{p.role}</div>
              </div>
              <span className="rounded-[2px] px-2 py-1 font-display text-[9px] font-600 uppercase tracking-[0.12em]" style={{ color: p.accent.hex, border: `1px solid ${p.accent.hex}55` }}>{p.side}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section n="02" title="Modo">
        <Segmented accent={ACCENTS.amber} value={mode} onChange={setMode} options={[{ key: "combate", title: "Combate", sub: "alternância normal" }, { key: "emboscada", title: "Emboscada", sub: "um lado resolve 1º" }]} />
      </Section>
    </>
  );
}

function TerrainContent() {
  const [type, setType] = useState("dificil");
  const [method, setMethod] = useState("pincel");
  const [size, setSize] = useState(1);
  return (
    <>
      <Section n="01" title="Tipo">
        <div className="space-y-2">
          {[
            { k: "dificil", t: "Difícil", s: "cada passo custa ×2", a: ACCENTS.good },
            { k: "bloqueado", t: "Bloqueado", s: "impede a passagem", a: ACCENTS.danger },
            { k: "apagar", t: "Apagar", s: "remove o terreno pintado", a: ACCENTS.slate },
          ].map((o) => {
            const active = type === o.k;
            return (
              <button key={o.k} onClick={() => setType(o.k)} className="flex w-full items-center justify-between rounded-[2px] px-3 py-2.5 text-left transition-colors" style={{ border: `1px solid ${active ? o.a.hex : "#16233a"}`, background: active ? o.a.soft : "transparent" }}>
                <span>
                  <span className="block font-display text-[12px] font-600 uppercase tracking-[0.08em]" style={{ color: active ? o.a.hex : "#c3d2e8" }}>{o.t}</span>
                  <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{o.s}</span>
                </span>
                {active && <Check width={15} height={15} style={{ color: o.a.hex }} />}
              </button>
            );
          })}
        </div>
      </Section>
      <Section n="02" title="Método">
        <Segmented accent={ACCENTS.good} value={method} onChange={setMethod} options={[{ key: "pincel", title: "Pincel", sub: "clique ou arraste" }, { key: "balde", title: "Balde", sub: "região contígua" }]} />
      </Section>
      <Section n="03" title="Tamanho do Pincel">
        <div className="grid grid-cols-5 gap-2">
          {[1, 7, 19, 37, 61].map((s) => (
            <button key={s} onClick={() => setSize(s)} className="flex flex-col items-center gap-1 rounded-[2px] py-2.5 transition-colors" style={{ border: `1px solid ${size === s ? ACCENTS.good.hex : "#16233a"}`, background: size === s ? ACCENTS.good.soft : "transparent" }}>
              <span className="font-mono text-[14px] font-700" style={{ color: size === s ? ACCENTS.good.hex : "#c3d2e8" }}>{s}</span>
              <span className="font-mono text-[7.5px] uppercase tracking-[0.08em] text-ink-faint">cél.</span>
            </button>
          ))}
        </div>
      </Section>
      <NoteRow accent={ACCENTS.cyan} icon={Undo}>Todo o gesto de pintura vira um único Ctrl+Z.</NoteRow>
    </>
  );
}

function ObjectsContent() {
  const [preset, setPreset] = useState("caixa");
  const presets: { k: string; t: string; icon: Icon }[] = [
    { k: "muro", t: "Muro", icon: Cube }, { k: "porta", t: "Porta", icon: Note }, { k: "caixa", t: "Caixa", icon: Cube },
    { k: "entulho", t: "Entulho", icon: Hexagon }, { k: "mesa", t: "Mesa", icon: Cube }, { k: "veiculo", t: "Veículo", icon: Cube },
    { k: "barricada", t: "Barricada", icon: Cube }, { k: "coluna", t: "Coluna", icon: Cube }, { k: "grade", t: "Grade", icon: Hexagon },
  ];
  return (
    <>
      <Section n="01" title="Preset">
        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => <OptionTile key={p.k} icon={p.icon} title={p.t} selected={preset === p.k} onClick={() => setPreset(p.k)} />)}
        </div>
      </Section>
      <Section n="02" title="Propriedades">
        <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a" }}>
          <div className="font-display text-[12px] font-600 text-ink">Caixa / contêiner</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MiniTag accent={ACCENTS.danger}>Bloqueia</MiniTag>
            <MiniTag accent={ACCENTS.cyan}>Cobertura Parcial</MiniTag>
            <MiniTag>5 PD</MiniTag>
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">Caixas empilhadas oferecem cobertura parcial e podem ser destruídas.</p>
        </div>
      </Section>
      <NoteRow accent={ACCENTS.cyan} icon={Cube}>3 células selecionadas · objeto pronto para criar.</NoteRow>
    </>
  );
}

function TokenContent() {
  const [side, setSide] = useState("pn");
  return (
    <>
      <div className="flex items-end gap-3">
        <div className="flex-1"><Field label="Nome do token" placeholder="Ex.: Sentinela da Doca" /></div>
        <div className="w-20"><Field label="Sigla" value="SEN" /></div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center font-display text-[13px] font-700" style={{ color: ACCENTS.cyan.hex, background: ACCENTS.cyan.soft, border: `1px solid ${ACCENTS.cyan.hex}66`, clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" }}>SEN</span>
      </div>
      <Section n="01" title="Lado">
        <Segmented value={side} onChange={setSide} options={[{ key: "pj", title: "PJ", sub: "jogador" }, { key: "pn", title: "PN", sub: "narrador" }, { key: "neutro", title: "Neutro", sub: "sem lado" }]} />
      </Section>
      <Section n="02" title="Ficha & Escala">
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Tamanho e espaço" options={["Médio – 1 a 2 m", "Pequeno", "Grande – 3 m+"]} />
          <SelectField label="Vincular a ficha" options={["Nenhuma – só narrador", "Mara Venn", "Nova ficha"]} />
        </div>
      </Section>
      <Section n="03" title="Comportamento">
        <div className="grid grid-cols-2 gap-3">
          <CheckRow label="Visível para jogadores" sub="senão, só o narrador vê" defaultChecked />
          <CheckRow label="Travar posição" sub="impede movimento" />
        </div>
      </Section>
      <Section n="04" title="Identidade ampliada" right={<Plus width={13} height={13} className="text-cyan" />}>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Vertente" options={["Nenhuma", "Cinética", "Energética", "Biótica"]} />
          <Field label="Imagem do token" placeholder="https://…" />
        </div>
      </Section>
    </>
  );
}

function LayersContent() {
  const rows = [
    { in: "T", name: "Tokens", sub: "visível · interação liberada", state: "VISÍVEL", accent: ACCENTS.cyan },
    { in: "O", name: "Objetos e coberturas", sub: "visível · interação liberada", state: "VISÍVEL", accent: ACCENTS.cyan },
    { in: "A", name: "Áreas", sub: "visível · interação bloqueada", state: "BLOQUEADA", accent: ACCENTS.amber },
    { in: "TF", name: "Terreno funcional", sub: "visível · interação liberada", state: "VISÍVEL", accent: ACCENTS.cyan },
    { in: "M", name: "Marcações", sub: "oculta", state: "OCULTA", accent: ACCENTS.slate },
  ];
  return (
    <>
      <Section n="01" title="Pilha da Cena">
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.in} className="flex items-center gap-3 rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a" }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-[2px] font-display text-[10px] font-700" style={{ color: ACCENTS.cyan.hex, border: `1px solid ${ACCENTS.cyan.hex}44` }}>{r.in}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[12px] font-600 text-ink">{r.name}</div>
                <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{r.sub}</div>
              </div>
              <span className="rounded-[2px] px-2.5 py-1 font-display text-[9px] font-700 uppercase tracking-[0.12em]" style={{ color: r.accent.hex, border: `1px solid ${r.accent.hex}55`, background: r.accent.soft }}>{r.state}</span>
            </div>
          ))}
        </div>
      </Section>
      <NoteRow>Áreas continuam visíveis, mas não recebem clique ou arrasto.</NoteRow>
    </>
  );
}

function SceneContent() {
  return (
    <>
      <Section n="01" title="Identidade">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Nome da cena" value="Doca 7 — o mercado que se desfez" />
          <Field label="Local" value="Pátio de carga · Submundo de Vosek" />
        </div>
      </Section>
      <Section n="02" title="Mapa e Grade">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Escala" value="1 m" />
          <Field label="Largura" value="30 cél." />
          <Field label="Altura" value="24 cél." />
        </div>
      </Section>
      <Section n="03" title="Permissões">
        <CheckRow label="Jogadores podem criar áreas" sub="edição limitada à autoria" defaultChecked />
        <div className="h-2" />
        <CheckRow label="Bloquear movimento fora do turno" sub="somente durante combate ativo" />
      </Section>
      <NoteRow accent={ACCENTS.danger}>Reduzir a grade pode deixar tokens e objetos fora da área utilizável.</NoteRow>
    </>
  );
}

/* ================================================================== */
/*  Panel definitions (metadata + content)                             */
/* ================================================================== */

export type PanelDef = {
  code: string;
  index: string;
  title: string;
  status: string;
  accent: Accent;
  meta?: ReactNode;
  secondary?: { label: string };
  primary?: { label: string; hint?: string };
  Content: ComponentType;
};

export const PANEL_DEFS: Record<string, PanelDef> = {
  dice: { code: "Rolagem", index: "01", title: "Rolar Dados", status: "d8 · maior dado + perícia + modificadores", accent: ACCENTS.cyan, Content: DiceRollerPanel },
  measure: { code: "Medição", index: "02", title: "Medir", status: "Instantânea · aguardando origem", accent: ACCENTS.cyan, secondary: { label: "Cancelar" }, primary: { label: "Concluir", hint: "⏎" }, Content: MeasureContent },
  mark: { code: "Sinal", index: "03", title: "Marcar", status: "Sinal tático · pronto para posicionar", accent: ACCENTS.cyan, meta: <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-faint">3 na cena</span>, primary: { label: "Posicionar", hint: "Clique" }, Content: MarkContent },
  areas: { code: "Áreas", index: "04", title: "Áreas", status: "Pronto · esfera de 6 m", accent: ACCENTS.arcane, secondary: { label: "Descartar" }, primary: { label: "Manter na Mesa" }, Content: AreasContent },
  rounds: { code: "Iniciativa", index: "05", title: "Rodadas", status: "Configuração · nenhum combate ativo", accent: ACCENTS.amber, primary: { label: "Iniciar Rodadas" }, Content: RoundsContent },
  terrain: { code: "Terreno", index: "06", title: "Terreno", status: "Difícil · pincel de 1 célula", accent: ACCENTS.good, meta: <KeyCap k="D" action="marcar" />, secondary: { label: "Limpar tudo" }, primary: { label: "Pronto" }, Content: TerrainContent },
  objects: { code: "Objetos", index: "07", title: "Objetos", status: "Criar · caixa / contêiner", accent: ACCENTS.cyan, secondary: { label: "Limpar seleção" }, primary: { label: "Criar Objeto" }, Content: ObjectsContent },
  token: { code: "Token", index: "08", title: "Adicionar Token", status: "Configuração · posição no próximo passo", accent: ACCENTS.cyan, secondary: { label: "Cancelar" }, primary: { label: "Continuar" }, Content: TokenContent },
  layers: { code: "Camadas", index: "09", title: "Camadas", status: "Visibilidade e interação", accent: ACCENTS.cyan, secondary: { label: "Restaurar padrão" }, Content: LayersContent },
  scene: { code: "Cena", index: "10", title: "Configurações da Cena", status: "Doca 7 · alterações persistentes", accent: ACCENTS.cyan, secondary: { label: "Descartar" }, primary: { label: "Salvar Cena" }, Content: SceneContent },
};

function SelectHint() {
  return (
    <div className="relative flex h-56 flex-col items-center justify-center gap-3 rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
      <Brackets color={ACCENTS.cyan.hex} />
      <Cursor width={26} height={26} className="text-cyan" />
      <div className="text-center">
        <div className="font-display text-[12px] font-600 uppercase tracking-[0.18em] text-ink">Seleção</div>
        <div className="mt-1 max-w-[240px] font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">Selecione uma ferramenta na barra para abrir seu painel.</div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Toolbar + floating workspace + HUD                                 */
/* ================================================================== */

export const TOOLS: { key: string; icon: Icon; label: string; badge?: number }[] = [
  { key: "select", icon: Cursor, label: "Selecionar" },
  { key: "dice", icon: Dice, label: "Rolar Dados" },
  { key: "measure", icon: Ruler, label: "Medir" },
  { key: "mark", icon: MapPin, label: "Marcar" },
  { key: "areas", icon: Hexagon, label: "Áreas", badge: 3 },
  { key: "rounds", icon: Swords, label: "Rodadas" },
  { key: "terrain", icon: Brush, label: "Terreno" },
  { key: "objects", icon: Cube, label: "Objetos" },
  { key: "token", icon: UserPlus, label: "Token" },
  { key: "layers", icon: Layers, label: "Camadas" },
  { key: "scene", icon: Gear, label: "Cena" },
];

function ViewportBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const c = "#2a4258";
  const common: React.CSSProperties = { position: "absolute", width: 22, height: 22 };
  const map = {
    tl: { top: 10, left: 10, borderTop: `1px solid ${c}`, borderLeft: `1px solid ${c}` },
    tr: { top: 10, right: 10, borderTop: `1px solid ${c}`, borderRight: `1px solid ${c}` },
    bl: { bottom: 10, left: 10, borderBottom: `1px solid ${c}`, borderLeft: `1px solid ${c}` },
    br: { bottom: 10, right: 10, borderBottom: `1px solid ${c}`, borderRight: `1px solid ${c}` },
  } as const;
  return <span style={{ ...common, ...map[pos] }} />;
}

export function MapField({ children, brackets = true }: { children?: ReactNode; brackets?: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(900px 520px at 68% 18%, #10203a, #060b14 72%)" }} />
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#12233b 1px, transparent 1px), linear-gradient(90deg, #12233b 1px, transparent 1px)", backgroundSize: "38px 33px", maskImage: "radial-gradient(circle at 60% 42%, black, transparent 92%)" }} />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 160px rgba(0,0,0,0.6)" }} />
      {brackets && (
        <>
          <ViewportBracket pos="tl" />
          <ViewportBracket pos="tr" />
          <ViewportBracket pos="bl" />
          <ViewportBracket pos="br" />
        </>
      )}
      {children}
    </>
  );
}

export function Toolbar({ tool, onPick, orientation = "vertical" }: { tool: string; onPick: (k: string) => void; orientation?: "vertical" | "horizontal" }) {
  const vert = orientation === "vertical";
  return (
    <div className={`flex ${vert ? "w-14 flex-col py-3" : "flex-row px-3 py-2"} shrink-0 items-center gap-1`} style={{ background: "#070d17", [vert ? "borderRight" : "borderBottom"]: "1px solid #16233a" }}>
      {vert && <span className="mb-1 font-display text-[8px] font-700 uppercase tracking-[0.2em] text-ink-faint">FRR</span>}
      {TOOLS.map((t) => {
        const active = tool === t.key;
        const Ic = t.icon;
        return (
          <button key={t.key} onClick={() => onPick(t.key)} title={t.label} className="relative flex h-10 w-10 items-center justify-center rounded-[2px] transition-colors" style={{ color: active ? ACCENTS.cyan.hex : "#5b6f8f", background: active ? ACCENTS.cyan.soft : "transparent", border: `1px solid ${active ? ACCENTS.cyan.hex + "77" : "transparent"}` }}>
            {active && <span className={`absolute ${vert ? "left-0 top-1/2 h-5 w-[2px] -translate-y-1/2" : "bottom-0 left-1/2 h-[2px] w-5 -translate-x-1/2"}`} style={{ background: ACCENTS.cyan.hex }} />}
            <Ic width={19} height={19} />
            {t.badge && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-mono text-[8px] font-700" style={{ background: ACCENTS.amber.hex, color: "#08111c" }}>{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ToolsWorkspace() {
  const [tool, setTool] = useState("measure");
  const activeLabel = TOOLS.find((t) => t.key === tool)?.label ?? "";
  const def = PANEL_DEFS[tool];
  return (
    <div className="flex h-full overflow-hidden rounded-[3px]" style={{ border: "1px solid #182338" }}>
      <Toolbar tool={tool} onPick={setTool} />

      {/* map area */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <MapField />

        {/* scene header */}
        <div className="absolute left-6 top-5 z-10">
          <div className="font-mono text-[8.5px] uppercase tracking-[0.28em] text-cyan">Cena Ativa</div>
          <h2 className="mt-1 font-display text-[20px] font-700 uppercase tracking-[0.03em] text-ink" style={{ textShadow: "0 2px 14px #000" }}>Doca 7 — o mercado que se desfez</h2>
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">Pátio de carga · Submundo de Vosek</div>
        </div>

        {/* top-right readout */}
        <div className="absolute right-8 top-6 z-10 hidden text-right md:block">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">Grade 30 × 24 · 1 m/cél.</div>
          <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-cyan">Snap Hex · Ferram.: {activeLabel}</div>
        </div>

        {/* bottom-right hud: scale + zoom */}
        <div className="absolute bottom-6 right-8 z-10 hidden items-center gap-3 md:flex">
          <div className="flex flex-col items-end">
            <div className="h-1.5 w-16" style={{ borderLeft: "1px solid #3a5678", borderRight: "1px solid #3a5678", borderBottom: "1px solid #3a5678" }} />
            <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-faint">5 m</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">100%</span>
        </div>

        {/* active panel */}
        <div className="rup-scroll absolute bottom-4 left-6 top-[92px] z-10 w-[min(470px,calc(100%-3rem))] overflow-y-auto">
          {tool === "select" || !def ? (
            <SelectHint />
          ) : (
            <PanelShell code={def.code} index={def.index} title={def.title} status={def.status} accent={def.accent} meta={def.meta} secondary={def.secondary} primary={def.primary}>
              <def.Content />
            </PanelShell>
          )}
        </div>
      </div>
    </div>
  );
}
