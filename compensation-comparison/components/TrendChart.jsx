// A line chart over the horizon, one line per offer, with an optional shaded
// band where an input actually has two bounds.
//
// The tooltip is shared, so touching or hovering any point reads out every
// offer at that year at once. That is the whole reason these exist: the tables
// force you to pick a year, and a chart lets you read any of them.
//
// A band is drawn only where the data has a low and a high. Nothing here
// invents an interval around a single value.

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { money } from "../format.js";
import { color } from "../theme.js";

const CHART_HEIGHT = 200;

/**
 * @param data     [{ year: 1, [seriesKey]: number, ... }]
 * @param series   [{ key, name, color, bandLowKey?, bandHighKey? }]
 * @param caption  prose stating the takeaway, not just the axes
 */
export function TrendChart({ data, series, caption }) {
  // Recharts cannot draw a low-to-high band directly, so each band becomes two
  // stacked areas: an invisible one up to the low bound, and a filled one
  // spanning the difference.
  const rows = data.map((row) => {
    const out = { ...row };
    for (const s of series) {
      if (!s.bandLowKey || !s.bandHighKey) continue;
      const low = row[s.bandLowKey];
      const high = row[s.bandHighKey];
      if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
      out[`${s.key}__base`] = low;
      out[`${s.key}__span`] = Math.max(0, high - low);
    }
    return out;
  });

  const banded = series.filter((s) => s.bandLowKey && s.bandHighKey);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* The fixed height belongs to this box alone. Anything else inside a
          fixed-height box overflows onto whatever follows. */}
      <div style={{ width: "100%", minWidth: 0, height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} debounce={0}>
          <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(y) => `Y${y}`}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)}
            />
            <Tooltip
              // Hide the two synthetic band series from the readout; the band
              // is described in the caption instead of as two mystery numbers.
              formatter={(value, name) =>
                String(name).includes("__") ? null : [money(value), name]
              }
              labelFormatter={(year) => `Year ${year}`}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${color.hairline}` }}
              cursor={{ stroke: color.rule, strokeWidth: 1 }}
            />
            <Legend wrapperStyle={{ fontSize: 10.5 }} />

            {banded.map((s) => [
              <Area
                key={`${s.key}-base`}
                type="monotone"
                dataKey={`${s.key}__base`}
                stackId={s.key}
                stroke="none"
                fill="none"
                legendType="none"
                isAnimationActive={false}
              />,
              <Area
                key={`${s.key}-span`}
                type="monotone"
                dataKey={`${s.key}__span`}
                stackId={s.key}
                stroke="none"
                fill={s.color}
                fillOpacity={0.14}
                legendType="none"
                isAnimationActive={false}
              />,
            ])}

            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                fill="none"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {caption && (
        <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>{caption}</p>
      )}
    </div>
  );
}
