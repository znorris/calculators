// Year-by-year projection for one offer, and the exit-year series derived
// from it.
//
// Money is plain Numbers in dollars. Values are rounded only at the
// presentation boundary, never mid-computation, so intermediate rounding
// cannot accumulate across a five-year projection.

import { federalTables } from "./data/federal.js";
import { computeAllTaxes } from "./tax.js";
import { baseWagesForYear, bonusesForYear, retirementForYear, matchVestedFraction } from "./pay.js";

/**
 * Project one offer across the horizon.
 *
 * `context` carries the comparison-scoped values: filing status, tax year,
 * and horizon length. Those belong to the person or the comparison rather
 * than to any single job.
 */
export function projectOffer(offer, context) {
  const { filingStatus, taxYear, horizonYears } = context;
  const limits = federalTables(taxYear).retirementLimits;

  const years = [];

  for (let i = 0; i < horizonYears; i += 1) {
    const wages = baseWagesForYear(offer, i);
    const bonuses = bonusesForYear(offer, i, wages.total);
    const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount, 0);

    const grossWages = wages.total + bonusTotal;
    const retirement = retirementForYear(offer, wages.total, limits, i);

    // Only a traditional deferral reduces the income tax base. A Roth
    // contribution reduces nothing, and neither reduces the FICA base.
    const preTaxDeductions = retirement.isPreTax ? retirement.employee : 0;

    const taxes = computeAllTaxes({
      grossWages,
      preTaxDeductions,
      filingStatus,
      taxYear,
      stateCode: offer.state,
      cityTaxRate: offer.cityTaxRate,
      cityTaxBase: offer.cityTaxBase,
    });

    // Take-home is what reaches the bank account: gross, less tax, less the
    // employee's own deferral, which is money earned but not received.
    const takeHome = grossWages - taxes.total - retirement.employee;

    // Total compensation counts employer-side dollars, which never appear in
    // a paycheck. The employer match is counted as contributed, not as a
    // balance grown at a return rate.
    const totalCompensation = grossWages + retirement.employer;

    years.push({
      year: i + 1,
      wages,
      bonuses,
      bonusTotal,
      grossWages,
      taxes,
      retirement,
      takeHome,
      totalCompensation,
      perPaycheck: perPaycheckBreakdown({ offer, grossWages, taxes, retirement }),
    });
  }

  return {
    offerId: offer.id,
    years,
    cumulative: accumulate(years),
    exitYears: exitYearSeries(offer, years),
  };
}

/** Per-paycheck view of a year, at the offer's stated pay frequency. */
function perPaycheckBreakdown({ offer, grossWages, taxes, retirement }) {
  const periods = offer.payFrequency || 24;
  return {
    periods,
    gross: grossWages / periods,
    taxes: taxes.total / periods,
    deferral: retirement.employee / periods,
    net: (grossWages - taxes.total - retirement.employee) / periods,
  };
}

/** Running totals across the horizon. */
function accumulate(years) {
  let takeHome = 0;
  let totalCompensation = 0;
  let employerRetirement = 0;
  let taxesPaid = 0;

  return years.map((y) => {
    takeHome += y.takeHome;
    totalCompensation += y.totalCompensation;
    employerRetirement += y.retirement.employer;
    taxesPaid += y.taxes.total;
    return {
      year: y.year,
      takeHome,
      totalCompensation,
      employerRetirement,
      taxesPaid,
    };
  });
}

/**
 * What you actually walk away with if you leave at the end of each year.
 *
 * Tenure is uncertain and many people never reach the end of the horizon, so
 * the headline five-year figure is not what most readers will realize. This
 * series nets out what is forfeited at each exit point:
 *
 *   - employer match not yet vested at that year of service
 *   - any one-time bonus still inside its clawback window
 *
 * Unvested equity belongs here too and is not yet modeled, since this build
 * covers the cash path only.
 */
export function exitYearSeries(offer, years) {
  const out = [];
  let takeHome = 0;
  let employerMatch = 0;

  for (const y of years) {
    takeHome += y.takeHome;
    employerMatch += y.retirement.employer;

    const yearsOfService = y.year;
    const vestedFraction = matchVestedFraction(offer, yearsOfService);
    const forfeitedMatch = employerMatch * (1 - vestedFraction);

    // A one-time bonus is repayable if the exit falls inside its window.
    let clawback = 0;
    for (const past of years.slice(0, y.year)) {
      for (const bonus of past.bonuses) {
        if (bonus.recurrence !== "oneTime" || !bonus.clawbackYears) continue;
        if (yearsOfService < bonus.paidInYear - 1 + bonus.clawbackYears) clawback += bonus.amount;
      }
    }

    out.push({
      year: y.year,
      takeHome,
      vestedMatch: employerMatch * vestedFraction,
      forfeitedMatch,
      clawback,
      realized: takeHome + employerMatch * vestedFraction - clawback,
    });
  }

  return out;
}

/** Project every offer in a comparison. */
export function projectAll(offers, context) {
  return offers.map((offer) => projectOffer(offer, context));
}
