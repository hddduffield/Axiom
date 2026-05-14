# FACT REVIEW FIELD MAP

This file maps every field in the PSA Client Fact Review template to canonical field names the generator uses in Triggering Conditions. The generator parses the Fact Review and populates a `FR` namespace with these field names.

**Convention:** `FR.<section>.<subsection>.<field_name>` — case-sensitive, snake_case, exact field labels from the template.

**Convention for table rows:** `FR.<section>.<subsection>[<row_index>].<column_name>` — list of structured records.

---

## SECTION 1 — Engagement Metadata

| Template Field | Canonical Name | Type | Notes |
|---|---|---|---|
| Engagement Archetype | `FR.1.engagement_archetype` | enum | {Pre-Exit, Post-Exit, Active-No-Exit, Family-Office, Pre-Liquidity-Founder} |
| Primary Planning Window | `FR.1.planning_window` | string | e.g., "3–5 years to likely transaction" |
| Engagement Start Date | `FR.1.start_date` | date | |
| Discovery Sessions Held | `FR.1.discovery_sessions_count` | string | |
| Documents Received | `FR.1.documents_received_summary` | text | |
| Documents Outstanding | `FR.1.documents_outstanding` | text | |
| Senior Advisor Reviewed | `FR.1.senior_advisor_reviewed` | string | "Yes – [Name], [Date]" |
| Compliance Reviewed | `FR.1.compliance_reviewed` | string | |

---

## SECTION 2 — Household & Family

### 2.1 Primary Owner / Client
| Template Field | Canonical Name | Type |
|---|---|---|
| Full Legal Name | `FR.2.1.full_legal_name` | string |
| Date of Birth | `FR.2.1.date_of_birth` | date |
| Age | `FR.2.1.age` | integer |
| State of Residence | `FR.2.1.state_of_residence` | string |
| County | `FR.2.1.county` | string |
| Citizenship | `FR.2.1.citizenship` | string |
| Marital Status | `FR.2.1.marital_status` | enum |
| Health Status | `FR.2.1.health_status` | text |
| Smoker / Nicotine Use | `FR.2.1.nicotine_status` | string |
| Primary Occupation | `FR.2.1.occupation` | string |
| W-2 Income (current) | `FR.2.1.w2_income` | dollars |
| Other Income Sources | `FR.2.1.other_income` | text |

### 2.2 Spouse / Co-Owner
| Template Field | Canonical Name | Type |
|---|---|---|
| Full Legal Name | `FR.2.2.full_legal_name` | string |
| Date of Birth | `FR.2.2.date_of_birth` | date |
| Age | `FR.2.2.age` | integer |
| State of Residence | `FR.2.2.state_of_residence` | string |
| Citizenship | `FR.2.2.citizenship` | string |
| Health Status | `FR.2.2.health_status` | text |
| Smoker / Nicotine Use | `FR.2.2.nicotine_status` | string |
| Primary Occupation | `FR.2.2.occupation` | string |
| W-2 Income (current) | `FR.2.2.w2_income` | dollars |
| Prior Career | `FR.2.2.prior_career` | text |
| Income Sources | `FR.2.2.income_sources` | text |

### 2.3 Children & Dependents
Stored as list `FR.2.3.children[]` with per-row fields:
- `name`, `age`, `status`, `notes`

### 2.4 Extended Family / Anticipated Support
- `FR.2.4.extended_family_notes` | text

---

## SECTION 3 — Primary Business

### 3.1 Entity Identification
| Template Field | Canonical Name | Type |
|---|---|---|
| Legal Name | `FR.3.1.legal_name` | string |
| Common / Trade Name | `FR.3.1.trade_name` | string |
| State of Formation | `FR.3.1.state_of_formation` | string |
| Entity Type | `FR.3.1.entity_type` | enum |
| Year Founded | `FR.3.1.year_founded` | integer |
| EIN (last 4) | `FR.3.1.ein_last4` | string |
| Industry / NAICS | `FR.3.1.naics` | string |
| Operations Description | `FR.3.1.operations_description` | text |
| Headquarters | `FR.3.1.hq_location` | text |
| Geographic Markets | `FR.3.1.geographic_markets` | text |
| Employee Count (FTE) | `FR.3.1.fte_count` | integer |

