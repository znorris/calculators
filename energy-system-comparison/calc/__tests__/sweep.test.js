import { describe, it, expect } from "vitest";
import {
  generateSweepGrid,
  interpolatedBatteryCostPerKWh,
  batteryCost,
  batterySpec,
  solarArraySpec,
  solarCost,
  windCost,
  turbineSpec,
  runSweep,
  bestByNpv,
  bestByPayback,
  SWEEP_SOLAR_MAX_KW,
  SWEEP_BATTERY_MAX_KWH,
} from "../sweep.js";
import { simulateComparison } from "../simulate.js";
import { financeConfig } from "../finance.js";
import equipmentPresets from "../../data/equipment-presets.json";
import windData from "../../data/wind.json";
import { LODI } from "../tariffs/lodi.js";

const WIND_PRESETS = windData.powerCurves.presets;
const BATTERY_PRESETS = equipmentPresets.batteries;

const BASE_HOUSEHOLD = {
  schedule: "EA",
  riderIds: [],
  load: { mode: "annual", annualKWh: 9000, monthlyKWh: null, hourlyKWh: null, profileId: "residential" },
  billingOptions: {},
};

const BASE_ASSUMPTIONS = {
  horizonYears: 25,
  retailEscalation: 0.03,
  exportTrend: 0,
  ecaMode: "trailingAverage",
  addersOnExports: false,
};

describe("generateSweepGrid", () => {
  it("sweeps solar 0-14 step 1 when only solar is checked, excluding the trivial all-zero point", () => {
    const grid = generateSweepGrid({ categories: { solar: true, battery: false, wind: [] } });
    const solarValues = grid.map((p) => p.solarKW).sort((a, b) => a - b);
    expect(solarValues).toEqual(Array.from({ length: SWEEP_SOLAR_MAX_KW }, (_, i) => i + 1)); // 1..14, no 0
    expect(grid.every((p) => p.batteryKWh === 0 && p.windPresetId == null)).toBe(true);
  });

  it("includes solar=0 once battery is also checked (a battery-only point is meaningful)", () => {
    const grid = generateSweepGrid({ categories: { solar: true, battery: true, wind: [] } });
    expect(grid.some((p) => p.solarKW === 0 && p.batteryKWh > 0)).toBe(true);
    // The fully-zero point is still never present.
    expect(grid.some((p) => p.solarKW === 0 && p.batteryKWh === 0 && p.windPresetId == null)).toBe(false);
  });

  it("battery grid is the 0-30 step-5 ladder unioned with every preset's exact usable kWh, deduped", () => {
    // solar also on so a batteryKWh=0 point has somewhere to survive (paired
    // with a nonzero solarKW) -- with solar off, battery=0 alone would be the
    // fully-zero point every category-combination excludes.
    const grid = generateSweepGrid({ categories: { solar: true, battery: true, wind: [] } });
    const batteryValues = [...new Set(grid.map((p) => p.batteryKWh))].sort((a, b) => a - b);

    const stepValues = [];
    for (let kwh = 0; kwh <= SWEEP_BATTERY_MAX_KWH; kwh += 5) stepValues.push(kwh);
    const presetValues = BATTERY_PRESETS.map((b) => b.usableKWh);
    const expected = [...new Set([...stepValues, ...presetValues])].sort((a, b) => a - b);

    expect(batteryValues).toEqual(expected);
    // No duplicate entries within 0.01 of each other (dedup actually happened).
    for (let i = 1; i < batteryValues.length; i += 1) {
      expect(batteryValues[i] - batteryValues[i - 1]).toBeGreaterThan(0.01);
    }
  });

  it("battery category off sweeps only batteryKWh=0", () => {
    const grid = generateSweepGrid({ categories: { solar: true, battery: false, wind: [] } });
    expect(grid.every((p) => p.batteryKWh === 0)).toBe(true);
  });

  it("wind sweeps only the ticked presets, plus always 'no wind' (null)", () => {
    const onePreset = WIND_PRESETS[0].id;
    const grid = generateSweepGrid({ categories: { solar: false, battery: false, wind: [onePreset] } });
    const windValues = [...new Set(grid.map((p) => p.windPresetId))].sort();
    expect(windValues).toEqual([onePreset].sort());
    // null is implicit (paired with solar=0/battery=0, which would only
    // survive alongside a nonzero size elsewhere) -- with solar/battery both
    // off, the only surviving points are the ticked wind preset itself.
    expect(grid.length).toBe(1);
  });

  it("ignores a ticked wind id that matches no real preset", () => {
    const grid = generateSweepGrid({ categories: { solar: false, battery: false, wind: ["not-a-real-turbine"] } });
    expect(grid.length).toBe(0);
  });

  it("with every category off, the grid is empty", () => {
    const grid = generateSweepGrid({ categories: { solar: false, battery: false, wind: [] } });
    expect(grid.length).toBe(0);
  });

  it("every battery size is a real number, in exact ascending order, not a numeral coerced to a string", () => {
    // Regression: a NpvBySolarChart legend/tooltip was observed rendering
    // battery series as 0, 10, 13.5, 15, 20, 25, 30, 5, 9.25 -- lexicographic
    // string order, not ascending numeric order. The root cause turned out to
    // be recharts' own default itemSorter ('value'/'name', a string sort)
    // inside its Legend/DefaultTooltipContent, not this function -- but this
    // still pins generateSweepGrid's own contract (real numbers, correctly
    // ordered) so a future regression here can't reintroduce a data-side
    // version of the same symptom.
    const grid = generateSweepGrid({ categories: { solar: true, battery: true, wind: [] } });
    const batteryValues = [...new Set(grid.map((p) => p.batteryKWh))].sort((a, b) => a - b);

    expect(batteryValues).toEqual([0, 5, 9.25, 10, 13.5, 15, 20, 25, 30]);
    for (const v of batteryValues) expect(typeof v).toBe("number");
  });
});

