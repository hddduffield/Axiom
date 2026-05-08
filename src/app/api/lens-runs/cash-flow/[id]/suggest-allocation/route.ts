// Phase 13.2 — POST /api/lens-runs/cash-flow/[id]/suggest-allocation
//
// Calls Claude Haiku 4.5 with the current bucket list, goals, assumptions,
// and available monthly cash. Returns recommended allocation %s + a brief
// "why" per bucket. Persists the result to ai_suggestions.allocation in
// the lens_run output JSONB so the UI can re-render without a re-roll on
// every navigation. Cost ~$0.01-$0.05 per call.

import Anthropic from "@anthropic-ai/sdk";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  availableMonthlyAllocationCents,
  isCashFlowLensOutput,
  type CashFlowAllocationSuggestion,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1500;

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function buildPrompt(out: CashFlowLensOutput): string {
  const availableMo = availableMonthlyAllocationCents(out);
  const buckets = out.buckets
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((b, i) => {
      return `  ${i + 1}. ${b.name} (id: ${b.id}; tax: ${b.tax_treatment}; current: ${fmtCents(b.current_balance_cents)})`;
    })
    .join("\n");

  return `Allocate the available monthly contribution across the buckets below to balance the client's goals.

Available monthly to allocate: ${fmtCents(availableMo)}
Annual gross income: ${fmtCents(out.gross_income_annual_cents)}
Annual expenses:    ${fmtCents(out.expenses_annual_cents)}
Effective tax rate now: ${(out.assumptions.effective_tax_rate_now * 100).toFixed(0)}%
Effective tax rate retirement: ${(out.assumptions.effective_tax_rate_retirement * 100).toFixed(0)}%
Goals: ${out.goals_narrative}

Buckets:
${buckets}

Return ONLY a JSON object — no preamble, no markdown — with shape:
{
  "buckets": [
    {
      "bucket_id": "<one of the ids above>",
      "recommended_pct": <integer 0..100>,
      "reasoning": "<1-2 sentence rationale>"
    }
  ]
}

Constraints:
- Sum of recommended_pct across all buckets MUST equal 100.
- Every bucket id from the input list MUST appear exactly once.
- Use whole-number percentages. Round to make the total exact.
- Keep reasoning concise; advisor reads at a glance.
- Favor tax diversification. If the client lacks a Roth bucket, weight tax-free higher.
- If the gross income suggests high marginal bracket, weight tax-deferred higher.`;
}

interface ParsedAllocation {
  buckets: Array<{ bucket_id: string; recommended_pct: number; reasoning: string }>;
}

function parseResponse(text: string): ParsedAllocation | null {
  // Strip code fences if any.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== "object") return null;
    if (!Array.isArray(obj.buckets)) return null;
    for (const b of obj.buckets) {
      if (typeof b.bucket_id !== "string") return null;
      if (typeof b.recommended_pct !== "number") return null;
      if (typeof b.reasoning !== "string") return null;
    }
    return obj as ParsedAllocation;
  } catch {
    return null;
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err("internal_error", "ANTHROPIC_API_KEY not configured.");
  }

  // Fetch the lens row + verify shape.
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

  if (output.buckets.length === 0) {
    return err("validation_failed", "Add at least one bucket before requesting AI allocation.");
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(output);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return err("internal_error", "AI returned no text content.");
  }
  const parsed = parseResponse(textBlock.text);
  if (!parsed) {
    return err("internal_error", "Could not parse AI response.", { raw: textBlock.text });
  }

  // Cost: Haiku 4.5 $1/MTok input, $5/MTok output. Compute exact.
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costCents = Math.round(
    (inputTokens / 1_000_000) * 100 + (outputTokens / 1_000_000) * 500,
  );

  const allocation: CashFlowAllocationSuggestion = {
    generated_at: new Date().toISOString(),
    cost_cents: costCents,
    buckets: parsed.buckets,
  };

  const newOutput: CashFlowLensOutput = {
    ...output,
    ai_suggestions: { ...output.ai_suggestions, allocation },
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
