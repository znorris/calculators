// Shared typedefs and interpretation helpers for utility rate profiles.
//
// A Schedule's `pricing` is a discriminated union (tiered / flat-seasonal /
// tou); the helpers below read the `type` field and dispatch, so billing.js
// never inspects pricing shape directly. `hourContext` is the single place
// that turns an hour index into the { hour, hourOfDay, dayOfWeek, isWeekend,
// isHoliday, monthIdx, isSummer } object every TOU `applies()` predicate and
// demand `peakApplies()` predicate receives, so every schedule sees the same
// shape regardless of which module built it.

import { monthOfHour, hourOfDay, dayOfWeek, isWeekend, isHoliday, isLeuSummer, HOURS_PER_YEAR } from "../time.js";

/**
 * @typedef {Object} HourContext
 * @property {number} hour
 * @property {number} hourOfDay
 * @property {number} dayOfWeek
 * @property {boolean} isWeekend
 * @property {boolean} isHoliday
 * @property {number} monthIdx
 * @property {boolean} isSummer
 */

/**
 * @typedef {Object} Schedule
 * @property {string} id
 * @property {string} label
 * @property {number} fixedChargePerMonth
 * @property {Object} pricing
 * @property {{ratePerKW:{summer:number,winter:number}, peakRatePerKW?:{summer:number,winter:number}, peakApplies?:(ctx:HourContext)=>boolean}} [demand]
 */

/**
 * @typedef {Object} ExportRate
 * One $/kWh (or, for percentOfRetail, fraction-of-$/kWh) figure, shared by
 * avoidedCostCredit's ratePerKWh and netMetering's exportRate:
 *   number                                    flat $/kWh, every hour
 *   'retail'                                  netMetering only -- see below
 *   { kind:'monthlyTable', monthlyValues:number[12] }             keyed by calendar month
 *   { kind:'timeTable', periods:[{ rate:{summer,winter}, window }] }  keyed by hour, first
 *     matching period wins (declaration order; overlapping windows are a
 *     validation error, not a "most specific wins" resolution) -- window is
 *     the same {hours:[start,end], days, excludeHolidays} descriptor TOU
 *     pricing periods use, materialized to a real applies() predicate the
 *     same way (calc/tariffs/custom.js's buildAppliesFromWindow)
 *   { kind:'percentOfRetail', fraction:0..1 }  netMetering with netting:'hourly'
 *     only -- credit = fraction * that hour's applicable retail rate
 * 'retail' and 'percentOfRetail' both read the schedule's own applicable
 * rate for the hour (see retailRateForHour); every other kind names a rate
 * the export policy declares on its own, independent of the schedule.
 * @typedef {number|'retail'|{kind:'monthlyTable',monthlyValues:number[]}|{kind:'timeTable',periods:Object[]}|{kind:'percentOfRetail',fraction:number}} ExportRate
 */

/**
 * @typedef {Object} ExportPolicy
 * @property {'avoidedCostCredit'|'netMetering'} type
 * @property {ExportRate} [ratePerKWh] avoidedCostCredit's rate
 * @property {boolean} [addersApply]
 * @property {boolean} [carryForward]
 * @property {boolean} [cashOut]
 * @property {'hourly'|'annual'} [netting]
 * @property {ExportRate} [exportRate] netMetering's rate ('retail' only valid here)
 * @property {number|null} [lockYears] vintage lock: the export rate is frozen at its
 *   year-0 value through year lockYears-1; exportTrend escalation (calc/simulate.js)
 *   applies only from year lockYears onward, with its own clock restarting at 1 there
 *   (year lockYears gets factor (1+exportTrend)^1, matching calc/simulate.js).
 *   Models a fixed-vintage export rate (e.g. AZ/NV net-metering successor tariffs).
 * @property {{rate:number}|'forfeit'} [trueUp] netMetering netting:'annual' only: how
 *   the year-end true-up (calc/billing.js) resolves leftover banked kWh. Absent falls
 *   back to the pre-existing rule (a numeric exportRate cashes out at that same rate;
 *   anything else forfeits) for backward compatibility.
 */

/**
 * @typedef {Object} Adder
 * @property {string} id
 * @property {string} label
 * @property {'fixed'|'monthlyTable'} mode
 * @property {number} [valuePerKWh]
 * @property {number[]} [monthlyValues] length 12, indexed by calendar month 0-11
 */

