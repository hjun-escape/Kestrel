// Warning score (0-100) with the reason behind every point. Display only: status stays P3's scoreBorrower.
//
// Built on scoreBorrower's own helpers (same 90-day window, same duplicate removal), and the points are
// chosen so the score's band always equals the status rules:
//   strong signal = 40 points, weak signal = 15 points (at most 3 weak count), capped at 100
//   Red >= 70, Yellow >= 30, Green below 30
// Check: 1 strong = 40 (Yellow), 2 weak = 30 (Yellow), 1 strong + 2 weak = 70 (Red), 2 strong = 80 (Red),
// weak signals alone top out at 45 (Yellow), matching "2+ weak = Yellow" with no weak-only Red.
// tests/warningScore.test.ts checks every combination against scoreBorrower.
import { dedupeSignals, recentSignals, scoreBorrower, WINDOW_DAYS } from "../../base44/functions/scoreBorrower/entry.ts";
import type { Signal, Status } from "../../base44/functions/scoreBorrower/entry.ts";

export const POINTS = { strong: 40, weak: 15 } as const;
export const MAX_WEAK_COUNTED = 3;
export const BANDS = { red: 70, yellow: 30 } as const;

export interface ScoreLine {
  signal: Signal;
  points: number;
  note: string; // why these points (or why none)
}

export interface WarningScore {
  score: number;
  band: Status; // equals scoreBorrower(...).status
  why: string; // scoreBorrower's why line
  counted: ScoreLine[];
  notCounted: ScoreLine[];
  strong: number;
  weak: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const newestFirst = (a: Signal, z: Signal) => String(z.date).localeCompare(String(a.date));

export function warningScore(signals: Signal[], today: string = todayIso()): WarningScore {
  const all = Array.isArray(signals) ? signals : [];
  const recent = recentSignals(all, today);
  const unique = dedupeSignals(recent);
  const strongList = unique.filter((s) => s.severity === "strong").sort(newestFirst);
  const weakList = unique.filter((s) => s.severity !== "strong").sort(newestFirst);

  const counted: ScoreLine[] = [
    ...strongList.map((s) => ({ signal: s, points: POINTS.strong, note: "Strong signal" })),
    ...weakList.map((s, i) =>
      i < MAX_WEAK_COUNTED
        ? { signal: s, points: POINTS.weak, note: "Weak signal" }
        : { signal: s, points: 0, note: `Weak signal (only ${MAX_WEAK_COUNTED} weak signals add points)` }
    ),
  ];
  const notCounted: ScoreLine[] = [
    ...recent.filter((s) => !unique.includes(s)).map((s) => ({ signal: s, points: 0, note: "Same event as another signal" })),
    ...all.filter((s) => !recent.includes(s)).sort(newestFirst).map((s) => ({ signal: s, points: 0, note: `Older than ${WINDOW_DAYS} days` })),
  ];

  const raw = counted.reduce((n, l) => n + l.points, 0);
  const { status, why } = scoreBorrower(all, today);
  return { score: Math.min(100, raw), band: status, why, counted, notCounted, strong: strongList.length, weak: weakList.length };
}
