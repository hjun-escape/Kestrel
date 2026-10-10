import { base44 } from "@/api/base44Client";
import { buildAssistantParts, errorText, findMentionedCompanyIds, textOf, toHistory } from "./assistantData";

const UNAVAILABLE = "The assistant is unavailable right now. Try again in a minute.";

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

// ChatModelAdapter for assistant-ui's LocalRuntime. askPortfolio is not
// streamed, so run() resolves once with the whole reply.
// getContext() -> { pinnedId, companies, onMentioned(ids) }
export function createAskAdapter(getContext) {
  return {
    async run({ messages, abortSignal }) {
      const { pinnedId, companies, onMentioned } = getContext();
      const history = toHistory(messages);
      const question = textOf([...messages].reverse().find((m) => m.role === "user"));
      const payload = pinnedId ? { messages: history, context_company_id: pinnedId } : { messages: history };

      let data;
      try {
        const res = await abortable(base44.functions.invoke("askPortfolio", payload), abortSignal);
        data = res?.data || {};
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        throw new Error(errorText(e, UNAVAILABLE));
      }
      if (data.error) throw new Error(String(data.error));

      const answer = typeof data.answer === "string" && data.answer.trim() ? data.answer : "No answer was returned.";
      const citations = Array.isArray(data.citations) ? data.citations : [];
      const pendingActions = Array.isArray(data.pending_actions) ? data.pending_actions : [];
      const ids = findMentionedCompanyIds({ answer, citations, pendingActions, companies });
      if (ids.length) onMentioned?.(ids);

      return {
        content: buildAssistantParts({ answer, citations, pendingActions, question }, companies),
        metadata: { custom: { citations, pending_actions: pendingActions, question } },
      };
    },
  };
}
