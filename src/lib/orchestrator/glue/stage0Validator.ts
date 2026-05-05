import type Anthropic from "@anthropic-ai/sdk";
import type {
  CheckResult,
  Stage0ValidationResult,
  ValidationFailure,
} from "../schemas/stage0.types";
import { readFile } from "node:fs/promises";
import { computeFactReviewHash, extractFactReviewText } from "../utils/factReviewIO";
import { VOLATILE_RATES } from "../data/volatileRates";

// ────────────────────────────────────────────────────────────────────────
// Phase 10D.1 — Stage 0 reclassified as a diagnostic checkpoint.
//
// HARD failures (block submission with 422):
//   - file_integrity: file unreadable, empty, corrupt, wrong format,
//     extracted text suspiciously short.
//
// SOFT warnings (proceed to queue with 202; surfaced inline + on form):
//   - required_sections_present: known section header not detected
//   - required_field_markers: owner / entity / archetype not detected
//   - volatile_rates_freshness: rates more than 30 days stale
//   - content_hash: pure runtime integrity, never expected to fail
//
// Why? The advisor cannot edit Fact Reviews on the fly (Hayden has
// neither Word nor Adobe Acrobat). Real Fact Reviews don't always use
// PSA-canonical headers/labels. Stage 1's LLM is robust enough to
// extract structured data from messy real-world docs and infer
// archetype from context (per its system prompt's archetype rubric).
// Stage 1's Zod schema gates data correctness downstream.
//
// Phase 10D.2 — volatile-rates check no longer reads the KB markdown
// file. Reads the inlined VOLATILE_RATES constant in
// ../data/volatileRates.ts. Eliminates filesystem dependency on Vercel.
// ────────────────────────────────────────────────────────────────────────

const REQUIRED_SECTIONS: { label: string; alternatives: string[] }[] = [
  {
    label: "Section 1 / Engagement",
    alternatives: [
      "section 1",
      "engagement",
      "engagement metadata",
      "engagement scope",
      "client engagement",
      "scope",
      "scope of engagement",
    ],
  },
  {
    label: "Section 2 / Client and Family",
    alternatives: [
      "section 2",
      "client and family",
      "client & family",
      "household & family",
      "household and family",
      "household",
      "family",
      "personal information",
      "client information",
      "family overview",
    ],
  },
  {
    label: "Section 3 / Entities",
    alternatives: [
      "section 3",
      "entities",
      "entity",
      "business",
      "businesses",
      "the business",
      "primary business",
      "core business",
      "operating entities",
      "owned entities",
      "owned companies",
      "company structure",
      "business overview",
      "business entities",
      "company",
      "operating companies",
    ],
  },
  {
    label: "Section 5 / Personal Balance Sheet",
    alternatives: [
      "section 5",
      "personal balance sheet",
      "balance sheet",
      "net worth",
      "assets and liabilities",
      "assets & liabilities",
      "personal financial position",
      "household balance sheet",
      "personal assets",
    ],
  },
  {
    label: "Section 6 / Income",
    alternatives: [
      "section 6",
      "income",
      "compensation",
      "earnings",
      "income overview",
      "household income",
      "income sources",
      "annual income",
    ],
  },
  {
    label: "Section 11 / Transaction Posture",
    alternatives: [
      "section 11",
      "transaction posture",
      "transition posture",
      "exit posture",
      "transaction window",
      "liquidity posture",
      "exit timeline",
      "exit plans",
      "exit",
      "transition",
      "transaction plans",
      "sale plans",
      "liquidity event",
      "succession",
      "succession plan",
      "monetization",
    ],
  },
  {
    label: "Section 13 / Goals",
    alternatives: [
      "section 13",
      "goals",
      "client goals",
      "objectives",
      "priorities",
      "wishes",
      "intentions",
      "aspirations",
      "long-term goals",
      "financial goals",
    ],
  },
];

