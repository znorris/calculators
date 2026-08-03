import { describe, it, expect } from "vitest";
import { simulateComparison, PAYBACK_SEARCH_YEARS } from "../simulate.js";
import { solarHourly } from "../solar.js";
import { windHourly } from "../wind.js";
import { loadHourly } from "../load.js";
import { dispatchBattery } from "../battery.js";
import { priceYear } from "../billing.js";
import { LODI, LODI_EA } from "../tariffs/lodi.js";
import solarShapes from "../../data/solar-shapes.json";

const HOURS_PER_YEAR = 8760;

function household(overrides = {}) {
  return {
    schedule: "EA",
    riderIds: [],
    load: { mode: "annual", annualKWh: 8000, profileId: "residential" },
    ...overrides,
  };
}

function assumptions(overrides = {}) {
  return {
    horizonYears: 5,
    retailEscalation: 0,
    exportTrend: 0,
    ecaMode: "trailingAverage",
    addersOnExports: false,
    ...overrides,
  };
}

const FIVE_KW_SOUTH = { arrays: [{ kwDC: 5, tilt: 20, azimuth: 180, degradationRate: 0 }] };

const SMALL_BATTERY = {
  usableKWh: 10,
  chargeEff: 0.95,
  dischargeEff: 0.95,
  maxChargeKW: 5,
  maxDischargeKW: 5,
  reserveFrac: 0.1,
  cycleLife: 6000,
  calendarLifeYears: 10,
};

describe("simulateComparison: zero-size system reproduces the baseline exactly", () => {
  it("matches baseline years and representativeDays for a config with a 0 kW array and a null battery", () => {
    const zeroConfig = {
      configId: "zero",
      solar: { arrays: [{ kwDC: 0, tilt: 20, azimuth: 180, degradationRate: 0.01 }] },
      battery: null,
    };

    const { baseline, results } = simulateComparison({
      configs: [zeroConfig],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    expect(results[0].years).toEqual(baseline.years);
    expect(results[0].representativeDays).toEqual(baseline.representativeDays);
    expect(results[0].totals).toEqual(baseline.totals);
  });

  it("matches baseline exactly for a config object with no fields at all", () => {
    const { baseline, results } = simulateComparison({
      configs: [{ configId: "empty" }],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    expect(results[0].years).toEqual(baseline.years);
  });
});

describe("simulateComparison: hourly energy balance", () => {
  const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
  const hh = household();
  const yr = assumptions();

  it("holds production + gridImport = load + gridExport + batteryFlow for every hour of both representative days", () => {
    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });
    const { summer, winter } = results[0].representativeDays;

    for (const day of [summer, winter]) {
      for (let h = 0; h < 24; h++) {
        const lhs = day.production[h] + day.gridImport[h];
        const rhs = day.load[h] + day.gridExport[h] + day.batteryFlow[h];
        expect(lhs).toBeCloseTo(rhs, 9);
      }
    }
  });

  it("matches year-0 annual production/import/export against an independently-built reference computation", () => {
    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });

    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);
    const referenceLoad = loadBase.map((v, h) => v + loadEv[h]);
    const solar = solarHourly({ arrays: config.solar.arrays, year: 0 });
    const wind = windHourly({ turbines: [], year: 0 });
    const referenceProduction = solar.map((v, h) => v + wind[h]);
    const net = referenceProduction.map((v, h) => v - referenceLoad[h]);
    const dispatch = dispatchBattery({ net, battery: config.battery, mode: "self-consumption" });

    const referenceProductionKWh = referenceProduction.reduce((a, b) => a + b, 0);
    const referenceExportKWh = dispatch.gridExport.reduce((a, b) => a + b, 0);
    const referenceImportKWh = dispatch.gridImport.reduce((a, b) => a + b, 0);

    const year0 = results[0].years[0];
    expect(year0.productionKWh).toBeCloseTo(referenceProductionKWh, 6);
    expect(year0.exportKWh).toBeCloseTo(referenceExportKWh, 6);
    expect(year0.importKWh).toBeCloseTo(referenceImportKWh, 6);
  });
});

describe("simulateComparison: 5 kW south-facing Lodi EA system", () => {
  it("produces approximately 5x the bundled t20_a180 per-kW shape, within 1%", () => {
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    const perKWSum = solarShapes.grid.t20_a180.reduce((a, b) => a + b, 0);
    const expected = 5 * perKWSum;
    const actual = results[0].years[0].productionKWh;

    expect(actual).toBeGreaterThan(expected * 0.99);
    expect(actual).toBeLessThan(expected * 1.01);
  });

  it("self-consumption plus exports equals production for every year", () => {
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    for (const y of results[0].years) {
      expect(y.selfConsumedKWh + y.exportKWh).toBeCloseTo(y.productionKWh, 6);
    }
  });
});

