import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CompanyFields, normalizeDomain, validate } from "@/components/AddCompanyDialog";

function formFrom(b) {
  return {
    name: b?.name || "",
    website_domain: b?.website_domain || "",
    hq_city: b?.hq_city || "",
    hq_state: b?.hq_state || "",
    industry: b?.industry || "",
    stage: b?.stage || "borrower",
    loan_amount_usd: b?.loan_amount_usd != null ? String(b.loan_amount_usd) : "",
    linkedin_url: b?.linkedin_url || "",
    glassdoor_url: b?.glassdoor_url || "",
  };
}

// The checks search by these, so changing one clears the current evidence (manageCompany/logic.ts IDENTITY).
function identityChanged(form, b) {
  return (
    form.name.trim() !== (b?.name || "") ||
    normalizeDomain(form.website_domain) !== (b?.website_domain || "") ||
    form.linkedin_url.trim() !== (b?.linkedin_url || "") ||
    form.glassdoor_url.trim() !== (b?.glassdoor_url || "")
  );
}

// Edit company: the same fields as "Screen new applicant", saved through manageCompany, which checks the
// caller owns the company. onSaved(borrower, evidenceCleared).
export default function EditCompanyDialog({ borrower, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(() => formFrom(borrower));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(formFrom(borrower));
      setError(null);
    }
  }, [open, borrower]);

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
      const res = await base44.functions.invoke("manageCompany", { borrower_id: borrower.id, action: "update", fields: form });
      onOpenChange(false);
      onSaved(res.data.borrower, !!res.data.evidence_cleared);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not save the changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const resets = !!borrower?.last_refreshed && identityChanged(form, borrower);

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="gap-0 rounded-sm p-0 sm:max-w-[560px]">
        <form onSubmit={handleSave} noValidate>
          <DialogHeader className="border-b border-ew-rule px-6 py-4 text-left">
            <DialogTitle className="font-heading text-lg font-bold tracking-tight text-ew-ink">Edit company</DialogTitle>
            <DialogDescription className="text-sm text-ew-muted">
              Status and evidence come from the checks and can&apos;t be edited here.
            </DialogDescription>
          </DialogHeader>

          <CompanyFields form={form} update={update} />

          {resets && (
            <p className="mx-6 mb-4 border-l-2 border-ew-ink-soft bg-ew-hover px-3 py-2 text-sm text-ew-ink">
              The checks search by name, domain, LinkedIn and Glassdoor. Saving this change clears the current
              evidence and status, and the company shows as not checked until you refresh it.
            </p>
          )}
          {error && (
            <p role="alert" className="mx-6 mb-4 border-l-2 border-ew-red bg-ew-red-bg px-3 py-2 text-sm text-ew-red">
              {error}
            </p>
          )}

          <DialogFooter className="border-t border-ew-rule bg-ew-hover px-6 py-3">
            <Button type="button" variant="outline" className="rounded-sm" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="rounded-sm bg-ew-ink hover:bg-ew-ink-soft">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
