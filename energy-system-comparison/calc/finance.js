// Cash flow, payback, NPV, IRR, and effective levelized cost for one config
// against its baseline.
//
// Interconnection and permit fees are assumed already folded into
// costs.gross by the caller -- this module never adds a fee on top of it.
//
// Cash flow convention: index 0 is the upfront moment (before ownership year
// 1 begins), index k for k = 1..analysisYears is ownership year k, where
// analysisYears = max(horizonYears, PAYBACK_SEARCH_YEARS) -- longer than
// horizonYears whenever the ownership horizon is short, so a payback or
// replacement event landing after the horizon still appears in cashFlows and
// cumulative. Every dollar figure in the flow vector is nominal (not
// inflation-adjusted); only npv() applies a discount, and it treats index 0
// as undiscounted since (1+r)^0 = 1.
//
// costs.incentives can carry two kinds of line item (see calc/incentives.js):
// one-time types (fixed, percent, perUnit) that resolveIncentives() folds
// into index 0 as an upfront cost reduction, same as always; and recurring
// INCOME types (annualProduction, annualFixed) that resolveRecurringIncentiveIncome()
// resolves year by year and adds as a POSITIVE contribution to cashFlows[year]
// for year = 1..analysisYears, same horizon-scoping rule as a replacement
// cost: income landing after horizonYears still appears in cashFlows/
// cumulative/paybackYear (the extended search window), while npv/irr/
// lifetimeSavings stay scoped to horizonYears via the horizonFlows slice.

import { resolveIncentives, resolveRecurringIncentiveIncome } from "./incentives.js";
import { PAYBACK_SEARCH_YEARS } from "./simulate.js";

/**
 * Monthly payment for a fully amortizing loan, monthly compounding.
 *
 * Reproduces calcPmt in home-purchase-comparison/App.jsx exactly, including
 * its zero-rate branch: at 0% APR the payment is just principal split evenly
 * across the term, which avoids a division by zero in the compounding
 * formula.
 */
function calcPmt(principal, annualRate, nMonths) {
  const mr = annualRate / 12;
  if (mr === 0) return principal / nMonths;
  return (principal * mr * Math.pow(1 + mr, nMonths)) / (Math.pow(1 + mr, nMonths) - 1);
}

/** Net present value of a flow vector at `rate`; flows[0] is undiscounted. */
function npv(rate, flows) {
  return flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * Internal rate of return, found by scanning [-0.99, 10] for sign changes
 * and bisecting each bracket found.
 *
 * A non-monotone flow (e.g. a mid-horizon replacement cost) can cross zero
 * more than once; when several brackets bisect to a genuine root, the one
 * nearest 0% is returned as the economically meaningful rate. Every
 * candidate is checked against a tolerance scaled to the cash-flow
 * magnitude before being accepted, so a bracket whose bisection runs out
 * its iterations without truly converging (steep curvature near r = -1)
 * is rejected -- the function returns null rather than an endpoint or a
 * rate at which NPV is not actually zero.
 */
function irr(flows) {
  const scale = flows.reduce((max, cf) => Math.max(max, Math.abs(cf)), 1);
  const tolerance = scale * 1e-9;

  const lo = -0.99;
  const hi = 10;
  const steps = 400;
  const rateAt = (i) => lo + ((hi - lo) * i) / steps;
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const rate = rateAt(i);
    samples.push([rate, npv(rate, flows)]);
  }

  const roots = [];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const [aRate, aVal] = samples[i];
    const [bRate, bVal] = samples[i + 1];
    if (aVal === 0) {
      roots.push(aRate);
      continue;
    }
    if (aVal > 0 === bVal > 0) continue;

    let a = aRate;
    let b = bRate;
    let fa = aVal;
    let mid = a;
    let fMid = aVal;
    for (let iter = 0; iter < 100; iter += 1) {
      mid = (a + b) / 2;
      fMid = npv(mid, flows);
      if (fMid === 0) break;
      if (fMid > 0 === fa > 0) {
        a = mid;
        fa = fMid;
      } else {
        b = mid;
      }
    }
    if (Math.abs(fMid) < tolerance) roots.push(mid);
  }
  if (samples[samples.length - 1][1] === 0) roots.push(hi);

  if (roots.length === 0) return null;
  roots.sort((x, y) => Math.abs(x) - Math.abs(y));
  return roots[0];
}

