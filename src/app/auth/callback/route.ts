// Magic-link callback. Supabase Auth redirects here with a `code` query
// param after the user clicks the email link; we exchange it for a
// session via supabase.auth.exchangeCodeForSession() and then bounce to
// the original destination.
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
