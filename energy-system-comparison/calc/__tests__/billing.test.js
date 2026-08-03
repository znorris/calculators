import { describe, it, expect } from "vitest";
import { priceYear } from "../billing.js";
import { LODI, LODI_EA, LODI_G2 } from "../tariffs/lodi.js";

const HOURS_PER_YEAR = 8760;

// Hour index each calendar month starts at (dayOfYear-start * 24), and each
// month's length in hours, both derived from the reference year's month
// lengths [31,28,31,30,31,30,31,31,30,31,30,31].
const MONTH_START_HOUR = [0, 744, 1416, 2160, 2880, 3624, 4344, 5088, 5832, 6552, 7296, 8016];

function zeros() {
  return new Array(HOURS_PER_YEAR).fill(0);
}

/** Puts the entire month's import/export total into that month's first hour. Tiered/flat/demand-by-peak math only depends on the monthly total (or, for demand, the single largest hourly value), so concentrating it in one hour keeps the arithmetic exact instead of accumulating float error across hundreds of additions. */
function setMonthTotal(series, monthIdx, kWh) {
  series[MONTH_START_HOUR[monthIdx]] = kWh;
}

describe("priceYear: EA winter month exactly at tier boundaries", () => {
  // January (winter), 782 kWh = exactly the tier-2/tier-3 breakpoint.
  // By hand: tier1 391 kWh @ 0.1428 = 55.8348; tier2 391 kWh @ 0.1581 = 61.8171
  //   -> energy = 117.6519
  // adders: state tax 0.0003*782 = 0.2346; ECA Jan (0.0474)*782 = 37.0668
  //   -> adders = 37.3014
  // total = fixed 19.50 + energy 117.6519 + adders 37.3014 = 174.4533
  it("bills tier 1 and tier 2 in full and nothing in tier 3", () => {
    const gridImport = zeros();
    setMonthTotal(gridImport, 0, 782);
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { riderIds: [] },
    });

    expect(monthly[0].energy).toBeCloseTo(117.6519, 4);
    expect(monthly[0].adders).toBeCloseTo(37.3014, 4);
    expect(monthly[0].demand).toBe(0);
    expect(monthly[0].riderDiscount).toBe(0);
    expect(monthly[0].exportCredit).toBe(0);
    expect(monthly[0].total).toBeCloseTo(174.4533, 4);
  });
});

describe("priceYear: EA summer month deep into tier 3, ECA fixed override", () => {
  // July (summer), 1200 kWh, deep past the 962 kWh tier-3 breakpoint.
  // By hand: tier1 481 kWh @ 0.1428 = 68.6868; tier2 481 kWh @ 0.15810 = 76.0461;
  //   tier3 238 kWh @ 0.33660 = 80.1108 -> energy = 224.8437
  // adders with ecaMode 'fixed', ecaFixedValue 0.05 (overrides the eca table):
  //   state tax 0.0003*1200 = 0.36; eca 0.05*1200 = 60 -> adders = 60.36
  // total = fixed 19.50 + energy 224.8437 + adders 60.36 = 304.7037
  it("charges tier 3 on the usage past the second breakpoint and honors the ECA override", () => {
    const gridImport = zeros();
    setMonthTotal(gridImport, 6, 1200);
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { ecaMode: "fixed", ecaFixedValue: 0.05, riderIds: [] },
    });

    expect(monthly[6].energy).toBeCloseTo(224.8437, 4);
    expect(monthly[6].adders).toBeCloseTo(60.36, 4);
    expect(monthly[6].total).toBeCloseTo(304.7037, 4);
  });
});

describe("priceYear: EA with the SHARE rider", () => {
  // February (winter), 391 kWh = exactly tier 1.
  // By hand: energy = 391 * 0.1428 = 55.8348
  // adders: state tax 0.0003*391 = 0.1173; ECA Feb (0.0319)*391 = 12.4729
  //   -> adders = 12.5902
  // pre-rider subtotal = 19.50 + 55.8348 + 12.5902 = 87.925
  // SHARE is 30% off the bill: riderDiscount = 87.925 * 0.30 = 26.3775
  // total = 87.925 - 26.3775 = 61.5475
  it("applies 30% off the full pre-export-credit subtotal, not just energy", () => {
    const gridImport = zeros();
    setMonthTotal(gridImport, 1, 391);
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { riderIds: ["share"] },
    });

    expect(monthly[1].riderDiscount).toBeCloseTo(26.3775, 4);
    expect(monthly[1].total).toBeCloseTo(61.5475, 4);
  });

  it("throws if SHARE and medical are both selected, since only one rider applies per household", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    expect(() =>
      priceYear({
        gridImport,
        gridExport,
        schedule: LODI_EA,
        profile: LODI,
        options: { riderIds: ["share", "medical"] },
      }),
    ).toThrow(/exclusive group/);
  });
});

