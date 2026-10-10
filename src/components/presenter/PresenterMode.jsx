import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { normalizeEmail, visibleCompanies } from "@/lib/ownership";
import { DEMO_PINS, DEMO_STEPS } from "@/lib/demoScript";
import { resolvePicks, resolveStep } from "@/lib/demoPicks";

// Presenter mode for the live demo. Off for every visitor: ?demo=1 (or
// Shift+D) turns it on for this browser tab, Esc or the close button turns it
// off. Steps and captions live in src/lib/demoScript.js. It only outlines real
// elements (data-demo="...") on the real screens; it shows no data of its own.

const FLAG_KEY = "ew-demo";
const STEP_KEY = "ew-demo-step";
const POLL_MS = 250;
const GIVE_UP_MS = 8000;
const RING_PAD = 6;

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readFlag() {
  return storage()?.getItem(FLAG_KEY) === "1";
}

function readStep() {
  const n = Number(storage()?.getItem(STEP_KEY));
  return Number.isInteger(n) && n >= 0 && n < DEMO_STEPS.length ? n : 0;
}

function saveFlag(on) {
  const s = storage();
  if (!s) return;
  try {
    if (on) s.setItem(FLAG_KEY, "1");
    else {
      s.removeItem(FLAG_KEY);
      s.removeItem(STEP_KEY);
    }
  } catch {
    // storage full or blocked: presenter mode still works for this page
  }
}

function saveStep(i) {
  try {
    storage()?.setItem(STEP_KEY, String(i));
  } catch {
    // ignore
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Keys typed into a field, or arrows used by a tab list, belong to that control.
function belongsToControl(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return true;
  return !!target.closest("[role='tablist'], [role='listbox'], [role='menu'], [role='slider']");
}

function dialogIsOpen() {
  return !!document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']");
}

function byDemoId(id) {
  if (!id) return null;
  const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  return document.querySelector(`[data-demo="${safe}"]`);
}

// Select a tab without moving focus away from the presenter. Radix tabs switch
// on mousedown; a plain click covers ordinary buttons.
function press(el) {
  if (el.getAttribute("data-state") === "active" || el.getAttribute("aria-selected") === "true") return;
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  el.click();
}

export default function PresenterMode() {
  const location = useLocation();
  const navigate = useNavigate();
  const { email, isAuthenticated, isLoadingAuth } = useAuth();
  const [on, setOn] = useState(readFlag);
  const [index, setIndex] = useState(readStep);
  const [picks, setPicks] = useState(null);
  const [rect, setRect] = useState(null);
  const [lookup, setLookup] = useState("searching"); // searching | found | missing
  const pathRef = useRef(location.pathname);

  const total = DEMO_STEPS.length;

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  const turnOn = useCallback(() => {
    saveFlag(true);
    setOn(true);
  }, []);

  const turnOff = useCallback(() => {
    saveFlag(false);
    setOn(false);
    setIndex(0);
    setRect(null);
  }, []);

  const go = useCallback(
    (delta) => {
      setIndex((i) => {
        const next = Math.min(total - 1, Math.max(0, i + delta));
        saveStep(next);
        return next;
      });
    },
    [total]
  );

  // ?demo=1 turns it on and ?demo=0 off, remembered for this browser tab.
  useEffect(() => {
    const param = new URLSearchParams(location.search).get("demo");
    if (param === "1") turnOn();
    else if (param === "0") turnOff();
  }, [location.search, turnOn, turnOff]);

  // Shift+D toggles; while on: Left/Right step, Esc leaves.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.defaultPrevented || belongsToControl(e.target)) return;
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (on) turnOff();
        else turnOn();
        return;
      }
      if (!on || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === "Escape" && !dialogIsOpen()) {
        turnOff();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [on, go, turnOn, turnOff]);

  // Pick the companies from the same loan book the visitor sees.
  useEffect(() => {
    if (!on || isLoadingAuth) return undefined;
    let active = true;
    const me = isAuthenticated ? normalizeEmail(email) : "";
    base44.entities.Borrower.filter(me ? { owner_email: me } : {}, { limit: 500, sort: "-created_date" })
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        if (active) setPicks(resolvePicks(visibleCompanies(items, me), DEMO_PINS));
      })
      .catch(() => {
        if (active) setPicks(resolvePicks([], DEMO_PINS));
      });
    return () => {
      active = false;
    };
  }, [on, isLoadingAuth, isAuthenticated, email]);

  const step = useMemo(() => (picks ? resolveStep(DEMO_STEPS[index], picks) : null), [index, picks]);

  // Open the step's page once when the step changes; the presenter can still
  // click around freely afterwards.
  useEffect(() => {
    if (!on || !step?.route) return;
    if (pathRef.current !== step.route) navigate(step.route);
  }, [on, step, navigate]);

  // Find the step's element, press its tab if needed, scroll it into view
  // once, and keep the ring on it while the page loads, scrolls or resizes.
  useEffect(() => {
    if (!on || !step) return undefined;
    let pressed = !step.press;
    let scrolled = false;
    let frame = 0;
    const started = Date.now();
    setLookup("searching");
    setRect(null);

    function track() {
      if (step.route && window.location.pathname !== step.route) return;
      if (!pressed) {
        const tab = byDemoId(step.press);
        if (tab) {
          press(tab);
          pressed = true;
        }
      }
      const el = pressed ? byDemoId(step.target) : null;
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setLookup("found");
      } else {
        setRect(null);
        setLookup(Date.now() - started > GIVE_UP_MS ? "missing" : "searching");
      }
    }

    function onScrollOrResize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(track);
    }

    track();
    const timer = window.setInterval(track, POLL_MS);
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [on, step]);

  // Keep the bottom of the page reachable above the bar.
  useEffect(() => {
    if (!on) return undefined;
    const before = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "72px";
    return () => {
      document.body.style.paddingBottom = before;
    };
  }, [on]);

  if (!on) return null;

  const note = step?.missingCompany
    ? "No matching company in the loan book yet. Screen one, or pin a name in demoScript.js."
    : lookup === "missing"
      ? "Not on this page yet. It may still be loading."
      : "";

  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-sm border-[3px] border-ew-focus motion-safe:transition-[top,left,width,height] motion-safe:duration-200"
          style={{
            top: rect.top - RING_PAD,
            left: rect.left - RING_PAD,
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
          }}
        />
      )}
      <div
        role="region"
        aria-label="Presenter mode"
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-ew-ink-soft bg-ew-ink text-white"
      >
        <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-6 py-2.5">
          <span className="shrink-0 text-xs tabular-nums text-white/70">
            Step {index + 1} of {total}
          </span>
          <p aria-live="polite" className="min-w-0 flex-1 text-sm leading-snug">
            {step ? step.caption : "Loading the loan book…"}
            {note && <span className="ml-2 text-white/70">{note}</span>}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-keyshortcuts="ArrowLeft"
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-white/30 px-2.5 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === total - 1}
              aria-keyshortcuts="ArrowRight"
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-white/30 px-2.5 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={turnOff}
              aria-label="Leave presenter mode"
              aria-keyshortcuts="Escape"
              className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
