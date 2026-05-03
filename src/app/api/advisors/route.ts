import { requireAdvisor } from "@/lib/api/auth";
import { list } from "@/lib/api/respond";
import { LIST_ADVISORS } from "@/lib/api/_mocks";

// GET /api/advisors — list all advisors (used for owner selectors).
// TODO: Phase 5 — replace mock with `await supabase.from("advisors").select("*")`.
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const activeParam = url.searchParams.get("active");
  let items = LIST_ADVISORS;
  if (activeParam !== null) {
    const wantActive = activeParam === "true";
    items = items.filter((a) => a.active === wantActive);
  }
  return list(items);
}
