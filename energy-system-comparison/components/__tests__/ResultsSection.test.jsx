// Coverage for ResultsSection.jsx's renderProseWithTerms: report/prose.js's
// sentence-building functions return plain strings (see that file's header),
// so a glossary acronym embedded in one carries no Term tooltip unless
// something splits and re-wraps it. This tests the splitter directly (its
// return value is a React children array, not markup, so it's asserted
// against the fixture's shape rather than rendered HTML) and once more
// through the whole component to confirm the Report section actually uses
// it end to end.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GlossaryProvider } from "../../../shared/Term.jsx";
import { GLOSSARY_BY_ID } from "../../glossary.js";
import { ResultsSection, renderProseWithTerms } from "../ResultsSection.jsx";

describe("renderProseWithTerms", () => {
  it("wraps kWh and NPV in Term elements while leaving ordinary words as plain strings", () => {
    const text = "In year one, A produces 3,422 kWh. Its net present value (NPV) is positive.";
    const parts = renderProseWithTerms(text);

    const termParts = parts.filter((p) => typeof p === "object" && p !== null);
    const stringParts = parts.filter((p) => typeof p === "string");

    expect(termParts).toHaveLength(2);
    expect(termParts[0].props.id).toBe("kwh");
    expect(termParts[0].props.children).toBe("kWh");
    expect(termParts[1].props.id).toBe("npv");
    expect(termParts[1].props.children).toBe("NPV");

    // Plain text survives untouched, unwrapped, in order.
    expect(stringParts.join("")).toBe("In year one, A produces 3,422 . Its net present value () is positive.");
  });

  it("does not let kW double-match inside kWh", () => {
    const parts = renderProseWithTerms("The battery shifts 40 kWh while the array is rated at 6 kW.");
    const termParts = parts.filter((p) => typeof p === "object" && p !== null);

    expect(termParts).toHaveLength(2);
    expect(termParts[0].props.children).toBe("kWh");
    expect(termParts[0].props.id).toBe("kwh");
    expect(termParts[1].props.children).toBe("kW");
    expect(termParts[1].props.id).toBe("kw");
  });

  it("passes plain text through unchanged when it contains no glossary acronym", () => {
    expect(renderProseWithTerms("Nothing to see here.")).toBe("Nothing to see here.");
  });

  it("passes a falsy value through unchanged", () => {
    expect(renderProseWithTerms("")).toBe("");
    expect(renderProseWithTerms(undefined)).toBe(undefined);
  });
});

describe("ResultsSection Report section renders prose acronyms as Term tooltips", () => {
  const baseline = { years: [{ billTotal: 2000, importKWh: 10000 }] };

  function dayFlows() {
    return {
      production: Array(24).fill(1),
      load: Array(24).fill(1),
      batteryFlow: Array(24).fill(0),
      gridImport: Array(24).fill(0),
      gridExport: Array(24).fill(0),
    };
  }

  function entry(overrides = {}) {
    return {
      id: "a",
      name: "A",
      config: { solar: { arrays: [{ kwDC: 5 }] }, wind: { turbines: [] }, battery: null },
      result: {
        years: [{ productionKWh: 8000, selfConsumedKWh: 5000, exportKWh: 3000, cycles: 0, gridChargeKWh: 0 }],
        totals: { productionKWh: 8000, selfConsumedKWh: 5000 },
        representativeDays: { summer: dayFlows(), winter: dayFlows() },
      },
      finance: {
        cashFlows: [-10000, ...Array(10).fill(500)],
        cumulative: [-10000, -9500, -9000, -8500, -8000, -7500, -7000, -6500, -6000, -5500, -5000],
        paybackYear: 8,
        npv: 1500,
        irr: 0.09,
        lifetimeSavings: 4000,
      },
      incremental: [],
      windCapacityFactor: null,
      ...overrides,
    };
  }

  it("wraps the kWh figures in the per-config narrative with a Term trigger", () => {
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY_BY_ID}>
        <ResultsSection entries={[entry()]} baseline={baseline} household={{ schedule: "EA" }} profile={null} horizonYears={10} />
      </GlossaryProvider>,
    );

    // The dotted-underline Term trigger carries tabindex + aria-describedby
    // (see shared/Term.jsx); confirming that markup around "kWh" text is
    // what distinguishes a wrapped occurrence from a plain one.
    expect(html).toMatch(/tabindex="0"[^>]*>kWh</);
  });

  it("wraps the verdict paragraph's NPV token with a Term trigger", () => {
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY_BY_ID}>
        <ResultsSection entries={[entry()]} baseline={baseline} household={{ schedule: "EA" }} profile={null} horizonYears={10} />
      </GlossaryProvider>,
    );

    expect(html).toMatch(/tabindex="0"[^>]*>NPV</);
  });
});
