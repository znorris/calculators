// City of Lodi Electric Utility (LEU) rate schedules, FY2026-27.
//
// LEU is a municipal utility, not a CPUC-regulated investor-owned utility, so
// there is no NEM tariff: exported energy is bought back at a fixed avoided-
// cost rate the city council resets every July 1, and PPAs are prohibited
// (LEU requires customer-owned or customer-financed generation). Figures
// below were read off the lodi.gov documents listed in `sources`; each rate
// carries the fiscal year it applies to.

export const LODI_STATE_ENERGY_TAX = {
  id: "state-energy-tax",
  label: "California state energy surcharge",
  mode: "fixed",
  valuePerKWh: 0.0003,
};

// ECA (Energy Cost Adjustment) actuals, FY2025-26, keyed by the fiscal-year
// month they billed in (LEU's fiscal year runs July-June).
export const LODI_ECA_HISTORY = {
  fy2025_26: {
    jul: 0.0331,
    aug: 0.0438,
    sep: 0.0211,
    oct: 0.0397,
    nov: 0.0623,
    dec: 0.0613,
    jan: 0.0474,
    feb: 0.0319,
    mar: 0.0452,
    apr: 0.0148,
    may: 0.0321,
    jun: 0.0325,
  },
  jul2026: 0.0496,
};

// LODI_ECA_MONTHLY keyed by calendar month 0 (Jan) - 11 (Dec), using the most
// recent value LEU has published for that calendar month: FY2025-26 actuals
// for every month except July, where the FY2026-27 figure (0.0496) supersedes
// the FY2025-26 figure (0.0331).
export const LODI_ECA_MONTHLY = [
  LODI_ECA_HISTORY.fy2025_26.jan, // 0 Jan
  LODI_ECA_HISTORY.fy2025_26.feb, // 1 Feb
  LODI_ECA_HISTORY.fy2025_26.mar, // 2 Mar
  LODI_ECA_HISTORY.fy2025_26.apr, // 3 Apr
  LODI_ECA_HISTORY.fy2025_26.may, // 4 May
  LODI_ECA_HISTORY.fy2025_26.jun, // 5 Jun
  LODI_ECA_HISTORY.jul2026, // 6 Jul - superseded by the FY2026-27 figure
  LODI_ECA_HISTORY.fy2025_26.aug, // 7 Aug
  LODI_ECA_HISTORY.fy2025_26.sep, // 8 Sep
  LODI_ECA_HISTORY.fy2025_26.oct, // 9 Oct
  LODI_ECA_HISTORY.fy2025_26.nov, // 10 Nov
  LODI_ECA_HISTORY.fy2025_26.dec, // 11 Dec
];

export const LODI_ECA = {
  id: "eca",
  label: "Energy Cost Adjustment",
  mode: "monthlyTable",
  monthlyValues: LODI_ECA_MONTHLY,
};

// Avoided-cost export credit, reset each July 1. FY2024-25 was never
// individually sourced from a lodi.gov document, so that entry carries
// forward the FY2023-24 figure rather than guessing a change; every other
// entry is a verified reset value.
export const LODI_EP_HISTORY = [
  { fiscalYear: "FY2023-24", ratePerKWh: 0.1352 },
  {
    fiscalYear: "FY2024-25",
    ratePerKWh: 0.1352,
    note: "No FY2024-25 reset figure was sourced; carried forward from FY2023-24.",
  },
  { fiscalYear: "FY2025-26", ratePerKWh: 0.0831 },
  { fiscalYear: "FY2026-27", ratePerKWh: 0.0843 },
];

export const LODI_EP_RATE = 0.0843; // FY2026-27, effective 2026-07-01

// Schedule EA: residential tiered.
export const LODI_EA = {
  id: "EA",
  label: "Schedule EA (Residential)",
  fixedChargePerMonth: 19.5,
  pricing: {
    type: "tiered",
    rates: [0.1428, 0.1581, 0.3366],
    breakpoints: {
      // Cumulative monthly kWh at which tier 2 and tier 3 begin.
      winter: [391, 782],
      summer: [481, 962],
    },
  },
};

// Schedule EV: separately metered EV circuit rider. Off-peak covers 8pm-6am
// Mon-Fri plus all day Saturday, Sunday, and LEU holidays; on-peak is
// everything else. LEU publishes one rate per period with no summer/winter
// split, so both seasons carry the same value.
function evOffPeakApplies(ctx) {
  if (ctx.isWeekend || ctx.isHoliday) return true;
  return ctx.hourOfDay >= 20 || ctx.hourOfDay < 6;
}

