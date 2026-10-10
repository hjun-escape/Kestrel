// Motion tokens for the landing page (anime.js v4, milliseconds).
// Only transform and opacity are ever animated.
export const DURATION = {
  fast: 180,
  normal: 360,
  slow: 640,
};

export const EASE = {
  enter: "outExpo",
  settle: "outQuart",
  swap: "inOutQuad",
};

export const DISTANCE = {
  sm: 8,
  md: 16,
  lg: 28,
};

/** Hero sequence beats (ms from start). */
export const HERO_BEATS = {
  firstFlag: 700,
  between: 1100,
};

/** Reveal once the element is 12% clear of the viewport bottom. */
export const REVEAL_ROOT_MARGIN = "0px 0px -12% 0px";

/** True when the visitor asked for reduced motion. Safe outside the browser. */
export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
