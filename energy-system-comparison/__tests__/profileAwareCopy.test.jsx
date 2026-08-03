// Regression coverage for "de-LEU-ing" the calculator's copy: several
// surfaces used to name LEU/Lodi/ECA/EP by name regardless of which utility
// profile was actually active. Every surface below must render Lodi-specific
// text only when household.profileId is Lodi (the default/"lodi"), and a
// generic, profile-driven equivalent for a custom tariff -- never a mix of
// both, and never LEU/Lodi/ECA/EP leaking into a custom profile's rendered
// copy.
//
// Renders statically (react-dom/server), matching this repo's default
// component-test approach (see components/__tests__/smoke.test.jsx's
// header): every surface exercised here (buildDisclosureNotes' note bodies,
// AssumptionsControls, ConfigEditor's oversized warning, ExplorerSection's
// PickCard/FrontierScatter/Top5Table) is a pure function of props, with no
// effects this test needs to flush.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDisclosureNotes, AssumptionsControls } from "../App.jsx";
import { ConfigEditor } from "../components/ConfigEditor.jsx";
import { PickCard, FrontierScatter, Top5Table } from "../components/ExplorerSection.jsx";
import { GlossaryProvider } from "../../shared/Term.jsx";
import { GLOSSARY_BY_ID } from "../glossary.js";
import { defaultState, DEFAULT_ASSUMPTIONS, DEFAULT_CUSTOM_PROFILE_INPUTS } from "../model/schema.js";

const LODI_HOUSEHOLD = defaultState().household; // profileId: "lodi" by default

function customHousehold(overrides = {}) {
  return {
    ...LODI_HOUSEHOLD,
    profileId: "custom",
    customProfileInputs: { ...DEFAULT_CUSTOM_PROFILE_INPUTS, ...overrides },
  };
}

/** Wraps in the same GlossaryProvider every real render tree carries, so <Term> resolves the same way it does in the app. */
function withGlossary(node) {
  return renderToStaticMarkup(<GlossaryProvider glossary={GLOSSARY_BY_ID}>{node}</GlossaryProvider>);
}

/** Every note's rendered html, concatenated -- WarrantyDisclaimer renders title+body per note, so this approximates that without needing the shared component itself. */
function renderNotes(notes) {
  return notes.map((n) => withGlossary(<div>{n.title}{n.body}</div>)).join("");
}

// Word-boundary matches for LEU/ECA/EP (short, alphabetic-only tokens that
// could false-positive as substrings otherwise) plus a plain substring match
// for "Lodi" (never a substring of another real word this app renders).
const LEU_LODI_ECA_EP = /\bLEU\b|Lodi|\bECA\b|\bEP\b/;

describe("buildDisclosureNotes: LEU-specific notes render only for Lodi", () => {
  it("Lodi household: includes the LEU-specific rate-reset and ECA-on-exports notes", () => {
    const html = renderNotes(buildDisclosureNotes(LODI_HOUSEHOLD));
    expect(html).toMatch(/Rates change annually/);
    expect(html).toContain("LEU");
    expect(html).toMatch(/resets its.*ECA.*monthly/s);
    expect(html).toMatch(/Whether.*ECA.*applies to export credits is unresolved/s);
  });

  it("Lodi household: 'Verify before you buy' names LEU", () => {
    const html = renderNotes(buildDisclosureNotes(LODI_HOUSEHOLD));
    expect(html).toMatch(/Verify before you buy/);
    expect(html).toMatch(/Confirm your actual rate schedule.*LEU/s);
  });

  it("custom household: replaces the two LEU notes with one generic note, and contains zero LEU/ECA text (the wind note, unchanged for everyone per this task's own instruction, still names the Lodi site)", () => {
    const notes = buildDisclosureNotes(customHousehold({ label: "Foo Electric" }));
    expect(notes).toHaveLength(4); // estimates, generic-rates, wind, verify-before-you-buy (2 Lodi-only notes dropped to 1 generic)
    const html = renderNotes(notes);
    expect(html).toMatch(/Your entered rates may be out of date/);
    expect(html).toMatch(/entered or imported by you as of a point in time/);
    expect(html).not.toMatch(/\bLEU\b/);
    expect(html).not.toMatch(/\bECA\b/);

    // Every note besides the (intentionally unchanged) wind one is Lodi-free.
    const nonWindHtml = renderNotes(notes.filter((n) => n.title !== "The wind model is a simplified estimate"));
    expect(nonWindHtml).not.toContain("Lodi");
  });

  it("custom household: 'Verify before you buy' names the entered utility instead of LEU", () => {
    const html = renderNotes(buildDisclosureNotes(customHousehold({ label: "Foo Electric" })));
    expect(html).toMatch(/Verify before you buy/);
    expect(html).toContain("Foo Electric");
    expect(html).not.toMatch(/\bLEU\b/);
  });

  it("custom household with the form's own unedited placeholder label: 'Verify before you buy' says 'your utility'", () => {
    const html = renderNotes(buildDisclosureNotes(customHousehold()));
    expect(html).toContain("your utility");
    expect(html).not.toContain("Custom Utility");
  });
});

