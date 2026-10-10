import React, { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

// Decorative hero backgrounds (aria-hidden canvas). Four directions, one plumbing:
//   swarm         a soft field of tiny checkers flickering as sources are read in parallel
//   radar         rings and a sweeping beam centred on the credit file; sources brighten as it passes
//   streams       document stubs flowing in from the page edge toward the credit file; a few are pulled in
//   constellation source nodes linked to the credit file by hairlines, pulses travelling into the file
// Content stays readable: elements marked [data-swarm-clear] in the same parent are clear zones the
// backdrop fades out around. Pauses off screen and in background tabs; still frame for reduced motion.
// White only: red/amber/green stay reserved for status.

const CLEAR_PAD = 28;
const CLEAR_FADE = 70;
const FPS = 30;

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const white = (a) => `rgba(255,255,255,${Math.max(0, a).toFixed(3)})`;
const rand = (a, b) => a + Math.random() * (b - a);

function readZones(canvas) {
  const box = canvas.getBoundingClientRect();
  return [...(canvas.parentElement?.querySelectorAll("[data-swarm-clear]") ?? [])].map((el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top };
  });
}

/** 0 inside or near a clear zone, rising to 1 in open space. */
function openness(zones, x, y) {
  let d = Infinity;
  for (const z of zones) {
    const dx = Math.max(z.l - CLEAR_PAD - x, 0, x - z.r - CLEAR_PAD);
    const dy = Math.max(z.t - CLEAR_PAD - y, 0, y - z.b - CLEAR_PAD);
    d = Math.min(d, Math.hypot(dx, dy));
  }
  return zones.length ? smooth(d / CLEAR_FADE) : 1;
}

/** The credit file is the last clear zone (right column); fall back to the right third. */
function target(zones, w, h) {
  const z = zones[zones.length - 1];
  return z ? { x: (z.l + z.r) / 2, y: (z.t + z.b) / 2, z } : { x: w * 0.7, y: h * 0.5, z: null };
}

// ---------- 1. swarm ----------
function swarm() {
  const CELL = 13;
  const GLYPHS = [".", ".", ".", ".", "·", "·", ":", ":", ";", "%", "+"];
  let s = null;
  return {
    resize(w, h, zones) {
      const cols = Math.ceil(w / CELL) + 1;
      const rows = Math.ceil(h / CELL) + 1;
      const n = cols * rows;
      s = { cols, rows, glyph: new Uint8Array(n), level: new Float32Array(n), open: new Float32Array(n), hits: [], lastHit: 0 };
      for (let i = 0; i < n; i++) {
        s.glyph[i] = (Math.random() * GLYPHS.length) | 0;
        s.level[i] = Math.random();
        s.open[i] = openness(zones, (i % cols) * CELL + CELL / 2, ((i / cols) | 0) * CELL + CELL / 2);
      }
    },
    frame(ctx, now, w, h, animate) {
      const { cols, rows, glyph, level, open, hits } = s;
      if (animate) {
        for (let k = 0; k < glyph.length * 0.03; k++) {
          const i = (Math.random() * glyph.length) | 0;
          glyph[i] = (Math.random() * GLYPHS.length) | 0;
          level[i] = Math.random();
        }
        if (now - s.lastHit > rand(450, 1350)) {
          const i = (Math.random() * glyph.length) | 0;
          if (open[i] > 0.9) {
            hits.push({ i, at: now });
            s.lastHit = now;
          }
          if (hits.length > 10) hits.shift();
        }
      }
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < glyph.length; i++) {
        if (open[i] < 0.02) continue;
        ctx.fillStyle = white(open[i] * (0.035 + 0.075 * level[i]));
        ctx.fillText(GLYPHS[glyph[i]], (i % cols) * CELL + CELL / 2, ((i / cols) | 0) * CELL + CELL / 2);
      }
      for (const hit of hits) {
        const age = (now - hit.at) / 1600;
        if (age >= 1) continue;
        const x = (hit.i % cols) * CELL + CELL / 2;
        const y = ((hit.i / cols) | 0) * CELL + CELL / 2;
        const f = Math.sin(Math.PI * age);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 28);
        g.addColorStop(0, white(0.22 * f));
        g.addColorStop(1, white(0));
        ctx.fillStyle = g;
        ctx.fillRect(x - 28, y - 28, 56, 56);
      }
      void rows;
    },
  };
}

