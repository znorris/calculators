// @vitest-environment jsdom
//
// Coverage for CustomProfileBuilder's minimum-bill, system-size-charges,
// export-rate-kind, lockYears, and true-up fields, plus the EV rider
// checkbox's Lodi-only visibility -- see App.jsx-adjacent
// components/HouseholdSection.jsx for the form itself.
//
// Mounted with react-dom/client (not renderToStaticMarkup) via a small
// stateful wrapper that re-renders HouseholdSection with whatever
// onChange(household) hands back, so a <select> change genuinely round-trips
// through the real component the way App.jsx's own state update does -- see
// components/__tests__/ExplorerSection.test.jsx's header for the same jsdom
// opt-in this file uses.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { HouseholdSection } from "../HouseholdSection.jsx";
import { defaultState } from "../../model/schema.js";

let container;
let root;
let latestHousehold;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function customHousehold(patch = {}) {
  const state = defaultState();
  return { ...state.household, profileId: "custom", ...patch };
}

/** Mounts a stateful wrapper so a <select>/<input> change genuinely round-trips through HouseholdSection's own onChange, mirroring how App.jsx wires it. */
function mount(initialHousehold) {
  function Wrapper() {
    const [household, setHousehold] = useState(initialHousehold);
    latestHousehold = household;
    return (
      <HouseholdSection
        household={household}
        onChange={(next) => {
          setHousehold(next);
          latestHousehold = next;
        }}
      />
    );
  }
  act(() => {
    root.render(<Wrapper />);
  });
}

function findByLabelText(text) {
  const labels = [...container.querySelectorAll("label")];
  const label = labels.find((l) => l.textContent.includes(text));
  return label;
}

function selectNear(labelText) {
  const label = findByLabelText(labelText);
  return label?.parentElement?.querySelector("select") || label?.nextElementSibling;
}