/**
 * @typedef {Object} Rider
 * @property {string} id
 * @property {string} label
 * @property {number} percentOff fraction 0-1
 * @property {string} [exclusiveGroup] riders sharing a group are mutually exclusive
 */

/**
 * @typedef {Object} UtilityProfile
 * @property {string} id
 * @property {string} label
 * @property {Schedule[]} schedules
 * @property {Adder[]} adders
 * @property {Rider[]} riders
 * @property {ExportPolicy} exportPolicy
 * @property {Object} constraints
 * @property {'trailing12moUsage'} [constraints.sizeCapMode]
 * @property {string[]} constraints.allowedFinancing
 * @property {{singlePhase:number, threePhase:number}} constraints.interconnectionFees
 */

/** Build the HourContext for hour index h (0-8759) that every applies()/peakApplies() predicate receives. */
export function hourContext(h) {
  const monthIdx = monthOfHour(h);
  return {
    hour: h,
    hourOfDay: hourOfDay(h),
    dayOfWeek: dayOfWeek(h),
    isWeekend: isWeekend(h),
    isHoliday: isHoliday(h),
    monthIdx,
    isSummer: isLeuSummer(monthIdx),
  };
}

/**
 * Per-kWh rate for one hour under a flat-seasonal or TOU schedule.
 *
 * Tiered schedules have no single per-hour rate (the rate depends on
 * cumulative usage for the whole month), so call tieredEnergyCost for those
 * instead; passing one here throws rather than silently returning a wrong
 * number.
 */
export function rateForHour(schedule, hourCtx) {
  const { pricing } = schedule;
  if (pricing.type === "flat-seasonal") {
    return hourCtx.isSummer ? pricing.summerRate : pricing.winterRate;
  }
  if (pricing.type === "tou") {
    const period = pricing.periods.find((p) => p.applies(hourCtx));
    if (!period) {
      throw new Error(`no TOU period on schedule "${schedule.id}" matches hour ${hourCtx.hour}`);
    }
    return hourCtx.isSummer ? period.rate.summer : period.rate.winter;
  }
  throw new Error(`rateForHour does not support pricing.type "${pricing.type}"; use tieredEnergyCost for tiered schedules`);
}

/**
 * Dollar cost of a month's tiered energy usage.
 *
 * Cumulative monthly breakpoints (length = rates.length - 1) divide the
 * month's kWh into bands the same way progressive tax brackets divide
 * income: each rate applies only to the slice of usage inside its own band,
 * not to the whole month at the tier the last kWh landed in.
 */
export function tieredEnergyCost(monthlyKWh, schedule, isSummer) {
  const { rates, breakpoints } = schedule.pricing;
  const bps = isSummer ? breakpoints.summer : breakpoints.winter;
  const usage = Math.max(0, monthlyKWh);
  let cost = 0;
  let floor = 0;
  for (let i = 0; i < rates.length; i++) {
    const ceiling = i < bps.length ? bps[i] : Infinity;
    if (usage <= floor) break;
    cost += (Math.min(usage, ceiling) - floor) * rates[i];
    floor = ceiling;
  }
  return cost;
}

/**
 * Dollar cost of a month's all-units-blocks energy usage: unlike
 * tieredEnergyCost's per-band accounting, the WHOLE month's kWh is priced at
 * the single rate of the block the monthly total lands in, so moving from
 * one kWh under a boundary to one kWh over it can move the ENTIRE month's
 * bill, not just the marginal kWh (an intentional discontinuity some
 * utilities' block tariffs actually have).
 *
 * `pricing.blocks` is either a flat array (same blocks both seasons) or
 * `{summer, winter}` for a schedule whose block boundaries/rates differ by
 * season. Blocks are ordered ascending by `upToKWh`; every block but the
 * last must have a numeric `upToKWh` ceiling, and the last must have
 * `upToKWh: null` (no ceiling) -- validateSchedule enforces both.
 */
export function allUnitsBlocksEnergyCost(monthlyKWh, schedule, isSummer) {
  const { blocks } = schedule.pricing;
  const seasonBlocks = Array.isArray(blocks) ? blocks : isSummer ? blocks.summer : blocks.winter;
  const usage = Math.max(0, monthlyKWh);
  for (const block of seasonBlocks) {
    if (block.upToKWh == null || usage <= block.upToKWh) return usage * block.rate;
  }
  return usage * seasonBlocks[seasonBlocks.length - 1].rate;
}

