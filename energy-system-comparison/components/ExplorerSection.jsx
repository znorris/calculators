// The sizing explorer: a broad first-pass scan across solar/battery/wind
// sizes, run before a user builds a specific configuration by hand in
// ConfigEditor.jsx below it. App.jsx places this between HouseholdSection and
// ConfigEditor, framing it as the funnel's first step.
//
// The sweep itself runs in worker/calcWorker.js (calc/sweep.js's runSweep,
// via model/sweepEngine.js, posted as a {kind:'sweep', ...} message -- see
// that file's header for why App.jsx's own engine-recompute worker is a
// separate instance against the same file rather than a shared one) rather
// than on the main thread: a full grid is hundreds of complete engine runs,
// seconds of CPU, so it must never block typing elsewhere on the page.
// Results are cached in this component's own state until
// `household`/`assumptions` change (hashed via model/hash.js, not compared
// by reference, so a scenario load or share-link apply that rebuilds an
// equal-by-value object under a new reference still counts as "unchanged")
// -- a change cancels any in-flight run (terminating the worker outright)
// and clears the stale result rather than leaving it on screen unlabeled.
//
// The last completed sweep also persists across a reload (model/storage.js's
// saveExplorerResult/loadExplorerResult, under EXPLORER_KEY): on mount, a
// stored record whose own inputsHash matches the current one is rendered
// immediately with no sweep run at all; one that doesn't match is left
// alone (the normal "Explore sizing" button, plus a one-line notice) since
// re-running automatically would be a surprise CPU cost the user didn't ask
// for. `picks` (the {bestNpv, bestPayback} pair) is tracked as its own piece
// of state precisely so a restored, capped record (points trimmed to its
// top 5 by NPV to stay under storage's size cap) still shows the correct
// best-of-the-full-sweep picks rather than recomputing them from just the
// trimmed 5.
//
// Two refs, not state, track the request/inputs hashes that decide this:
// requestHashRef is the hash the current (or most recently completed) sweep
// was launched against, null when none is outstanding; liveInputsHashRef is
// re-synced to the current inputsHash on every render, so worker.onmessage
// -- a closure fixed at the moment runExplore() called it -- can still read
// the truly-current hash at arrival time rather than whatever value was
// current when that closure was created. model/hash.js's sweepIsStale(a, b)
// is the one decision this drives, used identically at both call sites
// below (the inputs-changed effect, and onmessage's second guard against a
// message already in the event queue when that effect terminates the
// worker).
//
// @param household model/schema.js's household state (raw, not engine-resolved -- resolution happens inside the worker)
// @param assumptions model/schema.js's assumptions state (raw)
// @param existingConfigs Config[], for configFromSweepPoint's next-letter naming
// @param onAddConfig (config) => void, appends a promoted config to the config list

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Term } from "../../shared/Term.jsx";
import { ChartTip, CHART_TOOLTIP_Z_INDEX } from "./ChartTip.jsx";
import { Field } from "./Field.jsx";
import { generateSweepGrid, bestByNpv, bestByPayback, SOLAR_TILT_DEG, SOLAR_AZIMUTH_DEG } from "../calc/sweep.js";
import { configFromSweepPoint, WIND_TURBINE_PRESETS } from "../model/schema.js";
import { hashValue, sweepIsStale } from "../model/hash.js";
import { loadExplorerResult, saveExplorerResult } from "../model/storage.js";
import { isLodiProfile, customUtilityLabel } from "../model/utilityLabel.js";
import { money, signedMoney } from "../format.js";
import { card, color, button, buttonPrimary, offerColor } from "../theme.js";
import equipmentPresets from "../data/equipment-presets.json";

/** The active utility's display name for prose here -- the Lodi Term-wrapped acronym, or the custom profile's own label/generic fallback. */
export function utilityNameFor(household) {
  return isLodiProfile(household) ? <Term id="leu">LEU</Term> : customUtilityLabel(household);
}

const SOLAR_INCENTIVE_FIELD = {
  id: "solarIncentivePerKW",
  type: "money",
  label: (
    <>
      Solar incentive ($/<Term id="kw">kW</Term>)
    </>
  ),
  help: "An optional per-kW-DC incentive (e.g. a state rebate), applied identically to every swept solar size and priced against each point's own size.",
};
const BATTERY_INCENTIVE_FIELD = {
  id: "batteryIncentivePerKWh",
  type: "money",
  label: (
    <>
      Battery incentive ($/<Term id="kwh">kWh</Term>)
    </>
  ),
  help: "An optional per-kWh incentive (e.g. SGIP), applied identically to every swept battery size and priced against each point's own size.",
};

