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

  // Equity. Stated before tax because a large vest is usually what drives the
  // tax regime rather than the other way round.
  if (regimes.hasEquity) {
    const cumulativeEquity = total.equity;
    const band = projection.equityBand;
    out.push({
      topic: "equity",
      text: band
        ? `Equity vests to ${money(cumulativeEquity)} over ${horizonYears} years, ranging from ` +
          `${money(sum(band.low.total))} under the conservative growth rate to ${money(sum(band.high.total))} ` +
          `under the optimistic one.`
        : `Equity vests to ${money(cumulativeEquity)} over ${horizonYears} years.`,
    });

    for (const grant of regimes.preCliff) {
      out.push({
        topic: "equity",
        text: grant.neverVests
          ? `${grant.label} does not begin vesting within the ${horizonYears}-year horizon.`
          : `${grant.label} vests nothing through Year ${grant.throughYear}, so leaving before then forfeits all of it.`,
      });
    }

    if (regimes.equityMix?.heavy.length) {
      out.push({
        topic: "equity",
        text:
          `${runPhrase(regimes.equityMix.heavy[0])} draws more than ${percent(regimes.equityMix.threshold, 0)} ` +
          `of total compensation from equity${regimes.equityMix.cashHeavy.length ? `, against ${runPhrase(regimes.equityMix.cashHeavy[0])} that lean on cash` : ""}.`,
      });
    }

    if (regimes.equityPeak) {
      out.push({
        topic: "equity",
        text:
          `Equity peaks in Year ${regimes.equityPeak.year} at ${money(regimes.equityPeak.value)}` +
          (regimes.equityPeak.dropsTo != null && regimes.equityPeak.dropsTo < regimes.equityPeak.value
            ? `, then falls to ${money(regimes.equityPeak.dropsTo)} the following year.`
            : `.`),
      });
    }
  }

  // Variable pay, stated as target beside expected, because a quoted OTE is
  // the payout at exactly 100% and almost nobody lands there.
  const v = firstYear?.variable;
  if (v) {
    const steady = projection.years[1]?.variable || v;
    out.push({
      topic: "variable",
      text:
        `On-target earnings are ${money(v.ote)}, a ${Math.round((1 - v.payMix) * 100)}/${Math.round(v.payMix * 100)} ` +
        `split between guaranteed base and at-risk variable pay. At the ${percent(v.attainment, 0)} attainment you ` +
        `expect, variable pay comes to ${money(steady.net)} rather than ${money(steady.atTarget)}.`,
    });

    if (v.rampMonths > 0) {
      out.push({
        topic: "variable",
        text:
          `Year one is protected by a ${v.rampMonths}-month ramp paying ${money(v.rampPay)} regardless of ` +
          `attainment, so year one earns ${money(v.net)} and the steady state is ${money(steady.net)}.`,
      });
    }

    if (v.wasCapped) {
      out.push({
        topic: "variable",
        text: `The payout is capped, so attainment above the cap earns nothing further.`,
      });
    }

    if (v.drawShortfall > 0) {
      out.push({
        topic: "variable",
        text:
          `The draw is recoverable and expected attainment falls short of it by ${money(v.drawShortfall)}, ` +
          `which is a debt owed back out of later commission rather than money kept.`,
      });
    }

    if (v.clawback > 0) {
      out.push({
        topic: "variable",
        text: `Expected clawback on cancelled deals removes ${money(v.clawback)} of what is paid.`,
      });
    }

    const curve = projection.attainmentCurve || [];
    if (curve.length) {
      const low = curve[0];
      const high = curve[curve.length - 1];
      out.push({
        topic: "variable",
        text:
          `Across the plan, ${percent(low.attainment, 0)} of quota pays ${money(low.payout)} and ` +
          `${percent(high.attainment, 0)} pays ${money(high.payout)}, a spread of ${money(high.payout - low.payout)} ` +
          `on the same offer.`,
      });
    }
  }

  // Benefits, kept distinct from compensation because they are a different
  // kind of money.
  const b = firstYear?.benefits;
  if (b && (b.net !== 0 || firstYear.employerHealth.total > 0)) {
    const health = firstYear.employerHealth;
    if (health.total > 0) {
      out.push({
        topic: "benefits",
        text:
          `The employer puts ${money(health.total)} a year into your health coverage` +
          `${health.hsaSeed > 0 ? `, ${money(health.hsaSeed)} of it seeding an HSA` : ""}, ` +
          `which never appears in a paycheck but is real money spent on you.`,
      });
    }

    const parts = [];
    if (b.timeOff > 0) {
      parts.push(
        `${b.daysOff} days off worth ${money(b.timeOff)}${offer.unlimitedPto ? ", at the days you expect to actually take" : ""}`,
      );
    }
    if (b.holidays > 0) parts.push(`${offer.paidHolidays} paid holidays worth ${money(b.holidays)}`);
    if (b.meals > 0) parts.push(`${money(b.meals)} of meals across ${b.onsiteDays} days onsite`);
    if (b.stipends > 0) parts.push(`${money(b.stipends)} in stipends`);
    if (parts.length) {
      out.push({ topic: "benefits", text: `Benefits add ${joinList(parts)}.` });
    }

    if (b.commuteCost > 0 || b.commuteTimeCost > 0) {
      out.push({
        topic: "benefits",
        text:
          `Commuting costs ${money(b.commuteCost + b.commuteTimeCost)} a year` +
          (b.commuteTimeCost > 0
            ? `, including ${Math.round(b.commuteHours)} hours of unpaid travel priced at your own rate.`
            : `.`),
      });
    }

    if (firstYear.medicalCost > 0) {
      out.push({
        topic: "benefits",
        text: `Expected medical spending of ${money(firstYear.medicalCost)} comes out of that.`,
      });
    }

    if (b.parentalLeave > 0) {
      out.push({
        topic: "benefits",
        text:
          `Parental leave is worth ${money(b.parentalLeave)} if taken, and is excluded from the totals ` +
          `because it pays once rather than every year.`,
      });
    }
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
  const exits = projection.exitYears.filter((e) => e.forfeitedTotal > 0);
  if (exits.length) {
    const worst = exits[0];
    const lost = [
      worst.forfeitedEquity > 0 ? `${money(worst.forfeitedEquity)} in unvested equity` : null,
      worst.forfeitedMatch > 0 ? `${money(worst.forfeitedMatch)} in unvested employer match` : null,
      worst.clawback > 0 ? `${money(worst.clawback)} in bonus still inside its clawback window` : null,
    ].filter(Boolean);
    out.push({
      topic: "exit",
      text:
        `Leaving at the end of Year ${worst.year} realizes ${money(worst.realized)} of the projected ` +
        `${money(total.totalCompensation)}, giving up ${joinList(lost)}.`,
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

  const withEquity = projections.filter((p) => p.equity?.hasGrants);
  if (withEquity.length) {
    notes.push(
      `Equity is valued at the grant amount grown by the rate you set, which is an assumption and not a forecast. Dilution, liquidation preferences, and the gap between a 409A valuation and a preferred share price are not modeled.`,
    );
    if (withEquity.some((p) => p.equity.hasOptions)) {
      notes.push(
        `Option grants are valued at the spread between the share price and the strike price, counted toward total compensation but not taxed. Real tax depends on when you exercise, which this does not model, and an ISO exercise can trigger alternative minimum tax.`,
      );
    }
    notes.push(
      `RSU vesting is treated as ordinary income in the year it vests, so a large vest can push that year into a higher bracket. Employers withhold on vesting at a flat supplemental rate that may be below your actual rate.`,
    );
  }

  const withVariable = projections.filter((p) => p.years[0]?.variable);
  if (withVariable.length) {
    notes.push(
      `Variable pay is computed at the attainment you entered, not at 100% of quota. A quoted on-target figure is what the plan pays at exactly quota, which most people do not hit; asking what share of the team hit quota last year is worth more than any assumption here.`,
      `Territory quality, lead flow, and your own ramp beyond the months entered are not modeled, and all three move real attainment more than the plan's shape does.`,
    );
  }

  const withBenefits = projections.filter((p) => p.years[0]?.benefits?.net !== 0);
  if (withBenefits.length) {
    notes.push(
      `Total compensation counts cash, equity, and employer contributions. Dollarized benefits like meals, stipends, and time off are reported separately as total rewards, because they are avoided costs rather than money paid to you.`,
      `Paid time off is valued at your daily rate, salary divided by 260 working days. For a salaried role this is a way to compare two policies, not extra income: the salary is the same whether or not the days get taken.`,
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

function sum(arr) {
  return (arr || []).reduce((total, n) => total + n, 0);
}

/** "a", "a and b", "a, b, and c". */
function joinList(parts) {
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export { ordinal };
