import React from "react";
import { MousePointer2 } from "lucide-react";
import { Frame, SectionHeader } from "./Frame";
import { DecideRulesDemo, LeadTimeline, ReadDemo, useLoop } from "./showScenes";

// How Kestrel earns trust, in the hero's framed style: the AI only highlights, fixed rules set the status,
// a person decides. Then the lead time over the quarterly financials, with real dates.

function ApproveDemo() {
  const [ref, step] = useLoop(6, 700);
  const clicked = step >= 3;
  return (
    <div ref={ref} className="relative rounded-sm border border-ew-rule bg-white p-4 text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <p className="flex justify-between text-[12px] font-semibold text-ew-muted">
        Northfield Battery Works <span className="text-ew-red">Red 95</span>
      </p>
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
      <p className={`mt-3 font-mono text-[11px] text-ew-muted transition-opacity duration-300 ${clicked ? "opacity-100" : "opacity-0"}`}>
        Decision recorded with 3 sourced flags
      </p>
      <MousePointer2
        aria-hidden="true"
        className="pointer-events-none absolute h-5 w-5 fill-white text-ew-ink transition-all duration-700 ease-out"
        style={step >= 2 ? { left: "55%", top: "96px", transform: clicked ? "scale(0.85)" : "scale(1)" } : { left: "85%", top: "12px" }}
      />
    </div>
  );
}

export default function TrustPrinciples() {
  return (
    <section aria-labelledby="trust-heading" className="bg-ew-ink py-20 text-white sm:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeader kicker="How Kestrel earns trust" title="AI reads. Rules decide. You approve." id="trust-heading" />
        <Frame
          className="mt-8"
          columns={[
            { title: "AI reads", caption: "Copies the exact sentence, nothing more", accent: "#38bdf8", body: <ReadDemo /> },
            { title: "Rules decide", caption: "Fixed thresholds, last 90 days", accent: "#c084fc", body: <DecideRulesDemo /> },
            { title: "You approve", caption: "The decision stays with you", accent: "#2dd4bf", body: <ApproveDemo /> },
          ]}
          footer="AI never sets a status · every flag links to its source · quotes are checked word for word"
        />

        <div className="mt-6 rounded-sm border border-white/10 bg-black/15">
          <div className="border-b border-white/10 px-5 pb-3 pt-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45">LEAD TIME</p>
            <h3 className="font-heading text-[17px] font-bold leading-tight">Before the quarterly financials</h3>
            <p className="text-[12.5px] text-white/55">Northfield Battery Works, sample</p>
          </div>
          <div className="px-8 pb-10 pt-6">
            <LeadTimeline />
          </div>
        </div>
      </div>
    </section>
  );
}
