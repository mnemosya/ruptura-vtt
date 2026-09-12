import { useState, useRef, useCallback } from "react";
import { ACCENTS, RESULTS, type ResultKey } from "./ui";
import { Dice, Chevron } from "../lib/icons";
import { PolyDie, Die3D } from "../lib/dice-shapes";

/* ================================================================== */
/*  Ruptura roll (teste): pool = Atributo (nº d8), pega o MAIOR,       */
/*  soma bônus da Perícia + modificadores, compara com a Dificuldade.  */
/*  Bandeja livre: monta um conjunto qualquer de dados (d4…d20, vários */
/*  do mesmo tipo) e rola somando os resultados.                       */
/* ================================================================== */

const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

/* ---- charge helpers ------------------------------------------------ */

function lerpHex(a: string, b: string, t: number): string {
  const p = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function chargeColor(c: number): string {
  if (c < 0.5) return lerpHex(ACCENTS.cyan.hex, ACCENTS.amber.hex, c * 2);
  return lerpHex(ACCENTS.amber.hex, ACCENTS.danger.hex, (c - 0.5) * 2);
}

const CHARGE_DURATION = 2000; // ms to reach 100%
const rollDuration = (charge: number) => Math.round(700 + charge * 2100); // 700 → 2800 ms
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

type ChargeRing = { id: number };

function ChargeRollButton({
  label,
  disabled = false,
  solid = false,
  onRoll,
  onChargeChange,
}: {
  label: string;
  disabled?: boolean;
  solid?: boolean;
  onRoll: (charge: number) => void;
  onChargeChange?: (c: number) => void;
}) {
  const [charge, setCharge] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [burst, setBurst] = useState(false);
  const [rings, setRings] = useState<ChargeRing[]>([]);
  const [beating, setBeating] = useState(false);

  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const chargeRef = useRef(0);
  const ringIdRef = useRef(0);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intensityRef = useRef(0);
  intensityRef.current = charge;

  const scheduleBeats = () => {
    const beat = () => {
      const c = intensityRef.current;
      // 700ms → 140ms ramp, same as charge lab v1+3
      const interval = Math.max(140, 700 - c * 560);
      setBeating(true);
      setTimeout(() => setBeating(false), 80);
      const id = ringIdRef.current++;
      setRings((r) => [...r, { id }]);
      setTimeout(() => setRings((r) => r.filter((x) => x.id !== id)), 900);
      beatTimerRef.current = setTimeout(beat, interval);
    };
    beatTimerRef.current = setTimeout(beat, 650);
  };

  const color = chargeColor(charge);
  const isMax = charge >= 0.995;
  const glow = charge * 22;

  const startCharge = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressing(true);
    startRef.current = Date.now();
    chargeRef.current = 0;
    const tick = () => {
      const c = Math.min(1, (Date.now() - startRef.current) / CHARGE_DURATION);
      chargeRef.current = c;
      setCharge(c);
      onChargeChange?.(c);
      if (c < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    scheduleBeats();
  }, [disabled]);

  const release = useCallback(() => {
    if (!pressing) return;
    cancelAnimationFrame(rafRef.current);
    clearTimeout(beatTimerRef.current);
    const c = chargeRef.current;
    setPressing(false);
    setCharge(0);
    onChargeChange?.(0);
    setRings([]);
    if (c > 0.02) {
      setBurst(true);
      setTimeout(() => setBurst(false), 400);
      onRoll(c);
    }
  }, [pressing, onRoll]);

  if (disabled) {
    return (
      <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[2px] py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.22em]" style={{ color: "#4a5a78", background: "transparent", border: "1px solid #1c2b45" }}>
        <Dice width={16} height={16} />{label}
      </button>
    );
  }

  return (
    <div className="relative select-none">
      {/* burst flash on release */}
      {burst && (
        <div
          className="rup-burst-flash pointer-events-none absolute inset-0 rounded-[2px]"
          style={{ background: chargeColor(chargeRef.current), zIndex: 20 }}
        />
      )}

      {/* heartbeat rings emanating outward */}
      {rings.map((ring) => (
        <div
          key={ring.id}
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            inset: -2,
            border: `1px solid ${color}`,
            animation: `rup-charge-ring ${Math.max(0.38, 0.75 - charge * 0.37)}s ease-out forwards`,
          }}
        />
      ))}

      <button
        onPointerDown={startCharge}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        className={`relative w-full rounded-[2px] py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.22em] ${isMax ? "rup-charge-shake" : ""}`}
        style={{
          color: pressing ? color : ACCENTS.cyan.hex,
          background: pressing ? `${color}10` : ACCENTS.cyan.soft,
          border: `1px solid ${pressing ? color : ACCENTS.cyan.hex}${pressing ? "" : "88"}`,
          transform: beating && !isMax ? "scale(1.032)" : "scale(1)",
          transition: beating ? "none" : "transform 0.09s ease-out, color 0.12s, border-color 0.12s",
          boxShadow: glow > 0
            ? `0 0 ${glow}px ${color}55, 0 0 ${glow * 2}px ${color}18`
            : undefined,
        }}
      >
        <span className={`relative z-10 flex items-center justify-center gap-2 ${isMax ? "rup-max-pulse" : ""}`}>
          <Dice width={16} height={16} />
          {pressing
            ? isMax ? "CARGA MÁXIMA — SOLTE!" : "Solte para lançar!"
            : label}
        </span>
      </button>
    </div>
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

