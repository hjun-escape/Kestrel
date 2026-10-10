import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import { FormField } from "@/components/auth/FormField";
import SubmitButton, { linkClass } from "@/components/auth/SubmitButton";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {
      // Deliberately identical outcome either way: do not reveal which
      // emails have accounts.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your work email and we will send a reset link."
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      <div role="status" aria-live="polite">
        {sent && (
          <p className="mb-5 border-l-2 border-slate-900 bg-slate-100 px-3 py-2.5 text-sm text-slate-900">
            If an account exists for {email}, a reset link is on its way. The link expires, so use it soon.
          </p>
        )}
      </div>
      {!sent && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <SubmitButton loading={loading} loadingLabel="Sending">
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
