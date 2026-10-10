import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import FormError from "@/components/auth/FormError";
import { FormField, PasswordField } from "@/components/auth/FormField";
import SubmitButton, { linkClass } from "@/components/auth/SubmitButton";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

// TODO: set to true once the Google provider is confirmed enabled for this Base44 app.
const SHOW_GOOGLE = false;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("The two passwords do not match. Re-enter them and try again.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(err.message || "We could not create the account. Check the details and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "That code is not valid. Check it or request a new one.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast({
        title: "Code sent",
        description: "Check your email for the new code.",
      });
    } catch (err) {
      setError(err.message || "We could not send a new code. Try again in a minute.");
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  if (showOtp) {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle={`Enter the 6-digit code we sent to ${email}.`}
        footer={
          <>
            No code yet?{" "}
            <button type="button" onClick={handleResend} className={linkClass}>
              Send a new code
            </button>
          </>
        }
      >
        <FormError message={error} />
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-sm font-medium text-slate-900">Verification code</Label>
            <InputOTP
              id="otp"
              maxLength={6}
              value={otpCode}
              onChange={setOtpCode}
              autoFocus
              autoComplete="one-time-code"
              aria-invalid={error ? "true" : undefined}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-11 w-11 border-slate-400" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <SubmitButton loading={loading} loadingLabel="Verifying" disabled={loading || otpCode.length < 6}>
            Verify email
          </SubmitButton>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Request an account"
      subtitle="Create credentials with your work email. Access is limited to authorized staff."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className={linkClass}
          >
            Sign in
          </Link>
        </>
      }
    >
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-5" aria-describedby="form-error">
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
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordField
          id="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          invalid={!!error && password !== confirmPassword}
          required
        />
        <SubmitButton loading={loading} loadingLabel="Creating account">
          Create account
        </SubmitButton>
      </form>

      {SHOW_GOOGLE && (
        <>
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
        </>
      )}
    </AuthLayout>
  );
}
