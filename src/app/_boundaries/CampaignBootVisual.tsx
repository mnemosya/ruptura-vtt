"use client";

import { useEffect, useRef } from "react";
import styles from "./CampaignBootVisual.module.css";

const commands = [
  ["probe.firewall(\"mesa\")", "MAPEADO"],
  ["mask.operator_id()", "OCULTO"],
  ["cipher.unlock(\"session\")", "ACEITA"],
  ["access.override(level=3)", "LIBERADO"],
  ["tunnel.inject(\"scene\")", "ABERTO"],
  ["node.attach(operator)", "VINCULADO"],
] as const;

const phi = (1 + Math.sqrt(5)) / 2;
const vertices = [
  [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
  [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
  [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
];
const faces = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
const edges: Array<[number, number]> = [];
vertices.forEach((a, i) => vertices.forEach((b, j) => {
  if (j > i && Math.abs(Math.hypot(...a.map((value, axis) => value - b[axis])) - 2) < 0.01) {
    edges.push([i, j]);
  }
}));

function drawHologram(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.clearRect(0, 0, width, height);
  const color = (alpha: number) => `rgba(0,212,255,${alpha})`;
  const cx = width * .52, cy = height * .51;
  const radius = Math.min(width * .365, height * .39);
  const scale = radius * .49;
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius * 1.25);
  glow.addColorStop(0, color(.055));
  glow.addColorStop(1, color(0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  function line(from: [number, number], to: [number, number], alpha: number, lineWidth = 1) {
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to);
    ctx.strokeStyle = color(alpha); ctx.lineWidth = lineWidth; ctx.stroke();
  }
  function arc(r: number, start: number, end: number, alpha: number, lineWidth = 1) {
    ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = color(alpha); ctx.lineWidth = lineWidth; ctx.stroke();
  }

  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = color(.1 + .1 * Math.sin(i + time));
    ctx.fillRect(((Math.sin(i * 212.34) + 1) / 2) * width, ((Math.cos(i * 87.19) + 1) / 2) * height, i % 9 === 0 ? 2 : 1, 1);
  }
  line([cx - radius * 1.2, cy], [cx + radius * 1.2, cy], .12);
  line([cx, cy - radius * 1.18], [cx, cy + radius * 1.18], .12);
  arc(radius * 1.11, 0, Math.PI * 2, .09);
  for (let i = 0; i < 96; i++) {
    const angle = i * Math.PI / 48;
    const major = i % 8 === 0;
    line(
      [cx + Math.cos(angle) * radius * 1.06, cy + Math.sin(angle) * radius * 1.06],
      [cx + Math.cos(angle) * radius * (major ? 1.105 : 1.08), cy + Math.sin(angle) * radius * (major ? 1.105 : 1.08)],
      major ? .52 : .22, major ? 1.3 : .7,
    );
  }
  arc(radius * .985, -Math.PI * .8, -Math.PI * .8 + Math.PI * 1.58, .58, 2);
  arc(radius * .94, time * .15, time * .15 + 1.2, .8, 1.5);
  arc(radius * .94, time * .15 + Math.PI, time * .15 + Math.PI + .65, .4);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35);
  ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.03, radius * .4, 0, 0, Math.PI * 2);
  ctx.strokeStyle = color(.22); ctx.lineWidth = .7; ctx.stroke(); ctx.restore();

  const ay = time * .28 + .45, ax = .38 + Math.sin(time * .14) * .2;
  const rotated = vertices.map(([x, y, z]) => {
    const rx = x * Math.cos(ay) + z * Math.sin(ay);
    const rz = -x * Math.sin(ay) + z * Math.cos(ay);
    return [rx, y * Math.cos(ax) - rz * Math.sin(ax), y * Math.sin(ax) + rz * Math.cos(ax)];
  });
  const points: Array<[number, number]> = rotated.map(([x, y, z]) => {
    const perspective = 4.7 / (4.7 - z * .35);
    return [cx + x * scale * perspective, cy + y * scale * perspective];
  });
  faces.map(face => ({ face, depth: face.reduce((sum, i) => sum + rotated[i][2], 0) / 3 }))
    .sort((a, b) => a.depth - b.depth)
    .forEach(({ face, depth }) => {
      const triangle = face.map(i => points[i]);
      ctx.beginPath();
      triangle.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = color(Math.max(0, (depth + 1.6) * .015));
      ctx.fill();
      if (depth > 0) {
        for (let i = 1; i < 11; i++) {
          const fraction = i / 11;
          const a: [number, number] = triangle[0].map((n, axis) => n + (triangle[1][axis] - n) * fraction) as [number, number];
          const b: [number, number] = triangle[0].map((n, axis) => n + (triangle[2][axis] - n) * fraction) as [number, number];
          line(a, b, .035 + depth * .012, .7);
        }
      }
    });
  edges.forEach(([i, j]) => {
    const depth = (rotated[i][2] + rotated[j][2]) / 2;
    line(points[i], points[j], .17 + (depth + 1.8) * .16, depth > 0 ? 1.1 : .65);
  });
  points.forEach(([x, y], i) => {
    ctx.fillStyle = color(rotated[i][2] > 0 ? .95 : .35);
    const size = rotated[i][2] > 0 ? 3 : 2;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  });
  const beamY = cy + Math.sin(time * .8) * radius * .79;
  const beam = ctx.createLinearGradient(cx - radius, beamY, cx + radius, beamY);
  beam.addColorStop(0, color(0)); beam.addColorStop(.5, color(.65)); beam.addColorStop(1, color(0));
  ctx.beginPath(); ctx.moveTo(cx - radius, beamY); ctx.lineTo(cx + radius, beamY);
  ctx.strokeStyle = beam; ctx.lineWidth = 1; ctx.stroke();
}

