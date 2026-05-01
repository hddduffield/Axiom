import type {
  AggregateMetrics,
  ArchetypeIdentifier,
  NumericValue,
  RecommendationCategory,
  RenderingState,
  SequencedPlan,
  SequencedPlanFailed,
  SequencedRecommendation,
  TopPrioritiesFlags,
  TopPrioritiesResult,
  TopPrioritiesResultFailed,
  TopPrioritiesSelectedRecord,
} from "../schemas/pipelineTypes";
import { detectRenderingState } from "../utils/renderingState";
import { formatMoney } from "../utils/numericValue";

export { detectRenderingState };
export { formatMoney };

const ELIGIBLE_TIMING_BUCKETS = new Set(["0-30 days", "30-60 days", "60-120 days"]);
const TIMING_SCORE: Record<string, number> = {
  "0-30 days": 1.0,
  "30-60 days": 0.8,
  "60-120 days": 0.6,
};

// Per-archetype × category emphasis. Defaults to 0.5 when not listed.
const ARCHETYPE_SCORE: Record<ArchetypeIdentifier, Partial<Record<RecommendationCategory, number>>> = {
  PRE: {
    Tax: 1.0,
    Estate: 1.0,
    "Entity Structure": 1.0,
    "Risk & Insurance": 0.8,
    "Succession & Continuity": 0.8,
  },
  POST: {
    Investment: 1.0,
    Family: 1.0,
    Estate: 0.8,
    Charitable: 0.8,
  },
  ACT: {
    Tax: 1.0,
    Retirement: 1.0,
    Estate: 0.8,
    "Risk & Insurance": 0.8,
  },
  FO: {
    Estate: 1.0,
    Family: 1.0,
    Charitable: 1.0,
    Investment: 0.8,
    Tax: 0.8,
    Specialty: 0.8,
  },
  FOUND: {
    Tax: 1.0,
    Estate: 1.0,
    "Entity Structure": 1.0,
    Investment: 0.6,
    "Risk & Insurance": 0.6,
  },
};

const CATEGORY_NOUN: Record<RecommendationCategory, string> = {
  Tax: "tax strategy",
  Estate: "estate work",
  "Entity Structure": "entity restructuring",
  "Risk & Insurance": "risk and insurance work",
  Retirement: "retirement planning",
  Investment: "investment work",
  "Succession & Continuity": "succession planning",
  Family: "family planning",
  Charitable: "charitable plan",
  Specialty: "specialty work",
};

const STATE_DEFAULT_IMPACT: Record<RenderingState, number> = {
  A: 0.0, // computed against max
  B: 0.3,
  C: 0.5,
  D: 0.4,
};