/**
 * The schedule's own $/kWh rate for one hour, on whichever cumulative import
 * kWh `cumulativeImportKWh` is (used only by pricing types with no single
 * per-hour rate: tiered and all-units-blocks). This is what ExportRate's
 * 'retail' and 'percentOfRetail' kinds both read (percentOfRetail scales the
 * result by its own fraction) -- it is the same "hourly netMetering's
 * 'retail' rate" CONTRACTS.md describes: the TOU period's own rate, the
 * current tier's (or all-units-block's) marginal rate from cumulative import
 * kWh so far that month, or the season's flat rate.
 */
export function retailRateForHour(schedule, hourCtx, cumulativeImportKWh) {
  if (schedule.pricing.type === "tiered") {
    const { rates, breakpoints } = schedule.pricing;
    const bps = hourCtx.isSummer ? breakpoints.summer : breakpoints.winter;
    for (let i = 0; i < rates.length; i++) {
      const ceiling = i < bps.length ? bps[i] : Infinity;
      if (cumulativeImportKWh <= ceiling) return rates[i];
    }
    return rates[rates.length - 1];
  }
  if (schedule.pricing.type === "all-units-blocks") {
    const { blocks } = schedule.pricing;
    const seasonBlocks = Array.isArray(blocks) ? blocks : hourCtx.isSummer ? blocks.summer : blocks.winter;
    for (const block of seasonBlocks) {
      if (block.upToKWh == null || cumulativeImportKWh <= block.upToKWh) return block.rate;
    }
    return seasonBlocks[seasonBlocks.length - 1].rate;
  }
  return rateForHour(schedule, hourCtx);
}

/**
 * Resolves one ExportRate value (see its typedef above) to the $/kWh credit
 * for one exporting hour. Shared by avoidedCostCredit.ratePerKWh and
 * netMetering.exportRate under netting:'hourly' -- calc/billing.js is the
 * only caller, and it always passes the exporting hour's own hourCtx and the
 * month-to-date cumulativeImportKWh (needed only by 'retail'/percentOfRetail
 * on a tiered or all-units-blocks schedule).
 */
export function resolveExportRate(exportRate, schedule, hourCtx, cumulativeImportKWh) {
  if (typeof exportRate === "number") return exportRate;
  if (exportRate === "retail") return retailRateForHour(schedule, hourCtx, cumulativeImportKWh);
  if (exportRate && exportRate.kind === "monthlyTable") return exportRate.monthlyValues[hourCtx.monthIdx];
  if (exportRate && exportRate.kind === "timeTable") {
    const period = exportRate.periods.find((p) => p.applies(hourCtx));
    if (!period) throw new Error(`no ExportRate timeTable period matches hour ${hourCtx.hour}`);
    return hourCtx.isSummer ? period.rate.summer : period.rate.winter;
  }
  if (exportRate && exportRate.kind === "percentOfRetail") {
    return exportRate.fraction * retailRateForHour(schedule, hourCtx, cumulativeImportKWh);
  }
  throw new Error(`unrecognized ExportRate value: ${JSON.stringify(exportRate)}`);
}

/**
 * Which demand-charge bucket an hour's peak import counts toward.
 *
 * Returns null when the schedule has no demand charge at all. Returns
 * "standard" for every hour when the schedule has no peakApplies predicate
 * (e.g. LODI G2, whose demand charge is a single rate on the whole month's
 * peak with no separate peak-period demand charge).
 */
export function demandPeriodFor(schedule, hourCtx) {
  if (!schedule.demand) return null;
  if (schedule.demand.peakApplies && schedule.demand.peakApplies(hourCtx)) return "peak";
  return "standard";
}

/**
 * Dollar cost of one adder over a month's imported (or, when the caller is
 * pricing export-side adders, exported) kWh.
 *
 * The override is keyed off adder.mode === 'monthlyTable', not any specific
 * adder id: when options.ecaMode is 'fixed', it substitutes ecaFixedValue as
 * a flat override rate for THAT adder for every month, regardless of what
 * its own monthlyValues table says, so a caller can price a future year
 * without assuming a historical table (LEU's ECA, or any other
 * monthly-varying adder a profile happens to declare) still applies. The
 * options key stays named ecaMode/ecaFixedValue for state/storage
 * compatibility, but it is a monthly-table override, not an ECA-specific
 * one -- a custom-named monthlyTable adder gets the same override LEU's own
 * `eca` adder does. A 'fixed'-mode adder, and any adder when ecaMode is not
 * 'fixed', uses its own mode/value as declared on the profile. ecaMode
 * 'fixed' with no numeric ecaFixedValue throws rather than silently pricing
 * that adder at $0 (null) or NaN (undefined) -- an unset override is a
 * caller error, not a zero rate.
 */
