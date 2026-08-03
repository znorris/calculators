// @vitest-environment jsdom
//
// Coverage for CostsEditor.jsx's incentive-type select: all five
// calc/incentives.js types (fixed, percent, perUnit, annualProduction,
// annualFixed), each producing the right shape on selection and round-
// tripping edits, plus the perUnit preview total actually pricing against
// this config's own solar/battery size.
//
// Mounted with react-dom/client via a small stateful wrapper (see
// components/__tests__/HouseholdSection.customProfile.test.jsx's header for
// the same pattern and rationale) so a <select> change genuinely round-trips
// through CostsEditor's own onChange.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CostsEditor } from "../CostsEditor.jsx";
import { newConfig, batteryFromPreset, BATTERY_PRESETS } from "../../model/schema.js";

let container;
let root;
let latestCosts;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function configWithSizes() {
  const config = newConfig();
  config.solar = { arrays: [{ kwDC: 6 }] };
  config.battery = batteryFromPreset(BATTERY_PRESETS[0]?.id);
  config.costs = { ...config.costs, solarGross: 18000, batteryGross: 8000 };
  return config;
}

function mount(initialConfig) {
  function Wrapper() {
    const [config, setConfig] = useState(initialConfig);
    latestCosts = config.costs;
    return (
      <CostsEditor
        config={config}
        onChange={(costs) => {
          setConfig((prev) => ({ ...prev, costs }));
          latestCosts = costs;
        }}
      />
    );
  }
  act(() => {
    root.render(<Wrapper />);
  });
}

function addIncentiveRow() {
  const addButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add incentive");
  act(() => addButton.click());
}

function typeSelectForRow(i) {
  return container.querySelectorAll("select")[i];
}

function setSelectValue(select, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("CostsEditor: incentive type select", () => {
  it("defaults a new incentive to type fixed with an amount field", () => {
    mount(configWithSizes());
    addIncentiveRow();
    expect(latestCosts.incentives).toEqual([{ label: "", type: "fixed", amount: 0 }]);
  });

  it("switching to percent produces {percent, capAmount:null}", () => {
    mount(configWithSizes());
    addIncentiveRow();
    setSelectValue(typeSelectForRow(0), "percent");
    expect(latestCosts.incentives[0]).toEqual({ label: "", type: "percent", percent: 0, capAmount: null });
  });

  it("switching to perUnit produces {unit:'kW-solar', ratePerUnit, capAmount:null}", () => {
    mount(configWithSizes());
    addIncentiveRow();
    setSelectValue(typeSelectForRow(0), "perUnit");
    expect(latestCosts.incentives[0]).toEqual({ label: "", type: "perUnit", unit: "kW-solar", ratePerUnit: 0, capAmount: null });
    expect(container.textContent).toContain("$/kW solar");
  });

  it("switching to annualProduction produces {ratePerKWh, years}", () => {
    mount(configWithSizes());
    addIncentiveRow();
    setSelectValue(typeSelectForRow(0), "annualProduction");
    expect(latestCosts.incentives[0]).toEqual({ label: "", type: "annualProduction", ratePerKWh: 0, years: 10 });
  });

  it("switching to annualFixed produces {amount, years}", () => {
    mount(configWithSizes());
    addIncentiveRow();
    setSelectValue(typeSelectForRow(0), "annualFixed");
    expect(latestCosts.incentives[0]).toEqual({ label: "", type: "annualFixed", amount: 0, years: 10 });
  });

  it("preserves the label across a type switch", () => {
    mount(configWithSizes());
    addIncentiveRow();
    const labelLabel = [...container.querySelectorAll("label")].find((l) => l.textContent.trim() === "Label");
    const labelInput = labelLabel.parentElement.parentElement.querySelector("input");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(labelInput, "SGIP rebate");
      labelInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latestCosts.incentives[0].label).toBe("SGIP rebate");
    setSelectValue(typeSelectForRow(0), "perUnit");
    expect(latestCosts.incentives[0].label).toBe("SGIP rebate");
  });

  it("a perUnit incentive's preview total prices against this config's own kwSolar/kwhBattery/kwBattery sizes", () => {
    const config = configWithSizes();
    config.costs = {
      ...config.costs,
      incentives: [{ label: "Per-kW rebate", type: "perUnit", unit: "kW-solar", ratePerUnit: 100, capAmount: null }],
    };
    mount(config);
    // config.solar.arrays sums to 6 kW-DC, so 6 * $100 = $600.
    expect(container.textContent).toContain("$600");
  });

  it("shows a note that recurring income lines are excluded from the upfront resolve total", () => {
    const config = configWithSizes();
    config.costs = {
      ...config.costs,
      incentives: [{ label: "SREC", type: "annualProduction", ratePerKWh: 0.02, years: 10 }],
    };
    mount(config);
    expect(container.textContent).toMatch(/1 recurring income line/);
  });
});
