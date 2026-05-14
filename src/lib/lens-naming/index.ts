// Phase 18.7 — Lens scenario auto-naming.
//
// Generates a readable scenario name from the lens output's actual
// inputs. Used as the default display name on lens creation and when
// the advisor clicks "Auto-name" on the lens header. Manual rename
// always wins — auto-name just provides a sensible starting point.
//
// For Cash Flow Lens:
//   "Cash Flow — $9,333/mo to 5 buckets"
//   "Cash Flow — Pre-allocation draft"  (when no buckets configured)
//
// For Estate Lens:
//   "Estate — Note Sale @ 25% discount, $75M FMV"
//   "Estate — Status Quo, $100M estate"  (no planning move configured)

import {
  availableMonthlyAllocationCents,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

function fmtShortCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${Math.round(dollars / 1_000).toLocaleString()}K`;
  }
  return `$${Math.round(dollars).toLocaleString()}`;
}

function fmtUsdMoney(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function generateCashFlowLensName(out: CashFlowLensOutput): string {
  const buckets = out.buckets.length;
  const avail = availableMonthlyAllocationCents(out);
  if (buckets === 0 && avail <= 0) {
    return "Cash Flow — Pre-allocation draft";
  }
  if (buckets === 0) {
    return `Cash Flow — ${fmtUsdMoney(avail)}/mo available`;
  }
  return `Cash Flow — ${fmtUsdMoney(avail)}/mo to ${buckets} bucket${buckets === 1 ? "" : "s"}`;
}

export function generateEstateLensName(out: EstateLensOutput): string {
  const estateTodayShort = fmtShortCents(out.assumptions.estate_today_cents);
  const fmv = out.planning_move.fmv_transferred_cents;
  const discount = out.planning_move.valuation_discount_pct;
  if (!fmv || fmv <= 0) {
    return `Estate — Status Quo, ${estateTodayShort} estate`;
  }
  const moveLabel =
    out.planning_move.type === "note_sale" ? "Note Sale" : "Gift";
  const fmvShort = fmtShortCents(fmv);
  const discountSuffix = discount > 0 ? ` @ ${discount}% discount` : "";
  return `Estate — ${moveLabel}${discountSuffix}, ${fmvShort} FMV`;
}

export function generateLensName(
  lensType: "cash_flow" | "estate",
  output: CashFlowLensOutput | EstateLensOutput,
): string {
  if (lensType === "cash_flow") {
    return generateCashFlowLensName(output as CashFlowLensOutput);
  }
  return generateEstateLensName(output as EstateLensOutput);
}