/**
 * calc/incentives.js perUnit line items from this section's own compact
 * solar/battery incentive rate inputs -- the one place those two numbers
 * become the shape calc/sweep.js's runSweep (and, once promoted,
 * CostsEditor.jsx's resolveIncentives) actually read. A 0 (or unset) rate is
 * omitted entirely rather than included as a $0 line, so a sweep that never
 * touched these inputs posts the identical empty incentives array it always
 * has.
 */
export function incentivesFromRates(solarIncentivePerKW, batteryIncentivePerKWh) {
  const incentives = [];
  if (solarIncentivePerKW > 0) {
    incentives.push({ label: "Solar incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: solarIncentivePerKW });
  }
  if (batteryIncentivePerKWh > 0) {
    incentives.push({ label: "Battery incentive", type: "perUnit", unit: "kWh-battery", ratePerUnit: batteryIncentivePerKWh });
  }
  return incentives;
}

// --- Pricing assumptions ----------------------------------------------------
//
// Every pricing figure calc/sweep.js would otherwise read straight off
// data/equipment-presets.json (or its own hardcoded tilt/azimuth defaults),
// made adjustable here so the sizing explorer never bakes in a number a user
// can't see or override. Defaults below read those same published figures
// (equipmentPresets, calc/sweep.js's exported SOLAR_TILT_DEG/AZIMUTH_DEG)
// rather than retyping them, so a future change to that data only has to
// happen in one place.

const INVERTER_REPLACEMENT_DEFAULTS = equipmentPresets.solar.inverterReplacement;

/** This component's own local state shape for the "Pricing assumptions" group -- see toSweepPricingAssumptions below for how it becomes calc/sweep.js's own SweepPricingAssumptions shape. Exported so tests can build the identical inputsHash this component computes at mount, without retyping every default. */
export const DEFAULT_PRICING_ASSUMPTIONS = {
  solarCostPerWatt: equipmentPresets.solar.costPerWattInstalled.value,
  batteryCostPerKWh: null, // null = today's catalog-interpolated pricing, not an override
  windCostPerKW: equipmentPresets.wind.costPerKWInstalled.value,
  solarTiltDeg: SOLAR_TILT_DEG,
  solarAzimuthDeg: SOLAR_AZIMUTH_DEG,
  oAndMPerKWDCPerYear: 0,
  inverterReplacementEnabled: false,
  inverterReplacementYear: INVERTER_REPLACEMENT_DEFAULTS.defaultYear,
  inverterReplacementCostPerWatt: INVERTER_REPLACEMENT_DEFAULTS.costPerWattInstalled.value,
};

/**
 * This component's own pricingAssumptions state (DEFAULT_PRICING_ASSUMPTIONS'
 * shape) into calc/sweep.js's SweepPricingAssumptions -- the one place the
 * UI's separate enabled/year/costPerWatt fields fold into that module's own
 * single inverterReplacement:{year,costPerWatt}|null field.
 */
export function toSweepPricingAssumptions(p) {
  return {
    solarCostPerWatt: p.solarCostPerWatt,
    batteryCostPerKWh: p.batteryCostPerKWh,
    windCostPerKW: p.windCostPerKW,
    solarTiltDeg: p.solarTiltDeg,
    solarAzimuthDeg: p.solarAzimuthDeg,
    oAndMPerKWDCPerYear: p.oAndMPerKWDCPerYear,
    inverterReplacement: p.inverterReplacementEnabled
      ? { year: p.inverterReplacementYear, costPerWatt: p.inverterReplacementCostPerWatt }
      : null,
  };
}

const SOLAR_COST_FIELD = {
  id: "solarCostPerWatt",
  type: "money",
  label: "Solar installed cost ($/W-DC)",
  help: `Defaults to $${equipmentPresets.solar.costPerWattInstalled.value.toFixed(2)}/W-DC, this calculator's published before-incentive estimate (data/equipment-presets.json). Override to match a real quote or a different regional estimate.`,
};

const BATTERY_COST_FIELD = {
  id: "batteryCostPerKWh",
  type: "money",
  label: (
    <>
      Battery installed cost ($/<Term id="kwh">kWh</Term>)
    </>
  ),
  placeholder: "Catalog price, interpolated by size",
  help: "Left blank, every swept battery size is priced from this calculator's own battery catalog, interpolated between presets by size (roughly $1,000-$1,600/kWh usable across current products). Enter a flat rate to price every swept size at that one $/kWh instead.",
};

const WIND_COST_FIELD = {
  id: "windCostPerKW",
  type: "money",
  label: (
    <>
      Wind installed cost ($/<Term id="kw">kW</Term>)
    </>
  ),
  help: `Defaults to $${equipmentPresets.wind.costPerKWInstalled.value.toLocaleString()}/kW, this calculator's published small-wind estimate (data/equipment-presets.json, sourced from NREL's Distributed Wind Market Report).`,
};

const SOLAR_TILT_FIELD = {
  id: "solarTiltDeg",
  type: "int",
  label: "Array tilt (degrees)",
  help: `Defaults to ${SOLAR_TILT_DEG}°, the angle every swept solar point is modeled at. Promote a point to a configuration below to fine-tune tilt per array.`,
};

const SOLAR_AZIMUTH_FIELD = {
  id: "solarAzimuthDeg",
  type: "int",
  label: "Array azimuth (degrees)",
  help: `Defaults to ${SOLAR_AZIMUTH_DEG}° (due south), measured clockwise from north -- the same convention the configuration editor's own array-angle field uses.`,
};

const OANDM_FIELD = {
  id: "oAndMPerKWDCPerYear",
  type: "money",
  label: (
    <>
      O&amp;M ($/<Term id="kw-dc">kW-DC</Term> per year)
    </>
  ),
  help: "Defaults to $0/yr (no ongoing operations-and-maintenance cost modeled, today's behavior). Typical published industry figures run roughly $15-25/kW-DC/yr; the configuration editor's own O&M field lets you refine this further once you promote a point.",
};

const INVERTER_REPLACEMENT_TOGGLE_FIELD = {
  id: "inverterReplacementEnabled",
  type: "bool",
  label: "Model a one-time inverter replacement",
  help: "Off by default (no replacement cost modeled, today's behavior). When on, a one-time cost is added in the stated ownership year, scaled to each swept point's own solar size -- a point with no solar never carries this cost regardless.",
};

const INVERTER_REPLACEMENT_YEAR_FIELD = {
  id: "inverterReplacementYear",
  type: "int",
  label: "Replacement year",
  help: `Defaults to year ${INVERTER_REPLACEMENT_DEFAULTS.defaultYear} (data/equipment-presets.json), within the roughly 10-15 year window string inverters are commonly cited as needing replacement.`,
};

const INVERTER_REPLACEMENT_COST_FIELD = {
  id: "inverterReplacementCostPerWatt",
  type: "money",
  label: "Replacement cost ($/W-DC)",
  help: `Defaults to $${INVERTER_REPLACEMENT_DEFAULTS.costPerWattInstalled.value.toFixed(2)}/W-DC (data/equipment-presets.json's own estimate; see that file's note for sourcing and uncertainty).`,
};

/**
 * Collapsible group, visually matching ConfigEditor.jsx's own SubSection
 * (▾/▸ arrow, uppercase label, aria-expanded) -- a local copy rather than an
 * import, the same way that pattern is not otherwise shared cross-file in
 * this codebase.
 */
function CollapsibleGroup({ label, open, onToggle, children }) {
  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: 6, marginBottom: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          border: "none",
          background: open ? color.surface : color.tint,
          color: open ? color.muted : color.body,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 9, color: color.faint, width: 8 }}>
          {open ? "▾" : "▸"}
        </span>
        {label}
      </button>
      {open && <div style={{ padding: "10px" }}>{children}</div>}
    </div>
  );
}

