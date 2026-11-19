"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number; y: number; vx: number; vy: number;
  size: number; phase: number; color: string;
};
type Pulse = { x: number; y: number; age: number };

/** Poeira e brasas decorativas: física fora do ciclo de render do React. */
export function AuthParticles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    const root = canvas?.closest(".rv-root");
    if (!canvas || !ctx || !root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 1, height = 1, frame = 0, last = 0, elapsed = 0;
    let particles: Particle[] = [];
    const pulses: Pulse[] = [];
    const pointer = { x: 0, y: 0, active: false };

    const makeParticle = (): Particle => {
      const x = Math.random() * width;
      return {
        x, y: Math.random() * height, vx: 0, vy: 0,
        size: 0.7 + Math.random() * 1.3, phase: Math.random() * Math.PI * 2,
        color: x < width * 0.38 ? "255,180,92" : "100,225,255",
      };
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: Math.min(28, Math.max(12, Math.round(width * height / 55000))) }, makeParticle);
      if (reduced.matches) draw(0);
    };
    const position = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const move = (event: Event) => {
      const e = event as PointerEvent;
      if (e.pointerType === "touch") return;
      Object.assign(pointer, position(e), { active: true });
    };
    const leave = () => { pointer.active = false; };
    const click = (event: Event) => {
      const e = event as PointerEvent;
      if (reduced.matches || e.button !== 0 || !e.isPrimary) return;
      const { x, y } = position(e);
      pulses.push({ x, y, age: 0 });
      if (pulses.length > 6) pulses.shift();
      for (const p of particles) {
        const dx = p.x - x, dy = p.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance < 300) {
          const force = (1 - distance / 300) * 7;
          p.vx += dx / Math.max(distance, 1) * force;
          p.vy += dy / Math.max(distance, 1) * force;
        }
      }
    };
    function draw(dt: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      elapsed += dt;
      for (const p of particles) {
        if (dt > 0) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (pointer.active && distance < 170) {
            const force = (1 - distance / 170) ** 2 * 0.65;
            p.vx += dx / Math.max(distance, 1) * force * dt;
            p.vy += dy / Math.max(distance, 1) * force * dt;
          }
          const damping = Math.pow(0.95, dt);
          p.vx *= damping;
          p.vy *= damping;
          p.x += (p.vx + Math.sin(elapsed * 0.006 + p.phase) * 0.14) * dt;
          p.y += (p.vy - 0.22 - p.size * 0.08) * dt;
          if (p.y < -12) p.y = height + 12;
          if (p.y > height + 14) p.y = -10;
          if (p.x < -12) p.x = width + 12;
          if (p.x > width + 14) p.x = -10;
        }
        const alpha = 0.35 + Math.sin(elapsed * 0.018 + p.phase) * 0.15;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        glow.addColorStop(0, `rgba(${p.color},${alpha})`);
        glow.addColorStop(0.25, `rgba(${p.color},${alpha * 0.4})`);
        glow.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - p.size * 5, p.y - p.size * 5, p.size * 10, p.size * 10);
        ctx.fillStyle = `rgba(${p.color},${alpha + 0.2})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.age += dt / 60;
        if (pulse.age >= 0.9) { pulses.splice(i, 1); continue; }
        const progress = pulse.age / 0.9;
        const radius = 8 + (1 - (1 - progress) ** 2) * 230;
        ctx.strokeStyle = `rgba(100,225,255,${0.45 * (1 - progress) ** 2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const tick = (now: number) => {
      draw(last ? Math.min((now - last) / 16.667, 2) : 1);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      last = 0;
      leave();
      if (reduced.matches) { pulses.length = 0; draw(0); }
      else if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", click, { passive: true });
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointercancel", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    resize();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", click);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return <canvas ref={ref} className="rv-particles" aria-hidden="true" />;
}
