import { requireAdvisor } from "@/lib/api/auth";
import { ok } from "@/lib/api/respond";

// GET /api/advisors/me — current signed-in advisor.
//
// requireAdvisor() already loaded the row to verify active=true; we just
// hand it back. No second query needed.
export async function GET() {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  return ok(auth.advisor);
}
