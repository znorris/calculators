// Every constant the compensation calculator runs on, read live from the same
// modules it uses.
//
// Nothing on this page is retyped. If a bracket changes in
// calc/data/federal.js, this page changes with it, and if it did not, the page
// would become a second source of truth quietly disagreeing with the one that
// computes your answer. That is the entire point of the page: a reader can
// check the assumptions rather than take them on faith.

import { Breadcrumb } from "../../shared/Breadcrumb.jsx";
import { FEDERAL, AVAILABLE_TAX_YEARS, DEFAULT_TAX_YEAR } from "../calc/data/federal.js";
import { STATES, ALL_STATE_CODES } from "../calc/data/states.js";
import { WORKING_DAYS } from "../calc/benefits.js";
import {
  DEFAULT_HORIZON_YEARS,
  MIN_HORIZON_YEARS,
  MAX_HORIZON_YEARS,
  MIN_YEARS_FOR_TREND,
  MAX_WEIGHT,
  MAX_RATING,
} from "../model/comparison.js";
import { VESTING_PRESETS, PAY_FREQUENCIES, FILING_STATUSES } from "../model/schema.js";
import { TAX_ELEVATED_THRESHOLD, EQUITY_HEAVY_THRESHOLD } from "../report/regimes.js";
import { money, percent } from "../format.js";
import { color, card } from "../theme.js";
import { useState } from "react";

const STATUS_LABEL = Object.fromEntries(FILING_STATUSES.map((f) => [f.value, f.label]));

