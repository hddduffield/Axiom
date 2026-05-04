// Plan view — converts Claude Design's view-plan.jsx over the existing
// Stage4Result render path (preserved from Phase 5e/6). The data shape
// is real: the body iterates plan.stage4_output (LLM + deterministic
// sections). The reference's static demo content is replaced with that
// schema's actual fields.
//
// Conversion notes vs Claude Design source:
//   - Reference §01 "Title page" is implemented as a printable
//     centerpiece card sourced from the joined client + plan generated
//     date. The real Stage4Result schema has no `title_page` field
//     (titling lives in the React-PDF renderer); the editorial card
//     here is purely the web rendering. PDF output is unchanged.
//   - Active-section TOC tracking lives in <PlanToc> (Client island)
//     using IntersectionObserver — the reference left this as a
//     "no-op" intentionally.
//   - Status badges use Axiom token colors (--s-*); state machine is
//     queued / processing / ready_for_review / approved / archived /
//     failed. "draft" mentioned in the design source maps to "queued"
//     in production (see migration 0003 + Phase 5b state machine).
//   - The mock "Plan facts" panel (quarter / rec count / lens runs /
//     last regen) is rendered from real fields where available; absent
//     ones fall back to em-dash. Quarter derives from generated_at.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { Stage4Result } from "@/lib/orchestrator/schemas/stage4.types";
import type { PlanStatus } from "@/lib/api/types";
import { PlanActions } from "./_PlanActions";
import { PlanToc } from "./_PlanToc";

// ─────────── Section catalog ───────────
// num/id pairs are the source of truth for both the TOC and the
// `<section id="…">` headers inside the article.

const SECTIONS: Array<{ num: number; id: string; label: string }> = [
  { num: 1, id: "s-1", label: "Title page" },
  { num: 2, id: "s-2", label: "Executive summary" },
  { num: 3, id: "s-3", label: "Our process" },
  { num: 4, id: "s-4", label: "Client snapshot" },
  { num: 5, id: "s-5", label: "Goals & priorities" },
  { num: 6, id: "s-6", label: "Findings & observations" },
  { num: 7, id: "s-7", label: "Recommendations — Business" },
  { num: 8, id: "s-8", label: "Recommendations — Personal" },
  { num: 9, id: "s-9", label: "Implementation roadmap" },
  { num: 10, id: "s-10", label: "Decisions needed" },
  { num: 11, id: "s-11", label: "Advisory team" },
  { num: 12, id: "s-12", label: "Meeting cadence" },
  { num: 13, id: "s-13", label: "Glossary" },
  { num: 14, id: "s-14", label: "Disclosures" },
];

