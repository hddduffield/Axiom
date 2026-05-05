"use client";

// Phase 10B.2 — Plan generate form.
//
// Default path: advisor uploads a Fact Review (.docx or .pdf). The CLI
// runs Stages 0 → 1 → 2 → 3a → 4 → 5 against Anthropic Opus 4.7,
// producing a Holloway-quality plan in ~25-40 min.
//
// Power-user fallback (collapsed by default): advisor uploads pre-built
// ClientProfile + SelectedRecommendations JSONs to skip Stages 1+2.
// Useful for test fixtures and re-running plans where the upstream parses
// are already on disk.
//
// Stage 0 server-side validation errors (422 from POST /api/plans/generate)
// surface as a red bullet list above the form, preserving client_id +
// filename selection so the advisor can fix the FR and resubmit.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, FileText, Info, Upload, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, isApiError } from "@/lib/api/client";
import type { PlansApi } from "@/lib/api/types";

interface ClientOption {
  id: string;
  household_name: string;
  archetype: string | null;
  status: "active" | "inactive" | "prospect";
  advisors: { first_name: string; last_name: string } | null;
}

interface SubmittedState {
  plan_id: string;
  client_id: string;
  client_name: string;
  fr_filename: string;
  queued_at: string;
  mode: "fact_review" | "json_fallback";
  // Phase 10D.1 — non-blocking Stage 0 diagnostic warnings.
  stage0_warnings?: string[];
}

interface Stage0Failure {
  check: string;
  reason: string;
  remediation?: string;
}

const STAGE0_CHECK_LABELS: Record<string, string> = {
  file_integrity: "File integrity",
  required_sections_present: "Required sections",
  required_field_markers: "Required fields",
  volatile_rates_freshness: "Volatile rates freshness",
  content_hash: "Content hash",
  unknown: "Validator",
};

function humanizeCheck(check: string): string {
  return STAGE0_CHECK_LABELS[check] ?? check;
}

const FR_ACCEPT_EXTENSIONS = [".docx", ".pdf"];
const FR_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function getFileExtension(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i === -1) return null;
  return filename.slice(i).toLowerCase();
}

