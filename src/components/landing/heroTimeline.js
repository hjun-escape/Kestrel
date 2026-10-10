import { createTimeline, utils } from "animejs";
import { BADGES, FLAGS, STATUS_AFTER_FLAG } from "./heroData";
import { DISTANCE, DURATION, EASE, HERO_BEATS } from "./motion";

// Builds the hero sequence inside an anime.js scope (selectors resolve
// against the scope root). The markup already renders the final state, so
// this first rewinds it to "nothing found yet" and then replays the flags.
// Transform and opacity only.

const sel = {
  flag: (i) => `[data-flag="${i}"]`,
  mark: (i) => `[data-mark="${i}"]`,
  badge: (key) => `[data-badge="${key}"]`,
  why: (i) => `[data-why="${i}"]`,
};

function rewind() {
  utils.set("[data-flag]", { opacity: 0, x: DISTANCE.lg });
  utils.set("[data-mark]", { opacity: 0, scale: 0 });
  utils.set("[data-mark-range]", { opacity: 0, scaleX: 0 });
  utils.set("[data-badge]", { opacity: 0 });
  utils.set(sel.badge(BADGES[0]), { opacity: 1 });
  utils.set("[data-why]", { opacity: 0 });
  utils.set(sel.why(0), { opacity: 1 });
  utils.set("[data-pulse]", { opacity: 0 });
}

function addStatusChange(tl, step, at) {
  const before = STATUS_AFTER_FLAG[step - 1];
  const after = STATUS_AFTER_FLAG[step];
  const swap = { duration: DURATION.normal, ease: EASE.swap };

  tl.add(sel.why(step - 1), { ...swap, opacity: 0 }, at).add(sel.why(step), { ...swap, opacity: 1 }, at);

  if (before === after) return;
  tl.add(sel.badge(before), { ...swap, opacity: 0 }, at)
    .add(sel.badge(after), { ...swap, opacity: 1 }, at)
    .add(
      `[data-pulse="${after}"]`,
      { opacity: [0.7, 0], scale: [1, 1.035], duration: DURATION.slow * 1.4, ease: EASE.settle },
      at,
    );
}

export function buildHeroTimeline() {
  rewind();
  const tl = createTimeline({ defaults: { duration: DURATION.slow, ease: EASE.enter } });

  FLAGS.forEach((flag, i) => {
    const at = HERO_BEATS.firstFlag + i * HERO_BEATS.between;
    tl.add(sel.flag(i), { opacity: [0, 1], x: [DISTANCE.lg, 0] }, at);

    if (flag.mark.kind === "range") {
      tl.add(`[data-mark-range="${i}"]`, { opacity: [0, 1], scaleX: [0, 1], ease: EASE.settle }, at + 140);
    } else {
      tl.add(sel.mark(i), { opacity: [0, 1], scale: [0, 1], duration: DURATION.normal, ease: "outBack" }, at + 140);
    }

    addStatusChange(tl, i + 1, at + 280);
  });

  return tl;
}
