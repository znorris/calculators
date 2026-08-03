// One config's cost inputs: gross costs (auto-estimated, user-overridable),
// O&M, an optional inverter replacement, and an incentives list.
//
// `config.costs.*Gross` is null until a user overrides it; estimateCosts()
// fills that gap for display, as a placeholder rather than a written value,
// so the estimate updates live as the config's hardware changes and a user
// who never touches the field never has a stale number saved into state.

import { Field } from "./Field.jsx";
import { Term } from "../../shared/Term.jsx";
import { estimateCosts, INCENTIVE_TYPES, INCENTIVE_UNIT_OPTIONS } from "../model/schema.js";
import { resolveIncentives, FEDERAL_25D_STATUS } from "../calc/incentives.js";
import equipmentPresets from "../data/equipment-presets.json";
import { money } from "../format.js";
import { color, button, iconButton, label as labelStyle, help as helpStyle } from "../theme.js";

function grossField(id, label, estimatedValue) {
  return {
    id,
    type: "money",
    label,
    placeholder: estimatedValue != null ? String(Math.round(estimatedValue)) : "",
    help: "Auto-estimated from data/equipment-presets.json until you enter your own quote.",
  };
}

const OANDM_FIELD = {
  id: "oAndMPerYear",
  type: "money",
  label: (
    <>
      <Term id="om">O&M</Term> per year
    </>
  ),
};
const INVERTER_YEAR_FIELD = {
  id: "inverterReplacementYear",
  type: "int",
  label: "Inverter replacement year",
  help: "Leave blank to skip. A year past your ownership horizon still shows up in the payback/cash-flow results, just not in NPV or lifetime savings, which stay scoped to the horizon.",
};
const INVERTER_COST_FIELD = { id: "inverterReplacementCost", type: "money", label: "Inverter replacement cost" };

// calc/incentives.js's five line-item types: the first three are one-time,
// year-0 items that reduce upfront cost; the last two are recurring INCOME
// items paid each ownership year instead (see that module's own header).
const INCENTIVE_TYPE_LABELS = {
  fixed: "Fixed $",
  percent: "% of gross cost",
  perUnit: "$ per kW/kWh installed",
  annualProduction: "Annual $/kWh production (recurring income)",
  annualFixed: "Annual fixed $ (recurring income)",
};

function incentiveTypeField(id) {
  return {
    id,
    type: "enum",
    label: "Type",
    placeholder: false,
    options: INCENTIVE_TYPES.map((value) => ({ value, label: INCENTIVE_TYPE_LABELS[value] })),
  };
}

const LABEL_FIELD = { id: "label", type: "text", label: "Label" };
const AMOUNT_FIELD = {
  id: "amount",
  type: "money",
  label: "Amount",
  help: "A one-time reduction of the system's upfront cost, applied at year 0.",
};
const PERCENT_FIELD = {
  id: "percent",
  type: "number",
  label: "Percent",
  help: "Whole number, e.g. 30 for 30%. Applied against the system's full gross cost, not gross minus other incentives already applied, so line order never changes the total.",
};
const CAP_AMOUNT_FIELD = {
  id: "capAmount",
  type: "money",
  label: "Cap (optional)",
  help: "An optional dollar ceiling on this one line's amount, applied after this line's own amount is computed.",
};
const UNIT_FIELD = {
  id: "unit",
  type: "enum",
  label: "Per",
  placeholder: false,
  options: INCENTIVE_UNIT_OPTIONS,
  help: "Priced against this config's own solar/battery size (not a shared figure across every config being compared).",
};
const RATE_PER_UNIT_FIELD = { id: "ratePerUnit", type: "money", label: "Rate" };
const RATE_PER_KWH_FIELD = {
  id: "ratePerKWh",
  type: "money",
  label: (
    <>
      Rate ($/<Term id="kwh">kWh</Term>)
    </>
  ),
  help: "Paid each ownership year below as income, not an upfront cost reduction, keyed to that specific year's own degradation-aware production.",
};
const RECURRING_AMOUNT_FIELD = {
  id: "amount",
  type: "money",
  label: "Amount per year",
  help: "A flat payment received as income in each of the years below, e.g. a battery virtual-power-plant enrollment fee.",
};
const YEARS_FIELD = {
  id: "years",
  type: "int",
  label: "Years",
  help: "How many consecutive ownership years this income is paid, starting at year 1 (the first full year after purchase).",
};

/** A fresh line item of `type`, in exactly the shape calc/incentives.js's resolveIncentives/resolveRecurringIncentiveIncome read -- see that module's own header for each type's fields. */
function blankIncentiveOfType(type, label) {
  if (type === "percent") return { label, type, percent: 0, capAmount: null };
  if (type === "perUnit") return { label, type, unit: "kW-solar", ratePerUnit: 0, capAmount: null };
  if (type === "annualProduction") return { label, type, ratePerKWh: 0, years: 10 };
  if (type === "annualFixed") return { label, type, amount: 0, years: 10 };
  return { label, type: "fixed", amount: 0 };
}

