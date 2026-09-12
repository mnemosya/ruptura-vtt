import { useState, type ReactNode } from "react";
import { ACCENTS, type Accent } from "./ui";
import { Brackets, Section } from "./tools";
import { Check } from "../lib/icons";

/* ------------------------------------------------------------------ */
/*  Mock data                                                           */
/* ------------------------------------------------------------------ */

type Condition = { label: string; accent: Accent; turns?: number };

type Character = {
  id: string;
  initials: string;
  name: string;
  role: string;
  vertente: string;
  side: "PJ" | "PN";
  accent: Accent;
  hpCur: number;
  hpMax: number;
  pd: number;
  pdMax: number;
  stats: { label: string; value: number }[];
  conditions: Condition[];
  actions: string[];
  faction?: string;
};

const CHARS: Character[] = [
  {
    id: "mv",
    initials: "MV",
    name: "Mara Venn",
    role: "Agente · Cinética",
    vertente: "Cinética",
    side: "PJ",
    accent: ACCENTS.cyan,
    hpCur: 14,
    hpMax: 18,
    pd: 3,
    pdMax: 4,
    stats: [
      { label: "Reflexos", value: 3 },
      { label: "Força", value: 2 },
      { label: "Percepção", value: 2 },
      { label: "Vontade", value: 1 },
      { label: "Influência", value: 1 },
    ],
    conditions: [],
    actions: ["Rajada Cinética", "Impacto Brutal", "Recuar"],
    faction: "Os Fragmentos",
  },
  {
    id: "kd",
    initials: "KD",
    name: "Kael Dorn",
    role: "Infiltrador · Sináptico",
    vertente: "Sináptica",
    side: "PJ",
    accent: ACCENTS.magenta,
    hpCur: 9,
    hpMax: 16,
    pd: 2,
    pdMax: 3,
    stats: [
      { label: "Reflexos", value: 2 },
      { label: "Força", value: 1 },
      { label: "Percepção", value: 3 },
      { label: "Vontade", value: 2 },
      { label: "Influência", value: 2 },
    ],
    conditions: [
      { label: "Atordoado", accent: ACCENTS.amber, turns: 1 },
      { label: "Visão Reduzida", accent: ACCENTS.slate },
    ],
    actions: ["Pulso Sináptico", "Evasão", "Hackear"],
    faction: "Os Fragmentos",
  },
  {
    id: "lv",
    initials: "LX",
    name: "Loïca «Lox» Voss",
    role: "Especialista · Material",
    vertente: "Material",
    side: "PJ",
    accent: ACCENTS.good,
    hpCur: 16,
    hpMax: 16,
    pd: 4,
    pdMax: 4,
    stats: [
      { label: "Reflexos", value: 1 },
      { label: "Força", value: 3 },
      { label: "Percepção", value: 1 },
      { label: "Vontade", value: 3 },
      { label: "Influência", value: 2 },
    ],
    conditions: [{ label: "Armadura Ativa", accent: ACCENTS.good }],
    actions: ["Barricada", "Reforço", "Atirar"],
    faction: "Os Fragmentos",
  },
  {
    id: "s2",
    initials: "#2",
    name: "Sentinela da Doca",
    role: "Combatente · sem vertente",
    vertente: "",
    side: "PN",
    accent: ACCENTS.danger,
    hpCur: 12,
    hpMax: 12,
    pd: 2,
    pdMax: 2,
    stats: [
      { label: "Reflexos", value: 1 },
      { label: "Força", value: 2 },
      { label: "Percepção", value: 1 },
      { label: "Vontade", value: 1 },
      { label: "Influência", value: 0 },
    ],
    conditions: [],
    actions: ["Atacar", "Alertar"],
  },
  {
    id: "s3",
    initials: "#3",
    name: "Contrabandista",
    role: "Espião · sem vertente",
    vertente: "",
    side: "PN",
    accent: ACCENTS.danger,
    hpCur: 5,
    hpMax: 10,
    pd: 1,
    pdMax: 2,
    stats: [
      { label: "Reflexos", value: 2 },
      { label: "Força", value: 1 },
      { label: "Percepção", value: 2 },
      { label: "Vontade", value: 0 },
      { label: "Influência", value: 2 },
    ],
    conditions: [{ label: "Ferido", accent: ACCENTS.danger }],
    actions: ["Fugir", "Negociar", "Atacar de Surpresa"],
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function HpBar({ cur, max, accent }: { cur: number; max: number; accent: Accent }) {
  const pct = Math.max(0, Math.min(1, cur / max));
  const low = pct < 0.35;
  const color = low ? ACCENTS.danger.hex : accent.hex;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-[1px]" style={{ background: "#16233a" }}>
      <div className="h-full rounded-[1px] transition-all" style={{ width: `${pct * 100}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
    </div>
  );
}

function CondBadge({ label, accent, turns }: Condition) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] px-1.5 py-[2px] font-mono text-[8.5px] uppercase tracking-[0.08em]" style={{ color: accent.hex, border: `1px solid ${accent.hex}44`, background: accent.soft }}>
      {label}
      {turns !== undefined && <span style={{ opacity: 0.7 }}>×{turns}</span>}
    </span>
  );
}

function CharRow({ char, selected, onClick }: { char: Character; selected: boolean; onClick: () => void }) {
  const hpPct = char.hpCur / char.hpMax;
  const low = hpPct < 0.35;
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 rounded-[2px] px-3 py-2.5 text-left transition-colors"
      style={{
        border: `1px solid ${selected ? char.accent.hex + "77" : "#16233a"}`,
        background: selected ? char.accent.soft : "transparent",
      }}
    >
      {selected && <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-[1px]" style={{ background: char.accent.hex }} />}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] font-display text-[11px] font-700"
        style={{ color: char.accent.hex, border: `1px solid ${char.accent.hex}55`, background: char.accent.soft }}
      >
        {char.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-display text-[12px] font-700 uppercase tracking-[0.06em] text-ink">{char.name}</span>
          <span className="rounded-[2px] px-1.5 py-[1px] font-display text-[8px] font-600 uppercase tracking-[0.1em]" style={{ color: char.accent.hex, border: `1px solid ${char.accent.hex}44` }}>{char.side}</span>
        </div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.06em] text-ink-faint">{char.role}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <HpBar cur={char.hpCur} max={char.hpMax} accent={char.accent} />
          <span className="shrink-0 font-mono text-[8px]" style={{ color: low ? ACCENTS.danger.hex : "#4f6285" }}>{char.hpCur}/{char.hpMax}</span>
        </div>
      </div>
    </button>
  );
}

function StatBlock({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1 rounded-[2px] py-2.5" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
          <span className="font-mono text-[18px] font-700 leading-none text-ink">{s.value}</span>
          <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-ink-faint">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function DetailPane({ char }: { char: Character }) {
  return (
    <div
      className="relative flex h-full flex-col rounded-[2px] overflow-hidden"
      style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: `1px solid ${char.accent.hex}44` }}
    >
      <Brackets color={char.accent.hex} size={13} inset={8} />

      {/* spine */}
      <div className="absolute bottom-0 left-0 top-0 flex w-9 flex-col items-center justify-between py-4" style={{ borderRight: "1px solid #16233a", background: "rgba(255,255,255,0.013)" }}>
        <span className="font-mono text-[9px] font-700 tracking-widest" style={{ color: char.accent.hex }}>{char.initials}</span>
        <span className="font-display text-[8px] font-700 uppercase tracking-[0.3em]" style={{ color: char.accent.hex, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: 0.85 }}>FICHA</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: char.accent.hex, boxShadow: `0 0 6px ${char.accent.hex}` }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col pl-9">
        {/* header */}
        <div className="flex items-start gap-3 px-4 pb-3 pt-4" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="flex-1">
            <h3 className="font-display text-[18px] font-700 uppercase tracking-[0.1em] leading-none text-ink">{char.name}</h3>
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-faint">
              <span className="h-1 w-1 rounded-full" style={{ background: char.accent.hex }} />
              {char.role}
              {char.faction && <> · {char.faction}</>}
            </div>
          </div>
          <span className="rounded-[2px] px-2.5 py-1 font-display text-[10px] font-700 uppercase tracking-[0.14em]" style={{ color: char.accent.hex, border: `1px solid ${char.accent.hex}66`, background: char.accent.soft }}>{char.side}</span>
        </div>

        <div className="rup-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* hp / pd */}
          <Section n="01" title="Integridade">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Pontos de Vida</span>
                  <span className="font-mono text-[10px]" style={{ color: char.hpCur / char.hpMax < 0.35 ? ACCENTS.danger.hex : char.accent.hex }}>{char.hpCur} / {char.hpMax}</span>
                </div>
                <div className="mt-2">
                  <HpBar cur={char.hpCur} max={char.hpMax} accent={char.accent} />
                </div>
              </div>
              <div className="rounded-[2px] px-3 py-3" style={{ border: "1px solid #16233a", background: "#0c1420" }}>
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Pontos de Dado</span>
                  <span className="font-mono text-[10px]" style={{ color: char.accent.hex }}>{char.pd} / {char.pdMax}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: char.pdMax }).map((_, i) => (
                    <span key={i} className="h-2 flex-1 rounded-[1px]" style={{ background: i < char.pd ? char.accent.hex : "#16233a" }} />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* stats */}
          <Section n="02" title="Atributos">
            <StatBlock stats={char.stats} />
          </Section>

          {/* conditions */}
          <Section n="03" title="Condições">
            {char.conditions.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[2px] px-3 py-2.5" style={{ border: "1px solid #16233a" }}>
                <Check width={13} height={13} style={{ color: ACCENTS.good.hex }} />
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">Sem condições ativas</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {char.conditions.map((c) => <CondBadge key={c.label} {...c} />)}
              </div>
            )}
          </Section>

          {/* actions */}
          <Section n="04" title="Ações Disponíveis">
            <div className="grid grid-cols-2 gap-1.5">
              {char.actions.map((a) => (
                <button key={a} className="rounded-[2px] px-3 py-2 font-display text-[10px] font-600 uppercase tracking-[0.1em] text-left transition-colors hover:border-opacity-80" style={{ border: "1px solid #16233a", color: char.accent.hex, background: char.accent.soft }}>
                  <span style={{ opacity: 0.6 }}>▹ </span>{a}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export default function Personagens() {
  const [selected, setSelected] = useState<string>("mv");
  const char = CHARS.find((c) => c.id === selected) ?? CHARS[0];

  const pjs = CHARS.filter((c) => c.side === "PJ");
  const pns = CHARS.filter((c) => c.side === "PN");

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      {/* list pane */}
      <div className="flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1424,#080e19)", border: "1px solid #18263f" }}>
        <div className="px-4 pb-2.5 pt-3.5" style={{ borderBottom: "1px solid #16233a" }}>
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.2em] text-ink">Personagens</div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-faint">Mesa Teste v0.58 · {CHARS.length} fichas</div>
        </div>

        <div className="rup-scroll flex-1 space-y-4 overflow-y-auto px-3 py-3">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-[8px] font-700 tracking-widest text-cyan/70">PJ</span>
              <span className="font-display text-[8px] font-600 uppercase tracking-[0.2em] text-ink-faint">Jogadores</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
            </div>
            <div className="space-y-1">
              {pjs.map((c) => <CharRow key={c.id} char={c} selected={selected === c.id} onClick={() => setSelected(c.id)} />)}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-[8px] font-700 tracking-widest text-danger/70">PN</span>
              <span className="font-display text-[8px] font-600 uppercase tracking-[0.2em] text-ink-faint">Narrador</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
            </div>
            <div className="space-y-1">
              {pns.map((c) => <CharRow key={c.id} char={c} selected={selected === c.id} onClick={() => setSelected(c.id)} />)}
            </div>
          </div>
        </div>
      </div>

      {/* detail pane */}
      <div className="min-w-0 flex-1">
        <DetailPane char={char} />
      </div>
    </div>
  );
}
