// One config's financing terms. `allowedFinancing` is resolved by the
// caller from the active utility profile's constraints.allowedFinancing
// (calc/tariffs/profile.js's UtilityProfile shape) -- this component has no
// tariff knowledge of its own, since the same financing terms are shared
// across every config in a comparison but the profile lives on household.

import { Field } from "./Field.jsx";
import { Term } from "../../shared/Term.jsx";
import { FINANCING_TYPES } from "../model/schema.js";
import { color, button, help as helpStyle } from "../theme.js";

const DOWN_PAYMENT_FIELD = { id: "downPaymentFrac", type: "percent", label: "Down payment" };
const APR_FIELD = {
  id: "aprPct",
  type: "number",
  label: <Term id="apr">APR</Term>,
  help: "Whole percent, e.g. 6 for 6%.",
};
const TERM_FIELD = { id: "termYears", type: "int", label: "Term", help: "Years." };

export function FinancingEditor({ financing, allowedFinancing, onChange }) {
  const allowed = allowedFinancing || FINANCING_TYPES.map((t) => t.value);

  function setType(type) {
    onChange({ ...financing, type });
  }

  function setLoanField(patch) {
    onChange({ ...financing, ...patch });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {FINANCING_TYPES.filter((t) => allowed.includes(t.value)).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            style={{
              ...button,
              flex: 1,
              background: financing.type === t.value ? color.accent : color.surface,
              color: financing.type === t.value ? color.surface : color.body,
              borderColor: financing.type === t.value ? color.accent : color.rule,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {FINANCING_TYPES.filter((t) => !allowed.includes(t.value)).map((t) => (
        <p key={t.value} style={helpStyle}>
          {t.label} is not available under this household's utility profile.
        </p>
      ))}

      {financing.type === "loan" && (
        <div style={{ marginTop: 6 }}>
          <Field field={DOWN_PAYMENT_FIELD} value={financing.downPaymentFrac} onChange={(v) => setLoanField({ downPaymentFrac: v })} compact />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 110px", minWidth: 0 }}>
              <Field field={APR_FIELD} value={financing.aprPct} onChange={(v) => setLoanField({ aprPct: v })} compact />
            </div>
            <div style={{ flex: "1 1 110px", minWidth: 0 }}>
              <Field field={TERM_FIELD} value={financing.termYears} onChange={(v) => setLoanField({ termYears: v })} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
