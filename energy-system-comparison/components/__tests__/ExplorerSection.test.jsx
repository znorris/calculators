// @vitest-environment jsdom
//
// Regression coverage for ExplorerSection.jsx's own cancellation wiring:
// model/__tests__/hash.test.js already covers sweepIsStale() as a pure
// predicate, but the defect this test guards against lived in the
// component's effect/ref wiring around that predicate (an inputs change
// never actually cancelling the in-flight worker or clearing its result),
// not in the predicate itself -- so it needs the real component mounted, not
// just the function it calls.
//
// This repo's other component tests render statically with
// react-dom/server (see smoke.test.jsx's header): fine for markup-shape
// checks, but useEffect never runs under that approach, and the worker
// cancellation this test exercises is entirely effect-driven. This file
// opts into a jsdom environment (a per-file override via the
// "@vitest-environment" doc comment above; every other test file in this
// repo keeps the default node environment) and mounts with
// react-dom/client's createRoot, wrapped in React's act() so effects flush
// synchronously. global.Worker is replaced with a small in-memory mock that
// records postMessage calls and terminate() calls -- no real worker or
// module graph is ever spun up.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ExplorerSection, describeSizesText, npvChartTooltipRows, DEFAULT_PRICING_ASSUMPTIONS } from "../ExplorerSection.jsx";
import { defaultState } from "../../model/schema.js";
import { hashValue } from "../../model/hash.js";
import { saveExplorerResult, EXPLORER_KEY } from "../../model/storage.js";
import equipmentPresets from "../../data/equipment-presets.json";

/** Minimal localStorage, matching model/__tests__/storage.test.js's own pattern. */
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

class MockWorker {
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.onmessage = null;
    this.terminated = false;
    this.posted = [];
    MockWorker.instances.push(this);
  }
  postMessage(msg) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
}
MockWorker.instances = [];

const SAMPLE_POINT = {
  sizes: { solarKW: 5, batteryKWh: 0, windPresetId: null },
  upfront: 10000,
  npv: 2000,
  paybackYear: 8,
  paybackBeyondHorizon: false,
  year1Savings: 500,
  exceedsSizeCap: false,
};

let container;
let root;
let originalWorker;

beforeEach(() => {
  originalWorker = globalThis.Worker;
  globalThis.Worker = MockWorker;
  MockWorker.instances = [];
  installStorage();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.Worker = originalWorker;
});

function findButton(text) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
}

function renderExplorer(household, assumptions, configs, onAddConfig = () => {}) {
  act(() => {
    root.render(
      <ExplorerSection household={household} assumptions={assumptions} existingConfigs={configs} onAddConfig={onAddConfig} />,
    );
  });
}

function findByLabelText(text) {
  const labels = [...container.querySelectorAll("label")];
  return labels.find((l) => l.textContent.includes(text));
}

function moneyInputNear(labelText) {
  const label = findByLabelText(labelText);
  return label?.parentElement?.parentElement?.querySelector("input");
}

function typeIntoMoneyInput(input, text) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ExplorerSection worker cancellation wiring", () => {
  it("terminates the in-flight worker the moment inputs change, and drops a result that arrives late for the old inputs", () => {
    const state = defaultState();

    renderExplorer(state.household, state.assumptions, state.configs);
    act(() => {
      findButton("Explore sizing").click();
    });

    expect(MockWorker.instances).toHaveLength(1);
    const firstWorker = MockWorker.instances[0];
    expect(firstWorker.posted).toHaveLength(1);
    expect(firstWorker.terminated).toBe(false);
    expect(container.textContent).toContain("Exploring");

    // Inputs change while the sweep is still in flight (no response
    // delivered yet) -- before this fix, ExplorerSection's own inputs-changed
    // effect never reached workerRef.current.terminate() for this case.
    const changedHousehold = {
      ...state.household,
      usage: { ...state.household.usage, annualKWh: state.household.usage.annualKWh + 1000 },
    };
    renderExplorer(changedHousehold, state.assumptions, state.configs);

    expect(firstWorker.terminated).toBe(true);
    expect(container.textContent).not.toContain("Exploring");
    expect(findButton("Explore sizing")).toBeTruthy();

    // A result for the now-stale request was already in the event queue at
    // the moment of cancellation and is delivered anyway -- the second guard
    // (liveInputsHashRef, not the closure-captured hash) must still drop it
    // rather than rendering a result for inputs that no longer apply.
    act(() => {
      firstWorker.onmessage({ data: { id: firstWorker.posted[0].id, output: { points: [SAMPLE_POINT] } } });
    });

    expect(container.textContent).not.toContain("Top 5 by NPV");
  });

  it("renders a completed result normally when inputs have not changed", () => {
    const state = defaultState();

    renderExplorer(state.household, state.assumptions, state.configs);
    act(() => {
      findButton("Explore sizing").click();
    });

    const worker = MockWorker.instances[0];
    act(() => {
      worker.onmessage({ data: { id: worker.posted[0].id, output: { points: [SAMPLE_POINT] } } });
    });

    expect(container.textContent).toContain("Top 5 by NPV");
    expect(worker.terminated).toBe(false);
  });
});

