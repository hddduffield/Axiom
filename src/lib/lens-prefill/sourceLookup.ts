// Phase 16.1 — Look up the latest finalized plan for a given client.
//
// "Finalized" means status ∈ {ready_for_review, approved, archived} —
// any plan whose Stage 1 finished. We DO NOT pull from queued/processing/
// failed plans (stage1_output may be missing or partial).
//
// Returns the most recent such plan + its raw stage1_output JSONB.

import type { AppSupabaseClient } from "@/lib/api/auth";
import type { ClientProfile } from "@/lib/orchestrator/schemas/clientProfile";
import type { PlanStatus } from "@/lib/supabase/database.types";

export interface LatestFinalizedPlan {
  plan_id: string;
  client_profile: ClientProfile;
  generated_at: string;
  status: string;
}

const FINALIZED_STATUSES: PlanStatus[] = [
  "ready_for_review",
  "approved",
  "archived",
];

export async function getLatestFinalizedPlanForClient(
  supabase: AppSupabaseClient,
  clientId: string,
): Promise<LatestFinalizedPlan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, stage1_output, generated_at, status")
    .eq("client_id", clientId)
    .in("status", FINALIZED_STATUSES)
    .not("stage1_output", "is", null)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.stage1_output) return null;
  // We trust the persisted shape — Stage 1 has its own Zod validation.
  // Defensively check that it looks like a ClientProfile.
  const cp = data.stage1_output as unknown as ClientProfile;
  if (typeof cp !== "object" || cp === null || !("client_and_family" in cp)) {
    return null;
  }
  return {
    plan_id: data.id,
    client_profile: cp,
    generated_at: data.generated_at,
    status: data.status,
  };
}