describe("interpolatedBatteryCostPerKWh", () => {
  it("returns a preset's own $/kWh rate at that preset's exact kWh", () => {
    const sorted = [...BATTERY_PRESETS].sort((a, b) => a.usableKWh - b.usableKWh);
    const smallest = sorted[0];
    expect(interpolatedBatteryCostPerKWh(smallest.usableKWh)).toBeCloseTo(
      smallest.installedCostUSD / smallest.usableKWh,
      6,
    );
  });

  it("interpolates linearly between two neighboring presets", () => {
    const sorted = [...BATTERY_PRESETS].sort((a, b) => a.usableKWh - b.usableKWh);
    const [a, b] = sorted;
    const midKWh = (a.usableKWh + b.usableKWh) / 2;
    const rateA = a.installedCostUSD / a.usableKWh;
    const rateB = b.installedCostUSD / b.usableKWh;
    expect(interpolatedBatteryCostPerKWh(midKWh)).toBeCloseTo((rateA + rateB) / 2, 6);
  });

  it("holds the nearest endpoint's rate flat below the smallest or above the largest preset", () => {
    const sorted = [...BATTERY_PRESETS].sort((a, b) => a.usableKWh - b.usableKWh);
    const smallest = sorted[0];
    const largest = sorted[sorted.length - 1];
    expect(interpolatedBatteryCostPerKWh(0.5)).toBeCloseTo(smallest.installedCostUSD / smallest.usableKWh, 6);
    expect(interpolatedBatteryCostPerKWh(largest.usableKWh + 100)).toBeCloseTo(
      largest.installedCostUSD / largest.usableKWh,
      6,
    );
  });
});

