// Pure helpers for the Assistant page: turning askPortfolio replies into
// assistant-ui message parts, placing citations, and (de)serialising
// conversations for the Conversation entity. No React, no network.

export const PART = {
  sources: "ew-sources",
  companies: "ew-companies",
  summary: "ew-summary",
  action: "ew-action",
};

// Suggested first questions; the company ones name real companies from the book (already sorted riskiest first).
export function suggestedQuestions(companies) {
  const named = (companies || []).filter((c) => c?.name);
  const [first, second] = named;
  const lenderTarget = second || first;
  return [
    { prompt: "Which borrowers need attention this week?", send: true },
    { prompt: "What's our exposure at risk?", send: true },
    { prompt: "Screen a new applicant: ", label: "Screen a new applicant", send: false },
    ...(lenderTarget ? [{ prompt: `Check ${lenderTarget.name} for other lenders`, send: true }] : []),
    ...(first ? [{ prompt: `Summarise ${first.name}'s warning signs`, send: true }] : []),
  ];
}

const MAX_TITLE = 60;
const MAX_CARDS = 4;
const NAME_SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|group|holdings|the)\b/g;

// Entity reads return either an array or { items }, depending on call style.
export function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

// Only http(s) links are rendered as links.
export function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "");
  }
}

export function errorText(e, fallback) {
  const fromBody = e?.response?.data?.error || e?.data?.error;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return fallback;
}

