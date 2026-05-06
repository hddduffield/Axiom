"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

// Phase 12: web sign-in migrated from magic-link to OTP code. Corporate
// email URL prefetchers (Microsoft Safe Links, Mimecast, etc.) consume
// the one-time code embedded in magic links before the user clicks; the
// 6-digit code lives in the email body where prefetchers don't trigger
// it. Mobile (mobile/app/(auth)/*.tsx) has been on this flow since
// Phase 7 — same Supabase API (signInWithOtp + verifyOtp), now mirrored
// on web.
//
// Flow:
//   1. Email entry → signInWithOtp({ email, shouldCreateUser:false })
//      with NO emailRedirectTo (its presence is what flips Supabase
//      from OTP-code mode to magic-link mode).
//   2. Code entry → verifyOtp({ email, token, type:'email' }). On
//      success a full-page navigation to redirectTo lets the proxy
//      read the new session cookie cleanly.
//
// Phase 9.21 sp-mglass2 (modern-glass-v2) styling preserved — bare
// <input>+sibling<label> structure for the floating-label CSS hooks.
//
// /auth/callback still exists (legacy magic-link path) so any link
// already in flight from a prior request keeps working.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;
const RESEND_COOLDOWN_SECONDS = 60;

interface SignInFormProps {
  redirectTo: string;
  errorMessage: string | null;
}

function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 9 H15 M10 4 L15 9 L10 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SignInForm({ redirectTo, errorMessage }: SignInFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const validEmail = EMAIL_RE.test(email);
  const validCode = CODE_RE.test(code);
  const showEmailError = email.length > 0 && !validEmail;

  useEffect(() => {
    if (step !== "code") return;
    const id = setTimeout(() => codeInputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [resendCooldown]);

  async function sendCode(emailValue: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: { shouldCreateUser: false },
    });
    return error;
  }

  async function onEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validEmail || submitting) return;

    setSubmitting(true);
    const error = await sendCode(email);
    setSubmitting(false);

    if (error) {
      toast.error("Couldn't send code", { description: error.message });
      return;
    }

    setStep("code");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast.success("Code sent — check your email");
  }

  async function onCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validCode || submitting) return;

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      setSubmitting(false);
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("expire")) {
        toast.error("Code expired", {
          description: "Tap Resend below for a new code.",
        });
      } else if (msg.includes("invalid") || msg.includes("token")) {
        toast.error("Invalid code", {
          description: "Double-check the email and try again.",
        });
        setCode("");
        codeInputRef.current?.focus();
      } else {
        toast.error("Couldn't verify code", { description: error.message });
      }
      return;
    }

    // Full-page navigation so the proxy reads the freshly-set session
    // cookie when routing to /dashboard.
    window.location.assign(redirectTo);
  }

  async function onResend() {
    if (resendCooldown > 0 || submitting) return;
    setSubmitting(true);
    const error = await sendCode(email);
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't resend code", { description: error.message });
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setCode("");
    codeInputRef.current?.focus();
    toast.success("New code sent");
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setResendCooldown(0);
  }

  return (
    <>
      <h1 className="sp-mglass2__title">
        {step === "email" ? "Welcome back." : "Enter your code."}
      </h1>

      {errorMessage && step === "email" ? (
        <div className="sp-mglass2__error">{errorMessage}</div>
      ) : null}

      {step === "email" ? (
        <form onSubmit={onEmailSubmit} className="sp-mglass2__form">
          <div
            className={`sp-mglass2__field${email ? " is-filled" : ""}${
              showEmailError ? " is-err" : ""
            }`}
          >
            <input
              id="mg2-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              autoComplete="email"
              autoFocus
              disabled={submitting}
            />
            <label htmlFor="mg2-email">Email</label>
          </div>
          {showEmailError ? (
            <div className="sp-mglass2__err">Enter a valid email address.</div>
          ) : null}
          <button
            type="submit"
            className="sp-mglass2__cta"
            disabled={!validEmail || submitting}
          >
            <span>{submitting ? "Sending…" : "Send 6-digit code"}</span>
            <ArrowRight />
          </button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} className="sp-mglass2__form">
          <div className="sp-mglass2__sent-row">
            <div className="sp-mglass2__sent-icon">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <div className="sp-mglass2__sent-title">Code sent</div>
              <div className="sp-mglass2__sent-sub">
                to <span className="mono">{email}</span> — it may take a moment
                to arrive.
              </div>
            </div>
          </div>
          <input
            ref={codeInputRef}
            id="mg2-code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            maxLength={6}
            aria-label="Six-digit verification code"
            placeholder="······"
            className="sp-mglass2__code"
            disabled={submitting}
          />
          <button
            type="submit"
            className="sp-mglass2__cta"
            disabled={!validCode || submitting}
          >
            <span>{submitting ? "Verifying…" : "Verify and sign in"}</span>
            <ArrowRight />
          </button>
          <div className="sp-mglass2__row">
            <button
              type="button"
              className="sp-mglass2__ghost"
              onClick={backToEmail}
              disabled={submitting}
            >
              Use a different email
            </button>
            <button
              type="button"
              className="sp-mglass2__ghost"
              onClick={onResend}
              disabled={resendCooldown > 0 || submitting}
            >
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
