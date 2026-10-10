import React from "react";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { parseSignalDate } from "@/lib/borrowerUtils";

// Signal timeline, newest first.
// Each item: date, type label, severity (Strong/Weak), title, snippet (in
// quotes), a source link (new tab), and a "What to ask" line.
export default function SignalTimeline({ signals, neverRefreshed }) {
  if (!signals || signals.length === 0) {
    return (
      <p className="py-6 text-sm text-gray-500">
        {neverRefreshed ? "Not checked yet." : "No signals in the last 90 days."}
      </p>
    );
  }

  const sorted = [...signals].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="relative">
      {sorted.map((s, i) => {
        const type = SIGNAL_TYPES[s.type] || { label: s.type, whatToAsk: "" };
        const isStrong = s.severity === "strong";
        return (
          <div key={s.id || i} className="relative flex gap-4 pb-6 last:pb-0">
            {i < sorted.length - 1 && (
              <div className="absolute left-[5px] top-5 bottom-0 w-px bg-gray-200" />
            )}
            <div
              className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${
                isStrong ? "bg-gray-800" : "bg-gray-300"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-gray-900">
                  {format(parseSignalDate(s.date), "MMM d, yyyy")}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-700">{type.label}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-xs ${
                    isStrong
                      ? "border-gray-300 bg-gray-50 text-gray-700"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  {isStrong ? "Strong" : "Weak"}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-gray-900">{s.title}</p>
              <p className="mt-1 text-sm text-gray-600">&ldquo;{s.snippet}&rdquo;</p>
              <a
                href={s.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
              >
                {s.source_name}
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="mt-2 rounded border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500">
                <span className="font-medium text-gray-600">What to ask: </span>
                {type.whatToAsk}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}