### 3.2 Ownership
List `FR.3.2.owners[]`:
- `owner_name`, `pct`, `class`, `vested`, `how_acquired`

Derived fields:
- `FR.3.2.owner_count` = count of rows
- `FR.3.2.is_multi_owner` = (owner_count > 1)
- `FR.3.2.primary_owner_pct` = max(pct)

### 3.3 Financial History
List `FR.3.3.financial_history[]`:
- `year`, `revenue`, `ebitda`, `margin_pct`, `owner_comp`

Derived fields:
- `FR.3.3.latest_revenue` = most recent year's revenue
- `FR.3.3.latest_ebitda` = most recent year's ebitda
- `FR.3.3.three_year_revenue_cagr` = computed from earliest and most recent year
- `FR.3.3.three_year_ebitda_cagr` = computed

### 3.4 Customer & Concentration Profile
| Template Field | Canonical Name | Type |
|---|---|---|
| Top 3 Customers (% of revenue) | `FR.3.4.top3_pct` | percent |
| Top 10 Customers (% of revenue) | `FR.3.4.top10_pct` | percent |
| Largest Single Customer (% of revenue) | `FR.3.4.largest_single_pct` | percent |
| Customer Vertical Mix | `FR.3.4.vertical_mix` | text |
| Recurring vs. Project Revenue | `FR.3.4.recurring_pct` | text |
| Backlog (current) | `FR.3.4.backlog` | text |

Derived fields:
- `FR.3.4.has_concentration_risk` = (top3_pct > 40)
- `FR.3.4.has_single_customer_risk` = (largest_single_pct > 20)

### 3.5 Valuation
| Template Field | Canonical Name | Type |
|---|---|---|
| Current Estimated Range | `FR.3.5.value_range` | string (e.g., "$32M–$48M") |
| Methodology | `FR.3.5.methodology` | text |
| Comparable Transactions | `FR.3.5.comps` | text |
| Last Formal Valuation | `FR.3.5.last_formal_valuation` | text |
| Q-of-E Performed | `FR.3.5.qofe_performed` | boolean |
| Multiple Compression Risks | `FR.3.5.compression_risks` | text |
| Multiple Premium Drivers | `FR.3.5.premium_drivers` | text |

Derived fields:
- `FR.3.5.value_midpoint` = average of low and high of value_range
- `FR.3.5.value_low` = low end
- `FR.3.5.value_high` = high end

### 3.6 Real Estate Held by or Used by the Business
List `FR.3.6.business_real_estate[]`:
- `property_name`, `held_in`, `estimated_value`, `notes`

Derived fields:
- `FR.3.6.has_real_estate_inside_operating_entity` = any row where `held_in` matches the operating entity legal name
- `FR.3.6.total_business_real_estate_value` = sum of estimated_value

---

## SECTION 4 — Other Entities, Trusts & Holding Structures

List `FR.4.entities[]`:
- `entity_name`, `entity_type`, `role`, `notes`

Derived fields:
- `FR.4.has_holdco` = any row where `entity_type` includes "Holdco" or "Holding"
- `FR.4.has_property_llc` = any row of type LLC with role indicating real estate
- `FR.4.has_revocable_trust` = any row where `entity_type` includes "Revocable Trust"
- `FR.4.has_ilit` = any row where `entity_type` includes "ILIT"
- `FR.4.has_grat` = any row where `entity_type` includes "GRAT"
- `FR.4.has_idgt` = any row where `entity_type` includes "IDGT"
- `FR.4.has_dynasty_trust` = any row where `entity_type` includes "Dynasty"
- `FR.4.has_daf` = any row where `entity_type` includes "DAF"
- `FR.4.has_foundation` = any row where `entity_type` includes "Foundation"

---

## SECTION 5 — Personal Balance Sheet

