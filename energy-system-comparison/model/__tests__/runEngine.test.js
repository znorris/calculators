// Coverage for runEngine and the pure helpers around it: plain functions over
// the state shape model/schema.js defines, so they're testable directly with
// no component mounted (see components/__tests__/smoke.test.jsx for why most
// component tests here render statically rather than mounting into a real
// DOM). worker/calcWorker.js's {kind:'engine'} branch, driven by App.jsx's
// debounced effect, is what calls runEngine tested here; see
// worker/__tests__/calcWorker.test.js for the message-passing contract on
// top of it.

import { describe, it, expect } from "vitest";
import {
  runEngine,
  resolveHousehold,
  toEngineAssumptions,
  interconnectionFeeFor,
  assembleGrossCost,
  clampHorizonYears,
  trailingAverageEcaValue,
  trailingAverageCustomAdderValue,
  ecaModeChangePatch,
  assumptionsAfterHouseholdChange,
  scheduleLacksTouOrDemand,
  gridChargeHasNoPayback,
  baselinePeakKWFrom,
  createEngineWorker,
  sizesForEngineConfig,
} from "../runEngine.js";
import { defaultState, normalizeState, estimateCosts, batteryFromPreset, BATTERY_PRESETS, newConfig } from "../schema.js";
import equipmentPresets from "../../data/equipment-presets.json";
import { LODI, LODI_ECA_MONTHLY } from "../../calc/tariffs/lodi.js";
import { parseProfileImport } from "../profileCodec.js";
import { buildCustomProfile, validateProfile } from "../../calc/tariffs/custom.js";

describe("interconnectionFeeFor", () => {
  it("uses the single-phase fee for EA, G1 single-phase, and G2", () => {
    expect(interconnectionFeeFor(LODI, "EA")).toBe(LODI.constraints.interconnectionFees.singlePhase);
    expect(interconnectionFeeFor(LODI, "G1")).toBe(LODI.constraints.interconnectionFees.singlePhase);
    expect(interconnectionFeeFor(LODI, "G2")).toBe(LODI.constraints.interconnectionFees.singlePhase);
  });

  it("uses the three-phase fee only for G1-3P", () => {
    expect(interconnectionFeeFor(LODI, "G1-3P")).toBe(LODI.constraints.interconnectionFees.threePhase);
  });
});

describe("assembleGrossCost", () => {
  const estimated = { solarGross: 1000, windGross: 0, batteryGross: 500 };

  it("adds the interconnection fee for a config with solar or wind generation", () => {
    expect(assembleGrossCost({ solar: { arrays: [{ kwDC: 5 }] } }, estimated, 843)).toBe(1000 + 500 + 843);
  });

  it("never adds the fee to a battery-only config (no solar/wind key present)", () => {
    expect(assembleGrossCost({ battery: { usableKWh: 10 } }, estimated, 843)).toBe(1000 + 500);
  });
});

describe("runEngine: interconnection fee folded into gross cost", () => {
  it("adds LEU's single-phase fee to every generating config's year-0 cash outflow", () => {
    // Before this fix, gross was solarGross + windGross + batteryGross only,
    // so this assertion failed by exactly $843 (LODI_FEES.interconnection.singlePhase).
    const state = defaultState();
    const engine = runEngine(state);
    expect(engine.error).toBeUndefined();
    expect(engine.interconnectionFee).toBe(843);

    for (const entry of engine.entries) {
      const config = state.configs.find((c) => c.id === entry.id);
      const estimated = estimateCosts(config, equipmentPresets);
      const grossWithoutFee = (estimated.solarGross || 0) + (estimated.windGross || 0) + (estimated.batteryGross || 0);
      expect(-entry.finance.cashFlows[0]).toBeCloseTo(grossWithoutFee + 843, 6);
    }
  });

  it("adds no fee to a battery-only config with no solar or wind", () => {
    const state = defaultState();
    const batteryOnly = newConfig(state.configs);
    batteryOnly.battery = batteryFromPreset(BATTERY_PRESETS[0].id);
    state.configs = [batteryOnly];

    const engine = runEngine(state);
    expect(engine.error).toBeUndefined();
    const entry = engine.entries[0];
    const estimated = estimateCosts(batteryOnly, equipmentPresets);
    expect(-entry.finance.cashFlows[0]).toBeCloseTo(estimated.batteryGross, 6);
  });
});