const ARCHETYPES = [
  "Pre-Exit",
  "Pre Exit",
  "Pre-exit",
  "pre-transaction",
  "pre-liquidity",
  "preliquidity",
  "pre liquidity",
  "Post-Exit",
  "Post Exit",
  "Post-exit",
  "post-transaction",
  "post-liquidity",
  "Active-No-Exit",
  "Active No Exit",
  "active operating",
  "no exit",
  "no transaction",
  "Family-Office",
  "Family Office",
  "single family office",
  "Pre-Liquidity-Founder",
  "Pre Liquidity Founder",
  "founder-led",
  "founding owner",
  "pre-IPO",
  "transaction posture:",
  "archetype:",
  "engagement archetype:",
];

const OWNER_NAME_LABELS = [
  "Primary Owner Name",
  "Primary Owner",
  "Owner Name",
  "First Name",
  "Full Legal Name",
  "Legal Name",
  "Full Name",
  "Client Name",
  "Primary Client",
  "Husband Name",
  "Wife Name",
  "Spouse 1 Name",
  "Spouse 2 Name",
  "Member 1",
  "Member 2",
  "Name",
];

const ENTITY_NAME_LABELS = [
  "Legal Entity Name",
  "Entity Name",
  "Legal Name",
  "Company Name",
  "Business Name",
  "Operating Entity",
  "Operating Company",
  "Holding Company",
  "Holdco Name",
  "Holdco",
  "Corporation Name",
  "LLC Name",
  "S-Corp Name",
  "DBA",
  "Trade Name",
  "Entity",
  "Business",
];

// ────────────────────────────────────────────────────────────────────────
// LLM fallback — Haiku 4.5
// ────────────────────────────────────────────────────────────────────────

const LLM_FALLBACK_MODEL = "claude-haiku-4-5";
const LLM_FALLBACK_MAX_TOKENS = 1024;
const LLM_FALLBACK_FR_TEXT_LIMIT = 30000;
const LLM_FALLBACK_HARD_CAP_CENTS = 200;
const HAIKU_INPUT_CENTS_PER_M = 100;
const HAIKU_OUTPUT_CENTS_PER_M = 500;

export interface Stage0LlmApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}

interface LlmFallbackExtraction {
  found_section_labels: string[];
  primary_owner_name: string | null;
  entity_name: string | null;
  archetype: string | null;
  cost_cents: number;
  raw_response: string | null;
  failed_reason?: string;
}

function buildFallbackUserTurn(
  text: string,
  missingSectionLabels: string[],
  needOwner: boolean,
  needEntity: boolean,
  needArchetype: boolean,
): string {
  const truncated = text.slice(0, LLM_FALLBACK_FR_TEXT_LIMIT);
  const labelsList = missingSectionLabels.length > 0
    ? missingSectionLabels.map((l) => `- "${l}"`).join("\n")
    : "(none)";
  const fields: string[] = [];
  if (needOwner) fields.push("primary_owner_name");
  if (needEntity) fields.push("entity_name");
  if (needArchetype) fields.push("archetype");

  return [
    "You are extracting structured data from a PSA Wealth Fact Review document. Real-world Fact Reviews use varied section headers and field labels. You must determine, for each requested item, whether the document contains content that semantically matches it. DO NOT mark something as found unless the document actually discusses that topic.",
    "",
    "DOCUMENT TEXT (truncated to first 30000 chars):",
    "<fact_review>",
    truncated,
    "</fact_review>",
    "",
    "TASKS:",
    "",
    `1. For each of these required section labels, decide whether the document contains a section discussing that topic (under any header wording). Return only the labels that ARE present:`,
    "",
    labelsList,
    "",
    `2. Extract these field values when present (return null if not findable):`,
    fields.length > 0 ? fields.map((f) => `   - ${f}`).join("\n") : "   (none)",
    "",
    "ARCHETYPE — if not labeled explicitly, INFER from context. The archetype reflects the client's primary status:",
    " - Pre-Exit: business owner working toward a sale / liquidity event in the next ~5 years.",
    " - Post-Exit: liquidity already happened; client now manages the proceeds.",
    " - Active-No-Exit: business owner with no near-term exit plans; long-term operation.",
    " - Family-Office: dedicated entity managing wealth across multiple generations / branches.",
    " - Pre-Liquidity-Founder: still building the business; first major liquidity event has not occurred (often pre-IPO / pre-Series-B founders).",
    "Choose the closest fit. Return null only if you cannot make a reasonable inference from any context in the document.",
    "",
    "RESPONSE FORMAT — output ONLY a JSON object, no preamble, no commentary, no markdown code fences:",
    "",
    `{`,
    `  "found_section_labels": [...],   // subset of the labels above`,
    `  "primary_owner_name": "..." or null,`,
    `  "entity_name": "..." or null,`,
    `  "archetype": "Pre-Exit" | "Post-Exit" | "Active-No-Exit" | "Family-Office" | "Pre-Liquidity-Founder" | null`,
    `}`,
  ].join("\n");
}

