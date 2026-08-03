// Coverage for model/sweepEngine.js: the sizing explorer's compose layer,
// sibling to model/runEngine.js. worker/calcWorker.js's {kind:'sweep'}
// branch is the only other caller; see worker/__tests__/calcWorker.test.js
// for the message-passing contract on top of this.

import { describe, it, expect } from "vitest";
import { runSweepEngine } from "../sweepEngine.js";
import { defaultState } from "../schema.js";
import { generateSweepGrid } from "../../calc/sweep.js";
import equipmentPresets from "../../data/equipment-presets.json";

describe("runSweepEngine", () => {
  it("resolves LODI's default household and prices a small grid without error", () => {
    const state = defaultState();
    const grid = [
      { solarKW: 3, batteryKWh: 0, windPresetId: null },
      { solarKW: 0, batteryKWh: 5, windPresetId: null },
    ];

    const output = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });

    expect(output.error).toBeUndefined();
    expect(output.points.length).toBe(2);
    for (const p of output.points) {
      expect(typeof p.upfront).toBe("number");
      expect(typeof p.npv).toBe("number");
    }
  });

  it("sweeps a TOU custom-profile household without error (findings 1+2: descriptor-form TOU periods, not a rejected 'missing applies() predicate')", () => {
    // runSweepEngine shares resolveHousehold with runEngine() (see this
    // file's header), which is what calls buildCustomProfile/validateProfile
    // on household.customProfileInputs -- there is exactly one place a TOU
    // period's window descriptor gets materialized into a real applies()
    // predicate, so a sweep against a TOU custom tariff must succeed the
    // same way a direct engine run does.
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      pricing: {
        type: "tou",
        periods: [
          { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [16, 21], days: "all", excludeHolidays: false } },
          { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [21, 16], days: "all", excludeHolidays: false } },
        ],
      },
    };
    const grid = [{ solarKW: 3, batteryKWh: 0, windPresetId: null }];

    const output = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    expect(output.error).toBeUndefined();
    expect(output.points.length).toBe(1);
  });

  it("surfaces a malformed custom tariff as {error}, same as runEngine()", () => {
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      exportPolicy: { type: "bogus" },
    };
    const grid = [{ solarKW: 3, batteryKWh: 0, windPresetId: null }];

    const output = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    expect(typeof output.error).toBe("string");
    expect(output.points).toBeUndefined();
  });

  it("flags exceedsSizeCap using the same LODI trailing-12mo-usage rule runEngine() uses", () => {
    const state = defaultState();
    state.household.usage = { mode: "annual", annualKWh: 1, monthlyKWh: null, hourlyKWh: null }; // tiny usage, easy to oversize
    const grid = generateSweepGrid({ categories: { solar: true, battery: false, wind: [] } }).slice(0, 3);

    const output = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    expect(output.error).toBeUndefined();
    expect(output.points.some((p) => p.exceedsSizeCap)).toBe(true);
  });

  // Golden: calc/finance.js folds incentives.total straight into cashFlows[0],
  // which npv() treats as undiscounted (rate^0 = 1) -- so a perUnit incentive
  // resolving to exactly $300 (3 kW-DC * $100/kW) must raise NPV by exactly
  // $300 and leave `upfront` (gross + interconnection fee only, calc/sweep.js's
  // own contract) untouched.
  it("forwards incentives to runSweep, resolved per point against that point's own solar size", () => {
    const state = defaultState();
    const grid = [{ solarKW: 3, batteryKWh: 0, windPresetId: null }];

    const without = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    const withIncentive = runSweepEngine({
      household: state.household,
      assumptions: state.assumptions,
      grid,
      incentives: [{ label: "Solar rebate", type: "perUnit", unit: "kW-solar", ratePerUnit: 100 }],
    });

    expect(withIncentive.points[0].npv).toBeCloseTo(without.points[0].npv + 300, 6);
    expect(withIncentive.points[0].upfront).toBeCloseTo(without.points[0].upfront, 6);
  });

  it("forwards pricingAssumptions to runSweep, changing that point's own upfront cost", () => {
    const state = defaultState();
    const grid = [{ solarKW: 3, batteryKWh: 0, windPresetId: null }];

    const without = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    const withOverride = runSweepEngine({
      household: state.household,
      assumptions: state.assumptions,
      grid,
      pricingAssumptions: { solarCostPerWatt: 1 },
    });

    const defaultPerWatt = equipmentPresets.solar.costPerWattInstalled.value;
    expect(withOverride.points[0].upfront).toBeCloseTo(without.points[0].upfront - 3 * 1000 * (defaultPerWatt - 1), 6);
  });

  it("streams onProgress and still returns every point", () => {
    const state = defaultState();
    const grid = [
      { solarKW: 3, batteryKWh: 0, windPresetId: null },
      { solarKW: 6, batteryKWh: 0, windPresetId: null },
    ];
    const seen = [];

    const output = runSweepEngine({
      household: state.household,
      assumptions: state.assumptions,
      grid,
      onProgress: (p) => seen.push({ ...p }),
    });

    expect(output.error).toBeUndefined();
    expect(output.points.length).toBe(2);
    expect(seen.at(-1)).toEqual({ done: 2, total: 2 });
  });
});
