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
import { MIN_HORIZON_YEARS, MAX_HORIZON_YEARS, clampHorizon } from "../model/comparison.js";
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

export function SettingsBar({ comparison, onChange, onAddOffer, onShare }) {
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
