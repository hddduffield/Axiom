import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  CheckResult,
  Stage0ValidationResult,
  ValidationFailure,
} from "../schemas/stage0.types";
import { readFile } from "node:fs/promises";
import { computeFactReviewHash, extractFactReviewText } from "../utils/factReviewIO";

const DEFAULT_VOLATILE_RATES_PATH = "kb/v1_2/02_reference/08_volatile_rates_lookup.md";

// ────────────────────────────────────────────────────────────────────────
// Phase 10C.2 — Permissive deterministic matching
// ────────────────────────────────────────────────────────────────────────
//
// First production live test surfaced that real PSA Fact Reviews don't
// always follow the exact "Section 3 / Entities" header convention or use
// "Primary Owner Name" as the literal label. Stage 0's job is to confirm
// the upload IS a Fact Review (format check) — not to validate every
// field is correctly populated (Stage 1's job).
//
// Strategy: comprehensive alternative lists for deterministic matching
// + a Haiku 4.5 LLM fallback that fires only when deterministic finds
// gaps. Costs $0 most of the time; ~$0.01-0.05 per fallback invocation.

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
  // Looser standalone words — lowercase comparison; need to be careful
  // these don't match noise.
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
const LLM_FALLBACK_FR_TEXT_LIMIT = 30000; // chars (~7500 tokens)

// Hard per-Stage-0 LLM cost cap. Haiku 4.5 input is ~$1/MTok, output ~$5/MTok;
// a typical fallback (~7500 in / 200 out) costs ~1c. The cap below catches
// unexpected runaway behavior.
const LLM_FALLBACK_HARD_CAP_CENTS = 200;
const HAIKU_INPUT_CENTS_PER_M = 100;   // $1.00/MTok
const HAIKU_OUTPUT_CENTS_PER_M = 500;  // $5.00/MTok

export interface Stage0LlmApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}

interface LlmFallbackExtraction {
  found_section_labels: string[]; // subset of REQUIRED_SECTIONS labels
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
    "ARCHETYPE values must be one of: Pre-Exit, Post-Exit, Active-No-Exit, Family-Office, Pre-Liquidity-Founder. Choose the closest fit based on the client's current business / liquidity status. Return null if no clear match.",
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
    // Strip markdown fences if Haiku ignored the "no fences" instruction.
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
    // Match "Label: value" on same line, OR "Label\n value" on the next non-empty line.
    const inline = new RegExp(`${escaped}\\s*[:\\-]\\s*([^\\n\\r]{1,200})`, "i");
    const m1 = text.match(inline);
    if (m1 && m1[1].trim().length > 0) return m1[1].trim();
    const block = new RegExp(`${escaped}\\s*\\n+\\s*([^\\n\\r]{1,200})`, "i");
    const m2 = text.match(block);
    if (m2 && m2[1].trim().length > 0) return m2[1].trim();
  }
  return null;
}