// ─────────── Helpers ───────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function quarterOf(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const tone =
    status === "approved"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Approved" }
      : status === "ready_for_review"
        ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)", label: "Ready for review" }
        : status === "archived"
          ? { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: "Archived" }
          : status === "failed"
            ? { fg: "var(--s-red)", bg: "var(--s-red-bg)", label: "Failed" }
            : status === "processing"
              ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Processing" }
              : { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Queued" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}

// ─────────── Page ───────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function PlanPage({ params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: plan, error } = await supabase
    .from("plans")
    .select("*, clients(id, household_name)")
    .eq("id", id)
    .maybeSingle();
  if (error || !plan) notFound();

  const stage4 = plan.stage4_output as unknown as Stage4Result | null;
  const status = plan.status as PlanStatus;
  const householdName = plan.clients?.household_name ?? "Client";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page head ── */}
      <div>
        <div className="text-xs" style={{ color: "var(--text-3)" }}>
          <Link href="/clients" className="hover:underline">
            Clients
          </Link>
          <span className="mx-1.5">›</span>
          <Link
            href={`/clients/${plan.client_id}`}
            className="hover:underline"
          >
            {householdName}
          </Link>
          <span className="mx-1.5">›</span>
          <span style={{ color: "var(--text-2)" }}>Comprehensive Plan</span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-3xl font-medium"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {householdName} · Comprehensive Plan
            </h1>
            <p
              className="mt-1 flex flex-wrap items-center gap-2 text-sm"
              style={{ color: "var(--text-2)" }}
            >
              <PlanStatusBadge status={status} />
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span>Generated {fmtDate(plan.generated_at)}</span>
              {plan.fact_review_filename ? (
                <>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                  <span>
                    Fact review{" "}
                    <span style={{ fontFamily: "var(--font-mono)" }}>
                      {plan.fact_review_filename}
                    </span>
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <PlanActions planId={plan.id} status={status} />
        </div>
      </div>

      {/* ── Banners for non-content states ── */}
      {!stage4 && (status === "queued" || status === "processing") ? (
        <BannerCard
          icon={<Clock className="h-4 w-4" />}
          title="Plan content not yet generated"
          body={
            <>
              The orchestrator is queued to assemble this plan from the fact
              review and selected recommendations. Sections below show the
              document structure with field-path placeholders. Average run
              time: ~12 minutes.
            </>
          }
        />
      ) : null}

      {!stage4 && status === "failed" ? (
        <BannerCard
          tone="error"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Plan generation failed"
          body={
            plan.failure_reason ? (
              <>
                The orchestrator returned an error during plan assembly.
                <code
                  className="mt-2 block rounded px-2 py-1.5 text-[11px]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--surface-2)",
                    color: "var(--text-2)",
                  }}
                >
                  {plan.failure_reason}
                </code>
              </>
            ) : (
              "The orchestrator returned an error during plan assembly."
            )
          }
        />
      ) : null}

      {!stage4 ? null : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
          {/* ── TOC rail ── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div
              className="text-[11px] uppercase"
              style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
            >
              Contents
            </div>
            <div className="mt-2">
              <PlanToc sections={SECTIONS} />
            </div>
            <div
              className="mt-6 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="text-[11px] uppercase"
                style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
              >
                Plan facts
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-y-1.5 text-[11px]">
                <FactRow label="Quarter" value={quarterOf(plan.generated_at)} />
                <FactRow
                  label="Cost"
                  value={
                    plan.cost_cents != null
                      ? `$${(plan.cost_cents / 100).toFixed(2)}`
                      : "—"
                  }
                />
                <FactRow
                  label="Approved"
                  value={plan.approved_at ? fmtDate(plan.approved_at) : "—"}
                />
              </dl>
            </div>
          </aside>

          {/* ── Document body ── */}
          <article
            className="max-w-[760px]"
            style={{ color: "var(--text)" }}
          >
            <TitlePageSection
              householdName={householdName}
              quarter={quarterOf(plan.generated_at)}
            />
            <PlanBody stage4={stage4} />
            <div style={{ height: 80 }} />
          </article>
        </div>
      )}
    </div>
  );
}

// ─────────── Banner card (queued / failed states) ───────────

function BannerCard({
  icon,
  title,
  body,
  tone = "info",
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  tone?: "info" | "error";
}) {
  const colors =
    tone === "error"
      ? {
          border: "var(--s-red-bg)",
          iconBg: "var(--s-red-bg)",
          iconFg: "var(--s-red)",
        }
      : {
          border: "var(--border)",
          iconBg: "var(--surface-2)",
          iconFg: "var(--text-2)",
        };
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-dashed p-4"
      style={{ background: "var(--surface-2)", borderColor: colors.border }}
    >
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded"
        style={{ background: colors.iconBg, color: colors.iconFg }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
          {title}
        </p>
        <div className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

// ─────────── Plan facts row ───────────

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt
        className="text-[10px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </dt>
      <dd
        className="text-right"
        style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────── Title page (§01) ───────────

function TitlePageSection({
  householdName,
  quarter,
}: {
  householdName: string;
  quarter: string;
}) {
  return (
    <PlanSection num={1} title="Title page">
      <div
        className="rounded-md border p-12 text-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div
          className="text-[10px] uppercase"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--text-3)",
            letterSpacing: "0.2em",
            marginBottom: 32,
          }}
        >
          Confidential — for client use only
        </div>
        <div
          className="text-[28px]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {householdName}
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Comprehensive Wealth Plan · {quarter}
        </div>
        <div className="mt-8 text-xs" style={{ color: "var(--text-3)" }}>
          Prepared by PSA Wealth
        </div>
      </div>
    </PlanSection>
  );
}

