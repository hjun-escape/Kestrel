import React, { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_CLASS =
  "h-11 rounded-md border-slate-400 bg-white focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

// Labeled input. `hint` is read with the field; `invalid` sets aria-invalid.
export const FormField = forwardRef(function FormField(
  { id, label, hint, invalid, labelAction, children, className = "", ...inputProps },
  ref
) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium text-slate-900">{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={hintId}
          className={`${FIELD_CLASS} ${className}`}
          {...inputProps}
        />
        {children}
      </div>
      {hint && <p id={hintId} className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
});

export const PasswordField = forwardRef(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField ref={ref} type={visible ? "text" : "password"} className="pr-12" {...props}>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center rounded p-2 text-slate-700 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </FormField>
  );
});
