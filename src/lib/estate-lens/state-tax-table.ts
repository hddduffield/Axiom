// Phase 14.1 — State estate / inheritance tax lookup table.
//
// Hard-coded snapshot of state-level estate and inheritance tax exposure
// as of 2026. Values are derived from publicly-published state Department
// of Revenue rates and AICPA/Hodgson Russ compilations. Refresh annually.
//
// Rate convention: rate_pct is the TOP MARGINAL rate (the worst case for
// taxable estates large enough to hit the top bracket — appropriate for
// PSA's client base of HNW estates). Real progressive bracket schedules
// produce slightly lower effective rates; the v1 implementation
// intentionally over-estimates to be conservative.
//
// Exemption convention: exemption_amount is the per-decedent exemption
// in dollars (NOT cents). $0 means no exemption beyond federal.
//
// has_inheritance_tax: flags states that levy a separate INHERITANCE tax
// on the beneficiary (not the estate). Six states (IA, KY, MD, NE, NJ,
// PA) have or had inheritance taxes; IA fully repealed effective 2025.
// v1 surfaces this as a flag only — the inheritance-tax math is NOT
// computed; advisor must add notes manually.
//
// SOURCES:
// - AICPA "State Estate, Inheritance, and Gift Tax Chart" (2026 edition)
// - https://www.dor.state.ma.us/ (Massachusetts DOR)
// - https://otr.cfo.dc.gov/ (DC Office of Tax and Revenue)
// - Hodgson Russ State Estate Tax Tracker (annual update, January)
// - https://taxfoundation.org/data/state/estate-inheritance-tax-2024/
// - Maine Title 36 §4102 (Maine exemption schedule)
// - NY Tax Law §952 (New York cliff exemption)
//
// VERIFY before client delivery: these rates change frequently. Confirm
// against the relevant state Department of Revenue before any planning
// estimate is shared with the client.

export interface StateEstateTaxEntry {
  rate_pct: number; // 0-100 — top marginal estate tax rate
  exemption_amount: number; // dollars (not cents) — per-decedent state exemption
  has_inheritance_tax: boolean;
  sources: string[];
}

export const STATE_ESTATE_TAX_RATES: Record<string, StateEstateTaxEntry> = {
  // ─── States with NO estate or inheritance tax ───
  AL: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  AK: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  AZ: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  AR: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  CA: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  CO: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  DE: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  FL: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  GA: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  ID: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  IN: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  IA: {
    rate_pct: 0,
    exemption_amount: 0,
    has_inheritance_tax: false, // Inheritance tax FULLY repealed effective 2025
    sources: ["Iowa SF 619 (2021), full repeal effective 2025"],
  },
  KS: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  KY: {
    rate_pct: 0,
    exemption_amount: 0,
    has_inheritance_tax: true,
    sources: ["KRS Chapter 140 — inheritance tax on non-Class A beneficiaries"],
  },
  LA: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  MI: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  MS: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  MO: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  MT: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  NV: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  NH: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  NM: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  NC: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  ND: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  OH: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  OK: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  SC: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  SD: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  TN: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  TX: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  UT: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  VA: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  WV: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  WI: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },
  WY: { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] },

  // ─── States WITH estate tax ───
  CT: {
    rate_pct: 12,
    exemption_amount: 13_610_000, // 2024 — pegged to federal exemption
    has_inheritance_tax: false,
    sources: [
      "CT Gen. Stat. §12-391 — top rate 12% over $9.1M taxable",
      "Conn. exemption pegged to federal basic exclusion; cap $15M tax",
    ],
  },
  DC: {
    rate_pct: 16,
    exemption_amount: 4_710_800, // 2024 indexed value
    has_inheritance_tax: false,
    sources: [
      "DC Code §47-3702",
      "Top rate 16% on taxable estates over $10M",
    ],
  },
  HI: {
    rate_pct: 20,
    exemption_amount: 5_490_000,
    has_inheritance_tax: false,
    sources: [
      "HRS Chapter 236E",
      "Top rate 20% on taxable estates over $10M (2024)",
    ],
  },
  IL: {
    rate_pct: 16,
    exemption_amount: 4_000_000,
    has_inheritance_tax: false,
    sources: [
      "35 ILCS 405 — Illinois Estate and Generation-Skipping Transfer Tax Act",
      "Hard $4M exemption (NOT indexed); top rate 16%",
    ],
  },
  ME: {
    rate_pct: 12,
    exemption_amount: 6_800_000,
    has_inheritance_tax: false,
    sources: [
      "Maine Title 36 §4102",
      "Indexed annually; top rate 12% on taxable estates over $9M above exemption",
    ],
  },
  MD: {
    rate_pct: 16,
    exemption_amount: 5_000_000,
    has_inheritance_tax: true,
    sources: [
      "Md. Tax-Gen. §7-309 — estate tax",
      "Md. Tax-Gen. §7-204 — inheritance tax on non-lineal beneficiaries",
      "Maryland is one of TWO states with both estate AND inheritance tax",
    ],
  },
  MA: {
    rate_pct: 16,
    exemption_amount: 2_000_000,
    has_inheritance_tax: false,
    sources: [
      "M.G.L. c. 65C",
      "2023 reform: exemption raised from $1M to $2M effective 2023",
      "Top rate 16% on taxable estates over $10.04M above exemption",
    ],
  },
  MN: {
    rate_pct: 16,
    exemption_amount: 3_000_000,
    has_inheritance_tax: false,
    sources: [
      "Minn. Stat. §291.005",
      "Hard $3M exemption; top rate 16% on estates over $10M",
    ],
  },
  NE: {
    rate_pct: 0,
    exemption_amount: 0,
    has_inheritance_tax: true,
    sources: [
      "Neb. Rev. Stat. §77-2001",
      "County-level inheritance tax; rate varies by relationship to decedent",
    ],
  },
  NJ: {
    rate_pct: 0,
    exemption_amount: 0,
    has_inheritance_tax: true,
    sources: [
      "N.J.S.A. §54:33-1",
      "Estate tax repealed 2018; inheritance tax remains on Class C-D beneficiaries",
    ],
  },
  NY: {
    rate_pct: 16,
    exemption_amount: 6_940_000, // 2024 indexed value
    has_inheritance_tax: false,
    sources: [
      "NY Tax Law §952",
      "CLIFF: if taxable estate > 105% of exemption, ENTIRE estate is taxed (no exemption deduction). v1 math approximates non-cliff above exemption.",
      "Indexed annually with inflation",
    ],
  },
  OR: {
    rate_pct: 16,
    exemption_amount: 1_000_000,
    has_inheritance_tax: false,
    sources: [
      "ORS §118",
      "Lowest exemption in the US: $1M; top rate 16%",
    ],
  },
  PA: {
    rate_pct: 0,
    exemption_amount: 0,
    has_inheritance_tax: true,
    sources: [
      "72 Pa. Cons. Stat. §9101 et seq.",
      "Inheritance tax on direct descendants 4.5%, siblings 12%, others 15%",
    ],
  },
  RI: {
    rate_pct: 16,
    exemption_amount: 1_774_583, // 2024 indexed value
    has_inheritance_tax: false,
    sources: [
      "R.I. Gen. Laws §44-22-1",
      "Indexed annually; top rate 16%",
    ],
  },
  VT: {
    rate_pct: 16,
    exemption_amount: 5_000_000,
    has_inheritance_tax: false,
    sources: [
      "32 V.S.A. §7442a",
      "Flat $5M exemption; top rate 16%",
    ],
  },
  WA: {
    rate_pct: 20,
    exemption_amount: 2_193_000,
    has_inheritance_tax: false,
    sources: [
      "RCW 83.100",
      "Top rate 20% on taxable estates over $9M; highest top rate in US",
    ],
  },
};

