// Comparison-scoped settings: the values that belong to the person rather
// than to any one offer.
//
// On a phone this collapses to a single summary line, because three form
// controls and two buttons consume most of the first screen and push the
// report below the fold. It stays expanded on desktop, where the space is
// free.

import { useState } from "react";
import { Field } from "./Field.jsx";
import { useIsNarrow } from "./ColumnStrip.jsx";
import { FILING_STATUSES } from "../model/schema.js";
import { AVAILABLE_TAX_YEARS } from "../calc/data/federal.js";
import { MIN_HORIZON_YEARS, MAX_HORIZON_YEARS, clampHorizon, MAX_WEIGHT } from "../model/comparison.js";
import { card, color, button, buttonPrimary, label as labelStyle, input as inputStyle } from "../theme.js";

const FILING_FIELD = {
  id: "filingStatus",
  type: "enum",
  label: "Filing status",
  options: FILING_STATUSES,
  help: "Belongs to you, not to any one offer, so it is set once for the whole comparison.",
};

const TAX_YEAR_FIELD = {
  id: "taxYear",
  type: "enum",
  label: "Tax year",
  options: AVAILABLE_TAX_YEARS.map((y) => ({ value: y, label: String(y) })),
};

const FILING_SHORT = {
  single: "Single",
  marriedJoint: "Married, joint",
  marriedSeparate: "Married, separate",
  headOfHousehold: "Head of household",
};

function FactorWeights({ factors, onUpdate, onRemove, onAdd }) {
  return (
    <div style={{ width: "100%", borderTop: `1px solid ${color.hairline}`, paddingTop: 10, marginTop: 2 }}>
      <p style={{ ...labelStyle, marginBottom: 6 }}>What matters to you, beyond money</p>
      {factors.map((factor) => (
        <div key={factor.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <input
            type="text"
            value={factor.label}
            placeholder="Factor"
            onChange={(e) => onUpdate(factor.id, { label: e.target.value })}
            style={{ ...inputStyle, flex: "1 1 120px", minWidth: 0 }}
            aria-label="Factor name"
          />
          <input
            type="range"
            min={0}
            max={MAX_WEIGHT}
            step={1}
            value={factor.weight}
            onChange={(e) => onUpdate(factor.id, { weight: Number(e.target.value) })}
            style={{ flex: "0 1 90px", accentColor: color.accent }}
            aria-label={`Importance of ${factor.label || "factor"}`}
          />
          <span
            style={{ fontSize: 11.5, color: factor.weight === 0 ? color.faint : color.body, width: 46, flex: "0 0 auto" }}
          >
            {factor.weight === 0 ? "off" : `w ${factor.weight}`}
          </span>
          <button
            type="button"
            onClick={() => onRemove(factor.id)}
            style={{ ...button, minHeight: 30, padding: "4px 8px", flex: "0 0 auto" }}
            aria-label={`Remove ${factor.label || "factor"}`}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} style={{ ...button, minHeight: 32 }}>
        Add factor
      </button>
      <p style={{ fontSize: 10.5, color: color.muted, margin: "6px 0 0", lineHeight: 1.45 }}>
        Weight 0 turns a factor off without deleting it. The fit score is reported next to the money, never
        mixed into it.
      </p>
    </div>
  );
}

export function SettingsBar({ comparison, onChange, onAddOffer, onShare, onUpdateFactor, onRemoveFactor, onAddFactor }) {
  const isNarrow = useIsNarrow();
  const [open, setOpen] = useState(false);
  const expanded = !isNarrow || open;

  const summary = [
    FILING_SHORT[comparison.filingStatus] || comparison.filingStatus,
    comparison.taxYear,
    `${comparison.horizonYears} years`,
  ].join(" · ");

  return (
    <div style={{ ...card, marginBottom: 16, overflow: "hidden" }}>
      {isNarrow && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
            padding: "10px 14px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 9, color: color.faint, width: 8 }}>
            {expanded ? "▾" : "▸"}
          </span>
          <span style={{ flex: 1, fontSize: 12.5, color: color.body, fontWeight: 600 }}>{summary}</span>
          <span style={{ fontSize: 11.5, color: color.accent, fontWeight: 600 }}>
            {expanded ? "Done" : "Settings"}
          </span>
        </button>
      )}

      {expanded && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "flex-start",
            padding: isNarrow ? "0 14px 12px" : "12px 14px",
            borderTop: isNarrow ? `1px solid ${color.hairline}` : "none",
          }}
        >
          <div style={{ flex: "1 1 190px", minWidth: 170 }}>
            <Field
              field={FILING_FIELD}
              value={comparison.filingStatus}
              onChange={(v) => onChange({ filingStatus: v })}
            />
          </div>
          <div style={{ flex: "0 1 120px", minWidth: 100 }}>
            <Field
              field={TAX_YEAR_FIELD}
              value={comparison.taxYear}
              onChange={(v) => onChange({ taxYear: Number(v) })}
            />
          </div>
          <div style={{ flex: "0 1 140px", minWidth: 110 }}>
            <label htmlFor="horizon" style={labelStyle}>
              Horizon (years)
            </label>
            <input
              id="horizon"
              type="number"
              inputMode="numeric"
              min={MIN_HORIZON_YEARS}
              max={MAX_HORIZON_YEARS}
              value={comparison.horizonYears}
              onChange={(e) => onChange({ horizonYears: clampHorizon(e.target.value) })}
              style={inputStyle}
            />
          </div>

          <FactorWeights
            factors={comparison.factors || []}
            onUpdate={onUpdateFactor}
            onRemove={onRemoveFactor}
            onAdd={onAddFactor}
          />
        </div>
      )}

      {/* The two actions stay visible whether or not the settings are open,
          since adding an offer is the main thing to do on a first visit. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px",
          borderTop: `1px solid ${color.hairline}`,
          background: color.page,
        }}
      >
        <button type="button" style={{ ...buttonPrimary, minHeight: 38, flex: isNarrow ? 1 : "0 0 auto" }} onClick={onAddOffer}>
          Add offer
        </button>
        <button type="button" style={{ ...button, minHeight: 38, flex: isNarrow ? 1 : "0 0 auto" }} onClick={onShare}>
          Copy share link
        </button>
      </div>
    </div>
  );
}
