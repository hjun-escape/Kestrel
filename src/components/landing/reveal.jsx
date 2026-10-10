import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

// Scroll choreography for the landing sections. Reduced motion: everything is simply shown.

/** True once the element has scrolled into view (fires once). */
export function useInViewOnce(threshold = 0.2) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (seen) return undefined;
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

const FROM = {
  up: "translate3d(0, 28px, 0) scale(0.98)",
  left: "translate3d(-56px, 0, 0)",
  right: "translate3d(56px, 0, 0)",
  down: "translate3d(0, -20px, 0)",
};

/** A piece that slides/pops into place the first time it is seen. `from`: up | left | right | down. */
export function Reveal({ from = "up", delay = 0, className = "", children, as: Tag = "div" }) {
  const [ref, seen] = useInViewOnce();
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : FROM[from],
        transition: `opacity 600ms ease-out ${delay}ms, transform 700ms cubic-bezier(.2,.8,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * 0..1 as the element scrolls through the viewport: 0 when its top reaches `start` (fraction of viewport
 * height from the top), 1 when its top reaches `end`. Reduced motion: always 1.
 */
export function useScrollProgress({ start = 0.85, end = 0.35 } = {}) {
  const ref = useRef(null);
  const [p, setP] = useState(() => (prefersReducedMotion() ? 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const h = window.innerHeight;
      const t = (h * start - top) / (h * (start - end));
      setP(Math.min(1, Math.max(0, t)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [start, end]);
  return [ref, p];
}

/**
 * A band where one colour grows in from the centre over another as it scrolls into view: `grow` fills `base`.
 * Used to open the white sections out of the dark hero, and to close them back into the dark footer.
 * `edge`: which edge the growing shape is anchored to ("bottom" grows upward into the content below,
 * "top" grows down from the content above).
 */
export function GrowBand({ base, grow, height = 150, edge = "bottom", start = 1, end = 0.55 }) {
  const [ref, p] = useScrollProgress({ start, end });
  const side = 46 * (1 - p);
  const lift = 60 * (1 - p); // % of the band left uncovered on the far side
  const r = 36 * (1 - p);
  const clip =
    edge === "bottom"
      ? `inset(${lift}% ${side}% 0 ${side}% round ${r}px ${r}px 0 0)`
      : `inset(0 ${side}% ${lift}% ${side}% round 0 0 ${r}px ${r}px)`;
  return (
    <div ref={ref} aria-hidden="true" className="relative" style={{ height, background: base }}>
      <div className="absolute inset-0" style={{ background: grow, clipPath: clip }} />
    </div>
  );
}
