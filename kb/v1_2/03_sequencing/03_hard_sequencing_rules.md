# Hard Sequencing Rules

These are sequencing constraints the generator MUST respect. Violating any of these is a planning error.

## RULE 1: Real estate separation BEFORE all other entity restructuring
**REC-ENT-001 must come BEFORE REC-ENT-002 (F-reorg) and REC-ENT-003 (recap).**
Reason: real estate doesn't belong in operating Holdco; clean separation simplifies all downstream structure.

## RULE 2: F-Reorganization BEFORE recapitalization for S-Corps
**REC-ENT-002 must come BEFORE REC-ENT-003 if entity is currently S-Corp.**
Reason: S-Corps cannot have multiple classes of stock; F-reorg to Holdco LLC enables voting/non-voting recap.

## RULE 3: Recapitalization BEFORE estate transfer engine
**REC-ENT-003 must come BEFORE REC-EST-006/007/008 (GRAT, IDGT) when transferring business interest.**
Reason: non-voting interest is the cleanest gift vehicle; without recap, transferring interest gives away voting control.

## RULE 4: Children's trusts BEFORE recipient transfers
**REC-EST-005 must come BEFORE any transfer to children's trusts (gifts, GRAT remainders, IDGT sales).**
Reason: receiving vehicles must exist before transfers can be made.

## RULE 5: ILIT BEFORE life insurance ownership
**REC-EST-004 must come BEFORE REC-RSK-004 (estate liquidity life) and ILIT-funded coverage.**
Reason: ILIT must be the policy-owner from inception (otherwise §2035 3-year lookback applies if existing policy transferred).

## RULE 6: Q-of-E BEFORE banker engagement
**REC-SUC-010 must come BEFORE REC-SUC-011.**
Reason: banker requires QofE (or equivalent diligence-ready financials) to take client to market.

## RULE 7: Pre-transaction charitable gifting BEFORE binding LOI
**REC-CHR-002 must occur BEFORE binding LOI or sale obligation is executed.**
Reason: anticipatory assignment of income doctrine — gift after binding sale obligation taxes entire gain to donor.

## RULE 8: §1202 multiplication gifts BEFORE binding LOI
**REC-SPC-010 must occur with adequate time gap before binding sale.**
Reason: step-transaction risk; gifts close to sale may be collapsed back to donor.

## RULE 9: Plan amendment BEFORE Roth catch-up or mega backdoor
**REC-RET-007 must come BEFORE REC-RET-001 Roth catch-up or REC-RET-004 mega backdoor Roth, IF plan doesn't currently support these features.**
Reason: contribution mechanics require plan support; without amendment, election fails.

## RULE 10: §101(j) notice-and-consent BEFORE policy issuance
**§101(j) notice-and-consent must be signed BEFORE issuance of any business-owned life insurance policy.**
Affects: REC-RSK-002 (redemption-based buy/sell), REC-RSK-007 (key person), REC-SUC-001 (COLI-funded SERP).
Reason: consent after issuance does not cure §101(j) failure; death benefit becomes taxable.

## RULE 11: §1031 qualified intermediary BEFORE relinquished property closing
**REC-SPC-008 §1031 — QI engaged BEFORE closing on relinquished property.**
Reason: constructive receipt of proceeds destroys exchange treatment; QI must be in place from the relinquished sale.

## RULE 12: Buy/sell agreement consistency with operating agreement
**REC-RSK-001/2/3 buy/sell mechanics must be coordinated with REC-ENT-004 operating agreement.**
Reason: inconsistent terms create disputes at triggering events.

## RULE 13: Profits interest in LLC/partnership only
**REC-SUC-007 cannot be granted in S-Corp or C-Corp.**
Reason: profits interest is partnership-tax concept; doesn't apply to corporate entity.

## RULE 14: ESOP / §1042 incompatible with traditional sale
**REC-SUC-009 (ESOP) is mutually exclusive with REC-SUC-011 (sell-side banker for traditional sale).**
Reason: different transaction structures; cannot run both.

## RULE 15: §1202 holding period before sale
**REC-TAX-008 §1202 exclusion requires 5-year hold (pre-OBBBA stock) or 3/4/5-year tiered (post-OBBBA stock).**
Reason: holding period is statutory; sale before period only gets partial or zero exclusion.

## RULE 16: Volatile rates refresh discipline
**§7520 / AFR-dependent recommendations (REC-EST-006/007/008/017/018; REC-CHR-003/004/005/006) must reference current month's rate from `02_reference/08_volatile_rates_lookup.md`.**
**If lookup file >30 days stale, generator MUST flag and pause planning involving those rates.**
Reason: rates change monthly; using stale rate produces wrong gift/charitable computation.

## ADDITIONAL HARD CONSTRAINTS

### LANDMINE recommendations require explicit senior advisor opt-in:
- REC-RSK-016 (831(b) captive)
- REC-CHR-011 (conservation easement)

Default OFF; must be explicitly turned ON in engagement metadata.

### Mutually exclusive pairs:
- REC-RSK-001 vs REC-RSK-002 (cross-purchase OR redemption buy/sell)
- REC-RSK-011 vs REC-RSK-012 (standalone OR hybrid LTC)
- REC-CHR-003 vs REC-CHR-004 (CRUT or CRAT — pick one variant)
- REC-CHR-005 vs REC-CHR-006 (CLAT or CLUT)
- REC-SUC-003 vs REC-SUC-004 (plain or restricted §162)
- REC-SUC-005 vs REC-SUC-006 (phantom equity or SARs)
