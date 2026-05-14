// Phase 18.4 — POST /api/clients/[id]/generate-context
//
// AI-suggests a 3-5 sentence context paragraph for the client based on
// the latest finalized plan's stage1_output (ClientProfile) and any
// finalized lens runs. The result is RETURNED to the caller — never
// auto-applied — so the advisor can review and edit before saving via
// the standard PATCH /api/clients/[id] flow.
//
// Cost: Haiku 4.5 ~$0.10-0.30 per call. No persistence; the caller
// owns the lifecycle.

import Anthropic from "@anthropic-ai/sdk";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 800;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ClientLite {
  id: string;
  household_name: string;
  archetype: string | null;
  notes: string | null;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err("internal_error", "ANTHROPIC_API_KEY not configured.");
  }

  const { data: client, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id, household_name, archetype, notes")
    .eq("id", id)
    .maybeSingle<ClientLite>();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!client) return err("not_found", `No client with id ${id}.`);

  // Find the latest finalized plan (ready_for_review / approved /
  // archived) with stage1_output populated. If none, generate from
  // basic client metadata + advisor notes only.
  const { data: plan } = await auth.supabase
    .from("plans")
    .select("id, stage1_output, generated_at")
    .eq("client_id", id)
    .in("status", ["ready_for_review", "approved", "archived"])
    .not("stage1_output", "is", null)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Also pull any current lens summaries (Phase 18.5's
  // executive_summary field) for additional context.
  const { data: currentLenses } = await auth.supabase
    .from("lens_runs")
    .select("lens_type, output")
    .eq("client_id", id)
    .in("status", ["current", "reviewed", "presented", "approved"])
    .order("generated_at", { ascending: false })
    .limit(4);

  // Compact representation for the prompt.
  const lensSummaries = (currentLenses ?? [])
    .map((l) => {
      const out = l.output as { executive_summary?: { text?: string } } | null;
      const text = out?.executive_summary?.text;
      return text ? `${l.lens_type}: ${text}` : null;
    })
    .filter((s): s is string => !!s);

  const profile = (plan?.stage1_output as Record<string, unknown> | null) ?? null;

  const prompt = buildPrompt(client, profile, lensSummaries);

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
  const draft = textBlock.text.trim();

  // Cost: Haiku 4.5 $1/MTok input, $5/MTok output. Compute exact.
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costCents = Math.round(
    (inputTokens / 1_000_000) * 100 + (outputTokens / 1_000_000) * 500,
  );

  return ok({
    draft_paragraph: draft,
    sources: {
      plan_id: plan?.id ?? null,
      lens_count: lensSummaries.length,
      has_advisor_notes: !!client.notes,
    },
    cost_cents: costCents,
  });
}

function buildPrompt(
  client: ClientLite,
  profile: Record<string, unknown> | null,
  lensSummaries: string[],
): string {
  const archetypeNote = client.archetype
    ? `\nArchetype: ${client.archetype} (${archetypeLabel(client.archetype)})`
    : "";
  const notesBlock = client.notes
    ? `\n\nADVISOR NOTES:\n${client.notes}`
    : "";
  const profileBlock = profile
    ? `\n\nCLIENT PROFILE (ClientProfile JSONB excerpt):\n${JSON.stringify(profile, null, 2).slice(0, 6000)}`
    : "";
  const lensBlock =
    lensSummaries.length > 0
      ? `\n\nCURRENT LENS SUMMARIES:\n${lensSummaries.map((s) => "- " + s).join("\n")}`
      : "";

  return `You are drafting a 3-5 sentence orientation paragraph for an advisor team about a client household. The paragraph appears prominently on the client's overview page and helps any team member orient quickly when they open the client.

Tone: factual, professional, concise. No greetings. No "this client" — refer to the household by name. Lead with who they are + their business or situation, then planning thesis, then sensitivities or current focus.

Output ONLY the paragraph itself. No headers, no preamble, no closing. 3-5 sentences max. ~80-150 words.

HOUSEHOLD: ${client.household_name}${archetypeNote}${notesBlock}${profileBlock}${lensBlock}`;
}

function archetypeLabel(a: string): string {
  switch (a) {
    case "PRE":
      return "pre-liquidity / pre-transaction prep";
    case "MID":
      return "mid-transaction / live transaction";
    case "POST":
      return "post-liquidity / stabilized";
    case "NONE":
      return "no active transition";
    default:
      return a;
  }
}