describe("priceYear: G2 month with a known peak kW", () => {
  // March (winter), 3740 kWh total with one hour spiking to 25 kW (the
  // month's peak import).
  // By hand: energy = 3740 * 0.12671 = 473.8954
  // adders: state tax 0.0003*3740 = 1.122; ECA Mar (0.0452)*3740 = 169.048
  //   -> adders = 170.17
  // demand = 25 kW * 4.18 = 104.50 (G2 has one demand rate, no peak-period split)
  // total = fixed 103.50 + energy 473.8954 + adders 170.17 + demand 104.50 = 852.0654
  it("bills the monthly peak import kW at the single demand rate", () => {
    const gridImport = zeros();
    const marchStart = MONTH_START_HOUR[2];
    for (let h = marchStart; h < marchStart + 743; h++) gridImport[h] = 5;
    gridImport[marchStart + 743] = 25; // last hour of March is the peak
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_G2,
      profile: LODI,
      options: { riderIds: [] },
    });

    expect(monthly[2].demand).toBeCloseTo(104.5, 6);
    expect(monthly[2].energy).toBeCloseTo(473.8954, 4);
    expect(monthly[2].adders).toBeCloseTo(170.17, 4);
    expect(monthly[2].total).toBeCloseTo(852.0654, 4);
  });
});

describe("priceYear: export ledger carry-forward across months, addersOnExports both ways", () => {
  // Jan: export 1000 kWh, import 0. Every other month: no import, no export,
  // so every month's subtotal is just the $19.50 fixed charge, and the bank
  // built up in January keeps paying that $19.50 down until it runs out.
  //
  // addersOnExports: false
  //   Jan creditEarned = 0.0843*1000 = 84.30; applied 19.50; ledger -> 64.80
  //   Feb..Apr: no new credit; applied 19.50 each month; ledger -> 45.30, 25.80, 6.30
  //   May: applied min(6.30,19.50) = 6.30 (the bank runs out mid-month); ledger -> 0;
  //     May total = 19.50 - 6.30 = 13.20
  //   Jun..Dec: ledger stays 0, nothing left to apply; total = 19.50 each month.
  it("banks January's export credit and draws it down over the following months until it runs out", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 1000);

    const { monthly, exportLedgerEndBalance } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { addersOnExports: false, riderIds: [] },
    });

    expect(monthly[0].exportCredit).toBeCloseTo(19.5, 6);
    expect(monthly[0].total).toBeCloseTo(0, 6);
    expect(monthly[1].exportCredit).toBeCloseTo(19.5, 6);
    expect(monthly[1].total).toBeCloseTo(0, 6);
    expect(monthly[3].exportCredit).toBeCloseTo(19.5, 6); // April: still drawing down the bank
    expect(monthly[4].exportCredit).toBeCloseTo(6.3, 4); // May: bank runs out mid-month
    expect(monthly[4].total).toBeCloseTo(13.2, 4);
    expect(monthly[5].exportCredit).toBe(0); // June onward: nothing left to apply
    expect(monthly[5].total).toBeCloseTo(19.5, 6);
    expect(exportLedgerEndBalance).toBeCloseTo(0, 6);
  });

  // addersOnExports: true
  //   Jan exportAdders = 0.0003*1000 + 0.0474*1000 = 47.70
  //     creditEarned = 84.30 - 47.70 = 36.60; applied = min(36.60,19.50) = 19.50; ledger -> 17.10
  //   Feb exportAdders = 0 (no export); creditEarned = 0
  //     applied = min(17.10,19.50) = 17.10; ledger -> 0; Feb total = 19.50 - 17.10 = 2.40
  //   The bank runs out partway through February, so February owes $2.40.
  it("shrinks the banked credit by the exported kWh's adders, running the bank out in February", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 1000);

    const { monthly, exportLedgerEndBalance } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { addersOnExports: true, riderIds: [] },
    });

    expect(monthly[0].exportCredit).toBeCloseTo(19.5, 6);
    expect(monthly[0].total).toBeCloseTo(0, 6);
    expect(monthly[1].exportCredit).toBeCloseTo(17.1, 4);
    expect(monthly[1].total).toBeCloseTo(2.4, 4);
    expect(exportLedgerEndBalance).toBeCloseTo(0, 6);
  });

  it("never lets a month's total go negative even when the ledger is far larger than the bill", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 100000);

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { riderIds: [] },
    });

    expect(monthly[0].total).toBe(0);
    expect(monthly[0].exportCredit).toBeCloseTo(19.5, 6);
  });
});

describe("priceYear: opening ledger balance carries in from a prior year", () => {
  // A $200 opening balance with zero import/export all year should draw down
  // the $19.50/mo fixed charge every month until it runs out, then bill the
  // fixed charge in full: 200 / 19.50 = 10.26 months of coverage, so the
  // ledger is exhausted partway through November (month index 10).
  it("applies options.openingLedger to January before any of the year's own export credit is earned", () => {
    const gridImport = zeros();
    const gridExport = zeros();

    const { monthly, exportLedgerEndBalance } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { riderIds: [], openingLedger: 200 },
    });

    expect(monthly[0].exportCredit).toBeCloseTo(19.5, 6);
    expect(monthly[0].total).toBeCloseTo(0, 6);
    // 10 months of $19.50 = $195, leaving $5 for November; December owes the
    // full $19.50 with nothing left in the bank.
    expect(monthly[10].exportCredit).toBeCloseTo(5, 4);
    expect(monthly[10].total).toBeCloseTo(14.5, 4);
    expect(monthly[11].exportCredit).toBe(0);
    expect(monthly[11].total).toBeCloseTo(19.5, 6);
    expect(exportLedgerEndBalance).toBeCloseTo(0, 6);
  });

  it("defaults openingLedger to 0 when omitted, matching pre-existing behavior", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridImport, 0, 391);

    const withDefault = priceYear({ gridImport, gridExport, schedule: LODI_EA, profile: LODI, options: { riderIds: [] } });
    const withExplicitZero = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: LODI,
      options: { riderIds: [], openingLedger: 0 },
    });

    expect(withDefault.annualTotal).toBeCloseTo(withExplicitZero.annualTotal, 9);
  });
});

