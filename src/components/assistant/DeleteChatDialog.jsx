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

// Confirm before deleting a saved chat. conversation: the chat to delete, or
// null when closed. onConfirm(conversation) resolves to an error message or null.
export default function DeleteChatDialog({ conversation, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  function handleOpenChange(open) {
    if (open || deleting) return;
    setError(null);
    onCancel();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const problem = await onConfirm(conversation);
    setDeleting(false);
    if (problem) setError(problem);
  }

  return (
    <AlertDialog open={!!conversation} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="rounded-sm sm:max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-lg font-bold tracking-tight text-ew-ink">
            Delete this chat?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-ew-muted">
            This can&apos;t be undone.
            {conversation?.title ? (
              <span className="mt-1 block truncate font-medium text-ew-ink-soft">{conversation.title}</span>
            ) : null}
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
            {deleting ? "Deleting…" : "Delete chat"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
