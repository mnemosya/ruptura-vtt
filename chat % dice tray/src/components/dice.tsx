import { useCallback, useState } from "react";
import { ACCENTS, RESULTS, type ResultKey } from "./ui";
import { Dice, Chevron } from "../lib/icons";
import {
  PolyDie,
  PhysicsDiceArena,
  type PhysicsDieResult,
  type PhysicsDieSpec,
} from "../lib/dice-shapes";

/* ================================================================== */
/*  Ruptura roll (teste): pool = Atributo (nº d8), pega o MAIOR,       */
/*  soma bônus da Perícia + modificadores, compara com a Dificuldade.  */
/*  Bandeja livre: monta um conjunto qualquer de dados (d4…d20, vários */
/*  do mesmo tipo) e rola somando os resultados.                       */
/* ================================================================== */

const LOOSE = [4, 6, 8, 10, 12, 20];

const ATTRS = [
  { name: "Potência", v: 4 },
  { name: "Reflexos", v: 3 },
  { name: "Vigor", v: 3 },
  { name: "Intelecto", v: 2 },
  { name: "Presença", v: 2 },
];
const SKILLS = [
  { name: "Pontaria", v: 3 },
  { name: "Atletismo", v: 2 },
  { name: "Furtividade", v: 2 },
  { name: "Arcana", v: 4 },
  { name: "Persuasão", v: 1 },
  { name: "Sobrevivência", v: 2 },
];
const DIFFS = [
  { v: 8, label: "Fácil" },
  { v: 10, label: "Padrão" },
  { v: 13, label: "Difícil" },
  { v: 16, label: "Extrema" },
];

function tierOf(maxDie: number, total: number, diff: number): ResultKey {
  const m = total - diff;
  if (m >= 0) {
    if (maxDie === 8 || m >= 5) return "critico";
    if (m >= 2) return "padrao";
    return "limitado";
  }
  return m >= -2 ? "falha-limitada" : "falha";
}

/* ---- primitives ---------------------------------------------------- */

function Select({ label, value, onChange, options }: { label: string; value: number; onChange: (i: number) => void; options: { name: string; v: number }[] }) {
  return (
    <label className="block min-w-0">
      <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">{label}</span>
      <div className="relative mt-1">
        <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full appearance-none rounded-[2px] bg-transparent py-2 pl-2.5 pr-7 font-body text-[12px] text-ink focus:outline-none" style={{ border: "1px solid #1c2b45" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = ACCENTS.cyan.hex + "88")} onBlur={(e) => (e.currentTarget.style.borderColor = "#1c2b45")}>
          {options.map((o, i) => <option key={o.name} value={i} className="bg-[#0b1322]">{o.name} · {o.v}</option>)}
        </select>
        <Chevron width={13} height={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
      </div>
    </label>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const fmt = value > 0 ? `+${value}` : `${value}`;
  return (
    <div className="inline-flex items-center rounded-[2px]" style={{ border: "1px solid #1c2b45" }}>
      <button onClick={() => onChange(value - 1)} className="px-3 py-1.5 font-mono text-[14px] text-ink-dim transition-colors hover:text-ink">−</button>
      <span className="min-w-[40px] text-center font-mono text-[13px] font-700" style={{ color: value === 0 ? "#8ea0bd" : value > 0 ? ACCENTS.good.hex : ACCENTS.danger.hex }}>{fmt}</span>
      <button onClick={() => onChange(value + 1)} className="px-3 py-1.5 font-mono text-[14px] text-ink-dim transition-colors hover:text-ink">+</button>
    </div>
  );
}

function DifficultyControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {DIFFS.map((d) => {
          const on = d.v === value;
          return (
            <button key={d.v} onClick={() => onChange(d.v)} className="flex min-w-[52px] flex-1 flex-col items-center rounded-[2px] px-2 py-1.5 transition-colors" style={{ color: on ? ACCENTS.amber.hex : "#6f83a3", background: on ? ACCENTS.amber.soft : "transparent", border: `1px solid ${on ? ACCENTS.amber.hex : "#1c2b45"}` }}>
              <span className="font-mono text-[13px] font-700">{d.v}</span>
              <span className="font-display text-[7.5px] font-600 uppercase tracking-[0.1em]">{d.label}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Valor personalizado</span>
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-20 rounded-[2px] bg-transparent px-2 py-1.5 text-right font-mono text-[13px] font-700 text-amber focus:outline-none" style={{ border: "1px solid #1c2b45", color: ACCENTS.amber.hex }} />
      </label>
    </div>
  );
}

function RollButton({ label, solid = false, disabled = false, onClick }: { label: string; solid?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-[2px] py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.22em] transition-colors disabled:cursor-not-allowed"
      style={disabled
        ? { color: "#4a5a78", background: "transparent", border: "1px solid #1c2b45" }
        : solid ? { color: "#08111c", background: ACCENTS.cyan.hex } : { color: ACCENTS.cyan.hex, background: ACCENTS.cyan.soft, border: `1px solid ${ACCENTS.cyan.hex}88` }}
      onMouseEnter={(e) => { if (!solid && !disabled) e.currentTarget.style.borderColor = ACCENTS.cyan.hex; }}
      onMouseLeave={(e) => { if (!solid && !disabled) e.currentTarget.style.borderColor = ACCENTS.cyan.hex + "88"; }}>
      <Dice width={16} height={16} />
      {label}
    </button>
  );
}

function GroupLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-display text-[8px] font-700 uppercase tracking-[0.24em] text-cyan/70">{children}</span>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,#18263f,transparent)" }} />
      {right}
    </div>
  );
}

