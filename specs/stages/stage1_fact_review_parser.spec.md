# Stage 1 — Fact Review Parser

**Type:** LLM stage. Calls Anthropic API.

**Purpose:** Parse a Fact Review .docx into structured ClientProfile JSON. Stage 1 is the bridge from human-authored intake document to machine-readable client data. Every downstream stage consumes ClientProfile.

**Input:**
- factReviewPath: string — path to .docx
- options:
  - apiClient: Anthropic instance (for testing, allows injection)
  - referenceDate?: Date (for testing volatile rates freshness; defaults to now)
  - maxRetries?: number (default 1 — i.e., 2 total attempts)

**Output:** ClientProfile object validated against schema, plus metadata. On failure: ClientProfileFailed with diagnostic context.

---

## Algorithm

### Step 1 — Extract FR text via mammoth

Use the existing extraction logic from Stage 0 if possible (refactor mammoth.extractRawText to a shared util). Get the full text content as a single string.

### Step 2 — Build user turn

Construct user message with:
- The FR extracted text as input data
- Instructions to parse per the system prompt (system prompt has the schema + parsing rules)

User template:
Parse the following Fact Review into structured ClientProfile JSON per the schema in your system prompt. Return ONLY the JSON object — no preamble, no commentary, no markdown code fences.
<fact_review_text>
{FR_TEXT_HERE}
</fact_review_text>
Output the ClientProfile JSON now.

### Step 3 — Call Anthropic API

```typescript
const response = await apiClient.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 8000,
  system: STAGE_1_SYSTEM_PROMPT,
  messages: [{ role: "user", content: userTurn }],
  temperature: 0.0
});
```

### Step 4 — Extract response text

```typescript
const responseText = response.content
  .filter(block => block.type === "text")
  .map(block => block.text)
  .join("");
```

### Step 5 — Parse JSON

Try parsing the response as JSON. If parse fails:
- If retries remaining: retry with explicit error message ("Your previous response was not valid JSON. The error was: <error>. Output ONLY a JSON object now.")
- If no retries remaining: return ClientProfileFailed with parse_error and raw_response.

### Step 6 — Validate schema

Validate parsed JSON against ClientProfile zod schema. If validation fails:
- If retries remaining: retry with validation errors ("Your previous response did not match the schema. Errors: <list>. Output a corrected JSON object now.")
- If no retries remaining: return ClientProfileFailed with validation_errors and parsed_response.

### Step 7 — Compute metadata

Build StageMetadata:
- stage_version: "1.0.1"
- model_used: "claude-opus-4-7"
- input_token_count: response.usage.input_tokens
- output_token_count: response.usage.output_tokens
- attempts_made: 1 or 2
- duration_ms: end_time - start_time
- source_fr_content_hash: SHA-256 of FR text (compute now; reuse via Stage 0 if already validated)
- parsed_at: ISO 8601 timestamp

### Step 8 — Return ClientProfile + metadata

```typescript
return {
  ...parsedClientProfile,
  _metadata: stageMetadata
};
```

---

## ClientProfile Schema (zod runtime validation)

The schema lives in src/lib/orchestrator/schemas/clientProfile.ts as a zod schema. The TypeScript type is derived from the zod schema via z.infer.

Key required sections (matching the FR template):
- engagement: { advisor_id, archetype: ArchetypeIdentifier, secondary_archetype: ArchetypeIdentifier | null, engagement_date: string, plan_purpose: string }
- client_and_family: { primary_owner: PersonRecord, spouse: PersonRecord | null, children: PersonRecord[], dependents: PersonRecord[] }
- entities: EntityRecord[]
- entity_structure: { has_holdco: boolean, holdco_jurisdiction: string | null, has_dynasty_trust: boolean, has_foundation: boolean, additional_entities: string[] }
- personal_balance_sheet: { liquid_assets: AssetRecord[], retirement_accounts: AssetRecord[], real_estate: AssetRecord[], business_interests: AssetRecord[], other_assets: AssetRecord[], liabilities: LiabilityRecord[], net_worth: NumericValue }
- income: { wages_w2: NumericValue, k1_distributions: NumericValue, other_income: NumericValue, agi: NumericValue }
- cash_flow: { monthly_inflows: NumericValue, monthly_outflows: NumericValue, monthly_savings: NumericValue }
- tax_status: { filing_status: string, federal_marginal_rate: NumericValue, state_residency: string, ptet_election_status: "elected" | "not_elected" | "pending" | "not_applicable", prior_returns_received: boolean }
- estate_planning: { will_status: "current" | "stale" | "missing" | "draft", will_date: string | null, trusts: TrustRecord[], beneficiaries: BeneficiaryRecord[], dpoa_in_place: boolean, healthcare_directive_in_place: boolean }
- insurance: { life_insurance_policies: PolicyRecord[], dis_insurance: PolicyRecord[], ltc_insurance: PolicyRecord[], umbrella_liability: PolicyRecord | null, errors_omissions: PolicyRecord | null }
- transaction_posture: { transaction_window: string | null, transaction_status: string, inbound_interest: boolean, advisor_engaged: string | null, valuation_status: string | null }
- prior_transactions: TransactionRecord[]
- goals_and_values: { financial_goals: string, philanthropic_goals: string | null, family_priorities: string | null, succession_goals: string | null, raw_values_text: string }
- documents_received: string[]
- existing_advisor_relationships: AdvisorRelationshipRecord[]
- advisor_observations: string

