// List editor for one config's wind turbines. Same row-with-a-rule pattern as
// SolarArraysEditor.jsx / compensation-comparison's ListEditor.jsx.
//
// Turbines carry no `id` in model/schema.js's shape, so rows are addressed by
// index (see SolarArraysEditor.jsx for the same tradeoff).

import { useId } from "react";
import { NumInput } from "./NumInput.jsx";
import { HelpIcon } from "./Field.jsx";
import { WIND_TURBINE_PRESETS, DEFAULT_ANNUAL_MEAN_WIND_MS, newTurbine } from "../model/schema.js";
import { color, button, iconButton, label as labelStyle, help as helpStyle, input as inputStyle } from "../theme.js";

function presetOptions() {
  return WIND_TURBINE_PRESETS.map((p) => ({ value: p.id, label: p.label }));
}

export function WindEditor({ turbines, onChange }) {
  const idBase = useId();

  function update(i, patch) {
    onChange(turbines.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function remove(i) {
    onChange(turbines.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...turbines, newTurbine()]);
  }

  function changePreset(i, presetId) {
    // Refill the equipment-derived fields (power curve, default hub height)
    // from the new preset; annualMeanWindMS is a site measurement, not an
    // equipment spec, so it is left as the user entered it.
    const seeded = newTurbine(presetId);
    update(i, { presetId: seeded.presetId, powerCurve: seeded.powerCurve, hubHeightM: seeded.hubHeightM });
  }

  return (
    <div>
      <style>{`
        .esc-wind-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .esc-wind-row > div { flex: 1 1 130px; min-width: 0; }
        @media (max-width: 720px) {
          .esc-wind-row { flex-direction: column; }
          .esc-wind-row > div { flex: 1 1 auto; }
        }
      `}</style>

      {turbines.map((turbine, i) => {
        const preset = WIND_TURBINE_PRESETS.find((p) => p.id === turbine.presetId);
        return (
          <div
            key={i}
            style={{
              borderBottom: i < turbines.length - 1 ? `1px solid ${color.hairline}` : "none",
              paddingBottom: 8,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase" }}>
                Turbine {i + 1}
              </span>
              <button type="button" onClick={() => remove(i)} style={iconButton} aria-label={`Remove turbine ${i + 1}`}>
                Remove
              </button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Turbine model</label>
              <select
                value={turbine.presetId || ""}
                onChange={(e) => changePreset(i, e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}
                aria-label={`Turbine ${i + 1} model`}
              >
                {presetOptions().map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {preset?.notes && <p style={helpStyle}>{preset.notes}</p>}
            </div>

            <div className="esc-wind-row">
              <div>
                <label style={labelStyle}>Hub height</label>
                <NumInput
                  value={turbine.hubHeightM}
                  onChange={(v) => update(i, { hubHeightM: v ?? 0 })}
                  suffix="m"
                  ariaLabel={`Turbine ${i + 1} hub height`}
                />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <label style={labelStyle}>Annual mean wind speed at 10 m</label>
                  <HelpIcon
                    id={`${idBase}-wind-speed-${i}`}
                    text="Hub height is extrapolated up from this 10 m measurement with a wind-shear correction, so a taller tower raises modeled output roughly with the cube of the speed gain."
                  />
                </div>
                <NumInput
                  value={turbine.annualMeanWindMS}
                  onChange={(v) => update(i, { annualMeanWindMS: v ?? 0 })}
                  suffix="m/s"
                  ariaLabel={`Turbine ${i + 1} annual mean wind speed at 10 m`}
                  describedBy={`${idBase}-wind-speed-${i}`}
                />
              </div>
            </div>
            <p style={{ ...helpStyle, background: color.cautionSoft, color: color.caution, padding: "5px 7px", borderRadius: 5, marginTop: 6 }}>
              The Central Valley floor is a weak wind resource: a starting estimate of {DEFAULT_ANNUAL_MEAN_WIND_MS}{" "}
              m/s at 10 m is typical of the valley floor, well below what a good small-wind site elsewhere needs to
              pay back. Enter a site-measured average if one is available.
            </p>
          </div>
        );
      })}

      <button type="button" onClick={add} style={{ ...button, width: "100%", minHeight: 36 }}>
        Add turbine
      </button>
    </div>
  );
}
