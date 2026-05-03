// Phase 3.2 Step 3 — Stage 4 live ceiling validation against Holloway.
//
// Loads the Holloway ClientProfile (Stage 1 output) + the consolidated
// QuantifiedRecommendations (Stage 3a full-pipeline output, 81 recs), and
// fires generatePlan() against the live Anthropic API to produce the full
// 14-section Stage4Result.
//
// Artifact-first write pattern: the Stage4Result (or Stage4ResultFailed) is
// written to disk immediately after generatePlan returns and BEFORE the
// budget guard runs. Per Phase 3.1c discipline, failed runs are the most
// valuable diagnostic data; budget overruns must not orphan results.
//
// Hard budget cap: $35 (3500 cents). Expected $15–$25 first attempt.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  generatePlan,
  type Stage4ApiClient,
} from "../src/lib/orchestrator/stages/stage4PlanGenerator";
import {
  isStage4ResultFailed,
  type Stage4Result,
  type Stage4ResultFailed,
} from "../src/lib/orchestrator/schemas/stage4.types";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type { QuantifiedRecommendations } from "../src/lib/orchestrator/schemas/pipelineTypes";

const HARD_BUDGET_CAP_CENTS = 3500; // $35

// Set STAGE4_DRY_RUN=1 to abort right before the LLM stream call. Use to
// verify pre-flight passes (post-trim, post-context-check) and report the
// estimated input token count without paying for a real LLM call. $0 spend.
const DRY_RUN = process.env.STAGE4_DRY_RUN === "1";

interface DryRunMarker {
  kind: "dry_run_marker";
  pass_label: string;
  user_turn_chars: number;
  user_turn_estimated_tokens_chars_over_4: number;
  client_profile_chars: number;
  quantified_recommendations_chars: number;
  // Real-token count from the count_tokens API (populated below).
  count_tokens_real: number | null;
}