export function adderCost(adder, { monthIdx, kWh, ecaMode, ecaFixedValue }) {
  if (adder.mode === "monthlyTable" && ecaMode === "fixed") {
    if (typeof ecaFixedValue !== "number") {
      throw new Error('ecaFixedValue must be a number when ecaMode is "fixed"');
    }
    return ecaFixedValue * kWh;
  }
  if (adder.mode === "fixed") return adder.valuePerKWh * kWh;
  if (adder.mode === "monthlyTable") return adder.monthlyValues[monthIdx] * kWh;
  throw new Error(`unknown adder mode "${adder.mode}" on adder "${adder.id}"`);
}

/**
 * Combined percent-off from the selected riderIds, applied (per billing.js)
 * to the bill subtotal before export credits.
 *
 * Throws if two selected riders share an exclusiveGroup, which is how "at
 * most one per household" riders (LODI's SHARE/medical/senior-fixed-income)
 * get enforced: the check runs wherever the discount is actually computed,
 * so it can't be bypassed by a caller that skips a separate validation step.
 *
 * The combined total is capped at 1 (100% off): riders with no exclusiveGroup
 * are free to be selected together, and nothing about billing a bill down to
 * $0 and then some makes sense, so a combination that would exceed 100% off
 * is clamped rather than allowed to drive the pre-export subtotal negative.
 */
export function ridersTotalPercentOff(riders, riderIds) {
  const selected = (riderIds || [])
    .map((id) => riders.find((r) => r.id === id))
    .filter(Boolean);
  const groupsSeen = new Set();
  for (const r of selected) {
    if (!r.exclusiveGroup) continue;
    if (groupsSeen.has(r.exclusiveGroup)) {
      throw new Error(`more than one rider selected from exclusive group "${r.exclusiveGroup}"`);
    }
    groupsSeen.add(r.exclusiveGroup);
  }
  const total = selected.reduce((sum, r) => sum + r.percentOff, 0);
  return Math.min(1, total);
}

