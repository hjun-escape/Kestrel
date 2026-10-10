import React from "react";
import { CornerDownRight, UserRound } from "lucide-react";
import { SURFACE_A } from "./Frame";
import { useLoop } from "./showScenes";

// The user quote that shaped the product, said by a person: avatar, name, and a speech bubble.
// Solid white section that eases in and out of the dark sections around it. Words appear once, one by one.
const QUOTE = "I wish I woulda asked the cash flow documents a lot earlier in the process.";

// Several stops so the dark-to-white fade is smooth rather than a flat grey band.
const FADE = 160;
const fade = (dir) =>
  `linear-gradient(to ${dir}, ${SURFACE_A} 0, rgba(20,32,46,0.82) ${FADE * 0.2}px, rgba(20,32,46,0.5) ${FADE * 0.45}px, rgba(20,32,46,0.2) ${FADE * 0.7}px, rgba(20,32,46,0) ${FADE}px)`;

export default function ProofStrip() {
  const words = QUOTE.split(" ");
  const [ref, step] = useLoop(words.length + 1, 140, { once: true });
  return (
    <section
      aria-labelledby="proof-heading"
      className="relative bg-white text-ew-ink"
      style={{ backgroundImage: `${fade("bottom")}, ${fade("top")}`, paddingTop: FADE + 24, paddingBottom: FADE + 24 }}
    >
      <div ref={ref} className="mx-auto max-w-[980px] px-4 sm:px-8">
        <h2 id="proof-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0284c7]">
          What we heard
        </h2>

        <figure className="mt-5 flex items-start gap-4 sm:gap-5">
          {/* The person saying it. */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e0f2fe] ring-4 ring-[#38bdf8]/40">
              <UserRound aria-hidden="true" className="h-7 w-7 text-[#0369a1]" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <figcaption className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[15px] font-semibold">Credit officer</span>
              <span className="text-[13px] text-ew-muted">User interview</span>
            </figcaption>

            {/* Speech bubble, tail pointing back at the avatar. */}
            <blockquote className="relative mt-2 rounded-2xl rounded-tl-sm border border-[#d6e6f0] bg-[#f4f9fc] px-6 py-5 shadow-[0_14px_40px_-26px_rgba(20,32,46,0.45)]">
              <span
                aria-hidden="true"
                className="absolute -left-[9px] top-3 h-4 w-4 rotate-45 border-b border-l border-[#d6e6f0] bg-[#f4f9fc]"
              />
              <p className="relative font-heading text-[clamp(1.35rem,1.05rem+1.2vw,2rem)] font-semibold leading-snug">
                {words.map((w, i) => (
                  <span key={i} className={`transition-opacity duration-300 ${i < step ? "opacity-100" : "opacity-20"}`}>
                    {w}
                    {i < words.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            </blockquote>

            <p className="mt-4 flex items-center gap-2 text-[14px] text-ew-ink-soft">
              <CornerDownRight aria-hidden="true" className="h-4 w-4 text-[#0284c7]" />
              So the cash-flow check is now part of the first screening.
            </p>
          </div>
        </figure>
      </div>
    </section>
  );
}