describe("priceYear: riders summing past 100% never drive the subtotal negative", () => {
  it("clamps the combined discount so total floors at 0 even with two 60% riders sharing no exclusiveGroup", () => {
    const schedule = {
      id: "flat",
      label: "Flat",
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 },
    };
    const profile = {
      id: "custom",
      label: "Custom",
      schedules: [schedule],
      adders: [],
      riders: [
        { id: "a", label: "A", percentOff: 0.6 },
        { id: "b", label: "B", percentOff: 0.6 },
      ],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.08, addersApply: false, carryForward: true, cashOut: false },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    };

    const gridImport = zeros();
    setMonthTotal(gridImport, 0, 100); // January: 100 kWh imported, no export
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile,
      options: { riderIds: ["a", "b"] },
    });

    // preRiderSubtotal = fixed 10 + energy 20 = 30; combined percentOff caps
    // at 1 (100%), so riderDiscount is 30 and total floors at 0 rather than
    // going negative.
    expect(monthly[0].riderDiscount).toBeCloseTo(30, 6);
    expect(monthly[0].total).toBe(0);
  });
});

describe("priceYear: input validation", () => {
  it("throws if the hourly arrays are not length 8760", () => {
    expect(() =>
      priceYear({
        gridImport: [0],
        gridExport: zeros(),
        schedule: LODI_EA,
        profile: LODI,
        options: {},
      }),
    ).toThrow(/8760/);
  });

  it("throws for an export policy that is neither avoidedCostCredit nor netMetering, quoting the permitted types", () => {
    const bogusProfile = { ...LODI, exportPolicy: { type: "bogus" } };
    expect(() =>
      priceYear({
        gridImport: zeros(),
        gridExport: zeros(),
        schedule: LODI_EA,
        profile: bogusProfile,
        options: {},
      }),
    ).toThrow(/avoidedCostCredit and netMetering/);
  });

  it("throws for a netMetering policy with an unrecognized netting value", () => {
    const badNetting = { ...LODI, exportPolicy: { type: "netMetering", netting: "monthly", exportRate: "retail" } };
    expect(() =>
      priceYear({
        gridImport: zeros(),
        gridExport: zeros(),
        schedule: LODI_EA,
        profile: badNetting,
        options: {},
      }),
    ).toThrow(/"hourly" or "annual"/);
  });

  it("does not throw for a netMetering policy, now that it is implemented", () => {
    const netMeteredProfile = { ...LODI, exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" } };
    expect(() =>
      priceYear({
        gridImport: zeros(),
        gridExport: zeros(),
        schedule: LODI_EA,
        profile: netMeteredProfile,
        options: {},
      }),
    ).not.toThrow();
  });
});

describe("priceYear: netMetering annual netting crosses a tier boundary", () => {
  // January (winter, breakpoints [391, 782]), 1000 kWh gross import would
  // spill 238 kWh into tier 3 (0.3366). Netting 300 kWh of export first:
  // net = 1000 - 300 = 700 kWh, which lands inside tier 2 -- tier 3 is never
  // reached at all.
  // By hand: tier1 391 kWh @ 0.1428 = 55.8348; tier2 309 kWh @ 0.1581 = 48.8529
  //   -> energy = 104.6877
  // adders (on the NET 700 kWh, not the gross 1000): state tax 0.0003*700 = 0.21;
  //   ECA Jan (0.0474)*700 = 33.18 -> adders = 33.39
  // total = fixed 19.50 + energy 104.6877 + adders 33.39 = 157.5777
  it("prices tier position from net kWh, landing one tier lower than gross imports alone would", () => {
    const netMeteredLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" } };
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridImport, 0, 1000);
    setMonthTotal(gridExport, 0, 300);

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: LODI_EA,
      profile: netMeteredLodi,
      options: { riderIds: [] },
    });

    expect(monthly[0].energy).toBeCloseTo(104.6877, 4);
    expect(monthly[0].adders).toBeCloseTo(33.39, 4);
    expect(monthly[0].total).toBeCloseTo(157.5777, 4);
    expect(monthly[0].exportCredit).toBe(0); // annual netting has no monthly $ credit line, only the Dec true-up
  });
});

