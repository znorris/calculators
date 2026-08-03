// The site being served: which utility profile it's on, its rate schedule
// and riders, and (when the profile is a hand-built custom utility) the
// tariff itself. EV charging load lives here too -- it is household data
// with no other assigned owner among this calculator's input components.
//
// Riders are rendered as checkboxes but behave as a single-select radio
// group: LODI's SHARE/medical/senior-fixed-income riders share an
// exclusiveGroup (calc/tariffs/lodi.js), and calc/tariffs/profile.js's
// ridersTotalPercentOff() throws if two riders from the same group are both
// selected. Enforcing "at most one" here, for every profile, is the
// conservative reading of that rule rather than one this component tries to
// derive per rider set.

import { useMemo, useState } from "react";
import { Field } from "./Field.jsx";
import { UsageInput } from "./UsageInput.jsx";
import { Term } from "../../shared/Term.jsx";
import { SCHEDULE_OPTIONS, G1_PHASE_OPTIONS } from "../model/schema.js";
import { LODI_RIDERS } from "../calc/tariffs/lodi.js";
import { buildCustomProfile, validateProfile } from "../calc/tariffs/custom.js";
import { buildResearchPrompt, parseProfileImport, serializeProfile } from "../model/profileCodec.js";
import { parseSeries } from "../model/parseSeries.js";
import { copyText } from "../../shared/clipboard.js";
import { CopyFallbackPanel } from "../../shared/CopyFallbackPanel.jsx";
import { color, button, buttonPrimary, label as labelStyle, help as helpStyle, input as inputStyle, iconButton } from "../theme.js";

const PROFILE_OPTIONS = [
  { value: "lodi", label: "City of Lodi Electric Utility" },
  { value: "custom", label: "Custom utility" },
];

function G1EligibilityNote() {
  return (
    <>
      G1 is priced for accounts averaging under 8,000 <Term id="kwh">kWh</Term>/month; an account running above that
      belongs on G2.
    </>
  );
}

const SCHEDULE_FIELD = { id: "schedule", type: "enum", label: "Rate schedule", placeholder: false, options: SCHEDULE_OPTIONS };
const G1_PHASE_FIELD = { id: "g1Phase", type: "enum", label: "Service phase", placeholder: false, options: G1_PHASE_OPTIONS };

const EV_KWH_FIELD = { id: "kWhPerDay", type: "number", label: "Charging", help: "kWh/day, averaged over charging days." };
const EV_START_FIELD = { id: "windowStartHour", type: "int", label: "Window start", help: "Hour of day, 0-23." };
const EV_END_FIELD = { id: "windowEndHour", type: "int", label: "Window end", help: "Hour of day, 0-23." };
const EV_DAYS_FIELD = { id: "daysPerWeek", type: "int", label: "Days/week" };
const EV_RIDER_FIELD = {
  id: "riderMeter",
  type: "bool",
  label: (
    <>
      Separately metered on Schedule <Term id="ev">EV</Term>
    </>
  ),
};

function ProfileToggle({ profileId, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {PROFILE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            ...button,
            flex: 1,
            background: profileId === o.value ? color.accent : color.surface,
            color: profileId === o.value ? color.surface : color.body,
            borderColor: profileId === o.value ? color.accent : color.rule,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RiderPicker({ riders, selectedIds, onChange }) {
  if (!riders.length) return null;

  function toggle(id) {
    onChange(selectedIds.includes(id) ? [] : [id]);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>Bill discount riders</label>
      {riders.map((r) => (
        <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={selectedIds.includes(r.id)}
            onChange={() => toggle(r.id)}
            style={{ accentColor: color.accent }}
          />
          {r.label} ({Math.round(r.percentOff * 100)}% off)
        </label>
      ))}
      <p style={helpStyle}>Only one discount may apply per household; selecting one clears any other.</p>
    </div>
  );
}

/**
 * `isCustom` gates the Schedule EV rider-meter checkbox: it names a Lodi-only
 * rate schedule (calc/tariffs/lodi.js's EV), so it has nothing to mean
 * against a custom tariff, which has no such schedule at all. Rendering it
 * only for the Lodi profile keeps the form from offering a control that
 * would otherwise sit there doing nothing for a custom household --
 * model/schema.js's normalizeHousehold forces ev.riderMeter back to false
 * for a custom profile regardless, so this is a UI-visibility mirror of that
 * same rule, not the only place it's enforced.
 */
function EvSection({ ev, onChange, isCustom }) {
  function set(patch) {
    onChange({ ...ev, ...patch });
  }

  return (
    <div style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: 10, marginTop: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: color.body, marginBottom: 8 }}>
        <input type="checkbox" checked={ev.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ accentColor: color.accent }} />
        Electric vehicle (<Term id="ev">EV</Term>) charging load
      </label>
      {ev.enabled && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field field={EV_KWH_FIELD} value={ev.kWhPerDay} onChange={(v) => set({ kWhPerDay: v ?? 0 })} compact />
            </div>
            <div style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field field={EV_DAYS_FIELD} value={ev.daysPerWeek} onChange={(v) => set({ daysPerWeek: v ?? 0 })} compact />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field field={EV_START_FIELD} value={ev.windowStartHour} onChange={(v) => set({ windowStartHour: v ?? 0 })} compact />
            </div>
            <div style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field field={EV_END_FIELD} value={ev.windowEndHour} onChange={(v) => set({ windowEndHour: v ?? 0 })} compact />
            </div>
          </div>
          {!isCustom && <Field field={EV_RIDER_FIELD} value={ev.riderMeter} onChange={(v) => set({ riderMeter: v })} compact />}
        </>
      )}
    </div>
  );
}

