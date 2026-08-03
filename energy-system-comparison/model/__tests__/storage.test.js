import { describe, it, expect, beforeEach } from "vitest";
import {
  loadState,
  saveState,
  clearState,
  loadScenarios,
  saveScenarios,
  loadExplorerResult,
  saveExplorerResult,
  clearExplorerResult,
  STATE_KEY,
  SCENARIOS_KEY,
  EXPLORER_KEY,
} from "../storage.js";
import { defaultState } from "../schema.js";

/** Minimal localStorage, since these tests run in node. */
function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

beforeEach(() => {
  installStorage();
});

describe("state persistence", () => {
  it("returns null when nothing is stored", () => {
    expect(loadState()).toBeNull();
  });

  it("round-trips a saved state", () => {
    const state = defaultState();
    state.household.usage.annualKWh = 11000;
    saveState(state);
    expect(loadState().household.usage.annualKWh).toBe(11000);
  });

  it("returns null rather than throwing on corrupt data", () => {
    localStorage.setItem(STATE_KEY, "{not json");
    expect(loadState()).toBeNull();
  });

  it("clears the saved state", () => {
    saveState(defaultState());
    clearState();
    expect(loadState()).toBeNull();
  });

  it("swallows a quota error on save and reports failure rather than throwing", () => {
    globalThis.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveState(defaultState())).not.toThrow();
    expect(saveState(defaultState())).toBe(false);
  });

  it("treats storage being disabled (getItem throws) as nothing stored", () => {
    globalThis.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => loadState()).not.toThrow();
    expect(loadState()).toBeNull();
  });
});

describe("scenario persistence", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadScenarios()).toEqual([]);
  });

  it("round-trips scenarios saved under the shared shape", () => {
    const scenario = { id: "s1", name: "Baseline", inputs: defaultState(), createdAt: 1, updatedAt: 1 };
    saveScenarios([scenario]);
    const [loaded] = loadScenarios();
    expect(loaded.name).toBe("Baseline");
    expect(loaded.inputs.household.usage.annualKWh).toBe(9000);
  });

  it("normalizes each scenario's inputs for forward compat", () => {
    const scenario = { id: "s1", name: "Old save", inputs: { household: { schedule: "G2" } } };
    saveScenarios([scenario]);
    const [loaded] = loadScenarios();
    expect(loaded.inputs.household.schedule).toBe("G2");
    expect(loaded.inputs.assumptions.horizonYears).toBe(25);
  });

  it("keeps state and scenarios under separate, namespaced keys", () => {
    expect(STATE_KEY).toBe("energy-comparison:state");
    expect(SCENARIOS_KEY).toBe("energy-comparison:scenarios");
    saveState(defaultState());
    saveScenarios([{ id: "s1", name: "X", inputs: defaultState() }]);
    expect(localStorage.getItem(STATE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SCENARIOS_KEY)).not.toBeNull();
  });
});

describe("explorer result persistence", () => {
  const SAMPLE_POINT = {
    sizes: { solarKW: 5, batteryKWh: 0, windPresetId: null },
    upfront: 10000,
    npv: 2000,
    paybackYear: 8,
    paybackBeyondHorizon: false,
    year1Savings: 500,
    exceedsSizeCap: false,
  };

  it("returns null when nothing is stored", () => {
    expect(loadExplorerResult()).toBeNull();
  });

  it("round-trips a saved record's inputsHash, points, and picks", () => {
    const record = {
      inputsHash: "abc12345",
      completedAt: 1700000000000,
      points: [SAMPLE_POINT],
      picks: { bestNpv: SAMPLE_POINT, bestPayback: SAMPLE_POINT },
    };
    saveExplorerResult(record);
    const loaded = loadExplorerResult();
    expect(loaded.inputsHash).toBe("abc12345");
    expect(loaded.points).toEqual([SAMPLE_POINT]);
    expect(loaded.picks.bestNpv).toEqual(SAMPLE_POINT);
  });

  it("drops the full point list down to its top 5 by NPV once serialization exceeds the size cap, keeping picks", () => {
    // Regression: without this cap, a full sizing sweep's point list (which
    // can run to several hundred points) is saved in full on every
    // completed sweep, risking the write failing outright against a
    // browser's per-origin localStorage quota.
    const bigPoints = Array.from({ length: 8000 }, (_, i) => ({
      sizes: { solarKW: i % 15, batteryKWh: 0, windPresetId: null },
      upfront: 10000 + i,
      npv: i,
      paybackYear: 8,
      paybackBeyondHorizon: false,
      year1Savings: 500,
      exceedsSizeCap: false,
    }));
    const picks = { bestNpv: bigPoints[bigPoints.length - 1], bestPayback: bigPoints[0] };
    saveExplorerResult({ inputsHash: "big12345", completedAt: 1, points: bigPoints, picks });

    const loaded = loadExplorerResult();
    expect(loaded.inputsHash).toBe("big12345");
    expect(loaded.picks).toEqual(picks);
    expect(loaded.points.length).toBe(5);
    // Top 5 by NPV: the highest-npv points, descending.
    expect(loaded.points.map((p) => p.npv)).toEqual([7999, 7998, 7997, 7996, 7995]);
  });

  it("swallows a quota error on save and reports failure rather than throwing", () => {
    globalThis.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const record = { inputsHash: "x", completedAt: 1, points: [], picks: null };
    expect(() => saveExplorerResult(record)).not.toThrow();
    expect(saveExplorerResult(record)).toBe(false);
  });

  it("clears the saved explorer result", () => {
    saveExplorerResult({ inputsHash: "x", completedAt: 1, points: [SAMPLE_POINT], picks: null });
    clearExplorerResult();
    expect(loadExplorerResult()).toBeNull();
    expect(localStorage.getItem(EXPLORER_KEY)).toBeNull();
  });

  it("uses its own namespaced key, separate from state and scenarios", () => {
    expect(EXPLORER_KEY).toBe("energy-comparison:explorer");
  });
});
