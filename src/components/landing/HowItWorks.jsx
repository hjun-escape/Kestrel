import React from "react";
import { FADE, Frame, SectionHeader, matteFromDark } from "./Frame";
import { CheckDemo, DecideDemo, RaceBars, ScreenDemo } from "./showScenes";

// How a check runs, in the hero's framed style: the race against reading by hand, then one sample
// applicant through Screen, Check and Decide, with a run summary along the bottom.
export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" data-ascii-fade-top={FADE} className="pb-20 text-ew-ink" style={matteFromDark}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <SectionHeader kicker="How a check runs" title="One applicant, end to end." id="how-heading" />
        <div className="mt-8 rounded-sm border border-ew-rule bg-white px-5 py-6 shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)]">
          <RaceBars />
        </div>
        <Frame
          className="mt-6"
          columns={[
            { title: "Screen", caption: "Name, website, city", accent: "#0284c7", body: <ScreenDemo /> },
            { title: "Check", caption: "Five sources, read in parallel", accent: "#9333ea", body: <CheckDemo /> },
            { title: "Decide", caption: "Fixed rules set the status. You make the call.", accent: "#0d9488", body: <DecideDemo /> },
          ]}
          footer="SAMPLE RUN · Northfield Battery Works · 63 items read · 3 verified · Red 95 · 1m 52s · AI never sets a status · every quote checked word for word"
        />
      </div>
    </section>
  );
}