// ---------- 2. radar ----------
function radar() {
  let s = null;
  const PERIOD = 6000; // ms per sweep
  return {
    resize(w, h, zones) {
      const c = target(zones, w, h);
      const maxR = Math.hypot(Math.max(c.x, w - c.x), Math.max(c.y, h - c.y));
      const blips = [];
      for (let k = 0; k < 160; k++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(maxR * 0.25, maxR);
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r;
        const open = openness(zones, x, y);
        if (open > 0.3 && x > 0 && x < w && y > 0 && y < h) blips.push({ a, x, y, open, found: Math.random() < 0.06 });
      }
      s = { c, maxR, blips, zones };
    },
    frame(ctx, now, w, h, animate) {
      const { c, maxR, blips, zones } = s;
      const sweep = animate ? ((now % PERIOD) / PERIOD) * Math.PI * 2 : Math.PI * 1.2;
      // Rings, faded where they would cross content.
      for (let r = 80; r < maxR; r += 70) {
        for (let k = 0; k < 180; k++) {
          const a0 = (k / 180) * Math.PI * 2;
          const x = c.x + Math.cos(a0) * r;
          const y = c.y + Math.sin(a0) * r;
          const o = openness(zones, x, y);
          if (o < 0.05) continue;
          ctx.fillStyle = white(0.07 * o);
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }
      // Beam: a soft wedge trailing the sweep line.
      for (let k = 0; k < 28; k++) {
        const a = sweep - k * 0.018;
        const alpha = 0.05 * (1 - k / 28);
        ctx.strokeStyle = white(alpha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a) * maxR, c.y + Math.sin(a) * maxR);
        ctx.stroke();
      }
      // Sources brighten as the beam passes; "found" ones keep a glow.
      for (const b of blips) {
        let since = sweep - ((b.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (since < 0) since += Math.PI * 2;
        const lit = Math.max(0, 1 - since / 1.6);
        const base = b.found ? 0.35 : 0.08;
        ctx.fillStyle = white(b.open * (base + 0.55 * lit));
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.found ? 2 : 1.3, 0, Math.PI * 2);
        ctx.fill();
        if (b.found && lit > 0) {
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 22);
          g.addColorStop(0, white(0.25 * lit * b.open));
          g.addColorStop(1, white(0));
          ctx.fillStyle = g;
          ctx.fillRect(b.x - 22, b.y - 22, 44, 44);
        }
      }
    },
  };
}

// ---------- 3. streams ----------
function streams() {
  let s = null;
  return {
    resize(w, h, zones) {
      const t = target(zones, w, h);
      const lanes = [];
      for (let y = 22; y < h; y += 26) lanes.push({ y, speed: rand(30, 70) });
      const stubs = [];
      for (let k = 0; k < 90; k++) stubs.push(newStub(lanes, w, true));
      s = { t, lanes, stubs, zones };
    },
    frame(ctx, now, w, h, animate) {
      const { t, lanes, stubs, zones } = s;
      const dt = animate ? 1 / FPS : 0;
      for (const st of stubs) {
        st.x += st.speed * dt;
        // Flags curve toward the credit file as they near it.
        if (st.flag && t.z && st.x > t.z.l - 260) st.y += (t.y - st.y) * 0.02;
        const into = t.z && st.x + st.len > t.z.l - 10 && st.y > t.z.t && st.y < t.z.b;
        if (st.x > w || into) Object.assign(st, newStub(lanes, w, false));
        const o = openness(zones, st.x + st.len / 2, st.y);
        if (o < 0.03) continue;
        ctx.fillStyle = white(o * (st.flag ? 0.4 : 0.07 + 0.05 * st.shade));
        ctx.fillRect(st.x, st.y, st.len, st.flag ? 2 : 1.5);
        if (st.flag) {
          const g = ctx.createRadialGradient(st.x + st.len, st.y, 0, st.x + st.len, st.y, 16);
          g.addColorStop(0, white(0.3 * o));
          g.addColorStop(1, white(0));
          ctx.fillStyle = g;
          ctx.fillRect(st.x + st.len - 16, st.y - 16, 32, 32);
        }
      }
      void h;
    },
  };
  function newStub(lanes, w, scatter) {
    const lane = lanes[(Math.random() * lanes.length) | 0];
    return {
      x: scatter ? rand(-80, w) : rand(-160, -40),
      y: lane.y + rand(-3, 3),
      len: rand(18, 70),
      speed: lane.speed * rand(0.8, 1.2),
      shade: Math.random(),
      flag: Math.random() < 0.05,
    };
  }
}