function checkFileIntegrity(text: string): { check: CheckResult; suspicious: boolean; failure?: ValidationFailure } {
  if (text.length === 0) {
    return {
      check: { status: "failed", details: "Extracted text is empty (0 chars)" },
      suspicious: false,
      failure: {
        check: "file_integrity",
        reason: "Mammoth extracted 0 characters from the .docx",
        remediation: "Verify the file is a valid Word document with content. Re-export from Word if necessary.",
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
        remediation: "Confirm the .docx is the completed Fact Review, not a template stub.",
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
    check: { status: "passed", details: `Extracted ${text.length} chars from .docx` },
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

async function checkVolatileRatesFreshness(
  ratesPath: string,
  referenceDate: Date,
): Promise<{ check: CheckResult; stale: boolean; failure?: ValidationFailure; warning?: string }> {
  let contents: string;
  try {
    contents = await readFile(ratesPath, "utf8");
  } catch (err) {
    return {
      check: {
        status: "failed",
        details: `Could not read volatile rates file at ${ratesPath}: ${(err as Error).message}`,
      },
      stale: false,
      failure: {
        check: "volatile_rates_freshness",
        reason: `Volatile rates file unreadable: ${ratesPath}`,
        remediation: `Confirm the file exists at ${ratesPath} and is readable.`,
      },
    };
  }

  const isoLine = contents
    .split("\n")
    .find((line) => /(?:Last refreshed|Snapshot date)/i.test(line) && /\d{4}-\d{2}-\d{2}/.test(line));
  if (!isoLine) {
    return {
      check: {
        status: "warning",
        details: 'No ISO date found on a "Last refreshed" or "Snapshot date" line; rates file may not have date populated yet',
      },
      stale: false,
      warning: "Volatile rates file has no parseable ISO date — freshness could not be verified.",
    };
  }
  const match = isoLine.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return {
      check: { status: "warning", details: "Date line found but no ISO date matched" },
      stale: false,
      warning: "Volatile rates date present but not in ISO YYYY-MM-DD form.",
    };
  }
  const refreshDate = new Date(match[1] + "T00:00:00Z");
  if (Number.isNaN(refreshDate.getTime())) {
    return {
      check: { status: "warning", details: `Unparseable date "${match[1]}"` },
      stale: false,
      warning: `Volatile rates date "${match[1]}" could not be parsed.`,
    };
  }
  const ageMs = referenceDate.getTime() - refreshDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays > 45) {
    return {
      check: {
        status: "failed",
        details: `Volatile rates expired: refreshed ${ageDays} days ago (threshold 45 days)`,
      },
      stale: false,
      failure: {
        check: "volatile_rates_freshness",
        reason: `Volatile rates file last refreshed ${ageDays} days ago (>45 day threshold)`,
        remediation: `Refresh ${ratesPath} with the current month's IRS Rev. Rul. rates and update the "Last refreshed" date.`,
      },
    };
  }
  if (ageDays > 30) {
    return {
      check: {
        status: "warning",
        details: `Volatile rates stale: refreshed ${ageDays} days ago (warning threshold 30 days)`,
      },
      stale: true,
      warning: `Volatile rates last refreshed ${ageDays} days ago — refresh recommended before next plan run.`,
    };
  }
  return {
    check: { status: "passed", details: `Volatile rates refreshed ${ageDays} days ago` },
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
    volatileRatesPath?: string;
    apiClient?: Stage0LlmApiClient;
  } = {},
): Promise<Stage0ValidationResult> {
  const result = emptyResult(filePath);
  const referenceDate = options.referenceDate ?? new Date();
  const ratesPath = options.volatileRatesPath ?? path.resolve(DEFAULT_VOLATILE_RATES_PATH);

  let extractedText = "";

  try {
    try {
      // Probe readability first so we can distinguish "file missing" from
      // "valid file but mammoth couldn't parse" with clean failure context.
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
      const rates = await checkVolatileRatesFreshness(ratesPath, referenceDate);
      result.checks.volatile_rates_freshness = rates.check;
      if (rates.failure) result.failures.push(rates.failure);
      if (rates.warning) result.warnings.push(rates.warning);
      result.flags.volatile_rates_stale = rates.stale;
      return result;
    }

    try {
      const extraction = await extractFactReviewText(filePath);
      extractedText = extraction.text;
    } catch (err) {
      result.checks.file_integrity = {
        status: "failed",
        details: `mammoth could not extract text: ${(err as Error).message}`,
      };
      result.failures.push({
        check: "file_integrity",
        reason: `Mammoth failed to parse the .docx: ${(err as Error).message}`,
        remediation: "Confirm the file is a valid .docx (not corrupted, password-protected, or a different format).",
      });
      result.status = "failed";
      const rates = await checkVolatileRatesFreshness(ratesPath, referenceDate);
      result.checks.volatile_rates_freshness = rates.check;
      if (rates.failure) result.failures.push(rates.failure);
      if (rates.warning) result.warnings.push(rates.warning);
      result.flags.volatile_rates_stale = rates.stale;
      return result;
    }

    result.extracted_text_length = extractedText.length;
    result.extracted_text_preview = extractedText.slice(0, 500);

    const integrity = checkFileIntegrity(extractedText);
    result.checks.file_integrity = integrity.check;
    result.flags.text_length_suspicious = integrity.suspicious;
    if (integrity.failure) result.failures.push(integrity.failure);

    if (integrity.check.status === "failed") {
      const rates = await checkVolatileRatesFreshness(ratesPath, referenceDate);
      result.checks.volatile_rates_freshness = rates.check;
      if (rates.failure) result.failures.push(rates.failure);
      if (rates.warning) result.warnings.push(rates.warning);
      result.flags.volatile_rates_stale = rates.stale;
      result.status = "failed";
      return result;
    }

    // Phase 10C.2 — deterministic-first, then LLM fallback for misses.
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
        result.warnings.push(`LLM fallback for Stage 0 did not complete cleanly: ${llmExtraction.failed_reason}`);
      } else {
        result.warnings.push(
          `LLM fallback resolved Stage 0 gaps: sections found=${llmExtraction.found_section_labels.length}/${dSections.missingLabels.length}, owner=${llmExtraction.primary_owner_name !== null ? "found" : "miss"}, entity=${llmExtraction.entity_name !== null ? "found" : "miss"}, archetype=${llmExtraction.archetype ?? "miss"} (cost ${llmExtraction.cost_cents}c)`,
        );
        result.flags.additional.stage0_llm_fallback_cost_cents = llmExtraction.cost_cents;
      }
    }

    // Resolve final state for sections.
    const stillMissingSections = dSections.missingLabels.filter(
      (label) => !llmExtraction?.found_section_labels.includes(label),
    );
    const sectionsCheck: CheckResult = stillMissingSections.length === 0
      ? {
          status: "passed",
          details:
            dSections.missingLabels.length === 0
              ? `All ${REQUIRED_SECTIONS.length} required sections present (deterministic match)`
              : `All ${REQUIRED_SECTIONS.length} required sections present (${dSections.missingLabels.length} resolved by LLM fallback)`,
        }
      : {
          status: "failed",
          details: `Missing ${stillMissingSections.length} required section(s) after deterministic + LLM fallback: ${stillMissingSections.join("; ")}`,
        };
    result.checks.required_sections_present = sectionsCheck;
    if (stillMissingSections.length > 0) {
      for (const m of stillMissingSections) {
        const sec = REQUIRED_SECTIONS.find((s) => s.label === m);
        const altList = sec?.alternatives.slice(0, 8).join(", ") ?? "(see source)";
        result.failures.push({
          check: "required_sections_present",
          reason: `Required section not found: ${m}`,
          remediation: `Stage 0 looked for any of these (case-insensitive): ${altList}. Add a header matching one of these to the Fact Review.`,
        });
      }
    }

    // Resolve final state for fields.
    const finalOwner = dFields.ownerName ?? llmExtraction?.primary_owner_name ?? null;
    const finalEntity = dFields.entityName ?? llmExtraction?.entity_name ?? null;
    const finalArchetype = dFields.archetype ?? llmExtraction?.archetype ?? null;

    const fieldFailures: ValidationFailure[] = [];
    if (!finalOwner) {
      fieldFailures.push({
        check: "required_field_markers",
        reason: "Primary owner first name not found",
        remediation: `Stage 0 looked for any of these labels (case-insensitive): ${OWNER_NAME_LABELS.slice(0, 8).join(", ")}. Add a labeled field with one of these names, or include the owner's name on a single line as "Name: <Full Name>".`,
      });
    }
    if (!finalEntity) {
      fieldFailures.push({
        check: "required_field_markers",
        reason: "Entity legal name not found",
        remediation: `Stage 0 looked for any of these labels (case-insensitive): ${ENTITY_NAME_LABELS.slice(0, 8).join(", ")}. Add a labeled field with one of these names, or include the entity's legal name on a single line as "Company Name: <Legal Entity>".`,
      });
    }
    if (!finalArchetype) {
      fieldFailures.push({
        check: "required_field_markers",
        reason: "Engagement archetype not detected",
        remediation: `Stage 0 looked for one of: Pre-Exit, Post-Exit, Active-No-Exit, Family-Office, Pre-Liquidity-Founder (case-insensitive, plus loose variants). Add an explicit "Archetype: <value>" line, or describe the client's business / liquidity status in clearer terms (pre-transaction, post-transaction, active-operating, family-office, founder-led).`,
      });
    }
    const fieldsCheck: CheckResult = fieldFailures.length === 0
      ? {
          status: "passed",
          details: `Owner="${finalOwner}", Entity="${finalEntity}", Archetype="${finalArchetype}"${llmExtraction && (!dFields.ownerName || !dFields.entityName || !dFields.archetype) ? " (some fields resolved by LLM fallback)" : ""}`,
        }
      : {
          status: "failed",
          details: `Missing ${fieldFailures.length} required field marker(s) after deterministic + LLM fallback`,
        };
    result.checks.required_field_markers = fieldsCheck;
    result.failures.push(...fieldFailures);

    const rates = await checkVolatileRatesFreshness(ratesPath, referenceDate);
    result.checks.volatile_rates_freshness = rates.check;
    if (rates.failure) result.failures.push(rates.failure);
    if (rates.warning) result.warnings.push(rates.warning);
    result.flags.volatile_rates_stale = rates.stale;

    try {
      const hash = computeFactReviewHash(extractedText);
      result.source_fr_content_hash = hash;
      result.checks.content_hash = {
        status: "passed",
        details: `SHA-256 computed (${hash.slice(0, 12)}…)`,
      };
    } catch (err) {
      result.checks.content_hash = {
        status: "failed",
        details: `Hashing failed: ${(err as Error).message}`,
      };
      result.failures.push({
        check: "content_hash",
        reason: `Could not compute SHA-256 of extracted text: ${(err as Error).message}`,
        remediation: "Investigate the Node crypto runtime; this should never fail in normal environments.",
      });
    }

    const checkStatuses = Object.values(result.checks).map((c) => c.status);
    if (checkStatuses.includes("failed")) {
      result.status = "failed";
    } else if (checkStatuses.includes("warning")) {
      result.status = "passed_with_warnings";
    } else {
      result.status = "passed";
    }
    return result;
  } catch (err) {
    result.failures.push({
      check: "unknown",
      reason: `Unexpected error in validator: ${(err as Error).message}`,
      remediation: "File a bug report; the validator should never reach this branch.",
    });
    result.status = "failed";
    return result;
  }
}
