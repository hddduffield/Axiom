// Proxy-context Supabase client.
//
// In Next.js 16, the file formerly known as `middleware.ts` is `proxy.ts`,
// and its cookie surface is the request/response pair (not `next/headers`).
// This factory returns both the client AND the response object that has
// any session-refresh cookies written onto it; the proxy must return that
// response object so the refreshed cookie reaches the browser.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export function createProxyClient(request: NextRequest) {
  // Mutable response we'll return from proxy. Re-created here so cookie
  // writes attach correctly.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  return { supabase, response: () => response };
}
