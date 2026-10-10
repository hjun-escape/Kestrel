import React from "react";

// Status badge — muted red / amber / green, always with a text label.
// If last_refreshed is empty, shows a grey "Not checked" badge instead.
export default function StatusBadge({ status, lastRefreshed }) {
  if (!lastRefreshed) {
    return (
      <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        Not checked
      </span>
    );
  }

  const config = {
    red: "border-red-200 bg-red-50 text-red-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  const label = { red: "Red", yellow: "Yellow", green: "Green" }[status] || status;

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
        config[status] || "border-gray-200 bg-gray-50 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}