describe("AssumptionsControls: ECA/adders-on-exports controls are profile-aware", () => {
  it("Lodi household: shows the ECA mode control and the ECA-worded addersOnExports toggle", () => {
    const html = withGlossary(
      <AssumptionsControls household={LODI_HOUSEHOLD} assumptions={DEFAULT_ASSUMPTIONS} onChange={() => {}} />,
    );
    expect(html).toMatch(/ECA/);
    expect(html).toMatch(/Apply adders.*ECA.*state energy tax.*export credits/s);
  });

  it("custom household with no adders: hides both the ECA-mode control and addersOnExports entirely, with zero LEU/Lodi/ECA/EP text", () => {
    const html = withGlossary(
      <AssumptionsControls
        household={customHousehold({ adders: [] })}
        assumptions={DEFAULT_ASSUMPTIONS}
        onChange={() => {}}
      />,
    );
    expect(html).not.toMatch(/\bECA\b/);
    expect(html).not.toMatch(/\bLEU\b/);
    expect(html).not.toContain("Lodi");
    // The addersOnExports toggle itself is absent (its label/checkbox never
    // render), not merely reworded -- "adders" still appears legitimately in
    // the unrelated retail-escalation help text ("per-kWh adders all
    // compound at this rate"), so this checks for the toggle's own label
    // specifically rather than the bare word anywhere on the page.
    expect(html).not.toMatch(/Apply (per-kWh )?adders.*export credits/i);
  });

  it("custom household with an adder: shows the generic addersOnExports toggle, still no LEU/ECA wording", () => {
    const html = withGlossary(
      <AssumptionsControls
        household={customHousehold({ adders: [{ id: "surcharge", label: "Delivery surcharge", mode: "fixed", valuePerKWh: 0.01 }] })}
        assumptions={DEFAULT_ASSUMPTIONS}
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/Apply per-kWh adders to export credits too/);
    expect(html).not.toMatch(/\bECA\b/);
    expect(html).not.toMatch(/\bLEU\b/);
  });

  it("custom household: the retail-escalation help drops the LEU-specific sentence but keeps the national rule-of-thumb sentence", () => {
    const html = withGlossary(
      <AssumptionsControls household={customHousehold({ label: "Foo Electric" })} assumptions={DEFAULT_ASSUMPTIONS} onChange={() => {}} />,
    );
    expect(html).toContain("national-average rule of thumb");
    expect(html).not.toMatch(/\bLEU\b/);
    expect(html).not.toContain("mid-2024");
  });
});

