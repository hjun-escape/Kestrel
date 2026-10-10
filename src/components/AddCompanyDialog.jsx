import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { startRefresh } from "@/lib/borrowerUtils";

const EMPTY = {
  name: "",
  website_domain: "",
  hq_city: "",
  hq_state: "",
  industry: "",
  stage: "applicant",
  loan_amount_usd: "",
  linkedin_url: "",
  glassdoor_url: "",
};

// "acme.com", "https://www.acme.com/about" -> "acme.com"
function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validate(form) {
  if (!form.name.trim()) return "Enter the company name.";
  const domain = normalizeDomain(form.website_domain);
  if (!domain || !domain.includes(".")) return "Enter a website domain such as harbortool.com.";
  if (form.loan_amount_usd !== "" && !(Number(form.loan_amount_usd) > 0)) {
    return "Loan amount must be a positive number of dollars.";
  }
  if (form.linkedin_url.trim() && !isHttpUrl(form.linkedin_url.trim())) {
    return "LinkedIn URL must start with https://";
  }
  if (form.glassdoor_url.trim() && !isHttpUrl(form.glassdoor_url.trim())) {
    return "Glassdoor URL must start with https://";
  }
  return null;
}

function buildPayload(form) {
  const payload = {
    name: form.name.trim(),
    website_domain: normalizeDomain(form.website_domain),
    hq_city: form.hq_city.trim(),
    hq_state: form.hq_state.trim(),
    industry: form.industry.trim(),
    stage: form.stage,
    status: "green",
    why: "",
    sources_unavailable: [],
    // last_refreshed omitted: the company shows "Not checked" until the first check lands.
  };
  if (form.loan_amount_usd !== "") payload.loan_amount_usd = Number(form.loan_amount_usd);
  if (form.linkedin_url.trim()) payload.linkedin_url = form.linkedin_url.trim();
  if (form.glassdoor_url.trim()) payload.glassdoor_url = form.glassdoor_url.trim();
  return payload;
}

// "Screen new applicant": saves the company, starts the first check right away
// (refreshBorrower), then the caller opens the detail page in checking mode.
// LinkedIn and Glassdoor URLs feed the Jobs and Reviews checks.
export default function AddCompanyDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await base44.entities.Borrower.create(buildPayload(form));
      startRefresh(created.id, { unavailableBefore: [], signalIdsBefore: [] });
      setForm(EMPTY);
      onOpenChange(false);
      onCreated(created);
    } catch {
      setError("Could not save the company. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-sm p-0 sm:max-w-[560px]">
        <form onSubmit={handleSave} noValidate>
          <DialogHeader className="border-b border-ew-rule px-6 py-4 text-left">
            <DialogTitle className="font-heading text-lg font-bold tracking-tight text-ew-ink">
              Screen new applicant
            </DialogTitle>
            <DialogDescription className="text-sm text-ew-muted">
              Saving starts the first check on news, court filings, hiring and employee reviews.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-6 gap-x-4 gap-y-3 px-6 py-5">
            <Field id="name" label="Company name" className="col-span-6">
              <Input id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Harbor Tool and Die Inc." />
            </Field>
            <Field id="domain" label="Website domain" className="col-span-3">
              <Input id="domain" required value={form.website_domain} onChange={(e) => update("website_domain", e.target.value)} placeholder="harbortool.com" className="font-mono text-[13px]" />
            </Field>
            <Field id="industry" label="Industry" className="col-span-3">
              <Input id="industry" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Packaging" />
            </Field>
            <Field id="city" label="HQ city" className="col-span-4">
              <Input id="city" value={form.hq_city} onChange={(e) => update("hq_city", e.target.value)} />
            </Field>
            <Field id="state" label="HQ state" className="col-span-2">
              <Input id="state" value={form.hq_state} onChange={(e) => update("hq_state", e.target.value)} maxLength={20} />
            </Field>

            <fieldset className="col-span-3">
              <legend className="mb-1.5 text-sm font-medium text-ew-ink">Stage</legend>
              <div className="grid grid-cols-2 border border-ew-rule">
                {[
                  { value: "applicant", label: "Applicant" },
                  { value: "borrower", label: "Borrower" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex h-9 cursor-pointer items-center justify-center text-sm focus-within:outline focus-within:outline-2 focus-within:outline-ew-focus ${
                      form.stage === opt.value ? "bg-ew-ink font-semibold text-white" : "bg-ew-surface text-ew-ink-soft hover:bg-ew-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="stage"
                      value={opt.value}
                      checked={form.stage === opt.value}
                      onChange={() => update("stage", opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="loan" label={form.stage === "applicant" ? "Amount requested (USD)" : "Loan amount (USD)"} className="col-span-3">
              <Input id="loan" type="number" inputMode="numeric" min="0" step="1000" value={form.loan_amount_usd} onChange={(e) => update("loan_amount_usd", e.target.value)} placeholder="4500000" className="font-mono text-[13px]" />
            </Field>

            <Field id="linkedin" label="LinkedIn company URL" hint="Optional. Used for the hiring check." className="col-span-6">
              <Input id="linkedin" type="url" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://www.linkedin.com/company/…" />
            </Field>
            <Field id="glassdoor" label="Glassdoor URL" hint="Optional. Used for the employee review check." className="col-span-6">
              <Input id="glassdoor" type="url" value={form.glassdoor_url} onChange={(e) => update("glassdoor_url", e.target.value)} placeholder="https://www.glassdoor.com/…" />
            </Field>
          </div>

          {error && (
            <p role="alert" className="mx-6 mb-4 border-l-2 border-ew-red bg-ew-red-bg px-3 py-2 text-sm text-ew-red">
              {error}
            </p>
          )}

          <DialogFooter className="border-t border-ew-rule bg-ew-hover px-6 py-3">
            <Button type="button" variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="rounded-sm bg-ew-ink hover:bg-ew-ink-soft">
              {saving ? "Saving…" : "Save and check"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, hint, className, children }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label htmlFor={id} className="text-ew-ink">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-ew-muted">{hint}</p>}
    </div>
  );
}