describe("batteryCost / batterySpec", () => {
  it("prices an exact preset match at that preset's own installedCostUSD, not the interpolated rate", () => {
    const preset = BATTERY_PRESETS[0];
    expect(batteryCost(preset.usableKWh)).toBe(preset.installedCostUSD);
  });

  it("is 0, and batterySpec is null, at kWh <= 0", () => {
    expect(batteryCost(0)).toBe(0);
    expect(batterySpec(0)).toBeNull();
  });

  it("batterySpec at an exact preset match carries that preset's own hardware spec", () => {
    const preset = BATTERY_PRESETS[0];
    const spec = batterySpec(preset.usableKWh);
    expect(spec.roundTripEff).toBe(preset.roundTripEff);
    expect(spec.maxChargeKW).toBe(preset.maxChargeKW);
    expect(spec.cycleLife).toBe(preset.cycleLife);
  });

  it("batterySpec at a non-preset size uses LFP defaults, not a preset's own spec", () => {
    const lfp = equipmentPresets.batteryDefaultsByChemistry.LFP;
    // 12 kWh matches no preset in this catalog.
    const spec = batterySpec(12);
    expect(spec.presetId).toBeNull();
    expect(spec.roundTripEff).toBe(lfp.roundTripEff);
    expect(spec.cycleLife).toBe(lfp.cycleLife);
    expect(spec.usableKWh).toBe(12);
  });
});

describe("solarCost / windCost", () => {
  it("solarCost is kW * 1000 * the published $/W default, 0 at kwDC<=0", () => {
    expect(solarCost(5)).toBeCloseTo(5 * 1000 * equipmentPresets.solar.costPerWattInstalled.value, 6);
    expect(solarCost(0)).toBe(0);
  });

  it("windCost is a turbine's rated kW * the published $/kW default, 0 for no preset", () => {
    const preset = WIND_PRESETS[0];
    const ratedKW = preset.curve.reduce((max, p) => Math.max(max, p.kw || 0), 0);
    expect(windCost(preset.id)).toBeCloseTo(ratedKW * equipmentPresets.wind.costPerKWInstalled.value, 6);
    expect(windCost(null)).toBe(0);
    expect(windCost("not-a-real-turbine")).toBe(0);
  });

  it("turbineSpec is null for an unmatched preset id", () => {
    expect(turbineSpec(null)).toBeNull();
    expect(turbineSpec("not-a-real-turbine")).toBeNull();
  });
});

describe("pricingAssumptions overrides (adjustable explorer pricing)", () => {
  it("solarCost/windCost/solarArraySpec reproduce today's defaults exactly when pricingAssumptions is absent or {}", () => {
    // The backward-compatibility proof this batch's task explicitly calls
    // for: every existing call site (and every test above this describe
    // block) never passes a second argument at all, so the two forms below
    // must be indistinguishable.
    expect(solarCost(5, undefined)).toBe(solarCost(5));
    expect(solarCost(5, {})).toBe(solarCost(5));
    expect(windCost(WIND_PRESETS[0].id, {})).toBe(windCost(WIND_PRESETS[0].id));
    expect(batteryCost(BATTERY_PRESETS[0].usableKWh, {})).toBe(batteryCost(BATTERY_PRESETS[0].usableKWh));
    expect(solarArraySpec(5, {})).toEqual(solarArraySpec(5));
  });

  it("solarCost uses solarCostPerWatt instead of the published default when given", () => {
    expect(solarCost(5, { solarCostPerWatt: 2 })).toBeCloseTo(5 * 1000 * 2, 6);
  });

  it("windCost uses windCostPerKW instead of the published default when given", () => {
    const preset = WIND_PRESETS[0];
    const ratedKW = preset.curve.reduce((max, p) => Math.max(max, p.kw || 0), 0);
    expect(windCost(preset.id, { windCostPerKW: 5000 })).toBeCloseTo(ratedKW * 5000, 6);
  });

  it("solarArraySpec uses solarTiltDeg/solarAzimuthDeg instead of the 20/180 defaults when given", () => {
    const spec = solarArraySpec(5, { solarTiltDeg: 35, solarAzimuthDeg: 200 });
    expect(spec.tilt).toBe(35);
    expect(spec.azimuth).toBe(200);
    // Everything else about the spec is untouched by this override.
    expect(spec.inverterEff).toBe(equipmentPresets.solar.inverterEffDefault);
  });

  it("batteryCostPerKWh switches EVERY point (including an exact preset match) to flat $/kWh * size, not just non-preset sizes", () => {
    const preset = BATTERY_PRESETS[0];
    // Without the override, an exact preset match prices at that preset's
    // own installedCostUSD, not a per-kWh rate -- confirming this test's
    // override actually changes behavior, not just restating the default.
    expect(batteryCost(preset.usableKWh)).toBe(preset.installedCostUSD);

    const flatRate = 500;
    expect(batteryCost(preset.usableKWh, { batteryCostPerKWh: flatRate })).toBeCloseTo(preset.usableKWh * flatRate, 6);
    expect(batteryCost(12, { batteryCostPerKWh: flatRate })).toBeCloseTo(12 * flatRate, 6); // a non-preset size too
  });

  it("a batteryCostPerKWh of 0 is a real override (prices every battery at $0), not treated as absent", () => {
    const preset = BATTERY_PRESETS[0];
    expect(batteryCost(preset.usableKWh, { batteryCostPerKWh: 0 })).toBe(0);
  });
});

