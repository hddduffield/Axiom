// API contract — request and response types for every /api/* endpoint.
//
// This module is the source of truth for the wire format. Both the
// route handlers (server) and the API client (browser, used by Claude
// Design's React components) import from here.
//
// Convention: per-resource namespace; nested Request / Response interfaces.
// Keep these aligned with `specs/api/v1_contract.md`.

import type {
  Database,
  ClientStatus,
  ClientArchetype,
  PlanStatus,
  LensRunLensType,
  LensRunStatus,
  ActionItemDurationClass,
  ActionItemStatus,
} from "@/lib/supabase/database.types";

// Re-export shared enums so consumers don't need a second import.
export type {
  ClientStatus,
  ClientArchetype,
  PlanStatus,
  LensRunLensType,
  LensRunStatus,
  ActionItemDurationClass,
  ActionItemStatus,
};

// ────────────────────────────────────────────────────────────────────────
// Shared envelope shapes
// ────────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CursorList<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CursorListParams {
  limit?: number; // default 50, max 200
  cursor?: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Resource shapes — these are the canonical wire shapes (camelCase'd?
// No: snake_case to match the database, since Claude Design will be
// reading the DB types alongside the API types).
// ────────────────────────────────────────────────────────────────────────

export type Advisor = Database["public"]["Tables"]["advisors"]["Row"];

export type Client = Database["public"]["Tables"]["clients"]["Row"];

export type Plan = Database["public"]["Tables"]["plans"]["Row"];

export type ActionItem = Database["public"]["Tables"]["action_items"]["Row"];

export type Note = Database["public"]["Tables"]["notes"]["Row"];

export type LensRun = Database["public"]["Tables"]["lens_runs"]["Row"];

export type Partner = Database["public"]["Tables"]["partners"]["Row"];

// ────────────────────────────────────────────────────────────────────────
// Clients
// ────────────────────────────────────────────────────────────────────────

export namespace ClientsApi {
  export interface ListQuery extends CursorListParams {
    status?: ClientStatus;
    lead_advisor_id?: string;
  }
  export type ListResponse = CursorList<Client>;

  export interface CreateRequest {
    // Defaults to the current signed-in advisor when omitted (route handler
    // populates from session — see /api/clients POST).
    lead_advisor_id?: string;
    household_name: string;
    status?: ClientStatus;
    archetype?: ClientArchetype | null;
    notes?: string | null;
    // Phase 17.2 — Contact cadence; when omitted on create, the route
    // handler defaults from CADENCE_DEFAULTS_BY_ARCHETYPE.
    cadence_target_days?: number | null;
    cadence_custom_label?: string | null;
    // Phase 18.4 — initial context paragraph (rare on create).
    context_paragraph?: string | null;
  }
  export type CreateResponse = Client;

  export type GetResponse = Client;

  export interface UpdateRequest {
    lead_advisor_id?: string;
    household_name?: string;
    status?: ClientStatus;
    archetype?: ClientArchetype | null;
    notes?: string | null;
    cadence_target_days?: number | null;
    cadence_custom_label?: string | null;
    // Phase 18.4 — context paragraph. Server stamps context_updated_at
    // whenever this field is in the patch body.
    context_paragraph?: string | null;
  }
  export type UpdateResponse = Client;

  // DELETE returns 204 no content (soft-delete: status → inactive)

  // Phase 18.4 — AI-generated draft context paragraph. Caller saves
  // by calling PATCH /api/clients/[id] with context_paragraph in the
  // body; nothing is auto-persisted by the generate endpoint.
  export interface GenerateContextResponse {
    draft_paragraph: string;
    sources: {
      plan_id: string | null;
      lens_count: number;
      has_advisor_notes: boolean;
    };
    cost_cents: number;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Plans
// ────────────────────────────────────────────────────────────────────────

export namespace PlansApi {
  export interface ListByClientQuery extends CursorListParams {
    status?: PlanStatus;
  }
  export type ListByClientResponse = CursorList<Plan>;

  export type GetResponse = Plan;

  // Phase 5b generation request is multipart/form-data (NOT JSON). v1
  // skips Stages 0/1/2 — the advisor uploads the already-prepared
  // ClientProfile + SelectedRecommendations JSON blobs, which the CLI
  // (`scripts/generatePending.ts`) feeds into Stage 3a → 4 → 5.
  //
  //   client_id (form field, string UUID, required)
  //   fact_review_filename (form field, string, required, for record-keeping)
  //   clientprofile (File, JSON, required) — matches ClientProfileSchema
  //   selected_recommendations (File, JSON, required) — matches SelectedRecommendationsSchema
  //
  // Returns 202 Accepted with the new plan id so the UI can poll status.
  // The plan starts in `queued` and is claimed by the next CLI run.
  export interface GenerateAcceptedResponse {
    id: string;
    status: PlanStatus; // always "queued" on initial accept
    queued_at: string; // ISO 8601
    // Phase 10D.1 — non-blocking Stage 0 diagnostic warnings (e.g.,
    // section heuristic missed, archetype not detected, volatile rates
    // stale). Empty array = clean Stage 0 pass. The form surfaces these
    // as a yellow informational notice on the success state; the plan
    // still queues regardless.
    stage0_warnings?: string[];
  }

  // Dashboard-friendly slim view: queued + processing plans with the
  // joined client household name and submitting advisor's email.
  export interface QueuedPlanRow {
    id: string;
    client_id: string;
    client_household_name: string;
    generated_by_advisor_id: string;
    generated_by_advisor_email: string;
    status: Extract<PlanStatus, "queued" | "processing">;
    generated_at: string;
    processing_started_at: string | null;
  }
  export type QueuedListResponse = CursorList<QueuedPlanRow>;

  // Phase 17.5 — approval also auto-promotes recommendations into
  // action_items. The response carries the count so the UI can toast
  // "N action items created". errors[] is empty on a clean approval.
  export interface ApproveResponse {
    plan: Plan;
    action_items_created: number;
    action_items_skipped_existing: number;
    promotion_errors: string[];
  }
  export type ArchiveResponse = Plan;

  // Phase 18.1 — POST /api/plans/[id]/promote-recommendations.
  // Returns the count of newly-inserted action items + the number that
  // already existed from a prior approval. Idempotent.
  export interface PromoteRecommendationsResponse {
    new_count: number;
    existing_count: number;
    total_recs: number;
    action_item_ids: string[];
    promotion_errors: string[];
  }
}

// ────────────────────────────────────────────────────────────────────────
// Action Items — THE SPINE
// ────────────────────────────────────────────────────────────────────────

export namespace ActionItemsApi {
  export interface ListQuery extends CursorListParams {
    owner?: string;
    status?: ActionItemStatus;
    timing_bucket?: string;
    client_id?: string;
    partner_required?: boolean;
  }
  export type ListResponse = CursorList<ActionItem>;

  export interface CreateRequest {
    client_id: string;
    description: string;
    category: string;
    duration_class: ActionItemDurationClass;
    timing_bucket: string;
    owner: string;
    partner_required?: boolean;
    partner_type?: string | null;
    parent_action_item_id?: string | null;
  }
  export type CreateResponse = ActionItem;

  export type GetResponse = ActionItem;

  export interface UpdateRequest {
    description?: string;
    category?: string;
    duration_class?: ActionItemDurationClass;
    timing_bucket?: string;
    owner?: string;
    partner_required?: boolean;
    partner_type?: string | null;
    status?: ActionItemStatus;
  }
  // Phase 5d response shape — `item` carries the updated row; the two
  // additional fields surface lifecycle effects so the UI can toast
  // ("1 reminder spawned", "2 reminders auto-closed") without a follow-up
  // fetch.
  //   - spawned_reminders: array (one entry today; future-proofed) of any
  //     derivative reminders spawned by this update, or null when no
  //     spawn happened.
  //   - auto_closed_reminders: count of derivative reminders auto-closed
  //     because the parent transitioned to `complete`. Zero when the
  //     parent didn't complete or had no open reminders.
  export interface UpdateResponse {
    item: ActionItem;
    spawned_reminders: ActionItem[] | null;
    auto_closed_reminders: number;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Notes
// ────────────────────────────────────────────────────────────────────────

export namespace NotesApi {
  export interface ListByClientQuery extends CursorListParams {}
  export type ListByClientResponse = CursorList<Note>;

  export interface CreateRequest {
    client_id: string;
    body: string;
    tag?: string | null;
  }
  export type CreateResponse = Note;

  export interface UpdateRequest {
    body?: string;
    tag?: string | null;
  }
  export type UpdateResponse = Note;

  export interface PromoteToActionRequest {
    description?: string; // defaults to note.body if omitted
    category: string;
    duration_class: ActionItemDurationClass;
    timing_bucket: string;
    owner: string;
    partner_required?: boolean;
    partner_type?: string | null;
  }
  export interface PromoteToActionResponse {
    note: Note;
    action_item: ActionItem;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Lens Runs
// ────────────────────────────────────────────────────────────────────────

export namespace LensRunsApi {
  export interface ListByClientQuery extends CursorListParams {
    lens_type?: LensRunLensType;
    status?: LensRunStatus;
  }
  export type ListByClientResponse = CursorList<LensRun>;

  export type GetResponse = LensRun;

  export interface GenerateRequest {
    client_id: string;
    lens_type: LensRunLensType;
    context_input?: string | null;
  }
  export interface GenerateAcceptedResponse {
    lens_run_id: string;
    status: LensRunStatus;
    queued_at: string;
  }

  // Phase 13 — Cash Flow Lens specific endpoints.
  export interface CashFlowCreateRequest {
    client_id: string;
  }
  export type CashFlowCreateResponse = LensRun;

  export interface CashFlowUpdateRequest {
    output: unknown; // CashFlowLensOutput; full replacement; route validates schema_version
  }
  export type CashFlowUpdateResponse = LensRun;

  export type CashFlowFinalizeResponse = LensRun;
  // Phase 16 — refresh prefill from latest finalized plan
  export type CashFlowRefreshResponse = LensRun;
  export type EstateRefreshResponse = LensRun;
  export type ArchiveResponse = LensRun;
  export type RestoreResponse = LensRun;
  // Phase 17.4 — promote a lens to status='current' for its client +
  // lens_type pair. Returns the updated LensRun row. Other 'current'
  // rows for the same pair are auto-demoted to 'superseded' server-side.
  export type SetCurrentResponse = LensRun;
  // Phase 18.2 — reopen a finalized (non-draft, non-archived) lens
  // back to draft for editing. Existing pushed action items are NOT
  // deleted.
  export type ReopenResponse = LensRun;
  // Phase 18.5 — "What this concludes" executive summary lifecycle.
  // generate calls Haiku and persists the result; update accepts an
  // advisor-edited string and marks generated_by='manual'.
  export type GenerateSummaryResponse = LensRun;
  export type UpdateSummaryResponse = LensRun;
  // Phase 18.7 — rename the scenario; stored in context_input (+
  // mirrored into output.scenario_name for estate lenses so the PDF
  // header matches).
  export type RenameResponse = LensRun;

  export type CashFlowSuggestAllocationResponse = LensRun;
  export type CashFlowGenerateRecommendationsResponse = LensRun;

  export interface CashFlowPushActionItemsRequest {
    recommendation_ids: string[];
  }
  export interface CashFlowPushActionItemsResponse {
    created: import("@/lib/supabase/database.types").Database["public"]["Tables"]["action_items"]["Row"][];
    skipped: number;
  }

  // Phase 14 — Estate Lens specific endpoints.
  export interface EstateCreateRequest {
    client_id: string;
    scenario_name?: string;
    state_code?: string;
  }
  export type EstateCreateResponse = LensRun;

  export interface EstateUpdateRequest {
    output: unknown; // EstateLensOutput
    scenario_name?: string;
  }
  export type EstateUpdateResponse = LensRun;

  export type EstateFinalizeResponse = LensRun;

  export interface EstatePushActionItemsRequest {
    recommendation_ids: string[];
  }
  export interface EstatePushActionItemsResponse {
    created: import("@/lib/supabase/database.types").Database["public"]["Tables"]["action_items"]["Row"][];
    skipped: number;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Partners
// ────────────────────────────────────────────────────────────────────────

export namespace PartnersApi {
  export interface ListByClientQuery extends CursorListParams {}
  export type ListByClientResponse = CursorList<Partner>;

  export interface CreateRequest {
    client_id: string;
    partner_type: string;
    first_name?: string | null;
    last_name?: string | null;
    firm_name?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  }
  export type CreateResponse = Partner;

  export interface UpdateRequest {
    partner_type?: string;
    first_name?: string | null;
    last_name?: string | null;
    firm_name?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  }
  export type UpdateResponse = Partner;
}

// ────────────────────────────────────────────────────────────────────────
// Advisors
// ────────────────────────────────────────────────────────────────────────

export namespace AdvisorsApi {
  export type MeResponse = Advisor;

  export interface ListQuery {
    active?: boolean;
  }
  export type ListResponse = CursorList<Advisor>;
}
