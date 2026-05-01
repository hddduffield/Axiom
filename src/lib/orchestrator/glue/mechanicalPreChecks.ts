import type {
  AggregateMetrics,
  MechanicalCheckResults,
  MechanicalCheckResultsFailed,
  NumericValue,
  PreCheckIssue,
  PreCheckResult,
  SequencedPlan,
  StatuteReferenceData,
} from "../schemas/pipelineTypes";
import { formatMoney, rangeBounds } from "../utils/numericValue";

// ────────────────────────────────────────────────────────────────────────
// Cascade walking stub.
// Replace with import from cascadeWalking.ts when implemented.
// ────────────────────────────────────────────────────────────────────────

export function walkCascadeSet(
  seedRecIds: string[],
  sequencedPlan: SequencedPlan,
): Set<string> {
  const recById = new Map(
    sequencedPlan.sequenced_recommendations.map((r) => [r.recommendation_id, r]),
  );
  const visited = new Set<string>();
  const queue: string[] = [...seedRecIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const rec = recById.get(id);
    if (!rec) continue;
    for (const co of rec.co_triggered_with) {
      if (!visited.has(co)) queue.push(co);
    }
  }
  return visited;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function contextAround(text: string, index: number, radius = 25): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function normalizeMoneyString(s: string): number | null {
  const trimmed = s.trim();
  const m = trimmed.match(/^\$([\d,]+(?:\.\d+)?)([KMB]?)$/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  let multiplier = 1;
  if (m[2] === "K") multiplier = 1000;
  else if (m[2] === "M") multiplier = 1_000_000;
  else if (m[2] === "B") multiplier = 1_000_000_000;
  return num * multiplier;
}

export function extractDollarFigures(
  markdown: string,
): Array<{ raw: string; value: number; index: number }> {
  const out: Array<{ raw: string; value: number; index: number }> = [];
  const re = /\$[\d,]+(?:\.\d+)?[KMB]?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const value = normalizeMoneyString(m[0]);
    if (value === null) continue;
    out.push({ raw: m[0], value, index: m.index });
  }
  return out;
}

function valueWithinTolerance(a: number, b: number, tolerance: number): boolean {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return Math.abs(a - b) < 0.01;
  const max = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / max < tolerance;
}

function roundToSigFigs(value: number, sf: number): number {
  if (value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const magnitude = Math.floor(Math.log10(abs));
  const factor = Math.pow(10, magnitude - sf + 1);
  return sign * Math.round(abs / factor) * factor;
}

function isPureRoundingMatch(a: number, b: number): boolean {
  if (!valueWithinTolerance(a, b, 0.05)) return false;
  return roundToSigFigs(a, 2) === roundToSigFigs(b, 2);
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 1: Number Coherence
// ────────────────────────────────────────────────────────────────────────

interface WhitelistEntry {
  value: number;
  source: string;
}

interface AltValueEntry {
  value: number;
  recId: string;
  formulaVariant: string;
}

function expandToBounds(v: NumericValue, source: string): WhitelistEntry[] {
  const { low, high } = rangeBounds(v);
  if (low === high) return [{ value: low, source }];
  return [
    { value: low, source: `${source}.low` },
    { value: high, source: `${source}.high` },
  ];
}

function buildStateAWhitelist(plan: SequencedPlan): WhitelistEntry[] {
  const out: WhitelistEntry[] = [];
  for (const rec of plan.sequenced_recommendations) {
    const qi = rec.quantified_impact;
    if (
      qi.estimate !== null &&
      qi.alternative_values.length === 0 &&
      qi.blocked_inputs.length === 0
    ) {
      out.push(...expandToBounds(qi.estimate, `${rec.recommendation_id}.estimate`));
    }
  }
  return out;
}

function buildAggregateWhitelist(metrics: AggregateMetrics | null): WhitelistEntry[] {
  if (!metrics) return [];
  const out: WhitelistEntry[] = [];
  const keys = [
    "estate_tax_savings_total",
    "annual_income_tax_savings_total",
    "annual_yield_capture_total",
    "insurance_face_amount_total",
    "recommended_implementation_cost_estimate",
  ] as const;
  for (const k of keys) {
    const v = metrics[k];
    if (v) out.push(...expandToBounds(v, `aggregate.${k}`));
  }
  return out;
}

function buildAltValueIndex(plan: SequencedPlan): AltValueEntry[] {
  const out: AltValueEntry[] = [];
  for (const rec of plan.sequenced_recommendations) {
    for (const alt of rec.quantified_impact.alternative_values) {
      const { low, high } = rangeBounds(alt.value);
      out.push({ value: low, recId: rec.recommendation_id, formulaVariant: alt.formula_variant });
      if (low !== high) {
        out.push({ value: high, recId: rec.recommendation_id, formulaVariant: alt.formula_variant });
      }
    }
  }
  return out;
}

export function checkNumberCoherence(
  markdown: string,
  plan: SequencedPlan,
  metrics: AggregateMetrics | null,
): { result: PreCheckResult; issues: PreCheckIssue[]; stateCFired: boolean } {
  const stateA = buildStateAWhitelist(plan);
  const aggregates = buildAggregateWhitelist(metrics);
  const allValid = [...stateA, ...aggregates];
  const altValues = buildAltValueIndex(plan);

  const figures = extractDollarFigures(markdown);
  const issues: PreCheckIssue[] = [];
  let stateCFired = false;

  for (const fig of figures) {
    // Exact match against State A or aggregate → no issue.
    const exact = allValid.find((w) => w.value === fig.value);
    if (exact) continue;

    // Match against an alt value within tolerance → State C protection.
    const altMatch = altValues.find((a) =>
      valueWithinTolerance(fig.value, a.value, 0.05),
    );
    if (altMatch) {
      stateCFired = true;
      issues.push({
        check_name: "number_coherence",
        severity: "blocking",
        description: `Value ${fig.raw} matches alternative value of ${altMatch.recId} (formula_variant: ${altMatch.formulaVariant}); State C alternatives must not stand alone in prose`,
        prose_span_excerpt: contextAround(markdown, fig.index),
        expected_value: null,
        matched_value: fig.raw,
        whitelist_candidates: [`${altMatch.recId} alt: ${altMatch.formulaVariant}`],
        remediation: "Render State C value as a hedged range (e.g., \"$X–$Y/yr pending firm policy\") instead of a single value.",
      });
      continue;
    }

    // Search State A + aggregates for nearby (within 5% tolerance).
    const nearby = allValid.filter((w) => valueWithinTolerance(fig.value, w.value, 0.05));

    if (nearby.length === 0) {
      issues.push({
        check_name: "number_coherence",
        severity: "blocking",
        description: `Value ${fig.raw} not found in plan whitelist; no source within 5% tolerance.`,
        prose_span_excerpt: contextAround(markdown, fig.index),
        expected_value: null,
        matched_value: fig.raw,
        whitelist_candidates: [],
        remediation: "Verify the prose value against a sequenced_plan recommendation or aggregate metric.",
      });
    } else if (nearby.length > 1) {
      issues.push({
        check_name: "number_coherence",
        severity: "blocking",
        description: `Value ${fig.raw} is ambiguous; multiple whitelist values within tolerance: ${nearby.map((n) => n.source).join(", ")}`,
        prose_span_excerpt: contextAround(markdown, fig.index),
        expected_value: null,
        matched_value: fig.raw,
        whitelist_candidates: nearby.map((n) => n.source),
        remediation: "Regenerate prose with explicit reference to the intended source.",
      });
    } else {
      const source = nearby[0];
      if (isPureRoundingMatch(fig.value, source.value)) {
        issues.push({
          check_name: "number_coherence",
          severity: "auto_fixable",
          description: `Value ${fig.raw} differs from source ${formatMoney(source.value)} (${source.source}) by pure rounding within tolerance.`,
          prose_span_excerpt: contextAround(markdown, fig.index),
          expected_value: formatMoney(source.value),
          matched_value: fig.raw,
          whitelist_candidates: [source.source],
          remediation: "Auto-fixable in rounding-only mode: replace prose value with source's natural rendering.",
        });
      } else {
        issues.push({
          check_name: "number_coherence",
          severity: "blocking",
          description: `Value ${fig.raw} differs from source ${formatMoney(source.value)} (${source.source}) within 5% tolerance but is not a pure rounding match (substitution forbidden).`,
          prose_span_excerpt: contextAround(markdown, fig.index),
          expected_value: formatMoney(source.value),
          matched_value: fig.raw,
          whitelist_candidates: [source.source],
          remediation: "Substitution forbidden; regenerate prose with the correct source value.",
        });
      }
    }
  }

  let status: PreCheckResult["status"];
  if (issues.length === 0) status = "passed";
  else if (issues.every((i) => i.severity === "auto_fixable")) status = "failed_auto_fixed";
  else status = "failed_blocked";

  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0
          ? "All dollar figures resolve to whitelist sources."
          : `${issues.length} issue(s) detected.`,
    },
    issues,
    stateCFired,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 2: Statute Consistency
// ────────────────────────────────────────────────────────────────────────

const DEFAULT_STATUTE_REF: StatuteReferenceData = {
  current_estate_exemption_year: 2026,
  tcja_expiration: "2025-12-31",
  obbba_enactment: "2025-07-04",
  current_year: 2026,
};

// v2 expansion: validate §-numbers, TCJA/OBBBA literal references against
// published dates. v1 only checks year-references attached to estate/gift
// exemption topics.
export function checkStatuteConsistency(
  markdown: string,
  ref: StatuteReferenceData = DEFAULT_STATUTE_REF,
): { result: PreCheckResult; issues: PreCheckIssue[] } {
  const issues: PreCheckIssue[] = [];

  const yearTopicRe = /(\d{4})\s+(estate|gift)\s+exemption/gi;
  let m: RegExpExecArray | null;
  while ((m = yearTopicRe.exec(markdown)) !== null) {
    const year = parseInt(m[1], 10);
    if (year < ref.current_year) {
      issues.push({
        check_name: "statute_consistency",
        severity: "blocking",
        description: `Stale statute year reference: "${m[0]}" (current year is ${ref.current_year}).`,
        prose_span_excerpt: contextAround(markdown, m.index),
        expected_value: `${ref.current_year} ${m[2]} exemption`,
        matched_value: m[0],
        whitelist_candidates: [],
        remediation: "Regenerate prose with the current statute year. Statute corrections require regeneration; no auto-fix.",
      });
    }
  }

  const status: PreCheckResult["status"] = issues.length === 0 ? "passed" : "failed_blocked";
  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0 ? "All statute references current." : `${issues.length} stale statute reference(s) found.`,
    },
    issues,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 3: Entity Name Consistency
// ────────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkEntityNameConsistency(
  markdown: string,
  entityNames: Map<string, string> | undefined,
): { result: PreCheckResult; issues: PreCheckIssue[] } {
  const issues: PreCheckIssue[] = [];
  if (!entityNames || entityNames.size === 0) {
    return {
      result: {
        status: "passed",
        issue_count: 0,
        details: "No entity name mapping provided; skipping check.",
      },
      issues,
    };
  }

  for (const [legal, short] of entityNames) {
    const legalIdx = markdown.indexOf(legal);
    const shortRe = new RegExp(`\\b${escapeRegex(short)}\\b`);
    const shortM = markdown.match(shortRe);
    const shortIdx = shortM ? shortM.index ?? -1 : -1;

    if (legalIdx < 0 && shortIdx < 0) continue;

    if (legalIdx < 0 && shortIdx >= 0) {
      issues.push({
        check_name: "entity_name_consistency",
        severity: "blocking",
        description: `Short form "${short}" used but legal name "${legal}" never established in prose.`,
        prose_span_excerpt: contextAround(markdown, shortIdx),
        expected_value: `${legal} ('${short}')`,
        matched_value: short,
        whitelist_candidates: [legal],
        remediation: "Regenerate prose so the legal name introduces the short form on first mention.",
      });
      continue;
    }

    if (shortIdx >= 0 && shortIdx < legalIdx) {
      issues.push({
        check_name: "entity_name_consistency",
        severity: "blocking",
        description: `Short form "${short}" appears before the legal name "${legal}" first establishes it.`,
        prose_span_excerpt: contextAround(markdown, shortIdx),
        expected_value: `${legal} ('${short}')`,
        matched_value: short,
        whitelist_candidates: [legal],
        remediation: "Reorder prose so the legal name appears first with the short form in parentheses.",
      });
      continue;
    }

    // Verify first-mention pattern: Legal Name ('Short') or Legal Name ("Short") or (Short)
    const firstMentionRe = new RegExp(
      `${escapeRegex(legal)}\\s*\\([‘’“”'"]?${escapeRegex(short)}[‘’“”'"]?\\)`,
    );
    if (!firstMentionRe.test(markdown)) {
      issues.push({
        check_name: "entity_name_consistency",
        severity: "blocking",
        description: `First-mention pattern "${legal} ('${short}')" not found in prose.`,
        prose_span_excerpt: contextAround(markdown, legalIdx),
        expected_value: `${legal} ('${short}')`,
        matched_value: legal,
        whitelist_candidates: [],
        remediation: "Regenerate prose so the first occurrence of the legal name introduces the short form in parentheses.",
      });
    }
  }

  const status: PreCheckResult["status"] = issues.length === 0 ? "passed" : "failed_blocked";
  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0
          ? "Entity-name first-mention pattern OK."
          : `${issues.length} entity-name issue(s) detected.`,
    },
    issues,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 4: Cascade Integrity
// ────────────────────────────────────────────────────────────────────────

export function checkCascadeIntegrity(
  markdown: string,
  plan: SequencedPlan,
): { result: PreCheckResult; issues: PreCheckIssue[] } {
  const issues: PreCheckIssue[] = [];
  const cascadePhraseRe = /(REC-[A-Z]{3}-\d{3})\s+(?:triggers|cascades to|leads to)/g;
  let m: RegExpExecArray | null;
  while ((m = cascadePhraseRe.exec(markdown)) !== null) {
    const seed = m[1];
    const cascadeSet = walkCascadeSet([seed], plan);
    const missing: string[] = [];
    for (const memberId of cascadeSet) {
      if (memberId === seed) continue;
      if (!markdown.includes(memberId)) missing.push(memberId);
    }
    if (missing.length > 0) {
      issues.push({
        check_name: "cascade_integrity",
        severity: "blocking",
        description: `Cascade triggered by ${seed} is incomplete; missing in prose: ${missing.sort().join(", ")}.`,
        prose_span_excerpt: contextAround(markdown, m.index),
        expected_value: missing.sort().join(", "),
        matched_value: seed,
        whitelist_candidates: missing.sort(),
        remediation: "Regenerate prose to mention every member of the cascade chain.",
      });
    }
  }

  const status: PreCheckResult["status"] = issues.length === 0 ? "passed" : "failed_blocked";
  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0 ? "Cascades complete in prose." : `${issues.length} cascade(s) incomplete.`,
    },
    issues,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 5: Recommendation Reference Resolution
// ────────────────────────────────────────────────────────────────────────

export function checkRecommendationReferenceResolution(
  markdown: string,
  plan: SequencedPlan,
): { result: PreCheckResult; issues: PreCheckIssue[] } {
  const validIds = new Set(plan.sequenced_recommendations.map((r) => r.recommendation_id));
  const refRe = /REC-[A-Z]{3}-\d{3}/g;
  const seen = new Set<string>();
  const issues: PreCheckIssue[] = [];
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(markdown)) !== null) {
    const id = m[0];
    if (validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    issues.push({
      check_name: "recommendation_reference_resolution",
      severity: "blocking",
      description: `Recommendation ID ${id} not found in sequenced_plan.`,
      prose_span_excerpt: contextAround(markdown, m.index),
      expected_value: null,
      matched_value: id,
      whitelist_candidates: [],
      remediation: "Regenerate prose; cannot guess intended rec_id.",
    });
  }

  const status: PreCheckResult["status"] = issues.length === 0 ? "passed" : "failed_blocked";
  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0 ? "All recommendation references resolve." : `${issues.length} unresolvable rec_id(s) found.`,
    },
    issues,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Pre-Check 6: Provenance Map Completeness
// ────────────────────────────────────────────────────────────────────────

export function checkProvenanceMapCompleteness(
  markdown: string,
  provenanceMap: Map<string, "llm_stage4" | "deterministic_glue" | "kb_template"> | undefined,
): { result: PreCheckResult; issues: PreCheckIssue[] } {
  if (!provenanceMap || provenanceMap.size === 0) {
    return {
      result: {
        status: "passed",
        issue_count: 0,
        details: "No provenance map provided; skipping check.",
      },
      issues: [],
    };
  }
  const issues: PreCheckIssue[] = [];
  const paragraphs = markdown
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const para of paragraphs) {
    if (!provenanceMap.has(para)) {
      issues.push({
        check_name: "provenance_map_completeness",
        severity: "warning",
        description: `Paragraph lacks provenance label.`,
        prose_span_excerpt: para.slice(0, 50),
        expected_value: null,
        matched_value: null,
        whitelist_candidates: [],
        remediation: "Add this paragraph's source label to the provenance map (llm_stage4 | deterministic_glue | kb_template).",
      });
    }
  }

  const status: PreCheckResult["status"] = issues.length === 0 ? "passed" : "warning";
  return {
    result: {
      status,
      issue_count: issues.length,
      details:
        issues.length === 0 ? "All paragraphs labeled." : `${issues.length} paragraph(s) lack provenance labels.`,
    },
    issues,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export interface MechanicalPreChecksOptions {
  provenanceMap?: Map<string, "llm_stage4" | "deterministic_glue" | "kb_template">;
  statuteReferenceData?: StatuteReferenceData;
  entityShortNames?: Map<string, string>;
}

function fail(reason: string): MechanicalCheckResultsFailed {
  return { _builder_status: "FAILED", _failure_reason: reason };
}

export function runMechanicalPreChecks(
  assembledPlanMarkdown: string,
  sequencedPlan: SequencedPlan,
  aggregateMetrics: AggregateMetrics | null,
  options: MechanicalPreChecksOptions = {},
): MechanicalCheckResults | MechanicalCheckResultsFailed {
  try {
    if (typeof assembledPlanMarkdown !== "string") {
      return fail("assembledPlanMarkdown is not a string");
    }
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return fail("SequencedPlan is malformed");
    }

    const numbers = checkNumberCoherence(
      assembledPlanMarkdown,
      sequencedPlan,
      aggregateMetrics,
    );
    const statutes = checkStatuteConsistency(
      assembledPlanMarkdown,
      options.statuteReferenceData,
    );
    const entities = checkEntityNameConsistency(
      assembledPlanMarkdown,
      options.entityShortNames,
    );
    const cascades = checkCascadeIntegrity(assembledPlanMarkdown, sequencedPlan);
    const recIds = checkRecommendationReferenceResolution(
      assembledPlanMarkdown,
      sequencedPlan,
    );
    const provenance = checkProvenanceMapCompleteness(
      assembledPlanMarkdown,
      options.provenanceMap,
    );

    const allIssues = [
      ...numbers.issues,
      ...statutes.issues,
      ...entities.issues,
      ...cascades.issues,
      ...recIds.issues,
      ...provenance.issues,
    ];
    const auto_fixed_issues = allIssues.filter((i) => i.severity === "auto_fixable");
    const blocked_issues = allIssues.filter((i) => i.severity === "blocking");
    const warning_issues = allIssues.filter((i) => i.severity === "warning");

    let overall_status: MechanicalCheckResults["overall_status"];
    if (blocked_issues.length > 0) overall_status = "failed_blocked";
    else if (auto_fixed_issues.length > 0) overall_status = "failed_auto_fixed";
    else overall_status = "passed";

    return {
      overall_status,
      checks: {
        number_coherence: numbers.result,
        statute_consistency: statutes.result,
        entity_name_consistency: entities.result,
        cascade_integrity: cascades.result,
        recommendation_reference_resolution: recIds.result,
        provenance_map_completeness: provenance.result,
      },
      issues: allIssues,
      auto_fixed_issues,
      blocked_issues,
      _orchestrator_flags: {
        state_c_alternative_value_protection_fired: numbers.stateCFired,
        auto_fix_count: auto_fixed_issues.length,
        blocked_count: blocked_issues.length,
        warning_count: warning_issues.length,
      },
    };
  } catch (err) {
    return fail(`Unexpected error: ${(err as Error).message}`);
  }
}
