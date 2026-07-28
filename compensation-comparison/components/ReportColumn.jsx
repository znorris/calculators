// The report column: read-only, peer to the offer columns, and the primary
// comparison surface. On a phone it is one more column you swipe to.
//
// Because a reader on a phone sees one column at a time and cannot overlay
// two offers on one chart, the generated prose carries the comparison that an
// overlaid chart would otherwise carry.

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { overviewSentences, offerSentences, assumptionNotes } from "../report/prose.js";
import { deriveRegimes } from "../report/regimes.js";
import { scoreAll, moneyAndFitAgree } from "../calc/fit.js";
import {
  MIN_HORIZON_YEARS,
  MAX_HORIZON_YEARS,
  MIN_YEARS_FOR_TREND,
  clampHorizon,
} from "../model/comparison.js";
import { TrendChart } from "./TrendChart.jsx";
import { offerColor } from "../theme.js";
import { money, signedMoney, signedPercent } from "../format.js";
import { card, color } from "../theme.js";

const SERIES = [
  { key: "base", label: "Base pay", fill: "#4f46e5" },
  { key: "bonus", label: "Bonus", fill: "#0284c7" },
  { key: "equity", label: "Equity", fill: "#7c3aed" },
  { key: "retirement", label: "Employer retirement", fill: "#047857" },
];

function Heading({ children }) {
  return (
    <h3 style={{ fontSize: 12, fontWeight: 700, color: color.ink, margin: "0 0 7px", letterSpacing: 0.1 }}>
      {children}
    </h3>
  );
}

/**
 * A callout. Marked with a colored left edge on a white card, matching how
 * mortgage-strategy-comparison marks the same kind of takeaway and caveat
 * blocks, rather than a full pastel fill.
 */