/** Two fields per row, matching this file's own existing incentive-input layout. */
function fieldRow(children) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>{children}</div>;
}

function PricingAssumptionsGroup({ open, onToggle, pricing, onChange }) {
  function set(patch) {
    onChange({ ...pricing, ...patch });
  }

  return (
    <CollapsibleGroup label="Pricing assumptions" open={open} onToggle={onToggle}>
      {fieldRow(
        <>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Field field={SOLAR_COST_FIELD} value={pricing.solarCostPerWatt} onChange={(v) => set({ solarCostPerWatt: v ?? 0 })} compact />
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Field field={BATTERY_COST_FIELD} value={pricing.batteryCostPerKWh} onChange={(v) => set({ batteryCostPerKWh: v })} compact />
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Field field={WIND_COST_FIELD} value={pricing.windCostPerKW} onChange={(v) => set({ windCostPerKW: v ?? 0 })} compact />
          </div>
        </>,
      )}
      {fieldRow(
        <>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <Field field={SOLAR_TILT_FIELD} value={pricing.solarTiltDeg} onChange={(v) => set({ solarTiltDeg: v ?? 0 })} compact />
          </div>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <Field field={SOLAR_AZIMUTH_FIELD} value={pricing.solarAzimuthDeg} onChange={(v) => set({ solarAzimuthDeg: v ?? 0 })} compact />
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Field field={OANDM_FIELD} value={pricing.oAndMPerKWDCPerYear} onChange={(v) => set({ oAndMPerKWDCPerYear: v ?? 0 })} compact />
          </div>
        </>,
      )}

      <Field
        field={INVERTER_REPLACEMENT_TOGGLE_FIELD}
        value={pricing.inverterReplacementEnabled}
        onChange={(v) => set({ inverterReplacementEnabled: v })}
      />
      {pricing.inverterReplacementEnabled &&
        fieldRow(
          <>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <Field
                field={INVERTER_REPLACEMENT_YEAR_FIELD}
                value={pricing.inverterReplacementYear}
                onChange={(v) => set({ inverterReplacementYear: v ?? 1 })}
                compact
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <Field
                field={INVERTER_REPLACEMENT_COST_FIELD}
                value={pricing.inverterReplacementCostPerWatt}
                onChange={(v) => set({ inverterReplacementCostPerWatt: v ?? 0 })}
                compact
              />
            </div>
          </>,
        )}
    </CollapsibleGroup>
  );
}

