// Sentence generation for the report column.
//
// Two shapes per topic, following WeatherSpark. One names a regime with the
// threshold or schedule that defines it. The other names an extreme with two
// numbers rather than one. Only the offer name and the values change between
// offers, so the same templates serve every offer without hand-written prose.
//
// Methodology and caveats stay out of these sentences and live in the
// assumptions block, the same separation WeatherSpark keeps between its
// season prose and its data-source notes.

import { money, percent, ordinal } from "../format.js";
import { TAX_ELEVATED_THRESHOLD } from "./regimes.js";

function runPhrase(run) {
  return run.from === run.to ? `Year ${run.from}` : `Years ${run.from} through ${run.to}`;
}

/** One-paragraph rollup, the only place a cross-offer comparison appears without scrolling. */
export function overviewSentences({ projections, offersById, baseline, horizonYears }) {
  const out = [];
  if (!projections.length) return out;

  const baselineName = offersById[baseline?.offerId]?.name || "the baseline";
  const ranked = [...projections].sort(
    (a, b) => last(b.cumulative).totalCompensation - last(a.cumulative).totalCompensation,
  );
  const leader = ranked[0];
  const leaderName = offersById[leader.offerId]?.name || "The leading offer";

  out.push(
    `Over ${horizonYears} years, ${leaderName} totals ${money(last(leader.cumulative).totalCompensation)} in compensation, ` +
      `of which ${money(last(leader.cumulative).takeHome)} reaches your bank account after tax.`,
  );

  if (ranked.length > 1 && baseline) {
    const runnerUp = ranked.find((p) => p.offerId !== leader.offerId);
    const gap = last(leader.cumulative).totalCompensation - last(runnerUp.cumulative).totalCompensation;
    const runnerUpName = offersById[runnerUp.offerId]?.name || "the next offer";
    out.push(`That is ${money(gap)} ahead of ${runnerUpName} over the same period.`);
  }

  if (baseline && leader.offerId !== baseline.offerId) {
    out.push(`Differences below are measured against ${baselineName}.`);
  }

  return out;
}

