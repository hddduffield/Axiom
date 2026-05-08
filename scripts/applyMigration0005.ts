// Phase 13.1 — Verify (or warn about) migration 0005 application.
//
// The Supabase JS client cannot run DDL. This script tries to detect whether
// the new lens_runs.updated_at + archived_at columns exist by selecting
// them; if not, surfaces instructions for manual application.
//
// Usage: tsx scripts/applyMigration0005.ts
// Exit codes: 0 ok, 1 missing, 2 env error.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const MIGRATION_PATH = "supabase/migrations/0005_cash_flow_lens.sql";

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
    return 2;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Checking columns lens_runs.updated_at + archived_at against ${url}...`);
  const { error } = await admin
    .from("lens_runs")
    .select("id, updated_at, archived_at")
    .limit(1);

  if (!error) {
    console.log("✓ lens_runs.updated_at + archived_at exist. Migration 0005 already applied.");
    return 0;
  }

  const msg = error.message || JSON.stringify(error);
  const missing =
    /column.*does not exist/i.test(msg) ||
    /updated_at|archived_at/i.test(msg) ||
    /PGRST204|42703/.test(msg);

  if (missing) {
    const sql = await readFile(MIGRATION_PATH, "utf8");
    console.error("✗ lens_runs.updated_at + archived_at NOT FOUND.");
    console.error("");
    console.error(`Reason: ${msg}`);
    console.error("");
    console.error("─────────────────────────────────────────────────────────────");
    console.error("Manual application required:");
    console.error("  1. Supabase Dashboard → SQL Editor.");
    console.error("  2. Paste supabase/migrations/0005_cash_flow_lens.sql.");
    console.error("  3. Click Run. Idempotent — safe to re-run.");
    console.error("");
    console.error(`SQL:\n\n${sql}`);
    console.error("─────────────────────────────────────────────────────────────");
    return 1;
  }

  console.error(`✗ Unexpected error: ${msg}`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("UNCAUGHT:", err);
    process.exit(2);
  });