/** Errors on a Schedule's shape and rate values. Empty array means valid. */
export function validateSchedule(schedule) {
  const errors = [];
  if (!schedule || typeof schedule !== "object") return ["schedule is missing"];
  if (!schedule.id) errors.push("schedule.id is required");
  if (!schedule.label) errors.push("schedule.label is required");
  if (!(schedule.fixedChargePerMonth >= 0)) errors.push("schedule.fixedChargePerMonth must be a non-negative number");

  const pricing = schedule.pricing;
  if (!pricing || typeof pricing !== "object") {
    errors.push("schedule.pricing is required");
  } else if (pricing.type === "tiered") {
    if (!Array.isArray(pricing.rates) || pricing.rates.length === 0) {
      errors.push("tiered pricing.rates must be a non-empty array");
    } else if (pricing.rates.some((r) => !(r >= 0))) {
      errors.push("tiered pricing.rates must all be non-negative numbers");
    }
    const bp = pricing.breakpoints;
    if (!bp || !Array.isArray(bp.summer) || !Array.isArray(bp.winter)) {
      errors.push("tiered pricing.breakpoints.summer and .winter are required arrays");
    } else if (Array.isArray(pricing.rates)) {
      const expectedLen = pricing.rates.length - 1;
      if (bp.summer.length !== expectedLen || bp.winter.length !== expectedLen) {
        errors.push(`tiered pricing.breakpoints must have ${expectedLen} entries (one fewer than rates)`);
      }
      for (const series of [bp.summer, bp.winter]) {
        for (let i = 1; i < series.length; i++) {
          if (series[i] <= series[i - 1]) {
            errors.push("tiered pricing.breakpoints must be strictly ascending");
            break;
          }
        }
      }
    }
  } else if (pricing.type === "flat-seasonal") {
    if (!(pricing.summerRate >= 0)) errors.push("flat-seasonal pricing.summerRate must be a non-negative number");
    if (!(pricing.winterRate >= 0)) errors.push("flat-seasonal pricing.winterRate must be a non-negative number");
  } else if (pricing.type === "tou") {
    if (!Array.isArray(pricing.periods) || pricing.periods.length === 0) {
      errors.push("tou pricing.periods must be a non-empty array");
    } else {
      const touErrors = [];
      for (const p of pricing.periods) {
        if (typeof p.applies !== "function") touErrors.push(`tou period "${p.id}" is missing an applies() predicate`);
        if (!(p.rate?.summer >= 0) || !(p.rate?.winter >= 0)) {
          touErrors.push(`tou period "${p.id}" must have non-negative rate.summer and rate.winter`);
        }
      }
      // Coverage only runs once every period passed its own shape checks --
      // calling a malformed period's applies() (missing entirely, or thrown
      // together with a bad rate) would either throw itself or produce a
      // meaningless result, and the shape errors above already name the
      // period to fix.
      if (touErrors.length === 0) {
        touErrors.push(...validateFullHourCoverage(pricing.periods, `tou pricing.periods on schedule "${schedule.id}"`));
      }
      errors.push(...touErrors);
    }
  } else if (pricing.type === "all-units-blocks") {
    const seasonal = pricing.blocks && !Array.isArray(pricing.blocks);
    const groups = seasonal ? [["summer", pricing.blocks.summer], ["winter", pricing.blocks.winter]] : [["blocks", pricing.blocks]];
    for (const [label, blocks] of groups) {
      if (!Array.isArray(blocks) || blocks.length === 0) {
        errors.push(`all-units-blocks pricing.${label} must be a non-empty array`);
        continue;
      }
      blocks.forEach((b, i) => {
        const isLast = i === blocks.length - 1;
        if (!(b?.rate >= 0)) errors.push(`all-units-blocks pricing.${label}[${i}].rate must be a non-negative number`);
        if (isLast) {
          if (b?.upToKWh != null) errors.push(`all-units-blocks pricing.${label}'s last block must have upToKWh null (no ceiling)`);
        } else {
          if (!(b?.upToKWh > 0)) errors.push(`all-units-blocks pricing.${label}[${i}].upToKWh must be a positive number (only the last block may be null)`);
          else if (i > 0 && b.upToKWh <= blocks[i - 1].upToKWh) errors.push(`all-units-blocks pricing.${label} upToKWh values must be strictly ascending`);
        }
      });
    }
  } else {
    errors.push(`unknown pricing.type "${pricing?.type}"`);
  }

  if (schedule.demand) {
    const d = schedule.demand;
    if (!(d.ratePerKW?.summer >= 0) || !(d.ratePerKW?.winter >= 0)) {
      errors.push("schedule.demand.ratePerKW must have non-negative summer and winter rates");
    }
    if (d.peakRatePerKW && (!(d.peakRatePerKW.summer >= 0) || !(d.peakRatePerKW.winter >= 0))) {
      errors.push("schedule.demand.peakRatePerKW must have non-negative summer and winter rates when present");
    }
  }

  if (schedule.minimumBillPerMonth != null && !(schedule.minimumBillPerMonth >= 0)) {
    errors.push("schedule.minimumBillPerMonth must be a non-negative number when present");
  }

  if (schedule.systemSizeCharges != null) {
    if (!Array.isArray(schedule.systemSizeCharges)) {
      errors.push("schedule.systemSizeCharges must be an array when present");
    } else {
      schedule.systemSizeCharges.forEach((c, i) => {
        if (c?.basis !== "kW-DC-solar" && c?.basis !== "kWh-battery") {
          errors.push(`schedule.systemSizeCharges[${i}].basis must be "kW-DC-solar" or "kWh-battery", got "${c?.basis}"`);
        }
        if (!(c?.ratePerMonth >= 0)) errors.push(`schedule.systemSizeCharges[${i}].ratePerMonth must be a non-negative number`);
      });
    }
  }

  return errors;
}

/** Errors on an Adder's shape. Empty array means valid. */
export function validateAdder(adder) {
  const errors = [];
  if (!adder || typeof adder !== "object") return ["adder is missing"];
  if (!adder.id) errors.push("adder.id is required");
  if (!adder.label) errors.push("adder.label is required");
  if (adder.mode === "fixed") {
    if (!(adder.valuePerKWh >= 0)) errors.push(`adder "${adder.id}" valuePerKWh must be a non-negative number`);
  } else if (adder.mode === "monthlyTable") {
    if (!Array.isArray(adder.monthlyValues) || adder.monthlyValues.length !== 12) {
      errors.push(`adder "${adder.id}" monthlyValues must be an array of 12 numbers`);
    } else if (adder.monthlyValues.some((v) => !Number.isFinite(v) || v < 0)) {
      errors.push(`adder "${adder.id}" monthlyValues must all be finite, non-negative numbers`);
    }
  } else {
    errors.push(`adder "${adder.id}" has unknown mode "${adder.mode}"`);
  }
  return errors;
}

