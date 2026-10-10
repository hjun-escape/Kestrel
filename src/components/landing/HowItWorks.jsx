import React from "react";
import { Frame, SectionHeader, matte } from "./Frame";
import { CheckDemo, DecideDemo, RaceBars, ScreenDemo } from "./showScenes";
import { Reveal } from "./reveal";

// How a check runs, in the hero's framed style: the race against reading by hand, then one sample
// applicant through Screen, Check and Decide, with a run summary along the bottom.
export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="pb-16 pt-24 text-ew-ink" style={matte}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <Reveal from="left">
          <SectionHeader kicker="How a check runs" title="One applicant, end to end." id="how-heading" />
        </Reveal>
        <Reveal from="right" delay={120} className="mt-8 rounded-sm border border-ew-rule bg-white px-5 py-6 shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)]">
          <RaceBars />
        </Reveal>
        <Reveal delay={240}>
        <Frame
          className="mt-6"
          columns={[
            { title: "Screen", caption: "Name, website, city", accent: "#0284c7", body: <ScreenDemo /> },
            { title: "Check", caption: "Five sources, read in parallel", accent: "#9333ea", body: <CheckDemo /> },
            { title: "Decide", caption: "Fixed rules set the status. You make the call.", accent: "#0d9488", body: <DecideDemo /> },
          ]}
          footer="SAMPLE RUN · Northfield Battery Works · 63 items read · 3 verified · Red 95 · 1m 52s · AI never sets a status · every quote checked word for word"
        />
        </Reveal>
      </div>
    </section>
  );
}
