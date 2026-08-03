// Standalone value of the pieces that can be removed from a config (battery,
// wind), each found by re-simulating the same config without that piece --
// see calc/incremental.js. A config with neither removable component
// contributes nothing here, not an empty table.
//
// @param entries [{ id, name, result:ConfigResult, incremental:[{component, addedCost, addedAnnualSavings, standalonePaybackYears}] }]
// @param horizonYears number, the ownership horizon a standalone payback is flagged as beyond

import { money, signedMoney } from "../format.js";
import { Term } from "../../shared/Term.jsx";
import { color } from "../theme.js";

const COMPONENT_LABEL = { battery: "Battery", wind: "Wind" };

/**
 * A standalone payback beyond the horizon is a real recovery the user just
 * won't own the system long enough to reach -- it must read as a year, with
 * a subtle note, rather than being folded into null's "not within" wording
 * the way this used to render every out-of-horizon result as "Never."
 */
function paybackCellText(years, horizonYears, analysisSearchYears) {
  if (years == null) return `Not within ${analysisSearchYears} yr`;
  if (years <= horizonYears) return `${years.toFixed(1)} yr`;
  return `${years.toFixed(1)} yr (beyond your ${horizonYears}-yr horizon)`;
}

export function IncrementalTable({ entries, horizonYears }) {
  const withIncremental = entries.filter((e) => e.incremental && e.incremental.length > 0);
  if (withIncremental.length === 0) return null;

  // calc/incremental.js re-simulates with the same assumptions as the
  // whole-system result, so its search window is the same
  // max(horizonYears, PAYBACK_SEARCH_YEARS) length as entry.result.years.
  const analysisSearchYears = withIncremental[0].result?.years?.length ?? horizonYears;

  return (
    <div>
      <p style={{ fontSize: 12, color: color.body, lineHeight: 1.55, margin: "0 0 12px" }}>
        What each removable piece is worth on its own: the same config re-simulated without it, with the bill
        difference priced against that piece's own cost.
      </p>
      {withIncremental.map((e) => (
        <div key={e.id} style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: color.ink, margin: "0 0 6px" }}>{e.name}</h4>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={th}>Component</th>
                  <th style={{ ...th, textAlign: "right" }}>
                    <Term id="added-cost">Added cost</Term>
                  </th>
                  <th style={{ ...th, textAlign: "right" }}>
                    <Term id="added-annual-savings">Added annual savings</Term>
                  </th>
                  <th style={{ ...th, textAlign: "right" }}>
                    <Term id="standalone-payback">Standalone payback</Term>
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.incremental.map((row) => (
                  <tr key={row.component}>
                    <td style={td}>{COMPONENT_LABEL[row.component] || row.component}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {money(row.addedCost)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {signedMoney(row.addedAnnualSavings)}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {paybackCellText(row.standalonePaybackYears, horizonYears, analysisSearchYears)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

const th = {
  textAlign: "left",
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  color: color.muted,
  padding: "0 10px 5px 0",
  borderBottom: `1px solid ${color.hairline}`,
  whiteSpace: "nowrap",
};

const td = {
  padding: "6px 10px 6px 0",
  color: color.body,
  borderBottom: `1px solid ${color.hairline}`,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
