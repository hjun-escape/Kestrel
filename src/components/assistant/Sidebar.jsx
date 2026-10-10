import React from "react";
import { Pin, Plus } from "lucide-react";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { statusKey } from "@/lib/borrowerUtils";
import { useAssistantPage } from "./AssistantContext";
import { relativeTime } from "./assistantData";

function SectionHeading({ id, children, aside }) {
  return (
    <div className="flex items-baseline justify-between px-4 pb-1.5 pt-4">
      <h2 id={id} className="text-xs font-semibold text-ew-muted">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function ConversationList({ conversations, activeId, loadError, onSelect, onNew }) {
  return (
    <nav aria-labelledby="chats-heading" className="flex min-h-0 flex-col">
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-sm bg-ew-ink text-sm font-semibold text-white hover:bg-ew-ink-soft"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New chat
        </button>
      </div>
      <SectionHeading id="chats-heading">Chats</SectionHeading>
      {loadError && <p className="px-4 pb-2 text-xs text-ew-red">{loadError}</p>}
      {conversations === null ? (
        <p className="px-4 pb-3 text-xs text-ew-muted">Loading chats</p>
      ) : conversations.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-ew-muted">Your chats are saved here after the first answer.</p>
      ) : (
        <ul className="max-h-[38vh] overflow-y-auto px-2 pb-2">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  aria-current={active ? "page" : undefined}
                  className={`block w-full rounded-sm px-2 py-1.5 text-left transition-colors ${
                    active ? "bg-ew-surface shadow-[inset_2px_0_0_var(--ew-ink)]" : "hover:bg-ew-surface/70"
                  }`}
                >
                  <span className={`block truncate text-[13px] ${active ? "font-semibold text-ew-ink" : "text-ew-ink-soft"}`}>
                    {c.title || "Untitled chat"}
                  </span>
                  <span className="block text-[11px] text-ew-muted">{relativeTime(c.updated_at || c.updated_date)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

export function PortfolioList() {
  const { companies, loadError, pinnedId, setPinned } = useAssistantPage();
  return (
    <section aria-labelledby="portfolio-heading" className="flex min-h-0 flex-1 flex-col border-t border-ew-rule">
      <SectionHeading
        id="portfolio-heading"
        aside={<span className="text-[11px] text-ew-muted">Select to pin</span>}
      >
        Portfolio
      </SectionHeading>
      {loadError && <p className="px-4 pb-2 text-xs text-ew-red">{loadError}</p>}
      {companies === null ? (
        <p className="px-4 text-xs text-ew-muted">Loading companies</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {companies.map((c) => {
            const key = statusKey(c);
            const pinned = c.id === pinnedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPinned(pinned ? null : c.id)}
                  aria-pressed={pinned}
                  className={`relative grid w-full grid-cols-[1fr,auto] items-baseline gap-x-2 rounded-sm py-1.5 pl-3 pr-2 text-left transition-colors ${
                    pinned ? "bg-ew-surface" : "hover:bg-ew-surface/70"
                  }`}
                >
                  <span aria-hidden="true" className={`absolute inset-y-1.5 left-0 w-[3px] rounded-[1px] ${STATUS_STYLES[key].rail}`} />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`truncate text-[13px] ${pinned ? "font-semibold text-ew-ink" : "text-ew-ink"}`}>{c.name}</span>
                    {pinned && <Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-ew-ink" />}
                  </span>
                  <span className={`text-[11px] font-semibold ${STATUS_STYLES[key].badge.split(" ").find((t) => t.startsWith("text-"))}`}>
                    {STATUS_STYLES[key].label}
                  </span>
                  <span className="text-[11px] capitalize text-ew-muted">
                    {c.stage}
                  </span>
                  <span className="text-right text-[11px] text-ew-muted">
                    {c.last_refreshed ? relativeTime(c.last_refreshed) : "never checked"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
