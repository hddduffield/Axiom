// Phase 10B.1 — Verify (or warn about) migration 0004 application.
//
// The Supabase JS client cannot run DDL. This script tries to detect whether
// the `input_fact_review_path` column exists by selecting it; if PGRST205 (or
// similar "column does not exist" error) comes back, it surfaces clear
// instructions for manual application via Supabase Dashboard.
//
// Usage:
//   tsx scripts/applyMigration0004.ts
//
// Exit codes:
//   0 — column exists (migration applied)
//   1 — column missing (manual application required); SQL printed
//   2 — env not set / unreachable

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const MIGRATION_PATH = "supabase/migrations/0004_input_fact_review_path.sql";

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    return 2;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Checking column plans.input_fact_review_path against ${url}...`);
  const { error } = await admin
    .from("plans")
    .select("id, input_fact_review_path")
    .limit(1);

  if (!error) {
    console.log("✓ Column plans.input_fact_review_path exists. Migration 0004 already applied.");
    return 0;
  }

  // PGRST204 / 42703 / "column ... does not exist"
  const msg = error.message || JSON.stringify(error);
  const looksLikeMissingColumn =
    /column.*does not exist/i.test(msg) ||
    /input_fact_review_path/i.test(msg) ||
    /PGRST204|42703/.test(msg);

  if (looksLikeMissingColumn) {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    console.error(`✗ Column plans.input_fact_review_path NOT FOUND.`);
    console.error("");
    console.error(`Reason: ${msg}`);
    console.error("");
    console.error("─────────────────────────────────────────────────────────────");
    console.error("Manual application required. Steps:");
    console.error("  1. Open Supabase Dashboard → SQL Editor for the project.");
    console.error("  2. Paste the contents of supabase/migrations/0004_input_fact_review_path.sql.");
    console.error("  3. Click Run. Idempotent — safe to re-run.");
    console.error("");
    console.error(`SQL to paste:\n\n${sql}`);
    console.error("─────────────────────────────────────────────────────────────");
    return 1;
  }

  console.error(`✗ Unexpected error checking column: ${msg}`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("UNCAUGHT:", err);
    process.exit(2);
  });
