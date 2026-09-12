import { useState, useRef, useEffect, useCallback } from "react";
import { ACCENTS } from "./ui";
import { PolyDie } from "../lib/dice-shapes";
import { Dice } from "../lib/icons";

/* ================================================================== */
/*  Utilities                                                           */
/* ================================================================== */

function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function chargeColor(c: number) {
  if (c < 0.5) return lerpHex(ACCENTS.cyan.hex, ACCENTS.amber.hex, c * 2);
  return lerpHex(ACCENTS.amber.hex, ACCENTS.danger.hex, (c - 0.5) * 2);
}

const SIDES = [8, 6, 10, 4];

/* ---- shared hold hook ---- */
function useHold(duration = 2000) {
  const [pressing, setPressing] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const intRef = useRef(0);

  const onPress = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressing(true);
    startRef.current = Date.now();
    const tick = () => {
      const c = Math.min(1, (Date.now() - startRef.current) / duration);
      intRef.current = c;
      setIntensity(c);
      if (c < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const onRelease = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const c = intRef.current;
    setPressing(false);
    setIntensity(0);
    intRef.current = 0;
    return c;
  }, []);

  return { pressing, intensity, onPress, onRelease };
}

/* ---- label ---- */
function LabLabel({ children }: { children: string }) {
  return (
    <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">{children}</div>
  );
}

