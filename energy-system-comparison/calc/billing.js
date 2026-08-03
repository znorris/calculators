// Turns an 8760-hour import/export series into a 12-month bill.
//
// Monthly output fields:
//   fixed          schedule.fixedChargePerMonth, unconditional.
//   energy         tiered/flat-seasonal/TOU/all-units-blocks energy charge on
//                  billed kWh (see "Net metering" below for what "billed"
//                  means per policy).
//   adders         sum of profile.adders over billed kWh for the month (same
//                  kWh figure `energy` is priced on).
//   demand         monthly-peak-import-kW demand charge (0 if schedule has no
//                  demand charge). Demand is never netted under any export
//                  policy: it is driven by the raw hourly import series only.
//   systemCharge   sum of schedule.systemSizeCharges (0 if the schedule has
//                  none) -- see "System size charges" below.
//   riderDiscount  dollars subtracted for the selected riders (see below), always >= 0.
//   exportCredit   dollars the $ export ledger applied to this month's bill, always >= 0.
//   total          max(schedule.minimumBillPerMonth ?? 0, fixed + energy + adders +
//                  demand + systemCharge - riderDiscount - exportCredit), never negative.
//
// Riders are a percentage off the bill, not off energy usage: LEU's rider
// tariffs describe SHARE/medical/senior discounts as "% off your bill," so
// riderDiscount is computed against (fixed + energy + adders + demand +
// systemCharge), the full pre-export-credit subtotal, and
// ridersTotalPercentOff() (profile.js) also enforces that at most one rider
// per exclusiveGroup is selected.
//
// System size charges
// --------------------
// schedule.systemSizeCharges is an optional array of
// { basis:'kW-DC-solar'|'kWh-battery', ratePerMonth }, each billed monthly as
// (the matching size in options.systemSizes) * ratePerMonth -- a flat
// capacity-based monthly fee (interconnection/standby charges some utilities
// bill per kW or kWh of installed customer generation/storage, independent of
// how much energy actually flows). options.systemSizes = { kwDCSolar,
// kwhBattery } (both default 0 when omitted); calc/simulate.js is the caller
// that threads a config's actual nameplate sizes through. A schedule with no
// systemSizeCharges (the common case) always reads systemCharge as 0
// regardless of options.systemSizes.
//
// Minimum bill
// ------------
// schedule.minimumBillPerMonth (optional, default 0, i.e. no floor) floors
// the month's total AFTER riders and AFTER export-credit offset -- it models
// a utility minimum bill that a customer's own credits cannot erase. This is
// enforced by capping how much of the $ ledger a month is allowed to draw
// down to begin with (subtotal - minimumBillPerMonth, floored at 0), not by
// applying the full credit and then flooring the result: credit that would
// have pushed the bill below the floor is left UNSPENT in the ledger,
// available to offset a later month, rather than being drawn from the ledger
// and then wasted against the floor.
//
// Export policies
// ---------------
// profile.exportPolicy.type is 'avoidedCostCredit' or 'netMetering' (any
// other value throws, quoting both permitted types). Every policy shares one
// $ ledger (options.openingLedger in, exportLedgerEndBalance out): credit
// only ever offsets a bill, it never cashes out, and unused credit carries
// into the next month (or, via the caller, the next year) rather than
// expiring. Each month draws at most (subtotal - the minimum bill floor, see
// above) from the ledger to produce exportCredit, so total never goes below
// that floor (0 when the schedule has none).
//
// Both avoidedCostCredit.ratePerKWh and netMetering.exportRate (under
// netting:'hourly') are an ExportRate (see tariffs/profile.js's typedef and
// resolveExportRate): a flat number as before, 'retail' (netMetering only),
// or one of monthlyTable / timeTable / percentOfRetail (netMetering hourly
// only). This module resolves that value PER EXPORTING HOUR via
// resolveExportRate and accumulates the result into the same per-month $
// bucket for both policies (bucket.hourlyExportCredit) -- for a flat number
// or a monthlyTable (whose value doesn't vary within a month), summing
// per-hour and pricing the month's total in one multiply give the identical
// dollar figure by linearity; only timeTable/percentOfRetail actually need
// the per-hour resolution, which is why every kind goes through the same
// hourly path rather than special-casing the ones that don't.
//
// One combination breaks that linearity, though: 'retail' or percentOfRetail
// crediting against an all-units-blocks schedule. all-units-blocks prices the
// WHOLE month's import at the single rate of whichever block the month's
// FINAL total lands in (see tariffs/profile.js's allUnitsBlocksEnergyCost) --
// it is not marginal/tiered. resolveExportRate's retailRateForHour reads
// that block off cumulativeImportKWh so far, which mid-month is a smaller,
// possibly wrong-block figure; summing that per-hour would credit exports at
// whatever block the running total happened to be in when each export
// occurred, not the block the month actually landed in and was billed at.
// The monthly loop below recomputes this one combination's credit directly
// from the month's now-known final importKWh, after the hourly loop; see
// isAllUnitsBlocksRetailLike there.
//
// This module does not itself apply exportPolicy.lockYears (the "vintage
// lock" that freezes an ExportRate at its year-0 value for a stated number
// of years before exportTrend escalation resumes): that is calc/simulate.js's
// concern, applied before the (possibly still-frozen, possibly escalated)
// exportPolicy for a given year ever reaches priceYear. This module always
// just prices whatever ExportRate it is handed for the year in hand.
//
// 'avoidedCostCredit' (LODI's): imports bill normally. Each exporting hour's
// credit is resolveExportRate(ratePerKWh, ...) * that hour's exported kWh;
// the month's adders-on-exports deduction (when options.addersOnExports is
// true) is still computed on the month's total exported kWh, then the net
// figure is added to the $ ledger.
//
// 'netMetering' has two netting modes:
//
//   netting: 'hourly' (retail-crediting NEM) -- imports bill exactly like
//   avoidedCostCredit (tiered/flat/TOU/all-units-blocks energy, adders,
//   demand all computed from the raw import series). Each hour's exported
//   kWh earns a $ credit at resolveExportRate(exportRate, ...) for that hour.
//   Credits accumulate into the same $ ledger every other policy uses, and
//   addersOnExports applies with the same meaning as avoidedCostCredit's.
//
//   netting: 'annual' (kWh netting, typical muni NEM) -- imports and exports
//   are netted in kWh *before* pricing, not billed and credited separately.
//   Each month: billed kWh = max(0, importKWh - exportKWh - carriedKWhCredit),
//   where carriedKWhCredit is the kWh credit left over from earlier months
//   this same calendar year (see annualNettedMonth below); any exported kWh
//   the month doesn't consume becomes next month's carriedKWhCredit. Tiered
//   (and all-units-blocks) pricing's rate position, and every per-kWh adder,
//   read off this NET billed kWh -- netting is volumetric, so it moves the
//   same kWh figure every volumetric charge prices from. Fixed, demand, and
//   system-size charges are never netted (see above). A TOU schedule nets
//   *within each period* rather than against the whole month's total (a
//   period's export only offsets that same period's import -- see
//   annualNettedMonth for the period-by-period walk and how carriedKWhCredit
//   is drawn down across periods).
//
//   The kWh credit ledger is intra-year only: at the 12th month (the annual
//   true-up), whatever kWh credit remains is resolved and zeroed rather than
//   carried into next year's January, matching how a real muni NEM true-up
//   works. exportPolicy.trueUp controls how: { rate:number } cashes the
//   leftover kWh at that rate into a one-time $ credit added to the *same* $
//   ledger every policy uses (so it then behaves exactly like an
//   avoidedCostCredit credit: carries forward, never cashes out); 'forfeit'
//   simply drops it, matching common muni year-end forfeiture. trueUp is
//   OPTIONAL for backward compatibility: when absent, the pre-existing rule
//   applies instead -- a numeric exportPolicy.exportRate cashes out at that
//   same rate; 'retail', or any other ExportRate kind (none of which name a
//   single $/kWh figure to cash a lump kWh balance out at), forfeits. Either
//   way, 'retail' during the year already means each netted kWh displaced
//   retail-rate energy (it set the tier/TOU rate that kWh would otherwise
//   have billed at); it does not mean the true-up itself pays out at a
//   retail rate, since kWh netting has no per-kWh dollar figure to pay a
//   true-up out at in the first place.
//
// options.openingKwhLedger/kwhLedgerEndBalance thread the kWh ledger the
// same way options.openingLedger/exportLedgerEndBalance thread the $ ledger,
// for a caller (calc/simulate.js) that wants one uniform ledger-carry
// pattern per meter regardless of export policy. Under the current
// once-a-year true-up, kwhLedgerEndBalance always reads back 0 (it never
// survives past December), so this is a no-op for every export policy today,
// but it keeps the two ledgers symmetric rather than special-casing one of
// them out of the caller's carry-forward wiring.

