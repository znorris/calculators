// Composes the results report in the plan's fixed order: comparison table,
// narrative prose, cumulative cash flow, incremental component value, then
// the representative-day chart. Every child here only reads props --
// simulateComparison/financeConfig/incrementalAnalysis already ran in the
// compose layer's useMemo, and nothing under this component re-simulates.
//
// @param entries [{
//   id,                    config.id, used as the React key and to align every child
//   name,                  config.name, e.g. "A"
//   config,                Config per calc/CONTRACTS.md (solar/wind/battery/dispatch)
//   result,                ConfigResult per calc/CONTRACTS.md
//   finance,               financeConfig()'s output for this config against `baseline`
//   incremental,           incrementalAnalysis()'s output for this config ([] if neither battery nor wind)
//   windCapacityFactor,    number|null, see report/prose.js's header for how the compose layer derives this
// }]  baseline already excluded from this array by the caller
// @param baseline ConfigResult, the no-system case every delta is measured against
// @param household { schedule, ... } per calc/simulate.js's Household
// @param profile UtilityProfile, for the export-rate sentences in report/prose.js
// @param horizonYears number of ownership years simulated

import { buildReport } from "../report/prose.js";
import { ComparisonTable } from "./ComparisonTable.jsx";
import { CashFlowChart } from "./CashFlowChart.jsx";
import { IncrementalTable } from "./IncrementalTable.jsx";
import { TypicalDayChart } from "./TypicalDayChart.jsx";
import { Term } from "../../shared/Term.jsx";
import { GLOSSARY } from "../glossary.js";
import { card, color } from "../theme.js";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest-first so an alternation match at a given position prefers "kWh"
// over "kW" when both could start there; \b already keeps a bare "kW" match
// from landing inside "kWh" (there is no word/non-word transition between
// the "W" and the "h"), but ordering longest-first here keeps that
// guarantee explicit rather than incidental.
const ACRONYM_ENTRIES = GLOSSARY.filter((entry) => entry.acronym).sort((a, b) => b.acronym.length - a.acronym.length);
const ACRONYM_TO_ID = new Map(ACRONYM_ENTRIES.map((entry) => [entry.acronym, entry.id]));

function acronymPattern() {
  return new RegExp(`\\b(${ACRONYM_ENTRIES.map((entry) => escapeRegExp(entry.acronym)).join("|")})\\b`, "g");
}

/**
 * report/prose.js's sentence-building functions return plain strings, not
 * JSX (see that file's header for why), so a glossary acronym embedded in
 * one -- "3,422 kWh", "net present value (NPV)" -- carries no Term tooltip
 * on its own. This splits `text` on every glossary acronym token (matched
 * case-sensitively, at word boundaries, so it never fires mid-word) and
 * wraps each match in a <Term>, leaving the rest of the string as plain text
 * interleaved in the returned array. A falsy/empty `text` passes through
 * unchanged so callers can use this directly against an optional string.
 */
export function renderProseWithTerms(text) {
  if (!text) return text;
  const pattern = acronymPattern();
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    parts.push(
      <Term key={key++} id={ACRONYM_TO_ID.get(token)}>
        {token}
      </Term>,
    );
    lastIndex = match.index + token.length;
  }
  if (key === 0) return text; // no acronym found -- hand the original string back rather than a single-element array
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function Section({ title, children }) {
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: color.ink, margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

function Paragraph({ children }) {
  return <p style={{ fontSize: 12.5, lineHeight: 1.6, color: color.body, margin: "0 0 8px" }}>{children}</p>;
}

export function ResultsSection({ entries, baseline, household, profile, horizonYears }) {
  if (entries.length === 0) {
    return (
      <Section title="Results">
        <Paragraph>Add a config to see the comparison.</Paragraph>
      </Section>
    );
  }

  const report = buildReport({ entries, baseline, household, profile, horizonYears });

  return (
    <>
      <Section title="Comparison">
        <Paragraph>
          <Term id="npv">Net present value</Term> discounts every year's cash flow to today's dollars at the{" "}
          <Term id="discount-rate">discount rate</Term> set in Assumptions above; <Term id="irr">internal rate of return</Term>{" "}
          is the discount rate at which a config's own <Term id="npv">NPV</Term> would equal zero.
        </Paragraph>
        <ComparisonTable entries={entries} baseline={baseline} horizonYears={horizonYears} />
      </Section>

      <Section title="Report">
        {report.verdict && <Paragraph>{renderProseWithTerms(report.verdict)}</Paragraph>}
        {report.dominance.map((text, i) => (
          <Paragraph key={`dominance-${i}`}>{renderProseWithTerms(text)}</Paragraph>
        ))}
        {report.crossovers.map((text, i) => (
          <Paragraph key={`crossover-${i}`}>{renderProseWithTerms(text)}</Paragraph>
        ))}
        {report.windReality.map((text, i) => (
          <Paragraph key={`wind-${i}`}>{renderProseWithTerms(text)}</Paragraph>
        ))}
        {report.perConfig.map((c) => (
          <div key={c.id} style={{ marginTop: 10 }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, margin: "0 0 6px" }}>{c.name}</h3>
            {c.sentences.map((text, i) => (
              <Paragraph key={i}>{renderProseWithTerms(text)}</Paragraph>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Cash flow over time">
        <CashFlowChart entries={entries} horizonYears={horizonYears} />
      </Section>

      <Section title="What each component is worth on its own">
        <IncrementalTable entries={entries} horizonYears={horizonYears} />
      </Section>

      <Section title="A typical day">
        <TypicalDayChart entries={entries} />
      </Section>
    </>
  );
}
