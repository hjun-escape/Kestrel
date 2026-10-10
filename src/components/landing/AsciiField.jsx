import React, { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

// Soft field of tiny monospaced characters across the whole landing page: sources being checked in parallel.
// One fixed canvas behind the viewport. As the page scrolls it checks what is underneath each row: white
// characters over dark sections (hero, footer), faint ink over light ones. It keeps clear of content: anything
// marked [data-ascii-clear], and each landing section's own content block, so characters only show in margins,
// gaps and padding. Decorative (aria-hidden); pauses in background tabs; a still frame for reduced motion.

const CELL = 13;
const GLYPHS = [".", ".", ".", ".", "·", "·", ":", ":", ";", "%", "+"];
const FPS = 20;
const CLEAR_PAD = 18;
const CLEAR_FADE = 60;
// Content to keep clear of: explicit markers, plus each section's direct content block.
const CLEAR_SELECTOR = "[data-ascii-clear], #main > section > *, footer > *";
// Sections whose background decides the ink colour.
const SURFACE_SELECTOR = "#main > *, footer";

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function isDark(el) {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null; // transparent: no opinion
  const lum = 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
  return lum < 110;
}

export default function AsciiField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let glyph = new Uint8Array(0);
    let level = new Float32Array(0);
    let open = new Float32Array(0);
    let rowDark = new Uint8Array(0); // 1 = dark surface under this row
    let hits = [];
    let lastHit = 0;
    let raf = 0;
    let last = 0;
    let visible = document.visibilityState === "visible";
    let dirty = true;

    // Where content is and which rows sit on a dark surface, for the current scroll position.
    function measure() {
      dirty = false;
      const zones = [...document.querySelectorAll(CLEAR_SELECTOR)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 2 && r.height > 2 && r.bottom > -CLEAR_FADE && r.top < h + CLEAR_FADE);
      const surfaces = [...document.querySelectorAll(SURFACE_SELECTOR)]
        .map((el) => ({ r: el.getBoundingClientRect(), dark: isDark(el) }))
        .filter((s) => s.dark !== null);
      for (let r = 0; r < rows; r++) {
        const y = r * CELL + CELL / 2;
        const s = surfaces.find((x) => y >= x.r.top && y < x.r.bottom);
        rowDark[r] = s ? (s.dark ? 1 : 0) : 1;
        for (let c = 0; c < cols; c++) {
          const x = c * CELL + CELL / 2;
          let d = Infinity;
          for (const z of zones) {
            const dx = Math.max(z.left - CLEAR_PAD - x, 0, x - z.right - CLEAR_PAD);
            const dy = Math.max(z.top - CLEAR_PAD - y, 0, y - z.bottom - CLEAR_PAD);
            d = Math.min(d, Math.hypot(dx, dy));
          }
          open[r * cols + c] = zones.length ? smooth(d / CLEAR_FADE) : 1;
        }
      }
    }

    function draw(now) {
      if (dirty) measure();
      ctx.clearRect(0, 0, w, h);
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let r = 0; r < rows; r++) {
        const dark = rowDark[r];
        // White on dark surfaces; faint ink on light ones.
        const base = dark ? "255,255,255" : "20,32,46";
        const k = dark ? 1 : 0.7;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (open[i] < 0.02) continue;
          ctx.fillStyle = `rgba(${base},${(k * open[i] * (0.04 + 0.08 * level[i])).toFixed(3)})`;
          ctx.fillText(GLYPHS[glyph[i]], c * CELL + CELL / 2, r * CELL + CELL / 2);
        }
      }
      for (const hit of hits) {
        const age = (now - hit.at) / 1600;
        if (age >= 1 || age < 0) continue;
        const c = hit.i % cols;
        const r = (hit.i / cols) | 0;
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        const base = rowDark[r] ? "255,255,255" : "20,32,46";
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
        g.addColorStop(0, `rgba(${base},${(0.18 * Math.sin(Math.PI * age) * open[hit.i]).toFixed(3)})`);
        g.addColorStop(1, `rgba(${base},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 26, y - 26, 52, 52);
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      const n = cols * rows;
      glyph = new Uint8Array(n);
      level = new Float32Array(n);
      open = new Float32Array(n);
      rowDark = new Uint8Array(rows);
      for (let i = 0; i < n; i++) {
        glyph[i] = (Math.random() * GLYPHS.length) | 0;
        level[i] = Math.random();
      }
      hits = [];
      dirty = true;
      draw(performance.now());
    }

    function step(now) {
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
    }

    const onScroll = () => {
      dirty = true;
      if (reduced) draw(performance.now());
    };
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    // Layout settles after fonts load and lazy sections mount; re-measure now and then.
    const remeasure = setInterval(() => {
      dirty = true;
      if (reduced) draw(performance.now());
    }, 1500);
    if (!reduced) raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(remeasure);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Fixed behind the viewport. z-0 with no positioned ancestors in the way: section backgrounds paint below it,
  // positioned content (the hero's panels) paints above it.
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-screen w-screen" />;
}
