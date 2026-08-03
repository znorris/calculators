// A bare numeric input with no label wrapper, for tight grids (a solar/wind
// list row, the 12-box monthly usage grid) where Field's label + help block
// would blow out the layout. Field.jsx is still the right choice anywhere a
// label belongs next to the control.

import { parseNumeric } from "../format.js";
import { input as inputStyle, color } from "../theme.js";

export function NumInput({ value, onChange, placeholder, suffix, ariaLabel, describedBy, style }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        value={value == null ? "" : String(value)}
        placeholder={placeholder || ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : parseNumeric(raw));
        }}
        style={{ ...inputStyle, paddingRight: suffix ? 24 : undefined }}
      />
      {suffix && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: color.faint,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
