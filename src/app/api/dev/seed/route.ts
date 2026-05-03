// Dev-only seed endpoint. Idempotent insert of Holloway-shaped fixtures
// into the real Supabase database so Claude Design + Hayden have data to
// click through during Phase 5 development.
//
// Routing note: the spec called for `/api/_dev/seed`, but Next.js 16
// excludes any folder prefixed with `_` from routing (private folders).
// Lives at `/api/dev/seed` instead. The runtime NODE_ENV guard is the
// real safety mechanism.
//
// Usage (browser address bar or curl from a signed-in session):
//   GET  /api/dev/seed   → idempotent re-seed
//   POST /api/dev/seed   → idempotent re-seed
//
// All upserts key on a stable deterministic id so re-running is a no-op.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const SEED_CLIENT_HOLLOWAY = "11111111-1111-1111-1111-000000000001";
const SEED_CLIENT_BURKE = "11111111-1111-1111-1111-000000000002";

const SEED_PARTNER_CPA = "22222222-2222-2222-2222-000000000001";
const SEED_PARTNER_ESTATE_ATTY = "22222222-2222-2222-2222-000000000002";
const SEED_PARTNER_INSURANCE = "22222222-2222-2222-2222-000000000003";

const SEED_AI_REAL_ESTATE = "33333333-3333-3333-3333-000000000001";
const SEED_AI_BROKER_OPINION = "33333333-3333-3333-3333-000000000002";
const SEED_AI_TRUIST_CONSENT = "33333333-3333-3333-3333-000000000003";
const SEED_AI_WILLS_UPDATE = "33333333-3333-3333-3333-000000000004";
const SEED_AI_PTET_FILING = "33333333-3333-3333-3333-000000000005";
const SEED_AI_BURKE_LETTER = "33333333-3333-3333-3333-000000000006";

const SEED_NOTE_MEP_INBOUND = "44444444-4444-4444-4444-000000000001";
const SEED_NOTE_PTET_DEADLINE = "44444444-4444-4444-4444-000000000002";
const SEED_NOTE_BURKE_INTRO = "44444444-4444-4444-4444-000000000003";

// Stable plan id for the seeded queued Holloway plan (Phase 5b). The CLI
// will claim this row on first run and process Stage 3a → 4 → 5 against
// the uploaded Holloway artifacts.
const SEED_PLAN_HOLLOWAY_QUEUED = "55555555-5555-5555-5555-000000000001";

const STORAGE_BUCKET = "plan-inputs";
const HOLLOWAY_CP_DISK = "artifacts/holloway_clientprofile.json";
const HOLLOWAY_RECS_DISK = "artifacts/holloway_selected_recommendations.json";