import { isLeuSummer } from "./time.js";
import { hourContext, tieredEnergyCost, allUnitsBlocksEnergyCost, demandPeriodFor, adderCost, ridersTotalPercentOff, resolveExportRate } from "./tariffs/profile.js";

const HOURS_PER_YEAR = 8760;

function emptyMonth(periodCount) {
  return {
    importKWh: 0,
    exportKWh: 0,
    standardPeakKW: 0,
    peakPeriodPeakKW: 0,
    touEnergyCost: 0,
    hourlyExportCredit: 0,
    periodImportKWh: periodCount ? new Array(periodCount).fill(0) : null,
    periodExportKWh: periodCount ? new Array(periodCount).fill(0) : null,
    cumulativeImportKWh: 0,
  };
}

/** Sum of every profile adder over `kWh` for calendar month `monthIdx`. */
function addersOverKWh(profile, monthIdx, kWh, ecaMode, ecaFixedValue) {
  return profile.adders.reduce((sum, adder) => sum + adderCost(adder, { monthIdx, kWh, ecaMode, ecaFixedValue }), 0);
}

/**
 * Dollar cost of one non-TOU pricing type (tiered / flat-seasonal /
 * all-units-blocks) for a month's billed kWh. TOU pricing tracks its own
 * per-hour accumulation instead (bucket.touEnergyCost, or annualNettedMonth's
 * own period-by-period walk) and never reaches this function.
 */