describe("simulateComparison: adding a battery", () => {
  it("strictly decreases both exports and grid import versus the same config without it", () => {
    const hh = household();
    const yr = assumptions();
    const withBattery = { configId: "with-battery", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
    const withoutBattery = { configId: "without-battery", solar: FIVE_KW_SOUTH };

    const { results } = simulateComparison({ configs: [withBattery, withoutBattery], household: hh, profile: LODI, assumptions: yr });
    const [batteryResult, noBatteryResult] = results;

    expect(batteryResult.totals.exportKWh).toBeLessThan(noBatteryResult.totals.exportKWh);
    expect(batteryResult.totals.importKWh).toBeLessThan(noBatteryResult.totals.importKWh);
  });
});

describe("simulateComparison: representativeDays shape", () => {
  it("returns length-24 arrays that are internally consistent for both seasons", () => {
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    const { summer, winter } = results[0].representativeDays;
    for (const day of [summer, winter]) {
      expect(day.production).toHaveLength(24);
      expect(day.load).toHaveLength(24);
      expect(day.batteryFlow).toHaveLength(24);
      expect(day.gridImport).toHaveLength(24);
      expect(day.gridExport).toHaveLength(24);

      for (let h = 0; h < 24; h++) {
        expect(day.gridImport[h]).toBeGreaterThanOrEqual(-1e-9);
        expect(day.gridExport[h]).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it("returns all-zero batteryFlow for a config with no battery", () => {
    const config = { configId: "no-battery", solar: FIVE_KW_SOUTH };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    const { summer, winter } = results[0].representativeDays;
    for (const day of [summer, winter]) {
      for (let h = 0; h < 24; h++) expect(day.batteryFlow[h]).toBeCloseTo(0, 9);
    }
  });
});

describe("simulateComparison: EV rider metering", () => {
  it("bills the EV slice on schedule EV and excludes it from the base meter's solar/battery offset", () => {
    const hh = household({
      load: {
        mode: "annual",
        annualKWh: 6000,
        profileId: "residential",
        ev: { kWhPerDay: 10, windowStartHour: 22, windowEndHour: 5, daysPerWeek: 5 },
      },
      evRider: true,
    });
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 1 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });
    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);

    // The base meter's grid import/export should reflect base load only,
    // offset by production -- the EV series never appears in that net.
    const production = solarHourly({ arrays: config.solar.arrays, year: 0 });
    const net = production.map((v, h) => v - loadBase[h]);
    const expected = dispatchBattery({ net, battery: null, mode: "self-consumption" });

    const expectedImportKWh = expected.gridImport.reduce((a, b) => a + b, 0) + loadEv.reduce((a, b) => a + b, 0);
    expect(results[0].years[0].importKWh).toBeCloseTo(expectedImportKWh, 6);
  });

  it("does not create a separate EV meter bill when evRider is false", () => {
    const hh = household({
      load: {
        mode: "annual",
        annualKWh: 6000,
        profileId: "residential",
        ev: { kWhPerDay: 10, windowStartHour: 22, windowEndHour: 5, daysPerWeek: 5 },
      },
      evRider: false,
    });
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 1 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });
    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);
    const combinedLoad = loadBase.map((v, h) => v + loadEv[h]);

    const production = solarHourly({ arrays: config.solar.arrays, year: 0 });
    const net = production.map((v, h) => v - combinedLoad[h]);
    const expected = dispatchBattery({ net, battery: null, mode: "self-consumption" });
    const expectedImportKWh = expected.gridImport.reduce((a, b) => a + b, 0);

    expect(results[0].years[0].importKWh).toBeCloseTo(expectedImportKWh, 6);
  });
});

