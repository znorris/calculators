// Per-offer ratings for the non-monetary factors.
//
// This section is driven by the comparison's factor list rather than by the
// offer schema, because the factors are a property of the person weighing the
// offers, the same way filing status is. What the offer holds is only the
// rating.

import { MAX_RATING } from "../model/comparison.js";
import { color, label as labelStyle } from "../theme.js";

export function FactorRatings({ factors, ratings, onRate }) {
  const active = (factors || []).filter((f) => (f.weight ?? 0) > 0);

  if (active.length === 0) {
    return (
      <p style={{ fontSize: 11.5, color: color.muted, margin: 0, lineHeight: 1.5 }}>
        No factors are weighted. Add one in Settings to rate offers on anything other than money.
      </p>
    );
  }

  return (
    <div>
      {active.map((factor) => {
        const current = (ratings || {})[factor.id] ?? 0;
        return (
          <div key={factor.id} style={{ marginBottom: 10 }}>
            <span style={{ ...labelStyle, display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {factor.label || "Unnamed factor"}
              </span>
              <span style={{ color: color.faint, flex: "0 0 auto" }}>weight {factor.weight}</span>
            </span>
            <div role="radiogroup" aria-label={factor.label} style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((value) => {
                const selected = current === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    // Clicking the current value clears it, so an unrated
                    // factor stays distinguishable from one rated lowest.
                    onClick={() => onRate(factor.id, selected ? null : value)}
                    style={{
                      flex: 1,
                      minHeight: 32,
                      fontSize: 12,
                      fontWeight: selected ? 700 : 500,
                      color: selected ? color.surface : color.muted,
                      background: selected ? color.accent : color.surface,
                      border: `1px solid ${selected ? color.accent : color.rule}`,
                      borderRadius: 5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p style={{ fontSize: 10.5, color: color.muted, margin: "2px 0 0", lineHeight: 1.45 }}>
        1 is poor, 5 is excellent. This score is reported beside the money, never folded into it.
      </p>
    </div>
  );
}
