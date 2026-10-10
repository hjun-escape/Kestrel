import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import FormError from "@/components/auth/FormError";
import { FormField, PasswordField } from "@/components/auth/FormField";
import SubmitButton, { linkClass } from "@/components/auth/SubmitButton";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Check your email and password, then try again.");
      emailRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your work account to open the loan book."
      footer={
        <>
          Need access?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className={linkClass}
          >
            Request an account
          </Link>
        </>
      }
    >
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-5" aria-describedby="form-error">
        <FormField
          ref={emailRef}
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={!!error}
          required
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={!!error}
          required
          labelAction={
            <Link to="/forgot-password" className={`text-xs ${linkClass}`}>
              Forgot password
            </Link>
          }
        />
        <SubmitButton loading={loading} loadingLabel="Signing in">
          Sign in
        </SubmitButton>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-600" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-slate-200" />
        <span aria-hidden="true">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-md border-slate-400 font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        onClick={handleGoogle}
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        Continue with Google
      </Button>
    </AuthLayout>
  );
}