function nonTouEnergyCost(monthlyKWh, schedule, isSummer) {
  const { pricing } = schedule;
  if (pricing.type === "tiered") return tieredEnergyCost(monthlyKWh, schedule, isSummer);
  if (pricing.type === "flat-seasonal") return monthlyKWh * (isSummer ? pricing.summerRate : pricing.winterRate);
  if (pricing.type === "all-units-blocks") return allUnitsBlocksEnergyCost(monthlyKWh, schedule, isSummer);
  throw new Error(`unknown pricing.type "${pricing.type}"`);
}

/**
 * Annual (kWh) netting for one month: nets import against export in kWh
 * before pricing, drawing down `carriedIn` (this year's running kWh credit
 * from earlier months) against the month's own excess import, and returns
 * the kWh credit left over to carry into next month.
 *
 * A non-TOU schedule treats the whole month as one bucket: billed kWh =
 * max(0, import - export - carriedIn); any of that left negative (export +
 * carriedIn outweighs import) becomes next month's carriedKWhCredit.
 *
 * A TOU schedule nets *within* each period rather than against the whole
 * month's total, per CONTRACTS.md -- a period's own export can only offset
 * that same period's own import, never a different period's. carriedIn is
 * drawn down against each period's own excess import in the order
 * schedule.pricing.periods declares them (first period first); a period
 * whose own export exceeds its own import contributes that excess to next
 * month's carry the same way the whole month does in the non-TOU case,
 * since it had no other period's import to offset within this month.
 */
