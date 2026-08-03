import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparisonTable } from "../ComparisonTable.jsx";

const baseline = { years: [{ billTotal: 2000 }] };

function entry(overrides = {}) {
  return {
    id: "a",
    name: "A",
    result: {
      years: [{ billTotal: 1000, productionKWh: 8000 }],
      totals: { productionKWh: 8000, selfConsumedKWh: 5000 },
    },
    finance: {
      cashFlows: [-10000],
      paybackYear: null,
      npv: 1000,
      irr: 0.1,
      lifetimeSavings: 2000,
    },
    ...overrides,
  };
}

describe("ComparisonTable: Payback cell (regression for the horizon-as-gate bug)", () => {
  it("reports the true payback year past the horizon instead of hiding it behind 'never'", () => {
    // This is the exact reported bug: a 10-year horizon with a real ~13-year
    // payback used to render "Never pays back within 10 years," discarding
    // the actual payback year entirely.
    const entries = [
      entry({
        finance: { cashFlows: new Array(21).fill(0), paybackYear: 13, npv: -500, irr: null, lifetimeSavings: -500 },
      }),
    ];
    const html = renderToStaticMarkup(<ComparisonTable entries={entries} baseline={baseline} horizonYears={10} />);

    expect(html).toMatch(/13\.0\s*yr/);
    expect(html).toMatch(/beyond your 10-yr horizon/);
    expect(html).not.toMatch(/[Nn]ever/);
  });

  it("reports a plain year with no beyond-horizon note when payback falls inside the horizon", () => {
    const entries = [entry({ finance: { cashFlows: new Array(11).fill(0), paybackYear: 4, npv: 500, irr: 0.1, lifetimeSavings: 500 } })];
    const html = renderToStaticMarkup(<ComparisonTable entries={entries} baseline={baseline} horizonYears={10} />);

    expect(html).toMatch(/4\.0\s*yr/);
    expect(html).not.toMatch(/beyond your/);
  });

  it("reports 'Not within N years' (N = the actual search window), not a horizon-only 'never', when payback is null", () => {
    const entries = [entry({ finance: { cashFlows: new Array(41).fill(0), paybackYear: null, npv: -900, irr: null, lifetimeSavings: -900 } })];
    const html = renderToStaticMarkup(<ComparisonTable entries={entries} baseline={baseline} horizonYears={10} />);

    expect(html).toMatch(/Not within 40 years/);
  });

  it("labels a null IRR as 'no root within the horizon' rather than a bare dash", () => {
    const entries = [entry({ finance: { cashFlows: new Array(11).fill(0), paybackYear: null, npv: -900, irr: null, lifetimeSavings: -900 } })];
    const html = renderToStaticMarkup(<ComparisonTable entries={entries} baseline={baseline} horizonYears={10} />);

    expect(html).toMatch(/no root within 10 yr/);
  });
});
