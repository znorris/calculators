import { describe, it, expect } from "vitest";
import {
  normalizeState,
  defaultState,
  newConfig,
  nextConfigName,
  estimateCosts,
  batteryFromPreset,
  batteryChargeDischargeEff,
  configFromSweepPoint,
  BATTERY_PRESETS,
  HORIZON_YEARS_MIN,
  HORIZON_YEARS_MAX,
} from "../schema.js";
import { HOURS_PER_YEAR } from "../../calc/time.js";
import { runSweep } from "../../calc/sweep.js";
import { runEngine } from "../runEngine.js";

describe("normalizeState", () => {
  it("round-trips a fully-populated state", () => {
    const state = defaultState();
    state.household.usage.annualKWh = 12000;
    state.household.riderIds = ["share"];
    state.assumptions.horizonYears = 20;
    state.configs[1].battery.reserveFrac = 0.2;

    const restored = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(restored.household.usage.annualKWh).toBe(12000);
    expect(restored.household.riderIds).toEqual(["share"]);
    expect(restored.assumptions.horizonYears).toBe(20);
    expect(restored.configs[1].battery.reserveFrac).toBe(0.2);
    expect(restored.configs).toHaveLength(2);
  });

  it("fills every field on an empty object, without throwing", () => {
    const state = normalizeState({});
    expect(state.household.schedule).toBe("EA");
    expect(state.household.usage.mode).toBe("annual");
    expect(state.household.usage.annualKWh).toBe(9000);
    expect(state.assumptions.horizonYears).toBe(25);
    expect(state.assumptions.ecaMode).toBe("trailingAverage");
    expect(state.configs).toEqual([]);
  });

  it("fills every field on null/undefined, without throwing", () => {
    expect(normalizeState(null).configs).toEqual([]);
    expect(normalizeState(undefined).household.schedule).toBe("EA");
  });

  it("does not reseed configs missing from an otherwise-real state", () => {
    // Forward-compat gap: an older save with household/assumptions but no
    // configs key yet should stay empty, not silently gain the two starter
    // configs defaultState() seeds for a brand-new user.
    const state = normalizeState({ household: { schedule: "G2" }, assumptions: { horizonYears: 10 } });
    expect(state.household.schedule).toBe("G2");
    expect(state.configs).toEqual([]);
  });

  it("ignores unknown top-level and nested keys", () => {
    const state = normalizeState({
      household: { schedule: "EA", bogusField: 123 },
      assumptions: {},
      configs: [],
      somethingFromTheFuture: true,
    });
    expect(state.household.bogusField).toBeUndefined();
    expect(state.somethingFromTheFuture).toBeUndefined();
  });

  it("rejects an invalid enum value and falls back to the default", () => {
    const state = normalizeState({ household: { schedule: "not-a-real-schedule" } });
    expect(state.household.schedule).toBe("EA");
  });

  it("drops a mistyped riderIds entry rather than keeping it", () => {
    const state = normalizeState({ household: { riderIds: ["share", 42, null] } });
    expect(state.household.riderIds).toEqual(["share"]);
  });

  it("only accepts monthlyKWh/hourlyKWh arrays of the right length", () => {
    const short = normalizeState({ household: { usage: { monthlyKWh: [1, 2, 3] } } }).household.usage;
    expect(short.monthlyKWh).toBeNull();

    const full = normalizeState({ household: { usage: { monthlyKWh: new Array(12).fill(750) } } }).household.usage;
    expect(full.monthlyKWh).toEqual(new Array(12).fill(750));

    const hourly = normalizeState({
      household: { usage: { hourlyKWh: new Array(HOURS_PER_YEAR).fill(1) } },
    }).household.usage;
    expect(hourly.hourlyKWh).toHaveLength(HOURS_PER_YEAR);
  });

  it("normalizes a battery from its preset id, filling any missing fields", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({ configs: [{ battery: { presetId: preset.id } }] });
    expect(state.configs[0].battery.usableKWh).toBe(preset.usableKWh);
    expect(state.configs[0].battery.cycleLife).toBe(preset.cycleLife);
  });

  it("leaves battery null when the raw config has no battery", () => {
    const state = normalizeState({ configs: [{ id: "c1", name: "A" }] });
    expect(state.configs[0].battery).toBeNull();
  });

  it("drops a legacy dodFrac key from a battery rather than reviving it", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({ configs: [{ battery: { presetId: preset.id, dodFrac: 0.5 } }] });
    expect(state.configs[0].battery.dodFrac).toBeUndefined();
  });

  it("fills a disabled default gridCharge on a legacy battery that predates the field", () => {
    // A pre-grid-charging share link or localStorage save has no gridCharge
    // key at all; it must still load cleanly rather than throw, and land on
    // the same disabled defaults a brand-new battery gets.
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({ configs: [{ battery: { presetId: preset.id } }] });
    expect(state.configs[0].battery.gridCharge).toEqual({
      enabled: false,
      windowStartHour: 22,
      windowEndHour: 6,
      targetSocFrac: 1.0,
    });
  });

  it("normalizes a partially-specified gridCharge, filling only what's missing", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({
      configs: [{ battery: { presetId: preset.id, gridCharge: { enabled: true, windowStartHour: 23 } } }],
    });
    expect(state.configs[0].battery.gridCharge).toEqual({
      enabled: true,
      windowStartHour: 23,
      windowEndHour: 6,
      targetSocFrac: 1.0,
    });
  });

  it("clamps gridCharge's hour fields to [0, 23] and targetSocFrac to [0, 1]", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({
      configs: [
        { battery: { presetId: preset.id, gridCharge: { windowStartHour: 30, windowEndHour: -4, targetSocFrac: 1.5 } } },
      ],
    });
    expect(state.configs[0].battery.gridCharge.windowStartHour).toBe(23);
    expect(state.configs[0].battery.gridCharge.windowEndHour).toBe(0);
    expect(state.configs[0].battery.gridCharge.targetSocFrac).toBe(1);
  });

  it("fills a self-consumption default dispatch on a legacy battery that predates the field", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({ configs: [{ battery: { presetId: preset.id } }] });
    expect(state.configs[0].battery.dispatch).toEqual({ mode: "self-consumption", shaveThresholdKW: null });
  });

  it("normalizes a peak-shave dispatch, keeping its threshold", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({
      configs: [{ battery: { presetId: preset.id, dispatch: { mode: "peak-shave", shaveThresholdKW: 12 } } }],
    });
    expect(state.configs[0].battery.dispatch).toEqual({ mode: "peak-shave", shaveThresholdKW: 12 });
  });

  it("falls back to self-consumption for an unrecognized dispatch mode rather than passing it through", () => {
    const preset = BATTERY_PRESETS[0];
    const state = normalizeState({
      configs: [{ battery: { presetId: preset.id, dispatch: { mode: "not-a-mode" } } }],
    });
    expect(state.configs[0].battery.dispatch.mode).toBe("self-consumption");
  });

  it("clamps horizonYears to [1, 50] rather than passing through 0 or a negative value", () => {
    // calc/simulate.js's per-year loop never runs at horizonYears 0, leaving
    // year0 null and crashing the next module that reads it -- see
    // model/runEngine.js's clampHorizonYears for the UI-side half of this fix.
    expect(normalizeState({ assumptions: { horizonYears: 0 } }).assumptions.horizonYears).toBe(HORIZON_YEARS_MIN);
    expect(normalizeState({ assumptions: { horizonYears: -5 } }).assumptions.horizonYears).toBe(HORIZON_YEARS_MIN);
    expect(normalizeState({ assumptions: { horizonYears: 500 } }).assumptions.horizonYears).toBe(HORIZON_YEARS_MAX);
    expect(normalizeState({ assumptions: { horizonYears: 20 } }).assumptions.horizonYears).toBe(20);
  });

  it("drops a TOU period whose window descriptor is missing, keeping the rest", () => {
    // A hand-edited share link or hand-edited localStorage record is the
    // only route to this shape (an import always writes a valid window; see
    // model/profileCodec.js's parseProfileImport) -- but it must never reach
    // components/HouseholdSection.jsx's PricingSummary, which reads
    // p.window.hours[0] with no guard and would throw, blanking the page.
    const state = normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: {
          id: "custom",
          label: "Test Utility",
          fixedChargePerMonth: 10,
          pricing: {
            type: "tou",
            periods: [
              { id: "peak", rate: { summer: 0.5, winter: 0.4 } }, // no window at all
              { id: "off-peak", rate: { summer: 0.3, winter: 0.2 }, window: { hours: [21, 16], days: "all", excludeHolidays: false } },
            ],
          },
        },
      },
    });
    const { pricing } = state.household.customProfileInputs;
    expect(pricing.type).toBe("tou");
    expect(pricing.periods).toHaveLength(1);
    expect(pricing.periods[0].id).toBe("off-peak");
  });

  it("degrades TOU pricing to the flat-seasonal default when every period lacks a valid window", () => {
    const state = normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: {
          pricing: {
            type: "tou",
            periods: [
              { id: "peak", rate: { summer: 0.5, winter: 0.4 }, window: { hours: [16] } }, // malformed: only one hour
              { id: "off-peak", rate: { summer: 0.3, winter: 0.2 } }, // missing window
            ],
          },
        },
      },
    });
    expect(state.household.customProfileInputs.pricing).toEqual({ type: "flat-seasonal", summerRate: 0, winterRate: 0 });
  });

  it("leaves a TOU pricing block with valid window descriptors untouched", () => {
    const period = { id: "peak", rate: { summer: 0.62, winter: 0.49 }, window: { hours: [16, 21], days: "all", excludeHolidays: false } };
    const state = normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: { pricing: { type: "tou", periods: [period] } },
      },
    });
    expect(state.household.customProfileInputs.pricing.periods).toEqual([period]);
  });

  it("leaves pricing.periods:null alone for validateProfile to report, rather than treating it as zero valid periods", () => {
    // Reachable through the import UI itself (SCHEMA_FIELDS marks periods
    // nullable): this degrades correctly downstream (model/runEngine.js's
    // resolveHousehold surfaces "tou pricing.periods must be a non-empty
    // array"), so this normalizer must not rewrite it to flat-seasonal.
    const state = normalizeState({
      household: { profileId: "custom", customProfileInputs: { pricing: { type: "tou", periods: null } } },
    });
    expect(state.household.customProfileInputs.pricing).toEqual({ type: "tou", periods: null });
  });

  it("downgrades mode to annual when the series that mode requires is missing or the wrong length", () => {
    // calc/load.js throws on a mode/series mismatch (e.g. mode "hourly" with
    // hourlyKWh null); a state that reaches that mismatch must never survive
    // normalizeState, including on a share-link or localStorage round trip.
    const hourlyNoData = normalizeState({ household: { usage: { mode: "hourly", hourlyKWh: [1, 2, 3] } } }).household
      .usage;
    expect(hourlyNoData.mode).toBe("annual");
    expect(hourlyNoData.hourlyKWh).toBeNull();
    expect(hourlyNoData.annualKWh).toBe(9000);

    const monthlyNoData = normalizeState({ household: { usage: { mode: "monthly", monthlyKWh: [1, 2, 3] } } })
      .household.usage;
    expect(monthlyNoData.mode).toBe("annual");
    expect(monthlyNoData.monthlyKWh).toBeNull();

    // A mode with valid matching data is left alone.
    const hourlyWithData = normalizeState({
      household: { usage: { mode: "hourly", hourlyKWh: new Array(HOURS_PER_YEAR).fill(1) } },
    }).household.usage;
    expect(hourlyWithData.mode).toBe("hourly");
  });
});

