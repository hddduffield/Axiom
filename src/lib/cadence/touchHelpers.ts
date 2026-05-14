// Phase 17.3 — Last meaningful contact tracking.
//
// Stamps clients.last_meaningful_contact_at = NOW() whenever the
// system observes a "meaningful" interaction with that client. The
// Going Stale dashboard module (Phase 17.8) uses this stamp + the
// client's cadence_target_days to decide overdue rows.
//
// Call this from route handlers AFTER the primary mutation has
// committed. Failures here are intentionally non-fatal — the touch
// is best-effort telemetry, not a transaction guarantee. We log to
// console but do not surface the error to the caller.
//
// Triggers wired in Phase 17:
//   - notes POST           → "note"
//   - plans approve        → "plan_approved"
//   - plans generate accept→ "plan_generated"
//   - lens cash-flow finalize / estate finalize → "lens_finalized"
//   - action-items PATCH status=complete → "action_completed"
//
// The "meeting_logged" type is reserved for a v1.5 first-class
// meetings table.

import type { AppSupabaseClient } from "@/lib/api/auth";

export type MeaningfulTouchType =
  | "note"
  | "plan_approved"
  | "plan_generated"
  | "lens_finalized"
  | "action_completed"
  | "meeting_logged";

export async function recordMeaningfulTouch(
  supabase: AppSupabaseClient,
  clientId: string,
  touchType: MeaningfulTouchType,
  actorAdvisorId?: string | null,
): Promise<void> {
  const stamp = new Date().toISOString();

  // Primary effect: bump the cadence-watch clock on clients.
  const { error: touchErr } = await supabase
    .from("clients")
    .update({ last_meaningful_contact_at: stamp })
    .eq("id", clientId);

  if (touchErr) {
    console.warn(
      `[cadence] recordMeaningfulTouch failed to update clients.last_meaningful_contact_at (${touchType}, ${clientId}): ${touchErr.message}`,
    );
    return;
  }

  // Secondary effect: audit log. The audit_log entity_type enum is
  // closed ('client'|'plan'|'action_item'|'note'|'lens_run'|'partner')
  // and action is closed ('created'|'updated'|'deleted'|'approved'|
  // 'completed'). We log against entity='client', action='updated'
  // with the touch type and stamp in details — this preserves the
  // historical trail without expanding the enums.
  try {
    await supabase.from("audit_log").insert({
      actor_advisor_id: actorAdvisorId ?? null,
      entity_type: "client",
      entity_id: clientId,
      action: "updated",
      details: {
        kind: "meaningful_touch",
        touch_type: touchType,
        at: stamp,
      },
    });
  } catch (e) {
    // Audit log writes are best-effort.
    console.warn(
      `[cadence] audit_log insert failed (${touchType}, ${clientId}):`,
      (e as Error).message,
    );
  }
}
