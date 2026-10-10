import React, { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useAssistantPage } from "./AssistantContext";
import { hostOf, placeCitations, safeHref } from "./assistantData";

const EMPTY = [];

export function CitationChip({ n, citation }) {
  const href = safeHref(citation?.source_url);
  const label = `Source ${n}: ${hostOf(citation?.source_url)}`;
  const box =
    "ml-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[3px] border px-1 align-middle font-mono text-[10.5px] font-semibold leading-none";
  if (!href) {
    return (
      <span className={`${box} border-ew-rule text-ew-muted`} title={label}>
        {n}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      title={citation.quote ? `${hostOf(href)}: “${citation.quote}”` : hostOf(href)}
      className={`${box} border-ew-ink/30 bg-ew-surface text-ew-ink no-underline transition-colors hover:border-ew-ink hover:bg-ew-ink hover:text-white`}
    >
      {n}
    </a>
  );
}

// Text part renderer: the answer split into paragraphs / list items, with
// numbered citation chips after the sentence block they support.
export function AnswerText({ text }) {
  const role = useAuiState((s) => s.message.role);
  const citations = useAuiState((s) => s.message.metadata?.custom?.citations) || EMPTY;
  const { byId } = useAssistantPage();
  const blocks = useMemo(() => placeCitations(text, citations, byId), [text, citations, byId]);

  if (role === "user") return <p className="whitespace-pre-wrap">{text}</p>;

  const out = [];
  let list = [];
  const flush = (key) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${key}`} className="my-2 list-disc space-y-1 pl-5 marker:text-ew-muted">
          {list}
        </ul>
      );
      list = [];
    }
  };
  blocks.forEach((b, i) => {
    const chips = b.cites.map((n) => <CitationChip key={n} n={n} citation={citations[n - 1]} />);
    if (b.kind === "li") {
      list.push(
        <li key={i}>
          {b.text}
          {chips}
        </li>
      );
      return;
    }
    flush(i);
    out.push(
      <p key={i} className="my-2 first:mt-0 last:mb-0">
        {b.text}
        {chips}
      </p>
    );
  });
  flush("end");
  return <div className="text-[15px] leading-relaxed text-ew-ink">{out}</div>;
}

// "Sources" footer: domain + quote for every citation, in chip order.
export function SourcesFooter({ data }) {
  const citations = data?.citations || EMPTY;
  if (!citations.length) return null;
  return (
    <section aria-label="Sources" className="mt-4 border-t border-ew-rule-soft pt-3">
      <h3 className="mb-1.5 text-xs font-semibold text-ew-muted">Sources</h3>
      <ol className="space-y-1.5">
        {citations.map((c, i) => {
          const href = safeHref(c.source_url);
          return (
            <li key={`${c.signal_id || c.source_url}-${i}`} className="flex gap-2 text-[13px] leading-snug">
              <span className="w-5 shrink-0 pt-px text-right font-mono text-[11px] font-semibold text-ew-muted">{i + 1}</span>
              <span className="min-w-0">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
                  >
                    {hostOf(href)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="font-medium text-ew-ink">{hostOf(c.source_url)}</span>
                )}
                {c.quote && <span className="text-ew-muted"> “{c.quote}”</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