describe("defaultState", () => {
  it("seeds two configs, A and B, A solar-only and B solar plus a battery", () => {
    const state = defaultState();
    expect(state.configs.map((c) => c.name)).toEqual(["A", "B"]);
    expect(state.configs[0].solar.arrays).toHaveLength(1);
    expect(state.configs[0].solar.arrays[0].kwDC).toBe(5);
    expect(state.configs[0].battery).toBeNull();
    expect(state.configs[1].solar.arrays[0].kwDC).toBe(5);
    expect(state.configs[1].battery).not.toBeNull();
    expect(state.configs[1].battery.presetId).toBe(BATTERY_PRESETS[0].id);
  });

  it("gives the two seeded configs distinct ids", () => {
    const [a, b] = defaultState().configs;
    expect(a.id).not.toBe(b.id);
  });
});

describe("newConfig / nextConfigName", () => {
  it("names the first config A", () => {
    expect(newConfig([]).name).toBe("A");
  });

  it("picks the next unused letter", () => {
    expect(nextConfigName([{ name: "A" }, { name: "B" }])).toBe("C");
  });

  it("fills a gap left by a deleted config rather than always appending", () => {
    expect(nextConfigName([{ name: "A" }, { name: "C" }])).toBe("B");
  });
});

describe("estimateCosts", () => {
  const presets = {
    solar: { costPerWattInstalled: { value: 3 } },
    wind: { costPerKWInstalled: { value: 8000 } },
    batteries: BATTERY_PRESETS,
  };

  it("fills a null solarGross from kwDC and $/W", () => {
    const config = { solar: { arrays: [{ kwDC: 5 }] }, wind: { turbines: [] }, battery: null, costs: { solarGross: null } };
    const costs = estimateCosts(config, presets);
    expect(costs.solarGross).toBe(5 * 1000 * 3);
  });

  it("leaves an explicit 0 alone rather than overwriting it", () => {
    const config = { solar: { arrays: [{ kwDC: 5 }] }, wind: { turbines: [] }, battery: null, costs: { solarGross: 0 } };
    expect(estimateCosts(config, presets).solarGross).toBe(0);
  });

  it("prices a battery matching a preset at that preset's installed cost", () => {
    const preset = BATTERY_PRESETS[0];
    const battery = batteryFromPreset(preset.id);
    const config = { solar: { arrays: [] }, wind: { turbines: [] }, battery, costs: { batteryGross: null } };
    expect(estimateCosts(config, presets).batteryGross).toBe(preset.installedCostUSD);
  });

  it("does not touch a non-null cost field it wasn't asked to fill", () => {
    const config = {
      solar: { arrays: [{ kwDC: 5 }] },
      wind: { turbines: [] },
      battery: null,
      costs: { solarGross: 12345, windGross: null, batteryGross: null },
    };
    expect(estimateCosts(config, presets).solarGross).toBe(12345);
  });
});

