// Builds a UtilityProfile from a flat set of user-entered inputs, for a
// household not on one of the modeled utilities' schedules.
//
// buildCustomProfile wraps the given pricing/demand into a single Schedule
// and fills in profile-level defaults a form might leave blank, rather than
// requiring the caller to hand-assemble the nested UtilityProfile shape.
//
// This is also the one place a TOU period's real applies(hourCtx) predicate
// is materialized (see materializeTouPricing/buildAppliesFromWindow below),
// and likewise the one place an ExportRate timeTable's periods get theirs
// (materializeExportRate) -- both window vocabularies are identical and
// share buildAppliesFromWindow itself. Every caller of
// household.customProfileInputs -- app state, storage.js's localStorage
// record, a share link, the postMessage sent into worker/calcWorker.js --
// carries a TOU period, or an ExportRate timeTable period, as a plain
// JSON-safe window descriptor ({hours:[start,end], days, excludeHolidays})
// at period.window, never as a function, so that value is cloneable
// everywhere it travels. buildCustomProfile is called fresh inside the
// worker (model/runEngine.js's resolveHousehold) every time the engine runs,
// so the function is rebuilt there rather than surviving a serialization
// boundary it cannot cross.

import { validateProfileShape } from "./profile.js";

const DEFAULT_EXPORT_POLICY = {
  type: "avoidedCostCredit",
  ratePerKWh: 0,
  addersApply: false,
  carryForward: true,
  cashOut: false,
};

/** Inclusive of start, exclusive of end; wraps past midnight when start > end (mirrors calc/battery.js's gridCharge window). */
function hourInWindow(hourOfDay, start, end) {
  if (start === end) return true;
  if (start < end) return hourOfDay >= start && hourOfDay < end;
  return hourOfDay >= start || hourOfDay < end;
}

/**
 * Builds the real applies(hourCtx) predicate profile.js's Schedule shape
 * requires from a JSON-safe window descriptor. The one place this
 * translation happens (see this module's header); model/profileCodec.js's
 * parseProfileImport hands back the descriptor form only, never the
 * function itself.
 */
export function buildAppliesFromWindow(window) {
  const [start, end] = window.hours;
  const days = window.days || "all";
  const excludeHolidays = !!window.excludeHolidays;
  return (ctx) => {
    if (excludeHolidays && ctx.isHoliday) return false;
    if (days === "weekday" && ctx.isWeekend) return false;
    if (days === "weekend" && !ctx.isWeekend) return false;
    return hourInWindow(ctx.hourOfDay, start, end);
  };
}

/**
 * Attaches a real applies() predicate to each TOU period from its window
 * descriptor, leaving the descriptor itself in place at period.window so the
 * schedule can still be read back out for the "Copy my profile as JSON"
 * export (model/profileCodec.js's serializeProfile). A period whose window
 * is missing or malformed is left untouched (no applies attached) rather
 * than thrown on here, so calc/tariffs/profile.js's validateSchedule reports
 * its own "missing an applies() predicate" error for that specific period
 * instead of this function crashing the whole engine run.
 */
function materializeTouPricing(pricing) {
  if (!pricing || pricing.type !== "tou" || !Array.isArray(pricing.periods)) return pricing;
  return {
    ...pricing,
    periods: pricing.periods.map((p) => {
      if (!p?.window || !Array.isArray(p.window.hours) || p.window.hours.length !== 2) return p;
      return { ...p, applies: buildAppliesFromWindow(p.window) };
    }),
  };
}

/**
 * Attaches a real applies() predicate to each period of an ExportRate
 * timeTable, the identical translation materializeTouPricing does for TOU
 * pricing periods and via the same buildAppliesFromWindow -- an ExportRate
 * timeTable period carries the same window descriptor vocabulary a TOU
 * period does. Only exportPolicy.ratePerKWh (avoidedCostCredit) or
 * .exportRate (netMetering) is ever a timeTable; every other ExportRate kind
 * (a plain number, 'retail', monthlyTable, percentOfRetail) passes through
 * unchanged. A malformed or missing window is left untouched for the same
 * reason materializeTouPricing leaves one alone -- validateExportRate
 * reports its own "missing an applies() predicate" error instead.
 */
