import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 10C.1 — Bundle the kb/ directory with the serverless function
  // for /api/plans/generate (Stage 0 preflight reads
  // kb/v1_2/02_reference/08_volatile_rates_lookup.md). Without this,
  // Vercel's nft tracer doesn't see the dynamic readFile path and the
  // file is missing at /var/task/ on cold start.
  //
  // Glob is route-relative; the kb/ directory lives at the repo root,
  // so the pattern reaches it. Total weight ~1.2 MB — well under the
  // 50 MB serverless function ceiling.
  outputFileTracingIncludes: {
    "/api/plans/generate": ["./kb/v1_2/**/*"],
  },
};

export default nextConfig;