// --- Custom-profile builder: fields shape exactly matches
// calc/tariffs/custom.js's buildCustomProfile() input. --------------------

const FIXED_CHARGE_FIELD = { id: "fixedChargePerMonth", type: "money", label: "Fixed charge / month" };
const FLAT_SUMMER_FIELD = {
  id: "summerRate",
  type: "money",
  label: (
    <>
      Summer rate ($/<Term id="kwh">kWh</Term>)
    </>
  ),
};
const FLAT_WINTER_FIELD = {
  id: "winterRate",
  type: "money",
  label: (
    <>
      Winter rate ($/<Term id="kwh">kWh</Term>)
    </>
  ),
};
const DEMAND_RATE_SUMMER_FIELD = {
  id: "summer",
  type: "money",
  label: (
    <>
      Demand rate, summer ($/<Term id="kw">kW</Term>)
    </>
  ),
};
const DEMAND_RATE_WINTER_FIELD = {
  id: "winter",
  type: "money",
  label: (
    <>
      Demand rate, winter ($/<Term id="kw">kW</Term>)
    </>
  ),
};
const NETTING_FIELD = { id: "netting", type: "enum", label: "Netting", placeholder: false, options: [{ value: "hourly", label: "Hourly" }, { value: "annual", label: "Annual (true-up)" }] };
const EXPORT_FLAT_FIELD = {
  id: "exportRateFlat",
  type: "money",
  label: (
    <>
      Export rate ($/<Term id="kwh">kWh</Term>)
    </>
  ),
};
const EXPORT_FRACTION_FIELD = {
  id: "exportRateFraction",
  type: "percent",
  label: "Export rate, as a % of the retail rate",
  help: "Credits every exporting hour at this fraction of that hour's own applicable retail rate (the TOU period's rate, the current tier's rate, or the season's flat rate).",
};
const LOCK_YEARS_FIELD = {
  id: "lockYears",
  type: "int",
  label: "Rate lock (years)",
  help: "Freezes the export rate at its starting value for this many years from interconnection before it begins escalating with the export rate trend assumption. Leave blank if this utility has no such lock.",
};
const TRUE_UP_RATE_FIELD = {
  id: "trueUpRate",
  type: "money",
  label: (
    <>
      Cash-out rate ($/<Term id="kwh">kWh</Term>)
    </>
  ),
};
const SYSTEM_SIZE_BASIS_FIELD = {
  id: "basis",
  type: "enum",
  label: "Basis",
  placeholder: false,
  options: [
    { value: "kW-DC-solar", label: "$/kW-DC solar" },
    { value: "kWh-battery", label: "$/kWh battery" },
  ],
};
const SYSTEM_SIZE_RATE_FIELD = { id: "ratePerMonth", type: "money", label: "$/month" };
const MINIMUM_BILL_FIELD = {
  id: "minimumBillPerMonth",
  type: "money",
  label: "Minimum bill / month",
  help: "A floor under the total bill even after riders and export credits are applied. Leave blank if this utility has no minimum bill.",
};
const SINGLE_PHASE_FEE_FIELD = { id: "singlePhase", type: "money", label: "Interconnection, single-phase" };
const THREE_PHASE_FEE_FIELD = { id: "threePhase", type: "money", label: "Interconnection, three-phase" };
const UTILITY_LABEL_FIELD = { id: "label", type: "text", label: "Utility name" };
const ADDER_LABEL_FIELD = { id: "label", type: "text", label: "Label" };
const ADDER_RATE_FIELD = {
  id: "valuePerKWh",
  type: "money",
  label: (
    <>
      $/<Term id="kwh">kWh</Term>
    </>
  ),
};
const ADDER_MODE_FIELD = {
  id: "mode",
  type: "enum",
  label: "Pricing",
  placeholder: false,
  options: [
    { value: "fixed", label: "Fixed $/kWh" },
    { value: "monthlyTable", label: "Monthly table" },
  ],
  help: "A flat rate every month, or a 12-month table (the same shape LEU's own ECA adder uses) -- pick monthly table for a supply/fuel adjustment charge that varies by calendar month.",
};
const RIDER_LABEL_FIELD = { id: "label", type: "text", label: "Label" };
const RIDER_PERCENT_FIELD = { id: "percentOff", type: "percent", label: "% off" };