function computeHaikuCost(inputTokens: number, outputTokens: number): number {
  const millicentsPerToken = (centsPerM: number) => centsPerM / 1000;
  const cents =
    inputTokens * millicentsPerToken(HAIKU_INPUT_CENTS_PER_M) +
    outputTokens * millicentsPerToken(HAIKU_OUTPUT_CENTS_PER_M);
  return Math.round(cents / 1000);
}

async function runLlmFallbackExtraction(
  client: Stage0LlmApiClient,
  text: string,
  missingSectionLabels: string[],
  needOwner: boolean,
  needEntity: boolean,
  needArchetype: boolean,
): Promise<LlmFallbackExtraction> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: LLM_FALLBACK_MODEL,
    max_tokens: LLM_FALLBACK_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildFallbackUserTurn(
          text,
          missingSectionLabels,
          needOwner,
          needEntity,
          needArchetype,
        ),
      },
    ],
  };

  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create(params);
  } catch (e) {
    return {
      found_section_labels: [],
      primary_owner_name: null,
      entity_name: null,
      archetype: null,
      cost_cents: 0,
      raw_response: null,
      failed_reason: `Haiku fallback API error: ${(e as Error).message}`,
    };
  }

  const cost = computeHaikuCost(
    msg.usage?.input_tokens ?? 0,
    msg.usage?.output_tokens ?? 0,
  );
  if (cost > LLM_FALLBACK_HARD_CAP_CENTS) {
    return {
      found_section_labels: [],
      primary_owner_name: null,
      entity_name: null,
      archetype: null,
      cost_cents: cost,
      raw_response: null,
      failed_reason: `Haiku fallback cost ${cost}c exceeded cap ${LLM_FALLBACK_HARD_CAP_CENTS}c`,
    };
  }

  const responseText = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      found_section_labels: [],
      primary_owner_name: null,
      entity_name: null,
      archetype: null,
      cost_cents: cost,
      raw_response: responseText,
      failed_reason: `Haiku fallback JSON parse failed: ${(e as Error).message}`,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const foundLabels = Array.isArray(obj.found_section_labels)
    ? (obj.found_section_labels as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const ownerName = typeof obj.primary_owner_name === "string" ? obj.primary_owner_name : null;
  const entityName = typeof obj.entity_name === "string" ? obj.entity_name : null;
  const archetype = typeof obj.archetype === "string" ? obj.archetype : null;

  return {
    found_section_labels: foundLabels,
    primary_owner_name: ownerName && ownerName.trim().length > 0 ? ownerName.trim() : null,
    entity_name: entityName && entityName.trim().length > 0 ? entityName.trim() : null,
    archetype: archetype && archetype.trim().length > 0 ? archetype.trim() : null,
    cost_cents: cost,
    raw_response: responseText,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function emptyResult(filePath: string): Stage0ValidationResult {
  const skipped = (): CheckResult => ({ status: "skipped", details: "not run" });
  return {
    status: "failed",
    validated_at: new Date().toISOString(),
    source_file_path: filePath,
    source_fr_content_hash: "",
    checks: {
      file_integrity: skipped(),
      required_sections_present: skipped(),
      required_field_markers: skipped(),
      volatile_rates_freshness: skipped(),
      content_hash: skipped(),
    },
    flags: {
      volatile_rates_stale: false,
      text_length_suspicious: false,
      additional: {},
    },
    failures: [],
    warnings: [],
    extracted_text_length: 0,
    extracted_text_preview: "",
  };
}

function findLabeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inline = new RegExp(`${escaped}\\s*[:\\-]\\s*([^\\n\\r]{1,200})`, "i");
    const m1 = text.match(inline);
    if (m1 && m1[1].trim().length > 0) return m1[1].trim();
    const block = new RegExp(`${escaped}\\s*\\n+\\s*([^\\n\\r]{1,200})`, "i");
    const m2 = text.match(block);
    if (m2 && m2[1].trim().length > 0) return m2[1].trim();
  }
  return null;
}