describe("scheduleLacksTouOrDemand", () => {
  it("is true for a tiered schedule with no demand charge (EA)", () => {
    expect(scheduleLacksTouOrDemand(LODI, "EA")).toBe(true);
  });

  it("is true for a flat-seasonal schedule with no demand charge (G1)", () => {
    expect(scheduleLacksTouOrDemand(LODI, "G1")).toBe(true);
  });

  it("is false for a schedule carrying a demand charge (G2)", () => {
    expect(scheduleLacksTouOrDemand(LODI, "G2")).toBe(false);
  });

  it("is false for a TOU schedule", () => {
    expect(scheduleLacksTouOrDemand(LODI, "EV")).toBe(false);
  });

  it("is false (not flagged) when the schedule id resolves to nothing", () => {
    expect(scheduleLacksTouOrDemand(LODI, "not-a-real-schedule")).toBe(false);
  });
});

describe("gridChargeHasNoPayback", () => {
  it("is true for a flat/tiered no-demand schedule (EA), any dispatch mode", () => {
    expect(gridChargeHasNoPayback(LODI, "EA", "self-consumption")).toBe(true);
    expect(gridChargeHasNoPayback(LODI, "EA", "peak-shave")).toBe(true);
  });

  it("is false for a TOU schedule regardless of dispatch mode", () => {
    expect(gridChargeHasNoPayback(LODI, "EV", "self-consumption")).toBe(false);
  });

  it("is true for a demand-charge schedule (G2) run in self-consumption mode -- the demand charge has nothing shaving it", () => {
    expect(gridChargeHasNoPayback(LODI, "G2", "self-consumption")).toBe(true);
    expect(gridChargeHasNoPayback(LODI, "G2", undefined)).toBe(true);
  });

  it("is false for a demand-charge schedule (G2) run in peak-shave mode", () => {
    expect(gridChargeHasNoPayback(LODI, "G2", "peak-shave")).toBe(false);
  });

  it("is false (not flagged) when the schedule id resolves to nothing", () => {
    expect(gridChargeHasNoPayback(LODI, "not-a-real-schedule", "self-consumption")).toBe(false);
  });
});

describe("runEngine: gridChargeAdvisoryConfigIds", () => {
  it("flags a config with gridCharge enabled on a flat/tiered no-demand schedule (EA)", () => {
    const state = defaultState();
    state.household.schedule = "EA";
    state.configs[1].battery.gridCharge = { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1 };

    const engine = runEngine(state);
    expect(engine.error).toBeUndefined();
    expect(engine.gridChargeAdvisoryConfigIds.has(state.configs[1].id)).toBe(true);
  });

  it("does not flag a config with gridCharge disabled", () => {
    const state = defaultState();
    state.household.schedule = "EA";

    const engine = runEngine(state);
    expect(engine.gridChargeAdvisoryConfigIds.has(state.configs[1].id)).toBe(false);
  });

  it("flags a config with gridCharge enabled on Schedule G2 (demand charge) when dispatch is self-consumption (the default)", () => {
    // G2's demand charge only gives grid charging something to pay for when
    // the battery is actually shaving against it; self-consumption mode
    // gets no such benefit, so this now flags where it previously did not.
    const state = defaultState();
    state.household.schedule = "G2";
    state.configs[1].battery.gridCharge = { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1 };

    const engine = runEngine(state);
    expect(engine.error).toBeUndefined();
    expect(engine.gridChargeAdvisoryConfigIds.has(state.configs[1].id)).toBe(true);
  });

  it("does not flag a config with gridCharge enabled on Schedule G2 when dispatch is peak-shave", () => {
    const state = defaultState();
    state.household.schedule = "G2";
    state.configs[1].battery.gridCharge = { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1 };
    state.configs[1].battery.dispatch = { mode: "peak-shave", shaveThresholdKW: 20 };

    const engine = runEngine(state);
    expect(engine.error).toBeUndefined();
    expect(engine.gridChargeAdvisoryConfigIds.has(state.configs[1].id)).toBe(false);
  });
});

