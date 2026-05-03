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
  client_id: z.string().uuid(),
  description: z.string().min(1),
  category: z.string().min(1),
  duration_class: z.enum(["one_time", "long_running"]),
  timing_bucket: z.string().min(1),
  owner: z.string().min(1),
  partner_required: z.boolean().optional(),
  partner_type: z.string().nullable().optional(),
  parent_action_item_id: z.string().uuid().nullable().optional(),
});

// GET /api/action-items — list with filters + cursor pagination.
//
// Sort: created_at desc, id desc. Cursor encodes the last row's
// (created_at, id) pair for keyset paging.
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const status = url.searchParams.get("status");
  const timingBucket = url.searchParams.get("timing_bucket");
  const clientId = url.searchParams.get("client_id");
  const partnerRequiredParam = url.searchParams.get("partner_required");
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  let q = auth.supabase
    .from("action_items")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (owner) q = q.eq("owner", owner);
  if (status) {
    const parsedStatus = z
      .enum(["not_started", "in_progress", "pending_decision", "complete"])
      .safeParse(status);
    if (parsedStatus.success) q = q.eq("status", parsedStatus.data);
  }
  if (timingBucket) q = q.eq("timing_bucket", timingBucket);
  if (clientId) q = q.eq("client_id", clientId);
  if (partnerRequiredParam !== null) {
    q = q.eq("partner_required", partnerRequiredParam === "true");
  }
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

// POST /api/action-items — create a manual action item (no source_plan).
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
    return err("validation_failed", "Invalid action item payload.", parsed.error.issues);
  }

  const { data, error } = await auth.supabase
    .from("action_items")
    .insert({
      client_id: parsed.data.client_id,
      source_plan_id: null,
      source_lens_run_id: null,
      parent_action_item_id: parsed.data.parent_action_item_id ?? null,
      description: parsed.data.description,
      category: parsed.data.category,
      duration_class: parsed.data.duration_class,
      timing_bucket: parsed.data.timing_bucket,
      owner: parsed.data.owner,
      partner_required: parsed.data.partner_required ?? false,
      partner_type: parsed.data.partner_type ?? null,
      status: "not_started",
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='action_item', action='created').
  return created(data);
}
