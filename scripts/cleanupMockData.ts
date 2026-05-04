/**
 * Phase 9.22 — Mock household cleanup.
 *
 * Deletes every household EXCEPT Holloway from the live Supabase database
 * along with all related rows (cascade via FK). Holloway is the production
 * demo household with a real generated plan and is kept verbatim.
 *
 * Idempotent + re-runnable:
 *   - Default mode is dry-run (SELECT only); reports what WOULD be deleted.
 *   - `--apply` flag executes DELETEs.
 *   - Either mode prints pre + post snapshot counts.
 *
 * Cascade reliance: clients → (plans, lens_runs, action_items, notes,
 * partners) all ON DELETE CASCADE per migration 0001. A single
 * `delete from clients where id = ?` removes the entire subtree.
 *
 * Service-role key bypasses RLS, which is required because RLS gates
 * SELECT/DELETE on `is_active_advisor()` (browser-session check).
 *
 * Usage:
 *   npx tsx scripts/cleanupMockData.ts            # dry-run
 *   npx tsx scripts/cleanupMockData.ts --apply    # actually delete
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const KEEP_NAME_PREFIX = "Holloway";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Client = {
  id: string;
  household_name: string;
  status: string;
  lead_advisor_id: string;
  created_at: string;
};

async function snapshotCounts(): Promise<Record<string, number>> {
  const tables = [
    "advisors",
    "clients",
    "plans",
    "lens_runs",
    "action_items",
    "notes",
    "partners",
  ] as const;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count(${t}): ${error.message}`);
    out[t] = count ?? 0;
  }
  return out;
}

async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, household_name, status, lead_advisor_id, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`list clients: ${error.message}`);
  return (data ?? []) as Client[];
}

async function countsForClient(id: string) {
  const tables = ["plans", "lens_runs", "action_items", "notes", "partners"] as const;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true })
      .eq("client_id", id);
    if (error) throw new Error(`count(${t}, ${id}): ${error.message}`);
    out[t] = count ?? 0;
  }
  return out;
}

function printCounts(label: string, counts: Record<string, number>) {
  console.log(`  ${label}:`);
  for (const [k, v] of Object.entries(counts)) console.log(`    ${k.padEnd(13)} ${v}`);
}

async function main() {
  console.log(`Phase 9.22 cleanup — mode: ${APPLY ? "APPLY (will delete)" : "DRY-RUN (read-only)"}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log("");

  console.log("=== PRE snapshot ===");
  const pre = await snapshotCounts();
  printCounts("totals", pre);
  console.log("");

  const clients = await listClients();
  console.log(`Found ${clients.length} client(s):`);
  for (const c of clients) {
    console.log(`  ${c.id}  ${c.household_name.padEnd(28)} status=${c.status}`);
  }
  console.log("");

  const toKeep = clients.filter((c) => c.household_name.startsWith(KEEP_NAME_PREFIX));
  const toDelete = clients.filter((c) => !c.household_name.startsWith(KEEP_NAME_PREFIX));

  if (toKeep.length === 0) {
    console.error(
      `ABORT: zero households matched keep prefix "${KEEP_NAME_PREFIX}". Refusing to proceed — this is the safety guard against deleting everything.`,
    );
    process.exit(2);
  }

  console.log(`KEEP (${toKeep.length}):`);
  for (const c of toKeep) {
    const child = await countsForClient(c.id);
    console.log(`  ${c.household_name}  (${c.id})`);
    printCounts("    children", child);
  }
  console.log("");

  if (toDelete.length === 0) {
    console.log("Nothing to delete — already clean. Exiting.");
    return;
  }

  console.log(`DELETE ${APPLY ? "(APPLYING)" : "(would-delete)"} (${toDelete.length}):`);
  let totalChildren = 0;
  for (const c of toDelete) {
    const child = await countsForClient(c.id);
    const sum = Object.values(child).reduce((a, b) => a + b, 0);
    totalChildren += sum;
    console.log(`  ${c.household_name}  (${c.id})  +${sum} child rows`);
    printCounts("    cascade", child);
  }
  console.log(`  Total cascading rows: ${totalChildren}`);
  console.log("");

  if (!APPLY) {
    console.log("Dry-run complete. Re-run with --apply to delete.");
    return;
  }

  // Apply: delete one at a time so a partial failure leaves the rest visible.
  console.log("=== APPLYING DELETES ===");
  for (const c of toDelete) {
    const { error } = await supabase.from("clients").delete().eq("id", c.id);
    if (error) {
      console.error(`  ✗ ${c.household_name} (${c.id}): ${error.message}`);
      process.exit(3);
    }
    console.log(`  ✓ ${c.household_name} (${c.id})`);
  }
  console.log("");

  console.log("=== POST snapshot ===");
  const post = await snapshotCounts();
  printCounts("totals", post);
  console.log("");

  const delta: Record<string, number> = {};
  for (const k of Object.keys(pre)) delta[k] = pre[k] - post[k];
  console.log("=== Delta (pre - post) ===");
  printCounts("removed", delta);
  console.log("");

  const remaining = await listClients();
  console.log(`Remaining clients (${remaining.length}):`);
  for (const c of remaining) {
    console.log(`  ${c.id}  ${c.household_name.padEnd(28)} status=${c.status}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