describe("runEngine: hasDemandCharge and baselinePeakKW", () => {
  it("is true only for a schedule carrying a demand charge (G2)", () => {
    const eaState = defaultState();
    eaState.household.schedule = "EA";
    expect(runEngine(eaState).hasDemandCharge).toBe(false);

    const g2State = defaultState();
    g2State.household.schedule = "G2";
    expect(runEngine(g2State).hasDemandCharge).toBe(true);
  });

  it("reports a positive baselinePeakKW hint matching baselinePeakKWFrom(engine.baseline)", () => {
    const state = defaultState();
    const engine = runEngine(state);
    expect(engine.baselinePeakKW).toBeGreaterThan(0);
    expect(engine.baselinePeakKW).toBeCloseTo(baselinePeakKWFrom(engine.baseline), 6);
  });
});

describe("baselinePeakKWFrom", () => {
  it("is the largest hourly gridImport across the baseline's summer and winter representative days", () => {
    const baseline = {
      representativeDays: {
        summer: { gridImport: [1, 2, 3] },
        winter: { gridImport: [1, 9, 2] },
      },
    };
    expect(baselinePeakKWFrom(baseline)).toBe(9);
  });

  it("is 0 rather than throwing when representativeDays is missing", () => {
    expect(baselinePeakKWFrom({})).toBe(0);
  });
});

describe("runEngine: gridCharge threads through to the engine config", () => {
  it("carries the battery's gridCharge settings into the engine battery object", () => {
    const state = defaultState();
    state.configs[1].battery.gridCharge = { enabled: true, windowStartHour: 21, windowEndHour: 5, targetSocFrac: 0.85 };

    const engine = runEngine(state);
    const entry = engine.entries.find((e) => e.id === state.configs[1].id);
    expect(entry.config.battery.gridCharge).toEqual({
      enabled: true,
      windowStartHour: 21,
      windowEndHour: 5,
      targetSocFrac: 0.85,
    });
  });
});

describe("runEngine: dispatch threads through to the engine config", () => {
  it("defaults to self-consumption with no threshold when the config never sets a dispatch mode", () => {
    const state = defaultState();

    const engine = runEngine(state);
    const entry = engine.entries.find((e) => e.id === state.configs[1].id);
    expect(entry.config.dispatch).toEqual({ mode: "self-consumption", shaveThresholdKW: null });
  });

  it("carries the battery's peak-shave dispatch mode and threshold onto the engine config, not nested under battery", () => {
    // Before this fix, toEngineConfig never set engine.dispatch at all, so
    // simulateConfig's `config.dispatch?.mode || "self-consumption"` fallback
    // always ran and peak-shave was unreachable from the UI.
    const state = defaultState();
    state.configs[1].battery.dispatch = { mode: "peak-shave", shaveThresholdKW: 8 };

    const engine = runEngine(state);
    const entry = engine.entries.find((e) => e.id === state.configs[1].id);
    expect(entry.config.dispatch).toEqual({ mode: "peak-shave", shaveThresholdKW: 8 });
  });
});

