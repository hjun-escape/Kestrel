// Cellular automaton for the landing hero: the product's workflow as a pipeline. It fills its canvas,
// reports events (onMark, onDrop, onSignal) and answers probe(x, y) so the page can explain any cell on hover.
// Lanes are coloured by source; red/amber/green stay reserved for the report's status.
//
//   Data flows left to right through four bands, each with its own rule, from five source
//             lanes (news, court filings, job posts, reviews, LinkedIn) on the left edge:
//             Search  Conway's Life (B3/S23): raw noise settles into structure
//             Read    coagulation: cells beside 2+ live cells may join, crowded ones thin out, so
//                     fragments fuse into blobs (articles) without filling the band
//             Tag     dense cores are marked (state 2); loose cells die
//             Verify  marked blobs erode; only solid cores survive and exit as signals

const white = (a) => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;
export const LANES = 5; // news, courts, jobs, reviews, linkedin

// ---------------------------------------------------------------- pipeline
// Lane colours, one per source (red/amber/green stay reserved for status).
export const LANE_COLORS = [
  [56, 189, 248], // News: sky
  [192, 132, 252], // Court filings: purple
  [45, 212, 191], // Job posts: teal
  [244, 114, 182], // Reviews: pink
  [129, 140, 248], // LinkedIn: indigo
];
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export function pipelineScene({ onSignal, onMark, onDrop, cell = 6, exitFrac = 0.7, top = 0, noise = 0.1, verifyPass = 0.998 }) {
  let cols = 0;
  let rows = 0;
  let exitCol = 0;
  let topRow = 0;
  let grid = new Uint8Array(0);
  let next = new Uint8Array(0);
  let tick = 0;
  let shifted = 0; // columns moved so far, so a cell keeps its identity as it flows
  let lastSignal = -1e9;
  let lastMark = -1e9;
  let lastDrop = -1e9;
  let target = null; // where verified cells fly to (the report), in canvas px
  let effects = []; // { kind: "pop" | "fade" | "fly" | "spawn", x, y, lane, at, ... }
  const spawning = []; // inputs entering their lane one column at a time: { lane, bits, start, col }
  const gateAct = [0, 0, 0, 0]; // recent traffic through each gate (3 between stages + the exit)
  const BANDS = 4;
  const READ_BIRTH = 0.1; // chance an empty cell beside a fragment joins it
  const TAG_N = 5; // live neighbours needed before a cell can be marked
  const TAG_P = 0.08; // chance it is marked
  const TAG_KEEP = 2; // marked neighbours a marked cell needs to stay marked
  const VERIFY_P = verifyPass; // per-step survival of a marked cell in a solid block

  const idx = (c, r) => r * cols + c;
  const bandOf = (c) => Math.min(BANDS - 1, Math.floor((c / exitCol) * BANDS));
  const laneOf = (r) => Math.min(LANES - 1, Math.max(0, Math.floor(((r - topRow) / (rows - topRow)) * LANES)));
  const laneRows = (lane) => {
    const h = (rows - topRow) / LANES;
    return [Math.ceil(topRow + lane * h), Math.floor(topRow + (lane + 1) * h) - 1];
  };

  function neighbours(c, r, min) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < topRow || rr >= rows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc;
        if (cc < 0 || cc >= exitCol) continue;
        if (grid[idx(cc, rr)] >= min) n++;
      }
    }
    return n;
  }

  function inTaggedBlock(c, r) {
    const t = (cc, rr) => cc >= 0 && rr >= topRow && cc < exitCol && rr < rows && grid[idx(cc, rr)] === 2;
    for (const [dc, dr] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const c0 = c + dc;
      const r0 = r + dr;
      if (t(c0, r0) && t(c0 + 1, r0) && t(c0, r0 + 1) && t(c0 + 1, r0 + 1)) return true;
    }
    return false;
  }

  const effect = (e) => {
    effects.push(e);
    if (effects.length > 160) effects.shift();
  };

  function step(now) {
    tick++;
    if (tick % 2 === 0) {
      shifted++;
      for (let r = topRow; r < rows; r++) {
        // Gates between stages: whatever crosses this step gets that gate's animation.
        for (let b = 1; b < BANDS; b++) {
          const g = Math.floor((b * exitCol) / BANDS);
          const crossing = grid[idx(g - 1, r)];
          if (!crossing) continue;
          gateAct[b - 1]++;
          const y = (r + 0.5) * cell;
          const x = g * cell;
          const lane = laneOf(r);
          if (b === 1 && Math.random() < 0.18) effect({ kind: "absorb", x, y, lane, at: now, dur: 600 });
          if (b === 2 && Math.random() < 0.22) effect({ kind: "spark", x, y, lane, at: now, dur: 450 });
          if (b === 3) {
            if (crossing === 2) effect({ kind: "pass", x, y, lane, at: now, dur: 650 });
            else if (Math.random() < 0.12) effect({ kind: "block", x, y, lane, at: now, dur: 500 });
          }
        }
        if (grid[idx(exitCol - 1, r)] === 2) {
          const lane = laneOf(r);
          gateAct[3]++;
          if (Math.random() < 0.5) effect({ kind: "stamp", x: exitCol * cell, y: (r + 0.5) * cell, lane, at: now, dur: 700 });
          if (target && Math.random() < 0.35) effect({ kind: "fly", x: exitCol * cell, y: (r + 0.5) * cell, lane, at: now, dur: 900 });
          if (now - lastSignal > 3500) {
            lastSignal = now;
            onSignal?.({ lane });
          }
        }
        for (let c = exitCol - 1; c > 0; c--) grid[idx(c, r)] = grid[idx(c - 1, r)];
        grid[idx(0, r)] = 0;
      }
    }
    // Background noise on the input edge.
    for (let r = topRow; r < rows; r++) for (let c = 0; c < 2; c++) grid[idx(c, r)] = Math.random() < noise ? 1 : 0;
    // Inputs extrude into their lane one column per conveyor step, like a tape feeding in. The chip in the
    // input column enters right end first, so the last column goes in first and the text reads left to right.
    if (tick % 2 === 0) {
      for (const sp of spawning) {
        const x = sp.bits[0].length - 1 - sp.col;
        for (let y = 0; y < sp.bits.length; y++) {
          const r = sp.start + y;
          if (r >= topRow && r < rows && sp.bits[y][x]) grid[idx(0, r)] = 1;
        }
        effect({ kind: "spawn", x: 0, y: (sp.start + sp.bits.length / 2) * cell, lane: sp.lane, at: now, dur: 260, h: sp.bits.length * cell });
        sp.col++;
      }
      for (let k = spawning.length - 1; k >= 0; k--) if (spawning[k].col >= spawning[k].bits[0].length) spawning.splice(k, 1);
    }

    for (let r = topRow; r < rows; r++) {
      for (let c = 0; c < exitCol; c++) {
        const i = idx(c, r);
        const s = grid[i];
        const band = bandOf(c);
        const n = neighbours(c, r, 1);
        let out = 0;
        if (band === 0) {
          out = s ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
        } else if (band === 1) {
          // Join beside 2-5 live cells; crowded cells thin out, so blobs keep holes and edges.
          out = s ? (n >= 2 && n <= 5 ? 1 : n >= 6 && Math.random() < 0.45 ? 1 : 0) : n >= 2 && n <= 5 && Math.random() < READ_BIRTH ? 1 : 0;
        } else if (band === 2) {
          // Marks stay as small clusters: a marked cell needs marked neighbours.
          if (s === 2) out = neighbours(c, r, 2) >= TAG_KEEP ? 2 : 0;
          else if (s === 1) out = n >= TAG_N && Math.random() < TAG_P ? 2 : n <= 1 ? 0 : n >= 3 ? 1 : 0;
          else out = n === 3 && Math.random() < 0.5 ? 1 : 0;
          if (s === 1 && out === 2) {
            if (Math.random() < 0.12) effect({ kind: "pop", x: (c + 0.5) * cell, y: (r + 0.5) * cell, lane: laneOf(r), at: now, dur: 550 });
            if (now - lastMark > 1300) {
              lastMark = now;
              onMark?.({ lane: laneOf(r), id: r * 7919 + (c - shifted) });
            }
          }
        } else {
          // Only solid marked blocks pass; each step a few fail the quote check.
          if (s === 2) out = inTaggedBlock(c, r) && Math.random() < VERIFY_P ? 2 : 0;
          else if (s === 1) out = Math.random() < 0.35 ? 0 : 1;
          else out = 0;
          if (s === 2 && out === 0) {
            effect({ kind: "fade", x: (c + 0.5) * cell, y: (r + 0.5) * cell, lane: laneOf(r), at: now, dur: 500 });
            if (now - lastDrop > 1700) {
              lastDrop = now;
              onDrop?.({ lane: laneOf(r), id: r * 7919 + (c - shifted) });
            }
          }
        }
        next[i] = out;
      }
    }
    [grid, next] = [next, grid];
  }

  return {
    layout: () => ({ cell, cols, rows, exitX: exitCol * cell, topY: topRow * cell, bandW: (exitCol * cell) / BANDS }),
    setTarget(t) {
      target = t;
    },
    /** Encoded input enters its lane on the next step: bits is rows of 0/1. */
    inject(lane, bits) {
      if (!bits.length || !bits[0].length) return;
      const [r0, r1] = laneRows(lane);
      const start = r0 + Math.max(0, Math.floor(Math.random() * Math.max(1, r1 - r0 - bits.length)));
      spawning.push({ lane, bits, start, col: 0 });
    },
    probe(x, y) {
      const c0 = Math.floor(x / cell);
      const r0 = Math.floor(y / cell);
      if (c0 < 0 || c0 >= exitCol || r0 < topRow || r0 >= rows) return null;
      for (let d = 0; d <= 2; d++) {
        for (let dr = -d; dr <= d; dr++) {
          for (let dc = -d; dc <= d; dc++) {
            const c = c0 + dc;
            const r = r0 + dr;
            if (c < 0 || c >= exitCol || r < topRow || r >= rows) continue;
            const s = grid[idx(c, r)];
            if (s) return { c, r, state: s, stage: bandOf(c), lane: laneOf(r), id: r * 7919 + (c - shifted), x: (c + 0.5) * cell, y: r * cell };
          }
        }
      }
      return { empty: true, stage: bandOf(c0), lane: laneOf(r0), x: (c0 + 0.5) * cell, y: r0 * cell };
    },
    resize(w, h) {
      cols = Math.max(8, Math.floor(w / cell));
      rows = Math.max(4, Math.floor(h / cell));
      exitCol = Math.max(8, Math.floor(cols * exitFrac));
      topRow = Math.min(rows - 4, Math.ceil(top / cell));
      grid = new Uint8Array(cols * rows);
      next = new Uint8Array(cols * rows);
      effects = [];
      const saved = noise;
      noise = 0.38; // warm up with dense input so the bands open mid-flow
      for (let k = 0; k < 260; k++) step(-1e9);
      noise = saved;
      effects = [];
    },
    frame(ctx, now, w, h, animate) {
      if (animate) step(now);
      ctx.clearRect(0, 0, w, h);
      const bw = (exitCol * cell) / BANDS;
      const y0 = topRow * cell;
      // Lane tints and stage dividers.
      for (let l = 0; l < LANES; l++) {
        const [a, b] = laneRows(l);
        ctx.fillStyle = rgba(LANE_COLORS[l], 0.03);
        ctx.fillRect(0, a * cell, exitCol === cols ? w : exitCol * cell, (b - a + 1) * cell);
      }
      // Gates: each brightens with traffic and has its own look.
      for (let g = 0; g < 4; g++) gateAct[g] *= 0.9;
      // The exit gate sits on the frame's right edge when the pipeline runs the full width.
      const gateX = [1, 2, 3].map((b) => Math.floor((b * exitCol) / BANDS) * cell).concat(exitCol === cols ? w - 5 : exitCol * cell);
      const glow = (g) => 0.14 + Math.min(0.45, gateAct[g] * 0.012);
      // 1 absorb: dotted line.
      ctx.fillStyle = white(glow(0));
      for (let y = y0; y < h; y += 6) ctx.fillRect(gateX[0], y, 1, 3);
      // 2 scanner: solid line with a beam sweeping up and down.
      ctx.fillStyle = white(glow(1) * 0.7);
      ctx.fillRect(gateX[1], y0, 1, h - y0);
      const scanY = y0 + (h - y0) * (0.5 + 0.5 * Math.sin(now / 650));
      const beam = ctx.createLinearGradient(0, scanY - 46, 0, scanY + 46);
      beam.addColorStop(0, white(0));
      beam.addColorStop(0.5, white(0.85));
      beam.addColorStop(1, white(0));
      ctx.fillStyle = beam;
      ctx.fillRect(gateX[1] - 1, scanY - 46, 3, 92);
      ctx.fillStyle = white(0.07);
      ctx.fillRect(gateX[1] - 10, scanY - 46, 20, 92);
      // 3 sieve: a comb of teeth.
      ctx.fillStyle = white(glow(2));
      ctx.fillRect(gateX[2], y0, 1, h - y0);
      for (let y = y0 + 4; y < h; y += 10) ctx.fillRect(gateX[2] - 4, y, 8, 1);
      // 4 exit to the report: double rule.
      ctx.fillStyle = white(glow(3));
      ctx.fillRect(gateX[3], y0, 1, h - y0);
      ctx.fillRect(gateX[3] + 3, y0, 1, h - y0);
      for (let r = topRow; r < rows; r++) {
        const col = LANE_COLORS[laneOf(r)];
        for (let c = 0; c < exitCol; c++) {
          const s = grid[idx(c, r)];
          if (!s) continue;
          if (s === 2) {
            ctx.fillStyle = rgba(col, 1);
            ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
            ctx.fillStyle = white(0.9);
            ctx.fillRect(c * cell + 1.5, r * cell + 1.5, cell - 4, cell - 4);
          } else {
            ctx.fillStyle = rgba(col, 0.28 + 0.12 * bandOf(c));
            ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
          }
        }
      }
      // Effects: spawn flash on the input edge, pops when marked, fades when dropped, flights to the report.
      const keep = [];
      for (const e of effects) {
        const t = (now - e.at) / e.dur;
        if (t >= 1 || t < 0) continue;
        keep.push(e);
        const col = LANE_COLORS[e.lane];
        if (e.kind === "absorb") {
          // A ripple along the gate only (vertical), as the fragment is taken in.
          ctx.fillStyle = rgba(col, 0.8 * (1 - t));
          ctx.fillRect(e.x - 0.5, e.y - 10 * t, 2, 20 * t + 1);
          continue;
        }
        if (e.kind === "spark") {
          const r = 2 + 7 * t;
          ctx.strokeStyle = white(0.9 * (1 - t));
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            ctx.moveTo(e.x + Math.cos(a) * 1.5, e.y + Math.sin(a) * 1.5);
            ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
          }
          ctx.stroke();
          continue;
        }
        if (e.kind === "pass") {
          ctx.strokeStyle = rgba(col, 1 - t);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 + 9 * t, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (e.kind === "block") {
          const d = 3;
          const bx = e.x - 6 - 6 * t; // bounced back from the sieve
          ctx.strokeStyle = white(0.55 * (1 - t));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx - d, e.y - d);
          ctx.lineTo(bx + d, e.y + d);
          ctx.moveTo(bx + d, e.y - d);
          ctx.lineTo(bx - d, e.y + d);
          ctx.stroke();
          continue;
        }
        if (e.kind === "stamp") {
          const sz = 6 + 14 * t;
          ctx.strokeStyle = rgba(col, 1 - t);
          ctx.lineWidth = 2 * (1 - t) + 0.5;
          ctx.strokeRect(e.x - sz / 2, e.y - sz / 2, sz, sz);
          ctx.fillStyle = white(0.7 * (1 - t));
          ctx.fillRect(e.x, e.y - 22 * (1 - t), 4, 44 * (1 - t));
          continue;
        }
        if (e.kind === "spawn") {
          ctx.fillStyle = rgba(col, 0.55 * (1 - t));
          ctx.fillRect(0, e.y - e.h / 2, 2, e.h);
        } else if (e.kind === "pop") {
          // Newly marked: a square outline on the grid, not a ring.
          const sz = cell + 2 + 4 * t;
          ctx.strokeStyle = rgba(col, 0.9 * (1 - t));
          ctx.lineWidth = 1;
          ctx.strokeRect(e.x - sz / 2, e.y - sz / 2, sz, sz);
        } else if (e.kind === "fade") {
          const s = (cell - 1) * (1 - t);
          ctx.fillStyle = white(0.6 * (1 - t));
          ctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
        } else if (e.kind === "fly" && target) {
          const ease = t * t * (3 - 2 * t);
          const mx = (e.x + target.x) / 2;
          const my = Math.min(e.y, target.y) - 60;
          const x = (1 - ease) * (1 - ease) * e.x + 2 * (1 - ease) * ease * mx + ease * ease * target.x;
          const y = (1 - ease) * (1 - ease) * e.y + 2 * (1 - ease) * ease * my + ease * ease * target.y;
          ctx.fillStyle = rgba(col, 1 - 0.3 * t);
          ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
          ctx.fillStyle = rgba(col, 0.25 * (1 - t));
          ctx.fillRect(x - 6, y - 6, 12, 12);
        }
      }
      effects = keep;
    },
  };
}

/** Encodes text as bits for the pipeline's input edge: 7 bits per character, laid out in rows. */
export function encodeText(text, rowsTall = 8, maxCols = 14) {
  const bits = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0) & 127;
    for (let b = 6; b >= 0; b--) bits.push((code >> b) & 1);
  }
  const cols = Math.min(maxCols, Math.ceil(bits.length / rowsTall));
  const out = Array.from({ length: rowsTall }, (_, y) => Array.from({ length: cols }, (_, x) => bits[x * rowsTall + y] ?? 0));
  return out;
}