describe("priceYear: netMetering annual netting -- kWh credit carry-forward and the year-end true-up, both ways", () => {
  function flatNetMeteringProfile(exportRate) {
    return {
      id: "custom",
      label: "Custom",
      schedules: [
        { id: "flat", label: "Flat", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 } },
      ],
      adders: [],
      riders: [],
      exportPolicy: { type: "netMetering", netting: "annual", exportRate },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    };
  }
  const schedule = { id: "flat", label: "Flat", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 } };

  // Sep (idx 8): export 1000, import 0 -> carryOut 1000 (nothing consumed).
  // Oct (idx 9): import 300, carriedIn 1000 -> net = 300-1000 = -700, billed
  //   0 kWh, carryOut 700 (300 of the bank consumed).
  // Nov (idx 10): no activity, carriedIn 700 passes through unchanged.
  // Dec (idx 11): import 200, carriedIn 700 -> net = 200-700 = -500, billed
  //   0 kWh, pre-true-up carryOut 500 kWh left in the bank at year end.
  // Every month bills only the $10 fixed charge (billed kWh is 0 throughout),
  // so the interesting numbers are the Dec true-up and the ledgers after it.
  function buildSeries() {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 8, 1000);
    setMonthTotal(gridImport, 9, 300);
    setMonthTotal(gridImport, 11, 200);
    return { gridImport, gridExport };
  }

  it("cashes the leftover kWh into the $ ledger at a numeric exportRate, which then carries forward like the EP ledger", () => {
    const { gridImport, gridExport } = buildSeries();
    const profile = flatNetMeteringProfile(0.05);

    const { monthly, exportLedgerEndBalance, kwhLedgerEndBalance } = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile,
      options: { riderIds: [] },
    });

    expect(monthly[9].total).toBeCloseTo(10, 6); // carried credit only ever offsets kWh, never $, during the year
    expect(monthly[10].total).toBeCloseTo(10, 6);
    // True-up: 500 kWh * $0.05 = $25 credit, applied against Dec's $10
    // subtotal, leaving $15 banked for next year.
    expect(monthly[11].exportCredit).toBeCloseTo(10, 6);
    expect(monthly[11].total).toBeCloseTo(0, 6);
    expect(exportLedgerEndBalance).toBeCloseTo(15, 6);
    expect(kwhLedgerEndBalance).toBe(0); // the kWh ledger never survives past December
  });

  it("forfeits the leftover kWh at year end when exportRate is 'retail', banking nothing", () => {
    const { gridImport, gridExport } = buildSeries();
    const profile = flatNetMeteringProfile("retail");

    const { monthly, exportLedgerEndBalance, kwhLedgerEndBalance } = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile,
      options: { riderIds: [] },
    });

    expect(monthly[11].exportCredit).toBe(0);
    expect(monthly[11].total).toBeCloseTo(10, 6);
    expect(exportLedgerEndBalance).toBe(0);
    expect(kwhLedgerEndBalance).toBe(0);
  });

  it("forfeits the leftover kWh the same way when exportRate is entirely absent", () => {
    const { gridImport, gridExport } = buildSeries();
    const profile = flatNetMeteringProfile(undefined);

    const { exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule, profile, options: { riderIds: [] } });

    expect(exportLedgerEndBalance).toBe(0);
  });
});

describe("priceYear: netMetering annual netting on a TOU schedule nets within each period, not across the whole month", () => {
  const touSchedule = {
    id: "tou",
    label: "TOU",
    fixedChargePerMonth: 0,
    pricing: {
      type: "tou",
      periods: [
        { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 },
        { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 20) },
      ],
    },
  };
  const profile = {
    id: "custom",
    label: "Custom",
    schedules: [touSchedule],
    adders: [],
    riders: [],
    exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" },
    constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
  };

  // January (winter). Off-peak: 800 kWh import, 300 kWh export at two
  // off-peak hours -> period net = 500 kWh billed @ 0.12 = 60.
  // On-peak: 100 kWh import, 400 kWh export at two on-peak hours -> period
  // net = 100-400 = -300, billed 0 kWh; the 300 kWh excess export does NOT
  // offset off-peak's import (no cross-period netting) -- it becomes 300 kWh
  // of carryOut instead.
  // Jan energy = 0*0.30 (on-peak) + 500*0.12 (off-peak) = 60.
  it("does not let one period's excess export reduce another period's billed kWh in the same month", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    const jan = MONTH_START_HOUR[0];
    gridImport[jan + 1] = 800; // off-peak hour (hourOfDay 1)
    gridExport[jan + 2] = 300; // off-peak hour (hourOfDay 2)
    gridImport[jan + 16] = 100; // on-peak hour (hourOfDay 16)
    gridExport[jan + 17] = 400; // on-peak hour (hourOfDay 17)

    const { monthly } = priceYear({ gridImport, gridExport, schedule: touSchedule, profile, options: { riderIds: [] } });

    expect(monthly[0].energy).toBeCloseTo(60, 6);
  });

  // February: the 300 kWh carried out of January is drawn down against
  // Feb's own off-peak import of 300 kWh, fully covering it (billed 0 kWh,
  // energy 0) -- proving the leftover from one period really does carry
  // forward into a later month rather than evaporating.
  it("carries a period's own leftover export into the next month's netting", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    const jan = MONTH_START_HOUR[0];
    gridImport[jan + 16] = 100;
    gridExport[jan + 17] = 400; // Jan on-peak leftover export: 300 kWh carries out
    const feb = MONTH_START_HOUR[1];
    gridImport[feb + 1] = 300; // Feb off-peak import, fully covered by the carried credit

    const { monthly } = priceYear({ gridImport, gridExport, schedule: touSchedule, profile, options: { riderIds: [] } });

    expect(monthly[1].energy).toBeCloseTo(0, 6);
  });
});

