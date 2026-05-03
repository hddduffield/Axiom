// Next.js 16 Proxy (renamed from middleware in v16). Auth gate.
//
// Behavior:
//   - Always refresh the Supabase session cookie via getUser() so it's
//     fresh in every request (proxy-context client writes it onto the
//     response object we return).
//   - Public paths (/sign-in, /auth/*) pass through untouched.
//   - Protected HTML routes (everything else under /(app)/*) require BOTH
//     a valid Supabase session AND an `advisors` row with active = true.
//     Failures redirect to /sign-in.
//   - Already-signed-in users hitting /sign-in are bounced to /dashboard.
//   - Protected /api/* routes return JSON 401 instead of an HTML redirect
//     so API consumers can react programmatically.

import { NextResponse, type NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase/proxy";

const PUBLIC_PATH_PREFIXES = ["/sign-in", "/auth"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return false; // root resolves to /dashboard via redirect
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}

export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request);
  const { pathname } = request.nextUrl;

  // Refresh the session — this writes the refreshed cookie onto `response`
  // through the setAll callback wired in createProxyClient.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public path: skip the active-advisor check, but still send back the
  // refreshed cookies in case the user IS signed in.
  if (isPublicPath(pathname)) {
    if (user && pathname.startsWith("/sign-in")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return response();
  }

  // Protected: must be signed in.
  if (!user) {
    if (isApiPath(pathname)) {
      return jsonError(401, "unauthenticated", "No active session.");
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Session exists — verify the user is an active advisor.
  const { data: advisor } = await supabase
    .from("advisors")
    .select("id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!advisor || !advisor.active) {
    await supabase.auth.signOut();
    if (isApiPath(pathname)) {
      return jsonError(403, "not_authorized", "Account is not an active PSA Wealth advisor.");
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(url);
  }

  return response();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
