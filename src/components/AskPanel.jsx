import React, { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";

// "Ask Early Warning": a slide-over chat scoped to the loan book.
// Answers come from askPortfolio, which only reads data. Anything that would
// change data (screen, refresh, deep check) comes back as a pending action;
// it runs only when the user clicks Confirm, through confirmAction.
// Mount: <AskPanel open={open} onOpenChange={setOpen} />

const SUGGESTIONS = [
  { label: "Which borrowers turned red this month?", send: true },
  { label: "Screen a new applicant…", send: false, draft: "Screen a new applicant: name, website domain, loan amount " },
  { label: "What's our exposure at risk?", send: true },
];

const KIND_LABEL = {
  screen: "Screen new applicant",
  refresh: "Refresh company",
  deep_check: "Analyst deep check",
};

const PARAM_LABEL = {
  name: "Company",
  website_domain: "Website",
  hq_city: "HQ city",
  hq_state: "HQ state",
  industry: "Industry",
  loan_amount_usd: "Loan (USD)",
  question: "Question",
};

let nextId = 0;
const newId = () => `m${Date.now()}_${nextId++}`;

function errorText(e, fallback) {
  return e?.response?.data?.error || fallback;
}

// Only http(s) links are rendered; anything else is shown as plain text.
function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatParam(key, value) {
  if (key === "loan_amount_usd" && typeof value === "number") {
    return `$${value.toLocaleString("en-US")}`;
  }
  return String(value);
}

function confirmedText(action, data) {
  if (action.kind === "screen") {
    const name = data?.borrower?.name || action.params.name;
    return data?.refresh?.ok
      ? `${name} was added as an applicant and checked.`
      : `${name} was added as an applicant. First check did not finish: ${data?.refresh?.error || "unknown error"}`;
  }
  if (action.kind === "refresh") return "Check finished. Reopen the company to see the latest signals.";
  return "Deep check requested.";
}

function Citations({ citations }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Sources</p>
      <ul className="mt-1 space-y-1.5">
        {citations.map((c, i) => (
          <li key={`${c.signal_id || c.source_url}-${i}`} className="text-xs leading-snug">
            {safeHref(c.source_url) ? (
              <a
                href={safeHref(c.source_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-800 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                {hostOf(c.source_url)}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="font-medium text-gray-800">{hostOf(c.source_url)}</span>
            )}
            {c.quote && <span className="ml-1 text-gray-500">“{c.quote}”</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionCard({ action, state, onConfirm, onCancel }) {
  const status = state?.status || "pending";
  const busy = status === "running";
  const settled = status === "done" || status === "cancelled";
  return (
    <section
      aria-label={KIND_LABEL[action.kind] || "Proposed action"}
      className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">
          {KIND_LABEL[action.kind] || action.kind}
        </p>
        <p className="text-[11px] text-gray-500">
          {status === "pending" && "Needs your confirmation"}
          {status === "running" && "Running…"}
          {status === "done" && "Confirmed"}
          {status === "cancelled" && "Cancelled"}
          {status === "error" && "Failed"}
        </p>
      </div>
      <p className="mt-1 text-sm text-gray-900">{action.summary}</p>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
        {Object.entries(action.params || {})
          .filter(([key]) => key !== "id")
          .map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="text-gray-500">{PARAM_LABEL[key] || key}</dt>
              <dd className="text-gray-800 break-words">{formatParam(key, value)}</dd>
            </React.Fragment>
          ))}
      </dl>
      {state?.message && (
        <p className={`mt-2 text-xs ${status === "error" ? "text-red-700" : "text-gray-700"}`}>{state.message}</p>
      )}
      {!settled && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : status === "error" ? "Try again" : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}

function Message({ message, actionStates, onConfirm, onCancel }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-md bg-gray-900 px-3 py-2 text-sm text-white whitespace-pre-wrap">
          <span className="sr-only">You: </span>
          {message.content}
        </div>
      </li>
    );
  }
  return (
    <li className="max-w-[95%]">
      <div
        className={`rounded-md border px-3 py-2 text-sm whitespace-pre-wrap ${
          message.error ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-white text-gray-900"
        }`}
      >
        <span className="sr-only">Early Warning: </span>
        {message.content}
        <Citations citations={message.citations} />
      </div>
      {(message.pending_actions || []).map((action) => (
        <ActionCard
          key={action.action_id}
          action={action}
          state={actionStates[action.action_id]}
          onConfirm={() => onConfirm(action)}
          onCancel={() => onCancel(action)}
        />
      ))}
    </li>
  );
}

export default function AskPanel({ open, onOpenChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [actionStates, setActionStates] = useState({});
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, actionStates]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function setActionState(id, next) {
    setActionStates((prev) => ({ ...prev, [id]: next }));
  }

  async function send(text) {
    const content = text.trim();
    if (!content || sending) return;
    const userMessage = { id: newId(), role: "user", content };
    const history = [...messages, userMessage]
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setAnnouncement("Looking through the loan book…");
    try {
      const res = await base44.functions.invoke("askPortfolio", { messages: history });
      const data = res?.data || {};
      const reply = {
        id: newId(),
        role: "assistant",
        content: data.answer || "No answer was returned.",
        citations: data.citations || [],
        pending_actions: data.pending_actions || [],
      };
      setMessages((prev) => [...prev, reply]);
      const actionsNote = reply.pending_actions.length
        ? ` ${reply.pending_actions.length} action${reply.pending_actions.length > 1 ? "s" : ""} need your confirmation.`
        : "";
      setAnnouncement(`${reply.content}${actionsNote}`);
    } catch (e) {
      const message = errorText(e, "Ask Early Warning is unavailable right now. Try again in a minute.");
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: message, error: true }]);
      setAnnouncement(message);
    } finally {
      setSending(false);
      focusInput();
    }
  }

  async function confirm(action) {
    setActionState(action.action_id, { status: "running" });
    try {
      const res = await base44.functions.invoke("confirmAction", { action });
      const message = confirmedText(action, res?.data);
      setActionState(action.action_id, { status: "done", message });
      setAnnouncement(message);
    } catch (e) {
      const message = errorText(e, "The action could not be completed.");
      setActionState(action.action_id, { status: "error", message });
      setAnnouncement(message);
    }
  }

  function cancel(action) {
    setActionState(action.action_id, { status: "cancelled", message: "Nothing was changed." });
    setAnnouncement("Action cancelled. Nothing was changed.");
    focusInput();
  }

  function pickSuggestion(s) {
    if (s.send) {
      send(s.label);
      return;
    }
    setInput(s.draft);
    focusInput();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b border-gray-200 px-5 py-4 text-left">
          <SheetTitle className="text-base font-semibold text-gray-900">Ask Early Warning</SheetTitle>
          <SheetDescription className="text-xs text-gray-500">
            Answers use only your loan book and its cited sources. Nothing changes until you confirm it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-gray-50/60 px-5 py-4" aria-busy={sending}>
          {messages.length === 0 ? (
            <div>
              <p className="text-sm text-gray-600">Ask about status, signals, sources or exposure. For example:</p>
              <ul className="mt-3 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      disabled={sending}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="space-y-4" aria-label="Conversation">
              {messages.map((m) => (
                <Message
                  key={m.id}
                  message={m}
                  actionStates={actionStates}
                  onConfirm={confirm}
                  onCancel={cancel}
                />
              ))}
              {sending && (
                <li className="text-xs text-gray-500" aria-hidden="true">
                  Looking through the loan book…
                </li>
              )}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        <form
          className="border-t border-gray-200 bg-white px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="ask-early-warning-input" className="sr-only">
            Ask about your loan book
          </label>
          <Textarea
            id="ask-early-warning-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            maxLength={2000}
            placeholder="Ask about a company or the whole book"
            className="resize-none text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-gray-400">Enter to send, Shift+Enter for a new line</p>
            <Button type="submit" size="sm" disabled={sending || !input.trim()}>
              {sending ? "Asking…" : "Send"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