/** Errors on a Rider's shape. Empty array means valid. */
export function validateRider(rider) {
  const errors = [];
  if (!rider || typeof rider !== "object") return ["rider is missing"];
  if (!rider.id) errors.push("rider.id is required");
  if (!rider.label) errors.push("rider.label is required");
  if (!(rider.percentOff > 0) || rider.percentOff > 1) {
    errors.push(`rider "${rider.id}" percentOff must be a fraction between 0 and 1`);
  }
  return errors;
}

/** Inclusive of start, exclusive of end; wraps past midnight when start > end (mirrors calc/tariffs/custom.js's identically-named helper and calc/battery.js's gridCharge window). */
function hourInWindowForOverlapCheck(hourOfDay, start, end) {
  if (start === end) return true;
  if (start < end) return hourOfDay >= start && hourOfDay < end;
  return hourOfDay >= start || hourOfDay < end;
}

function hoursCoveredByWindow(window) {
  const [start, end] = window.hours;
  const covered = new Set();
  for (let h = 0; h < 24; h++) {
    if (hourInWindowForOverlapCheck(h, start, end)) covered.add(h);
  }
  return covered;
}

/**
 * True when two window descriptors can both be active in the same hour.
 * excludeHolidays is deliberately not factored in (a holiday is too small a
 * slice of the year to make two otherwise-overlapping windows non-
 * overlapping in any way a household would notice) -- this mirrors
 * model/profileCodec.js's own periodsOverlap check for TOU import
 * validation; calc/ cannot import model/, so this is a second, smaller copy
 * scoped to just the window-overlap question, not the whole import-parsing
 * pipeline.
 */
function windowsOverlap(a, b) {
  const hoursOverlap = [...hoursCoveredByWindow(a)].some((h) => hoursCoveredByWindow(b).has(h));
  if (!hoursOverlap) return false;
  const daysA = a.days || "all";
  const daysB = b.days || "all";
  return daysA === "all" || daysB === "all" || daysA === daysB;
}

/**
 * Errors when NO period's applies() predicate covers some hour of the
 * reference year -- the runtime failure mode this check exists to catch
 * before simulation: rateForHour/resolveExportRate throw "no ... period
 * matches hour N" the first time an uncovered hour is actually billed,
 * naming no field the caller could fix. Runs the real 8760-hour
 * calc/time.js hourContext against every period's own applies() (whichever
 * way it was built -- a materialized window descriptor, or hand-authored
 * directly, e.g. LODI's own schedules), so this is accurate regardless of
 * how a period's predicate came to exist, not limited to profiles imported
 * through the window-descriptor wire format. Stops at the first gap found,
 * rather than every uncovered hour, since one is already enough to name and
 * fix, and a schedule with a real gap likely has many contiguous ones.
 */
function validateFullHourCoverage(periods, pathLabel) {
  const errors = [];
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const ctx = hourContext(h);
    if (!periods.some((p) => typeof p.applies === "function" && p.applies(ctx))) {
      errors.push(
        `${pathLabel} has a coverage gap: no period matches hour ${h} (hourOfDay ${ctx.hourOfDay}, ${ctx.isWeekend ? "weekend" : "weekday"}${ctx.isHoliday ? ", holiday" : ""}). Every hour of the year must be covered by at least one period.`,
      );
      break;
    }
  }
  return errors;
}

/**
 * Errors when any two of an ExportRate timeTable's periods can both apply in
 * the same hour: first-match-wins (declaration order) makes an overlap
 * ambiguous about which period's rate actually governs that hour, so it is
 * rejected rather than silently resolved by array position. A period with no
 * window descriptor (e.g. one whose applies() was hand-authored with no
 * window kept alongside it) is skipped -- there is no descriptor to compare.
 */
function validateNoOverlappingTimeTableWindows(periods) {
  const errors = [];
  const withWindows = periods.map((p, i) => ({ i, window: p.window })).filter((p) => p.window && Array.isArray(p.window.hours));
  for (let a = 0; a < withWindows.length; a++) {
    for (let b = a + 1; b < withWindows.length; b++) {
      if (windowsOverlap(withWindows[a].window, withWindows[b].window)) {
        errors.push(
          `ExportRate timeTable periods at index ${withWindows[a].i} and ${withWindows[b].i} overlap: both can apply in the same hour, and first-match-wins makes that ambiguous`,
        );
      }
    }
  }
  return errors;
}