describe("ExplorerSection restore-on-mount (model/storage.js's EXPLORER_KEY)", () => {
  it("hash-match: restores a stored result immediately, with no worker ever constructed", () => {
    const state = defaultState();
    // Matches ExplorerSection's own inputsHash shape, which also includes its
    // local incentive-rate inputs (0/0 by default at mount) and its
    // "Pricing assumptions" group (DEFAULT_PRICING_ASSUMPTIONS at mount)
    // alongside household/assumptions -- see that component's own header
    // comment.
    const inputsHash = hashValue({
      household: state.household,
      assumptions: state.assumptions,
      solarIncentivePerKW: 0,
      batteryIncentivePerKWh: 0,
      pricing: DEFAULT_PRICING_ASSUMPTIONS,
    });
    saveExplorerResult({
      inputsHash,
      completedAt: 1,
      points: [SAMPLE_POINT],
      picks: { bestNpv: SAMPLE_POINT, bestPayback: SAMPLE_POINT },
      pricing: DEFAULT_PRICING_ASSUMPTIONS,
    });

    renderExplorer(state.household, state.assumptions, state.configs);

    expect(container.textContent).toContain("Top 5 by NPV");
    expect(container.textContent).not.toContain("Results from a previous visit");
    expect(MockWorker.instances).toHaveLength(0);
  });

  it("hash-mismatch: discards the stored result, shows the mismatch notice, and does not auto-run", () => {
    const state = defaultState();
    saveExplorerResult({
      inputsHash: "not-the-current-hash",
      completedAt: 1,
      points: [SAMPLE_POINT],
      picks: { bestNpv: SAMPLE_POINT, bestPayback: SAMPLE_POINT },
    });

    renderExplorer(state.household, state.assumptions, state.configs);

    expect(container.textContent).not.toContain("Top 5 by NPV");
    expect(container.textContent).toContain("Results from a previous visit no longer match your inputs.");
    expect(MockWorker.instances).toHaveLength(0);
    expect(findButton("Explore sizing")).toBeTruthy();
  });

  it("clear removes the key: a clear leaves nothing to restore on the next mount", () => {
    const state = defaultState();
    const inputsHash = hashValue({ household: state.household, assumptions: state.assumptions });
    saveExplorerResult({ inputsHash, completedAt: 1, points: [SAMPLE_POINT], picks: null });
    localStorage.removeItem(EXPLORER_KEY);

    renderExplorer(state.household, state.assumptions, state.configs);

    expect(container.textContent).not.toContain("Top 5 by NPV");
    expect(container.textContent).not.toContain("Results from a previous visit");
  });
});

describe("describeSizesText: plain-string equivalent of describeSizes, for ChartTip's label", () => {
  it("joins every present dimension with ' + '", () => {
    expect(describeSizesText({ solarKW: 5, batteryKWh: 10, windPresetId: null })).toBe("5 kW solar + 10 kWh battery");
  });

  it("omits a zero-sized dimension", () => {
    expect(describeSizesText({ solarKW: 7, batteryKWh: 0, windPresetId: null })).toBe("7 kW solar");
  });

  it("reads 'No system' when every dimension is zero/absent", () => {
    expect(describeSizesText({ solarKW: 0, batteryKWh: 0, windPresetId: null })).toBe("No system");
  });
});

