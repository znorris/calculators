import { describe, it, expect } from "vitest";
import { dominanceCallouts, configSentences, verdictParagraph, crossoverSentences } from "../prose.js";

function financeEntry(id, name, cost, savings) {
  return { id, name, finance: { cashFlows: [-cost], lifetimeSavings: savings } };
}

describe("dominanceCallouts", () => {
  it("says 'costs the same' rather than '$0 more' when two configs tie exactly on cost", () => {
    // Before this fix, the guard was aCost >= bCost, true even at an exact
    // tie, so this asserted "B costs $0 more upfront than A and returns
    // $2,500 less over the horizon."
    const entries = [financeEntry("a", "A", 15000, 7500), financeEntry("b", "B", 15000, 5000)];
    const out = dominanceCallouts({ entries });
    expect(out).toContain("B costs the same upfront as A and returns $2,500 less over the horizon.");
    expect(out.join(" ")).not.toMatch(/\$0 more/);
  });

  it("does not fire when both cost and savings are within the $1 tie threshold", () => {
    const entries = [financeEntry("a", "A", 15000, 5000), financeEntry("b", "B", 15000.5, 5000.5)];
    expect(dominanceCallouts({ entries })).toEqual([]);
  });

  it("still fires the ordinary dominance case with real dollar deltas on both sides", () => {
    const entries = [financeEntry("a", "A", 16000, 4000), financeEntry("b", "B", 15000, 5000)];
    const out = dominanceCallouts({ entries });
    expect(out).toContain("A costs $1,000 more upfront than B and returns $1,000 less over the horizon.");
  });

  it("says 'returns the same' rather than '$0 less' when only cost differs", () => {
    const entries = [financeEntry("a", "A", 16000, 5000), financeEntry("b", "B", 15000, 5000)];
    const out = dominanceCallouts({ entries });
    expect(out).toContain("A costs $1,000 more upfront than B and returns the same over the horizon.");
  });
});

describe("verdictParagraph: payback beyond the horizon is stated, not hidden", () => {
  // Before this fix, financeConfig's cashFlows/cumulative ran only to
  // horizonYears, so a config with a true 13-year payback against a 10-year
  // horizon reported paybackYear null and the verdict said "no payback
  // inside the 10-year horizon" -- exactly the reported bug. It must now name
  // the horizon and state the real payback year plus how far past the
  // horizon it lands.
  it("names the horizon and states how far past it a payback lands", () => {
    const horizonYears = 10;
    const entries = [{ id: "a", name: "A", finance: { npv: -3000, paybackYear: 13, cashFlows: new Array(21).fill(0) } }];
    const text = verdictParagraph({ entries, horizonYears });
    expect(text).toMatch(/Over your 10-year horizon/);
    expect(text).toMatch(/a payback in year 13\.0, 3 years past your 10-year horizon/);
  });

  it("reports the full search window, not just the horizon, when no config ever pays back", () => {
    const horizonYears = 10;
    const entries = [
      { id: "a", name: "A", finance: { npv: -1000, paybackYear: null, cashFlows: new Array(41).fill(0), lifetimeSavings: -1000 } },
      { id: "b", name: "B", finance: { npv: -2000, paybackYear: null, cashFlows: new Array(41).fill(0), lifetimeSavings: -2000 } },
    ];
    const text = verdictParagraph({ entries, horizonYears });
    expect(text).toMatch(/No config pays back within 40 years/);
  });
});

