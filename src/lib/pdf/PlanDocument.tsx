// React-PDF document for a Stage4Result financial plan.
//
// 14 sections, rendered in the canonical PSA Wealth order:
//   T  Title page (own page; no recurring chrome)
//   ES Executive Summary
//   OP Our Process
//   CS Client Snapshot
//   GP Goals & Priorities
//   FO Findings & Observations
//   RB Recommendations — Business (sections RB.1 through RB.7)
//   RP Recommendations — Personal (sections RP.8 through RP.12)
//   IR Implementation Roadmap (table grouped by timing bucket)
//   DN Decisions Needed (table)
//   AT Advisory Team (table)
//   MC Meeting Cadence (intro + table + immediate next steps)
//   GL Glossary (table)
//   DS Disclosures (paragraphs)
//
// Single body page (with page breaks where needed) sandwiched between a
// no-chrome title page and the disclosures footer chrome on every body
// page. Markdown-style emphasis is NOT parsed in v1 — Stage 4 prose is
// plain text; the only "bold" rendering is the bold_imperative prefix
// on recommendation bullets, which is a separate field.

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type {
  ClientSnapshotCoverageRow,
  ClientSnapshotEntityRow,
  ClientSnapshotRevenueRow,
  GoalRow,
  GlossaryEntry,
  RoadmapRow,
  Stage4Result,
} from "@/lib/orchestrator/schemas/stage4.types";
import { COLORS, SIZE, styles } from "./styles";
import { PageFooter, PageHeader, TitlePageFooter } from "./components/PageChrome";
import { Bullet, H1, H2, H3, Paragraph, SectionLabel } from "./components/Atoms";
import { GroupBand, Table, type TableColumn } from "./components/Tables";

const SHORT_DISCLOSURE =
  "For informational purposes only. Not a guarantee of investment performance. Consult your tax/legal advisor before acting.";

interface PlanDocumentProps {
  plan: Stage4Result;
}

