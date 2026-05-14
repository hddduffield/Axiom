// Phase 18.5 — Auto-generate executive summary on lens transitions.
//
// Called from set-current (and could be wired into finalize endpoints
// in a future commit). Best-effort — failures log to console but do
// not roll back the parent mutation.
//
// Idempotent: skips when output.executive_summary is already populated.
// To force a regeneration, advisors hit the explicit /generate-summary
// endpoint from the UI.

import Anthropic from "@anthropic-ai/sdk";
import type { AppSupabaseClient } from "@/lib/api/auth";
import { isCashFlowLensOutput, type CashFlowLensOutput } from "@/lib/api/cash_flow_lens";
import { isEstateLensOutput, type EstateLensOutput } from "@/lib/estate-lens/types";
import type { Json } from "@/lib/supabase/database.types";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 400;

interface LensRow {
  id: string;
  lens_type: string;
  output: unknown;
  cost_cents: number | null;
}

export async function autoGenerateLensSummaryIfMissing(
  supabase: AppSupabaseClient,
  lensId: string,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[auto-summary] ANTHROPIC_API_KEY missing — skipping.");
    return;
  }

  const { data: lens, error } = await supabase
    .from("lens_runs")
    .select("id, lens_type, output, cost_cents")
    .eq("id", lensId)
    .maybeSingle<LensRow>();
  if (error || !lens) {
    console.warn(
      "[auto-summary] lens not found or fetch failed:",
      error?.message,
    );
    return;
  }

  const existing = (
    lens.output as unknown as Record<string, unknown> | null
  )?.["executive_summary"];
  if (existing) return; // already populated

  let prompt: string;
  if (lens.lens_type === "cash_flow") {
    if (!isCashFlowLensOutput(lens.output)) return;
    prompt = buildCashFlowPrompt(lens.output);
  } else if (lens.lens_type === "estate") {
    if (!isEstateLensOutput(lens.output)) return;
    prompt = buildEstatePrompt(lens.output);
  } else {
    return; // unsupported lens type
  }

  try {
    const anthro = new Anthropic({ apiKey });
    const message = await anthro.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return;
    const costCents = Math.round(
      (message.usage.input_tokens / 1_000_000) * 100 +
        (message.usage.output_tokens / 1_000_000) * 500,
    );
    const newOutput = {
      ...(lens.output as unknown as Record<string, unknown>),
      executive_summary: {
        text: textBlock.text.trim(),
        generated_at: new Date().toISOString(),
        generated_by: "ai" as const,
      },
    };
    await supabase
      .from("lens_runs")
      .update({
        output: newOutput as unknown as Json,
        cost_cents: (lens.cost_cents ?? 0) + costCents,
      })
      .eq("id", lensId);
  } catch (e) {
    console.warn("[auto-summary] generation failed:", (e as Error).message);
  }
}

function buildCashFlowPrompt(out: CashFlowLensOutput): string {
  const slider = out.distribution_plan.slider_state;
  const numBuckets = out.buckets.length;
  const numRecs =
    out.ai_suggestions.distribution_recommendations?.recommendations.length ??
    0;
  return `Generate a 2-3 sentence executive summary of this Cash Flow Lens plan. Plain English. No greetings. Lead with the household's distribution strategy + projected tax outcome.

Output ONLY the 2-3 sentences. No headers, no preamble, no bullet points. ~50-120 words total.

CLIENT: ${out.client_snapshot.household_name}, age ${out.client_snapshot.age ?? "—"}, retiring at ${out.assumptions.retirement_age}
BUCKETS: ${numBuckets} configured
TARGET MIX: ${slider.tax_free_pct}% tax-free / ${slider.tax_deferred_pct}% tax-deferred / ${slider.taxable_pct}% taxable
RECOMMENDATIONS: ${numRecs} generated`;
}

function buildEstatePrompt(out: EstateLensOutput): string {
  const estateToday = (out.assumptions.estate_today_cents / 100 / 1_000_000).toFixed(1);
  const fmvOut = (out.planning_move.fmv_transferred_cents / 100 / 1_000_000).toFixed(1);
  return `Generate a 2-3 sentence executive summary of this Estate Lens scenario. Plain English. No greetings. Lead with estate exposure, recommended planning move, and tax/liquidity outcome.

Output ONLY the 2-3 sentences. No headers, no preamble. ~50-120 words.

HOUSEHOLD: ${out.client_snapshot.household_name}, age ${out.assumptions.client_age_today}, ${out.assumptions.years_out}-yr horizon, ${out.client_snapshot.state_code}
ESTATE TODAY: $${estateToday}M
EXEMPTION: $${(out.assumptions.combined_exemption_cents / 100 / 1_000_000).toFixed(1)}M
PLANNING MOVE: ${out.planning_move.type} of $${fmvOut}M at ${out.planning_move.valuation_discount_pct}% discount
LI: $${(out.life_insurance.death_benefit_cents / 100 / 1_000_000).toFixed(1)}M death benefit
SCENARIO NAME: ${out.scenario_name}`;
}
