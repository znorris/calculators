// Renders one schema field. The field descriptor decides the control, so
// adding a field to the schema requires no change here.

import { AVAILABLE_STATE_CODES, ALL_STATE_CODES, STATES, hasStateData } from "../calc/data/states.js";
import { parseNumeric } from "../format.js";
import { color, label as labelStyle, input as inputStyle, help as helpStyle } from "../theme.js";

/** Percent fields are stored as decimals but typed as whole percentages. */
function toDisplay(field, value) {
  if (value == null) return "";
  if (field.type === "percent") return String(Math.round(value * 10000) / 100);
  return String(value);
}

function fromDisplay(field, raw) {
  if (raw === "") return field.type === "text" ? "" : null;
  if (field.type === "text") return raw;
  const n = parseNumeric(raw);
  if (n == null) return null;
  if (field.type === "percent") return n / 100;
  if (field.type === "int") return Math.round(n);
  return n;
}

function stateOptions() {
  const withData = AVAILABLE_STATE_CODES.map((code) => ({
    value: code,
    label: `${code} — ${STATES[code].name}`,
  }));
  const without = ALL_STATE_CODES.filter((c) => !hasStateData(c)).map((code) => ({
    value: code,
    label: `${code} (no tax data yet)`,
  }));
  return [...withData, ...without];
}

export function Field({ field, value, onChange, compact = false }) {
  const id = `f-${field.id}`;
  const options = field.optionsFrom === "states" ? stateOptions() : field.options;

  let control;

  if (field.type === "bool") {
    control = (
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: color.body }}>
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: color.accent }}
        />
        {field.label}
      </label>
    );
  } else if (field.type === "enum") {
    control = (
      <select
        id={id}
        // Option values are strings in the DOM, so a numeric field value such
        // as a pay frequency has to be stringified to match one.
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          onChange(match ? match.value : raw);
        }}
        style={{ ...inputStyle, appearance: "auto" }}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <div style={{ position: "relative" }}>
        {field.type === "money" && (
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: color.faint }}
          >
            $
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={field.type === "text" ? "text" : "decimal"}
          value={toDisplay(field, value)}
          placeholder={field.placeholder || ""}
          onChange={(e) => onChange(fromDisplay(field, e.target.value))}
          style={{
            ...inputStyle,
            paddingLeft: field.type === "money" ? 18 : inputStyle.padding.split(" ")[1],
            paddingRight: field.type === "percent" ? 22 : undefined,
          }}
        />
        {field.type === "percent" && (
          <span
            aria-hidden="true"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: color.faint }}
          >
            %
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: compact ? 8 : 11 }}>
      {field.type !== "bool" && (
        <label htmlFor={id} style={labelStyle}>
          {field.label}
        </label>
      )}
      {control}
      {field.help && <p style={helpStyle}>{field.help}</p>}
    </div>
  );
}