function Block({ children, tone = "plain" }) {
  const tones = {
    plain: { borderLeft: `3px solid ${color.rule}` },
    accent: { borderLeft: `4px solid ${color.accent}` },
    caution: { borderLeft: `4px solid ${color.caution}` },
  };
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.hairline}`,
        borderRadius: 8,
        padding: "11px 12px",
        marginBottom: 12,
        ...tones[tone],
      }}
    >
      {children}
    </div>
  );
}

function Paragraph({ children }) {
  return <p style={{ fontSize: 12.5, lineHeight: 1.6, color: color.body, margin: "0 0 7px" }}>{children}</p>;
}

/**
 * Wide content scrolls inside its own container. Without this, a table with
 * several offers pushes the page itself sideways, which on a phone means the
 * whole layout drifts as you scroll down.
 */
function Scroller({ children }) {
  return <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>;
}

function last(arr) {
  return arr[arr.length - 1];
}

export function ReportColumn({ projections, offersById, baseline, comparison, isPinned, onHorizonChange }) {
  const horizonYears = comparison.horizonYears;

  if (projections.length === 0) {
    return (
      <article style={{ ...card, width: "100%", padding: 16 }}>
        <Heading>Report</Heading>
        <Paragraph>Add an offer to see the comparison.</Paragraph>
      </article>
    );
  }

  const overview = overviewSentences({ projections, offersById, baseline, horizonYears });
  const notes = assumptionNotes({ projections, offersById, comparison });

  return (
    <article
      style={{
        ...card,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "10px 12px", borderBottom: `1px solid ${color.hairline}` }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: color.ink, margin: 0 }}>Report</h2>
        {/*
          The horizon sets the report's own time window, so it belongs here
          rather than in the settings bar. This is the one editable control in
          an otherwise read-only column, and it edits the report rather than
          any offer.
        */}
        <p
          style={{
            fontSize: 11.5,
            color: color.muted,
            margin: "4px 0 0",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <label htmlFor="horizon-years" style={{ display: "contents" }}>
            <input
              id="horizon-years"
              type="number"
              inputMode="numeric"
              min={MIN_HORIZON_YEARS}
              max={MAX_HORIZON_YEARS}
              value={horizonYears}
              onChange={(e) => onHorizonChange(clampHorizon(e.target.value))}
              aria-label="Comparison horizon in years"
              style={{
                width: 46,
                padding: "3px 5px",
                fontSize: 11.5,
                fontWeight: 700,
                textAlign: "center",
                color: color.ink,
                border: `1px solid ${color.rule}`,
                borderRadius: 4,
                background: color.surface,
                fontFamily: "inherit",
              }}
            />
            <span>year comparison</span>
          </label>
          {isPinned && <span style={{ color: color.faint }}>· pinned</span>}
        </p>
      </header>

      <div style={{ padding: 12 }}>
        <Block tone="accent">
          {overview.map((sentence, i) => (
            <Paragraph key={i}>{sentence}</Paragraph>
          ))}
        </Block>

        <Heading>Against the baseline</Heading>
        <Block tone="accent">
          <Scroller>
            <DeltaTable projections={projections} offersById={offersById} baseline={baseline} />
          </Scroller>
        </Block>

        <TrendSection projections={projections} offersById={offersById} horizonYears={horizonYears} />

        <Heading>Where the money comes from</Heading>
        <MixChart
          projections={projections}
          offersById={offersById}
          baseline={baseline}
          horizonYears={horizonYears}
        />

        {projections.map((projection) => {
          const offer = offersById[projection.offerId];
          if (!offer) return null;
          const regimes = deriveRegimes(projection, baseline);
          const sentences = offerSentences({
            projection,
            offer,
            regimes,
            baseline,
            offersById,
            horizonYears,
          });
          return (
            <div key={projection.offerId}>
              <Heading>{offer.name?.trim() || "Untitled offer"}</Heading>
              <Block>
                {sentences.map((s, i) => (
                  <Paragraph key={i}>{s.text}</Paragraph>
                ))}
              </Block>
            </div>
          );
        })}

        <FitSection projections={projections} offersById={offersById} comparison={comparison} />

        <Heading>If you leave early</Heading>
        <Block>
          <Paragraph>
            Tenure is uncertain, so the {horizonYears}-year total is not what most people realize. This is what
            you keep by walking away at the end of each year.
          </Paragraph>
          <Scroller>
            <ExitTable projections={projections} offersById={offersById} />
          </Scroller>
        </Block>

        <Heading>Assumptions</Heading>
        <Block tone="caution">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {notes.map((note, i) => (
              <li key={i} style={{ fontSize: 11, lineHeight: 1.55, color: color.body, marginBottom: 4 }}>
                {note}
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </article>
  );
}

/**
 * Trends over the horizon: read any year off the line instead of picking one.
 *
 * Series are keyed by offer id rather than by name, so two offers sharing a
 * name cannot collide into one line. Equity gets its own chart, and only when
 * an offer actually has grants, because a flat zero line teaches nothing.
 */
function TrendSection({ projections, offersById, horizonYears }) {
  if (horizonYears < MIN_YEARS_FOR_TREND) {
    return (
      <div>
        <Heading>Over time</Heading>
        <Block>
          <Paragraph>
            A {horizonYears}-year horizon has too few points to plot. Raise the horizon in the header to see the
            trend, or read the year-by-year figures below.
          </Paragraph>
        </Block>
      </div>
    );
  }

  const named = projections.map((p, i) => ({
    projection: p,
    offer: offersById[p.offerId],
    color: offerColor(i),
  }));

  const series = named.map(({ projection, offer, color: c }) => ({
    key: projection.offerId,
    name: offer?.name?.trim() || "Untitled",
    color: c,
  }));

  function rows(pick) {
    return Array.from({ length: horizonYears }, (_, i) => {
      const row = { year: i + 1 };
      for (const { projection } of named) row[projection.offerId] = Math.round(pick(projection, i));
      return row;
    });
  }

  const totalRows = rows((p, i) => p.cumulative[i]?.totalCompensation ?? 0);
  const takeHomeRows = rows((p, i) => p.cumulative[i]?.takeHome ?? 0);

  // Equity only when someone has a grant, and a band only where the user gave
  // both a conservative and an optimistic growth rate.
  const withEquity = named.filter(({ projection }) => projection.equity?.hasGrants);
  let equityRows = null;
  let equitySeries = null;
  let bandedNames = [];

  if (withEquity.length) {
    equitySeries = withEquity.map(({ projection, offer, color: c }) => {
      const hasBand = Boolean(projection.equityBand);
      if (hasBand) bandedNames.push(offer?.name?.trim() || "Untitled");
      return {
        key: projection.offerId,
        name: offer?.name?.trim() || "Untitled",
        color: c,
        bandLowKey: hasBand ? `${projection.offerId}__low` : undefined,
        bandHighKey: hasBand ? `${projection.offerId}__high` : undefined,
      };
    });

    const running = new Map();
    equityRows = Array.from({ length: horizonYears }, (_, i) => {
      const row = { year: i + 1 };
      for (const { projection } of withEquity) {
        const acc = running.get(projection.offerId) || { base: 0, low: 0, high: 0 };
        acc.base += projection.equity.total[i] ?? 0;
        acc.low += projection.equityBand?.low.total[i] ?? 0;
        acc.high += projection.equityBand?.high.total[i] ?? 0;
        running.set(projection.offerId, acc);
        row[projection.offerId] = Math.round(acc.base);
        if (projection.equityBand) {
          row[`${projection.offerId}__low`] = Math.round(acc.low);
          row[`${projection.offerId}__high`] = Math.round(acc.high);
        }
      }
      return row;
    });
  }

  return (
    <div>
      <Heading>Total compensation over time</Heading>
      <TrendChart
        data={totalRows}
        series={series}
        caption="Cumulative total compensation. Touch or hover any year to read every offer at that point."
      />

      <Heading>Take-home over time</Heading>
      <TrendChart
        data={takeHomeRows}
        series={series}
        caption="Cumulative pay after tax and deductions. An offer can lead the chart above and trail this one."
      />

      {equityRows && (
        <>
          <Heading>Equity over time</Heading>
          <TrendChart
            data={equityRows}
            series={equitySeries}
            caption={
              bandedNames.length
                ? `Cumulative equity value. The shaded band spans the conservative and optimistic growth rates you set for ${bandedNames.join(" and ")}; the line is the expected rate.`
                : "Cumulative equity value at the expected growth rate. Set a conservative and an optimistic rate on an offer to see a range."
            }
          />
        </>
      )}
    </div>
  );
}

/**
 * Composition of each year's compensation, stacked. Every chart in the report
 * shares a Year 1..N x-axis so a reader scrolling on a phone can hold a year
 * constant without re-orienting.
 */
function MixChart({ projections, offersById, baseline, horizonYears }) {
  // Chart the baseline, not whichever offer happens to sit at index 0.
  // Reordering columns and choosing a baseline are independent, so keying off
  // array position would silently chart a different offer than the one every
  // delta in this report is measured against.
  const subject = projections.find((p) => p.offerId === baseline?.offerId) || projections[0];
  if (!subject) return null;
  const subjectName = offersById[subject.offerId]?.name?.trim() || "Offer";

  const data = subject.years.slice(0, horizonYears).map((y, i) => ({
    year: `Y${i + 1}`,
    base: Math.round(y.wages.total),
    bonus: Math.round(y.bonusTotal),
    equity: Math.round(y.equity.total),
    retirement: Math.round(y.retirement.employer),
  }));

  return (
    <div style={{ marginBottom: 14 }}>
      {/*
        The fixed height belongs to this inner box and nothing else. Recharts
        needs a definite width and height to measure against, but anything
        else placed inside a fixed-height box overflows it and lands on top of
        whatever follows. The caption is a sibling below, not a child.
      */}
      <div style={{ width: "100%", minWidth: 0, height: 180 }}>
      <ResponsiveContainer width="100%" height={180} minWidth={0} debounce={0}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="2 3" stroke={color.hairline} vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: color.muted }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10.5, fill: color.muted }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          />
          <Tooltip
            formatter={(v) => money(v)}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${color.hairline}` }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.fill} name={s.label} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 11, color: color.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
        Composition of {subjectName}'s annual compensation, the baseline offer. Employer retirement is counted
        as dollars contributed, not as a balance grown at a return rate.
      </p>
    </div>
  );
}