function annualNettedMonth(schedule, bucket, carriedIn, isSummer) {
  if (schedule.pricing.type !== "tou") {
    const rawNet = bucket.importKWh - bucket.exportKWh - carriedIn;
    const billedKWhTotal = Math.max(0, rawNet);
    const carryOut = Math.max(0, -rawNet);
    const energy = nonTouEnergyCost(billedKWhTotal, schedule, isSummer);
    return { billedKWhTotal, energy, carryOut };
  }

  let creditRemaining = carriedIn;
  let leftoverExport = 0;
  let billedKWhTotal = 0;
  let energy = 0;
  // Carried kWh credits draw down against the most expensive period first,
  // not declaration order: two imports of the same profile that list their
  // periods in a different order must bill identically, and applying banked
  // credit at the highest marginal rate matches how a netted kWh actually
  // displaces cost.
  const byRateDesc = schedule.pricing.periods
    .map((period, i) => ({ period, i, rate: isSummer ? period.rate.summer : period.rate.winter }))
    .sort((a, b) => b.rate - a.rate);
  for (const { period, i, rate } of byRateDesc) {
    const rawPeriodNet = bucket.periodImportKWh[i] - bucket.periodExportKWh[i];
    const periodOwnBilled = Math.max(0, rawPeriodNet);
    leftoverExport += Math.max(0, -rawPeriodNet);
    const consumed = Math.min(creditRemaining, periodOwnBilled);
    const periodBilledKWh = periodOwnBilled - consumed;
    creditRemaining -= consumed;
    billedKWhTotal += periodBilledKWh;
    energy += periodBilledKWh * rate;
  }
  return { billedKWhTotal, energy, carryOut: creditRemaining + leftoverExport };
}

/** Monthly system-size charge: sum of schedule.systemSizeCharges, each basis's size read off `systemSizes` (default 0). 0 when the schedule declares none. */
function systemSizeChargeForMonth(schedule, systemSizes) {
  if (!schedule.systemSizeCharges) return 0;
  const sizes = systemSizes || {};
  return schedule.systemSizeCharges.reduce((sum, charge) => {
    const size = charge.basis === "kW-DC-solar" ? sizes.kwDCSolar || 0 : sizes.kwhBattery || 0;
    return sum + size * charge.ratePerMonth;
  }, 0);
}

/**
 * @param {Object} args
 * @param {number[]} args.gridImport length-8760 kWh per hour
 * @param {number[]} args.gridExport length-8760 kWh per hour
 * @param {import('./tariffs/profile.js').Schedule} args.schedule
 * @param {import('./tariffs/profile.js').UtilityProfile} args.profile
 * @param {Object} args.options
 * @param {'trailingAverage'|'fixed'} [args.options.ecaMode]
 * @param {number} [args.options.ecaFixedValue]
 * @param {boolean} [args.options.addersOnExports]
 * @param {string[]} [args.options.riderIds]
 * @param {number} [args.options.openingLedger] $ export-credit ledger balance carried in from the prior year, default 0
 * @param {number} [args.options.openingKwhLedger] annual-netting kWh credit ledger carried in, default 0 (see this file's header; always reads back 0 today)
 * @param {{kwDCSolar?:number, kwhBattery?:number}} [args.options.systemSizes] sizes schedule.systemSizeCharges bills against, default 0s
 */
