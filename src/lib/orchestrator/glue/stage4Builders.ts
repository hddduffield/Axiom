// Stage 4 — Deterministic section builders.
//
// These builders consume Stage 3a output (QuantifiedRecommendations) and
// ClientProfile to produce the eight deterministic sections of the plan
// (title page, client snapshot, goals, implementation roadmap, decisions
// needed, advisory team, meeting cadence table, glossary subset, disclosures).
//
// Per spec Phase 1 Step 1.2: these run synchronously without an LLM call.
// The harness merges these with the six LLM-generated sections to produce
// the final Stage4Result.

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type {
  ActionItem,
  ArchetypeIdentifier,
  PartnerType,
  QuantifiedRecommendations,
  SequencedRecommendation,
  TimingBucket,
} from "../schemas/pipelineTypes";
import type { ClientProfile } from "../schemas/clientProfile";
import type {
  AdvisorEntry,
  AdvisorsFile,
  AdvisoryTeam,
  ClientSnapshot,
  ClientSnapshotCoverageRow,
  ClientSnapshotEntityRow,
  ClientSnapshotRevenueRow,
  DecisionsNeeded,
  DecisionsNeededRow,
  Disclosures,
  Glossary,
  GlossaryEntry,
  GlossaryTerm,
  GoalRow,
  GoalsPriorities,
  ImplementationRoadmap,
  MeetingCadenceTable,
  RoadmapBucketGroup,
  RoadmapRow,
  TitlePage,
  TopPriorityRow,
} from "../schemas/stage4.types";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const ROADMAP_BUCKET_ORDER: TimingBucket[] = [
  "0-30 days",
  "30-60 days",
  "60-120 days",
  "4-6 months",
  "6-12 months",
  "12-24 months",
  "Ongoing",
];

const ROADMAP_BUCKET_LABELS: Record<TimingBucket, string> = {
  "0-30 days": "0–30 Days │ Foundations",
  "30-60 days": "30–60 Days │ Buy/Sell, Insurance Underwriting, Cash Flow",
  "60-120 days": "60–120 Days │ Entity Restructuring",
  "4-6 months": "4–6 Months │ Estate Foundation & Tax Layering",
  "6-12 months": "6–12 Months │ Wealth Transfer Execution",
  "12-24 months": "12–24 Months │ Layered Strategy & Plan Optimization",
  Ongoing: "Ongoing",
};

const TIMING_BUCKET_TO_DEADLINE_DAYS: Record<TimingBucket, number> = {
  "0-30 days": 30,
  "30-60 days": 60,
  "60-120 days": 120,
  "4-6 months": 180,
  "6-12 months": 365,
  "12-24 months": 730,
  Ongoing: 365,
};

// Archetype-driven gating per spec Phase 1 Step 1.4. Binary v1.
export const ARCHETYPE_INCLUDES_OPTIONAL_PRE_TRANSACTION: Record<
  ArchetypeIdentifier,
  boolean
> = {
  PRE: true,
  POST: false,
  ACT: false,
  FO: false,
  FOUND: false,
};

// ────────────────────────────────────────────────────────────────────────
// Advisor lookup
// ────────────────────────────────────────────────────────────────────────

let cachedAdvisors: AdvisorsFile | null = null;
let cachedAdvisorsKbPath: string | null = null;

export async function loadAdvisors(kbPath: string): Promise<AdvisorsFile> {
  if (cachedAdvisors !== null && cachedAdvisorsKbPath === kbPath) {
    return cachedAdvisors;
  }
  const filePath = path.join(kbPath, "02_reference/advisors.json");
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as AdvisorsFile;
  cachedAdvisors = parsed;
  cachedAdvisorsKbPath = kbPath;
  return parsed;
}

export function findAdvisor(
  advisors: AdvisorsFile,
  advisorId: string,
): AdvisorEntry | null {
  return (
    advisors.advisors.find((a) => a.advisor_id === advisorId) ?? null
  );
}

// ────────────────────────────────────────────────────────────────────────
// Glossary terms loader
// ────────────────────────────────────────────────────────────────────────

let cachedGlossaryTerms: GlossaryTerm[] | null = null;
let cachedGlossaryKbPath: string | null = null;

