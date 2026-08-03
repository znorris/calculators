// One config's representative day at a time. Overlaying every config's
// production/load/import/export/battery lines on one chart stops being
// readable past two configs, so a chip selector swaps which config's day is
// drawn instead of layering all of them.
//
// @param entries [{ id, name, result:{ representativeDays:{ summer:DayFlows, winter:DayFlows } } }]
// DayFlows = { production, load, batteryFlow, gridImport, gridExport }, each number[24].
// batteryFlow sign per calc/CONTRACTS.md: positive is AC-side charging input, negative is discharge delivered.

import { useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Term } from "../../shared/Term.jsx";
import { ChartTip, CHART_TOOLTIP_Z_INDEX } from "./ChartTip.jsx";
import { color, button } from "../theme.js";

const CHART_HEIGHT = 240;
const BATTERY_CHARGE_COLOR = "#7c3aed";
const BATTERY_DISCHARGE_COLOR = "#047857";
const PRODUCTION_COLOR = "#b45309";
const LOAD_COLOR = "#0f172a";
const IMPORT_COLOR = "#dc2626";
const EXPORT_COLOR = "#0284c7";

/** recharts axis `label` style, matching the muted, small tick-label treatment already used on every axis in this file. */
const axisLabelStyle = { fontSize: 10.5, fill: color.muted };

function chipStyle(active) {
  return {
    ...button,
    padding: "5px 10px",
    fontSize: 11.5,
    background: active ? color.accent : color.surface,
    color: active ? color.surface : color.body,
    borderColor: active ? color.accent : color.rule,
  };
}

function round1(v) {
  return Math.round((v ?? 0) * 10) / 10;
}

/**
 * ChartTip rows for this chart's tooltip, from recharts' raw Tooltip
 * payload, in payload order (this is a time-series-style chart, so series
 * order -- Production, Load, Grid import, Grid export, Battery -- is kept
 * rather than re-ranked by value). The battery row's own swatch is
 * overridden to match whichever of the two colors the bar itself painted for
 * this exact hour (BATTERY_CHARGE_COLOR/BATTERY_DISCHARGE_COLOR, chosen per
 * hour by sign in the Bar's own <Cell> below): the Bar element carries no
 * single top-level `fill`, only its per-hour Cells do, so recharts' own
 * `p.color` for that series has no single right answer to fall back to.
 */
export function typicalDayTooltipRows(payload) {
  return payload
    .filter((p) => p.value != null)
    .map((p) => ({
      key: p.dataKey,
      name: p.name,
      value: `${p.value} kWh`,
      color: p.dataKey === "batteryFlow" ? (p.value >= 0 ? BATTERY_CHARGE_COLOR : BATTERY_DISCHARGE_COLOR) : p.color,
    }));
}

export function TypicalDayChart({ entries }) {
  const [season, setSeason] = useState("summer");
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? null);

  if (entries.length === 0) return null;
  const selected = entries.find((e) => e.id === selectedId) || entries[0];
  const day = selected.result.representativeDays[season];
  const hasBattery = day.batteryFlow.some((v) => Math.abs(v) > 1e-9);

  const data = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    production: round1(day.production[h]),
    load: round1(day.load[h]),
    gridImport: round1(day.gridImport[h]),
    gridExport: round1(day.gridExport[h]),
    batteryFlow: round1(day.batteryFlow[h]),
  }));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["summer", "winter"].map((s) => (
            <button key={s} type="button" onClick={() => setSeason(s)} style={chipStyle(season === s)}>
              {s === "summer" ? "Summer" : "Winter"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {entries.map((e) => (
            <button key={e.id} type="button" onClick={() => setSelectedId(e.id)} style={chipStyle(e.id === selected.id)}>
              {e.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", minWidth: 0, height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} debounce={0}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 11, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(h) => `${h}:00`}
              label={{ value: "Hour of day", position: "insideBottom", offset: -2, style: axisLabelStyle }}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => `${v}`}
              label={{ value: "kWh per hour", position: "insideTopLeft", offset: 8, style: axisLabelStyle }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: CHART_TOOLTIP_Z_INDEX }}
              cursor={{ stroke: color.rule, strokeWidth: 1 }}
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) return null;
                return <ChartTip active={active} label={`${label}:00`} rows={typicalDayTooltipRows(payload)} />;
              }}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10.5 }} itemSorter={false} />
            <ReferenceLine y={0} stroke={color.rule} />

            <Area
              type="monotone"
              dataKey="production"
              name="Production"
              stroke={PRODUCTION_COLOR}
              fill={PRODUCTION_COLOR}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="load"
              name="Load"
              stroke={LOAD_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="gridImport"
              name="Grid import"
              stroke={IMPORT_COLOR}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="gridExport"
              name="Grid export"
              stroke={EXPORT_COLOR}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {hasBattery && (
              <Bar
                dataKey="batteryFlow"
                name="Battery (+charge / -discharge)"
                barSize={10}
                isAnimationActive={false}
                fill={BATTERY_CHARGE_COLOR}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.batteryFlow >= 0 ? BATTERY_CHARGE_COLOR : BATTERY_DISCHARGE_COLOR} />
                ))}
              </Bar>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
        The {season} day shown is {selected.name}'s median-production {season} day, not an average day. Hourly
        values are <Term id="kwh">kWh</Term> for that hour, numerically equal to average <Term id="kw">kW</Term>.
        {hasBattery && " Positive battery bars are charging; negative bars are discharging to load."}
      </p>
    </div>
  );
}
