import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { validateFactReview } from "../stage0Validator";

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

test("stale volatile rates yields warning; expired rates fails", async () => {
  await withTempDir(async (dir) => {
    const ratesPath = path.join(dir, "rates.md");
    // Refreshed exactly 35 days before the simulated reference date → "stale" band (30-45).
    const refreshDate = new Date("2026-04-01T00:00:00Z");
    await writeFile(
      ratesPath,
      `# VOLATILE RATES LOOKUP\n\n**Last refreshed:** ${refreshDate.toISOString().slice(0, 10)}\n\nSome content.\n`,
    );

    // 35 days later → stale, but not expired
    const staleRefDate = new Date(refreshDate.getTime() + 35 * 24 * 60 * 60 * 1000);
    const staleResult = await validateFactReview(HOLLOWAY_FIXTURE, {
      referenceDate: staleRefDate,
      volatileRatesPath: ratesPath,
    });
    assert.equal(
      staleResult.status,
      "passed_with_warnings",
      `stale-band expected passed_with_warnings, got ${staleResult.status}; ` +
        `rates check: ${JSON.stringify(staleResult.checks.volatile_rates_freshness)}`,
    );
    assert.equal(staleResult.checks.volatile_rates_freshness.status, "warning");
    assert.equal(staleResult.flags.volatile_rates_stale, true);

    // 60 days later → expired → fail
    const expiredRefDate = new Date(refreshDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    const expiredResult = await validateFactReview(HOLLOWAY_FIXTURE, {
      referenceDate: expiredRefDate,
      volatileRatesPath: ratesPath,
    });
    assert.equal(expiredResult.status, "failed");
    assert.equal(expiredResult.checks.volatile_rates_freshness.status, "failed");
    assert.ok(
      expiredResult.failures.some((f) => f.check === "volatile_rates_freshness"),
    );
  });
});
