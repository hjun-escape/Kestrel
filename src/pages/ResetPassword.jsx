import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";
import FormError from "@/components/auth/FormError";
import { PasswordField } from "@/components/auth/FormField";
import SubmitButton, { linkClass } from "@/components/auth/SubmitButton";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The two passwords do not match. Re-enter them and try again.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "The reset link may have expired. Request a new one and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        title="Reset link not valid"
        subtitle="This link is missing its token or is incomplete."
        footer={
          <Link to="/forgot-password" className={linkClass}>
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-slate-800">
          Open the link from the most recent reset email, or request a new one.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You will sign in with it next.">
      <FormError message={error} />
      <form onSubmit={handleSubmit} className="space-y-5" aria-describedby="form-error">
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          autoFocus
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          invalid={!!error && newPassword !== confirmPassword}
          required
        />
        <SubmitButton loading={loading} loadingLabel="Saving">
          Save password
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