/**
 * Errors on one ExportRate value (see its typedef above), in the context
 * it's used. `context` is 'avoidedCostCredit' or 'netMetering'; `netting` is
 * only relevant when context is 'netMetering' -- 'retail' is only valid for
 * netMetering (either netting mode), and percentOfRetail only for
 * netMetering with netting:'hourly' (there is no single applicable retail
 * rate to scale for annual netting's once-a-year true-up, or for
 * avoidedCostCredit, which has no retail schedule concept of its own).
 */
export function validateExportRate(exportRate, { context, netting } = {}) {
  const errors = [];
  if (typeof exportRate === "number") {
    if (!(exportRate >= 0) || !Number.isFinite(exportRate)) errors.push("ExportRate number must be a non-negative finite number");
    return errors;
  }
  if (exportRate === "retail") {
    if (context !== "netMetering") errors.push('ExportRate "retail" is only valid for netMetering');
    return errors;
  }
  if (!exportRate || typeof exportRate !== "object") {
    errors.push('ExportRate must be a non-negative number, "retail", or an object with a "kind"');
    return errors;
  }
  if (exportRate.kind === "monthlyTable") {
    if (!Array.isArray(exportRate.monthlyValues) || exportRate.monthlyValues.length !== 12) {
      errors.push("ExportRate monthlyTable.monthlyValues must be an array of 12 numbers");
    } else if (exportRate.monthlyValues.some((v) => !(v >= 0))) {
      errors.push("ExportRate monthlyTable.monthlyValues must all be non-negative numbers");
    }
  } else if (exportRate.kind === "timeTable") {
    if (!Array.isArray(exportRate.periods) || exportRate.periods.length === 0) {
      errors.push("ExportRate timeTable.periods must be a non-empty array");
    } else {
      const timeTableErrors = [];
      for (const p of exportRate.periods) {
        if (!(p?.rate?.summer >= 0) || !(p?.rate?.winter >= 0)) {
          timeTableErrors.push("ExportRate timeTable period must have non-negative rate.summer and rate.winter");
        }
        if (typeof p?.applies !== "function") {
          timeTableErrors.push("ExportRate timeTable period is missing an applies() predicate");
        }
      }
      timeTableErrors.push(...validateNoOverlappingTimeTableWindows(exportRate.periods));
      // Same "only once every period's own shape is sound" gate
      // validateSchedule's tou branch applies before its own coverage check.
      if (timeTableErrors.length === 0) {
        timeTableErrors.push(...validateFullHourCoverage(exportRate.periods, "ExportRate timeTable.periods"));
      }
      errors.push(...timeTableErrors);
    }
  } else if (exportRate.kind === "percentOfRetail") {
    if (context !== "netMetering" || netting !== "hourly") {
      errors.push('ExportRate percentOfRetail is only valid for netMetering with netting "hourly"');
    }
    if (!(exportRate.fraction > 0) || exportRate.fraction > 1) {
      errors.push("ExportRate percentOfRetail.fraction must be a fraction between 0 (exclusive) and 1 (inclusive)");
    }
  } else {
    errors.push(`unknown ExportRate kind "${exportRate?.kind}"`);
  }
  return errors;
}

/** True for an ExportRate that tracks the schedule's own retail rate by construction: a plain "retail" string, or a percentOfRetail fraction of it. Both already escalate however retailEscalation moves the schedule's retail rate, so there is no fixed dollar figure for lockYears to freeze. */
function exportRateTracksRetail(rate) {
  return rate === "retail" || (rate != null && typeof rate === "object" && rate.kind === "percentOfRetail");
}

