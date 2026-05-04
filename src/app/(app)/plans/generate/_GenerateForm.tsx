"use client";

// Plan generate form — Claude Design's view-plan-generate.jsx polish
// applied. Two-card layout with JSON parse validation + Parsed/Invalid
// badges per file, smart submit-button hint cycling, and a success
// state showing the queued plan_id with a 4-step "what happens next"
// explainer.
//
// Preserved from Phase 5b wiring:
//   - api.plans.generate({ clientId, factReviewFilename, clientprofile,
//     selectedRecommendations }) → POST /api/plans/generate (multipart)
//   - Server-side validation flagging back to the user via toast
//   - Redirect-to-client deferred to a CTA on the success state
//     (Claude Design surfaces the plan_id + queued_at first)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Info, Upload } from "lucide-react";
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
}

export function GenerateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [clientId, setClientId] = useState("");
  const [frFilename, setFrFilename] = useState("");

  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [recsFile, setRecsFile] = useState<File | null>(null);
  const [profileJson, setProfileJson] = useState<unknown>(null);
  const [recsJson, setRecsJson] = useState<unknown>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

  const client = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clientId, clients],
  );

  // Auto-suggest fact_review filename when client picked. Honors any
  // value the user typed manually — only fills when blank.
  useEffect(() => {
    if (!client || frFilename) return;
    const slug = client.household_name.toLowerCase().split(/\s+/)[0];
    const today = new Date().toISOString().slice(0, 10);
    setFrFilename(`${slug}_fr_${today}.docx`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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

  const canSubmit =
    !!clientId && !!frFilename && profileJson !== null && recsJson !== null && !submitting;

  const submitHint = (() => {
    if (submitting) return "Queueing…";
    if (!clientId) return "Select a client to begin.";
    if (!profileJson) return "Upload ClientProfile JSON.";
    if (!recsJson) return "Upload SelectedRecommendations JSON.";
    if (canSubmit) return "Ready to queue.";
    return "";
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !profileFile || !recsFile || !client) return;
    setSubmitting(true);
    try {
      const accepted: PlansApi.GenerateAcceptedResponse = await api.plans.generate({
        clientId: client.id,
        factReviewFilename: frFilename,
        clientprofile: profileFile,
        selectedRecommendations: recsFile,
      });
      setSubmitted({
        plan_id: accepted.id,
        client_id: client.id,
        client_name: client.household_name,
        fr_filename: frFilename,
        queued_at: accepted.queued_at,
      });
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not queue plan");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setClientId("");
    setFrFilename("");
    setProfileFile(null);
    setRecsFile(null);
    setProfileJson(null);
    setRecsJson(null);
    setProfileErr(null);
    setRecsErr(null);
    setSubmitted(null);
  }

  // ─────────────── Success state ───────────────
  if (submitted) {
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
                  . This isn&rsquo;t an instant draft — you&rsquo;ll see the plan land in{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>ready_for_review</span>{" "}
                  once the queue is processed. Typical turnaround is same-day for runs
                  submitted before 5pm ET.
                </p>
              </div>
            </div>

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
                What happens next
              </div>
              <ol
                className="space-y-1.5 pl-5 text-xs"
                style={{
                  color: "var(--text-2)",
                  lineHeight: 1.7,
                  listStyleType: "decimal",
                }}
              >
                <li>Hayden&rsquo;s CLI picks up the queued payload.</li>
                <li>
                  Orchestrator runs Stages 3a → 4 → 5 against Anthropic Opus 4.7.
                </li>
                <li>
                  Stage outputs (
                  <span style={{ fontFamily: "var(--font-mono)" }}>stage3a_output</span>,{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>stage4_output</span>,{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>stage5_output</span>) write
                  to the plan record.
                </li>
                <li>
                  Plan status flips to{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>ready_for_review</span>;
                  you&rsquo;ll see it on the client&rsquo;s Plan tab.
                </li>
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
      {/* Card 1: Client + filename */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle
            className="text-[11px] font-medium uppercase"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
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
              Reference only — used as the source-of-truth filename in plan provenance.
              The .docx itself does not need to be uploaded here.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Upload payload JSON */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle
            className="text-[11px] font-medium uppercase"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
          >
            2 · Upload payload JSON
          </CardTitle>
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
          >
            2 files required
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileField
            id="pg-profile"
            label="ClientProfile JSON"
            hint="Output of the discovery / fact-review stage. Validated as JSON on upload."
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
            hint="Curated rec set from the recommendation stage. Drives RB.* / RP.* sections."
            shape="SelectedRecommendations"
            file={recsFile}
            parsed={recsJson}
            error={recsErr}
            onPick={(f) =>
              readJsonFile(f, setRecsFile, setRecsJson, setRecsErr)
            }
          />
        </CardContent>
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
              Expect same-day turnaround for runs submitted before 5pm ET; you&rsquo;ll see
              the plan appear in{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>ready_for_review</span> on
              the client detail page.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit row with smart hint */}
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
    </form>
  );
}

// ─────────────── File picker for JSON payloads ───────────────
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