describe("runSweep", () => {
  // A small, hand-built grid rather than the full generateSweepGrid() output:
  // runSweep executes the full 40-year engine per point, so keeping this
  // grid tiny (a handful of points) is what keeps this test file's own
  // runtime fast -- generateSweepGrid's own shape is covered separately
  // above, with no engine calls involved.
  const grid = [
    { solarKW: 3, batteryKWh: 0, windPresetId: null },
    { solarKW: 10, batteryKWh: 0, windPresetId: null },
    { solarKW: 0, batteryKWh: 10, windPresetId: null },
    { solarKW: 5, batteryKWh: 10, windPresetId: null },
  ];

  function run({ grid: gridOverride, ...overrides } = {}) {
    return runSweep(gridOverride || grid, {
      household: BASE_HOUSEHOLD,
      profile: LODI,
      assumptions: BASE_ASSUMPTIONS,
      discountRatePct: 5,
      interconnectionFee: 843,
      annualUsageKWh: 9000,
      sizeCapped: true,
      ...overrides,
    });
  }

  it("returns one result per grid point, in the shape the sizing explorer reads", () => {
    const results = run();
    expect(results.length).toBe(grid.length);
    for (const r of results) {
      expect(r).toHaveProperty("sizes");
      expect(r).toHaveProperty("upfront");
      expect(r).toHaveProperty("npv");
      expect(r).toHaveProperty("paybackYear");
      expect(r).toHaveProperty("paybackBeyondHorizon");
      expect(r).toHaveProperty("year1Savings");
      expect(r).toHaveProperty("exceedsSizeCap");
      expect(typeof r.upfront).toBe("number");
    }
  });

  it("flags exceedsSizeCap only when production exceeds the given annualUsageKWh and sizeCapped is true", () => {
    const cappedTiny = run({ annualUsageKWh: 1 }); // nearly everything with any solar exceeds 1 kWh/yr
    expect(cappedTiny.some((r) => r.exceedsSizeCap)).toBe(true);

    const uncapped = run({ sizeCapped: false, annualUsageKWh: 1 });
    expect(uncapped.every((r) => !r.exceedsSizeCap)).toBe(true);
  });

  it("a larger solar-only point costs more upfront than a smaller one, all else equal", () => {
    const results = run();
    const point3kW = results.find((r) => r.sizes.solarKW === 3 && r.sizes.batteryKWh === 0);
    const point10kW = results.find((r) => r.sizes.solarKW === 10 && r.sizes.batteryKWh === 0);
    expect(point10kW.upfront).toBeGreaterThan(point3kW.upfront);
  });

  it("adds the interconnection fee only to points with generation (solar or wind), not a battery-only point", () => {
    const results = run({ interconnectionFee: 843 });
    const batteryOnly = results.find((r) => r.sizes.solarKW === 0 && r.sizes.batteryKWh > 0);
    const solarPlusBattery = results.find((r) => r.sizes.solarKW > 0 && r.sizes.batteryKWh === batteryOnly.sizes.batteryKWh);

    const batteryOnlyCost = batteryCost(batteryOnly.sizes.batteryKWh);
    expect(batteryOnly.upfront).toBeCloseTo(batteryOnlyCost, 6); // no fee
    const solarOnlyCost = solarCost(solarPlusBattery.sizes.solarKW);
    expect(solarPlusBattery.upfront).toBeCloseTo(solarOnlyCost + batteryOnlyCost + 843, 6);
  });

  it("calls onProgress with increasing done counts up to total, ending exactly at total", () => {
    // Bigger than one batch (runSweep batches SWEEP_BATCH_SIZE=10 points per
    // simulateComparison call) so more than one onProgress call is actually
    // exercised, not just the single-batch case the 4-point grid above hits.
    const biggerGrid = Array.from({ length: 23 }, (_, i) => ({
      solarKW: (i % 14) + 1,
      batteryKWh: 0,
      windPresetId: null,
    }));
    const seen = [];
    run({ grid: biggerGrid, onProgress: (p) => seen.push({ ...p }) });

    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toEqual({ done: biggerGrid.length, total: biggerGrid.length });
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i].done).toBeGreaterThan(seen[i - 1].done);
    }
  }, 20000);

  it("with no pricingAssumptions, every point reports oAndMPerYear:0 and inverterReplacement:null (today's behavior)", () => {
    const results = run();
    for (const r of results) {
      expect(r.oAndMPerYear).toBe(0);
      expect(r.inverterReplacement).toBeNull();
    }
  });

  it("an absent pricingAssumptions and an explicit {} produce bit-for-bit identical output", () => {
    // The task's own backward-compatibility proof, at the runSweep level
    // (calc/sweep.js's per-function tests above already cover this for the
    // individual pricing functions): every existing caller omits this
    // argument entirely, so the two forms must be indistinguishable all the
    // way through to runSweep's own returned points.
    expect(run()).toEqual(run({ pricingAssumptions: {} }));
  });
});

