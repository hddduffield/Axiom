// Phase 5d — action item lifecycle business logic.
//
// Two transitions trigger downstream effects:
//
//   1. Long-running parent → in_progress (first time)
//      Spawn a derivative reminder so the advisor has a follow-up nudge
//      after the parent's check_in cadence elapses. The parent's
//      `auto_generated_reminder_template` (populated by Stage 3a for
//      every long_running ActionItem) becomes the reminder's description.
//
//   2. Any parent → complete (first time)
//      Auto-close every open derivative reminder under that parent.
//      Once the parent is done, follow-up reminders are noise.
//
// Both functions are idempotent: calling them on transitions they don't
// match is a no-op. Calling them after the trigger has already fired
// (e.g., flipping in_progress → in_progress, or completing a parent
// twice) won't double-spawn or re-close.
//
// These run *after* the parent's UPDATE has committed, on the API path
// (PATCH /api/action-items/[id], POST /api/notes/[id]/promote-to-action).
// They use the caller's Supabase client (RLS-gated), not the service
// role.

import type { AppSupabaseClient } from "./auth";
import type { Database } from "@/lib/supabase/database.types";

type ActionItem = Database["public"]["Tables"]["action_items"]["Row"];
type ActionItemStatus = ActionItem["status"];

const DERIVATIVE_DEFAULT_TIMING_BUCKET = "next_30_days";

// ────────────────────────────────────────────────────────────────────────
// spawnDerivativeReminderIfNeeded
// ────────────────────────────────────────────────────────────────────────

export async function spawnDerivativeReminderIfNeeded(
  supabase: AppSupabaseClient,
  parent: ActionItem,
  oldStatus: ActionItemStatus,
  newStatus: ActionItemStatus,
): Promise<ActionItem | null> {
  // Trigger guards.
  if (newStatus !== "in_progress" || oldStatus === "in_progress") return null;
  if (parent.duration_class !== "long_running") return null;
  if (!parent.auto_generated_reminder_template) return null;
  // Don't spawn against derivatives themselves — recursion stop. (A
  // derivative's auto_generated_reminder_template is always null per
  // the insert below, so this is belt-and-suspenders.)
  if (parent.is_derivative_reminder) return null;

  // Idempotency: if a derivative already exists for this parent, no-op.
  const { data: existing, error: existingErr } = await supabase
    .from("action_items")
    .select("id")
    .eq("parent_action_item_id", parent.id)
    .eq("is_derivative_reminder", true)
    .limit(1)
    .maybeSingle();
  if (existingErr) {
    // Surface DB errors to the caller — the PATCH handler's response
    // shape can include the error context. Throwing here would mask the
    // parent update which already succeeded.
    throw new Error(
      `Could not check for existing derivative reminder on ${parent.id}: ${existingErr.message}`,
    );
  }
  if (existing) return null;

  // Spawn. Inherits source_plan_id / source_lens_run_id from parent so
  // the "show all action items from plan X" query naturally includes
  // the spawned reminder.
  const { data: spawned, error: spawnErr } = await supabase
    .from("action_items")
    .insert({
      client_id: parent.client_id,
      source_plan_id: parent.source_plan_id,
      source_lens_run_id: parent.source_lens_run_id,
      parent_action_item_id: parent.id,
      description: parent.auto_generated_reminder_template,
      category: parent.category,
      duration_class: "one_time",
      timing_bucket: DERIVATIVE_DEFAULT_TIMING_BUCKET,
      owner: parent.owner,
      partner_required: parent.partner_required,
      partner_type: parent.partner_type,
      status: "not_started",
      is_derivative_reminder: true,
      // Reminders themselves do not spawn further reminders — null this
      // out explicitly so a buggy future PATCH on the derivative can't
      // accidentally fire another spawn.
      auto_generated_reminder_template: null,
    })
    .select("*")
    .single();
  if (spawnErr) {
    throw new Error(
      `Could not spawn derivative reminder for ${parent.id}: ${spawnErr.message}`,
    );
  }
  // TODO: Phase 5e — audit_log insert (entity='action_item', action='created', details={ spawned_by: parent.id, kind: 'derivative_reminder' }).
  return spawned;
}

// ────────────────────────────────────────────────────────────────────────
// closeDerivativeRemindersIfNeeded
// ────────────────────────────────────────────────────────────────────────

export async function closeDerivativeRemindersIfNeeded(
  supabase: AppSupabaseClient,
  parent: ActionItem,
  oldStatus: ActionItemStatus,
  newStatus: ActionItemStatus,
  closingAdvisorId: string,
): Promise<number> {
  if (newStatus !== "complete" || oldStatus === "complete") return 0;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("action_items")
    .update({
      status: "complete",
      completed_at: now,
      completed_by_advisor_id: closingAdvisorId,
    })
    .eq("parent_action_item_id", parent.id)
    .eq("is_derivative_reminder", true)
    .neq("status", "complete")
    .select("id");
  if (error) {
    throw new Error(
      `Could not auto-close derivative reminders for ${parent.id}: ${error.message}`,
    );
  }
  // TODO: Phase 5e — audit_log inserts (one per closed reminder, action='completed', details={ auto_closed_by_parent: parent.id }).
  return (data ?? []).length;
}
