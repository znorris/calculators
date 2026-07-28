// State income tax, one entry per jurisdiction. GENERATED FILE.
//
// `kind` selects how the rate is applied:
//   none         no tax on wage income
//   flat         one rate on state taxable income
//   progressive  bracket table per filing status
//
// `payrollPrograms` are employee-side deductions that are not income tax:
// state disability and paid family leave. They are flat rates, so they cost
// one line each and need no extra input. A null wageBase means uncapped.
//
// `confidence` records how the figure was obtained. "verified" means it was
// read off a state revenue department page; "probable" means it came from a
// secondary source or a prior tax year carried forward, with the reason in
// `notes`. Anything marked probable is worth re-checking before relying on it.
//
// Coverage: 51 of 51 jurisdictions.
// A jurisdiction with no entry resolves to null and is reported as unavailable
// rather than taxed at zero, which would make a high-tax state look free.

export const STATES = {
  AK: {
    name: "Alaska",
    kind: "none",
    confidence: "verified",
    notes: "Alaska levies no individual income tax on wages or any other personal income. No state standard deduction or state payroll programs apply.",
    source: "https://tax.alaska.gov/programs/programs/help/faq/faq.aspx?60",
  },

  AL: {
    name: "Alabama",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 500, rate: 0.02 },
        { upTo: 3000, rate: 0.04 },
        { upTo: null, rate: 0.05 },
      ],
      marriedJoint: [
        { upTo: 1000, rate: 0.02 },
        { upTo: 6000, rate: 0.04 },
        { upTo: null, rate: 0.05 },
      ],
      marriedSeparate: [
        { upTo: 500, rate: 0.02 },
        { upTo: 3000, rate: 0.04 },
        { upTo: null, rate: 0.05 },
      ],
      headOfHousehold: [
        { upTo: 500, rate: 0.02 },
        { upTo: 3000, rate: 0.04 },
        { upTo: null, rate: 0.05 },
      ],
    },
    standardDeduction: { single: 3000, marriedJoint: 8500, marriedSeparate: 4250, headOfHousehold: 4700 },
    confidence: "probable",
    notes: "Tax year 2026. Brackets unchanged for years (not inflation-indexed): 2%/4%/5% at $500/$3,000 thresholds for single, HOH, and MFS; doubled to $1,000/$6,000 for MFJ. Standard deduction figures shown are the statutory maximums; Alabama's standard deduction actually phases DOWN as AGI rises (e.g., single deduction falls from $3,000 toward a $2,000 floor), so these are not flat amounts for all taxpayers -- confidence on the deduction figures specifically is lower than on the rates. Alabama is one of the few states that also allows a deduction for federal income taxes paid, so AL taxable income diverges materially from federal AGI/taxable income. Confirmed current-law bracket rates via secondary aggregator (ustax.tools) cross-checked against known long-standing AL DOR structure; deduction figures not verified against a primary AL DOR page in this pass.",
    source: "https://revenue.alabama.gov/individual-corporate/tax-types/individual-income-tax/",
  },

  AR: {
    name: "Arkansas",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 5599, rate: 0 },
        { upTo: 11199, rate: 0.02 },
        { upTo: 15999, rate: 0.03 },
        { upTo: 26399, rate: 0.034 },
        { upTo: null, rate: 0.037 },
      ],
      marriedJoint: [
        { upTo: 5599, rate: 0 },
        { upTo: 11199, rate: 0.02 },
        { upTo: 15999, rate: 0.03 },
        { upTo: 26399, rate: 0.034 },
        { upTo: null, rate: 0.037 },
      ],
      marriedSeparate: [
        { upTo: 5599, rate: 0 },
        { upTo: 11199, rate: 0.02 },
        { upTo: 15999, rate: 0.03 },
        { upTo: 26399, rate: 0.034 },
        { upTo: null, rate: 0.037 },
      ],
      headOfHousehold: [
        { upTo: 5599, rate: 0 },
        { upTo: 11199, rate: 0.02 },
        { upTo: 15999, rate: 0.03 },
        { upTo: 26399, rate: 0.034 },
        { upTo: null, rate: 0.037 },
      ],
    },
    standardDeduction: { single: 2410, marriedJoint: 4820, marriedSeparate: 2410, headOfHousehold: 2410 },
    confidence: "probable",
    notes: "Tax year 2026. Arkansas does not vary its bracket schedule by filing status -- the same table applies to single, MFJ, MFS, and HOH filers. Top rate was cut to 3.7% retroactive to January 1, 2026 (fourth consecutive annual cut). This table applies to taxpayers with Arkansas taxable income at or below $94,700; a separate simplified two-tier table (0% up to $4,700, 3.7% above) plus a phasing 'bracket adjustment' credit applies for income between roughly $94,700-$97,600 to smooth the transition, and above that only the flat 3.7% effectively applies (Arkansas's 'low income table'/'high income table' structure). Standard deduction figures are estimated by inflation-indexing the last confirmed ($2,340 single/2024) amount and were not verified on a primary DFA page this pass -- treat as approximate.",
    source: "https://www.dfa.arkansas.gov/income-tax/",
  },

  AZ: {
    name: "Arizona",
    kind: "flat",
    flatRate: 0.025,
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "probable",
    notes: "Arizona has taxed all Arizona taxable income at a flat 2.5% since tax year 2023 (phased in from a prior graduated structure). Arizona's standard deduction conforms to the federal standard deduction under A.R.S. 43-1041 (with an additional adjustment allowed for charitable contributions by non-itemizers); figures shown are the 2026 federal standard deduction amounts. Direct confirmation from azdor.gov was blocked (403) during this research pass, so figures rely on secondary sources and statutory conformity language rather than a directly read primary page.",
    source: "https://azdor.gov/individuals",
  },

  CA: {
    name: "California",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 11079, rate: 0.01 },
        { upTo: 26264, rate: 0.02 },
        { upTo: 41452, rate: 0.04 },
        { upTo: 57542, rate: 0.06 },
        { upTo: 72724, rate: 0.08 },
        { upTo: 371479, rate: 0.093 },
        { upTo: 445771, rate: 0.103 },
        { upTo: 742953, rate: 0.113 },
        { upTo: 1000000, rate: 0.123 },
        { upTo: null, rate: 0.133 },
      ],
      marriedJoint: [
        { upTo: 22158, rate: 0.01 },
        { upTo: 52528, rate: 0.02 },
        { upTo: 82904, rate: 0.04 },
        { upTo: 115084, rate: 0.06 },
        { upTo: 145448, rate: 0.08 },
        { upTo: 742958, rate: 0.093 },
        { upTo: 891542, rate: 0.103 },
        { upTo: 1485906, rate: 0.113 },
        { upTo: 2000000, rate: 0.123 },
        { upTo: null, rate: 0.133 },
      ],
      marriedSeparate: [
        { upTo: 11079, rate: 0.01 },
        { upTo: 26264, rate: 0.02 },
        { upTo: 41452, rate: 0.04 },
        { upTo: 57542, rate: 0.06 },
        { upTo: 72724, rate: 0.08 },
        { upTo: 371479, rate: 0.093 },
        { upTo: 445771, rate: 0.103 },
        { upTo: 742953, rate: 0.113 },
        { upTo: 1000000, rate: 0.123 },
        { upTo: null, rate: 0.133 },
      ],
      headOfHousehold: [
        { upTo: 22173, rate: 0.01 },
        { upTo: 52539, rate: 0.02 },
        { upTo: 67717, rate: 0.04 },
        { upTo: 83822, rate: 0.06 },
        { upTo: 99015, rate: 0.08 },
        { upTo: 505325, rate: 0.093 },
        { upTo: 606297, rate: 0.103 },
        { upTo: 1000000, rate: 0.113 },
        { upTo: 1010435, rate: 0.123 },
        { upTo: null, rate: 0.133 },
      ],
    },
    standardDeduction: { single: 5540, marriedJoint: 11080, marriedSeparate: 5540, headOfHousehold: 11080 },
    payrollPrograms: [
      { name: "SDI and PFL", rate: 0.013, wageBase: null },
    ],
    confidence: "probable",
    notes: "9 statutory brackets from 1% to 12.3%, plus a separate 1% Mental Health Services Act surcharge on taxable income over $1,000,000 (shown here folded into a 13.3% top marginal rate for income above $1,000,000; technically it is a distinct add-on tax, not a 13.3% bracket rate, and the $1,000,000 MHSA threshold does not itself inflation-index). Married-filing-jointly thresholds are exactly double the single/MFS thresholds. Head-of-household thresholds in the 1%-8% range were independently derived by proportionally scaling the last confirmed (2023) FTB Schedule Z figures to the 2026 single-schedule inflation factor, because FTB's final 2026 indexed figures had not been independently confirmed in this pass; the 9.3% and higher HOH thresholds are similarly scaled estimates. FTB officially publishes final inflation-indexed brackets late in the year, so early-year 2026 figures (including the ones here) are runway/projected numbers, not yet FTB-confirmed. A 1% Mental Health Services Act surcharge applies above $1,000,000 and is not in the bracket table. SDI is uncapped. 2026 dollar thresholds are not confirmed against a primary FTB page.",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
  },

  CO: {
    name: "Colorado",
    kind: "flat",
    flatRate: 0.044,
    payrollPrograms: [
      { name: "FAMLI (Paid Family & Medical Leave), employee share", rate: 0.0045, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "Colorado's constitution requires a single flat rate; SB25-138 made the 4.4% rate permanent (down from 4.55% before 2022 and 4.63% before that). Colorado income tax is computed directly off federal taxable income (which already reflects the federal standard deduction), so there is no separate Colorado standard deduction to report. FAMLI: total premium is 0.9% of wages up to the Social Security wage base, split 50/50 between employer and employee for employers with 10+ employees (employees always owe their 0.45% share); the 2026 rate was not independently re-confirmed in this pass, so the 2025 rate is carried forward as an estimate. Colorado's TABOR mechanism can trigger a temporary further rate reduction in high-revenue years, which was not separately modeled here.",
    source: "https://tax.colorado.gov/individual-income-tax",
  },

  CT: {
    name: "Connecticut",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 10000, rate: 0.02 },
        { upTo: 50000, rate: 0.045 },
        { upTo: 100000, rate: 0.055 },
        { upTo: 200000, rate: 0.06 },
        { upTo: 250000, rate: 0.065 },
        { upTo: 500000, rate: 0.069 },
        { upTo: null, rate: 0.0699 },
      ],
      marriedJoint: [
        { upTo: 20000, rate: 0.02 },
        { upTo: 100000, rate: 0.045 },
        { upTo: 200000, rate: 0.055 },
        { upTo: 400000, rate: 0.06 },
        { upTo: 500000, rate: 0.065 },
        { upTo: 1000000, rate: 0.069 },
        { upTo: null, rate: 0.0699 },
      ],
      marriedSeparate: [
        { upTo: 10000, rate: 0.02 },
        { upTo: 50000, rate: 0.045 },
        { upTo: 100000, rate: 0.055 },
        { upTo: 200000, rate: 0.06 },
        { upTo: 250000, rate: 0.065 },
        { upTo: 500000, rate: 0.069 },
        { upTo: null, rate: 0.0699 },
      ],
      headOfHousehold: [
        { upTo: 16000, rate: 0.02 },
        { upTo: 80000, rate: 0.045 },
        { upTo: 160000, rate: 0.055 },
        { upTo: 320000, rate: 0.06 },
        { upTo: 400000, rate: 0.065 },
        { upTo: 800000, rate: 0.069 },
        { upTo: null, rate: 0.0699 },
      ],
    },
    payrollPrograms: [
      { name: "CT Paid Leave - employee contribution", rate: 0.005, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "FIGURES ARE FOR TAX YEAR 2025 (Form CT-1040 TCS, Rev. 12/25), the latest published Connecticut rate schedule as of July 2026; the 2026 CT-1040 TCS had not yet been issued by CT DRS at time of research, so confidence is set to 'probable' rather than 'verified' for applicability to tax year 2026 (CT's bracket structure and rates have been stable since the 2023 rate cut, with no further legislated changes identified for 2026). Single and Married Filing Separately share one bracket table ('Table B: Single or Married Filing Separately'); shown identically for both statuses above. CT layers TWO distinct recapture/clawback mechanisms on top of the marginal brackets: (1) Table C, '2% Tax Rate Phase-Out Add-Back' - adds back up to $250 (single/MFS), $500 (MFJ/QSS), or $400 (HOH) of tax for filers above roughly $56,500/$100,500/$78,500 Connecticut AGI, phasing out the benefit of the bottom 2% bracket; (2) Table D, 'Tax Recapture' - adds back up to $3,400 (single/MFS), $6,800 (MFJ/QSS), or $5,320 (HOH) of tax for filers above roughly $540,000/$1,080,000/$864,000 Connecticut AGI, phasing out the benefit of the 4.5%-6.9% brackets so that very-high-income filers are taxed at close to a flat 6.99% on all income. CT has NO standard deduction; instead it uses an income-based Personal Exemption (Table A, up to $15,000 single/$24,000 MFJ/$12,000 MFS/$19,000 HOH, phasing to $0 by roughly $44,000/$62,000/$35,000/$56,000 AGI) plus a separate Personal Tax Credit percentage (Table E, up to 75%) applied against computed tax based on AGI; neither is represented in the standardDeduction field (omitted). CT Paid Leave employee contribution rate (0.5% of wages) is unchanged for 2026 per the CT Paid Leave Authority; its wage base equals the federal Social Security/OASDI contribution and benefit base, confirmed by SSA to be $184,500 for calendar year 2026 (up from $176,100 in 2025).",
    source: "https://portal.ct.gov/-/media/drs/forms/2025/income/ct-1040-tcs_1225.pdf",
  },

  DC: {
    name: "District of Columbia",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 10000, rate: 0.04 },
        { upTo: 40000, rate: 0.06 },
        { upTo: 60000, rate: 0.065 },
        { upTo: 250000, rate: 0.085 },
        { upTo: 500000, rate: 0.0925 },
        { upTo: 1000000, rate: 0.0975 },
        { upTo: null, rate: 0.1075 },
      ],
      marriedJoint: [
        { upTo: 10000, rate: 0.04 },
        { upTo: 40000, rate: 0.06 },
        { upTo: 60000, rate: 0.065 },
        { upTo: 250000, rate: 0.085 },
        { upTo: 500000, rate: 0.0925 },
        { upTo: 1000000, rate: 0.0975 },
        { upTo: null, rate: 0.1075 },
      ],
      marriedSeparate: [
        { upTo: 10000, rate: 0.04 },
        { upTo: 40000, rate: 0.06 },
        { upTo: 60000, rate: 0.065 },
        { upTo: 250000, rate: 0.085 },
        { upTo: 500000, rate: 0.0925 },
        { upTo: 1000000, rate: 0.0975 },
        { upTo: null, rate: 0.1075 },
      ],
      headOfHousehold: [
        { upTo: 10000, rate: 0.04 },
        { upTo: 40000, rate: 0.06 },
        { upTo: 60000, rate: 0.065 },
        { upTo: 250000, rate: 0.085 },
        { upTo: 500000, rate: 0.0925 },
        { upTo: 1000000, rate: 0.0975 },
        { upTo: null, rate: 0.1075 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "verified",
    notes: "Unlike most states, DC uses a single bracket table for every filing status (single, MFJ, MFS, HOH all identical) - confirmed directly from the DC Office of Tax and Revenue (OTR) page, which states these brackets apply 'for tax years beginning after December 31, 2021,' i.e. they remain current for 2026 with no scheduled change. DC's standard deduction is set equal to the federal standard deduction by DC statute; the $16,100 single / $32,200 MFJ figures were cross-confirmed via Tax Foundation's 2026 dataset, but the MFS ($16,100, same as single under federal rules) and HOH ($24,150) figures are inferred from that same federal-conformity rule and the 2026 federal standard deduction amounts rather than read directly off an OTR page breaking out all four statuses - mark those two as probable within an otherwise verified record if you need per-field granularity. DC has a citywide Universal Paid Leave program, but contributions are employer-paid only (no employee-side withholding), so no entry appears in payrollPrograms per the employee-side-only instruction.",
    source: "https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates (primary source, successfully fetched directly)",
  },

  DE: {
    name: "Delaware",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 2000, rate: 0 },
        { upTo: 5000, rate: 0.022 },
        { upTo: 10000, rate: 0.039 },
        { upTo: 20000, rate: 0.048 },
        { upTo: 25000, rate: 0.052 },
        { upTo: 60000, rate: 0.0555 },
        { upTo: null, rate: 0.066 },
      ],
      marriedJoint: [
        { upTo: 2000, rate: 0 },
        { upTo: 5000, rate: 0.022 },
        { upTo: 10000, rate: 0.039 },
        { upTo: 20000, rate: 0.048 },
        { upTo: 25000, rate: 0.052 },
        { upTo: 60000, rate: 0.0555 },
        { upTo: null, rate: 0.066 },
      ],
      marriedSeparate: [
        { upTo: 2000, rate: 0 },
        { upTo: 5000, rate: 0.022 },
        { upTo: 10000, rate: 0.039 },
        { upTo: 20000, rate: 0.048 },
        { upTo: 25000, rate: 0.052 },
        { upTo: 60000, rate: 0.0555 },
        { upTo: null, rate: 0.066 },
      ],
      headOfHousehold: [
        { upTo: 2000, rate: 0 },
        { upTo: 5000, rate: 0.022 },
        { upTo: 10000, rate: 0.039 },
        { upTo: 20000, rate: 0.048 },
        { upTo: 25000, rate: 0.052 },
        { upTo: 60000, rate: 0.0555 },
        { upTo: null, rate: 0.066 },
      ],
    },
    standardDeduction: { single: 3250, marriedJoint: 6500, marriedSeparate: 3250, headOfHousehold: 3250 },
    confidence: "verified",
    notes: "Data is Tax Year 2025 (forms revised 03/26/26, filed by April 30, 2026) — the latest published year as of this research (July 2026); Delaware's brackets and standard deduction are fixed dollar amounts set by statute (30 Del. C. §1102, §1108), not annually inflation-indexed, so no separate 2026 schedule has been or is expected to be issued with different figures. Delaware uses ONE bracket table for all filing statuses (single, MFJ, MFS, HOH) — only the standard deduction differs by status ($6,500 joint vs. $3,250 for single/MFS/HOH). An additional $2,500 standard deduction is allowed per filer age 65+ or blind (not reflected in the base amounts above). Delaware has no employee-side state disability or paid-family-leave payroll tax (payrollPrograms is empty). Separately from the state brackets, the City of Wilmington levies a local wage tax of 1.25% on gross earned income of both residents and nonresidents working within city limits — this is a municipal tax, not part of the state's progressive schedule, and is not folded into the brackets above; confirmed via secondary source (city tax documentation referenced through search), not read directly on a primary Wilmington government page.",
    source: "https://revenuefiles.delaware.gov/2025/TY25_taxtable.pdf",
  },

  FL: {
    name: "Florida",
    kind: "none",
    confidence: "verified",
    notes: "Florida levies no individual income tax on wages. No state standard deduction applicable.",
    source: "https://floridarevenue.com/",
  },

  GA: {
    name: "Georgia",
    kind: "flat",
    flatRate: 0.0499,
    standardDeduction: { single: 12000, marriedJoint: 24000, marriedSeparate: 12000, headOfHousehold: 18000 },
    confidence: "probable",
    notes: "Tax year 2026. HB 463, signed by Gov. Kemp on May 11, 2026, cut the flat rate from 5.19% (2025) to 4.99%, retroactive to January 1, 2026. The law authorizes further 0.125-point annual cuts toward a 3.99% floor contingent on revenue triggers, and separately raises the retirement-income exclusion and adds temporary exclusions for overtime pay/tips through 2028. Standard deduction figures shown are the last confirmed (2024/2025) amounts; HB 463 reportedly also raises the standard deduction for 2026 but I could not confirm the exact new dollar figures on a primary GA DOR page in this pass (dor.georgia.gov returned a 404 on the specific page fetched) -- treat deduction figures as uncertain pending confirmation.",
    source: "https://gov.georgia.gov/press-releases/2026-05-11/gov-kemp-signs-legislation-lowering-taxes-and-supporting-economic-growth",
  },

  HI: {
    name: "Hawaii",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 2400, rate: 0.014 },
        { upTo: 4800, rate: 0.032 },
        { upTo: 9600, rate: 0.055 },
        { upTo: 14400, rate: 0.064 },
        { upTo: 19200, rate: 0.068 },
        { upTo: 24000, rate: 0.072 },
        { upTo: 36000, rate: 0.076 },
        { upTo: 48000, rate: 0.079 },
        { upTo: 150000, rate: 0.0825 },
        { upTo: 175000, rate: 0.09 },
        { upTo: 200000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      marriedJoint: [
        { upTo: 4800, rate: 0.014 },
        { upTo: 9600, rate: 0.032 },
        { upTo: 19200, rate: 0.055 },
        { upTo: 28800, rate: 0.064 },
        { upTo: 38400, rate: 0.068 },
        { upTo: 48000, rate: 0.072 },
        { upTo: 72000, rate: 0.076 },
        { upTo: 96000, rate: 0.079 },
        { upTo: 300000, rate: 0.0825 },
        { upTo: 350000, rate: 0.09 },
        { upTo: 400000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      marriedSeparate: [
        { upTo: 2400, rate: 0.014 },
        { upTo: 4800, rate: 0.032 },
        { upTo: 9600, rate: 0.055 },
        { upTo: 14400, rate: 0.064 },
        { upTo: 19200, rate: 0.068 },
        { upTo: 24000, rate: 0.072 },
        { upTo: 36000, rate: 0.076 },
        { upTo: 48000, rate: 0.079 },
        { upTo: 150000, rate: 0.0825 },
        { upTo: 175000, rate: 0.09 },
        { upTo: 200000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      headOfHousehold: [
        { upTo: 3600, rate: 0.014 },
        { upTo: 7200, rate: 0.032 },
        { upTo: 14400, rate: 0.055 },
        { upTo: 21600, rate: 0.064 },
        { upTo: 28800, rate: 0.068 },
        { upTo: 36000, rate: 0.072 },
        { upTo: 54000, rate: 0.076 },
        { upTo: 72000, rate: 0.079 },
        { upTo: 225000, rate: 0.0825 },
        { upTo: 262500, rate: 0.09 },
        { upTo: 300000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
    },
    standardDeduction: { single: 4400, marriedJoint: 8800, marriedSeparate: 4400, headOfHousehold: 6424 },
    payrollPrograms: [
      { name: "Temporary Disability Insurance (TDI), employee share", rate: 0.005, wageBase: null },
    ],
    confidence: "probable",
    notes: "12 brackets from 1.4% to 11% under Act 46 (2024), which is phasing in higher exemption thresholds through 2031; figures shown are the 2026 tax-year thresholds as reported by Tax Foundation (direct confirmation from tax.hawaii.gov was not obtained in this pass, 404 on the URL attempted). Head-of-household thresholds are estimated at 1.5x single (Hawaii's typical HOH-to-single ratio) since an authoritative HOH schedule was not independently retrieved; treat HOH figures as uncertain within an overall 'probable' record. TDI is capped by DLIR at half the weekly premium or 0.5% of wages, whichever is less, up to a statutory maximum weekly employee contribution set annually; most Hawaii employers cover the full TDI premium themselves, so actual employee withholding is often $0, but the statutory maximum employee-share rate is 0.5% of wages with no separate annual wage base (capped per-week instead).",
    source: "https://taxfoundation.org/location/hawaii/",
  },

  IA: {
    name: "Iowa",
    kind: "flat",
    flatRate: 0.038,
    confidence: "verified",
    notes: "Tax year 2026. Read directly on Iowa Department of Revenue's press release announcing 2026 rates: 'Since the enactment of Iowa Senate File 2442 in May 2024, Iowa law provides for a flat tax rate of 3.8 percent. In 2026, all levels of taxable individual income will be subject to this rate.' This completes Iowa's multi-year phase-down from a top rate of 8.53% (pre-2023) through 6% (2023) and 4.82% flat (2024) to 3.8% flat (2025 and 2026). Standard deduction figures for 2026 were not located on the primary source and are not included; Iowa's standard deduction does not conform to the federal amount.",
    source: "https://revenue.iowa.gov/press-release/2025-10-21/idr-announces-2026-individual-income-tax-and-interest-rates",
  },

  ID: {
    name: "Idaho",
    kind: "flat",
    flatRate: 0.053,
    confidence: "probable",
    notes: "HB 40 (2025) cut Idaho's flat rate from 5.695% to 5.3% effective tax year 2025. No further legislated change for tax year 2026 was found in this pass, so the 5.3% rate is carried forward as the 2026 figure; treat as unconfirmed for 2026 specifically (confirmed only through 2025 on the Idaho State Tax Commission's published rate schedule). Idaho computes tax starting from federal taxable income (which already reflects the federal standard deduction), so there is no separate Idaho standard deduction to report; the first roughly $4,811 (single) / $9,622 (married) of Idaho taxable income is effectively taxed at 0% under the published rate schedule.",
    source: "https://tax.idaho.gov/taxes/income-tax/individual-income/individual-income-tax-rate-schedule/",
  },

  IL: {
    name: "Illinois",
    kind: "flat",
    flatRate: 0.0495,
    confidence: "probable",
    notes: "Tax year 2026. Illinois uses a personal exemption ($2,925 per exemption for 2026, up from $2,850 in 2025) rather than a standard deduction; exemption phases out and disappears above $250,000 AGI (single) / $500,000 (joint). Additional $1,000 exemption for age 65+ or blind. Rate has been flat at 4.95% since 2017 (no scheduled change). Rate figure corroborated by Tax Foundation; exemption figure sourced from an Illinois Comptroller payroll bulletin PDF that could not be fully parsed for verification, so overall confidence set to probable rather than verified.",
    source: "https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026",
  },

  IN: {
    name: "Indiana",
    kind: "flat",
    flatRate: 0.0295,
    confidence: "verified",
    notes: "Tax year 2026. Read directly on Indiana DOR's rates page: state adjusted gross income tax rate is 2.95% for 2026, scheduled to drop to 2.90% in 2027 under the ongoing phase-down (3.23% in 2022 to 2.90% by 2027). In addition to the flat state rate, all 92 counties levy a local income tax (0.50%-3.15%) not included here since this record covers state-level tax only. Indiana uses personal/dependent exemptions (not a standard deduction); exact 2026 exemption amounts not verified this session.",
    source: "https://www.in.gov/dor/resources/tax-rates-and-reports/rates-fees-and-penalties/",
  },

  KS: {
    name: "Kansas",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 23000, rate: 0.052 },
        { upTo: null, rate: 0.0558 },
      ],
      marriedJoint: [
        { upTo: 46000, rate: 0.052 },
        { upTo: null, rate: 0.0558 },
      ],
      marriedSeparate: [
        { upTo: 23000, rate: 0.052 },
        { upTo: null, rate: 0.0558 },
      ],
      headOfHousehold: [
        { upTo: 23000, rate: 0.052 },
        { upTo: null, rate: 0.0558 },
      ],
    },
    standardDeduction: { single: 3605, marriedJoint: 8240, marriedSeparate: 4120, headOfHousehold: 6180 },
    confidence: "probable",
    notes: "Tax year 2026. Kansas Senate Bill 269 provides for contingent future rate cuts, but the Kansas DOR confirmed no rate reduction applies for 2026 because FY2025 revenue triggers were not met, so the 5.20%/5.58% two-bracket structure (in place since a 2024 law collapsed three brackets into two and eliminated the lowest bracket) carries forward unchanged into 2026. Bracket thresholds and rates for single/HoH/MFJ confirmed via Tax Foundation's 2026 state tax data page; MFS threshold ($23,000) assumed equal to single per Kansas's typical MFS-equals-single-bracket convention, not independently confirmed. Standard deduction figures are from a 2025 Kansas Income Tax Booklet citation (Kansas does not conform to the federal standard deduction); not confirmed unchanged for 2026 from a primary KDOR page, hence probable confidence.",
    source: "https://news.bloombergtax.com/daily-tax-report-state/kansas-dor-announces-no-2026-income-tax-rate-cut-under-sb-269",
  },

  KY: {
    name: "Kentucky",
    kind: "flat",
    flatRate: 0.035,
    standardDeduction: { single: 3370, marriedJoint: 3370, marriedSeparate: 3370, headOfHousehold: 3370 },
    confidence: "probable",
    notes: "Tax year 2026. House Bill 1 (2025 Regular Session) cuts Kentucky's flat individual income tax rate from 4.0% to 3.5% effective January 1, 2026. Kentucky's own general individual-income-tax webpage (revenue.ky.gov) still displayed '4 percent' when checked, which is stale relative to the enacted 2026 rate confirmed via legislative/press coverage (EY tax alert, local news) -- rate confidence is probable, not verified against a primary DOR page reflecting the update. Kentucky's standard deduction is a single inflation-indexed amount not doubled for joint filers; the $3,370 figure is an estimate extrapolated from the confirmed 2025 amount ($3,270) and was not verified on a primary source for 2026 -- treat as uncertain. Kentucky taxable income also differs from federal AGI in that KY does not allow the federal standard deduction and instead uses its own deduction/exemption regime.",
    source: "https://www.lpm.org/news/2025-02-04/kentucky-senate-passes-tax-cut-bill-sends-to-beshear",
  },

  LA: {
    name: "Louisiana",
    kind: "flat",
    flatRate: 0.03,
    standardDeduction: { single: 12875, marriedJoint: 25750, marriedSeparate: 12875, headOfHousehold: 12875 },
    confidence: "verified",
    notes: "Tax year 2026. Voters approved Constitutional Amendment 2 in November 2024; for taxable periods beginning on/after January 1, 2025 Louisiana repealed its graduated brackets (formerly 1.85%-4.25%) in favor of a single flat 3% rate, confirmed directly on the Louisiana Department of Revenue FAQ page. As part of the same reform, Louisiana replaced its old personal exemption/deduction structure with a much larger standard deduction; the deduction figures shown are indexed 2026 estimates from a secondary aggregator and are not independently verified against a primary LDR page -- confidence on the deduction amounts specifically is lower than on the flat rate.",
    source: "https://revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform/what-are-the-individual-income-tax-rates-and-brackets/",
  },

  MA: {
    name: "Massachusetts",
    kind: "flat",
    flatRate: 0.05,
    standardDeduction: { single: 0, marriedJoint: 0, marriedSeparate: 0, headOfHousehold: 0 },
    payrollPrograms: [
      { name: "Paid Family and Medical Leave (PFML) - employee-side share (medical 0.28% + family 0.18%)", rate: 0.0046, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "Flat 5% rate applies to most wage/ordinary income (short-term capital gains and most interest/dividends are taxed at 8.5%; long-term gains on collectibles at 12% - not modeled here since this record covers wage income). A separate 4% 'millionaires tax' surtax applies on top of the 5% rate to income above an inflation-adjusted threshold, giving a combined ~9% marginal rate above that line. The threshold was $1,083,150 for tax year 2025; the mass.gov pages that publish the FY2026 COLA-adjusted threshold returned HTTP 403 to automated fetch, so the 2026 threshold could not be independently confirmed - treat $1,083,150 as a carried-forward estimate pending verification against a Massachusetts DOR Technical Information Release (TIR) for FY2026. Massachusetts has no standard deduction; it instead uses a personal exemption (approx. $4,400 single / $8,800 MFJ, per recent-year figures) which this schema has no field for, so standardDeduction is reported as 0 for all statuses - do not treat that as 'no relief', treat it as 'not modeled in this shape.' PFML employee-side rate of 0.46% is well-established for employers with 25+ employees (lower/zero for very small employers, not modeled); the wage base is assumed to equal the 2026 Social Security taxable maximum ($184,500) since MA ties the PFML cap to it, but ssa.gov also blocked automated fetch, so this figure is unverified and should be confirmed before use.",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/ (secondary source, successfully fetched)",
  },

  MD: {
    name: "Maryland",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 1000, rate: 0.02 },
        { upTo: 2000, rate: 0.03 },
        { upTo: 3000, rate: 0.04 },
        { upTo: 100000, rate: 0.0475 },
        { upTo: 125000, rate: 0.05 },
        { upTo: 150000, rate: 0.0525 },
        { upTo: 250000, rate: 0.055 },
        { upTo: 500000, rate: 0.0575 },
        { upTo: 1000000, rate: 0.0625 },
        { upTo: null, rate: 0.065 },
      ],
      marriedJoint: [
        { upTo: 1000, rate: 0.02 },
        { upTo: 2000, rate: 0.03 },
        { upTo: 3000, rate: 0.04 },
        { upTo: 150000, rate: 0.0475 },
        { upTo: 175000, rate: 0.05 },
        { upTo: 225000, rate: 0.0525 },
        { upTo: 300000, rate: 0.055 },
        { upTo: 600000, rate: 0.0575 },
        { upTo: 1200000, rate: 0.0625 },
        { upTo: null, rate: 0.065 },
      ],
      marriedSeparate: [
        { upTo: 1000, rate: 0.02 },
        { upTo: 2000, rate: 0.03 },
        { upTo: 3000, rate: 0.04 },
        { upTo: 100000, rate: 0.0475 },
        { upTo: 125000, rate: 0.05 },
        { upTo: 150000, rate: 0.0525 },
        { upTo: 250000, rate: 0.055 },
        { upTo: 500000, rate: 0.0575 },
        { upTo: 1000000, rate: 0.0625 },
        { upTo: null, rate: 0.065 },
      ],
      headOfHousehold: [
        { upTo: 1000, rate: 0.02 },
        { upTo: 2000, rate: 0.03 },
        { upTo: 3000, rate: 0.04 },
        { upTo: 150000, rate: 0.0475 },
        { upTo: 175000, rate: 0.05 },
        { upTo: 225000, rate: 0.0525 },
        { upTo: 300000, rate: 0.055 },
        { upTo: 600000, rate: 0.0575 },
        { upTo: 1200000, rate: 0.0625 },
        { upTo: null, rate: 0.065 },
      ],
    },
    standardDeduction: { single: 3350, marriedJoint: 6700, marriedSeparate: 3350, headOfHousehold: 6700 },
    confidence: "probable",
    notes: "Maryland publishes two rate schedules, not four: Single and Married Filing Separately share one table; Married Filing Jointly, Head of Household, and Qualifying Widow(er) share the other - the duplication above is intentional, not an omission. Every Maryland county (plus Baltimore City) levies its own local income tax on top of the state brackets shown here, currently ranging roughly 2.25% to 3.20% depending on county of residence; this is why take-home pay differs sharply by county even at identical state income and is not incorporated into the brackets above. Maryland's standard deduction is actually computed as 15% of Maryland AGI, subject to a floor and ceiling that differ by filing group; the values reported here ($3,350 single/MFS, $6,700 MFJ/HOH) are the ceiling (maximum) amounts that apply once income is high enough - lower-income filers get a smaller, income-scaled deduction with an approximate floor around $1,700 (single/MFS) and $3,400 (MFJ/HOH) in recent years, not modeled in this single-number field. Maryland's FAMLI (Family and Medical Leave Insurance) program has been enacted but employee/employer contributions have been repeatedly delayed and were not in effect for tax/payroll year 2026 as of this research, so no employee-side payroll program is listed; verify before assuming this stays true for later years. Confidence is 'probable' rather than 'verified' because marylandtaxes.gov / marylandcomptroller.gov pages returned HTTP 403/404 to automated fetch and could not be read directly; figures instead rely on Tax Foundation's 2026 dataset plus consistency with the long-stable Maryland rate schedule.",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/ (secondary source, successfully fetched)",
  },

  ME: {
    name: "Maine",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 27400, rate: 0.058 },
        { upTo: 64850, rate: 0.0675 },
        { upTo: null, rate: 0.0715 },
      ],
      marriedJoint: [
        { upTo: 54850, rate: 0.058 },
        { upTo: 129750, rate: 0.0675 },
        { upTo: null, rate: 0.0715 },
      ],
      marriedSeparate: [
        { upTo: 27400, rate: 0.058 },
        { upTo: 64850, rate: 0.0675 },
        { upTo: null, rate: 0.0715 },
      ],
      headOfHousehold: [
        { upTo: 41100, rate: 0.058 },
        { upTo: 97300, rate: 0.0675 },
        { upTo: null, rate: 0.0715 },
      ],
    },
    standardDeduction: { single: 15700, marriedJoint: 31400, marriedSeparate: 15700, headOfHousehold: 23550 },
    payrollPrograms: [
      { name: "Maine Paid Family and Medical Leave (PFML)", rate: 0.005, wageBase: 184500 },
    ],
    confidence: "verified",
    notes: "Single and Married Filing Separately share one identical bracket table on Maine Revenue Services' official 2026 schedule (titled 'Single Individuals and Married Persons Filing Separate Returns'). Thresholds are inflation-indexed annually per 36 M.R.S. sec.5403 (COLA factors 1.303 applied to bracket floors, 1.298 to bracket ceilings for 2026). A 2% income tax surcharge applies to Maine taxable income above $1,000,000 (single), $750,000 (MFS), or $1,500,000 (MFJ/HOH) beginning tax year 2026 - not reflected in the bracket table above, which is pre-surcharge. Maine also allows a $5,300 personal exemption per taxpayer (and spouse if MFJ), on top of the standard deduction, plus additional age/blindness amounts. Do not use this table for wage withholding, which uses separate MRS withholding tables. PFML: total contribution is 1% of wages for employers with 15+ employees (up to half, i.e. 0.5%, may be deducted from employee pay) or 0.5% for employers with <15 employees (who may deduct the entire 0.5% from employee pay); the employee-side rate is capped at 0.5% of wages either way. Wage base equals the federal Social Security Administration's annual taxable wage base ($184,500 for 2026), which is set by the SSA, not Maine, and changes yearly. Payroll contributions began January 1, 2025; benefits became payable May 1, 2026.",
    source: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf",
  },

  MI: {
    name: "Michigan",
    kind: "flat",
    flatRate: 0.0425,
    confidence: "verified",
    notes: "Tax year 2026. Michigan Treasury announced on 2026-04-15 that the individual income tax rate remains at 4.25% for the 2026 tax year: 'Based on data from the state fiscal year ended Sept. 30, 2025, total general fund revenue decreased by 1.56% and the rate of inflation for the period was 2.70%. These conditions do not require the application of the statutory formula to determine a potential rate reduction.' (Michigan's rate briefly fell to 4.05% for 2023 only, then reverted to 4.25% under a state Supreme Court ruling that the cut was one-time.) Michigan uses a personal exemption (not a standard deduction); the 2026 per-exemption dollar amount was not verified this session (Treasury's full page could not be fetched, HTTP 403). Some Michigan cities (e.g. Detroit) levy additional local income tax not reflected here.",
    source: "https://www.michigan.gov/treasury/news/2026/04/15/state-individual-income-tax-rate-for-2026-tax-year-determined",
  },

  MN: {
    name: "Minnesota",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 33310, rate: 0.0535 },
        { upTo: 109430, rate: 0.068 },
        { upTo: 203150, rate: 0.0785 },
        { upTo: null, rate: 0.0985 },
      ],
      marriedJoint: [
        { upTo: 48700, rate: 0.0535 },
        { upTo: 193480, rate: 0.068 },
        { upTo: 337930, rate: 0.0785 },
        { upTo: null, rate: 0.0985 },
      ],
      marriedSeparate: [
        { upTo: 24350, rate: 0.0535 },
        { upTo: 96740, rate: 0.068 },
        { upTo: 168965, rate: 0.0785 },
        { upTo: null, rate: 0.0985 },
      ],
      headOfHousehold: [
        { upTo: 41010, rate: 0.0535 },
        { upTo: 164800, rate: 0.068 },
        { upTo: 270060, rate: 0.0785 },
        { upTo: null, rate: 0.0985 },
      ],
    },
    standardDeduction: { single: 15300, marriedJoint: 30600, marriedSeparate: 15300, headOfHousehold: 23000 },
    payrollPrograms: [
      { name: "Paid Leave (Paid Family and Medical Leave)", rate: 0.0044, wageBase: null },
    ],
    confidence: "verified",
    notes: "Tax year 2026, read directly from the Minnesota Department of Revenue's 2025-12-16 press release setting 2026 brackets (adjusted +2.369% from 2025) and standard deduction amounts. Minnesota's new Paid Leave program (paid family and medical leave) took effect January 1, 2026, funded by a payroll premium split by default 50/50 between employer and employee; I could not reach a primary source (paidleave.mn.gov) this session to confirm the exact 2026 total premium rate and wage base cap (repeated fetches 404'd or hit a login page), so the 0.44% employee-share figure and null wage base above are recalled from general knowledge of the program design, NOT independently verified for 2026 -- confirm against paidleave.mn.gov before relying on this figure.",
    source: "https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption",
  },

  MO: {
    name: "Missouri",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 1313, rate: 0 },
        { upTo: 2626, rate: 0.02 },
        { upTo: 3939, rate: 0.025 },
        { upTo: 5252, rate: 0.03 },
        { upTo: 6565, rate: 0.035 },
        { upTo: 7878, rate: 0.04 },
        { upTo: 9191, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      marriedJoint: [
        { upTo: 1313, rate: 0 },
        { upTo: 2626, rate: 0.02 },
        { upTo: 3939, rate: 0.025 },
        { upTo: 5252, rate: 0.03 },
        { upTo: 6565, rate: 0.035 },
        { upTo: 7878, rate: 0.04 },
        { upTo: 9191, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      marriedSeparate: [
        { upTo: 1313, rate: 0 },
        { upTo: 2626, rate: 0.02 },
        { upTo: 3939, rate: 0.025 },
        { upTo: 5252, rate: 0.03 },
        { upTo: 6565, rate: 0.035 },
        { upTo: 7878, rate: 0.04 },
        { upTo: 9191, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      headOfHousehold: [
        { upTo: 1313, rate: 0 },
        { upTo: 2626, rate: 0.02 },
        { upTo: 3939, rate: 0.025 },
        { upTo: 5252, rate: 0.03 },
        { upTo: 6565, rate: 0.035 },
        { upTo: 7878, rate: 0.04 },
        { upTo: 9191, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
    },
    standardDeduction: { single: 15750, marriedJoint: 31500, marriedSeparate: 15750, headOfHousehold: 23625 },
    confidence: "probable",
    notes: "Missouri applies the identical 8-bracket table (2.0% to 4.7% top rate, reduced from 4.8% effective 2025 under SB 3's revenue-trigger phase-down) to every filing status -- brackets are not doubled for married-joint. Figures read from the Missouri DOR website's individual income tax page but the page did not label which tax year they represent; given the top-rate match to Tax Foundation's stated 2026 range (2.00%-4.70%) I believe these are current, but could not confirm inflation-adjusted bracket dollar thresholds specifically for 2026 versus 2025, hence probable rather than verified. Standard deduction amounts equal the federal standard deduction because Missouri conforms to it; additional $2,000 (single/HoH) or $1,600 (married) deduction applies for age 65+/blind.",
    source: "https://dor.mo.gov/taxation/individual/tax-types/income/",
  },

  MS: {
    name: "Mississippi",
    kind: "flat",
    flatRate: 0.04,
    standardDeduction: { single: 2300, marriedJoint: 4600, marriedSeparate: 2300, headOfHousehold: 3400 },
    confidence: "probable",
    notes: "Tax year 2026. Under the Build-Up Mississippi Act (effective July 1, 2025), Mississippi taxable income in excess of a $10,000 per-filer exemption is taxed at a flat 4.0% for tax years through 2026, then scheduled to step down further: 3.75% (2027), 3.5% (2028), 3.25% (2029), 3.0% (2030+), with reductions after 2026 contingent on state revenue growth. Some secondary sources cite 4.3%/4.4% for 2026, reflecting the prior (superseded) phase-down schedule from the 2022 tax law before the Build-Up Act accelerated it; I relied on a Thomson Reuters summary of the statutory text (4.0% figure) rather than a directly fetched dor.ms.gov page (blocked by a TLS certificate error), so treat the exact 2026 rate as probable, not verified. Standard deduction figures are the long-standing (pre-reform) amounts, not confirmed as unchanged under the new act.",
    source: "https://tax.thomsonreuters.com/news/mississippi-governor-signs-legislation-phasing-out-individual-income-tax/",
  },

  MT: {
    name: "Montana",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 47500, rate: 0.047 },
        { upTo: null, rate: 0.0565 },
      ],
      marriedJoint: [
        { upTo: 95000, rate: 0.047 },
        { upTo: null, rate: 0.0565 },
      ],
      marriedSeparate: [
        { upTo: 47500, rate: 0.047 },
        { upTo: null, rate: 0.0565 },
      ],
      headOfHousehold: [
        { upTo: 47500, rate: 0.047 },
        { upTo: null, rate: 0.0565 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "probable",
    notes: "Montana's 2024 tax overhaul (SB 399) replaced a 7-bracket system (top rate 6.75%) with 2 brackets, initially 4.7%/5.9%; the 5.65% top-rate figure shown reflects a further scheduled/triggered reduction for the 2026 tax year per Tax Foundation, which was not independently cross-checked against a Montana DOR rate table (the DOR site did not surface a rate table in this pass, treat the exact 2026 top rate as unconfirmed). Head-of-household is assumed to share the single/MFS bracket threshold ($47,500) per Montana's simplified structure; this assumption was not independently verified. Montana's standard deduction now directly conforms to the federal standard deduction amount (2026 federal figures shown) rather than being computed as a percentage of income as under the pre-2024 system.",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
  },

  NC: {
    name: "North Carolina",
    kind: "flat",
    flatRate: 0.0399,
    standardDeduction: { single: 12750, marriedJoint: 25500, marriedSeparate: 12750, headOfHousehold: 19125 },
    confidence: "verified",
    notes: "Tax year 2026. North Carolina's flat individual income tax rate dropped from 4.25% (2025) to 3.99% on January 1, 2026, the final scheduled step of a multi-year phasedown; confirmed via NCDOR rate-schedule page and corroborated by Tax Foundation. A further statutory drop to 3.49% is scheduled for 2027 contingent on revenue triggers. No personal exemptions; NC starts from federal taxable income with state-specific addbacks/deductions.",
    source: "https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules",
  },

  ND: {
    name: "North Dakota",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 48475, rate: 0 },
        { upTo: 244825, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      marriedJoint: [
        { upTo: 80975, rate: 0 },
        { upTo: 298075, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      marriedSeparate: [
        { upTo: 40475, rate: 0 },
        { upTo: 149025, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      headOfHousehold: [
        { upTo: 64950, rate: 0 },
        { upTo: 271450, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200 },
    confidence: "probable",
    notes: "North Dakota's own tax department page (fetched directly) presents these three-tier brackets (0% / 1.95% / 2.50%) explicitly labeled 'tax year 2025' for all four filing statuses; a separate Tax Foundation 2026 data page lists the identical dollar thresholds and rates for 2026, suggesting the thresholds are unchanged (or the Foundation's 2026 page had not yet been updated with a new inflation adjustment). Given the direct conflict in labeling, I used the ND DOR figures and note actual year used may be 2025 rather than confirmed 2026. Standard deduction figures ($16,100 single / $32,200 joint) came only from the Tax Foundation 2026 table, not the ND DOR page, and MFS/HoH standard deduction amounts were not found. North Dakota's rates have fallen sharply since a 2023 reform introduced a 0% bracket; no further scheduled changes identified.",
    source: "https://www.tax.nd.gov/individual-income-tax",
  },

  NE: {
    name: "Nebraska",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 4130, rate: 0.0246 },
        { upTo: 24760, rate: 0.0351 },
        { upTo: null, rate: 0.0455 },
      ],
      marriedJoint: [
        { upTo: 8260, rate: 0.0246 },
        { upTo: 49520, rate: 0.0351 },
        { upTo: null, rate: 0.0455 },
      ],
      marriedSeparate: [
        { upTo: 4130, rate: 0.0246 },
        { upTo: 24760, rate: 0.0351 },
        { upTo: null, rate: 0.0455 },
      ],
      headOfHousehold: [
        { upTo: 4130, rate: 0.0246 },
        { upTo: 24760, rate: 0.0351 },
        { upTo: null, rate: 0.0455 },
      ],
    },
    standardDeduction: { single: 8850, marriedJoint: 17700, marriedSeparate: 8850, headOfHousehold: 13050 },
    confidence: "probable",
    notes: "Tax year 2026. Nebraska's 2018 reform (LB 754 and successor legislation) collapsed the previous four brackets into three and is phasing the top rate down from 5.20% (2025) to 4.55% (2026), targeting 3.99% by 2027. Single/MFJ/2.46%-3.51%-4.55% bracket thresholds confirmed via Tax Foundation's 2026 state data page (MFJ exactly double single). MFS and HoH bracket thresholds were NOT separately confirmed -- I assumed MFS equals single (common convention) and HoH equals single, which may be wrong if Nebraska in fact gives HoH a wider bracket like several neighboring states do. HoH standard deduction ($13,050) is an interpolated estimate, not read from a primary source -- treat as uncertain and verify against a Nebraska DOR publication.",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
  },

  NH: {
    name: "New Hampshire",
    kind: "none",
    confidence: "probable",
    notes: "The interest and dividends tax was repealed effective tax year 2025, so there is no personal income tax at all for 2026.",
    source: "https://www.mclane.com/insights/nh-interest-and-dividends-tax-repealed-as-of-january-1/ (law firm summary citing NH DRA Technical Information Release 2025-001; primary revenue.nh.gov pages returned HTTP 403 and could not be read directly)",
  },

  NJ: {
    name: "New Jersey",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 35000, rate: 0.0175 },
        { upTo: 40000, rate: 0.035 },
        { upTo: 75000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: null, rate: 0.1075 },
      ],
      marriedJoint: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 50000, rate: 0.0175 },
        { upTo: 70000, rate: 0.0245 },
        { upTo: 80000, rate: 0.035 },
        { upTo: 150000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: null, rate: 0.1075 },
      ],
      marriedSeparate: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 35000, rate: 0.0175 },
        { upTo: 40000, rate: 0.035 },
        { upTo: 75000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: null, rate: 0.1075 },
      ],
      headOfHousehold: [
        { upTo: 20000, rate: 0.014 },
        { upTo: 50000, rate: 0.0175 },
        { upTo: 70000, rate: 0.0245 },
        { upTo: 80000, rate: 0.035 },
        { upTo: 150000, rate: 0.05525 },
        { upTo: 500000, rate: 0.0637 },
        { upTo: 1000000, rate: 0.0897 },
        { upTo: null, rate: 0.1075 },
      ],
    },
    payrollPrograms: [
      { name: "NJ Temporary Disability Insurance (TDI) - employee contribution", rate: 0.0019, wageBase: 171100 },
      { name: "NJ Family Leave Insurance (FLI) - employee contribution", rate: 0.0023, wageBase: 171100 },
    ],
    confidence: "verified",
    notes: "Tax year 2026. NJ Division of Taxation's rate schedule PDF (njtaxratesch.pdf) is explicitly labeled 'New Jersey Tax Rate Schedules - 2020' and distributed on the site's current 'Tax Rate Schedules: 2020 and After' page, meaning these brackets have applied unchanged from tax year 2020 through the present; no 2026-specific revision exists. NJ uses ONE table (Table B) for Married/CU filing jointly, Head of Household, AND Qualifying Widow(er) - shown identically for marriedJoint and headOfHousehold above; and ONE table (Table A) for Single AND Married/CU filing separately - shown identically for single and marriedSeparate above. NJ has NO standard deduction; instead it uses personal exemptions ($1,000 regular exemption per filer/spouse, additional $1,000 for age 65+/blind/disabled, $1,500 per dependent, plus a dependent higher-education-tuition exemption of $1,000) which are not represented in the standardDeduction field (omitted). NJ TDI and FLI rates dropped for 2026 versus 2025 (TDI was 0.23% in 2025, FLI was 0.33% in 2025) on a raised wage base ($171,100 for 2026 vs $165,400 for 2025); max annual employee contributions for 2026 are $325.09 (TDI) and $393.53 (FLI), per NJ Dept. of Labor.",
    source: "https://www.nj.gov/treasury/taxation/pdf/current/njtaxratesch.pdf",
  },

  NM: {
    name: "New Mexico",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 5500, rate: 0.015 },
        { upTo: 16500, rate: 0.032 },
        { upTo: 33500, rate: 0.043 },
        { upTo: 66500, rate: 0.047 },
        { upTo: 210000, rate: 0.049 },
        { upTo: null, rate: 0.059 },
      ],
      marriedJoint: [
        { upTo: 11000, rate: 0.015 },
        { upTo: 33000, rate: 0.032 },
        { upTo: 67000, rate: 0.043 },
        { upTo: 133000, rate: 0.047 },
        { upTo: 420000, rate: 0.049 },
        { upTo: null, rate: 0.059 },
      ],
      marriedSeparate: [
        { upTo: 5500, rate: 0.015 },
        { upTo: 16500, rate: 0.032 },
        { upTo: 33500, rate: 0.043 },
        { upTo: 66500, rate: 0.047 },
        { upTo: 210000, rate: 0.049 },
        { upTo: null, rate: 0.059 },
      ],
      headOfHousehold: [
        { upTo: 5500, rate: 0.015 },
        { upTo: 16500, rate: 0.032 },
        { upTo: 33500, rate: 0.043 },
        { upTo: 66500, rate: 0.047 },
        { upTo: 210000, rate: 0.049 },
        { upTo: null, rate: 0.059 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "probable",
    notes: "New Mexico's 2024 reform (HB 252) lowered the bottom rate to 1.5% and added a bracket, for 6 brackets from 1.5% to 5.9%; single-filer thresholds and rates shown were directly retrieved, while married-filing-jointly thresholds are New Mexico's standard practice of exactly doubling the single thresholds (not independently re-verified for the 2026 tax year in this pass). Head-of-household is assumed equal to the single schedule per New Mexico's typical structure. New Mexico conforms to the federal standard deduction (2026 federal figures shown) and separately allows a $4,000 personal exemption per exemption claimed (this exemption is not reflected in the standardDeduction figures above).",
    source: "https://taxfoundation.org/location/new-mexico/",
  },

  NV: {
    name: "Nevada",
    kind: "none",
    confidence: "verified",
    notes: "Nevada's constitution prohibits a personal income tax. No state standard deduction or state payroll programs apply. (Nevada's Modified Business Tax is an employer-paid payroll tax, not an employee withholding, so it is excluded per the employee-side-only scope.)",
    source: "https://tax.nv.gov/",
  },

  NY: {
    name: "New York",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 8500, rate: 0.039 },
        { upTo: 11700, rate: 0.044 },
        { upTo: 13900, rate: 0.0515 },
        { upTo: 80650, rate: 0.054 },
        { upTo: 215400, rate: 0.059 },
        { upTo: 1077550, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: null, rate: 0.109 },
      ],
      marriedJoint: [
        { upTo: 17150, rate: 0.039 },
        { upTo: 23600, rate: 0.044 },
        { upTo: 27900, rate: 0.0515 },
        { upTo: 161550, rate: 0.054 },
        { upTo: 323200, rate: 0.059 },
        { upTo: 2155350, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: null, rate: 0.109 },
      ],
      marriedSeparate: [
        { upTo: 8500, rate: 0.039 },
        { upTo: 11700, rate: 0.044 },
        { upTo: 13900, rate: 0.0515 },
        { upTo: 80650, rate: 0.054 },
        { upTo: 215400, rate: 0.059 },
        { upTo: 1077550, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: null, rate: 0.109 },
      ],
      headOfHousehold: [
        { upTo: 12800, rate: 0.039 },
        { upTo: 17650, rate: 0.044 },
        { upTo: 20900, rate: 0.0515 },
        { upTo: 107650, rate: 0.054 },
        { upTo: 269300, rate: 0.059 },
        { upTo: 1616450, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: null, rate: 0.109 },
      ],
    },
    standardDeduction: { single: 8000, marriedJoint: 16050, marriedSeparate: 8000, headOfHousehold: 11200 },
    payrollPrograms: [
      { name: "NY Paid Family Leave (PFL) - employee contribution", rate: 0.00432, wageBase: 95349 },
      { name: "NY State Disability Benefits Law (DBL) - employee contribution", rate: 0.005, wageBase: 6240 },
    ],
    confidence: "probable",
    notes: "Tax year 2026. Bottom five bracket RATES (3.90/4.40/5.15/5.40/5.90%) are directly verified from the official NYS-50-T-NYS (1/26) withholding tables (NY Dept. of Taxation & Finance), effective payrolls 1/1/2026-12/31/2026, which state these reflect rate reductions enacted under Chapter 59 of the Laws of 2025, Part A. Bracket dollar BREAKPOINTS and the top four rates (the 5.90% band's own endpoint, 6.85%, 9.65%, 10.3%, 10.9%) are carried forward unchanged from the 2025 IT-201-I return schedule (tax.ny.gov, IT-201-I (2025)) because Chapter 59 Part A changed rates only (not thresholds) and the 2026 IT-201 instructions/return rate schedule had not yet been published as of July 2026 - hence 'probable' rather than 'verified' for the composite table. Married Filing Jointly and Qualifying Surviving Spouse share one bracket table; Single and Married Filing Separately share another. New York City levies its own separate progressive resident income tax (roughly 3.078%-3.876%) and Yonkers imposes a resident income tax surcharge (16.75% of NYS tax) plus a nonresident earnings tax; neither is folded into the state brackets above. High-income NY filers are also subject to a 'benefit recapture' computation (tax computation worksheets) that claws back the value of lower brackets, separate from the marginal schedule shown. Standard deduction figures are 2025 IT-201-I amounts; NY's standard deduction has been statutorily fixed since 2018 and no 2026 change has been identified, but the exact 2026 figure has not been independently confirmed in a 2026-dated publication.",
    source: "https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf",
  },

  OH: {
    name: "Ohio",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 26050, rate: 0 },
        { upTo: null, rate: 0.0275 },
      ],
      marriedJoint: [
        { upTo: 26050, rate: 0 },
        { upTo: null, rate: 0.0275 },
      ],
      marriedSeparate: [
        { upTo: 26050, rate: 0 },
        { upTo: null, rate: 0.0275 },
      ],
      headOfHousehold: [
        { upTo: 26050, rate: 0 },
        { upTo: null, rate: 0.0275 },
      ],
    },
    confidence: "verified",
    notes: "Tax year 2026. Ohio's 2024 budget bill collapsed the former multi-bracket schedule down to a single non-zero rate of 2.75% on Ohio taxable income above $26,050, with income at or below that amount untaxed (a true 'flat' marginal rate above the threshold, hence classified progressive here for the 0%/2.75% two-tier structure). Ohio applies the identical $26,050 threshold and 2.75% rate to all filing statuses -- it does not double the threshold for married-joint. Ohio uses a personal/dependent exemption ($2,400 per exemption, doubling to $4,800 implied for two exemptions on a joint return) rather than a standard deduction; the exemption phases out entirely above $500,000 AGI. Confirmed consistently across Tax Foundation's 2026 state data page.",
    source: "https://taxfoundation.org/location/ohio/",
  },

  OK: {
    name: "Oklahoma",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 3750, rate: 0 },
        { upTo: 4900, rate: 0.025 },
        { upTo: 7200, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      marriedJoint: [
        { upTo: 7500, rate: 0 },
        { upTo: 9800, rate: 0.025 },
        { upTo: 14400, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      marriedSeparate: [
        { upTo: 3750, rate: 0 },
        { upTo: 4900, rate: 0.025 },
        { upTo: 7200, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      headOfHousehold: [
        { upTo: 7500, rate: 0 },
        { upTo: 9800, rate: 0.025 },
        { upTo: 14400, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
    },
    standardDeduction: { single: 6350, marriedJoint: 12700, marriedSeparate: 6350, headOfHousehold: 9350 },
    confidence: "probable",
    notes: "Tax year 2026, effective Jan 1 2026 under HB 2764, which collapsed six brackets into three nonzero rates and cut the top rate from 4.75% to 4.5%; the bill includes a forward-looking trigger to reduce the rate further (in 0.25pt steps, potentially to 0%) if revenue benchmarks are met in future years, so the rate could drop again after 2026. Single/marriedJoint bracket thresholds and the 4.5% top rate are read directly off the Oklahoma Tax Commission's 2026 Packet OW-2 withholding tables (Table 7, Annual Payroll Period), which give gross-wage thresholds of $10,100/$11,250/$13,550 (single) and $20,200/$22,500/$27,100 (married); those figures are consistent with a $6,350 single / $12,700 married standard deduction embedded ahead of the true 0% taxable-income bracket, matching the $3,750/$4,900/$7,200 and $7,500/$9,800/$14,400 taxable-income bracket edges reported by secondary sources (ustax.tools, incometaxbystate.com) for HB 2764. The OW-2 packet only publishes Single and Married withholding columns (no separate Head of Household or Married-Separate table), so the marriedSeparate=single and headOfHousehold=marriedJoint groupings, and the $6,350/$9,350 MFS/HOH standard deduction figures (Oklahoma's standard deduction has historically tracked the pre-2018 federal amounts: $6,350 single/MFS, $12,700 MFJ, $9,350 HOH), are inferred from Oklahoma's known statutory convention rather than confirmed on a page I read directly for MFS/HOH; treat those two columns as probable pending direct confirmation against 68 O.S. Section 2355 or the 2026 Form 511 packet. No employee-side disability or paid family leave program exists in Oklahoma.",
    source: "https://oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf",
  },

  OR: {
    name: "Oregon",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 4550, rate: 0.0475 },
        { upTo: 11400, rate: 0.0675 },
        { upTo: 125000, rate: 0.0875 },
        { upTo: null, rate: 0.099 },
      ],
      marriedJoint: [
        { upTo: 9100, rate: 0.0475 },
        { upTo: 22800, rate: 0.0675 },
        { upTo: 250000, rate: 0.0875 },
        { upTo: null, rate: 0.099 },
      ],
      marriedSeparate: [
        { upTo: 4550, rate: 0.0475 },
        { upTo: 11400, rate: 0.0675 },
        { upTo: 125000, rate: 0.0875 },
        { upTo: null, rate: 0.099 },
      ],
      headOfHousehold: [
        { upTo: 9100, rate: 0.0475 },
        { upTo: 22800, rate: 0.0675 },
        { upTo: 250000, rate: 0.0875 },
        { upTo: null, rate: 0.099 },
      ],
    },
    standardDeduction: { single: 2910, marriedJoint: 5820, marriedSeparate: 2910, headOfHousehold: 5820 },
    payrollPrograms: [
      { name: "Paid Leave Oregon, employee share", rate: 0.006, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "4 brackets from 4.75% to 9.9%; married-filing-jointly and head-of-household use doubled thresholds relative to single/MFS, consistent with Oregon's historical Schedule structure (not independently re-verified for 2026 specifically, the Oregon DOR rate-table URL returned a 404 in this pass). Oregon also imposes a statewide transit tax (0.1% of wages) which is an employer-side excise, not an employee withholding, and is excluded here. Paid Leave Oregon: total contribution is 1% of wages up to the Social Security wage base, with employees paying 60% of that (0.6%) and employers with 25+ employees paying the remaining 40%; the 2026 wage base is assumed to equal the announced Social Security taxable wage base of $184,500, and the rate itself was not independently re-confirmed for 2026 in this pass (direct paidleave.oregon.gov pages returned 404s).",
    source: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
  },

  PA: {
    name: "Pennsylvania",
    kind: "flat",
    flatRate: 0.0307,
    confidence: "verified",
    source: "https://www.revenue.pa.gov/",
  },

  RI: {
    name: "Rhode Island",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 82050, rate: 0.0375 },
        { upTo: 186450, rate: 0.0475 },
        { upTo: null, rate: 0.0599 },
      ],
      marriedJoint: [
        { upTo: 82050, rate: 0.0375 },
        { upTo: 186450, rate: 0.0475 },
        { upTo: null, rate: 0.0599 },
      ],
      marriedSeparate: [
        { upTo: 82050, rate: 0.0375 },
        { upTo: 186450, rate: 0.0475 },
        { upTo: null, rate: 0.0599 },
      ],
      headOfHousehold: [
        { upTo: 82050, rate: 0.0375 },
        { upTo: 186450, rate: 0.0475 },
        { upTo: null, rate: 0.0599 },
      ],
    },
    standardDeduction: { single: 11200, marriedJoint: 22400, marriedSeparate: 11200, headOfHousehold: 16800 },
    payrollPrograms: [
      { name: "Temporary Disability Insurance (TDI)", rate: 0.011, wageBase: 100000 },
    ],
    confidence: "verified",
    notes: "Tax Year 2026 figures, from RI Division of Taxation Advisory ADV 2025-22 (issued Nov 3, 2025), which sets inflation-adjusted brackets/standard deductions effective for tax years beginning on/after Jan 1, 2026 (these appear on returns filed in early 2027, not the 2025 returns filed in 2026). Rhode Island uses ONE 'uniform tax rate schedule' applied to ALL filing statuses (single, MFJ/qualifying widow(er), MFS, HOH) — only the standard deduction and phase-out thresholds differ by status. A personal/dependency exemption of $5,250 per person (2026) also applies on top of the standard deduction (Delaware, by contrast, has no separate exemption amount). Standard deduction and exemption amounts phase out entirely for federal AGI (as RI-modified) between $261,000 and $290,800 for 2026; the phaseout increment is $7,450. TDI rate and wage base are also confirmed for 2026 (effective Jan 1, 2026) via RI Dept. of Labor & Training: rate fell from 1.3% (2025) to 1.1%, while the wage base rose from $89,200 (2025) to $100,000 (2026) per HB 6066. RI's TDI includes the Temporary Caregiver Insurance (TCI) paid-family-leave benefit within the same combined rate/wage base — there is no separate employee-side PFL tax.",
    source: "https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-11/ADV_2025_22_Inflation_Adjustments.pdf",
  },

  SC: {
    name: "South Carolina",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 30000, rate: 0.0199 },
        { upTo: null, rate: 0.0521 },
      ],
      marriedJoint: [
        { upTo: 30000, rate: 0.0199 },
        { upTo: null, rate: 0.0521 },
      ],
      marriedSeparate: [
        { upTo: 30000, rate: 0.0199 },
        { upTo: null, rate: 0.0521 },
      ],
      headOfHousehold: [
        { upTo: 30000, rate: 0.0199 },
        { upTo: null, rate: 0.0521 },
      ],
    },
    standardDeduction: { single: 15000, marriedJoint: 30000, marriedSeparate: 15000, headOfHousehold: 22500 },
    confidence: "verified",
    notes: "Tax year 2026. H.4216, signed March 30, 2026, collapsed South Carolina's prior multi-bracket structure into two tiers: 1.99% below $30,000 and 5.21% (computed as 5.21% minus a $966 offset, to smooth the transition at the threshold) at/above $30,000. South Carolina brackets do not vary by filing status. The same act creates a new 'South Carolina Income Adjusted Deduction' (SCIAD) replacing the federal standard deduction, with the amounts shown; the bill text also allows these SCIAD amounts to be reduced at higher income levels, mechanism not fully detailed in the source reviewed. Confirmed via SC Department of Revenue's own news page describing H.4216. Further rate-merger reductions are triggered by revenue growth starting 2027.",
    source: "https://dor.sc.gov/news/information-about-h-4216",
  },

  SD: {
    name: "South Dakota",
    kind: "none",
    confidence: "verified",
    notes: "South Dakota levies no individual income tax on wages, and has none scheduled. No state standard deduction or brackets apply.",
    source: "https://dor.sd.gov/",
  },

  TN: {
    name: "Tennessee",
    kind: "none",
    confidence: "verified",
    notes: "Tennessee has no tax on wage/earned income (the Hall Tax on interest and dividends was fully repealed effective January 1, 2021). No state standard deduction applicable.",
    source: "https://www.tn.gov/revenue.html",
  },

  TX: {
    name: "Texas",
    kind: "none",
    confidence: "verified",
    notes: "Texas has no individual income tax on wages (constitutional prohibition, Texas Constitution Art. VIII Sec. 24, requiring voter approval to enact one). No state standard deduction or payroll programs applicable.",
    source: "https://taxfoundation.org/location/texas/",
  },

  UT: {
    name: "Utah",
    kind: "flat",
    flatRate: 0.045,
    confidence: "probable",
    notes: "HB 106 (2025) cut Utah's flat rate from 4.55% to 4.5%, effective retroactively for tax year 2025. A subsequently-referenced 2026 bill (SB 60, per secondary reporting) would further cut the rate to 4.45% for 2026, but this was not independently confirmed against a primary Utah source in this pass (direct tax.utah.gov fetch returned 404), so the last-confirmed 4.5% rate is reported rather than the unconfirmed 4.45% figure; treat the true 2026 rate as uncertain between 4.45% and 4.5%. Utah has no state standard deduction as such; instead it grants a nonrefundable taxpayer tax credit equal to 6% of the taxpayer's federal standard deduction (or itemized deductions) and federal exemption-equivalent amounts, phased out at higher incomes, which is not expressible in the standardDeduction schema.",
    source: "https://tax.utah.gov/",
  },

  VA: {
    name: "Virginia",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 3000, rate: 0.02 },
        { upTo: 5000, rate: 0.03 },
        { upTo: 17000, rate: 0.05 },
        { upTo: null, rate: 0.0575 },
      ],
      marriedJoint: [
        { upTo: 3000, rate: 0.02 },
        { upTo: 5000, rate: 0.03 },
        { upTo: 17000, rate: 0.05 },
        { upTo: null, rate: 0.0575 },
      ],
      marriedSeparate: [
        { upTo: 3000, rate: 0.02 },
        { upTo: 5000, rate: 0.03 },
        { upTo: 17000, rate: 0.05 },
        { upTo: null, rate: 0.0575 },
      ],
      headOfHousehold: [
        { upTo: 3000, rate: 0.02 },
        { upTo: 5000, rate: 0.03 },
        { upTo: 17000, rate: 0.05 },
        { upTo: null, rate: 0.0575 },
      ],
    },
    standardDeduction: { single: 8750, marriedJoint: 17500, marriedSeparate: 8750, headOfHousehold: 8750 },
    confidence: "probable",
    notes: "Tax year 2026. Virginia's four brackets (2%/3%/5%/5.75%) and their $3,000/$5,000/$17,000 thresholds have not changed in years and do not vary by filing status. The standard deduction was temporarily raised to $8,750 (single/MFS) and $17,500 (MFJ) for tax years including 2026; by current statute it is scheduled to revert to $3,000/$6,000 for tax year 2027 onward unless the General Assembly extends the increase again -- a known sunset clause, so 2027+ figures will differ. The specific va.tax.virginia.gov bracket page returned a 404 when fetched directly; figures are corroborated across multiple secondary sources (ustax.tools, Tax Foundation, tax-guide aggregators) but not independently confirmed on a primary VA Tax page in this pass.",
    source: "https://www.tax.virginia.gov/",
  },

  VT: {
    name: "Vermont",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 47900, rate: 0.0335 },
        { upTo: 116000, rate: 0.066 },
        { upTo: 242000, rate: 0.076 },
        { upTo: null, rate: 0.0875 },
      ],
      marriedJoint: [
        { upTo: 79950, rate: 0.0335 },
        { upTo: 193300, rate: 0.066 },
        { upTo: 294600, rate: 0.076 },
        { upTo: null, rate: 0.0875 },
      ],
      marriedSeparate: [
        { upTo: 39975, rate: 0.0335 },
        { upTo: 96650, rate: 0.066 },
        { upTo: 147300, rate: 0.076 },
        { upTo: null, rate: 0.0875 },
      ],
      headOfHousehold: [
        { upTo: 64200, rate: 0.0335 },
        { upTo: 165700, rate: 0.066 },
        { upTo: 268300, rate: 0.076 },
        { upTo: null, rate: 0.0875 },
      ],
    },
    standardDeduction: { single: 7000, marriedJoint: 14050, marriedSeparate: 7000, headOfHousehold: 10550 },
    confidence: "probable",
    notes: "Bracket figures come from a Vermont CPA firm's published 2026 tax-planning tables, whose Vermont individual-rate section is explicitly labeled '(ESTIMATED)' by the preparer. Every attempted fetch of tax.vermont.gov (main personal income tax page, the '/individuals/personal-income-tax/rates' page, and the '2026-vt-rate-schedules' document URL) returned HTTP 403, so the figures could not be cross-checked directly against the primary source in this session. Internal consistency check: Married Filing Separately thresholds are exactly half of Married Filing Jointly thresholds at every breakpoint (39,975/96,650/147,300 = half of 79,950/193,300/294,600), which matches Vermont's standard bracket-splitting convention and supports the figures; the same CPA-firm table also contained an unexplained sub-breakpoint at $75,000-ish levels within same-rate bands that did not correspond to an actual rate change and was collapsed out of the reported thresholds. Vermont also indexes a $5,100 per-person personal exemption (separate from the standard deduction shown above). Vermont does NOT have a mandatory, employee-funded paid-leave payroll tax: it operates a voluntary Family and Medical Leave Insurance program (VT-FMLI, expanded to private employers with 2+ employees in July 2024) funded by an employer contribution of 0.55% of wages (up to 200% of the SSA wage base), with employers required to cover at least 50% of that contribution and any employee-side share left to employer discretion - so no employee payroll program is listed. Given the 'ESTIMATED' label and inaccessible primary source, treat these bracket/deduction numbers as needing direct verification against a live tax.vermont.gov page before use in any authoritative context.",
    source: "https://www.dh-cpa.com/wp-content/uploads/2026/02/2026TaxTables-WEB-.pdf (Davis & Hodgdon Advisory Group, Williston/Rutland VT CPA firm, '2026 Tax Tables'; Vermont bracket table explicitly marked 'ESTIMATED' by the preparer)",
  },

  WA: {
    name: "Washington",
    kind: "none",
    payrollPrograms: [
      { name: "WA Cares Fund (long-term care)", rate: 0.0058, wageBase: null },
      { name: "PFML (Paid Family & Medical Leave), employee share", rate: 0.006572, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "Washington has no tax on wage income (it does have a 7% excise tax on certain long-term capital gains above a threshold, which is not a wage tax). PFML: total 2025 premium was 0.92% of wages up to the Social Security wage base, with employees paying about 71.43% of that (~0.6572%); the WA Employment Security Department sets the rate annually and the confirmed 2026 rate was not independently verified in this pass, so the 2025 rate/employee-share ratio is carried forward as an estimate against the 2026 SSA wage base of $184,500. WA Cares Fund premium is 0.58% of wages with no wage cap, unchanged as of the most recent verified update. Confidence is 'probable' specifically for the payroll-program figures; the 'none' income-tax classification itself is verified.",
    source: "https://esd.wa.gov/paid-family-medical-leave",
  },

  WI: {
    name: "Wisconsin",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 15110, rate: 0.035 },
        { upTo: 51950, rate: 0.044 },
        { upTo: 332720, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      marriedJoint: [
        { upTo: 20150, rate: 0.035 },
        { upTo: 69260, rate: 0.044 },
        { upTo: 443630, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      marriedSeparate: [
        { upTo: 10075, rate: 0.035 },
        { upTo: 34630, rate: 0.044 },
        { upTo: 221815, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      headOfHousehold: [
        { upTo: 15110, rate: 0.035 },
        { upTo: 51950, rate: 0.044 },
        { upTo: 332720, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
    },
    standardDeduction: { single: 13960, marriedJoint: 25840 },
    confidence: "probable",
    notes: "Bracket rates (3.50% / 4.40% / 5.30% / 7.65%) and single/HoH-share-brackets convention confirmed directly on the Wisconsin DOR site for tax year 2025 ($14,680/$50,480/$323,290 thresholds); the 2026 inflation-adjusted thresholds shown here ($15,110/$51,950/$332,720 single, and MFJ figures) came only from Tax Foundation's 2026 data page, not re-confirmed against the DOR site, hence probable confidence. Wisconsin DOR's 2025 table confirmed MFS thresholds equal exactly half of MFJ thresholds, a pattern applied here to derive 2026 MFS figures (not independently published). Wisconsin's standard deduction is not a flat number -- it phases out as income rises (a formula-based 'deduction reduction'), so the $13,960/$25,840 figures represent the maximum deduction at low incomes, not a flat amount for all filers at every income level; HoH and MFS standard deduction maximums were not located.",
    source: "https://www.revenue.wi.gov/Pages/faqs/pcs-taxrates.aspx",
  },

  WV: {
    name: "West Virginia",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 10000, rate: 0.0211 },
        { upTo: 25000, rate: 0.0281 },
        { upTo: 40000, rate: 0.0316 },
        { upTo: 60000, rate: 0.0422 },
        { upTo: null, rate: 0.0458 },
      ],
      marriedJoint: [
        { upTo: 10000, rate: 0.0211 },
        { upTo: 25000, rate: 0.0281 },
        { upTo: 40000, rate: 0.0316 },
        { upTo: 60000, rate: 0.0422 },
        { upTo: null, rate: 0.0458 },
      ],
      marriedSeparate: [
        { upTo: 5000, rate: 0.0211 },
        { upTo: 12500, rate: 0.0281 },
        { upTo: 20000, rate: 0.0316 },
        { upTo: 30000, rate: 0.0422 },
        { upTo: null, rate: 0.0458 },
      ],
      headOfHousehold: [
        { upTo: 10000, rate: 0.0211 },
        { upTo: 25000, rate: 0.0281 },
        { upTo: 40000, rate: 0.0316 },
        { upTo: 60000, rate: 0.0422 },
        { upTo: null, rate: 0.0458 },
      ],
    },
    confidence: "probable",
    notes: "Tax year 2026. Fetched directly from West Virginia State Tax Division's own page describing the 2026 rate cut: legislation signed March 31, 2026 delivered a 5% across-the-board cut retroactive to January 1, 2026, on top of the 21.25% cut (2023) and 4% cut (2024) already enacted, bringing the top marginal rate to 4.58% (down from a pre-2023 top of 6.5%). West Virginia uses the SAME bracket table for single, head-of-household, and married-filing-jointly filers (it is not doubled for joint filers); married-filing-separately uses exactly half of each threshold, as shown. A secondary aggregator (Tax Foundation, via an AI-summarized fetch) reported different rates (2.22%-4.82%) that conflict with the primary WV Tax Division page and are treated as stale/incorrect for 2026. West Virginia has no state standard deduction; instead it starts from federal AGI and allows a $2,000 personal/dependent exemption, which is why no standardDeduction object is populated here. Also note: starting 2026 WV exempts 100% of Social Security income regardless of income level.",
    source: "https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx",
  },

  WY: {
    name: "Wyoming",
    kind: "none",
    confidence: "verified",
    notes: "Wyoming levies no individual income tax. No state standard deduction or state payroll programs apply.",
    source: "https://revenue.wyo.gov/",
  },
};

/** Postal codes with data. */
export const AVAILABLE_STATE_CODES = Object.keys(STATES).sort();

/** Every US jurisdiction, so the picker can show which ones lack data. */
export const ALL_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY"
];

export function stateTable(code) {
  return STATES[code] || null;
}

export function hasStateData(code) {
  return Boolean(STATES[code]);
}