describe("priceYear: carried kWh credit drawdown ignores period declaration order (most expensive first)", () => {
  // January banks 300 kWh of on-peak leftover export. February imports
  // 200 kWh in EACH period. Most-expensive-first drawdown: the credit covers
  // on-peak's 200 (winter 0.30) then 100 of off-peak's 200, leaving
  // 100 kWh billed at 0.12 = $12.00 -- regardless of the order the tariff
  // happens to declare its periods. Before this rule, [off, peak] order
  // billed $60.00 for the identical tariff and meter data (a 5x swing from
  // array order alone).
  const onPeak = { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 };
  const offPeak = { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 20) };

  function febEnergyWithPeriodOrder(periods) {
    const schedule = { id: "tou", label: "TOU", fixedChargePerMonth: 0, pricing: { type: "tou", periods } };
    const profile = {
      id: "custom",
      label: "Custom",
      schedules: [schedule],
      adders: [],
      riders: [],
      exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    };
    const gridImport = zeros();
    const gridExport = zeros();
    const jan = MONTH_START_HOUR[0];
    gridExport[jan + 17] = 300; // on-peak leftover export banks 300 kWh
    const feb = MONTH_START_HOUR[1];
    gridImport[feb + 1] = 200; // off-peak import
    gridImport[feb + 16] = 200; // on-peak import
    const { monthly } = priceYear({ gridImport, gridExport, schedule, profile, options: { riderIds: [] } });
    return monthly[1].energy;
  }

  it("bills identically for [on-peak, off-peak] and [off-peak, on-peak] declaration orders", () => {
    const a = febEnergyWithPeriodOrder([onPeak, offPeak]);
    const b = febEnergyWithPeriodOrder([offPeak, onPeak]);
    expect(a).toBeCloseTo(12, 6);
    expect(b).toBeCloseTo(12, 6);
  });
});

describe("priceYear: netMetering hourly netting credits exports at the hour's own applicable retail rate", () => {
  it("credits an export hour at the current tier's marginal rate on a tiered schedule", () => {
    // January (winter, breakpoints [391, 782], rates [0.1428, 0.1581, 0.3366]).
    // Hour 0: 500 kWh import -> cumulative import is 500, inside tier 2
    //   (391 < 500 <= 782), so tier 2's rate (0.1581) is the marginal rate.
    // Hour 1: 100 kWh export, credited at that same marginal rate:
    //   100 * 0.1581 = 15.81. Nothing else exports this month, so the
    //   ledger's entire January inflow is this $15.81, none of it drawn down
    //   yet at the point this is checked (the subtotal is far larger).
    const hourlyLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" } };
    const gridImport = zeros();
    const gridExport = zeros();
    const jan = MONTH_START_HOUR[0];
    gridImport[jan] = 500;
    gridExport[jan + 1] = 100;

    const { monthly } = priceYear({ gridImport, gridExport, schedule: LODI_EA, profile: hourlyLodi, options: { riderIds: [] } });

    expect(monthly[0].exportCredit).toBeCloseTo(15.81, 4);
  });

  it("credits an export hour at that hour's own TOU period rate", () => {
    const touSchedule = {
      id: "tou",
      label: "TOU",
      fixedChargePerMonth: 10,
      pricing: {
        type: "tou",
        periods: [
          { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 },
          { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 20) },
        ],
      },
    };
    const profile = {
      id: "custom",
      label: "Custom",
      schedules: [touSchedule],
      adders: [],
      riders: [],
      exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    };

    // December (winter): 50 kWh exported on-peak (@0.30) + 80 kWh exported
    // off-peak (@0.12) = 15 + 9.6 = $24.60 earned. No import all year, so
    // every month's subtotal is just the $10 fixed charge; December is the
    // last month processed, so its own $10 draw-down leaves the remainder
    // ($14.60) as the final ledger balance with nothing left to consume it.
    const gridImport = zeros();
    const gridExport = zeros();
    const dec = MONTH_START_HOUR[11];
    gridExport[dec + 17] = 50; // on-peak hour
    gridExport[dec + 1] = 80; // off-peak hour

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule: touSchedule, profile, options: { riderIds: [] } });

    expect(monthly[11].exportCredit).toBeCloseTo(10, 6);
    expect(exportLedgerEndBalance).toBeCloseTo(14.6, 6);
  });
});

describe("priceYear: netMetering hourly netting, addersOnExports both ways", () => {
  function profileWithAdder(exportRate) {
    return {
      id: "custom",
      label: "Custom",
      schedules: [
        { id: "flat", label: "Flat", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 } },
      ],
      adders: [{ id: "surcharge", label: "Surcharge", mode: "fixed", valuePerKWh: 0.001 }],
      riders: [],
      exportPolicy: { type: "netMetering", netting: "hourly", exportRate },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    };
  }
  const schedule = { id: "flat", label: "Flat", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 } };

  // December, 1000 kWh exported, no import, flat exportRate $0.10/kWh.
  // creditEarned without adders: 1000*0.10 = 100.
  // creditEarned with addersOnExports: 100 - (0.001*1000) = 100 - 1 = 99.
  // Both draw down the $10 fixed-charge subtotal, leaving 90 vs 89 banked.
  it("subtracts the exported kWh's adders from the credit earned when addersOnExports is true", () => {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 11, 1000);

    const withoutAdders = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile: profileWithAdder(0.1),
      options: { riderIds: [], addersOnExports: false },
    });
    const withAdders = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile: profileWithAdder(0.1),
      options: { riderIds: [], addersOnExports: true },
    });

    expect(withoutAdders.exportLedgerEndBalance).toBeCloseTo(90, 6);
    expect(withAdders.exportLedgerEndBalance).toBeCloseTo(89, 6);
  });
});

