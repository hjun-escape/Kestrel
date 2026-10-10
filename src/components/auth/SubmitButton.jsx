import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const linkClass =
  "font-medium text-slate-900 underline underline-offset-4 decoration-slate-400 hover:decoration-slate-900 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

export default function SubmitButton({ loading, loadingLabel, children, ...props }) {
  return (
    <Button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="w-full h-11 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