describe("resolveHousehold", () => {
  it("resolves LODI's schedule EA to engineScheduleId 'EA' with no error, same as runEngine()'s own first step", () => {
    const state = defaultState();
    const resolved = resolveHousehold(state.household, state.assumptions);
    expect(resolved.error).toBeUndefined();
    expect(resolved.engineScheduleId).toBe("EA");
    expect(resolved.profile).toBe(LODI);
    expect(resolved.engineHousehold.schedule).toBe("EA");
  });

  it("resolves G1 to G1-3P when g1Phase is threePhase", () => {
    const state = defaultState();
    state.household.schedule = "G1";
    state.household.g1Phase = "threePhase";
    const resolved = resolveHousehold(state.household, state.assumptions);
    expect(resolved.engineScheduleId).toBe("G1-3P");
  });

  it("resolves a net-metering custom tariff with no error, now that priceYear implements it", () => {
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" },
    };
    const resolved = resolveHousehold(state.household, state.assumptions);
    expect(resolved.error).toBeUndefined();
    expect(resolved.profile.exportPolicy).toEqual({ type: "netMetering", netting: "hourly", exportRate: "retail" });
    expect(runEngine(state).error).toBeUndefined();
  });

  it("still surfaces an unresolved-error message for a custom tariff whose exportPolicy.type is unknown", () => {
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      exportPolicy: { type: "bogus" },
    };
    const resolved = resolveHousehold(state.household, state.assumptions);
    expect(resolved.error).toContain('exportPolicy.type must be "avoidedCostCredit" or "netMetering"');
  });

  it("points at re-running the import, not the household form, when a TOU import left periods:null", () => {
    // Reachable through the import UI itself (model/profileCodec.js's
    // SCHEMA_FIELDS marks periods nullable): the household section's TOU
    // form has no field to enter periods by hand (see
    // components/HouseholdSection.jsx's CustomProfileBuilder), so the fix is
    // re-running the import, not "the household section below".
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      pricing: { type: "tou", periods: null },
    };
    const resolved = resolveHousehold(state.household, state.assumptions);
    expect(resolved.error).toContain("tou pricing.periods must be a non-empty array");
    expect(resolved.error).toContain("Re-run the import with complete periods to see results.");
    expect(resolved.error).not.toContain("household section below");
  });
});

describe("toEngineAssumptions", () => {
  it("converts percent fields to fractions and passes the rest through", () => {
    const raw = {
      horizonYears: 12,
      retailEscalationPct: 4,
      exportTrendPct: 1.5,
      discountRatePct: 5,
      ecaMode: "fixed",
      ecaFixedValue: 0.05,
      addersOnExports: true,
    };
    expect(toEngineAssumptions(raw)).toEqual({
      horizonYears: 12,
      retailEscalation: 0.04,
      exportTrend: 0.015,
      ecaMode: "fixed",
      addersOnExports: true,
    });
  });
});