export function CostsEditor({ config, onChange }) {
  const costs = config.costs;
  const estimated = estimateCosts(config, equipmentPresets);
  const grossTotal =
    (costs.solarGross ?? estimated.solarGross ?? 0) +
    (costs.windGross ?? estimated.windGross ?? 0) +
    (costs.batteryGross ?? estimated.batteryGross ?? 0);
  // This config's own nameplate sizes, in calc/incentives.js's {kwSolar,
  // kwhBattery, kwBattery} shape -- what a perUnit line's rate prices
  // against. Mirrors model/runEngine.js's sizesForEngineConfig, computed
  // straight from the same config shape rather than a separate field.
  const sizes = {
    kwSolar: (config.solar?.arrays || []).reduce((sum, a) => sum + (a.kwDC || 0), 0),
    kwhBattery: config.battery?.usableKWh || 0,
    kwBattery: config.battery?.maxChargeKW || 0,
  };
  const resolved = resolveIncentives(costs.incentives, grossTotal, sizes);
  const recurringCount = costs.incentives.filter((it) => it.type === "annualProduction" || it.type === "annualFixed").length;

  function set(patch) {
    onChange({ ...costs, ...patch });
  }

  function updateIncentive(i, patch) {
    set({ incentives: costs.incentives.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  }

  function changeIncentiveType(i, type) {
    set({ incentives: costs.incentives.map((it, idx) => (idx === i ? blankIncentiveOfType(type, it.label) : it)) });
  }

  function removeIncentive(i) {
    set({ incentives: costs.incentives.filter((_, idx) => idx !== i) });
  }

  function addIncentive() {
    set({ incentives: [...costs.incentives, blankIncentiveOfType("fixed", "")] });
  }

  return (
    <div>
      <Field field={grossField("solarGross", "Solar installed cost", estimated.solarGross)} value={costs.solarGross} onChange={(v) => set({ solarGross: v })} compact />
      <Field field={grossField("windGross", "Wind installed cost", estimated.windGross)} value={costs.windGross} onChange={(v) => set({ windGross: v })} compact />
      <Field field={grossField("batteryGross", "Battery installed cost", estimated.batteryGross)} value={costs.batteryGross} onChange={(v) => set({ batteryGross: v })} compact />
      <Field field={OANDM_FIELD} value={costs.oAndMPerYear} onChange={(v) => set({ oAndMPerYear: v ?? 0 })} compact />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field field={INVERTER_YEAR_FIELD} value={costs.inverterReplacementYear} onChange={(v) => set({ inverterReplacementYear: v })} compact />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field field={INVERTER_COST_FIELD} value={costs.inverterReplacementCost} onChange={(v) => set({ inverterReplacementCost: v })} compact />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: 10, marginTop: 6 }}>
        <p style={{ ...labelStyle, marginBottom: 6 }}>Incentives</p>

        <p style={{ ...helpStyle, background: "#fffbeb", color: color.caution, padding: "6px 8px", borderRadius: 5, marginBottom: 8 }}>
          {FEDERAL_25D_STATUS.note}
        </p>

        {costs.incentives.map((it, i) => (
          <div key={i} style={{ borderBottom: i < costs.incentives.length - 1 ? `1px solid ${color.hairline}` : "none", paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
              <button type="button" onClick={() => removeIncentive(i)} style={iconButton} aria-label={`Remove incentive ${i + 1}`}>
                Remove
              </button>
            </div>
            <Field field={LABEL_FIELD} value={it.label} onChange={(v) => updateIncentive(i, { label: v })} compact />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                <Field field={incentiveTypeField(`incentive-${i}-type`)} value={it.type} onChange={(v) => changeIncentiveType(i, v)} compact />
              </div>

              {it.type === "percent" && (
                <>
                  <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                    <Field field={PERCENT_FIELD} value={it.percent} onChange={(v) => updateIncentive(i, { percent: v ?? 0 })} compact />
                  </div>
                  <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                    <Field field={CAP_AMOUNT_FIELD} value={it.capAmount} onChange={(v) => updateIncentive(i, { capAmount: v })} compact />
                  </div>
                </>
              )}

              {it.type === "perUnit" && (
                <>
                  <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                    <Field field={UNIT_FIELD} value={it.unit} onChange={(v) => updateIncentive(i, { unit: v })} compact />
                  </div>
                  <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                    <Field field={RATE_PER_UNIT_FIELD} value={it.ratePerUnit} onChange={(v) => updateIncentive(i, { ratePerUnit: v ?? 0 })} compact />
                  </div>
                  <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                    <Field field={CAP_AMOUNT_FIELD} value={it.capAmount} onChange={(v) => updateIncentive(i, { capAmount: v })} compact />
                  </div>
                </>
              )}

              {it.type === "annualProduction" && (
                <>
                  <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                    <Field field={RATE_PER_KWH_FIELD} value={it.ratePerKWh} onChange={(v) => updateIncentive(i, { ratePerKWh: v ?? 0 })} compact />
                  </div>
                  <div style={{ flex: "1 1 90px", minWidth: 0 }}>
                    <Field field={YEARS_FIELD} value={it.years} onChange={(v) => updateIncentive(i, { years: Math.max(1, v ?? 1) })} compact />
                  </div>
                </>
              )}

              {it.type === "annualFixed" && (
                <>
                  <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                    <Field field={RECURRING_AMOUNT_FIELD} value={it.amount} onChange={(v) => updateIncentive(i, { amount: v ?? 0 })} compact />
                  </div>
                  <div style={{ flex: "1 1 90px", minWidth: 0 }}>
                    <Field field={YEARS_FIELD} value={it.years} onChange={(v) => updateIncentive(i, { years: Math.max(1, v ?? 1) })} compact />
                  </div>
                </>
              )}

              {it.type === "fixed" && (
                <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                  <Field field={AMOUNT_FIELD} value={it.amount} onChange={(v) => updateIncentive(i, { amount: v ?? 0 })} compact />
                </div>
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={addIncentive} style={{ ...button, width: "100%", minHeight: 34 }}>
          Add incentive
        </button>

        {costs.incentives.length > 0 && (
          <p style={helpStyle}>
            One-time incentives resolve to {money(resolved.total)} against a {money(grossTotal)} gross cost.
            {recurringCount > 0 &&
              ` ${recurringCount} recurring income line${recurringCount === 1 ? "" : "s"} above show up as yearly income in the cash-flow results below instead, not in this upfront total.`}
          </p>
        )}
      </div>
    </div>
  );
}