// Parse the markdown glossary file into a structured term list. Format:
//   ### TERM — Stands For
//   <blank line>
//   Plain English definition paragraph(s).
//   <blank line>
// Headers under ## Terms; tolerant of whitespace.
function parseGlossaryMarkdown(md: string): GlossaryTerm[] {
  const out: GlossaryTerm[] = [];
  // Split on H3 headers, skipping anything before the first ### inside ## Terms.
  const lines = md.split("\n");
  let inTermsSection = false;
  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const headerMatch = currentHeading.match(/^([^—]+?)\s*—\s*(.+)$/);
    let term: string;
    let acronym: string | null = null;
    if (headerMatch) {
      term = headerMatch[2].trim();
      acronym = headerMatch[1].trim();
    } else {
      term = currentHeading.trim();
    }
    out.push({
      term,
      acronym,
      plain_english_definition: currentBody.join("\n").trim(),
    });
    currentHeading = null;
    currentBody = [];
  };

  for (const line of lines) {
    if (line.startsWith("## Terms")) {
      inTermsSection = true;
      continue;
    }
    if (line.startsWith("## Maintenance")) {
      inTermsSection = false;
      flush();
      continue;
    }
    if (!inTermsSection) continue;
    if (line.startsWith("### ")) {
      flush();
      currentHeading = line.replace(/^###\s+/, "");
    } else {
      if (currentHeading !== null) currentBody.push(line);
    }
  }
  flush();
  return out;
}

export async function loadGlossaryTerms(kbPath: string): Promise<GlossaryTerm[]> {
  if (cachedGlossaryTerms !== null && cachedGlossaryKbPath === kbPath) {
    return cachedGlossaryTerms;
  }
  const filePath = path.join(kbPath, "02_reference/glossary_terms.md");
  const content = await readFile(filePath, "utf8");
  const parsed = parseGlossaryMarkdown(content);
  cachedGlossaryTerms = parsed;
  cachedGlossaryKbPath = kbPath;
  return parsed;
}

export function _resetStage4BuilderCachesForTesting(): void {
  cachedAdvisors = null;
  cachedAdvisorsKbPath = null;
  cachedGlossaryTerms = null;
  cachedGlossaryKbPath = null;
}

// ────────────────────────────────────────────────────────────────────────
// Compliance tracking ID
// ────────────────────────────────────────────────────────────────────────

