import React from "react";

// A rising line crossing a fixed threshold: the product in one glyph.
export default function BrandMark({ className = "w-6 h-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 15.5h22" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      <path d="M4.5 18.5l4-4 3 2 4.5-7 3.5 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
