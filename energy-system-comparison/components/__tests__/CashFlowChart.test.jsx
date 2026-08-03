import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CashFlowChart, plotEndYear, cashFlowTooltipLabel, cashFlowTooltipRows } from "../CashFlowChart.jsx";

describe("plotEndYear: dashed continuation past the horizon", () => {
  it("extends to the latest payback plus two years when that lands past the horizon", () => {
    const entries = [{ id: "a", finance: { cumulative: new Array(21).fill(0), paybackYear: 13 } }];
    expect(plotEndYear(entries, 10)).toBe(15); // ceil(13) + 2
  });

  it("caps the continuation at the full analysis window (cumulative's own length)", () => {
    const entries = [{ id: "a", finance: { cumulative: new Array(15).fill(0), paybackYear: 13 } }];
    // ceil(13) + 2 = 15, but cumulative only covers index 0..14 (length 15).
    expect(plotEndYear(entries, 10)).toBe(14);
  });

  it("stops at the horizon with no continuation when every payback is null or already inside it", () => {
    const entries = [
      { id: "a", finance: { cumulative: new Array(21).fill(0), paybackYear: 4 } },
      { id: "b", finance: { cumulative: new Array(21).fill(0), paybackYear: null } },
    ];
    expect(plotEndYear(entries, 10)).toBe(10);
  });

  it("uses the latest of several paybacks when more than one config crosses zero", () => {
    const entries = [
      { id: "a", finance: { cumulative: new Array(30).fill(0), paybackYear: 13 } },
      { id: "b", finance: { cumulative: new Array(30).fill(0), paybackYear: 18.4 } },
    ];
    expect(plotEndYear(entries, 10)).toBe(21); // ceil(18.4) + 2 = 21
  });
});

describe("CashFlowChart: horizon-lens caption (regression for the horizon-as-gate bug)", () => {
  // The chart used to plot only through horizonYears, so a config whose
  // payback landed after the horizon simply had no visible crossing at all.
  // The caption is the one part of this recharts-based component that
  // renders without a measured container width, so it is what a
  // server-rendered regression test can observe directly.
  it("mentions a dashed continuation past the horizon when a payback lands there", () => {
    const entries = [{ id: "a", name: "A", finance: { cumulative: new Array(21).fill(0), paybackYear: 13 } }];
    const html = renderToStaticMarkup(<CashFlowChart entries={entries} horizonYears={10} />);
    expect(html).toMatch(/continuing dashed through year 15/);
  });

  it("says nothing about a continuation when no payback lands past the horizon", () => {
    const entries = [{ id: "a", name: "A", finance: { cumulative: new Array(21).fill(0), paybackYear: 4 } }];
    const html = renderToStaticMarkup(<CashFlowChart entries={entries} horizonYears={10} />);
    expect(html).not.toMatch(/continuing dashed/);
  });
});

describe("cashFlowTooltipLabel", () => {
  it("labels year 0 as Upfront", () => {
    expect(cashFlowTooltipLabel(0, 10)).toBe("Upfront");
  });

  it("labels a year at or under the horizon as a plain year count", () => {
    expect(cashFlowTooltipLabel(10, 10)).toBe("Year 10");
    expect(cashFlowTooltipLabel(4, 10)).toBe("Year 4");
  });

  it("annotates a year past the horizon", () => {
    expect(cashFlowTooltipLabel(12, 10)).toBe("Year 12 (beyond your horizon)");
  });
});

describe("cashFlowTooltipRows: dedupes a config's solid/dashed legs into one row", () => {
  it("keeps entries order and drops the null leg for a year strictly inside the horizon", () => {
    const payload = [
      { dataKey: "a_solid", name: "A", value: -1573, color: "#4f46e5" },
      { dataKey: "b_solid", name: "B", value: -11266, color: "#0284c7" },
      { dataKey: "a_dashed", name: "A", value: null, color: "#4f46e5" },
      { dataKey: "b_dashed", name: "B", value: null, color: "#0284c7" },
    ];
    expect(cashFlowTooltipRows(payload)).toEqual([
      { key: "a_solid", name: "A", value: "-$1,573", color: "#4f46e5" },
      { key: "b_solid", name: "B", value: "-$11,266", color: "#0284c7" },
    ]);
  });

  it("still renders exactly one row per config at the horizon boundary, where both legs carry the same value", () => {
    const payload = [
      { dataKey: "a_solid", name: "A", value: 500, color: "#4f46e5" },
      { dataKey: "a_dashed", name: "A", value: 500, color: "#4f46e5" },
    ];
    const rows = cashFlowTooltipRows(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ key: "a_solid", name: "A", value: "$500", color: "#4f46e5" });
  });

  it("uses the dashed leg's value once past the horizon, when only it is non-null", () => {
    const payload = [
      { dataKey: "a_solid", name: "A", value: null, color: "#4f46e5" },
      { dataKey: "a_dashed", name: "A", value: 900, color: "#4f46e5" },
    ];
    expect(cashFlowTooltipRows(payload)).toEqual([{ key: "a_dashed", name: "A", value: "$900", color: "#4f46e5" }]);
  });
});
