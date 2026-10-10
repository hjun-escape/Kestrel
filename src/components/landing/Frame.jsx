import React from "react";

// Below the hero every section sits on one soft matte off-white sheet (WhiteSheet.jsx) that widens out of the
// dark hero and narrows back to reveal the dark footer.
export const SURFACE_A = "#14202e"; // the hero's ink (--ew-ink)
export const MATTE = "#eceeea";
export const matte = { backgroundColor: MATTE };

// The hero's framed-panel language, in light: a thin-bordered white frame split into
// columns, each with a stage-style header (small number, bold title, muted caption), and an optional mono
// summary line along the bottom like the hero's activity log.

export function SectionHeader({ kicker, title, id, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ew-muted">{kicker}</p>
        <h2 id={id} className="mt-2 font-heading text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-bold leading-tight tracking-[-0.01em] text-ew-ink">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function Frame({ columns, footer, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-sm border border-ew-rule bg-white shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)] ${className}`}>
      <ol className="grid divide-y divide-ew-rule lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {columns.map((c, i) => (
          <li key={c.title} className="flex flex-col">
            <div className="border-b border-ew-rule px-5 pb-3 pt-4" style={{ boxShadow: `inset 0 3px 0 ${c.accent}` }}>
              <p className="text-[11px] font-semibold tracking-[0.14em]" style={{ color: c.accent }}>
                0{i + 1}
              </p>
              <h3 className="font-heading text-[17px] font-bold leading-tight text-ew-ink">{c.title}</h3>
              <p className="text-[12.5px] text-ew-muted">{c.caption}</p>
            </div>
            <div className="flex-1 bg-[#fafbfa] p-5">{c.body}</div>
          </li>
        ))}
      </ol>
      {footer && (
        <p className="truncate border-t border-ew-rule bg-white px-5 py-2.5 font-mono text-[11.5px] text-ew-ink-soft">{footer}</p>
      )}
    </div>
  );
}
