import { NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { ClientProfileSchema } from "@/lib/orchestrator/schemas/clientProfile";
import { SelectedRecommendationsSchema } from "@/lib/orchestrator/schemas/selectedRecommendations";
import type { PlansApi } from "@/lib/api/types";

const STORAGE_BUCKET = "plan-inputs";
const MAX_JSON_BYTES = 10 * 1024 * 1024; // 10 MB ceiling per JSON blob

// POST /api/plans/generate (Phase 5b)
//
// v1 skips Stages 0/1/2; the advisor uploads the already-prepared
// ClientProfile + SelectedRecommendations JSON blobs. We store both in
// Supabase Storage at plan-inputs/{plan_id}/{file}.json, insert a plans
// row with status='queued', and return 202. The CLI script
// `scripts/generatePending.ts` claims queued plans and runs Stage 3a → 4
// → 5 against the Anthropic API.
//
// Form fields (multipart/form-data):
//   client_id (string UUID, required)
//   fact_review_filename (string, required, for record-keeping)
//   clientprofile (File, JSON, required) — ClientProfileSchema
//   selected_recommendations (File, JSON, required) — SelectedRecommendationsSchema
export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return err("validation_failed", "Expected multipart/form-data; got " + contentType);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return err("validation_failed", "Could not parse multipart body.");
  }

  const clientId = formData.get("client_id");
  const factReviewFilename = formData.get("fact_review_filename");
  const cpField = formData.get("clientprofile");
  const recsField = formData.get("selected_recommendations");

  if (typeof clientId !== "string" || clientId.length === 0) {
    return err("validation_failed", "Missing client_id form field.");
  }
  if (typeof factReviewFilename !== "string" || factReviewFilename.length === 0) {
    return err("validation_failed", "Missing fact_review_filename form field.");
  }
  // FormData.get returns FormDataEntryValue | null = string | File | null.
  // `instanceof` on the union fails type-check; filter primitives + null first.
  if (!cpField || typeof cpField === "string") {
    return err("validation_failed", "Missing clientprofile file upload.");
  }
  if (!recsField || typeof recsField === "string") {
    return err("validation_failed", "Missing selected_recommendations file upload.");
  }
  if (cpField.size > MAX_JSON_BYTES || recsField.size > MAX_JSON_BYTES) {
    return err(
      "validation_failed",
      `JSON inputs must each be <= ${MAX_JSON_BYTES} bytes.`,
    );
  }

  // Verify client exists (RLS will also block unauthorized; this gives a
  // clean 404 instead of a generic insert FK failure).
  const { data: clientRow, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!clientRow) return err("not_found", `No client with id ${clientId}.`);

  // Parse JSON blobs.
  let cpRaw: unknown;
  let recsRaw: unknown;
  try {
    cpRaw = JSON.parse(await cpField.text());
  } catch (e) {
    return err("validation_failed", `clientprofile is not valid JSON: ${(e as Error).message}`);
  }
  try {
    recsRaw = JSON.parse(await recsField.text());
  } catch (e) {
    return err(
      "validation_failed",
      `selected_recommendations is not valid JSON: ${(e as Error).message}`,
    );
  }

  // Validate against the orchestrator's Zod schemas. This is the same
  // validation Stage 3a will do later — we run it up-front so the advisor
  // sees schema errors immediately rather than discovering them when the
  // CLI tries to process.
  const cpParsed = ClientProfileSchema.safeParse(cpRaw);
  if (!cpParsed.success) {
    return err(
      "validation_failed",
      "clientprofile failed schema validation.",
      cpParsed.error.issues.slice(0, 50),
    );
  }
  const recsParsed = SelectedRecommendationsSchema.safeParse(recsRaw);
  if (!recsParsed.success) {
    return err(
      "validation_failed",
      "selected_recommendations failed schema validation.",
      recsParsed.error.issues.slice(0, 50),
    );
  }

  // Insert the plans row first so we have a stable plan_id for Storage paths.
  const { data: plan, error: planErr } = await auth.supabase
    .from("plans")
    .insert({
      client_id: clientId,
      generated_by_advisor_id: auth.advisor.id,
      status: "queued",
      fact_review_filename: factReviewFilename,
    })
    .select("id, status, generated_at")
    .single();
  if (planErr) return err(mapDbError(planErr), dbErrorMessage(planErr));

  // Upload both JSONs to Storage at plan-inputs/{plan_id}/{name}.json.
  const cpPath = `${plan.id}/clientprofile.json`;
  const recsPath = `${plan.id}/selected_recs.json`;

  const cpUpload = await auth.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(cpPath, JSON.stringify(cpParsed.data), {
      contentType: "application/json",
      upsert: false,
    });
  if (cpUpload.error) {
    // Storage upload failure: roll back the plans row so we don't leave a
    // queued plan with no inputs to read.
    await auth.supabase.from("plans").delete().eq("id", plan.id);
    return err("internal_error", `clientprofile storage upload failed: ${cpUpload.error.message}`);
  }

  const recsUpload = await auth.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(recsPath, JSON.stringify(recsParsed.data), {
      contentType: "application/json",
      upsert: false,
    });
  if (recsUpload.error) {
    await auth.supabase.storage.from(STORAGE_BUCKET).remove([cpPath]);
    await auth.supabase.from("plans").delete().eq("id", plan.id);
    return err(
      "internal_error",
      `selected_recommendations storage upload failed: ${recsUpload.error.message}`,
    );
  }

  // Patch the plan row with the storage paths now that uploads succeeded.
  const fullCpPath = `${STORAGE_BUCKET}/${cpPath}`;
  const fullRecsPath = `${STORAGE_BUCKET}/${recsPath}`;
  const { error: pathErr } = await auth.supabase
    .from("plans")
    .update({
      input_clientprofile_path: fullCpPath,
      input_selected_recs_path: fullRecsPath,
    })
    .eq("id", plan.id);
  if (pathErr) return err(mapDbError(pathErr), dbErrorMessage(pathErr));

  // TODO: Phase 5e — audit_log insert (entity='plan', action='created').
  const body: PlansApi.GenerateAcceptedResponse = {
    id: plan.id,
    status: "queued",
    queued_at: plan.generated_at,
  };
  return NextResponse.json(body, { status: 202 });
}
