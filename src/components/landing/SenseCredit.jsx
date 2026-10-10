import React from "react";

// Credit for the user interviews: run with Sense AI (testwithsenseai.com). Their colored block mark (their site's
// favicon) next to the name, so it keeps their colors on the light background.
export default function SenseCredit({ className = "" }) {
  return (
    <a
      href="https://testwithsenseai.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-[12px] text-ew-muted hover:text-ew-ink ${className}`}
    >
      Tested with
      <img src="/brand/sense-mark.png" alt="" aria-hidden="true" className="h-4 w-4" loading="lazy" />
      <span className="font-semibold text-ew-ink">Sense AI</span>
    </a>
  );
}