describe("npvChartTooltipRows: NpvBySolarChart's tooltip rows, ranked by NPV rather than left in series order", () => {
  it("sorts rows by value descending regardless of payload/series order", () => {
    const payload = [
      { dataKey: "b0", name: "0 kWh battery", value: 495, color: "#4f46e5" },
      { dataKey: "b30", name: "30 kWh battery", value: -23053, color: "#047857" },
      { dataKey: "b5", name: "5 kWh battery", value: -3649, color: "#0284c7" },
    ];
    expect(npvChartTooltipRows(payload).map((r) => r.name)).toEqual(["0 kWh battery", "5 kWh battery", "30 kWh battery"]);
  });

  it("formats each value as money and carries the series color through", () => {
    const payload = [{ dataKey: "b0", name: "0 kWh battery", value: 495, color: "#4f46e5" }];
    expect(npvChartTooltipRows(payload)).toEqual([
      { key: "b0", name: "0 kWh battery", value: "$495", color: "#4f46e5", sortValue: 495 },
    ]);
  });

  it("drops a null-value row (a solar/battery combination the sweep didn't cover) instead of rendering it blank", () => {
    const payload = [
      { dataKey: "b0", name: "0 kWh battery", value: 495, color: "#4f46e5" },
      { dataKey: "b5", name: "5 kWh battery", value: null, color: "#0284c7" },
    ];
    expect(npvChartTooltipRows(payload)).toHaveLength(1);
  });
});

describe("ExplorerSection: compact per-unit incentive inputs", () => {
  it("posts an incentives array built from the solar/battery rate fields alongside the sweep message", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);

    typeIntoMoneyInput(moneyInputNear("Solar incentive"), "100");
    typeIntoMoneyInput(moneyInputNear("Battery incentive"), "50");

    act(() => {
      findButton("Explore sizing").click();
    });

    const worker = MockWorker.instances[0];
    expect(worker.posted[0].incentives).toEqual([
      { label: "Solar incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: 100 },
      { label: "Battery incentive", type: "perUnit", unit: "kWh-battery", ratePerUnit: 50 },
    ]);
  });

  it("posts an empty incentives array when both rates are left at their 0 default", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);

    act(() => {
      findButton("Explore sizing").click();
    });

    expect(MockWorker.instances[0].posted[0].incentives).toEqual([]);
  });

  it("carries the same incentives array into a promoted config's costs.incentives on 'Add as configuration'", () => {
    const state = defaultState();
    let addedConfig = null;
    renderExplorer(state.household, state.assumptions, state.configs, (config) => {
      addedConfig = config;
    });

    typeIntoMoneyInput(moneyInputNear("Solar incentive"), "100");

    act(() => {
      findButton("Explore sizing").click();
    });
    const worker = MockWorker.instances[0];
    act(() => {
      worker.onmessage({ data: { id: worker.posted[0].id, output: { points: [SAMPLE_POINT] } } });
    });

    const addButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add as configuration");
    act(() => addButton.click());

    expect(addedConfig.costs.incentives).toEqual([
      { label: "Solar incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: 100 },
    ]);
  });
});

function checkboxNear(text) {
  const label = [...container.querySelectorAll("label")].find((l) => l.textContent.includes(text));
  return label?.querySelector("input[type=checkbox]");
}

function expandPricingGroup() {
  act(() => {
    findButton("Pricing assumptions").click();
  });
}