export function CampaignBootVisual({ label }: { label: string }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const commandRef = useRef<HTMLSpanElement>(null);
  const resultRef = useRef<HTMLSpanElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const stepRef = useRef<HTMLSpanElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const screen = screenRef.current, canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!screen || !canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, elapsed = 0, last = 0, frame = 0, currentStage = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width; height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawHologram(context, width, height, elapsed);
    };
    const tick = (now: number) => {
      if (last) elapsed += Math.min((now - last) / 1000, .08);
      last = now;
      if (!reduced.matches && !document.hidden && width > 0) {
        drawHologram(context, width, height, elapsed);
        const index = Math.floor(elapsed / 2.8) % commands.length;
        const phase = elapsed % 2.8;
        const [command, response] = commands[index];
        const finished = phase >= 1.7;
        const value = command.slice(0, Math.floor(phase * 36));
        if (commandRef.current && commandRef.current.textContent !== value) commandRef.current.textContent = value;
        if (resultRef.current) resultRef.current.textContent = finished ? response : phase < .45 ? "" : "...";
        screen.dataset.commandFinished = String(finished);
        // The route boundary has no measurable progress; the visual estimate starts at zero and never reaches 100 before navigation completes.
        const progress = Math.min(99, Math.floor(99 * (1 - Math.exp(-elapsed / 3.2))));
        if (percentRef.current) percentRef.current.textContent = String(progress);
        if (meterRef.current) meterRef.current.style.width = `${progress}%`;
        const stage = Math.min(4, Math.floor(progress / 25) + 1);
        if (stage !== currentStage) {
          currentStage = stage;
          if (stepRef.current) stepRef.current.textContent = `0${stage} / 04`;
          if (detailRef.current) detailRef.current.textContent = [
            "Verificando identidade...",
            "Estabelecendo conexão...",
            "Sincronizando cenário...",
            "Vinculando jogadores...",
          ][stage - 1];
          Array.from(stepsRef.current?.children ?? []).forEach((step, index) => {
            (step as HTMLElement).dataset.state = index < stage - 1 ? "done" : index === stage - 1 ? "active" : "pending";
          });
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduced.matches) frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  return (
    <div ref={screenRef} className={styles.screen} role="status" aria-label={label}>
      <span className={styles.srOnly}>{label}</span>
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.glass} aria-hidden="true" />
      <header className={styles.header} aria-hidden="true">
        <span className={styles.brand}>RUPTURA<span>_</span></span>
        <span className={styles.connected}><i />CONECTADO</span>
      </header>
      <div className={styles.headerLine} aria-hidden="true" />
      <div className={styles.rail} aria-hidden="true" />
      <canvas ref={canvasRef} className={styles.hologram} aria-hidden="true" />
      <div className={styles.command} aria-hidden="true">
        <span className={styles.prompt}>›</span>
        <span className={styles.commandText}><span ref={commandRef}>probe.firewall(&quot;mesa&quot;)</span><i /></span>
        <span ref={resultRef} className={styles.commandResult}>...</span>
      </div>
      <div className={styles.loading} aria-hidden="true">
        <div className={styles.percent}><span ref={percentRef}>0</span>%</div>
        <div className={styles.meter}><span ref={meterRef} /></div>
        <div className={styles.detail}><span ref={detailRef}>Verificando identidade...</span><span ref={stepRef}>01 / 04</span></div>
        <div ref={stepsRef} className={styles.steps}><span data-state="active">IDENTIDADE</span><span data-state="pending">CONEXÃO</span><span data-state="pending">CENÁRIO</span><span data-state="pending">JOGADORES</span></div>
      </div>
      <footer className={styles.footer} aria-hidden="true"><span>SESSION_INIT</span><span>CANAL SEGURO</span></footer>
    </div>
  );
}
