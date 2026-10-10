import React from "react";

// One chip per source (News, Legal, Jobs, Reviews).
// "Checked" if last_refreshed is set and the source isn't in sources_unavailable.
// "Unavailable" if it is in sources_unavailable.
// "Not checked yet" if last_refreshed is empty.
export default function SourceChip({ source, lastRefreshed, sourcesUnavailable }) {
  const unavailable = (sourcesUnavailable || []).includes(source);

  let state;
  let stateClass;
  if (!lastRefreshed) {
    state = "Not checked yet";
    stateClass = "border-gray-200 bg-gray-50 text-gray-400";
  } else if (unavailable) {
    state = "Unavailable";
    stateClass = "border-gray-300 bg-gray-100 text-gray-500";
  } else {
    state = "Checked";
    stateClass = "border-gray-300 bg-white text-gray-600";
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs ${stateClass}`}
    >
      <span className="font-medium text-gray-800">{source}</span>
      <span className="text-gray-300">·</span>
      <span>{state}</span>
    </span>
  );
}