describe("crossoverSentences: overtake detection reaches past the horizon", () => {
  // config-vs-config crossovers are searched over the full analysis window
  // (calc/finance.js's cumulative), not just the horizon, so an overtake
  // landing after the horizon must still be reported, with an explicit note
  // that it falls outside it.
  it("finds an overtake year after the horizon and notes it explicitly", () => {
    const horizonYears = 5;
    const leaderCumulative = [-5000, -4000, -3000, -2000, -1000, 0, 1000, 2000, 3000, 4000, 5000];
    const runnerUpCumulative = [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 1600, 1650, 1680];
    const entries = [
      { id: "a", name: "A", finance: { lifetimeSavings: 5000, cumulative: leaderCumulative } },
      { id: "b", name: "B", finance: { lifetimeSavings: 1680, cumulative: runnerUpCumulative } },
    ];
    const out = crossoverSentences({ entries, horizonYears });
    expect(out.join(" ")).toMatch(
      /A starts behind B on cumulative cash flow but overtakes it in year 6, past your 5-year horizon\./,
    );
  });

  it("omits the beyond-horizon note when the overtake happens inside the horizon", () => {
    const horizonYears = 5;
    const leaderCumulative = [-5000, -3000, -1000, 1000, 3000, 5000];
    const runnerUpCumulative = [-2000, -1000, 0, 800, 1200, 1500];
    const entries = [
      { id: "a", name: "A", finance: { lifetimeSavings: 5000, cumulative: leaderCumulative } },
      { id: "b", name: "B", finance: { lifetimeSavings: 1500, cumulative: runnerUpCumulative } },
    ];
    const out = crossoverSentences({ entries, horizonYears });
    expect(out.join(" ")).toMatch(/overtakes it in year 3\./);
    expect(out.join(" ")).not.toMatch(/past your/);
  });
});

describe("configSentences: battery-only config", () => {
  const baseline = { years: [{ importKWh: 9000, billTotal: 1500 }] };
  const household = { schedule: "EA" };
  const profile = { exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.08 } };

  it("notes that a battery with no generation never changes the bill", () => {
    const entry = {
      name: "B",
      config: { battery: { usableKWh: 10 } }, // no solar/wind key, per toEngineConfig's shape
      result: { years: [{ productionKWh: 0, selfConsumedKWh: 0, exportKWh: 0, importKWh: 9000, cycles: 0 }] },
    };
    const sentences = configSentences({ entry, baseline, household, profile });
    expect(sentences.join(" ")).toMatch(/battery only charges from on-site solar or wind surplus/);
  });

  it("does not add the no-generation note when the config also has solar", () => {
    const entry = {
      name: "B",
      config: { battery: { usableKWh: 10 }, solar: { arrays: [{ kwDC: 5 }] } },
      result: { years: [{ productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, importKWh: 4000, cycles: 200 }] },
    };
    const sentences = configSentences({ entry, baseline, household, profile });
    expect(sentences.join(" ")).not.toMatch(/does not change the bill/);
  });

  it("omits the no-generation note when gridCharge is enabled, since the battery still changes the bill", () => {
    const entry = {
      name: "B",
      config: { battery: { usableKWh: 10, gridCharge: { enabled: true } } },
      result: { years: [{ productionKWh: 0, selfConsumedKWh: 0, exportKWh: 0, importKWh: 9000, cycles: 0, gridChargeKWh: 12 }] },
    };
    const sentences = configSentences({ entry, baseline, household, profile });
    expect(sentences.join(" ")).not.toMatch(/does not change the bill/);
    expect(sentences.join(" ")).toMatch(/draws 12 kWh from the grid/);
  });
});

