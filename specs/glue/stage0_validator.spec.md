# Stage 0 — Fact Review Validator

**Type:** Deterministic. NO LLM call.

**Purpose:** Validate that a Fact Review (.docx) is parseable and structurally sound before downstream LLM stages spend tokens. Fail-loud on problems; downstream stages do not run if Stage 0 fails.

**Input:**
- File path to a Fact Review .docx
- Optional: orchestrator config (volatile rates snapshot reference, advisor_id)

**Output:** A `Stage0ValidationResult` JSON object (see schema below).

---

## Validation Categories

Stage 0 runs five categories of checks:

### 1. File Integrity
- File exists at the given path
- File is a valid .docx (mammoth can extract text without throwing)
- Extracted text is non-empty
- Extracted text length is reasonable (>5,000 chars; flag <2,000 as suspicious; reject 0)

### 2. Required Sections Present
The Fact Review must contain text matching these required section headers (case-insensitive substring match):
- "Section 1" or "Engagement"
- "Section 2" or "Client and Family" or "Household & Family"
- "Section 3" or "Entities"
- "Section 5" or "Personal Balance Sheet"
- "Section 6" or "Income"
- "Section 11" or "Transaction Posture" or "Transition Posture"
- "Section 13" or "Goals"

Missing any required section → fail.

### 3. Required Field Markers
Within the extracted text, certain critical fields must be detectable. These are name-based regex patterns indicating that values were filled in (not blank):

- Primary owner first name: any non-empty value following labels like "Primary Owner Name" or "First Name" near Section 2
- Entity legal name: at least one non-empty entity name following labels like "Legal Entity Name" or "Entity Name" near Section 3
- Engagement archetype: text containing one of "Pre-Exit", "Post-Exit", "Active-No-Exit", "Family-Office", "Pre-Liquidity-Founder" near Section 1

Missing any → fail with descriptor of which marker was missing.

### 4. Volatile Rates Freshness Check
Read `kb/v1_2/02_reference/08_volatile_rates_lookup.md`. Look for a "Last refreshed" or "Snapshot date" line containing an ISO date.

Compare against today (Date.now() in code; or pass in a fixed reference date for deterministic testing).

- Fresh: refresh date within 30 days of today → pass
- Stale: 30-45 days → warn, but pass with `flags.volatile_rates_stale: true`
- Expired: >45 days → fail

### 5. Content Hash
Compute SHA-256 hash of the entire extracted text. This becomes `source_fr_content_hash` carried through every downstream stage's metadata.

---

## Output Schema (TypeScript)

```typescript
export interface Stage0ValidationResult {
  status: "passed" | "passed_with_warnings" | "failed";
  
  validated_at: string;                    // ISO 8601 timestamp
  source_file_path: string;
  source_fr_content_hash: string;          // SHA-256 of extracted text
  
  checks: {
    file_integrity: CheckResult;
    required_sections_present: CheckResult;
    required_field_markers: CheckResult;
    volatile_rates_freshness: CheckResult;
    content_hash: CheckResult;
  };
  
  flags: {
    volatile_rates_stale: boolean;
    text_length_suspicious: boolean;
    additional: Record<string, unknown>;
  };
  
  failures: ValidationFailure[];           // populated when status is "failed"
  warnings: string[];                      // populated when status is "passed_with_warnings"
  
  extracted_text_length: number;
  extracted_text_preview: string;          // first 500 chars, for sanity check
}

export interface CheckResult {
  status: "passed" | "warning" | "failed" | "skipped";
  details: string;
}

export interface ValidationFailure {
  check: string;
  reason: string;
  remediation: string;                     // human-readable: how to fix
}
```

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/stage0Validator.ts`
2. **Function signature:**
```typescript
   export async function validateFactReview(
     filePath: string,
     options?: {
       referenceDate?: Date;
       volatileRatesPath?: string;
     }
   ): Promise<Stage0ValidationResult>
```
3. **Dependencies:** `mammoth` (already installed) for .docx extraction; Node's `crypto` for hashing; Node's `fs/promises` for file reading.
4. **No throws:** All errors caught and returned as `failures[]`. The function never throws — the orchestrator must always get a result.
5. **Schema in separate file:** `src/lib/orchestrator/schemas/stage0.types.ts` exports the TypeScript types.

---

## Test Requirements

Create unit tests at `src/lib/orchestrator/glue/__tests__/stage0Validator.test.ts`:

1. **Test fixture:** Use the existing `Holloway_Fact_Review_FILLED.docx` from the original uploads (we'll point to a test fixture path; for now use `tests/fixtures/Holloway_Fact_Review_FILLED.docx` and we'll copy the file there).

2. **Test cases:**
   - Valid file → status: "passed", all checks: "passed"
   - Nonexistent file → status: "failed", file_integrity: "failed"
   - Empty file (create temp empty .docx) → status: "failed"
   - Valid file with stale volatile rates (mock the date) → status: "passed_with_warnings"

3. Use Node's built-in `node:test` runner — no need to install Jest or Vitest for this stage.

---

## What This Does NOT Do

- Does not parse FR fields semantically (that's Stage 1's LLM job).
- Does not validate every section's contents in detail (just structural sanity).
- Does not call the Anthropic API.
- Does not write artifacts to disk (that's the harness's job).

Stage 0 is a fast pre-flight check. It either greenlights downstream stages or stops them cold.

---

## Spec Notes

Section header alternatives reflect actual Holloway FR template wording. "Transition Posture" may be a typo in the source template; document either way to avoid future drift.
