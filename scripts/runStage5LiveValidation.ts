// Phase 3.3 Step 3 — Stage 5 live validation against Holloway Stage 4 output.
//
// Loads the Stage 4 success artifact (Holloway plan), the consolidated
// QuantifiedRecommendations (Stage 3a output, 81 recs), and the Holloway
// ClientProfile, then fires auditPlan() against the live Anthropic API.
//
// Artifact-first write pattern: the Stage5Result (or Stage5ResultFailed) is
// written to disk immediately after auditPlan returns and BEFORE the budget
// guard runs. Failed runs are the most valuable diagnostic data; budget
// overruns must not orphan results.
//
// Hard budget cap: $15 (1500 cents). Expected $5–$10 first attempt.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  auditPlan,
  type Stage5ApiClient,
} from "../src/lib/orchestrator/stages/stage5CoherenceAuditor";
import {
  isStage5ResultFailed,
  type AuditFinding,
  type Stage5Result,
  type Stage5ResultFailed,
} from "../src/lib/orchestrator/schemas/stage5.types";
import { projectForStage5Audit } from "../src/lib/orchestrator/glue/stage5InputProjection";
import { loadVoiceCalibrationSummary } from "../src/lib/orchestrator/glue/stage5DeterministicChecks";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type { QuantifiedRecommendations } from "../src/lib/orchestrator/schemas/pipelineTypes";
import type { Stage4Result } from "../src/lib/orchestrator/schemas/stage4.types";

const HARD_BUDGET_CAP_CENTS = 1500; // $15

// Set STAGE5_DRY_RUN=1 to abort right before the LLM stream call. The
// countTokens passthrough still hits the real Anthropic API (count_tokens
// is free) so we get the authoritative real-token measurement, but no
// completion fires and no input tokens are billed for inference. $0 spend.
const DRY_RUN = process.env.STAGE5_DRY_RUN === "1";

interface DryRunMarker {
  user_turn_chars: number;
  user_turn_estimated_tokens_chars_over_4: number;
  // Section-level chars from regex extraction of the user turn — useful
  // for comparing the projection's effect on each major chunk.
  plan_block_chars: number;
  quantified_recommendations_block_chars: number;
  client_profile_block_chars: number;
  voice_calibration_block_chars: number;
  // Real-token count from the count_tokens API.
  count_tokens_real: number | null;
}

