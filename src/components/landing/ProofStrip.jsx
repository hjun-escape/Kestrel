import React from "react";
import { SectionHeader, matte } from "./Frame";
import { Reveal } from "./reveal";
import SenseCredit from "./SenseCredit";
import { VOICES, VoiceCard } from "./Voices";

// What testers said (Sense AI user tests), each with what we changed. Pieces slide in as it scrolls into view.
export default function ProofStrip() {
  return (
    <section aria-labelledby="heard-heading" className="overflow-hidden py-14 text-ew-ink" style={matte}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <Reveal from="left" className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader kicker="What we heard" title="Two testers, in their words." id="heard-heading" />
          <SenseCredit />
        </Reveal>
        <div className="mt-8 grid gap-x-10 gap-y-7 lg:grid-cols-2">
          {VOICES.map((v, i) => (
            <Reveal key={v.quote} from={i % 2 ? "right" : "left"} delay={120 + i * 120}>
              <VoiceCard voice={v} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