function DiceMesa({ rolling, pool, accent, charge = 0 }: { rolling: boolean; pool: number[]; accent: string; charge?: number }) {
  const cColor = charge > 0 ? chargeColor(charge) : accent;
  const gridOpacity = 0x28 + Math.round(charge * 0x50); // hex 28 → 78
  const gridAlpha = gridOpacity.toString(16).padStart(2, "0");
  const ringSpeed = 1.2 - charge * 0.75; // 1.2s → 0.45s at full charge
  const borderGlow = charge > 0 ? `0 0 ${charge * 18}px ${cColor}66` : undefined;

  return (
    <div
      className="relative flex-shrink-0 overflow-visible rounded-[2px]"
      style={{ width: 148, background: "#04080e", border: `1px solid ${charge > 0 ? cColor + "66" : "#111d2e"}`, minHeight: 0, boxShadow: borderGlow, transition: "border-color 0.1s, box-shadow 0.1s" }}
    >
      {/* dot-grid — brighter with charge */}
      <div
        className="absolute inset-0 rounded-[2px]"
        style={{
          backgroundImage: `radial-gradient(circle, ${cColor}${gridAlpha} 1px, transparent 1px)`,
          backgroundSize: "10px 10px",
          transition: "none",
        }}
      />

      {/* pulsing rings when charging */}
      {charge > 0 && [0, 1, 2].map((i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-[2px]"
          style={{
            inset: -(4 + i * 5),
            border: `1px solid ${cColor}`,
            opacity: charge * (0.7 - i * 0.2),
            animation: `rup-charge-ring ${ringSpeed + i * 0.18}s ${i * (ringSpeed / 3)}s ease-out infinite`,
          }}
        />
      ))}

      {/* corner brackets — brighter with charge */}
      {[["top-1 left-1", "border-t border-l"], ["top-1 right-1", "border-t border-r"], ["bottom-1 left-1", "border-b border-l"], ["bottom-1 right-1", "border-b border-r"]].map(([pos, bdr]) => (
        <span key={pos} className={`absolute ${pos} h-3 w-3 ${bdr}`} style={{ borderColor: cColor + (charge > 0 ? "aa" : "55"), transition: "border-color 0.1s" }} />
      ))}

      {rolling && pool.length > 0 ? (
        <div className="absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-3 p-3">
          {pool.map((sides, i) => (
            <Die3D key={i} sides={sides} accent={cColor} size={52} scale={2} rollIndex={i} />
          ))}
        </div>
      ) : charge > 0 && pool.length > 0 ? (
        /* dice shaking in place while charging */
        <div className="absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-2 p-3">
          {pool.slice(0, 4).map((sides, i) => (
            <div
              key={i}
              style={{
                animation: `rup-charge-shake ${(0.15 - charge * 0.08).toFixed(3)}s ${i * 0.018}s linear infinite`,
                opacity: 0.55 + charge * 0.45,
                ["--shake-x" as string]: `${(0.5 + charge * 3.5).toFixed(1)}px`,
                ["--shake-r" as string]: `${(0.2 + charge * 1.4).toFixed(2)}deg`,
              }}
            >
              <PolyDie sides={sides} accent={cColor} soft={`${cColor}18`} size={38} />
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="font-mono text-[7px] uppercase tracking-[0.24em]" style={{ color: accent + "33" }}>MESA</span>
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
  const [charge, setCharge] = useState(0);
  const [liveCharge, setLiveCharge] = useState(0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const add = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => ({ ...c, [s]: (c[s] || 0) + 1 })); };
  const dec = (s: number) => { if (rolling) return; setResults(null); setCounts((c) => { const n = { ...c }; if ((n[s] || 0) > 1) n[s]--; else delete n[s]; return n; }); };
  const clear = () => { if (rolling) return; setResults(null); setCounts({}); setMods(0); };

  /* flat pool array derived from counts */
  const pool = LOOSE.flatMap((s) => Array.from({ length: counts[s] || 0 }, () => s));

  const roll = (c: number) => {
    if (rolling || pool.length === 0) return;
    setCharge(0);
    const final = pool.map((s) => ({ sides: s, value: rollDie(s) }));
    const dur = rollDuration(c);
    setRolling(true);
    setLanded(false);
    setResults(null);
    setTimeout(() => {
      setResults(final);
      setRolling(false);
      setLanded(true);
      setTimeout(() => setLanded(false), 500);
    }, dur);
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
                {pool.map((s, i) => {
                  const shaking = liveCharge > 0 && !rolling;
                  const shakeX = `${(0.5 + liveCharge * 3.5).toFixed(1)}px`;
                  const shakeR = `${(0.2 + liveCharge * 1.4).toFixed(2)}deg`;
                  return (
                    <button key={i} onClick={() => dec(s)} title="clique para remover" className="transition-transform hover:-translate-y-0.5 active:scale-95"
                      style={shaking ? {
                        animation: `rup-charge-shake ${(0.15 - liveCharge * 0.08).toFixed(3)}s ${i * 0.022}s linear infinite`,
                        opacity: 0.55 + liveCharge * 0.45,
                        ["--shake-x" as string]: shakeX,
                        ["--shake-r" as string]: shakeR,
                      } : undefined}
                    >
                      {results ? (
                        <PolyDie sides={s} value={results[i]?.value} active={!rolling && i === bestIdx} landed={landed} rollIndex={i} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                      ) : (
                        <PolyDie sides={s} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={dieSize} />
                      )}
                    </button>
                  );
                })}
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
        <DiceMesa rolling={rolling} pool={pool} accent={ACCENTS.arcane.hex} charge={charge} />
      </div>

      <ChargeRollButton
        label={total === 0 ? "Escolha dados" : rolling ? "Rolando…" : `Rolar ${total} dado${total !== 1 ? "s" : ""}`}
        disabled={total === 0 || rolling}
        solid={solidRoll}
        onRoll={(c) => { setCharge(c); roll(c); }}
        onChargeChange={setLiveCharge}
      />
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
  const [preview, setPreview] = useState<number[] | null>(null);
  const [charge, setCharge] = useState(0);
  const attr = ATTRS[attrIdx];
  const skill = SKILLS[skillIdx];
  const doRoll = (charge = 0) => {
    if (rolling) return;
    const dice = Array.from({ length: attr.v }, () => rollDie(8));
    let maxIdx = 0;
    dice.forEach((d, i) => { if (d > dice[maxIdx]) maxIdx = i; });
    const maxDie = dice[maxIdx];
    const t = maxDie + skill.v + mods;
    const dur = rollDuration(charge);
    setRolling(true);
    setLanded(false);
    setRoll(null);
    const iv = setInterval(() => setPreview(Array.from({ length: attr.v }, () => rollDie(8))), 65);
    setTimeout(() => {
      clearInterval(iv);
      setPreview(null);
      setRolling(false);
      setRoll({ dice, maxIdx, maxDie, total: t, key: tierOf(maxDie, t, diff) });
      setLanded(true);
      setTimeout(() => setLanded(false), 500);
    }, dur);
  };
  return { attrIdx, setAttrIdx, skillIdx, setSkillIdx, attr, skill, mods, setMods, diff, setDiff, roll, doRoll, rolling, landed, preview, charge, setCharge };
}

function TestPool({ r, count, size = 46, rolling = false, landed = false, charge = 0 }: { r: Roll | null; count: number; size?: number; rolling?: boolean; landed?: boolean; preview?: number[] | null; charge?: number }) {
  if (rolling) {
    /* 3D dice in a mini mesa during roll */
    return (
      <div className="relative rounded-[2px] overflow-visible" style={{ minHeight: 80, background: "#04080e", border: "1px solid #111d2e" }}>
        <div className="absolute inset-0 rounded-[2px]" style={{ backgroundImage: `radial-gradient(circle, #35c7d828 1px, transparent 1px)`, backgroundSize: "10px 10px" }} />
        <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-3 p-3" style={{ zIndex: 2 }}>
          {Array.from({ length: count }, (_, i) => (
            <Die3D key={i} sides={8} accent="#35c7d8" size={48} scale={2} rollIndex={i} />
          ))}
        </div>
      </div>
    );
  }
  const dice = r ? r.dice : Array.from({ length: count }, () => null);
  return (
    <div className="flex flex-wrap gap-2">
      {dice.map((d, i) => {
        const shaking = charge > 0;
        const shakeX = `${(0.5 + charge * 3.5).toFixed(1)}px`;
        const shakeR = `${(0.2 + charge * 1.4).toFixed(2)}deg`;
        return (
          <div
            key={i}
            style={shaking ? {
              animation: `rup-charge-shake ${(0.15 - charge * 0.08).toFixed(3)}s ${i * 0.018}s linear infinite`,
              opacity: 0.55 + charge * 0.45,
              ["--shake-x" as string]: shakeX,
              ["--shake-r" as string]: shakeR,
            } : undefined}
          >
            <PolyDie sides={8} value={r ? (d as number) : undefined} active={!!r && i === r.maxIdx} landed={landed} rollIndex={i} dim={!r && !shaking} size={size} />
          </div>
        );
      })}
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
        <TestPool r={s.roll} count={s.attr.v} rolling={s.rolling} landed={s.landed} preview={s.preview} charge={s.charge} />
        {s.roll && !s.rolling && <div className="mt-3.5 rup-reveal"><ResultBanner r={s.roll} skillV={s.skill.v} mods={s.mods} /></div>}
      </div>

      <ChargeRollButton label={s.rolling ? "Rolando…" : s.roll ? "Rolar de novo" : `Rolar ${s.attr.v}d8`} disabled={s.rolling} onRoll={s.doRoll} onChargeChange={s.setCharge} />

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