describe("runSweep: pricingAssumptions overrides pricing, O&M, and inverter replacement per point", () => {
  const solarOnlyGrid = [{ solarKW: 6, batteryKWh: 0, windPresetId: null }];
  const solarPlusBatteryGrid = [{ solarKW: 6, batteryKWh: 10, windPresetId: null }];

  function run(grid, pricingAssumptions) {
    return runSweep(grid, {
      household: BASE_HOUSEHOLD,
      profile: LODI,
      assumptions: BASE_ASSUMPTIONS,
      discountRatePct: 5,
      interconnectionFee: 843,
      annualUsageKWh: 9000,
      sizeCapped: true,
      pricingAssumptions,
    })[0];
  }

  it("solarCostPerWatt/batteryCostPerKWh/windCostPerKW change upfront the same way calling solarCost/batteryCost/windCost directly with the same override would", () => {
    const overrides = { solarCostPerWatt: 2, batteryCostPerKWh: 500 };
    const point = run(solarPlusBatteryGrid, overrides);
    const expectedGross = solarCost(6, overrides) + batteryCost(10, overrides) + 843; // solar present -> interconnection fee applies
    expect(point.upfront).toBeCloseTo(expectedGross, 6);
  });

  it("oAndMPerKWDCPerYear scales with the point's own solar kW-DC and reduces npv relative to no O&M", () => {
    const withoutOm = run(solarOnlyGrid, {});
    const withOm = run(solarOnlyGrid, { oAndMPerKWDCPerYear: 20 });
    expect(withOm.oAndMPerYear).toBeCloseTo(20 * 6, 6); // $20/kW-DC/yr * 6 kW
    expect(withOm.npv).toBeLessThan(withoutOm.npv);
  });

  it("oAndMPerKWDCPerYear is 0 for a battery-only point (0 kW-DC solar), even when the rate is set", () => {
    const point = run([{ solarKW: 0, batteryKWh: 10, windPresetId: null }], { oAndMPerKWDCPerYear: 20 });
    expect(point.oAndMPerYear).toBe(0);
  });

  it("inverterReplacement carries {year, cost} scaled off the point's own solar kW-DC, and is null with no solar", () => {
    const point = run(solarOnlyGrid, { inverterReplacement: { year: 12, costPerWatt: 0.3 } });
    expect(point.inverterReplacement).toEqual({ year: 12, cost: 0.3 * 6 * 1000 });

    const batteryOnly = run([{ solarKW: 0, batteryKWh: 10, windPresetId: null }], {
      inverterReplacement: { year: 12, costPerWatt: 0.3 },
    });
    expect(batteryOnly.inverterReplacement).toBeNull();
  });

  it("solarTiltDeg/solarAzimuthDeg reach the engine run itself (not just cost), changing production and therefore npv relative to the 20/180 default", () => {
    const southDefault = run(solarOnlyGrid, {});
    // A steep, east-facing array produces meaningfully less than a
    // 20-degree, due-south one over a year -- if this override weren't
    // threaded into engineConfigFor's own solarArraySpec call, npv would be
    // identical to the default.
    const eastFacing = run(solarOnlyGrid, { solarTiltDeg: 45, solarAzimuthDeg: 90 });
    expect(eastFacing.npv).not.toBeCloseTo(southDefault.npv, 0);
  });
});