describe("custom TOU profile import stays JSON-safe and cloneable end to end (findings 1+2)", () => {
  // household.customProfileInputs must carry a TOU period as a plain
  // {window:{hours,days,excludeHolidays}} descriptor, never an applies()
  // function -- calc/tariffs/custom.js's buildCustomProfile is the one place
  // that materializes the real predicate, fresh, every time the engine runs
  // (see that file's header and model/profileCodec.js's header).
  const TOU_IMPORT_JSON = JSON.stringify({
    formatVersion: 1,
    utilityName: "TOU Test Utility",
    location: "Sacramento, CA",
    sources: [{ section: "pricing", url: "https://example.com/rates" }],
    profile: {
      fixedChargePerMonth: 10,
      // Full 24-hour coverage on every day (on-peak 16:00-21:00, off-peak the
      // complementary 21:00-16:00, both "all" days): a full-year billing run
      // needs every one of the 8760 hours to match exactly one period,
      // unlike model/__tests__/profileCodec.test.js's own VALID_TOU fixture
      // (weekday-only on-peak), which is never billed end to end.
      pricing: {
        type: "tou",
        periods: [
          { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [16, 21], days: "all", excludeHolidays: false } },
          { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [21, 16], days: "all", excludeHolidays: false } },
        ],
      },
      demand: null,
      adders: [],
      riders: [],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
      constraints: { allowedFinancing: ["cash", "loan"], interconnectionFees: { singlePhase: 100, threePhase: 400 } },
    },
    notes: [],
  });

  function touState() {
    const { profile, error } = parseProfileImport(TOU_IMPORT_JSON);
    expect(error).toBeUndefined();
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = profile;
    return state;
  }

  it("(a) bills identically after a JSON.stringify/parse round-trip of the imported profile, versus the directly-built one", () => {
    // Before this fix, an imported TOU profile's periods carried a real
    // applies() function; JSON.stringify/parse drops functions silently, so
    // this round-trip used to produce a profile whose TOU periods matched no
    // hour at all (rateForHour throws "no TOU period ... matches hour").
    const direct = touState();
    const directResult = runEngine(direct);
    expect(directResult.error).toBeUndefined();

    const roundTripped = JSON.parse(JSON.stringify(direct));
    const roundTrippedResult = runEngine(roundTripped);
    expect(roundTrippedResult.error).toBeUndefined();

    expect(roundTrippedResult.baseline.totals).toEqual(directResult.baseline.totals);
    expect(roundTrippedResult.entries.map((e) => e.result.totals)).toEqual(
      directResult.entries.map((e) => e.result.totals),
    );
  });

  it("(b) structuredClone(household) succeeds after a TOU import -- the same clone postMessage performs when App.jsx posts state into worker/calcWorker.js", () => {
    const state = touState();
    expect(() => structuredClone(state.household)).not.toThrow();
  });

  it("(c) reload path: normalizeState(JSON.parse(JSON.stringify(state))) with a TOU custom profile produces zero validation errors", () => {
    // Before this fix, this reload path lost the TOU periods' applies()
    // functions with no way to rebuild them (normalizeCustomProfileInputs is
    // a tolerant merge, not a rebuild), landing the user on "tou period ...
    // is missing an applies() predicate" with a household section that
    // couldn't fix it (imported TOU periods aren't hand-editable).
    const state = touState();
    const reloaded = normalizeState(JSON.parse(JSON.stringify(state)));

    const builtProfile = buildCustomProfile(reloaded.household.customProfileInputs);
    expect(validateProfile(builtProfile)).toEqual([]);
    expect(runEngine(reloaded).error).toBeUndefined();
  });
});

describe("custom profile import with a monthlyTable export rate produces results end to end", () => {
  // Mirrors the TOU end-to-end test above, for the other new ExportRate kind
  // a profile import can carry: a netMetering exportRate whose exportRateKind
  // is "monthlyTable" (model/profileCodec.js's buildExportPolicy converts the
  // wire-format ratePerKWhKind/exportRateKind fields into the canonical
  // {kind:'monthlyTable', monthlyValues} shape calc/tariffs/custom.js's
  // buildCustomProfile, and ultimately calc/billing.js's resolveExportRate,
  // read directly).
  const MONTHLY_EXPORT_IMPORT_JSON = JSON.stringify({
    formatVersion: 1,
    utilityName: "Monthly Export Test Utility",
    location: "Peoria, IL",
    sources: [{ section: "exportPolicy", url: "https://example.com/rates" }],
    profile: {
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.22, winterRate: 0.18 },
      demand: null,
      adders: [],
      riders: [],
      exportPolicy: {
        type: "netMetering",
        netting: "annual",
        exportRateKind: "monthlyTable",
        exportRateMonthlyValues: [0.05, 0.05, 0.06, 0.06, 0.07, 0.08, 0.09, 0.09, 0.08, 0.07, 0.06, 0.05],
      },
      constraints: { allowedFinancing: ["cash", "loan"], interconnectionFees: { singlePhase: 100, threePhase: 400 } },
    },
    notes: [],
  });

  it("parses, resolves, and bills without error, producing a real annualTotal for every year", () => {
    const { profile, error } = parseProfileImport(MONTHLY_EXPORT_IMPORT_JSON);
    expect(error).toBeUndefined();
    expect(profile.exportPolicy.exportRate).toEqual({
      kind: "monthlyTable",
      monthlyValues: [0.05, 0.05, 0.06, 0.06, 0.07, 0.08, 0.09, 0.09, 0.08, 0.07, 0.06, 0.05],
    });

    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = profile;

    const output = runEngine(state);
    expect(output.error).toBeUndefined();
    for (const entry of output.entries) {
      for (const year of entry.result.years) {
        expect(Number.isFinite(year.billTotal)).toBe(true);
      }
    }
  });
});

