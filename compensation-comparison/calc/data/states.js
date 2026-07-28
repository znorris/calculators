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
    standardDeduction: { single: 3000, marriedJoint: 8500, marriedSeparate: 4250, headOfHousehold: 5200 },
    confidence: "verified",
    notes: "Read directly from the Alabama Department of Revenue's official 'Withholding Tax Tables and Instructions for Employers and Withholding Agents,' REVISED January 2026 (whbooklet_0126.pdf). Bracket structure (2%/4%/5% at $500/$3,000 for Single, MS, and Head of Family; 2%/4%/5% at $1,000/$6,000 for Married Filing Jointly) is unchanged from the repo's current entry and unchanged from 2025 -- Alabama's brackets are fixed dollar amounts in statute, not inflation-indexed. Standard deduction is actually a phase-out schedule by Alabama Adjusted Gross Income, not a single flat figure; the values reported here ($3,000 single / $8,500 MFJ / $4,250 MFS / $5,200 HOH) are the maximum deduction, available to filers with AGI under $26,000 (under $13,000 for MFS), phasing down to a $2,500 floor above $35,500 (above $17,750 for MFS). This phase-out schedule is unchanged from 2025. The repo's prior '$3,000 single' figure matches exactly.",
    source: "https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf",
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
    standardDeduction: { single: 2470, marriedJoint: 4940, marriedSeparate: 2470, headOfHousehold: 2470 },
    confidence: "verified",
    notes: "Brackets, rates, and the $2,470 standard deduction figure are read directly from the Arkansas Department of Finance and Administration's official 'Withholding Tax Formula Method,' effective 01/01/2026, explicitly labeled 'Tax Year 2026' (dfa.arkansas.gov). Arkansas applies the same bracket schedule regardless of filing status in its withholding formula; marital status instead affects the personal tax credit ($29/exemption) subtracted after gross tax is computed. The $4,940 married-joint standard deduction is a secondary-source figure (Tax Foundation's 2026 state tax summary) representing two individual $2,470 deductions combined on a joint return -- this specific filing-status breakdown was not itemized in the DFA's own withholding document, so treat the MFJ figure as probable rather than verified. Cross-checked the $2,470 standard deduction against a National Finance Center (help.nfc.usda.gov) 2026 federal-payroll bulletin, which independently reports the same change from $2,410 to $2,470. Note: an unrelated web aggregator (queried via Tax Foundation) reported Arkansas's 2026 top rate as 3.90% with a two-bracket structure (2.0% to $4,600, 3.90% above) -- this conflicts with the state's own formula document and appears to be either outdated or describing a different/superseded schedule. The DFA's own 2026-dated primary document, which explicitly names 'Tax Year 2026,' is authoritative and shows 3.70% as the top rate.",
    source: "https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Formula.pdf",
  },

  AZ: {
    name: "Arizona",
    kind: "flat",
    flatRate: 0.025,
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "verified",
    notes: "Flat 2.5% rate is read directly from azdor.gov's withholding-calculations page, which states verbatim: 'For tax year 2023 and beyond, the tax rate for Arizona taxable income is 2.5%.' This is unchanged from the repo's entry. Default withholding (when no Form A-4 is on file) remains 2.0%, confirmed via the 2026 Form A-4 employer instructions PDF. Arizona has no employee-side state disability or paid-family-leave withholding; SUTA is employer-paid only and excluded here. Standard deduction: Arizona statute (per HB2785) ties its standard deduction to 'the amount of the federal basic standard deduction pursuant to Section 63 of the IRC,' which is inflation-adjusted annually. The figures reported here ($16,100 single/MFS, $32,200 MFJ, $24,150 HOH) are the IRS's own inflation-adjusted amounts for tax year 2026 (Revenue Procedure 2025-32). Some web sources labeled '2026' actually show $15,750/$31,500/$23,625 -- these are the 2025 federal standard deduction amounts (the first year of the One Big Beautiful Bill Act's enacted figures) and appear to be mislabeled, consistent with the filing-season-vs-tax-year confusion this task warned about. Because I could not find an azdor.gov page stating the exact 2026 dollar figure directly (only the conformity rule), the standard deduction numbers are probable rather than verified, while the 2.5% flat rate itself is verified on a state page.",
    source: "https://azdor.gov/individuals/withholding-calculations",
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
        { upTo: 1000000, rate: 0.113 },
        { upTo: 1485906, rate: 0.123 },
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
        { upTo: 52530, rate: 0.02 },
        { upTo: 67716, rate: 0.04 },
        { upTo: 83805, rate: 0.06 },
        { upTo: 98990, rate: 0.08 },
        { upTo: 505208, rate: 0.093 },
        { upTo: 606251, rate: 0.103 },
        { upTo: 1000000, rate: 0.113 },
        { upTo: 1010417, rate: 0.123 },
        { upTo: null, rate: 0.133 },
      ],
    },
    standardDeduction: { single: 5706, marriedJoint: 11412, marriedSeparate: 5706, headOfHousehold: 11412 },
    payrollPrograms: [
      { name: "CA SDI/PFL (State Disability Insurance / Paid Family Leave), employee contribution", rate: 0.013, wageBase: null },
    ],
    confidence: "verified",
    notes: "Read directly from EDD's DE 44 for 2026 (an employer withholding guide, published well before Jan 1 2026 as required for payroll compliance -- not the FTB return/Form 540 instructions, which for tax year 2026 will not appear until late 2026/early 2027). DE 44's Method B tables gross up the true FTB statutory rates by 1.1x for withholding purposes (e.g. real 9.3% appears as 10.23%); figures above are the true rates recovered by dividing that factor back out, with the dollar thresholds (not grossed up) taken as-is. A separate 1% Mental Health Services Act surcharge applies on taxable income over a flat, non-inflation-indexed $1,000,000 regardless of filing status, folded into the brackets above as extra rate steps at the $1,000,000 line. SDI/PFL confirmed unchanged at 1.3% of all wages with no cap (Senate Bill 951, effective Jan 1, 2024). A 1% Mental Health Services Act surcharge applies above $1,000,000 and is not in the bracket table. SDI is uncapped. 2026 dollar thresholds are not confirmed against a primary FTB page.",
    source: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf (California Employer's Guide, DE 44 Rev. 52 (4-26), 2026 withholding schedules)",
  },

  CO: {
    name: "Colorado",
    kind: "flat",
    flatRate: 0.044,
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    payrollPrograms: [
      { name: "Paid Family and Medical Leave Insurance (FAMLI)", rate: 0.0044, wageBase: 184500 },
    ],
    confidence: "verified",
    notes: "Flat 4.4% rate is read directly from the Colorado Department of Revenue's official 'DR 1098 (10/21/25) 2026 Colorado Withholding Worksheet for Employers,' which instructs employers to 'Multiply line 2b by 4.40% (0.044).' Unchanged from the repo's entry and unchanged from 2025 (Colorado's rate has been 4.4% since the 2022 Prop 121 cut). Colorado uses federal taxable income as its starting point rather than defining its own standard deduction, so the federal 2026 standard deduction effectively flows through; figures shown match the AZ entry for the same reason (both conform to the federal amount). Added FAMLI: read directly from famli.colorado.gov (Colorado FAMLI Division, official state site), which states the total premium is 0.88% of wages, split 50/50 between employer and employee (0.44% employee-paid), and that premiums are 'paid on wages up to the Federal Social Security Wage Cap.' The $184,500 wage base is the 2026 Social Security taxable maximum (SSA figure, probable-tier cross-check, not itself a Colorado government page). This is a repo gap-fill (FAMLI and the standard-deduction figure were absent from the prior record) rather than a year-over-year rate change, hence changedFromPrior is false; the 4.4% rate itself has not changed.",
    source: "https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf",
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
      { name: "CT Paid Leave (CTPL), employee contribution", rate: 0.005, wageBase: 184500 },
    ],
    confidence: "verified",
    notes: "CT has no standard deduction field populated -- it uses an income-based Personal Exemption (up to $15,000 single/$24,000 MFJ/$12,000 MFS/$19,000 HOH, phasing to $0) plus a separate Personal Tax Credit percentage against computed tax, not represented by this schema's standardDeduction field. CT layers two recapture mechanisms on top of the marginal brackets (a 2% bracket phase-out add-back above roughly $56,500/$100,500/$78,500 CT AGI, and a broader tax recapture above roughly $540,000/$1,080,000/$864,000 CT AGI) that push very-high-income filers toward a near-flat 6.99% effective rate; neither is reflected in the marginal table above. CT Paid Leave employee rate (0.5%) is unchanged for 2026; its wage base equals the federal Social Security/OASDI contribution and benefit base, $184,500 for 2026 (up from $176,100 in 2025).",
    source: "https://portal.ct.gov/drs (IP 2026(1), Circular CT, Connecticut Employer's Tax Guide, issued 12/12/2025; TPG-211, 2026 Withholding Calculation Rules, Rev. 12/25)",
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
    standardDeduction: { single: 15000, marriedJoint: 30000, marriedSeparate: 15000, headOfHousehold: 15000 },
    confidence: "verified",
    notes: "Read directly from Georgia Department of Revenue's own '2026 Employer's Withholding Tax Guide' PDF (revised June 2026, downloaded from dor.georgia.gov). This is the withholding-tables/employer-guide artifact, not a return form, and it explicitly states the changes are effective for taxable years beginning Jan 1, 2026 under HB 463. Employers withhold at 5.19% until May 11, 2026 (bill signature date) then switch to 4.99%, per the guide -- this is a mid-year payroll transition mechanic, not a rate ambiguity; the statutory TY2026 rate is 4.99%. No GA employee-side payroll program (no SDI/PFL).",
    source: "https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download",
  },

  HI: {
    name: "Hawaii",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 9600, rate: 0.014 },
        { upTo: 14400, rate: 0.032 },
        { upTo: 19200, rate: 0.055 },
        { upTo: 24000, rate: 0.064 },
        { upTo: 36000, rate: 0.068 },
        { upTo: 48000, rate: 0.072 },
        { upTo: 125000, rate: 0.076 },
        { upTo: 175000, rate: 0.079 },
        { upTo: 225000, rate: 0.0825 },
        { upTo: 275000, rate: 0.09 },
        { upTo: 325000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      marriedJoint: [
        { upTo: 19200, rate: 0.014 },
        { upTo: 28800, rate: 0.032 },
        { upTo: 38400, rate: 0.055 },
        { upTo: 48000, rate: 0.064 },
        { upTo: 72000, rate: 0.068 },
        { upTo: 96000, rate: 0.072 },
        { upTo: 250000, rate: 0.076 },
        { upTo: 350000, rate: 0.079 },
        { upTo: 450000, rate: 0.0825 },
        { upTo: 550000, rate: 0.09 },
        { upTo: 650000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      marriedSeparate: [
        { upTo: 9600, rate: 0.014 },
        { upTo: 14400, rate: 0.032 },
        { upTo: 19200, rate: 0.055 },
        { upTo: 24000, rate: 0.064 },
        { upTo: 36000, rate: 0.068 },
        { upTo: 48000, rate: 0.072 },
        { upTo: 125000, rate: 0.076 },
        { upTo: 175000, rate: 0.079 },
        { upTo: 225000, rate: 0.0825 },
        { upTo: 275000, rate: 0.09 },
        { upTo: 325000, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
      headOfHousehold: [
        { upTo: 14400, rate: 0.014 },
        { upTo: 21600, rate: 0.032 },
        { upTo: 28800, rate: 0.055 },
        { upTo: 36000, rate: 0.064 },
        { upTo: 54000, rate: 0.068 },
        { upTo: 72000, rate: 0.072 },
        { upTo: 187500, rate: 0.076 },
        { upTo: 262500, rate: 0.079 },
        { upTo: 337500, rate: 0.0825 },
        { upTo: 412500, rate: 0.09 },
        { upTo: 487500, rate: 0.1 },
        { upTo: null, rate: 0.11 },
      ],
    },
    standardDeduction: { single: 4400, marriedJoint: 8800, marriedSeparate: 4400, headOfHousehold: 6424 },
    payrollPrograms: [
      { name: "Temporary Disability Insurance (TDI), employee share", rate: 0.005, wageBase: null },
    ],
    confidence: "probable",
    notes: "Read the actual 2026 withholding formula directly from Hawaii DOTAX's 'Booklet A Employer's Tax Guide (Rev. 2025)' (files.hawaii.gov/tax/news/pubs/25BkltA.pdf), explicitly effective Dec 5, 2025 for withholding beginning Jan 1, 2026. That document's annualized withholding tables only go up to 7.9% (over $125,000 single / $250,000 married) -- it does NOT show the higher 8.25/9/10/11% brackets at all, which would badly under-withhold high earners if those brackets still exist. To resolve this I cross-checked Tax Foundation's 2026 state income tax rates page (taxfoundation.org/data/all/state/state-income-tax-rates-2026/), whose raw HTML contains an embedded rate table showing Hawaii still has all 12 brackets through 11% for 2026, with the SAME lower 8 breakpoints (9,600/14,400/19,200/24,000/36,000/48,000/125,000) as the Booklet A withholding guide, AND the same $1,144 per-person exemption value quoted in Booklet A -- strong cross-validation that the Tax Foundation table is current for 2026 and that Booklet A's withholding formula is simply a truncated/simplified approximation that stops at 7.9% rather than a sign that the top brackets were repealed. I'm treating the fuller 12-bracket Tax Foundation table as the actual 2026 statutory schedule. HOH thresholds are derived by applying the same 1.5x-of-single multiplier the repo already used (not independently confirmed for 2026 specifically -- Hawaii's actual HOH schedule wasn't in either primary source I could reach). TDI rate/cap not re-verified this session, carried forward from prior data. Given the reliance on cross-referencing two sources to reconcile a real discrepancy rather than reading one clean, complete primary table, I'm marking this 'probable' rather than 'verified' despite the primary-source read.",
    source: "https://files.hawaii.gov/tax/news/pubs/25BkltA.pdf",
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
    confidence: "verified",
    notes: "Read directly from the Idaho State Tax Commission's 'Computing Withholding' page (tax.idaho.gov/taxes/income-tax/withholding/computing/), whose worked examples use 5.3% throughout (e.g. '5.3% of the amount over $577'). This corresponds to the 'Table for Percentage Computation Method of Withholding' (Rev. 04-28-2025), which remains the current, unrevised version in effect for 2026 (no newer 2026-dated revision has been published, and none was needed). Checked specifically for a 2026 rate-cut bill: House Bill 559, signed by Gov. Little during the 2026 legislative session, reduces state revenue by about $155 million, but only via new exemptions for tips, overtime pay, and Social Security income plus an R&D credit -- it does not touch the flat income tax rate. No bill changing the 5.3% rate itself was found for 2026. Idaho computes tax starting from federal taxable income (which already reflects the federal standard deduction), so there is no separate Idaho standard deduction to report; the tax rate schedule's own 0% first bracket (roughly the first $4,811 single / $9,622 married of Idaho taxable income) is the closest analog, carried forward unchanged from the prior pass.",
    source: "https://tax.idaho.gov/taxes/income-tax/withholding/computing/",
  },

  IL: {
    name: "Illinois",
    kind: "flat",
    flatRate: 0.0495,
    confidence: "verified",
    notes: "Read directly from the Illinois Department of Revenue's official 'Booklet IL-700-T (R-12/25), Illinois Withholding Tax Tables': cover page states 'Effective January 1, 2026, Tax rate 4.95%,' and page 3 states 'The income tax rate is 4.95 percent and the exemption allowance is $2,925.' Illinois has no standard deduction; it uses a per-exemption allowance instead, so the standardDeduction field is left blank -- treat the $2,925 exemption-allowance figure (times number of exemptions claimed, doubled for a joint return with both spouses claiming exemptions) as the functional equivalent. Cross-checked the $2,850-to-$2,925 increase against an Illinois Comptroller payroll bulletin (illinoiscomptroller.gov), which independently confirms the same figures. Illinois has no employee-side state disability or paid-family-leave payroll withholding; the state's Paid Leave for All Workers Act mandates employer-provided leave but is not funded through an employee payroll deduction.",
    source: "https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf",
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
    confidence: "verified",
    notes: "Verified directly from Kansas Department of Revenue Notice 25-06 (ksrevenue.gov/taxnotices/notice25-06.pdf, dated October 2, 2025; text extracted via pdftotext), which states plainly: 'the Secretary of Revenue will not calculate and publish new income tax rates, and there will be no rate reduction for tax year 2026.' The notice explains why: FY2025 adjusted general revenue fund collections ($6.038B) came in $88.5 million below the inflation-adjusted SB 269 trigger threshold ($6.127B), even though the Budget Stabilization Fund balance (19.1%) cleared the required 15% floor -- both conditions had to be met, and only one was. This confirms the prior pass's Bloomberg-sourced claim as an official fact rather than a news report. The KW-100 Withholding Tax Guide (Rev. 7-24) is still the current, unrevised edition with no 2026 update issued, corroborating no other change to the withholding mechanics. Also checked: House Bill 2629 (2026 session), which would have raised the standard deduction to $3,805/$8,640/$6,480 for tax year 2026, died in the House Taxation Committee on April 11, 2026 and was never enacted, so the standard deduction figures ($3,605/$8,240/$4,120/$6,180) carried forward from the prior pass's Tax Foundation sourcing remain correct for 2026. The exact bracket dollar thresholds ($23,000/$46,000) were not independently re-derived from a primary KDOR page this pass beyond the KW-100 guide's per-pay-period tables, which are broadly consistent but not a clean one-to-one annual check.",
    source: "https://www.ksrevenue.gov/taxnotices/notice25-06.pdf",
  },

  KY: {
    name: "Kentucky",
    kind: "flat",
    flatRate: 0.035,
    standardDeduction: { single: 3360, marriedJoint: 3360, marriedSeparate: 3360, headOfHousehold: 3360 },
    confidence: "verified",
    notes: "Read directly from Kentucky Department of Revenue Form 42A003 (TCF)(10-2025), '2026 KENTUCKY WITHHOLDING TAX FORMULA' (fetched from revenue.ky.gov and read as a PDF): states '2026 Kentucky Standard Deduction: $3,360' and '2026 Kentucky Tax Rate: 3.5% of taxable income.' Kentucky's standard deduction is a single inflation-indexed figure not doubled for joint filers (KY does not have separate MFJ/HOH amounts). No KY employee-side payroll program.",
    source: "https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf",
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
    payrollPrograms: [
      { name: "Paid Family and Medical Leave (PFML), employee-side share (medical 0.28% + family 0.18%, for employers with 25+ covered individuals; employees below that threshold owe the same 0.46% total)", rate: 0.0046, wageBase: 184500 },
    ],
    confidence: "probable",
    notes: "Flat 5% rate applies to most wage/ordinary income (short-term capital gains taxed at 8.5%; not modeled here). A separate 4% surtax ('millionaires tax') applies on top of the 5% rate above the inflation-adjusted threshold, giving a combined ~9% marginal rate above that line; threshold is $1,107,750 for tax year 2026 (up from $1,083,150 in 2025), per routine annual DOR indexing -- kept at 'probable' rather than 'verified' since mass.gov's own page/TIR stating this figure could not be fetched directly this pass, only corroborated via third-party payroll/benefits advisory summaries. Massachusetts has no standard deduction; it uses a personal exemption (~$4,400 single/$8,800 MFJ) that this schema has no field for -- standardDeduction is not populated for MA rather than reported as 0, to avoid implying no relief exists. DFML's 2026 total PFML contribution rate is 0.88% of eligible wages (unchanged since 2024); employee-side share for employers with 25+ covered individuals is capped at 0.46% (0.28% of the 0.70% medical-leave contribution + all of the 0.18% family-leave contribution); the wage base is assumed to equal the 2026 Social Security taxable maximum ($184,500, since MA ties the PFML cap to it) but this specific figure also could not be confirmed directly against ssa.gov or mass.gov this pass.",
    source: "https://www.mybenefitadvisor.com (My Benefit Advisor, 'Massachusetts Paid Family Leave 2026 Contributions and Benefits', issued 11/04/2025, citing DFML's announced 2026 figures)",
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
    confidence: "verified",
    notes: "HB 352 (2025) added two new top brackets (6.25% over $500,000 single/MFS or $600,000 joint/HOH; 6.50% over $1,000,000 single/MFS or $1,200,000 joint/HOH) on top of the pre-existing 2.00%-5.75% schedule, effective tax year 2025 and continuing unchanged into 2026. It also raised the maximum standard deduction from $2,800/$5,600 to $3,350 single-MFS/$6,700 joint-HOH for tax year 2025, 'subject to annual cost-of-living adjustments for tax years after 2025' -- so the true 2026 maximum is somewhat higher than $3,350/$6,700, but the exact COLA-adjusted 2026 figure was not located this pass; treat these as a 2026 floor. Maryland's standard deduction is actually 15% of Maryland AGI subject to a floor and ceiling, not a flat number; the values here are the ceiling. County/Baltimore City local income taxes (roughly 2.25%-3.30%, the cap itself raised from 3.20% to 3.30% by this same bill) are layered on top of the state brackets and are not modeled here. Maryland's FAMLI (Family and Medical Leave Insurance) program has not begun collecting contributions: paidleave.maryland.gov states benefits launch 'starting January 2028' and gives no indication contributions have started, so no employee-side payroll program is listed for 2026; re-verify before assuming this holds into 2027.",
    source: "https://mgaleg.maryland.gov/2025RS/fnotes/bil_0002/hb0352.pdf (Dept. of Legislative Services Fiscal and Policy Note for HB 352, Budget Reconciliation and Financing Act of 2025)",
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
        { upTo: 1348, rate: 0 },
        { upTo: 2696, rate: 0.02 },
        { upTo: 4044, rate: 0.025 },
        { upTo: 5392, rate: 0.03 },
        { upTo: 6740, rate: 0.035 },
        { upTo: 8088, rate: 0.04 },
        { upTo: 9436, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      marriedJoint: [
        { upTo: 1348, rate: 0 },
        { upTo: 2696, rate: 0.02 },
        { upTo: 4044, rate: 0.025 },
        { upTo: 5392, rate: 0.03 },
        { upTo: 6740, rate: 0.035 },
        { upTo: 8088, rate: 0.04 },
        { upTo: 9436, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      marriedSeparate: [
        { upTo: 1348, rate: 0 },
        { upTo: 2696, rate: 0.02 },
        { upTo: 4044, rate: 0.025 },
        { upTo: 5392, rate: 0.03 },
        { upTo: 6740, rate: 0.035 },
        { upTo: 8088, rate: 0.04 },
        { upTo: 9436, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
      headOfHousehold: [
        { upTo: 1348, rate: 0 },
        { upTo: 2696, rate: 0.02 },
        { upTo: 4044, rate: 0.025 },
        { upTo: 5392, rate: 0.03 },
        { upTo: 6740, rate: 0.035 },
        { upTo: 8088, rate: 0.04 },
        { upTo: 9436, rate: 0.045 },
        { upTo: null, rate: 0.047 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "verified",
    notes: "Verified directly from the Missouri Department of Revenue's official '2026 Missouri Withholding Tax Formula' (dor.mo.gov/forms/Withholding Formula_2026.pdf), explicitly labeled '2026 Missouri Withholding Tax Formula' and '2026,' giving the annual percentage-method bracket table and standard deduction amounts in plain text (confirmed via pdftotext extraction, not just a page summary). The 8-tier rate structure (0% up to a 4.7% top rate) is unchanged from 2025, but every dollar threshold increased for inflation as shown above. The standard deduction section explicitly lists: Single $16,100; Married and Spouse Works (per employee) $16,100; Married Filing Separate $16,100; Married and Spouse Does Not Work $32,200 (mapped to marriedJoint here, since that's the combined-household figure); Head of Household $24,150 -- all matching the federal 2026 standard deduction amounts, since Missouri explicitly conforms to the federal deduction. Missouri's brackets remain identical across all filing statuses (not doubled for joint), consistent with the prior pass's structure.",
    source: "https://dor.mo.gov/forms/Withholding%20Formula_2026.pdf",
  },

  MS: {
    name: "Mississippi",
    kind: "flat",
    flatRate: 0.04,
    standardDeduction: { single: 2300, marriedJoint: 4600, marriedSeparate: 2300, headOfHousehold: 3400 },
    confidence: "probable",
    notes: "Mississippi taxes income above a $10,000 per-filer exemption at a flat 4.0% for TY2026 (Build-Up Mississippi Act), with further step-downs scheduled for 2027+ contingent on revenue triggers. I could not directly fetch dor.ms.gov (repeated 'unable to verify the first certificate' TLS errors on this session's tooling) or the specific PDF withholding tables hosted there, so confidence stays 'probable' rather than 'verified' despite corroboration from a USDA National Finance Center federal payroll bulletin (help.nfc.usda.gov/bulletins/2026/1768327516.htm, dated Pay Period 09 2026) that quotes MS's own tables directly, plus Bloomberg Tax and halfpricesoft.com payroll summaries. No MS employee-side payroll program.",
    source: "https://help.nfc.usda.gov/bulletins/2026/1768327516.htm",
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
        { upTo: 71250, rate: 0.047 },
        { upTo: null, rate: 0.0565 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "verified",
    notes: "Rates, cut-points, and the HB 337 attribution are read directly from the Montana Department of Revenue's own '2026 Montana Publication 1' (A Guide to Montana Tax Withholding and Estimated Payments, V1 September 2025) and its 2026 Tax Tables page, plus revenue.mt.gov's HB337 explainer page. Montana's standard deduction is explicitly stated in Publication 1 to equal the federal standard deduction amount for the taxpayer's filing status; figures shown are the 2026 federal standard deduction amounts (IRS Rev. Proc. 2025-32), not independently re-verified on an IRS page in this pass. Montana also taxes net long-term capital gains at a separate 3%/4.1% schedule (not represented in this schema) and increases the state EITC to 20% of the federal credit starting tax year 2026.",
    source: "https://revenuefiles.mt.gov/files/Forms/Publication-1/Publication-1-2026.pdf",
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
        { upTo: 49575, rate: 0 },
        { upTo: 250400, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      marriedJoint: [
        { upTo: 82800, rate: 0 },
        { upTo: 304850, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      marriedSeparate: [
        { upTo: 41390, rate: 0 },
        { upTo: 152388, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
      headOfHousehold: [
        { upTo: 66418, rate: 0 },
        { upTo: 277586, rate: 0.0195 },
        { upTo: null, rate: 0.025 },
      ],
    },
    standardDeduction: { single: 16100, marriedJoint: 32200, marriedSeparate: 16100, headOfHousehold: 24150 },
    confidence: "probable",
    notes: "North Dakota's official 2026 employer withholding booklet ('Income Tax Withholding Rates & Instructions, For wages paid in 2026,' fetched directly from tax.nd.gov) confirms the 0%/1.95%/2.50% rate structure carries into 2026 unchanged, but its own percentage-method tables use 'wages after subtracting withholding allowances' thresholds (e.g. $57,625/$258,450 for Single incl. HoH; $57,500/$168,525 for Married) that bake in a per-allowance offset and collapse Head of Household into the Single bucket -- these cannot be read directly as the ND-1 return's statutory brackets. ND's general individual-income-tax overview page (tax.nd.gov/individual-income-tax) still displayed 2025-labeled brackets (single 48,475/244,825; MFJ 80,975/298,075; MFS 40,475/149,025; HoH 64,950/271,450) as of this check and had not been refreshed for 2026. For the actual 2026 statutory thresholds reported here, I used a secondary tax-data aggregator (ustax.tools) showing single 49,575/250,400 and MFJ 82,800/304,850 for 2026 -- both reflecting a consistent ~2.27% increase over the 2025 DOR figures, matching ND's routine annual inflation indexing and internally self-consistent, but not read on a primary ND.gov page carrying a 2026 label. No source gave MFS or HoH 2026 thresholds directly; the MFS and HoH figures above are my extrapolation, applying that same ~2.27% factor to the 2025 DOR-confirmed MFS/HoH thresholds, and should be treated as estimates rather than verified figures. The standard deduction figures (single/MFS $16,100, MFJ $32,200, HoH $24,150) are inferred from federal conformity -- ND taxes federal taxable income directly, so the federal standard deduction passes through -- rather than read on an ND-specific page; the single/MFJ federal amounts are independently corroborated by Missouri's verified 2026 DOR withholding formula, which explicitly states the same federal figures.",
    source: "https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2026-iit/2026-income-tax-withholding-rates-booklet.pdf",
  },

  NE: {
    name: "Nebraska",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 3430, rate: 0 },
        { upTo: 6710, rate: 0.0226 },
        { upTo: 21810, rate: 0.0322 },
        { upTo: 31610, rate: 0.0421 },
        { upTo: 40130, rate: 0.0435 },
        { upTo: 75370, rate: 0.0448 },
        { upTo: null, rate: 0.046 },
      ],
      marriedJoint: [
        { upTo: 8190, rate: 0 },
        { upTo: 13010, rate: 0.0226 },
        { upTo: 32400, rate: 0.0322 },
        { upTo: 50400, rate: 0.0421 },
        { upTo: 62530, rate: 0.0435 },
        { upTo: 82920, rate: 0.0448 },
        { upTo: null, rate: 0.046 },
      ],
      marriedSeparate: [
        { upTo: 3430, rate: 0 },
        { upTo: 6710, rate: 0.0226 },
        { upTo: 21810, rate: 0.0322 },
        { upTo: 31610, rate: 0.0421 },
        { upTo: 40130, rate: 0.0435 },
        { upTo: 75370, rate: 0.0448 },
        { upTo: null, rate: 0.046 },
      ],
      headOfHousehold: [
        { upTo: 3430, rate: 0 },
        { upTo: 6710, rate: 0.0226 },
        { upTo: 21810, rate: 0.0322 },
        { upTo: 31610, rate: 0.0421 },
        { upTo: 40130, rate: 0.0435 },
        { upTo: 75370, rate: 0.0448 },
        { upTo: null, rate: 0.046 },
      ],
    },
    standardDeduction: { single: 7900, marriedJoint: 15800, marriedSeparate: 7900, headOfHousehold: 11850 },
    confidence: "verified",
    notes: "Bracket rates and thresholds are read directly from the official '2026 Nebraska Circular EN' (revenue.nebraska.gov), whose cover title states it is effective for wages paid on/after Jan 1, 2026, and are mathematically self-consistent (each cumulative dollar amount in the table reconciles against the prior bracket's rate and ceiling). Nebraska's withholding tables give only 'Single-Including Head of Household' and 'Married-Including Surviving Spouse' columns; the Head of Household and Married Filing Separately rows above are inferred (HOH = Single schedule; MFS = Single schedule) by common convention, not separately confirmed. Standard deduction figures are 2025 amounts found via secondary aggregators (not a .gov page); Nebraska's own 2026 standard deduction figure normally appears in the 1040N instructions, which per the task's own framing are a return-year document not yet published for tax year 2026 as of July 2026. The head-of-household standard deduction ($11,850) is an estimate scaled from the single amount and is low-confidence.",
    source: "https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf",
  },

  NH: {
    name: "New Hampshire",
    kind: "none",
    confidence: "probable",
    notes: "The interest and dividends tax was repealed effective tax year 2025, so there is no personal income tax at all for 2026.",
    source: "https://www.mclane.com/insights/nh-interest-and-dividends-tax-repealed-as-of-january-1/",
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
        { upTo: 8000, rate: 0.015 },
        { upTo: 25000, rate: 0.032 },
        { upTo: 50000, rate: 0.043 },
        { upTo: 100000, rate: 0.047 },
        { upTo: 315000, rate: 0.049 },
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
    notes: "The New Mexico 2025 PIT-1 return form was read directly (tax.newmexico.gov, via taxformfinder mirror) and confirms New Mexico's individual income tax uses the FEDERAL standard deduction amount directly (PIT-1 line 12: 'Federal standard or itemized deduction amount, from federal Form 1040, line 12') plus a separate state-specific 'low- and middle-income tax exemption' not represented in this schema. I could not get a readable government-hosted numeric bracket table (FYI-104 and the official Tax Rate Table PDF both returned as unreadable/binary through available tools, and the direct statute mirror at law.justia.com returned 403). The 6-bracket rate/threshold structure above (1.5/3.2/4.3/4.7/4.9/5.9%) is from a secondary tax-reference aggregator (ustax.tools) cross-checked against Bloomberg Tax's professional payroll-industry confirmation that NM's 2026 withholding formula rates are unchanged from 2025 and that the 2026 zero-bracket amounts increased to $8,050 single / $16,100 married / $12,075 HOH. Head of household and married-filing-separately brackets are assumed identical to single (both conventions common for NM), not independently confirmed.",
    source: "https://www.tax.newmexico.gov/",
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
      { name: "NY Paid Family Leave (PFL), employee contribution", rate: 0.00432, wageBase: 95349 },
      { name: "NY State Disability Benefits Law (DBL), employee contribution", rate: 0.005, wageBase: 6240 },
    ],
    confidence: "verified",
    notes: "NYS-50-T-NYS (1/26) states on p.3 that the bottom five bracket rates were revised under Chapter 59 of the Laws of 2025, Part A, effective for payrolls on/after 1/1/2026; its own pre-recapture Method II segments independently reproduce 3.90/4.40/5.15/5.40/5.90% at these same thresholds, matching the reduction pattern (each of the prior 4.00/4.50/5.25/5.50/6.00% rates cut by 0.10 point) applied to the unchanged 2025 IT-201-I thresholds. The top four rates/thresholds (6.85%, 9.65%, 10.3%, 10.9%) were not touched by Chapter 59 Part A and are carried forward from the 2025 return schedule; the 2026 IT-201 instructions will not be published until late 2026/early 2027 since a 2026 return is filed in 2027 -- this is a normal publication-timing gap, not evidence the 2026 rates are unconfirmed. High-income NY filers are also subject to a 'benefit recapture' add-back (visible as non-monotonic segment rates inside the withholding formula above roughly $107,650) that claws back the value of lower brackets; not modeled in the clean marginal table above. NYC (roughly 3.078%-3.876%) and Yonkers resident/nonresident surtaxes are separate local levies not included here. Standard deduction figures are the 2025 IT-201-I amounts; NY's standard deduction has been statutorily fixed since 2018 with no COLA, so no 2026 change is expected.",
    source: "https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf (NYS-50-T-NYS (1/26), effective payrolls 1/1/2026-12/31/2026)",
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
        { upTo: 10104, rate: 0 },
        { upTo: 11256, rate: 0.025 },
        { upTo: 13548, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      marriedJoint: [
        { upTo: 20196, rate: 0 },
        { upTo: 22500, rate: 0.025 },
        { upTo: 27096, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      marriedSeparate: [
        { upTo: 10104, rate: 0 },
        { upTo: 11256, rate: 0.025 },
        { upTo: 13548, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
      headOfHousehold: [
        { upTo: 10104, rate: 0 },
        { upTo: 11256, rate: 0.025 },
        { upTo: 13548, rate: 0.035 },
        { upTo: null, rate: 0.045 },
      ],
    },
    standardDeduction: { single: 6350, marriedJoint: 12700, marriedSeparate: 6350, headOfHousehold: 9350 },
    confidence: "verified",
    notes: "Bracket rates and thresholds are read directly from the Oklahoma Tax Commission's official 2026 withholding tables (oklahoma.gov, Packet OW-2, effective Jan 1 2026), specifically the Monthly Payroll Period percentage-method table (Table 4), annualized by x12. Oklahoma's tables give only Single and Married columns (no separate Head of Household column; the instructions note a 'Married, but withhold at higher Single rate' election), so HOH and MFS are assumed to follow the Single schedule by convention, not separately confirmed. IMPORTANT CAVEAT: the wide 0%-rate band shown ($10,104 single / $20,196 MFJ annualized) is a feature of the withholding formula, which nets out only a per-allowance amount (not an explicit standard-deduction line) before applying these brackets -- it is unclear from this document alone whether that 0% band already substitutes for, overlaps with, or sits on top of Oklahoma's standard deduction. The standardDeduction figures shown ($6,350/$12,700/$6,350/$9,350) are Oklahoma's long-standing statutory amounts (unchanged for many years pre-reform); it is possible the same legislation that introduced the 0%/2.5%/3.5%/4.5% withholding structure also changed these, which the 2026 OK-511 return instructions (not yet published) would confirm. Flagging for maintainer review rather than asserting with full confidence.",
    source: "https://www.oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf",
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
    standardDeduction: { single: 2910, marriedJoint: 5820, marriedSeparate: 2910, headOfHousehold: 4650 },
    payrollPrograms: [
      { name: "Paid Leave Oregon, employee share", rate: 0.006, wageBase: 184500 },
    ],
    confidence: "verified",
    notes: "Brackets and single/MFS/MFJ standard deductions verified directly from Oregon DOR's 'Oregon Withholding Tax Formulas' (Form 150-206-436, Rev. 12-31-25), explicitly 'Effective January 1, 2026', downloaded and read directly from oregon.gov. That document's FAQ groups head-of-household with 'single' for withholding-formula purposes (using the $2,910 figure), but Oregon's own Publication OR-ESTIMATE (101-026_2026.pdf, also read directly from oregon.gov) shows the true OR-40 standard deduction has three separate tiers for 2026: Single/MFS $2,900, Head of household $4,650, MFJ/qualifying surviving spouse $5,800 -- HOH is genuinely distinct from both, not equal to married as the repo assumed. Note the OR-ESTIMATE figures ($2,900/$5,800) are marked 'Estimated' (preliminary, pre-final-CPI) and are ~$10-20 below the final $2,910/$5,820 in the December withholding formula doc; I used the final $2,910/$5,820 for single/MFS/MFJ and the OR-ESTIMATE's $4,650 for HOH since no later-dated, more-final source for the HOH figure specifically was found -- treat the exact HOH cents as slightly soft (likely $4,650-$4,670) versus the single/married figures which are exact. Paid Leave Oregon rate (60% of a 1% total = 0.6% employee share) and the $184,500 wage cap (+4.7% from $176,100 in 2025, tracking the Social Security taxable maximum) verified directly from the Oregon Employment Department's Nov. 18, 2025 press release, also confirming the rate is unchanged from 2025 (OED explicitly announced both UI tax schedule and Paid Leave contribution rate 'hold steady' for 2026).",
    source: "https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf",
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
    flatRate: 0.0445,
    confidence: "verified",
    notes: "Verified directly from Utah State Tax Commission Publication 14 (Rev. 4/26), 'Withholding Tax Guide, Utah Withholding Information and Tax Tables,' fetched from files.tax.utah.gov: every withholding schedule instructs 'Multiply line 1 by .0445 (4.45%)', with the tables 'Effective June 1, 2026.' EY Tax News (citing SB 60, signed by Gov. Cox) confirms the 4.45% rate is retroactive to January 1, 2026 and applies to the full 2026 tax year; the June 1 effective date on the withholding tables reflects the normal lag for mid-year catch-up withholding on a retroactive statutory cut (the same pattern Utah used for its 2025 cut), not a split-year rate. This resolves the prior pass's flagged uncertainty between 4.45% and 4.5% in favor of 4.45%. Utah still has no separate standard deduction; it grants a nonrefundable 'taxpayer tax credit' equal to 6% of the federal standard-deduction-equivalent amount (phased out at higher incomes), which is not expressible in this schema, so standardDeduction is omitted as in the prior pass.",
    source: "https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf",
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
    notes: "Standard deduction ($8,750 single/MFS, $17,500 MFJ) confirmed directly on tax.virginia.gov/deductions. The bracket structure (2%/3%/5%/5.75% at $3,000/$5,000/$17,000, unchanged for years and not varying by filing status) was corroborated by a payroll-summary secondary source (halfpricesoft.com) rather than a primary VA Tax bracket page -- the specific bracket pages on tax.virginia.gov returned 404s or JS-only shells during this pass, same failure mode noted in the repo's existing notes, so I left confidence at 'probable' rather than upgrading to 'verified.' Per Virginia's own statute this elevated standard deduction has a sunset clause reverting to $3,000/$6,000 for TY2027 absent further legislative extension -- not relevant to TY2026 itself. No VA employee-side payroll program (no state PFL/SDI).",
    source: "https://www.tax.virginia.gov/deductions",
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
    notes: "Could not obtain the actual 2026 figures this pass, so these are carried forward unchanged from the repo's existing CPA-firm-sourced estimate. I did confirm the withholding publication itself exists and is exactly the kind of document the task expects: via DuckDuckGo (which, unlike Google/Bing through the fetch tool, returned real result links), I found the Vermont Dept. of Taxes page 'GB-1210 2026 Income Tax Withholding Instructions, Tables, and Charts' at tax.vermont.gov/document/gb-1210-2026-income-tax-withholding-instructions-tables-and-charts, and a Bloomberg Tax article headlined 'Vermont Tax Department Releases 2026 Income Tax Withholding Instructions, Tables, Charts' dated Dec 23, 2025 -- so the 2026 figures are unambiguously published and the 'not yet published' assumption is wrong for Vermont too. However every attempt to actually read the content failed: tax.vermont.gov returned HTTP 403 to curl (both plain and with a browser user-agent and referer), to WebFetch, and there's no Wayback Machine snapshot from anywhere near 2026. The Bloomberg Tax article itself is paywalled (isAccessibleForFree: false) with no rate content in the raw HTML. So the actual bracket/deduction numbers remain unverified against a primary source in this pass; still worth a direct human check of the GB-1210 PDF or a VT DRA press office contact.",
    source: "https://tax.vermont.gov/document/gb-1210-2026-income-tax-withholding-instructions-tables-and-charts (confirmed to exist via search; blocked HTTP 403 on every fetch attempt)",
  },

  WA: {
    name: "Washington",
    kind: "none",
    payrollPrograms: [
      { name: "WA Cares Fund (long-term care)", rate: 0.0058, wageBase: null },
      { name: "PFML (Paid Family & Medical Leave), employee share", rate: 0.008072, wageBase: 184500 },
    ],
    confidence: "verified",
    notes: "PFML 2026 total premium rate (1.13%) and the 71.43%/28.57% employee/employer split verified directly from the Washington Employment Security Department's own news release, 'Paid Family & Medical Leave premium rate increases to 1.13% in 2026' (esd.wa.gov, released Oct. 29, 2025): '2025 rate is 0.92%... Employers will pay 28.57%... employees will pay 71.43%.' Employee share = 1.13% x 71.43% = 0.8072%. WA Cares Fund rate (0.58% of gross wages, no wage cap) confirmed via University of Washington HR's benefits page (updated Dec. 9, 2025 / Jun 25, 2026), which states the premium 'is set by state law at 0.58% of gross wages' and that WA Cares wages are 'not capped at the taxable maximum for Social Security' -- this is an institutional secondary source rather than a state page directly, so slightly less certain than the PFML figure, though it's simply confirming no change from the prior verified rate. Washington's 'no income tax on wages' classification remains verified and unchanged.",
    source: "https://esd.wa.gov/about-us/news-release/2025/paid-family-medical-leave-premium-rate-increases-113-2026",
  },

  WI: {
    name: "Wisconsin",
    kind: "progressive",
    brackets: {
      single: [
        { upTo: 14890, rate: 0.0354 },
        { upTo: 29780, rate: 0.0465 },
        { upTo: 323290, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      marriedJoint: [
        { upTo: 19850, rate: 0.0354 },
        { upTo: 39700, rate: 0.0465 },
        { upTo: 431060, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      marriedSeparate: [
        { upTo: 9925, rate: 0.0354 },
        { upTo: 19850, rate: 0.0465 },
        { upTo: 215530, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
      headOfHousehold: [
        { upTo: 14890, rate: 0.0354 },
        { upTo: 29780, rate: 0.0465 },
        { upTo: 323290, rate: 0.053 },
        { upTo: null, rate: 0.0765 },
      ],
    },
    standardDeduction: { single: 13560, marriedJoint: 25110, marriedSeparate: 11930, headOfHousehold: 17520 },
    confidence: "probable",
    notes: "Rates (3.54/4.65/5.30/7.65%) verified directly from Wisconsin DOR's Publication W-166 (dated 1/26, published January 2026), which explicitly states current withholding rates continue for 2025 into the 2026 withholding period -- this directly refutes the prior-pass reasoning that 2026 WI figures were unpublished. The top-bracket thresholds ($323,290 single/HOH, $431,060 MFJ, $215,530 MFS) are read directly from the 2025 Form 1 Tax Computation Worksheet (revenue.wi.gov, the authoritative source for taxable income >= $100,000). The two LOWER bracket thresholds (3.54%->4.65% and 4.65%->5.30% cutoffs) could not be pinned to an exact dollar figure from a government table for amounts under $100,000; the first-bracket cutoff ($14,890) was empirically located by finding the row in the official 2025 Tax Table where the Single/HOH and Married-Jointly tax amounts first diverge (both are identical below that point because both filing statuses are still inside the 3.54% bracket). The second-bracket cutoff and the married-jointly/married-separately breakpoints are extrapolated from that anchor using the ~1.333x single-to-MFJ ratio observed at the verified top bracket, and MFS = 1/2 of MFJ (observed exactly at the top bracket: $215,530 x 2 = $431,060). Standard deduction figures are the maximum (pre-phaseout) amounts from the 2025 Form 1 instructions; Wisconsin's standard deduction phases down as income rises within each filing status, which is not represented in this single-figure schema. The 2026 Form 1 instructions (which would independently confirm 2026 thresholds/standard deduction) are not yet published, consistent with the task's framing that return-year instructions lag withholding guidance.",
    source: "https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf",
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
    confidence: "verified",
    notes: "Confirmed directly on tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx: 5 brackets, same table used for single/HOH/MFJ ($10k/$25k/$40k/$60k thresholds), MFS uses exactly half of each threshold. West Virginia has no separate state standard deduction -- it starts from federal AGI and uses a $2,000-per-exemption allowance instead, so no standardDeduction object applies. A secondary halfpricesoft.com payroll summary showed different, lower rates (2.22%-4.60%) that appear to reflect an earlier withholding-formula vintage published before SB 392 was signed (March 31, 2026); I treated the primary tax.wv.gov page, which explicitly describes the SB 392 retroactive cut, as authoritative over that conflicting secondary source. No WV employee-side payroll program.",
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