export interface TopPrioritiesOptions {
  n?: number;
  enableClusterCombination?: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function midpoint(value: NumericValue["value"]): number {
  if (Array.isArray(value)) return (value[0] + value[1]) / 2;
  return value;
}

function rangeBounds(value: NumericValue["value"]): { low: number; high: number } {
  if (Array.isArray(value)) return { low: Math.min(value[0], value[1]), high: Math.max(value[0], value[1]) };
  return { low: value, high: value };
}

function isEligible(rec: SequencedRecommendation): boolean {
  if (rec.default_excluded) return false;
  if (!rec.plan_section || !rec.plan_section.startsWith("Recommendations —")) return false;
  if (!ELIGIBLE_TIMING_BUCKETS.has(rec.timing_bucket)) return false;
  if (detectRenderingState(rec) === null) return false;
  return true;
}

function archetypeScore(arch: ArchetypeIdentifier, cat: RecommendationCategory): number {
  return ARCHETYPE_SCORE[arch]?.[cat] ?? 0.5;
}

// v1 limitation: spec calls for fan-in across BOTH must_come_after and co_triggered_with,
// but must_come_after lives on SelectedRecommendation and isn't preserved through SequencedPlan.
// v2 should add must_come_after_reverse_index to SequencedRecommendation in Stage 3b and use both signals.
function clusterSourceScore(rec: SequencedRecommendation, allRecs: SequencedRecommendation[]): number {
  let count = 0;
  for (const other of allRecs) {
    if (other.recommendation_id === rec.recommendation_id) continue;
    if (other.co_triggered_with.includes(rec.recommendation_id)) count += 1;
  }
  return Math.min(count / 5, 1.0);
}

function impactScore(rec: SequencedRecommendation, state: RenderingState, maxStateAValue: number): number {
  if (state !== "A") return STATE_DEFAULT_IMPACT[state];
  const value = rec.quantified_impact.estimate ? midpoint(rec.quantified_impact.estimate.value) : 0;
  if (maxStateAValue <= 0) return 0;
  const ratio = Math.log10(value + 1) / Math.log10(maxStateAValue + 1);
  return Math.max(0, Math.min(1, ratio));
}

// ────────────────────────────────────────────────────────────────────────
// Estimated-impact rendering
// ────────────────────────────────────────────────────────────────────────

function renderStateA(estimate: NumericValue): string {
  const annual = estimate.is_annual === true;
  const yrSuffix = annual ? "/yr" : "";
  if (Array.isArray(estimate.value)) {
    const { low, high } = rangeBounds(estimate.value);
    return `${formatMoney(low)}–${formatMoney(high)}${yrSuffix}`;
  }
  const formatted = formatMoney(estimate.value);
  return annual ? `approximately ${formatted}${yrSuffix}` : formatted;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function renderStateB(rec: SequencedRecommendation): string {
  const reason = rec.quantified_impact.blocked_inputs[0]?.blocked_reason ?? "input(s)";
  return truncate(`pending [${reason}]`, 50);
}

function renderStateC(rec: SequencedRecommendation): string {
  const altVals = rec.quantified_impact.alternative_values;
  const lows: number[] = [];
  const highs: number[] = [];
  for (const av of altVals) {
    const { low, high } = rangeBounds(av.value.value);
    lows.push(low);
    highs.push(high);
  }
  const min = lows.length > 0 ? Math.min(...lows) : 0;
  const max = highs.length > 0 ? Math.max(...highs) : 0;
  return `${formatMoney(min)}–${formatMoney(max)}/yr pending firm policy`;
}

function renderStateD(rec: SequencedRecommendation): string {
  return truncate(rec.quantified_impact.qualitative_phrasing ?? "", 50);
}

function renderEstimatedImpact(rec: SequencedRecommendation, state: RenderingState): string {
  switch (state) {
    case "A":
      return renderStateA(rec.quantified_impact.estimate!);
    case "B":
      return renderStateB(rec);
    case "C":
      return renderStateC(rec);
    case "D":
      return renderStateD(rec);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Cluster combination
// ────────────────────────────────────────────────────────────────────────

interface ScoredRec {
  rec: SequencedRecommendation;
  state: RenderingState;
  score: number;
  components: TopPrioritiesSelectedRecord["component_scores"];
}

interface ClusterCandidate {
  cluster_id: string;
  members: ScoredRec[];
  combinedScore: number;
}

function findClusterCombinations(
  topCandidates: ScoredRec[],
): ClusterCandidate[] {
  const byCluster = new Map<string, ScoredRec[]>();
  for (const sr of topCandidates) {
    const cid = sr.rec.cluster_id;
    if (!cid) continue;
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid)!.push(sr);
  }
  const out: ClusterCandidate[] = [];
  for (const [cluster_id, members] of byCluster) {
    if (members.length < 3) continue;
    const sections = new Set(members.map((m) => m.rec.plan_section ?? ""));
    if (sections.size !== 1) continue;
    const sum = members.reduce((acc, m) => acc + m.score, 0);
    const max = Math.max(...members.map((m) => m.score));
    if (sum > max) {
      out.push({ cluster_id, members, combinedScore: sum });
    }
  }
  return out;
}

function categoryNoun(cat: RecommendationCategory): string {
  return CATEGORY_NOUN[cat] ?? "items";
}

function buildClusterDescriptor(members: ScoredRec[]): string {
  const cat = members[0].rec.category;
  const noun = categoryNoun(cat);
  const ids = members.map((m) => m.rec.recommendation_id);
  if (ids.length === 3) {
    return `Coordinated ${noun}: ${ids[0]}, ${ids[1]}, and ${ids[2]}`;
  }
  // 4+ members: list first two, then "and N-2 related items"
  const remaining = ids.length - 2;
  return `Coordinated ${noun}: ${ids[0]}, ${ids[1]}, and ${remaining} related items`;
}

function buildClusterEstimatedImpact(members: ScoredRec[]): string {
  const stateASum = members
    .filter((m) => m.state === "A")
    .reduce((acc, m) => {
      const est = m.rec.quantified_impact.estimate;
      if (!est) return acc;
      return acc + midpoint(est.value);
    }, 0);
  const hasC = members.some((m) => m.state === "C");
  const hasBOrD = members.some((m) => m.state === "B" || m.state === "D");
  const allA = members.every((m) => m.state === "A");
  if (allA) {
    return `~${formatMoney(stateASum)}`;
  }
  if (hasC && !hasBOrD) {
    const cCount = members.filter((m) => m.state === "C").length;
    return `~${formatMoney(stateASum)} + pending firm policy on ${cCount} item(s)`;
  }
  return `~${formatMoney(stateASum)} + qualitative impact`;
}

function earliestTiming(members: ScoredRec[]): string {
  const order = ["0-30 days", "30-60 days", "60-120 days", "4-6 months", "6-12 months", "12-24 months", "Ongoing"];
  let bestRank = Number.MAX_SAFE_INTEGER;
  let best = members[0].rec.timing_bucket;
  for (const m of members) {
    const r = order.indexOf(m.rec.timing_bucket);
    if (r >= 0 && r < bestRank) {
      bestRank = r;
      best = m.rec.timing_bucket;
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ────────────────────────────────────────────────────────────────────────

function renderMarkdownBlock(rows: TopPrioritiesSelectedRecord[]): string {
  const lines: string[] = [];
  lines.push("## Top Priorities — Next 12 Months");
  lines.push("");
  lines.push(
    "The recommendations below are the highest-leverage, most time-sensitive items from this plan, ranked by combined impact, timing, archetype fit, and downstream dependencies.",
  );
  lines.push("");
  lines.push("| # | Priority | Estimated Impact | Timing |");
  lines.push("| --- | --- | --- | --- |");
  rows.forEach((row, i) => {
    lines.push(
      `| ${i + 1} | ${row.rendered_descriptor} | ${row.rendered_estimated_impact} | ${row.rendered_timing} |`,
    );
  });
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────

function fail(reason: string): TopPrioritiesResultFailed {
  return { _builder_status: "FAILED", _failure_reason: reason };
}

export function buildTopPriorities(
  sequencedPlan: SequencedPlan | SequencedPlanFailed,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  aggregateMetrics: AggregateMetrics | null,
  archetype: ArchetypeIdentifier,
  options: TopPrioritiesOptions = {},
): TopPrioritiesResult | TopPrioritiesResultFailed {
  try {
    if (sequencedPlan && "_sequencer_status" in sequencedPlan) {
      return fail(`Upstream SequencedPlan is in failed state: ${sequencedPlan._sequencer_status}`);
    }
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return fail("SequencedPlan input is malformed");
    }
    const N = options.n ?? 5;
    const enableClusterCombination = options.enableClusterCombination ?? true;

    const allRecs = sequencedPlan.sequenced_recommendations;
    const eligible = allRecs.filter(isEligible);

    // Compute max State A value across eligible.
    let maxA = 0;
    for (const r of eligible) {
      const st = detectRenderingState(r);
      if (st === "A" && r.quantified_impact.estimate) {
        const m = midpoint(r.quantified_impact.estimate.value);
        if (m > maxA) maxA = m;
      }
    }

    // Score every eligible rec.
    const scored: ScoredRec[] = eligible.map((rec) => {
      const state = detectRenderingState(rec) as RenderingState;
      const impact = impactScore(rec, state, maxA);
      const timing = TIMING_SCORE[rec.timing_bucket] ?? 0.0;
      const arch = archetypeScore(archetype, rec.category);
      const cluster = clusterSourceScore(rec, allRecs);
      const score = 0.45 * impact + 0.25 * timing + 0.20 * arch + 0.10 * cluster;
      return {
        rec,
        state,
        score,
        components: { impact, timing, archetype: arch, cluster_source: cluster },
      };
    });

    // Deterministic sort: score desc, then rec_id asc.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.rec.recommendation_id < b.rec.recommendation_id ? -1 : 1;
    });

    // Cluster combination evaluated against top 8 individual ranks.
    const top8 = scored.slice(0, 8);
    const combinations = enableClusterCombination ? findClusterCombinations(top8) : [];
    const memberIdsInCombos = new Set<string>();
    for (const c of combinations) {
      for (const m of c.members) memberIdsInCombos.add(m.rec.recommendation_id);
    }

    // Build a working list: cluster rows replace their members.
    interface RenderEntry {
      score: number;
      record: TopPrioritiesSelectedRecord;
    }
    const entries: RenderEntry[] = [];
    for (const c of combinations) {
      const repr = c.members[0]; // representative member for descriptor pieces
      const record: TopPrioritiesSelectedRecord = {
        recommendation_id: c.cluster_id,
        category: repr.rec.category,
        priority_score: c.combinedScore,
        component_scores: {
          // For combined cluster rows, surface the maximum member's components.
          impact: Math.max(...c.members.map((m) => m.components.impact)),
          timing: Math.max(...c.members.map((m) => m.components.timing)),
          archetype: Math.max(...c.members.map((m) => m.components.archetype)),
          cluster_source: Math.max(...c.members.map((m) => m.components.cluster_source)),
        },
        rendering_state: "A",
        cluster_id: c.cluster_id,
        is_combined_cluster_row: true,
        cluster_member_ids: c.members.map((m) => m.rec.recommendation_id),
        rendered_descriptor: buildClusterDescriptor(c.members),
        rendered_estimated_impact: buildClusterEstimatedImpact(c.members),
        rendered_timing: earliestTiming(c.members),
      };
      entries.push({ score: c.combinedScore, record });
    }
    for (const sr of scored) {
      if (memberIdsInCombos.has(sr.rec.recommendation_id)) continue;
      const record: TopPrioritiesSelectedRecord = {
        recommendation_id: sr.rec.recommendation_id,
        category: sr.rec.category,
        priority_score: sr.score,
        component_scores: sr.components,
        rendering_state: sr.state,
        cluster_id: sr.rec.cluster_id,
        is_combined_cluster_row: false,
        cluster_member_ids: [],
        rendered_descriptor: `${sr.rec.category}: ${sr.rec.recommendation_id}`,
        rendered_estimated_impact: renderEstimatedImpact(sr.rec, sr.state),
        rendered_timing: sr.rec.timing_bucket,
      };
      entries.push({ score: sr.score, record });
    }
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.record.recommendation_id < b.record.recommendation_id ? -1 : 1;
    });

    const topRows = entries.slice(0, N).map((e) => e.record);

    // Flags.
    const flags: TopPrioritiesFlags = {
      top_priorities_count_below_default: topRows.length < (options.n ?? 5),
      clusters_combined_to_single_row: combinations.length,
      qualitative_phrasings_in_table: topRows.filter((r) => r.rendering_state === "D").length,
      pending_firm_policy_in_table: topRows.filter((r) => r.rendering_state === "C").length,
    };

    const rendered_block = renderMarkdownBlock(topRows);

    return {
      rendered_block,
      row_count: topRows.length,
      selected_recommendations: topRows,
      _orchestrator_flags: flags,
    };
  } catch (err) {
    return fail(`Unexpected error: ${(err as Error).message}`);
  }
}