describe("App.jsx's generic 'Variable adder pricing' control genuinely reprices a custom profile with a monthlyTable adder (finding 3)", () => {
  // A custom profile whose only variable cost is a monthlyTable adder, so
  // any bill difference between ecaMode settings below is attributable
  // entirely to how that adder is priced. calc/tariffs/profile.js's
  // adderCost keys its "fixed override" off adder.mode === "monthlyTable"
  // (not a specific adder id), so this is the same code path LEU's own ECA
  // adder uses, exercised through a custom profile's own adder instead.
  const CUSTOM_ADDER_IMPORT_JSON = JSON.stringify({
    formatVersion: 1,
    utilityName: "Variable Adder Test Utility",
    location: "Peoria, IL",
    sources: [],
    profile: {
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.15, winterRate: 0.15 },
      demand: null,
      adders: [{ id: "supply", label: "Supply adjustment", mode: "monthlyTable", monthlyValues: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.2, 0.2, 0.2, 0.01, 0.01, 0.01] }],
      riders: [],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
      constraints: { allowedFinancing: ["cash", "loan"], interconnectionFees: { singlePhase: 100, threePhase: 400 } },
    },
    notes: [],
  });

  function stateWithEcaMode(ecaMode, ecaFixedValue) {
    const { profile, error } = parseProfileImport(CUSTOM_ADDER_IMPORT_JSON);
    expect(error).toBeUndefined();
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = profile;
    state.assumptions.ecaMode = ecaMode;
    state.assumptions.ecaFixedValue = ecaFixedValue;
    return state;
  }

  it("bills year 0 differently under a fixed override than under trailing-average pricing of the adder's own monthly table", () => {
    const trailingAverage = runEngine(stateWithEcaMode("trailingAverage", null));
    expect(trailingAverage.error).toBeUndefined();

    // 0.5: nowhere near the seasonal average of the adder's own table
    // (mean ~0.06), so a real difference in year-0 billTotal is expected
    // if (and only if) the fixed override actually reaches this adder.
    const fixedOverride = runEngine(stateWithEcaMode("fixed", 0.5));
    expect(fixedOverride.error).toBeUndefined();

    expect(fixedOverride.baseline.years[0].billTotal).not.toBeCloseTo(trailingAverage.baseline.years[0].billTotal, 2);
  });
});

describe("sizesForEngineConfig", () => {
  it("sums solar.arrays[].kwDC and reads battery.usableKWh/maxChargeKW, defaulting every field to 0 with no battery", () => {
    expect(sizesForEngineConfig({ solar: { arrays: [{ kwDC: 3 }, { kwDC: 2 }] } })).toEqual({
      kwSolar: 5,
      kwhBattery: 0,
      kwBattery: 0,
    });
    expect(sizesForEngineConfig({ battery: { usableKWh: 13.5, maxChargeKW: 5 } })).toEqual({
      kwSolar: 0,
      kwhBattery: 13.5,
      kwBattery: 5,
    });
    expect(sizesForEngineConfig({})).toEqual({ kwSolar: 0, kwhBattery: 0, kwBattery: 0 });
  });
});