function materializeExportRate(exportRate) {
  if (!exportRate || exportRate.kind !== "timeTable" || !Array.isArray(exportRate.periods)) return exportRate;
  return {
    ...exportRate,
    periods: exportRate.periods.map((p) => {
      if (!p?.window || !Array.isArray(p.window.hours) || p.window.hours.length !== 2) return p;
      return { ...p, applies: buildAppliesFromWindow(p.window) };
    }),
  };
}

/**
 * Materializes any timeTable ExportRate on the given exportPolicy (see
 * materializeExportRate above). Passes every other exportPolicy shape
 * through unchanged.
 */
function materializeExportPolicy(exportPolicy) {
  if (!exportPolicy) return exportPolicy;
  if (exportPolicy.type === "avoidedCostCredit") {
    return { ...exportPolicy, ratePerKWh: materializeExportRate(exportPolicy.ratePerKWh) };
  }
  if (exportPolicy.type === "netMetering") {
    return { ...exportPolicy, exportRate: materializeExportRate(exportPolicy.exportRate) };
  }
  return exportPolicy;
}

/**
 * @param {Object} inputs
 * @param {string} [inputs.id]
 * @param {string} [inputs.label]
 * @param {number} inputs.fixedChargePerMonth
 * @param {Object} inputs.pricing Schedule.pricing (tiered | flat-seasonal | tou); a tou pricing's periods carry a
 *   JSON-safe window descriptor at period.window rather than a function -- see materializeTouPricing above.
 * @param {Object} [inputs.demand] Schedule.demand
 * @param {number} [inputs.minimumBillPerMonth] Schedule.minimumBillPerMonth; omitted from the built schedule when
 *   null/undefined, matching calc/billing.js's own "absent means no floor" default rather than writing an explicit 0.
 * @param {Array} [inputs.systemSizeCharges] Schedule.systemSizeCharges; omitted from the built schedule when
 *   null/undefined/empty, matching calc/billing.js's own "absent means 0" default.
 * @param {import('./profile.js').Adder[]} [inputs.adders]
 * @param {import('./profile.js').Rider[]} [inputs.riders]
 * @param {import('./profile.js').ExportPolicy} [inputs.exportPolicy] a timeTable ExportRate on
 *   ratePerKWh/exportRate carries the same JSON-safe window descriptor a tou period does -- see
 *   materializeExportRate above.
 * @param {Object} [inputs.constraints]
 * @returns {import('./profile.js').UtilityProfile}
 */
export function buildCustomProfile(inputs) {
  const {
    id = "custom",
    label = "Custom Utility",
    fixedChargePerMonth,
    pricing,
    demand,
    minimumBillPerMonth,
    systemSizeCharges,
    adders = [],
    riders = [],
    exportPolicy = DEFAULT_EXPORT_POLICY,
    constraints = {},
  } = inputs || {};

  const schedule = {
    id: `${id}-schedule`,
    label,
    fixedChargePerMonth,
    pricing: materializeTouPricing(pricing),
    ...(demand ? { demand } : {}),
    ...(minimumBillPerMonth != null ? { minimumBillPerMonth } : {}),
    ...(systemSizeCharges != null && systemSizeCharges.length > 0 ? { systemSizeCharges } : {}),
  };

  return {
    id,
    label,
    schedules: [schedule],
    adders,
    riders,
    exportPolicy: materializeExportPolicy(exportPolicy),
    constraints: {
      allowedFinancing: constraints.allowedFinancing || ["cash", "loan"],
      interconnectionFees: constraints.interconnectionFees || { singlePhase: 0, threePhase: 0 },
      ...(constraints.sizeCapMode ? { sizeCapMode: constraints.sizeCapMode } : {}),
    },
  };
}

/**
 * Errors on a built (or hand-assembled) UtilityProfile. Empty array means
 * valid. Delegates all shape/value checks to profile.js so a custom profile
 * is held to the exact same rules as LODI's.
 */
export function validateProfile(profile) {
  return validateProfileShape(profile);
}
