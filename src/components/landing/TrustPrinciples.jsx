import React from "react";
import { SectionHeader, matteIntoDark } from "./Frame";
import { LeadTimeline } from "./showScenes";

// Lead time: the one thing the earlier sections don't show. Flags land weeks before the quarterly financials.
// (How Kestrel decides is covered by the hero pipeline and "How a check runs", so it is not repeated here.)
export default function TrustPrinciples() {
  return (
    <section aria-labelledby="lead-heading" className="pt-4 text-ew-ink" style={matteIntoDark}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeader kicker="Lead time" title="Flags land before the quarterly financials." id="lead-heading" />
        <div className="mt-8 rounded-sm border border-ew-rule bg-white shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)]">
          <div className="border-b border-ew-rule px-5 pb-3 pt-4">
            <h3 className="font-heading text-[17px] font-bold leading-tight">Northfield Battery Works</h3>
            <p className="text-[12.5px] text-ew-muted">Sample applicant, Jul to Nov 2026</p>
          </div>
          <div className="px-8 pb-12 pt-8">
            <LeadTimeline />
          </div>
          <p className="truncate border-t border-ew-rule bg-white px-5 py-2.5 font-mono text-[11.5px] text-ew-ink-soft">
            Private companies report 45 to 90 days after quarter end · public signals show up first
          </p>
        </div>
      </div>
    </section>
  );
}
