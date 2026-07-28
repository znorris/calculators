// Year-by-year projection for one offer, and the exit-year series derived
// from it.
//
// Money is plain Numbers in dollars. Values are rounded only at the
// presentation boundary, never mid-computation, so intermediate rounding
// cannot accumulate across a five-year projection.

import { federalTables } from "./data/federal.js";
import { computeAllTaxes } from "./tax.js";
import { baseWagesForYear, bonusesForYear, retirementForYear, matchVestedFraction } from "./pay.js";
import { projectEquity, equityRange } from "./equity.js";
import { variablePayForYear, attainmentScenarios } from "./commission.js";
import {
  benefitDeductions,
  employerHealthValue,
  expectedMedicalCost,
  benefitValue,
  WORKING_DAYS,
} from "./benefits.js";

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

  const equity = projectEquity(offer, horizonYears, offer.stockGrowthRate || 0);
  const equityBand = equityRange(offer, horizonYears);

  const years = [];

  for (let i = 0; i < horizonYears; i += 1) {
    const wages = baseWagesForYear(offer, i);
    const bonuses = bonusesForYear(offer, i, wages.total);
    const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount, 0);

    // Commission is ordinary income like any other wage.
    const variable = variablePayForYear(offer, i, wages.total);
    const variableTotal = variable?.net || 0;

    // RSU vesting is ordinary income in the year it vests, so it belongs in
    // gross wages and can push the year into higher brackets. Option value is
    // taxed at exercise, which this build does not model, so it is excluded
    // from the tax base and counted only toward total compensation.
    const grossWages = wages.total + bonusTotal + variableTotal + equity.taxable[i];

    // Retirement contributions are computed on base wages only. Plans differ
    // on whether bonuses and vesting count as eligible compensation.
    const retirement = retirementForYear(offer, wages.total, limits, i);

    // Only a traditional deferral reduces the income tax base. A Roth
    // contribution reduces nothing, and neither reduces the FICA base.
    const preTaxDeductions = retirement.isPreTax ? retirement.employee : 0;

    // Section 125 premiums and a payroll HSA reduce the income tax base and
    // the payroll tax base alike, which no single blended rate can express.
    const deductions = benefitDeductions(offer, offer.payFrequency);

    const taxes = computeAllTaxes({
      grossWages,
      preTaxDeductions,
      ficaExemptDeductions: deductions.reducesBothBases,
      filingStatus,
      taxYear,
      stateCode: offer.state,
      cityTaxRate: offer.cityTaxRate,
      cityTaxBase: offer.cityTaxBase,
    });

    // Take-home is what reaches the bank account: gross, less tax, less every
    // deduction, including money earned but diverted before it arrives.
    const takeHome =
      grossWages - taxes.total - retirement.employee - deductions.total;

    const employerHealth = employerHealthValue(offer, offer.payFrequency);

    // Total compensation counts employer-side dollars, which never appear in
    // a paycheck: the retirement match, the health premium share, and any HSA
    // seed. It excludes dollarized perks and time off, which are avoided
    // costs rather than money, and which are reported beside it instead.
    const totalCompensation =
      grossWages + retirement.employer + equity.untaxed[i] + employerHealth.total;

    // Time off and commute time are priced against base pay, since that is
    // what a day of your time is actually paid at.
    const benefits = benefitValue(offer, wages.total / WORKING_DAYS);
    const medicalCost = expectedMedicalCost(offer);

    years.push({
      year: i + 1,
      wages,
      bonuses,
      bonusTotal,
      variable,
      variableTotal,
      deductions,
      employerHealth,
      benefits,
      medicalCost,
      equity: {
        taxable: equity.taxable[i],
        untaxed: equity.untaxed[i],
        total: equity.total[i],
        low: equityBand?.low.total[i] ?? null,
        high: equityBand?.high.total[i] ?? null,
      },
      grossWages,
      taxes,
      retirement,
      takeHome,
      totalCompensation,
      /** Compensation plus dollarized benefits, net of commuting. */
      totalRewards: totalCompensation + benefits.net - medicalCost,
      perPaycheck: perPaycheckBreakdown({ offer, grossWages, taxes, retirement, deductions }),
    });
  }

  return {
    offerId: offer.id,
    years,
    equity,
    equityBand,
    attainmentCurve: attainmentScenarios(offer),
    cumulative: accumulate(years),
    exitYears: exitYearSeries(offer, years, equity),
  };
}

/** Per-paycheck view of a year, at the offer's stated pay frequency. */
function perPaycheckBreakdown({ offer, grossWages, taxes, retirement, deductions }) {
  const periods = offer.payFrequency || 24;
  return {
    periods,
    gross: grossWages / periods,
    taxes: taxes.total / periods,
    deferral: retirement.employee / periods,
    benefits: deductions.total / periods,
    net: (grossWages - taxes.total - retirement.employee - deductions.total) / periods,
  };
}

/** Running totals across the horizon. */
function accumulate(years) {
  let takeHome = 0;
  let totalCompensation = 0;
  let employerRetirement = 0;
  let taxesPaid = 0;
  let equity = 0;
  let totalRewards = 0;
  let benefitValue = 0;

  return years.map((y) => {
    takeHome += y.takeHome;
    totalCompensation += y.totalCompensation;
    employerRetirement += y.retirement.employer;
    taxesPaid += y.taxes.total;
    equity += y.equity.total;
    totalRewards += y.totalRewards;
    benefitValue += y.benefits.net - y.medicalCost;
    return {
      year: y.year,
      takeHome,
      totalCompensation,
      totalRewards,
      benefitValue,
      employerRetirement,
      taxesPaid,
      equity,
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
 *   - equity granted but not yet vested at that exit
 *
 * Unvested equity is usually the largest of the three, which is why the
 * headline horizon total is not what most people walk away with.
 */
export function exitYearSeries(offer, years, equity) {
  const out = [];
  let takeHome = 0;
  let employerMatch = 0;
  let vestedEquity = 0;

  for (const y of years) {
    takeHome += y.takeHome;
    employerMatch += y.retirement.employer;
    // RSU value already reached the bank account through take-home; only the
    // untaxed option value is added separately so it is not double counted.
    vestedEquity += y.equity.untaxed;

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

    const forfeitedEquity = equity?.forfeitedIfLeavingAfter?.[y.year - 1] ?? 0;

    out.push({
      year: y.year,
      takeHome,
      vestedMatch: employerMatch * vestedFraction,
      forfeitedMatch,
      clawback,
      vestedEquity,
      forfeitedEquity,
      forfeitedTotal: forfeitedMatch + clawback + forfeitedEquity,
      realized: takeHome + employerMatch * vestedFraction + vestedEquity - clawback,
    });
  }

  return out;
}

/** Project every offer in a comparison. */
export function projectAll(offers, context) {
  return offers.map((offer) => projectOffer(offer, context));
}