// Wraps a real Anthropic client with progress logging. Stage 4 now runs as
// two passes (Pass 1 + Pass 2), so the wrapper logs both stream calls.
//
// When DRY_RUN is set, the wrapper aborts at Pass 1's stream call (before
// any LLM completion fires). The countTokens passthrough still runs the
// real Anthropic count_tokens API call so we get the authoritative real-
// token count for diagnostic comparison against chars/4.
function makeLoggingClient(
  real: Stage4ApiClient,
  dryRun: boolean,
): Stage4ApiClient & { lastDryRunMarker: () => DryRunMarker | null; lastCountTokens: () => number | null } {
  let callsOpened = 0;
  let callsResolved = 0;
  let lastDryRun: DryRunMarker | null = null;
  let lastCount: number | null = null;
  return {
    lastDryRunMarker: () => lastDryRun,
    lastCountTokens: () => lastCount,
    messages: {
      countTokens: async (params) => {
        const result = await real.messages.countTokens(params);
        lastCount = result.input_tokens;
        console.log(
          `  [countTokens] real input tokens: ${result.input_tokens.toLocaleString()}`,
        );
        return result;
      },
      stream: (params) => {
        const id = ++callsOpened;
        const t0 = Date.now();
        const passLabel =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "unknown_tool";
        console.log(`  [stream #${id}, ${passLabel}] opened`);
        if (dryRun) {
          // Compute concrete chars/4 measurements from the params and abort.
          const userMsg = params.messages[0];
          const userContent =
            typeof userMsg.content === "string"
              ? userMsg.content
              : JSON.stringify(userMsg.content);
          const cpMatch = userContent.match(
            /<client_profile>\n([\s\S]*?)\n<\/client_profile>/,
          );
          const qrMatch = userContent.match(
            /<quantified_recommendations>\n([\s\S]*?)\n<\/quantified_recommendations>/,
          );
          const marker: DryRunMarker = {
            kind: "dry_run_marker",
            pass_label: passLabel,
            user_turn_chars: userContent.length,
            user_turn_estimated_tokens_chars_over_4: Math.ceil(
              userContent.length / 4,
            ),
            client_profile_chars: cpMatch ? cpMatch[1].length : 0,
            quantified_recommendations_chars: qrMatch ? qrMatch[1].length : 0,
            count_tokens_real: lastCount,
          };
          lastDryRun = marker;
          console.log(
            `  [stream #${id}, ${passLabel}] DRY-RUN abort: chars/4=${marker.user_turn_estimated_tokens_chars_over_4}, real=${marker.count_tokens_real?.toLocaleString() ?? "n/a"} (CP=${marker.client_profile_chars}c, QR=${marker.quantified_recommendations_chars}c)`,
          );
          return {
            finalMessage: async () => {
              throw new Error(
                `STAGE4_DRY_RUN_ABORT: pre-flight passed; aborted before LLM call. pass=${passLabel} chars/4=${marker.user_turn_estimated_tokens_chars_over_4} real=${marker.count_tokens_real ?? "n/a"}`,
              );
            },
          };
        }
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [stream #${id}, ${passLabel}] resolved ${dt}ms, in=${ai.toLocaleString()}, out=${ao.toLocaleString()} (${callsResolved}/${callsOpened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

async function main() {
  // 1. Env check
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set after dotenv load.");
    process.exit(1);
  }
  console.log(
    `✓ ANTHROPIC_API_KEY loaded (length: ${process.env.ANTHROPIC_API_KEY.length})\n`,
  );

  // 2. Load fixtures
  const clientProfile = JSON.parse(
    await readFile("artifacts/holloway_clientprofile.json", "utf8"),
  ) as ClientProfile;

  const stage3aWrapper = JSON.parse(
    await readFile("artifacts/stage3a_full_pipeline_test_v2.json", "utf8"),
  ) as { result: QuantifiedRecommendations };
  const quantifiedRecs = stage3aWrapper.result;

  console.log(
    `Loaded Holloway ClientProfile (advisor_id=${clientProfile.engagement.advisor_id}, archetype=${clientProfile.engagement.archetype})`,
  );
  console.log(
    `Loaded QuantifiedRecommendations: ${quantifiedRecs.recommendations.length} recs\n`,
  );

  // 3. Real Anthropic client wrapped with progress logging
  const realClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const apiClient = makeLoggingClient(realClient, DRY_RUN);
  if (DRY_RUN) {
    console.log("⚠ STAGE4_DRY_RUN=1 — aborting before LLM call. $0 spend.\n");
  }

  // 4. Fire Stage 4
  console.log("Firing Stage 4 (generatePlan)...\n");
  const t0 = Date.now();
  const result = await generatePlan(clientProfile, quantifiedRecs, {
    apiClient,
    kbPath: "kb/v1_2",
    advisorId: "will-bearden",
    generatedDate: new Date(),
    referenceDate: new Date(),
    maxRetries: 1,
  });
  const wallClockMs = Date.now() - t0;
  console.log(`\nStage 4 returned in ${wallClockMs}ms`);

  // 5. Save artifact FIRST (artifact-first-write pattern)
  const outputPath = resolve("artifacts/stage4_holloway_validation_v1.json");
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        _test_metadata: {
          ran_at: new Date().toISOString(),
          input_client_profile: "artifacts/holloway_clientprofile.json",
          input_quantified_recommendations:
            "artifacts/stage3a_full_pipeline_test_v2.json",
          rec_count: quantifiedRecs.recommendations.length,
          wall_clock_ms: wallClockMs,
          script: "scripts/runStage4LiveValidation.ts",
        },
        result,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Final artifact written to: ${outputPath}\n`);

  // 6. Comprehensive report (always — diagnostic value applies regardless
  //    of cost gate)
  console.log("===== STAGE 4 LIVE VALIDATION REPORT =====\n");

  // Dry-run path: if we set STAGE4_DRY_RUN=1 and the harness reached
  // messages.stream() (i.e., pre-flight passed), the wrapper threw a
  // sentinel error and the harness returned api_error. Surface this
  // distinctly from a real failure.
  if (DRY_RUN) {
    const marker = apiClient.lastDryRunMarker();
    if (marker !== null) {
      console.log("STATUS: DRY-RUN PASS\n");
      console.log("Pre-flight succeeded; aborted before LLM completion.\n");
      console.log("--- Pass 1 user turn measurement ---");
      console.log(`pass_label:                                   ${marker.pass_label}`);
      console.log(
        `user_turn chars:                              ${marker.user_turn_chars.toLocaleString()}`,
      );
      console.log(
        `chars/4 estimate:                             ${marker.user_turn_estimated_tokens_chars_over_4.toLocaleString()}`,
      );
      console.log(
        `count_tokens API (real tokens):               ${marker.count_tokens_real?.toLocaleString() ?? "n/a"}`,
      );
      console.log(
        `client_profile block chars:                   ${marker.client_profile_chars.toLocaleString()} (~${Math.ceil(marker.client_profile_chars / 4).toLocaleString()} tokens chars/4)`,
      );
      console.log(
        `quantified_recommendations (trimmed) chars:   ${marker.quantified_recommendations_chars.toLocaleString()} (~${Math.ceil(marker.quantified_recommendations_chars / 4).toLocaleString()} tokens chars/4)`,
      );
      console.log(`\n--- Headroom check ---`);
      const realTokens = marker.count_tokens_real;
      if (realTokens !== null) {
        const headroomReal = 165000 - realTokens;
        const verdictReal =
          headroomReal > 20000
            ? "✓ COMFORTABLE"
            : headroomReal > 5000
              ? "⚠ TIGHT"
              : headroomReal > 0
                ? "⚠ VERY TIGHT"
                : "❌ FAIL";
        console.log(
          `Real-token headroom (vs 165K ceiling): ${headroomReal.toLocaleString()} tokens ${verdictReal}`,
        );
      }
      const headroomChars = 130000 - marker.user_turn_estimated_tokens_chars_over_4;
      console.log(
        `Chars/4 headroom (vs 130K fast-fail ceiling): ${headroomChars.toLocaleString()} tokens (sanity check; not authoritative)`,
      );
      // chars/4 vs real-token divergence telemetry.
      if (realTokens !== null) {
        const divergencePct = Math.round(
          ((realTokens - marker.user_turn_estimated_tokens_chars_over_4) /
            marker.user_turn_estimated_tokens_chars_over_4) *
            100,
        );
        console.log(
          `chars/4 vs real-token divergence:             +${divergencePct}% (real exceeds chars/4 estimate)`,
        );
      }
      console.log(`\nResult artifact: ${outputPath}\n`);
      console.log("Cost: $0.00 (dry-run, no completion call fired; count_tokens is negligible)");
      return; // Skip budget guard entirely.
    }
    // DRY_RUN was set but stream() never opened — pre-flight failed.
    console.log("STATUS: DRY-RUN FAILED (pre-flight check fired)\n");
    if (isStage4ResultFailed(result)) {
      reportFailure(result, wallClockMs, outputPath);
    }
    return;
  }

  if (isStage4ResultFailed(result)) {
    reportFailure(result, wallClockMs, outputPath);
  } else {
    reportSuccess(result, wallClockMs, outputPath);
  }

  // 7. Budget guard (LAST). Artifact + report are preserved regardless.
  const costCents = result._metadata?.cost_cents ?? 0;
  if (costCents > HARD_BUDGET_CAP_CENTS) {
    console.error(
      `\n!! BUDGET CAP BREACH: ${costCents}c (~$${(costCents / 100).toFixed(2)}) > $${HARD_BUDGET_CAP_CENTS / 100} cap`,
    );
    console.error(
      `Artifact preserved at ${outputPath}. Investigate cost source before re-running.`,
    );
    process.exit(3);
  }
}

function reportSuccess(
  r: Stage4Result,
  wallClockMs: number,
  outputPath: string,
) {
  console.log("STATUS: SUCCESS\n");

  const m = r._metadata;
  const flags = r._flags;

  // ── Token / cost summary ────────────────────────────────────────────
  console.log("--- Token usage ---");
  console.log(`input_tokens:                 ${m.input_token_count.toLocaleString()}`);
  console.log(`output_tokens:                ${m.output_token_count.toLocaleString()}`);
  console.log(`cache_creation_input_tokens:  ${m.cache_creation_input_tokens.toLocaleString()}`);
  console.log(`cache_read_input_tokens:      ${m.cache_read_input_tokens.toLocaleString()}`);
  console.log(`cost_cents:                   ${m.cost_cents} (~$${(m.cost_cents / 100).toFixed(2)})`);
  console.log(`attempts_made:                ${m.attempts_made}`);
  console.log(`module duration_ms:           ${m.duration_ms}`);
  console.log(`wall-clock duration_ms:       ${wallClockMs}`);

  // attempt_history
  console.log(`\n--- attempt_history (${m.attempt_history.length}) ---`);
  for (const a of m.attempt_history) {
    console.log(
      `  attempt ${a.attempt_number}: ${a.outcome} | duration=${a.duration_ms}ms | in=${a.input_tokens} | out=${a.output_tokens}${a.failure_details ? ` | err=${a.failure_details.slice(0, 100)}` : ""}`,
    );
  }

  // ── Section-by-section presence verification ────────────────────────
  console.log("\n--- Section presence ---");
  const ll = r.llm_sections;
  const det = r.deterministic_sections;
  console.log(`  T   (title_page):                       ${det.title_page ? "✓" : "✗"}`);
  console.log(`  ES  (executive_summary):                ${ll.executive_summary ? "✓" : "✗"}`);
  console.log(`  OP  (our_process):                      ${ll.our_process ? "✓" : "✗"}`);
  console.log(`  CS  (client_snapshot):                  ${det.client_snapshot ? "✓" : "✗"}`);
  console.log(`  GP  (goals_priorities):                 ${det.goals_priorities ? "✓" : "✗"}`);
  console.log(`  FO  (findings_observations):            ${ll.findings_observations ? "✓" : "✗"}`);
  console.log(`  RB  (recommendations_business):         ${ll.recommendations_business ? "✓" : "✗"} (${ll.recommendations_business.sections.length} sections)`);
  console.log(`  RP  (recommendations_personal):         ${ll.recommendations_personal ? "✓" : "✗"} (${ll.recommendations_personal.sections.length} sections)`);
  console.log(`  IR  (implementation_roadmap):           ${det.implementation_roadmap ? "✓" : "✗"} (${det.implementation_roadmap.total_action_count} action items)`);
  console.log(`  DN  (decisions_needed):                 ${det.decisions_needed ? "✓" : "✗"} (${det.decisions_needed.rows.length} rows)`);
  console.log(`  AT  (advisory_team):                    ${det.advisory_team ? "✓" : "✗"} (${det.advisory_team.rows.length} rows)`);
  console.log(`  MC  (meeting_cadence_intro + table):    ${ll.meeting_cadence_intro && det.meeting_cadence_table ? "✓" : "✗"} (${det.meeting_cadence_table.rows.length} table rows)`);
  console.log(`  GL  (glossary):                         ${det.glossary ? "✓" : "✗"} (${det.glossary.entries.length} entries)`);
  console.log(`  DS  (disclosures):                      ${det.disclosures ? "✓" : "✗"} (${det.disclosures.body_paragraphs.length} paragraphs)`);

  // Recommendations section IDs emitted.
  console.log(`\n--- Recommendations — Business section IDs ---`);
  for (const sec of ll.recommendations_business.sections) {
    console.log(
      `  ${sec.section_id} | ${sec.label} | source_recs=${sec.source_rec_ids.length} | bullets=${sec.recommendations_bullets.length}${sec.subsections ? ` | subs=${sec.subsections.length}` : ""}`,
    );
  }
  console.log(`\n--- Recommendations — Personal section IDs ---`);
  for (const sec of ll.recommendations_personal.sections) {
    console.log(
      `  ${sec.section_id} | ${sec.label} | source_recs=${sec.source_rec_ids.length} | bullets=${sec.recommendations_bullets.length}${sec.subsections ? ` | subs=${sec.subsections.length}` : ""}`,
    );
  }

  // Executive summary subsections
  console.log(`\n--- Executive Summary structure ---`);
  console.log(`  opening_paragraph: ${ll.executive_summary.opening_paragraph.length} chars`);
  console.log(`  two_themes_paragraph: ${ll.executive_summary.two_themes_paragraph.length} chars`);
  console.log(`  top_priorities: ${ll.executive_summary.top_priorities.length} rows`);
  console.log(`  what_this_means_closer: ${ll.executive_summary.what_this_means_closer.length} chars`);

  // ── Cross-references rollup ─────────────────────────────────────────
  const allCrossRefs = [
    ...ll.recommendations_business.sections.flatMap((s) => s.cross_references),
    ...ll.recommendations_personal.sections.flatMap((s) => s.cross_references),
  ];
  console.log(`\n--- Cross-references ---`);
  console.log(`  total emitted (resolved): ${allCrossRefs.length}`);
  console.log(`  unresolved (stripped):    ${flags.unresolved_cross_references.length}`);
  if (flags.unresolved_cross_references.length > 0) {
    console.log(`  unresolved entries:`);
    for (const u of flags.unresolved_cross_references) {
      console.log(`    ${u.source_section_id} → ${u.target_section_id}: "${u.display_text}"`);
    }
  }

  // ── Glossary terms used ─────────────────────────────────────────────
  console.log(`\n--- Glossary terms used (${flags.glossary_terms_used.length}) ---`);
  for (const t of flags.glossary_terms_used) console.log(`  ${t}`);

  // ── Number drift ────────────────────────────────────────────────────
  console.log(`\n--- Number drift warnings ---`);
  console.log(`  total: ${flags.numbers_drift.length}`);
  const hard = flags.numbers_drift.filter((d) => d.severity === "hard");
  const soft = flags.numbers_drift.filter((d) => d.severity === "soft");
  console.log(`  hard:  ${hard.length} ${hard.length === 0 ? "✓" : "⚠️"}`);
  console.log(`  soft:  ${soft.length}`);
  for (const d of hard.slice(0, 5)) {
    console.log(`    [HARD] ${d.rec_id}: emitted=${d.emitted}, expected=${d.expected}`);
  }
  for (const d of soft.slice(0, 5)) {
    console.log(`    [soft] ${d.rec_id}: emitted=${d.emitted}, expected=${d.expected}`);
  }

  // ── Archetype gating ────────────────────────────────────────────────
  console.log(`\n--- Archetype gating ---`);
  console.log(`  optional_sections_included: ${flags.optional_sections_included.length}`);
  console.log(`  conditional_sections_omitted: ${flags.conditional_sections_omitted.length}`);

  // ── Spot-check verbatim samples ─────────────────────────────────────
  console.log(`\n===== SPOT-CHECK: VOICE QUALITY SAMPLES =====`);

  console.log(`\n--- (a) Executive Summary — opening 2 paragraphs ---`);
  console.log(`\n[opening_paragraph]\n${ll.executive_summary.opening_paragraph}`);
  console.log(`\n[two_themes_paragraph]\n${ll.executive_summary.two_themes_paragraph}`);

  console.log(`\n--- (b) First Recommendations — Business section: intro + first 2 bullets ---`);
  const firstBus = ll.recommendations_business.sections[0];
  if (firstBus) {
    console.log(`\n[${firstBus.section_id} ${firstBus.numbered_heading}]`);
    console.log(`label: ${firstBus.label}`);
    console.log(`\n[intro_paragraph]\n${firstBus.intro_paragraph}`);
    const bullets =
      (firstBus.subsections && firstBus.subsections[0]?.bullets) ??
      firstBus.recommendations_bullets;
    const sample = bullets.slice(0, 2);
    for (const b of sample) {
      console.log(`\n• **${b.bold_imperative}** ${b.briefing}`);
      if (b.partner_role) console.log(`  (partner: ${b.partner_role})`);
    }
    if (firstBus.closer_paragraph) {
      console.log(
        `\n[closer: ${firstBus.closer_paragraph.label}]\n${firstBus.closer_paragraph.body}`,
      );
    }
  }

  console.log(`\n--- (c) Findings & Observations — Strengths first item ---`);
  if (ll.findings_observations.strengths.length > 0) {
    console.log(`\n✓ ${ll.findings_observations.strengths[0].body}`);
  }

  // ── Diagnostic verdict on voice ─────────────────────────────────────
  console.log(`\n===== DIAGNOSTIC VERDICT =====\n`);
  const verdict = assessVoiceQuality(r);
  for (const line of verdict) console.log(line);

  console.log(`\nResult artifact: ${outputPath}`);
}

function assessVoiceQuality(r: Stage4Result): string[] {
  const out: string[] = [];
  const ll = r.llm_sections;

  // Heuristic 1: strategic-frame-first openings
  // Look at first sentence of each recommendations_business section.
  const sfFirstChecks: Array<{ id: string; firstSentence: string; passes: boolean }> = [];
  for (const sec of ll.recommendations_business.sections) {
    const firstSentence = sec.intro_paragraph.split(/[.!?]/)[0]?.trim() ?? "";
    // FAILS when the first sentence starts with "We recommend" or
    // similar imperative-first patterns.
    const fails =
      /^(we recommend|we suggest|you should|the client should)/i.test(
        firstSentence,
      );
    sfFirstChecks.push({
      id: sec.section_id,
      firstSentence: firstSentence.slice(0, 80),
      passes: !fails,
    });
  }
  const sfPassRate =
    sfFirstChecks.filter((c) => c.passes).length / Math.max(1, sfFirstChecks.length);
  out.push(
    `Strategic-frame-first openings: ${sfFirstChecks.filter((c) => c.passes).length}/${sfFirstChecks.length} sections pass (${(sfPassRate * 100).toFixed(0)}%)`,
  );
  for (const c of sfFirstChecks.filter((c) => !c.passes)) {
    out.push(`  ⚠ ${c.id}: opens with "${c.firstSentence}..."`);
  }

  // Heuristic 2: bold-imperative bullets
  const allBullets = [
    ...ll.recommendations_business.sections.flatMap((s) => [
      ...s.recommendations_bullets,
      ...(s.subsections ?? []).flatMap((sub) => sub.bullets),
    ]),
    ...ll.recommendations_personal.sections.flatMap((s) => [
      ...s.recommendations_bullets,
      ...(s.subsections ?? []).flatMap((sub) => sub.bullets),
    ]),
  ];
  // Bold-imperative passes if it ends with period and is a verb-led short phrase.
  const biChecks = allBullets.map((b) => ({
    bi: b.bold_imperative,
    // Imperative if first word looks like a verb (heuristic: first word
    // is alphanumeric and not a determiner like "The", "A", "An").
    passes:
      b.bold_imperative.length > 0 &&
      b.bold_imperative.length <= 120 &&
      !/^(the|a|an)\s/i.test(b.bold_imperative),
  }));
  const biPassRate =
    biChecks.filter((c) => c.passes).length / Math.max(1, biChecks.length);
  out.push(
    `Bold-imperative bullets: ${biChecks.filter((c) => c.passes).length}/${biChecks.length} pass (${(biPassRate * 100).toFixed(0)}%)`,
  );

  // Heuristic 3: numbers carry assumptions inline
  // Sample 5 bullets that mention a $ figure; check if "approximately" or
  // a parenthetical explanation is nearby.
  const dollarBullets = allBullets.filter((b) => /\$/.test(b.briefing));
  const sampleSize = Math.min(10, dollarBullets.length);
  let withAssumption = 0;
  for (const b of dollarBullets.slice(0, sampleSize)) {
    const hasApproximately = /(approximately|roughly|about|estimated|~\$|—|\(|based on|at current)/i.test(
      b.briefing,
    );
    if (hasApproximately) withAssumption += 1;
  }
  const naRate =
    sampleSize > 0
      ? withAssumption / sampleSize
      : null;
  if (naRate !== null) {
    out.push(
      `Numbers-with-assumptions: ${withAssumption}/${sampleSize} sampled $-bullets carry inline qualifier (${(naRate * 100).toFixed(0)}%)`,
    );
  } else {
    out.push("Numbers-with-assumptions: no $-bullets to sample");
  }

  // Heuristic 4: cross-references emitted
  const crossRefCount = [
    ...ll.recommendations_business.sections,
    ...ll.recommendations_personal.sections,
  ]
    .map((s) => s.cross_references.length)
    .reduce((a, b) => a + b, 0);
  out.push(`Cross-references emitted (resolved): ${crossRefCount}`);

  // Heuristic 5: number-drift summary
  const hardDrift = r._flags.numbers_drift.filter((d) => d.severity === "hard").length;
  const softDrift = r._flags.numbers_drift.filter((d) => d.severity === "soft").length;
  out.push(
    `Number drift: ${hardDrift} hard / ${softDrift} soft ${hardDrift === 0 ? "✓" : "⚠️"}`,
  );

  // Verdict
  out.push(``);
  if (sfPassRate >= 0.8 && biPassRate >= 0.9 && hardDrift === 0) {
    out.push(`✅ Voice quality verdict: PASSING. Strategic-frame openings, bold-imperative bullet pattern, and number discipline all hold.`);
  } else if (sfPassRate >= 0.6 && biPassRate >= 0.8) {
    out.push(`⚠️  Voice quality verdict: ACCEPTABLE WITH CAVEATS. Most sections honor the voice; review sections flagged above.`);
  } else {
    out.push(`❌ Voice quality verdict: WEAK. Voice rules not consistently honored — review the artifact for prompt-tuning opportunities.`);
  }

  return out;
}

function reportFailure(
  r: Stage4ResultFailed,
  wallClockMs: number,
  outputPath: string,
) {
  console.log("STATUS: FAILED\n");
  console.log(`failure_type: ${r._failure_type}`);
  console.log(`failure_reason: ${r._failure_reason}`);
  console.log(`\nfailure_context:`);
  console.log(JSON.stringify(r._failure_context, null, 2).slice(0, 2000));

  if (r._metadata) {
    console.log(`\n--- Cost spent ---`);
    console.log(`cost_cents: ${r._metadata.cost_cents ?? 0} (~$${((r._metadata.cost_cents ?? 0) / 100).toFixed(2)})`);
    console.log(`input_tokens: ${(r._metadata.input_token_count ?? 0).toLocaleString()}`);
    console.log(`output_tokens: ${(r._metadata.output_token_count ?? 0).toLocaleString()}`);
    console.log(`cache_creation_input_tokens: ${(r._metadata.cache_creation_input_tokens ?? 0).toLocaleString()}`);
    console.log(`cache_read_input_tokens: ${(r._metadata.cache_read_input_tokens ?? 0).toLocaleString()}`);
    console.log(`attempts_made: ${r._metadata.attempts_made ?? 0}`);
    if (r._metadata.attempt_history) {
      console.log(`\n--- attempt_history ---`);
      for (const a of r._metadata.attempt_history) {
        console.log(
          `  attempt ${a.attempt_number}: ${a.outcome} | duration=${a.duration_ms}ms | in=${a.input_tokens} | out=${a.output_tokens}${a.failure_details ? ` | err=${a.failure_details.slice(0, 200)}` : ""}`,
        );
      }
    }
  }

  if (r._failure_context.validation_errors) {
    console.log(`\n--- validation_errors ---`);
    for (const e of r._failure_context.validation_errors.slice(0, 30)) {
      console.log(`  - ${e.slice(0, 200)}`);
    }
    if (r._failure_context.validation_errors.length > 30) {
      console.log(`  (... ${r._failure_context.validation_errors.length - 30} more)`);
    }
  }

  console.log(`\nwall_clock_ms: ${wallClockMs}`);
  console.log(`Result artifact: ${outputPath}`);
}

main().catch((err) => {
  console.error("UNCAUGHT ERROR:", err);
  process.exit(2);
});