### 5.1 Liquid Assets
List `FR.5.1.liquid_assets[]`:
- `asset_name`, `institution`, `value`, `owner_title`

Derived:
- `FR.5.1.total_liquid` = sum of value
- `FR.5.1.taxable_brokerage_value` = sum where asset_name includes "brokerage" or "taxable"
- `FR.5.1.checking_value` = sum where asset_name includes "checking"

### 5.2 Retirement Accounts
List `FR.5.2.retirement_accounts[]`:
- `account_type`, `institution`, `value`, `owner`

Derived:
- `FR.5.2.total_retirement` = sum
- `FR.5.2.has_401k` = any row of type 401(k)
- `FR.5.2.has_pretax_ira` = any row of type Traditional IRA or Rollover IRA
- `FR.5.2.has_roth_ira` = any row of type Roth IRA

### 5.3 Real Estate (Personal)
List `FR.5.3.personal_real_estate[]`:
- `property`, `value`, `mortgage`, `rate`, `owner_title`

Derived:
- `FR.5.3.total_personal_re_value` = sum of value
- `FR.5.3.total_mortgage_balance` = sum of mortgage
- `FR.5.3.primary_residence_value` = first property's value (or flagged primary)
- `FR.5.3.has_secondary_residence` = count > 1

### 5.4 Business Equity
- `FR.5.4.primary_owner_business_equity_value` | dollars or range
- `FR.5.4.spouse_business_equity_value` | dollars
- `FR.5.4.other_business_holdings` | text

### 5.5 Other Assets
- `FR.5.5.other_assets_notes` | text

### 5.6 Liabilities Summary
- `FR.5.6.mortgages` | dollars + text
- `FR.5.6.personal_loc` | text
- `FR.5.6.personal_guarantees_business_debt` | text
- `FR.5.6.other_personal_debt` | text

Derived:
- `FR.5.has_personal_guarantees` = (personal_guarantees_business_debt is not None and not "None")
- `FR.5.total_net_worth` = liquid + retirement + personal_re + business_equity − mortgages

---

## SECTION 6 — Income, Expenses & Cash Flow

### 6.1 Annual Income (Current Year Projected)
List `FR.6.1.income[]`:
- `source`, `owner`, `annual_amount`, `tax_treatment`

Derived:
- `FR.6.1.total_household_income` = sum
- `FR.6.1.primary_owner_w2` = source matching W-2, owner=primary
- `FR.6.1.spouse_w2` = source matching W-2, owner=spouse
- `FR.6.1.k1_distribution` = source matching K-1 or pass-through

### 6.2 Annual Lifestyle Expenses (Current)
- `FR.6.2.annual_living_expenses` | dollars or range
- `FR.6.2.major_components` | text
- `FR.6.2.discretionary_cushion` | text

---

## SECTION 7 — Insurance & Risk Management

### 7.1 Life Insurance
List `FR.7.1.life_insurance[]`:
- `insured`, `type`, `face_amount`, `owner`, `notes`

Derived:
- `FR.7.1.primary_owner_total_face` = sum where insured=primary
- `FR.7.1.spouse_total_face` = sum where insured=spouse
- `FR.7.1.has_ilit_owned_coverage` = any row where owner is an ILIT
- `FR.7.1.has_personal_owned_coverage` = any row where owner is the insured personally

### 7.2 Disability Insurance
- `FR.7.2.primary_group_ltd` | text
- `FR.7.2.primary_individual_ltd` | text
- `FR.7.2.spouse_di` | text
- `FR.7.2.boe` | text

Derived:
- `FR.7.2.has_individual_di` = (primary_individual_ltd not None / not "None")
- `FR.7.2.has_boe` = (boe not None / not "None")

### 7.3 Property & Casualty
- `FR.7.3.homeowner_primary` | text
- `FR.7.3.homeowner_secondary` | text
- `FR.7.3.auto` | text
- `FR.7.3.personal_umbrella` | dollars
- `FR.7.3.valuables_schedule` | text