describe("batteryFromPreset", () => {
  it("never sets dodFrac -- the field is display-only and reaches no calc/ module", () => {
    const battery = batteryFromPreset(BATTERY_PRESETS[0].id);
    expect(battery.dodFrac).toBeUndefined();
  });

  it("seeds a disabled gridCharge with the standard overnight-window defaults", () => {
    const battery = batteryFromPreset(BATTERY_PRESETS[0].id);
    expect(battery.gridCharge).toEqual({
      enabled: false,
      windowStartHour: 22,
      windowEndHour: 6,
      targetSocFrac: 1.0,
    });
  });

  it("seeds a self-consumption dispatch with no threshold", () => {
    const battery = batteryFromPreset(BATTERY_PRESETS[0].id);
    expect(battery.dispatch).toEqual({ mode: "self-consumption", shaveThresholdKW: null });
  });
});

describe("batteryChargeDischargeEff", () => {
  it("splits round-trip efficiency evenly so the two legs recompose it", () => {
    const { chargeEff, dischargeEff } = batteryChargeDischargeEff(0.81);
    expect(chargeEff).toBeCloseTo(0.9, 10);
    expect(dischargeEff).toBeCloseTo(0.9, 10);
    expect(chargeEff * dischargeEff).toBeCloseTo(0.81, 10);
  });
});