/* ---- result flash ---- */
function Released({ c, onDone }: { c: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  const color = chargeColor(c);
  return (
    <div className="rup-reveal rounded-[2px] px-5 py-2.5 text-center font-display text-[11px] font-700 uppercase tracking-[0.2em]"
      style={{ color, border: `1px solid ${color}55`, background: `${color}12` }}>
      {c > 0.9 ? "CARGA MÁXIMA" : c > 0.5 ? "Lançado forte" : c > 0.2 ? "Lançado" : "Sem força"}
      {" · "}<span className="font-mono">{Math.round(c * 100)}%</span>
    </div>
  );
}

/* ================================================================== */
/*  Variant 1 — Shake Livre                                            */
/*  Nenhuma UI de carga. Os dados tremem mais forte quanto mais segura. */
/* ================================================================== */

export function Variant1() {
  const { pressing, intensity, onPress, onRelease } = useHold();
  const [released, setReleased] = useState<number | null>(null);

  function release() {
    const c = onRelease();
    if (c > 0.02) setReleased(c);
  }

  const shakeDur = `${Math.max(0.055, 0.36 - intensity * 0.305)}s`;

  return (
    <div className="flex flex-col items-center gap-8">
      <LabLabel>1 · Shake Livre — sem UI, só movimento</LabLabel>

      {/* dice cluster */}
      <div className="relative flex items-end gap-3">
        {SIDES.map((s, i) => (
          <div
            key={i}
            style={{
              animation: intensity > 0.01 ? `rup-charge-shake ${shakeDur} ${i * 0.013}s linear infinite` : undefined,
              transformOrigin: "bottom center",
            }}
          >
            <PolyDie
              sides={s}
              accent={ACCENTS.arcane.hex}
              soft={ACCENTS.arcane.soft}
              size={52 - i * 4}
            />
          </div>
        ))}
      </div>

      {released !== null
        ? <Released c={released} onDone={() => setReleased(null)} />
        : (
          <button
            onPointerDown={onPress}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            className="flex items-center gap-2 rounded-[2px] px-8 py-3 font-display text-[12px] font-700 uppercase tracking-[0.22em] select-none"
            style={{
              color: ACCENTS.arcane.hex,
              border: `1px solid ${ACCENTS.arcane.hex}66`,
              background: pressing ? ACCENTS.arcane.soft : "transparent",
              transition: "background 0.1s",
            }}
          >
            <Dice width={16} height={16} />
            {pressing ? "Solte para lançar!" : "Segurar para rolar"}
          </button>
        )}
    </div>
  );
}

/* ================================================================== */
/*  Variant 3 — Heartbeat                                              */
/*  O botão pulsa como um coração acelerado. Sem porcentagem.          */
/* ================================================================== */

type Ring = { id: number };

export function Variant3() {
  const { pressing, intensity, onPress, onRelease } = useHold();
  const [released, setReleased] = useState<number | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [beating, setBeating] = useState(false);
  const ringIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intensityRef = useRef(0);
  intensityRef.current = intensity;

  // Schedule beats with shrinking interval
  const scheduleBeats = useCallback(() => {
    const beat = () => {
      const c = intensityRef.current;
      const interval = Math.max(80, 480 - c * 400);

      // flash
      setBeating(true);
      setTimeout(() => setBeating(false), 65);

      // ring
      const id = ringIdRef.current++;
      setRings((r) => [...r, { id }]);
      setTimeout(() => setRings((r) => r.filter((x) => x.id !== id)), 700);

      timerRef.current = setTimeout(beat, interval);
    };
    timerRef.current = setTimeout(beat, 420);
  }, []);

  function press(e: React.PointerEvent) {
    onPress(e);
    scheduleBeats();
  }

  function release() {
    clearTimeout(timerRef.current);
    const c = onRelease();
    if (c > 0.02) setReleased(c);
  }

  const color = intensity > 0 ? chargeColor(intensity) : ACCENTS.amber.hex;

  return (
    <div className="flex flex-col items-center gap-8">
      <LabLabel>3 · Heartbeat — pulso que acelera, sem barra</LabLabel>

      {/* passive die cluster */}
      <div className="flex items-end gap-3">
        {SIDES.map((s, i) => (
          <PolyDie key={i} sides={s} accent={ACCENTS.arcane.hex} soft={ACCENTS.arcane.soft} size={52 - i * 4} />
        ))}
      </div>

      {released !== null
        ? <Released c={released} onDone={() => setReleased(null)} />
        : (
          <div className="relative">
            {/* emanating rings */}
            {rings.map((ring) => (
              <div
                key={ring.id}
                className="pointer-events-none absolute rounded-[2px]"
                style={{
                  inset: -2,
                  border: `1px solid ${color}`,
                  animation: `rup-charge-ring ${Math.max(0.28, 0.6 - intensity * 0.32)}s ease-out forwards`,
                }}
              />
            ))}

            <button
              onPointerDown={press}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              className="relative flex items-center gap-2 rounded-[2px] px-8 py-3 font-display text-[12px] font-700 uppercase tracking-[0.22em] select-none transition-none"
              style={{
                color,
                border: `1px solid ${color}66`,
                background: pressing ? `${color}14` : "transparent",
                transform: beating ? "scale(1.045)" : "scale(1)",
                transition: beating ? "none" : "transform 0.08s ease-out, color 0.15s, border-color 0.15s",
                boxShadow: beating ? `0 0 18px ${color}55` : pressing ? `0 0 ${intensity * 12}px ${color}33` : undefined,
              }}
            >
              <Dice width={16} height={16} />
              {pressing ? "Solte para lançar!" : "Segurar para rolar"}
            </button>
          </div>
        )}
    </div>
  );
}

/* ================================================================== */
/*  Variant 1+3 — Shake + Heartbeat combinados                        */
/* ================================================================== */

export function Variant13() {
  const { pressing, intensity, onPress, onRelease } = useHold();
  const [released, setReleased] = useState<number | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [beating, setBeating] = useState(false);
  const ringIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intensityRef = useRef(0);
  intensityRef.current = intensity;

  const scheduleBeats = useCallback(() => {
    const beat = () => {
      const c = intensityRef.current;
      // slower ramp: 700ms → 140ms over the full charge
      const interval = Math.max(140, 700 - c * 560);
      setBeating(true);
      setTimeout(() => setBeating(false), 80);
      const id = ringIdRef.current++;
      setRings((r) => [...r, { id }]);
      setTimeout(() => setRings((r) => r.filter((x) => x.id !== id)), 900);
      timerRef.current = setTimeout(beat, interval);
    };
    timerRef.current = setTimeout(beat, 650);
  }, []);

  function press(e: React.PointerEvent) {
    onPress(e);
    scheduleBeats();
  }

  function release() {
    clearTimeout(timerRef.current);
    const c = onRelease();
    if (c > 0.02) setReleased(c);
  }

  const color = intensity > 0 ? chargeColor(intensity) : ACCENTS.cyan.hex;
  // slower shake: starts at 0.48s, tightens to 0.10s at max charge
  const shakeDur = `${Math.max(0.10, 0.48 - intensity * 0.38)}s`;

  return (
    <div className="flex flex-col items-center gap-8">
      <LabLabel>1+3 · Shake + Heartbeat combinados</LabLabel>

      <div className="flex items-end gap-3">
        {SIDES.map((s, i) => (
          <div
            key={i}
            style={{
              animation: intensity > 0.01 ? `rup-charge-shake ${shakeDur} ${i * 0.02}s linear infinite` : undefined,
              transformOrigin: "bottom center",
            }}
          >
            <PolyDie sides={s} accent={intensity > 0 ? color : ACCENTS.arcane.hex} soft={intensity > 0 ? `${color}18` : ACCENTS.arcane.soft} size={52 - i * 4} />
          </div>
        ))}
      </div>

      {released !== null
        ? <Released c={released} onDone={() => setReleased(null)} />
        : (
          <div className="relative">
            {rings.map((ring) => (
              <div
                key={ring.id}
                className="pointer-events-none absolute rounded-[2px]"
                style={{
                  inset: -2,
                  border: `1px solid ${color}`,
                  // ring expands more slowly too
                  animation: `rup-charge-ring ${Math.max(0.38, 0.75 - intensity * 0.37)}s ease-out forwards`,
                }}
              />
            ))}
            <button
              onPointerDown={press}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              className="relative flex items-center gap-2 rounded-[2px] px-8 py-3 font-display text-[12px] font-700 uppercase tracking-[0.22em] select-none"
              style={{
                color,
                border: `1px solid ${color}66`,
                background: pressing ? `${color}14` : "transparent",
                transform: beating ? "scale(1.045)" : "scale(1)",
                transition: beating ? "none" : "transform 0.08s ease-out, color 0.12s",
                boxShadow: pressing ? `0 0 ${intensity * 16}px ${color}44` : undefined,
              }}
            >
              <Dice width={16} height={16} />
              {pressing ? "Solte para lançar!" : "Segurar para rolar"}
            </button>
          </div>
        )}
    </div>
  );
}

/* ================================================================== */
/*  Variant 4 — Mesa como indicador                                    */
/*  Botão neutro. Os dados aparecem na mesa e revelam a intensidade.   */
/* ================================================================== */

export function Variant4() {
  const { pressing, intensity, onPress, onRelease } = useHold();
  const [released, setReleased] = useState<number | null>(null);

  function release() {
    const c = onRelease();
    if (c > 0.02) setReleased(c);
  }

  const shakeDur = `${Math.max(0.055, 0.38 - intensity * 0.325)}s`;
  const mesaScale = 1 + intensity * 0.06;
  const color = intensity > 0 ? chargeColor(intensity) : ACCENTS.cyan.hex;
  const gridAlpha = Math.round(0x18 + intensity * 0x48).toString(16).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-6">
      <LabLabel>4 · Mesa como indicador — botão neutro, tudo na mesa</LabLabel>

      {/* mesa */}
      <div
        className="relative overflow-visible rounded-[2px]"
        style={{
          width: 260,
          height: 130,
          background: "#04080e",
          border: `1px solid ${pressing ? color + "77" : "#111d2e"}`,
          transform: `scale(${mesaScale})`,
          transition: pressing ? "none" : "transform 0.3s ease-out, border-color 0.2s",
          boxShadow: pressing ? `0 0 ${intensity * 28}px ${color}44, inset 0 0 ${intensity * 18}px ${color}18` : undefined,
        }}
      >
        {/* dot grid — brightens with charge */}
        <div className="absolute inset-0 rounded-[2px]" style={{ backgroundImage: `radial-gradient(circle, ${color}${gridAlpha} 1.5px, transparent 1.5px)`, backgroundSize: "14px 14px" }} />

        {/* pulsing rings on the mesa */}
        {pressing && [0, 1, 2].map((i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-0 rounded-[2px]"
            style={{
              border: `1px solid ${color}`,
              opacity: intensity * (0.6 - i * 0.15),
              animation: `rup-charge-ring ${Math.max(0.3, 0.9 - intensity * 0.6 + i * 0.15)}s ${i * 0.18}s ease-out infinite`,
            }}
          />
        ))}

        {/* dice in mesa shaking */}
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          {pressing
            ? SIDES.map((s, i) => (
              <div key={i} style={{ animation: `rup-charge-shake ${shakeDur} ${i * 0.013}s linear infinite` }}>
                <PolyDie sides={s} accent={color} soft={`${color}18`} size={44} />
              </div>
            ))
            : (
              <span className="font-mono text-[8px] uppercase tracking-[0.24em]" style={{ color: "#ffffff18" }}>
                MESA
              </span>
            )
          }
        </div>

        {/* corner brackets */}
        {[["top-1 left-1", "border-t border-l"], ["top-1 right-1", "border-t border-r"], ["bottom-1 left-1", "border-b border-l"], ["bottom-1 right-1", "border-b border-r"]].map(([pos, bdr]) => (
          <span key={pos} className={`pointer-events-none absolute ${pos} h-4 w-4 ${bdr}`} style={{ borderColor: pressing ? color + "cc" : "#2a3b5866" }} />
        ))}
      </div>

      {released !== null
        ? <Released c={released} onDone={() => setReleased(null)} />
        : (
          <button
            onPointerDown={onPress}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            className="flex items-center gap-2 rounded-[2px] px-8 py-3 font-display text-[12px] font-700 uppercase tracking-[0.22em] select-none"
            style={{ color: ACCENTS.cyan.hex, border: `1px solid ${ACCENTS.cyan.hex}55`, background: "transparent" }}
          >
            <Dice width={16} height={16} />
            Segurar para rolar
          </button>
        )}
    </div>
  );
}

