// Phase 17.6 — Wrapper for the "Finalize & Promote" UI flow.
//
// Calls existing per-lens-type push-action-items endpoints, then
// flips the lens status to 'current' (which auto-demotes any prior
// 'current' for the same client + lens_type).
//
// This module is browser-side (calls api.* helpers). It intentionally
// does NOT duplicate the per-lens output-parsing logic — that lives
// in the server-side push handlers, where the lens-type discriminator
// already exists.

import { api, isApiError } from "@/lib/api/client";
import type { LensRunsApi } from "@/lib/api/types";

export interface LensPromoteResult {
  created_count: number;
  skipped_count: number;
  set_current_ok: boolean;
  errors: string[];
}

export async function promoteCashFlowLensAndSetCurrent(
  lensId: string,
  recommendationIds: string[],
): Promise<LensPromoteResult> {
  return run(async () => {
    let pushed: LensRunsApi.CashFlowPushActionItemsResponse | null = null;
    if (recommendationIds.length > 0) {
      pushed = await api.lensRuns.cashFlow.pushActionItems(lensId, {
        recommendation_ids: recommendationIds,
      });
    }
    await api.lensRuns.setCurrent(lensId);
    return {
      created_count: pushed?.created.length ?? 0,
      skipped_count: pushed?.skipped ?? 0,
    };
  });
}

export async function promoteEstateLensAndSetCurrent(
  lensId: string,
  recommendationIds: string[],
): Promise<LensPromoteResult> {
  return run(async () => {
    let pushed: LensRunsApi.EstatePushActionItemsResponse | null = null;
    if (recommendationIds.length > 0) {
      pushed = await api.lensRuns.estate.pushActionItems(lensId, {
        recommendation_ids: recommendationIds,
      });
    }
    await api.lensRuns.setCurrent(lensId);
    return {
      created_count: pushed?.created.length ?? 0,
      skipped_count: pushed?.skipped ?? 0,
    };
  });
}

async function run(
  inner: () => Promise<{ created_count: number; skipped_count: number }>,
): Promise<LensPromoteResult> {
  const out: LensPromoteResult = {
    created_count: 0,
    skipped_count: 0,
    set_current_ok: false,
    errors: [],
  };
  try {
    const r = await inner();
    out.created_count = r.created_count;
    out.skipped_count = r.skipped_count;
    out.set_current_ok = true;
  } catch (e) {
    out.errors.push(isApiError(e) ? e.message : (e as Error).message);
  }
  return out;
}