const CHART_HEIGHT = 220;

/** Section-header style for a chart's own title, matching this file's existing h3 (e.g. "Top 5 by NPV") below it. */
const chartTitle = { fontSize: 12.5, fontWeight: 700, color: color.ink, margin: "0 0 8px" };

/** recharts axis `label` style, matching the muted, small tick-label treatment already used on every axis in this file. */
const axisLabelStyle = { fontSize: 10.5, fill: color.muted };

/** Renders as JSX (not a joined string) so the kW/kWh units carry their own Term tooltip wherever this is shown -- a pick card, the frontier chart's tooltip, or the top-5 table. */
function describeSizes(sizes) {
  const parts = [];
  if (sizes.solarKW > 0) {
    parts.push(
      <span key="solar">
        {sizes.solarKW} <Term id="kw">kW</Term> solar
      </span>,
    );
  }
  if (sizes.batteryKWh > 0) {
    parts.push(
      <span key="battery">
        {sizes.batteryKWh} <Term id="kwh">kWh</Term> battery
      </span>,
    );
  }
  if (sizes.windPresetId) {
    const preset = WIND_TURBINE_PRESETS.find((p) => p.id === sizes.windPresetId);
    parts.push(<span key="wind">{preset?.label || sizes.windPresetId} wind</span>);
  }
  if (parts.length === 0) return "No system";
  return parts.flatMap((part, i) => (i === 0 ? [part] : [" + ", part]));
}

/** Plain-string equivalent of describeSizes above, for ChartTip's `label` -- a chart tooltip is mounted/unmounted on every pointer move (see ChartTip.jsx's header), so it is not a stable place for describeSizes' own Term-wrapped kW/kWh. */
export function describeSizesText(sizes) {
  const parts = [];
  if (sizes.solarKW > 0) parts.push(`${sizes.solarKW} kW solar`);
  if (sizes.batteryKWh > 0) parts.push(`${sizes.batteryKWh} kWh battery`);
  if (sizes.windPresetId) {
    const preset = WIND_TURBINE_PRESETS.find((p) => p.id === sizes.windPresetId);
    parts.push(`${preset?.label || sizes.windPresetId} wind`);
  }
  return parts.length > 0 ? parts.join(" + ") : "No system";
}

/**
 * ChartTip rows for NpvBySolarChart's tooltip, from recharts' raw Tooltip
 * payload, sorted by NPV descending rather than left in payload/series-
 * declaration order -- unlike a time-series chart's tooltip (CashFlowChart,
 * TypicalDayChart), a hovered solar size has no inherent ordering among its
 * battery-size series, so ranking by value is the more readable default.
 * Filters out a null value (a solarKW/batteryKWh combination the sweep
 * didn't happen to cover) rather than rendering an empty or NaN row.
 */
export function npvChartTooltipRows(payload) {
  return payload
    .filter((p) => p.value != null)
    .map((p) => ({ key: p.dataKey, name: p.name, value: money(p.value), color: p.color, sortValue: p.value }))
    .sort((a, b) => b.sortValue - a.sortValue);
}

/** Follows the horizon-stage payback convention: an absolute year, annotated only when it lands past the ownership horizon. */
function formatPayback(point, horizonYears) {
  if (point.paybackYear == null) return "Not within the search window";
  if (point.paybackYear === 0) return "Immediate";
  const base = `${point.paybackYear.toFixed(1)} yr`;
  return point.paybackBeyondHorizon ? `${base} (beyond your ${horizonYears}-yr horizon)` : base;
}

