import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root entry. Session-aware: signed-in users go to the dashboard,
// everyone else is bounced to sign-in. The proxy enforces auth on
// /(app)/* — this redirect is the canonical "where do I land?" handler.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/sign-in");
}
