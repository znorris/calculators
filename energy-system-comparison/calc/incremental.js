// Standalone value of the removable pieces (battery, wind) of a config,
// found by re-simulating with each piece taken out and diffing the bills.
//
// `costs` here is per-component, distinct from finance.js's whole-system
// costs object: { battery?:{cost, oAndMPerYear?}, wind?:{cost, oAndMPerYear?} }.
// Only components actually present on `config` are evaluated -- solar is not
// in the 'battery'|'wind' union CONTRACTS.md pins for this module's result,
// so it is never removed here even if present.

import { simulateComparison } from "./simulate.js";

const REMOVABLE_COMPONENTS = ["battery", "wind"];

/** Per-year bill saved by `withResult` over `withoutResult`, across their shared analysis window (both re-simulated with the same assumptions, so both share the same `years.length`). */
function annualBillSavings(withResult, withoutResult) {
  const analysisYears = withResult.years.length;
  const savings = [];
  for (let year = 0; year < analysisYears; year++) {
    savings.push(withoutResult.years[year].billTotal - withResult.years[year].billTotal);
  }
  return savings;
}

/**
 * First year the cumulative net savings (bill savings less the component's
 * own O&M) recover addedCost, interpolated within the crossing year to one
 * decimal, mirroring finance.js's computePaybackYear. `billSavings` here
 * spans the full analysis window (out to max(horizonYears,
 * PAYBACK_SEARCH_YEARS)), not just the ownership horizon, so this returns an
 * absolute year that can land after the horizon; null only when the
 * cumulative never reaches addedCost anywhere in that window.
 */
function computeStandalonePaybackYears(billSavings, oAndMPerYear, addedCost) {
  let cumulative = 0;
  for (let year = 1; year <= billSavings.length; year += 1) {
    const priorCumulative = cumulative;
    const yearNet = billSavings[year - 1] - oAndMPerYear;
    cumulative += yearNet;
    if (cumulative >= addedCost) {
      const fraction = yearNet > 0 ? (addedCost - priorCumulative) / yearNet : 0;
      return Math.round((year - 1 + fraction) * 10) / 10;
    }
  }
  return null;
}

/**
 * @param {Object} args
 * @param {import('./simulate.js').Config} args.config
 * @param {import('./simulate.js').Household} args.household
 * @param {import('./tariffs/profile.js').UtilityProfile} args.profile
 * @param {Object} args.assumptions
 * @param {{battery?:{cost:number, oAndMPerYear?:number}, wind?:{cost:number, oAndMPerYear?:number}}} args.costs
 * @returns {Array<{component:'battery'|'wind', addedCost:number, addedAnnualSavings:number, standalonePaybackYears:number|null}>}
 */
export function incrementalAnalysis({ config, household, profile, assumptions, costs }) {
  const present = REMOVABLE_COMPONENTS.filter((component) => config[component]);
  if (present.length === 0) return [];

  const withComponent = simulateComparison({ configs: [config], household, profile, assumptions }).results[0];

  return present.map((component) => {
    const configWithout = { ...config };
    delete configWithout[component];

    const withoutComponent = simulateComparison({ configs: [configWithout], household, profile, assumptions }).results[0];

    const componentCosts = costs?.[component] || {};
    const oAndMPerYear = componentCosts.oAndMPerYear || 0;
    const billSavings = annualBillSavings(withComponent, withoutComponent);
    // addedAnnualSavings is a representative "typical year" figure for the
    // ownership horizon, so it averages only the horizon-scoped slice, not
    // the full (possibly much longer) payback-search window -- averaging
    // over the whole window would dilute it toward whatever the component's
    // savings rate happens to do decades past the horizon.
    const horizonBillSavings = billSavings.slice(0, withComponent.horizonYears);
    const totalBillSavings = horizonBillSavings.reduce((sum, s) => sum + s, 0);
    const addedAnnualSavings =
      (horizonBillSavings.length > 0 ? totalBillSavings / horizonBillSavings.length : 0) - oAndMPerYear;
    const addedCost = componentCosts.cost || 0;
    const standalonePaybackYears = computeStandalonePaybackYears(billSavings, oAndMPerYear, addedCost);

    return { component, addedCost, addedAnnualSavings, standalonePaybackYears };
  });
}
