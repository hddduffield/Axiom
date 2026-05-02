// Build, validate, and persist the hand-authored Holloway SelectedRecommendations
// fixture. Phase 2 (manual) replacement for the failed Stage 2 LLM attempt.

import {
  SelectedRecommendationsSchema,
  validateCrossReferences,
  type SelectedRecommendation,
  type SupplementalCandidate,
  type SpeculativeDropped,
} from "../src/lib/orchestrator/schemas/selectedRecommendations";
import { writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

type RawCategory =
  | "entity_structure"
  | "estate"
  | "tax"
  | "risk_insurance"
  | "succession_retention"
  | "investment"
  | "retirement"
  | "family"
  | "charitable"
  | "specialty";

const CATEGORY_MAP: Record<RawCategory, SelectedRecommendation["category"]> = {
  entity_structure: "Entity Structure",
  estate: "Estate",
  tax: "Tax",
  risk_insurance: "Risk & Insurance",
  succession_retention: "Succession & Continuity",
  investment: "Investment",
  retirement: "Retirement",
  family: "Family",
  charitable: "Charitable",
  specialty: "Specialty",
};

interface RawSelected {
  id: string;
  cat: RawCategory;
  match: "strong" | "borderline";
  rationale: string;
  matched: string[];
  partial?: string[];
  after?: string[];
  before?: string[];
  seq?: string[];
  coord?: string[];
  excl?: string[];
}

const REC_ID_RE = /^REC-[A-Z]{3}-\d{3}$/;

const toRefs = (ids: string[] | undefined) =>
  (ids ?? [])
    .filter((id) => REC_ID_RE.test(id))
    .map((id) => ({ recommendation_id: id }));

const buildSelected = (raw: RawSelected): SelectedRecommendation => ({
  recommendation_id: raw.id,
  category: CATEGORY_MAP[raw.cat],
  match_strength: raw.match,
  triggers_matched: raw.matched,
  triggers_partial: raw.partial ?? [],
  must_come_after: toRefs(raw.after),
  must_come_before: toRefs(raw.before),
  sequenced_with: toRefs(raw.seq),
  coordinated_with: toRefs(raw.coord),
  mutually_exclusive_with: toRefs(raw.excl),
  preliminary_preference: null,
  preliminary_preference_rationale: null,
  landmine: false,
  landmine_status: "not_a_landmine",
  brief_rationale: raw.rationale,
});

// ────────────────────────────────────────────────────────────────────────
// SELECTED (target 80 — exceeds schema cap of 30; will be flagged)
// ────────────────────────────────────────────────────────────────────────

const SELECTED_RAW: RawSelected[] = [
  // Entity Structure (5)
  {
    id: "REC-ENT-001",
    cat: "entity_structure",
    match: "strong",
    rationale: "Real estate inside operating LLC; pre-exit window",
    matched: ["RE in op LLC", "transaction window", "$4.2M facility"],
    before: ["REC-ENT-002"],
  },
  {
    id: "REC-ENT-002",
    cat: "entity_structure",
    match: "strong",
    rationale: "S-Corp pass-through, no holdco; pre-exit + estate goals",
    matched: ["S-Corp", "no holdco", "pre-exit", "estate goal"],
    after: ["REC-ENT-001"],
    before: ["REC-ENT-003", "REC-EST-006", "REC-EST-008"],
    seq: ["REC-ENT-003"],
    coord: ["REC-TAX-008", "REC-FAM-003"],
  },
  {
    id: "REC-ENT-003",
    cat: "entity_structure",
    match: "strong",
    rationale: "Estate >$11M; recap creates non-voting interest for transfers",
    matched: ["estate >exemption", "GRAT planned", "owner retains control"],
    after: ["REC-ENT-002"],
    before: ["REC-EST-006", "REC-EST-008"],
    seq: ["REC-ENT-002"],
  },
  {
    id: "REC-ENT-004",
    cat: "entity_structure",
    match: "strong",
    rationale: "12-yr-old form OA; ownership changed (Derek 12%); restructuring",
    matched: ["form OA", "12 yrs old", "Derek 12%", "restructuring"],
    coord: ["REC-RSK-001", "REC-SUC-008"],
  },
  {
    id: "REC-ENT-007",
    cat: "entity_structure",
    match: "strong",
    rationale: "Annual review cycle; long-running annually",
    matched: ["annual cycle"],
  },

  // Estate (11)
  {
    id: "REC-EST-001",
    cat: "estate",
    match: "strong",
    rationale: "Married, no trust, NW $33-46M; foundation document",
    matched: ["married", "no trust", "NW >$1M"],
    before: ["REC-EST-002"],
    coord: ["REC-SPC-001"],
  },
  {
    id: "REC-EST-002",
    cat: "estate",
    match: "strong",
    rationale: "Stale 2014 wills; no DPOA/HC directive/HIPAA; Sophie no guardian",
    matched: ["wills 12yrs stale", "no DPOA", "no HIPAA", "Sophie no guardian"],
    after: ["REC-EST-001"],
  },
  {
    id: "REC-EST-003",
    cat: "estate",
    match: "strong",
    rationale: "$11M+ estate exposure; HNW; no systematic gifting program",
    matched: ["estate >exemption", "HNW", "no gifting"],
    coord: ["REC-FAM-001", "REC-CHR-002", "REC-CHR-003"],
  },
  {
    id: "REC-EST-004",
    cat: "estate",
    match: "strong",
    rationale: "ILIT for buy/sell + estate liquidity; existing $2M term not in trust",
    matched: ["estate >exemption", "buy/sell planned", "no ILIT"],
    coord: ["REC-RSK-001", "REC-RSK-004", "REC-RSK-012", "REC-SPC-006"],
  },
  {
    id: "REC-EST-005",
    cat: "estate",
    match: "strong",
    rationale: "3 children; hard rule no unrestricted before 35",
    matched: ["3 children", "estate >exemption", "no <35 access"],
    before: ["REC-EST-006", "REC-EST-008"],
  },
  {
    id: "REC-EST-006",
    cat: "estate",
    match: "strong",
    rationale: "GRAT for non-voting interest; Marcus excellent health",
    matched: ["holdco+recap", "estate >exemption", "good health"],
    after: ["REC-ENT-002", "REC-ENT-003", "REC-EST-005"],
    seq: ["REC-EST-008"],
  },
  {
    id: "REC-EST-008",
    cat: "estate",
    match: "strong",
    rationale: "IDGT sale; recap done; trust seeded for non-voting transfer",
    matched: ["recap done", "good health", "growth above AFR"],
    after: ["REC-ENT-003", "REC-EST-005"],
    seq: ["REC-EST-006"],
  },
  {
    id: "REC-EST-009",
    cat: "estate",
    match: "strong",
    rationale: "SLAT: stable marriage, both citizens, exemption available",
    matched: ["married", "US citizens", "exemption avail"],
  },
  {
    id: "REC-EST-012",
    cat: "estate",
    match: "strong",
    rationale: "Dynasty/GST allocation to children's trusts",
    matched: ["estate >exemption", "multi-gen intent"],
  },
  {
    id: "REC-EST-011",
    cat: "estate",
    match: "borderline",
    rationale: "QPRT borderline; depends on Catherine RE intent",
    matched: ["primary res >$2M", "good health"],
    partial: ["RE intent uncertain"],
  },
  {
    id: "REC-EST-020",
    cat: "estate",
    match: "strong",
    rationale: "No beneficiary review since 2014",
    matched: ["plan updates", "stale review"],
    coord: ["REC-EST-001", "REC-EST-002"],
  },

  // Tax (11)
  {
    id: "REC-TAX-001",
    cat: "tax",
    match: "strong",
    rationale: "GA S-Corp; PTET not elected; AGI $3.6M; ~$130-160K/yr savings",
    matched: ["GA S-Corp", "PTET unelected", "AGI >$500K"],
    coord: ["REC-TAX-002", "REC-TAX-010"],
  },
  {
    id: "REC-TAX-002",
    cat: "tax",
    match: "strong",
    rationale: "S-Corp; W-2 $480K; QBI not optimized; cash-balance pending",
    matched: ["S-Corp", "W-2 >$100K", "23% CAGR"],
    coord: ["REC-TAX-001", "REC-RET-002"],
  },
  {
    id: "REC-TAX-003",
    cat: "tax",
    match: "strong",
    rationale: "Catherine $0 W-2; legit role; enables 401k+DI+children Roth path",
    matched: ["Catherine $0 W-2", "marketing prior", "minor children"],
    before: ["REC-TAX-004", "REC-RET-005"],
  },
  {
    id: "REC-TAX-004",
    cat: "tax",
    match: "strong",
    rationale: "James 16 + Olivia 19 eligible; FICA-free via family-mgmt LLC",
    matched: ["business owner", "minor children", "high income"],
    after: ["REC-ENT-002", "REC-TAX-003"],
    coord: ["REC-FAM-003"],
  },
  {
    id: "REC-TAX-005",
    cat: "tax",
    match: "strong",
    rationale: "Augusta Rule 14-day; HQ + Blue Ridge; high income; non-SSTB",
    matched: ["business", "primary res", "high income"],
  },
  {
    id: "REC-TAX-006",
    cat: "tax",
    match: "strong",
    rationale: "Cost seg post-RE-separation; pre-2025 PIS phase-down to 20% bonus",
    matched: ["$1M+ basis", "no prior study"],
    partial: ["pre-2025 PIS"],
    after: ["REC-ENT-001"],
    before: ["REC-TAX-007"],
  },
  {
    id: "REC-TAX-007",
    cat: "tax",
    match: "strong",
    rationale: "§469 grouping post-RE-separation; both activities mat. participation",
    matched: ["RE+business", "mat. participation", "cost seg planned"],
    after: ["REC-ENT-001", "REC-TAX-006"],
  },
  {
    id: "REC-TAX-008",
    cat: "tax",
    match: "strong",
    rationale: "§1202 evaluation; non-SSTB; assets <$75M; 3-5yr window borderline",
    matched: ["holdco path", "non-SSTB", "<$75M assets"],
    after: ["REC-ENT-002"],
  },
  {
    id: "REC-TAX-009",
    cat: "tax",
    match: "strong",
    rationale: "R&D for engineered systems; $42.8M rev; never pursued",
    matched: ["business", "no prior R&D", "engineering work"],
  },
  {
    id: "REC-TAX-010",
    cat: "tax",
    match: "strong",
    rationale: "PTET + cost seg + cash-balance change tax structure materially",
    matched: [">20% income change", "structure change"],
    after: ["REC-TAX-001"],
  },
  {
    id: "REC-TAX-011",
    cat: "tax",
    match: "borderline",
    rationale: "HIS multi-state nexus (5+ states); residence stable",
    matched: ["multi-state biz"],
    partial: ["no residence change"],
  },

  // Risk & Insurance (10)
  {
    id: "REC-RSK-001",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Cross-purchase 2-owner; both insurable; goal #2 take care of Derek",
    matched: ["2 owners", "no buy/sell", "insurable"],
    coord: ["REC-EST-004", "REC-ENT-004", "REC-RSK-007"],
  },
  {
    id: "REC-RSK-004",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Estate liquidity life; $11M+ exposure; ILIT-owned",
    matched: ["HNW", "estate >exemption", "insurable"],
    coord: ["REC-EST-004"],
  },
  {
    id: "REC-RSK-005",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Group LTD inadequate; K-1 dominates; max-issue ind DI",
    matched: ["business", "K-1 dominant", "active operator", "age 52"],
    coord: ["REC-RSK-006"],
  },
  {
    id: "REC-RSK-006",
    cat: "risk_insurance",
    match: "strong",
    rationale: "BOE; Marcus founder/CEO; $4M revolver + 87 FTE overhead",
    matched: ["owner-operator", "fixed overhead"],
    coord: ["REC-RSK-005"],
  },
  {
    id: "REC-RSK-007",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Key person on Derek + controller; gap; replacement cost real",
    matched: ["key employee", "no key person cov"],
    coord: ["REC-RSK-001"],
  },
  {
    id: "REC-RSK-008",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Umbrella $2M inadequate for $33-46M NW; layered to $35-50M",
    matched: ["NW >$5M", "umbrella inadequate"],
    after: ["REC-RSK-010"],
  },
  {
    id: "REC-RSK-010",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Auto $250/$250 sub-umbrella mismatch",
    matched: ["annual review", "umbrella underlying"],
  },
  {
    id: "REC-RSK-012",
    cat: "risk_insurance",
    match: "borderline",
    rationale: "Hybrid LTC life; Marcus 52, Catherine 49; eliminates use-or-lose",
    matched: ["age 50+", "LTC need real"],
    partial: ["NW>$15M self-fund alt"],
    coord: ["REC-EST-004"],
  },
  {
    id: "REC-RSK-017",
    cat: "risk_insurance",
    match: "strong",
    rationale: "Cyber $1M underinsured given hyperscale customer mix",
    matched: ["business", "PII handling", "cyber inadequate"],
  },
  {
    id: "REC-RSK-018",
    cat: "risk_insurance",
    match: "borderline",
    rationale: "Catherine 2 nonprofit boards; verify entity D&O adequacy",
    matched: ["board service"],
    partial: ["entity cov verify needed"],
  },

  // Succession & Continuity (11)
  {
    id: "REC-SUC-002",
    cat: "succession_retention",
    match: "strong",
    rationale: "Stay bonus pre-LOI; Derek+controller+lead estimators retention",
    matched: ["pre-exit", "key employees", "no retention pkg"],
  },
  {
    id: "REC-SUC-007",
    cat: "succession_retention",
    match: "strong",
    rationale: "Profits interest grants for additional key employees beyond Derek",
    matched: ["LLC", "actual equity desired"],
    coord: ["REC-ENT-002"],
  },
  {
    id: "REC-SUC-008",
    cat: "succession_retention",
    match: "strong",
    rationale: "Formalize Derek economics; possible additional grant pre-transaction",
    matched: ["operating partner", "owner willing"],
    coord: ["REC-RSK-001", "REC-ENT-004"],
  },
  {
    id: "REC-SUC-010",
    cat: "succession_retention",
    match: "strong",
    rationale: "QofE never performed; $42.8M rev; T-12mo engagement",
    matched: ["pre-exit", "no QofE", "$10M+ rev"],
    before: ["REC-SUC-011"],
    after: ["REC-SUC-012"],
  },
  {
    id: "REC-SUC-011",
    cat: "succession_retention",
    match: "strong",
    rationale: "Boutique M&A intermediary; $6.4M EBITDA fits LMM scope",
    matched: ["pre-exit", "no banker", "lower-mid-market"],
    after: ["REC-SUC-010"],
  },
  {
    id: "REC-SUC-012",
    cat: "succession_retention",
    match: "strong",
    rationale: "Fractional CFO; no internal CFO; $42.8M rev; multi-entity restructuring",
    matched: ["business", "no CFO", "complex restructuring"],
    before: ["REC-SUC-010"],
  },
  {
    id: "REC-SUC-013",
    cat: "succession_retention",
    match: "strong",
    rationale: "Mgmt bench: identify COO+sales+CFO permanentize over 18-24mo",
    matched: ["owner critical", "pre-exit", "team gaps"],
  },
  {
    id: "REC-SUC-015",
    cat: "succession_retention",
    match: "strong",
    rationale: "Written succession doc; complement to buy/sell mechanics",
    matched: ["business", "no plan", "owner critical"],
    coord: ["REC-RSK-001", "REC-RSK-005", "REC-RSK-006"],
  },
  {
    id: "REC-SUC-016",
    cat: "succession_retention",
    match: "strong",
    rationale: "Top 3 = 47%; single = 22%; valuation discount risk 20-40%",
    matched: ["business", "concentration >40%", ">12mo window"],
  },
  {
    id: "REC-SUC-001",
    cat: "succession_retention",
    match: "borderline",
    rationale: "SERP for Derek+controller; design accommodate transaction continuity",
    matched: ["business", "key employees", "no SERP"],
    partial: ["transaction complexity"],
    coord: ["REC-RSK-001", "REC-RET-002"],
  },
  {
    id: "REC-SUC-004",
    cat: "succession_retention",
    match: "borderline",
    rationale: "Restricted §162 as one option in retention vehicle stack",
    matched: ["§162 desired", "vesting needed"],
    partial: ["competing vehicles"],
    coord: ["REC-SUC-001", "REC-SUC-007"],
  },

  // Investment (8)
  {
    id: "REC-INV-001",
    cat: "investment",
    match: "strong",
    rationale: "Tiered business cash structure; Truist op + reserve + strategic",
    matched: ["business", "idle cash", "low yield"],
    coord: ["REC-SUC-010"],
  },
  {
    id: "REC-INV-002",
    cat: "investment",
    match: "strong",
    rationale: "Personal cash $310K; layer between operating/emergency/near-term/invested",
    matched: ["cash >$250K", "no layering"],
    coord: ["REC-INV-005"],
  },
  {
    id: "REC-INV-003",
    cat: "investment",
    match: "strong",
    rationale: "$1.8M brokerage; top bracket; DI replaces index funds; 50-100bps alpha",
    matched: ["taxable >$1M", "32%+ bracket", "long horizon"],
    before: ["REC-INV-007"],
  },
  {
    id: "REC-INV-004",
    cat: "investment",
    match: "strong",
    rationale: "$1.8M tax + $1.26M ret; sub-optimal placement; 50-100bps alpha",
    matched: ["mixed accts", "multi-asset class"],
    coord: ["REC-INV-003"],
  },
  {
    id: "REC-INV-005",
    cat: "investment",
    match: "strong",
    rationale: "60-85% concentration in HIS; pre-exit; discipline avoid sector add",
    matched: ["pre-exit", "concentration >50%", ">1yr window"],
  },
  {
    id: "REC-INV-007",
    cat: "investment",
    match: "strong",
    rationale: "TLH coordination above DI; covers transition + non-DI holdings",
    matched: ["taxable >$250K", "high bracket"],
    coord: ["REC-INV-003"],
  },
  {
    id: "REC-INV-010",
    cat: "investment",
    match: "strong",
    rationale: "Muni allocation in taxable fixed-income sleeve as portfolio scales",
    matched: ["32%+ bracket", "FI in taxable"],
    coord: ["REC-INV-004"],
  },
  {
    id: "REC-INV-009",
    cat: "investment",
    match: "borderline",
    rationale: "Treasury holdings via Schwab; treasurydirect platform optional",
    matched: ["idle cash", "GA tax exempt"],
    partial: ["MMF practical alt"],
    coord: ["REC-INV-001", "REC-INV-002"],
  },

  // Retirement (8)
  {
    id: "REC-RET-001",
    cat: "retirement",
    match: "strong",
    rationale: "Confirm 2026 max $32,500; Catherine 401k post-payroll; SECURE2.0 catch-up",
    matched: ["business", "401k in place", "spouse via REC-TAX-003"],
    coord: ["REC-TAX-003", "REC-RET-007", "REC-RET-010"],
  },
  {
    id: "REC-RET-002",
    cat: "retirement",
    match: "strong",
    rationale: "Cash-balance; Marcus 52; $200-300K/yr deductible; transaction termination plan",
    matched: ["business", "age 45+", "stable cash flow", "401k maxed"],
    coord: ["REC-TAX-002", "REC-RET-003", "REC-RET-009"],
  },
  {
    id: "REC-RET-003",
    cat: "retirement",
    match: "strong",
    rationale: "Cross-tested PSP layered with cash-balance; 87 FTE workforce supports",
    matched: ["age 40+", "workforce composition", "no current PSP"],
    coord: ["REC-RET-002"],
  },
  {
    id: "REC-RET-007",
    cat: "retirement",
    match: "strong",
    rationale: "Plan amendment for Roth/after-tax/in-service; precondition for 001+004+010",
    matched: ["plan lacks features", "SECURE 2.0 mandate"],
    before: ["REC-RET-001", "REC-RET-004", "REC-RET-010"],
    coord: ["REC-RET-008"],
  },
  {
    id: "REC-RET-010",
    cat: "retirement",
    match: "strong",
    rationale: "SECURE 2.0 Roth catch-up; W-2 $480K above $150K; 2026 effective",
    matched: ["W-2 >$150K", "age 50+"],
    after: ["REC-RET-007"],
  },
  {
    id: "REC-RET-004",
    cat: "retirement",
    match: "borderline",
    rationale: "Mega-backdoor conditional on plan amendment; modest scale vs cash-balance",
    matched: ["401k in place", "cash flow"],
    partial: ["plan amendment needed"],
    after: ["REC-RET-007"],
  },
  {
    id: "REC-RET-005",
    cat: "retirement",
    match: "borderline",
    rationale: "Backdoor Roth Marcus immediate; Catherine pro-rata barrier from $340K IRA",
    matched: ["income >phase-out", "earned income"],
    partial: ["Catherine pro-rata"],
    after: ["REC-TAX-003"],
  },
  {
    id: "REC-RET-008",
    cat: "retirement",
    match: "borderline",
    rationale: "Plan restatement bundled with TPA engagement + amendment work",
    matched: ["plan in place", "SECURE 2.0 changes"],
    partial: ["restatement timing TBD"],
    coord: ["REC-RET-007"],
  },
  {
    id: "REC-RET-009",
    cat: "retirement",
    match: "borderline",
    rationale: "Cash-balance termination at tx close; coordinate timing pre/post-LOI",
    matched: ["DB plan in place", "approaching transaction"],
    partial: ["timing TBD"],
    coord: ["REC-RET-002"],
  },

  // Family (7)
  {
    id: "REC-FAM-001",
    cat: "family",
    match: "strong",
    rationale: "529 for 3 kids; 5-yr front-load $190K each for Sophie+James",
    matched: ["3 children", "exclusion capacity"],
    coord: ["REC-EST-003"],
  },
  {
    id: "REC-FAM-002",
    cat: "family",
    match: "strong",
    rationale: "529-to-Roth rollover; 15-yr clock from new 529s; build into design",
    matched: ["future 529s", "earned income kids"],
    after: ["REC-FAM-001"],
    coord: ["REC-FAM-003"],
  },
  {
    id: "REC-FAM-003",
    cat: "family",
    match: "strong",
    rationale: "Custodial Roth James+Olivia; FICA-free via family-mgmt LLC",
    matched: ["family business", "kids work eligible"],
    after: ["REC-ENT-002"],
    coord: ["REC-TAX-004"],
  },
  {
    id: "REC-FAM-005",
    cat: "family",
    match: "strong",
    rationale: "Eleanor 78 anticipated 5-10yr support; verify LTC + model costs",
    matched: ["aging parent", "expects support", "no LTC plan"],
  },
  {
    id: "REC-FAM-007",
    cat: "family",
    match: "strong",
    rationale: "Annual family meeting cadence; foundation governance prep by yr 5",
    matched: ["multi-gen wealth", "adult kids approaching"],
    coord: ["REC-FAM-008", "REC-CHR-007"],
  },
  {
    id: "REC-FAM-008",
    cat: "family",
    match: "strong",
    rationale: "Multi-yr financial education; age-scaled curriculum 3 kids",
    matched: ["kids near distribution", "material stake"],
    coord: ["REC-FAM-007", "REC-EST-005", "REC-CHR-007"],
  },
  {
    id: "REC-FAM-006",
    cat: "family",
    match: "borderline",
    rationale: "Mission statement codifying values; engage facilitator",
    matched: ["multi-gen >$10M", "values articulated"],
    partial: ["facilitator availability"],
    before: ["REC-FAM-007"],
  },

  // Charitable (6)
  {
    id: "REC-CHR-001",
    cat: "charitable",
    match: "strong",
    rationale: "DAF year 1; major funding pre-transaction with appreciated stock",
    matched: ["charitable goal", "32%+ bracket", "lump-sum capacity"],
    before: ["REC-CHR-002"],
  },
  {
    id: "REC-CHR-002",
    cat: "charitable",
    match: "strong",
    rationale: "Pre-LOI gift of non-voting Holdco units; $900K-$2.4M tax savings",
    matched: ["pre-exit", "charitable goal", "holdco+recap"],
    after: ["REC-ENT-002", "REC-ENT-003", "REC-CHR-001"],
  },
  {
    id: "REC-CHR-003",
    cat: "charitable",
    match: "strong",
    rationale: "CRUT funded with non-voting units; income + remainder + cap gain defer",
    matched: ["appreciated asset", "income+charity desire"],
    after: ["REC-ENT-003"],
    coord: ["REC-SPC-002", "REC-SPC-006"],
  },
  {
    id: "REC-CHR-007",
    cat: "charitable",
    match: "strong",
    rationale: "Family foundation post-liquidity with kids governance; hard-rule client goal",
    matched: ["liquidity >$25M", "charitable scale", "family engaged"],
    coord: ["REC-FAM-007", "REC-FAM-008", "REC-CHR-008"],
  },
  {
    id: "REC-CHR-005",
    cat: "charitable",
    match: "borderline",
    rationale: "CLAT alt for portion of estate transfer; competing with GRAT/IDGT",
    matched: ["estate exposure", "charitable lead intent"],
    partial: ["§7520 sensitivity"],
    coord: ["REC-EST-006", "REC-EST-008"],
  },
  {
    id: "REC-CHR-008",
    cat: "charitable",
    match: "borderline",
    rationale: "DAF→foundation transition or parallel structure",
    matched: ["DAF in place", "scale justifies"],
    partial: ["parallel vs transition"],
    coord: ["REC-CHR-001", "REC-CHR-007"],
  },

  // Specialty (3)
  {
    id: "REC-SPC-001",
    cat: "specialty",
    match: "strong",
    rationale: "Trust situs DE/SD for long-duration trusts; GA for grantor trusts",
    matched: ["trust funding $5M+", "multi-gen", "asset protection"],
    coord: ["REC-EST-001", "REC-EST-005", "REC-EST-008", "REC-EST-012"],
  },
  {
    id: "REC-SPC-002",
    cat: "specialty",
    match: "borderline",
    rationale: "NING/DING for transaction gain; ~$1-1.5M GA tax avoidance",
    matched: ["material gain", "GA 5.19%"],
    partial: ["coordinate w/ CRUT"],
    coord: ["REC-CHR-003"],
  },
  {
    id: "REC-SPC-006",
    cat: "specialty",
    match: "borderline",
    rationale: "Wealth-replacement bailout: CRUT + ILIT integration",
    matched: ["appreciated asset", "charity+heirs", "insurable"],
    partial: ["component integration"],
    after: ["REC-CHR-003", "REC-EST-004"],
  },
];

// ────────────────────────────────────────────────────────────────────────
// SUPPLEMENTAL CANDIDATES (23 — exceeds schema cap of 10)
// ────────────────────────────────────────────────────────────────────────

interface RawSupplemental {
  id: string;
  reason: string;
  brief: string;
}

const SUPPLEMENTAL_RAW: RawSupplemental[] = [
  { id: "REC-ENT-005", reason: "C-Corp §1202 conversion conditional on REC-TAX-008 outcome", brief: "C-Corp §1202 conv; pending REC-TAX-008; cost-benefit borderline at scale" },
  { id: "REC-ENT-006", reason: "Asset protection partly covered by REC-ENT-001+002; revisit later", brief: "Multi-entity asset prot; partly covered by 001+002; revisit post-tx" },
  { id: "REC-EST-007", reason: "Activate post-first-GRAT seasoning year-2+", brief: "Rolling/laddered GRAT; activate post-first-GRAT seasoning year-2+" },
  { id: "REC-EST-013", reason: "Preserve as death-time election option for executor", brief: "§645 election; preserve as death-time option for executor" },
  { id: "REC-EST-014", reason: "Preserve as first-spouse-death election option", brief: "Portability DSUE; preserve as first-spouse-death election option" },
  { id: "REC-EST-017", reason: "Activate when child needs liquidity (Olivia future)", brief: "Intra-family loan at AFR; activate when child needs liquidity" },
  { id: "REC-TAX-012", reason: "Activate post-transaction gap years; pre-exit MFJ punitive", brief: "Roth conversion; activate post-transaction gap years; MFJ punitive now" },
  { id: "REC-TAX-013", reason: "Post-transaction multi-year tool", brief: "Bracket-fill smoothing; post-transaction multi-year tool" },
  { id: "REC-TAX-015", reason: "Post-transaction tool; defers up to $20M+ gain; 10-yr hold", brief: "QOZ; post-transaction tool; defers up to $20M+ gain; 10-yr hold" },
  { id: "REC-RSK-009", reason: "Audit during plan delivery for items above sublimits", brief: "Valued articles schedule; audit during plan delivery for sublimit items" },
  { id: "REC-RSK-013", reason: "Post-transaction at $25M+ liquid; long horizon required", brief: "PPLI; post-transaction at $25M+ liquid; long horizon required" },
  { id: "REC-RSK-014", reason: "Verify HIS group life status during plan delivery", brief: "§79 carve-out; verify HIS group life status during plan delivery" },
  { id: "REC-RSK-015", reason: "Evaluate during plan execution for Derek retention", brief: "Split-dollar with Derek as retention tool; evaluate during execution" },
  { id: "REC-SUC-003", reason: "Lower priority pre-transaction; secondary executives only", brief: "§162 plain bonus for secondary executives; lower priority pre-tx" },
  { id: "REC-SUC-014", reason: "Conflict-of-interest concerns pre-transaction; consider post-close", brief: "Financial planning benefit; CoI concerns pre-tx; revisit post-close" },
  { id: "REC-INV-008", reason: "Same as REC-TAX-012; post-transaction gap years", brief: "Roth conversion modeling; same as REC-TAX-012; post-transaction" },
  { id: "REC-INV-011", reason: "Post-transaction at $10M+ liquid; year-2-3 deployment", brief: "Private markets; post-transaction at $10M+ liquid; year-2-3 deploy" },
  { id: "REC-RET-006", reason: "For post-transaction 1099 consulting income", brief: "Solo 401k for post-transaction 1099 consulting income" },
  { id: "REC-FAM-004", reason: "Lower priority; ~$2-5K/yr per child if pursued", brief: "Cash-value life on children; ~$2-5K/yr per child if pursued" },
  { id: "REC-FAM-009", reason: "Activate as Olivia (or any child) approaches marriage", brief: "Prenup as Olivia (or any child) approaches marriage" },
  { id: "REC-CHR-013", reason: "Activates at 70½ (Marcus 2043); long-term IRA→charity", brief: "QCD activates at 70½ (Marcus 2043); long-term IRA→charity" },
  { id: "REC-SPC-010", reason: "Conditional on REC-TAX-008 favorable + REC-ENT-005 chosen", brief: "§1202 multiplication; conditional on TAX-008 favorable + ENT-005" },
];

// ────────────────────────────────────────────────────────────────────────
// SPECULATIVE_DROPPED (25 standard + 2 landmines = 27 — exceeds cap of 10)
// ────────────────────────────────────────────────────────────────────────

interface RawDropped {
  id: string;
  reason: string;
}

const DROPPED_RAW: RawDropped[] = [
  { id: "REC-EST-010", reason: "BDIT; no older-generation funder available (Eleanor unlikely)" },
  { id: "REC-EST-015", reason: "FLP; no multi-asset investment portfolio; brokerage too small" },
  { id: "REC-EST-016", reason: "Decanting; no existing irrevocable trusts to modify" },
  { id: "REC-EST-018", reason: "SCIN; Marcus 52 robust health; doesn't fit" },
  { id: "REC-EST-019", reason: "Private annuity; Marcus 52 robust health; doesn't fit" },
  { id: "REC-TAX-014", reason: "§139 disaster relief; no current federally-declared disaster" },
  { id: "REC-RSK-002", reason: "Redemption buy/sell; cross-purchase REC-RSK-001 chosen for basis step-up" },
  { id: "REC-RSK-003", reason: "Insurance LLC for multi-owner; only 2 owners" },
  { id: "REC-RSK-011", reason: "Standalone LTC; NW favors hybrid (REC-RSK-012) or self-fund" },
  { id: "REC-SUC-005", reason: "Phantom equity; profits interest REC-SUC-007 preferred for LLC" },
  { id: "REC-SUC-006", reason: "SARs; profits interest REC-SUC-007 preferred for LLC" },
  { id: "REC-SUC-009", reason: "ESOP §1042; LLC/S-Corp incompatible; revisit only if ENT-005 chosen" },
  { id: "REC-INV-006", reason: "Post-transaction concentration unwind; pre-exit; activates post-close" },
  { id: "REC-FAM-010", reason: "UTMA/UGMA wind-down; no UTMA/UGMA accounts in profile" },
  { id: "REC-CHR-004", reason: "CRAT; CRUT REC-CHR-003 preferred for growing-asset profile" },
  { id: "REC-CHR-006", reason: "CLUT; CLAT REC-CHR-005 preferred for lead trust structure" },
  { id: "REC-CHR-009", reason: "Bargain sale; pre-tx gifts REC-CHR-002 cleaner; fragments transaction" },
  { id: "REC-CHR-010", reason: "PIF; CRT scale appropriate at Holloway level" },
  { id: "REC-CHR-012", reason: "CGA; Marcus 52 too young; CRT covers use case at scale" },
  { id: "REC-SPC-003", reason: "Crypto planning; no crypto holdings disclosed" },
  { id: "REC-SPC-004", reason: "Cross-border; both U.S. citizens GA residents" },
  { id: "REC-SPC-005", reason: "Concentrated public stock hedging; private biz; INV-005 covers" },
  { id: "REC-SPC-007", reason: "Reverse mortgage; Marcus 52 too young; Eleanor family-funded" },
  { id: "REC-SPC-008", reason: "§1031; no investment RE sale contemplated" },
  { id: "REC-SPC-009", reason: "DST for §1031; conditional on §1031 dropped" },
  // Landmines (default-excluded)
  { id: "REC-RSK-016", reason: "landmine_default_excluded — captive insurance §831(b); no genuine uninsurable risk identified" },
  { id: "REC-CHR-011", reason: "landmine_default_excluded — conservation easement; no real property with conservation value" },
];

// ────────────────────────────────────────────────────────────────────────
// Build & validate
// ────────────────────────────────────────────────────────────────────────

const selected: SelectedRecommendation[] = SELECTED_RAW.map(buildSelected);

const supplemental_candidates: SupplementalCandidate[] = SUPPLEMENTAL_RAW.map(
  (s) => ({
    recommendation_id: s.id,
    reason_supplemental: s.reason,
    match_strength: "borderline" as const,
    brief_rationale: s.brief,
  }),
);

const speculative_dropped: SpeculativeDropped[] = DROPPED_RAW.map((d) => ({
  recommendation_id: d.id,
  drop_reason: d.reason,
}));

const sequencingRelationsTotal = selected.reduce(
  (acc, r) =>
    acc +
    r.must_come_after.length +
    r.must_come_before.length +
    r.sequenced_with.length +
    r.coordinated_with.length +
    r.mutually_exclusive_with.length,
  0,
);

const strongCount = selected.filter((r) => r.match_strength === "strong").length;
const borderlineCount = selected.filter((r) => r.match_strength === "borderline").length;
const landmineCount = 2;
const droppedNonLandmineCount = speculative_dropped.length - landmineCount;

const body = {
  selected,
  supplemental_candidates,
  speculative_dropped,
  pass_summaries: {
    pass_1_hard_filter: {
      input_universe: 130 as const,
      eliminated: droppedNonLandmineCount + landmineCount,
      survived: selected.length + supplemental_candidates.length,
    },
    pass_2_calibration: {
      strong: strongCount,
      borderline: borderlineCount,
      speculative: droppedNonLandmineCount,
    },
    pass_3_sequencing: {
      sequencing_relations_total: sequencingRelationsTotal,
      landmines_marked: landmineCount,
    },
  },
  _stage_flags: {
    candidate_set_unusually_small: false,
    candidate_set_unusually_large: true,
    landmines_present_count: landmineCount,
    mutually_exclusive_pairs_present: 0,
  },
};

const _metadata = {
  // Schema-required fields (synthetic for hand-authored fixture)
  stage_version: "stage_2_hand_authored_holloway_phase2",
  model_used: "hand_authored",
  input_token_count: 0,
  output_token_count: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  attempts_made: 1,
  attempt_history: [],
  duration_ms: 0,
  source_fr_content_hash:
    "5eb13aeb24467b2d08b197bf7bef376325de4c79800311cb1b1fc051e8336582",
  parsed_at: new Date().toISOString(),
  // Annotation-only (zod will strip during validation; preserved in JSON file)
  generation_method: "hand_authored",
  authored_by: "Hayden Duffield + Claude (strategy chat)",
  authored_at: new Date().toISOString(),
  source_client_profile_path: "artifacts/holloway_clientprofile.json",
  purpose:
    "Stage 2 calibration fixture for synthetic Holloway; bypasses Stage 2 LLM pipeline pending v1 redesign per Phase 1 spec",
  v1_attempt: "manual replacement for failed monolithic Stage 2 live test",
};

const fullDoc = { ...body, _metadata };

// Registry: rec_ids that exist in the KB. Hand-author needs the cross-ref check
// to confirm no orphan rec_ids. Build set from all input arrays — every id in
// SELECTED + SUPPLEMENTAL + DROPPED comes from real rec files we already read.
const registryIds = new Set<string>([
  ...SELECTED_RAW.map((r) => r.id),
  ...SUPPLEMENTAL_RAW.map((r) => r.id),
  ...DROPPED_RAW.map((r) => r.id),
]);

console.log("\n=== Schema validation (zod) ===");
const zodResult = SelectedRecommendationsSchema.safeParse(fullDoc);
if (!zodResult.success) {
  console.log(`FAILED with ${zodResult.error.issues.length} issues:`);
  for (const issue of zodResult.error.issues) {
    console.log(`  [${issue.path.join(".") || "(root)"}] ${issue.message}`);
  }
} else {
  console.log("PASSED");
}

console.log("\n=== Cross-reference validation ===");
const crossRefErrors = validateCrossReferences(body, registryIds);
if (crossRefErrors.length > 0) {
  console.log(`FAILED with ${crossRefErrors.length} issues:`);
  for (const err of crossRefErrors) {
    console.log(`  [${err.code}] ${err.detail}`);
  }
} else {
  console.log("PASSED");
}

// ────────────────────────────────────────────────────────────────────────
// Write file
// ────────────────────────────────────────────────────────────────────────

const outputPath = resolve(
  process.cwd(),
  "artifacts/holloway_selected_recommendations.json",
);
writeFileSync(outputPath, JSON.stringify(fullDoc, null, 2) + "\n");

// ────────────────────────────────────────────────────────────────────────
// Sanity reporting
// ────────────────────────────────────────────────────────────────────────

console.log("\n=== Sanity report ===");
console.log(`File: ${outputPath}`);

const sizeBytes = statSync(outputPath).size;
console.log(`Size: ${(sizeBytes / 1024).toFixed(1)} KB (${sizeBytes} bytes)`);

console.log(`\nSelected (${selected.length}):`);
const byCat = new Map<string, { strong: number; borderline: number }>();
for (const r of selected) {
  const c = r.category;
  if (!byCat.has(c)) byCat.set(c, { strong: 0, borderline: 0 });
  byCat.get(c)![r.match_strength]++;
}
for (const [cat, counts] of byCat) {
  console.log(`  ${cat}: ${counts.strong} strong + ${counts.borderline} borderline = ${counts.strong + counts.borderline}`);
}

console.log(`\nSupplemental candidates: ${supplemental_candidates.length}`);
console.log(`Speculative dropped: ${speculative_dropped.length} (incl. ${landmineCount} landmines)`);
console.log(`Sequencing relations total: ${sequencingRelationsTotal}`);
console.log(`Total recs accounted for: ${selected.length + supplemental_candidates.length + speculative_dropped.length}`);
