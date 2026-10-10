import React from "react";
import { useLoop } from "./showScenes";

// The user quote that shaped the product. Words appear one by one when it scrolls into view.
const QUOTE = "I wish I woulda asked the cash flow documents a lot earlier in the process.";

export default function ProofStrip() {
  const words = QUOTE.split(" ");
  const [ref, step] = useLoop(words.length + 1, 140, { once: true });
  const shown = Math.min(words.length, step);
  return (
    <section aria-labelledby="proof-heading" className="border-y border-white/10 bg-[#0f1a27] py-20 text-white sm:py-24">
      <div ref={ref} className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <h2 id="proof-heading" className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#38bdf8]">
          What we heard
        </h2>
        <figure className="mt-6">
          <blockquote>
            <p className="max-w-[24ch] font-heading text-[clamp(2.2rem,1.4rem+3.4vw,4.2rem)] font-semibold leading-[1.04] tracking-[-0.015em] [font-stretch:85%]">
              <span aria-hidden="true" className="text-[#38bdf8]">&ldquo;</span>
              {words.map((w, i) => (
                <span key={i} className={`transition-opacity duration-300 ${i < shown ? "opacity-100" : "opacity-15"}`}>
                  {w}{" "}
                </span>
              ))}
              <span aria-hidden="true" className="text-[#38bdf8]">&rdquo;</span>
            </p>
          </blockquote>
          <figcaption className="mt-6 text-[15px] font-medium text-white/65">Credit officer, user interview</figcaption>
        </figure>
      </div>
    </section>
  );
}