// ---------- 4. constellation ----------
function constellation() {
  let s = null;
  return {
    resize(w, h, zones) {
      const t = target(zones, w, h);
      const dock = t.z ? { x: t.z.l, y: t.y } : t; // lines end at the file's left edge
      const nodes = [];
      for (let k = 0; k < 400 && nodes.length < 46; k++) {
        const x = rand(10, w - 10);
        const y = rand(10, h - 10);
        const o = openness(zones, x, y);
        if (o > 0.85 && nodes.every((n) => Math.hypot(n.x - x, n.y - y) > 60)) nodes.push({ x, y, o, r: rand(1, 2.2) });
      }
      const links = nodes.filter(() => Math.random() < 0.45);
      s = { dock, nodes, links, pulses: [], last: 0, zones };
    },
    frame(ctx, now, w, h, animate) {
      const { dock, nodes, links, pulses, zones } = s;
      // Hairlines from linked nodes into the credit file, faded where they cross content.
      for (const n of links) {
        const steps = 40;
        for (let k = 0; k < steps; k++) {
          const x = n.x + ((dock.x - n.x) * k) / steps;
          const y = n.y + ((dock.y - n.y) * k) / steps;
          const o = openness(zones, x, y);
          if (o < 0.05) continue;
          ctx.fillStyle = white(0.045 * o);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = white(0.18 * n.o);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (animate && now - s.last > rand(180, 420) && links.length) {
        s.last = now;
        pulses.push({ n: links[(Math.random() * links.length) | 0], at: now, dur: rand(1600, 2600), bright: Math.random() < 0.15 });
        if (pulses.length > 24) pulses.shift();
      }
      for (const p of pulses) {
        const t = (now - p.at) / p.dur;
        if (t >= 1 || t < 0) continue;
        const x = p.n.x + (dock.x - p.n.x) * t;
        const y = p.n.y + (dock.y - p.n.y) * t;
        const o = openness(zones, x, y);
        if (o < 0.05) continue;
        const r = p.bright ? 14 : 8;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, white((p.bright ? 0.45 : 0.22) * o));
        g.addColorStop(1, white(0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      void w;
      void h;
    },
  };
}

const VARIANTS = { swarm, radar, streams, constellation };
export const BACKDROP_OPTIONS = [
  { id: "swarm", label: "1. Swarm" },
  { id: "radar", label: "2. Radar" },
  { id: "streams", label: "3. Streams" },
  { id: "constellation", label: "4. Constellation" },
];

export default function HeroBackdrop({ variant = "swarm", className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const scene = (VARIANTS[variant] || VARIANTS.swarm)();
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const render = (now, animate) => {
      ctx.clearRect(0, 0, w, h);
      scene.frame(ctx, now, w, h, animate);
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.resize(w, h, readZones(canvas));
      render(performance.now(), false);
    };
    const step = (now) => {
      raf = requestAnimationFrame(step);
      if (!visible || now - last < 1000 / FPS) return;
      last = now;
      render(now, true);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Fonts and the credit file's own animation can shift layout after load.
    const settle = setTimeout(resize, 1200);
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
  }, [variant]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
