import { NextResponse } from "next/server";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { ClientProfileSchema } from "@/lib/orchestrator/schemas/clientProfile";
import { SelectedRecommendationsSchema } from "@/lib/orchestrator/schemas/selectedRecommendations";
import {
  validateFactReview,
  type Stage0LlmApiClient,
} from "@/lib/orchestrator/glue/stage0Validator";
import type { PlansApi } from "@/lib/api/types";

const STORAGE_BUCKET = "plan-inputs";
const MAX_JSON_BYTES = 10 * 1024 * 1024; // 10 MB ceiling per JSON blob
const MAX_FR_BYTES = 25 * 1024 * 1024; // 25 MB ceiling for the .docx/.pdf
const FR_ACCEPT_EXTENSIONS = [".docx", ".pdf"];

function getFileExtension(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i === -1) return null;
  return filename.slice(i).toLowerCase();
}

// POST /api/plans/generate (Phase 10B — dual mode)
//
// Two submission modes, dispatched by which fields are present in the form:
//
// 1. FR mode (default, preferred): a .docx or .pdf Fact Review is uploaded
//    in the `fact_review` field. Stage 0 runs server-side as a preflight
//    against /tmp/. On Stage 0 failed, return 422 with the failures array
//    so the form can surface actionable errors. On passed/passed_with_warnings,
//    insert the plans row, upload the FR to Storage at
//    plan-inputs/{plan_id}/fact_review.{ext}, populate input_fact_review_path.
//    The CLI then runs Stages 1 → 2 → 3a → 3b → 4 → 5.
//
// 2. JSON fallback mode (power-user): pre-built ClientProfile +
//    SelectedRecommendations JSONs are uploaded in the `clientprofile` +
//    `selected_recommendations` fields. Validated against the orchestrator
//    Zod schemas, uploaded to Storage as in Phase 5b. The CLI detects the
//    cached input paths and skips Stages 1+2.
//
// Form fields (multipart/form-data):
//   client_id (string UUID, required)
//   fact_review_filename (string, required, for record-keeping)
//   fact_review (File, .docx|.pdf, required for FR mode)
//   clientprofile (File, JSON, required for JSON fallback mode)
//   selected_recommendations (File, JSON, required for JSON fallback mode)
//
// FR mode wins when fact_review is present, even if JSONs are also provided.
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
  const frField = formData.get("fact_review");
  const cpField = formData.get("clientprofile");
  const recsField = formData.get("selected_recommendations");

  if (typeof clientId !== "string" || clientId.length === 0) {
    return err("validation_failed", "Missing client_id form field.");
  }
  if (typeof factReviewFilename !== "string" || factReviewFilename.length === 0) {
    return err("validation_failed", "Missing fact_review_filename form field.");
  }

  // Mode detection: FR wins.
  const hasFr = !!frField && typeof frField !== "string";
  const hasJson =
    !!cpField && typeof cpField !== "string" &&
    !!recsField && typeof recsField !== "string";

  if (!hasFr && !hasJson) {
    return err(
      "validation_failed",
      "Provide either a Fact Review file (.docx or .pdf) OR pre-built ClientProfile + SelectedRecommendations JSONs.",
    );
  }

  // Verify client exists.
  const { data: clientRow, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!clientRow) return err("not_found", `No client with id ${clientId}.`);

  // ────────────────────────────────────────────────────────────────────
  // Path A: Fact Review mode
  // ────────────────────────────────────────────────────────────────────
  if (hasFr) {
    const frFile = frField as File;
    if (frFile.size === 0) {
      return err("validation_failed", "Fact Review file is empty.");
    }
    if (frFile.size > MAX_FR_BYTES) {
      return err(
        "validation_failed",
        `Fact Review file too large (${(frFile.size / 1024 / 1024).toFixed(1)} MB). Limit is ${MAX_FR_BYTES / 1024 / 1024} MB.`,
      );
    }
    const ext = getFileExtension(frFile.name);
    if (!ext || !FR_ACCEPT_EXTENSIONS.includes(ext)) {
      return err(
        "validation_failed",
        `Unsupported file type "${ext ?? "(none)"}". Upload a .docx or .pdf.`,
      );
    }

    // Stage 0 preflight — Phase 10D.1 reclassifies Stage 0 as a diagnostic
    // checkpoint. Only file_integrity failure (file unreadable, empty,
    // suspiciously short) returns 422. Section / field / archetype /
    // freshness misses become warnings surfaced inline; the plan still
    // queues. Stage 1's LLM parser is robust enough to recover from
    // section / archetype heuristic misses.
    const arrayBuffer = await frFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tmpDir = await mkdtemp(join(tmpdir(), "plan-fr-"));
    const tmpPath = join(tmpDir, `fact_review${ext}`);
    const llmClient: Stage0LlmApiClient | undefined = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : undefined;
    let stage0Warnings: string[] = [];
    try {
      await writeFile(tmpPath, buffer);
      const stage0 = await validateFactReview(tmpPath, { apiClient: llmClient });
      if (stage0.status === "failed") {
        return err(
          "validation_failed",
          `Fact Review failed Stage 0 file integrity (${stage0.failures.length} ${stage0.failures.length === 1 ? "issue" : "issues"}). Most common causes: image-only PDF (needs OCR), empty file, template stub, or password-protected document.`,
          stage0.failures,
        );
      }
      // passed or passed_with_warnings — capture warnings + proceed.
      stage0Warnings = stage0.warnings;
    } catch (e) {
      return err(
        "validation_failed",
        `Stage 0 preflight error: ${(e as Error).message}`,
      );
    } finally {
      try {
        await unlink(tmpPath);
      } catch {
        /* ignore */
      }
    }

    // Insert the plans row first to mint a stable plan_id for the Storage path.
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

    const frPath = `${plan.id}/fact_review${ext}`;
    const frUpload = await auth.supabase.storage
      .from(STORAGE_BUCKET)
      .upload(frPath, buffer, {
        contentType:
          ext === ".pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
    if (frUpload.error) {
      // Storage upload failed: roll back the plans row.
      await auth.supabase.from("plans").delete().eq("id", plan.id);
      return err(
        "internal_error",
        `Fact Review storage upload failed: ${frUpload.error.message}`,
      );
    }

    const fullFrPath = `${STORAGE_BUCKET}/${frPath}`;
    const { error: pathErr } = await auth.supabase
      .from("plans")
      .update({ input_fact_review_path: fullFrPath })
      .eq("id", plan.id);
    if (pathErr) return err(mapDbError(pathErr), dbErrorMessage(pathErr));

    const body: PlansApi.GenerateAcceptedResponse = {
      id: plan.id,
      status: "queued",
      queued_at: plan.generated_at,
      stage0_warnings: stage0Warnings.length > 0 ? stage0Warnings : undefined,
    };
    return NextResponse.json(body, { status: 202 });
  }

  // ────────────────────────────────────────────────────────────────────
  // Path B: JSON fallback mode (power-user)
  // ────────────────────────────────────────────────────────────────────
  // hasJson === true; cpField/recsField are confirmed File-like.
  const cpFile = cpField as File;
  const recsFile = recsField as File;
  if (cpFile.size > MAX_JSON_BYTES || recsFile.size > MAX_JSON_BYTES) {
    return err(
      "validation_failed",
      `JSON inputs must each be <= ${MAX_JSON_BYTES} bytes.`,
    );
  }

  let cpRaw: unknown;
  let recsRaw: unknown;
  try {
    cpRaw = JSON.parse(await cpFile.text());
  } catch (e) {
    return err("validation_failed", `clientprofile is not valid JSON: ${(e as Error).message}`);
  }
  try {
    recsRaw = JSON.parse(await recsFile.text());
  } catch (e) {
    return err(
      "validation_failed",
      `selected_recommendations is not valid JSON: ${(e as Error).message}`,
    );
  }

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

  const cpPath = `${plan.id}/clientprofile.json`;
  const recsPath = `${plan.id}/selected_recs.json`;

  const cpUpload = await auth.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(cpPath, JSON.stringify(cpParsed.data), {
      contentType: "application/json",
      upsert: false,
    });
  if (cpUpload.error) {
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

  const body: PlansApi.GenerateAcceptedResponse = {
    id: plan.id,
    status: "queued",
    queued_at: plan.generated_at,
  };
  return NextResponse.json(body, { status: 202 });
}