describe("configFromSweepPoint", () => {
  /** Resolves the default household/profile once, with no configs -- interconnectionFee/sizeCapped/baseline don't depend on the config list. */
  function baseEngineInputs() {
    const state = defaultState();
    state.configs = [];
    const engine = runEngine(state);
    return {
      state,
      engine,
      sizeCapped: engine.profile.constraints?.sizeCapMode === "trailing12moUsage",
      annualUsageKWh: engine.baseline.years[0].importKWh,
    };
  }

  it("produces a config normalizeState leaves byte-identical (already schema-valid shape)", () => {
    const { state } = baseEngineInputs();
    const point = { sizes: { solarKW: 5, batteryKWh: 10, windPresetId: null } };
    const config = configFromSweepPoint(point, []);

    const restored = normalizeState({ household: state.household, assumptions: state.assumptions, configs: [config] });
    expect(restored.configs[0]).toEqual(config);
  });

  it("an all-zero point produces a config with no solar/wind/battery and every cost left null", () => {
    const point = { sizes: { solarKW: 0, batteryKWh: 0, windPresetId: null } };
    const config = configFromSweepPoint(point, []);
    expect(config.solar.arrays).toEqual([]);
    expect(config.wind.turbines).toEqual([]);
    expect(config.battery).toBeNull();
    expect(config.costs.solarGross).toBeNull();
    expect(config.costs.windGross).toBeNull();
    expect(config.costs.batteryGross).toBeNull();
  });

  it("carries an incentives array through unchanged onto costs.incentives, default [] when omitted", () => {
    const point = { sizes: { solarKW: 5, batteryKWh: 0, windPresetId: null } };
    expect(configFromSweepPoint(point, []).costs.incentives).toEqual([]);

    const incentives = [{ label: "Solar rebate", type: "perUnit", unit: "kW-solar", ratePerUnit: 100 }];
    expect(configFromSweepPoint(point, [], incentives).costs.incentives).toEqual(incentives);
  });

  it("names the config the next unused letter, same as newConfig()", () => {
    const [configA] = defaultState().configs;
    const point = { sizes: { solarKW: 3, batteryKWh: 0, windPresetId: null } };
    expect(configFromSweepPoint(point, [configA]).name).toBe("B");
  });

  it("promoting a point and running it through runEngine reproduces the sweep point's own upfront/NPV/payback -- same engine, same numbers", () => {
    const { state, engine, sizeCapped, annualUsageKWh } = baseEngineInputs();
    // 10 kWh matches no battery preset in data/equipment-presets.json, so
    // this also exercises calc/sweep.js's interpolated (not exact-preset)
    // battery pricing path.
    const rawPoint = { solarKW: 5, batteryKWh: 10, windPresetId: null };

    const [swept] = runSweep([rawPoint], {
      household: engine.household,
      profile: engine.profile,
      assumptions: {
        horizonYears: state.assumptions.horizonYears,
        retailEscalation: state.assumptions.retailEscalationPct / 100,
        exportTrend: state.assumptions.exportTrendPct / 100,
        ecaMode: state.assumptions.ecaMode,
        addersOnExports: state.assumptions.addersOnExports,
      },
      discountRatePct: state.assumptions.discountRatePct,
      interconnectionFee: engine.interconnectionFee,
      annualUsageKWh,
      sizeCapped,
    });

    const config = configFromSweepPoint(swept, []);
    const promotedEngine = runEngine({ ...state, configs: [config] });

    expect(promotedEngine.error).toBeUndefined();
    const entry = promotedEngine.entries[0];

    expect(-entry.finance.cashFlows[0]).toBeCloseTo(swept.upfront, 6);
    expect(entry.finance.npv).toBeCloseTo(swept.npv, 6);
    expect(entry.finance.paybackYear).toBe(swept.paybackYear);

    const year1Savings = promotedEngine.baseline.years[0].billTotal - entry.result.years[0].billTotal;
    expect(year1Savings).toBeCloseTo(swept.year1Savings, 6);
  });

  // Regression: this is the same parity test above, but with adjustable
  // pricing assumptions actually in effect (a solar cost override, O&M, and
  // an inverter replacement) -- proving configFromSweepPoint's promoted
  // config reproduces the sweep point's numbers exactly even when those
  // fields are non-default, not just in the all-defaults case above.
  it("promoting a point priced with pricingAssumptions (solar cost override, O&M, inverter replacement) reproduces the sweep point's own npv exactly", () => {
    const { state, engine, sizeCapped, annualUsageKWh } = baseEngineInputs();
    const rawPoint = { solarKW: 6, batteryKWh: 0, windPresetId: null };
    const pricingAssumptions = {
      solarCostPerWatt: 2.5,
      oAndMPerKWDCPerYear: 18,
      inverterReplacement: { year: 12, costPerWatt: 0.3 },
    };

    const [swept] = runSweep([rawPoint], {
      household: engine.household,
      profile: engine.profile,
      assumptions: {
        horizonYears: state.assumptions.horizonYears,
        retailEscalation: state.assumptions.retailEscalationPct / 100,
        exportTrend: state.assumptions.exportTrendPct / 100,
        ecaMode: state.assumptions.ecaMode,
        addersOnExports: state.assumptions.addersOnExports,
      },
      discountRatePct: state.assumptions.discountRatePct,
      interconnectionFee: engine.interconnectionFee,
      annualUsageKWh,
      sizeCapped,
      pricingAssumptions,
    });

    expect(swept.oAndMPerYear).toBeCloseTo(18 * 6, 6);
    expect(swept.inverterReplacement).toEqual({ year: 12, cost: 0.3 * 6 * 1000 });

    const config = configFromSweepPoint(swept, [], [], pricingAssumptions);
    expect(config.costs.oAndMPerYear).toBeCloseTo(swept.oAndMPerYear, 6);
    expect(config.costs.inverterReplacementYear).toBe(12);
    expect(config.costs.inverterReplacementCost).toBeCloseTo(swept.inverterReplacement.cost, 6);

    const promotedEngine = runEngine({ ...state, configs: [config] });
    expect(promotedEngine.error).toBeUndefined();
    const entry = promotedEngine.entries[0];

    expect(-entry.finance.cashFlows[0]).toBeCloseTo(swept.upfront, 6);
    expect(entry.finance.npv).toBeCloseTo(swept.npv, 6);
    expect(entry.finance.paybackYear).toBe(swept.paybackYear);
  });
});

