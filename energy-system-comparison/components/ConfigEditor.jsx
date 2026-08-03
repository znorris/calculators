// The list of systems being compared (configs A, B, C, ...), each a card
// composing its own solar/wind/battery/cost/financing editors. A new config
// is auto-named the next unused letter (model/schema.js's
// newConfig()/nextConfigName()), and a clone or a promoted explorer config
// keeps whatever generated name it arrived with -- but every card's name is
// then click-to-edit (see ConfigName below), so any of those starting points
// can be renamed to something the user chose instead.
//
// financing is the one sub-editor that needs household context (which
// financing types the active utility profile allows); `allowedFinancing` is
// resolved once by the caller from that profile and passed through
// unchanged to every card, since the profile is a household-level fact, not
// a per-config one.
//
// `oversizedConfigIds` (a Set, optional) flags configs whose estimated
// annual production exceeds the household's annual usage under a profile
// with constraints.sizeCapMode === 'trailing12moUsage' (LEU rejects such an
// application outright). Resolved by the caller from simulateComparison's
// output, since this component has no engine access of its own.
//
// `gridChargeAdvisoryConfigIds` (a Set, optional) flags configs whose battery
// has gridCharge enabled while the household's selected schedule has neither
// TOU pricing nor a demand charge -- model/runEngine.js's scheduleLacksTouOrDemand,
// the same "no plausible payback" test calc/battery.js's mechanism implies.
//
// `hasDemandCharge` and `baselinePeakKW` are household-level facts (the
// resolved schedule carries a demand charge; the no-system baseline's
// monthly peak import), passed through unchanged to every card's
// BatteryEditor so it can show its peak-shave dispatch control only where a
// demand charge exists to shave against, with a sizing hint for the
// threshold field.

import { useEffect, useRef, useState } from "react";
import { Term } from "../../shared/Term.jsx";
import { SolarArraysEditor } from "./SolarArraysEditor.jsx";
import { WindEditor } from "./WindEditor.jsx";
import { BatteryEditor } from "./BatteryEditor.jsx";
import { CostsEditor } from "./CostsEditor.jsx";
import { FinancingEditor } from "./FinancingEditor.jsx";
import { newConfig } from "../model/schema.js";
import { isLodiProfile, customUtilityLabel } from "../model/utilityLabel.js";
import { card, color, button, buttonPrimary, iconButton, input as inputStyle } from "../theme.js";

const MAX_CONFIG_NAME_LENGTH = 40;

/**
 * The config card's name, click-to-edit: a "Config " label stays static
 * (matching every other place in this app that shows a config purely by its
 * bare name -- ComparisonTable's columns, the chart legends), with only
 * `name` itself swapping to a text input on click, on clicking the pencil
 * button beside it, or on focusing either via keyboard. Commits the draft on
 * Enter or blur; Escape reverts the draft and closes without committing. A
 * draft that is empty or whitespace-only after trimming reverts to the last
 * committed name instead of saving a blank one -- onRename is simply not
 * called in that case, so the card keeps whatever name it already had.
 */
function ConfigName({ name, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim().slice(0, MAX_CONFIG_NAME_LENGTH);
    if (trimmed) onRename(trimmed);
    setEditing(false);
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: color.ink }}>Config</span>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label="Configuration name"
          maxLength={MAX_CONFIG_NAME_LENGTH}
          style={{ ...inputStyle, width: 140, padding: "3px 6px", fontSize: 13, fontWeight: 700 }}
        />
      </span>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <h2
        style={{ fontSize: 14, fontWeight: 700, color: color.ink, margin: 0, cursor: "pointer" }}
        onClick={startEditing}
      >
        Config {name}
      </h2>
      <button
        type="button"
        onClick={startEditing}
        aria-label="Rename configuration"
        style={{ ...iconButton, padding: "2px 6px", minHeight: "auto", fontSize: 11, lineHeight: 1.4 }}
      >
        ✎
      </button>
    </span>
  );
}

const SUBSECTIONS = [
  { id: "solar", label: "Solar" },
  { id: "wind", label: "Wind" },
  { id: "battery", label: "Battery" },
  { id: "costs", label: "Costs" },
  { id: "financing", label: "Financing" },
];

