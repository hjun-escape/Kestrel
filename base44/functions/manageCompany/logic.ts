// manageCompany logic: edit or delete one company. Pure: the data layer is passed in, so tests run in Node.
//
// Edit: only the fields a user types in the form. Status, why, signals, owner and refresh bookkeeping are never
// edited directly. If a field the checks search by changes (name, domain, LinkedIn, Glassdoor), the old evidence
// is about a company we no longer point at, so its Signals are deleted and the company goes back to "Not checked"
// (CLAUDE.md: status is only meaningful once last_refreshed is set).
//
// Delete: the company and every record that hangs off it by borrower_id.

export const EDITABLE = [
  "name",
  "website_domain",
  "hq_city",
  "hq_state",
  "industry",
  "stage",
  "loan_amount_usd",
  "linkedin_url",
  "glassdoor_url",
] as const;

// The checks search by these, so changing one makes the existing evidence stale.
export const IDENTITY = ["name", "website_domain", "linkedin_url", "glassdoor_url"] as const;

// Entities that point at a company with borrower_id. Deleting a company deletes these too.
export const CHILD_ENTITIES = ["Signal", "Analysis", "LenderCheck", "Decision", "CashflowReview"] as const;

type Patch = Record<string, unknown>;

// "acme.com", "https://www.acme.com/about" -> "acme.com" (same rule as the add-company form)
export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Validates the submitted fields and returns the patch to save, or an error a user can act on.
// Unknown fields are ignored. Optional text cleared to "" is saved as ""; a cleared amount as null.
export function cleanFields(fields: unknown): { patch: Patch } | { error: string } {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { error: "fields is required" };
  const f = fields as Record<string, unknown>;
  const patch: Patch = {};
  const text = (k: string) => (typeof f[k] === "string" ? (f[k] as string).trim() : undefined);

  for (const k of EDITABLE) {
    if (!(k in f)) continue;
    if (k === "loan_amount_usd") {
      const v = f[k];
      if (v === "" || v === null) patch[k] = null;
      else if (Number(v) > 0 && Number.isFinite(Number(v))) patch[k] = Number(v);
      else return { error: "Loan amount must be a positive number of dollars." };
      continue;
    }
    const v = text(k);
    if (v === undefined) return { error: `${k} must be text` };
    patch[k] = v;
  }

  if ("name" in patch && !patch.name) return { error: "Enter the company name." };
  if ("website_domain" in patch) {
    const domain = normalizeDomain(String(patch.website_domain));
    if (!domain || !domain.includes(".")) return { error: "Enter a website domain such as harbortool.com." };
    patch.website_domain = domain;
  }
  if ("stage" in patch && patch.stage !== "applicant" && patch.stage !== "borrower") {
    return { error: "Stage must be applicant or borrower." };
  }
  if (patch.linkedin_url && !isHttpUrl(String(patch.linkedin_url))) return { error: "LinkedIn URL must start with https://" };
  if (patch.glassdoor_url && !isHttpUrl(String(patch.glassdoor_url))) return { error: "Glassdoor URL must start with https://" };
  return { patch };
}

// Only the fields that differ from what is stored.
export function changedFields(before: Patch, patch: Patch): Patch {
  const out: Patch = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = before[k] ?? (k === "loan_amount_usd" ? null : "");
    if (old !== v) out[k] = v;
  }
  return out;
}

export function identityChanged(changes: Patch): boolean {
  return IDENTITY.some((k) => k in changes);
}

// What an identity change resets: back to "Not checked", nothing pending for the old company.
export const RESET_CHECK = {
  status: "green",
  why: "",
  last_refreshed: null,
  sources_unavailable: [],
  pending_snapshots: {},
};

export interface Db {
  [entity: string]: {
    update?: (id: string, data: Patch) => Promise<unknown>;
    delete?: (id: string) => Promise<unknown>;
    deleteMany?: (query: Patch) => Promise<unknown>;
  };
}

export async function updateCompany(db: Db, borrower: Patch & { id: string }, fields: unknown) {
  const cleaned = cleanFields(fields);
  if ("error" in cleaned) return { status: 400, body: { error: cleaned.error } };
  const changes = changedFields(borrower, cleaned.patch);
  if (Object.keys(changes).length === 0) return { status: 200, body: { borrower, evidence_cleared: false } };
  const reset = identityChanged(changes);
  if (reset) await db.Signal.deleteMany!({ borrower_id: borrower.id });
  const updated = await db.Borrower.update!(borrower.id, reset ? { ...changes, ...RESET_CHECK } : changes);
  return { status: 200, body: { borrower: updated, evidence_cleared: reset } };
}

export async function deleteCompany(db: Db, borrowerId: string) {
  // Children first, so a failure part-way never leaves records pointing at a company that is gone.
  for (const entity of CHILD_ENTITIES) await db[entity].deleteMany!({ borrower_id: borrowerId });
  await db.Borrower.delete!(borrowerId);
  return { status: 200, body: { deleted: borrowerId } };
}
