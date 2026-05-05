// Phase 10D.2 — Inlined snapshot of kb/v1_2/02_reference/08_volatile_rates_lookup.md.
//
// Why inlined? Stage 0's freshness check runs inside the Vercel serverless
// function for /api/plans/generate. Vercel's nft tracer doesn't see the
// runtime readFile path (constructed dynamically), so the kb/ directory
// was excluded from the bundle on cold start. Phase 10C.1 added an
// `outputFileTracingIncludes` hint but the path resolution still wasn't
// reliable in production runtime.
//
// This module is the source of truth for Stage 0's volatile-rates check.
// The KB markdown file at kb/v1_2/02_reference/08_volatile_rates_lookup.md
// remains the human-facing reference (and is what Stage 3a still reads
// via the CLI on Hayden's laptop), but Stage 0 reads from this constant.
//
// Refresh procedure:
// 1. On the 19th of each month, pull the new IRS Rev. Rul. rates.
// 2. Update both the KB markdown file AND this constant.
// 3. Bump LAST_REFRESHED_ISO. Stage 0's freshness threshold (>30 days
//    warn, >45 days fail) gates against this date.

export interface VolatileRatesSnapshot {
  /** Display label for the active month, e.g. "May 2026". */
  active_month: string;
  /** §7520 rate as a percent, e.g. 5.00 for 5.00%. */
  s7520_rate_pct: number;
  /** ISO date (YYYY-MM-DD) the rates were last refreshed. */
  last_refreshed_iso: string;
  /** §7520 historical rates by month, most recent first. */
  s7520_history: Array<{ month: string; rate_pct: number }>;
  /** §382 long-term tax-exempt rate as a percent. */
  s382_long_term_pct: number;
}

export const VOLATILE_RATES: VolatileRatesSnapshot = {
  active_month: "May 2026",
  s7520_rate_pct: 5.0,
  last_refreshed_iso: "2026-04-16",
  s7520_history: [
    { month: "May 2026", rate_pct: 5.0 },
    { month: "April 2026", rate_pct: 4.6 },
    { month: "March 2026", rate_pct: 4.8 },
    { month: "February 2026", rate_pct: 4.6 },
    { month: "January 2026", rate_pct: 4.6 },
    { month: "December 2025", rate_pct: 4.6 },
    { month: "November 2025", rate_pct: 4.8 },
    { month: "October 2025", rate_pct: 4.6 },
    { month: "September 2025", rate_pct: 4.8 },
    { month: "August 2025", rate_pct: 5.0 },
    { month: "July 2025", rate_pct: 5.0 },
    { month: "June 2025", rate_pct: 5.0 },
    { month: "May 2025", rate_pct: 5.0 },
    { month: "April 2025", rate_pct: 5.0 },
    { month: "March 2025", rate_pct: 5.4 },
    { month: "February 2025", rate_pct: 5.4 },
    { month: "January 2025", rate_pct: 5.2 },
  ],
  s382_long_term_pct: 3.65,
};