/**
 * Fit, reported as its own figure beside the money and never folded into it.
 *
 * Blending a dollar total with 1-to-5 ratings hides how much a rating moved
 * the answer, which is the specific criticism the research found of the tools
 * that do it. Where the two disagree, saying so is more useful than papering
 * over it with a composite.
 */
function FitSection({ projections, offersById, comparison }) {
  const offers = projections.map((p) => offersById[p.offerId]).filter(Boolean);
  const { scores, biggestGap, leader } = scoreAll(offers, comparison.factors || []);
  const rated = offers.filter((o) => scores.get(o.id));
  if (rated.length === 0) return null;

  const moneyLeader = [...projections].sort(
    (a, b) => last(b.cumulative).totalCompensation - last(a.cumulative).totalCompensation,
  )[0];
  const agree = moneyAndFitAgree(moneyLeader?.offerId, leader?.id);

  return (
    <div>
      <Heading>Fit</Heading>
      <Block>
        <Scroller>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={th}>Offer</th>
                <th style={{ ...th, textAlign: "right" }}>Fit</th>
                <th style={{ ...th, textAlign: "right" }}>Rated</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((offer) => {
                const score = scores.get(offer.id);
                return (
                  <tr key={offer.id}>
                    <td style={td}>{offer.name?.trim() || "Untitled"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(score.percent)}%
                    </td>
                    <td style={{ ...td, textAlign: "right", color: color.muted }}>
                      {score.ratedCount} of {score.totalCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>

        {agree === false && (
          <Paragraph>
            <strong>{offersById[moneyLeader.offerId]?.name?.trim() || "One offer"}</strong> leads on money while{" "}
            <strong>{leader.name?.trim() || "another"}</strong> leads on fit, so there is a real trade here rather
            than a clear winner.
          </Paragraph>
        )}
        {agree === true && (
          <Paragraph>
            <strong>{leader.name?.trim() || "The same offer"}</strong> leads on both money and fit.
          </Paragraph>
        )}
        {biggestGap && (
          <Paragraph>
            The factor separating them most is {biggestGap.factor.label.toLowerCase()}, where{" "}
            {biggestGap.best.name?.trim() || "one offer"} rates {biggestGap.spread} points above{" "}
            {biggestGap.worst.name?.trim() || "the other"} at a weight of {biggestGap.factor.weight}.
          </Paragraph>
        )}
        <p style={{ fontSize: 11, color: color.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
          Fit is your weights times your ratings, out of the maximum those same factors could score. It is
          deliberately not combined with the dollar figures.
        </p>
      </Block>
    </div>
  );
}

function DeltaTable({ projections, offersById, baseline }) {
  if (!baseline) return null;
  const baseTotal = baseline.cumulative[baseline.cumulative.length - 1];

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 11.5 }}>
      <thead>
        <tr>
          <th style={th}>Offer</th>
          <th style={{ ...th, textAlign: "right" }}>Total</th>
          <th style={{ ...th, textAlign: "right" }}>vs base</th>
        </tr>
      </thead>
      <tbody>
        {projections.map((p) => {
          const total = p.cumulative[p.cumulative.length - 1];
          const delta = total.totalCompensation - baseTotal.totalCompensation;
          const ratio = baseTotal.totalCompensation
            ? delta / baseTotal.totalCompensation
            : 0;
          const isBase = p.offerId === baseline.offerId;
          return (
            <tr key={p.offerId}>
              <td style={td}>{offersById[p.offerId]?.name?.trim() || "Untitled"}</td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {money(total.totalCompensation)}
              </td>
              <td
                style={{
                  ...td,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: isBase ? color.muted : delta >= 0 ? color.positive : color.negative,
                }}
              >
                {isBase ? "—" : `${signedMoney(delta)} (${signedPercent(ratio)})`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ExitTable({ projections, offersById }) {
  const years = projections[0]?.exitYears?.length || 0;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, marginTop: 6 }}>
      <thead>
        <tr>
          <th style={th}>Leave after</th>
          {projections.map((p) => (
            <th key={p.offerId} style={{ ...th, textAlign: "right" }}>
              {offersById[p.offerId]?.name?.trim()?.split(" ")[0] || "Offer"}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: years }, (_, i) => (
          <tr key={i}>
            <td style={td}>Year {i + 1}</td>
            {projections.map((p) => {
              const exit = p.exitYears[i];
              const lost = exit ? exit.forfeitedTotal : 0;
              return (
                <td key={p.offerId} style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {exit ? money(exit.realized) : "—"}
                  {lost > 0 && (
                    // The forfeited figure is the more consequential of the
                    // two, so it does not render smaller than the one above it.
                    <span style={{ display: "block", fontSize: 11, color: color.negative }}>
                      −{money(lost)} forfeited
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Horizontal padding matters here: the exit table gains one column per offer,
// and with none the right-aligned figures touch the next column's text.
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