describe("normalizeState: incentive line items", () => {
  function incentiveVia(raw) {
    return normalizeState({ configs: [{ costs: { incentives: [raw] } }] }).configs[0].costs.incentives[0];
  }

  it("normalizes a fixed incentive (the pre-existing type)", () => {
    expect(incentiveVia({ label: "Rebate", type: "fixed", amount: 1000 })).toEqual({
      label: "Rebate",
      type: "fixed",
      amount: 1000,
    });
  });

  it("normalizes a percent incentive with a capAmount", () => {
    expect(incentiveVia({ label: "State credit", type: "percent", percent: 30, capAmount: 5000 })).toEqual({
      label: "State credit",
      type: "percent",
      percent: 30,
      capAmount: 5000,
    });
  });

  it("normalizes a percent incentive with no capAmount to capAmount: null", () => {
    expect(incentiveVia({ label: "State credit", type: "percent", percent: 30 }).capAmount).toBeNull();
  });

  it("normalizes a perUnit incentive, defaulting an unrecognized unit to kW-solar", () => {
    expect(incentiveVia({ label: "SGIP", type: "perUnit", unit: "kWh-battery", ratePerUnit: 150, capAmount: 3000 })).toEqual({
      label: "SGIP",
      type: "perUnit",
      unit: "kWh-battery",
      ratePerUnit: 150,
      capAmount: 3000,
    });
    expect(incentiveVia({ label: "Bad unit", type: "perUnit", unit: "not-a-real-unit", ratePerUnit: 10 }).unit).toBe(
      "kW-solar",
    );
  });

  it("normalizes an annualProduction incentive, flooring years at 1", () => {
    expect(incentiveVia({ label: "SREC", type: "annualProduction", ratePerKWh: 0.02, years: 10 })).toEqual({
      label: "SREC",
      type: "annualProduction",
      ratePerKWh: 0.02,
      years: 10,
    });
    expect(incentiveVia({ label: "SREC", type: "annualProduction", ratePerKWh: 0.02, years: -3 }).years).toBe(1);
    expect(incentiveVia({ label: "SREC", type: "annualProduction", ratePerKWh: 0.02 }).years).toBe(1);
  });

  it("normalizes an annualFixed incentive, flooring years at 1", () => {
    expect(incentiveVia({ label: "VPP", type: "annualFixed", amount: 500, years: 5 })).toEqual({
      label: "VPP",
      type: "annualFixed",
      amount: 500,
      years: 5,
    });
    expect(incentiveVia({ label: "VPP", type: "annualFixed", amount: 500, years: 0 }).years).toBe(1);
  });

  it("falls back an unrecognized type to fixed rather than dropping the line entirely", () => {
    expect(incentiveVia({ label: "Mystery", type: "not-a-real-type", amount: 250 })).toEqual({
      label: "Mystery",
      type: "fixed",
      amount: 250,
    });
  });

  it("round-trips every incentive type through normalizeState twice (idempotent)", () => {
    const raw = [
      { label: "Fixed", type: "fixed", amount: 100 },
      { label: "Percent", type: "percent", percent: 10, capAmount: 400 },
      { label: "PerUnit", type: "perUnit", unit: "kW-battery", ratePerUnit: 50, capAmount: null },
      { label: "AnnualProduction", type: "annualProduction", ratePerKWh: 0.03, years: 8 },
      { label: "AnnualFixed", type: "annualFixed", amount: 200, years: 3 },
    ];
    const once = normalizeState({ configs: [{ costs: { incentives: raw } }] }).configs[0].costs.incentives;
    const twice = normalizeState({ configs: [{ costs: { incentives: once } }] }).configs[0].costs.incentives;
    expect(twice).toEqual(once);
  });
});