describe("configSentences: export-value sentence matches the profile's actual export mechanism", () => {
  const baseline = { years: [{ importKWh: 9000, billTotal: 1500 }] }; // blended retail rate: 1500/9000 = $0.1667/kWh
  const household = { schedule: "EA" };

  function entryWithExport(exportKWh) {
    return {
      name: "B",
      config: {},
      result: { years: [{ productionKWh: 8000, selfConsumedKWh: 5000, exportKWh, importKWh: 4000, cycles: 0 }] },
    };
  }

  it("quotes an exact $ figure at the flat net-metering rate when hourly netting has a numeric exportRate", () => {
    const profile = { exportPolicy: { type: "netMetering", netting: "hourly", exportRate: 0.06 } };
    const sentences = configSentences({ entry: entryWithExport(3000), baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/for about \$180 of export credit at the \$0\.0600\/kWh net-metering rate/);
  });

  it("approximates with the blended retail rate, worded 'roughly', when hourly netting credits at 'retail'", () => {
    const profile = { exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" } };
    const sentences = configSentences({ entry: entryWithExport(3000), baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/for roughly \$500 of export credit/);
    expect(sentences).toMatch(/each exporting hour's own retail rate/);
  });

  it("states the netting mechanism with no dollar figure at all under annual (kWh) netting", () => {
    const profile = { exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" } };
    const sentences = configSentences({ entry: entryWithExport(3000), baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/netted directly against import in kWh under annual net metering/);
    expect(sentences).not.toMatch(/of export credit/); // no export-side dollar figure, unlike the other three cases above
  });

  it("still quotes the exact avoided-cost figure, unchanged", () => {
    const profile = { exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.08 } };
    const sentences = configSentences({ entry: entryWithExport(3000), baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/for about \$240 of export credit at the \$0\.0800\/kWh avoided-cost rate/);
  });
});

describe("configSentences: battery with grid charging enabled", () => {
  const baseline = { years: [{ importKWh: 9000, billTotal: 1500 }] };
  const household = { schedule: "EA" };
  const profile = { exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.08 } };

  it("reports gridChargeKWh and the retail-rate/round-trip-efficiency mechanism, without a re-simulated counterfactual", () => {
    const entry = {
      name: "B",
      config: { battery: { usableKWh: 10, gridCharge: { enabled: true } }, solar: { arrays: [{ kwDC: 5 }] } },
      result: {
        years: [
          { productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, importKWh: 4000, cycles: 200, gridChargeKWh: 340 },
        ],
      },
    };
    const sentences = configSentences({ entry, baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/draws 340 kWh from the grid/);
    expect(sentences).toMatch(/retail rate/);
    expect(sentences).toMatch(/round-trip efficiency/);
    // No re-simulated counterfactual bill figure is available from props, so
    // none should appear in the sentence.
    expect(sentences).not.toMatch(/if grid charging (were|was) disabled/);
  });

  it("says nothing about grid charging when it is absent or disabled", () => {
    const entry = {
      name: "B",
      config: { battery: { usableKWh: 10 }, solar: { arrays: [{ kwDC: 5 }] } },
      result: {
        years: [{ productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, importKWh: 4000, cycles: 200 }],
      },
    };
    const sentences = configSentences({ entry, baseline, household, profile }).join(" ");
    expect(sentences).not.toMatch(/draws .* kWh from the grid/);
  });

  it("ties the demand-charge benefit to peak-shave dispatch being enabled, not to Schedule G2 by name", () => {
    // The demand-charge payoff is a property of dispatch mode, not of any one
    // schedule -- a G2 config left on self-consumption gets no such benefit
    // (see model/runEngine.js's gridChargeHasNoPayback), so the sentence must not cite
    // G2 as if grid charging on it were inherently self-justifying.
    const entry = {
      name: "B",
      config: {
        battery: { usableKWh: 10, gridCharge: { enabled: true } },
        solar: { arrays: [{ kwDC: 5 }] },
        dispatch: { mode: "self-consumption", shaveThresholdKW: null },
      },
      result: {
        years: [
          { productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, importKWh: 4000, cycles: 200, gridChargeKWh: 340 },
        ],
      },
    };
    const sentences = configSentences({ entry, baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/peak shaving/);
    expect(sentences).not.toMatch(/Schedule G2/);
    expect(sentences).not.toMatch(/\(as here\)/);
  });

  it("marks the demand-charge sentence '(as here)' when this config's dispatch is actually peak-shave", () => {
    const entry = {
      name: "B",
      config: {
        battery: { usableKWh: 10, gridCharge: { enabled: true } },
        solar: { arrays: [{ kwDC: 5 }] },
        dispatch: { mode: "peak-shave", shaveThresholdKW: 20 },
      },
      result: {
        years: [
          { productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, importKWh: 4000, cycles: 200, gridChargeKWh: 340 },
        ],
      },
    };
    const sentences = configSentences({ entry, baseline, household, profile }).join(" ");
    expect(sentences).toMatch(/\(as here\)/);
  });
});