function flatSchedule(overrides = {}) {
  return { id: "flat", label: "Flat", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.2 }, ...overrides };
}

function flatProfile(exportPolicy, overrides = {}) {
  return {
    id: "custom",
    label: "Custom",
    schedules: [flatSchedule()],
    adders: [],
    riders: [],
    exportPolicy,
    constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
    ...overrides,
  };
}

describe("priceYear: avoidedCostCredit with a generalized ExportRate", () => {
  // January, export 1000 kWh, no import. monthlyValues[0] = 0.05, so
  // creditEarned = 1000 * 0.05 = 50; applied against the $10 fixed-charge
  // subtotal leaves 40 banked after January, then every subsequent month's
  // own $10 fixed-charge subtotal draws the bank down by another $10 (Feb
  // 30, Mar 20, Apr 10, May 0) -- the bank runs out exactly at the end of
  // May, leaving nothing for June through December.
  it("credits exports using a monthlyTable ExportRate", () => {
    const monthlyTable = { kind: "monthlyTable", monthlyValues: [0.05, ...Array(11).fill(0.01)] };
    const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: monthlyTable, addersApply: false, carryForward: true, cashOut: false });
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 1000);

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule: flatSchedule(), profile, options: { riderIds: [] } });

    expect(monthly[0].exportCredit).toBeCloseTo(10, 6);
    expect(monthly[0].total).toBeCloseTo(0, 6);
    expect(monthly[4].exportCredit).toBeCloseTo(10, 6); // May: the bank's last $10
    expect(monthly[5].exportCredit).toBe(0); // June onward: nothing left
    expect(exportLedgerEndBalance).toBeCloseTo(0, 6);
  });

  // December: 50 kWh exported on-peak (winter rate 0.30) + 80 kWh exported
  // off-peak (winter rate 0.12) = 15 + 9.6 = $24.60 earned, the same
  // per-hour math CONTRACTS.md's hourly-netMetering timeTable example uses,
  // now for avoidedCostCredit's own ratePerKWh. A single month-level rate
  // could not produce this figure at all, since the two hours price at
  // different rates within the same month.
  it("credits exports using a timeTable ExportRate, resolved per exporting hour", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [
        { rate: { summer: 0.4, winter: 0.3 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 },
        { rate: { summer: 0.15, winter: 0.12 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 20) },
      ],
    };
    const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: timeTable, addersApply: false, carryForward: true, cashOut: false });
    const gridImport = zeros();
    const gridExport = zeros();
    const dec = MONTH_START_HOUR[11];
    gridExport[dec + 17] = 50; // on-peak hour
    gridExport[dec + 1] = 80; // off-peak hour

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule: flatSchedule(), profile, options: { riderIds: [] } });

    expect(monthly[11].exportCredit).toBeCloseTo(10, 6); // draws down the $10 fixed charge
    expect(exportLedgerEndBalance).toBeCloseTo(14.6, 6); // 24.60 earned - 10 applied
  });
});

describe("priceYear: netMetering hourly netting with percentOfRetail", () => {
  // January (winter, LODI EA breakpoints [391, 782], rates [0.1428, 0.1581,
  // 0.3366]). Hour 0: 500 kWh import -> cumulative 500 sits in tier 2
  // (0.1581). Hour 1: 100 kWh export, credited at 50% of that marginal rate:
  // 100 * 0.5 * 0.1581 = 7.905 -- half of the 15.81 the 'retail' test earns
  // for the identical import/export series.
  it("credits an export hour at a fraction of that hour's own applicable retail rate", () => {
    const percentOfRetail = { kind: "percentOfRetail", fraction: 0.5 };
    const halfRateLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "hourly", exportRate: percentOfRetail } };
    const gridImport = zeros();
    const gridExport = zeros();
    const jan = MONTH_START_HOUR[0];
    gridImport[jan] = 500;
    gridExport[jan + 1] = 100;

    const { monthly } = priceYear({ gridImport, gridExport, schedule: LODI_EA, profile: halfRateLodi, options: { riderIds: [] } });

    expect(monthly[0].exportCredit).toBeCloseTo(7.905, 4);
  });
});

