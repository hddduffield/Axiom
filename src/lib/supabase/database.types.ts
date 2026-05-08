// Database types — Phase 4 Step 2 hand-crafted stub.
//
// This file mirrors the shape that `supabase gen types typescript --local`
// produces, but written by hand because the Supabase CLI is not yet installed
// locally. Once the CLI is in place, regenerate via:
//
//   npm run supabase:types
//
// which will overwrite this file with the canonical machine-generated types.
// Until then, keep this stub in sync with `supabase/migrations/0001_initial_schema.sql`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Status / enum aliases — match CHECK constraints in the SQL migration.
export type ClientStatus = "active" | "inactive" | "prospect";
export type ClientArchetype = "PRE" | "MID" | "POST" | "NONE";
// PlanStatus state machine (Phase 5b):
//   queued (created via POST /api/plans/generate)
//     → processing (CLI claims the row)
//       → ready_for_review (CLI completes Stage 3a → 4 → 5)
//       → failed (CLI errors or cost cap exceeded)
//     ready_for_review → approved (advisor approves)
//   any non-archived → archived (advisor archives)
export type PlanStatus =
  | "queued"
  | "processing"
  | "ready_for_review"
  | "approved"
  | "archived"
  | "failed";
export type LensRunLensType = "investment" | "insurance" | "cash_flow";
export type LensRunStatus = "draft" | "approved" | "archived";
export type ActionItemDurationClass = "one_time" | "long_running";
export type ActionItemStatus =
  | "not_started"
  | "in_progress"
  | "pending_decision"
  | "complete";
export type AuditLogEntityType =
  | "client"
  | "plan"
  | "action_item"
  | "note"
  | "lens_run"
  | "partner";
export type AuditLogAction =
  | "created"
  | "updated"
  | "deleted"
  | "approved"
  | "completed";

export interface Database {
  public: {
    Tables: {
      advisors: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["advisors"]["Insert"]>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          lead_advisor_id: string;
          household_name: string;
          status: ClientStatus;
          archetype: ClientArchetype | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_advisor_id: string;
          household_name: string;
          status?: ClientStatus;
          archetype?: ClientArchetype | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "clients_lead_advisor_id_fkey";
            columns: ["lead_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
        ];
      };
      lens_runs: {
        Row: {
          id: string;
          client_id: string;
          generated_by_advisor_id: string;
          lens_type: LensRunLensType;
          context_input: string | null;
          status: LensRunStatus;
          generated_at: string;
          output: Json | null;
          cost_cents: number | null;
          // Phase 13.1 additions:
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          generated_by_advisor_id: string;
          lens_type: LensRunLensType;
          context_input?: string | null;
          status?: LensRunStatus;
          generated_at?: string;
          output?: Json | null;
          cost_cents?: number | null;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lens_runs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "lens_runs_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lens_runs_generated_by_advisor_id_fkey";
            columns: ["generated_by_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          client_id: string;
          generated_by_advisor_id: string;
          status: PlanStatus;
          generated_at: string;
          approved_at: string | null;
          archived_at: string | null;
          fact_review_filename: string | null;
          stage1_output: Json | null;
          stage3a_output: Json | null;
          stage4_output: Json | null;
          stage5_output: Json | null;
          cost_cents: number | null;
          compliance_tracking_id: string | null;
          // Phase 5b additions:
          input_clientprofile_path: string | null;
          input_selected_recs_path: string | null;
          processing_started_at: string | null;
          processing_completed_at: string | null;
          failure_reason: string | null;
          // Phase 10B.1 — FR upload path:
          input_fact_review_path: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          generated_by_advisor_id: string;
          status?: PlanStatus;
          generated_at?: string;
          approved_at?: string | null;
          archived_at?: string | null;
          fact_review_filename?: string | null;
          stage1_output?: Json | null;
          stage3a_output?: Json | null;
          stage4_output?: Json | null;
          stage5_output?: Json | null;
          cost_cents?: number | null;
          compliance_tracking_id?: string | null;
          input_clientprofile_path?: string | null;
          input_selected_recs_path?: string | null;
          processing_started_at?: string | null;
          processing_completed_at?: string | null;
          failure_reason?: string | null;
          input_fact_review_path?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "plans_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plans_generated_by_advisor_id_fkey";
            columns: ["generated_by_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
        ];
      };
      action_items: {
        Row: {
          id: string;
          client_id: string;
          source_plan_id: string | null;
          source_lens_run_id: string | null;
          parent_action_item_id: string | null;
          description: string;
          category: string;
          duration_class: ActionItemDurationClass;
          timing_bucket: string;
          owner: string;
          partner_required: boolean;
          partner_type: string | null;
          status: ActionItemStatus;
          completed_at: string | null;
          completed_by_advisor_id: string | null;
          is_derivative_reminder: boolean;
          auto_generated_reminder_template: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          source_plan_id?: string | null;
          source_lens_run_id?: string | null;
          parent_action_item_id?: string | null;
          description: string;
          category: string;
          duration_class: ActionItemDurationClass;
          timing_bucket: string;
          owner: string;
          partner_required?: boolean;
          partner_type?: string | null;
          status?: ActionItemStatus;
          completed_at?: string | null;
          completed_by_advisor_id?: string | null;
          is_derivative_reminder?: boolean;
          auto_generated_reminder_template?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["action_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "action_items_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_source_plan_id_fkey";
            columns: ["source_plan_id"];
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_source_lens_run_id_fkey";
            columns: ["source_lens_run_id"];
            referencedRelation: "lens_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_parent_action_item_id_fkey";
            columns: ["parent_action_item_id"];
            referencedRelation: "action_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_completed_by_advisor_id_fkey";
            columns: ["completed_by_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          client_id: string;
          author_advisor_id: string;
          body: string;
          tag: string | null;
          promoted_to_action_item_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          author_advisor_id: string;
          body: string;
          tag?: string | null;
          promoted_to_action_item_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "notes_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_author_advisor_id_fkey";
            columns: ["author_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_promoted_to_action_item_id_fkey";
            columns: ["promoted_to_action_item_id"];
            referencedRelation: "action_items";
            referencedColumns: ["id"];
          },
        ];
      };
      partners: {
        Row: {
          id: string;
          client_id: string;
          partner_type: string;
          first_name: string | null;
          last_name: string | null;
          firm_name: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          partner_type: string;
          first_name?: string | null;
          last_name?: string | null;
          firm_name?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["partners"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "partners_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          actor_advisor_id: string | null;
          entity_type: AuditLogEntityType;
          entity_id: string;
          action: AuditLogAction;
          details: Json | null;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          actor_advisor_id?: string | null;
          entity_type: AuditLogEntityType;
          entity_id: string;
          action: AuditLogAction;
          details?: Json | null;
          occurred_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_advisor_id_fkey";
            columns: ["actor_advisor_id"];
            referencedRelation: "advisors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_active_advisor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