export function priceYear({ gridImport, gridExport, schedule, profile, options = {} }) {
  if (gridImport.length !== HOURS_PER_YEAR || gridExport.length !== HOURS_PER_YEAR) {
    throw new Error(`gridImport and gridExport must each have ${HOURS_PER_YEAR} hours`);
  }
  const exportPolicy = profile.exportPolicy;
  if (exportPolicy.type !== "avoidedCostCredit" && exportPolicy.type !== "netMetering") {
    throw new Error(`priceYear only implements the avoidedCostCredit and netMetering export policies, got "${exportPolicy.type}"`);
  }
  const isNetMetering = exportPolicy.type === "netMetering";
  if (isNetMetering && exportPolicy.netting !== "hourly" && exportPolicy.netting !== "annual") {
    throw new Error(`netMetering exportPolicy.netting must be "hourly" or "annual", got "${exportPolicy.netting}"`);
  }
  const isAnnualNetting = isNetMetering && exportPolicy.netting === "annual";
  const isHourlyNetting = isNetMetering && exportPolicy.netting === "hourly";
  // avoidedCostCredit and hourly netMetering both earn a $ credit per
  // exporting hour, resolved from the same kind of ExportRate value
  // (ratePerKWh vs. exportRate); annual netting earns no per-hour $ credit
  // at all during the year (see this file's header).
  const isHourlyCredited = exportPolicy.type === "avoidedCostCredit" || isHourlyNetting;
  const hourlyExportRateSetting = exportPolicy.type === "avoidedCostCredit" ? exportPolicy.ratePerKWh : exportPolicy.exportRate;
  // See this file's header for why this one combination can't be priced by
  // summing resolveExportRate's per-hour result the way every other
  // ExportRate kind/pricing combination can.
  const isAllUnitsBlocksRetailLike =
    schedule.pricing.type === "all-units-blocks" &&
    (hourlyExportRateSetting === "retail" ||
      (hourlyExportRateSetting != null && typeof hourlyExportRateSetting === "object" && hourlyExportRateSetting.kind === "percentOfRetail"));

  const ecaMode = options.ecaMode || "trailingAverage";
  const riderIds = options.riderIds || [];
  const isTou = schedule.pricing.type === "tou";
  const periodCount = isTou ? schedule.pricing.periods.length : 0;
  const minimumBillPerMonth = schedule.minimumBillPerMonth || 0;
  const systemCharge = systemSizeChargeForMonth(schedule, options.systemSizes);

  const months = Array.from({ length: 12 }, () => emptyMonth(periodCount));

  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const ctx = hourContext(h);
    const m = months[ctx.monthIdx];
    const importKW = gridImport[h];
    const exportKW = gridExport[h];
    m.importKWh += importKW;
    m.exportKWh += exportKW;
    m.cumulativeImportKWh += importKW;

    let periodIdx = -1;
    if (isTou) {
      periodIdx = schedule.pricing.periods.findIndex((p) => p.applies(ctx));
      if (periodIdx === -1) {
        throw new Error(`no TOU period on schedule "${schedule.id}" matches hour ${h}`);
      }
      m.periodImportKWh[periodIdx] += importKW;
      m.periodExportKWh[periodIdx] += exportKW;
      if (!isAnnualNetting) {
        const period = schedule.pricing.periods[periodIdx];
        m.touEnergyCost += importKW * (ctx.isSummer ? period.rate.summer : period.rate.winter);
      }
    }

    if (isHourlyCredited && exportKW > 0) {
      const rate = resolveExportRate(hourlyExportRateSetting, schedule, ctx, m.cumulativeImportKWh);
      m.hourlyExportCredit += exportKW * rate;
    }

    if (schedule.demand) {
      const period = demandPeriodFor(schedule, ctx);
      if (period === "peak") {
        m.peakPeriodPeakKW = Math.max(m.peakPeriodPeakKW, importKW);
      } else {
        m.standardPeakKW = Math.max(m.standardPeakKW, importKW);
      }
    }
  }

  let ledger = options.openingLedger || 0;
  let kwhLedger = options.openingKwhLedger || 0;
  const monthly = [];

  for (let m = 0; m < 12; m++) {
    const bucket = months[m];
    const isSummer = isLeuSummer(m);

    const fixed = schedule.fixedChargePerMonth;

    let energy;
    let adderBaseKWh;
    let trueUpDollarCredit = 0;

    if (isAnnualNetting) {
      const netting = annualNettedMonth(schedule, bucket, kwhLedger, isSummer);
      energy = netting.energy;
      adderBaseKWh = netting.billedKWhTotal;
      kwhLedger = netting.carryOut;

      if (m === 11) {
        // Year-end true-up (see this file's header): exportPolicy.trueUp, if
        // present, is authoritative ({rate} cashes out, 'forfeit' drops it).
        // Absent trueUp falls back to the pre-existing rule for backward
        // compatibility: a numeric exportRate cashes out at that same rate;
        // anything else forfeits. Either way the kWh ledger itself never
        // survives past December.
        const trueUp = exportPolicy.trueUp;
        if (trueUp != null) {
          if (trueUp !== "forfeit" && typeof trueUp.rate === "number") {
            trueUpDollarCredit = kwhLedger * trueUp.rate;
          }
        } else if (typeof exportPolicy.exportRate === "number") {
          trueUpDollarCredit = kwhLedger * exportPolicy.exportRate;
        }
        kwhLedger = 0;
      }
    } else {
      energy = isTou ? bucket.touEnergyCost : nonTouEnergyCost(bucket.importKWh, schedule, isSummer);
      adderBaseKWh = bucket.importKWh;
    }

    const adders = addersOverKWh(profile, m, adderBaseKWh, ecaMode, options.ecaFixedValue);
    const demand = demandForMonth(schedule, bucket, isSummer);

    const preRiderSubtotal = fixed + energy + adders + demand + systemCharge;
    const riderDiscount = preRiderSubtotal * ridersTotalPercentOff(profile.riders, riderIds);
    // ridersTotalPercentOff caps its return at 1, but this stays as a backstop
    // so a subtotal can never go negative from riders no matter how that
    // function is called.
    const subtotal = Math.max(0, preRiderSubtotal - riderDiscount);

    let creditEarned = 0;
    if (isHourlyCredited) {
      const exportAddersCost = options.addersOnExports ? addersOverKWh(profile, m, bucket.exportKWh, ecaMode, options.ecaFixedValue) : 0;
      // isAllUnitsBlocksRetailLike: bucket.hourlyExportCredit was accumulated
      // hour-by-hour against a moving, mid-month cumulativeImportKWh, which
      // this pricing type's non-marginal, whole-month-at-one-rate billing
      // makes the wrong figure (see this file's header) -- recompute the
      // credit here instead, now that the month's own final importKWh (the
      // same total energy() above was just billed against) is known.
      const grossExportCredit =
        isAllUnitsBlocksRetailLike && bucket.exportKWh > 0
          ? bucket.exportKWh * resolveExportRate(hourlyExportRateSetting, schedule, { isSummer, monthIdx: m }, bucket.importKWh)
          : bucket.hourlyExportCredit;
      creditEarned = grossExportCredit - exportAddersCost;
    } else if (isAnnualNetting) {
      creditEarned = trueUpDollarCredit;
    }

    ledger += creditEarned;
    // The floor applies AFTER riders and AFTER export-credit offset: cap how
    // much of the ledger this month is allowed to draw down to (subtotal -
    // minimumBillPerMonth), so credit that would push the bill below the
    // floor is left unspent in the ledger rather than drawn out and then
    // wasted against the floor.
    const maxCreditThisMonth = Math.max(0, subtotal - minimumBillPerMonth);
    const exportCredit = ledger > 0 ? Math.min(ledger, maxCreditThisMonth) : 0;
    ledger -= exportCredit;

    const total = Math.max(minimumBillPerMonth, subtotal - exportCredit);

    monthly.push({ fixed, energy, adders, demand, systemCharge, riderDiscount, exportCredit, total });
  }

  const annualTotal = monthly.reduce((sum, mo) => sum + mo.total, 0);

  return { monthly, annualTotal, exportLedgerEndBalance: ledger, kwhLedgerEndBalance: kwhLedger };
}

function demandForMonth(schedule, bucket, isSummer) {
  if (!schedule.demand) return 0;
  const season = isSummer ? "summer" : "winter";
  const standard = bucket.standardPeakKW * schedule.demand.ratePerKW[season];
  const peak = schedule.demand.peakRatePerKW ? bucket.peakPeriodPeakKW * schedule.demand.peakRatePerKW[season] : 0;
  return standard + peak;
}
