// Phase 14.1 — Estate Lens canonical types + defaults.
//
// The JSONB stored at lens_runs.output (when lens_type='estate') matches
// EstateLensOutput exactly. schema_version: 1 sentinel for migrations.
//
// All money values stored in CENTS (integers) to avoid float drift.
// Percentages stored as basis-100 numbers (e.g., 7 = 7%, 25 = 25%).
// Growth rates and tax rates are entered as percentages (7, 40, 4.5)
// for advisor ergonomics — converted to decimal at calc time.
//
// Source-of-truth for the math: see math.md in this directory.

import type { ActionItem } from "@/lib/api/types";

// ────────────────────────────────────────────────────────────────────────
// Stored shape
// ────────────────────────────────────────────────────────────────────────

export type PlanningMoveType = "note_sale" | "gift";

export interface EstateClientSnapshot {
  household_name: string;
  archetype: string | null;
  state_code: string | null; // 2-letter; auto-populated from client if known
}

// Core estate assumptions used by all three tabs. Mirror of Tab 1's
// "Estate Assumptions" card.
export interface EstateAssumptions {
  estate_today_cents: number; // total taxable estate value today
  annual_spend_cents: number; // annual lifestyle spend, reduces estate
  growth_rate_pct: number; // estate compound growth (e.g., 7)
  years_out: number; // horizon (typically client_age → ~life expectancy)
  combined_exemption_cents: number; // current federal estate+gift exemption (combined for married couple if applicable)
  exemption_inflation_pct: number; // annual indexing of the exemption (e.g., 3)
  estate_tax_rate_pct: number; // federal top-bracket estate rate (40)
  client_age_today: number;
  state_estate_tax_pct: number; // applied to taxable estate after federal
}

// "Assets Already Out of Estate" — existing trusts (ILITs, GRATs, SLATs,
// etc.) already populated with FMV. These grow at the estate growth rate
// and carry a basis used at liquidation.
export interface AssetsOutOfEstate {
  fmv_out_today_cents: number;
  cost_basis_cents: number;
  pct_liquidated_at_death: number; // 0..100
  federal_ltcg_pct: number;
  niit_pct: number; // 3.8 default
  state_ltcg_pct: number;
}

// Tab 2 — proposed new planning move (added on top of any existing
// out-of-estate assets).
export interface PlanningMove {
  type: PlanningMoveType;
  fmv_transferred_cents: number;
  original_cost_basis_cents: number;
  valuation_discount_pct: number; // e.g., 25
  afr_rate_pct: number; // applicable federal rate (note sale only; gift ignores)
  trust_growth_pct: number;
  years_to_liquidation: number;
  pct_liquidated_at_death: number;
  federal_ltcg_pct: number;
  niit_pct: number;
  state_ltcg_pct: number;
}

// Tab 3 — Life Insurance plan for funding the tax bill.
export interface LifeInsurancePlan {
  annual_premium_cents: number;
  years_of_premium: number;
  death_benefit_cents: number;
  // Self-insure comparison assumption (used in mortality leverage chart).
  self_insure_growth_pct: number; // e.g., 7
}

// Selected Tab 2 / Tab 3 recommendations the advisor checked for push.
// Each rec has a stable id so push tracking is idempotent.
export interface EstateRecommendation {
  id: string;
  category: "gift" | "note_sale" | "li_purchase" | "trust_setup" | "review";
  label: string;
  description: string;
  estimated_tax_savings_cents: number; // 0 if not applicable
  year_offset: number; // 0 = this year, 1 = next year, etc
}

export interface EstateAiSuggestions {
  // Placeholder — Estate Lens is $0 LLM by design; this field exists to
  // mirror the cash-flow shape for future symmetry and is always null.
  reserved: null;
}

export interface EstateLensOutput {
  schema_version: 1;
  client_snapshot: EstateClientSnapshot;
  scenario_name: string;
  scenario_description: string;
  assumptions: EstateAssumptions;
  assets_out: AssetsOutOfEstate;
  planning_move: PlanningMove;
  life_insurance: LifeInsurancePlan;
  recommendations: EstateRecommendation[];
  ai_suggestions: EstateAiSuggestions;
  pushed_action_item_ids: string[];
  linked_to_main_plan: boolean;
  tracking_id: string; // compliance tracking, displayed on every screen + PDF
}

// ────────────────────────────────────────────────────────────────────────
// Defaults — used when lens is first created. Match screenshot defaults.
// ────────────────────────────────────────────────────────────────────────

const DEFAULT_SCENARIO_NAME = "Estate Plan — Scenario 1";

function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

export function defaultEstateOutput(args: {
  household_name: string;
  archetype: string | null;
  state_code: string | null;
  scenario_name?: string;
  tracking_id?: string;
}): EstateLensOutput {
  // Default state estate tax rate: pull from lookup if state is set.
  // Defer import to keep type module dependency-free.
  return {
    schema_version: 1,
    client_snapshot: {
      household_name: args.household_name,
      archetype: args.archetype,
      state_code: args.state_code,
    },
    scenario_name: args.scenario_name ?? DEFAULT_SCENARIO_NAME,
    scenario_description: "Current trajectory · federal estate tax + cap gains on liquidation.",
    assumptions: {
      estate_today_cents: dollarsToCents(100_000_000),
      annual_spend_cents: dollarsToCents(2_000_000),
      growth_rate_pct: 7,
      years_out: 30,
      combined_exemption_cents: dollarsToCents(30_000_000),
      exemption_inflation_pct: 3,
      estate_tax_rate_pct: 40,
      client_age_today: 55,
      state_estate_tax_pct: 0,
    },
    assets_out: {
      fmv_out_today_cents: 0,
      cost_basis_cents: 0,
      pct_liquidated_at_death: 20,
      federal_ltcg_pct: 20,
      niit_pct: 3.8,
      state_ltcg_pct: 0,
    },
    planning_move: {
      type: "note_sale",
      fmv_transferred_cents: dollarsToCents(75_000_000),
      original_cost_basis_cents: dollarsToCents(10_000_000),
      valuation_discount_pct: 25,
      afr_rate_pct: 4.5,
      trust_growth_pct: 7,
      years_to_liquidation: 30,
      pct_liquidated_at_death: 20,
      federal_ltcg_pct: 20,
      niit_pct: 3.8,
      state_ltcg_pct: 0,
    },
    life_insurance: {
      annual_premium_cents: dollarsToCents(2_000_000),
      years_of_premium: 10,
      death_benefit_cents: dollarsToCents(100_000_000),
      self_insure_growth_pct: 7,
    },
    recommendations: [],
    ai_suggestions: { reserved: null },
    pushed_action_item_ids: [],
    linked_to_main_plan: false,
    tracking_id: args.tracking_id ?? generateTrackingId(),
  };
}

// Tracking ID format: CRN + YYYYMM + 7-digit sequence. v1 uses a random
// 7-digit suffix; advisor can override via a v1.5+ admin UI.
export function generateTrackingId(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0");
  return `CRN${yyyymm}-${seq}`;
}

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────

export function isEstateLensOutput(value: unknown): value is EstateLensOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<EstateLensOutput>;
  return v.schema_version === 1 && !!v.assumptions && !!v.planning_move;
}

export interface PushedActionItem extends ActionItem {
  source_lens_run_id: string;
}
