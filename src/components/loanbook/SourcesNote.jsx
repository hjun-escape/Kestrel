import React from "react";
import { SOURCES } from "@/lib/signalTypes";

// Subtle "Based on 3 of 4 sources" line, shown only when a check was partial.
export function sourcesUsed(borrower) {
  const missing = Array.isArray(borrower?.sources_unavailable) ? borrower.sources_unavailable.length : 0;
  return missing > 0 ? Math.max(SOURCES.length - missing, 0) : null;
}

export default function SourcesNote({ borrower }) {
  const used = sourcesUsed(borrower);
  if (used === null) return null;
  return (
    <span
      className="mt-1 block text-[11px] leading-tight text-ew-muted"
      title={`Not available this time: ${borrower.sources_unavailable.join(", ")}`}
    >
      Based on {used} of {SOURCES.length} sources
    </span>
  );
}
