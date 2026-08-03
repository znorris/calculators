// Household usage entry: annual total, 12 monthly totals, or an 8760-value
// hourly series. calc/load.js consumes whichever `mode` is active; the other
// two fields stay in state but unused (model/schema.js's normalizeUsage
// preserves all three so switching modes back and forth doesn't lose data
// already entered).
//
// Hourly data never leaves this device: model/urlCodec.js's encodeShare
// strips hourlyKWh from every share link (downgrading to its monthly sums),
// because 8760 floats belonging to one household's actual usage pattern is
// not something a recipient of a share link needs or should receive.

import { useState } from "react";
import { NumInput } from "./NumInput.jsx";
import { Term } from "../../shared/Term.jsx";
import { USAGE_MODES } from "../model/schema.js";
import { parseSeries } from "../model/parseSeries.js";
import { HOURS_PER_YEAR } from "../calc/time.js";
import { color, button, label as labelStyle, help as helpStyle, input as inputStyle } from "../theme.js";

const MODE_LABELS = { annual: "Annual", monthly: "Monthly", hourly: "Hourly" };
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ModeToggle({ mode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {USAGE_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            ...button,
            flex: 1,
            background: mode === m ? color.accent : color.surface,
            color: mode === m ? color.surface : color.body,
            borderColor: mode === m ? color.accent : color.rule,
          }}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function AnnualMode({ usage, onChange }) {
  return (
    <div>
      <label style={labelStyle}>Annual usage</label>
      <NumInput
        value={usage.annualKWh}
        onChange={(v) => onChange({ ...usage, annualKWh: v ?? 0 })}
        suffix="kWh/yr"
        ariaLabel="Annual usage"
      />
    </div>
  );
}

function MonthlyMode({ usage, onChange }) {
  const [pasteRow, setPasteRow] = useState("");
  const [pasteError, setPasteError] = useState(null);
  const monthly = usage.monthlyKWh || new Array(12).fill(0);

  function setMonth(i, v) {
    const next = monthly.slice();
    next[i] = v ?? 0;
    onChange({ ...usage, monthlyKWh: next });
  }

  function applyPaste() {
    const { values, count, failedRows } = parseSeries(pasteRow, 12);
    if (count !== 12) {
      setPasteError(`Found ${count} values; need exactly 12 (one per month).`);
      return;
    }
    setPasteError(failedRows.length ? `Rows ${failedRows.join(", ")} were not numeric and were set to 0.` : null);
    onChange({ ...usage, monthlyKWh: values });
  }

  return (
    <div>
      <style>{`
        .esc-monthly-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
        @media (max-width: 720px) {
          .esc-monthly-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <div className="esc-monthly-grid" style={{ marginBottom: 10 }}>
        {MONTH_LABELS.map((label, i) => (
          <div key={label}>
            <label style={{ ...labelStyle, fontSize: 10 }}>{label}</label>
            <NumInput value={monthly[i]} onChange={(v) => setMonth(i, v)} ariaLabel={`${label} usage`} />
          </div>
        ))}
      </div>

      <label style={labelStyle}>Paste a row (12 values, comma-separated)</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={pasteRow}
          onChange={(e) => setPasteRow(e.target.value)}
          placeholder="450, 420, 500, ..."
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

function HourlyMode({ usage, onChange }) {
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState(null);
  // Which rows failed to parse on the most recent load, kept in local
  // component state rather than on `usage` itself: it is feedback about a
  // parse event, not part of the household's usage data, and model/schema.js
  // has no field for it (an unknown key would just be dropped on the next
  // normalizeState pass anyway).
  const [lastFailedRows, setLastFailedRows] = useState([]);

  function load(text) {
    const { values, count, failedRows } = parseSeries(text, HOURS_PER_YEAR);
    if (count !== HOURS_PER_YEAR) {
      setError(`Found ${count} values; need exactly ${HOURS_PER_YEAR} (one per hour of the year).`);
      return;
    }
    setError(null);
    setLastFailedRows(failedRows);
    onChange({ ...usage, hourlyKWh: values });
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result || ""));
    reader.readAsText(file);
  }

  const loaded = Array.isArray(usage.hourlyKWh) && usage.hourlyKWh.length === HOURS_PER_YEAR;
  const total = loaded ? usage.hourlyKWh.reduce((a, b) => a + b, 0) : 0;
  const peak = loaded ? Math.max(...usage.hourlyKWh) : 0;

  return (
    <div>
      <label style={labelStyle}>Upload a CSV (8,760 values, one per hour)</label>
      <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ marginBottom: 8, fontSize: 12 }} />

      <label style={labelStyle}>...or paste it</label>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={4}
        placeholder="One value per line, or a single comma-separated row"
        style={{ ...inputStyle, width: "100%", fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
      />
      <button type="button" style={{ ...button, marginTop: 6 }} onClick={() => load(pasteText)}>
        Load pasted values
      </button>

      {error && <p style={{ ...helpStyle, color: color.negative }}>{error}</p>}

      {loaded && !error && (
        <p style={{ ...helpStyle, background: color.tint, padding: "6px 8px", borderRadius: 5, marginTop: 8 }}>
          Loaded: {Math.round(total).toLocaleString()} <Term id="kwh">kWh</Term> total, {peak.toFixed(2)}{" "}
          <Term id="kw">kW</Term> peak.
          {lastFailedRows.length > 0 && ` Rows ${lastFailedRows.join(", ")} were not numeric and were set to 0.`}
        </p>
      )}

      <p style={{ ...helpStyle, marginTop: 8 }}>
        Kept on this device only: hourly usage is never included in a share link.
      </p>
    </div>
  );
}

export function UsageInput({ usage, onChange }) {
  function setMode(mode) {
    onChange({ ...usage, mode });
  }

  return (
    <div>
      <ModeToggle mode={usage.mode} onChange={setMode} />
      {usage.mode === "annual" && <AnnualMode usage={usage} onChange={onChange} />}
      {usage.mode === "monthly" && <MonthlyMode usage={usage} onChange={onChange} />}
      {usage.mode === "hourly" && <HourlyMode usage={usage} onChange={onChange} />}
    </div>
  );
}