export function GenerateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [clientId, setClientId] = useState("");
  const [frFilename, setFrFilename] = useState("");

  // Primary FR upload state
  const [frFile, setFrFile] = useState<File | null>(null);
  const [frFileError, setFrFileError] = useState<string | null>(null);

  // Power-user JSON fallback state
  const [jsonFallbackOpen, setJsonFallbackOpen] = useState(false);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [recsFile, setRecsFile] = useState<File | null>(null);
  const [profileJson, setProfileJson] = useState<unknown>(null);
  const [recsJson, setRecsJson] = useState<unknown>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  const [stage0Failures, setStage0Failures] = useState<Stage0Failure[]>([]);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const client = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clientId, clients],
  );

  // Auto-suggest fact_review filename when client picked, only if blank.
  useEffect(() => {
    if (!client || frFilename) return;
    const slug = client.household_name.toLowerCase().split(/\s+/)[0];
    const today = new Date().toISOString().slice(0, 10);
    setFrFilename(`${slug}_fr_${today}.docx`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleFrPick(file: File) {
    setStage0Failures([]);
    setTopLevelError(null);
    const ext = getFileExtension(file.name);
    if (!ext || !FR_ACCEPT_EXTENSIONS.includes(ext)) {
      setFrFileError(
        `Unsupported file type "${ext ?? "(none)"}". Upload a .docx or .pdf Fact Review.`,
      );
      setFrFile(file);
      return;
    }
    if (file.size > FR_MAX_BYTES) {
      setFrFileError(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is ${FR_MAX_BYTES / 1024 / 1024} MB.`,
      );
      setFrFile(file);
      return;
    }
    setFrFile(file);
    setFrFileError(null);
    // Auto-update filename to match the uploaded file (advisor can still edit).
    setFrFilename(file.name);
  }

  function readJsonFile(
    file: File,
    setFile: (f: File | null) => void,
    setJson: (j: unknown) => void,
    setErr: (e: string | null) => void,
  ) {
    setFile(file);
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setJson(parsed);
      } catch (err) {
        setErr(`Could not parse JSON: ${(err as Error).message}`);
        setJson(null);
      }
    };
    reader.readAsText(file);
  }

  // Submission preconditions — depends on which mode is active.
  // FR mode wins if a valid FR file is picked; otherwise JSON-fallback mode
  // requires both JSONs.
  const frModeReady = !!frFile && !frFileError;
  const jsonModeReady =
    jsonFallbackOpen && profileJson !== null && recsJson !== null;
  const canSubmit =
    !!clientId &&
    !!frFilename &&
    (frModeReady || jsonModeReady) &&
    !submitting;

  const submitHint = (() => {
    if (submitting) return uploadProgress !== null ? `Uploading… ${uploadProgress}%` : "Queueing…";
    if (!clientId) return "Select a client to begin.";
    if (!frModeReady && !jsonModeReady) return "Upload a Fact Review (.docx or .pdf).";
    if (canSubmit) return "Ready to queue.";
    return "";
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !client) return;
    setSubmitting(true);
    setStage0Failures([]);
    setTopLevelError(null);
    setUploadProgress(0);
    try {
      const useFrMode = frModeReady;
      const accepted: PlansApi.GenerateAcceptedResponse = await api.plans.generate({
        clientId: client.id,
        factReviewFilename: frFilename,
        factReview: useFrMode ? (frFile as File) : undefined,
        clientprofile: !useFrMode && profileFile ? profileFile : undefined,
        selectedRecommendations:
          !useFrMode && recsFile ? recsFile : undefined,
      });
      setUploadProgress(100);
      setSubmitted({
        plan_id: accepted.id,
        client_id: client.id,
        client_name: client.household_name,
        fr_filename: frFilename,
        queued_at: accepted.queued_at,
        mode: useFrMode ? "fact_review" : "json_fallback",
        stage0_warnings: accepted.stage0_warnings,
      });
    } catch (e) {
      if (isApiError(e)) {
        // Stage 0 validation failures land as 422 with details: Stage0Failure[].
        const details = e.details as unknown;
        if (
          e.status === 422 &&
          Array.isArray(details) &&
          details.length > 0 &&
          (details[0] as { check?: unknown }).check !== undefined
        ) {
          setStage0Failures(details as Stage0Failure[]);
          setTopLevelError(
            "Fact Review failed Stage 0 validation. Review the issues below and re-upload.",
          );
        } else {
          setTopLevelError(e.message);
          toast.error(e.message);
        }
      } else {
        setTopLevelError("Could not queue plan");
        toast.error("Could not queue plan");
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  function reset() {
    setClientId("");
    setFrFilename("");
    setFrFile(null);
    setFrFileError(null);
    setProfileFile(null);
    setRecsFile(null);
    setProfileJson(null);
    setRecsJson(null);
    setProfileErr(null);
    setRecsErr(null);
    setSubmitted(null);
    setStage0Failures([]);
    setTopLevelError(null);
    setJsonFallbackOpen(false);
  }

  // ─────────────── Success state ───────────────
  if (submitted) {
    const frMode = submitted.mode === "fact_review";
    return (
      <div className="max-w-2xl">
        <Card
          className="overflow-hidden"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: "var(--s-green)",
          }}
        >
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "var(--s-green-bg)",
                  color: "var(--s-green)",
                }}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-medium" style={{ color: "var(--text)" }}>
                  Plan queued. Hayden will process locally.
                </h2>
                <p
                  className="mt-1.5 text-[13px] leading-relaxed"
                  style={{ color: "var(--text-2)" }}
                >
                  The orchestrator runs on Hayden&rsquo;s machine via{" "}
                  <code style={{ fontFamily: "var(--font-mono)" }}>
                    npm run generate-pending
                  </code>
                  . Expected wall-clock for {frMode ? "the full Stage 0→5 chain" : "the Stage 3a→5 chain (Stages 1+2 skipped)"}: ~{frMode ? "25–40" : "20–30"} min, ~${frMode ? "23–38" : "13–25"} per plan. You&rsquo;ll see the plan land in{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>ready_for_review</span>{" "}
                  once processing completes.
                </p>
              </div>
            </div>

            {/* Phase 10D.1 — Stage 0 diagnostic warnings */}
            {submitted.stage0_warnings && submitted.stage0_warnings.length > 0 && (
              <div
                className="rounded-md border-l-[3px] px-4 py-3"
                style={{
                  background: "var(--s-amber-bg)",
                  borderLeftColor: "var(--s-amber)",
                }}
              >
                <div className="flex items-start gap-2.5">
                  <Info
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--s-amber)" }}
                  />
                  <div className="flex-1">
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: "var(--text)" }}
                    >
                      Stage 0 noted {submitted.stage0_warnings.length}{" "}
                      {submitted.stage0_warnings.length === 1 ? "concern" : "concerns"}
                    </div>
                    <p
                      className="mt-1 text-[12px] leading-relaxed"
                      style={{ color: "var(--text-2)" }}
                    >
                      Pipeline will proceed; check the generated plan for accuracy.
                      Stage 1&rsquo;s LLM parser is robust enough to recover from
                      heuristic misses.
                    </p>
                    <ul
                      className="mt-2 space-y-1 pl-4 text-[11px]"
                      style={{ color: "var(--text-2)", listStyleType: "disc" }}
                    >
                      {submitted.stage0_warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <dl
              className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1.5 text-xs"
              style={{ color: "var(--text-2)" }}
            >
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Plan ID
              </dt>
              <dd style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {submitted.plan_id}
              </dd>
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Client
              </dt>
              <dd style={{ color: "var(--text)" }}>
                {submitted.client_name}{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 11 }}>
                  ({submitted.client_id.slice(0, 12)}…)
                </span>
              </dd>
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Fact review
              </dt>
              <dd style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {submitted.fr_filename}
              </dd>
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Mode
              </dt>
              <dd style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {frMode ? "Stage 0 → 5 (full pipeline)" : "Stage 3a → 5 (JSON fallback)"}
              </dd>
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Queued at
              </dt>
              <dd style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {new Date(submitted.queued_at).toISOString().replace("T", " ").slice(0, 19)} UTC
              </dd>
              <dt className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
                Status
              </dt>
              <dd>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "var(--s-amber-bg)",
                    color: "var(--s-amber)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--s-amber)" }}
                  />
                  Queued
                </span>
              </dd>
            </dl>

            <Separator />

            <div>
              <div
                className="text-[11px] uppercase"
                style={{ color: "var(--text-3)", letterSpacing: "0.06em", marginBottom: 6 }}
              >
                Pipeline stages
              </div>
              <ol
                className="space-y-1.5 pl-5 text-xs"
                style={{
                  color: "var(--text-2)",
                  lineHeight: 1.7,
                  listStyleType: "decimal",
                }}
              >
                {frMode && (
                  <>
                    <li>Stage 0 — preflight FR validation (already passed).</li>
                    <li>Stage 1 — parse Fact Review .docx/.pdf into ClientProfile.</li>
                    <li>Stage 2 — select recommendations from KB.</li>
                  </>
                )}
                <li>Stage 3a — quantify recommendations (parallel batches).</li>
                <li>Stage 3b — assemble sequenced plan (deterministic).</li>
                <li>Stage 4 — generate the 14-section plan body.</li>
                <li>Stage 5 — coherence audit.</li>
              </ol>
            </div>
          </CardContent>
          <div
            className="flex justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <Button variant="outline" size="sm" onClick={reset}>
              Queue another
            </Button>
            <Button
              size="sm"
              onClick={() => router.push(`/clients/${submitted.client_id}`)}
            >
              Go to {submitted.client_name}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────── Form state ───────────────
  return (
    <form onSubmit={onSubmit} className="max-w-2xl">
      {/* Stage 0 failures or other top-level errors */}
      {topLevelError && (
        <Card
          className="mb-4"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: "var(--s-red)",
            background: "var(--s-red-bg)",
          }}
        >
          <CardContent className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                style={{ color: "var(--s-red)" }}
              />
              <div className="flex-1 text-[13px]" style={{ color: "var(--text)" }}>
                <strong>{topLevelError}</strong>
                {stage0Failures.length > 0 && (
                  <ul className="mt-2 space-y-2 pl-4 text-xs" style={{ listStyleType: "disc", color: "var(--text-2)" }}>
                    {stage0Failures.map((f, i) => (
                      <li key={i}>
                        <div>
                          <span
                            className="text-[10px] uppercase"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: "var(--text-3)",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {humanizeCheck(f.check)}
                          </span>
                          <span style={{ color: "var(--text)" }}>{" — "}{f.reason}</span>
                        </div>
                        {f.remediation && (
                          <div
                            className="mt-1 rounded-sm px-2 py-1 text-[11px]"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-2)",
                              borderLeft: "2px solid var(--accent)",
                            }}
                          >
                            <strong style={{ color: "var(--text)" }}>Fix:</strong>{" "}
                            {f.remediation}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {stage0Failures.length > 0 && (
                  <div
                    className="mt-3 text-[11px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    Update the Fact Review document and re-upload — the client and
                    filename are preserved.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card 1: Client + filename */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle
            className="text-[12px] font-medium uppercase"
            style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
          >
            1 · Client &amp; fact review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pg-client" className="text-[11px] uppercase" style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}>
              Client
            </Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger id="pg-client">
                <SelectValue placeholder="Select household…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.household_name}
                    {c.archetype ? ` · ${c.archetype}` : ""}
                    {c.status ? ` · ${c.status}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {client ? (
              <div
                className="text-[11px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-3)",
                  marginTop: 2,
                }}
              >
                {client.id}
                {client.advisors
                  ? ` · lead: ${client.advisors.first_name} ${client.advisors.last_name[0]}.`
                  : ""}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pg-fr" className="text-[11px] uppercase" style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}>
              Fact review filename
            </Label>
            <Input
              id="pg-fr"
              value={frFilename}
              onChange={(e) => setFrFilename(e.target.value)}
              placeholder="e.g. holloway_fr_2026-04-21.docx"
              style={{ fontFamily: "var(--font-mono)" }}
              required
            />
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
              Source-of-truth filename in plan provenance. Auto-fills when a Fact Review file is uploaded.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Upload Fact Review */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle
            className="text-[12px] font-medium uppercase"
            style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
          >
            2 · Upload Fact Review
          </CardTitle>
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
          >
            .docx or .pdf
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <FrFileField
            file={frFile}
            error={frFileError}
            onPick={handleFrPick}
            onClear={() => {
              setFrFile(null);
              setFrFileError(null);
            }}
            disabled={jsonModeReady}
          />
          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
            The orchestrator runs Stages 0 → 5: validate, parse, select recommendations, quantify, generate the plan body, and audit. Typical run-time ~25–40 min.
          </div>
        </CardContent>
      </Card>

      {/* Power-user JSON fallback (collapsible) */}
      <Card className="mb-4">
        <CardHeader
          className="flex-row items-center justify-between space-y-0 cursor-pointer"
          onClick={() => setJsonFallbackOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            {jsonFallbackOpen ? (
              <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-2)" }} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-2)" }} />
            )}
            <CardTitle
              className="text-[12px] font-medium uppercase"
              style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
            >
              Or upload pre-built JSONs (advanced)
            </CardTitle>
          </div>
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
          >
            skip Stages 1+2
          </span>
        </CardHeader>
        {jsonFallbackOpen && (
          <CardContent className="space-y-4">
            <div
              className="rounded-md px-3 py-2 text-[11px]"
              style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
            >
              When both JSONs are provided, the CLI skips parsing (Stage 1) and recommendation
              selection (Stage 2). Useful for re-running plans with deterministic upstream output
              (e.g., test fixtures).
            </div>
            <FileField
              id="pg-profile"
              label="ClientProfile JSON"
              hint="Output of Stage 1. Validated against ClientProfileSchema on upload."
              shape="ClientProfile"
              file={profileFile}
              parsed={profileJson}
              error={profileErr}
              onPick={(f) =>
                readJsonFile(f, setProfileFile, setProfileJson, setProfileErr)
              }
            />
            <FileField
              id="pg-recs"
              label="SelectedRecommendations JSON"
              hint="Output of Stage 2. Drives Stage 3a quantification + RB.* / RP.* sections."
              shape="SelectedRecommendations"
              file={recsFile}
              parsed={recsJson}
              error={recsErr}
              onPick={(f) =>
                readJsonFile(f, setRecsFile, setRecsJson, setRecsErr)
              }
            />
          </CardContent>
        )}
      </Card>

      {/* Deferred-processing notice */}
      <Card
        className="mb-4"
        style={{ background: "var(--surface-2)" }}
      >
        <CardContent className="px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Info
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
              style={{ color: "var(--text-2)" }}
            />
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
              <strong style={{ color: "var(--text)" }}>Deferred processing.</strong>{" "}
              Submitting queues a job — it does not generate the plan in your
              browser. The orchestrator runs locally on Hayden&rsquo;s machine via{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>npm run generate-pending</code>.
              Expected cost ~$23–38 per plan; budget cap is $150 per run with per-stage gates.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit row with smart hint + upload progress */}
      <div className="space-y-2">
        {submitting && uploadProgress !== null && (
          <div className="space-y-1">
            <div
              className="text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
            >
              Uploading… {uploadProgress}%
            </div>
            <div
              className="h-1 w-full rounded-full overflow-hidden"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${uploadProgress}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <span
            className="mr-auto text-[11px]"
            style={{ color: "var(--text-3)" }}
          >
            {submitHint}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/clients")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            data-api="POST /api/plans/generate"
          >
            {submitting ? (
              "Queueing…"
            ) : (
              <>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Queue plan
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─────────────── Fact Review file picker (.docx + .pdf) ───────────────
interface FrFileFieldProps {
  file: File | null;
  error: string | null;
  onPick: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
}

function FrFileField({ file, error, onPick, onClear, disabled }: FrFileFieldProps) {
  const sizeKb = file ? (file.size / 1024).toFixed(1) : null;
  const ext = file ? getFileExtension(file.name) : null;

  return (
    <div className="space-y-1.5">
      <div
        className="relative rounded-md border-2 border-dashed transition-colors hover:bg-[var(--surface-2)]"
        style={{
          borderColor: error
            ? "var(--s-red)"
            : file
              ? "var(--s-green)"
              : "var(--border-strong)",
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <input
          id="pg-fr-file"
          type="file"
          accept={FR_ACCEPT_EXTENSIONS.join(",") + ",application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <label htmlFor="pg-fr-file" className="flex cursor-pointer items-center gap-3 px-4 py-4">
          {!file ? (
            <>
              <Upload className="h-5 w-5 flex-shrink-0" style={{ color: "var(--text-2)" }} />
              <div className="flex flex-1 flex-col">
                <span className="text-[14px]" style={{ color: "var(--text)" }}>
                  <strong>Click to upload</strong> or drop a Fact Review
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  Accepted formats:{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>.docx</span>{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>.pdf</span>
                  {" "}· Max 25 MB
                </span>
              </div>
            </>
          ) : error ? (
            <>
              <FileText className="h-5 w-5 flex-shrink-0" style={{ color: "var(--s-red)" }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {file.name}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--s-red)" }}>
                  {error}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full p-1 hover:bg-[var(--surface-2)]"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }}
              >
                <X className="h-3.5 w-3.5" style={{ color: "var(--text-2)" }} />
              </button>
            </>
          ) : (
            <>
              <FileText className="h-5 w-5 flex-shrink-0" style={{ color: "var(--s-green)" }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {file.name}
                </div>
                <div
                  className="mt-0.5 text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
                >
                  {sizeKb} KB · {ext}
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--s-green-bg)", color: "var(--s-green)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--s-green)" }} />
                Ready
              </span>
              <button
                type="button"
                className="rounded-full p-1 hover:bg-[var(--surface-2)]"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }}
              >
                <X className="h-3.5 w-3.5" style={{ color: "var(--text-2)" }} />
              </button>
            </>
          )}
        </label>
      </div>
    </div>
  );
}

// ─────────────── File picker for JSON payloads (fallback path) ───────────────
interface FileFieldProps {
  id: string;
  label: string;
  hint: string;
  shape: string;
  file: File | null;
  parsed: unknown;
  error: string | null;
  onPick: (f: File) => void;
}

function FileField({ id, label, hint, shape, file, parsed, error, onPick }: FileFieldProps) {
  const sizeKb = file ? (file.size / 1024).toFixed(1) : null;
  const isArray = Array.isArray(parsed);
  const keyCount =
    parsed && typeof parsed === "object" && !isArray
      ? Object.keys(parsed as object).length
      : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[11px] uppercase" style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}>
        {label}
      </Label>
      <div
        className="relative rounded-md border-2 border-dashed transition-colors hover:bg-[var(--surface-2)]"
        style={{
          borderColor: error
            ? "var(--s-red)"
            : parsed
              ? "var(--s-green)"
              : "var(--border-strong)",
        }}
      >
        <input
          id={id}
          type="file"
          accept=".json,application/json"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
          {!file ? (
            <>
              <Upload className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-2)" }} />
              <div className="flex flex-1 flex-col">
                <span className="text-[13px]" style={{ color: "var(--text)" }}>
                  <strong>Click to upload</strong> or drop a{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>.json</span> file
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  Expected shape:{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>{shape}</span>
                </span>
              </div>
            </>
          ) : error ? (
            <>
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "var(--s-red)" }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {file.name}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--s-red)" }}>
                  {error}
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--s-red-bg)", color: "var(--s-red)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--s-red)" }} />
                Invalid
              </span>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "var(--s-green)" }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {file.name}
                </div>
                <div
                  className="mt-0.5 text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
                >
                  {sizeKb} KB ·{" "}
                  {isArray
                    ? `array · ${(parsed as unknown[]).length} items`
                    : `object · ${keyCount} top-level keys`}
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--s-green-bg)", color: "var(--s-green)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--s-green)" }} />
                Parsed
              </span>
            </>
          )}
        </label>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {hint}
      </div>
    </div>
  );
}
