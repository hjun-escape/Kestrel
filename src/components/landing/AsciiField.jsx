import React, { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

// Soft field of tiny monospaced characters behind the nav and hero: sources being checked in parallel.
// Decorative (aria-hidden). It fades out around anything marked [data-ascii-clear] in the same parent, so it
// never sits behind content. Pauses off screen and in background tabs; a still frame for reduced motion.

const CELL = 13;
const GLYPHS = [".", ".", ".", ".", "·", "·", ":", ":", ";", "%", "+"];
const FPS = 20;
const CLEAR_PAD = 18;
const CLEAR_FADE = 60;

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const white = (a) => `rgba(255,255,255,${Math.max(0, a).toFixed(3)})`;

export default function AsciiField({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let cols = 0;
    let glyph = new Uint8Array(0);
    let level = new Float32Array(0);
    let open = new Float32Array(0);
    let hits = [];
    let lastHit = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const zones = () => {
      const box = canvas.getBoundingClientRect();
      return [...(canvas.parentElement?.querySelectorAll("[data-ascii-clear]") ?? [])].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top };
      });
    };
    const openness = (zs, x, y) => {
      let d = Infinity;
      for (const z of zs) {
        const dx = Math.max(z.l - CLEAR_PAD - x, 0, x - z.r - CLEAR_PAD);
        const dy = Math.max(z.t - CLEAR_PAD - y, 0, y - z.b - CLEAR_PAD);
        d = Math.min(d, Math.hypot(dx, dy));
      }
      return zs.length ? smooth(d / CLEAR_FADE) : 1;
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < glyph.length; i++) {
        if (open[i] < 0.02) continue;
        ctx.fillStyle = white(open[i] * (0.04 + 0.08 * level[i]));
        ctx.fillText(GLYPHS[glyph[i]], (i % cols) * CELL + CELL / 2, ((i / cols) | 0) * CELL + CELL / 2);
      }
      for (const hit of hits) {
        const age = (now - hit.at) / 1600;
        if (age >= 1 || age < 0) continue;
        const x = (hit.i % cols) * CELL + CELL / 2;
        const y = ((hit.i / cols) | 0) * CELL + CELL / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
        g.addColorStop(0, white(0.2 * Math.sin(Math.PI * age)));
        g.addColorStop(1, white(0));
        ctx.fillStyle = g;
        ctx.fillRect(x - 26, y - 26, 52, 52);
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      const rows = Math.ceil(h / CELL) + 1;
      const n = cols * rows;
      glyph = new Uint8Array(n);
      level = new Float32Array(n);
      open = new Float32Array(n);
      const zs = zones();
      for (let i = 0; i < n; i++) {
        glyph[i] = (Math.random() * GLYPHS.length) | 0;
        level[i] = Math.random();
        open[i] = openness(zs, (i % cols) * CELL + CELL / 2, ((i / cols) | 0) * CELL + CELL / 2);
      }
      hits = [];
      draw(performance.now());
    };

    const step = (now) => {
      raf = requestAnimationFrame(step);
      if (!visible || now - last < 1000 / FPS) return;
      last = now;
      for (let k = 0; k < glyph.length * 0.03; k++) {
        const i = (Math.random() * glyph.length) | 0;
        glyph[i] = (Math.random() * GLYPHS.length) | 0;
        level[i] = Math.random();
      }
      if (now - lastHit > 450 + Math.random() * 900) {
        const i = (Math.random() * glyph.length) | 0;
        if (open[i] > 0.9) {
          hits.push({ i, at: now });
          lastHit = now;
          if (hits.length > 10) hits.shift();
        }
      }
      draw(now);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const settle = setTimeout(resize, 800); // fonts and layout settle after first paint
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === "visible";
    });
    io.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    if (!reduced) raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