// HARD-fail path. Empty / suspiciously short / unreadable extraction means
// the upload is not actually a Fact Review (template stub, garbage file,
// extraction-failed PDF, etc.). Stage 1 cannot recover from this.
function checkFileIntegrity(text: string): { check: CheckResult; suspicious: boolean; failure?: ValidationFailure } {
  if (text.length === 0) {
    return {
      check: { status: "failed", details: "Extracted text is empty (0 chars)" },
      suspicious: false,
      failure: {
        check: "file_integrity",
        reason: "Mammoth/pdf-parse extracted 0 characters from the upload",
        remediation: "Verify the file is a valid Word document or text-based PDF with content. Image-only / scanned PDFs require OCR (out of scope). Re-export from Word or pick a different format.",
      },
    };
  }
  if (text.length < 2000) {
    return {
      check: {
        status: "failed",
        details: `Extracted text length ${text.length} is suspiciously low (<2000 chars)`,
      },
      suspicious: true,
      failure: {
        check: "file_integrity",
        reason: `Extracted text is only ${text.length} characters; expected a fully populated Fact Review (>5000 chars typical)`,
        remediation: "Confirm the upload is the completed Fact Review, not a template stub or partial draft.",
      },
    };
  }
  if (text.length < 5000) {
    return {
      check: {
        status: "warning",
        details: `Extracted text length ${text.length} is below typical (>5000 chars); proceeding with flag set`,
      },
      suspicious: true,
    };
  }
  return {
    check: { status: "passed", details: `Extracted ${text.length} chars from upload` },
    suspicious: false,
  };
}

interface DeterministicSectionResult {
  missingLabels: string[];
}

function deterministicCheckSections(text: string): DeterministicSectionResult {
  const lower = text.toLowerCase();
  const missing: string[] = [];
  for (const { label, alternatives } of REQUIRED_SECTIONS) {
    const found = alternatives.some((alt) => lower.includes(alt.toLowerCase()));
    if (!found) missing.push(label);
  }
  return { missingLabels: missing };
}

interface DeterministicFieldResult {
  ownerName: string | null;
  entityName: string | null;
  archetype: string | null;
}

function deterministicCheckFields(text: string): DeterministicFieldResult {
  const ownerName = findLabeledValue(text, OWNER_NAME_LABELS);
  const entityName = findLabeledValue(text, ENTITY_NAME_LABELS);
  const lower = text.toLowerCase();
  const archetype = ARCHETYPES.find((a) => lower.includes(a.toLowerCase())) ?? null;
  return { ownerName, entityName, archetype };
}

