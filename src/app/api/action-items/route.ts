import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err, list } from "@/lib/api/respond";
import { LIST_ACTION_ITEMS } from "@/lib/api/_mocks";
import type { ActionItem } from "@/lib/api/types";

const createSchema = z.object({
  client_id: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  duration_class: z.enum(["one_time", "long_running"]),
  timing_bucket: z.string().min(1),
  owner: z.string().min(1),
  partner_required: z.boolean().optional(),
  partner_type: z.string().nullable().optional(),
  parent_action_item_id: z.string().nullable().optional(),
});

// GET /api/action-items — global list with filters.
// TODO: Phase 5 — supabase.from("action_items").select(...).match(filters)
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner");
  const status = url.searchParams.get("status");
  const timingBucket = url.searchParams.get("timing_bucket");
  const clientId = url.searchParams.get("client_id");
  const partnerRequiredParam = url.searchParams.get("partner_required");

  let items = LIST_ACTION_ITEMS;
  if (owner) items = items.filter((a) => a.owner === owner);
  if (status) items = items.filter((a) => a.status === status);
  if (timingBucket) items = items.filter((a) => a.timing_bucket === timingBucket);
  if (clientId) items = items.filter((a) => a.client_id === clientId);
  if (partnerRequiredParam !== null) {
    const want = partnerRequiredParam === "true";
    items = items.filter((a) => a.partner_required === want);
  }
  return list(items);
}

// POST /api/action-items — create manual action item.
// TODO: Phase 5 — supabase.from("action_items").insert(...).select().single()
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

  const now = new Date().toISOString();
  const newItem: ActionItem = {
    id: `mock-ai-new-${Math.random().toString(36).slice(2, 8)}`,
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
    completed_at: null,
    completed_by_advisor_id: null,
    is_derivative_reminder: false,
    auto_generated_reminder_template: null,
    created_at: now,
    updated_at: now,
  };
  return created(newItem);
}