describe("runSweep: incentives applied per point", () => {
  const solarOnlyGrid = [{ solarKW: 6, batteryKWh: 0, windPresetId: null }];
  const batteryOnlyGrid = [{ solarKW: 0, batteryKWh: 10, windPresetId: null }];

  function run(grid, incentives) {
    return runSweep(grid, {
      household: BASE_HOUSEHOLD,
      profile: LODI,
      assumptions: BASE_ASSUMPTIONS,
      discountRatePct: 5,
      interconnectionFee: 843,
      annualUsageKWh: 9000,
      sizeCapped: true,
      incentives,
    })[0];
  }

  it("prices a kW-solar perUnit line against that point's own solarKW, reducing npv relative to no incentive", () => {
    const withoutIncentive = run(solarOnlyGrid, []);
    const withIncentive = run(solarOnlyGrid, [
      { label: "Per-watt utility incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: 150 },
    ]);
    // 150/kW-solar * 6 kW = 900 knocked off the upfront cost financeConfig
    // sees; upfront (gross, pre-incentive) itself is unaffected, but a lower
    // net upfront raises npv by exactly the incentive amount at a given
    // discount rate (it lands undiscounted at index 0).
    expect(withIncentive.upfront).toBe(withoutIncentive.upfront);
    expect(withIncentive.npv - withoutIncentive.npv).toBeCloseTo(900, 6);
  });

  it("prices a kWh-battery perUnit line against that point's own batteryKWh, not against a solar-only point's 0", () => {
    const solarNpvDelta =
      run(solarOnlyGrid, [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300 }])
        .npv - run(solarOnlyGrid, []).npv;
    const batteryNpvDelta =
      run(batteryOnlyGrid, [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300 }])
        .npv - run(batteryOnlyGrid, []).npv;
    // The solar-only point has batteryKWh=0, so the same incentive line
    // contributes nothing there; the battery-only point has batteryKWh=10,
    // so it contributes 300*10=3000.
    expect(solarNpvDelta).toBeCloseTo(0, 6);
    expect(batteryNpvDelta).toBeCloseTo(3000, 6);
  });

  it("resolves a percent+cap line the same regardless of the incentive list's declaration order", () => {
    const list = [
      { label: "Fixed rebate", type: "fixed", amount: 500 },
      { label: "State percent", type: "percent", percent: 20, capAmount: 1000 },
    ];
    const forward = run(solarOnlyGrid, list).npv;
    const reversed = run(solarOnlyGrid, [...list].reverse()).npv;
    expect(reversed).toBeCloseTo(forward, 6);
  });
});

