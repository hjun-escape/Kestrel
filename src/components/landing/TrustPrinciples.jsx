import React from "react";
import { DecideRulesDemo, LeadTimeline, ReadDemo } from "./showScenes";
import { useLoop } from "./showScenes";
import { MousePointer2 } from "lucide-react";

// How Kestrel earns trust, shown: the AI only highlights, fixed rules set the status, a person decides.
// Then the payoff: flags land weeks before the quarterly financials.

function ApproveDemo() {
  const [ref, step] = useLoop(6, 700);
  const clicked = step >= 3;
  return (
    <div ref={ref} className="relative rounded-sm border border-ew-rule bg-white p-4 text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <p className="text-[12px] font-semibold text-ew-muted">Northfield Battery Works</p>
      <div className="mt-3 grid gap-2">
        {["Approve", "Request documents", "Decline"].map((c) => (
          <span
            key={c}
            className={`rounded-sm border px-3 py-2 text-[13px] font-semibold transition-all duration-200 ${
              clicked && c === "Request documents" ? "border-ew-ink bg-ew-ink text-white" : "border-ew-rule"
            }`}
          >
            {clicked && c === "Request documents" ? "✓ Documents requested" : c}
          </span>
        ))}
      </div>
      <MousePointer2
        aria-hidden="true"
        className="pointer-events-none absolute h-5 w-5 fill-white text-ew-ink transition-all duration-700 ease-out"
        style={step >= 2 ? { left: "55%", top: "96px", transform: clicked ? "scale(0.85)" : "scale(1)" } : { left: "85%", top: "12px" }}
      />
    </div>
  );
}

const PILLARS = [
  { title: "AI reads.", Demo: ReadDemo, accent: "#38bdf8" },
  { title: "Rules decide.", Demo: DecideRulesDemo, accent: "#c084fc" },
  { title: "You approve.", Demo: ApproveDemo, accent: "#2dd4bf" },
];

export default function TrustPrinciples() {
  return (
    <section aria-labelledby="trust-heading" className="bg-ew-ink py-20 text-white sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <h2 id="trust-heading" className="sr-only">
          How Kestrel earns trust
        </h2>
        <ol className="grid gap-6 lg:grid-cols-3">
          {PILLARS.map(({ title, Demo, accent }) => (
            <li key={title}>
              <h3 className="mb-4 font-heading text-[clamp(1.8rem,1.3rem+1.6vw,2.6rem)] font-bold leading-none" style={{ color: accent }}>
                {title}
              </h3>
              <Demo />
            </li>
          ))}
        </ol>

        <div className="mt-20 grid items-center gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <h3 className="font-heading text-[clamp(2rem,1.4rem+2.4vw,3.4rem)] font-bold leading-[1] tracking-[-0.02em] [font-stretch:78%]">
            Before the quarterly financials.
          </h3>
          <LeadTimeline />
        </div>
      </div>
    </section>
  );
}
