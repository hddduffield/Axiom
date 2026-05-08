// Phase 13.5 — POST /api/lens-runs/cash-flow/[id]/generate-recommendations
//
// Uses the current Distribution Plan slider state + bucket balances to ask
// Claude Haiku 4.5 for a list of action recommendations with year-by-year
// timing. Persists into ai_suggestions.distribution_recommendations.
// Cost ~$0.05-$0.20 per call.

import Anthropic from "@anthropic-ai/sdk";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  cryptoId,
  currentTaxMix,
  isCashFlowLensOutput,
  type CashFlowDistributionRecommendations,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 3000;

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function buildPrompt(out: CashFlowLensOutput): string {
  const cur = currentTaxMix(out);
  const target = out.distribution_plan.slider_state;
  const buckets = out.buckets
    .map(
      (b) =>
        `  - ${b.name} (id: ${b.id}; tax: ${b.tax_treatment}; current: ${fmtCents(b.current_balance_cents)}; mo contribution: ${fmtCents(b.monthly_contribution_target_cents)})`,
    )
    .join("\n");

  const currentYear = new Date().getFullYear();
  const yearsToRet = Math.max(
    out.assumptions.retirement_age - (out.client_snapshot.age ?? 40),
    1,
  );
  const retirementYear = currentYear + yearsToRet;

  return `Generate concrete year-by-year action recommendations to move the client from their CURRENT tax-treatment mix to the TARGET mix.

Client age: ${out.client_snapshot.age ?? "unknown"}
Retirement age: ${out.assumptions.retirement_age} (year ~${retirementYear})
Retirement income target: ${fmtCents(out.assumptions.retirement_income_target_annual_cents)}/yr
Effective tax rate now / retirement: ${(out.assumptions.effective_tax_rate_now * 100).toFixed(0)}% / ${(out.assumptions.effective_tax_rate_retirement * 100).toFixed(0)}%

CURRENT mix (% of total balance by tax treatment):
  Tax-Free: ${cur.tax_free_pct}%
  Tax-Deferred: ${cur.tax_deferred_pct}%
  Taxable: ${cur.taxable_pct}%

TARGET retirement-distribution mix (advisor-set):
  Tax-Free: ${target.tax_free_pct}%
  Tax-Deferred: ${target.tax_deferred_pct}%
  Taxable: ${target.taxable_pct}%

Bucket inventory:
${buckets}

Return ONLY a JSON object — no preamble, no markdown — with shape:
{
  "recommendations": [
    {
      "year": <absolute year, e.g. ${currentYear}>,
      "timeframe_label": "<'Year 1' or 'Years 1-5' style>",
      "action": "<imperative sentence: 'Convert $X from 401(k) to Roth IRA' style>",
      "estimated_tax_impact_cents": <integer; negative = savings, positive = additional tax owed>,
      "reason": "<1-2 sentences>",
      "from_bucket_id": "<one of the bucket ids above, or null>",
      "to_bucket_id": "<one of the bucket ids above, or null>"
    }
  ]
}

Constraints:
- 3 to 8 recommendations total. No filler.
- Order chronologically: earliest year first.
- Use ranges (e.g. "Years 1-5") for repeating annual patterns.
- Concrete dollar amounts. No "consider doing X."
- Favor Roth conversions in low-income years if any are visible from the inputs.
- Favor backdoor/mega-backdoor Roth where bucket inventory supports it.
- If the current mix is already close to target (each leg within 5%), suggest only refinement actions.`;
}

interface ParsedRecommendations {
  recommendations: Array<{
    year: number;
    timeframe_label: string;
    action: string;
    estimated_tax_impact_cents: number;
    reason: string;
    from_bucket_id: string | null;
    to_bucket_id: string | null;
  }>;
}

function parseResponse(text: string): ParsedRecommendations | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const obj = JSON.parse(cleaned);
    if (!Array.isArray(obj.recommendations)) return null;
    for (const r of obj.recommendations) {
      if (typeof r.year !== "number") return null;
      if (typeof r.timeframe_label !== "string") return null;
      if (typeof r.action !== "string") return null;
      if (typeof r.estimated_tax_impact_cents !== "number") return null;
      if (typeof r.reason !== "string") return null;
    }
    return obj as ParsedRecommendations;
  } catch {
    return null;
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err("internal_error", "ANTHROPIC_API_KEY not configured.");

  const { data: lensRow, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!lensRow) return err("not_found", `No lens run with id ${id}.`);
  if (lensRow.lens_type !== "cash_flow") {
    return err("validation_failed", "Lens is not a cash_flow type.");
  }
  if (!isCashFlowLensOutput(lensRow.output)) {
    return err("validation_failed", "Lens output is not a valid cash_flow shape.");
  }
  const output = lensRow.output as CashFlowLensOutput;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: buildPrompt(output) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return err("internal_error", "AI returned no text content.");
  }
  const parsed = parseResponse(textBlock.text);
  if (!parsed) {
    return err("internal_error", "Could not parse AI response.", { raw: textBlock.text });
  }

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costCents = Math.round(
    (inputTokens / 1_000_000) * 100 + (outputTokens / 1_000_000) * 500,
  );

  const distRec: CashFlowDistributionRecommendations = {
    generated_at: new Date().toISOString(),
    cost_cents: costCents,
    slider_state: output.distribution_plan.slider_state,
    recommendations: parsed.recommendations.map((r) => ({
      id: cryptoId(),
      year: r.year,
      timeframe_label: r.timeframe_label,
      action: r.action,
      estimated_tax_impact_cents: r.estimated_tax_impact_cents,
      reason: r.reason,
      from_bucket_id: r.from_bucket_id ?? null,
      to_bucket_id: r.to_bucket_id ?? null,
    })),
  };

  const newOutput: CashFlowLensOutput = {
    ...output,
    ai_suggestions: {
      ...output.ai_suggestions,
      distribution_recommendations: distRec,
    },
  };

  const newCumulativeCost = (lensRow.cost_cents ?? 0) + costCents;
  const { data: updated, error: updateErr } = await auth.supabase
    .from("lens_runs")
    .update({
      output: newOutput as unknown as Json,
      cost_cents: newCumulativeCost,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) return err(mapDbError(updateErr), dbErrorMessage(updateErr));

  return ok(updated);
}
