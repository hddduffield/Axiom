import * as path from "node:path";
import type {
  CheckResult,
  Stage0ValidationResult,
  ValidationFailure,
} from "../schemas/stage0.types";
import { readFile } from "node:fs/promises";
import { computeFactReviewHash, extractFactReviewText } from "../utils/factReviewIO";

const DEFAULT_VOLATILE_RATES_PATH = "kb/v1_2/02_reference/08_volatile_rates_lookup.md";

const REQUIRED_SECTIONS: { label: string; alternatives: string[] }[] = [
  { label: "Section 1 / Engagement", alternatives: ["Section 1", "Engagement"] },
  {
    label: "Section 2 / Client and Family",
    alternatives: ["Section 2", "Client and Family", "Household & Family", "Household and Family"],
  },
  { label: "Section 3 / Entities", alternatives: ["Section 3", "Entities"] },
  { label: "Section 5 / Personal Balance Sheet", alternatives: ["Section 5", "Personal Balance Sheet"] },
  { label: "Section 6 / Income", alternatives: ["Section 6", "Income"] },
  {
    label: "Section 11 / Transaction Posture",
    alternatives: ["Section 11", "Transaction Posture", "Transition Posture"],
  },
  { label: "Section 13 / Goals", alternatives: ["Section 13", "Goals"] },
];

const ARCHETYPES = [
  "Pre-Exit",
  "Post-Exit",
  "Active-No-Exit",
  "Family-Office",
  "Pre-Liquidity-Founder",
];

const OWNER_NAME_LABELS = ["Primary Owner Name", "First Name", "Full Legal Name"];
const ENTITY_NAME_LABELS = ["Legal Entity Name", "Entity Name", "Legal Name"];

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

function checkRequiredSections(text: string): { check: CheckResult; failures: ValidationFailure[] } {
  const lower = text.toLowerCase();
  const missing: string[] = [];
  for (const { label, alternatives } of REQUIRED_SECTIONS) {
    const found = alternatives.some((alt) => lower.includes(alt.toLowerCase()));
    if (!found) missing.push(label);
  }
  if (missing.length === 0) {
    return {
      check: { status: "passed", details: `All ${REQUIRED_SECTIONS.length} required sections present` },
      failures: [],
    };
  }
  return {
    check: {
      status: "failed",
      details: `Missing ${missing.length} required section(s): ${missing.join("; ")}`,
    },
    failures: missing.map((m) => ({
      check: "required_sections_present",
      reason: `Required section not found: ${m}`,
      remediation: `Add a section header matching one of the accepted alternatives for "${m}" to the Fact Review.`,
    })),
  };
}

function checkRequiredFieldMarkers(text: string): { check: CheckResult; failures: ValidationFailure[] } {
  const failures: ValidationFailure[] = [];

  const ownerName = findLabeledValue(text, OWNER_NAME_LABELS);
  if (!ownerName) {
    failures.push({
      check: "required_field_markers",
      reason: "Primary owner first name not found",
      remediation: `Populate one of the following labeled fields with the owner's name: ${OWNER_NAME_LABELS.join(", ")}.`,
    });
  }

  const entityName = findLabeledValue(text, ENTITY_NAME_LABELS);
  if (!entityName) {
    failures.push({
      check: "required_field_markers",
      reason: "Entity legal name not found",
      remediation: `Populate one of the following labeled fields with the entity's legal name: ${ENTITY_NAME_LABELS.join(", ")}.`,
    });
  }

  const archetypeFound = ARCHETYPES.find((a) => text.includes(a));
  if (!archetypeFound) {
    failures.push({
      check: "required_field_markers",
      reason: "Engagement archetype not detected",
      remediation: `Ensure one of these archetype labels appears verbatim in the document: ${ARCHETYPES.join(", ")}.`,
    });
  }

  if (failures.length === 0) {
    return {
      check: {
        status: "passed",
        details: `Owner="${ownerName}", Entity="${entityName}", Archetype="${archetypeFound}"`,
      },
      failures: [],
    };
  }
  return {
    check: {
      status: "failed",
      details: `Missing ${failures.length} required field marker(s)`,
    },
    failures,
  };
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

export async function validateFactReview(
  filePath: string,
  options: {
    referenceDate?: Date;
    volatileRatesPath?: string;
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

    const sections = checkRequiredSections(extractedText);
    result.checks.required_sections_present = sections.check;
    result.failures.push(...sections.failures);

    const fields = checkRequiredFieldMarkers(extractedText);
    result.checks.required_field_markers = fields.check;
    result.failures.push(...fields.failures);

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
