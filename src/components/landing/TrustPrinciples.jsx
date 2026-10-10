import React from "react";
import { SectionHeader } from "./Frame";
import { LeadTimeline } from "./showScenes";

// Lead time: the one thing the earlier sections don't show. Flags land weeks before the quarterly financials.
// (How Kestrel decides is covered by the hero pipeline and "How a check runs", so it is not repeated here.)
export default function TrustPrinciples() {
  return (
    <section
      aria-labelledby="lead-heading"
      className="bg-[#141634] pb-20 pt-16 text-white sm:pb-24"
      // Deep indigo with a teal glow behind the timeline: a different colour from the sections above.
      style={{
        backgroundImage:
          "radial-gradient(900px 380px at 50% 100%, rgba(45,212,191,0.14), transparent 70%), radial-gradient(700px 320px at 0% 0%, rgba(129,140,248,0.16), transparent 70%)",
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeader kicker="Lead time" title="Flags land before the quarterly financials." id="lead-heading" />
        <div className="mt-8 rounded-sm border border-white/10 bg-black/15">
          <div className="border-b border-white/10 px-5 pb-3 pt-4">
            <h3 className="font-heading text-[17px] font-bold leading-tight">Northfield Battery Works</h3>
            <p className="text-[12.5px] text-white/55">Sample applicant, Jul to Nov 2026</p>
          </div>
          <div className="px-8 pb-12 pt-8">
            <LeadTimeline />
          </div>
          <p className="truncate border-t border-white/10 bg-black/20 px-5 py-2.5 font-mono text-[11.5px] text-white/60">
            Private companies report 45 to 90 days after quarter end · public signals show up first
          </p>
        </div>
      </div>
    </section>
  );
}
