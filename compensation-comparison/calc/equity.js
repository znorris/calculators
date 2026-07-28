// Equity vesting across overlapping grants.
//
// An initial grant and a refresher are the same object: a value, an origin
// year, and a curve it vests along. A refresher granted in year 2 therefore
// stacks on top of years 2 through 5 of the initial grant rather than
// replacing it, which is what makes an annual equity figure misleading.
//
// Tax treatment differs by instrument and is deliberately partial here:
//   RSU   vested value is ordinary income in the year it vests
//   NSO   spread is ordinary income at EXERCISE, which is not modeled
//   ISO   no regular tax at exercise, an AMT preference item instead
// So only RSU vesting feeds the tax calculation. Option value is counted
// toward total compensation but produces no tax event, which the assumptions
// block states outright.

import { presetSchedule } from "../model/schema.js";

/**
 * Percentage of a grant vesting in each year, as an array of decimals.
 *
 * Falls back to an even four-year split when a custom string cannot be
 * parsed, rather than silently vesting nothing.
 */
export function vestingSchedule(grant) {
  const preset = presetSchedule(grant.vestingPreset);
  if (preset) return preset.map((p) => p / 100);

  // Empty segments are dropped before conversion. Number("") is 0, which is
  // finite and non-negative, so a trailing comma would otherwise append a
  // phantom year that vests nothing.
  const parsed = String(grant.vestingCustom || "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (parsed.length === 0) return [0.25, 0.25, 0.25, 0.25];
  return parsed.map((p) => p / 100);
}

/** Grant value at its origin, before any growth. */
export function grantBaseValue(grant) {
  if (grant.instrument === "rsu") return grant.grantValue || 0;
  // Options are worth the spread, not the share price. A grant whose strike
  // equals or exceeds the current price is worth nothing today, which is the
  // honest figure rather than a negative one.
  const spread = Math.max(0, (grant.sharePrice || 0) - (grant.strikePrice || 0));
  return spread * (grant.shares || 0);
}

/** Cash needed to exercise every share in an option grant. */
export function exerciseCost(grant) {
  if (grant.instrument === "rsu") return 0;
  return (grant.strikePrice || 0) * (grant.shares || 0);
}

/**
 * Vesting for one grant across the horizon.
 *
 * `yearIndex` is zero-based. A grant with `grantYear` 2 begins vesting in
 * horizon year 2, so its first tranche lands at index 1. Growth compounds
 * from the grant year, not from the start of the horizon, because a grant
 * issued later has had less time to appreciate.
 */
export function grantVestingByYear(grant, horizonYears, growthRate) {
  const schedule = vestingSchedule(grant);
  const base = grantBaseValue(grant);
  const startIndex = Math.max(0, (grant.grantYear || 1) - 1);

  const out = new Array(horizonYears).fill(0);
  for (let i = 0; i < schedule.length; i += 1) {
    const yearIndex = startIndex + i;
    if (yearIndex >= horizonYears) break;
    const yearsOfGrowth = i + 1;
    out[yearIndex] = base * schedule[i] * Math.pow(1 + growthRate, yearsOfGrowth);
  }
  return out;
}

/** Fraction of a grant still unvested after `yearsElapsed` horizon years. */
export function unvestedFraction(grant, yearsElapsed) {
  const schedule = vestingSchedule(grant);
  const startIndex = Math.max(0, (grant.grantYear || 1) - 1);
  let vested = 0;
  for (let i = 0; i < schedule.length; i += 1) {
    if (startIndex + i < yearsElapsed) vested += schedule[i];
  }
  const total = schedule.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return 0;
  return Math.max(0, 1 - vested / total);
}

/**
 * Equity across every grant, per year of the horizon.
 *
 * Returns per-year totals split by whether the value is taxable as ordinary
 * income this year (RSU vesting) or merely accrued (options), plus the
 * unvested balance forfeited by leaving at the end of each year.
 */
export function projectEquity(offer, horizonYears, growthRate) {
  const grants = offer.grants || [];

  const taxable = new Array(horizonYears).fill(0);
  const untaxed = new Array(horizonYears).fill(0);
  const perGrant = [];

  for (const grant of grants) {
    const byYear = grantVestingByYear(grant, horizonYears, growthRate);
    const isRsu = grant.instrument === "rsu";
    for (let i = 0; i < horizonYears; i += 1) {
      if (isRsu) taxable[i] += byYear[i];
      else untaxed[i] += byYear[i];
    }
    perGrant.push({
      id: grant.id,
      label: grant.label || (isRsu ? "RSU grant" : "Option grant"),
      instrument: grant.instrument,
      baseValue: grantBaseValue(grant),
      exerciseCost: exerciseCost(grant),
      byYear,
    });
  }

  const forfeitedIfLeavingAfter = [];
  for (let year = 1; year <= horizonYears; year += 1) {
    let forfeited = 0;
    for (const grant of grants) {
      // Value the unvested remainder at the price it would reach by the exit
      // year, so the forfeiture is stated in the same terms as the vested
      // value it sits beside.
      const grown = grantBaseValue(grant) * Math.pow(1 + growthRate, year);
      forfeited += grown * unvestedFraction(grant, year);
    }
    forfeitedIfLeavingAfter.push(forfeited);
  }

  return {
    perGrant,
    taxable,
    untaxed,
    total: taxable.map((v, i) => v + untaxed[i]),
    forfeitedIfLeavingAfter,
    hasGrants: grants.length > 0,
    hasOptions: grants.some((g) => g.instrument !== "rsu"),
  };
}

/**
 * The same projection under conservative and optimistic growth, when the user
 * supplied either. Returns null when they did not, so the report shows a
 * single figure rather than manufacturing a range from one point estimate.
 */
export function equityRange(offer, horizonYears) {
  const low = offer.stockGrowthLow;
  const high = offer.stockGrowthHigh;
  if (low == null && high == null) return null;
  const base = offer.stockGrowthRate || 0;
  return {
    low: projectEquity(offer, horizonYears, low ?? base),
    high: projectEquity(offer, horizonYears, high ?? base),
  };
}