Derived:
- `FR.7.3.umbrella_amount` = parsed dollar value of personal_umbrella
- `FR.7.3.umbrella_below_5m` = (umbrella_amount < 5_000_000)
- `FR.7.3.umbrella_below_10m` = (umbrella_amount < 10_000_000)

### 7.4 Business Insurance
- `FR.7.4.general_liability` | text
- `FR.7.4.workers_comp` | text
- `FR.7.4.professional_eo` | text
- `FR.7.4.commercial_auto` | text
- `FR.7.4.cyber` | text
- `FR.7.4.buy_sell_funding_life` | text
- `FR.7.4.key_person_coverage` | text

Derived:
- `FR.7.4.has_buy_sell_life_funding` = (buy_sell_funding_life not None / not "None")
- `FR.7.4.has_key_person` = (key_person_coverage not None / not "None")

---

## SECTION 8 — Tax Profile

| Template Field | Canonical Name | Type |
|---|---|---|
| Filing Status | `FR.8.filing_status` | enum |
| Most Recent Year — Federal AGI | `FR.8.federal_agi` | dollars |
| Most Recent Year — Federal Tax | `FR.8.federal_tax` | dollars |
| Most Recent Year — Georgia Tax | `FR.8.state_tax` | dollars |
| Effective Combined Rate | `FR.8.effective_combined_rate` | percent |
| PTET Election Status | `FR.8.ptet_status` | enum {Elected, Not Elected, N/A} |
| QBI Deduction Taken (last filed) | `FR.8.qbi_status` | text |
| R&D Credits Pursued | `FR.8.rd_credits_status` | enum {Yes, No, Evaluated} |
| Cost Segregation on Real Estate | `FR.8.cost_seg_status` | enum {Performed, Never, Partial} |
| Open IRS / GA DOR Items | `FR.8.open_audit_items` | text |
| Loss Carryforwards | `FR.8.loss_carryforwards` | text |
| Current CPA / Tax Preparer | `FR.8.current_cpa` | text |

---

## SECTION 9 — Estate Planning Profile

### 9.1 Existing Documents
List `FR.9.1.documents[]`:
- `document`, `status`, `last_updated`, `notes`

Derived:
- `FR.9.1.has_current_will` = any row where document=Will and status indicates current
- `FR.9.1.will_age_years` = current_year - last_updated for Will rows
- `FR.9.1.has_revocable_trust` = any row where document includes "Revocable Trust"
- `FR.9.1.has_poa_financial` = any row where document includes "POA" / "Power of Attorney" (Financial)
- `FR.9.1.has_healthcare_directive` = any row where document includes "Healthcare"
- `FR.9.1.has_hipaa` = any row where document includes "HIPAA"
- `FR.9.1.has_ilit_doc` = any row where document includes "ILIT"

### 9.2 Exemption & Gifting Status
- `FR.9.2.lifetime_exemption_used` | dollars
- `FR.9.2.annual_exclusion_gifts_last_3y` | text
- `FR.9.2.existing_trusts_funded` | text
- `FR.9.2.beneficiary_designations_reviewed` | text
- `FR.9.2.estate_tax_exposure` | dollars or range

Derived:
- `FR.9.2.has_estate_tax_exposure` = parsed exposure > 0
- `FR.9.2.exemption_remaining` = federal_exemption - lifetime_exemption_used

### 9.3 Estate Wishes & Constraints
- `FR.9.3.estate_wishes_text` | text

---

## SECTION 10 — Retirement & Employee Benefits

| Template Field | Canonical Name | Type |
|---|---|---|
| Qualified Plan in Place | `FR.10.qualified_plan` | string |
| Plan Provider / TPA | `FR.10.plan_provider` | string |
| Plan Design | `FR.10.plan_design` | text |
| Marcus/Primary Current Deferral | `FR.10.primary_deferral` | text |
| Catherine/Spouse Current Deferral | `FR.10.spouse_deferral` | text |
| Cash-Balance / DB Plan | `FR.10.cash_balance_plan` | enum {Yes, No, N/A} |
| SERP / NQDC | `FR.10.serp_nqdc` | enum |
| Group Health | `FR.10.group_health` | text |
| Group LTD / Life | `FR.10.group_ltd_life` | text |
| Key Employee Retention Plans | `FR.10.retention_plans` | text |

