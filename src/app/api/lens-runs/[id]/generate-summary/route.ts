// Phase 18.5 — POST /api/lens-runs/[id]/generate-summary
//
// AI-generates a 2-3 sentence "What this concludes" executive summary
// for a lens (cash flow or estate). Persists into output.executive_summary
// with generated_by='ai'. Cost: Haiku 4.5 ~$0.05-0.15 per call.
//
// Triggering:
//   - Auto-fire on transition to 'current' or 'reviewed' (TODO — wire
//     into finalize / set-current endpoints in a future commit; this
//     endpoint is the underlying primitive).
//   - Explicit "Regenerate" button on the lens view (immediate).
//
// No status guard — advisors can generate at any time. Note the
// generated_at timestamp so the UI can show "Generated <date>".

import Anthropic from "@anthropic-ai/sdk";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  isCashFlowLensOutput,
  netIncomeMonthlyCents,
  availableMonthlyAllocationCents,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import {
  isEstateLensOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import type { Json } from "@/lib/supabase/database.types";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 400;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err("internal_error", "ANTHROPIC_API_KEY not configured.");
  }

  const { data: lensRow, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!lensRow) return err("not_found", `No lens run with id ${id}.`);

  let prompt: string;
  if (lensRow.lens_type === "cash_flow") {
    if (!isCashFlowLensOutput(lensRow.output)) {
      return err("validation_failed", "Lens output is not a valid cash_flow shape.");
    }
    prompt = buildCashFlowPrompt(lensRow.output as CashFlowLensOutput);
  } else if (lensRow.lens_type === "estate") {
    if (!isEstateLensOutput(lensRow.output)) {
      return err("validation_failed", "Lens output is not a valid estate shape.");
    }
    prompt = buildEstatePrompt(lensRow.output as EstateLensOutput);
  } else {
    return err(
      "validation_failed",
      `Summary generation not supported for lens_type=${lensRow.lens_type}.`,
    );
  }

  const anthro = new Anthropic({ apiKey });
  const message = await anthro.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return err("internal_error", "AI returned no text content.");
  }
  const summaryText = textBlock.text.trim();

  // Cost: Haiku 4.5 $1/MTok input, $5/MTok output.
  const costCents = Math.round(
    (message.usage.input_tokens / 1_000_000) * 100 +
      (message.usage.output_tokens / 1_000_000) * 500,
  );

  const summary = {
    text: summaryText,
    generated_at: new Date().toISOString(),
    generated_by: "ai" as const,
  };

  const newOutput = {
    ...(lensRow.output as Record<string, unknown>),
    executive_summary: summary,
  };
  const newCost = (lensRow.cost_cents ?? 0) + costCents;

  const { data: updated, error: updErr } = await auth.supabase
    .from("lens_runs")
    .update({ output: newOutput as unknown as Json, cost_cents: newCost })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) return err(mapDbError(updErr), dbErrorMessage(updErr));

  return ok(updated);
}

function buildCashFlowPrompt(out: CashFlowLensOutput): string {
  const grossAnnual = (out.gross_income_annual_cents / 100).toLocaleString();
  const expensesAnnual = (out.expenses_annual_cents / 100).toLocaleString();
  const netMonthly = (netIncomeMonthlyCents(out) / 100).toLocaleString();
  const availMonthly = (
    availableMonthlyAllocationCents(out) / 100
  ).toLocaleString();
  const bucketLines = out.buckets
    .map(
      (b) =>
        `  - ${b.name} (${b.tax_treatment}): $${(b.current_balance_cents / 100).toLocaleString()} balance, $${(b.monthly_contribution_target_cents / 100).toLocaleString()}/mo contribution`,
    )
    .join("\n");
  const numRecs = out.ai_suggestions.distribution_recommendations?.recommendations.length ?? 0;

  return `Generate a 2-3 sentence executive summary of this Cash Flow Lens plan. Plain English. No greetings. Lead with the household's distribution strategy + projected tax outcome.

Output ONLY the 2-3 sentences. No headers, no preamble, no bullet points. ~50-120 words total.

CLIENT: ${out.client_snapshot.household_name}, age ${out.client_snapshot.age ?? "—"}, retiring at ${out.assumptions.retirement_age}

INCOME / EXPENSES:
- Gross annual: $${grossAnnual}
- Annual expenses: $${expensesAnnual}
- Net monthly: $${netMonthly}
- Available monthly for allocation: $${availMonthly}

BUCKETS (${out.buckets.length} total):
${bucketLines}

ALLOCATION TARGET MIX (tax-free / tax-deferred / taxable):
- ${out.distribution_plan.slider_state.tax_free_pct}% tax-free
- ${out.distribution_plan.slider_state.tax_deferred_pct}% tax-deferred
- ${out.distribution_plan.slider_state.taxable_pct}% taxable

RECOMMENDATIONS: ${numRecs} action items generated`;
}

function buildEstatePrompt(out: EstateLensOutput): string {
  const estateToday = (out.assumptions.estate_today_cents / 100 / 1_000_000).toFixed(1);
  const fmvOut = (out.planning_move.fmv_transferred_cents / 100 / 1_000_000).toFixed(1);
  const discount = out.planning_move.valuation_discount_pct;
  const liDeathBenefit = (
    out.life_insurance.death_benefit_cents /
    100 /
    1_000_000
  ).toFixed(1);
  const yearsOut = out.assumptions.years_out;
  const numRecs = out.recommendations.length;

  return `Generate a 2-3 sentence executive summary of this Estate Lens scenario. Plain English. No greetings. Lead with estate exposure, recommended planning move, and tax/liquidity outcome.

Output ONLY the 2-3 sentences. No headers, no preamble, no bullet points. ~50-120 words total.

HOUSEHOLD: ${out.client_snapshot.household_name}, age ${out.assumptions.client_age_today} today, ${yearsOut}-year horizon
STATE: ${out.client_snapshot.state_code}, top state estate rate ${out.assumptions.state_estate_tax_pct}%

ESTATE TODAY: $${estateToday}M
COMBINED EXEMPTION: $${(out.assumptions.combined_exemption_cents / 100 / 1_000_000).toFixed(1)}M

PLANNING MOVE: ${out.planning_move.type} of $${fmvOut}M at ${discount}% valuation discount
LIFE INSURANCE: $${liDeathBenefit}M death benefit, $${(out.life_insurance.annual_premium_cents / 100).toLocaleString()}/yr premium over ${out.life_insurance.years_of_premium} years

RECOMMENDATIONS: ${numRecs} action items proposed
SCENARIO NAME: ${out.scenario_name}`;
}