describe("priceYear: netMetering annual netting -- explicit exportPolicy.trueUp", () => {
  // Same banked-500-kWh-at-year-end scenario as the legacy exportRate tests
  // above (Sep export 1000, Oct import 300, Dec import 200 -> 500 kWh left
  // at the Dec true-up), but now exercising the explicit trueUp field rather
  // than the exportRate-doubles-as-true-up fallback.
  function buildSeries() {
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 8, 1000);
    setMonthTotal(gridImport, 9, 300);
    setMonthTotal(gridImport, 11, 200);
    return { gridImport, gridExport };
  }

  it("cashes out at trueUp.rate even though exportRate itself is 'retail' (no cashable rate of its own)", () => {
    const { gridImport, gridExport } = buildSeries();
    const profile = flatProfile({ type: "netMetering", netting: "annual", exportRate: "retail", trueUp: { rate: 0.05 } });

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule: flatSchedule(), profile, options: { riderIds: [] } });

    // True-up: 500 kWh * $0.05 = $25 credit, applied against Dec's $10
    // subtotal, leaving $15 banked -- identical math to the legacy numeric-
    // exportRate true-up test, now driven by trueUp instead.
    expect(monthly[11].exportCredit).toBeCloseTo(10, 6);
    expect(exportLedgerEndBalance).toBeCloseTo(15, 6);
  });

  it("forfeits at year end when trueUp is 'forfeit', even though exportRate is numeric", () => {
    const { gridImport, gridExport } = buildSeries();
    // exportRate is numeric (would cash out under the legacy fallback), but
    // trueUp is explicitly 'forfeit' and takes priority over that fallback.
    const profile = flatProfile({ type: "netMetering", netting: "annual", exportRate: 0.05, trueUp: "forfeit" });

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule: flatSchedule(), profile, options: { riderIds: [] } });

    expect(monthly[11].exportCredit).toBe(0);
    expect(exportLedgerEndBalance).toBe(0);
  });
});

describe("priceYear: schedule.minimumBillPerMonth floors the bill after riders and export credit", () => {
  // fixedChargePerMonth 20, minimumBillPerMonth 15, avoidedCostCredit
  // ratePerKWh 0.10. January exports 1000 kWh -> creditEarned = 100.
  // preRiderSubtotal = 20 (energy 0, no import) every month, all year (no
  // other import/export). The floor caps how much of that $100 credit ANY
  // month is allowed to draw down to: subtotal(20) - floor(15) = 5, so only
  // $5 is drawn each month (not the full $20, and nowhere near the $100
  // available) -- total = max(15, 20-5) = 15 every month, and the rest of
  // January's credit stays banked rather than being spent and then wasted
  // against the floor. Over all 12 months at $5/month that is $60 drawn
  // from the $100 earned, leaving $40 banked at year end -- never the $0 a
  // schedule with no floor would leave (the whole $100 would have been
  // spent well before January's own $20 bill, let alone eleven more months
  // of $20 bills).
  it("caps how much export credit a month can draw so the bill never goes below the floor, banking the rest", () => {
    const schedule = flatSchedule({ fixedChargePerMonth: 20, minimumBillPerMonth: 15 });
    const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: 0.1, addersApply: false, carryForward: true, cashOut: false });
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 1000);

    const { monthly, exportLedgerEndBalance } = priceYear({ gridImport, gridExport, schedule, profile, options: { riderIds: [] } });

    expect(monthly[0].exportCredit).toBeCloseTo(5, 6);
    expect(monthly[0].total).toBeCloseTo(15, 6);
    expect(monthly[1].exportCredit).toBeCloseTo(5, 6);
    expect(monthly[1].total).toBeCloseTo(15, 6);
    expect(monthly[11].exportCredit).toBeCloseTo(5, 6); // still capped at $5/month in December
    expect(exportLedgerEndBalance).toBeCloseTo(40, 6); // 100 earned - 5*12 = 40
  });

  it("behaves identically to an absent minimumBillPerMonth when it is 0 or omitted", () => {
    const scheduleWithZero = flatSchedule({ minimumBillPerMonth: 0 });
    const scheduleOmitted = flatSchedule();
    const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: 0.1, addersApply: false, carryForward: true, cashOut: false });
    const gridImport = zeros();
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 1000);

    const withZero = priceYear({ gridImport, gridExport, schedule: scheduleWithZero, profile, options: { riderIds: [] } });
    const withOmitted = priceYear({ gridImport, gridExport, schedule: scheduleOmitted, profile, options: { riderIds: [] } });

    expect(withZero.annualTotal).toBeCloseTo(withOmitted.annualTotal, 9);
  });
});

describe("priceYear: schedule.systemSizeCharges bill monthly as size * ratePerMonth", () => {
  // fixedChargePerMonth 0 and no import/export in any test below, so energy
  // and fixed are both always 0 -- the only charge in play is systemCharge.
  const schedule = flatSchedule({
    fixedChargePerMonth: 0,
    systemSizeCharges: [
      { basis: "kW-DC-solar", ratePerMonth: 3 },
      { basis: "kWh-battery", ratePerMonth: 1 },
    ],
  });
  const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: 0.1, addersApply: false, carryForward: true, cashOut: false });

  it("bills 5 kW-DC solar and 10 kWh battery at 5*3 + 10*1 = $25/month", () => {
    const gridImport = zeros();
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule,
      profile,
      options: { riderIds: [], systemSizes: { kwDCSolar: 5, kwhBattery: 10 } },
    });

    expect(monthly[0].systemCharge).toBeCloseTo(25, 6);
    expect(monthly[0].total).toBeCloseTo(25, 6);
    expect(monthly[6].systemCharge).toBeCloseTo(25, 6);
  });

  it("reads systemCharge as 0 when options.systemSizes is omitted", () => {
    const gridImport = zeros();
    const gridExport = zeros();

    const { monthly } = priceYear({ gridImport, gridExport, schedule, profile, options: { riderIds: [] } });

    expect(monthly[0].systemCharge).toBe(0);
    expect(monthly[0].total).toBe(0);
  });

  it("reads systemCharge as 0 on a schedule with no systemSizeCharges, regardless of options.systemSizes", () => {
    const gridImport = zeros();
    const gridExport = zeros();

    const { monthly } = priceYear({
      gridImport,
      gridExport,
      schedule: flatSchedule(),
      profile,
      options: { riderIds: [], systemSizes: { kwDCSolar: 5, kwhBattery: 10 } },
    });

    expect(monthly[0].systemCharge).toBe(0);
  });
});

