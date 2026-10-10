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

// Add company form. On save, creates a Borrower with no signals and an empty
// last_refreshed, so it shows "Not checked".
export default function AddCompanyDialog({ open, onOpenChange, onCreated }) {
  const empty = {
    name: "",
    website_domain: "",
    hq_city: "",
    hq_state: "",
    industry: "",
    stage: "borrower",
    loan_amount_usd: "",
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
      await base44.entities.Borrower.create(payload);
      setForm(empty);
      onCreated();
      onOpenChange(false);
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
          <DialogTitle>Add company</DialogTitle>
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
                <SelectItem value="borrower">Borrower</SelectItem>
                <SelectItem value="applicant">Applicant</SelectItem>
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
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Add company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}