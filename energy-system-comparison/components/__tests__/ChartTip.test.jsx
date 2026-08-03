// @vitest-environment jsdom
//
// Coverage for ChartTip.jsx, the unified hover-tooltip content every recharts
// surface in this calculator now uses (NpvBySolarChart, FrontierScatter,
// CashFlowChart, TypicalDayChart), replacing recharts' own default tooltip
// content and FrontierScatter's previous one-off inline box.
//
// Two things this guards specifically:
//  - it renders nothing when recharts calls it with active:false or an empty
//    row list (recharts' own contract for a content-render prop -- returning
//    non-null while inactive would leave a stray empty box on screen).
//  - it shares shared/Tooltip.jsx's exact TOOLTIP_SURFACE_CLASS, the same
//    class Term's own popover renders with, so the two cannot visually drift
//    apart the way two independently-authored style objects could.
//
// Mounts with react-dom/client (not renderToStaticMarkup) because
// ensureTooltipStylesInjected runs in a useLayoutEffect, which needs a real
// DOM to fire at all (see shared/__tests__/Tooltip.test.jsx's own header for
// the same jsdom opt-in, and components/__tests__/smoke.test.jsx's for why
// most of this repo's component tests render statically instead).

import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChartTip, CHART_TOOLTIP_Z_INDEX } from "../ChartTip.jsx";
import { TOOLTIP_SURFACE_CLASS } from "../../../shared/Tooltip.jsx";

let container;
let root;

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.head.querySelectorAll("#shared-tooltip-styles").forEach((el) => el.remove());
});

function render(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

describe("ChartTip", () => {
  it("renders nothing when inactive", () => {
    render(<ChartTip active={false} label="7 kW solar" rows={[{ key: "a", name: "A", value: "$1" }]} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when rows is empty or missing", () => {
    render(<ChartTip active label="7 kW solar" rows={[]} />);
    expect(container.textContent).toBe("");

    render(<ChartTip active label="7 kW solar" rows={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders the bold label followed by one row per entry, each with its value right-aligned", () => {
    render(
      <ChartTip
        active
        label="7 kW solar"
        rows={[
          { key: "a", name: "0 kWh battery", value: "$495", color: "#4f46e5" },
          { key: "b", name: "5 kWh battery", value: "-$3,649", color: "#0284c7" },
        ]}
      />,
    );
    expect(container.textContent).toContain("7 kW solar");
    expect(container.textContent).toContain("0 kWh battery");
    expect(container.textContent).toContain("$495");
    expect(container.textContent).toContain("5 kWh battery");
    expect(container.textContent).toContain("-$3,649");
  });

  it("omits the label line entirely when label is null", () => {
    render(<ChartTip active label={null} rows={[{ key: "a", name: "Upfront", value: "$7,000" }]} />);
    expect(container.textContent).toBe("Upfront$7,000");
  });

  it("skips the color swatch for a row with no color", () => {
    render(<ChartTip active label={null} rows={[{ key: "a", name: "Upfront", value: "$7,000" }]} />);
    // No element carries a background matching a series color -- only the
    // row's text content is present, no dot markup.
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("renders a color swatch for a row that has one", () => {
    render(<ChartTip active label={null} rows={[{ key: "a", name: "A", value: "$1", color: "#4f46e5" }]} />);
    const swatch = container.querySelector('[aria-hidden="true"]');
    expect(swatch).not.toBeNull();
    expect(swatch.style.background).toBe("rgb(79, 70, 229)");
  });

  it("renders with shared/Tooltip.jsx's exact TOOLTIP_SURFACE_CLASS, so a chart tip and a Term popover cannot drift apart", () => {
    render(<ChartTip active label="Year 12" rows={[{ key: "a", name: "A", value: "$1" }]} />);
    const pop = container.querySelector(`.${TOOLTIP_SURFACE_CLASS}`);
    expect(pop).not.toBeNull();
  });

  it("injects the shared tooltip stylesheet exactly once, the same singleton every other Tooltip consumer shares", () => {
    render(<ChartTip active label="Year 12" rows={[{ key: "a", name: "A", value: "$1" }]} />);
    expect(document.head.querySelectorAll("#shared-tooltip-styles")).toHaveLength(1);
  });

  it("exports the zIndex every chart's recharts Tooltip wrapperStyle uses", () => {
    expect(CHART_TOOLTIP_Z_INDEX).toBeTypeOf("number");
    expect(CHART_TOOLTIP_Z_INDEX).toBeGreaterThan(0);
  });
});