describe("normalizeState: EV rider visibility (custom profiles cannot carry an inert riderMeter:true)", () => {
  it("forces ev.riderMeter false when profileId is custom, even if raw state carries true", () => {
    const state = normalizeState({
      household: { profileId: "custom", ev: { enabled: true, riderMeter: true } },
    });
    expect(state.household.ev.riderMeter).toBe(false);
    // Every other ev field survives the merge unaffected.
    expect(state.household.ev.enabled).toBe(true);
  });

  it("leaves ev.riderMeter as entered on the Lodi profile", () => {
    const state = normalizeState({
      household: { profileId: "lodi", ev: { enabled: true, riderMeter: true } },
    });
    expect(state.household.ev.riderMeter).toBe(true);
  });

  // Regression: normalizeHousehold used to pass raw.ev straight through
  // normalizeEv with no profileId check at all, so a state saved while on
  // Lodi with the EV rider checked, then switched to a custom profile (or a
  // hand-edited share link/localStorage record naming profileId:"custom"
  // directly), carried riderMeter:true into model/runEngine.js's
  // buildEngineHousehold with no schedule EV to apply it against. Fails
  // before this fix (riderMeter stays true), passes after (forced false).
  it("forces riderMeter false switching from Lodi (rider on) to custom, simulating a saved-state profile switch", () => {
    const lodiState = normalizeState({ household: { profileId: "lodi", ev: { enabled: true, riderMeter: true } } });
    const switched = normalizeState({ ...lodiState, household: { ...lodiState.household, profileId: "custom" } });
    expect(switched.household.ev.riderMeter).toBe(false);
  });
});