export function PlanDocument({ plan }: PlanDocumentProps) {
  const tp = plan.deterministic_sections.title_page;
  const headerLeft = `PSA Wealth — Financial Plan for ${tp.client_full_name}`;
  const headerRight = formatDate(tp.prepared_date);

  return (
    <Document
      title={`PSA Wealth Financial Plan — ${tp.client_full_name}`}
      author={tp.prepared_by_firm}
      creator={tp.prepared_by_firm}
      subject="Financial Plan"
    >
      {/* Title page — own page, minimal chrome */}
      <Page size="LETTER" style={styles.page}>
        <TitlePage tp={tp} />
        <TitlePageFooter
          firmName={tp.prepared_by_firm}
          complianceTrackingId={tp.compliance_tracking_id}
        />
      </Page>

      {/* Body — recurring header + footer */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
        <PageFooter
          firmName={tp.prepared_by_firm}
          planId={tp.compliance_tracking_id}
          complianceTrackingId={tp.compliance_tracking_id}
          shortDisclosure={SHORT_DISCLOSURE}
        />

        {/* Sections render in canonical order */}
        <ExecutiveSummary section={plan.llm_sections.executive_summary} />
        <OurProcess section={plan.llm_sections.our_process} />
        <ClientSnapshot section={plan.deterministic_sections.client_snapshot} />
        <GoalsPriorities section={plan.deterministic_sections.goals_priorities} />
        <FindingsObservations section={plan.llm_sections.findings_observations} />

        <RecommendationsBlock
          title="Recommendations — Business"
          intro={plan.llm_sections.recommendations_business.intro_paragraph}
          sections={plan.llm_sections.recommendations_business.sections}
        />
        <RecommendationsBlock
          title="Recommendations — Personal"
          intro={plan.llm_sections.recommendations_personal.intro_paragraph}
          sections={plan.llm_sections.recommendations_personal.sections}
        />

        <ImplementationRoadmap
          section={plan.deterministic_sections.implementation_roadmap}
        />
        <DecisionsNeeded section={plan.deterministic_sections.decisions_needed} />
        <AdvisoryTeam section={plan.deterministic_sections.advisory_team} />
        <MeetingCadence
          intro={plan.llm_sections.meeting_cadence_intro}
          table={plan.deterministic_sections.meeting_cadence_table}
        />
        <GlossarySection section={plan.deterministic_sections.glossary} />
        <DisclosuresSection section={plan.deterministic_sections.disclosures} />
      </Page>
    </Document>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Title page
// ────────────────────────────────────────────────────────────────────────

function TitlePage({ tp }: { tp: Stage4Result["deterministic_sections"]["title_page"] }) {
  const subjects = [tp.client_full_name, tp.spouse_full_name].filter(Boolean).join(" & ");
  return (
    <View style={styles.titlePageWrapper}>
      <Text style={styles.titleFirm}>{tp.prepared_by_firm}</Text>
      <Text style={styles.titleHeading}>Financial Plan</Text>
      <Text style={styles.titleSubheading}>Prepared for {subjects}</Text>

      {tp.business_name ? (
        <View style={styles.titleMetaRow}>
          <Text style={styles.titleMetaLabel}>Business</Text>
          <Text style={styles.titleMetaValue}>
            {tp.business_name}
            {tp.ownership_summary ? ` · ${tp.ownership_summary}` : ""}
          </Text>
        </View>
      ) : null}
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Prepared by</Text>
        <Text style={styles.titleMetaValue}>{tp.prepared_by_name}</Text>
      </View>
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Prepared on</Text>
        <Text style={styles.titleMetaValue}>{formatDate(tp.prepared_date)}</Text>
      </View>
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Compliance ID</Text>
        <Text style={styles.titleMetaValue}>{tp.compliance_tracking_id}</Text>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Executive Summary
// ────────────────────────────────────────────────────────────────────────

function ExecutiveSummary({
  section,
}: {
  section: Stage4Result["llm_sections"]["executive_summary"];
}) {
  return (
    <View>
      <H1>Executive Summary</H1>
      <Paragraph>{section.opening_paragraph}</Paragraph>
      <Paragraph>{section.two_themes_paragraph}</Paragraph>

      <H3>Top Priorities</H3>
      <Table
        columns={[
          { header: "#", width: "8%", cell: (r) => r.rank },
          { header: "Priority", width: "52%", cell: (r) => r.descriptor },
          { header: "Estimated Impact", width: "20%", cell: (r) => r.estimated_impact_text },
          { header: "Timing", width: "20%", cell: (r) => r.timing_text },
        ]}
        rows={section.top_priorities}
      />

      <Paragraph>{section.what_this_means_closer}</Paragraph>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Our Process
// ────────────────────────────────────────────────────────────────────────

function OurProcess({
  section,
}: {
  section: Stage4Result["llm_sections"]["our_process"];
}) {
  return (
    <View break>
      <H1>Our Process</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      {section.stages.map((stage) => (
        <View key={stage.number} wrap={false}>
          <H3>
            {stage.number}. {stage.name}
          </H3>
          <Paragraph>{stage.body}</Paragraph>
        </View>
      ))}
      <Paragraph>{section.how_to_read_paragraph}</Paragraph>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Client Snapshot
// ────────────────────────────────────────────────────────────────────────

function ClientSnapshot({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["client_snapshot"];
}) {
  return (
    <View break>
      <H1>Client Snapshot</H1>

      {section.entity ? (
        <>
          <H3>Business Entity</H3>
          <Table<ClientSnapshotEntityRow>
            columns={[
              { header: "Business", width: "30%", cell: (r) => r.business_name },
              { header: "Type", width: "20%", cell: (r) => r.entity_type },
              { header: "Ownership", width: "20%", cell: (r) => r.ownership },
              {
                header: "Industry / Operations",
                width: "30%",
                cell: (r) => r.industry_or_operations ?? "—",
              },
            ]}
            rows={[section.entity]}
          />
        </>
      ) : null}

      {section.revenue_profit_table.length > 0 ? (
        <>
          <H3>Revenue & Profit</H3>
          <Table<ClientSnapshotRevenueRow>
            columns={[
              { header: "Year", width: "20%", cell: (r) => r.year },
              { header: "Revenue", width: "40%", cell: (r) => r.revenue_text },
              { header: "EBITDA", width: "40%", cell: (r) => r.ebitda_text ?? "—" },
            ]}
            rows={section.revenue_profit_table}
          />
        </>
      ) : null}

      {section.valuation_text ? (
        <>
          <H3>Valuation</H3>
          <Paragraph>{section.valuation_text}</Paragraph>
          {section.why_range_wide_text ? (
            <Paragraph>{section.why_range_wide_text}</Paragraph>
          ) : null}
        </>
      ) : null}

      {section.coverage_table.length > 0 ? (
        <>
          <H3>Coverage</H3>
          <Table<ClientSnapshotCoverageRow>
            columns={[
              { header: "Category", width: "25%", cell: (r) => r.category },
              { header: "In Place", width: "25%", cell: (r) => r.in_place },
              { header: "Notes", width: "50%", cell: (r) => r.notes },
            ]}
            rows={section.coverage_table}
          />
        </>
      ) : null}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Goals & Priorities
// ────────────────────────────────────────────────────────────────────────

function GoalsPriorities({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["goals_priorities"];
}) {
  return (
    <View break>
      <H1>Goals & Priorities</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      <Table<GoalRow>
        columns={[
          { header: "#", width: "6%", cell: (r) => r.number },
          { header: "Goal", width: "30%", cell: (r) => r.goal_name },
          {
            header: "What this means in practice",
            width: "64%",
            cell: (r) => r.what_this_means_in_practice,
          },
        ]}
        rows={section.goals}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Findings & Observations
// ────────────────────────────────────────────────────────────────────────

function FindingsObservations({
  section,
}: {
  section: Stage4Result["llm_sections"]["findings_observations"];
}) {
  return (
    <View break>
      <H1>Findings & Observations</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>

      <H3>Strengths</H3>
      {section.strengths.map((s, i) => (
        <Bullet key={`str-${i}`}>{s.body}</Bullet>
      ))}

      <H3>Opportunities</H3>
      {section.opportunities.map((og, i) => (
        <View key={`og-${i}`}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: SIZE.bodySmall, color: COLORS.subheader, marginTop: 6, marginBottom: 4 }}>
            {og.category}
          </Text>
          {og.bullets.map((b, j) => (
            <Bullet key={`og-${i}-b-${j}`}>{b}</Bullet>
          ))}
        </View>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Recommendations (shared block for Business + Personal lenses)
// ────────────────────────────────────────────────────────────────────────

function RecommendationsBlock({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: Stage4Result["llm_sections"]["recommendations_business"]["sections"];
}) {
  return (
    <View break>
      <H1>{title}</H1>
      <Paragraph>{intro}</Paragraph>

      {sections.map((sec) => (
        <View key={sec.section_id}>
          <H2>{sec.numbered_heading}</H2>
          <SectionLabel>{sec.label}</SectionLabel>
          <Paragraph>{sec.intro_paragraph}</Paragraph>

          {sec.subsections && sec.subsections.length > 0 ? (
            sec.subsections.map((sub, si) => (
              <View key={`${sec.section_id}-sub-${si}`}>
                <H3>{sub.heading}</H3>
                {sub.intro ? <Paragraph>{sub.intro}</Paragraph> : null}
                {sub.bullets.map((b, bi) => (
                  <Bullet
                    key={`${sec.section_id}-sub-${si}-b-${bi}`}
                    bold={b.bold_imperative}
                    partnerRole={b.partner_role}
                  >
                    {b.briefing}
                  </Bullet>
                ))}
              </View>
            ))
          ) : (
            sec.recommendations_bullets.map((b, bi) => (
              <Bullet
                key={`${sec.section_id}-b-${bi}`}
                bold={b.bold_imperative}
                partnerRole={b.partner_role}
              >
                {b.briefing}
              </Bullet>
            ))
          )}

          {sec.closer_paragraph ? (
            <Paragraph>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {sec.closer_paragraph.label}:{" "}
              </Text>
              {sec.closer_paragraph.body}
            </Paragraph>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Implementation Roadmap (grouped table)
// ────────────────────────────────────────────────────────────────────────

function ImplementationRoadmap({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["implementation_roadmap"];
}) {
  return (
    <View break>
      <H1>Implementation Roadmap</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.metaLabel, marginBottom: 6 }}>
        {section.total_action_count.toLocaleString()} action items across{" "}
        {section.groups.length} timing buckets.
      </Text>
      {section.groups.map((group) => (
        <View key={group.timing_bucket}>
          <GroupBand label={group.bucket_label} />
          <Table<RoadmapRow>
            columns={[
              { header: "Action", width: "55%", cell: (r) => r.action },
              { header: "Owner", width: "20%", cell: (r) => r.owner },
              { header: "Status", width: "15%", cell: (r) => r.status },
              { header: "Source", width: "10%", cell: (r) => r.source_recommendation_id },
            ]}
            rows={group.rows}
          />
        </View>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Decisions Needed
// ────────────────────────────────────────────────────────────────────────

function DecisionsNeeded({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["decisions_needed"];
}) {
  return (
    <View break>
      <H1>Decisions Needed</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      <Table
        columns={[
          { header: "#", width: "5%", cell: (r) => r.number },
          { header: "Decision", width: "40%", cell: (r) => r.decision_question },
          { header: "Recommended Path", width: "35%", cell: (r) => r.recommended_path },
          { header: "Needed By", width: "20%", cell: (r) => r.decision_needed_by },
        ]}
        rows={section.rows}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Advisory Team
// ────────────────────────────────────────────────────────────────────────

function AdvisoryTeam({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["advisory_team"];
}) {
  return (
    <View break>
      <H1>Advisory Team</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      <Table
        columns={[
          { header: "Role", width: "25%", cell: (r) => r.role },
          { header: "Firm / Contact", width: "30%", cell: (r) => r.firm_or_contact },
          { header: "Notes", width: "45%", cell: (r) => r.notes },
        ]}
        rows={section.rows}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Meeting Cadence
// ────────────────────────────────────────────────────────────────────────

function MeetingCadence({
  intro,
  table,
}: {
  intro: Stage4Result["llm_sections"]["meeting_cadence_intro"];
  table: Stage4Result["deterministic_sections"]["meeting_cadence_table"];
}) {
  return (
    <View break>
      <H1>Meeting Cadence</H1>
      <Paragraph>{intro.intro_paragraph}</Paragraph>

      <H3>Cadence</H3>
      <Table
        columns={[
          { header: "Meeting", width: "30%", cell: (r) => r.meeting_name },
          { header: "Frequency", width: "20%", cell: (r) => r.frequency },
          { header: "Agenda", width: "50%", cell: (r) => r.agenda },
        ]}
        rows={table.rows}
      />

      <H3>Immediate Next Steps</H3>
      {intro.immediate_next_steps.map((step, i) => (
        <Bullet key={`step-${i}`}>{step}</Bullet>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Glossary
// ────────────────────────────────────────────────────────────────────────

function GlossarySection({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["glossary"];
}) {
  return (
    <View break>
      <H1>Glossary</H1>
      <Paragraph>{section.intro_paragraph}</Paragraph>
      <Table<GlossaryEntry>
        columns={[
          {
            header: "Term",
            width: "25%",
            cell: (r) => (r.acronym ? `${r.term} (${r.acronym})` : r.term),
          },
          {
            header: "Plain-English Definition",
            width: "75%",
            cell: (r) => r.plain_english_definition,
          },
        ]}
        rows={section.entries}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Disclosures
// ────────────────────────────────────────────────────────────────────────

function DisclosuresSection({
  section,
}: {
  section: Stage4Result["deterministic_sections"]["disclosures"];
}) {
  return (
    <View break>
      <H1>Disclosures</H1>
      {section.body_paragraphs.map((p, i) => (
        <Paragraph key={`disc-${i}`}>{p}</Paragraph>
      ))}
      <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.metaLabel, marginTop: 12 }}>
        Compliance Tracking ID: {section.compliance_tracking_id}
      </Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  // Defensive: input is "2026-05-03" or full ISO; render as "May 3, 2026".
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