describe("simulateComparison: retail escalation and export trend", () => {
  it("scales the fixed charge portion of the no-system baseline bill by (1+retailEscalation)^year", () => {
    // Zero usage isolates the fixed charge: energy and the kWh-proportional
    // adders (state tax, ECA) are both zero regardless of escalation, so the
    // whole bill is just schedule.fixedChargePerMonth x 12, which
    // retailEscalation scales directly.
    const hh = household({ load: { mode: "annual", annualKWh: 0, profileId: "residential" } });
    const yr = assumptions({ horizonYears: 3, retailEscalation: 0.05 });

    const { baseline } = simulateComparison({ configs: [], household: hh, profile: LODI, assumptions: yr });

    const ratio1 = baseline.years[1].billTotal / baseline.years[0].billTotal;
    const ratio2 = baseline.years[2].billTotal / baseline.years[0].billTotal;
    expect(ratio1).toBeCloseTo(1.05, 4);
    expect(ratio2).toBeCloseTo(1.05 * 1.05, 4);
  });

  it("reduces annual export credit value in later years when exportTrend is negative", () => {
    const hh = household();
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yrFlat = assumptions({ horizonYears: 3, exportTrend: 0 });
    const yrDeclining = assumptions({ horizonYears: 3, exportTrend: -0.5 });

    const flat = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yrFlat }).results[0];
    const declining = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yrDeclining }).results[0];

    // Same production/export volumes (exportTrend does not affect physical
    // dispatch), but a much lower avoided-cost rate by year 2 should raise
    // the bill (less export credit) relative to the flat-export-rate run.
    expect(declining.years[2].exportKWh).toBeCloseTo(flat.years[2].exportKWh, 6);
    expect(declining.years[2].billTotal).toBeGreaterThan(flat.years[2].billTotal);
  });
});

describe("simulateComparison: export ledger carries its Dec 31 balance into the next year", () => {
  it("year 1's bill matches a manual second priceYear call fed with year 0's closing ledger, and undercuts year 0's total", () => {
    const config = { configId: "12kw-south", solar: { arrays: [{ kwDC: 12, tilt: 20, azimuth: 180, degradationRate: 0 }] } };
    const hh = household({ load: { mode: "annual", annualKWh: 9000, profileId: "residential" } });
    const yr = assumptions({ horizonYears: 2 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });

    // 0% escalation/export trend and 0% degradation mean production, load,
    // and dispatch are identical every year, so both years can be priced
    // from the same import/export series -- only the opening ledger differs.
    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);
    const load = loadBase.map((v, h) => v + loadEv[h]);
    const production = solarHourly({ arrays: config.solar.arrays, year: 0 });
    const net = production.map((v, h) => v - load[h]);
    const dispatch = dispatchBattery({ net, battery: null, mode: "self-consumption" });
    const scheduleEA = LODI.schedules.find((s) => s.id === "EA");
    const billingOptions = { ecaMode: "trailingAverage", addersOnExports: false, riderIds: [] };

    const manualYear0 = priceYear({
      gridImport: dispatch.gridImport,
      gridExport: dispatch.gridExport,
      schedule: scheduleEA,
      profile: LODI,
      options: billingOptions,
    });
    const manualYear1 = priceYear({
      gridImport: dispatch.gridImport,
      gridExport: dispatch.gridExport,
      schedule: scheduleEA,
      profile: LODI,
      options: { ...billingOptions, openingLedger: manualYear0.exportLedgerEndBalance },
    });

    // A 12 kW array against 9,000 kWh/yr of usage banks more export credit
    // across the sunny months than the bill needs, so this system's ledger
    // should end the year positive -- otherwise the rest of this test proves
    // nothing about carry-forward.
    expect(manualYear0.exportLedgerEndBalance).toBeGreaterThan(0);

    expect(results[0].years[0].billTotal).toBeCloseTo(manualYear0.annualTotal, 6);
    expect(results[0].years[1].billTotal).toBeCloseTo(manualYear1.annualTotal, 6);
    expect(results[0].years[1].billTotal).toBeLessThan(results[0].years[0].billTotal);
  });
});

describe("simulateComparison: a custom net-metered (annual kWh netting) profile runs end to end", () => {
  it("completes without error and produces sane year totals: exports reduce the bill, and no year cashes out negative", () => {
    const netMeteredLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" } };
    const hh = household();
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 5 });

    const { baseline, results } = simulateComparison({
      configs: [config],
      household: hh,
      profile: netMeteredLodi,
      assumptions: yr,
    });

    const solar = results[0];
    for (let y = 0; y < 5; y++) {
      expect(Number.isFinite(solar.years[y].billTotal)).toBe(true);
      expect(solar.years[y].billTotal).toBeGreaterThanOrEqual(0); // priceYear floors every month's total at 0, never a payout
      expect(solar.years[y].exportKWh).toBeGreaterThan(0);
      // The solar config exports real kWh every year, so netting should
      // leave it with a lower bill than the no-system baseline throughout.
      expect(solar.years[y].billTotal).toBeLessThan(baseline.years[y].billTotal);
    }
  });
});

