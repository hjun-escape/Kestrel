import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { base44 } from "@/api/base44Client";

// "Screen new applicant" form. On save, creates a Borrower with no signals and
// an empty last_refreshed (so it shows "Not checked"), then the loan book opens
// its detail page, which runs the first check. Stage defaults to applicant;
// choose Borrower to add a company the bank has already lent to.
// LinkedIn and Glassdoor URLs feed the Jobs and Reviews checks.
export default function AddCompanyDialog({ open, onOpenChange, onCreated }) {
  const empty = {
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
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.website_domain.trim()) {
      setError("Name and website domain are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        website_domain: form.website_domain.trim(),
        hq_city: form.hq_city.trim(),
        hq_state: form.hq_state.trim(),
        industry: form.industry.trim(),
        stage: form.stage,
        status: "green",
        why: "",
        sources_unavailable: [],
        // last_refreshed intentionally omitted → "Not checked"
      };
      if (form.loan_amount_usd) {
        payload.loan_amount_usd = Number(form.loan_amount_usd);
      }
      if (form.linkedin_url.trim()) payload.linkedin_url = form.linkedin_url.trim();
      if (form.glassdoor_url.trim()) payload.glassdoor_url = form.glassdoor_url.trim();
      const created = await base44.entities.Borrower.create(payload);
      setForm(empty);
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      setError("Could not save the company. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Screen new applicant</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Northfield Packaging Co."
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="domain">Website domain</Label>
            <Input
              id="domain"
              value={form.website_domain}
              onChange={(e) => update("website_domain", e.target.value)}
              placeholder="northfieldpack.example"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">HQ city</Label>
            <Input
              id="city"
              value={form.hq_city}
              onChange={(e) => update("hq_city", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">HQ state</Label>
            <Input
              id="state"
              value={form.hq_state}
              onChange={(e) => update("hq_state", e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => update("stage", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="applicant">Applicant</SelectItem>
                <SelectItem value="borrower">Borrower</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan">Loan / requested (USD)</Label>
            <Input
              id="loan"
              type="number"
              value={form.loan_amount_usd}
              onChange={(e) => update("loan_amount_usd", e.target.value)}
              placeholder="4500000"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="linkedin">LinkedIn company URL (optional)</Label>
            <Input
              id="linkedin"
              value={form.linkedin_url}
              onChange={(e) => update("linkedin_url", e.target.value)}
              placeholder="https://www.linkedin.com/company/…"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="glassdoor">Glassdoor URL (optional)</Label>
            <Input
              id="glassdoor"
              value={form.glassdoor_url}
              onChange={(e) => update("glassdoor_url", e.target.value)}
              placeholder="https://www.glassdoor.com/…"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save and check"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}