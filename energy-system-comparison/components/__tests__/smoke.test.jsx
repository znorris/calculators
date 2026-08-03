// Render-smoke coverage for the input components: every component renders
// without throwing against a defaultState()-shaped fixture. Uses
// react-dom/server's renderToStaticMarkup rather than a DOM-mounting
// approach: no interactive behavior is under test here, so server rendering
// (no DOM needed) exercises the same render path more cheaply than mounting
// would. jsdom is available (see components/__tests__/ExplorerSection.test
// .jsx's per-file environment override) for the handful of tests that
// actually need effects/interaction to run; this file doesn't.
//
// This is not behavior coverage (the compose agent owns that once App.jsx
// wires these up); it exists so an import-time or first-render mistake here
// is caught in this agent's own test run rather than surfacing only once
// App.jsx is built on top.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HouseholdSection } from "../HouseholdSection.jsx";
import { UsageInput } from "../UsageInput.jsx";
import { ConfigEditor } from "../ConfigEditor.jsx";
import { ExplorerSection } from "../ExplorerSection.jsx";
import { SolarArraysEditor } from "../SolarArraysEditor.jsx";
import { WindEditor } from "../WindEditor.jsx";
import { BatteryEditor } from "../BatteryEditor.jsx";
import { CostsEditor } from "../CostsEditor.jsx";
import { FinancingEditor } from "../FinancingEditor.jsx";
import { defaultState, normalizeState, batteryFromPreset, BATTERY_PRESETS } from "../../model/schema.js";
import { parseProfileImport } from "../../model/profileCodec.js";

// The exact AI-import reply an adversarial-verification probe used to
// reproduce a page-blanking TypeError: a real TOU import, hand-edited after
// the fact to delete one period's window descriptor (the shape a hand-edited
// share link or hand-edited localStorage record can carry, but the import
// path itself never produces -- see model/profileCodec.js's parseProfileImport,
// which fully validates window.hours on the way in).
const PGE_TOU_IMPORT_TEXT = `\`\`\`json
{
  "formatVersion": 1,
  "utilityName": "Pacific Gas and Electric Company",
  "location": "Fresno, California",
  "sources": [
    { "section": "pricing", "url": "https://www.pge.com/tariffs/electric.shtml" },
    { "section": "exportPolicy", "url": "https://www.pge.com/en/save-energy-and-money/solar-and-vehicles/solar/solar-billing-plan.html" },
    { "section": "constraints", "url": "https://www.pge.com/en/save-energy-and-money/solar-and-vehicles/solar/interconnection.html" }
  ],
  "profile": {
    "fixedChargePerMonth": 10.94,
    "pricing": {
      "type": "tou",
      "periods": [
        { "id": "peak",     "rate": { "summer": 0.62, "winter": 0.49 }, "window": { "hours": [16, 21], "days": "all", "excludeHolidays": false } },
        { "id": "off-peak", "rate": { "summer": 0.51, "winter": 0.46 }, "window": { "hours": [21, 16], "days": "all", "excludeHolidays": false } }
      ]
    },
    "demand": null,
    "adders": [],
    "riders": [],
    "exportPolicy": { "type": "avoidedCostCredit", "ratePerKWh": 0.05 },
    "constraints": {
      "allowedFinancing": ["cash", "loan"],
      "interconnectionFees": { "singlePhase": 145, "threePhase": 145 }
    }
  },
  "notes": []
}
\`\`\``;

function renders(node) {
  const html = renderToStaticMarkup(node);
  expect(html.length).toBeGreaterThan(0);
}

describe("input components smoke", () => {
  const state = defaultState();
  const [configA] = state.configs;

  it("HouseholdSection renders for both profile ids", () => {
    renders(<HouseholdSection household={state.household} onChange={() => {}} />);
    renders(<HouseholdSection household={{ ...state.household, profileId: "custom" }} onChange={() => {}} />);
  });

  it("HouseholdSection renders zero errors against a TOU period whose window descriptor was deleted after import (hand-edited share link/localStorage shape)", () => {
    const parsed = parseProfileImport(PGE_TOU_IMPORT_TEXT);
    expect(parsed.error).toBeUndefined();
    const customProfileInputs = JSON.parse(JSON.stringify(parsed.profile));
    delete customProfileInputs.pricing.periods[0].window;

    // The same choke point a share link (model/urlCodec.js's decodeShare) and
    // storage.js's loadState both run every payload through.
    const normalized = normalizeState({
      ...defaultState(),
      household: { ...state.household, profileId: "custom", customProfileInputs },
    });

    // The windowless period must not have survived into what actually
    // renders: either it was dropped (periods still non-empty) or, if that
    // emptied the array, pricing degraded to flat-seasonal -- never a "tou"
    // pricing block containing a period with no window.
    const { pricing } = normalized.household.customProfileInputs;
    if (pricing.type === "tou") {
      expect(pricing.periods.every((p) => Array.isArray(p.window?.hours))).toBe(true);
    } else {
      expect(pricing.type).toBe("flat-seasonal");
    }

    renders(<HouseholdSection household={normalized.household} onChange={() => {}} />);
  });

  it("UsageInput renders in every mode", () => {
    for (const mode of ["annual", "monthly", "hourly"]) {
      renders(<UsageInput usage={{ ...state.household.usage, mode }} onChange={() => {}} />);
    }
  });

  it("ConfigEditor renders with the seeded configs", () => {
    renders(<ConfigEditor configs={state.configs} allowedFinancing={["cash", "loan"]} onChange={() => {}} />);
  });

  it("SolarArraysEditor renders with an array present", () => {
    renders(<SolarArraysEditor arrays={configA.solar.arrays} onChange={() => {}} />);
  });

  it("BatteryEditor renders for none, a preset, and custom", () => {
    renders(<BatteryEditor battery={null} onChange={() => {}} />);
    renders(<BatteryEditor battery={batteryFromPreset(BATTERY_PRESETS[0]?.id)} onChange={() => {}} />);
    renders(<BatteryEditor battery={{ ...batteryFromPreset(BATTERY_PRESETS[0]?.id), presetId: null }} onChange={() => {}} />);
  });

  it("CostsEditor renders and estimates placeholders", () => {
    renders(<CostsEditor config={configA} onChange={() => {}} />);
  });

  it("FinancingEditor renders and respects allowedFinancing", () => {
    renders(<FinancingEditor financing={configA.financing} allowedFinancing={["cash"]} onChange={() => {}} />);
  });

  it("WindEditor renders with an empty turbine list", () => {
    renders(<WindEditor turbines={[]} onChange={() => {}} />);
  });

  it("ExplorerSection renders with no results yet", () => {
    renders(
      <ExplorerSection
        household={state.household}
        assumptions={state.assumptions}
        existingConfigs={state.configs}
        onAddConfig={() => {}}
      />,
    );
  });
});