describe("simulateComparison: a custom net-metered (hourly retail-crediting) profile's $ ledger carries its Dec 31 balance into the next year", () => {
  it("year 1's bill matches a manual second priceYear call fed with year 0's closing ledger", () => {
    // Same numeric rate as LODI's own avoidedCostCredit (0.0843/kWh), so this
    // reuses the known-positive-ledger sizing from the avoidedCostCredit
    // ledger-carry test above (a 12 kW array against 9,000 kWh/yr of usage).
    const hourlyNetMeteredLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "hourly", exportRate: 0.0843 } };
    const config = { configId: "12kw-south", solar: { arrays: [{ kwDC: 12, tilt: 20, azimuth: 180, degradationRate: 0 }] } };
    const hh = household({ load: { mode: "annual", annualKWh: 9000, profileId: "residential" } });
    const yr = assumptions({ horizonYears: 2 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: hourlyNetMeteredLodi, assumptions: yr });

    // 0% escalation/export trend and 0% degradation mean production, load,
    // and dispatch are identical every year, so both years can be priced
    // from the same import/export series -- only the opening ledger differs.
    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);
    const load = loadBase.map((v, h) => v + loadEv[h]);
    const production = solarHourly({ arrays: config.solar.arrays, year: 0 });
    const net = production.map((v, h) => v - load[h]);
    const dispatch = dispatchBattery({ net, battery: null, mode: "self-consumption" });
    const scheduleEA = LODI.schedules.find((s) => s.id === "EA");
    const billingOptions = { ecaMode: "trailingAverage", addersOnExports: false, riderIds: [] };

    const manualYear0 = priceYear({
      gridImport: dispatch.gridImport,
      gridExport: dispatch.gridExport,
      schedule: scheduleEA,
      profile: hourlyNetMeteredLodi,
      options: billingOptions,
    });
    const manualYear1 = priceYear({
      gridImport: dispatch.gridImport,
      gridExport: dispatch.gridExport,
      schedule: scheduleEA,
      profile: hourlyNetMeteredLodi,
      options: { ...billingOptions, openingLedger: manualYear0.exportLedgerEndBalance },
    });

    expect(manualYear0.exportLedgerEndBalance).toBeGreaterThan(0);
    expect(results[0].years[0].billTotal).toBeCloseTo(manualYear0.annualTotal, 6);
    expect(results[0].years[1].billTotal).toBeCloseTo(manualYear1.annualTotal, 6);
    expect(results[0].years[1].billTotal).toBeLessThan(results[0].years[0].billTotal);
  });
});

describe("simulateComparison: escalation applies to adders and demand charges, not just energy rates and the fixed charge", () => {
  it("scales a G2 (demand-charge) baseline bill by exactly (1+retailEscalation)^year", () => {
    const hh = household({ schedule: "G2", load: { mode: "annual", annualKWh: 120000, profileId: "small-commercial" } });
    const yr = assumptions({ horizonYears: 3, retailEscalation: 0.05 });

    const { baseline } = simulateComparison({ configs: [], household: hh, profile: LODI, assumptions: yr });

    const ratio1 = baseline.years[1].billTotal / baseline.years[0].billTotal;
    const ratio2 = baseline.years[2].billTotal / baseline.years[0].billTotal;
    // Same load every year (no config, no year-dependent load scaling), so
    // if every cost component -- fixed, energy, adders, and demand -- scales
    // by the same factor, the whole bill scales by exactly that factor too.
    // Before adders/demand escalated, this ratio fell well short of 1.05.
    expect(ratio1).toBeCloseTo(1.05, 6);
    expect(ratio2).toBeCloseTo(1.05 * 1.05, 6);
  });
});

describe("simulateComparison: battery missing life fields defaults to no degradation", () => {
  it("matches an explicit near-infinite-life battery instead of derating to 70% starting at year 0", () => {
    const hh = household();
    const yr = assumptions({ horizonYears: 3 });
    const noLifeBattery = { usableKWh: 10, chargeEff: 0.95, dischargeEff: 0.95, maxChargeKW: 5, maxDischargeKW: 5, reserveFrac: 0.1 };
    const longLifeBattery = { ...noLifeBattery, cycleLife: 1e9, calendarLifeYears: 1e6 };

    const noLifeConfig = { configId: "no-life", solar: FIVE_KW_SOUTH, battery: noLifeBattery };
    const longLifeConfig = { configId: "long-life", solar: FIVE_KW_SOUTH, battery: longLifeBattery };

    const { results } = simulateComparison({
      configs: [noLifeConfig, longLifeConfig],
      household: hh,
      profile: LODI,
      assumptions: yr,
    });

    const [noLife, longLife] = results;
    for (let y = 0; y < 3; y++) {
      // longLife's endOfLifeYear is merely huge, not infinite, so it carries
      // a hair of interpolated degradation (~1e-6 of nameplate) that noLife
      // (truly undegraded) does not -- hence a loose tolerance here.
      expect(noLife.years[y].importKWh).toBeCloseTo(longLife.years[y].importKWh, 2);
      expect(noLife.years[y].billTotal).toBeCloseTo(longLife.years[y].billTotal, 1);
    }
  });
});