describe("runSweep: sweep-point incentive parity with an identically-built config", () => {
  // Builds the same solar-only point two ways -- through runSweep, and by
  // hand via simulateComparison + financeConfig directly (the same two calls
  // runSweep itself makes) -- confirming both land on the same finance
  // figures given the same sizes and incentives, so runSweep's own incentive
  // wiring is not doing anything the direct engine path wouldn't.
  const point = { solarKW: 6, batteryKWh: 0, windPresetId: null };
  const incentives = [
    { label: "Per-watt utility incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: 150, capAmount: 5000 },
  ];
  const interconnectionFee = 843;
  const discountRatePct = 5;

  it("matches upfront, npv, and paybackYear between the sweep path and a manually-assembled config", () => {
    const [swept] = runSweep([point], {
      household: BASE_HOUSEHOLD,
      profile: LODI,
      assumptions: BASE_ASSUMPTIONS,
      discountRatePct,
      interconnectionFee,
      annualUsageKWh: 9000,
      sizeCapped: true,
      incentives,
    });

    const manualConfig = { configId: "manual", solar: { arrays: [solarArraySpec(point.solarKW)] } };
    const { baseline, results } = simulateComparison({
      configs: [manualConfig],
      household: BASE_HOUSEHOLD,
      profile: LODI,
      assumptions: BASE_ASSUMPTIONS,
    });
    const gross = solarCost(point.solarKW) + interconnectionFee;
    const manualFinance = financeConfig({
      result: results[0],
      baseline,
      costs: {
        gross,
        incentives,
        oAndMPerYear: 0,
        inverterReplacement: null,
        batteryReplacement: null,
        sizes: { kwSolar: point.solarKW, kwhBattery: 0, kwBattery: 0 },
      },
      financing: { type: "cash" },
      econ: { discountRatePct },
    });

    expect(swept.upfront).toBeCloseTo(gross, 6);
    expect(swept.npv).toBeCloseTo(manualFinance.npv, 6);
    expect(swept.paybackYear).toBe(manualFinance.paybackYear);
  });
});

describe("bestByNpv / bestByPayback", () => {
  const points = [
    { sizes: { solarKW: 1, batteryKWh: 0, windPresetId: null }, npv: 100, paybackYear: 8, exceedsSizeCap: false },
    { sizes: { solarKW: 5, batteryKWh: 0, windPresetId: null }, npv: 500, paybackYear: 5, exceedsSizeCap: false },
    { sizes: { solarKW: 14, batteryKWh: 0, windPresetId: null }, npv: 900, paybackYear: 20, exceedsSizeCap: true },
    { sizes: { solarKW: 3, batteryKWh: 5, windPresetId: null }, npv: 200, paybackYear: null, exceedsSizeCap: false },
  ];

  it("picks the highest-NPV point, ignoring one that exceeds the size cap even though it scores higher", () => {
    expect(bestByNpv(points)).toBe(points[1]);
  });

  it("picks the lowest-paybackYear point, ignoring capped points and null (never pays back) points", () => {
    expect(bestByPayback(points)).toBe(points[1]);
  });

  it("returns null when every point is capped or the list is empty", () => {
    expect(bestByNpv([])).toBeNull();
    expect(bestByNpv([{ ...points[2] }])).toBeNull();
    expect(bestByPayback([{ ...points[0], exceedsSizeCap: true }])).toBeNull();
  });
});