Each sub-record has its own type. The schema is large; Claude Code creates the full zod schema from this list with reasonable interpretations. Important fields to get right:
- archetype: must be one of "PRE" | "POST" | "ACT" | "FO" | "FOUND" (drives downstream stages)
- transaction_window: must be parseable as a date or relative time string ("12-18 months", "post-Q3 2026")
- ptet_election_status: enum
- will_status: enum

For NumericValue: { value: number | null, unit: "USD" | "percent" | "count" | "years", narrative_context?: string, is_approximate?: boolean, known_unknown?: boolean, is_annual?: boolean }

A field may be null (genuinely unknown / not in FR) but should never be undefined. If the FR doesn't have a value, populate as null (and is_known: false on NumericValue).

---

## System Prompt

The Stage 1 system prompt is large (~3,000 words). Key sections:

1. **Role and goal:** "You are Stage 1 of an automated financial planning pipeline. Your job is to parse Fact Review documents..."

2. **Schema reference:** Full ClientProfile schema documented inline. The LLM gets the schema in plain English plus example values.

3. **Parsing rules:**
   - Distinguish "the FR doesn't have this field" (null) from "the field is filled in but the value is zero" (0)
   - For dates, normalize to ISO 8601 format
   - For NumericValue, populate is_known correctly
   - For multi-word names with parentheticals like "Sample Industries, LLC ('SI')", extract both legal_name and short_name
   - For income figures, mark is_annual: true unless explicitly monthly/weekly
   - Round currency values minimally — preserve source-document precision

4. **Archetype detection:**
   - PRE-EXIT (PRE): transaction_window non-null AND transaction_status in {"actively engaged", "evaluating", "considering"}
   - POST-EXIT (POST): prior_transactions exists with completed_date in past AND no current transaction_window
   - ACTIVE-NO-EXIT (ACT): operating business OWNER, no transaction posture
   - FAMILY-OFFICE (FO): multi-generational wealth (3+ generations referenced in family records OR foundation/dynasty trust present AND complex entity structure)
   - PRE-LIQUIDITY-FOUNDER (FOUND): pre-revenue or early-stage company AND ownership > 50%

5. **Output format strict:**
   - JSON only, no preamble, no commentary, no markdown fences
   - All required fields present; null where unknown
   - All enum values exactly as specified

6. **What to do when sections are missing:**
   - Required section absent: emit field with null/empty values + flag in advisor_observations
   - Required field within section absent: emit null
   - Don't fabricate values

The full system prompt is approximately 3,000 words. We'll generate it as a separate file at src/lib/orchestrator/stages/stage1.system.md when implementing.

---

## Output Schema

```typescript
export interface ClientProfile {
  // ... all the section types listed above ...
  _metadata: StageMetadata;
}

export interface StageMetadata {
  stage_version: string;
  model_used: string;
  input_token_count: number;
  output_token_count: number;
  attempts_made: number;
  duration_ms: number;
  source_fr_content_hash: string;
  parsed_at: string;
}

export interface ClientProfileFailed {
  _stage_status: "FAILED";
  _failure_type: "fr_extraction_failed" | "json_parse_failed" | "schema_validation_failed" | "api_error" | "max_retries_exceeded";
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
  };
  _metadata: Partial<StageMetadata>;
}
```

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage1FactReviewParser.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/clientProfile.ts` — defines zod schema, exports inferred TypeScript type and the schema itself.

3. **System prompt location:** `src/lib/orchestrator/stages/stage1.system.md` — the actual prompt text.

4. **Function signature:**
```typescript
   export async function parseFactReview(
     factReviewPath: string,
     options: {
       apiClient: Anthropic;
       referenceDate?: Date;
       maxRetries?: number;
     }
   ): Promise<ClientProfile | ClientProfileFailed>
```

5. **No throws.** All errors caught and returned as ClientProfileFailed.

6. **Loads system prompt from disk** — read stage1.system.md at module load time or first call. Cache in memory.

7. **Mammoth extraction reused** — extract to a shared util src/lib/orchestrator/utils/factReviewIO.ts if not already there.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage1FactReviewParser.test.ts`:

### Test cases

1. **Holloway fixture, real API call** — parse the synthetic Holloway. Verify:
   - archetype: "PRE"
   - primary_owner.full_legal_name and short_name extracted
   - transaction_window: non-null
   - estate_planning.will_status: matches FR content
   - At least 5 children/family members or appropriate count
   - All required top-level sections present
   - _metadata populated correctly

2. **Mock API that returns invalid JSON** → returns ClientProfileFailed with json_parse_failed.

3. **Mock API that returns valid JSON but schema-invalid** → returns ClientProfileFailed with schema_validation_failed; validation_errors populated.

4. **Mock API success with retry** — first call returns invalid JSON, retry returns valid → returns ClientProfile, attempts_made: 2.

5. **Nonexistent FR path** → returns ClientProfileFailed with fr_extraction_failed.

6. **API error** (mock 500 response) → returns ClientProfileFailed with api_error.

For tests using the real API: mark them with `{ skip: !process.env.RUN_LIVE_API_TESTS }` so CI runs only when env var is set. Real API calls cost ~$0.10 each.

For mock API tests: build a MockAnthropicClient with configurable response.

Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call other LLM stages
- Does not generate prose
- Does not validate semantic content (e.g., "are these dates plausible?")
- Does not write artifacts to disk
- Does not enrich the ClientProfile with derived fields (those happen in Stage 1.5 if needed, or in downstream stages)
