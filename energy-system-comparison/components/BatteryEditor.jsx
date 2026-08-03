// One config's battery: none, a named preset from data/equipment-presets.json,
// or a hand-entered custom size. `battery` is the whole slice (or null), not
// a list -- a config models at most one battery.

import { useId } from "react";
import { NumInput } from "./NumInput.jsx";
import { Field, HelpIcon } from "./Field.jsx";
import { Term } from "../../shared/Term.jsx";
import {
  BATTERY_PRESETS,
  DEFAULT_BATTERY_RESERVE_FRAC,
  DEFAULT_GRID_CHARGE,
  DEFAULT_DISPATCH,
  batteryFromPreset,
} from "../model/schema.js";
import { color, label as labelStyle, help as helpStyle, input as inputStyle } from "../theme.js";

const RESERVE_FIELD = {
  id: "reserveFrac",
  type: "percent",
  label: "Reserve floor",
  help: "Capacity held back from self-consumption dispatch, so the battery keeps some charge for an outage. A dispatch setting, not a hardware spec, so it never flips the preset to Custom.",
};

/** Hour-of-day options for the grid-charge window selects, 0 ("12:00 am") through 23 ("11:00 pm"). */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "am" : "pm"}`,
}));

const GRID_CHARGE_ENABLED_FIELD = {
  id: "gridChargeEnabled",
  type: "bool",
  label: "Enable grid charging",
};

const GRID_CHARGE_START_FIELD = {
  id: "windowStartHour",
  type: "enum",
  label: "Window start",
  placeholder: false,
  options: HOUR_OPTIONS,
};

const GRID_CHARGE_END_FIELD = {
  id: "windowEndHour",
  type: "enum",
  label: "Window end",
  placeholder: false,
  options: HOUR_OPTIONS,
};

const GRID_CHARGE_TARGET_FIELD = {
  id: "targetSocFrac",
  type: "percent",
  label: (
    <>
      Target <Term id="soc">state of charge</Term>
    </>
  ),
  help: "How full the battery tries to stay (its state of charge, SoC) during the window; grid charging stops once it's reached (or the deficit runs out on its own).",
};

const DISPATCH_MODE_FIELD = {
  id: "dispatchMode",
  type: "enum",
  label: "Dispatch strategy",
  placeholder: false,
  options: [
    { value: "self-consumption", label: "Self-consumption" },
    { value: "peak-shave", label: "Peak shaving" },
  ],
  help: "Self-consumption discharges against every deficit hour. Peak shaving instead saves stored energy for whichever hours would otherwise cross the threshold below, to hold down this schedule's demand charge.",
};

function selectValue(battery) {
  if (!battery) return "none";
  return battery.presetId ? battery.presetId : "custom";
}

function isEstimated(preset, fieldId) {
  return !!preset?.estimatedFields?.includes(fieldId);
}

/** A field label, with an "(estimated)" flag when the active preset marks that figure as not manufacturer-disclosed. */
function hardwareLabel(base, preset, fieldId) {
  return isEstimated(preset, fieldId) ? `${base} (estimated)` : base;
}

export function BatteryEditor({ battery, hasGeneration = true, hasDemandCharge = false, baselinePeakKW = null, onChange }) {
  const preset = battery?.presetId ? BATTERY_PRESETS.find((p) => p.id === battery.presetId) : null;
  const roundTripHelpId = `${useId()}-round-trip-eff`;

  function handlePresetSelect(raw) {
    if (raw === "none") {
      onChange(null);
      return;
    }
    if (raw === "custom") {
      const base = battery || batteryFromPreset(BATTERY_PRESETS[0]?.id);
      onChange({ ...base, presetId: null });
      return;
    }
    onChange(batteryFromPreset(raw));
  }

  /** Any edit to a hardware-spec field drops presetId, so the picker reads "Custom" the moment a figure diverges from the preset it came from. */
  function updateHardware(patch) {
    onChange({ ...battery, ...patch, presetId: null });
  }

  function updateReserve(v) {
    onChange({ ...battery, reserveFrac: v });
  }

  /** A dispatch setting like reserveFrac, not a hardware spec, so it never flips the preset to Custom either. */
  function updateGridCharge(patch) {
    onChange({ ...battery, gridCharge: { ...(battery.gridCharge || DEFAULT_GRID_CHARGE), ...patch } });
  }

  /** Also a dispatch setting, not a hardware spec -- never flips the preset to Custom. */
  function updateDispatch(patch) {
    onChange({ ...battery, dispatch: { ...(battery.dispatch || DEFAULT_DISPATCH), ...patch } });
  }

  const gridCharge = battery?.gridCharge || DEFAULT_GRID_CHARGE;
  const gridChargeEnabled = !!gridCharge.enabled;
  const dispatch = battery?.dispatch || DEFAULT_DISPATCH;
  const isPeakShave = dispatch.mode === "peak-shave";

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Battery</label>
        <select
          value={selectValue(battery)}
          onChange={(e) => handlePresetSelect(e.target.value)}
          style={{ ...inputStyle, appearance: "auto" }}
        >
          <option value="none">None</option>
          {BATTERY_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {preset && <p style={helpStyle}>Chemistry: {preset.chemistry}</p>}
        {!preset && battery && <p style={helpStyle}>Custom size. Chemistry is only tracked for a named preset.</p>}
      </div>

      {battery && !hasGeneration && !gridChargeEnabled && (
        <p style={{ ...helpStyle, background: "#fffbeb", color: color.caution, padding: "6px 8px", borderRadius: 5, marginBottom: 8 }}>
          The battery only charges from on-site solar or wind surplus unless grid charging (below) is turned on, so
          without generation and with grid charging off it does not change the bill.
        </p>
      )}

      {battery && (
        <>
          <NumInput
            value={battery.usableKWh}
            onChange={(v) => updateHardware({ usableKWh: v ?? 0 })}
            suffix="kWh"
            ariaLabel="Usable capacity"
          />
          <p style={{ ...labelStyle, marginTop: -3 }}>{hardwareLabel("Usable capacity", preset, "usableKWh")}</p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <label style={labelStyle}>{hardwareLabel("Round-trip efficiency", preset, "roundTripEff")}</label>
                <HelpIcon
                  id={roundTripHelpId}
                  text="The engine dispatches with separate charge and discharge legs, each the square root of this round-trip figure, since a manufacturer publishes only the combined number."
                />
              </div>
              <NumInput
                value={battery.roundTripEff == null ? null : Math.round(battery.roundTripEff * 1000) / 10}
                onChange={(v) => updateHardware({ roundTripEff: v == null ? 0 : v / 100 })}
                suffix="%"
                ariaLabel="Round-trip efficiency"
                describedBy={roundTripHelpId}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <label style={labelStyle}>{hardwareLabel("Max charge power", preset, "maxChargeKW")}</label>
              <NumInput
                value={battery.maxChargeKW}
                onChange={(v) => updateHardware({ maxChargeKW: v ?? 0 })}
                suffix="kW"
                ariaLabel="Max charge power"
              />
            </div>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <label style={labelStyle}>{hardwareLabel("Max discharge power", preset, "maxDischargeKW")}</label>
              <NumInput
                value={battery.maxDischargeKW}
                onChange={(v) => updateHardware({ maxDischargeKW: v ?? 0 })}
                suffix="kW"
                ariaLabel="Max discharge power"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <label style={labelStyle}>{hardwareLabel("Cycle life", preset, "cycleLife")}</label>
              <NumInput
                value={battery.cycleLife}
                onChange={(v) => updateHardware({ cycleLife: v ?? 0 })}
                suffix="cycles"
                ariaLabel="Cycle life"
              />
            </div>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <label style={labelStyle}>{hardwareLabel("Calendar life", preset, "calendarLifeYears")}</label>
              <NumInput
                value={battery.calendarLifeYears}
                onChange={(v) => updateHardware({ calendarLifeYears: v ?? 0 })}
                suffix="yrs"
                ariaLabel="Calendar life"
              />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <Field field={RESERVE_FIELD} value={battery.reserveFrac ?? DEFAULT_BATTERY_RESERVE_FRAC} onChange={updateReserve} compact />
          </div>

          {hasDemandCharge && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${color.hairline}` }}>
              <Field
                field={DISPATCH_MODE_FIELD}
                value={dispatch.mode}
                onChange={(v) => updateDispatch({ mode: v })}
                compact
              />
              {isPeakShave && (
                <div style={{ marginTop: 4 }}>
                  <label style={labelStyle}>Shave threshold</label>
                  <NumInput
                    value={dispatch.shaveThresholdKW}
                    onChange={(v) => updateDispatch({ shaveThresholdKW: v })}
                    placeholder={
                      baselinePeakKW != null ? `around your baseline peak, ${Math.round(baselinePeakKW)} kW` : ""
                    }
                    suffix="kW"
                    ariaLabel="Shave threshold"
                  />
                  <p style={helpStyle}>
                    The battery discharges only against the amount by which an hour's grid import would exceed this,
                    holding down the monthly demand charge instead of serving every deficit hour.
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${color.hairline}` }}>
            <label style={{ ...labelStyle, fontSize: 12, marginBottom: 6 }}>Grid charging</label>
            <Field field={GRID_CHARGE_ENABLED_FIELD} value={gridChargeEnabled} onChange={(v) => updateGridCharge({ enabled: v })} compact />

            {gridChargeEnabled && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                    <Field
                      field={GRID_CHARGE_START_FIELD}
                      value={gridCharge.windowStartHour}
                      onChange={(v) => updateGridCharge({ windowStartHour: v })}
                      compact
                    />
                  </div>
                  <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                    <Field
                      field={GRID_CHARGE_END_FIELD}
                      value={gridCharge.windowEndHour}
                      onChange={(v) => updateGridCharge({ windowEndHour: v })}
                      compact
                    />
                  </div>
                </div>
                <Field
                  field={GRID_CHARGE_TARGET_FIELD}
                  value={gridCharge.targetSocFrac}
                  onChange={(v) => updateGridCharge({ targetSocFrac: v ?? DEFAULT_GRID_CHARGE.targetSocFrac })}
                  compact
                />
              </>
            )}

            <p style={helpStyle}>
              Charging from the grid costs the retail rate for the hour it draws power and loses round-trip
              efficiency converting that energy to and from storage, so it only pays off when a cheaper window
              exists to buy from (a time-of-use custom tariff) or when the dispatch strategy above is set to
              peak shaving on a demand-charged schedule, keeping the battery topped up ahead of the peak it shaves.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
