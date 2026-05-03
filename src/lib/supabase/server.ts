// Server-side Supabase client.
//
// Use from Server Components, Route Handlers, and Server Actions:
//
//   import { createClient } from "@/lib/supabase/server";
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();
//
// Cookies are read via `next/headers`'s `cookies()`. Writes succeed in
// Route Handlers and Server Actions but throw in Server Components — the
// catch swallows that error because the `proxy.ts` middleware already
// refreshes the cookie on every request and writes it to the response.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll called from a Server Component — silently ignore;
            // proxy.ts handles cookie writes on the response.
          }
        },
      },
    },
  );
}
