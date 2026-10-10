import React from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowDown, ArrowUp, RotateCcw, Square } from "lucide-react";
import { useAssistantPage } from "./AssistantContext";
import { AnswerText, SourcesFooter } from "./CitationParts";
import { CompanyCards, PortfolioSummaryCard } from "./CompanyCards";
import { ActionCard } from "./ActionCard";
import { PART } from "./assistantData";

export const COMPOSER_ID = "ew-assistant-composer";

const SUGGESTIONS = [
  { prompt: "Which borrowers need attention this week?", send: true },
  { prompt: "What's our exposure at risk?", send: true },
  { prompt: "Screen a new applicant: ", label: "Screen a new applicant", send: false },
  { prompt: "Check Crestline for other lenders", send: true },
  { prompt: "Summarise Northfield's warning signs", send: true },
];

const PART_COMPONENTS = {
  Text: AnswerText,
  Empty: ThinkingIndicator,
  data: {
    by_name: {
      [PART.sources]: SourcesFooter,
      [PART.companies]: CompanyCards,
      [PART.summary]: PortfolioSummaryCard,
      [PART.action]: ActionCard,
    },
    Fallback: () => null,
  },
};

function ThinkingIndicator({ status }) {
  if (status?.type !== "running") return null;
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm text-ew-muted">
      <span aria-hidden="true" className="flex h-3 items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[3px] animate-pulse rounded-[1px] bg-ew-ink-soft"
            style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span>Reading the loan book and its sources</span>
    </div>
  );
}

function StoppedNote() {
  const stopped = useAuiState(
    (s) => s.message.status?.type === "incomplete" && s.message.status?.reason === "cancelled"
  );
  if (!stopped) return null;
  return <p className="py-1 text-sm text-ew-muted">Stopped. Ask again when you are ready.</p>;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="max-w-[80%] rounded-sm bg-ew-ink px-3.5 py-2 text-[15px] leading-relaxed text-white">
        <span className="sr-only">You said: </span>
        <MessagePrimitive.Parts components={{ Text: AnswerText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-ew-ink font-heading text-[10px] font-bold tracking-tight text-ew-ink"
      >
        EW
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">Early Warning replied: </span>
        <MessagePrimitive.Parts components={PART_COMPONENTS} unstable_showEmptyOnNonTextEnd={false} />
        <StoppedNote />
        <MessagePrimitive.Error>
          <div role="alert" className="rounded-sm border border-ew-red-rule bg-ew-red-bg px-3 py-2.5 text-sm text-ew-red">
            <p className="font-semibold">The answer did not arrive.</p>
            <ErrorPrimitive.Message className="mt-0.5 block text-ew-ink-soft" />
            <ActionBarPrimitive.Reload className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-sm border border-ew-red-rule bg-ew-surface px-2.5 text-xs font-semibold text-ew-red hover:border-ew-red">
              <RotateCcw aria-hidden="true" className="h-3 w-3" />
              Try again
            </ActionBarPrimitive.Reload>
          </div>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

function Welcome() {
  const { companies, byId, pinnedId } = useAssistantPage();
  const pinned = pinnedId ? byId[pinnedId] : null;
  const count = companies?.length;
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col justify-center px-6 py-10">
      <h1 className="font-heading text-[34px] font-bold leading-[1.05] tracking-tight text-ew-ink">
        Ask about your book.
      </h1>
      <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ew-ink-soft">
        Answers come only from the {count ? `${count} companies` : "companies"} you track and their cited public sources.
        Screening, re-checks and deep checks wait for your confirmation before anything runs.
      </p>
      {pinned && (
        <p className="mt-3 text-sm text-ew-ink">
          Questions that do not name a company will be about <span className="font-semibold">{pinned.name}</span>.
        </p>
      )}
      <ul className="mt-7 grid gap-1.5 sm:grid-cols-2" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => (
          <li key={s.prompt}>
            <ThreadPrimitive.Suggestion
              prompt={s.prompt}
              send={s.send}
              className="group flex w-full items-center justify-between gap-3 rounded-sm border border-ew-rule bg-ew-surface px-3.5 py-2.5 text-left text-sm font-medium text-ew-ink transition-colors hover:border-ew-ink hover:bg-ew-hover"
            >
              <span>{s.label || s.prompt}</span>
              <span aria-hidden="true" className="font-mono text-[11px] text-ew-muted group-hover:text-ew-ink">
                {s.send ? "Ask" : "Draft"}
              </span>
            </ThreadPrimitive.Suggestion>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Composer() {
  const aui = useAui();
  const { byId, pinnedId } = useAssistantPage();
  const pinned = pinnedId ? byId[pinnedId] : null;

  function handleKeyDown(e) {
    if (e.key === "Escape" && aui.thread().getState().isRunning) {
      e.preventDefault();
      aui.thread().cancelRun();
    }
  }

  return (
    <ComposerPrimitive.Root className="mx-auto w-full max-w-[760px] rounded-sm border border-ew-rule bg-ew-surface shadow-[0_-8px_24px_-12px_rgba(20,32,46,0.18)] focus-within:border-ew-ink">
      <label htmlFor={COMPOSER_ID} className="sr-only">
        Ask about your loan book
      </label>
      <ComposerPrimitive.Input
        id={COMPOSER_ID}
        autoFocus
        rows={1}
        maxRows={8}
        maxLength={2000}
        submitMode="enter"
        onKeyDown={handleKeyDown}
        placeholder={pinned ? `Ask about ${pinned.name} or the whole book` : "Ask about a company or the whole book"}
        className="block w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[15px] leading-relaxed text-ew-ink placeholder:text-ew-muted focus:outline-none focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-1">
        <p className="hidden text-[11px] text-ew-muted sm:block">
          <kbd className="font-mono">Enter</kbd> to send, <kbd className="font-mono">Shift+Enter</kbd> for a new line,{" "}
          <kbd className="font-mono">Esc</kbd> to stop
        </p>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send
            aria-label="Send question"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-sm bg-ew-ink px-3 text-sm font-semibold text-white hover:bg-ew-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel
            aria-label="Stop the answer"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-ink px-3 text-sm font-semibold text-ew-ink hover:bg-ew-hover"
          >
            <Square aria-hidden="true" className="h-3 w-3 fill-current" />
            Stop
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </ComposerPrimitive.Root>
  );
}

export default function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <Welcome />
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isEmpty}>
          <ol aria-label="Conversation" className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-6 pb-6 pt-8">
            <ThreadPrimitive.Messages>
              {({ message }) => <li>{message.role === "user" ? <UserMessage /> : <AssistantMessage />}</li>}
            </ThreadPrimitive.Messages>
          </ol>
        </AuiIf>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-gradient-to-t from-ew-surface via-ew-surface to-transparent px-6 pb-4 pt-6">
          <AuiIf condition={(s) => !s.thread.isEmpty}>
            <ThreadPrimitive.ScrollToBottom
              aria-label="Scroll to the latest message"
              className="absolute -top-3 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1 rounded-sm border border-ew-rule bg-ew-surface px-2 text-xs text-ew-ink shadow-sm disabled:invisible"
            >
              <ArrowDown aria-hidden="true" className="h-3 w-3" />
              Latest
            </ThreadPrimitive.ScrollToBottom>
          </AuiIf>
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