/** Errors on an ExportPolicy's shape. Empty array means valid. */
export function validateExportPolicy(exportPolicy) {
  const errors = [];
  if (!exportPolicy || typeof exportPolicy !== "object") return ["exportPolicy is missing"];

  if (exportPolicy.lockYears != null && !(Number.isInteger(exportPolicy.lockYears) && exportPolicy.lockYears > 0)) {
    errors.push("exportPolicy.lockYears must be a positive integer when present");
  }

  if (exportPolicy.lockYears != null) {
    const rate = exportPolicy.type === "avoidedCostCredit" ? exportPolicy.ratePerKWh : exportPolicy.exportRate;
    if (exportRateTracksRetail(rate)) {
      errors.push(
        'exportPolicy.lockYears has no effect on a "retail" or percentOfRetail export rate: both track the schedule\'s own retail rate by construction (already escalated by retailEscalation), so there is no fixed dollar figure for a vintage lock to freeze. Use a numeric, monthlyTable, or timeTable export rate to model a locked export rate instead.',
      );
    }
  }

  if (exportPolicy.type === "avoidedCostCredit") {
    errors.push(...validateExportRate(exportPolicy.ratePerKWh, { context: "avoidedCostCredit" }).map((e) => `avoidedCostCredit exportPolicy.ratePerKWh: ${e}`));
    if (exportPolicy.trueUp != null) {
      errors.push('exportPolicy.trueUp is only meaningful under netMetering netting "annual"');
    }
  } else if (exportPolicy.type === "netMetering") {
    if (exportPolicy.netting !== "hourly" && exportPolicy.netting !== "annual") {
      errors.push('netMetering exportPolicy.netting must be "hourly" or "annual"');
    }
    errors.push(
      ...validateExportRate(exportPolicy.exportRate, { context: "netMetering", netting: exportPolicy.netting }).map((e) => `netMetering exportPolicy.exportRate: ${e}`),
    );
    if (exportPolicy.trueUp != null) {
      if (exportPolicy.netting !== "annual") {
        errors.push('exportPolicy.trueUp is only meaningful under netMetering netting "annual"');
      }
      if (exportPolicy.trueUp !== "forfeit" && !(exportPolicy.trueUp && typeof exportPolicy.trueUp === "object" && exportPolicy.trueUp.rate >= 0)) {
        errors.push('exportPolicy.trueUp must be "forfeit" or { rate: non-negative number }');
      }
    }
  } else {
    errors.push(`exportPolicy.type must be "avoidedCostCredit" or "netMetering", got "${exportPolicy?.type}"`);
  }
  return errors;
}

/** Structural errors on a whole UtilityProfile: schedules/adders/riders/exportPolicy/constraints. */
export function validateProfileShape(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object") return ["profile is missing"];
  if (!profile.id) errors.push("profile.id is required");
  if (!profile.label) errors.push("profile.label is required");

  if (!Array.isArray(profile.schedules) || profile.schedules.length === 0) {
    errors.push("profile.schedules must be a non-empty array");
  } else {
    for (const s of profile.schedules) errors.push(...validateSchedule(s));
  }

  if (!Array.isArray(profile.adders)) {
    errors.push("profile.adders must be an array");
  } else {
    for (const a of profile.adders) errors.push(...validateAdder(a));
  }

  if (!Array.isArray(profile.riders)) {
    errors.push("profile.riders must be an array");
  } else {
    for (const r of profile.riders) errors.push(...validateRider(r));

    // Worst case a household could select simultaneously: every rider with
    // no exclusiveGroup (nothing stops them being selected together), plus
    // the largest rider from each exclusiveGroup (only one of that group can
    // apply at once). If that combination alone exceeds 100% off, riders can
    // drive the bill's pre-export subtotal negative.
    const largestPerGroup = new Map();
    let ungroupedTotal = 0;
    for (const r of profile.riders) {
      if (!(r.percentOff > 0)) continue;
      if (r.exclusiveGroup) {
        largestPerGroup.set(r.exclusiveGroup, Math.max(largestPerGroup.get(r.exclusiveGroup) || 0, r.percentOff));
      } else {
        ungroupedTotal += r.percentOff;
      }
    }
    const worstCaseTotal = ungroupedTotal + [...largestPerGroup.values()].reduce((sum, v) => sum + v, 0);
    if (worstCaseTotal > 1) {
      errors.push("profile.riders can sum to more than 100% off when selected together (riders without a shared exclusiveGroup are not mutually exclusive)");
    }
  }

  errors.push(...validateExportPolicy(profile.exportPolicy));

  const c = profile.constraints;
  if (!c || typeof c !== "object") {
    errors.push("profile.constraints is required");
  } else {
    if (!Array.isArray(c.allowedFinancing) || c.allowedFinancing.length === 0) {
      errors.push("profile.constraints.allowedFinancing must be a non-empty array");
    }
    if (!(c.interconnectionFees?.singlePhase >= 0) || !(c.interconnectionFees?.threePhase >= 0)) {
      errors.push("profile.constraints.interconnectionFees must have non-negative singlePhase and threePhase");
    }
  }

  return errors;
}