/**
 * First ownership year after which the cumulative flow never goes negative
 * again, to one decimal.
 *
 * cumulative[0] is the position right after the upfront spend; cumulative[k]
 * is the position at the end of ownership year k. This finds the last index
 * where cumulative is still negative, then interpolates the crossing into
 * the following year at a constant rate across it, the only shape available
 * without a sub-year cash flow -- so a later dip back below zero (e.g. a
 * replacement cost) pushes the reported payback out to the last recovery.
 * Null when cumulative is negative at the end of whatever window the caller
 * passed in (financeConfig passes the full analysis window here, not just
 * the ownership horizon, so this can find a payback the horizon alone would
 * have missed), including a zero-upfront config that never turns
 * cumulative-positive: cashFlows[0] >= 0 alone does not mean the system paid
 * for itself.
 */
function computePaybackYear(cumulative, cashFlows) {
  let lastNegative = -1;
  for (let i = 0; i < cumulative.length; i += 1) {
    if (cumulative[i] < 0) lastNegative = i;
  }
  if (lastNegative === -1) return 0;
  if (lastNegative === cumulative.length - 1) return null;

  const k = lastNegative + 1;
  const priorCumulative = cumulative[k - 1];
  const yearFlow = cashFlows[k];
  // yearFlow > 0 whenever cumulative rises from negative to non-negative;
  // guarded rather than assumed so a malformed input can't divide by zero.
  const fraction = yearFlow > 0 ? -priorCumulative / yearFlow : 0;
  return Math.round((k - 1 + fraction) * 10) / 10;
}

/**
 * Finance one ConfigResult against its baseline.
 *
 * `result.horizonYears` marks the end of the ownership window; `result.years`
 * itself may run longer, out to max(horizonYears, PAYBACK_SEARCH_YEARS), so a
 * payback or replacement event landing after the horizon is still visible.
 * Cash flows and cumulative are built over that full analysis window (capped
 * to whatever `result`/`baseline` actually provide, in case a caller hands in
 * shorter stubs), and paybackYear is searched across all of it. NPV, IRR,
 * lifetimeSavings, and effectiveCostPerKWh stay scoped to horizonYears only --
 * they answer "over my ownership window," not the extended search window.
 *
 * `costs.incentives` (see calc/incentives.js) resolves in two parts:
 * resolveIncentives() folds the one-time types (fixed, percent, perUnit) into
 * cashFlows[0] as an upfront cost reduction, reading `costs.sizes`
 * ({kwSolar?, kwhBattery?, kwBattery?}, optional, default {}) for perUnit
 * lines; resolveRecurringIncentiveIncome() adds the recurring income types
 * (annualProduction, annualFixed) into cashFlows[1..analysisYears] as a
 * positive contribution each year they're active.
 *
 * @param {{ result:object, baseline:object, costs:object, financing:object, econ:object }} args
 */
