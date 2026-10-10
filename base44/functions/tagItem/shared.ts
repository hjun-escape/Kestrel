// Tagging for tagItem (P2). Self-contained: Base44 bundles each function folder separately
// (no imports across function folders). findVerbatim follows newsSignals/logic.ts + shared.ts.

export interface Borrower {
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
  industry?: string;
}

export type SignalType = "exec_departure" | "legal_layoffs" | "review_distress";

export interface Tag {
  relevant: boolean;
  same_company: boolean;
  signal_type: SignalType | null;
  severity: "strong" | "weak" | null;
  snippet: string;
  reason: string;
}

export type LLMParams = { prompt: string; response_json_schema: Record<string, unknown> };
export type InvokeLLM = (params: LLMParams) => Promise<unknown>;

const MIN_SNIPPET_CHARS = 12;
const PROMPT_TEXT_CHARS = 8_000;

export const TAG_SCHEMA = {
  type: "object",
  properties: {
    relevant: { type: "boolean" },
    same_company: { type: "boolean" },
    signal_type: { type: "string", enum: ["exec_departure", "legal_layoffs", "review_distress", "none"] },
    severity: { type: "string", enum: ["strong", "weak", "none"] },
    snippet: { type: "string" },
    reason: { type: "string" },
  },
  required: ["relevant", "same_company", "signal_type", "severity", "snippet", "reason"],
};

export function buildPrompt(text: string, b: Borrower, kind: string): string {
  const hq = [b.hq_city, b.hq_state].filter(Boolean).join(", ");
  return [
    `You tag ONE ${kind} for a bank credit officer deciding whether a company is a credit risk.`,
    "You only tag. Reply with JSON matching the schema and nothing else.",
    "",
    `Company: ${b.name} | website: ${b.website_domain || "unknown"} | HQ: ${hq || "unknown"} | industry: ${b.industry || "unknown"}`,
    "",
    "Text:",
    '"""',
    text.slice(0, PROMPT_TEXT_CHARS),
    '"""',
    "",
    "Rules:",
    "- same_company: true only if the text is clearly about this company, not one with a similar name. If unsure, false.",
    "- relevant: true only if the text reports a NEW negative event for this company. Good news, or a past event",
    "  mentioned in passing, is not relevant.",
    '- signal_type: "exec_departure" (a senior executive leaves), "legal_layoffs" (lawsuit, lien, WARN notice, layoffs,',
    '  bankruptcy, closures), "review_distress" (an employee review describing layoffs, furloughs, late or missed pay,',
    '  or closing), or "none".',
    '- severity: exec_departure: "strong" for CEO or CFO, else "weak". legal_layoffs: "strong" for a WARN notice, a',
    '  bankruptcy filing, or a lawsuit against the company by a lender or supplier, else "weak". review_distress: "strong".',
    '  "none" if not relevant.',
    "- snippet: copy one or two sentences EXACTLY, character for character, from the Text that show the event.",
    "  Never paraphrase. Empty string if there is none.",
    "- reason: one short sentence explaining your decision.",
  ].join("\n");
}

function coerce(raw: unknown): Record<string, unknown> | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Finds quote in text (whitespace-normalised, case-insensitive) and returns the passage copied from text, or null. */
export function findVerbatim(text: string, quote: string): string | null {
  const needle = norm(quote.trim().replace(/^["'“‘]+|["'”’]+$/g, "").replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, ""));
  if (needle.length < MIN_SNIPPET_CHARS) return null;
  let hay = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = norm(text[i]) || " ";
    if (c === " " && (hay === "" || hay.endsWith(" "))) continue;
    for (const ch of c) {
      hay += ch;
      at.push(i);
    }
  }
  const idx = hay.indexOf(needle);
  return idx < 0 ? null : text.slice(at[idx], at[idx + needle.length - 1] + 1).replace(/\s+/g, " ");
}

const NOT_RELEVANT = (reason: string): Tag => ({ relevant: false, same_company: false, signal_type: null, severity: null, snippet: "", reason });

/** Tags one text. The snippet guard is applied: a relevant tag always carries a verbatim snippet from `text`. */
export async function tagText(text: string, b: Borrower, invokeLLM: InvokeLLM, kind = "news article"): Promise<Tag> {
  const data = coerce(await invokeLLM({ prompt: buildPrompt(text, b, kind), response_json_schema: TAG_SCHEMA }));
  if (!data || typeof data.relevant !== "boolean" || typeof data.same_company !== "boolean") return NOT_RELEVANT("unreadable model reply");
  const type = String(data.signal_type ?? "").toLowerCase();
  const severity = String(data.severity ?? "").toLowerCase();
  const reason = String(data.reason ?? "");
  const tag: Tag = {
    relevant: data.relevant,
    same_company: data.same_company,
    signal_type: ["exec_departure", "legal_layoffs", "review_distress"].includes(type) ? (type as SignalType) : null,
    severity: severity === "strong" || severity === "weak" ? severity : null,
    snippet: "",
    reason,
  };
  if (!tag.relevant) return tag;
  const snippet = findVerbatim(text, String(data.snippet ?? ""));
  if (!snippet || !tag.signal_type || !tag.severity) {
    return { ...tag, relevant: false, reason: `${!snippet ? "snippet guard: not an exact quote" : "no type or severity"} (${reason})` };
  }
  return { ...tag, snippet };
}
