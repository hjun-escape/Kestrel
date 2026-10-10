import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";
import { FLAGS, STATUS_AFTER_FLAG, WHY_LINES } from "./heroData";

/**
 * Runs a caScenes scene on a canvas: sizes it to the element (sharp on retina), steps it at `fps`,
 * pauses off screen and in background tabs. With reduced motion it runs `warmup` steps once and
 * shows that still frame.
 */
export function useCanvasScene(makeScene, { fps = 15, warmup = 160 } = {}) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const makeRef = useRef(makeScene);
  makeRef.current = makeScene;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const scene = makeRef.current();
    sceneRef.current = scene;
    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.resize(w, h);
      if (reduced) {
        const t = performance.now();
        for (let i = 0; i < warmup; i++) scene.frame(ctx, t + i * (1000 / fps), w, h, true);
      } else {
        scene.frame(ctx, performance.now(), w, h, false);
      }
    };
    const step = (now) => {
      raf = requestAnimationFrame(step);
      if (!visible || now - last < 1000 / fps) return;
      last = now;
      scene.frame(ctx, now, w, h, true);
    };

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
  }, [fps, warmup]);

  return { canvasRef, sceneRef };
}

/**
 * The sample credit file filling in: each signal from the automaton lands the next flag
 * (CFO departure, WARN notice, late payments) and moves the status by the app's real rules.
 * After the last flag it holds, then starts over for the next applicant.
 */
export function useFlagProgress({ holdMs = 4500 } = {}) {
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const holdRef = useRef(null);

  useEffect(() => () => clearTimeout(holdRef.current), []);

  const onSignal = () => {
    if (holdRef.current || stepRef.current >= FLAGS.length) return;
    stepRef.current += 1;
    setStep(stepRef.current);
    if (stepRef.current >= FLAGS.length) {
      holdRef.current = setTimeout(() => {
        holdRef.current = null;
        stepRef.current = 0;
        setStep(0);
      }, holdMs);
    }
  };

  return {
    step,
    flags: FLAGS.slice(0, step),
    status: STATUS_AFTER_FLAG[step],
    why: WHY_LINES[step],
    onSignal,
  };
}
