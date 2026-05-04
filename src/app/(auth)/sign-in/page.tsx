import { SignInForm } from "./sign-in-form";

interface SignInPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized:
    "That email isn't on the PSA Wealth advisor list. Ask Hayden if you should have access.",
  auth: "Sign-in link couldn't be exchanged. Try requesting a new one.",
};

// Server Component shell for the SigninSplit (sp-classic) variant from
// Claude Design's view-notes-signin.jsx. Two-pane full-bleed layout:
//
//   ┌─────────────────────┬─────────────────────┐
//   │  PSA navy panel     │  Axiom ivory panel  │
//   │  (PSA Wealth mark)  │  (Axiom wordmark +  │
//   │                     │   sign-in form)     │
//   └─────────────────────┴─────────────────────┘
//
// PSA Wealth logo: Hayden will provide a file at public/psa-logo-white.svg
// (or similar). Until then, the left panel renders a text wordmark.
//
// Form wiring preserved verbatim (RHF + zod + sonner + magic-link
// signInWithOtp). Only the visual chrome changed.
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <div
      className="grid min-h-svh w-full overflow-hidden md:grid-cols-2"
      style={{ background: "var(--surface)" }}
    >
      {/* Left: PSA brand panel */}
      <aside
        className="relative hidden flex-col items-center justify-center p-10 md:flex"
        style={{ background: "var(--psa-navy-deep)", color: "var(--n-0)" }}
      >
        {/* Subtle radial gradient texture matching styles.css :after */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 100%, rgba(255,255,255,0.06), transparent 50%), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.04), transparent 40%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* PSA Wealth wordmark — placeholder until logo file lands at
              public/psa-logo-white.svg. The clamp() width matches Claude
              Design's --big-logo sizing. */}
          <div
            className="font-semibold tracking-wide"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(40px, 5vw, 64px)",
              letterSpacing: "0.02em",
              color: "var(--n-0)",
              opacity: 0.95,
            }}
          >
            PSA Wealth
          </div>
        </div>
      </aside>

      {/* Right: Axiom ivory panel */}
      <main
        className="relative flex flex-col justify-between p-8 md:p-10"
        style={{ background: "var(--surface)" }}
      >
        {/* Axiom wordmark, top-right (top-left on mobile) */}
        <div
          className="absolute top-8 left-8 md:left-auto md:right-10 md:top-8 z-10"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          Axiom
        </div>

        {/* Form, vertically centered */}
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pt-20 md:pt-0">
          <div className="mb-6">
            <h1
              className="mb-1 text-lg font-medium"
              style={{ letterSpacing: "-0.01em", color: "var(--text)" }}
            >
              Sign in
            </h1>
            <p className="text-xs" style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
              Enter your PSA Wealth email — we&rsquo;ll send a magic link.
            </p>
          </div>

          {errorMessage ? (
            <p
              className="mb-4 rounded-md border p-3 text-xs"
              style={{
                borderColor: "var(--status-red-border)",
                background: "var(--status-red-bg)",
                color: "var(--s-red)",
              }}
            >
              {errorMessage}
            </p>
          ) : null}

          <SignInForm redirectTo={params.redirect ?? "/dashboard"} />
        </div>

        {/* Legal footer */}
        <footer
          className="mt-auto flex items-center justify-between border-t pt-6"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            © 2026 PSA Wealth
          </span>
        </footer>
      </main>
    </div>
  );
}