describe("runEngine: costs.sizes threads a config's own nameplate size into perUnit incentive resolution", () => {
  // Golden: calc/finance.js folds resolveIncentives' one-time total straight
  // into cashFlows[0]; state.configs[0] (model/schema.js's seedConfigs "A")
  // is a bare 5 kW-DC array, so a $200/kW-solar perUnit incentive resolves
  // to exactly 5 * 200 = $1000, shifting cashFlows[0] (and therefore npv, an
  // undiscounted rate^0 = 1 contribution) by exactly that amount relative to
  // the identical config with no incentive.
  it("resolves a perUnit incentive against THIS config's own solar kW, not a shared or missing size", () => {
    const state = defaultState();
    const baseConfig = state.configs[0];

    const without = runEngine({ ...state, configs: [{ ...baseConfig, costs: { ...baseConfig.costs, incentives: [] } }] });
    const withIncentive = runEngine({
      ...state,
      configs: [
        {
          ...baseConfig,
          costs: {
            ...baseConfig.costs,
            incentives: [{ label: "Solar rebate", type: "perUnit", unit: "kW-solar", ratePerUnit: 200 }],
          },
        },
      ],
    });

    expect(without.error).toBeUndefined();
    expect(withIncentive.error).toBeUndefined();
    expect(withIncentive.entries[0].finance.cashFlows[0]).toBeCloseTo(without.entries[0].finance.cashFlows[0] + 1000, 6);
    expect(withIncentive.entries[0].finance.npv).toBeCloseTo(without.entries[0].finance.npv + 1000, 6);
  });

  it("a kWh-battery perUnit incentive resolves against the config's own battery usableKWh, 0 for a solar-only config", () => {
    const state = defaultState();
    // seedConfigs' config B has the cheapest preset battery attached.
    const configB = state.configs[1];
    const batteryKWh = configB.battery.usableKWh;

    const withIncentive = runEngine({
      ...state,
      configs: [
        {
          ...configB,
          costs: {
            ...configB.costs,
            incentives: [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 50 }],
          },
        },
      ],
    });
    const without = runEngine({ ...state, configs: [{ ...configB, costs: { ...configB.costs, incentives: [] } }] });

    expect(withIncentive.entries[0].finance.cashFlows[0]).toBeCloseTo(without.entries[0].finance.cashFlows[0] + 50 * batteryKWh, 6);
  });
});

describe("clampHorizonYears", () => {
  it("clamps to [1, 50]", () => {
    expect(clampHorizonYears(0)).toBe(1);
    expect(clampHorizonYears(-10)).toBe(1);
    expect(clampHorizonYears(500)).toBe(50);
    expect(clampHorizonYears(20)).toBe(20);
  });
});

describe("trailingAverageEcaValue", () => {
  it("is the mean of LODI_ECA_MONTHLY", () => {
    const expected = LODI_ECA_MONTHLY.reduce((sum, v) => sum + v, 0) / LODI_ECA_MONTHLY.length;
    expect(trailingAverageEcaValue()).toBeCloseTo(expected, 10);
  });
});

describe("ecaModeChangePatch", () => {
  it("seeds ecaFixedValue from the trailing average when switching to fixed with no override yet", () => {
    const patch = ecaModeChangePatch({ ecaMode: "trailingAverage", ecaFixedValue: null }, "fixed");
    expect(patch.ecaMode).toBe("fixed");
    expect(patch.ecaFixedValue).toBeCloseTo(trailingAverageEcaValue(), 10);
  });

  it("does not overwrite an ecaFixedValue the user already entered", () => {
    // The patch omits ecaFixedValue entirely rather than echoing it back --
    // App.jsx merges this into the existing assumptions record
    // ({ ...prev, ...patch }), so an omitted key leaves the prior value in
    // place.
    const patch = ecaModeChangePatch({ ecaMode: "trailingAverage", ecaFixedValue: 0.05 }, "fixed");
    expect(patch).toEqual({ ecaMode: "fixed" });
  });

  it("does not touch ecaFixedValue when switching away from fixed", () => {
    const patch = ecaModeChangePatch({ ecaMode: "fixed", ecaFixedValue: 0.05 }, "trailingAverage");
    expect(patch).toEqual({ ecaMode: "trailingAverage" });
  });

  it("seeds from an explicit seedValue instead of LEU's own trailing average, for App.jsx's custom-profile 'Variable adder pricing' control", () => {
    const patch = ecaModeChangePatch({ ecaMode: "trailingAverage", ecaFixedValue: null }, "fixed", 0.033);
    expect(patch).toEqual({ ecaMode: "fixed", ecaFixedValue: 0.033 });
  });
});

