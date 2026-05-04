"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

// Web auth — magic link via supabase.auth.signInWithOtp + emailRedirectTo
// pointing at /auth/callback (which exchanges the code via
// exchangeCodeForSession). Mobile takes a different path (OTP code, see
// mobile/app/(auth)/sign-in.tsx); the web path stays click-the-link.
//
// Phase 9.21: re-skinned for sp-mglass2 (modern-glass-v2) variant.
// Floating-label field replaces the shadcn Form/Input stack — the
// floating-label CSS in sign-in.css needs the bare <input> + sibling
// <label> structure to drive `:focus + label` and `.is-filled label`
// transitions. Arrow-icon CTA replaces the shadcn Button.
//
// The "Continue to demo dashboard →" button from the source mockup is
// intentionally omitted (production users click the email link, not an
// in-app button — see prior Phase 9.2 rationale).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const valid = EMAIL_RE.test(email);
  const showFieldError = email.length > 0 && !valid;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting) return;

    setSubmitting(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", redirectTo);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    setSubmitting(false);

    if (error) {
      toast.error("Couldn't send sign-in link", { description: error.message });
      return;
    }

    setSentEmail(email);
    setSent(true);
    toast.success("Check your email for a sign-in link");
  }

  return (
    <>
      <h1 className="sp-mglass2__title">
        {sent ? "Check your inbox." : "Welcome back."}
      </h1>

      {errorMessage ? (
        <div className="sp-mglass2__error">{errorMessage}</div>
      ) : null}

      {!sent ? (
        <form onSubmit={onSubmit} className="sp-mglass2__form">
          <div
            className={`sp-mglass2__field${email ? " is-filled" : ""}${
              showFieldError ? " is-err" : ""
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
          {showFieldError ? (
            <div className="sp-mglass2__err">Enter a valid email address.</div>
          ) : null}
          <button
            type="submit"
            className="sp-mglass2__cta"
            disabled={!valid || submitting}
            data-api="POST /api/auth/magic-link"
          >
            <span>{submitting ? "Sending…" : "Request one-time code"}</span>
            <ArrowRight />
          </button>
        </form>
      ) : (
        <div className="sp-mglass2__sent">
          <div className="sp-mglass2__sent-row">
            <div className="sp-mglass2__sent-icon">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <div className="sp-mglass2__sent-title">One-time code sent</div>
              <div className="sp-mglass2__sent-sub">
                to <span className="mono">{sentEmail}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="sp-mglass2__ghost"
            onClick={() => {
              setSent(false);
              setSentEmail("");
              setEmail("");
            }}
          >
            Use a different email
          </button>
        </div>
      )}
    </>
  );
}
