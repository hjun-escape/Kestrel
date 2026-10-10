import React, { useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider, useAui, useAuiEvent, useLocalRuntime } from "@assistant-ui/react";
import { getActionStates, subscribeActions } from "./actionStore";
import { serializeMessages, textOf, titleFrom } from "./assistantData";

const ANNOUNCE_MAX = 400;

// One assistant-ui LocalRuntime per conversation. The parent remounts this
// (via key) to switch conversations; initialMessages restores saved history.
export default function ConversationRuntime({ adapter, initialMessages, conversationId, onSave, pinnedId, children }) {
  const runtime = useLocalRuntime(adapter, { initialMessages });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversationSaver conversationId={conversationId} onSave={onSave} pinnedId={pinnedId} />
      <ReplyAnnouncer />
      {children}
    </AssistantRuntimeProvider>
  );
}

// Saves the conversation after every reply and whenever one of its actions
// changes state. onSave(id | null, record) resolves to the saved id.
function ConversationSaver({ conversationId, onSave, pinnedId }) {
  const aui = useAui();
  const idRef = useRef(conversationId || null);
  const chain = useRef(Promise.resolve());
  const latest = useRef({ onSave, pinnedId });
  latest.current = { onSave, pinnedId };

  function save() {
    chain.current = chain.current.then(async () => {
      const messages = aui.thread().getState().messages;
      const stored = serializeMessages(messages, getActionStates());
      const firstUser = stored.find((m) => m.role === "user");
      if (!firstUser) return;
      const now = new Date().toISOString();
      const record = {
        title: titleFrom(firstUser.content),
        messages: stored,
        pinned_company_id: latest.current.pinnedId || "",
        updated_at: now,
        ...(idRef.current ? {} : { created_at: now }),
      };
      const id = await latest.current.onSave(idRef.current, record);
      if (id) idRef.current = id;
    }).catch(() => {
      // onSave reports its own errors; keep the chain alive for the next save.
    });
    return chain.current;
  }

  useAuiEvent("thread.runEnd", () => {
    save();
  });

  useEffect(() => {
    let previous = getActionStates();
    return subscribeActions(() => {
      const next = getActionStates();
      const ids = (aui.thread().getState().messages || []).flatMap((m) =>
        (m.metadata?.custom?.pending_actions || []).map((a) => a.action_id)
      );
      const changed = ids.some((id) => previous[id]?.status !== next[id]?.status);
      previous = next;
      if (changed) save();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aui]);

  return null;
}

// Screen-reader announcement for each finished reply.
function ReplyAnnouncer() {
  const aui = useAui();
  const [text, setText] = useState("");

  useAuiEvent("thread.runStart", () => setText("Looking through the loan book."));
  useAuiEvent("thread.runEnd", () => {
    const messages = aui.thread().getState().messages || [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.status?.type === "incomplete" && last.status?.reason !== "cancelled") {
      setText("The answer did not arrive. Use Try again to resend.");
      return;
    }
    const body = textOf(last).slice(0, ANNOUNCE_MAX);
    const actions = (last.metadata?.custom?.pending_actions || []).length;
    const note = actions ? ` ${actions} action${actions > 1 ? "s" : ""} need your confirmation.` : "";
    setText(`Kestrel replied: ${body}${note}`);
  });

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
