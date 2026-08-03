// Unified hover-tooltip content for every recharts surface in this
// calculator -- ExplorerSection.jsx's NpvBySolarChart and FrontierScatter,
// CashFlowChart, TypicalDayChart -- replacing both recharts' own default
// tooltip content (DefaultTooltipContent, which sorts rows alphabetically by
// name/value: see calc/sweep.js's header note in ExplorerSection.jsx for the
// bug that caused) and FrontierScatter's previous one-off inline box.
//
// Reuses shared/Tooltip.jsx's exact popover surface -- background, text
// color, radius, shadow, font size, padding -- via its exported
// TOOLTIP_SURFACE_CLASS, so a chart tooltip and a glossary Term popover
// render from the one shared rule set and cannot visually drift apart. The
// container is a single flow div sized by its own content (TOOLTIP_SURFACE's
// `width: max-content`, no fixed height), so it grows to fit however many
// rows a caller passes rather than clipping them.
//
// No <Term> is ever used inside a row here: recharts mounts/unmounts this
// content on every pointer move, so it is not a stable place for a
// hover-triggered popover of its own (nested hover targets inside a
// transient hover target do not compose) -- a chart's caption below it is
// where a term needing its own definition belongs instead (see
// ExplorerSection.jsx's FrontierScatter caption, which is where its
// "upfront cost"/"NPV" Terms live, now that its tooltip box no longer
// duplicates them).
//
// @param active bool, recharts Tooltip's own content-render prop, passed straight through
// @param label string|number|null, the bold context line (e.g. "7 kW solar", "Year 12", "14:00"); omitted if null
// @param rows [{ key, name, value, color? }] one row per series/fact, already formatted and ordered by the caller --
//   row order is the caller's decision (value-descending for the NPV chart, series-declaration order for every
//   time-series chart), not something this component re-sorts.

import { useLayoutEffect } from "react";
import { ensureTooltipStylesInjected, TOOLTIP_SURFACE_CLASS } from "../../shared/Tooltip.jsx";

export function ChartTip({ active, label, rows }) {
  // Runs on mount for every ChartTip instance across all four charts, but
  // only the first one to run in a given document actually inserts anything
  // (see shared/Tooltip.jsx's ensureTooltipStylesInjected for the DOM-presence
  // guard) -- this just guarantees the stylesheet exists even if no Term has
  // mounted yet on a page that has charts but no glossary term nearby.
  useLayoutEffect(() => {
    ensureTooltipStylesInjected();
  }, []);

  if (!active || !rows || rows.length === 0) return null;

  return (
    <div className={TOOLTIP_SURFACE_CLASS}>
      {label != null && <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>}
      {rows.map((row) => (
        <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {row.color && (
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }}
              />
            )}
            <span style={{ whiteSpace: "nowrap" }}>{row.name}</span>
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * zIndex for every recharts `<Tooltip wrapperStyle={{ zIndex: ... }}>` in
 * this calculator, matching TOOLTIP_CSS's own z-index so a chart tip never
 * paints behind page content the way the unstyled recharts wrapper default
 * did (the overflow/overlap bug this component was built to fix).
 */
export const CHART_TOOLTIP_Z_INDEX = 1000;