export const LODI_EV = {
  id: "EV",
  label: "Schedule EV (EV Circuit Rider)",
  fixedChargePerMonth: 6.0,
  pricing: {
    type: "tou",
    periods: [
      {
        id: "off-peak",
        rate: { summer: 0.1428, winter: 0.1428 },
        applies: evOffPeakApplies,
      },
      {
        id: "on-peak",
        rate: { summer: 0.3366, winter: 0.3366 },
        applies: (ctx) => !evOffPeakApplies(ctx),
      },
    ],
  },
};

// Schedule G1: small commercial, <8,000 kWh/mo. LEU meters most G1 accounts
// single-phase; three-phase service carries a higher fixed charge for the
// larger service equipment. Both are exposed so a caller can model either;
// the profile's schedules array carries single-phase as the default "G1".
const G1_PRICING = {
  type: "flat-seasonal",
  summerRate: 0.19261,
  winterRate: 0.14244,
};

export const LODI_G1 = {
  singlePhase: {
    id: "G1",
    label: "Schedule G1 (Small Commercial, Single-Phase)",
    fixedChargePerMonth: 20.5,
    pricing: G1_PRICING,
  },
  threePhase: {
    id: "G1-3P",
    label: "Schedule G1 (Small Commercial, Three-Phase)",
    fixedChargePerMonth: 31.5,
    pricing: G1_PRICING,
  },
};

// Schedule G2: medium commercial. Flat energy rate plus a single demand
// charge on the monthly peak import kW; LEU does not carry a separate
// peak-period demand rate on this schedule, so schedule.demand has no
// peakRatePerKW/peakApplies and every hour's import counts toward the same
// monthly peak.
export const LODI_G2 = {
  id: "G2",
  label: "Schedule G2 (Medium Commercial)",
  fixedChargePerMonth: 103.5,
  pricing: {
    type: "flat-seasonal",
    summerRate: 0.15829,
    winterRate: 0.12671,
  },
  demand: {
    ratePerKW: { summer: 4.18, winter: 4.18 },
  },
};

// SHARE, medical, and senior fixed-income riders are mutually exclusive: LEU
// allows at most one bill discount per household. They share an
// exclusiveGroup so profile.js's ridersTotalPercentOff() enforces that.
export const LODI_RIDERS = [
  { id: "share", label: "SHARE discount", percentOff: 0.3, exclusiveGroup: "household" },
  { id: "medical", label: "Medical baseline discount", percentOff: 0.25, exclusiveGroup: "household" },
  { id: "senior", label: "Senior fixed-income discount", percentOff: 0.05, exclusiveGroup: "household" },
];

// Interconnection fees are FY2025-26 figures; LEU had not published FY2026-27
// interconnection fees as of the sources below.
export const LODI_FEES = {
  interconnection: {
    singlePhase: 843,
    threePhase: 1472,
    fiscalYear: "FY2025-26",
  },
};

export const sources = [
  "https://www.lodi.gov/259/Electric-Utility",
  "https://www.lodi.gov/DocumentCenter/View/Electric-Rate-Schedules", // Schedules EA, EV, G1, G2 fixed/energy/demand rates
  "https://www.lodi.gov/DocumentCenter/View/Energy-Cost-Adjustment", // Monthly ECA factors
  "https://www.lodi.gov/DocumentCenter/View/Net-Energy-Metering-and-Interconnection", // Avoided-cost export credit, interconnection fees, financing restrictions
];

export const LODI = {
  id: "lodi",
  label: "City of Lodi Electric Utility (LEU)",
  schedules: [LODI_EA, LODI_EV, LODI_G1.singlePhase, LODI_G1.threePhase, LODI_G2],
  adders: [LODI_STATE_ENERGY_TAX, LODI_ECA],
  riders: LODI_RIDERS,
  exportPolicy: {
    type: "avoidedCostCredit",
    ratePerKWh: LODI_EP_RATE,
    addersApply: false,
    carryForward: true,
    cashOut: false,
  },
  constraints: {
    sizeCapMode: "trailing12moUsage",
    allowedFinancing: ["cash", "loan"], // PPAs prohibited by LEU
    interconnectionFees: LODI_FEES.interconnection,
  },
};