describe("simulateComparison: selfConsumedKWh excludes battery losses and stored energy", () => {
  it("equals load served on-site (selfConsumedKWh + gridImport = total load), and never exceeds production minus exports", () => {
    const hh = household();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
    const yr = assumptions({ horizonYears: 2 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });

    const { base: loadBase, ev: loadEv } = loadHourly(hh.load);
    const totalLoadKWh = loadBase.reduce((a, b) => a + b, 0) + loadEv.reduce((a, b) => a + b, 0);

    for (const y of results[0].years) {
      expect(y.selfConsumedKWh + y.importKWh).toBeCloseTo(totalLoadKWh, 6);
      expect(y.selfConsumedKWh + y.exportKWh).toBeLessThanOrEqual(y.productionKWh + 1e-9);
    }
  });
});

describe("simulateComparison: grid charging threads through from config.battery.gridCharge", () => {
  const GRID_CHARGE_BATTERY = {
    ...SMALL_BATTERY,
    gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
  };

  it("reports zero gridChargeKWh in every year and total when gridCharge is absent", () => {
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });

    for (const y of results[0].years) expect(y.gridChargeKWh).toBe(0);
    expect(results[0].totals.gridChargeKWh).toBe(0);
  });

  it("reports positive gridChargeKWh per year and totals equal to the sum of the years when gridCharge is enabled", () => {
    const config = { configId: "solar-battery-gridcharge", solar: FIVE_KW_SOUTH, battery: GRID_CHARGE_BATTERY };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions({ horizonYears: 3 }),
    });

    // years runs the full analysis window (max(horizonYears,
    // PAYBACK_SEARCH_YEARS) = 40 here), but totals is scoped to horizonYears
    // (3) only -- see calc/simulate.js's totals comment -- so the sum below
    // must match that same slice, not the whole array.
    let summedGridChargeKWh = 0;
    for (const y of results[0].years) {
      expect(y.gridChargeKWh).toBeGreaterThan(0);
    }
    for (const y of results[0].years.slice(0, 3)) {
      summedGridChargeKWh += y.gridChargeKWh;
    }
    expect(results[0].totals.gridChargeKWh).toBeCloseTo(summedGridChargeKWh, 6);
  });

  it("increases importKWh and billTotal versus the same config without grid charging, since grid-charge energy bills like any other import", () => {
    const hh = household();
    const yr = assumptions({ horizonYears: 1 });
    const withGridCharge = { configId: "with-gridcharge", solar: FIVE_KW_SOUTH, battery: GRID_CHARGE_BATTERY };
    const withoutGridCharge = { configId: "without-gridcharge", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };

    const { results } = simulateComparison({
      configs: [withGridCharge, withoutGridCharge],
      household: hh,
      profile: LODI,
      assumptions: yr,
    });
    const [gridChargeResult, noGridChargeResult] = results;

    expect(gridChargeResult.years[0].importKWh).toBeGreaterThan(noGridChargeResult.years[0].importKWh);
    expect(gridChargeResult.years[0].billTotal).toBeGreaterThan(noGridChargeResult.years[0].billTotal);
  });

  it("keeps the production + gridImport = load + gridExport + batteryFlow identity intact on both representative days", () => {
    const config = { configId: "solar-battery-gridcharge", solar: FIVE_KW_SOUTH, battery: GRID_CHARGE_BATTERY };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });
    const { summer, winter } = results[0].representativeDays;

    for (const day of [summer, winter]) {
      for (let h = 0; h < 24; h++) {
        const lhs = day.production[h] + day.gridImport[h];
        const rhs = day.load[h] + day.gridExport[h] + day.batteryFlow[h];
        expect(lhs).toBeCloseTo(rhs, 9);
      }
    }
  });

  it("shows a positive batteryFlow (AC-side charging) in at least one grid-charge-window hour of the representative winter day", () => {
    // A small night-time battery-only load with no solar keeps the battery
    // well below target every night, so the grid-charge window should charge
    // it every winter night regardless of production.
    const config = {
      configId: "battery-only-gridcharge",
      battery: {
        ...GRID_CHARGE_BATTERY,
        usableKWh: 20,
        gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
      },
    };
    const { results } = simulateComparison({
      configs: [config],
      household: household(),
      profile: LODI,
      assumptions: assumptions(),
    });
    const { winter } = results[0].representativeDays;

    const windowHours = [22, 23, 0, 1, 2, 3, 4, 5];
    const chargedDuringWindow = windowHours.some((h) => winter.batteryFlow[h] > 1e-9);
    expect(chargedDuringWindow).toBe(true);
  });
});

