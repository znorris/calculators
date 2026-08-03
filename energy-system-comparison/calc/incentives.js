// Incentive line items, resolved to dollars against a system's gross cost
// (one-time, year-0 types) or against a given ownership year's production
// (recurring, income types).
//
// A percent-type item (state rebate schedules, some utility programs) is
// expressed as a percentage of the same gross cost finance.js discounts
// against, not against gross minus other incentives -- stacking incentives
// this way is what the programs themselves specify, and it keeps the
// resolution order-independent. A perUnit item is priced the same way,
// against that config's own sizes rather than gross cost. When either type
// carries a capAmount, the cap is applied per line, after that line's own
// amount is computed against gross cost (or sizes) -- never against a
// running total that other lines have already reduced -- which is what keeps
// resolution order-independent: two incentive lists differing only in
// declaration order resolve to the same total and the same per-line amounts.
//
// Five line-item types exist:
//   - fixed:            { label, type:'fixed', amount }
//   - percent:          { label, type:'percent', percent, capAmount? }
//   - perUnit:          { label, type:'perUnit', unit:'kW-solar'|'kWh-battery'|'kW-battery', ratePerUnit, capAmount? }
//   - annualProduction: { label, type:'annualProduction', ratePerKWh, years }
//   - annualFixed:      { label, type:'annualFixed', amount, years }
//
// fixed, percent, and perUnit are one-time, year-0 items: they reduce a
// system's upfront cost (an SGIP-style rebate, a state tax credit, a
// per-kW-installed utility incentive). annualProduction and annualFixed are
// recurring INCOME items instead -- an SREC/performance-payment stream keyed
// to actual annual production, or a flat per-year payment (e.g. a battery VPP
// enrollment) -- paid for `years` consecutive ownership years starting at
// year 1. resolveIncentives() resolves only the one-time types, since that is
// the portion that reduces upfront cost; resolveRecurringIncentiveIncome()
// resolves the recurring types for one ownership year at a time, which is
// what calc/finance.js calls once per analysis-window year to build the
// recurring income rows in cashFlows. Neither function double-counts the
// other's line items: a recurring-type item resolves to no year-0 line here,
// and a one-time-type item resolves to no income in any year there.

/**
 * @param {'kW-solar'|'kWh-battery'|'kW-battery'} unit
 * @param {{kwSolar?:number, kwhBattery?:number, kwBattery?:number}} sizes
 */
function unitQuantity(unit, sizes) {
  if (unit === "kW-solar") return sizes.kwSolar || 0;
  if (unit === "kWh-battery") return sizes.kwhBattery || 0;
  if (unit === "kW-battery") return sizes.kwBattery || 0;
  return 0;
}

/** Applies item.capAmount (when present) as a ceiling on `amount`. */
function applyCap(amount, capAmount) {
  return capAmount != null ? Math.min(amount, capAmount) : amount;
}

/**
 * Resolve the one-time (year-0) incentive line items -- fixed, percent,
 * perUnit -- against a system's gross cost and sizes. annualProduction and
 * annualFixed items are recurring income, not a year-0 cost reduction, so
 * they resolve to no line here; see resolveRecurringIncentiveIncome() for
 * those.
 *
 * @param {Array<{label:string, type:'fixed'|'percent'|'perUnit'|'annualProduction'|'annualFixed', amount?:number, percent?:number, capAmount?:number, unit?:string, ratePerUnit?:number}>} list
 * @param {number} grossCost
 * @param {{kwSolar?:number, kwhBattery?:number, kwBattery?:number}} [sizes]
 * @returns {{ total:number, lines:Array<{label:string, amount:number}> }}
 */
export function resolveIncentives(list, grossCost, sizes) {
  const items = list || [];
  const sz = sizes || {};

  const lines = items
    .filter((item) => item.type !== "annualProduction" && item.type !== "annualFixed")
    .map((item) => {
      let amount;
      if (item.type === "percent") {
        amount = applyCap(((item.percent || 0) / 100) * grossCost, item.capAmount);
      } else if (item.type === "perUnit") {
        const qty = unitQuantity(item.unit, sz);
        amount = applyCap((item.ratePerUnit || 0) * qty, item.capAmount);
      } else {
        amount = item.amount || 0;
      }
      return { label: item.label, amount };
    });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { total, lines };
}

/**
 * Resolve the recurring incentive INCOME line items -- annualProduction,
 * annualFixed -- for one ownership year. fixed, percent, and perUnit items
 * resolve to no line here; they are one-time, year-0 items resolveIncentives()
 * already covers.
 *
 * `year` is 1-based (ownership year 1 is the first full year after the
 * upfront moment, matching calc/finance.js's cashFlows indexing). An item
 * pays in years 1..item.years inclusive; it is absent from `lines` for any
 * other year, including year 0 or a year beyond its own `years` window --
 * there is no partial-year proration at the boundary.
 *
 * annualProduction's income is ratePerKWh times `productionKWh` -- the
 * caller's own already-degraded production figure for that specific calendar
 * year of the simulation (calc/simulate.js's ConfigResult.years[n].productionKWh),
 * not a flat year-1 estimate -- so a degrading array's income falls in step
 * with its output.
 *
 * @param {Array} list same shape resolveIncentives() takes
 * @param {number} year 1-based ownership year
 * @param {number} productionKWh that year's actual production, degradation-aware
 * @returns {{ total:number, lines:Array<{label:string, amount:number}> }}
 */
export function resolveRecurringIncentiveIncome(list, year, productionKWh) {
  const items = list || [];

  const lines = items
    .filter((item) => (item.type === "annualProduction" || item.type === "annualFixed") && year >= 1 && year <= item.years)
    .map((item) => {
      const amount = item.type === "annualProduction" ? (item.ratePerKWh || 0) * productionKWh : item.amount || 0;
      return { label: item.label, amount };
    });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { total, lines };
}

/**
 * The federal Section 25D residential clean energy credit terminated for
 * systems placed in service after December 31, 2025, under the One Big
 * Beautiful Bill Act (signed July 2025). A cash or loan purchase placed in
 * service in 2026 or later receives no federal credit under 25D; there is no
 * phase-down, the credit is simply gone for these systems.
 */
export const FEDERAL_25D_STATUS = {
  expired: true,
  lastEligibleDate: "2025-12-31",
  note:
    "The federal Section 25D residential clean energy credit terminated for systems placed in service " +
    "after December 31, 2025 (One Big Beautiful Bill Act, signed July 2025). Systems placed in service in " +
    "2026 or later receive no federal 25D credit for a cash or loan purchase.",
};

/**
 * California's active solar energy system property tax exclusion sunsets
 * January 1, 2027: a system assessed on or after that date is not excluded
 * from the property's assessed value, absent a legislative extension.
 */
export const CA_PROPERTY_TAX_NOTE = {
  sunsetDate: "2027-01-01",
  note:
    "California's active solar energy system property tax exclusion sunsets January 1, 2027. A system " +
    "assessed on or after that date adds to the property's assessed value unless the legislature extends " +
    "the exclusion before then.",
};
