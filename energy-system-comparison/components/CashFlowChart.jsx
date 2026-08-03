// Cumulative cash flow over the analysis window, one line per config, matching
// the ChartFrame idiom compensation-comparison/components/TrendChart.jsx
// uses: a fixed-height box owned only by the chart, ResponsiveContainer
// inside it, and a caption as a sibling below rather than a child (a child
// inside a fixed-height box overflows onto whatever follows).
//
// The line is solid from the upfront point through the ownership horizon,
// then continues dashed a little past that -- out to whichever is later of
// the horizon or the latest entry's payback year plus two, capped at the
// full analysis window (calc/finance.js's cashFlows length) -- so a payback
// landing after the horizon is still visible on the chart instead of being
// cut off at the same boundary the solid line stops at. A vertical reference
// line marks the horizon itself.
//
// @param entries [{ id, name, finance:{ cumulative:number[], paybackYear:number|null } }] baseline already excluded by the caller
// @param horizonYears number of ownership years plotted solid, before the dashed continuation

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { money } from "../format.js";
import { Term } from "../../shared/Term.jsx";
import { ChartTip, CHART_TOOLTIP_Z_INDEX } from "./ChartTip.jsx";
import { color, offerColor } from "../theme.js";

const CHART_HEIGHT = 220;
const PAYBACK_CONTINUATION_YEARS = 2;

/** recharts axis `label` style, matching the muted, small tick-label treatment already used on every axis in this file. */
const axisLabelStyle = { fontSize: 10.5, fill: color.muted };

/** How far past the upfront point (index 0) to plot: the horizon, or a bit past the latest payback if that lands later, capped at whatever cashFlows actually covers. */
export function plotEndYear(entries, horizonYears) {
  const analysisYears = entries.reduce((max, e) => Math.max(max, e.finance.cumulative.length - 1), horizonYears);
  const paybackYears = entries.map((e) => e.finance.paybackYear).filter((v) => v != null);
  const latestPayback = paybackYears.length > 0 ? Math.max(...paybackYears) : horizonYears;
  return Math.min(Math.max(horizonYears, Math.ceil(latestPayback) + PAYBACK_CONTINUATION_YEARS), analysisYears);
}

/** The tooltip's bold context line for a hovered `year`: "Upfront" at year 0, otherwise "Year N", annotated once N lands past the horizon. */
export function cashFlowTooltipLabel(year, horizonYears) {
  if (year === 0) return "Upfront";
  if (year > horizonYears) return `Year ${year} (beyond your horizon)`;
  return `Year ${year}`;
}

/**
 * One ChartTip row per entry (config), built from recharts' raw Tooltip
 * payload. The solid and dashed legs of the same config are never both
 * meaningfully present except exactly at the horizon boundary (see the data
 * -building comment in CashFlowChart below, where they carry the same value
 * on purpose) -- dedupe by entry id, keeping whichever leg is non-null, so a
 * config never renders twice in the same tooltip. Row order follows
 * `payload`'s own order (both legs are registered in entries order, solid
 * block first then dashed), so this preserves entries order regardless of
 * which leg happens to be the surviving one for a given entry.
 */
export function cashFlowTooltipRows(payload) {
  const seen = new Map();
  for (const p of payload) {
    if (p.value == null) continue;
    const entryId = p.dataKey.replace(/_solid$|_dashed$/, "");
    if (!seen.has(entryId)) seen.set(entryId, p);
  }
  return [...seen.values()].map((p) => ({ key: p.dataKey, name: p.name, value: money(p.value), color: p.color }));
}

export function CashFlowChart({ entries, horizonYears }) {
  if (entries.length === 0) return null;

  const endYear = plotEndYear(entries, horizonYears);
  const hasContinuation = endYear > horizonYears;

  const data = Array.from({ length: endYear + 1 }, (_, year) => {
    const row = { year };
    for (const e of entries) {
      const value = Math.round(e.finance.cumulative[year] ?? 0);
      // The two series share the horizon-year point so the dashed
      // continuation visually picks up exactly where the solid line stops.
      row[`${e.id}_solid`] = year <= horizonYears ? value : null;
      row[`${e.id}_dashed`] = year >= horizonYears ? value : null;
    }
    return row;
  });

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ width: "100%", minWidth: 0, height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} debounce={0}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(y) => (y === 0 ? "Now" : `Y${y}`)}
              label={{ value: "Year", position: "insideBottom", offset: -2, style: axisLabelStyle }}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)}
              label={{ value: "Cumulative cash flow ($)", position: "insideTopLeft", offset: 8, style: axisLabelStyle }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: CHART_TOOLTIP_Z_INDEX }}
              cursor={{ stroke: color.rule, strokeWidth: 1 }}
              content={({ active, label: year, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <ChartTip active={active} label={cashFlowTooltipLabel(year, horizonYears)} rows={cashFlowTooltipRows(payload)} />
                );
              }}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10.5 }} itemSorter={false} />
            <ReferenceLine y={0} stroke={color.rule} strokeDasharray="3 3" />
            <ReferenceLine
              x={horizonYears}
              stroke={color.muted}
              strokeDasharray="4 4"
              label={{ value: "Horizon", position: "insideTopRight", fontSize: 10, fill: color.muted }}
            />
            {entries.map((e, i) => (
              <Line
                key={`${e.id}-solid`}
                type="monotone"
                dataKey={`${e.id}_solid`}
                name={e.name}
                stroke={offerColor(i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
            {entries.map((e, i) => (
              <Line
                key={`${e.id}-dashed`}
                type="monotone"
                dataKey={`${e.id}_dashed`}
                name={e.name}
                legendType="none"
                stroke={offerColor(i)}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
        <Term id="cumulative-cash-flow">Cumulative cash flow</Term> against the no-system baseline, from the upfront
        spend through year {horizonYears} (your ownership horizon, marked by the vertical line)
        {hasContinuation
          ? `, continuing dashed through year ${endYear} to show what happens after. A line below zero has not yet paid back its own upfront cost.`
          : ". A line below zero has not yet paid back its own upfront cost."}
      </p>
    </div>
  );
}