export default function App() {
  const [taxYear, setTaxYear] = useState(DEFAULT_TAX_YEAR);
  const tables = FEDERAL[taxYear];

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Two levels up to the index, one to the calculator. Matches the
          BreadcrumbList declared in this page's structured data. */}
      <Breadcrumb
        trail={[
          { label: "Calculators", href: "../../" },
          { label: "Compensation Comparison", href: "../" },
        ]}
        current="Assumptions"
      />

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: color.ink, margin: "0 0 6px" }}>
          What the compensation calculator assumes
        </h1>
        <p style={{ fontSize: 12.5, color: color.body, margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
          Every figure below is read at page load from the same modules that compute your results. If a number
          looks wrong, it is wrong in the calculator too.
        </p>
      </header>

      <Section title="Federal">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label htmlFor="year" style={{ fontSize: 12, color: color.muted, fontWeight: 600 }}>
            Tax year
          </label>
          <select
            id="year"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            style={selectStyle}
          >
            {AVAILABLE_TAX_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <h3 style={h3}>Ordinary income brackets</h3>
        <p style={note}>
          Each rate applies only to the slice of taxable income inside its own band. That is why an effective
          rate is always below a marginal rate.
        </p>
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Rate</th>
                {FILING_STATUSES.map((f) => (
                  <th key={f.value} style={{ ...th, textAlign: "right" }}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tables.brackets.single.map((band, i) => (
                <tr key={band.rate}>
                  <td style={{ ...td, fontWeight: 700 }}>{percent(band.rate, 0)}</td>
                  {FILING_STATUSES.map((f) => {
                    const row = tables.brackets[f.value][i];
                    return (
                      <td key={f.value} style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {row?.upTo == null ? "and above" : `up to ${money(row.upTo)}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>

        <h3 style={h3}>Standard deduction</h3>
        <KeyValues
          items={FILING_STATUSES.map((f) => [f.label, money(tables.standardDeduction[f.value])])}
        />
        <p style={note}>
          Subtracted before brackets apply. Itemized deductions, credits, and dependents are not modeled.
        </p>

        <h3 style={h3}>Payroll tax</h3>
        <KeyValues
          items={[
            ["Social Security rate, employee", percent(tables.fica.socialSecurityRate, 2)],
            ["Social Security wage base", money(tables.fica.socialSecurityWageBase)],
            ["Medicare rate, employee", percent(tables.fica.medicareRate, 2)],
            ["Additional Medicare surtax", percent(tables.fica.additionalMedicareRate, 2)],
            ...FILING_STATUSES.map((f) => [
              `Surtax threshold, ${f.label.toLowerCase()}`,
              money(tables.fica.additionalMedicareThresholds[f.value]),
            ]),
            ["Employer withholding threshold", money(tables.fica.employerWithholdingThreshold)],
          ]}
        />
        <p style={note}>
          Social Security stops at the wage base, so per-paycheck take-home rises partway through the year for
          high earners. Medicare has no cap. The employer withholding threshold is a flat figure regardless of
          filing status, so what is withheld can differ from what is actually owed.
        </p>

        <h3 style={h3}>Retirement limits</h3>
        <KeyValues
          items={[
            ["Elective deferral, 402(g)", money(tables.retirementLimits.elective402g)],
            ["Combined limit, 415(c)", money(tables.retirementLimits.total415c)],
            ["Catch-up, age 50 and over", money(tables.retirementLimits.catchUp50)],
            ["Catch-up, ages 60 to 63", money(tables.retirementLimits.catchUp60to63)],
            ["Compensation limit, 401(a)(17)", money(tables.retirementLimits.compensationLimit401a17)],
          ]}
        />

        <h3 style={h3}>Supplemental wage withholding</h3>
        <KeyValues
          items={[
            ["Flat rate", percent(tables.supplementalWithholding.flatRate, 0)],
            ["Rate above the threshold", percent(tables.supplementalWithholding.highEarnerRate, 0)],
            ["Threshold", money(tables.supplementalWithholding.highEarnerThreshold)],
          ]}
        />
        <p style={note}>
          Applied to bonuses and equity vesting by an employer. It is frequently not your actual marginal rate,
          which is why withholding on a large vest can fall short of what you owe at filing.
        </p>
      </Section>

      <StateSection />

      <Section title="How the calculator models things">
        <h3 style={h3}>Deduction ordering</h3>
        <p style={note}>
          Which tax base a deduction reduces is the part most calculators get wrong, so it is stated outright.
        </p>
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Deduction</th>
                <th style={th}>Income tax base</th>
                <th style={th}>Social Security and Medicare base</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Traditional 401k", "Reduced", "Not reduced"],
                ["Roth 401k", "Not reduced", "Not reduced"],
                ["Medical, dental, vision under Section 125", "Reduced", "Reduced"],
                ["HSA through payroll", "Reduced", "Reduced"],
                ["Life and disability premiums", "Not reduced", "Not reduced"],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td style={td}>{a}</td>
                  <td style={{ ...td, color: b === "Reduced" ? color.positive : color.muted }}>{b}</td>
                  <td style={{ ...td, color: c === "Reduced" ? color.positive : color.muted }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>

        <h3 style={h3}>Vesting curves</h3>
        <KeyValues
          items={VESTING_PRESETS.filter((p) => p.schedule).map((p) => [
            p.label.replace(/\s*\(.*\)$/, ""),
            p.schedule.map((n) => `${n}%`).join(" / "),
          ])}
        />
        <p style={note}>
          A one-year cliff is expressed as year one at zero rather than as a separate field. Equity growth
          compounds from each grant's own origin year, not from the start of the horizon.
        </p>

        <h3 style={h3}>Fixed values</h3>
        <KeyValues
          items={[
            ["Working days per year, for valuing a day off", String(WORKING_DAYS)],
            ["Default horizon", `${DEFAULT_HORIZON_YEARS} years`],
            ["Horizon range", `${MIN_HORIZON_YEARS} to ${MAX_HORIZON_YEARS} years`],
            ["Minimum horizon for trend charts", `${MIN_YEARS_FOR_TREND} years`],
            ["A year counts as tax-elevated above", percent(TAX_ELEVATED_THRESHOLD, 0)],
            ["A year counts as equity-heavy above", percent(EQUITY_HEAVY_THRESHOLD, 0)],
            ["Fit factor weight range", `0 to ${MAX_WEIGHT}`],
            ["Fit rating range", `1 to ${MAX_RATING}`],
            ["Paycheck frequencies", PAY_FREQUENCIES.map((f) => f.value).join(", ") + " per year"],
          ]}
        />
      </Section>

      <Section title="What is not modeled">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {[
            "City and municipal income taxes beyond a flat rate you enter yourself.",
            "Itemized deductions, tax credits, dependents, and income from outside the offer.",
            "Equity dilution, liquidation preferences, the gap between a 409A valuation and a preferred share price, and discrete exit scenarios.",
            "ESPP purchases, double-trigger RSUs at private companies, AMT on an ISO exercise, and the gap between supplemental withholding and your real rate.",
            "Option exercise timing, so option value counts toward total compensation but produces no tax event.",
            "Investment returns on retirement balances. Employer contributions are counted as dollars contributed, subject to vesting.",
            "Cost-of-living differences between locations.",
            "Contractor, 1099, and corp-to-corp arrangements, including self-employment tax and the qualified business income deduction.",
            "Severance, notice periods, non-compete restrictions, and immigration or visa status.",
          ].map((item) => (
            <li key={item} style={{ fontSize: 12, lineHeight: 1.6, color: color.body, marginBottom: 5 }}>
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** The per-state table, with brackets revealed on demand. */
function StateSection() {
  const [expanded, setExpanded] = useState(null);
  const codes = Object.keys(STATES).sort();
  const verified = codes.filter((c) => STATES[c].confidence === "verified").length;
  const missing = ALL_STATE_CODES.filter((c) => !STATES[c]);

  function topRate(s) {
    if (s.kind === "none") return "No wage tax";
    if (s.kind === "flat") return percent(s.flatRate, 2);
    const rows = s.brackets?.single || s.brackets?.marriedJoint || [];
    return rows.length ? `to ${percent(rows[rows.length - 1].rate, 2)}` : "—";
  }

  return (
    <Section title="State and local">
      <p style={note}>
        {codes.length} of 51 jurisdictions, {verified} read from a state government publication and{" "}
        {codes.length - verified} from a secondary source. Every record carries its own confidence marker and
        source below.
        {missing.length > 0 && ` Missing: ${missing.join(", ")}.`}
      </p>
      <Scroller>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>State</th>
              <th style={th}>Type</th>
              <th style={{ ...th, textAlign: "right" }}>Rate</th>
              <th style={th}>Employee payroll programs</th>
              <th style={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const s = STATES[code];
              const isOpen = expanded === code;
              return (
                <>
                  <tr key={code}>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : code)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 12,
                          fontWeight: 600,
                          color: color.accent,
                          textAlign: "left",
                        }}
                      >
                        {isOpen ? "▾" : "▸"} {code} {s.name}
                      </button>
                    </td>
                    <td style={{ ...td, color: color.muted }}>{s.kind}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {topRate(s)}
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>
                      {(s.payrollPrograms || []).length
                        ? s.payrollPrograms
                            .map(
                              (p) =>
                                `${p.name} ${percent(p.rate, 2)}${p.wageBase ? ` to ${money(p.wageBase)}` : " uncapped"}`,
                            )
                            .join("; ")
                        : "—"}
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>
                      <Confidence level={s.confidence} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${code}-detail`}>
                      <td colSpan={5} style={{ ...td, background: color.page }}>
                        <StateDetail state={s} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </Scroller>
    </Section>
  );
}

function StateDetail({ state }) {
  const statuses = FILING_STATUSES.filter((f) => state.brackets?.[f.value]);

  return (
    <div style={{ padding: "6px 0" }}>
      {state.kind === "progressive" && statuses.length > 0 && (
        <Scroller>
          <table style={{ ...table, marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={th}>Rate</th>
                {statuses.map((f) => (
                  <th key={f.value} style={{ ...th, textAlign: "right" }}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.brackets[statuses[0].value].map((band, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 700 }}>{percent(band.rate, 2)}</td>
                  {statuses.map((f) => {
                    const row = state.brackets[f.value][i];
                    return (
                      <td key={f.value} style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {row?.upTo == null ? "and above" : `up to ${money(row.upTo)}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}

      {state.standardDeduction && (
        <KeyValues
          items={FILING_STATUSES.filter((f) => state.standardDeduction[f.value] != null).map((f) => [
            `Standard deduction, ${f.label.toLowerCase()}`,
            money(state.standardDeduction[f.value]),
          ])}
        />
      )}

      {state.notes && <p style={{ ...note, marginTop: 8 }}>{state.notes}</p>}

      {state.source && (
        <p style={{ ...note, marginTop: 6 }}>
          Source:{" "}
          <a href={state.source} style={{ color: color.accent }} rel="noreferrer noopener" target="_blank">
            {state.source}
          </a>
        </p>
      )}
    </div>
  );
}

function Confidence({ level }) {
  const isVerified = level === "verified";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        color: isVerified ? color.positive : color.caution,
      }}
    >
      {level || "probable"}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: color.ink, margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

function KeyValues({ items }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "4px 18px",
        margin: 0,
      }}
    >
      {items.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "4px 0",
            borderBottom: `1px solid ${color.hairline}`,
            fontSize: 12,
          }}
        >
          <dt style={{ color: color.body }}>{k}</dt>
          <dd style={{ margin: 0, color: color.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Scroller({ children }) {
  return <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>;
}

const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
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
};
const h3 = { fontSize: 12.5, fontWeight: 700, color: color.ink, margin: "16px 0 6px" };
const note = { fontSize: 11.5, lineHeight: 1.6, color: color.muted, margin: "0 0 8px" };
const selectStyle = {
  padding: "4px 8px",
  fontSize: 12,
  border: `1px solid ${color.rule}`,
  borderRadius: 5,
  fontFamily: "inherit",
};