describe("ExplorerSection: 'Pricing assumptions' group (adjustable explorer pricing)", () => {
  it("is collapsed by default; every field is absent from the DOM until expanded", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);

    expect(moneyInputNear("Solar installed cost")).toBeUndefined();
    const toggle = findButton("Pricing assumptions");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expanding shows every field pre-filled from data/equipment-presets.json's own defaults, not a retyped number", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);
    expandPricingGroup();

    expect(Number(moneyInputNear("Solar installed cost").value)).toBe(equipmentPresets.solar.costPerWattInstalled.value);
    expect(Number(moneyInputNear("Wind installed cost").value)).toBe(equipmentPresets.wind.costPerKWInstalled.value);
    expect(Number(moneyInputNear("Array tilt").value)).toBe(20);
    expect(Number(moneyInputNear("Array azimuth").value)).toBe(180);
    expect(Number(moneyInputNear("O&M").value)).toBe(0);
  });

  it("battery installed cost starts empty (catalog pricing), not a number", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);
    expandPricingGroup();

    const input = moneyInputNear("Battery installed cost");
    expect(input.value).toBe("");
    expect(input.placeholder.length).toBeGreaterThan(0);
  });

  it("inverter replacement year/cost fields are hidden until the toggle is enabled, then show data/equipment-presets.json's own defaults", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);
    expandPricingGroup();

    expect(moneyInputNear("Replacement year")).toBeUndefined();
    expect(checkboxNear("Model a one-time inverter replacement").checked).toBe(false);

    act(() => {
      checkboxNear("Model a one-time inverter replacement").click();
    });

    expect(Number(moneyInputNear("Replacement year").value)).toBe(equipmentPresets.solar.inverterReplacement.defaultYear);
    expect(Number(moneyInputNear("Replacement cost").value)).toBe(
      equipmentPresets.solar.inverterReplacement.costPerWattInstalled.value,
    );
  });

  it("changing a pricing assumption invalidates a cached/completed sweep the same way changing household does", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);
    act(() => {
      findButton("Explore sizing").click();
    });
    const worker = MockWorker.instances[0];
    act(() => {
      worker.onmessage({ data: { id: worker.posted[0].id, output: { points: [SAMPLE_POINT] } } });
    });
    expect(container.textContent).toContain("Top 5 by NPV");

    expandPricingGroup();
    typeIntoMoneyInput(moneyInputNear("Solar installed cost"), "1");

    expect(container.textContent).not.toContain("Top 5 by NPV");
    expect(findButton("Explore sizing")).toBeTruthy();
  });

  it("posts a pricingAssumptions object built from the group alongside the sweep message", () => {
    const state = defaultState();
    renderExplorer(state.household, state.assumptions, state.configs);
    expandPricingGroup();
    typeIntoMoneyInput(moneyInputNear("Solar installed cost"), "2.5");
    typeIntoMoneyInput(moneyInputNear("Battery installed cost"), "500");
    act(() => {
      checkboxNear("Model a one-time inverter replacement").click();
    });

    act(() => {
      findButton("Explore sizing").click();
    });

    expect(MockWorker.instances[0].posted[0].pricingAssumptions).toEqual({
      solarCostPerWatt: 2.5,
      batteryCostPerKWh: 500,
      windCostPerKW: equipmentPresets.wind.costPerKWInstalled.value,
      solarTiltDeg: 20,
      solarAzimuthDeg: 180,
      oAndMPerKWDCPerYear: 0,
      inverterReplacement: {
        year: equipmentPresets.solar.inverterReplacement.defaultYear,
        costPerWatt: equipmentPresets.solar.inverterReplacement.costPerWattInstalled.value,
      },
    });
  });

  it("carries the same pricingAssumptions into a promoted config's costs on 'Add as configuration'", () => {
    const state = defaultState();
    let addedConfig = null;
    renderExplorer(state.household, state.assumptions, state.configs, (config) => {
      addedConfig = config;
    });
    expandPricingGroup();
    typeIntoMoneyInput(moneyInputNear("Solar installed cost"), "2.5");

    act(() => {
      findButton("Explore sizing").click();
    });
    const worker = MockWorker.instances[0];
    act(() => {
      worker.onmessage({ data: { id: worker.posted[0].id, output: { points: [SAMPLE_POINT] } } });
    });

    const addButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add as configuration");
    act(() => addButton.click());

    // SAMPLE_POINT has solarKW:5, so a $2.50/W override prices its solarGross
    // at 5*1000*2.5 -- the same figure calc/sweep.js's own solarCost would
    // compute given the identical override, confirming this reached
    // configFromSweepPoint rather than being dropped before "Add".
    expect(addedConfig.costs.solarGross).toBeCloseTo(5 * 1000 * 2.5, 6);
  });
});