describe("simulateComparison: input validation passthrough", () => {
  it("throws when household.schedule does not match a schedule on the profile", () => {
    const hh = household({ schedule: "NOT-A-SCHEDULE" });
    expect(() =>
      simulateComparison({ configs: [], household: hh, profile: LODI, assumptions: assumptions() }),
    ).toThrow(/NOT-A-SCHEDULE/);
  });
});

describe("dispatchBattery + priceYear: peak-shave demand parity with gridCharge on vs off", () => {
  // A synthetic full year: a daytime surplus (hours-of-day 8-16) recharges
  // the battery; hours-of-day 22, 23, 0, 1 (inside the default grid-charge
  // window) draw 12 kW, above a 10 kW shave threshold; every other hour
  // draws 1 kW, under the threshold. Grid charging is enabled with
  // targetSocFrac 1.0, so every one of those four hours starts the night at
  // or below target and gcActive is true for at least hours 2-4 of each.
  function buildYearNet() {
    const net = new Array(HOURS_PER_YEAR);
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const hod = h % 24;
      if (hod >= 8 && hod < 17) net[h] = 10;
      else if (hod >= 22 || hod < 2) net[h] = -12;
      else net[h] = -1;
    }
    return net;
  }

  const battery = {
    usableKWh: 40,
    chargeEff: 1,
    dischargeEff: 1,
    maxChargeKW: 5,
    maxDischargeKW: 10,
    reserveFrac: 0.1, // reserveKWh = 4
  };
  const scheduleG2 = LODI.schedules.find((s) => s.id === "G2");
  const billingOptions = { ecaMode: "trailingAverage", addersOnExports: false, riderIds: [] };

  it("bills the identical monthly demand charge whether grid charging is on or off, for every one of the 12 months", () => {
    const net = buildYearNet();

    const gridChargeOff = dispatchBattery({ net, battery, mode: "peak-shave", shaveThresholdKW: 10 });
    const gridChargeOn = dispatchBattery({
      net,
      battery: {
        ...battery,
        gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
      },
      mode: "peak-shave",
      shaveThresholdKW: 10,
    });

    const billOff = priceYear({
      gridImport: gridChargeOff.gridImport,
      gridExport: gridChargeOff.gridExport,
      schedule: scheduleG2,
      profile: LODI,
      options: billingOptions,
    });
    const billOn = priceYear({
      gridImport: gridChargeOn.gridImport,
      gridExport: gridChargeOn.gridExport,
      schedule: scheduleG2,
      profile: LODI,
      options: billingOptions,
    });

    for (let m = 0; m < 12; m++) {
      expect(billOn.monthly[m].demand).toBeCloseTo(billOff.monthly[m].demand, 6);
      expect(billOn.monthly[m].demand).toBeGreaterThan(0);
    }
  });
});

describe("regression: a short ownership horizon still simulates the full payback-search window", () => {
  it("runs years out to max(horizonYears, PAYBACK_SEARCH_YEARS), not just horizonYears, and echoes horizonYears on the result", () => {
    const hh = household();
    const yr = assumptions({ horizonYears: 10 });
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };

    const { baseline, results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });

    expect(results[0].years).toHaveLength(PAYBACK_SEARCH_YEARS);
    expect(baseline.years).toHaveLength(PAYBACK_SEARCH_YEARS);
    expect(results[0].horizonYears).toBe(10);
    expect(baseline.horizonYears).toBe(10);
  });

  it("does not extend years past horizonYears when the horizon itself already exceeds PAYBACK_SEARCH_YEARS", () => {
    const hh = household();
    const yr = assumptions({ horizonYears: 45 });

    const { baseline } = simulateComparison({ configs: [], household: hh, profile: LODI, assumptions: yr });

    expect(baseline.years).toHaveLength(45);
    expect(baseline.horizonYears).toBe(45);
  });

  it("scopes totals to horizonYears only, even though years runs longer", () => {
    const hh = household();
    const yr = assumptions({ horizonYears: 10 });
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };

    const { results } = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr });

    let expectedProduction = 0;
    for (const y of results[0].years.slice(0, 10)) expectedProduction += y.productionKWh;

    expect(results[0].years.length).toBeGreaterThan(10);
    expect(results[0].totals.productionKWh).toBeCloseTo(expectedProduction, 6);
  });
});

