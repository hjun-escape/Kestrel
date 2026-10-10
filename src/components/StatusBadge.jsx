import React from "react";

// Status badge: colour AND a text label, plus a shape glyph so the three
// states differ without colour. Grey "Not checked" until the first refresh.
export const STATUS_STYLES = {
  red: {
    label: "Red",
    badge: "border-ew-red-rule bg-ew-red-bg text-ew-red",
    rail: "bg-ew-red",
    glyph: "h-2 w-2 bg-ew-red",
  },
  yellow: {
    label: "Yellow",
    badge: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber",
    rail: "bg-[#d68a1c]",
    glyph: "h-2 w-2 rotate-45 bg-ew-amber",
  },
  green: {
    label: "Green",
    badge: "border-ew-green-rule bg-ew-green-bg text-ew-green",
    rail: "bg-ew-green",
    glyph: "h-2 w-2 rounded-full bg-ew-green",
  },
  not_checked: {
    label: "Not checked",
    badge: "border-ew-rule bg-ew-none-bg text-ew-none",
    rail: "bg-ew-rule",
    glyph: "h-2 w-2 rounded-full border border-ew-none",
  },
};

export default function StatusBadge({ status, lastRefreshed, size = "sm" }) {
  const key = !lastRefreshed ? "not_checked" : STATUS_STYLES[status] ? status : "not_checked";
  const style = STATUS_STYLES[key];
  const sizing =
    size === "lg"
      ? "gap-2 px-2.5 py-1 text-sm"
      : "gap-1.5 px-1.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border font-semibold ${sizing} ${style.badge}`}
    >
      <span aria-hidden="true" className={`inline-block shrink-0 ${style.glyph}`} />
      {style.label}
    </span>
  );
}
