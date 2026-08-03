import { describe, it, expect } from "vitest";
import { incrementalAnalysis } from "../incremental.js";
import { simulateComparison } from "../simulate.js";
import { LODI } from "../tariffs/lodi.js";

function household(overrides = {}) {
  return {
    schedule: "EA",
    riderIds: [],
    load: { mode: "annual", annualKWh: 9000, profileId: "residential" },
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

const BATTERY = {
  usableKWh: 10,
  chargeEff: 0.95,
  dischargeEff: 0.95,
  maxChargeKW: 5,
  maxDischargeKW: 5,
  reserveFrac: 0.1,
  cycleLife: 6000,
  calendarLifeYears: 10,
};

const WIND_TURBINE = {
  powerCurve: [
    { ms: 0, kw: 0 },
    { ms: 3, kw: 0 },
    { ms: 12, kw: 4 },
    { ms: 25, kw: 4 },
  ],
  hubHeightM: 20,
  annualMeanWindMS: 5,
};

describe("incrementalAnalysis: battery equals an independently-built config difference", () => {
  it("matches averaging (withoutBattery - withBattery) bill totals across the horizon", () => {
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: BATTERY };
    const costs = { battery: { cost: 12000, oAndMPerYear: 0 } };

    const [batteryLine] = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    const configWithout = { configId: "solar-only", solar: FIVE_KW_SOUTH };
    const withBattery = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr }).results[0];
    const withoutBattery = simulateComparison({ configs: [configWithout], household: hh, profile: LODI, assumptions: yr }).results[0];

    let expectedTotalSavings = 0;
    for (let year = 0; year < yr.horizonYears; year++) {
      expectedTotalSavings += withoutBattery.years[year].billTotal - withBattery.years[year].billTotal;
    }
    const expectedAnnualSavings = expectedTotalSavings / yr.horizonYears;

    expect(batteryLine.component).toBe("battery");
    expect(batteryLine.addedCost).toBe(12000);
    expect(batteryLine.addedAnnualSavings).toBeCloseTo(expectedAnnualSavings, 6);
  });

  it("subtracts the component's own O&M from addedAnnualSavings", () => {
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: BATTERY };

    const withoutOm = incrementalAnalysis({
      config,
      household: hh,
      profile: LODI,
      assumptions: yr,
      costs: { battery: { cost: 12000, oAndMPerYear: 0 } },
    })[0];
    const withOm = incrementalAnalysis({
      config,
      household: hh,
      profile: LODI,
      assumptions: yr,
      costs: { battery: { cost: 12000, oAndMPerYear: 150 } },
    })[0];

    expect(withOm.addedAnnualSavings).toBeCloseTo(withoutOm.addedAnnualSavings - 150, 6);
  });

  it("returns null when the component's cumulative savings never reach its cost anywhere in the full analysis window", () => {
    // Battery savings here are positive but small relative to a $12000 cost:
    // cumulative net savings never come close to recovering the cost even
    // simulated out to the full ~40-year analysis window (not just the
    // 5-year horizon), so this must not report a payback at all.
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: BATTERY };
    const costs = { battery: { cost: 12000 } };

    const [batteryLine] = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    expect(batteryLine.addedAnnualSavings).toBeGreaterThan(0);
    expect(batteryLine.standalonePaybackYears).toBeNull();
  });

  it("interpolates a standalone payback within the crossing year when cumulative savings do reach the cost", () => {
    // A much smaller added cost crosses cumulative savings inside the
    // 5-year horizon; the payback year should match a cumulative-crossing
    // computation over the actual per-year savings, not the horizon average.
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: BATTERY };
    const costs = { battery: { cost: 500 } };

    const [batteryLine] = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    expect(batteryLine.standalonePaybackYears).not.toBeNull();
    expect(batteryLine.standalonePaybackYears).toBeLessThanOrEqual(yr.horizonYears);
    expect(batteryLine.standalonePaybackYears).toBeGreaterThan(0);
  });

  it("regression: finds a standalone payback that lands past the 5-year horizon instead of reporting null", () => {
    // $3000 added cost does not recover within the 5-year horizon (cumulative
    // net savings by year 5 are roughly $1380, per an independently-run
    // reference simulation of this exact fixture), but does recover further
    // into the full analysis window -- before this fix, a horizon-bounded
    // search would have reported standalonePaybackYears null here, exactly
    // the "never pays back" bug this whole change addresses, just at the
    // per-component level instead of finance.js's whole-system level.
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-battery", solar: FIVE_KW_SOUTH, battery: BATTERY };
    const costs = { battery: { cost: 3000 } };

    const [batteryLine] = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    expect(batteryLine.standalonePaybackYears).not.toBeNull();
    expect(batteryLine.standalonePaybackYears).toBeGreaterThan(yr.horizonYears);
    expect(batteryLine.standalonePaybackYears).toBeLessThan(20);
  });
});

describe("incrementalAnalysis: wind component", () => {
  it("evaluates wind the same way as battery, removing only the wind field", () => {
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-wind", solar: FIVE_KW_SOUTH, wind: { turbines: [WIND_TURBINE] } };
    const costs = { wind: { cost: 20000 } };

    const [windLine] = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    const configWithout = { configId: "solar-only", solar: FIVE_KW_SOUTH };
    const withWind = simulateComparison({ configs: [config], household: hh, profile: LODI, assumptions: yr }).results[0];
    const withoutWind = simulateComparison({ configs: [configWithout], household: hh, profile: LODI, assumptions: yr }).results[0];

    let expectedTotalSavings = 0;
    for (let year = 0; year < yr.horizonYears; year++) {
      expectedTotalSavings += withoutWind.years[year].billTotal - withWind.years[year].billTotal;
    }

    expect(windLine.component).toBe("wind");
    expect(windLine.addedAnnualSavings).toBeCloseTo(expectedTotalSavings / yr.horizonYears, 6);
  });

  it("evaluates both battery and wind when a config has both, in battery-then-wind order", () => {
    const hh = household();
    const yr = assumptions();
    const config = {
      configId: "solar-battery-wind",
      solar: FIVE_KW_SOUTH,
      battery: BATTERY,
      wind: { turbines: [WIND_TURBINE] },
    };
    const costs = { battery: { cost: 12000 }, wind: { cost: 20000 } };

    const lines = incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs });

    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.component)).toEqual(["battery", "wind"]);
  });
});

describe("incrementalAnalysis: no removable components", () => {
  it("returns an empty array for a solar-only config", () => {
    const hh = household();
    const yr = assumptions();
    const config = { configId: "solar-only", solar: FIVE_KW_SOUTH };

    expect(incrementalAnalysis({ config, household: hh, profile: LODI, assumptions: yr, costs: {} })).toEqual([]);
  });
});