describe("simulateComparison: exportPolicy.lockYears freezes the export rate before exportTrend resumes", () => {
  // Same 5 kW south array every year (degradationRate 0) and retailEscalation
  // 0, so production/import/export are byte-identical year over year -- the
  // only thing that can move billTotal across years is the export rate
  // itself. With lockYears: 3 and exportTrend: -0.5, the rate is frozen at
  // its year-0 value through year 2 (factor 1 every time, 3 total frozen
  // years), so years 0-2 must bill IDENTICALLY; year 3 is the first
  // escalated year, at exponent 1 ((1-0.5)^1 = 0.5), not exponent 0 -- the
  // escalation clock resets to 1, not 0, the moment the lock lifts. Year 4
  // is exponent 2 ((1-0.5)^2 = 0.25), a smaller credit still, raising the
  // bill further.
  //
  // Regression (finding 7): exportEscalationFactor computed
  // (1+exportTrend)^(year-lockYears), an off-by-one that left year lockYears
  // itself at exponent 0 (factor 1, billing identically to the frozen
  // years) instead of exponent 1 -- lockYears: 3 would have frozen 4 years
  // (0-3), not 3. Fails before this fix (years[3] equals years[0]), passes
  // after (years[3] is strictly worse, matching a real exponent-1 escalation).
  it("bills years 0 through lockYears-1 identically, then resumes exportTrend at exponent 1, not exponent 0", () => {
    const lockedLodi = { ...LODI, exportPolicy: { ...LODI.exportPolicy, lockYears: 3 } };
    const hh = household();
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 5, exportTrend: -0.5 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: lockedLodi, assumptions: yr });
    const years = results[0].years;

    expect(years[0].exportKWh).toBeGreaterThan(0); // otherwise this test proves nothing
    expect(years[1].billTotal).toBe(years[0].billTotal);
    expect(years[2].billTotal).toBe(years[0].billTotal);
    expect(years[3].billTotal).toBeGreaterThan(years[0].billTotal); // exponent 1 now: less credit, higher bill
    expect(years[4].billTotal).toBeGreaterThan(years[3].billTotal); // exponent 2: less credit still
  });

  it("without lockYears, the identical exportTrend moves the bill every year instead of staying flat", () => {
    const unlockedLodi = LODI; // no lockYears field
    const hh = household();
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 3, exportTrend: -0.5 });

    const { results } = simulateComparison({ configs: [config], household: hh, profile: unlockedLodi, assumptions: yr });
    const years = results[0].years;

    expect(years[1].billTotal).toBeGreaterThan(years[0].billTotal);
    expect(years[2].billTotal).toBeGreaterThan(years[1].billTotal);
  });
});