function setSelectValue(select, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Field.jsx (unlike this file's hand-rolled export-rate-type/true-up
 * selects) wraps its <label> in its own flex div alongside an optional help
 * icon, with the control as a sibling of THAT wrapper div rather than of
 * the label itself, so neither of selectNear's two lookup strategies finds
 * it. Field.jsx's <label htmlFor> and its control's matching id are the
 * one reliable link between the two, so resolve through that instead.
 * Exact-text match (not findByLabelText's substring match): "Pricing"
 * (AdderFields' mode select) is otherwise also a substring of the unrelated
 * "Pricing structure" label earlier in this form.
 */
function controlForFieldLabel(labelText) {
  const labels = [...container.querySelectorAll("label")];
  const label = labels.find((l) => l.textContent.trim() === labelText);
  const id = label?.getAttribute("for");
  return id ? document.getElementById(id) : null;
}

function moneyInputNear(labelText) {
  const label = findByLabelText(labelText);
  return label?.parentElement?.parentElement?.querySelector("input[type=text]");
}

describe("HouseholdSection: EV rider checkbox visibility", () => {
  it("renders the Schedule EV checkbox for the Lodi profile with EV enabled", () => {
    const household = { ...defaultState().household, ev: { ...defaultState().household.ev, enabled: true } };
    mount(household);
    expect(container.textContent).toMatch(/Separately metered on Schedule/);
  });

  it("does not render the Schedule EV checkbox for a custom profile, even with EV enabled", () => {
    const household = customHousehold({ ev: { ...defaultState().household.ev, enabled: true } });
    mount(household);
    expect(container.textContent).not.toMatch(/Separately metered on Schedule/);
  });
});

describe("HouseholdSection: CustomProfileBuilder minimum bill and system-size charges", () => {
  it("renders a minimum-bill field and round-trips a typed value into customProfileInputs.minimumBillPerMonth", () => {
    mount(customHousehold());
    const input = moneyInputNear("Minimum bill / month");
    expect(input).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "35");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latestHousehold.customProfileInputs.minimumBillPerMonth).toBe(35);
  });

  it("adds a system-size charge item with the default basis and rate", () => {
    mount(customHousehold());
    const addButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Add");
    // The system-size-charges ItemList's own "Add" button; there may be
    // others (adders, riders) above it in the form, so find the one whose
    // preceding label names system-size charges.
    const label = findByLabelText("System-size charges");
    const addButton = label.parentElement.querySelector("button");
    act(() => addButton.click());
    expect(latestHousehold.customProfileInputs.systemSizeCharges).toHaveLength(1);
    expect(latestHousehold.customProfileInputs.systemSizeCharges[0]).toMatchObject({ basis: "kW-DC-solar", ratePerMonth: 0 });
    expect(addButtons.length).toBeGreaterThan(0); // sanity: this form does have multiple "Add" buttons, confirming the label-scoped lookup above was necessary
  });
});

describe("HouseholdSection: adders editor (fixed vs monthlyTable mode)", () => {
  it("adds a fixed adder by default, then switching its mode to monthlyTable renders 12 month inputs and drops valuePerKWh", () => {
    mount(customHousehold());
    const label = findByLabelText("Adders");
    const addButton = label.parentElement.querySelector("button");
    act(() => addButton.click());
    expect(latestHousehold.customProfileInputs.adders).toHaveLength(1);
    expect(latestHousehold.customProfileInputs.adders[0]).toMatchObject({ mode: "fixed", valuePerKWh: 0 });

    const select = controlForFieldLabel("Pricing");
    setSelectValue(select, "monthlyTable");
    expect(latestHousehold.customProfileInputs.adders[0].mode).toBe("monthlyTable");
    expect(latestHousehold.customProfileInputs.adders[0].monthlyValues).toEqual(new Array(12).fill(0));
    expect(latestHousehold.customProfileInputs.adders[0].valuePerKWh).toBeUndefined();
    expect(container.textContent).toContain("Jan");
  });

  // Regression: switching back to fixed used to leave monthlyValues in place
  // alongside the newly-restored valuePerKWh, the same contradictory shape
  // normalizeState's sanitizeAdders now prevents from persisting via a share
  // link or localStorage. Fails before this fix (monthlyValues still
  // present), passes after (dropped the moment the mode select switches).
  it("switching a monthlyTable adder back to fixed drops monthlyValues", () => {
    mount(customHousehold());
    const label = findByLabelText("Adders");
    const addButton = label.parentElement.querySelector("button");
    act(() => addButton.click());
    const select = controlForFieldLabel("Pricing");
    setSelectValue(select, "monthlyTable");
    setSelectValue(select, "fixed");
    expect(latestHousehold.customProfileInputs.adders[0].mode).toBe("fixed");
    expect(latestHousehold.customProfileInputs.adders[0].monthlyValues).toBeUndefined();
  });
});

describe("HouseholdSection: export-rate kind picker", () => {
  it("avoidedCostCredit's kind select offers flat and monthlyTable but not retail or percentOfRetail", () => {
    mount(customHousehold());
    const select = selectNear("Export rate type");
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toEqual(["flat", "monthlyTable"]);
  });

  it("switching to monthlyTable renders 12 month inputs and round-trips edits", () => {
    mount(customHousehold());
    const select = selectNear("Export rate type");
    setSelectValue(select, "monthlyTable");
    expect(latestHousehold.customProfileInputs.exportPolicy.ratePerKWh).toEqual({
      kind: "monthlyTable",
      monthlyValues: new Array(12).fill(0),
    });
    expect(container.textContent).toContain("Jan");
    expect(container.textContent).toContain("Dec");
  });

  it("netMetering with hourly netting offers all four kinds, including percentOfRetail", () => {
    const household = customHousehold({
      customProfileInputs: {
        ...defaultState().household.customProfileInputs,
        exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" },
      },
    });
    mount(household);
    const select = selectNear("Export rate type");
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toEqual(["retail", "flat", "monthlyTable", "percentOfRetail"]);
  });

  it("netMetering with annual netting omits percentOfRetail from the kind select", () => {
    const household = customHousehold({
      customProfileInputs: {
        ...defaultState().household.customProfileInputs,
        exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" },
      },
    });
    mount(household);
    const select = selectNear("Export rate type");
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toEqual(["retail", "flat", "monthlyTable"]);
  });
});

describe("HouseholdSection: true-up (netMetering annual only)", () => {
  function annualNetMeteringHousehold(extra = {}) {
    return customHousehold({
      customProfileInputs: {
        ...defaultState().household.customProfileInputs,
        exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail", ...extra },
      },
    });
  }

  it("renders only under annual netting, not hourly", () => {
    mount(annualNetMeteringHousehold());
    expect(container.textContent).toContain("Year-end true-up");

    root.unmount();
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mount(
      customHousehold({
        customProfileInputs: {
          ...defaultState().household.customProfileInputs,
          exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail" },
        },
      }),
    );
    expect(container.textContent).not.toContain("Year-end true-up");
  });

  it("selecting 'Forfeit leftover credit' sets trueUp to the string 'forfeit'", () => {
    mount(annualNetMeteringHousehold());
    const select = selectNear("Year-end true-up");
    setSelectValue(select, "forfeit");
    expect(latestHousehold.customProfileInputs.exportPolicy.trueUp).toBe("forfeit");
  });

  it("selecting 'Cash out at a rate' sets trueUp to {rate:0} and reveals a rate field", () => {
    mount(annualNetMeteringHousehold());
    const select = selectNear("Year-end true-up");
    setSelectValue(select, "cashOut");
    expect(latestHousehold.customProfileInputs.exportPolicy.trueUp).toEqual({ rate: 0 });
    expect(findByLabelText("Cash-out rate")).toBeTruthy();
  });

  it("selecting 'Default' after cashOut drops the trueUp key back to undefined (the pre-existing implicit rule)", () => {
    mount(annualNetMeteringHousehold({ trueUp: { rate: 0.05 } }));
    const select = selectNear("Year-end true-up");
    setSelectValue(select, "default");
    expect(latestHousehold.customProfileInputs.exportPolicy.trueUp).toBeUndefined();
  });
});

describe("HouseholdSection: export-rate vintage lock (lockYears)", () => {
  it("renders blank by default and round-trips a typed integer", () => {
    mount(customHousehold());
    const input = moneyInputNear("Rate lock (years)");
    expect(input.value).toBe("");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latestHousehold.customProfileInputs.exportPolicy.lockYears).toBe(5);
  });
});