export function buildComplianceTrackingId(
  clientProfile: ClientProfile,
  generatedDate: Date,
  sequenceNumber = 1,
): string {
  // Format: PSA-YYYY-MMDD-<CLIENT_LAST>-NNN
  const yyyy = generatedDate.getUTCFullYear();
  const mm = String(generatedDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(generatedDate.getUTCDate()).padStart(2, "0");
  const fullName =
    clientProfile.client_and_family.primary_owner.full_legal_name ?? "CLIENT";
  // Surname heuristic: last whitespace-separated token, uppercased,
  // alphanumerics only.
  const tokens = fullName.trim().split(/\s+/);
  const lastToken = tokens[tokens.length - 1] ?? "CLIENT";
  const surname = lastToken.toUpperCase().replace(/[^A-Z0-9]/g, "") || "CLIENT";
  const seq = String(sequenceNumber).padStart(3, "0");
  return `PSA-${yyyy}-${mm}${dd}-${surname}-${seq}`;
}

// ────────────────────────────────────────────────────────────────────────
// Title page
// ────────────────────────────────────────────────────────────────────────

export function buildTitlePage(
  clientProfile: ClientProfile,
  advisor: AdvisorEntry,
  generatedDate: Date,
  complianceTrackingId: string,
): TitlePage {
  const primary = clientProfile.client_and_family.primary_owner;
  const spouse = clientProfile.client_and_family.spouse;
  const primaryEntity =
    clientProfile.entities.length > 0 ? clientProfile.entities[0] : null;
  const businessName = primaryEntity?.legal_name ?? null;

  // Ownership summary: if entity has primary owner + a percentage, render.
  let ownershipSummary: string | null = null;
  if (
    primaryEntity &&
    primaryEntity.primary_owner_name &&
    primaryEntity.ownership_percentage?.value
  ) {
    const pct = primaryEntity.ownership_percentage.value;
    const pctText = Array.isArray(pct) ? `${pct[0]}–${pct[1]}` : `${pct}`;
    ownershipSummary = `${primaryEntity.primary_owner_name} (${pctText}%)`;
  }

  return {
    client_full_name: primary.full_legal_name,
    spouse_full_name: spouse?.full_legal_name ?? null,
    business_name: businessName,
    ownership_summary: ownershipSummary,
    prepared_date: generatedDate.toISOString().slice(0, 10),
    prepared_by_name: advisor.full_name,
    prepared_by_firm: advisor.firm,
    compliance_tracking_id: complianceTrackingId,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Client Snapshot
// ────────────────────────────────────────────────────────────────────────

function formatNumericValue(
  v: { value: number | [number, number] | null; unit: string } | null | undefined,
): string | null {
  if (!v || v.value === null) return null;
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const val = v.value;
  if (Array.isArray(val)) return `${fmt(val[0])} – ${fmt(val[1])}`;
  return fmt(val);
}

export function buildClientSnapshot(clientProfile: ClientProfile): ClientSnapshot {
  const primaryEntity =
    clientProfile.entities.length > 0 ? clientProfile.entities[0] : null;

  let entityRow: ClientSnapshotEntityRow | null = null;
  if (primaryEntity) {
    let ownership = "Not specified";
    if (
      primaryEntity.primary_owner_name &&
      primaryEntity.ownership_percentage?.value !== undefined
    ) {
      const pct = primaryEntity.ownership_percentage.value;
      const pctText = Array.isArray(pct) ? `${pct[0]}–${pct[1]}%` : `${pct}%`;
      ownership = `${primaryEntity.primary_owner_name} ${pctText}`;
    }
    entityRow = {
      business_name: primaryEntity.legal_name,
      entity_type: primaryEntity.entity_type,
      ownership,
      industry_or_operations: primaryEntity.industry,
    };
  }

  // Revenue table: derived from notes if structured fields aren't present.
  // For v1, leave empty unless the entity record carries structured revenue
  // (we don't currently model trailing-3-year P&L on EntityRecord; this is
  // a v2 enhancement). The LLM picks up trailing revenue from the
  // ClientProfile JSON in the user turn.
  const revenueRows: ClientSnapshotRevenueRow[] = [];

  // Coverage table: pull life insurance + DI + LTC + umbrella from the
  // insurance section, and a row for retirement plan if any 401(k) reference
  // exists in retirement_accounts.
  const coverage: ClientSnapshotCoverageRow[] = [];
  const insurance = clientProfile.insurance;
  if (insurance.life_insurance_policies.length > 0) {
    const totalFace = insurance.life_insurance_policies
      .map((p) => p.face_amount)
      .filter((f): f is NonNullable<typeof f> => f !== null && f.value !== null)
      .reduce((acc, f) => {
        const v = f.value;
        if (v === null) return acc;
        return acc + (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
      }, 0);
    coverage.push({
      category: "Life Insurance",
      in_place: `${insurance.life_insurance_policies.length} polic${insurance.life_insurance_policies.length === 1 ? "y" : "ies"}`,
      notes:
        totalFace > 0
          ? `Aggregate face ~$${Math.round(totalFace).toLocaleString()}`
          : "Faces not specified",
    });
  }
  if (insurance.dis_insurance.length > 0) {
    coverage.push({
      category: "Disability Insurance",
      in_place: `${insurance.dis_insurance.length} polic${insurance.dis_insurance.length === 1 ? "y" : "ies"}`,
      notes: insurance.dis_insurance[0].notes ?? "",
    });
  }
  if (insurance.ltc_insurance.length > 0) {
    coverage.push({
      category: "LTC Insurance",
      in_place: `${insurance.ltc_insurance.length} polic${insurance.ltc_insurance.length === 1 ? "y" : "ies"}`,
      notes: insurance.ltc_insurance[0].notes ?? "",
    });
  }
  if (insurance.umbrella_liability) {
    coverage.push({
      category: "Personal Umbrella",
      in_place: "Yes",
      notes: formatNumericValue(insurance.umbrella_liability.face_amount) ?? "",
    });
  } else {
    coverage.push({
      category: "Personal Umbrella",
      in_place: "None",
      notes: "Recommended; see Risk Management section",
    });
  }
  if (insurance.errors_omissions) {
    coverage.push({
      category: "Errors & Omissions",
      in_place: "Yes",
      notes: insurance.errors_omissions.notes ?? "",
    });
  }

  // Valuation paragraph and "why range wide" left null at v1; the LLM may
  // surface this in the Client Snapshot section if it judges it appropriate.
  return {
    entity: entityRow,
    revenue_profit_table: revenueRows,
    valuation_text: null,
    why_range_wide_text: null,
    coverage_table: coverage,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Goals & Priorities
// ────────────────────────────────────────────────────────────────────────

// ClientProfile.goals_and_values is unstructured prose. The LLM will
// elaborate; the deterministic builder extracts headline goals using a
// simple heuristic: split by line / sentence and produce up to 10 rows.
// Each row's "what this means in practice" is a short heuristic-derived
// elaboration; if richer structured goals become available in v2, this
// builder upgrades.
export function buildGoalsPriorities(clientProfile: ClientProfile): GoalsPriorities {
  const v = clientProfile.goals_and_values;
  const intro =
    "These are the goals we identified together during discovery. Every recommendation in this plan ties back to one or more of them. We will revisit and refine these at every annual review.";

  const goals: GoalRow[] = [];

  // Stitch known structured goal categories first.
  let n = 1;
  const pushGoal = (goalName: string, body: string) => {
    if (n > 10) return;
    if (!body || body.trim().length === 0) return;
    goals.push({
      number: n,
      goal_name: goalName,
      what_this_means_in_practice: body.trim(),
    });
    n += 1;
  };

  if (v.financial_goals && v.financial_goals.trim().length > 0) {
    pushGoal("Financial Goals", v.financial_goals);
  }
  if (v.philanthropic_goals && v.philanthropic_goals.trim().length > 0) {
    pushGoal("Philanthropic Vehicles", v.philanthropic_goals);
  }
  if (v.family_priorities && v.family_priorities.trim().length > 0) {
    pushGoal("Family Priorities", v.family_priorities);
  }
  if (v.succession_goals && v.succession_goals.trim().length > 0) {
    pushGoal("Succession Goals", v.succession_goals);
  }

  // If raw_values_text contains additional thematic threads (separated by
  // blank line / numbered list), emit them as additional rows up to 10.
  const raw = v.raw_values_text ?? "";
  // Split on blank lines or numbered lines.
  const additional = raw
    .split(/\n\s*\n|\n(?=\d+\.\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  for (const block of additional) {
    if (n > 10) break;
    // Heuristic name: first 3-5 words capitalized.
    const firstSentence = block.split(/[.!?]/)[0].trim();
    const words = firstSentence.split(/\s+/).slice(0, 5);
    const headline = words.map((w) => {
      // Title-case the word.
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");
    pushGoal(headline || `Goal ${n}`, block);
  }

  return { intro_paragraph: intro, goals };
}

// ────────────────────────────────────────────────────────────────────────
// Implementation Roadmap
// ────────────────────────────────────────────────────────────────────────

export function buildImplementationRoadmap(
  quantified: QuantifiedRecommendations,
): ImplementationRoadmap {
  const groups: Map<TimingBucket, RoadmapRow[]> = new Map();
  for (const bucket of ROADMAP_BUCKET_ORDER) groups.set(bucket, []);

  let totalRows = 0;
  for (const rec of quantified.recommendations) {
    if (rec.default_excluded) continue; // landmine default-excluded skipped
    for (const ai of rec.action_items) {
      const bucket = ai.timing_bucket as TimingBucket;
      const list = groups.get(bucket);
      if (!list) continue; // unknown bucket — defensive skip
      list.push({
        action: ai.description,
        timing_bucket: bucket,
        owner: ai.partner_required && ai.partner_type
          ? `${ai.partner_type} + ${ai.owner}`
          : ai.owner,
        status: "Not Started",
        source_action_item_id: ai.action_item_id,
        source_recommendation_id: ai.source_recommendation_id,
      });
      totalRows += 1;
    }
  }

  const orderedGroups: RoadmapBucketGroup[] = [];
  for (const bucket of ROADMAP_BUCKET_ORDER) {
    const rows = groups.get(bucket) ?? [];
    if (rows.length === 0) continue;
    orderedGroups.push({
      timing_bucket: bucket,
      bucket_label: ROADMAP_BUCKET_LABELS[bucket],
      rows,
    });
  }

  return {
    intro_paragraph:
      "This is your project plan. It shows what gets done, when, and who owns it. We will update this together at every meeting.",
    groups: orderedGroups,
    total_action_count: totalRows,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Decisions Needed
// ────────────────────────────────────────────────────────────────────────

function deadlineLabel(timingBucket: TimingBucket | string): string {
  // Map timing buckets to human-readable deadline phrasing.
  const mapping: Record<string, string> = {
    "0-30 days": "30 days",
    "30-60 days": "60 days",
    "60-120 days": "90 days",
    "4-6 months": "180 days",
    "6-12 months": "12 months",
    "12-24 months": "24 months",
    Ongoing: "Annual review",
  };
  return mapping[timingBucket] ?? "60 days";
}

export function buildDecisionsNeeded(
  quantified: QuantifiedRecommendations,
): DecisionsNeeded {
  const rows: DecisionsNeededRow[] = [];
  let n = 1;
  for (const rec of quantified.recommendations) {
    const isPending =
      rec.decisions_needed === true ||
      rec.quantified_impact.pending_reconciliation === true;
    if (!isPending) continue;
    if (n > 8) break; // 5–8 rows max per spec

    // Build decision question from rec category + brief context.
    const decisionQuestion =
      rec.quantified_impact.alternative_values.length > 0
        ? `${rec.recommendation_id}: choose between ${rec.quantified_impact.alternative_values
            .map((av) => av.formula_variant)
            .join(" or ")}`
        : `${rec.recommendation_id}: ${rec.quantified_impact.qualitative_phrasing ?? "decision pending"}`;

    // Recommended path: alternative_values[0].context if present, else
    // qualitative_phrasing, else the rec's audit notes.
    const recommendedPath =
      rec.quantified_impact.alternative_values.length > 0
        ? rec.quantified_impact.alternative_values[0].context
        : (rec.quantified_impact.qualitative_phrasing ?? rec._audit_notes ?? "Pending advisor recommendation");

    rows.push({
      number: n,
      decision_question: decisionQuestion,
      recommended_path: recommendedPath,
      decision_needed_by: deadlineLabel(rec.timing_bucket),
      source_recommendation_id: rec.recommendation_id,
    });
    n += 1;
  }

  const intro =
    "These are the decisions that move the plan forward. Each has a recommended path, the trade-offs, and a deadline. We will work through them together at our next meeting.";

  return {
    intro_paragraph: intro,
    rows,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Advisory Team
// ────────────────────────────────────────────────────────────────────────

const PARTNER_TYPE_TO_ROLE_LABEL: Record<PartnerType, string> = {
  CPA: "CPA / Accountant",
  "Estate Attorney": "Estate Planning Attorney",
  "Business Attorney": "General Business Counsel",
  "M&A Counsel": "M&A Counsel",
  "Commercial P&C": "Commercial Insurance",
  "Health Insurance Broker": "Health Insurance Broker",
  Banker: "Banking",
  "Valuation Provider": "Valuation / QofE",
  "Specialty Tax Credits": "Specialty Tax Credits",
  Other: "Other Partner",
};

export function buildAdvisoryTeam(
  clientProfile: ClientProfile,
  quantified: QuantifiedRecommendations,
  advisor: AdvisorEntry,
): AdvisoryTeam {
  const rows: { row: { role: string; firm_or_contact: string; notes: string; is_tbd: boolean }; ordering: number }[] = [];

  // Lead row: always PSA / our own advisor.
  rows.push({
    row: {
      role: "Lead Advisor",
      firm_or_contact: `${advisor.full_name}, ${advisor.firm}`,
      notes: "Primary point of contact",
      is_tbd: false,
    },
    ordering: 0,
  });

  // Pull existing relationships from the client profile.
  for (const rel of clientProfile.existing_advisor_relationships) {
    rows.push({
      row: {
        role: rel.role,
        firm_or_contact: rel.firm_or_advisor_name ?? "Existing relationship",
        notes: rel.notes ?? rel.scope_of_engagement ?? "",
        is_tbd: false,
      },
      ordering: 1,
    });
  }

  // Add a TBD row for every distinct partner_type used in any ActionItem
  // with partner_required: true that doesn't already match an existing
  // relationship.
  const existingRoles = new Set(
    clientProfile.existing_advisor_relationships.map((r) => r.role.toLowerCase()),
  );
  const tbdPartnerTypes = new Set<PartnerType>();
  for (const rec of quantified.recommendations) {
    if (rec.default_excluded) continue;
    for (const ai of rec.action_items) {
      if (ai.partner_required && ai.partner_type) {
        const roleLabel = PARTNER_TYPE_TO_ROLE_LABEL[ai.partner_type];
        if (!existingRoles.has(roleLabel.toLowerCase())) {
          tbdPartnerTypes.add(ai.partner_type);
        }
      }
    }
  }
  for (const pt of [...tbdPartnerTypes].sort()) {
    rows.push({
      row: {
        role: PARTNER_TYPE_TO_ROLE_LABEL[pt],
        firm_or_contact: "TBD — to be introduced",
        notes: "Identified in the recommendations as a needed partner",
        is_tbd: true,
      },
      ordering: 2,
    });
  }

  // Sort: lead first (ordering 0), existing (1), TBDs (2).
  rows.sort((a, b) => a.ordering - b.ordering);

  return {
    intro_paragraph:
      "PSA Wealth quarterbacks the relationships below. Where a row is marked TBD, finding the right partner is part of our work together.",
    rows: rows.map((r) => r.row),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Meeting Cadence Table — fixed-template
// ────────────────────────────────────────────────────────────────────────

export function buildMeetingCadenceTable(): MeetingCadenceTable {
  return {
    rows: [
      {
        meeting_name: "Implementation Check-in",
        frequency: "Monthly (first 6 months)",
        agenda:
          "Status of Implementation Roadmap items, blockers, decisions still pending. 30 minutes.",
      },
      {
        meeting_name: "Quarterly Tax Meeting",
        frequency: "Quarterly",
        agenda:
          "Joint with CPA. Estimated payments, year-to-date P&L vs. plan, distribution and bonus planning.",
      },
      {
        meeting_name: "Investment Review",
        frequency: "Quarterly",
        agenda:
          "Portfolio performance, rebalancing, contribution pacing, tax-loss harvesting results.",
      },
      {
        meeting_name: "Annual Plan Review",
        frequency: "Annually",
        agenda:
          "Full plan refresh — valuation, estate exposure, insurance review, succession progress, transaction-window assessment.",
      },
      {
        meeting_name: "Triggered Review",
        frequency: "As needed",
        agenda:
          "Material change in business, marriage, divorce, birth, sale event or LOI, change in tax law, or change in family situation.",
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Glossary subset — match curated terms against LLM-generated prose
// ────────────────────────────────────────────────────────────────────────

// Determine if a term appears in the prose. Use word-boundary matching to
// avoid partial-word false positives (e.g. "DI" inside "DIRECT"). Also
// match on either the acronym or the full term.
function termAppearsInProse(term: GlossaryTerm, prose: string): boolean {
  const candidates: string[] = [];
  if (term.acronym) {
    // Acronyms can be like "BOE", "GRAT", "F-Reorg", "§1202", "UTMA / UGMA"
    candidates.push(term.acronym);
    // Split on " / " for multi-acronym entries (UTMA / UGMA).
    if (term.acronym.includes(" / ")) {
      for (const p of term.acronym.split(" / ").map((s) => s.trim())) {
        candidates.push(p);
      }
    }
  }
  candidates.push(term.term);

  for (const c of candidates) {
    if (c.length === 0) continue;
    // Escape regex special chars and use word-boundary where possible.
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Use word boundaries for plain-letter terms; for terms with §/-/spaces,
    // require that surrounding chars are non-alphanumeric.
    const useWordBoundary = /^[A-Za-z0-9_]+$/.test(c);
    const pattern = useWordBoundary
      ? new RegExp(`\\b${escaped}\\b`)
      : new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`);
    if (pattern.test(prose)) return true;
  }
  return false;
}

export function buildGlossarySubset(
  proseText: string,
  glossaryTerms: GlossaryTerm[],
): { glossary: Glossary; termsUsed: string[] } {
  const matched: GlossaryEntry[] = [];
  const termsUsed: string[] = [];
  for (const t of glossaryTerms) {
    if (termAppearsInProse(t, proseText)) {
      matched.push({
        term: t.term,
        acronym: t.acronym,
        plain_english_definition: t.plain_english_definition,
      });
      termsUsed.push(t.acronym ? `${t.acronym} (${t.term})` : t.term);
    }
  }
  // Sort: acronyms first (alphabetically), then non-acronym terms.
  matched.sort((a, b) => {
    const aKey = a.acronym ?? a.term;
    const bKey = b.acronym ?? b.term;
    return aKey.localeCompare(bKey);
  });

  return {
    glossary: {
      intro_paragraph: "Plain-English definitions for the technical terms used in this plan.",
      entries: matched,
    },
    termsUsed,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Disclosures
// ────────────────────────────────────────────────────────────────────────

export function buildDisclosures(
  advisor: AdvisorEntry,
  complianceTrackingId: string,
): Disclosures {
  return {
    body_paragraphs: [
      `${advisor.full_name} is a registered representative of and offers securities and investment advisory services through MML Investors Services, LLC. Member SIPC. Supervisory Office: 6 Concourse Pkwy NE, Atlanta, GA 30328 United States.`,
      `${advisor.firm} is not a subsidiary or affiliate of MML Investors Services, LLC or its affiliated companies.`,
      "This document contains tax-related considerations. Nothing in this document should be construed as tax or legal advice. Always consult with your own tax or legal advisor concerning your specific situation.",
      "Estimates and projections shown in this plan reflect assumptions about future tax law, valuations, growth rates, and your circumstances. Actual results may vary materially. Specifically: (i) business valuation ranges are preliminary and not a formal valuation opinion; (ii) tax savings estimates are based on current law as of the plan date and your projected income; (iii) GRAT and IDGT projected wealth transfers depend on actual business performance versus the IRS-set hurdle rate during the trust term, and adverse performance can reduce or eliminate the planning benefit; (iv) insurance premium estimates are based on standard underwriting and may differ following actual underwriting.",
      "This plan is a living document and will be updated based on the cadence outlined in Meeting Cadence & Next Steps.",
    ],
    compliance_tracking_id: complianceTrackingId,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Top 5 Priorities — derived from QuantifiedRecommendations.
//
// Stage 4 doesn't reuse buildTopPriorities() from topPrioritiesBuilder.ts
// because that helper consumes a SequencedPlan (post-Stage-3b). Stage 4's
// input is QuantifiedRecommendations (post-Stage-3a, pre-3b). Rather than
// adapt across stages, this helper implements the Stage 4 ranking heuristic
// directly: rank by impact midpoint (State A) descending, tiebreak by
// rec_id. State B/C/D recs are ranked below State A by default unless they
// carry alternative_values midpoints (State C).
// ────────────────────────────────────────────────────────────────────────

interface ScoredRecForTop5 {
  rec: SequencedRecommendation;
  midpointUsd: number;
}

function recMidpoint(rec: SequencedRecommendation): number {
  const qi = rec.quantified_impact;
  if (qi.estimate?.value !== undefined) {
    const v = qi.estimate.value;
    if (Array.isArray(v)) return (v[0] + v[1]) / 2;
    return v;
  }
  // State C: take midpoint across alternative_values.
  if (qi.alternative_values.length > 0) {
    const sums = qi.alternative_values.map((av) => {
      const v = av.value.value;
      if (Array.isArray(v)) return (v[0] + v[1]) / 2;
      return v;
    });
    return sums.reduce((a, b) => a + b, 0) / sums.length;
  }
  return 0; // State B/D recs don't rank by impact
}

function isEligibleForTop5(rec: SequencedRecommendation): boolean {
  if (rec.default_excluded) return false;
  if (
    rec.timing_bucket !== "0-30 days" &&
    rec.timing_bucket !== "30-60 days" &&
    rec.timing_bucket !== "60-120 days"
  ) {
    return false;
  }
  return true;
}

function fmtImpactUsd(midpoint: number): string {
  if (midpoint >= 1_000_000) return `~$${(midpoint / 1_000_000).toFixed(1)}M`;
  if (midpoint >= 1_000) return `~$${Math.round(midpoint / 1_000)}K`;
  if (midpoint > 0) return `~$${Math.round(midpoint).toLocaleString()}`;
  return "Qualitative";
}

export function buildTopFivePriorities(
  quantified: QuantifiedRecommendations,
): TopPriorityRow[] {
  const eligible: ScoredRecForTop5[] = quantified.recommendations
    .filter(isEligibleForTop5)
    .map((rec) => ({ rec, midpointUsd: recMidpoint(rec) }));

  // Sort: midpoint desc, then rec_id asc.
  eligible.sort((a, b) => {
    if (b.midpointUsd !== a.midpointUsd) return b.midpointUsd - a.midpointUsd;
    return a.rec.recommendation_id < b.rec.recommendation_id ? -1 : 1;
  });

  const top5 = eligible.slice(0, 5);

  return top5.map((s, i) => {
    // Descriptor: rec_id + brief category context.
    const descriptor = `${s.rec.recommendation_id} (${s.rec.category})`;
    const impact = fmtImpactUsd(s.midpointUsd);
    return {
      rank: i + 1,
      descriptor,
      estimated_impact_text: impact,
      timing_text: s.rec.timing_bucket,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// Cross-reference resolution + glossary prose extraction helpers
// ────────────────────────────────────────────────────────────────────────

// Concatenate all LLM-generated prose into a single string for glossary
// matching. Strings: section intros, paragraphs, bullets, closer paragraphs.
export function extractAllProseFromLlmOutput(
  llm: import("../schemas/stage4.types").Stage4LlmRawOutput,
): string {
  const parts: string[] = [];
  parts.push(llm.executive_summary.opening_paragraph);
  parts.push(llm.executive_summary.two_themes_paragraph);
  parts.push(llm.executive_summary.what_this_means_closer);
  parts.push(llm.our_process.intro_paragraph);
  parts.push(llm.our_process.how_to_read_paragraph);
  for (const stage of llm.our_process.stages) {
    parts.push(stage.body);
  }
  parts.push(llm.findings_observations.intro_paragraph);
  for (const s of llm.findings_observations.strengths) parts.push(s.body);
  for (const og of llm.findings_observations.opportunities) {
    for (const b of og.bullets) parts.push(b);
  }
  parts.push(llm.recommendations_business.intro_paragraph);
  for (const sec of llm.recommendations_business.sections) {
    parts.push(sec.intro_paragraph);
    for (const b of sec.recommendations_bullets) {
      parts.push(b.bold_imperative);
      parts.push(b.briefing);
    }
    if (sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.intro) parts.push(sub.intro);
        for (const b of sub.bullets) {
          parts.push(b.bold_imperative);
          parts.push(b.briefing);
        }
      }
    }
    if (sec.closer_paragraph) parts.push(sec.closer_paragraph.body);
  }
  parts.push(llm.recommendations_personal.intro_paragraph);
  for (const sec of llm.recommendations_personal.sections) {
    parts.push(sec.intro_paragraph);
    for (const b of sec.recommendations_bullets) {
      parts.push(b.bold_imperative);
      parts.push(b.briefing);
    }
    if (sec.subsections) {
      for (const sub of sec.subsections) {
        if (sub.intro) parts.push(sub.intro);
        for (const b of sub.bullets) {
          parts.push(b.bold_imperative);
          parts.push(b.briefing);
        }
      }
    }
    if (sec.closer_paragraph) parts.push(sec.closer_paragraph.body);
  }
  parts.push(llm.meeting_cadence_intro.intro_paragraph);
  for (const s of llm.meeting_cadence_intro.immediate_next_steps) parts.push(s);
  return parts.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Number-drift detection
// ────────────────────────────────────────────────────────────────────────

// Extract dollar figures from prose. Patterns: $148,000 / $148K / $4.2M /
// $4.5M – $5M / $5,000,000 / approximately $148K. Returns numeric values
// in USD (e.g., 148000, 4200000).
function extractDollarFigures(prose: string): number[] {
  const out: number[] = [];
  // Pattern: optional $, digits with optional commas/decimals, optional K/M/B suffix.
  const re = /\$?([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+(?:\.[0-9]+)?)(K|M|B|k|m|b)?/g;
  for (const m of prose.matchAll(re)) {
    const numStr = m[1].replace(/,/g, "");
    const n = parseFloat(numStr);
    if (Number.isNaN(n)) continue;
    // Only keep figures preceded by '$' or 'approximately'/'roughly' to
    // reduce false positives (regex captures stray numbers otherwise).
    const before = prose.substring(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
    const looksLikeDollar = m[0].startsWith("$") || /\$\s*$/.test(before) || /(approximately|roughly|about|estimated)\s*$/i.test(before);
    if (!looksLikeDollar) continue;
    const suffix = m[2]?.toLowerCase();
    let multiplier = 1;
    if (suffix === "k") multiplier = 1_000;
    else if (suffix === "m") multiplier = 1_000_000;
    else if (suffix === "b") multiplier = 1_000_000_000;
    out.push(n * multiplier);
  }
  return out;
}

export interface NumberDriftResult {
  rec_id: string;
  expected_range: { low: number; high: number } | null;
  emitted_numbers: number[];
  drifts: Array<{
    expected: string;
    emitted: string;
    severity: "soft" | "hard";
  }>;
}

// For a given rec, get its expected dollar range from QuantifiedImpact.
function getExpectedRange(
  rec: SequencedRecommendation,
): { low: number; high: number } | null {
  const qi = rec.quantified_impact;
  if (qi.estimate?.value !== undefined) {
    const v = qi.estimate.value;
    if (Array.isArray(v)) return { low: Math.min(v[0], v[1]), high: Math.max(v[0], v[1]) };
    return { low: v, high: v };
  }
  if (qi.alternative_values.length > 0) {
    const all = qi.alternative_values.flatMap((av) => {
      const v = av.value.value;
      return Array.isArray(v) ? [v[0], v[1]] : [v];
    });
    return { low: Math.min(...all), high: Math.max(...all) };
  }
  return null;
}

export function detectNumberDriftForRec(
  rec: SequencedRecommendation,
  proseAboutRec: string,
): NumberDriftResult {
  const expected = getExpectedRange(rec);
  const emitted = extractDollarFigures(proseAboutRec);
  const drifts: NumberDriftResult["drifts"] = [];

  if (expected !== null && emitted.length > 0) {
    const fmt = (n: number) => {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
      return `$${Math.round(n).toLocaleString()}`;
    };
    const tolerance = 0.05; // 5% phrasing tolerance counts as soft
    for (const e of emitted) {
      // Within range = no drift.
      if (e >= expected.low * (1 - tolerance) && e <= expected.high * (1 + tolerance)) continue;
      // Outside range — hard drift.
      const within2x =
        e >= expected.low * 0.5 && e <= expected.high * 2;
      drifts.push({
        expected: `${fmt(expected.low)} – ${fmt(expected.high)}`,
        emitted: fmt(e),
        severity: within2x ? "soft" : "hard",
      });
    }
  }

  return {
    rec_id: rec.recommendation_id,
    expected_range: expected,
    emitted_numbers: emitted,
    drifts,
  };
}
