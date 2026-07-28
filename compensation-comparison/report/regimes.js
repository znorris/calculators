// Derived regimes: computed claims about a projection, each with a stated
// definition, which the prose layer turns into sentences.
//
// The pattern is borrowed from WeatherSpark, where a "season" is not a
// calendar quarter but the contiguous range over which a statistic crosses a
// named threshold, and the duration and endpoints are outputs of that
// crossing rather than inputs.
//
// One structural difference is worth keeping in mind. Every WeatherSpark
// regime is a single curve crossing a fixed number. Several regimes here are
// two curves crossing each other (one offer against another), which is a
// different shape and does not pair into complementary halves the way a warm
// season pairs with a cool one.

/** Threshold above which a year counts as tax-elevated. */
export const TAX_ELEVATED_THRESHOLD = 0.3;

/**
 * First year in which one offer's cumulative metric passes the baseline's,
 * having started behind. Returns null when it leads from the start or never
 * catches up, both of which are meaningful and neither of which is an overtake.
 */
export function overtakeYear(candidateCumulative, baselineCumulative, key) {
  if (!candidateCumulative?.length || !baselineCumulative?.length) return null;
  const ledAtStart = candidateCumulative[0][key] >= baselineCumulative[0][key];
  if (ledAtStart) return null;

  for (let i = 0; i < Math.min(candidateCumulative.length, baselineCumulative.length); i += 1) {
    if (candidateCumulative[i][key] > baselineCumulative[i][key]) {
      return {
        year: candidateCumulative[i].year,
        gapAtOvertake: candidateCumulative[i][key] - baselineCumulative[i][key],
        gapAtEnd:
          candidateCumulative[candidateCumulative.length - 1][key] -
          baselineCumulative[baselineCumulative.length - 1][key],
      };
    }
  }
  return null;
}

/** Contiguous runs of years satisfying a predicate. */
export function runsWhere(years, predicate) {
  const runs = [];
  let start = null;
  years.forEach((y, i) => {
    if (predicate(y, i)) {
      if (start === null) start = y.year;
    } else if (start !== null) {
      runs.push({ from: start, to: years[i - 1].year });
      start = null;
    }
  });
  if (start !== null) runs.push({ from: start, to: years[years.length - 1].year });
  return runs;
}

/** Years whose effective tax rate crosses the elevated threshold. */
export function taxElevatedRuns(projection, threshold = TAX_ELEVATED_THRESHOLD) {
  return runsWhere(projection.years, (y) => y.taxes.effectiveRate > threshold);
}

/** The year with the largest value of a metric, plus a second number for context. */
export function peakYear(projection, pick, context) {
  if (!projection.years.length) return null;
  let best = projection.years[0];
  for (const y of projection.years) if (pick(y) > pick(best)) best = y;
  return { year: best.year, value: pick(best), context: context ? context(best) : null };
}

/**
 * The year Social Security withholding stops, which raises take-home for the
 * rest of that year. Read off the wage base rather than derived statistically.
 */
export function wageBaseCrossing(projection) {
  const first = projection.years.find((y) => y.taxes.fica.hitWageBase);
  return first ? { year: first.year } : null;
}

/**
 * The exit year at which the realized total stops being dragged down by
 * forfeiture, which is the employer match cliff and the end of the last
 * clawback window. Read straight off the schedule, not from a threshold.
 */
export function forfeitureClearedYear(projection) {
  const cleared = projection.exitYears.find((e) => e.forfeitedMatch === 0 && e.clawback === 0);
  return cleared ? { year: cleared.year } : null;
}

/**
 * Span where an offer leads the baseline on annual take-home but trails on
 * cumulative total compensation. This compares one metric against a different
 * metric, which no WeatherSpark regime does, so it stands alone rather than
 * pairing with a complement.
 */
export function leadsOnCashTrailsOnTotal(projection, baseline) {
  if (!baseline) return [];
  return runsWhere(projection.years, (y, i) => {
    const rival = baseline.years[i];
    if (!rival) return false;
    return y.takeHome > rival.takeHome && projection.cumulative[i].totalCompensation < baseline.cumulative[i].totalCompensation;
  });
}

/** Threshold above which a year counts as equity-heavy. */
export const EQUITY_HEAVY_THRESHOLD = 0.3;

/**
 * Years where equity is a large share of total compensation, and their
 * complement. This is the closest analogue to a temperature season: one
 * quantity crossing one stated threshold, reported as a pair covering the
 * whole horizon.
 */
export function equityMixRuns(projection, threshold = EQUITY_HEAVY_THRESHOLD) {
  const share = (y) => (y.totalCompensation > 0 ? y.equity.total / y.totalCompensation : 0);
  return {
    threshold,
    heavy: runsWhere(projection.years, (y) => share(y) > threshold),
    cashHeavy: runsWhere(projection.years, (y) => share(y) <= threshold),
  };
}

/**
 * The span before a grant's first tranche vests.
 *
 * Read straight off the schedule rather than derived from a threshold, so it
 * needs no smoothing and no cutoff. A grant whose first year is zero has a
 * cliff; one that starts vesting immediately has none.
 */
export function preCliffRuns(projection) {
  const out = [];
  for (const grant of projection.equity?.perGrant || []) {
    const firstVest = grant.byYear.findIndex((v) => v > 0);
    if (firstVest === -1) {
      out.push({ label: grant.label, neverVests: true });
      continue;
    }
    if (firstVest > 0) out.push({ label: grant.label, throughYear: firstVest });
  }
  return out;
}

/** The year equity vesting peaks, and what it drops to afterward. */
export function equityPeak(projection) {
  const years = projection.years.filter((y) => y.equity.total > 0);
  if (years.length === 0) return null;
  let best = years[0];
  for (const y of years) if (y.equity.total > best.equity.total) best = y;
  const after = projection.years[best.year]; // the following year, if any
  return {
    year: best.year,
    value: best.equity.total,
    dropsTo: after ? after.equity.total : null,
  };
}

/** Every regime for one offer against the baseline. */
export function deriveRegimes(projection, baseline) {
  const isBaseline = baseline && projection.offerId === baseline.offerId;
  return {
    isBaseline,
    overtakeTakeHome: isBaseline ? null : overtakeYear(projection.cumulative, baseline?.cumulative, "takeHome"),
    overtakeTotal: isBaseline ? null : overtakeYear(projection.cumulative, baseline?.cumulative, "totalCompensation"),
    taxElevated: taxElevatedRuns(projection),
    peakTakeHome: peakYear(projection, (y) => y.takeHome, (y) => y.grossWages),
    wageBase: wageBaseCrossing(projection),
    forfeitureCleared: forfeitureClearedYear(projection),
    cashLeadTotalTrail: isBaseline ? [] : leadsOnCashTrailsOnTotal(projection, baseline),
    hasEquity: !!projection.equity?.hasGrants,
    equityMix: projection.equity?.hasGrants ? equityMixRuns(projection) : null,
    preCliff: preCliffRuns(projection),
    equityPeak: equityPeak(projection),
  };
}