describe("priceYear: all-units-blocks pricing", () => {
  const blockSchedule = flatSchedule({
    fixedChargePerMonth: 0,
    pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: null, rate: 0.08 }] },
  });
  const profile = flatProfile({ type: "avoidedCostCredit", ratePerKWh: 0, addersApply: false, carryForward: true, cashOut: false });

  // The discontinuity at the block edge: 500 kWh bills at 500*0.10 = 50;
  // 501 kWh (one more) bills the WHOLE month at the next block's lower
  // rate, 501*0.08 = 40.08 -- the bill actually drops even though usage
  // went up, unlike tiered pricing's smooth marginal-rate accounting.
  it("prices the whole month's import at the landed block's rate, with a discontinuity at the edge", () => {
    const at500 = zeros();
    setMonthTotal(at500, 0, 500);
    const at501 = zeros();
    setMonthTotal(at501, 0, 501);
    const gridExport = zeros();

    const { monthly: monthlyAt500 } = priceYear({ gridImport: at500, gridExport, schedule: blockSchedule, profile, options: { riderIds: [] } });
    const { monthly: monthlyAt501 } = priceYear({ gridImport: at501, gridExport, schedule: blockSchedule, profile, options: { riderIds: [] } });

    expect(monthlyAt500[0].energy).toBeCloseTo(50, 6);
    expect(monthlyAt501[0].energy).toBeCloseTo(40.08, 6);
    expect(monthlyAt501[0].energy).toBeLessThan(monthlyAt500[0].energy);
  });

  // netMetering annual netting reads its billed kWh through the identical
  // all-units-blocks pricing: 700 kWh import netted against 200 kWh export
  // = 500 kWh billed, landing in block 1 -> 500 * 0.10 = 50, not block 2's
  // rate (which the gross 700 kWh import alone would have reached).
  it("prices netMetering annual netting's NET billed kWh through the same block schedule", () => {
    const netMeteredProfile = flatProfile({ type: "netMetering", netting: "annual", exportRate: "retail" });
    const gridImport = zeros();
    setMonthTotal(gridImport, 0, 700);
    const gridExport = zeros();
    setMonthTotal(gridExport, 0, 200);

    const { monthly } = priceYear({ gridImport, gridExport, schedule: blockSchedule, profile: netMeteredProfile, options: { riderIds: [] } });

    expect(monthly[0].energy).toBeCloseTo(50, 6);
  });

  // Regression (finding 6): all-units-blocks prices the WHOLE month at the
  // single rate of whichever block the month's FINAL total lands in (see
  // the discontinuity test above) -- it is not marginal/tiered. Crediting a
  // 'retail' or percentOfRetail export at the rate in effect when that hour
  // happened mid-month reads the wrong block whenever more import still
  // accumulates later the same month, since the hourly rate is resolved off
  // a moving, not-yet-final cumulativeImportKWh.
  //
  // Fixture: February, 900 kWh total import (lands in the second/no-ceiling
  // block, 0.085), with a 100 kWh export in the month's very first hour --
  // before ANY of that import has been recorded. Before this fix, the
  // export's credit rate was resolved at that moment's cumulativeImportKWh
  // (0, landing in the FIRST block, 0.10), crediting 100 * 0.10 = $10.00.
  // After this fix, the credit is recomputed once the month's final total is
  // known, at the SAME 0.085 rate the whole month's energy charge itself
  // used: 100 * 0.085 = $8.50.
  it("credits a 'retail' export at the month's final landed block rate, not the rate in effect earlier the same month", () => {
    // The verifier's own fixture: 500@0.10 / null@0.085 (distinct from this
    // describe block's own blockSchedule, whose no-ceiling rate is 0.08), so
    // the golden dollar figures below ($8.50, not $10.00) match exactly.
    const goldenBlockSchedule = flatSchedule({
      fixedChargePerMonth: 0,
      pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: null, rate: 0.085 }] },
    });
    const profile = flatProfile({ type: "netMetering", netting: "hourly", exportRate: "retail" });
    const gridImport = zeros();
    const gridExport = zeros();
    const febStart = MONTH_START_HOUR[1];
    gridExport[febStart] = 100; // exported before any of the month's import has landed
    gridImport[febStart + 1] = 900; // the rest of February's import lands afterward

    const { monthly } = priceYear({ gridImport, gridExport, schedule: goldenBlockSchedule, profile, options: { riderIds: [] } });

    expect(monthly[1].energy).toBeCloseTo(900 * 0.085, 6); // whole month at the landed (no-ceiling) block's rate
    expect(monthly[1].exportCredit).toBeCloseTo(8.5, 6); // 100 * 0.085 = $8.50, not 100 * 0.10 = $10.00
  });
});
