import React from "react";
import { useLoop } from "./showScenes";

// The user quote that shaped the product: a white card on the ink surface. Words appear once, one by one.
const QUOTE = "I wish I woulda asked the cash flow documents a lot earlier in the process.";

export default function ProofStrip() {
  const words = QUOTE.split(" ");
  const [ref, step] = useLoop(words.length + 1, 140, { once: true });
  return (
    <section aria-labelledby="proof-heading" className="bg-ew-ink py-16 text-ew-ink">
      <div ref={ref} className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <figure className="grid gap-6 rounded-sm bg-white px-6 py-8 shadow-[0_18px_50px_rgba(0,0,0,0.4)] lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8" style={{ boxShadow: "inset 3px 0 0 #0ea5e9" }}>
          <div>
            <h2 id="proof-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0284c7]">
              What we heard
            </h2>
            <figcaption className="mt-2 text-[13px] text-ew-muted">Credit officer, user interview</figcaption>
          </div>
          <blockquote>
            <p className="font-heading text-[clamp(1.4rem,1.1rem+1.2vw,2rem)] font-semibold leading-snug">
              &ldquo;
              {words.map((w, i) => (
                <span key={i} className={`transition-opacity duration-300 ${i < step ? "opacity-100" : "opacity-20"}`}>
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              ))}
              &rdquo;
            </p>
            <p className="mt-3 font-mono text-[11.5px] text-ew-ink-soft">→ The cash-flow check is now part of the first screening.</p>
          </blockquote>
        </figure>
      </div>
    </section>
  );
}
