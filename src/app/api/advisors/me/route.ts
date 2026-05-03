import { requireAdvisor } from "@/lib/api/auth";
import { ok } from "@/lib/api/respond";

// GET /api/advisors/me — current signed-in advisor.
export async function GET() {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  return ok(auth.advisor);
}