// ─────────── Plan body — iterates stage4_output ───────────

function PlanBody({ stage4 }: { stage4: Stage4Result }) {
  const ll = stage4.llm_sections;
  const det = stage4.deterministic_sections;

  return (
    <>
      <PlanSection num={2} title="Executive summary">
        <Para>{ll.executive_summary.opening_paragraph}</Para>
        <Para>{ll.executive_summary.two_themes_paragraph}</Para>
        <SubHead>Top priorities</SubHead>
        <ol className="mt-2 list-decimal pl-6">
          {ll.executive_summary.top_priorities.map((tp) => (
            <li key={tp.rank} className="leading-7">
              <strong>{tp.descriptor}</strong> — {tp.estimated_impact_text} ·{" "}
              {tp.timing_text}
            </li>
          ))}
        </ol>
        <Para className="mt-4">
          {ll.executive_summary.what_this_means_closer}
        </Para>
      </PlanSection>

      <PlanSection num={3} title="Our process">
        <Para>{ll.our_process.intro_paragraph}</Para>
        {ll.our_process.stages.map((st) => (
          <div key={st.number} className="mt-3">
            <SubHead>
              {st.number}. {st.name}
            </SubHead>
            <Para>{st.body}</Para>
          </div>
        ))}
        <Para className="mt-3">{ll.our_process.how_to_read_paragraph}</Para>
      </PlanSection>

      <PlanSection num={4} title="Client snapshot">
        {det.client_snapshot.entity ? (
          <Para>
            <strong>{det.client_snapshot.entity.business_name}</strong> ·{" "}
            {det.client_snapshot.entity.entity_type} ·{" "}
            {det.client_snapshot.entity.ownership}
          </Para>
        ) : null}
        {det.client_snapshot.valuation_text ? (
          <Para>{det.client_snapshot.valuation_text}</Para>
        ) : null}
        {det.client_snapshot.coverage_table.length > 0 ? (
          <ul className="mt-2 list-disc pl-6">
            {det.client_snapshot.coverage_table.map((row, i) => (
              <li key={i} className="leading-7">
                <strong>{row.category}:</strong> {row.in_place} — {row.notes}
              </li>
            ))}
          </ul>
        ) : null}
      </PlanSection>

      <PlanSection num={5} title="Goals & priorities">
        <Para>{det.goals_priorities.intro_paragraph}</Para>
        <ol className="mt-2 list-decimal pl-6">
          {det.goals_priorities.goals.map((g) => (
            <li key={g.number} className="leading-7">
              <strong>{g.goal_name}</strong> —{" "}
              {g.what_this_means_in_practice}
            </li>
          ))}
        </ol>
      </PlanSection>

      <PlanSection num={6} title="Findings & observations">
        <Para>{ll.findings_observations.intro_paragraph}</Para>
        <SubHead>Strengths</SubHead>
        <ul className="mt-1 list-disc pl-6">
          {ll.findings_observations.strengths.map((s, i) => (
            <li key={i} className="leading-7">
              {s.body}
            </li>
          ))}
        </ul>
        <SubHead className="mt-3">Opportunities</SubHead>
        {ll.findings_observations.opportunities.map((og, i) => (
          <div key={i} className="mt-2">
            <p
              className="text-[12px] font-medium uppercase"
              style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
            >
              {og.category}
            </p>
            <ul className="mt-1 list-disc pl-6">
              {og.bullets.map((b, j) => (
                <li key={j} className="leading-7">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </PlanSection>

      <RecLensSection
        num={7}
        title="Recommendations — Business"
        lens={ll.recommendations_business}
      />
      <RecLensSection
        num={8}
        title="Recommendations — Personal"
        lens={ll.recommendations_personal}
      />

      {/* §09 — Implementation roadmap (compact, tokenized) */}
      <PlanSection num={9} title="Implementation roadmap">
        <Para>{det.implementation_roadmap.intro_paragraph}</Para>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          {det.implementation_roadmap.total_action_count} action items across{" "}
          {det.implementation_roadmap.groups.length} timing buckets.
        </p>
        <div
          className="mt-3 overflow-hidden rounded-md border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full text-[12.5px]">
            <thead
              className="border-b"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-2)",
                color: "var(--text-3)",
              }}
            >
              <tr>
                <th className="w-[110px] px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Bucket
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Action
                </th>
                <th className="w-[120px] px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Owner
                </th>
                <th className="w-[110px] px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {det.implementation_roadmap.groups.map((group) =>
                group.rows.map((r, i) => (
                  <tr
                    key={`${group.timing_bucket}-${i}`}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex rounded px-1.5 py-0.5 text-[11px]"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-2)",
                        }}
                      >
                        {group.bucket_label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text)" }}>
                      {r.action}
                    </td>
                    <td
                      className="px-3 py-2.5"
                      style={{ color: "var(--text-2)" }}
                    >
                      {r.owner}
                    </td>
                    <td className="px-3 py-2.5">
                      <RoadmapStatusBadge status={r.status} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </PlanSection>

      {/* §10 — Decisions (banner card) */}
      <PlanSection num={10} title="Decisions needed">
        <div
          className="rounded-md border p-4"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="mb-2 text-[11px] uppercase"
            style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
          >
            {det.decisions_needed.rows.length} open decision
            {det.decisions_needed.rows.length === 1 ? "" : "s"}
          </div>
          <Para className="!mb-3">{det.decisions_needed.intro_paragraph}</Para>
          <ol className="list-decimal pl-6">
            {det.decisions_needed.rows.map((d) => (
              <li key={d.number} className="leading-7">
                <strong>{d.decision_question}</strong> — Recommended:{" "}
                {d.recommended_path}
                {d.decision_needed_by ? (
                  <>
                    {" "}
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-3)" }}
                    >
                      (by {d.decision_needed_by})
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </PlanSection>

      <PlanSection num={11} title="Advisory team">
        <Para>{det.advisory_team.intro_paragraph}</Para>
        <ul className="mt-2 list-disc pl-6">
          {det.advisory_team.rows.map((r, i) => (
            <li key={i} className="leading-7">
              <strong>{r.role}</strong>: {r.firm_or_contact} — {r.notes}
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection num={12} title="Meeting cadence">
        <Para>{ll.meeting_cadence_intro.intro_paragraph}</Para>
        <SubHead>Cadence</SubHead>
        <ul className="mt-1 list-disc pl-6">
          {det.meeting_cadence_table.rows.map((r, i) => (
            <li key={i} className="leading-7">
              <strong>{r.meeting_name}</strong> ({r.frequency}): {r.agenda}
            </li>
          ))}
        </ul>
        <SubHead className="mt-3">Immediate next steps</SubHead>
        <ul className="mt-1 list-disc pl-6">
          {ll.meeting_cadence_intro.immediate_next_steps.map((step, i) => (
            <li key={i} className="leading-7">
              {step}
            </li>
          ))}
        </ul>
      </PlanSection>

      <PlanSection num={13} title="Glossary">
        <Para>{det.glossary.intro_paragraph}</Para>
        <dl className="mt-2 space-y-2">
          {det.glossary.entries.map((e, i) => (
            <div key={i}>
              <dt
                className="text-sm font-medium"
                style={{ color: "var(--text)" }}
              >
                {e.term}
                {e.acronym ? ` (${e.acronym})` : ""}
              </dt>
              <dd
                className="text-sm leading-7"
                style={{ color: "var(--text-2)" }}
              >
                {e.plain_english_definition}
              </dd>
            </div>
          ))}
        </dl>
      </PlanSection>

      <PlanSection num={14} title="Disclosures">
        {det.disclosures.body_paragraphs.map((p, i) => (
          <p
            key={i}
            className="mb-3 text-[11px] leading-relaxed"
            style={{ color: "var(--text-3)" }}
          >
            {p}
          </p>
        ))}
        <p
          className="mt-2 text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          Compliance Tracking ID: {det.disclosures.compliance_tracking_id}
        </p>
      </PlanSection>
    </>
  );
}

// ─────────── Recommendations lens (§07 / §08) ───────────

function RecLensSection({
  num,
  title,
  lens,
}: {
  num: number;
  title: string;
  lens: Stage4Result["llm_sections"]["recommendations_business"];
}) {
  return (
    <PlanSection num={num} title={title}>
      <Para>{lens.intro_paragraph}</Para>
      {lens.sections.map((sec) => (
        <div key={sec.section_id} className="mt-6">
          <h3
            className="text-base"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              color: "var(--text)",
            }}
          >
            {sec.numbered_heading}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            {sec.label}
          </p>
          <Para className="mt-1">{sec.intro_paragraph}</Para>
          {sec.subsections && sec.subsections.length > 0 ? (
            sec.subsections.map((sub, si) => (
              <div key={si} className="mt-3">
                <SubHead>{sub.heading}</SubHead>
                {sub.intro ? <Para>{sub.intro}</Para> : null}
                <div className="mt-1 flex flex-col gap-2">
                  {sub.bullets.map((b, bi) => (
                    <RecCard key={bi} bullet={b} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {sec.recommendations_bullets.map((b, bi) => (
                <RecCard key={bi} bullet={b} />
              ))}
            </div>
          )}
          {sec.closer_paragraph ? (
            <div
              className="mt-3 rounded-md border p-3"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
              }}
            >
              <strong>{sec.closer_paragraph.label}: </strong>
              {sec.closer_paragraph.body}
            </div>
          ) : null}
        </div>
      ))}
    </PlanSection>
  );
}

function RecCard({
  bullet,
}: {
  bullet: {
    bold_imperative: string;
    briefing: string;
    partner_role: string | null;
  };
}) {
  return (
    <div
      className="rounded-md border p-3.5 transition-colors hover:border-[var(--text-3)]"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <p
        className="text-sm font-medium leading-snug"
        style={{ color: "var(--text)" }}
      >
        {bullet.bold_imperative}
      </p>
      <p
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        {bullet.briefing}
      </p>
      {bullet.partner_role ? (
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--text-3)" }}
        >
          Partner: {bullet.partner_role}
        </p>
      ) : null}
    </div>
  );
}

// ─────────── Section + typography primitives ───────────

function PlanSection({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`s-${num}`}
      className="scroll-mt-20 [&+section]:mt-14 [&+section]:border-t [&+section]:pt-8"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="text-[11px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.08em",
          fontFamily: "var(--font-mono)",
        }}
      >
        §{String(num).padStart(2, "0")}
      </div>
      <h2
        className="mt-1 text-[22px]"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 500,
          letterSpacing: "-0.015em",
          color: "var(--text)",
          marginBottom: 16,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Para({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mb-3 max-w-[70ch] text-[14px] leading-7 ${className}`}
      style={{ color: "var(--text)" }}
    >
      {children}
    </p>
  );
}

function SubHead({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h4
      className={`mt-3 text-sm font-medium ${className}`}
      style={{ color: "var(--text)" }}
    >
      {children}
    </h4>
  );
}

function RoadmapStatusBadge({ status }: { status: string }) {
  const tone =
    status === "complete" || status === "done"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Done" }
      : status === "in_progress"
        ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)", label: "In progress" }
        : status === "blocked" || status === "pending_decision"
          ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Blocked" }
          : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: "Not started" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}
