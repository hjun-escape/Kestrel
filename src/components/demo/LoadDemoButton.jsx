import React from "react";
import { Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// "Load demo companies" (signed out: fills the shared demo book) or "Add demo companies to my book" (signed in).
export default function LoadDemoButton({ signedIn, running, onClick, variant = "outline", className = "" }) {
  const label = signedIn ? "Add demo companies to my book" : "Load demo companies";
  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={running}
      data-demo="load-demo"
      className={`h-9 rounded-sm px-3.5 ${className}`}
    >
      {running ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Building2 aria-hidden="true" />}
      {running ? "Loading demo" : label}
    </Button>
  );
}
