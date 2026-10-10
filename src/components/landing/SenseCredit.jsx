import React from "react";

// Credit for the user interviews: run with Sense AI (testwithsenseai.com). Their wordmark is white, so it sits
// on a small dark chip.
export default function SenseCredit({ className = "" }) {
  return (
    <a
      href="https://testwithsenseai.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-[12px] text-ew-muted hover:text-ew-ink ${className}`}
    >
      Tested with
      <span className="inline-flex items-center rounded-sm bg-[#0b1220] px-2 py-1">
        <img src="/brand/sense-logo-white.png" alt="Sense AI" className="h-[14px] w-auto" loading="lazy" />
      </span>
    </a>
  );
}