Derived:
- `FR.10.primary_at_deferral_cap` = parsing of primary_deferral indicates max
- `FR.10.spouse_eligible_for_401k` = spouse W-2 > 0 AND spouse on payroll
- `FR.10.has_cash_balance` = cash_balance_plan == Yes
- `FR.10.has_serp` = serp_nqdc not None / not "None"
- `FR.10.plan_supports_after_tax` = parsed from plan_design (requires confirmation)
- `FR.10.has_profit_sharing_layer` = parsed from plan_design

---

## SECTION 11 — Transition Posture (Pre-Exit only)

| Template Field | Canonical Name | Type |
|---|---|---|
| Transaction Window Estimate | `FR.11.transaction_window` | string |
| Inbound Interest Received | `FR.11.inbound_interest` | text |
| Preferred Transaction Type | `FR.11.preferred_type` | text |
| Preferred Structure | `FR.11.preferred_structure` | text |
| Hard Constraints on Buyers | `FR.11.hard_constraints` | text |
| Continued Involvement Post-Sale | `FR.11.post_sale_involvement` | text |
| Banker / M&A Counsel Engaged | `FR.11.ma_counsel_engaged` | enum |
| Q-of-E Performed | `FR.11.qofe_performed` | enum |
| Employee Communication Posture | `FR.11.employee_communication` | text |
| Family Communication | `FR.11.family_communication` | text |

Derived:
- `FR.11.transaction_window_years` = parsed midpoint in years (e.g., "3-5 years" → 4)
- `FR.11.is_imminent` = transaction_window_years < 2

---

## SECTION 12 — Post-Exit Profile (Post-Exit only)

### 12.1 Liquidity Event Detail
- `FR.12.1.event_date`, `net_proceeds`, `structure`, `tax_treatment`, `earnout_holdback`, `continued_role`, `equity_rollover`

### 12.2 Capital Deployment Posture
- `FR.12.2.liquid_position`, `deployment_philosophy`, `concentration_decisions_pending`, `direct_indexing_in_place`, `private_markets_target`

### 12.3 Family Governance
- `FR.12.3.family_office_status`, `governance_documents`, `meeting_cadence`, `next_gen_education`

---

## SECTION 13 — Goals, Values & Constraints

### 13.1 Goals — Ranked
List `FR.13.1.goals[]`:
- `rank`, `goal`, `meaning_in_practice`

Derived:
- `FR.13.1.goal_labels` = list of all rank labels (used for trigger keyword matching)
- `FR.13.1.has_goal_estate_planning` = any goal label matches "Estate"
- `FR.13.1.has_goal_charitable` = any goal label matches "Charit" or "Philanthrop" or "Foundation"
- `FR.13.1.has_goal_after_tax_sale` = any goal label matches "After-Tax Sale"
- `FR.13.1.has_goal_succession` = any goal label matches "Succession" or "Transition"
- `FR.13.1.has_goal_children` = any goal label matches "Children" or "Family"

### 13.2 Values
- `FR.13.2.values_text` | text

### 13.3 Hard Constraints
- `FR.13.3.hard_constraints_text` | text

Derived (regex/keyword on hard_constraints_text):
- `FR.13.3.constraint_no_under_35` = matches "before age 35" / "no unrestricted access before 35"
- `FR.13.3.constraint_no_personal_guarantee` = matches "will not personally guarantee" / "no PG"
- `FR.13.3.constraint_buyer_keeps_operations` = matches "relocate operations" / "intact business" / "keep employees"

### 13.4 Soft Preferences
- `FR.13.4.soft_preferences_text` | text

---

## SECTION 14 — Current Advisory Team

List `FR.14.advisors[]`:
- `role`, `firm_contact`, `status`, `notes`

