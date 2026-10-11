import React from "react";
import { ChevronRight } from "lucide-react";

// One section of the company report below the verdict. The heading is a disclosure button.
// Content stays mounted while collapsed (hidden), so child state such as an upload or an
// audit run survives closing and reopening.
export default function ReportSection({ id, title, summary, open, onToggle, demoId, children }) {
  const panelId = `${id}-panel`;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4 border-b border-ew-rule">
      <h2 id={`${id}-heading`} className="font-heading">
        <button
          type="button"
          data-demo={demoId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="group flex w-full items-baseline gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus"
        >
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 translate-y-0.5 text-ew-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
          <span className="text-lg font-bold tracking-tight text-ew-ink group-hover:underline group-hover:decoration-ew-rule group-hover:underline-offset-4">
            {title}
          </span>
          {summary && <span className="ml-auto hidden pl-3 text-right font-sans sm:inline text-xs font-normal text-ew-muted">{summary}</span>}
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="pb-6 pl-7">
        {children}
      </div>
    </section>
  );
}