export const STATE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "AL", label: "Alabama" },
  { code: "AK", label: "Alaska" },
  { code: "AZ", label: "Arizona" },
  { code: "AR", label: "Arkansas" },
  { code: "CA", label: "California" },
  { code: "CO", label: "Colorado" },
  { code: "CT", label: "Connecticut" },
  { code: "DE", label: "Delaware" },
  { code: "DC", label: "District of Columbia" },
  { code: "FL", label: "Florida" },
  { code: "GA", label: "Georgia" },
  { code: "HI", label: "Hawaii" },
  { code: "ID", label: "Idaho" },
  { code: "IL", label: "Illinois" },
  { code: "IN", label: "Indiana" },
  { code: "IA", label: "Iowa" },
  { code: "KS", label: "Kansas" },
  { code: "KY", label: "Kentucky" },
  { code: "LA", label: "Louisiana" },
  { code: "ME", label: "Maine" },
  { code: "MD", label: "Maryland" },
  { code: "MA", label: "Massachusetts" },
  { code: "MI", label: "Michigan" },
  { code: "MN", label: "Minnesota" },
  { code: "MS", label: "Mississippi" },
  { code: "MO", label: "Missouri" },
  { code: "MT", label: "Montana" },
  { code: "NE", label: "Nebraska" },
  { code: "NV", label: "Nevada" },
  { code: "NH", label: "New Hampshire" },
  { code: "NJ", label: "New Jersey" },
  { code: "NM", label: "New Mexico" },
  { code: "NY", label: "New York" },
  { code: "NC", label: "North Carolina" },
  { code: "ND", label: "North Dakota" },
  { code: "OH", label: "Ohio" },
  { code: "OK", label: "Oklahoma" },
  { code: "OR", label: "Oregon" },
  { code: "PA", label: "Pennsylvania" },
  { code: "RI", label: "Rhode Island" },
  { code: "SC", label: "South Carolina" },
  { code: "SD", label: "South Dakota" },
  { code: "TN", label: "Tennessee" },
  { code: "TX", label: "Texas" },
  { code: "UT", label: "Utah" },
  { code: "VT", label: "Vermont" },
  { code: "VA", label: "Virginia" },
  { code: "WA", label: "Washington" },
  { code: "WV", label: "West Virginia" },
  { code: "WI", label: "Wisconsin" },
  { code: "WY", label: "Wyoming" },
];

export function lookupStateEstateTax(stateCode: string | null | undefined): StateEstateTaxEntry {
  if (!stateCode) {
    return { rate_pct: 0, exemption_amount: 0, has_inheritance_tax: false, sources: [] };
  }
  return (
    STATE_ESTATE_TAX_RATES[stateCode.toUpperCase()] ?? {
      rate_pct: 0,
      exemption_amount: 0,
      has_inheritance_tax: false,
      sources: [],
    }
  );
}