describe("assumptionsAfterHouseholdChange", () => {
  const seeded = { ecaMode: "fixed", ecaFixedValue: 0.09, horizonYears: 30 };

  // Regression: App.jsx's updateHousehold used to only reset ecaMode/
  // ecaFixedValue on a profileId change involving specific hardcoded
  // "isLodi" checks that predate the generic custom-profile adder control;
  // this pure function is the current single source of truth for the reset,
  // keyed only on whether profileId actually changed. Fails before this fix
  // existed (a value set against one profile's monthlyTable adder(s) would
  // silently carry over and reprice a different profile's), passes after.
  it("resets ecaMode/ecaFixedValue to their defaults when profileId changes", () => {
    const next = assumptionsAfterHouseholdChange(seeded, "custom", "LEU");
    expect(next.ecaMode).toBe("trailingAverage");
    expect(next.ecaFixedValue).toBeNull();
  });

  it("resets in the other direction too (Lodi -> custom)", () => {
    const next = assumptionsAfterHouseholdChange(seeded, "LEU", "custom");
    expect(next.ecaMode).toBe("trailingAverage");
    expect(next.ecaFixedValue).toBeNull();
  });

  it("leaves every assumption untouched when profileId is unchanged", () => {
    const next = assumptionsAfterHouseholdChange(seeded, "custom", "custom");
    expect(next).toBe(seeded);
  });
});

describe("trailingAverageCustomAdderValue", () => {
  it("is the mean of every monthlyTable adder's own 12 monthly values, combined", () => {
    const adders = [
      { id: "a", label: "A", mode: "monthlyTable", monthlyValues: new Array(12).fill(0.1) },
      { id: "b", label: "B", mode: "monthlyTable", monthlyValues: new Array(12).fill(0.2) },
    ];
    expect(trailingAverageCustomAdderValue(adders)).toBeCloseTo(0.15, 10);
  });

  it("ignores a fixed-mode adder mixed into the same list", () => {
    const adders = [
      { id: "a", label: "A", mode: "monthlyTable", monthlyValues: new Array(12).fill(0.1) },
      { id: "b", label: "B", mode: "fixed", valuePerKWh: 999 },
    ];
    expect(trailingAverageCustomAdderValue(adders)).toBeCloseTo(0.1, 10);
  });

  it("returns 0 for an empty or missing adder list", () => {
    expect(trailingAverageCustomAdderValue([])).toBe(0);
    expect(trailingAverageCustomAdderValue(undefined)).toBe(0);
  });
});

describe("createEngineWorker", () => {
  it("returns the constructed worker and a null error when the factory succeeds", () => {
    const fakeWorker = { terminate() {} };
    const { worker, error } = createEngineWorker(() => fakeWorker);
    expect(worker).toBe(fakeWorker);
    expect(error).toBeNull();
  });

  it("returns a null worker and the thrown message, rather than propagating the throw, when the factory throws", () => {
    // Regression: App.jsx used to call `new Worker(...)` with no surrounding
    // try/catch, so a browser blocking module workers left `engine` null
    // forever -- no request was ever posted, so no response would ever
    // arrive to clear the "Loading saved data..." screen.
    const { worker, error } = createEngineWorker(() => {
      throw new Error("module workers are disabled");
    });
    expect(worker).toBeNull();
    expect(error).toBe("module workers are disabled");
  });

  it("stringifies a thrown non-Error value instead of crashing", () => {
    const { worker, error } = createEngineWorker(() => {
      // eslint-disable-next-line no-throw-literal
      throw "boom";
    });
    expect(worker).toBeNull();
    expect(error).toBe("boom");
  });
});
