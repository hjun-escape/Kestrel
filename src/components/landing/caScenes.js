// Cellular automata for the hero proposals. Each scene fills its canvas, reports verified findings
// through onSignal / onScore, and answers probe(x, y) so the page can explain any cell on hover.
// White only on the dark hero: red/amber/green stay reserved for the status chip.
//
//   pipeline  Data flows left to right through four bands, each with its own rule, from five source
//             lanes (news, court filings, job posts, reviews, LinkedIn) on the left edge:
//             Search  Conway's Life (B3/S23): raw noise settles into structure
//             Read    coagulation: cells beside 2+ live cells may join, crowded ones thin out, so
//                     fragments fuse into blobs (articles) without filling the band
//             Tag     dense cores are marked (state 2); loose cells die
//             Verify  marked blobs erode; only solid cores survive and exit as signals
//   waves     Greenberg-Hastings excitable medium in rings around the company. Sources fire from five
//             sectors of the rim; each inner ring needs more excited neighbours to pass a front on.
//   sandpile  Abelian sandpile: every verified signal drops grains; avalanche reach = warning score.

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

export function pipelineScene({ onSignal, onMark, onDrop, cell = 6, exitFrac = 0.7, top = 0, noise = 0.1 }) {
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
  const pendingSpawns = []; // encoded inputs waiting to enter: { lane, bits }
  const gateAct = [0, 0, 0, 0]; // recent traffic through each gate (3 between stages + the exit)
  const BANDS = 4;
  const READ_BIRTH = 0.1; // chance an empty cell beside a fragment joins it
  const TAG_N = 5; // live neighbours needed before a cell can be marked
  const TAG_P = 0.08; // chance it is marked
  const TAG_KEEP = 2; // marked neighbours a marked cell needs to stay marked
  const VERIFY_P = 0.998; // per-step survival of a marked cell in a solid block

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
    // Background noise on the input edge, plus any encoded inputs waiting to enter.
    for (let r = topRow; r < rows; r++) for (let c = 0; c < 2; c++) grid[idx(c, r)] = Math.random() < noise ? 1 : 0;
    while (pendingSpawns.length) {
      const { lane, bits } = pendingSpawns.shift();
      const [r0, r1] = laneRows(lane);
      const h = bits.length;
      const start = r0 + Math.max(0, Math.floor(Math.random() * Math.max(1, r1 - r0 - h)));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < bits[y].length; x++) {
          const r = start + y;
          if (r > r1 || x >= exitCol) continue;
          if (bits[y][x]) grid[idx(x, r)] = 1;
        }
      }
      effect({ kind: "spawn", x: 0, y: (start + h / 2) * cell, lane, at: now, dur: 700, h: h * cell });
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
            if (Math.random() < 0.25) effect({ kind: "pop", x: (c + 0.5) * cell, y: (r + 0.5) * cell, lane: laneOf(r), at: now, dur: 650 });
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
      pendingSpawns.push({ lane, bits });
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
        ctx.fillRect(0, a * cell, exitCol * cell, (b - a + 1) * cell);
      }
      // Gates: each brightens with traffic and has its own look.
      for (let g = 0; g < 4; g++) gateAct[g] *= 0.9;
      const gateX = [1, 2, 3].map((b) => Math.floor((b * exitCol) / BANDS) * cell).concat(exitCol * cell);
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
          ctx.fillStyle = rgba(col, 0.8 * (1 - t));
          ctx.fillRect(e.x - 14 * t, e.y - 0.5, 28 * t + 1, 1.5);
          ctx.fillRect(e.x - 0.5, e.y - 6 * t, 1.5, 12 * t + 1);
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
          ctx.fillStyle = rgba(col, 0.5 * (1 - t));
          ctx.fillRect(0, e.y - e.h / 2, 3 + 30 * t, e.h);
        } else if (e.kind === "pop") {
          ctx.strokeStyle = rgba(col, 0.9 * (1 - t));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 + 12 * t, 0, Math.PI * 2);
          ctx.stroke();
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

// ---------------------------------------------------------------- waves
export const RING_EDGES = [1, 0.8, 0.6, 0.42, 0.24];

