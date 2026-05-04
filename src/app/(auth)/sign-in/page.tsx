import Image from "next/image";

import { SignInForm } from "./sign-in-form";
import "./sign-in.css";

interface SignInPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized:
    "That email isn't on the PSA Wealth advisor list. Ask Hayden if you should have access.",
  auth: "Sign-in link couldn't be exchanged. Try requesting a new one.",
};

// Phase 9.21: variant swapped from sp-classic to sp-mglass2
// (modern-glass-v2) per Claude Design tweak default. Two-pane layout
// preserved; left panel gains animated mesh + grid + the PSA full-white
// logo image; right panel renders the form inside a frosted-glass card
// with floating-label input + arrow-icon CTA. Class structure mirrors
// view-notes-signin.jsx's SigninModernGlassV2 1:1 so future tweak diffs
// stay clean.
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <div className="sp-mglass2">
      <aside className="sp-mglass2__panel">
        <div className="sp-mglass2__mesh" />
        <div className="sp-mglass2__grid" />
        <div className="sp-mglass2__logo-wrap">
          <Image
            src="/psa-logo-full-white.png"
            alt="PSA Wealth"
            className="sp-mglass2__logo"
            width={520}
            height={208}
            priority
          />
        </div>
        <div className="sp-mglass2__panel-foot">PSA · ADVISOR OS · 2026</div>
      </aside>

      <main className="sp-mglass2__main">
        <div className="sp-mglass2__top">
          <span className="sp-mglass2__axiom">Axiom</span>
        </div>
        <div className="sp-mglass2__card-wrap">
          <div className="sp-mglass2__card">
            <SignInForm
              redirectTo={params.redirect ?? "/dashboard"}
              errorMessage={errorMessage}
            />
          </div>
          <div className="sp-mglass2__legal">© 2026 PSA Wealth</div>
        </div>
      </main>
    </div>
  );
}
