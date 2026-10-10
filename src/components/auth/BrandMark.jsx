import React from "react";

// A kestrel in a stoop: two swept wings meeting at a point, single color.
export default function BrandMark({ className = "w-6 h-6" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 6l8 3.5L12 20l2-10.5L22 6l-6.5 1.5L12 4 8.5 7.5z" fill="currentColor" />
    </svg>
  );
}
