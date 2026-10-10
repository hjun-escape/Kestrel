import React, { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

// The hero's background: a field of small monospaced "checkers", each one a source being read in
// parallel (news, court filings, job posts, reviews, profiles). Cells flicker as they are checked,
// and now and then one lights up as something is found. Decorative only (aria-hidden), drawn on a
// canvas so thousands of cells stay smooth. Pauses off screen and in background tabs; a still frame
// for visitors who ask for reduced motion.

const CELL = 15; // px between cells
const GLYPHS = [".", ".", "·", ":", ";", "%", "S", "@", "#"];
const FPS = 24;
const CHURN = 0.035; // share of cells re-checked per frame
const HIT_EVERY_MS = 650; // a found item, on average
const HIT_LIFE_MS = 1400;

function makeGrid(cols, rows) {
  const n = cols * rows;
  const glyph = new Uint8Array(n);
  const level = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    glyph[i] = (Math.random() * GLYPHS.length) | 0;
    level[i] = Math.random();
  }
  return { cols, rows, glyph, level, hits: [] };
}

// Brighter toward the right, where the credit file sits; quiet behind the headline on the left.
function fieldAlpha(x, width) {
  const t = x / width;
  return 0.05 + 0.13 * Math.min(1, Math.max(0, (t - 0.15) / 0.6));
}

export default function CheckSwarm({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduced = prefersReducedMotion();
    let grid = null;
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let lastHit = 0;
    let visible = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `11px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      grid = makeGrid(Math.ceil(width / CELL) + 1, Math.ceil(height / CELL) + 1);
      draw(performance.now());
    }

    function draw(now) {
      ctx.clearRect(0, 0, width, height);
      const { cols, rows, glyph, level, hits } = grid;
      for (let r = 0; r < rows; r++) {
        const y = r * CELL + CELL / 2;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = c * CELL + CELL / 2;
          const a = fieldAlpha(x, width) * (0.35 + 0.65 * level[i]);
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.fillText(GLYPHS[glyph[i]], x, y);
        }
      }
      // Found items: a bright cell with a short-lived ring, fading out.
      for (const h of hits) {
        const age = (now - h.at) / HIT_LIFE_MS;
        if (age >= 1) continue;
        const x = h.c * CELL + CELL / 2;
        const y = h.r * CELL + CELL / 2;
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - age)).toFixed(3)})`;
        ctx.fillText("@", x, y);
        ctx.strokeStyle = `rgba(255,255,255,${(0.35 * (1 - age)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - CELL / 2 - age * 6, y - CELL / 2 - age * 6, CELL + age * 12, CELL + age * 12);
      }
    }

    function step(now) {
      raf = requestAnimationFrame(step);
      if (!visible || now - last < 1000 / FPS) return;
      last = now;
      const { glyph, level, hits, cols, rows } = grid;
      const n = glyph.length;
      const changes = Math.max(1, Math.round(n * CHURN));
      for (let k = 0; k < changes; k++) {
        const i = (Math.random() * n) | 0;
        glyph[i] = (Math.random() * GLYPHS.length) | 0;
        level[i] = Math.random();
      }
      if (now - lastHit > HIT_EVERY_MS * (0.5 + Math.random())) {
        lastHit = now;
        // Hits land in the right two thirds, near the credit file.
        hits.push({ c: Math.floor(cols * (0.35 + Math.random() * 0.65)), r: (Math.random() * rows) | 0, at: now });
        if (hits.length > 12) hits.shift();
      }
      draw(now);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
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
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
