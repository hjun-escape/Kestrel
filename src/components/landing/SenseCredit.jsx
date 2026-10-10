import React from "react";

// Credit for the user interviews: run with Sense AI (testwithsenseai.com). Their wordmark file is white, so it is
// drawn in dark ink with a filter to sit on the light background.
export default function SenseCredit({ className = "" }) {
  return (
    <a
      href="https://testwithsenseai.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-[12px] text-ew-muted hover:text-ew-ink ${className}`}
    >
      Tested with
      <img src="/brand/sense-logo-white.png" alt="Sense AI" className="h-[16px] w-auto opacity-85 [filter:brightness(0)]" loading="lazy" />
    </a>
  );
}
