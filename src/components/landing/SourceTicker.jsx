import React, { useEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";

// Under the hero buttons: the sources checked in parallel, and a count of items read for the
// sample applicant. The count is the illustrative sample file's, labelled as such.
const SOURCES = ["News", "Court filings", "Job posts", "Employee reviews", "LinkedIn"];
const SAMPLE_ITEMS = 1284;
const COUNT_MS = 5200;

export default function SourceTicker({ className = "" }) {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? SAMPLE_ITEMS : 0));
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setCount(Math.round(SAMPLE_ITEMS * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const cycle = setInterval(() => setActive((a) => (a + 1) % SOURCES.length), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(cycle);
    };
  }, []);

  return (
    <div className={`text-[13px] leading-relaxed text-white/60 ${className}`}>
      <p>
        <span className="text-white/45">Checked in parallel: </span>
        {SOURCES.map((src, i) => (
          <React.Fragment key={src}>
            {i > 0 && <span aria-hidden="true" className="px-1.5 text-white/25">·</span>}
            <span className={`transition-colors duration-500 ${i === active ? "text-white/95" : ""}`}>{src}</span>
          </React.Fragment>
        ))}
      </p>
      <p className="mt-0.5 tabular-nums text-white/45">
        <span className="text-white/75">{count.toLocaleString("en-US")}</span> items read for the sample file
      </p>
    </div>
  );
}
