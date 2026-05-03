// Auth helpers for route handlers.
//
// Even though `proxy.ts` already gates protected routes on session +
// active-advisor, route handlers re-validate locally so:
//   1. They can access the typed `Advisor` for the current user (e.g.,
//      to populate `author_advisor_id` on inserts).
//   2. They are robust against future proxy-matcher changes.
//
//   const result = await requireAdvisor();
//   if (!result.ok) return result.response; // already a 401/403 response
//   const { advisor, supabase } = result;

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { err } from "./respond";
import type { NextResponse } from "next/server";

export type AppSupabaseClient = SupabaseClient<Database>;

export type AdvisorRow = Database["public"]["Tables"]["advisors"]["Row"];

export type RequireAdvisorResult =
  | {
      ok: true;
      advisor: AdvisorRow;
      supabase: AppSupabaseClient;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAdvisor(): Promise<RequireAdvisorResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: err("unauthenticated", "No active session.") };
  }
  const { data: advisor } = await supabase
    .from("advisors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor || !advisor.active) {
    return {
      ok: false,
      response: err("not_authorized", "Account is not an active PSA Wealth advisor."),
    };
  }
  return { ok: true, advisor, supabase };
}