// SOFT path — checks freshness against the inlined VOLATILE_RATES constant
// (Phase 10D.2). No filesystem read; runs identically on Vercel and on
// Hayden's laptop.
function checkVolatileRatesFreshness(
  referenceDate: Date,
): { check: CheckResult; stale: boolean; warning?: string } {
  const refreshDate = new Date(VOLATILE_RATES.last_refreshed_iso + "T00:00:00Z");
  if (Number.isNaN(refreshDate.getTime())) {
    return {
      check: { status: "warning", details: `VOLATILE_RATES.last_refreshed_iso unparseable: "${VOLATILE_RATES.last_refreshed_iso}"` },
      stale: false,
      warning: `Inlined volatile-rates last-refreshed date is malformed; freshness could not be verified.`,
    };
  }
  const ageMs = referenceDate.getTime() - refreshDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays > 30) {
    return {
      check: {
        status: "warning",
        details: `Volatile rates ${ageDays} days old (refreshed ${VOLATILE_RATES.last_refreshed_iso}, threshold 30 days)`,
      },
      stale: true,
      warning: `Volatile rates last refreshed ${ageDays} days ago (${VOLATILE_RATES.last_refreshed_iso}). Refresh src/lib/orchestrator/data/volatileRates.ts and the KB markdown before next plan run if rates have moved materially.`,
    };
  }
  return {
    check: { status: "passed", details: `Volatile rates refreshed ${ageDays} days ago (${VOLATILE_RATES.last_refreshed_iso})` },
    stale: false,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function validateFactReview(
  filePath: string,
  options: {
    referenceDate?: Date;
    apiClient?: Stage0LlmApiClient;
  } = {},
): Promise<Stage0ValidationResult> {
  const result = emptyResult(filePath);
  const referenceDate = options.referenceDate ?? new Date();

  let extractedText = "";

  try {
    // ──────────────────────────────────────────────────────────────────
    // HARD GATE — file integrity
    // ──────────────────────────────────────────────────────────────────
    try {
      await readFile(filePath);
    } catch (err) {
      result.checks.file_integrity = {
        status: "failed",
        details: `Could not read file: ${(err as Error).message}`,
      };
      result.failures.push({
        check: "file_integrity",
        reason: `File not readable at path: ${filePath}`,
        remediation: "Verify the file path is correct and the file is accessible.",
      });
      result.status = "failed";
      return result;
    }

    try {
      const extraction = await extractFactReviewText(filePath);
      extractedText = extraction.text;
    } catch (err) {
      result.checks.file_integrity = {
        status: "failed",
        details: `Extractor (mammoth/pdf-parse) could not extract text: ${(err as Error).message}`,
      };
      result.failures.push({
        check: "file_integrity",
        reason: `Text extraction failed: ${(err as Error).message}`,
        remediation: "Confirm the file is a valid .docx or text-based .pdf (not corrupted, password-protected, or image-only).",
      });
      result.status = "failed";
      return result;
    }

    result.extracted_text_length = extractedText.length;
    result.extracted_text_preview = extractedText.slice(0, 500);

    const integrity = checkFileIntegrity(extractedText);
    result.checks.file_integrity = integrity.check;
    result.flags.text_length_suspicious = integrity.suspicious;
    if (integrity.failure) {
      result.failures.push(integrity.failure);
      result.status = "failed";
      return result;
    }

    // ──────────────────────────────────────────────────────────────────
    // SOFT CHECKS — emit warnings, do NOT fail.
    // ──────────────────────────────────────────────────────────────────
    const dSections = deterministicCheckSections(extractedText);
    const dFields = deterministicCheckFields(extractedText);

    const needLlmForSections = dSections.missingLabels.length > 0;
    const needLlmForOwner = dFields.ownerName === null;
    const needLlmForEntity = dFields.entityName === null;
    const needLlmForArchetype = dFields.archetype === null;
    const needLlm =
      needLlmForSections || needLlmForOwner || needLlmForEntity || needLlmForArchetype;

    let llmExtraction: LlmFallbackExtraction | null = null;
    if (needLlm && options.apiClient) {
      llmExtraction = await runLlmFallbackExtraction(
        options.apiClient,
        extractedText,
        dSections.missingLabels,
        needLlmForOwner,
        needLlmForEntity,
        needLlmForArchetype,
      );
      if (llmExtraction.failed_reason) {
        result.warnings.push(`Stage 0 LLM fallback did not complete cleanly: ${llmExtraction.failed_reason}`);
      } else {
        const sectionsResolved = llmExtraction.found_section_labels.length;
        const fieldsResolved = [
          llmExtraction.primary_owner_name !== null ? "owner" : null,
          llmExtraction.entity_name !== null ? "entity" : null,
          llmExtraction.archetype ? `archetype=${llmExtraction.archetype}` : null,
        ]
          .filter((s): s is string => !!s)
          .join(", ");
        result.warnings.push(
          `Stage 0 LLM fallback resolved gaps: ${sectionsResolved}/${dSections.missingLabels.length} sections, fields: ${fieldsResolved || "none"} (cost ${llmExtraction.cost_cents}c)`,
        );
        result.flags.additional.stage0_llm_fallback_cost_cents = llmExtraction.cost_cents;
      }
    }

    // Sections — soft check.
    const stillMissingSections = dSections.missingLabels.filter(
      (label) => !llmExtraction?.found_section_labels.includes(label),
    );
    if (stillMissingSections.length === 0) {
      result.checks.required_sections_present = {
        status: "passed",
        details:
          dSections.missingLabels.length === 0
            ? `All ${REQUIRED_SECTIONS.length} required sections present (deterministic match)`
            : `All ${REQUIRED_SECTIONS.length} required sections present (${dSections.missingLabels.length} resolved by LLM fallback)`,
      };
    } else {
      result.checks.required_sections_present = {
        status: "warning",
        details: `Could not detect ${stillMissingSections.length} expected section(s): ${stillMissingSections.join("; ")}. Stage 1 will attempt to parse anyway.`,
      };
      for (const m of stillMissingSections) {
        result.warnings.push(
          `Section heuristic missed "${m}" — Stage 1 (LLM parser) will attempt to extract this content from context.`,
        );
      }
    }

    // Fields — soft check.
    const finalOwner = dFields.ownerName ?? llmExtraction?.primary_owner_name ?? null;
    const finalEntity = dFields.entityName ?? llmExtraction?.entity_name ?? null;
    const finalArchetype = dFields.archetype ?? llmExtraction?.archetype ?? null;

    const fieldGaps: string[] = [];
    if (!finalOwner) fieldGaps.push("primary owner first name");
    if (!finalEntity) fieldGaps.push("entity legal name");
    if (!finalArchetype) fieldGaps.push("engagement archetype");

    if (fieldGaps.length === 0) {
      result.checks.required_field_markers = {
        status: "passed",
        details: `Owner="${finalOwner}", Entity="${finalEntity}", Archetype="${finalArchetype}"${llmExtraction && (!dFields.ownerName || !dFields.entityName || !dFields.archetype) ? " (some fields resolved by LLM fallback)" : ""}`,
      };
    } else {
      result.checks.required_field_markers = {
        status: "warning",
        details: `Could not detect ${fieldGaps.length} expected field(s): ${fieldGaps.join("; ")}. Stage 1 (LLM parser) has explicit guidance to infer archetype from context and to extract names from any explicit or implicit reference.`,
      };
      for (const g of fieldGaps) {
        result.warnings.push(
          `Field heuristic missed ${g} — Stage 1 will attempt to extract / infer this. If Stage 1 also cannot recover, the plan will fail at Stage 1's ClientProfile schema validation with a precise diagnostic.`,
        );
      }
    }

    // Volatile rates — soft check (now from inlined constant).
    const rates = checkVolatileRatesFreshness(referenceDate);
    result.checks.volatile_rates_freshness = rates.check;
    if (rates.warning) result.warnings.push(rates.warning);
    result.flags.volatile_rates_stale = rates.stale;

    // Content hash — runtime safety; should never fail.
    try {
      const hash = computeFactReviewHash(extractedText);
      result.source_fr_content_hash = hash;
      result.checks.content_hash = {
        status: "passed",
        details: `SHA-256 computed (${hash.slice(0, 12)}…)`,
      };
    } catch (err) {
      result.checks.content_hash = {
        status: "warning",
        details: `Hashing failed: ${(err as Error).message}`,
      };
      result.warnings.push(
        `Content hashing failed: ${(err as Error).message}. Provenance hash will be empty in metadata.`,
      );
    }

    // Compute final status. Only file_integrity contributes to "failed".
    // Everything else is at most a warning.
    const checkStatuses = Object.values(result.checks).map((c) => c.status);
    if (result.checks.file_integrity.status === "failed") {
      result.status = "failed";
    } else if (
      checkStatuses.includes("warning") ||
      result.warnings.length > 0
    ) {
      result.status = "passed_with_warnings";
    } else {
      result.status = "passed";
    }
    return result;
  } catch (err) {
    // Truly unexpected error — log as warning, return failed integrity to be safe.
    result.checks.file_integrity = {
      status: "failed",
      details: `Unexpected validator error: ${(err as Error).message}`,
    };
    result.failures.push({
      check: "unknown",
      reason: `Unexpected error in validator: ${(err as Error).message}`,
      remediation: "File a bug report; the validator should never reach this branch.",
    });
    result.status = "failed";
    return result;
  }
}
