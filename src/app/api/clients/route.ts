import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err, list } from "@/lib/api/respond";
import {
  clampLimit,
  dbErrorMessage,
  decodeCursor,
  encodeCursor,
  mapDbError,
} from "@/lib/api/db_queries";

const createSchema = z.object({
  lead_advisor_id: z.string().uuid().optional(),
  household_name: z.string().min(1),
  status: z.enum(["active", "inactive", "prospect"]).optional(),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/clients — list clients with filters + cursor pagination.
//
// Sort: created_at desc, id desc (tiebreaker for stable keyset paging).
// Cursor encodes { id: <last_id>, key: <last_created_at> }.
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const leadAdvisorId = url.searchParams.get("lead_advisor_id");
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  let q = auth.supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status) {
    const parsedStatus = z.enum(["active", "inactive", "prospect"]).safeParse(status);
    if (parsedStatus.success) q = q.eq("status", parsedStatus.data);
  }
  if (leadAdvisorId) q = q.eq("lead_advisor_id", leadAdvisorId);
  if (cursor) {
    const key = String(cursor.key);
    q = q.or(`created_at.lt.${key},and(created_at.eq.${key},id.lt.${cursor.id})`);
  }

  const { data, error } = await q;
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore && items.length > 0
    ? encodeCursor({ id: items[items.length - 1].id, key: items[items.length - 1].created_at })
    : null;
  return list(items, next);
}

// POST /api/clients — create.
// `lead_advisor_id` defaults to the current signed-in advisor when omitted.
export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid client payload.", parsed.error.issues);
  }

  const { data, error } = await auth.supabase
    .from("clients")
    .insert({
      lead_advisor_id: parsed.data.lead_advisor_id ?? auth.advisor.id,
      household_name: parsed.data.household_name,
      status: parsed.data.status ?? "prospect",
      archetype: parsed.data.archetype ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='client', action='created').
  return created(data);
}
