// Income and payroll tax for one year.
//
// The deduction ordering here is the part most calculators get wrong, so it is
// spelled out rather than folded into one rate:
//
//   traditional 401k  reduces income tax base, NOT the FICA base
//   Roth 401k         reduces neither
//   FICA              always computed on gross wages, before any deferral
//
// A single blended "tax rate" input cannot express that distinction, which is
// why this module exists at all.

import { federalTables } from "./data/federal.js";
import { stateTable } from "./data/states.js";
import { taxFromBrackets, marginalRateFromBrackets, bracketsFor, effectiveRate } from "./brackets.js";

/**
 * FICA for one year of wages.
 *
 * Social Security stops at the wage base, so per-paycheck withholding drops
 * partway through the year for high earners. Medicare has no cap, and the
 * Additional Medicare surtax applies above a threshold that differs between
 * what the employer withholds and what the employee actually owes.
 */
export function computeFica(grossWages, filingStatus, taxYear, ficaExemptDeductions = 0) {
  const { fica } = federalTables(taxYear);
  // Section 125 premiums and payroll-funded HSA contributions come out before
  // Social Security and Medicare are computed. A traditional 401k does not.
  const wages = Math.max(0, grossWages - Math.max(0, ficaExemptDeductions));

  const socialSecurity = Math.min(wages, fica.socialSecurityWageBase) * fica.socialSecurityRate;
  const medicare = wages * fica.medicareRate;

  const liabilityThreshold =
    fica.additionalMedicareThresholds[filingStatus] ?? fica.additionalMedicareThresholds.single;
  const additionalMedicare = Math.max(0, wages - liabilityThreshold) * fica.additionalMedicareRate;

  // What the employer actually withholds keys off a flat wage level rather
  // than the filing-status threshold, so the two can differ.
  const withheldAdditionalMedicare =
    Math.max(0, wages - fica.employerWithholdingThreshold) * fica.additionalMedicareRate;

  return {
    socialSecurity,
    medicare,
    additionalMedicare,
    withheldAdditionalMedicare,
    total: socialSecurity + medicare + additionalMedicare,
    hitWageBase: wages > fica.socialSecurityWageBase,
  };
}

/** Federal income tax for one year. */
export function computeFederalIncomeTax({ grossWages, preTaxDeductions = 0, filingStatus, taxYear }) {
  const tables = federalTables(taxYear);
  const standardDeduction = tables.standardDeduction[filingStatus] ?? tables.standardDeduction.single;
  const brackets = bracketsFor(tables.brackets, filingStatus);

  const afterDeferrals = Math.max(0, grossWages - preTaxDeductions);
  const taxableIncome = Math.max(0, afterDeferrals - standardDeduction);
  const tax = taxFromBrackets(taxableIncome, brackets);

  return {
    taxableIncome,
    standardDeduction,
    tax,
    marginalRate: marginalRateFromBrackets(taxableIncome, brackets),
    effectiveRate: effectiveRate(tax, grossWages),
  };
}

/**
 * State income tax plus any employee-side payroll program for one year.
 *
 * Returns `available: false` for a jurisdiction with no data, so the caller
 * can say so instead of reporting zero, which would make a high-tax state
 * look free.
 */
export function computeStateTax({ grossWages, preTaxDeductions = 0, filingStatus, stateCode }) {
  const table = stateTable(stateCode);
  if (!table) {
    return { available: false, stateCode, tax: 0, payrollPrograms: [], payrollTotal: 0, total: 0 };
  }

  const afterDeferrals = Math.max(0, grossWages - preTaxDeductions);
  let tax = 0;
  let marginalRate = 0;

  if (table.kind === "flat") {
    const deduction = table.standardDeduction?.[filingStatus] ?? 0;
    tax = Math.max(0, afterDeferrals - deduction) * table.flatRate;
    marginalRate = table.flatRate;
  } else if (table.kind === "progressive") {
    const deduction = table.standardDeduction?.[filingStatus] ?? table.standardDeduction?.single ?? 0;
    const taxable = Math.max(0, afterDeferrals - deduction);
    const brackets = bracketsFor(table.brackets, filingStatus);
    tax = taxFromBrackets(taxable, brackets);
    marginalRate = marginalRateFromBrackets(taxable, brackets);
  }

  const payrollPrograms = (table.payrollPrograms || []).map((program) => ({
    name: program.name,
    amount: Math.min(grossWages, program.wageBase ?? Infinity) * program.rate,
  }));
  const payrollTotal = payrollPrograms.reduce((sum, p) => sum + p.amount, 0);

  return {
    available: true,
    stateCode,
    stateName: table.name,
    kind: table.kind,
    tax,
    marginalRate,
    payrollPrograms,
    payrollTotal,
    total: tax + payrollTotal,
    notes: table.notes,
  };
}

/**
 * City tax. The user supplies a rate and picks what it applies to, because
 * real local taxes differ: Philadelphia taxes gross wages while NYC taxes
 * income after deductions, and this tool carries no city list.
 */
export function computeCityTax({ grossWages, taxableIncome, rate, base }) {
  if (!rate) return 0;
  return (base === "taxable" ? Math.max(0, taxableIncome) : Math.max(0, grossWages)) * rate;
}

/**
 * Every tax for one year, composed.
 *
 * `preTaxDeductions` should hold only deferrals that reduce the income tax
 * base. Roth contributions must not be passed here.
 */
export function computeAllTaxes({
  grossWages,
  preTaxDeductions = 0,
  ficaExemptDeductions = 0,
  filingStatus,
  taxYear,
  stateCode,
  cityTaxRate,
  cityTaxBase,
}) {
  // Deductions that escape payroll tax also escape income tax, so they are
  // part of the income tax base reduction as well.
  const incomeTaxReduction = preTaxDeductions + ficaExemptDeductions;

  const federal = computeFederalIncomeTax({
    grossWages,
    preTaxDeductions: incomeTaxReduction,
    filingStatus,
    taxYear,
  });
  const fica = computeFica(grossWages, filingStatus, taxYear, ficaExemptDeductions);
  const state = computeStateTax({
    grossWages,
    preTaxDeductions: incomeTaxReduction,
    filingStatus,
    stateCode,
  });
  const city = computeCityTax({
    grossWages,
    taxableIncome: federal.taxableIncome,
    rate: cityTaxRate,
    base: cityTaxBase,
  });

  const total = federal.tax + fica.total + state.total + city;

  return {
    federal,
    fica,
    state,
    city,
    total,
    effectiveRate: effectiveRate(total, grossWages),
    /** Combined marginal rate on the next dollar of ordinary income. */
    combinedMarginalRate: federal.marginalRate + (state.marginalRate || 0),
  };
}
