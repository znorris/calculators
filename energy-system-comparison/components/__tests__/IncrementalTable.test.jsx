import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IncrementalTable } from "../IncrementalTable.jsx";

function entry(standalonePaybackYears, yearsLength = 40) {
  return {
    id: "a",
    name: "A",
    result: { years: new Array(yearsLength).fill({}) },
    incremental: [{ component: "battery", addedCost: 12000, addedAnnualSavings: 500, standalonePaybackYears }],
  };
}

describe("IncrementalTable: standalone payback beyond the horizon (regression for the horizon-as-gate bug)", () => {
  // Before this fix, a standalone payback landing after the horizon was
  // indistinguishable from one that never happens at all -- both rendered
  // "Never." A payback beyond the horizon is a real recovery year and must
  // say so.
  it("shows the real year, flagged as beyond the horizon, instead of 'Never'", () => {
    const html = renderToStaticMarkup(<IncrementalTable entries={[entry(13)]} horizonYears={10} />);
    expect(html).toMatch(/13\.0 yr/);
    expect(html).toMatch(/beyond your 10-yr horizon/);
    expect(html).not.toMatch(/Never/);
  });

  it("shows a plain year with no note when the standalone payback falls inside the horizon", () => {
    const html = renderToStaticMarkup(<IncrementalTable entries={[entry(4)]} horizonYears={10} />);
    expect(html).toMatch(/4\.0 yr/);
    expect(html).not.toMatch(/beyond your/);
  });

  it("reports 'Not within N years' off the actual search window when it never recovers at all", () => {
    const html = renderToStaticMarkup(<IncrementalTable entries={[entry(null, 40)]} horizonYears={10} />);
    expect(html).toMatch(/Not within 40 yr/);
  });
});