describe("ConfigEditor: the oversized-production warning names the active profile", () => {
  const configs = [{ id: "a", name: "A", solar: { arrays: [] }, wind: { turbines: [] }, battery: null, costs: { incentives: [] }, financing: {} }];

  it("Lodi household: names LEU", () => {
    const html = withGlossary(
      <ConfigEditor
        configs={configs}
        allowedFinancing={["cash"]}
        oversizedConfigIds={new Set(["a"])}
        household={LODI_HOUSEHOLD}
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/\bLEU\b/);
    expect(html).toMatch(/rejects an interconnection application/);
  });

  it("custom household: names the entered utility instead of LEU", () => {
    const html = withGlossary(
      <ConfigEditor
        configs={configs}
        allowedFinancing={["cash"]}
        oversizedConfigIds={new Set(["a"])}
        household={customHousehold({ label: "Foo Electric" })}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Foo Electric");
    expect(html).not.toMatch(/\bLEU\b/);
    expect(html).not.toContain("Lodi");
  });
});

describe("ExplorerSection's PickCard/FrontierScatter/Top5Table: size-cap copy is profile-aware", () => {
  const cappedPoint = { sizes: { solarKW: 10, batteryKWh: 0, windPresetId: null }, upfront: 20000, npv: -1000, exceedsSizeCap: true };
  const points = [cappedPoint];

  it("PickCard's 'no eligible point' text names LEU for Lodi, the entered utility for a custom profile", () => {
    const lodiHtml = withGlossary(<PickCard title="Best NPV" point={null} horizonYears={25} onAdd={() => {}} household={LODI_HOUSEHOLD} />);
    expect(lodiHtml).toMatch(/\bLEU\b/);

    const customHtml = withGlossary(
      <PickCard title="Best NPV" point={null} horizonYears={25} onAdd={() => {}} household={customHousehold({ label: "Foo Electric" })} />,
    );
    expect(customHtml).toContain("Foo Electric");
    expect(customHtml).not.toMatch(/\bLEU\b/);
  });

  it("FrontierScatter's caption names LEU for Lodi, the entered utility for a custom profile", () => {
    const lodiHtml = withGlossary(<FrontierScatter points={points} household={LODI_HOUSEHOLD} />);
    expect(lodiHtml).toMatch(/\bLEU\b/);

    const customHtml = withGlossary(<FrontierScatter points={points} household={customHousehold({ label: "Foo Electric" })} />);
    expect(customHtml).toContain("Foo Electric");
    expect(customHtml).not.toMatch(/\bLEU\b/);
  });

  it("Top5Table's capped-row note names LEU for Lodi, the entered utility for a custom profile", () => {
    const lodiHtml = withGlossary(<Top5Table points={points} horizonYears={25} onAdd={() => {}} household={LODI_HOUSEHOLD} />);
    expect(lodiHtml).toMatch(/\bLEU\b/);

    const customHtml = withGlossary(
      <Top5Table points={points} horizonYears={25} onAdd={() => {}} household={customHousehold({ label: "Foo Electric" })} />,
    );
    expect(customHtml).toContain("Foo Electric");
    expect(customHtml).not.toMatch(/\bLEU\b/);
  });
});

describe("aggregate check: every de-LEU'd surface together, custom profile, zero LEU/Lodi/ECA/EP outside the glossary", () => {
  it("renders zero occurrences across every surface this task touched", () => {
    const household = customHousehold({ label: "Foo Electric" });
    const configs = [{ id: "a", name: "A", solar: { arrays: [] }, wind: { turbines: [] }, battery: null, costs: { incentives: [] }, financing: {} }];
    const points = [{ sizes: { solarKW: 10, batteryKWh: 0, windPresetId: null }, upfront: 20000, npv: -1000, exceedsSizeCap: true }];

    // The wind-model disclosure note is excluded here: it names the Lodi
    // site and the Central Valley on purpose, unchanged for every profile
    // per this task's own instruction (it describes this calculator's wind
    // model, not the active utility) -- covered on its own further up.
    const notesWithoutWind = buildDisclosureNotes(household).filter((n) => n.title !== "The wind model is a simplified estimate");

    const html =
      renderNotes(notesWithoutWind) +
      withGlossary(<AssumptionsControls household={household} assumptions={DEFAULT_ASSUMPTIONS} onChange={() => {}} />) +
      withGlossary(
        <ConfigEditor
          configs={configs}
          allowedFinancing={["cash"]}
          oversizedConfigIds={new Set(["a"])}
          household={household}
          onChange={() => {}}
        />,
      ) +
      withGlossary(<PickCard title="Best NPV" point={null} horizonYears={25} onAdd={() => {}} household={household} />) +
      withGlossary(<FrontierScatter points={points} household={household} />) +
      withGlossary(<Top5Table points={points} horizonYears={25} onAdd={() => {}} household={household} />);

    expect(html).not.toMatch(LEU_LODI_ECA_EP);
  });

  it("the same surfaces with the Lodi profile active still render the LEU notes as before", () => {
    const configs = [{ id: "a", name: "A", solar: { arrays: [] }, wind: { turbines: [] }, battery: null, costs: { incentives: [] }, financing: {} }];
    const html =
      renderNotes(buildDisclosureNotes(LODI_HOUSEHOLD)) +
      withGlossary(<AssumptionsControls household={LODI_HOUSEHOLD} assumptions={DEFAULT_ASSUMPTIONS} onChange={() => {}} />) +
      withGlossary(
        <ConfigEditor
          configs={configs}
          allowedFinancing={["cash"]}
          oversizedConfigIds={new Set(["a"])}
          household={LODI_HOUSEHOLD}
          onChange={() => {}}
        />,
      );

    expect(html).toMatch(/\bLEU\b/);
    expect(html).toMatch(/Rates change annually/);
  });
});

describe("glossary.js: no hardcoded Lodi-only figures presented as universal", () => {
  it("self-consumption's whyItMatters is generic (no Lodi cents figures)", () => {
    expect(GLOSSARY_BY_ID["self-consumption"].whyItMatters).not.toContain("Lodi");
    expect(GLOSSARY_BY_ID["self-consumption"].whyItMatters).not.toMatch(/38 cents|8\.43 cents/);
    expect(GLOSSARY_BY_ID["self-consumption"].whyItMatters).toMatch(/your utility's export credit/);
  });

  it("year1-production's whyItMatters doesn't assert LEU's size-cap behavior as universal", () => {
    expect(GLOSSARY_BY_ID["year1-production"].whyItMatters).not.toMatch(/^LEU rejects|since LEU rejects/);
    expect(GLOSSARY_BY_ID["year1-production"].whyItMatters).toMatch(/a utility with a size cap/);
  });

  it("ev's whyItMatters no longer singles out Lodi as the only utility with a separately metered EV rate", () => {
    expect(GLOSSARY_BY_ID.ev.whyItMatters).not.toContain("Lodi's");
  });

  it("leu/eca/ep stay Lodi-specific, since they define Lodi's own terms", () => {
    expect(GLOSSARY_BY_ID.leu.definition).toContain("Lodi");
    expect(GLOSSARY_BY_ID.eca.definition).toContain("Lodi");
    expect(GLOSSARY_BY_ID.ep.definition).toContain("Lodi");
  });
});