/* ================================================================== */
/*  Free dice pool — pick any dice, several of the same, roll & sum    */
/* ================================================================== */

type CountMode = "sum" | "high";

function ModeToggle({ value, onChange }: { value: CountMode; onChange: (m: CountMode) => void }) {
  const opts: { k: CountMode; label: string }[] = [
    { k: "sum", label: "Somar" },
    { k: "high", label: "Maior" },
  ];
  return (
    <div className="inline-flex rounded-[2px]" style={{ border: "1px solid #1c2b45" }}>
      {opts.map((o) => {
        const on = o.k === value;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} className="px-2.5 py-1.5 font-display text-[8px] font-700 uppercase tracking-[0.14em] transition-colors"
            style={{ color: on ? ACCENTS.arcane.hex : "#6f83a3", background: on ? ACCENTS.arcane.soft : "transparent" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- Mesa: 3D rolling area to the right ------------------------- */

function DiceMesa({
  active,
  rolling,
  dice,
  rollToken,
  accent,
  onSettled,
}: {
  active: boolean;
  rolling: boolean;
  dice: PhysicsDieSpec[];
  rollToken: number;
  accent: string;
  onSettled: (results: PhysicsDieResult[]) => void;
}) {
  return (
    <div
      className="relative rounded-[2px] overflow-visible flex-shrink-0"
      style={{ width: 176, minHeight: 150, background: "#04080e", border: "1px solid #111d2e" }}
    >
      {/* dot-grid background */}
      <div
        className="absolute inset-0 rounded-[2px]"
        style={{
          backgroundImage: `radial-gradient(circle, ${accent}28 1px, transparent 1px)`,
          backgroundSize: "10px 10px",
        }}
      />
      {/* corner brackets */}
      <span className="absolute top-1 left-1 w-3 h-3 border-t border-l" style={{ borderColor: accent + "55" }} />
      <span className="absolute top-1 right-1 w-3 h-3 border-t border-r" style={{ borderColor: accent + "55" }} />
      <span className="absolute bottom-1 left-1 w-3 h-3 border-b border-l" style={{ borderColor: accent + "55" }} />
      <span className="absolute bottom-1 right-1 w-3 h-3 border-b border-r" style={{ borderColor: accent + "55" }} />

      {active && dice.length > 0 ? (
        <PhysicsDiceArena
          dice={dice}
          rollToken={rollToken}
          onSettled={onSettled}
          accent={accent}
          height={148}
          className="relative z-[2]"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="font-mono text-[7px] uppercase tracking-[0.24em]" style={{ color: accent + "33" }}>MESA</span>
          {rolling && <span className="font-mono text-[7px] uppercase tracking-[0.18em]" style={{ color: accent + "66" }}>preparando física</span>}
        </div>
      )}
    </div>
  );
}

/* ---- Free pool --------------------------------------------------- */

function FreePool({ size = 46, solidRoll = false, initial = { 8: 1 } as Record<number, number>, defaultMode = "sum" as CountMode }) {
  const [counts, setCounts] = useState<Record<number, number>>(initial);
  const [mods, setMods] = useState(0);
  const [mode, setMode] = useState<CountMode>(defaultMode);
  const [results, setResults] = useState<{ sides: number; value: number }[] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [rollToken, setRollToken] = useState(0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const add = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => ({ ...c, [s]: (c[s] || 0) + 1 })); };
  const dec = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => { const n = { ...c }; if ((n[s] || 0) > 1) n[s]--; else delete n[s]; return n; }); };
  const clear = () => { if (rolling) return; setResults(null); setCounts({}); setMods(0); };

  /* flat pool array derived from counts */
  const pool = LOOSE.flatMap((s) => Array.from({ length: counts[s] || 0 }, () => s));
  const physicalDice = pool.map((sides, index) => ({ id: `free-${index}`, sides }));

  const settleRoll = useCallback((final: PhysicsDieResult[]) => {
    setResults(final.map(({ sides, value }) => ({ sides, value })));
    setRolling(false);
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  }, []);

  const roll = () => {
    if (rolling || pool.length === 0) return;
    setRolling(true);
    setLanded(false);
    setResults(null);
    setRollToken((token) => token + 1);
  };

  const diceBase = results ? (mode === "high" ? Math.max(...results.map((d) => d.value)) : results.reduce((a, b) => a + b.value, 0)) : 0;
  const bestIdx = results && mode === "high" ? results.reduce((bi, d, i, arr) => (d.value > arr[bi].value ? i : bi), 0) : -1;
  const finalSum = diceBase + mods;

  const dieSize = size - 4;

  return (
    <div className="space-y-3">
      {/* palette — click to add, right-click to remove */}
      <div>
        <GroupLabel>Dados</GroupLabel>
        <div className="flex flex-wrap gap-2">
          {LOOSE.map((s) => {
            const n = counts[s] || 0;
            return (
              <button key={s} onClick={() => add(s)} onContextMenu={(e) => { e.preventDefault(); dec(s); }} title={`d${s} — clique adiciona · direito remove`} className="relative transition-transform hover:-translate-y-0.5 active:translate-y-0">
                <PolyDie sides={s} active={n > 0} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={size} />
                {n > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-700" style={{ background: ACCENTS.arcane.hex, color: "#08111c" }}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* two-column: left = pool + controls + results, right = mesa */}
      <div className="flex gap-3 items-stretch">
        {/* LEFT */}
        <div className="min-w-0 flex-1 space-y-3">

          {/* pool — individual die icons (no chips) */}
          <div className="min-h-[36px]">
            {total === 0 ? (
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">toque num dado para montar o conjunto</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {pool.map((s, i) => (
                  <button key={i} onClick={() => dec(s)} title="clique para remover" className="transition-transform hover:-translate-y-0.5 active:scale-95">
                    {results ? (
                      <PolyDie sides={s} value={results[i]?.value} active={!rolling && i === bestIdx} landed={landed} rollIndex={i} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                    ) : (
                      <PolyDie sides={s} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                    )}
                  </button>
                ))}
                <button onClick={clear} className="ml-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint transition-colors hover:text-ink-dim">limpar</button>
              </div>
            )}
          </div>

          {/* contagem + modifier — same row, same height */}
          <div className="flex items-stretch gap-2">
            <ModeToggle value={mode} onChange={setMode} />
            <Stepper value={mods} onChange={setMods} />
          </div>

          {/* result total — below the dice */}
          {results && !rolling && (
            <div className="rup-reveal rounded-[2px] overflow-hidden" style={{ border: `1px solid ${ACCENTS.arcane.hex}44` }}>
              <div className="flex items-stretch">
                {/* accent spine */}
                <span className="w-1 flex-shrink-0" style={{ background: ACCENTS.arcane.hex }} />
                <div className="flex flex-1 items-center justify-between px-3 py-2" style={{ background: ACCENTS.arcane.soft }}>
                  <div className="leading-none">
                    {(mods !== 0 || mode === "high") && (
                      <div className="mb-0.5 font-mono text-[9px] text-ink-dim">
                        {mode === "high" ? "maior " : ""}{diceBase}
                        {mods !== 0 && <span style={{ color: mods > 0 ? ACCENTS.good.hex : ACCENTS.danger.hex }}> {mods > 0 ? "+" : "−"} {Math.abs(mods)}</span>}
                      </div>
                    )}
                    <div className="font-mono text-[7.5px] uppercase tracking-[0.14em]" style={{ color: ACCENTS.arcane.hex + "aa" }}>
                      {mode === "high" ? "resultado" : mods !== 0 ? "total" : "soma"}
                    </div>
                  </div>
                  <div className="rup-countpop font-mono text-[32px] font-700 leading-none" style={{ color: ACCENTS.arcane.hex }}>
                    {finalSum}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — mesa */}
        <DiceMesa
          active={rolling || !!results}
          rolling={rolling}
          dice={physicalDice}
          rollToken={rollToken}
          accent={ACCENTS.arcane.hex}
          onSettled={settleRoll}
        />
      </div>

      <RollButton label={total === 0 ? "Escolha dados" : rolling ? "Rolando…" : `Rolar ${total} dado${total !== 1 ? "s" : ""}`} disabled={total === 0 || rolling} solid={solidRoll} onClick={roll} />
    </div>
  );
}

/* ================================================================== */
/*  Ruptura test read-outs                                             */
/* ================================================================== */

type Roll = { dice: number[]; maxIdx: number; maxDie: number; total: number; key: ResultKey };

function useTest() {
  const [attrIdx, setAttrIdx] = useState(1);
  const [skillIdx, setSkillIdx] = useState(0);
  const [mods, setMods] = useState(0);
  const [diff, setDiff] = useState(10);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const [rollToken, setRollToken] = useState(0);
  const attr = ATTRS[attrIdx];
  const skill = SKILLS[skillIdx];
  const doRoll = () => {
    if (rolling) return;
    setRolling(true);
    setLanded(false);
    setRoll(null);
    setRollToken((token) => token + 1);
  };
  const settleRoll = useCallback((physicalResults: PhysicsDieResult[]) => {
    const dice = physicalResults.map(({ value }) => value);
    let maxIdx = 0;
    dice.forEach((d, i) => { if (d > dice[maxIdx]) maxIdx = i; });
    const maxDie = dice[maxIdx];
    const t = maxDie + skill.v + mods;
    setRolling(false);
    setRoll({ dice, maxIdx, maxDie, total: t, key: tierOf(maxDie, t, diff) });
    setLanded(true);
    setTimeout(() => setLanded(false), 500);
  }, [diff, mods, skill.v]);
  return { attrIdx, setAttrIdx, skillIdx, setSkillIdx, attr, skill, mods, setMods, diff, setDiff, roll, doRoll, settleRoll, rollToken, rolling, landed };
}

function TestPool({
  r,
  count,
  size = 46,
  rolling = false,
  landed = false,
  rollToken,
  onSettled,
}: {
  r: Roll | null;
  count: number;
  size?: number;
  rolling?: boolean;
  landed?: boolean;
  rollToken: number;
  onSettled: (results: PhysicsDieResult[]) => void;
}) {
  if (rolling || r) {
    const physicalCount = rolling ? count : r?.dice.length ?? count;
    const dice = Array.from({ length: physicalCount }, (_, index) => ({ id: `test-${index}`, sides: 8 }));
    return (
      <div className="relative rounded-[2px] overflow-visible" style={{ minHeight: 80, background: "#04080e", border: "1px solid #111d2e" }}>
        <div className="absolute inset-0 rounded-[2px]" style={{ backgroundImage: `radial-gradient(circle, #35c7d828 1px, transparent 1px)`, backgroundSize: "10px 10px" }} />
        <PhysicsDiceArena dice={dice} rollToken={rollToken} onSettled={onSettled} accent="#35c7d8" height={132} className="relative z-[2]" />
      </div>
    );
  }
  const dice = Array.from({ length: count }, () => null);
  return (
    <div className="flex flex-wrap gap-2">
      {dice.map((_, i) => <PolyDie key={i} sides={8} landed={landed} rollIndex={i} dim size={size} />)}
    </div>
  );
}

function ResultBanner({ r, skillV, mods }: { r: Roll; skillV: number; mods: number }) {
  const res = RESULTS[r.key];
  const seg = (v: string, c = "#8ea0bd") => <span className="font-mono text-[12px] font-700" style={{ color: c }}>{v}</span>;
  return (
    <div className="relative overflow-hidden rounded-[2px]" style={{ border: `1px solid ${res.accent.hex}55` }}>
      <span className="absolute inset-y-0 left-0 w-7" style={{ background: `repeating-linear-gradient(-45deg, ${res.accent.hex}44 0 2px, transparent 2px 6px)` }} />
      <div className="flex items-center gap-3 py-2.5 pl-10 pr-3" style={{ background: res.accent.soft }}>
        <res.Icon width={17} height={17} style={{ color: res.accent.hex, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[13px] font-700 uppercase tracking-[0.1em] leading-none" style={{ color: res.accent.hex }}>{res.label}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-ink-faint">
            maior {seg(String(r.maxDie), ACCENTS.cyan.hex)} + perícia {seg(`+${skillV}`)} + mod {seg(mods >= 0 ? `+${mods}` : String(mods))}
          </div>
        </div>
        <div className="text-right leading-none">
          <div className="rup-countpop font-mono text-[22px] font-700" style={{ color: res.accent.hex }}>{r.total}</div>
          <div className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink-faint">total</div>
        </div>
      </div>
    </div>
  );
}

function RupturaTest({ s }: { s: ReturnType<typeof useTest> }) {
  const [adv, setAdv] = useState(false);
  return (
    <>
      <div>
        <GroupLabel>Teste de Ruptura</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Atributo · nº d8" value={s.attrIdx} onChange={s.setAttrIdx} options={ATTRS} />
          <Select label="Perícia · bônus" value={s.skillIdx} onChange={s.setSkillIdx} options={SKILLS} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-display text-[8px] font-600 uppercase tracking-[0.16em] text-ink-faint">Modificadores</span>
          <Stepper value={s.mods} onChange={s.setMods} />
        </div>
      </div>

      <div className="rounded-[2px] p-3.5" style={{ background: "#0a1220", border: "1px solid #16233a" }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">Pool · <span className="text-cyan">{s.attr.v}d8</span> · maior dado</span>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">alvo {s.diff}</span>
        </div>
        <TestPool r={s.roll} count={s.attr.v} rolling={s.rolling} landed={s.landed} rollToken={s.rollToken} onSettled={s.settleRoll} />
        {s.roll && !s.rolling && <div className="mt-3.5 rup-reveal"><ResultBanner r={s.roll} skillV={s.skill.v} mods={s.mods} /></div>}
      </div>

      <RollButton label={s.rolling ? "Rolando…" : s.roll ? "Rolar de novo" : `Rolar ${s.attr.v}d8`} solid disabled={s.rolling} onClick={s.doRoll} />

      <div>
        <button onClick={() => setAdv((v) => !v)} className="flex w-full items-center">
          <GroupLabel right={<Chevron width={13} height={13} className="text-ink-faint" style={{ transform: adv ? "rotate(180deg)" : "none" }} />}>Avançado · Dificuldade</GroupLabel>
        </button>
        {adv && <div className="pt-1"><DifficultyControl value={s.diff} onChange={s.setDiff} /></div>}
      </div>
    </>
  );
}

/* ================================================================== */
/*  Tabbed dice roller — Atributo & Perícia | Livre                    */
/* ================================================================== */

function DiceTabs({ tab, onChange }: { tab: "test" | "free"; onChange: (t: "test" | "free") => void }) {
  const tabs: { k: "test" | "free"; label: string; hint: string }[] = [
    { k: "test", label: "Atributo & Perícia", hint: "Nd8 · maior" },
    { k: "free", label: "Livre", hint: "d4 a d20" },
  ];
  return (
    <div className="flex gap-1 rounded-[2px] p-1" style={{ background: "#0a1220", border: "1px solid #16233a" }}>
      {tabs.map((t) => {
        const on = t.k === tab;
        return (
          <button key={t.k} onClick={() => onChange(t.k)} className="flex flex-1 flex-col items-center gap-0.5 rounded-[2px] px-2 py-2 transition-colors"
            style={{ color: on ? ACCENTS.cyan.hex : "#6f83a3", background: on ? ACCENTS.cyan.soft : "transparent", border: `1px solid ${on ? ACCENTS.cyan.hex + "88" : "transparent"}` }}>
            <span className="font-display text-[9.5px] font-700 uppercase tracking-[0.14em]">{t.label}</span>
            <span className="font-mono text-[7.5px] uppercase tracking-[0.08em] text-ink-faint">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function DiceRoller({ size = 46 }: { size?: number }) {
  const s = useTest();
  const [tab, setTab] = useState<"test" | "free">("test");
  return (
    <div className="space-y-4">
      <DiceTabs tab={tab} onChange={setTab} />
      {tab === "test" ? (
        <div className="space-y-5"><RupturaTest s={s} /></div>
      ) : (
        <FreePool size={size} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Variant A — floating tools panel                                   */
/* ================================================================== */

export function DiceRollerPanel() {
  return <DiceRoller />;
}

/* ================================================================== */
/*  Variant B — chat dice tray (free, simple, collapsed by default)    */
/* ================================================================== */

export function DiceTray() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[2px]" style={{ background: "linear-gradient(160deg,#0b1322,#080e19)", border: "1px solid #16233a" }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5">
        <Dice width={15} height={15} className="text-cyan" />
        <span className="font-display text-[11px] font-700 uppercase tracking-[0.16em] text-ink">Bandeja de Dados</span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-faint">livre · d4 a d20</span>
        <Chevron width={13} height={13} className="ml-auto text-ink-faint" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          <FreePool size={40} initial={{}} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Variant C — console inspector                                      */
/* ================================================================== */

export function DiceRollerSheet() {
  return <DiceRoller size={42} />;
}

/* ================================================================== */
/*  Physics lab — isolated verification surface                         */
/* ================================================================== */

export function DicePhysicsLab() {
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(3);
  const [rollToken, setRollToken] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState<PhysicsDieResult[] | null>(null);
  const [history, setHistory] = useState<{ sides: number; values: number[] }[]>([]);
  const dice = Array.from({ length: count }, (_, index) => ({ id: `lab-${index}`, sides }));

  const chooseSides = (next: number) => {
    if (rolling) return;
    setSides(next);
    setResults(null);
  };
  const changeCount = (next: number) => {
    if (rolling) return;
    setCount(Math.min(8, Math.max(1, next)));
    setResults(null);
  };
  const roll = () => {
    if (rolling) return;
    setResults(null);
    setRolling(true);
    setRollToken((token) => token + 1);
  };
  const settle = useCallback((next: PhysicsDieResult[]) => {
    setResults(next);
    setRolling(false);
    setHistory((items) => [
      { sides: next[0]?.sides ?? 0, values: next.map(({ value }) => value) },
      ...items,
    ].slice(0, 8));
  }, []);

  return (
    <div className="rup-scroll h-full overflow-y-auto pb-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <div className="font-mono text-[8.5px] uppercase tracking-[0.26em] text-cyan">
            sys.ruptura // laboratório de corpos rígidos
          </div>
          <h1 className="mt-1.5 font-display text-[26px] font-700 uppercase tracking-[0.05em] text-ink">
            Física dos Dados
          </h1>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-dim">
            O valor abaixo não é sorteado antes. Ele é identificado pela normal da face que ficou mais voltada para cima depois que gravidade, impulso, atrito e colisões levaram cada corpo ao repouso.
          </p>
        </div>

        <section className="rounded-[3px] p-4" style={{ background: "#0c1420", border: "1px solid #182338" }}>
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="space-y-5">
              <div>
                <GroupLabel>Tipo do dado</GroupLabel>
                <div className="grid grid-cols-3 gap-2">
                  {LOOSE.map((option) => (
                    <button
                      key={option}
                      onClick={() => chooseSides(option)}
                      disabled={rolling}
                      aria-label={`Selecionar d${option}`}
                      title={`Selecionar d${option}`}
                      className="flex justify-center rounded-[2px] py-1 transition-colors disabled:opacity-40"
                      style={{
                        background: option === sides ? ACCENTS.cyan.soft : "transparent",
                        border: `1px solid ${option === sides ? ACCENTS.cyan.hex : "#1c2b45"}`,
                      }}
                    >
                      <PolyDie sides={option} active={option === sides} size={46} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <GroupLabel>Quantidade</GroupLabel>
                <div className="flex items-center justify-between rounded-[2px] p-1" style={{ border: "1px solid #1c2b45" }}>
                  <button disabled={rolling || count === 1} onClick={() => changeCount(count - 1)} className="px-3 py-2 font-mono text-cyan disabled:text-ink-faint">−</button>
                  <span className="font-mono text-[18px] font-700 text-ink">{count}</span>
                  <button disabled={rolling || count === 8} onClick={() => changeCount(count + 1)} className="px-3 py-2 font-mono text-cyan disabled:text-ink-faint">+</button>
                </div>
              </div>

              <RollButton label={rolling ? "Simulando…" : results ? "Lançar novamente" : `Lançar ${count}d${sides}`} solid disabled={rolling} onClick={roll} />
              <div className="rounded-[2px] px-3 py-2 font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.1em] text-ink-faint" style={{ border: "1px solid #182338" }}>
                motor: cannon-es<br />
                gravidade: 12.5 m/s²<br />
                saída: face superior
              </div>
            </div>

            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-[3px]" style={{ minHeight: 360, background: "#04080e", border: "1px solid #1c2b45" }}>
                {rollToken > 0 && (rolling || results) ? (
                  <PhysicsDiceArena dice={dice} rollToken={rollToken} onSettled={settle} accent={ACCENTS.cyan.hex} height={360} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Dice width={30} height={30} className="text-cyan/40" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">selecione e lance para iniciar</span>
                  </div>
                )}
                <div className="pointer-events-none absolute left-3 top-3 rounded-[2px] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em]" style={{ color: rolling ? ACCENTS.amber.hex : ACCENTS.good.hex, background: "#060a12cc", border: "1px solid #1c2b45" }}>
                  {rolling ? "corpos em movimento" : results ? "repouso detectado" : "aguardando"}
                </div>
              </div>

              <div className="mt-3 min-h-[66px] rounded-[2px] p-3" style={{ background: ACCENTS.cyan.soft, border: `1px solid ${ACCENTS.cyan.hex}44` }}>
                <div className="font-display text-[8px] font-700 uppercase tracking-[0.2em] text-cyan/70">Faces superiores lidas da cena 3D</div>
                {results ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {results.map((result) => (
                      <span key={result.id} className="rup-countpop flex h-9 min-w-9 items-center justify-center rounded-[2px] px-2 font-mono text-[20px] font-700 text-cyan" style={{ border: `1px solid ${ACCENTS.cyan.hex}88`, background: "#07101d" }}>
                        {result.value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 font-mono text-[10px] text-ink-faint">{rolling ? "aguardando os dados pararem…" : "nenhuma leitura"}</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[3px] p-4" style={{ background: "#0c1420", border: "1px solid #182338" }}>
          <GroupLabel>Últimos lançamentos</GroupLabel>
          {history.length ? (
            <div className="space-y-1.5">
              {history.map((item, index) => (
                <div key={`${history.length}-${index}`} className="flex items-center gap-3 rounded-[2px] px-3 py-2" style={{ background: "#08111d", border: "1px solid #16233a" }}>
                  <span className="w-8 font-mono text-[9px] text-ink-faint">#{history.length - index}</span>
                  <span className="w-10 font-mono text-[10px] font-700 text-cyan">d{item.sides}</span>
                  <span className="font-mono text-[11px] text-ink">{item.values.join("  ·  ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">o histórico aparecerá aqui</span>
          )}
        </section>
      </div>
    </div>
  );
}
