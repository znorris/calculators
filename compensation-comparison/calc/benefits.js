// Health, insurance, time off, and perks for one year.
//
// Three buckets, kept apart because they are not the same kind of money:
//
//   pre-tax deductions   your premiums and HSA, which lower a tax base
//   post-tax deductions  life and disability, taken after tax so the payout is untaxed
//   employer value       premium share and HSA seed, real employer dollars
//   benefit value        meals, stipends, time off, avoided costs and contested value
//
// Only the first three touch the paycheck. Benefit value is reported beside
// total compensation rather than inside it, because a free lunch is an avoided
// cost and, for a salaried person, PTO changes no dollar at all.

/** Working days in a year, the conventional divisor for a daily rate. */
export const WORKING_DAYS = 260;
const WORKING_WEEKS = 52;

/**
 * Deductions taken from each paycheck, annualized.
 *
 * Medical, dental, and vision premiums run through a Section 125 plan, which
 * lowers the income tax base AND the Social Security and Medicare base. An
 * HSA funded through payroll does the same. That combination is the only
 * common deduction that reduces both, and no blended tax rate can express it.
 */
export function benefitDeductions(offer, payFrequency) {
  const periods = payFrequency || 24;

  const section125 =
    ((offer.medicalPremiumPerPaycheck || 0) +
      (offer.dentalPremiumPerPaycheck || 0) +
      (offer.visionPremiumPerPaycheck || 0)) *
    periods;

  const hsa = offer.hsaEmployeeContribution || 0;

  const postTax =
    ((offer.lifeInsurancePerPaycheck || 0) +
      (offer.ltdPerPaycheck || 0) +
      (offer.stdPerPaycheck || 0)) *
    periods;

  return {
    section125,
    hsa,
    /** Lowers income tax and the payroll tax base alike. */
    reducesBothBases: section125 + hsa,
    /** Comes out after tax, so it only reduces take-home. */
    postTax,
    total: section125 + hsa + postTax,
  };
}

/** Employer-side dollars spent on health, which never appear in a paycheck. */
export function employerHealthValue(offer, payFrequency) {
  const periods = payFrequency || 24;
  const premium = (offer.employerPremiumPerPaycheck || 0) * periods;
  const hsaSeed = offer.hsaEmployerSeed || 0;
  return { premium, hsaSeed, total: premium + hsaSeed };
}

/**
 * Expected medical spending, capped by the out-of-pocket maximum.
 *
 * A richer plan can be worth more than its premium difference, which a
 * premium-only comparison cannot show.
 */
export function expectedMedicalCost(offer) {
  const spend = offer.expectedMedicalSpend || 0;
  const cap = offer.outOfPocketMax || 0;
  return cap > 0 ? Math.min(spend, cap) : spend;
}

/**
 * Days per year actually spent at a workplace, which gates on-site meals and
 * commuting alike.
 */
export function onsiteDaysPerYear(offer) {
  if (offer.workArrangement === "remote") return 0;
  const perWeek = Math.max(0, Math.min(7, offer.daysOnsitePerWeek ?? 5));
  return perWeek * WORKING_WEEKS;
}

/**
 * Dollarized non-cash value, reported separately from compensation.
 *
 * `dailyRate` is used for time off and for pricing commute time. It comes
 * from base wages rather than total compensation, since that is the rate a
 * day of your time is actually paid at.
 */
export function benefitValue(offer, dailyRate) {
  const onsiteDays = onsiteDaysPerYear(offer);
  const hourlyRate = dailyRate / 8;

  const meals =
    ((offer.breakfastPerDay || 0) + (offer.lunchPerDay || 0) + (offer.dinnerPerDay || 0)) * onsiteDays;

  const commuteCost = (offer.commuteCostPerDay || 0) * onsiteDays;
  const commuteHours = ((offer.commuteMinutesPerDay || 0) / 60) * onsiteDays;
  const commuteTimeCost = offer.valueCommuteTime ? commuteHours * hourlyRate : 0;

  // Unlimited leave has no balance, so it is worth the days actually taken.
  const daysOff = offer.unlimitedPto ? offer.expectedDaysTaken || 0 : offer.ptoDays || 0;
  const timeOff = daysOff * dailyRate;
  const holidays = (offer.paidHolidays || 0) * dailyRate;
  const parentalLeave = (offer.parentalLeaveWeeks || 0) * 5 * dailyRate;

  const stipends = (offer.stipendsAnnual || 0) + (offer.otherPerksAnnual || 0);

  const positives = meals + timeOff + holidays + stipends;
  const negatives = commuteCost + commuteTimeCost;

  return {
    meals,
    timeOff,
    holidays,
    parentalLeave,
    stipends,
    commuteCost,
    commuteTimeCost,
    commuteHours,
    onsiteDays,
    daysOff,
    /**
     * Parental leave is excluded from the net figure. It pays out once, if at
     * all, rather than every year, so folding it into an annual total would
     * overstate every year of the horizon.
     */
    net: positives - negatives,
  };
}
