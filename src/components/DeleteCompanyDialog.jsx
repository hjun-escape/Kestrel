import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

// Confirm before deleting a company. manageCompany checks the caller owns it, then removes the company and
// every record linked to it. onDeleted() runs after the delete succeeds.
export default function DeleteCompanyDialog({ borrower, open, onOpenChange, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  function handleOpenChange(next) {
    if (deleting) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await base44.functions.invoke("manageCompany", { borrower_id: borrower.id, action: "delete" });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not delete the company. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="rounded-sm sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-lg font-bold tracking-tight text-ew-ink">
            Delete {borrower?.name || "this company"}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-ew-muted">
            This removes the company from the loan book along with its evidence, decisions, analyst briefs,
            other-lender checks and cash-flow reviews. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="border-l-2 border-ew-red bg-ew-red-bg px-3 py-2 text-sm text-ew-red">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-sm" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open on failure. */}
          <Button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-sm bg-ew-red text-white hover:bg-ew-red hover:opacity-90"
          >
            {deleting ? "Deleting…" : "Delete company"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
