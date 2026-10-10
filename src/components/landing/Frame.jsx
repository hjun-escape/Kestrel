import React from "react";

// The hero's framed-panel language, shared by the landing sections: a thin-bordered dark frame split into
// columns, each with a stage-style header (small number, bold title, muted caption), and an optional mono
// summary line along the bottom like the hero's activity log.

export function SectionHeader({ kicker, title, id, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{kicker}</p>
        <h2 id={id} className="mt-2 font-heading text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-bold leading-tight tracking-[-0.01em] text-white">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export function Frame({ columns, footer, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-sm border border-white/10 bg-black/15 ${className}`}>
      <ol className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {columns.map((c, i) => (
          <li key={c.title} className="flex flex-col">
            <div className="border-b border-white/10 px-5 pb-3 pt-4" style={{ boxShadow: `inset 0 2px 0 ${c.accent}` }}>
              <p className="text-[11px] font-semibold tracking-[0.14em]" style={{ color: c.accent }}>
                0{i + 1}
              </p>
              <h3 className="font-heading text-[17px] font-bold leading-tight text-white">{c.title}</h3>
              <p className="text-[12.5px] text-white/55">{c.caption}</p>
            </div>
            <div className="flex-1 p-5">{c.body}</div>
          </li>
        ))}
      </ol>
      {footer && (
        <p className="truncate border-t border-white/10 bg-black/20 px-5 py-2.5 font-mono text-[11.5px] text-white/60">{footer}</p>
      )}
    </div>
  );
}