describe("normalizeState: custom profile minimumBillPerMonth / systemSizeCharges tolerate legacy states", () => {
  it("defaults minimumBillPerMonth to null and systemSizeCharges to [] on a legacy state with no such fields", () => {
    const state = normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: { fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 } },
      },
    });
    expect(state.household.customProfileInputs.minimumBillPerMonth).toBeNull();
    expect(state.household.customProfileInputs.systemSizeCharges).toEqual([]);
  });

  it("preserves an explicit minimumBillPerMonth and systemSizeCharges", () => {
    const state = normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: {
          fixedChargePerMonth: 10,
          pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
          minimumBillPerMonth: 40,
          systemSizeCharges: [{ basis: "kWh-battery", ratePerMonth: 2 }],
        },
      },
    });
    expect(state.household.customProfileInputs.minimumBillPerMonth).toBe(40);
    expect(state.household.customProfileInputs.systemSizeCharges).toEqual([{ basis: "kWh-battery", ratePerMonth: 2 }]);
  });
});

describe("normalizeState: ExportRate timeTable sanitization (mirrors TOU pricing's own guard)", () => {
  function customStateWithExportRate(exportRate) {
    return normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: {
          fixedChargePerMonth: 10,
          pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
          exportPolicy: { type: "netMetering", netting: "hourly", exportRate },
        },
      },
    }).household.customProfileInputs.exportPolicy;
  }

  it("drops a timeTable period missing a valid window descriptor, keeping the rest", () => {
    const policy = customStateWithExportRate({
      kind: "timeTable",
      periods: [
        { id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20] } },
        { id: "broken", rate: { summer: 0.1, winter: 0.08 } }, // no window at all
      ],
    });
    expect(policy.exportRate.kind).toBe("timeTable");
    expect(policy.exportRate.periods).toHaveLength(1);
    expect(policy.exportRate.periods[0].id).toBe("on-peak");
  });

  // Regression: with no guard, a timeTable ExportRate whose every period
  // lacks a valid window would reach components/HouseholdSection.jsx's
  // read-only period summary (the same render TOU pricing periods use) and
  // throw reading period.window.hours[0]. Fails before this fix (exportRate
  // stays an empty-periods timeTable object), passes after (degrades to a
  // flat $0/kWh number, the same degrade-to-default sanitizeTouPricing does
  // for pricing).
  it("degrades to a flat $0/kWh number when every period is windowless", () => {
    const policy = customStateWithExportRate({
      kind: "timeTable",
      periods: [{ id: "broken", rate: { summer: 0.1, winter: 0.08 } }],
    });
    expect(policy.exportRate).toBe(0);
  });

  it("leaves a non-timeTable ExportRate (a flat number, 'retail', monthlyTable, percentOfRetail) untouched", () => {
    expect(customStateWithExportRate(0.05).exportRate).toBe(0.05);
    expect(customStateWithExportRate("retail").exportRate).toBe("retail");
    const monthly = { kind: "monthlyTable", monthlyValues: new Array(12).fill(0.05) };
    expect(customStateWithExportRate(monthly).exportRate).toEqual(monthly);
    const percentOfRetail = { kind: "percentOfRetail", fraction: 0.5 };
    expect(customStateWithExportRate(percentOfRetail).exportRate).toEqual(percentOfRetail);
  });
});