describe("simulateComparison: exportPolicy.trueUp's own rate escalates by exportTrend like every other export rate", () => {
  it("cashes out a later year's leftover kWh at trueUp.rate scaled by (1+exportTrend)^year, not the year-0 rate", () => {
    // 4 kW south against 6,000 kWh/yr usage leaves a comfortable, non-zero
    // kWh credit banked every December under annual netting. Year 0 and
    // year 1 both bill identically either way here (both years' true-up
    // credit already exceeds what December's own subtotal can absorb, so
    // the surplus just banks in the $ ledger regardless of how much bigger
    // the escalated version of that surplus is); the divergence this test
    // exercises shows up at year 2, once the bigger banked ledger the
    // trending run carried out of year 1 is large enough to visibly reduce
    // year 2's own bill.
    const netMeteredLodi = { ...LODI, exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail", trueUp: { rate: 0.05 } } };
    const hh = household({ load: { mode: "annual", annualKWh: 6000, profileId: "residential" } });
    const config = { configId: "4kw-south", solar: { arrays: [{ kwDC: 4, tilt: 20, azimuth: 180, degradationRate: 0 }] } };
    const yrFlat = assumptions({ horizonYears: 3, exportTrend: 0 });
    const yrTrending = assumptions({ horizonYears: 3, exportTrend: 0.5 });

    const flat = simulateComparison({ configs: [config], household: hh, profile: netMeteredLodi, assumptions: yrFlat }).results[0];
    const trending = simulateComparison({ configs: [config], household: hh, profile: netMeteredLodi, assumptions: yrTrending }).results[0];

    // Year 0's escalation factor is (1+exportTrend)^0 = 1 regardless of
    // exportTrend, so year 0 must bill identically either way.
    expect(trending.years[0].billTotal).toBeCloseTo(flat.years[0].billTotal, 6);
    expect(trending.years[1].billTotal).toBeCloseTo(flat.years[1].billTotal, 6);
    expect(trending.years[2].billTotal).toBeLessThan(flat.years[2].billTotal);
  });
});

describe("simulateComparison: schedule.systemSizeCharges bills the config's own nameplate solar/battery sizes", () => {
  it("adds size * ratePerMonth * 12 to the annual bill relative to an otherwise-identical schedule with none", () => {
    const scheduleWithCharge = {
      ...LODI_EA,
      systemSizeCharges: [
        { basis: "kW-DC-solar", ratePerMonth: 2 },
        { basis: "kWh-battery", ratePerMonth: 1 },
      ],
    };
    const profileWithCharge = { ...LODI, schedules: LODI.schedules.map((s) => (s.id === "EA" ? scheduleWithCharge : s)) };
    const hh = household();
    const config = { configId: "5kw-10kwh", solar: FIVE_KW_SOUTH, battery: SMALL_BATTERY };
    const yr = assumptions({ horizonYears: 1 });

    const withCharge = simulateComparison({ configs: [config], household: hh, profile: profileWithCharge, assumptions: yr }).results[0];
    const withoutCharge = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr }).results[0];

    // 5 kW-DC solar * $2/mo + 10 kWh (nameplate) battery * $1/mo = $20/mo,
    // times 12 months = $240/yr. Uses the battery's NAMEPLATE usableKWh (10),
    // not a given year's degraded capacity -- a system's physical size for
    // billing purposes does not shrink as the battery ages.
    expect(withCharge.years[0].billTotal - withoutCharge.years[0].billTotal).toBeCloseTo(20 * 12, 4);
  });

  it("bills the no-system baseline with systemCharge 0, since its sizes are 0 regardless of the schedule", () => {
    const scheduleWithCharge = { ...LODI_EA, systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 2 }] };
    const profileWithCharge = { ...LODI, schedules: LODI.schedules.map((s) => (s.id === "EA" ? scheduleWithCharge : s)) };
    const hh = household();
    const yr = assumptions({ horizonYears: 1 });

    const { baseline } = simulateComparison({ configs: [], household: hh, profile: profileWithCharge, assumptions: yr });
    const { baseline: baselinePlain } = simulateComparison({ configs: [], household: hh, profile: LODI, assumptions: yr });

    expect(baseline.years[0].billTotal).toBeCloseTo(baselinePlain.years[0].billTotal, 6);
  });

  // Regression (finding 8): simulateConfig passed the identical `systemSizes`
  // options object to BOTH the base meter's priceYear call and (when
  // evRiderApplies) the EV rider meter's -- a config's nameplate solar size
  // is one physical fact about the property, not two, so a schedule.EV that
  // also happens to declare systemSizeCharges would bill the same kW/kWh a
  // second time. Fails before this fix (bill difference is 2x the expected
  // figure), passes after (systemSizes reaches only the base meter's call).
  it("bills a config's nameplate solar size once, not twice, when both the base and EV schedules declare systemSizeCharges", () => {
    const baseWithCharge = { ...LODI_EA, systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 2 }] };
    const evSchedule = LODI.schedules.find((s) => s.id === "EV");
    const evWithCharge = { ...evSchedule, systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 2 }] };
    const profileWithCharge = {
      ...LODI,
      schedules: LODI.schedules.map((s) => (s.id === "EA" ? baseWithCharge : s.id === "EV" ? evWithCharge : s)),
    };

    const hh = household({
      load: {
        mode: "annual",
        annualKWh: 6000,
        profileId: "residential",
        ev: { kWhPerDay: 10, windowStartHour: 22, windowEndHour: 5, daysPerWeek: 5 },
      },
      evRider: true,
    });
    const config = { configId: "5kw-south", solar: FIVE_KW_SOUTH };
    const yr = assumptions({ horizonYears: 1 });

    const withCharge = simulateComparison({ configs: [config], household: hh, profile: profileWithCharge, assumptions: yr }).results[0];
    const withoutCharge = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr }).results[0];

    // 5 kW-DC solar * $2/mo * 12 months = $120/yr, billed ONCE (base meter
    // only) -- not $240/yr, which double-billing the same nameplate size on
    // both the base and EV meters would produce.
    expect(withCharge.years[0].billTotal - withoutCharge.years[0].billTotal).toBeCloseTo(5 * 2 * 12, 4);
  });
});
