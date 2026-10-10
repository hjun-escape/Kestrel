import React, { useEffect, useRef } from "react";
import { MATTE, SURFACE_A } from "./Frame";
import { prefersReducedMotion } from "./motion";

// The white sections below the hero as one sheet over the dark page. Scroll-driven:
//   in   as it rises out of the hero, it widens from a rounded card to cover the full page
//   out  as its end comes up, it narrows back to a rounded card and reveals the dark footer behind
// The shape is set straight on the element each frame (no React re-render). Reduced motion: full page, no shape.

const MAX_INSET = 7; // % of the width trimmed from each side at the start and end
const MAX_RADIUS = 40; // px

const ease = (t) => t * t * (3 - 2 * t);
const clamp = (t) => Math.min(1, Math.max(0, t));

export default function WhiteSheet({ children }) {
  const sheetRef = useRef(null);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el || prefersReducedMotion()) return undefined;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const pin = ease(clamp((vh - r.top) / (vh * 0.7))); // 0 when its top is at the bottom of the screen
      const pout = ease(clamp((vh - r.bottom) / (vh * 0.55))); // grows once its bottom rises above the screen's bottom
      const k = Math.max(1 - pin, pout);
      el.style.clipPath = `inset(0 ${(MAX_INSET * k).toFixed(2)}% round ${(MAX_RADIUS * k).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div style={{ background: SURFACE_A }}>
      <div ref={sheetRef} style={{ background: MATTE, clipPath: `inset(0 ${MAX_INSET}% round ${MAX_RADIUS}px)` }}>
        {children}
      </div>
    </div>
  );
}
