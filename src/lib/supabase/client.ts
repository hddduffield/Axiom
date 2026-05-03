// Browser-side Supabase client.
//
// Use from Client Components that need to read or mutate via Supabase
// directly (e.g., the sign-in form calling `signInWithOtp`). The cookie
// handoff is fully managed by `@supabase/ssr`'s `createBrowserClient`.
//
//   "use client"
//   import { createClient } from "@/lib/supabase/client";
//   const supabase = createClient();

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