export function wavesScene({ onSignal, cell = 7, cxFrac = 0.62, cyFrac = 0.52, rFrac = 0.62 }) {
  const K = 8; // 0 rest, 1 excited, 2..K-1 refractory
  let cols = 0;
  let rows = 0;
  let grid = new Uint8Array(0);
  let next = new Uint8Array(0);
  let ring = new Uint8Array(0); // 0 outside, 1 search, 2 read, 3 tag, 4 verify, 5 core
  let origin = new Uint8Array(0); // which source sector started the front through this cell
  let cx = 0;
  let cy = 0;
  let R = 0;
  let lastSource = 0;
  let lastSignal = -1e9;
  const NEED = [0, 1, 1, 2, 2];
  const PASS = [0, 1, 1, 0.9, 0.85];
  const idx = (c, r) => r * cols + c;
  // Five equal sectors of the rim, one per source, starting at the top and going clockwise.
  const sectorOf = (c, r) => {
    const a = (Math.atan2(r - cy, c - cx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return Math.floor((a / (Math.PI * 2)) * LANES) % LANES;
  };

  return {
    geometry: () => ({ cx: cx * cell, cy: cy * cell, R: R * cell }),
    probe(x, y) {
      const c0 = Math.floor(x / cell);
      const r0 = Math.floor(y / cell);
      if (c0 < 0 || r0 < 0 || c0 >= cols || r0 >= rows) return null;
      const k = ring[idx(c0, r0)];
      if (!k) return null;
      for (let d = 0; d <= 2; d++) {
        for (let dr = -d; dr <= d; dr++) {
          for (let dc = -d; dc <= d; dc++) {
            const c = c0 + dc;
            const r = r0 + dr;
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const s = grid[idx(c, r)];
            if (s) return { state: s === 1 ? "front" : "settling", ring: ring[idx(c, r)], sector: origin[idx(c, r)], x: (c + 0.5) * cell, y: r * cell };
          }
        }
      }
      return { empty: true, ring: k, sector: sectorOf(c0, r0), x: (c0 + 0.5) * cell, y: r0 * cell };
    },
    resize(w, h) {
      cols = Math.floor(w / cell);
      rows = Math.floor(h / cell);
      grid = new Uint8Array(cols * rows);
      next = new Uint8Array(cols * rows);
      ring = new Uint8Array(cols * rows);
      origin = new Uint8Array(cols * rows);
      cx = cols * cxFrac;
      cy = rows * cyFrac;
      R = Math.min(cols, rows) * rFrac;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const d = Math.hypot(c - cx, r - cy) / R;
          let k = 0;
          if (d <= 1) k = d > RING_EDGES[1] ? 1 : d > RING_EDGES[2] ? 2 : d > RING_EDGES[3] ? 3 : d > RING_EDGES[4] ? 4 : 5;
          ring[idx(c, r)] = k;
        }
      }
    },
    frame(ctx, now, w, h, animate) {
      if (animate) {
        if (now - lastSource > 260) {
          lastSource = now;
          const a = Math.random() * Math.PI * 2;
          const c0 = Math.round(cx + Math.cos(a) * R * 0.95);
          const r0 = Math.round(cy + Math.sin(a) * R * 0.95);
          const sec = sectorOf(c0, r0);
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const c = c0 + dc;
              const r = r0 + dr;
              if (c >= 0 && r >= 0 && c < cols && r < rows && ring[idx(c, r)] === 1 && grid[idx(c, r)] === 0) {
                grid[idx(c, r)] = 1;
                origin[idx(c, r)] = sec;
              }
            }
          }
        }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const i = idx(c, r);
            const k = ring[i];
            const s = grid[i];
            if (!k) {
              next[i] = 0;
              continue;
            }
            if (s > 0) {
              next[i] = s + 1 >= K ? 0 : s + 1;
              continue;
            }
            if (k === 5) {
              let hit = -1;
              for (let dr = -1; dr <= 1 && hit < 0; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  const j = idx(c + dc, r + dr);
                  if (grid[j] === 1 && ring[j] === 4) hit = origin[j];
                }
              }
              if (hit >= 0 && now - lastSignal > 1800) {
                lastSignal = now;
                onSignal?.({ lane: hit });
              }
              next[i] = 0;
              continue;
            }
            let n = 0;
            let src = 0;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const cc = c + dc;
                const rr = r + dr;
                if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && grid[idx(cc, rr)] === 1) {
                  n++;
                  src = origin[idx(cc, rr)];
                }
              }
            }
            const fire = n >= NEED[k] && Math.random() < PASS[k];
            next[i] = fire ? 1 : 0;
            if (fire) origin[i] = src;
          }
        }
        [grid, next] = [next, grid];
      }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = white(0.14);
      ctx.setLineDash([2, 5]);
      for (const e of RING_EDGES) {
        ctx.beginPath();
        ctx.arc(cx * cell, cy * cell, e * R * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let l = 0; l < LANES; l++) {
        const a = (l / LANES) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx * cell + Math.cos(a) * R * cell * 0.96, cy * cell + Math.sin(a) * R * cell * 0.96);
        ctx.lineTo(cx * cell + Math.cos(a) * R * cell * 1.06, cy * cell + Math.sin(a) * R * cell * 1.06);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = grid[idx(c, r)];
          if (!s) continue;
          ctx.fillStyle = white(s === 1 ? 0.9 : 0.4 * (1 - (s - 1) / (K - 1)));
          ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- sandpile
export function sandpileScene({ onScore, cell = 4, grainsPerSignal = 220, signalEveryMs = 700, cxFrac = 0.6, cyFrac = 0.52, rFrac = 0.46 }) {
  let cols = 0;
  let rows = 0;
  let h = new Uint16Array(0);
  let queue = [];
  let flash = new Float32Array(0);
  let lastDrop = 0;
  let cx = 0;
  let cy = 0;
  let R = 0;
  let pending = 0;
  let reach = 0;
  let resetAt = 0;
  let drops = 0; // verified signals dropped so far in this run
  let perSignal = grainsPerSignal;
  let budget = 5000;
  const idx = (c, r) => r * cols + c;

  // Topples only cells that can: a work queue instead of rescanning the grid.
  function topple(budget) {
    let did = 0;
    while (queue.length && did < budget) {
      const i = queue.pop();
      if (h[i] < 4) continue;
      const c = i % cols;
      const r = (i / cols) | 0;
      if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) {
        h[i] = 0;
        continue;
      }
      h[i] -= 4;
      for (const j of [i - 1, i + 1, i - cols, i + cols]) {
        h[j]++;
        if (h[j] === 4) queue.push(j);
      }
      if (h[i] >= 4) queue.push(i);
      flash[i] = 1;
      reach = Math.max(reach, Math.hypot(c - cx, r - cy));
      did++;
    }
  }

  return {
    geometry: () => ({ cx: cx * cell, cy: cy * cell, R: R * cell }),
    probe(x, y) {
      const c = Math.floor(x / cell);
      const r = Math.floor(y / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
      const d = Math.hypot(c - cx, r - cy);
      if (d > R * 1.05) return null;
      return { height: h[idx(c, r)], toppling: flash[idx(c, r)] > 0.3, distance: d / R, drops, x: (c + 0.5) * cell, y: r * cell };
    },
    resize(w, hh) {
      cols = Math.floor(w / cell);
      rows = Math.floor(hh / cell);
      h = new Uint16Array(cols * rows);
      queue = [];
      flash = new Float32Array(cols * rows);
      cx = Math.floor(cols * cxFrac);
      cy = Math.floor(rows * cyFrac);
      R = Math.min(cols, rows) * rFrac;
      // Grains needed grow with the pile's area; scale so a run takes the same time at any size.
      const area = (R / 35) ** 2;
      perSignal = Math.round(grainsPerSignal * area);
      budget = Math.min(60000, Math.round(5000 * area));
      reach = 0;
      drops = 0;
    },
    frame(ctx, now, w, hh, animate) {
      if (animate) {
        if (resetAt && now > resetAt) {
          h.fill(0);
          queue = [];
          reach = 0;
          drops = 0;
          resetAt = 0;
        }
        if (!resetAt && now - lastDrop > signalEveryMs) {
          lastDrop = now;
          pending += perSignal;
          drops++;
        }
        const drop = Math.min(pending, Math.max(40, Math.round(perSignal / 6)));
        pending -= drop;
        if (drop) {
          h[idx(cx, cy)] += drop;
          queue.push(idx(cx, cy));
        }
        topple(budget);
        const score = Math.min(100, Math.round((reach / R) * 100));
        onScore?.(score, drops);
        if (score >= 96 && !resetAt) resetAt = now + 3500;
      }
      ctx.clearRect(0, 0, w, hh);
      const LEVEL = [0, 0.16, 0.32, 0.55];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = idx(c, r);
          const v = h[i];
          const f = flash[i];
          if (!v && f < 0.05) continue;
          ctx.fillStyle = white(Math.max(LEVEL[Math.min(v, 3)], f * 0.85));
          ctx.fillRect(c * cell, r * cell, cell - 0.5, cell - 0.5);
          if (f) flash[i] = f > 0.05 ? f * 0.8 : 0;
        }
      }
    },
  };
}