function makeLoggingClient(
  real: Stage5ApiClient,
  dryRun: boolean,
): Stage5ApiClient & {
  lastDryRunMarker: () => DryRunMarker | null;
  lastCountTokens: () => number | null;
} {
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
        const toolName =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "unknown_tool";
        console.log(`  [stream #${id}, ${toolName}] opened`);
        if (dryRun) {
          // Compute chars/4 measurements from the actual user turn the
          // harness assembled, then abort with a sentinel error so no
          // completion fires.
          const userMsg = params.messages[0];
          const userContent =
            typeof userMsg.content === "string"
              ? userMsg.content
              : JSON.stringify(userMsg.content);
          const blockChars = (re: RegExp) => {
            const m = userContent.match(re);
            return m ? m[1].length : 0;
          };
          const marker: DryRunMarker = {
            user_turn_chars: userContent.length,
            user_turn_estimated_tokens_chars_over_4: Math.ceil(
              userContent.length / 4,
            ),
            plan_block_chars: blockChars(/<plan>\n([\s\S]*?)\n<\/plan>/),
            quantified_recommendations_block_chars: blockChars(
              /<quantified_recommendations>\n([\s\S]*?)\n<\/quantified_recommendations>/,
            ),
            client_profile_block_chars: blockChars(
              /<client_profile>\n([\s\S]*?)\n<\/client_profile>/,
            ),
            voice_calibration_block_chars: blockChars(
              /<voice_calibration_summary>\n([\s\S]*?)\n<\/voice_calibration_summary>/,
            ),
            count_tokens_real: lastCount,
          };
          lastDryRun = marker;
          console.log(
            `  [stream #${id}, ${toolName}] DRY-RUN abort: chars/4=${marker.user_turn_estimated_tokens_chars_over_4.toLocaleString()}, real=${marker.count_tokens_real?.toLocaleString() ?? "n/a"}`,
          );
          return {
            finalMessage: async () => {
              throw new Error(
                `STAGE5_DRY_RUN_ABORT: pre-flight passed; aborted before LLM call. chars/4=${marker.user_turn_estimated_tokens_chars_over_4} real=${marker.count_tokens_real ?? "n/a"}`,
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
            const cc = msg.usage?.cache_creation_input_tokens ?? 0;
            const cr = msg.usage?.cache_read_input_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [stream #${id}, ${toolName}] resolved ${dt}ms | in=${ai.toLocaleString()} out=${ao.toLocaleString()} cw=${cc.toLocaleString()} cr=${cr.toLocaleString()} | stop=${msg.stop_reason} (${callsResolved}/${callsOpened})`,
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
  const stage4Wrapper = JSON.parse(
    await readFile("artifacts/stage4_holloway_validation_v1.json", "utf8"),
  ) as { result: Stage4Result };
  const stage4Result = stage4Wrapper.result;

  const stage3aWrapper = JSON.parse(
    await readFile("artifacts/stage3a_full_pipeline_test_v2.json", "utf8"),
  ) as { result: QuantifiedRecommendations };
  const quantifiedRecs = stage3aWrapper.result;

  const clientProfile = JSON.parse(
    await readFile("artifacts/holloway_clientprofile.json", "utf8"),
  ) as ClientProfile;

  console.log(
    `Loaded Stage 4 plan: ${stage4Result.llm_sections.recommendations_business.sections.length} business + ${stage4Result.llm_sections.recommendations_personal.sections.length} personal sections`,
  );
  console.log(
    `Loaded QuantifiedRecommendations: ${quantifiedRecs.recommendations.length} recs`,
  );
  console.log(
    `Loaded Holloway ClientProfile (advisor_id=${clientProfile.engagement.advisor_id}, archetype=${clientProfile.engagement.archetype})\n`,
  );

  // DRY_RUN preamble: compute chars/4 of the projected user turn directly,
  // independently of the harness, so we still have the chars/4 number when
  // count_tokens trips the soft-degrade and the stream interceptor never
  // fires. This mirrors what `auditPlan` does internally — same projection,
  // same compact-JSON serialization, same XML wrapping.
  let preDryRunCharsOver4: number | null = null;
  let preDryRunBlockChars: {
    voice: number;
    plan: number;
    qr: number;
    cp: number;
  } | null = null;
  if (DRY_RUN) {
    const auditInput = projectForStage5Audit(
      stage4Result,
      quantifiedRecs,
      clientProfile,
    );
    const voiceCal = await loadVoiceCalibrationSummary();
    const voiceBlockChars = voiceCal.length;
    const planBlockChars = JSON.stringify(auditInput.plan).length;
    const qrBlockChars = JSON.stringify(auditInput.quantified_recommendations).length;
    const cpBlockChars = JSON.stringify(auditInput.client_profile).length;
    // Reproduce buildUserTurn's wrapping: each block is on its own line
    // sandwiched between <tag>\n...\n</tag> wrappers, separated by blanks.
    // Approximate total = sum of blocks + ~1.5K of wrapper boilerplate.
    const userTurnApprox =
      voiceBlockChars +
      planBlockChars +
      qrBlockChars +
      cpBlockChars +
      // Deterministic findings vary; assume tiny for projection-only Holloway.
      500 +
      // Wrappers + archetype + closing instruction.
      1500;
    preDryRunCharsOver4 = Math.ceil(userTurnApprox / 4);
    preDryRunBlockChars = {
      voice: voiceBlockChars,
      plan: planBlockChars,
      qr: qrBlockChars,
      cp: cpBlockChars,
    };
    console.log("--- DRY-RUN preamble: chars/4 measurement (post-projection) ---");
    console.log(`<voice_calibration_summary>:    ${voiceBlockChars.toLocaleString()} chars`);
    console.log(`<plan>:                         ${planBlockChars.toLocaleString()} chars`);
    console.log(`<quantified_recommendations>:   ${qrBlockChars.toLocaleString()} chars`);
    console.log(`<client_profile>:               ${cpBlockChars.toLocaleString()} chars`);
    console.log(`Approx user turn total:         ${userTurnApprox.toLocaleString()} chars`);
    console.log(`Approx chars/4 estimate:        ${preDryRunCharsOver4.toLocaleString()} tokens\n`);
  }

  // 3. Real Anthropic client wrapped with progress logging
  const realClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const apiClient = makeLoggingClient(realClient, DRY_RUN);
  if (DRY_RUN) {
    console.log("⚠ STAGE5_DRY_RUN=1 — aborting before LLM call. $0 spend on inference.\n");
  }

  // 4. Fire Stage 5
  console.log("Firing Stage 5 (auditPlan)...\n");
  const t0 = Date.now();
  const result = await auditPlan(stage4Result, quantifiedRecs, clientProfile, {
    apiClient,
    kbPath: "kb/v1_2",
    advisorId: "will-bearden",
    referenceDate: new Date(),
    maxRetries: 1,
    runLlmChecks: true,
  });
  const wallClockMs = Date.now() - t0;
  console.log(`\nStage 5 returned in ${wallClockMs}ms`);

  // 5. Save artifact FIRST (artifact-first-write pattern)
  const outputPath = resolve(
    DRY_RUN
      ? "artifacts/stage5_holloway_validation_dryrun.json"
      : "artifacts/stage5_holloway_validation_v2.json",
  );
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        _test_metadata: {
          ran_at: new Date().toISOString(),
          input_stage4_artifact: "artifacts/stage4_holloway_validation_v1.json",
          input_quantified_recommendations:
            "artifacts/stage3a_full_pipeline_test_v2.json",
          input_client_profile: "artifacts/holloway_clientprofile.json",
          rec_count: quantifiedRecs.recommendations.length,
          wall_clock_ms: wallClockMs,
          dry_run: DRY_RUN,
          script: "scripts/runStage5LiveValidation.ts",
        },
        result,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Final artifact written to: ${outputPath}\n`);

  // 6. Dry-run path: report sizing measurements and exit without firing
  // the budget guard.
  if (DRY_RUN) {
    const marker = apiClient.lastDryRunMarker();
    const realTokens = apiClient.lastCountTokens();

    console.log("===== STAGE 5 DRY-RUN SIZING REPORT =====\n");
    if (marker !== null) {
      console.log("STATUS: pre-flight passed (chars/4 + count_tokens both under ceiling); aborted before LLM completion.\n");
    } else if (realTokens !== null) {
      console.log("STATUS: count_tokens fired but chars/4 fast-fail or count_tokens ceiling tripped; LLM phase soft-degraded.\n");
    } else {
      console.log("STATUS: chars/4 fast-fail tripped before count_tokens; LLM phase soft-degraded.\n");
    }

    if (marker !== null) {
      console.log("--- User-turn measurement (from harness's actual stream params) ---");
      console.log(`user_turn chars:                        ${marker.user_turn_chars.toLocaleString()}`);
      console.log(`chars/4 estimate:                       ${marker.user_turn_estimated_tokens_chars_over_4.toLocaleString()}`);
      console.log(`count_tokens API (real tokens):         ${marker.count_tokens_real?.toLocaleString() ?? "n/a"}`);
      console.log(`\n--- Block sizes (chars) ---`);
      console.log(`<voice_calibration_summary>:            ${marker.voice_calibration_block_chars.toLocaleString()} chars (~${Math.ceil(marker.voice_calibration_block_chars / 4).toLocaleString()} chars/4 tokens)`);
      console.log(`<plan>:                                 ${marker.plan_block_chars.toLocaleString()} chars (~${Math.ceil(marker.plan_block_chars / 4).toLocaleString()} chars/4 tokens)`);
      console.log(`<quantified_recommendations>:           ${marker.quantified_recommendations_block_chars.toLocaleString()} chars (~${Math.ceil(marker.quantified_recommendations_block_chars / 4).toLocaleString()} chars/4 tokens)`);
      console.log(`<client_profile>:                       ${marker.client_profile_block_chars.toLocaleString()} chars (~${Math.ceil(marker.client_profile_block_chars / 4).toLocaleString()} chars/4 tokens)`);

      const charsOver4 = marker.user_turn_estimated_tokens_chars_over_4;
      const real = marker.count_tokens_real;
      const CEILING_CHARS_OVER_4 = 80000;
      const CEILING_REAL = 130000;

      console.log(`\n--- Headroom under Stage 5 ceilings ---`);
      const charsHeadroom = CEILING_CHARS_OVER_4 - charsOver4;
      const charsVerdict =
        charsHeadroom > 10000 ? "✓ COMFORTABLE" : charsHeadroom > 5000 ? "⚠ TIGHT" : charsHeadroom > 0 ? "⚠ VERY TIGHT" : "❌ FAIL";
      console.log(`chars/4 headroom (vs 80K fast-fail):    ${charsHeadroom.toLocaleString()} tokens ${charsVerdict}`);
      if (real !== null) {
        const realHeadroom = CEILING_REAL - real;
        const realVerdict =
          realHeadroom > 10000 ? "✓ COMFORTABLE" : realHeadroom > 5000 ? "⚠ TIGHT" : realHeadroom > 0 ? "⚠ VERY TIGHT" : "❌ FAIL";
        console.log(`real-token headroom (vs 130K count):${realHeadroom.toLocaleString()} tokens ${realVerdict}`);

        const divergencePct = Math.round(
          ((real - charsOver4) / charsOver4) * 100,
        );
        console.log(`chars/4 vs real-token divergence:       ${divergencePct >= 0 ? "+" : ""}${divergencePct}% (real ${divergencePct >= 0 ? "exceeds" : "is below"} chars/4 estimate)`);
      }

      console.log(`\n--- Predicted live-fire cost ---`);
      // Anthropic Opus 4.7 input pricing: $15/M tokens (1500 cents/M).
      // Output pricing: $75/M tokens (7500 cents/M). Stage 5 max output = 8K
      // tokens; assume average ~3K out (audit findings list).
      const inputTokensForCost = real ?? charsOver4;
      const inputCostCents = (inputTokensForCost * 1500) / 1_000_000;
      const outputCostCents = (3000 * 7500) / 1_000_000;
      const totalCents = Math.round(inputCostCents + outputCostCents);
      console.log(`predicted input cost:                   ~$${(inputCostCents / 100).toFixed(2)} (assuming ${inputTokensForCost.toLocaleString()} input tokens, no cache yet)`);
      console.log(`predicted output cost:                  ~$${(outputCostCents / 100).toFixed(2)} (assuming ~3K output tokens)`);
      console.log(`predicted total per audit:              ~$${(totalCents / 100).toFixed(2)} (one-shot, no retry)`);
      console.log(`predicted with 1 retry (worst case):    ~$${((totalCents * 2) / 100).toFixed(2)}`);
    } else if (realTokens !== null) {
      // chars/4 passed but real-token tripped — count_tokens fired but stream did not.
      console.log(`count_tokens API returned: ${realTokens.toLocaleString()} real tokens`);
      if (preDryRunCharsOver4 !== null && preDryRunBlockChars !== null) {
        console.log(`chars/4 estimate (preamble): ${preDryRunCharsOver4.toLocaleString()} tokens`);
        console.log(`\n--- Block sizes (chars, post-projection) ---`);
        console.log(`<voice_calibration_summary>:            ${preDryRunBlockChars.voice.toLocaleString()} chars (~${Math.ceil(preDryRunBlockChars.voice / 4).toLocaleString()} chars/4 tokens)`);
        console.log(`<plan>:                                 ${preDryRunBlockChars.plan.toLocaleString()} chars (~${Math.ceil(preDryRunBlockChars.plan / 4).toLocaleString()} chars/4 tokens)`);
        console.log(`<quantified_recommendations>:           ${preDryRunBlockChars.qr.toLocaleString()} chars (~${Math.ceil(preDryRunBlockChars.qr / 4).toLocaleString()} chars/4 tokens)`);
        console.log(`<client_profile>:                       ${preDryRunBlockChars.cp.toLocaleString()} chars (~${Math.ceil(preDryRunBlockChars.cp / 4).toLocaleString()} chars/4 tokens)`);

        const CEILING_CHARS_OVER_4 = 80000;
        const CEILING_REAL = 130000;
        const charsHeadroom = CEILING_CHARS_OVER_4 - preDryRunCharsOver4;
        const realHeadroom = CEILING_REAL - realTokens;
        const charsVerdict =
          charsHeadroom > 10000 ? "✓ COMFORTABLE" : charsHeadroom > 5000 ? "⚠ TIGHT" : charsHeadroom > 0 ? "⚠ VERY TIGHT" : "❌ FAIL";
        const realVerdict =
          realHeadroom > 10000 ? "✓ COMFORTABLE" : realHeadroom > 5000 ? "⚠ TIGHT" : realHeadroom > 0 ? "⚠ VERY TIGHT" : "❌ FAIL";

        console.log(`\n--- Headroom under Stage 5 ceilings ---`);
        console.log(`chars/4 headroom (vs 80K fast-fail):    ${charsHeadroom.toLocaleString()} tokens ${charsVerdict}`);
        console.log(`real-token headroom (vs 130K count):${realHeadroom.toLocaleString()} tokens ${realVerdict}`);

        const divergencePct = Math.round(
          ((realTokens - preDryRunCharsOver4) / preDryRunCharsOver4) * 100,
        );
        console.log(`chars/4 vs real-token divergence:       ${divergencePct >= 0 ? "+" : ""}${divergencePct}% (real ${divergencePct >= 0 ? "exceeds" : "is below"} chars/4 estimate)`);
      }

      console.log(`\n--- Predicted live-fire cost (if ceiling were bumped) ---`);
      const inputCostCents = (realTokens * 1500) / 1_000_000;
      const outputCostCents = (3000 * 7500) / 1_000_000;
      const totalCents = Math.round(inputCostCents + outputCostCents);
      console.log(`predicted input cost:                   ~$${(inputCostCents / 100).toFixed(2)} (${realTokens.toLocaleString()} input tokens, no cache yet)`);
      console.log(`predicted output cost:                  ~$${(outputCostCents / 100).toFixed(2)} (assuming ~3K output tokens)`);
      console.log(`predicted total per audit:              ~$${(totalCents / 100).toFixed(2)} (one-shot, no retry)`);
      console.log(`predicted with 1 retry (worst case):    ~$${((totalCents * 2) / 100).toFixed(2)}`);
    } else {
      // chars/4 tripped — neither count_tokens nor stream fired.
      console.log(`Pre-flight chars/4 fast-fail tripped before count_tokens API was called.`);
      if (preDryRunCharsOver4 !== null) {
        console.log(`chars/4 estimate: ${preDryRunCharsOver4.toLocaleString()} tokens`);
      }
      console.log(`Re-check: input was projected via projectForStage5Audit but still exceeds 80K chars/4.`);
    }

    console.log(`\n--- Harness result (from auditPlan) ---`);
    if (isStage5ResultFailed(result)) {
      console.log(`harness returned: FAILED — ${result._failure_type}: ${result._failure_reason.slice(0, 200)}`);
    } else {
      console.log(`harness returned: Stage5Result with ${result.findings.length} finding(s)`);
      console.log(`  llm_skipped:                          ${result._flags.llm_skipped}`);
      console.log(`  llm_skipped_due_to_context_overflow:  ${result._flags.llm_skipped_due_to_context_overflow}`);
      console.log(`  overall_assessment:                   ${result.overall_assessment}`);
      console.log(`  cost_cents:                           ${result._metadata.cost_cents}`);
    }

    console.log(`\nResult artifact: ${outputPath}`);
    console.log(`Cost: $0.00 (dry-run; no completion call fired; count_tokens is free)`);
    return; // skip budget guard
  }

  // 7. Comprehensive report (live path)
  console.log("===== STAGE 5 LIVE VALIDATION REPORT =====\n");

  if (isStage5ResultFailed(result)) {
    reportFailure(result, wallClockMs, outputPath);
  } else {
    reportSuccess(result, wallClockMs, outputPath);
  }

  // 8. Budget guard (LAST). Artifact + report are preserved regardless.
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

function severityBreakdown(findings: AuditFinding[]): {
  critical: number;
  warning: number;
  info: number;
} {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}

function categoryBreakdown(findings: AuditFinding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) {
    out[f.category] = (out[f.category] ?? 0) + 1;
  }
  return out;
}

function reportSuccess(
  r: Stage5Result,
  wallClockMs: number,
  outputPath: string,
) {
  console.log("STATUS: SUCCESS\n");

  const m = r._metadata;
  const flags = r._flags;

  // Token / cost summary
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

  // Findings summary
  const sev = severityBreakdown(r.findings);
  const cats = categoryBreakdown(r.findings);
  console.log(`\n--- Findings summary ---`);
  console.log(`  total findings: ${r.findings.length}`);
  console.log(`  critical: ${sev.critical}`);
  console.log(`  warning:  ${sev.warning}`);
  console.log(`  info:     ${sev.info}`);

  console.log(`\n--- Findings by category ---`);
  // Show DC.* first then LC.* — sort by category name (DC.1...DC.10 then LC.*)
  const orderedCats = Object.keys(cats).sort();
  for (const c of orderedCats) {
    console.log(`  ${c}: ${cats[c]}`);
  }

  // Deterministic check raw counts (independent of merged findings array)
  const dc = r.deterministic_checks;
  console.log(`\n--- Deterministic check raw counts ---`);
  console.log(`  DC.1 unresolved_cross_refs:   ${dc.DC1_unresolved_cross_refs.length}`);
  console.log(`  DC.2 roadmap_orphans:         ${dc.DC2_roadmap_orphans.length}`);
  console.log(`  DC.3 top5_mismatch:           ${dc.DC3_top5_mismatch === null ? 0 : 1}`);
  console.log(`  DC.4 missing_decisions:       ${dc.DC4_missing_decisions.length}`);
  console.log(`  DC.5 unused_glossary:         ${dc.DC5_unused_glossary.length}`);
  console.log(`  DC.6 missing_sections:        ${dc.DC6_missing_sections.length}`);
  console.log(`  DC.7 archetype_violations:    ${dc.DC7_archetype_violations.length}`);
  console.log(`  DC.8 unused_numbers:          ${dc.DC8_unused_numbers.length}`);
  console.log(`  DC.9 compliance_issues:       ${dc.DC9_compliance_issues.length}`);
  console.log(`  DC.10 lifecycle_violations:   ${dc.DC10_lifecycle_violations.length}`);

  // LLM assessment
  console.log(`\n--- LLM assessment ---`);
  if (r.llm_assessment) {
    console.log(`  voice_consistency_score:     ${r.llm_assessment.voice_consistency_score} / 100`);
    console.log(`  contradiction_count:         ${r.llm_assessment.contradiction_count}`);
    console.log(`  llm_overall_assessment:      ${r.llm_assessment.llm_overall_assessment}`);
  } else {
    console.log(`  (LLM skipped)`);
  }
  console.log(`\n--- Harness-authoritative assessment ---`);
  console.log(`  overall_assessment:          ${r.overall_assessment}`);
  console.log(`  assessment_disagreement:     ${flags.assessment_disagreement ? "⚠ YES" : "✓ NO"}`);
  console.log(`  unresolved_findings_count:   ${flags.unresolved_findings_count}`);
  console.log(`  llm_skipped:                 ${flags.llm_skipped}`);

  // Spot-check: dump 3-5 most severe findings VERBATIM
  console.log(`\n===== SPOT-CHECK: TOP FINDINGS VERBATIM =====`);
  // findings are pre-sorted by severity → category → section_id
  const spotCount = Math.min(5, r.findings.length);
  if (spotCount === 0) {
    console.log(`\n(No findings — auditor reports the plan reads clean.)`);
  } else {
    for (let i = 0; i < spotCount; i += 1) {
      const f = r.findings[i];
      console.log(`\n--- Finding ${i + 1}/${spotCount}: ${f.finding_id} ---`);
      console.log(`severity:          ${f.severity}`);
      console.log(`category:          ${f.category}`);
      console.log(`section_ids:       ${f.section_ids.join(", ")}`);
      console.log(`suggested_action:  ${f.suggested_action}`);
      console.log(`description:       ${f.description}`);
      console.log(`evidence:          ${f.evidence}`);
    }
  }

  // Diagnostic verdict on finding quality
  console.log(`\n===== DIAGNOSTIC VERDICT — IS THIS AUDITOR USEFUL? =====\n`);
  const verdict = assessFindingQuality(r);
  for (const line of verdict) console.log(line);

  console.log(`\nResult artifact: ${outputPath}`);
}

function assessFindingQuality(r: Stage5Result): string[] {
  const out: string[] = [];
  const dc = r.deterministic_checks;
  const sev = severityBreakdown(r.findings);

  // Heuristic 1: deterministic findings density
  // For an 81-rec, 14-section, 168-AI plan, the deterministic checks should
  // produce 0-5 critical findings, 0-10 warnings if Stage 4 is healthy. More
  // signals genuine issues; fewer signals stage 4 is well-tuned.
  const detTotal =
    dc.DC1_unresolved_cross_refs.length +
    dc.DC2_roadmap_orphans.length +
    (dc.DC3_top5_mismatch === null ? 0 : 1) +
    dc.DC4_missing_decisions.length +
    dc.DC5_unused_glossary.length +
    dc.DC6_missing_sections.length +
    dc.DC7_archetype_violations.length +
    dc.DC8_unused_numbers.length +
    dc.DC9_compliance_issues.length +
    dc.DC10_lifecycle_violations.length;

  out.push(`Deterministic findings count: ${detTotal}`);
  if (detTotal === 0) {
    out.push(`  ✓ No deterministic regressions detected — Stage 4 builders are clean.`);
  } else {
    out.push(`  ⚠ ${detTotal} deterministic finding(s) — these are mechanical issues a regex CAN catch.`);
  }

  // Specifically flag DC.6 / DC.9 — those should never fire on a healthy Stage 4
  if (dc.DC6_missing_sections.length > 0) {
    out.push(`  ❌ DC.6 missing_sections fired (${dc.DC6_missing_sections.join(", ")}) — Stage 4 builder regression. Plan is structurally incomplete.`);
  }
  if (dc.DC9_compliance_issues.length > 0) {
    out.push(`  ❌ DC.9 compliance_issues fired — compliance hygiene broken; plan is not advisor-deliverable.`);
  }

  // Heuristic 2: LLM finding quality — count LC.* findings
  const llmFindings = r.findings.filter((f) => f.category.startsWith("LC"));
  const llmCritical = llmFindings.filter((f) => f.severity === "critical").length;
  const llmWarning = llmFindings.filter((f) => f.severity === "warning").length;
  const llmInfo = llmFindings.filter((f) => f.severity === "info").length;

  out.push(``);
  out.push(`LLM findings (LC.1–LC.6): ${llmFindings.length} total (${llmCritical} crit, ${llmWarning} warn, ${llmInfo} info)`);

  if (llmFindings.length === 0) {
    out.push(`  ⚠ Auditor produced ZERO LC.* findings. Either the plan is clean, or the auditor is rubber-stamping. Manual spot-check needed.`);
  } else if (llmFindings.length > 30) {
    out.push(`  ⚠ ${llmFindings.length} LC.* findings — exceeds spec ceiling (~30 for Holloway). Likely over-flagging.`);
  } else if (llmFindings.length >= 5 && llmFindings.length <= 20) {
    out.push(`  ✓ ${llmFindings.length} LC.* findings is a plausible range for a complex plan; depends on whether they're real or noise (see verbatim above).`);
  } else {
    out.push(`  → ${llmFindings.length} LC.* findings — within reasonable range but read each one critically.`);
  }

  // LC.6 voice quality: should fire when score < 80
  const lc6Findings = r.findings.filter((f) => f.category === "LC6_voice_quality");
  if (r.llm_assessment) {
    const vScore = r.llm_assessment.voice_consistency_score;
    out.push(``);
    out.push(`Voice consistency score: ${vScore} / 100`);
    if (vScore >= 90) {
      out.push(`  ✓ Auditor scored plan voice as strong (≥ 90). Holloway plan should score here if Stage 4 prompt-tuning held.`);
    } else if (vScore >= 80) {
      out.push(`  → Auditor scored voice 80-89. Acceptable; review LC.6 findings for specifics.`);
    } else if (vScore >= 60) {
      out.push(`  ⚠ Auditor scored voice 60-79. Notable drift; expected at least 1 LC.6 warning finding.`);
      if (lc6Findings.length === 0) {
        out.push(`    ⚠ But 0 LC.6 findings emitted — auditor's score and findings are inconsistent.`);
      }
    } else {
      out.push(`  ❌ Auditor scored voice < 60. Significant regression; Stage 4 prompt-tuning may need revisit.`);
    }
  }

  // Strategic-coherence findings
  const lc3 = r.findings.filter((f) => f.category === "LC3_strategic_coherence");
  if (lc3.length > 0) {
    out.push(``);
    out.push(`LC.3 strategic_coherence findings: ${lc3.length}`);
    out.push(`  These flag recommendation pairs that work against each other.`);
    out.push(`  Critical to verify each one — false positives here erode advisor trust most.`);
  }

  // Numerical contradictions
  const lc2 = r.findings.filter((f) => f.category === "LC2_numerical_contradictions");
  if (lc2.length > 0) {
    out.push(``);
    out.push(`LC.2 numerical_contradictions findings: ${lc2.length}`);
    out.push(`  These flag cross-section number mismatches (different from DC.8 per-rec drift).`);
  }

  // Assessment disagreement
  if (r._flags.assessment_disagreement) {
    out.push(``);
    out.push(`⚠ ASSESSMENT DISAGREEMENT: harness=${r.overall_assessment}, LLM=${r.llm_assessment?.llm_overall_assessment}`);
    out.push(`  Harness verdict is authoritative. LLM's vote is captured for cross-check.`);
    out.push(`  Disagreement may indicate the LLM is over- or under-calibrated relative to the deterministic severity rules.`);
  }

  // Final verdict
  out.push(``);
  out.push(`--- Holistic verdict ---`);
  if (sev.critical === 0 && sev.warning <= 5 && (r.llm_assessment?.voice_consistency_score ?? 100) >= 80) {
    out.push(`✅ AUDITOR APPEARS USEFUL: clean DC layer, modest LC layer, healthy voice score. Read findings 1-${Math.min(5, r.findings.length)} above to confirm they're real not noise.`);
  } else if (sev.critical > 0) {
    out.push(`⚠️  AUDITOR FOUND CRITICAL ISSUES: ${sev.critical} critical finding(s). If these are real, Stage 4 has a regression. If they're false positives, calibrate severity mapping.`);
  } else if (sev.warning > 10) {
    out.push(`⚠️  HIGH WARNING COUNT: ${sev.warning} warnings — auditor may be over-flagging. Read 5+ verbatim before trusting.`);
  } else {
    out.push(`→ Mixed signals. Read top findings verbatim to judge whether the audit is catching real issues or producing noise.`);
  }

  return out;
}

function reportFailure(
  r: Stage5ResultFailed,
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