describe("normalizeState: adder mode sanitization", () => {
  function customStateWithAdders(adders) {
    return normalizeState({
      household: {
        profileId: "custom",
        customProfileInputs: {
          fixedChargePerMonth: 10,
          pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
          adders,
        },
      },
    }).household.customProfileInputs.adders;
  }

  // Regression: HouseholdSection.jsx's mode select used to leave the OLD
  // mode's field on the adder when switching (e.g. valuePerKWh still set
  // after switching to monthlyTable), so both fields could reach
  // calc/tariffs/profile.js's adderCost at once. Fails before this fix
  // (both fields present), passes after (the field belonging to the other
  // mode is dropped).
  it("drops valuePerKWh from a monthlyTable adder", () => {
    const [adder] = customStateWithAdders([
      { id: "a", label: "A", mode: "monthlyTable", monthlyValues: new Array(12).fill(0.05), valuePerKWh: 0.02 },
    ]);
    expect(adder.mode).toBe("monthlyTable");
    expect(adder.monthlyValues).toEqual(new Array(12).fill(0.05));
    expect(adder).not.toHaveProperty("valuePerKWh");
  });

  it("drops monthlyValues from a fixed adder", () => {
    const [adder] = customStateWithAdders([
      { id: "a", label: "A", mode: "fixed", valuePerKWh: 0.02, monthlyValues: new Array(12).fill(0.05) },
    ]);
    expect(adder.mode).toBe("fixed");
    expect(adder.valuePerKWh).toBe(0.02);
    expect(adder).not.toHaveProperty("monthlyValues");
  });
});
