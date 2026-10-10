// Cellular automata for the hero proposals. Each scene draws on a canvas and reports
// "signal" events (a verified finding reaching the credit file) through onSignal.
// White only on the dark hero: red/amber/green stay reserved for the status chip.
//
//   pipeline  Data flows left to right through four bands, each with its own rule:
//             Search  Conway's Life (B3/S23): raw noise settles into structure
//             Read    coagulation: cells next to 2+ live cells join, isolated cells die, so
//                     fragments fuse into solid blobs (articles)
//             Tag     dense cells are marked (state 2); loose cells die
//             Verify  only marked cells in stable 2x2 blocks survive; they exit as signals
//   waves     Greenberg-Hastings excitable medium in rings around the company. Sources fire at
//             the rim; each inner ring needs more excited neighbours to pass a front on, so only
//             strong, coherent waves reach the centre.
//   sandpile  Abelian sandpile: every verified signal drops grains at the centre; piles topple in
//             avalanches. The pile's reach is the warning score, with Yellow and Red rings.

const white = (a) => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// ---------------------------------------------------------------- pipeline
export function pipelineScene({ onSignal, cell = 5 }) {
  let cols = 0;
  let rows = 0;
  let grid = new Uint8Array(0);
  let next = new Uint8Array(0);
  let tick = 0;
  let lastSignal = -1e9;
  const BANDS = 4;

  const idx = (c, r) => r * cols + c;
  const bandOf = (c) => Math.min(BANDS - 1, Math.floor((c / cols) * BANDS));

  function neighbours(c, r, min) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= rows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc;
        if (cc < 0 || cc >= cols) continue;
        if (grid[idx(cc, rr)] >= min) n++;
      }
    }
    return n;
  }

  function inTaggedBlock(c, r) {
    const t = (cc, rr) => cc >= 0 && rr >= 0 && cc < cols && rr < rows && grid[idx(cc, rr)] === 2;
    for (const [dc, dr] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const c0 = c + dc;
      const r0 = r + dr;
      if (t(c0, r0) && t(c0 + 1, r0) && t(c0, r0 + 1) && t(c0 + 1, r0 + 1)) return true;
    }
    return false;
  }

  function step(now) {
    tick++;
    // Conveyor: everything moves one column toward the credit file every other tick.
    if (tick % 2 === 0) {
      for (let r = 0; r < rows; r++) {
        const exiting = grid[idx(cols - 1, r)];
        if (exiting === 2 && now - lastSignal > 2500) {
          lastSignal = now;
          onSignal?.({ y: r / rows });
        }
        for (let c = cols - 1; c > 0; c--) grid[idx(c, r)] = grid[idx(c - 1, r)];
        grid[idx(0, r)] = 0;
      }
    }
    // Sources: raw noise enters at the left edge.
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) grid[idx(c, r)] = Math.random() < 0.38 ? 1 : 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        const s = grid[i];
        const band = bandOf(c);
        const n = neighbours(c, r, 1);
        let out = 0;
        if (band === 0) {
          out = s ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
        } else if (band === 1) {
          out = s ? (n >= 2 ? 1 : 0) : n >= 2 && Math.random() < 0.45 ? 1 : 0;
        } else if (band === 2) {
          if (s === 2) out = n >= 2 ? 2 : 0;
          else if (s === 1) out = n >= 7 && Math.random() < 0.035 ? 2 : n <= 1 ? 0 : n >= 3 ? 1 : 0;
          else out = n === 3 && Math.random() < 0.5 ? 1 : 0;
        } else {
          // Erodes: a marked cell survives only deep inside a marked block.
          if (s === 2) out = inTaggedBlock(c, r) && neighbours(c, r, 2) >= 4 && Math.random() < 0.9935 ? 2 : 0;
          else if (s === 1) out = Math.random() < 0.35 ? 0 : 1;
          else out = 0;
        }
        next[i] = out;
      }
    }
    [grid, next] = [next, grid];
  }

  return {
    resize(w, h) {
      cols = Math.max(8, Math.floor(w / cell));
      rows = Math.max(4, Math.floor(h / cell));
      grid = new Uint8Array(cols * rows);
      next = new Uint8Array(cols * rows);
      for (let k = 0; k < 220; k++) step(performance.now() - 1e6); // warm up so it opens mid-flow
    },
    frame(ctx, now, w, h, animate) {
      if (animate) step(now);
      ctx.clearRect(0, 0, w, h);
      const bw = (cols * cell) / BANDS;
      for (let b = 0; b < BANDS; b++) {
        ctx.fillStyle = white(b % 2 ? 0.025 : 0.012);
        ctx.fillRect(b * bw, 0, bw, rows * cell);
        if (b) {
          ctx.fillStyle = white(0.12);
          for (let y = 0; y < rows * cell; y += 6) ctx.fillRect(b * bw, y, 1, 3);
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = grid[idx(c, r)];
          if (!s) continue;
          ctx.fillStyle = s === 2 ? white(0.92) : white(0.2 + 0.1 * bandOf(c));
          ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- waves
export function wavesScene({ onSignal, cell = 6 }) {
  const K = 8; // 0 rest, 1 excited, 2..K-1 refractory
  let cols = 0;
  let rows = 0;
  let grid = new Uint8Array(0);
  let next = new Uint8Array(0);
  let ring = new Uint8Array(0); // 0 outside, 1 search, 2 read, 3 tag, 4 verify, 5 core
  let cx = 0;
  let cy = 0;
  let R = 0;
  let lastSource = 0;
  let lastSignal = -1e9;
  // Fraction of radius where each stage starts (outer edge first).
  const EDGES = [1, 0.8, 0.6, 0.42, 0.24];
  const NEED = [0, 1, 1, 2, 2]; // excited neighbours needed to fire, per ring
  const PASS = [0, 1, 1, 0.85, 0.75]; // chance a qualifying cell fires

  const idx = (c, r) => r * cols + c;

  return {
    rings: () => ({ cx, cy, R, edges: EDGES }),
    resize(w, h) {
      cols = Math.floor(w / cell);
      rows = Math.floor(h / cell);
      grid = new Uint8Array(cols * rows);
      next = new Uint8Array(cols * rows);
      ring = new Uint8Array(cols * rows);
      cx = cols / 2;
      cy = rows / 2;
      R = Math.min(cols, rows) / 2 - 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const d = Math.hypot(c - cx, r - cy) / R;
          let k = 0;
          if (d <= 1) k = d > EDGES[1] ? 1 : d > EDGES[2] ? 2 : d > EDGES[3] ? 3 : d > EDGES[4] ? 4 : 5;
          ring[idx(c, r)] = k;
        }
      }
    },
    frame(ctx, now, w, h, animate) {
      if (animate) {
        if (now - lastSource > 260) {
          lastSource = now;
          const a = Math.random() * Math.PI * 2;
          const c0 = Math.round(cx + Math.cos(a) * R * 0.93);
          const r0 = Math.round(cy + Math.sin(a) * R * 0.93);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const c = c0 + dc;
            const r = r0 + dr;
            if (c >= 0 && r >= 0 && c < cols && r < rows && ring[idx(c, r)] === 1 && grid[idx(c, r)] === 0) grid[idx(c, r)] = 1;
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
              // Core: a front that gets this far is a verified finding.
              let hit = false;
              for (let dr = -1; dr <= 1 && !hit; dr++) for (let dc = -1; dc <= 1; dc++) {
                const cc = c + dc;
                const rr = r + dr;
                if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && grid[idx(cc, rr)] === 1 && ring[idx(cc, rr)] === 4) hit = true;
              }
              if (hit && now - lastSignal > 1800) {
                lastSignal = now;
                onSignal?.({});
              }
              next[i] = 0;
              continue;
            }
            let n = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              const cc = c + dc;
              const rr = r + dr;
              if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && grid[idx(cc, rr)] === 1) n++;
            }
            next[i] = n >= NEED[k] && Math.random() < PASS[k] ? 1 : 0;
          }
        }
        [grid, next] = [next, grid];
      }
      ctx.clearRect(0, 0, w, h);
      // Stage rings.
      ctx.strokeStyle = white(0.13);
      ctx.setLineDash([2, 5]);
      for (const e of EDGES) {
        ctx.beginPath();
        ctx.arc(cx * cell, cy * cell, e * R * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = grid[idx(c, r)];
          if (!s) continue;
          const a = s === 1 ? 0.9 : 0.4 * (1 - (s - 1) / (K - 1));
          ctx.fillStyle = white(a);
          ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- sandpile
export function sandpileScene({ onScore, cell = 4, grainsPerSignal = 220, signalEveryMs = 700 }) {
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
        h[i] = 0; // grains fall off the edge
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
    resize(w, hh) {
      cols = Math.floor(w / cell);
      rows = Math.floor(hh / cell);
      h = new Uint16Array(cols * rows);
      queue = [];
      flash = new Float32Array(cols * rows);
      cx = Math.floor(cols / 2);
      cy = Math.floor(rows / 2);
      R = Math.min(cols, rows) / 2 - 2;
      reach = 0;
    },
    frame(ctx, now, w, hh, animate) {
      if (animate) {
        if (resetAt && now > resetAt) {
          h.fill(0);
          queue = [];
          reach = 0;
          resetAt = 0;
        }
        if (!resetAt && now - lastDrop > signalEveryMs) {
          lastDrop = now;
          pending += grainsPerSignal;
        }
        const drop = Math.min(pending, 40);
        pending -= drop;
        if (drop) {
          h[idx(cx, cy)] += drop;
          queue.push(idx(cx, cy));
        }
        topple(5000);
        const score = Math.min(100, Math.round((reach / R) * 100));
        onScore?.(score);
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