export function financeConfig({ result, baseline, costs, financing, econ }) {
  const horizonYears = result.horizonYears;
  const analysisYears = Math.min(
    Math.max(horizonYears, PAYBACK_SEARCH_YEARS),
    result.years.length,
    baseline.years.length,
  );
  const gross = costs.gross;
  const incentives = resolveIncentives(costs.incentives || [], gross, costs.sizes);

  const isLoan = financing.type === "loan";
  const downPayment = isLoan ? (financing.downPaymentFrac ?? 0) * gross : gross;

  let monthlyPmt = 0;
  let termYears = 0;
  if (isLoan) {
    // A term of zero or less, or a non-numeric term/APR, has no amortization
    // schedule -- silently defaulting either to 0 would drop the financed
    // principal out of the cash flows entirely, so this is a caller error.
    if (!Number.isFinite(financing.termYears) || financing.termYears <= 0) {
      throw new Error("Loan financing requires a term greater than zero years.");
    }
    if (!Number.isFinite(financing.aprPct)) {
      throw new Error("Loan financing requires a numeric APR.");
    }
    const principal = gross - downPayment;
    const annualRate = financing.aprPct / 100;
    termYears = financing.termYears;
    monthlyPmt = calcPmt(principal, annualRate, termYears * 12);
  }

  /** Extra one-time cost landing in ownership year `year`, or 0. */
  const replacementCostInYear = (year) => {
    let cost = 0;
    if (costs.inverterReplacement && costs.inverterReplacement.year === year) {
      cost += costs.inverterReplacement.cost;
    }
    if (costs.batteryReplacement && costs.batteryReplacement.year === year) {
      cost += costs.batteryReplacement.cost;
    }
    return cost;
  };

  // Runs the full analysis window (out to analysisYears, not just
  // horizonYears) so a replacement event or a payback crossing that lands
  // after the ownership horizon still shows up in cashFlows/cumulative for
  // the payback search and the cash-flow chart, even though the
  // horizon-scoped figures below never read past index horizonYears.
  const cashFlows = new Array(analysisYears + 1).fill(0);
  cashFlows[0] = -downPayment + incentives.total;

  for (let year = 1; year <= analysisYears; year += 1) {
    const baselineBill = baseline.years[year - 1].billTotal;
    const configBill = result.years[year - 1].billTotal;
    const billSavings = baselineBill - configBill;
    const loanPayment = isLoan && year <= termYears ? monthlyPmt * 12 : 0;
    // Recurring incentive income (annualProduction, annualFixed) for this
    // ownership year, keyed to this config's own (degradation-aware)
    // production for annualProduction lines -- a positive contribution,
    // since it is income rather than a cost.
    const recurringIncome = resolveRecurringIncentiveIncome(
      costs.incentives || [],
      year,
      result.years[year - 1].productionKWh,
    ).total;

    cashFlows[year] =
      billSavings + recurringIncome - (costs.oAndMPerYear || 0) - loanPayment - replacementCostInYear(year);
  }

  const cumulative = [];
  cashFlows.reduce((running, cf) => {
    const next = running + cf;
    cumulative.push(next);
    return next;
  }, 0);

  const discountRate = (econ.discountRatePct ?? 0) / 100;
  // Searched over the full analysis window: a config that recovers its cost
  // after the ownership horizon still has a genuine payback year, just one
  // the user reads as "past your horizon" rather than "never."
  const paybackYear = computePaybackYear(cumulative, cashFlows);
  const horizonIndex = horizonYears;
  // Scoped to horizonYears: this is the same "over my ownership window" cut
  // computePaybackYear used to get for free when cashFlows/cumulative ran
  // only to horizonYears -- now that they run longer, lifetimeSavings must
  // read the horizon boundary explicitly rather than the array's last index.
  const lifetimeSavings = cumulative[horizonIndex];

  // Effective cost per kWh: (gross - incentives + discounted O&M and
  // replacements) / discounted production. This is computed identically
  // regardless of financing type -- a loan's down payment/principal split
  // and its interest are both financing choices, not a cost of the system
  // itself, so a cash purchase and a loan purchase of the identical system
  // land on the same effective cost per kWh.
  //
  // `incentives` (from resolveIncentives) is the one-time, year-0 total only
  // -- it deliberately excludes annualProduction/annualFixed recurring
  // income. Recurring incentive income is revenue the system earns over time
  // (an SREC payment, a VPP enrollment check), not a reduction of what the
  // system cost to install; folding it in here would understate a levelized
  // COST figure with a cash flow that has nothing to do with the system's
  // price. It is fully counted instead in cashFlows/NPV/lifetimeSavings
  // above, which are the figures that answer "what did owning this system
  // net me," the question revenue actually belongs in.
  const netUpfront = gross - incentives.total;
  let discountedOm = 0;
  let discountedProduction = 0;
  for (let year = 1; year <= horizonYears; year += 1) {
    const discount = Math.pow(1 + discountRate, year);
    const yearOm = (costs.oAndMPerYear || 0) + replacementCostInYear(year);
    discountedOm += yearOm / discount;
    discountedProduction += result.years[year - 1].productionKWh / discount;
  }
  const effectiveCostPerKWh =
    discountedProduction > 0 ? (netUpfront + discountedOm) / discountedProduction : null;

  // NPV and IRR read only the horizon-scoped slice of cashFlows -- same
  // values these would have produced before cashFlows ran past horizonYears,
  // since slice(0, horizonIndex + 1) preserves each entry's original index
  // (and thus its discount exponent).
  const horizonFlows = cashFlows.slice(0, horizonIndex + 1);

  return {
    cashFlows,
    cumulative,
    horizonIndex,
    paybackYear,
    npv: npv(discountRate, horizonFlows),
    irr: irr(horizonFlows),
    lifetimeSavings,
    effectiveCostPerKWh,
  };
}