export function PickCard({ title, point, horizonYears, onAdd, household }) {
  return (
    <div style={{ ...card, padding: "12px 14px", flex: "1 1 220px", minWidth: 0 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: color.muted,
          margin: "0 0 6px",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {title}
      </h3>
      {point ? (
        <>
          <p style={{ fontSize: 13, fontWeight: 700, color: color.ink, margin: "0 0 4px" }}>{describeSizes(point.sizes)}</p>
          <p style={{ fontSize: 12, color: color.body, margin: "0 0 2px" }}>
            <Term id="upfront-cost">Upfront</Term> {money(point.upfront)} · <Term id="npv">NPV</Term> {money(point.npv)}
          </p>
          <p style={{ fontSize: 11.5, color: color.muted, margin: "0 0 8px" }}>
            <Term id="payback">Payback</Term>: {formatPayback(point, horizonYears)}
          </p>
          <button
            type="button"
            style={{ ...buttonPrimary, width: "100%", minHeight: 30, fontSize: 11.5 }}
            onClick={() => onAdd(point)}
          >
            Add as configuration
          </button>
        </>
      ) : (
        <p style={{ fontSize: 12, color: color.muted, margin: 0 }}>
          No eligible point -- every swept size exceeds {utilityNameFor(household)}'s size cap.
        </p>
      )}
    </div>
  );
}

/** NPV against solar array size, one line per battery size -- the no-wind slice of the grid only (a 3rd swept dimension has nowhere to go on a 2D line chart). */
function NpvBySolarChart({ points }) {
  const noWindPoints = points.filter((p) => p.sizes.windPresetId == null);
  if (noWindPoints.length === 0) return null;

  const batterySizes = [...new Set(noWindPoints.map((p) => p.sizes.batteryKWh))].sort((a, b) => a - b);
  const solarValues = [...new Set(noWindPoints.map((p) => p.sizes.solarKW))].sort((a, b) => a - b);
  if (solarValues.length < 2) return null;

  const data = solarValues.map((solarKW) => {
    const row = { solarKW };
    for (const batteryKWh of batterySizes) {
      const point = noWindPoints.find((p) => p.sizes.solarKW === solarKW && p.sizes.batteryKWh === batteryKWh);
      row[`b${batteryKWh}`] = point ? Math.round(point.npv) : null;
    }
    return row;
  });

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={chartTitle}>Return by system size</h3>
      <div style={{ width: "100%", minWidth: 0, height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} debounce={0}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} vertical={false} />
            <XAxis
              dataKey="solarKW"
              tick={{ fontSize: 11, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v} kW`}
              label={{ value: "Solar array size (kW-DC)", position: "insideBottom", offset: -2, style: axisLabelStyle }}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: color.muted }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)}
              label={{ value: "NPV over your horizon ($)", position: "insideTopLeft", offset: 8, style: axisLabelStyle }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: CHART_TOOLTIP_Z_INDEX }}
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) return null;
                return <ChartTip active={active} label={`${label} kW solar`} rows={npvChartTooltipRows(payload)} />;
              }}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10.5 }} itemSorter={false} />
            {batterySizes.map((batteryKWh, i) => (
              <Line
                key={batteryKWh}
                type="monotone"
                dataKey={`b${batteryKWh}`}
                name={`${batteryKWh} kWh battery`}
                stroke={offerColor(i)}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
        <Term id="npv">Net present value</Term> against solar array size, one line per battery size (no-wind points
        only).
      </p>
    </div>
  );
}

/** Upfront cost against NPV for every swept point -- the cost/value frontier. Size-cap-exceeding points render grayed. */
export function FrontierScatter({ points, household }) {
  const eligible = points.filter((p) => !p.exceedsSizeCap);
  const capped = points.filter((p) => p.exceedsSizeCap);

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={chartTitle}>Cost versus return</h3>
      <div style={{ width: "100%", minWidth: 0, height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} debounce={0}>
          <ScatterChart margin={{ top: 6, right: 8, bottom: 18, left: 4 }}>
            <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} />
            <XAxis
              type="number"
              dataKey="upfront"
              name="Upfront"
              tick={{ fontSize: 11, fill: color.muted }}
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              axisLine={false}
              tickLine={false}
              label={{ value: "Upfront cost ($)", position: "insideBottom", offset: -2, style: axisLabelStyle }}
            />
            <YAxis
              type="number"
              dataKey="npv"
              name="NPV"
              tick={{ fontSize: 10.5, fill: color.muted }}
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              axisLine={false}
              tickLine={false}
              width={64}
              label={{ value: "NPV over your horizon ($)", position: "insideTopLeft", offset: 8, style: axisLabelStyle }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: CHART_TOOLTIP_Z_INDEX }}
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <ChartTip
                    active={active}
                    label={describeSizesText(p.sizes)}
                    rows={[
                      { key: "upfront", name: "Upfront", value: money(p.upfront) },
                      { key: "npv", name: "NPV", value: money(p.npv) },
                    ]}
                  />
                );
              }}
            />
            <Scatter data={eligible} fill={color.accent} isAnimationActive={false} />
            <Scatter data={capped} fill={color.faint} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
        Every swept point: <Term id="upfront-cost">upfront cost</Term> against{" "}
        <Term id="npv">net present value</Term>. Grayed points exceed {utilityNameFor(household)}'s trailing-12-month
        size cap; {utilityNameFor(household)} rejects an interconnection application sized above that outright.
      </p>
    </div>
  );
}

export function Top5Table({ points, horizonYears, onAdd, household }) {
  const top5 = [...points].sort((a, b) => b.npv - a.npv).slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>Sizes</th>
            <th style={{ ...th, textAlign: "right" }}>
              <Term id="upfront-cost">Upfront</Term>
            </th>
            <th style={{ ...th, textAlign: "right" }}>
              <Term id="npv">NPV</Term>
            </th>
            <th style={{ ...th, textAlign: "right" }}>
              <Term id="payback">Payback</Term>
            </th>
            <th style={{ ...th, textAlign: "right" }}>
              <Term id="year1-savings">Year-1 savings</Term>
            </th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {top5.map((p, i) => (
            <tr key={i} style={{ opacity: p.exceedsSizeCap ? 0.5 : 1 }}>
              <td style={td}>
                {describeSizes(p.sizes)}
                {p.exceedsSizeCap && (
                  <span style={{ color: color.caution, fontSize: 10.5, marginLeft: 6, whiteSpace: "nowrap" }}>
                    exceeds {utilityNameFor(household)} size cap
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(p.upfront)}</td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(p.npv)}</td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatPayback(p, horizonYears)}
              </td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {signedMoney(p.year1Savings)}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                <button type="button" style={{ ...button, fontSize: 10.5, padding: "4px 8px" }} onClick={() => onAdd(p)}>
                  Add
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExplorerSection({ household, assumptions, existingConfigs, onAddConfig }) {
  const [solarOn, setSolarOn] = useState(true);
  const [batteryOn, setBatteryOn] = useState(true);
  const [windTicked, setWindTicked] = useState(() => new Set());
  const [solarIncentivePerKW, setSolarIncentivePerKW] = useState(0);
  const [batteryIncentivePerKWh, setBatteryIncentivePerKWh] = useState(0);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricing, setPricing] = useState(() => ({ ...DEFAULT_PRICING_ASSUMPTIONS }));

  const [points, setPoints] = useState(null);
  // {bestNpv, bestPayback}, tracked separately from `points` rather than
  // re-derived from it on every render: a restored, size-capped record (see
  // model/storage.js's saveExplorerResult) trims `points` down to its own
  // top 5 by NPV, but still carries the true best-of-the-full-sweep picks
  // computed before that trim -- recomputing bestByNpv/bestByPayback from
  // just the trimmed 5 would silently answer a smaller question.
  const [picks, setPicks] = useState(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  // True only when a stored sweep exists but its own inputsHash no longer
  // matches the current inputs -- set once at mount, cleared the moment a
  // fresh explore runs (its own result, live or restored, supersedes the
  // notice either way).
  const [staleNotice, setStaleNotice] = useState(false);

  const workerRef = useRef(null);
  const latestRequestIdRef = useRef(0);
  // The {household, assumptions} hash the current in-flight (or most
  // recently completed) sweep was launched against; null when no request is
  // outstanding. sweepIsStale compares this against the live hash to decide
  // whether the current or just-arrived result still describes the current
  // inputs.
  const requestHashRef = useRef(null);

  // Includes the incentive rate inputs and the "Pricing assumptions" group
  // (both local to this component, not part of household/assumptions) so
  // changing any of them invalidates a cached/completed sweep the identical
  // way changing household or assumptions does -- a sweep run against the
  // old rates/pricing would otherwise keep showing NPV/payback figures (and,
  // for pricing, upfront/O&M/replacement figures) that no longer reflect
  // what "Add as configuration" would price.
  const inputsHash = useMemo(
    () => hashValue({ household, assumptions, solarIncentivePerKW, batteryIncentivePerKWh, pricing }),
    [household, assumptions, solarIncentivePerKW, batteryIncentivePerKWh, pricing],
  );

  // Re-synced on every render (not just inside an effect) so it is already
  // current by the time any callback -- worker.onmessage in particular --
  // reads it during this same render's commit.
  const liveInputsHashRef = useRef(inputsHash);
  liveInputsHashRef.current = inputsHash;

  useEffect(() => {
    if (sweepIsStale(requestHashRef.current, inputsHash)) {
      workerRef.current?.terminate();
      workerRef.current = null;
      requestHashRef.current = null;
      setPoints(null);
      setPicks(null);
      setPending(false);
      setProgress(null);
      setError(null);
    }
  }, [inputsHash]);

  // Unmount (including navigating away): cancel any in-flight sweep outright
  // rather than let it keep burning CPU for a result nothing will read.
  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  // Restore-on-mount, once: a stored sweep (model/storage.js's
  // loadExplorerResult) whose own inputsHash still matches what's live right
  // now is rendered as-is with no sweep run at all -- re-running a full
  // sizing scan on every page load would be a surprise CPU cost the user
  // didn't ask for. requestHashRef is set to that same hash so the
  // inputs-changed effect above invalidates a restored result exactly the
  // same way it would a freshly completed one. A stored record for
  // different inputs is left alone (staleNotice below) rather than shown or
  // silently discarded, so a returning user who changed something knows why
  // nothing appeared.
  useEffect(() => {
    const stored = loadExplorerResult();
    if (!stored) return;
    if (stored.inputsHash === inputsHash) {
      requestHashRef.current = stored.inputsHash;
      setPoints(stored.points || []);
      setPicks(stored.picks || null);
      // A hash match already implies stored.pricing deep-equals the
      // just-mounted default (inputsHash folds pricing in above), so this is
      // a no-op today -- explicit anyway, so a restored record's own pricing
      // is what's actually showing, not merely something that happens to
      // match it.
      if (stored.pricing) setPricing(stored.pricing);
    } else {
      setStaleNotice(true);
    }
    // Intentionally mount-only: this restores whatever was saved against the
    // inputs current at first render, not on every later inputsHash change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWind(id) {
    setWindTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runExplore() {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../worker/calcWorker.js", import.meta.url), { type: "module" });
    workerRef.current = worker;

    const grid = generateSweepGrid({ categories: { solar: solarOn, battery: batteryOn, wind: [...windTicked] } });
    const requestId = (latestRequestIdRef.current += 1);
    // The hash this specific request targets, fixed at launch -- distinct
    // from liveInputsHashRef, which keeps moving if inputs change again
    // before this request's response arrives.
    const requestHash = inputsHash;
    requestHashRef.current = requestHash;

    setError(null);
    setPoints(null);
    setPicks(null);
    setStaleNotice(false);
    setPending(true);
    setProgress({ done: 0, total: grid.length });

    worker.onmessage = (event) => {
      const { id, progress: prog, output, error: workerError } = event.data;
      if (id !== latestRequestIdRef.current) return; // superseded by a newer request (or cancelled)
      if (prog) {
        setProgress(prog);
        return;
      }
      setPending(false);
      // Second guard against a stale result, beyond the id check above: the
      // inputs-changed effect terminates the worker as soon as inputsHash
      // moves, but a message already in the event queue at that moment can
      // still be delivered here afterward. liveInputsHashRef.current is read
      // fresh (not the inputsHash captured when this closure was created),
      // so this catches that race even though the effect's termination
      // closes the same race in the common case.
      if (sweepIsStale(requestHash, liveInputsHashRef.current)) return;
      if (workerError) {
        setError(workerError.message);
      } else if (output?.error) {
        setError(output.error);
      } else {
        const nextPicks = { bestNpv: bestByNpv(output.points), bestPayback: bestByPayback(output.points) };
        setPoints(output.points);
        setPicks(nextPicks);
        saveExplorerResult({
          inputsHash: requestHash,
          completedAt: Date.now(),
          points: output.points,
          picks: nextPicks,
          pricing,
        });
      }
    };

    // Fires when the worker script itself fails to load or throws at top
    // level (a dead dev server, a bad deploy) -- no message ever arrives in
    // that case, so without this the progress bar sits at 0 forever.
    worker.onerror = (event) => {
      if (requestId !== latestRequestIdRef.current) return;
      setPending(false);
      setError(
        "The sizing sweep could not start (its background script failed to load). " +
          "Check your connection to the app, reload the page, and try again." +
          (event?.message ? ` Details: ${event.message}` : "")
      );
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    const incentives = incentivesFromRates(solarIncentivePerKW, batteryIncentivePerKWh);
    const pricingAssumptions = toSweepPricingAssumptions(pricing);
    worker.postMessage({ kind: "sweep", id: requestId, household, assumptions, grid, incentives, pricingAssumptions });
  }

  function handleAdd(point) {
    const incentives = incentivesFromRates(solarIncentivePerKW, batteryIncentivePerKWh);
    onAddConfig(configFromSweepPoint(point, existingConfigs, incentives, toSweepPricingAssumptions(pricing)));
  }

  // Falls back to deriving picks straight from `points` only for a restored
  // record saved before `picks` existed (or one that failed to save it for
  // any other reason) -- the live-sweep path above always sets both
  // together, so this fallback never runs against a truncated top-5-only
  // point list from a fresh run, only ever a restored one.
  const bestNpv = picks ? picks.bestNpv : points ? bestByNpv(points) : null;
  const bestPayback = picks ? picks.bestPayback : points ? bestByPayback(points) : null;
  const nothingTicked = !solarOn && !batteryOn && windTicked.size === 0;

  return (
    <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: color.ink, margin: "0 0 4px" }}>Sizing explorer</h2>
      <p style={{ fontSize: 12, color: color.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
        Start here if you don't yet have quotes or hardware in mind: a broad first-pass scan across solar, battery,
        and wind sizes, before you build a specific configuration below with real equipment and financing. Results
        rank sizes under the adjustable pricing assumptions below (O&amp;M and any inverter replacement included) --
        once a size looks worth pursuing, promote it to a configuration for a real quote and further refinement.
      </p>

      <PricingAssumptionsGroup open={pricingOpen} onToggle={() => setPricingOpen((v) => !v)} pricing={pricing} onChange={setPricing} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body }}>
          <input
            type="checkbox"
            checked={solarOn}
            onChange={(e) => setSolarOn(e.target.checked)}
            style={{ accentColor: color.accent }}
          />
          Solar (0-14 <Term id="kw">kW</Term>)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body }}>
          <input
            type="checkbox"
            checked={batteryOn}
            onChange={(e) => setBatteryOn(e.target.checked)}
            style={{ accentColor: color.accent }}
          />
          Battery (0-30 <Term id="kwh">kWh</Term>, plus equipment presets)
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: color.body, display: "block", marginBottom: 4 }}>Wind, per turbine model:</span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {WIND_TURBINE_PRESETS.map((preset) => (
            <label key={preset.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body }}>
              <input
                type="checkbox"
                checked={windTicked.has(preset.id)}
                onChange={() => toggleWind(preset.id)}
                style={{ accentColor: color.accent }}
              />
              {preset.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <Field field={SOLAR_INCENTIVE_FIELD} value={solarIncentivePerKW} onChange={(v) => setSolarIncentivePerKW(v ?? 0)} compact />
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <Field field={BATTERY_INCENTIVE_FIELD} value={batteryIncentivePerKWh} onChange={(v) => setBatteryIncentivePerKWh(v ?? 0)} compact />
        </div>
      </div>

      <button
        type="button"
        onClick={runExplore}
        disabled={pending || nothingTicked}
        style={{ ...buttonPrimary, width: "100%", minHeight: 36, opacity: pending || nothingTicked ? 0.6 : 1 }}
      >
        {pending ? "Exploring…" : "Explore sizing"}
      </button>

      {!points && !pending && staleNotice && (
        <p style={{ fontSize: 12, color: color.muted, marginTop: 10 }}>
          Results from a previous visit no longer match your inputs.
        </p>
      )}

      {pending && progress && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          <div style={{ height: 6, borderRadius: 3, background: color.tint, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                background: color.accent,
                transition: "width 120ms linear",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: color.muted, margin: "4px 0 0" }}>
            {progress.done} / {progress.total} sizes checked
          </p>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: color.negative, marginTop: 10 }}>{error}</p>}

      {points && points.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <PickCard
              title={
                <>
                  Best <Term id="npv">NPV</Term>
                </>
              }
              point={bestNpv}
              horizonYears={assumptions.horizonYears}
              onAdd={handleAdd}
              household={household}
            />
            <PickCard
              title={
                <>
                  Best <Term id="payback">payback</Term>
                </>
              }
              point={bestPayback}
              horizonYears={assumptions.horizonYears}
              onAdd={handleAdd}
              household={household}
            />
          </div>

          <NpvBySolarChart points={points} />
          <FrontierScatter points={points} household={household} />

          <h3 style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, margin: "12px 0 6px" }}>
            Top 5 by <Term id="npv">NPV</Term>
          </h3>
          <Top5Table points={points} horizonYears={assumptions.horizonYears} onAdd={handleAdd} household={household} />
        </div>
      )}

      {points && points.length === 0 && (
        <p style={{ fontSize: 12, color: color.muted, marginTop: 10 }}>
          No sizes to compare -- check at least one category above.
        </p>
      )}
    </div>
  );
}

const th = {
  textAlign: "left",
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  color: color.muted,
  padding: "0 10px 5px 0",
  borderBottom: `1px solid ${color.hairline}`,
  whiteSpace: "nowrap",
};

const td = {
  padding: "6px 10px 6px 0",
  color: color.body,
  borderBottom: `1px solid ${color.hairline}`,
  verticalAlign: "top",
};