async function seed() {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { supabase, advisor } = auth;

  // 1) Clients.
  const clientsRes = await supabase.from("clients").upsert(
    [
      {
        id: SEED_CLIENT_HOLLOWAY,
        lead_advisor_id: advisor.id,
        household_name: "Holloway Family",
        status: "active",
        archetype: "PRE",
        notes:
          "Marcus + Catherine; HIS owner-operator with $32–$48M valuation; transaction window 3–5 yrs.",
      },
      {
        id: SEED_CLIENT_BURKE,
        lead_advisor_id: advisor.id,
        household_name: "Burke Family",
        status: "prospect",
        archetype: null,
        notes: "Intro call scheduled.",
      },
    ],
    { onConflict: "id" },
  );
  if (clientsRes.error) return err(mapDbError(clientsRes.error), dbErrorMessage(clientsRes.error));

  // 2) Partners (Holloway only).
  const partnersRes = await supabase.from("partners").upsert(
    [
      {
        id: SEED_PARTNER_CPA,
        client_id: SEED_CLIENT_HOLLOWAY,
        partner_type: "CPA",
        first_name: "Lisa",
        last_name: "Park",
        firm_name: "Park & Associates",
        email: "lisa@parkcpa.com",
        phone: "404-555-0142",
        notes: "20 years with HIS — handles all entity returns + PTET filing.",
      },
      {
        id: SEED_PARTNER_ESTATE_ATTY,
        client_id: SEED_CLIENT_HOLLOWAY,
        partner_type: "Estate Attorney",
        first_name: "James",
        last_name: "Whitfield",
        firm_name: "Whitfield Estate Planning",
        email: "james@whitfield-estate.com",
        phone: "404-555-0177",
        notes: "Drafting GRAT + ILIT instruments.",
      },
      {
        id: SEED_PARTNER_INSURANCE,
        client_id: SEED_CLIENT_HOLLOWAY,
        partner_type: "Insurance Broker",
        first_name: "Maria",
        last_name: "Chen",
        firm_name: "Chen Risk Advisors",
        email: "maria@chenrisk.com",
        phone: "404-555-0123",
        notes: "Quoting key-person + ILIT funding policies.",
      },
    ],
    { onConflict: "id" },
  );
  if (partnersRes.error) return err(mapDbError(partnersRes.error), dbErrorMessage(partnersRes.error));

  // 3) Action items.
  const actionItemsRes = await supabase.from("action_items").upsert(
    [
      {
        id: SEED_AI_REAL_ESTATE,
        client_id: SEED_CLIENT_HOLLOWAY,
        description: "Form Holloway Properties, LLC (Georgia) for the Kennesaw real estate.",
        category: "ENTITY",
        duration_class: "one_time",
        timing_bucket: "next_30_days",
        owner: advisor.email,
        partner_required: true,
        partner_type: "Business Attorney",
        status: "in_progress",
      },
      {
        id: SEED_AI_BROKER_OPINION,
        client_id: SEED_CLIENT_HOLLOWAY,
        description: "Engage broker to opine on market rent for Kennesaw triple-net lease.",
        category: "ENTITY",
        duration_class: "one_time",
        timing_bucket: "next_30_days",
        owner: advisor.email,
        partner_required: true,
        partner_type: "Commercial Real Estate Broker",
        status: "not_started",
      },
      {
        id: SEED_AI_TRUIST_CONSENT,
        client_id: SEED_CLIENT_HOLLOWAY,
        description: "Truist consent on LOC for HIS → Holloway Properties transfer.",
        category: "ENTITY",
        duration_class: "one_time",
        timing_bucket: "next_60_days",
        owner: advisor.email,
        partner_required: true,
        partner_type: "Banker",
        status: "pending_decision",
      },
      {
        id: SEED_AI_WILLS_UPDATE,
        client_id: SEED_CLIENT_HOLLOWAY,
        description: "Update wills (currently 2014 — net worth then $3M; now $32–$48M).",
        category: "ESTATE",
        duration_class: "one_time",
        timing_bucket: "next_60_days",
        owner: advisor.email,
        partner_required: true,
        partner_type: "Estate Attorney",
        status: "in_progress",
      },
      {
        id: SEED_AI_PTET_FILING,
        client_id: SEED_CLIENT_HOLLOWAY,
        description: "File Georgia PTET election for 2026 tax year.",
        category: "TAX",
        duration_class: "one_time",
        timing_bucket: "next_30_days",
        owner: "client",
        partner_required: true,
        partner_type: "CPA",
        status: "not_started",
      },
      {
        id: SEED_AI_BURKE_LETTER,
        client_id: SEED_CLIENT_BURKE,
        description: "Send Burke initial engagement letter + fee schedule.",
        category: "ENGAGEMENT",
        duration_class: "one_time",
        timing_bucket: "next_30_days",
        owner: advisor.email,
        partner_required: false,
        partner_type: null,
        status: "in_progress",
      },
    ],
    { onConflict: "id" },
  );
  if (actionItemsRes.error) {
    return err(mapDbError(actionItemsRes.error), dbErrorMessage(actionItemsRes.error));
  }

  // 4) Notes (one promoted to action item to exercise that linkage).
  const notesRes = await supabase.from("notes").upsert(
    [
      {
        id: SEED_NOTE_MEP_INBOUND,
        client_id: SEED_CLIENT_HOLLOWAY,
        author_advisor_id: advisor.id,
        body:
          "Marcus mentioned MEP roll-up inbound is 'serious' — letter this week. Tag for transaction window urgency.",
        tag: "call",
        promoted_to_action_item_id: null,
      },
      {
        id: SEED_NOTE_PTET_DEADLINE,
        client_id: SEED_CLIENT_HOLLOWAY,
        author_advisor_id: advisor.id,
        body: "CPA confirmed PTET election deadline is March 15. Move action item up.",
        tag: "email",
        promoted_to_action_item_id: SEED_AI_PTET_FILING,
      },
      {
        id: SEED_NOTE_BURKE_INTRO,
        client_id: SEED_CLIENT_BURKE,
        author_advisor_id: advisor.id,
        body:
          "Burke intro call — they currently work with Northwestern Mutual; want a fee-only second opinion.",
        tag: "call",
        promoted_to_action_item_id: SEED_AI_BURKE_LETTER,
      },
    ],
    { onConflict: "id" },
  );
  if (notesRes.error) return err(mapDbError(notesRes.error), dbErrorMessage(notesRes.error));

  // 5) Phase 5b — upload Holloway artifacts to Storage and insert a queued
  //    plan row so Hayden can immediately test the CLI. Idempotent via
  //    upsert on the Storage path AND the plans row id.
  let queuedPlanSeeded = false;
  let queuedPlanSkipReason: string | null = null;
  try {
    const cpBytes = await readFile(resolve(HOLLOWAY_CP_DISK), "utf-8");
    const recsBytes = await readFile(resolve(HOLLOWAY_RECS_DISK), "utf-8");

    const cpPath = `${SEED_PLAN_HOLLOWAY_QUEUED}/clientprofile.json`;
    const recsPath = `${SEED_PLAN_HOLLOWAY_QUEUED}/selected_recs.json`;

    const cpUpload = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(cpPath, cpBytes, { contentType: "application/json", upsert: true });
    if (cpUpload.error) {
      queuedPlanSkipReason = `clientprofile upload: ${cpUpload.error.message}`;
    } else {
      const recsUpload = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(recsPath, recsBytes, { contentType: "application/json", upsert: true });
      if (recsUpload.error) {
        queuedPlanSkipReason = `selected_recs upload: ${recsUpload.error.message}`;
      } else {
        const planRes = await supabase.from("plans").upsert(
          [
            {
              id: SEED_PLAN_HOLLOWAY_QUEUED,
              client_id: SEED_CLIENT_HOLLOWAY,
              generated_by_advisor_id: advisor.id,
              status: "queued",
              fact_review_filename: "Holloway_FactReview_seed.docx",
              input_clientprofile_path: `${STORAGE_BUCKET}/${cpPath}`,
              input_selected_recs_path: `${STORAGE_BUCKET}/${recsPath}`,
              processing_started_at: null,
              processing_completed_at: null,
              cost_cents: null,
              stage1_output: null,
              stage3a_output: null,
              stage4_output: null,
              stage5_output: null,
              failure_reason: null,
            },
          ],
          { onConflict: "id" },
        );
        if (planRes.error) {
          queuedPlanSkipReason = `plans upsert: ${planRes.error.message}`;
        } else {
          queuedPlanSeeded = true;
        }
      }
    }
  } catch (e) {
    queuedPlanSkipReason = `local artifact read: ${(e as Error).message}`;
  }

  return ok({
    seeded: {
      clients: 2,
      partners: 3,
      action_items: 6,
      notes: 3,
      queued_plans: queuedPlanSeeded ? 1 : 0,
    },
    queued_plan_skip_reason: queuedPlanSkipReason,
    note: "Idempotent — re-running this endpoint is safe and resets each row to the seed values.",
  });
}

function notInDev() {
  return err(
    "not_authorized",
    "Dev seed endpoint is disabled in production (NODE_ENV=production).",
  );
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return notInDev();
  return seed();
}

export async function POST() {
  if (process.env.NODE_ENV === "production") return notInDev();
  return seed();
}
