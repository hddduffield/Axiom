import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { validateFactReview } from "../stage0Validator";
import { VOLATILE_RATES } from "../../data/volatileRates";

const HOLLOWAY_FIXTURE = path.resolve("tests/fixtures/Holloway_Fact_Review_FILLED.docx");

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "stage0-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("valid Holloway fixture passes (or passes with warnings)", async () => {
  const result = await validateFactReview(HOLLOWAY_FIXTURE);
  assert.ok(
    result.status === "passed" || result.status === "passed_with_warnings",
    `expected passed/passed_with_warnings, got ${result.status}\n` +
      `failures: ${JSON.stringify(result.failures, null, 2)}\n` +
      `checks: ${JSON.stringify(result.checks, null, 2)}`,
  );
  assert.equal(result.checks.file_integrity.status, "passed");
  assert.equal(result.checks.required_sections_present.status, "passed");
  assert.equal(result.checks.required_field_markers.status, "passed");
  assert.equal(result.checks.content_hash.status, "passed");
  assert.equal(result.source_fr_content_hash.length, 64);
  assert.equal(result.source_file_path, HOLLOWAY_FIXTURE);
  assert.ok(result.extracted_text_length > 5000);
  assert.ok(result.extracted_text_preview.length > 0);
});

test("nonexistent file fails on file_integrity", async () => {
  const result = await validateFactReview("/tmp/this-file-does-not-exist-12345.docx");
  assert.equal(result.status, "failed");
  assert.equal(result.checks.file_integrity.status, "failed");
  assert.ok(result.failures.some((f) => f.check === "file_integrity"));
});

test("empty/invalid file fails", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "empty.docx");
    await writeFile(filePath, "");
    const result = await validateFactReview(filePath);
    assert.equal(result.status, "failed");
    assert.equal(result.checks.file_integrity.status, "failed");
    assert.ok(result.failures.some((f) => f.check === "file_integrity"));
  });
});

test("stale volatile rates yield warning (never fail; Phase 10D.1)", async () => {
  // Phase 10D.2 — volatile rates come from the inlined VOLATILE_RATES
  // constant (last_refreshed_iso). Test by manipulating referenceDate
  // relative to that fixed date.
  const refreshIso = VOLATILE_RATES.last_refreshed_iso;
  const refreshDate = new Date(refreshIso + "T00:00:00Z");

  // Day 0 — fresh, should be a clean pass on the freshness check.
  const freshResult = await validateFactReview(HOLLOWAY_FIXTURE, {
    referenceDate: refreshDate,
  });
  assert.ok(
    freshResult.status === "passed" || freshResult.status === "passed_with_warnings",
    `fresh-day expected pass*, got ${freshResult.status}`,
  );
  assert.equal(freshResult.checks.volatile_rates_freshness.status, "passed");

  // 35 days later — within the >30 day warn band.
  const staleRefDate = new Date(refreshDate.getTime() + 35 * 24 * 60 * 60 * 1000);
  const staleResult = await validateFactReview(HOLLOWAY_FIXTURE, {
    referenceDate: staleRefDate,
  });
  assert.equal(
    staleResult.status,
    "passed_with_warnings",
    `stale-band expected passed_with_warnings, got ${staleResult.status}`,
  );
  assert.equal(staleResult.checks.volatile_rates_freshness.status, "warning");
  assert.equal(staleResult.flags.volatile_rates_stale, true);

  // 60 days later — Phase 10D.1: still passed_with_warnings, never failed.
  const veryStaleRefDate = new Date(refreshDate.getTime() + 60 * 24 * 60 * 60 * 1000);
  const veryStaleResult = await validateFactReview(HOLLOWAY_FIXTURE, {
    referenceDate: veryStaleRefDate,
  });
  assert.equal(
    veryStaleResult.status,
    "passed_with_warnings",
    `60-day-stale expected passed_with_warnings (Phase 10D.1 reclassified to soft), got ${veryStaleResult.status}`,
  );
  assert.equal(veryStaleResult.checks.volatile_rates_freshness.status, "warning");
  assert.equal(
    veryStaleResult.failures.some((f) => f.check === "volatile_rates_freshness"),
    false,
    "volatile_rates_freshness must never appear in result.failures after Phase 10D.1",
  );
});

test("Stage 0 only fails on file_integrity (Phase 10D.1 hard-gate scope)", async () => {
  // Section / field / archetype heuristic misses must NOT produce status='failed'.
  await withTempDir(async (dir) => {
    // Create a syntactically valid but content-light .docx-extension file.
    // It won't actually parse as a docx, so file_integrity will fail. That's
    // the right hard-fail trigger.
    const filePath = path.join(dir, "garbage.docx");
    await writeFile(filePath, "this is not actually a docx");
    const result = await validateFactReview(filePath);
    assert.equal(result.status, "failed");
    assert.equal(result.checks.file_integrity.status, "failed");
    // No other checks should have been "failed" — they should be skipped
    // because the run short-circuits on file_integrity hard fail.
    assert.equal(result.checks.required_sections_present.status, "skipped");
    assert.equal(result.checks.required_field_markers.status, "skipped");
  });
});
