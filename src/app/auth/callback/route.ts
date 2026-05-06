// Magic-link callback (legacy fallback path).
//
// Phase 12: the primary sign-in flow is now OTP code entry — see
// src/app/(auth)/sign-in/sign-in-form.tsx. This route is kept for
// backward compatibility so any magic link still in flight (in someone's
// inbox from before the cutover, or from a future surface that opts back
// into emailRedirectTo) continues to work. Supabase Auth redirects here
// with a `code` query param; we exchange it for a session via
// supabase.auth.exchangeCodeForSession() and bounce to the destination.
//
// Sits OUTSIDE the (auth) and (app) route groups so it isn't accidentally
// gated by either layout.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