/** Three tiers, matching LODI_EA's shape -- the only real tiered example this calculator models. Not a general N-tier builder. */
function TieredPricingFields({ pricing, onChange }) {
  const rates = pricing.rates?.length === 3 ? pricing.rates : [0, 0, 0];
  const bp = pricing.breakpoints || { summer: [0, 0], winter: [0, 0] };

  function setRate(i, v) {
    const next = rates.slice();
    next[i] = v ?? 0;
    onChange({ ...pricing, rates: next });
  }

  function setBreakpoint(season, i, v) {
    const next = { ...bp, [season]: (bp[season] || [0, 0]).slice() };
    next[season][i] = v ?? 0;
    onChange({ ...pricing, breakpoints: next });
  }

  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ flex: "1 1 90px", minWidth: 0 }}>
            <Field field={{ id: `rate${i}`, type: "money", label: `Tier ${i + 1} rate` }} value={rates[i]} onChange={(v) => setRate(i, v)} compact />
          </div>
          {i < 2 && (
            <>
              <div style={{ flex: "1 1 90px", minWidth: 0 }}>
                <Field field={{ id: `bpS${i}`, type: "int", label: `Summer breakpoint ${i + 1}` }} value={bp.summer?.[i]} onChange={(v) => setBreakpoint("summer", i, v)} compact />
              </div>
              <div style={{ flex: "1 1 90px", minWidth: 0 }}>
                <Field field={{ id: `bpW${i}`, type: "int", label: `Winter breakpoint ${i + 1}` }} value={bp.winter?.[i]} onChange={(v) => setBreakpoint("winter", i, v)} compact />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ItemList({ title, items, fields, onChange, makeItem }) {
  function update(i, patch) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, makeItem(items.length)]);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{title}</label>
      {items.map((it, i) => (
        <div key={it.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 4 }}>
          {fields.map((f) => (
            <div key={f.id} style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field field={f} value={it[f.id]} onChange={(v) => update(i, { [f.id]: v })} compact />
            </div>
          ))}
          <button type="button" style={{ ...iconButton, flex: "0 0 auto" }} onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" style={{ ...button, width: "100%", minHeight: 32 }} onClick={add}>
        Add
      </button>
    </div>
  );
}

/**
 * One adder's editor: label, a mode select, and whichever of the fixed
 * $/kWh field or the 12-month MonthlyValuesFields table matches the
 * current mode. Bespoke rather than built on ItemList above, because
 * ItemList renders a fixed set of fields per item and has no way to swap
 * which fields show based on that item's own data.
 */
function AdderFields({ adder, onChange }) {
  const mode = adder.mode === "monthlyTable" ? "monthlyTable" : "fixed";

  /**
   * Switching mode drops whichever field belonged to the old mode: leaving
   * both valuePerKWh and monthlyValues set on the same adder is the
   * contradictory shape normalizeState's sanitizeAdders now prevents from
   * persisting, so the editor itself should not be the one writing it,
   * even transiently.
   */
  function changeMode(nextMode) {
    if (nextMode === "monthlyTable") {
      onChange({ mode: nextMode, monthlyValues: Array.isArray(adder.monthlyValues) ? adder.monthlyValues : new Array(12).fill(0), valuePerKWh: undefined });
    } else {
      onChange({ mode: nextMode, valuePerKWh: adder.valuePerKWh ?? 0, monthlyValues: undefined });
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${color.rule}`, paddingBottom: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field field={ADDER_LABEL_FIELD} value={adder.label} onChange={(v) => onChange({ label: v })} compact />
        </div>
        <div style={{ flex: "1 1 150px", minWidth: 0 }}>
          <Field field={ADDER_MODE_FIELD} value={mode} onChange={changeMode} compact />
        </div>
        {mode === "fixed" && (
          <div style={{ flex: "1 1 100px", minWidth: 0 }}>
            <Field field={ADDER_RATE_FIELD} value={adder.valuePerKWh ?? 0} onChange={(v) => onChange({ valuePerKWh: v ?? 0 })} compact />
          </div>
        )}
      </div>
      {mode === "monthlyTable" && (
        <MonthlyValuesFields monthlyValues={adder.monthlyValues} onChange={(monthlyValues) => onChange({ monthlyValues })} />
      )}
    </div>
  );
}

/**
 * List manager for adders, playing the same add/update/remove role ItemList
 * plays for riders and system-size charges, but delegating each item's
 * rendering to AdderFields instead of a static field list.
 */
function AddersEditor({ adders, onChange }) {
  const items = adders || [];

  function update(i, patch) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { id: `adder-${items.length}-${Date.now()}`, label: "", mode: "fixed", valuePerKWh: 0 }]);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>
        Adders (fixed $/<Term id="kwh">kWh</Term>, or a monthly table)
      </label>
      {items.map((adder, i) => (
        <div key={adder.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AdderFields adder={adder} onChange={(patch) => update(i, patch)} />
          </div>
          <button type="button" style={{ ...iconButton, flex: "0 0 auto" }} onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" style={{ ...button, width: "100%", minHeight: 32 }} onClick={add}>
        Add
      </button>
    </div>
  );
}

// --- Export-rate editor: the ExportRate union (calc/tariffs/profile.js's
// typedef) shared by avoidedCostCredit's ratePerKWh and netMetering's
// exportRate. This form can author flat, monthlyTable, and (netMetering
// hourly-netting only) percentOfRetail by hand; a timeTable rate is the one
// kind it can't author field-by-field (its periods need an hour-window
// picker this form doesn't have), so -- exactly like TOU pricing above --
// it renders read-only from whatever an AI-assisted import produced. -------

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Which of the ExportRate union's kinds `value` currently is; a value this form has never seen (malformed state) reads as "flat" so the kind <select> always has a valid selection. */
function exportRateKindOf(value) {
  if (value === "retail") return "retail";
  if (value && typeof value === "object" && typeof value.kind === "string") return value.kind;
  return "flat";
}

/** A blank starting value for each kind, used when the kind <select> changes. */
function blankExportRateForKind(kind) {
  if (kind === "retail") return "retail";
  if (kind === "monthlyTable") return { kind: "monthlyTable", monthlyValues: new Array(12).fill(0) };
  if (kind === "percentOfRetail") return { kind: "percentOfRetail", fraction: 0 };
  return 0; // flat
}

/**
 * Twelve compact month inputs plus a "paste a row" affordance -- the same
 * parseSeries/paste-row pattern UsageInput.jsx's monthly usage mode uses,
 * shared via model/parseSeries.js rather than reimplemented here. Used by
 * both the export-rate monthlyTable editor above and AddersEditor's
 * monthlyTable mode below, so both benefit from paste support from one
 * implementation.
 */
function MonthlyValuesFields({ monthlyValues, onChange }) {
  const [pasteRow, setPasteRow] = useState("");
  const [pasteError, setPasteError] = useState(null);
  const values = Array.isArray(monthlyValues) && monthlyValues.length === 12 ? monthlyValues : new Array(12).fill(0);

  function setMonth(i, v) {
    const next = values.slice();
    next[i] = v ?? 0;
    onChange(next);
  }

  function applyPaste() {
    const { values: parsed, count, failedRows } = parseSeries(pasteRow, 12);
    if (count !== 12) {
      setPasteError(`Found ${count} values; need exactly 12 (one per month).`);
      return;
    }
    setPasteError(failedRows.length ? `Rows ${failedRows.join(", ")} were not numeric and were set to 0.` : null);
    onChange(parsed);
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, marginBottom: 8 }}>
        {MONTH_LABELS.map((m, i) => (
          <Field key={m} field={{ id: `month-${i}`, type: "money", label: m }} value={values[i]} onChange={(v) => setMonth(i, v)} compact />
        ))}
      </div>
      <label style={{ ...labelStyle, fontSize: 10.5 }}>Paste a row (12 values, comma-separated)</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={pasteRow}
          onChange={(e) => setPasteRow(e.target.value)}
          placeholder="0.08, 0.09, ..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" style={{ ...button, flex: "0 0 auto" }} onClick={applyPaste}>
          Apply
        </button>
      </div>
      {pasteError && <p style={{ ...helpStyle, color: color.negative }}>{pasteError}</p>}
    </div>
  );
}

/** Read-only summary of a timeTable ExportRate's periods, mirroring PricingSummary's tou branch below -- neither can be authored field-by-field in this form, both came from an AI-assisted import. */
function ExportRateTimeTableSummary({ exportRate }) {
  if (!Array.isArray(exportRate?.periods)) return <p style={helpStyle}>Time-based export rate: periods not verified.</p>;
  return (
    <>
      {exportRate.periods.map((p) => (
        <p key={p.id} style={helpStyle}>
          {p.id}: {p.window.hours[0]}:00-{p.window.hours[1]}:00, {p.window.days}, ${p.rate.summer ?? "?"}/kWh summer,{" "}
          ${p.rate.winter ?? "?"}/kWh winter.
        </p>
      ))}
    </>
  );
}

/**
 * One ExportRate value's full editor: a kind <select> plus whichever fields
 * that kind needs. `allowRetail` (netMetering only) and `allowPercentOfRetail`
 * (netMetering with netting "hourly" only) gate which kinds appear in the
 * <select>, mirroring calc/tariffs/profile.js's validateExportRate's own
 * context rules -- avoidedCostCredit, and netMetering under annual netting,
 * never see an option this form can't actually save without an engine error.
 */
function ExportRateFields({ value, onChange, allowRetail, allowPercentOfRetail }) {
  const kind = exportRateKindOf(value);

  const kindOptions = [];
  if (allowRetail) kindOptions.push({ value: "retail", label: "Retail rate" });
  kindOptions.push({ value: "flat", label: "Flat $/kWh" });
  kindOptions.push({ value: "monthlyTable", label: "Monthly table" });
  if (allowPercentOfRetail) kindOptions.push({ value: "percentOfRetail", label: "% of retail rate" });

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={labelStyle}>Export rate type</label>
      <select
        value={kind}
        onChange={(e) => onChange(blankExportRateForKind(e.target.value))}
        style={{ ...inputStyle, appearance: "auto" }}
      >
        {kindOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {/* Only reachable via an AI-assisted import, the same way pricing's
            "Time-of-use (imported)" option above works: this form cannot
            author a timeTable rate's hour windows, so the option stays
            disabled rather than picked by hand. */}
        {kind === "timeTable" && (
          <option value="timeTable" disabled>
            Time-based (imported)
          </option>
        )}
      </select>

      {kind === "flat" && <Field field={EXPORT_FLAT_FIELD} value={typeof value === "number" ? value : 0} onChange={(v) => onChange(v ?? 0)} compact />}
      {kind === "retail" && <p style={helpStyle}>Exported energy is credited at the schedule's own applicable rate for that hour.</p>}
      {kind === "monthlyTable" && (
        <MonthlyValuesFields monthlyValues={value?.monthlyValues} onChange={(monthlyValues) => onChange({ kind: "monthlyTable", monthlyValues })} />
      )}
      {kind === "percentOfRetail" && (
        <Field field={EXPORT_FRACTION_FIELD} value={value?.fraction ?? 0} onChange={(fraction) => onChange({ kind: "percentOfRetail", fraction: fraction ?? 0 })} compact />
      )}
      {kind === "timeTable" && (
        <div>
          <ExportRateTimeTableSummary exportRate={value} />
          <p style={helpStyle}>
            These periods came from an AI-assisted import and can't be edited field-by-field here. Re-run the import
            to change them, or switch "Export rate type" above to replace them entirely.
          </p>
        </div>
      )}
    </div>
  );
}

const TRUE_UP_OPTIONS = [
  { value: "default", label: "Default (same rule as the export rate itself)" },
  { value: "forfeit", label: "Forfeit leftover credit" },
  { value: "cashOut", label: "Cash out at a rate" },
];

/** Which of ExportPolicy.trueUp's shapes (absent, 'forfeit', or {rate}) `trueUp` currently is. */
function trueUpKindOf(trueUp) {
  if (trueUp === "forfeit") return "forfeit";
  if (trueUp && typeof trueUp === "object" && typeof trueUp.rate === "number") return "cashOut";
  return "default";
}

/**
 * netMetering netting "annual" only (calc/tariffs/profile.js's
 * validateExportPolicy: trueUp is only meaningful there). "Default" writes
 * `undefined` (dropping the key entirely, the same as never having entered
 * this section) rather than a concrete value, so calc/billing.js's
 * pre-existing implicit rule -- a flat exportRate cashes out at that rate,
 * anything else forfeits -- keeps applying exactly as it did before this
 * control existed.
 */
function TrueUpFields({ trueUp, onChange }) {
  const kind = trueUpKindOf(trueUp);

  function changeKind(next) {
    if (next === "default") onChange(undefined);
    else if (next === "forfeit") onChange("forfeit");
    else onChange({ rate: 0 });
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <label style={labelStyle}>Year-end true-up</label>
      <select value={kind} onChange={(e) => changeKind(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
        {TRUE_UP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {kind === "cashOut" && (
        <Field field={TRUE_UP_RATE_FIELD} value={trueUp.rate} onChange={(rate) => onChange({ rate: rate ?? 0 })} compact />
      )}
      <p style={helpStyle}>
        How leftover banked kWh credit still on the books at the end of each calendar year is resolved.
      </p>
    </div>
  );
}

// --- LLM-assisted profile import/export ----------------------------------
// A household outside Lodi needs its own utility's rate rules. Rather than
// requiring hand-entry of every tier/TOU window/rider off a PDF, this group
// hands the user a research prompt for any LLM and ingests the JSON it
// returns through model/profileCodec.js -- the same codec calc/tariffs/
// custom.js's buildCustomProfile input mirrors, so an applied import needs
// no validation path separate from a hand-built profile.

const AI_UTILITY_FIELD = { id: "aiUtilityName", type: "text", label: "Utility name" };
const AI_LOCATION_FIELD = { id: "aiLocation", type: "text", label: "City, state" };

const textareaStyle = {
  ...inputStyle,
  minHeight: 110,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11.5,
  resize: "vertical",
};


function PricingSummary({ pricing }) {
  if (!pricing) return null;
  if (pricing.type === "flat-seasonal") {
    return (
      <p style={helpStyle}>
        Flat rate: {pricing.summerRate == null ? "not verified" : `$${pricing.summerRate}/kWh`} summer,{" "}
        {pricing.winterRate == null ? "not verified" : `$${pricing.winterRate}/kWh`} winter.
      </p>
    );
  }
  if (pricing.type === "tiered") {
    if (!pricing.rates) return <p style={helpStyle}>Tiered pricing: rates not verified.</p>;
    return (
      <>
        {pricing.rates.map((rate, i) => (
          <p key={i} style={helpStyle}>
            Tier {i + 1}: ${rate}/kWh
            {pricing.breakpoints?.summer?.[i] != null ? `, up to ${pricing.breakpoints.summer[i]} kWh summer` : ""}
            {pricing.breakpoints?.winter?.[i] != null ? `, ${pricing.breakpoints.winter[i]} kWh winter` : ""}.
          </p>
        ))}
      </>
    );
  }
  if (pricing.type === "tou") {
    if (!pricing.periods) return <p style={helpStyle}>Time-of-use pricing: periods not verified.</p>;
    return (
      <>
        {pricing.periods.map((p) => (
          <p key={p.id} style={helpStyle}>
            {p.id}: {p.window.hours[0]}:00-{p.window.hours[1]}:00, {p.window.days}, ${p.rate.summer ?? "?"}/kWh summer,{" "}
            ${p.rate.winter ?? "?"}/kWh winter.
          </p>
        ))}
      </>
    );
  }
  return null;
}

function ProfilePreview({ profile, meta, warnings, onApply, onDiscard }) {
  const exportPolicy = profile.exportPolicy || {};
  const fees = profile.constraints?.interconnectionFees || {};

  return (
    <div style={{ border: `1px solid ${color.rule}`, borderRadius: 6, padding: 8, marginTop: 8 }}>
      <p style={{ ...helpStyle, fontWeight: 600, color: color.body }}>
        {meta.utilityName}
        {meta.location ? `, ${meta.location}` : ""}
      </p>
      <p style={helpStyle}>Fixed charge: {profile.fixedChargePerMonth == null ? "not verified" : `$${profile.fixedChargePerMonth}/month`}.</p>
      <PricingSummary pricing={profile.pricing} />
      <p style={helpStyle}>
        Demand charge:{" "}
        {profile.demand
          ? `$${profile.demand.ratePerKW?.summer ?? "?"}/kW summer, $${profile.demand.ratePerKW?.winter ?? "?"}/kW winter.`
          : "none."}
      </p>
      <p style={helpStyle}>
        Export:{" "}
        {exportPolicy.type === "netMetering"
          ? `net metering, ${exportPolicy.netting ?? "not verified"} netting at ${
              exportPolicy.exportRate === "retail" ? "the retail rate" : `$${exportPolicy.exportRate ?? "not verified"}/kWh`
            }.`
          : `avoided-cost credit, $${exportPolicy.ratePerKWh ?? "not verified"}/kWh.`}
      </p>
      <p style={helpStyle}>
        Interconnection fees: ${fees.singlePhase ?? "not verified"} single-phase, ${fees.threePhase ?? "not verified"} three-phase.
      </p>
      <p style={helpStyle}>Allowed financing: {profile.constraints?.allowedFinancing?.join(", ") || "not verified"}.</p>

      {meta.sources.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ ...helpStyle, fontWeight: 600 }}>Sources cited</p>
          {meta.sources.map((s, i) => (
            <p key={i} style={helpStyle}>
              {s.section}:{" "}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url}
              </a>
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 5, background: color.cautionSoft }}>
          {warnings.map((w, i) => (
            <p key={i} style={{ ...helpStyle, color: color.caution, margin: i === 0 ? 0 : "3px 0 0" }}>
              {w}
            </p>
          ))}
        </div>
      )}

      <p style={{ ...helpStyle, marginTop: 6 }}>
        Spot-check every figure above against {meta.utilityName || "the utility"}'s own rate schedule before relying on it. An AI
        assistant can misread a tariff page or state a rate that is no longer current.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button type="button" style={{ ...button, flex: 1 }} onClick={onDiscard}>
          Discard
        </button>
        <button type="button" style={{ ...buttonPrimary, flex: 1 }} onClick={onApply}>
          Apply
        </button>
      </div>
    </div>
  );
}

function AiImportHelper({ customProfileInputs, onApply }) {
  const [utilityName, setUtilityName] = useState("");
  const [location, setLocation] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptFallback, setPromptFallback] = useState(null);
  const [pasted, setPasted] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [appliedMeta, setAppliedMeta] = useState(null);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonFallback, setJsonFallback] = useState(null);

  async function handleCopyPrompt() {
    const prompt = buildResearchPrompt({ utilityName, location });
    if (await copyText(prompt)) {
      setPromptFallback(null);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } else {
      setPromptFallback(prompt);
    }
  }

  function handleImport() {
    setParseResult(parseProfileImport(pasted));
  }

  function handleApply() {
    if (!parseResult || parseResult.error) return;
    onApply(parseResult.profile);
    setAppliedMeta(parseResult.meta);
    setParseResult(null);
    setPasted("");
  }

  async function handleCopyProfile() {
    const state = appliedMeta ? { ...appliedMeta, profile: customProfileInputs } : customProfileInputs;
    const text = serializeProfile(state);
    if (await copyText(text)) {
      setJsonFallback(null);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } else {
      setJsonFallback(text);
    }
  }

  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: 6, padding: 8, marginBottom: 10, background: color.tint }}>
      <label style={labelStyle}>Get help from an AI assistant</label>
      <p style={helpStyle}>
        Research this utility's rate rules with any AI assistant, then paste its reply back in below. Its output must be
        spot-checked against the utility's own site before you rely on it.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field field={AI_UTILITY_FIELD} value={utilityName} onChange={(v) => setUtilityName(v || "")} compact />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field field={AI_LOCATION_FIELD} value={location} onChange={(v) => setLocation(v || "")} compact />
        </div>
      </div>
      <button type="button" style={{ ...button, width: "100%", minHeight: 32 }} onClick={handleCopyPrompt}>
        {promptCopied ? "Copied!" : "Copy research prompt"}
      </button>
      {promptFallback && (
        <CopyFallbackPanel
          text={promptFallback}
          textareaStyle={textareaStyle}
          buttonStyle={button}
          onDismiss={() => setPromptFallback(null)}
        />
      )}

      <label style={{ ...labelStyle, marginTop: 10 }}>Paste the assistant's reply</label>
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste the assistant's full reply here, including its fenced JSON block."
        style={textareaStyle}
      />
      <button
        type="button"
        style={{ ...button, width: "100%", minHeight: 32, marginTop: 4 }}
        onClick={handleImport}
        disabled={!pasted.trim()}
      >
        Import
      </button>

      {parseResult && parseResult.error && <p style={{ ...helpStyle, color: color.negative, marginTop: 6 }}>{parseResult.error}</p>}
      {parseResult && !parseResult.error && (
        <ProfilePreview
          profile={parseResult.profile}
          meta={parseResult.meta}
          warnings={parseResult.warnings}
          onApply={handleApply}
          onDiscard={() => setParseResult(null)}
        />
      )}

      <button type="button" style={{ ...button, width: "100%", minHeight: 32, marginTop: 10 }} onClick={handleCopyProfile}>
        {jsonCopied ? "Copied!" : "Copy my profile as JSON"}
      </button>
      {jsonFallback && (
        <CopyFallbackPanel
          text={jsonFallback}
          textareaStyle={textareaStyle}
          buttonStyle={button}
          onDismiss={() => setJsonFallback(null)}
        />
      )}
    </div>
  );
}

function CustomProfileBuilder({ inputs, onChange, errors }) {
  function set(patch) {
    onChange({ ...inputs, ...patch });
  }

  const pricingType = inputs.pricing?.type || "flat-seasonal";
  const hasDemand = !!inputs.demand;
  const exportType = inputs.exportPolicy?.type || "avoidedCostCredit";

  return (
    <div style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: 10, marginTop: 10 }}>
      <Field field={UTILITY_LABEL_FIELD} value={inputs.label} onChange={(v) => set({ label: v })} compact />
      <Field field={FIXED_CHARGE_FIELD} value={inputs.fixedChargePerMonth} onChange={(v) => set({ fixedChargePerMonth: v ?? 0 })} compact />
      <Field field={MINIMUM_BILL_FIELD} value={inputs.minimumBillPerMonth} onChange={(v) => set({ minimumBillPerMonth: v })} compact />

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Pricing structure</label>
        <select
          value={pricingType}
          onChange={(e) =>
            set({
              pricing:
                e.target.value === "tiered"
                  ? { type: "tiered", rates: [0, 0, 0], breakpoints: { summer: [0, 0], winter: [0, 0] } }
                  : { type: "flat-seasonal", summerRate: 0, winterRate: 0 },
            })
          }
          style={{ ...inputStyle, appearance: "auto" }}
        >
          <option value="flat-seasonal">Flat, by season</option>
          <option value="tiered">Tiered</option>
          {/* Only reachable by applying an AI-assisted import (see
              AiImportHelper above): this form's own dropdown never produces
              "tou", since this form does not yet offer field-by-field TOU
              entry. Picking Flat or Tiered here replaces the imported
              periods, so the option stays disabled rather than picked by
              hand. */}
          {pricingType === "tou" && <option value="tou" disabled>Time-of-use (imported)</option>}
        </select>
        <p style={helpStyle}>
          Time-of-use (<Term id="tou">TOU</Term>) pricing can be loaded from an imported profile; this form does not
          yet offer field-by-field <Term id="tou">TOU</Term> entry. Model a <Term id="tou">TOU</Term> utility as
          flat-seasonal using its blended average rate instead, or use "Get help from an AI assistant" above, which
          can import <Term id="tou">TOU</Term> periods directly.
        </p>
      </div>

      {pricingType === "flat-seasonal" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <Field field={FLAT_SUMMER_FIELD} value={inputs.pricing.summerRate} onChange={(v) => set({ pricing: { ...inputs.pricing, summerRate: v ?? 0 } })} compact />
          </div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <Field field={FLAT_WINTER_FIELD} value={inputs.pricing.winterRate} onChange={(v) => set({ pricing: { ...inputs.pricing, winterRate: v ?? 0 } })} compact />
          </div>
        </div>
      )}
      {pricingType === "tiered" && <TieredPricingFields pricing={inputs.pricing} onChange={(pricing) => set({ pricing })} />}
      {pricingType === "tou" && (
        <div>
          <PricingSummary pricing={inputs.pricing} />
          <p style={helpStyle}>
            These periods came from an AI-assisted import and can't be edited field-by-field here. Re-run the import to
            change them, or switch "Pricing structure" above to Flat or Tiered to replace them entirely.
          </p>
        </div>
      )}

      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body }}>
          <input
            type="checkbox"
            checked={hasDemand}
            onChange={(e) => set({ demand: e.target.checked ? { ratePerKW: { summer: 0, winter: 0 } } : null })}
            style={{ accentColor: color.accent }}
          />
          Has a demand charge
        </label>
      </div>
      {hasDemand && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <Field field={DEMAND_RATE_SUMMER_FIELD} value={inputs.demand.ratePerKW?.summer} onChange={(v) => set({ demand: { ...inputs.demand, ratePerKW: { ...inputs.demand.ratePerKW, summer: v ?? 0 } } })} compact />
          </div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <Field field={DEMAND_RATE_WINTER_FIELD} value={inputs.demand.ratePerKW?.winter} onChange={(v) => set({ demand: { ...inputs.demand, ratePerKW: { ...inputs.demand.ratePerKW, winter: v ?? 0 } } })} compact />
          </div>
        </div>
      )}

      <ItemList
        title={
          <>
            System-size charges (monthly, per <Term id="kw">kW</Term>-DC solar or <Term id="kwh">kWh</Term> battery
            the household installs)
          </>
        }
        items={inputs.systemSizeCharges || []}
        fields={[SYSTEM_SIZE_BASIS_FIELD, SYSTEM_SIZE_RATE_FIELD]}
        onChange={(systemSizeCharges) => set({ systemSizeCharges })}
        makeItem={(i) => ({ id: `charge-${i}-${Date.now()}`, basis: "kW-DC-solar", ratePerMonth: 0 })}
      />

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Export policy</label>
        <select
          value={exportType}
          onChange={(e) =>
            set({
              exportPolicy:
                e.target.value === "netMetering"
                  ? { type: "netMetering", netting: "hourly", exportRate: "retail" }
                  : { type: "avoidedCostCredit", ratePerKWh: 0, addersApply: false, carryForward: true, cashOut: false },
            })
          }
          style={{ ...inputStyle, appearance: "auto" }}
        >
          <option value="avoidedCostCredit">Avoided-cost credit</option>
          <option value="netMetering">Net metering</option>
        </select>
      </div>

      {exportType === "avoidedCostCredit" ? (
        <ExportRateFields
          value={inputs.exportPolicy.ratePerKWh}
          onChange={(ratePerKWh) => set({ exportPolicy: { ...inputs.exportPolicy, ratePerKWh } })}
          allowRetail={false}
          allowPercentOfRetail={false}
        />
      ) : (
        <>
          <Field field={NETTING_FIELD} value={inputs.exportPolicy.netting} onChange={(v) => set({ exportPolicy: { ...inputs.exportPolicy, netting: v } })} compact />
          <ExportRateFields
            value={inputs.exportPolicy.exportRate}
            onChange={(exportRate) => set({ exportPolicy: { ...inputs.exportPolicy, exportRate } })}
            allowRetail
            allowPercentOfRetail={inputs.exportPolicy.netting === "hourly"}
          />
          {inputs.exportPolicy.netting === "annual" && (
            <TrueUpFields
              trueUp={inputs.exportPolicy.trueUp}
              onChange={(trueUp) => set({ exportPolicy: { ...inputs.exportPolicy, trueUp } })}
            />
          )}
        </>
      )}

      <Field
        field={LOCK_YEARS_FIELD}
        value={inputs.exportPolicy.lockYears ?? null}
        onChange={(lockYears) => set({ exportPolicy: { ...inputs.exportPolicy, lockYears } })}
        compact
      />

      <AddersEditor adders={inputs.adders} onChange={(adders) => set({ adders })} />

      <ItemList
        title="Bill discount riders"
        items={inputs.riders || []}
        fields={[RIDER_LABEL_FIELD, RIDER_PERCENT_FIELD]}
        onChange={(riders) => set({ riders })}
        makeItem={(i) => ({ id: `rider-${i}-${Date.now()}`, label: "", percentOff: 0 })}
      />

      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Allowed financing</label>
        {["cash", "loan"].map((type) => (
          <label key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body, marginBottom: 2 }}>
            <input
              type="checkbox"
              checked={(inputs.constraints?.allowedFinancing || []).includes(type)}
              onChange={(e) => {
                const current = inputs.constraints?.allowedFinancing || [];
                const next = e.target.checked ? [...current, type] : current.filter((t) => t !== type);
                set({ constraints: { ...inputs.constraints, allowedFinancing: next } });
              }}
              style={{ accentColor: color.accent }}
            />
            {type === "cash" ? "Cash" : "Loan"}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={SINGLE_PHASE_FEE_FIELD}
            value={inputs.constraints?.interconnectionFees?.singlePhase}
            onChange={(v) => set({ constraints: { ...inputs.constraints, interconnectionFees: { ...inputs.constraints.interconnectionFees, singlePhase: v ?? 0 } } })}
            compact
          />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={THREE_PHASE_FEE_FIELD}
            value={inputs.constraints?.interconnectionFees?.threePhase}
            onChange={(v) => set({ constraints: { ...inputs.constraints, interconnectionFees: { ...inputs.constraints.interconnectionFees, threePhase: v ?? 0 } } })}
            compact
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: 5, background: color.negativeSoft }}>
          {errors.map((e, i) => (
            <p key={i} style={{ ...helpStyle, color: color.negative, margin: i === 0 ? 0 : "3px 0 0" }}>
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function HouseholdSection({ household, onChange }) {
  const isCustom = household.profileId === "custom";
  const activeRiders = isCustom ? household.customProfileInputs.riders || [] : LODI_RIDERS;

  const customErrors = useMemo(() => {
    if (!isCustom) return [];
    return validateProfile(buildCustomProfile(household.customProfileInputs));
  }, [isCustom, household.customProfileInputs]);

  function set(patch) {
    onChange({ ...household, ...patch });
  }

  return (
    <div>
      <ProfileToggle profileId={household.profileId} onChange={(profileId) => set({ profileId })} />

      {!isCustom && (
        <>
          <Field field={SCHEDULE_FIELD} value={household.schedule} onChange={(v) => set({ schedule: v })} compact />
          {household.schedule === "G1" && (
            <>
              <p style={helpStyle}>
                <G1EligibilityNote />
              </p>
              <Field field={G1_PHASE_FIELD} value={household.g1Phase} onChange={(v) => set({ g1Phase: v })} compact />
            </>
          )}
        </>
      )}

      <RiderPicker riders={activeRiders} selectedIds={household.riderIds} onChange={(riderIds) => set({ riderIds })} />

      {isCustom && (
        <>
          <AiImportHelper
            customProfileInputs={household.customProfileInputs}
            onApply={(customProfileInputs) => set({ customProfileInputs })}
          />
          <CustomProfileBuilder
            inputs={household.customProfileInputs}
            onChange={(customProfileInputs) => set({ customProfileInputs })}
            errors={customErrors}
          />
        </>
      )}

      <UsageInput usage={household.usage} onChange={(usage) => set({ usage })} />

      <EvSection ev={household.ev} onChange={(ev) => set({ ev })} isCustom={isCustom} />
    </div>
  );
}