/** Sentences for one offer. */
export function offerSentences({ projection, offer, regimes, baseline, offersById, horizonYears }) {
  const name = offer.name?.trim() || "This offer";
  const out = [];
  const total = last(projection.cumulative);
  const firstYear = projection.years[0];

  // Headline: the horizon total, with the take-home share as the second number.
  out.push({
    topic: "total",
    text:
      `${name} totals ${money(total.totalCompensation)} over ${horizonYears} years, ` +
      `with ${money(total.takeHome)} of that reaching your bank account after tax.`,
  });

  // Year one, because tenure is uncertain and many people never reach year five.
  if (firstYear) {
    out.push({
      topic: "yearOne",
      text:
        `Year one brings ${money(firstYear.totalCompensation)} in total compensation, ` +
        `${money(firstYear.takeHome)} after tax, or ${money(firstYear.perPaycheck.net)} per paycheck ` +
        `across ${firstYear.perPaycheck.periods} paychecks.`,
    });
  }

  // Overtake, which is two curves crossing rather than one crossing a threshold.
  if (regimes.overtakeTakeHome) {
    const baselineName = offersById[baseline.offerId]?.name || "the baseline";
    out.push({
      topic: "overtake",
      text:
        `${name} starts behind ${baselineName} on cumulative take-home and passes it in Year ` +
        `${regimes.overtakeTakeHome.year}, finishing ${money(regimes.overtakeTakeHome.gapAtEnd)} ahead.`,
    });
  } else if (baseline && projection.offerId !== baseline.offerId) {
    const baselineName = offersById[baseline.offerId]?.name || "the baseline";
    const gap = total.takeHome - last(baseline.cumulative).takeHome;
    out.push({
      topic: "overtake",
      text:
        gap >= 0
          ? `${name} leads ${baselineName} on cumulative take-home in every year, ending ${money(gap)} ahead.`
          : `${name} trails ${baselineName} on cumulative take-home in every year, ending ${money(Math.abs(gap))} behind.`,
    });
  }

  // Cash-versus-total divergence, a two-metric regime with no complement.
  for (const run of regimes.cashLeadTotalTrail) {
    out.push({
      topic: "cashVsTotal",
      text:
        `${name} pays more take-home than the baseline in ${runPhrase(run)} while still trailing on ` +
        `cumulative total compensation, because more of the baseline's value arrives as employer contributions.`,
    });
  }

  // Tax regime, stated with the threshold that defines it.
  for (const run of regimes.taxElevated) {
    out.push({
      topic: "tax",
      text: `${runPhrase(run)} carries an effective tax rate above ${percent(TAX_ELEVATED_THRESHOLD)}.`,
    });
  }

  if (regimes.wageBase) {
    out.push({
      topic: "wageBase",
      text:
        `From Year ${regimes.wageBase.year} onward, wages pass the Social Security wage base partway through ` +
        `the year, so later paychecks in that year are larger than earlier ones.`,
    });
  }

  // Exit years, because the horizon total is not what most readers realize.
  const exits = projection.exitYears.filter((e) => e.forfeitedMatch > 0 || e.clawback > 0);
  if (exits.length) {
    const worst = exits[0];
    out.push({
      topic: "exit",
      text:
        `Leaving at the end of Year ${worst.year} realizes ${money(worst.realized)} of the projected ` +
        `${money(total.totalCompensation)}, forfeiting ${money(worst.forfeitedMatch)} in unvested employer ` +
        `match${worst.clawback > 0 ? ` and repaying ${money(worst.clawback)} in bonus still inside its clawback window` : ""}.`,
    });
  }
  if (regimes.forfeitureCleared && regimes.forfeitureCleared.year > 1) {
    out.push({
      topic: "exit",
      text: `Nothing is forfeited on departure from the end of Year ${regimes.forfeitureCleared.year} onward.`,
    });
  }

  // Peak, the two-number superlative.
  if (regimes.peakTakeHome) {
    out.push({
      topic: "peak",
      text:
        `The highest take-home year is Year ${regimes.peakTakeHome.year}, with ` +
        `${money(regimes.peakTakeHome.context)} gross and ${money(regimes.peakTakeHome.value)} after tax.`,
    });
  }

  return out;
}

/** Caveats, deliberately separate from the narrative sentences above. */
export function assumptionNotes({ projections, offersById, comparison }) {
  const notes = [];

  const missingState = projections.filter(
    (p) => p.years[0] && p.years[0].taxes.state.available === false && offersById[p.offerId]?.state,
  );
  if (missingState.length) {
    const codes = [...new Set(missingState.map((p) => offersById[p.offerId].state))];
    notes.push(
      `State tax data is not yet loaded for ${codes.join(", ")}, so those offers show no state income tax ` +
        `and their take-home is overstated.`,
    );
  }

  const cityOffers = projections
    .map((p) => offersById[p.offerId])
    .filter((o) => o && o.cityTaxRate);
  if (cityOffers.length) {
    notes.push(
      `City tax is applied as a flat rate you supplied, to ${
        cityOffers[0].cityTaxBase === "taxable" ? "income after deductions" : "gross wages"
      }. No city-specific rules or reciprocity are modeled.`,
    );
  }

  notes.push(
    `Raises compound at the rate set on each offer and are an assumption, not a commitment.`,
    `Employer retirement contributions count as dollars contributed, subject to the vesting schedule. No investment return is projected.`,
    `Tax is computed at ${comparison.taxYear} rates for a ${filingLabel(comparison.filingStatus)} filer taking the standard deduction. Itemized deductions, credits, dependents, and other income are not modeled.`,
    `State disability and paid-leave deductions are included where the state has them. City income taxes beyond the rate you enter are not.`,
    `This is an estimate, not tax or financial advice.`,
  );

  return notes;
}

function filingLabel(status) {
  return (
    {
      single: "single",
      marriedJoint: "married filing jointly",
      marriedSeparate: "married filing separately",
      headOfHousehold: "head of household",
    }[status] || status
  );
}

function last(arr) {
  return arr[arr.length - 1];
}

export { ordinal };
