// One column per config, one row per headline metric. Best-value cells get
// a subtle tint rather than a colored badge, so five configs read as a
// table rather than a rainbow.
//
// @param entries [{ id, name, result:ConfigResult, finance }] baseline already excluded by the caller
// @param baseline ConfigResult, the no-system case year-1 bill savings is measured against
// @param horizonYears number, the ownership horizon the Payback cell flags a value as beyond

import { money, signedMoney, percent } from "../format.js";
import { Term } from "../../shared/Term.jsx";
import { color } from "../theme.js";

const EPSILON = 1e-6;

const ROWS = [
  {
    label: "Upfront net cost",
    termId: "upfront-cost",
    better: "lower",
    value: (e) => -e.finance.cashFlows[0],
    format: (v) => money(v),
  },
  {
    label: "Year-1 bill savings",
    termId: "year1-savings",
    better: "higher",
    value: (e, baseline) => baseline.years[0].billTotal - e.result.years[0].billTotal,
    format: (v) => signedMoney(v),
  },
  {
    label: "Payback",
    termId: "payback",
    better: "lower",
    value: (e) => e.finance.paybackYear,
    // Payback is searched well past the horizon (see calc/finance.js's
    // horizonIndex), so a non-null value can land beyond it -- that is a real
    // payback the user just will not own the system long enough to reach,
    // not a "never," and must read as one rather than being folded into the
    // null case (see PaybackCell below).
    format: null,
  },
  {
    label: "NPV",
    termId: "npv",
    better: "higher",
    value: (e) => e.finance.npv,
    format: (v) => money(v),
  },
  {
    label: "IRR",
    termId: "irr",
    better: "higher",
    value: (e) => e.finance.irr,
    // IRR is scanned only over the horizon-scoped cash flows (see
    // calc/finance.js), so null means specifically "no root inside your
    // horizon" -- a config can still have a genuine payback beyond it (see
    // the Payback row) without that changing this cell, and a bare "—" would
    // read as if the config simply had no rate of return at all.
    format: (v, horizonYears) => (v == null ? `no root within ${horizonYears} yr` : percent(v)),
  },
  {
    label: "Lifetime savings",
    termId: "lifetime-savings",
    better: "higher",
    value: (e) => e.finance.lifetimeSavings,
    format: (v) => signedMoney(v),
  },
  {
    label: "Self-consumption",
    termId: "self-consumption",
    better: "higher",
    value: (e) => {
      const t = e.result.totals;
      return t.productionKWh > 0 ? t.selfConsumedKWh / t.productionKWh : null;
    },
    format: (v) => (v == null ? "—" : percent(v)),
  },
  {
    label: "Year-1 production",
    termId: "year1-production",
    better: "higher",
    value: (e) => e.result.years[0].productionKWh,
    format: (v) => (
      <>
        {Math.round(v).toLocaleString()} <Term id="kwh">kWh</Term>
      </>
    ),
  },
];

/**
 * Payback cell: a value at or under the horizon reads as a plain year count;
 * a value past it still shows the real year, with a subtly-styled note that
 * it lands beyond the horizon, rather than being collapsed into the null
 * ("never recovers") case the way it used to be. `analysisYears` is read off
 * this entry's own cashFlows length (calc/finance.js's full search window)
 * rather than hardcoded, since a horizon already past PAYBACK_SEARCH_YEARS
 * makes the search window equal to the horizon itself.
 */
function PaybackCell({ v, horizonYears, analysisYears }) {
  if (v == null) return `Not within ${analysisYears} years`;
  if (v === 0) return "Immediate";
  if (v <= horizonYears) return `${v.toFixed(1)} yr`;
  return (
    <span>
      {`${v.toFixed(1)} yr `}
      <span style={{ color: color.muted, fontWeight: 400, fontSize: 10.5 }}>
        {`(beyond your ${horizonYears}-yr horizon)`}
      </span>
    </span>
  );
}

/** The best value in a row, or null when every entry's value is null (e.g. IRR with no root). */
function findBest(row, entries, baseline) {
  let bestValue = null;
  for (const e of entries) {
    const v = row.value(e, baseline);
    if (v == null) continue;
    if (bestValue == null) {
      bestValue = v;
    } else if (row.better === "higher" ? v > bestValue : v < bestValue) {
      bestValue = v;
    }
  }
  return bestValue;
}

export function ComparisonTable({ entries, baseline, horizonYears }) {
  if (entries.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>Metric</th>
            {entries.map((e) => (
              <th key={e.id} style={{ ...th, textAlign: "right" }}>
                {e.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const bestValue = findBest(row, entries, baseline);
            return (
              <tr key={row.label}>
                <td style={td}>{row.termId ? <Term id={row.termId}>{row.label}</Term> : row.label}</td>
                {entries.map((e) => {
                  const v = row.value(e, baseline);
                  const isBest = bestValue != null && v != null && Math.abs(v - bestValue) < EPSILON;
                  return (
                    <td
                      key={e.id}
                      style={{
                        ...td,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: isBest ? 700 : 400,
                        background: isBest ? color.positiveSoft : "transparent",
                      }}
                    >
                      {row.label === "Payback" ? (
                        <PaybackCell v={v} horizonYears={horizonYears} analysisYears={e.finance.cashFlows.length - 1} />
                      ) : (
                        row.format(v, horizonYears)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
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