function SubSection({ label, open, onToggle, children }) {
  return (
    <div style={{ borderTop: `1px solid ${color.hairline}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 10px",
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
      {open && <div style={{ padding: "8px 10px 10px" }}>{children}</div>}
    </div>
  );
}

function ConfigCard({
  config,
  allowedFinancing,
  onUpdate,
  onClone,
  onRemove,
  removable,
  oversized,
  gridChargeAdvisory,
  hasDemandCharge,
  baselinePeakKW,
  household,
}) {
  const isLodi = isLodiProfile(household);
  const utilityName = isLodi ? <Term id="leu">LEU</Term> : customUtilityLabel(household);
  const [open, setOpen] = useState(() => new Set(["solar"]));

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <article style={{ ...card, width: "100%", overflow: "hidden" }}>
      <header
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: color.surface,
        }}
      >
        <ConfigName name={config.name} onRename={(name) => onUpdate({ name })} />
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={iconButton} onClick={onClone}>
            Clone
          </button>
          {removable && (
            <button type="button" style={iconButton} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </header>

      {oversized && (
        <p
          style={{
            margin: 0,
            padding: "7px 12px",
            fontSize: 11,
            lineHeight: 1.45,
            color: color.caution,
            background: color.cautionSoft,
            borderTop: `1px solid ${color.hairline}`,
          }}
        >
          Estimated annual production exceeds this household's annual usage. {utilityName} rejects an
          interconnection application sized above trailing-12-month usage outright; a real application at this size
          would need to be reduced.
        </p>
      )}

      {gridChargeAdvisory && (
        <p
          style={{
            margin: 0,
            padding: "7px 12px",
            fontSize: 11,
            lineHeight: 1.45,
            color: color.caution,
            background: color.cautionSoft,
            borderTop: `1px solid ${color.hairline}`,
          }}
        >
          Grid charging is on, but this schedule has no <Term id="tou">time-of-use</Term> price spread to buy into,
          and either carries no demand charge or this battery isn't dispatching in peak-shave mode to shave one. Grid
          charging here usually increases the bill: it pays the same retail rate it would otherwise avoid, minus
          round-trip efficiency loss, with nothing to shift into or shave against.
        </p>
      )}

      <SubSection label="Solar" open={open.has("solar")} onToggle={() => toggle("solar")}>
        <SolarArraysEditor arrays={config.solar.arrays} onChange={(arrays) => onUpdate({ solar: { arrays } })} />
      </SubSection>

      <SubSection label="Wind" open={open.has("wind")} onToggle={() => toggle("wind")}>
        <WindEditor turbines={config.wind.turbines} onChange={(turbines) => onUpdate({ wind: { turbines } })} />
      </SubSection>

      <SubSection label="Battery" open={open.has("battery")} onToggle={() => toggle("battery")}>
        <BatteryEditor
          battery={config.battery}
          hasGeneration={config.solar.arrays.length > 0 || config.wind.turbines.length > 0}
          hasDemandCharge={hasDemandCharge}
          baselinePeakKW={baselinePeakKW}
          onChange={(battery) => onUpdate({ battery })}
        />
      </SubSection>

      <SubSection label="Costs" open={open.has("costs")} onToggle={() => toggle("costs")}>
        <CostsEditor config={config} onChange={(costs) => onUpdate({ costs })} />
      </SubSection>

      <SubSection label="Financing" open={open.has("financing")} onToggle={() => toggle("financing")}>
        <FinancingEditor
          financing={config.financing}
          allowedFinancing={allowedFinancing}
          onChange={(financing) => onUpdate({ financing })}
        />
      </SubSection>
    </article>
  );
}

export function ConfigEditor({
  configs,
  allowedFinancing,
  oversizedConfigIds,
  gridChargeAdvisoryConfigIds,
  hasDemandCharge,
  baselinePeakKW,
  household,
  onChange,
}) {
  function updateConfig(id, patch) {
    onChange(configs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addConfig() {
    onChange([...configs, newConfig(configs)]);
  }

  function cloneConfig(id) {
    const source = configs.find((c) => c.id === id);
    if (!source) return;
    const clone = structuredClone(source);
    const seed = newConfig(configs);
    clone.id = seed.id;
    clone.name = seed.name;
    onChange([...configs, clone]);
  }

  function removeConfig(id) {
    onChange(configs.filter((c) => c.id !== id));
  }

  return (
    <div>
      <style>{`
        .esc-config-list { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; align-items: flex-start; }
        .esc-config-list > div { flex: 0 0 340px; min-width: 0; }
        @media (max-width: 720px) {
          .esc-config-list { flex-direction: column; overflow-x: visible; }
          .esc-config-list > div { flex: 1 1 auto; }
        }
      `}</style>

      <div className="esc-config-list">
        {configs.map((config) => (
          <div key={config.id}>
            <ConfigCard
              config={config}
              allowedFinancing={allowedFinancing}
              onUpdate={(patch) => updateConfig(config.id, patch)}
              onClone={() => cloneConfig(config.id)}
              onRemove={() => removeConfig(config.id)}
              removable={configs.length > 1}
              oversized={oversizedConfigIds?.has(config.id) ?? false}
              gridChargeAdvisory={gridChargeAdvisoryConfigIds?.has(config.id) ?? false}
              hasDemandCharge={hasDemandCharge}
              baselinePeakKW={baselinePeakKW}
              household={household}
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={addConfig} style={{ ...buttonPrimary, width: "100%", minHeight: 38, marginTop: 10 }}>
        Add config
      </button>
    </div>
  );
}