Derived:
- `FR.14.has_cpa` = any row where role=CPA AND status=Existing
- `FR.14.cpa_is_generalist` = notes for CPA row contains "generalist"
- `FR.14.has_estate_attorney` = any row where role includes "Estate Attorney" AND status=Existing
- `FR.14.has_ma_counsel` = any row where role includes "M&A" AND status=Existing
- `FR.14.has_pc_agent` = any row where role includes "P&C" AND status=Existing
- `FR.14.has_specialty_credits_firm` = any row where role includes "Specialty Tax Credits" or "R&D"
- `FR.14.cpa_gap` = NOT has_cpa OR cpa_is_generalist

---

## SECTION 15 — Documents Received & Outstanding

### 15.1 Documents Received
List `FR.15.1.documents_received[]`:
- `document`, `date_received`, `verified_by`, `storage_location`

### 15.2 Documents Outstanding
- `FR.15.2.documents_outstanding_text` | text

---

## SECTION 16 — Discovery Notes & Open Items

- `FR.16.1.advisor_observations` | text
- `FR.16.2.open_items` | text

---

## SECTION 17 — Senior Advisor Sign-Off

| Template Field | Canonical Name | Type |
|---|---|---|
| Reviewed and approved by | `FR.17.reviewer_name` | string |
| Title | `FR.17.reviewer_title` | string |
| Date of Sign-Off | `FR.17.signoff_date` | date |
| Signature | `FR.17.signature` | string |

Derived:
- `FR.17.is_signed_off` = (signature not None and signoff_date is recent)

---

## CROSS-CUTTING DERIVED FIELDS

Built from the parsed Fact Review for use across many recommendations:

| Derived Field | Computation | Used by |
|---|---|---|
| `FR.is_pre_exit` | `FR.1.engagement_archetype == "Pre-Exit"` | Most retention/transition recs |
| `FR.is_post_exit` | `FR.1.engagement_archetype == "Post-Exit"` | Deployment/diversification recs |
| `FR.is_married` | `FR.2.1.marital_status == "Married"` | Estate, gifting, SLAT |
| `FR.both_spouses_us_citizen` | `FR.2.1.citizenship == US AND FR.2.2.citizenship == US` | Marital deduction availability |
| `FR.is_ga_resident` | `FR.2.1.state_of_residence == "Georgia"` | GA-specific recs |
| `FR.has_business` | `FR.3.1.legal_name is not None` | All business recs |
| `FR.is_pass_through_entity` | `FR.3.1.entity_type` matches LLC, S-Corp, partnership | PTET, reorg, etc. |
| `FR.is_s_corp` | `FR.3.1.entity_type` matches "S-Corporation" or "S-Corp" | Reasonable comp, F-reorg |
| `FR.is_high_income` | `FR.6.1.total_household_income > 500_000` | Many high-bracket strategies |
| `FR.has_high_net_worth` | `FR.5.total_net_worth > 5_000_000` | Many HNW recs |
| `FR.has_minor_children` | any `FR.2.3.children[].age < 18` | Custodial Roth, guardianship |
| `FR.has_children_at_all` | `FR.2.3.children` count > 0 | Children's trusts, 529 |
| `FR.has_aging_parents` | `FR.2.4.extended_family_notes` mentions parents needing support | LTC, multi-gen |
| `FR.estate_exceeds_exemption` | `FR.9.2.estate_tax_exposure > 0` | All estate-tax-driven recs |
| `FR.spouse_on_payroll` | `FR.2.2.w2_income > 0` | Gates spouse-DI, spousal Roth |

---

## NOTES TO GENERATOR

1. When a field is missing from the Fact Review, the generator must NOT guess. Treat missing as "Unknown" and surface in the plan output as an open item.
2. When a field is text-only (e.g., `FR.13.3.hard_constraints_text`), apply regex/keyword matching for the derived booleans and surface low-confidence matches for human review.
3. Currency strings ("$32M – $48M") must be parsed into structured ranges before use in computations.
4. Percentages can appear as "47%" or "47" or "0.47" — normalize to one form before evaluation.
5. The Fact Review is the ground truth. If the generator has any uncertainty about a field, it must NOT generate the affected recommendation; instead, flag for senior advisor review.
