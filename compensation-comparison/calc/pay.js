// Base wages and bonuses for a single year.

/**
 * Annualized base wages before any bonus, for one year of the horizon.
 *
 * `yearIndex` is zero-based, so year 1 of the horizon is index 0 and receives
 * no raise. Raises compound from year 2 onward.
 */
export function baseWagesForYear(offer, yearIndex) {
  const raiseFactor = Math.pow(1 + (offer.annualRaiseRate || 0), yearIndex);

  if (offer.payType === "hourly") {
    const rate = (offer.hourlyRate || 0) * raiseFactor;
    const weeks = offer.weeksPerYear || 0;
    const regular = rate * (offer.hoursPerWeek || 0) * weeks;
    const overtime = rate * (offer.overtimeMultiplier || 1.5) * (offer.overtimeHoursPerWeek || 0) * weeks;
    // A shift differential is a flat premium per hour, so it is not scaled by
    // the raise the way the base rate is.
    const differential = (offer.shiftDifferentialRate || 0) * (offer.shiftDifferentialHours || 0) * weeks;
    return { regular, overtime, differential, total: regular + overtime + differential };
  }

  const total = (offer.annualSalary || 0) * (offer.ftePercent ?? 1) * raiseFactor;
  return { regular: total, overtime: 0, differential: 0, total };
}

/**
 * Bonus line items payable in a given year.
 *
 * A recurring bonus pays every year, discounted by its realization rate so a
 * target that historically pays at 80% is not counted at face value. A
 * one-time bonus pays only in its stated year.
 */
export function bonusesForYear(offer, yearIndex, baseWages) {
  const year = yearIndex + 1;
  const items = [];

  for (const bonus of offer.bonuses || []) {
    const isDue = bonus.recurrence === "oneTime" ? (bonus.year || 1) === year : true;
    if (!isDue) continue;

    const face =
      bonus.basis === "percentOfBase" ? baseWages * (bonus.percent || 0) : bonus.amount || 0;
    if (!face) continue;

    const realization = bonus.recurrence === "annual" ? (bonus.realizationRate ?? 1) : 1;

    items.push({
      id: bonus.id,
      label: bonus.label || "Bonus",
      recurrence: bonus.recurrence,
      face,
      amount: face * realization,
      realizationRate: realization,
      clawbackYears: bonus.recurrence === "oneTime" ? bonus.clawbackYears || 0 : 0,
      paidInYear: bonus.recurrence === "oneTime" ? bonus.year || 1 : year,
    });
  }

  return items;
}

/**
 * Employee deferral and employer contribution for one year.
 *
 * The deferral is capped at the statutory elective limit. The match is a
 * percentage of pay, optionally capped at a percentage of salary, which is
 * the shape most plans publish even though tiered formulas exist.
 */
export function retirementForYear(offer, pensionableWages, limits, yearIndex) {
  if (!offer.retirementOffered) {
    return { employee: 0, employer: 0, isPreTax: false, eligible: false };
  }

  // Eligibility is expressed in months of service, so a waiting period longer
  // than the elapsed time in a year reduces that year proportionally.
  const monthsElapsed = (yearIndex + 1) * 12;
  const monthsWaiting = offer.retirementEligibilityMonths || 0;
  const eligibleMonths = Math.max(0, Math.min(12, monthsElapsed - monthsWaiting));
  const eligibleFraction = eligibleMonths / 12;
  if (eligibleFraction === 0) {
    return { employee: 0, employer: 0, isPreTax: offer.deferralType === "traditional", eligible: false };
  }

  const eligibleWages = pensionableWages * eligibleFraction;

  const employee = Math.min(
    eligibleWages * (offer.employeeDeferralRate || 0),
    limits.elective402g,
  );

  const matchCap = offer.employerMatchCapPercent || 0;
  const uncappedMatch = eligibleWages * (offer.employerMatchRate || 0);
  const employer = matchCap > 0 ? Math.min(uncappedMatch, eligibleWages * matchCap) : uncappedMatch;

  return {
    employee,
    employer,
    isPreTax: offer.deferralType === "traditional",
    eligible: true,
    eligibleFraction,
  };
}

/**
 * Fraction of the employer match that is actually yours after `yearsOfService`.
 *
 * Modeled as a cliff: nothing vests until the stated year, then all of it.
 * Graded schedules exist and are not represented here.
 */
export function matchVestedFraction(offer, yearsOfService) {
  const cliff = offer.matchVestingYears || 0;
  if (cliff <= 0) return 1;
  return yearsOfService >= cliff ? 1 : 0;
}
