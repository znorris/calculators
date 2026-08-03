// List editor for one config's solar arrays. Patterned on
// compensation-comparison/components/ListEditor.jsx (a rule between items,
// no per-item card chrome) but bespoke rather than descriptor-driven: a solar
// array's advanced fields need a per-row collapse, which the generic
// ListEditor has no concept of.
//
// Arrays carry no `id` in model/schema.js's shape, so rows are keyed and
// addressed by index. That is safe for add/edit/remove-by-index here, but it
// does mean a row's expanded/collapsed advanced state (keyed the same way)
// can end up attached to the wrong row after a remove shifts indices below
// it -- a cosmetic reset of that row's collapse state, not a data bug.

import { useState } from "react";
import { Field } from "./Field.jsx";
import { NumInput } from "./NumInput.jsx";
import { Term } from "../../shared/Term.jsx";
import { newSolarArray, SOLAR_COST_DEFAULTS } from "../model/schema.js";
// From calc/solarDefaults.js directly (not calc/solar.js, which re-exports
// these two names but also statically imports data/solar-shapes.json, a
// ~2.4 MB PVWatts hourly grid this editor never needs): importing the
// smaller module keeps that grid out of the main bundle.
import { DEFAULT_INVERTER_EFF, DEFAULT_LOSS_FRAC } from "../calc/solarDefaults.js";
import { color, button, iconButton, label as labelStyle, help as helpStyle } from "../theme.js";

const INVERTER_FIELD = {
  id: "inverterEff",
  type: "percent",
  label: "Inverter efficiency",
  help: `Baseline shape already assumes ${Math.round(DEFAULT_INVERTER_EFF * 100)}%; this scales relative to that baseline.`,
};

const LOSS_FIELD = {
  id: "lossFrac",
  type: "percent",
  label: "System loss stack",
  help: `Baseline shape already assumes a ${Math.round(DEFAULT_LOSS_FRAC * 100)}% loss stack; this scales relative to that baseline.`,
};

const DEGRADATION_FIELD = {
  id: "degradationRate",
  type: "percent",
  label: "Annual degradation",
  help: `Compounds year over year. Default for a new array is ${(SOLAR_COST_DEFAULTS.degradationRateDefault * 100).toFixed(2)}%/yr.`,
};

export function SolarArraysEditor({ arrays, onChange }) {
  const [openAdvanced, setOpenAdvanced] = useState(() => new Set());

  function update(i, patch) {
    onChange(arrays.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function remove(i) {
    onChange(arrays.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...arrays, newSolarArray()]);
  }

  function toggleAdvanced(i) {
    setOpenAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div>
      <style>{`
        .esc-solar-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .esc-solar-row > div { flex: 1 1 90px; min-width: 0; }
        @media (max-width: 720px) {
          .esc-solar-row { flex-direction: column; }
          .esc-solar-row > div { flex: 1 1 auto; }
        }
      `}</style>

      {arrays.map((array, i) => (
        <div
          key={i}
          style={{
            borderBottom: i < arrays.length - 1 ? `1px solid ${color.hairline}` : "none",
            paddingBottom: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase" }}>
              Array {i + 1}
            </span>
            <button type="button" onClick={() => remove(i)} style={iconButton} aria-label={`Remove array ${i + 1}`}>
              Remove
            </button>
          </div>

          <div className="esc-solar-row" style={{ marginBottom: 6 }}>
            <div>
              <label style={labelStyle}>
                <Term id="kw-dc">kW DC</Term>
              </label>
              <NumInput
                value={array.kwDC}
                onChange={(v) => update(i, { kwDC: v ?? 0 })}
                suffix="kW"
                ariaLabel={`Array ${i + 1} kW DC`}
              />
            </div>
            <div>
              <label style={labelStyle}>Tilt</label>
              <NumInput
                value={array.tilt}
                onChange={(v) => update(i, { tilt: v ?? 0 })}
                suffix="°"
                ariaLabel={`Array ${i + 1} tilt`}
              />
            </div>
            <div>
              <label style={labelStyle}>Azimuth</label>
              <NumInput
                value={array.azimuth}
                onChange={(v) => update(i, { azimuth: v ?? 0 })}
                suffix="°"
                ariaLabel={`Array ${i + 1} azimuth`}
              />
            </div>
          </div>
          <p style={helpStyle}>
            Azimuth is measured clockwise from north: 180° faces due south. Production is interpolated from a
            modeled tilt/azimuth grid; values past its edge are clamped rather than extrapolated.
          </p>

          <button
            type="button"
            onClick={() => toggleAdvanced(i)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginTop: 4,
              fontSize: 11,
              fontWeight: 600,
              color: color.accent,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {openAdvanced.has(i) ? "Hide advanced" : "Advanced"}
          </button>

          {openAdvanced.has(i) && (
            <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${color.hairline}` }}>
              <Field field={INVERTER_FIELD} value={array.inverterEff} onChange={(v) => update(i, { inverterEff: v })} compact />
              <Field field={LOSS_FIELD} value={array.lossFrac} onChange={(v) => update(i, { lossFrac: v })} compact />
              <Field
                field={DEGRADATION_FIELD}
                value={array.degradationRate}
                onChange={(v) => update(i, { degradationRate: v })}
                compact
              />
            </div>
          )}
        </div>
      ))}

      <button type="button" onClick={add} style={{ ...button, width: "100%", minHeight: 36 }}>
        Add array
      </button>
    </div>
  );
}
