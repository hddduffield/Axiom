import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import type { Stage4Result } from "@/lib/orchestrator/schemas/stage4.types";
import { PlanActions } from "./_PlanActions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "exec", label: "Executive Summary" },
  { id: "process", label: "Our Process" },
  { id: "snapshot", label: "Client Snapshot" },
  { id: "goals", label: "Goals & Priorities" },
  { id: "findings", label: "Findings" },
  { id: "rb", label: "Recommendations — Business" },
  { id: "rp", label: "Recommendations — Personal" },
  { id: "roadmap", label: "Implementation Roadmap" },
  { id: "decisions", label: "Decisions Needed" },
  { id: "team", label: "Advisory Team" },
  { id: "cadence", label: "Meeting Cadence" },
  { id: "glossary", label: "Glossary" },
  { id: "disclosures", label: "Disclosures" },
];

function statusBadge(s: string): "default" | "secondary" | "outline" {
  if (s === "approved") return "default";
  if (s === "archived" || s === "failed") return "secondary";
  return "outline";
}

export default async function PlanPage({ params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: plan, error } = await supabase
    .from("plans")
    .select("*, clients(household_name)")
    .eq("id", id)
    .maybeSingle();
  if (error || !plan) notFound();

  const stage4 = plan.stage4_output as unknown as Stage4Result | null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/clients/${plan.client_id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {plan.clients?.household_name ?? "Client"}
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Financial Plan
            </h1>
            <p className="text-sm text-muted-foreground">
              Generated{" "}
              {new Date(plan.generated_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {plan.cost_cents != null
                ? ` · $${(plan.cost_cents / 100).toFixed(2)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge(plan.status)}>{plan.status}</Badge>
            <PlanActions planId={plan.id} status={plan.status} />
          </div>
        </div>
      </div>

      {!stage4 ? (
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            {plan.status === "queued" || plan.status === "processing" ? (
              <>
                Plan is currently <strong>{plan.status}</strong>. The CLI
                processes one plan at a time. Refresh in a few minutes.
              </>
            ) : plan.status === "failed" ? (
              <>
                Plan generation failed.{" "}
                {plan.failure_reason ? `Reason: ${plan.failure_reason}` : null}
              </>
            ) : (
              "stage4_output is empty — re-run generation."
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8 md:grid-cols-[180px_1fr]">
          {/* Section nav (sticky) */}
          <nav className="md:sticky md:top-6 md:self-start">
            <ul className="space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Plan body */}
          <article className="prose prose-sm max-w-none space-y-10 [&_h2]:mt-8 [&_h2]:font-semibold">
            <PlanBody stage4={stage4} />
          </article>
        </div>
      )}
    </div>
  );
}

function PlanBody({ stage4 }: { stage4: Stage4Result }) {
  const ll = stage4.llm_sections;
  const det = stage4.deterministic_sections;

  return (
    <>
      <Section id="exec" title="Executive Summary">
        <p>{ll.executive_summary.opening_paragraph}</p>
        <p>{ll.executive_summary.two_themes_paragraph}</p>
        <h3 className="mt-4 font-semibold">Top Priorities</h3>
        <ol className="mt-2 list-decimal pl-6">
          {ll.executive_summary.top_priorities.map((tp) => (
            <li key={tp.rank}>
              <strong>{tp.descriptor}</strong> — {tp.estimated_impact_text} ·{" "}
              {tp.timing_text}
            </li>
          ))}
        </ol>
        <p className="mt-4">{ll.executive_summary.what_this_means_closer}</p>
      </Section>

      <Section id="process" title="Our Process">
        <p>{ll.our_process.intro_paragraph}</p>
        {ll.our_process.stages.map((st) => (
          <div key={st.number} className="mt-3">
            <h4 className="font-semibold">
              {st.number}. {st.name}
            </h4>
            <p>{st.body}</p>
          </div>
        ))}
        <p className="mt-3">{ll.our_process.how_to_read_paragraph}</p>
      </Section>

      <Section id="snapshot" title="Client Snapshot">
        {det.client_snapshot.entity ? (
          <p>
            <strong>{det.client_snapshot.entity.business_name}</strong> ·{" "}
            {det.client_snapshot.entity.entity_type} ·{" "}
            {det.client_snapshot.entity.ownership}
          </p>
        ) : null}
        {det.client_snapshot.valuation_text ? (
          <p>{det.client_snapshot.valuation_text}</p>
        ) : null}
        {det.client_snapshot.coverage_table.length > 0 ? (
          <ul className="mt-2 list-disc pl-6">
            {det.client_snapshot.coverage_table.map((row, i) => (
              <li key={i}>
                <strong>{row.category}:</strong> {row.in_place} — {row.notes}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section id="goals" title="Goals & Priorities">
        <p>{det.goals_priorities.intro_paragraph}</p>
        <ol className="mt-2 list-decimal pl-6">
          {det.goals_priorities.goals.map((g) => (
            <li key={g.number}>
              <strong>{g.goal_name}</strong> — {g.what_this_means_in_practice}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="findings" title="Findings & Observations">
        <p>{ll.findings_observations.intro_paragraph}</p>
        <h3 className="mt-3 font-semibold">Strengths</h3>
        <ul className="mt-1 list-disc pl-6">
          {ll.findings_observations.strengths.map((s, i) => (
            <li key={i}>{s.body}</li>
          ))}
        </ul>
        <h3 className="mt-3 font-semibold">Opportunities</h3>
        {ll.findings_observations.opportunities.map((og, i) => (
          <div key={i} className="mt-2">
            <h4 className="font-semibold">{og.category}</h4>
            <ul className="mt-1 list-disc pl-6">
              {og.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <RecLens id="rb" title="Recommendations — Business" lens={ll.recommendations_business} />
      <RecLens id="rp" title="Recommendations — Personal" lens={ll.recommendations_personal} />

      <Section id="roadmap" title="Implementation Roadmap">
        <p>{det.implementation_roadmap.intro_paragraph}</p>
        <p className="text-xs text-muted-foreground">
          {det.implementation_roadmap.total_action_count} action items across{" "}
          {det.implementation_roadmap.groups.length} timing buckets.
        </p>
        {det.implementation_roadmap.groups.map((group) => (
          <div key={group.timing_bucket} className="mt-4">
            <h4 className="font-semibold">{group.bucket_label}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              {group.rows.map((r) => (
                <li key={r.source_action_item_id}>
                  <strong>{r.action}</strong> · {r.owner} · {r.status}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section id="decisions" title="Decisions Needed">
        <p>{det.decisions_needed.intro_paragraph}</p>
        <ol className="mt-2 list-decimal pl-6">
          {det.decisions_needed.rows.map((d) => (
            <li key={d.number}>
              <strong>{d.decision_question}</strong> — Recommended:{" "}
              {d.recommended_path} (by {d.decision_needed_by})
            </li>
          ))}
        </ol>
      </Section>

      <Section id="team" title="Advisory Team">
        <p>{det.advisory_team.intro_paragraph}</p>
        <ul className="mt-2 list-disc pl-6">
          {det.advisory_team.rows.map((r, i) => (
            <li key={i}>
              <strong>{r.role}</strong>: {r.firm_or_contact} — {r.notes}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cadence" title="Meeting Cadence">
        <p>{ll.meeting_cadence_intro.intro_paragraph}</p>
        <h3 className="mt-3 font-semibold">Cadence</h3>
        <ul className="mt-1 list-disc pl-6">
          {det.meeting_cadence_table.rows.map((r, i) => (
            <li key={i}>
              <strong>{r.meeting_name}</strong> ({r.frequency}): {r.agenda}
            </li>
          ))}
        </ul>
        <h3 className="mt-3 font-semibold">Immediate Next Steps</h3>
        <ul className="mt-1 list-disc pl-6">
          {ll.meeting_cadence_intro.immediate_next_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      </Section>

      <Section id="glossary" title="Glossary">
        <p>{det.glossary.intro_paragraph}</p>
        <dl className="mt-2 space-y-2">
          {det.glossary.entries.map((e, i) => (
            <div key={i}>
              <dt className="font-semibold">
                {e.term}
                {e.acronym ? ` (${e.acronym})` : ""}
              </dt>
              <dd>{e.plain_english_definition}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="disclosures" title="Disclosures">
        {det.disclosures.body_paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          Compliance Tracking ID: {det.disclosures.compliance_tracking_id}
        </p>
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl">{title}</h2>
      <Separator className="my-3" />
      {children}
    </section>
  );
}

function RecLens({
  id,
  title,
  lens,
}: {
  id: string;
  title: string;
  lens: Stage4Result["llm_sections"]["recommendations_business"];
}) {
  return (
    <Section id={id} title={title}>
      <p>{lens.intro_paragraph}</p>
      {lens.sections.map((sec) => (
        <div key={sec.section_id} className="mt-6">
          <h3 className="font-semibold">{sec.numbered_heading}</h3>
          <p className="text-xs text-muted-foreground">{sec.label}</p>
          <p className="mt-1">{sec.intro_paragraph}</p>
          {sec.subsections && sec.subsections.length > 0 ? (
            sec.subsections.map((sub, si) => (
              <div key={si} className="mt-3">
                <h4 className="font-semibold">{sub.heading}</h4>
                {sub.intro ? <p className="mt-1">{sub.intro}</p> : null}
                <ul className="mt-1 list-disc space-y-2 pl-6">
                  {sub.bullets.map((b, bi) => (
                    <BulletLi key={bi} bullet={b} />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <ul className="mt-2 list-disc space-y-2 pl-6">
              {sec.recommendations_bullets.map((b, bi) => (
                <BulletLi key={bi} bullet={b} />
              ))}
            </ul>
          )}
          {sec.closer_paragraph ? (
            <p className="mt-3">
              <strong>{sec.closer_paragraph.label}: </strong>
              {sec.closer_paragraph.body}
            </p>
          ) : null}
        </div>
      ))}
    </Section>
  );
}

function BulletLi({
  bullet,
}: {
  bullet: { bold_imperative: string; briefing: string; partner_role: string | null };
}) {
  return (
    <li>
      <strong>{bullet.bold_imperative}</strong> {bullet.briefing}
      {bullet.partner_role ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Partner: {bullet.partner_role}
        </p>
      ) : null}
    </li>
  );
}
