import { useSyncExternalStore } from "react";

// Module-level store for confirmed chat actions (screen / refresh / deep
// check). Action cards write to it; the context panel and the conversation
// saver read it. State per action_id:
//   { status: "running" | "done" | "error" | "cancelled" | "interrupted",
//     kind, companyId, domain, snapshot, message, startedAt }

let states = {};
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeActions(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActionStates() {
  return states;
}

export function setActionState(actionId, patch) {
  states = { ...states, [actionId]: { ...(states[actionId] || {}), ...patch } };
  emit();
}

// Seeds saved states when a conversation is opened. Live runs win.
export function seedActionStates(saved) {
  const next = { ...states };
  Object.entries(saved || {}).forEach(([id, state]) => {
    if (next[id]?.status !== "running") next[id] = state;
  });
  states = next;
  emit();
}

export function useActionStates() {
  return useSyncExternalStore(subscribeActions, getActionStates, getActionStates);
}

export function useActionState(actionId) {
  const all = useActionStates();
  return all[actionId] || null;
}

// The running chat action (if any) for one company.
export function findRunningAction(all, companyId) {
  if (!companyId) return null;
  return Object.values(all).find((s) => s.status === "running" && s.companyId === companyId) || null;
}