export function titleFrom(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean;
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// "Northfield Packaging Co." -> "northfield packaging". Used to spot company
// names in free text without tripping on legal suffixes.
export function coreName(name) {
  return normalize(name).replace(NAME_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

function mentions(text, company) {
  const hay = ` ${normalize(text)} `;
  const full = normalize(company.name);
  if (full && hay.includes(` ${full} `)) return true;
  const core = coreName(company.name);
  if (core.length >= 4 && hay.includes(` ${core} `)) return true;
  const first = core.split(" ")[0];
  // A distinctive first word ("Northfield") is enough, but only if no other
  // company in the book shares it; the caller checks uniqueness.
  return Boolean(first && first.length >= 5 && hay.includes(` ${first} `));
}

// Companies an answer is about: cited ones first, then ones named in the text,
// then the targets of proposed actions. Returns ids, at most MAX_CARDS.
export function findMentionedCompanyIds({ answer, citations, pendingActions, companies }) {
  const list = companies || [];
  const firstWordCount = new Map();
  list.forEach((c) => {
    const first = coreName(c.name).split(" ")[0];
    if (first) firstWordCount.set(first, (firstWordCount.get(first) || 0) + 1);
  });
  const ids = [];
  const add = (id) => {
    if (id && !ids.includes(id) && list.some((c) => c.id === id)) ids.push(id);
  };
  (citations || []).forEach((c) => add(c.company_id));
  list.forEach((c) => {
    const first = coreName(c.name).split(" ")[0];
    const fullOrCore = normalize(answer).includes(normalize(c.name)) || normalize(answer).includes(coreName(c.name));
    if (fullOrCore && coreName(c.name).length >= 4) add(c.id);
    else if (firstWordCount.get(first) === 1 && mentions(answer, c)) add(c.id);
  });
  (pendingActions || []).forEach((a) => add(a?.params?.id));
  return ids.slice(0, MAX_CARDS);
}

const SUMMARY_PATTERN = /\b(exposure|at risk|portfolio|whole book|loan book|the book|need(s)? attention|this week|how many|overview|summar(y|ise|ize) (the|my|our) (book|portfolio))\b/i;

export function wantsSummary(question) {
  return SUMMARY_PATTERN.test(String(question || ""));
}

// Splits the answer into blocks (paragraphs / list items) and attaches each
// citation number to the first block that names its company, or to the last
// block when none does. Returns [{ kind: "p" | "li", text, cites: [n] }].
export function placeCitations(answer, citations, companiesById) {
  const lines = String(answer || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const blocks = lines.map((line) => {
    const m = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    return m ? { kind: "li", text: m[1], cites: [] } : { kind: "p", text: line, cites: [] };
  });
  if (blocks.length === 0) return blocks;
  (citations || []).forEach((c, i) => {
    const company = companiesById?.[c.company_id];
    const quote = normalize(c.quote).slice(0, 40);
    let target = -1;
    if (quote) target = blocks.findIndex((b) => normalize(b.text).includes(quote));
    if (target < 0 && company) target = blocks.findIndex((b) => mentions(b.text, company));
    const index = target < 0 ? blocks.length - 1 : target;
    blocks[index] = { ...blocks[index], cites: [...blocks[index].cites, i + 1] };
  });
  return blocks;
}

// assistant-ui content parts for one askPortfolio reply.
export function buildAssistantParts({ answer, citations, pendingActions, question }, companies) {
  const parts = [{ type: "text", text: answer || "No answer was returned." }];
  if (citations?.length) parts.push({ type: "data", name: PART.sources, data: { citations } });
  const ids = findMentionedCompanyIds({ answer, citations, pendingActions, companies });
  if (ids.length) parts.push({ type: "data", name: PART.companies, data: { ids } });
  if (wantsSummary(question)) parts.push({ type: "data", name: PART.summary, data: {} });
  (pendingActions || []).forEach((action) => {
    parts.push({ type: "data", name: PART.action, data: { action } });
  });
  return parts;
}

export function textOf(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  return (content || [])
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function isFailed(message) {
  const status = message?.status?.type;
  return message?.role === "assistant" && status === "incomplete";
}

// History sent to askPortfolio: text only, failed replies dropped.
export function toHistory(messages) {
  return (messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && !isFailed(m))
    .map((m) => ({ role: m.role, content: textOf(m) }))
    .filter((m) => m.content);
}

function isoOf(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Thread messages -> Conversation.messages. actionStates: { [action_id]: state }.
export function serializeMessages(messages, actionStates = {}) {
  return (messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && !isFailed(m))
    .map((m) => {
      const custom = m.metadata?.custom || {};
      const base = { role: m.role, content: textOf(m), created_at: isoOf(m.createdAt) };
      if (m.role === "user") return base;
      const pending = (custom.pending_actions || []).map((a) => {
        const state = actionStates[a.action_id];
        if (!state) return a;
        const { status, message, companyId } = state;
        return { ...a, state: { status: status === "running" ? "interrupted" : status, message: message || "", company_id: companyId || "" } };
      });
      return {
        ...base,
        citations: custom.citations || [],
        pending_actions: pending,
        question: custom.question || "",
      };
    })
    .filter((m) => m.content);
}

// Conversation.messages -> assistant-ui initialMessages.
export function toInitialMessages(stored, companies) {
  return (stored || []).map((m, i) => {
    const createdAt = m.created_at ? new Date(m.created_at) : undefined;
    if (m.role === "user") {
      return { id: `u${i}`, role: "user", content: [{ type: "text", text: m.content || "" }], createdAt };
    }
    const citations = m.citations || [];
    const pendingActions = m.pending_actions || [];
    return {
      id: `a${i}`,
      role: "assistant",
      createdAt,
      status: { type: "complete", reason: "stop" },
      content: buildAssistantParts({ answer: m.content, citations, pendingActions, question: m.question }, companies),
      metadata: { custom: { citations, pending_actions: pendingActions, question: m.question || "" } },
    };
  });
}

// Action states saved with a conversation, to seed the action store on load.
export function storedActionStates(stored) {
  const out = {};
  (stored || []).forEach((m) => {
    (m.pending_actions || []).forEach((a) => {
      if (a?.action_id && a.state?.status) {
        out[a.action_id] = {
          status: a.state.status,
          message: a.state.message || "",
          companyId: a.state.company_id || a.params?.id || null,
          kind: a.kind,
        };
      }
    });
  });
  return out;
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