/* ================================================================== */
/*  Variant 5 — Dados seguem o cursor                                  */
/*  Clicar em "Rolar" ativa o modo. Os dados flutuam e seguem o mouse. */
/*  Segurar = carrega. Quanto mais rápido move o mouse, mais agitados. */
/* ================================================================== */

type DieState = { x: number; y: number; rot: number };

export function VariantCursor() {
  const [mode, setMode] = useState<"idle" | "following" | "throwing">("idle");
  const [positions, setPositions] = useState<DieState[]>([]);
  const [released, setReleased] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);

  const cursorRef = useRef({ x: 0, y: 0 });
  const prevCursorRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const positionsRef = useRef<DieState[]>(SIDES.map(() => ({ x: 0, y: 0, rot: 0 })));
  const rafRef = useRef(0);
  const chargeStartRef = useRef(0);
  const chargeRef = useRef(0);
  const pressingRef = useRef(false);
  const modeRef = useRef<"idle" | "following" | "throwing">("idle");
  modeRef.current = mode;

  // Offsets per die so they don't all overlap
  const OFFSETS = [
    { dx: -54, dy: -8 },
    { dx: -18, dy: -16 },
    { dx:  18, dy: -8 },
    { dx:  52, dy: -14 },
  ];
  const LERPS = [0.22, 0.15, 0.10, 0.07]; // different lag per die

  const startFollowing = useCallback(() => {
    setMode("following");
    modeRef.current = "following";

    const handleMove = (e: MouseEvent) => {
      velRef.current = {
        x: e.clientX - prevCursorRef.current.x,
        y: e.clientY - prevCursorRef.current.y,
      };
      prevCursorRef.current = { x: cursorRef.current.x, y: cursorRef.current.y };
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleDown = (e: MouseEvent) => {
      if (modeRef.current !== "following") return;
      pressingRef.current = true;
      chargeStartRef.current = Date.now();
      chargeRef.current = 0;
      setPressing(true);
    };

    const handleUp = () => {
      if (!pressingRef.current) return;
      pressingRef.current = false;
      const c = chargeRef.current;
      setPressing(false);
      chargeRef.current = 0;
      if (c > 0.02) {
        setMode("throwing");
        modeRef.current = "throwing";
        setReleased(c);
        setTimeout(() => {
          setMode("idle");
          modeRef.current = "idle";
          setReleased(null);
        }, 1800);
      }
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("mouseup", handleUp);
      cancelAnimationFrame(rafRef.current);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("mouseup", handleUp);

    // init positions at cursor center
    const init = positionsRef.current.map((_, i) => ({
      x: cursorRef.current.x + OFFSETS[i].dx,
      y: cursorRef.current.y + OFFSETS[i].dy,
      rot: 0,
    }));
    positionsRef.current = init;

    const tick = () => {
      if (modeRef.current !== "following") return;

      // update charge
      if (pressingRef.current) {
        chargeRef.current = Math.min(1, (Date.now() - chargeStartRef.current) / 2000);
      }
      const c = chargeRef.current;

      // speed from velocity
      const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2);
      const velAngle = Math.atan2(velRef.current.y, velRef.current.x) * (180 / Math.PI);

      positionsRef.current = positionsRef.current.map((p, i) => {
        const tx = cursorRef.current.x + OFFSETS[i].dx;
        const ty = cursorRef.current.y + OFFSETS[i].dy;
        const nx = p.x + (tx - p.x) * LERPS[i];
        const ny = p.y + (ty - p.y) * LERPS[i];

        // rotation: tilt based on velocity + shake if charging
        const velTilt = velAngle * 0.04 * (1 - LERPS[i] / 0.3) * Math.min(speed * 0.4, 1);
        const shakeTilt = c > 0 ? (Math.random() - 0.5) * c * 22 : 0;
        const rot = velTilt + shakeTilt;

        return { x: nx, y: ny, rot };
      });

      setPositions([...positionsRef.current]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // derive visual state
  const c = chargeRef.current;
  const color = c > 0 ? chargeColor(c) : ACCENTS.arcane.hex;

  return (
    <div className="flex flex-col items-center gap-6">
      <LabLabel>5 · Dados seguem o cursor — mova e segure para carregar</LabLabel>

      <div className="flex items-center gap-3 rounded-[2px] px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint" style={{ border: "1px solid #16233a", background: "#0a111e" }}>
        {mode === "idle" && "Clique em «Rolar» para ativar os dados"}
        {mode === "following" && !pressing && "Mova o mouse · Segure para carregar"}
        {mode === "following" && pressing && "Segurando · solte para lançar!"}
        {mode === "throwing" && "Lançado!"}
      </div>

      {released !== null && mode === "throwing" && (
        <Released c={released} onDone={() => {}} />
      )}

      {mode === "idle" && (
        <button
          onClick={startFollowing}
          className="flex items-center gap-2 rounded-[2px] px-8 py-3 font-display text-[12px] font-700 uppercase tracking-[0.22em]"
          style={{ color: ACCENTS.arcane.hex, border: `1px solid ${ACCENTS.arcane.hex}66`, background: ACCENTS.arcane.soft }}
        >
          <Dice width={16} height={16} />
          Rolar Dados
        </button>
      )}

      {mode === "following" && (
        <div className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: pressing ? chargeColor(c) : "#4f6285" }}>
          {pressing ? `${Math.round(c * 100)}% carregado` : "aguardando pressão…"}
        </div>
      )}

      {/* floating dice — rendered in fixed coords */}
      {mode === "following" && positions.length > 0 && positions.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: p.x - 24,
            top: p.y - 24,
            transform: `rotate(${p.rot}deg)`,
            filter: c > 0 ? `drop-shadow(0 0 ${c * 8}px ${color})` : undefined,
            transition: "filter 0.1s",
          }}
        >
          <PolyDie sides={SIDES[i]} accent={c > 0 ? color : ACCENTS.arcane.hex} soft={`${c > 0 ? color : ACCENTS.arcane.hex}18`} size={48} />
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Main export — tabbed lab                                            */
/* ================================================================== */

type LabTab = "v1" | "v3" | "v13" | "v4" | "v5";

const TABS: { key: LabTab; label: string }[] = [
  { key: "v1",  label: "1 · Shake" },
  { key: "v3",  label: "3 · Heartbeat" },
  { key: "v13", label: "1+3 · Juntos" },
  { key: "v4",  label: "4 · Mesa" },
  { key: "v5",  label: "5 · Cursor" },
];

export default function ChargeLab() {
  const [tab, setTab] = useState<LabTab>("v1");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 px-6 py-4" style={{ borderBottom: "1px solid #16233a" }}>
        <div className="font-mono text-[8.5px] uppercase tracking-[0.26em] text-cyan">sys.ruptura // charge lab</div>
        <h1 className="mt-1 font-display text-[22px] font-700 uppercase tracking-[0.06em] text-ink">Mecânica de Rolagem</h1>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">protótipos isolados · sem integração · foco na sensação</p>
      </div>

      {/* tab bar */}
      <div className="flex shrink-0 gap-0.5 px-4 pt-3" style={{ borderBottom: "1px solid #16233a" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-5 pb-3 pt-2 font-display text-[10px] font-600 uppercase tracking-[0.16em] transition-colors"
            style={{
              color: tab === t.key ? ACCENTS.cyan.hex : "#4f6285",
              borderBottom: `2px solid ${tab === t.key ? ACCENTS.cyan.hex : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-8">
        <div className="w-full max-w-md">
          {tab === "v1"  && <Variant1 />}
          {tab === "v3"  && <Variant3 />}
          {tab === "v13" && <Variant13 />}
          {tab === "v4"  && <Variant4 />}
          {tab === "v5"  && <VariantCursor />}
        </div>
      </div>
    </div>
  );
}
