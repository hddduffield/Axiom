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
    lead_advisor_id: string;
    household_name: string;
    status?: ClientStatus;
    archetype?: ClientArchetype | null;
    notes?: string | null;
  }
  export type CreateResponse = Client;

  export type GetResponse = Client;

  export interface UpdateRequest {
    lead_advisor_id?: string;
    household_name?: string;
    status?: ClientStatus;
    archetype?: ClientArchetype | null;
    notes?: string | null;
  }
  export type UpdateResponse = Client;

  // DELETE returns 204 no content (soft-delete: status → inactive)
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

  // Generation request is multipart/form-data (NOT JSON):
  //   client_id: string (form field)
  //   fact_review: File   (the .docx upload)
  //
  // Phase 5 will store the file via Supabase Storage and kick off the
  // AI engine pipeline. This is a "queue" semantic — returns 202 Accepted
  // with the new draft plan id so the UI can poll status.
  export interface GenerateAcceptedResponse {
    plan_id: string;
    status: PlanStatus; // always "draft" on initial accept
    queued_at: string; // ISO 8601
  }

  export type ApproveResponse = Plan;
  export type ArchiveResponse = Plan;
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
  export type UpdateResponse = ActionItem;
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
