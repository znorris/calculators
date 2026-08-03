// Multi-year simulation: builds hourly load and production, dispatches a
// battery, and prices the result year by year for a baseline (no system) and
// each candidate config.
//
// This module owns the shape of `configs`/`household`/`totals` beyond what
// CONTRACTS.md pins for simulateComparison's outer signature and ConfigResult
// -- those are documented in the typedefs below.
//
// @typedef {Object} SolarArrayInput
// @property {number} kwDC
// @property {number} tilt
// @property {number} azimuth
// @property {number} [inverterEff]
// @property {number} [lossFrac]
// @property {number} [degradationRate]
//
// @typedef {Object} WindTurbineInput
// @property {Array<{ms:number, kw:number}>} powerCurve
// @property {number} [hubHeightM]
// @property {number} annualMeanWindMS
//
// @typedef {Object} BatteryInput
// @property {number} usableKWh nameplate usable capacity, year 0
// @property {number} chargeEff
// @property {number} dischargeEff
// @property {number} maxChargeKW
// @property {number} maxDischargeKW
// @property {number} reserveFrac
// @property {number} [cycleLife] equivalent full cycles to 70% capacity; omitted means that channel never limits life
// @property {number} [calendarLifeYears] age in years to 70% capacity; omitted means that channel never limits life
// (omitting both means the battery never degrades: year 0 and every later year run at full nameplate capacity)
// @property {{enabled:boolean, windowStartHour:number, windowEndHour:number, targetSocFrac:number}} [gridCharge]
// passed straight through to dispatchBattery; omitted or `enabled:false` is byte-identical to no grid charging.
//
// @typedef {Object} Config
// @property {string} configId
// @property {{arrays:SolarArrayInput[]}} [solar]
// @property {{turbines:WindTurbineInput[]}} [wind]
// @property {BatteryInput} [battery]
// @property {{mode:'self-consumption'|'peak-shave', shaveThresholdKW?:number}} [dispatch]
//
// @typedef {Object} Household
// @property {string} schedule Schedule.id to bill the base (or only) meter on
// @property {string[]} riderIds
// @property {Object} load loadHourly() args: mode, annualKWh, monthlyKWh, hourlyKWh, profileId, ev
// @property {boolean} [evRider] true if the household's EV slice has LEU's separate EV-rider meter
// @property {{ecaFixedValue?:number}} [billingOptions]

import { HOURS_PER_YEAR, monthOfHour, isLeuSummer } from "./time.js";
import { solarHourly } from "./solar.js";
import { windHourly } from "./wind.js";
import { loadHourly } from "./load.js";
import { dispatchBattery } from "./battery.js";
import { priceYear } from "./billing.js";

const BATTERY_END_OF_LIFE_FRACTION = 0.7;

/**
 * Floor for how many years a payback search gets to run, independent of the
 * user's chosen ownership horizon. A short horizon (e.g. 10 years) must not
 * truncate the search for when a config actually recovers its cost -- that
 * would report "never pays back" for a system that pays back in year 13,
 * which is a real payback the user just won't be the owner for anymore.
 */
export const PAYBACK_SEARCH_YEARS = 40;

function zeros() {
  return new Array(HOURS_PER_YEAR).fill(0);
}

function addSeries(a, b) {
  const out = new Array(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) out[h] = a[h] + b[h];
  return out;
}

function subtractSeries(a, b) {
  const out = new Array(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) out[h] = a[h] - b[h];
  return out;
}

function sum(series) {
  let total = 0;
  for (let h = 0; h < series.length; h++) total += series[h];
  return total;
}

/** Total system production (solar + wind) for one calendar year of the horizon. */
function productionForYear(config, year) {
  const solar = solarHourly({ arrays: config.solar?.arrays || [], year });
  const wind = windHourly({ turbines: config.wind?.turbines || [], year });
  return addSeries(solar, wind);
}

/** Scales an all-units-blocks pricing's block rates by `factor`, leaving upToKWh boundaries (kWh thresholds, not dollars) untouched; handles both the flat-array and seasonal {summer,winter} block shapes. */
function escalateBlocks(blocks, factor) {
  const scale = (arr) => arr.map((b) => ({ ...b, rate: b.rate * factor }));
  return Array.isArray(blocks) ? scale(blocks) : { summer: scale(blocks.summer), winter: scale(blocks.winter) };
}

/**
 * Scales a Schedule's energy rates, fixed charge, demand rates,
 * minimumBillPerMonth, and systemSizeCharges rates by `factor`
 * ((1+retailEscalation)^year), leaving tiered/all-units-blocks kWh
 * boundaries (thresholds, not dollars) untouched. LEU's G2 demand charge,
 * and every other dollar figure here, escalates alongside energy rates and
 * the fixed charge because nothing about a capacity/demand charge, a minimum
 * bill floor, or a system-size charge is exempt from the same retail rate
 * inflation that drives the rest of the bill.
 */
function escalateSchedule(schedule, factor) {
  const { pricing } = schedule;
  let escalatedPricing;
  if (pricing.type === "tiered") {
    escalatedPricing = { ...pricing, rates: pricing.rates.map((r) => r * factor) };
  } else if (pricing.type === "flat-seasonal") {
    escalatedPricing = { ...pricing, summerRate: pricing.summerRate * factor, winterRate: pricing.winterRate * factor };
  } else if (pricing.type === "tou") {
    escalatedPricing = {
      ...pricing,
      periods: pricing.periods.map((p) => ({
        ...p,
        rate: { summer: p.rate.summer * factor, winter: p.rate.winter * factor },
      })),
    };
  } else if (pricing.type === "all-units-blocks") {
    escalatedPricing = { ...pricing, blocks: escalateBlocks(pricing.blocks, factor) };
  } else {
    throw new Error(`escalateSchedule does not support pricing.type "${pricing.type}"`);
  }
  const escalatedDemand = schedule.demand && {
    ...schedule.demand,
    ratePerKW: { summer: schedule.demand.ratePerKW.summer * factor, winter: schedule.demand.ratePerKW.winter * factor },
    peakRatePerKW: schedule.demand.peakRatePerKW && {
      summer: schedule.demand.peakRatePerKW.summer * factor,
      winter: schedule.demand.peakRatePerKW.winter * factor,
    },
  };
  return {
    ...schedule,
    fixedChargePerMonth: schedule.fixedChargePerMonth * factor,
    pricing: escalatedPricing,
    demand: escalatedDemand,
    ...(schedule.minimumBillPerMonth != null ? { minimumBillPerMonth: schedule.minimumBillPerMonth * factor } : {}),
    ...(schedule.systemSizeCharges ? { systemSizeCharges: schedule.systemSizeCharges.map((c) => ({ ...c, ratePerMonth: c.ratePerMonth * factor })) } : {}),
  };
}

/**
 * Scales a profile's adders (LEU's ECA and state energy tax) by the same
 * `factor` ((1+retailEscalation)^year) as the schedule. ECA tracks LEU's
 * wholesale power costs, which inflate over time roughly like retail rates
 * do, so freezing it in year-0 dollars would understate every out-year bill.
 */
function escalateAdders(adders, factor) {
  return adders.map((adder) => {
    if (adder.mode === "fixed") return { ...adder, valuePerKWh: adder.valuePerKWh * factor };
    if (adder.mode === "monthlyTable") return { ...adder, monthlyValues: adder.monthlyValues.map((v) => v * factor) };
    return adder;
  });
}

/**
 * Escalation factor for one year of an export policy's own ExportRate
 * figure(s), honoring an optional vintage lock (exportPolicy.lockYears).
 * Without a lock this is just (1+exportTrend)^year, the same shape
 * escalateSchedule's retail-rate factor takes. With a lock, the rate is
 * frozen at its year-0 value (factor 1) for years 0 through lockYears-1
 * (lockYears total frozen years), and starts following exportTrend from
 * year lockYears onward -- with its own escalation clock restarting at 1
 * there (year lockYears is factor (1+exportTrend)^1, year lockYears+1 is
 * (1+exportTrend)^2, and so on), not a jump straight to
 * (1+exportTrend)^lockYears. This models a utility that fixes a customer's
 * export rate for a stated vintage period before it starts moving again,
 * e.g. AZ/NV net-metering successor tariffs that lock an export rate for
 * 10 years from interconnection.
 */
function exportEscalationFactor(exportPolicy, year, exportTrend) {
  const lockYears = exportPolicy.lockYears;
  if (lockYears != null && lockYears > 0) {
    if (year < lockYears) return 1;
    return Math.pow(1 + exportTrend, year - lockYears + 1);
  }
  return Math.pow(1 + exportTrend, year);
}

/**
 * Scales one ExportRate value (tariffs/profile.js's typedef) by `factor`:
 * a flat number, or every rate inside a monthlyTable/timeTable, scales
 * directly. 'retail' is left untouched -- it reads a rate off the
 * (separately retail-escalated) schedule at billing time instead of
 * carrying a rate of its own, so it already follows retailEscalation rather
 * than exportTrend. percentOfRetail's fraction is also left untouched for
 * the identical reason: it is a fraction OF the schedule's retail rate, not
 * a dollar figure of its own, so it inherits retailEscalation the same way
 * 'retail' does rather than being scaled a second time by exportTrend.
 */
function escalateExportRate(exportRate, factor) {
  if (typeof exportRate === "number") return exportRate * factor;
  if (!exportRate || typeof exportRate !== "object") return exportRate; // 'retail', or absent
  if (exportRate.kind === "monthlyTable") return { ...exportRate, monthlyValues: exportRate.monthlyValues.map((v) => v * factor) };
  if (exportRate.kind === "timeTable") {
    return {
      ...exportRate,
      periods: exportRate.periods.map((p) => ({ ...p, rate: { summer: p.rate.summer * factor, winter: p.rate.winter * factor } })),
    };
  }
  return exportRate; // percentOfRetail
}

/**
 * Scales the export policy's own $/kWh figure(s) by `factor`
 * (exportEscalationFactor's output, which already accounts for lockYears):
 * avoidedCostCredit's ratePerKWh, or netMetering's exportRate -- both an
 * ExportRate, scaled by escalateExportRate above -- plus exportPolicy.trueUp
 * when it names an explicit { rate }, since that rate is the identical kind
 * of $/kWh figure and should inflate the same way (a 'forfeit' trueUp has no
 * rate to scale).
 */
function escalateExportPolicy(exportPolicy, factor) {
  const escalated = { ...exportPolicy };
  if (exportPolicy.type === "avoidedCostCredit") {
    escalated.ratePerKWh = escalateExportRate(exportPolicy.ratePerKWh, factor);
  } else if (exportPolicy.type === "netMetering") {
    escalated.exportRate = escalateExportRate(exportPolicy.exportRate, factor);
  }
  if (exportPolicy.trueUp && exportPolicy.trueUp !== "forfeit") {
    escalated.trueUp = { ...exportPolicy.trueUp, rate: exportPolicy.trueUp.rate * factor };
  }
  return escalated;
}

function findSchedule(profile, scheduleId) {
  const schedule = profile.schedules.find((s) => s.id === scheduleId);
  if (!schedule) throw new Error(`profile "${profile.id}" has no schedule with id "${scheduleId}"`);
  return schedule;
}

/**
 * Whether the household's EV load is billed on LEU's separate EV-rider
 * meter. Per CONTRACTS.md, that meter exists only alongside schedule EA;
 * solar/battery never see the EV series in that case, because the rider is a
 * physically separate meter LEU installs downstream of its own connection,
 * not a virtual sub-account of the EA meter.
 */
function evRiderApplies(household) {
  return household.schedule === "EA" && !!household.evRider;
}

/**
 * Estimates the calendar year at which a battery's usable capacity reaches
 * BATTERY_END_OF_LIFE_FRACTION (70%) of nameplate, from whichever of
 * cycle life or calendar life is reached first.
 *
 * Equivalent full cycles are only known from actually dispatching a year, so
 * this runs one probe dispatch at nameplate capacity against the config's
 * year-0 production and battery-facing load to get a representative annual
 * cycle count, then assumes that rate holds for every year of the horizon.
 * This is an approximation: a battery that is already degraded cycles
 * somewhat differently (smaller swings hit the reserve floor sooner), but
 * there is no way to know a year's actual cycle count without already
 * knowing that year's capacity, so re-deriving the rate every year would
 * require an iterative fixed point this module does not attempt.
 */
function estimateEndOfLifeYear(battery, dispatchMode, shaveThresholdKW, probeNet) {
  const probe = dispatchBattery({
    net: probeNet,
    battery,
    mode: dispatchMode,
    shaveThresholdKW,
  });
  const cyclesPerYear = probe.equivalentFullCycles;

  const cycleLifeYears = battery.cycleLife && cyclesPerYear > 0 ? battery.cycleLife / cyclesPerYear : Infinity;
  const calendarLifeYears = battery.calendarLifeYears ?? Infinity;
  return Math.min(cycleLifeYears, calendarLifeYears);
}

/**
 * Nameplate-fraction remaining at `year`, linearly interpolating to 70% at
 * `endOfLifeYear`.
 *
 * A non-finite endOfLifeYear means the battery is missing both cycleLife and
 * calendarLifeYears, i.e. there is no degradation channel to derive a curve
 * from at all -- that is "no data," not "already at end of life," so it
 * returns 1 (full nameplate capacity) for every year rather than jumping to
 * the 70% floor.
 */
function capacityFraction(year, endOfLifeYear) {
  if (!isFinite(endOfLifeYear)) return 1;
  if (endOfLifeYear <= 0) return BATTERY_END_OF_LIFE_FRACTION;
  if (year >= endOfLifeYear) return BATTERY_END_OF_LIFE_FRACTION;
  return 1 - (1 - BATTERY_END_OF_LIFE_FRACTION) * (year / endOfLifeYear);
}

/** Hour index (0-8759) where day-of-year `d` (0-364) begins. */
function dayStartHour(d) {
  return d * 24;
}

/** Day of year (0-364) in the reference calendar whose 24-hour production total is the season's median. */
function medianProductionDay(productionYear0, seasonPredicate) {
  const days = [];
  for (let d = 0; d < 365; d++) {
    const monthIdx = monthOfHour(dayStartHour(d));
    if (!seasonPredicate(monthIdx)) continue;
    let total = 0;
    const start = dayStartHour(d);
    for (let h = 0; h < 24; h++) total += productionYear0[start + h];
    days.push({ d, total });
  }
  days.sort((a, b) => a.total - b.total);
  // For a season with an even day count there is no single middle day; the
  // lower of the two middle days is used so the result is always an actual
  // calendar day rather than an average of two.
  const medianIdx = Math.floor((days.length - 1) / 2);
  return days[medianIdx].d;
}

/**
 * One representative day's hourly flows, sliced from full-year series.
 *
 * `production`/`load`/`gridImport`/`gridExport` are the whole household's
 * (both meters combined, when the EV rider applies); `batteryFlow` is
 * derived as production - load - gridExport + gridImport for the meter the
 * battery actually sees (only the base meter when the EV rider applies), so
 * it is 0 for every hour of a config with no battery or for the EV meter's
 * own hours. Positive batteryFlow is AC-side charging input; negative is
 * AC-side discharge delivered.
 */
function buildDayFlows(d, production, load, gridImport, gridExport, batteryNet, batteryGridImport, batteryGridExport) {
  const start = dayStartHour(d);
  const slice = (series) => series.slice(start, start + 24);

  const productionDay = slice(production);
  const loadDay = slice(load);
  const gridImportDay = slice(gridImport);
  const gridExportDay = slice(gridExport);
  const batteryFlow = new Array(24);
  for (let h = 0; h < 24; h++) {
    batteryFlow[h] = batteryNet[start + h] - batteryGridExport[start + h] + batteryGridImport[start + h];
  }

  return { production: productionDay, load: loadDay, batteryFlow, gridImport: gridImportDay, gridExport: gridExportDay };
}

/**
 * Simulates one config (or the implicit no-system baseline when `config` has
 * no solar/wind/battery) across the full analysis window -- max(horizonYears,
 * PAYBACK_SEARCH_YEARS) -- so a payback landing after the ownership horizon
 * is still visible in `years` and computable, rather than being cut off at
 * the same boundary that scopes the horizon-only financial summaries.
 */
function simulateConfig({ config, household, loadBase, loadEv, profile, assumptions }) {
  const horizonYears = assumptions.horizonYears ?? 25;
  const analysisYears = Math.max(horizonYears, PAYBACK_SEARCH_YEARS);
  const retailEscalation = assumptions.retailEscalation ?? 0;
  const exportTrend = assumptions.exportTrend ?? 0;
  const ecaMode = assumptions.ecaMode;
  const addersOnExports = !!assumptions.addersOnExports;

  const meterEv = evRiderApplies(household);
  const combinedLoad = meterEv ? null : addSeries(loadBase, loadEv);
  const batteryFacingLoad = meterEv ? loadBase : combinedLoad;
  const totalLoadKWh = sum(loadBase) + sum(loadEv);

  const baseSchedule = findSchedule(profile, household.schedule);
  const evSchedule = meterEv ? findSchedule(profile, "EV") : null;

  // The config's actual nameplate sizes, for schedule.systemSizeCharges
  // (calc/billing.js). Fixed for the config's whole life -- a system's
  // physical size doesn't change year to year the way its battery's usable
  // capacity degrades, so this is computed once rather than per year. Billed
  // on the BASE meter's priceYear call only, below -- never the EV rider
  // meter's, even when meterEv is true: a household's solar/battery
  // nameplate size is one physical fact about the property, not something a
  // second, separately-metered EV rider schedule should charge for again if
  // it happens to declare its own systemSizeCharges too. A schedule with no
  // systemSizeCharges reads this as 0 regardless.
  const systemSizes = {
    kwDCSolar: (config.solar?.arrays || []).reduce((sum, a) => sum + (a.kwDC || 0), 0),
    kwhBattery: config.battery?.usableKWh || 0,
  };

  let endOfLifeYear = Infinity;
  if (config.battery) {
    const productionYear0 = productionForYear(config, 0);
    const probeNet = subtractSeries(productionYear0, batteryFacingLoad);
    endOfLifeYear = estimateEndOfLifeYear(
      config.battery,
      config.dispatch?.mode || "self-consumption",
      config.dispatch?.shaveThresholdKW,
      probeNet,
    );
  }

  const years = [];
  let year0 = null; // retained for representativeDays, computed at full nameplate capacity

  // Export credit ledgers carry their Dec 31 balance into the next year's Jan
  // 1 rather than resetting to $0 -- one $ ledger per meter, since the base
  // meter and the EV rider meter (when it applies) bank credit separately.
  // baseKwhLedger/evKwhLedger thread calc/billing.js's kWh-credit ledger the
  // same way, per meter, for the same reason the $ ledger is threaded
  // per-meter rather than kept as one shared value -- see priceYear's header
  // for why this is a no-op today (the kWh ledger never survives past
  // December's true-up) but is still wired through for both ledgers alike.
  let baseLedger = 0;
  let evLedger = 0;
  let baseKwhLedger = 0;
  let evKwhLedger = 0;

  for (let year = 0; year < analysisYears; year++) {
    const production = productionForYear(config, year);
    const net = subtractSeries(production, batteryFacingLoad);

    const battery = config.battery
      ? { ...config.battery, usableKWh: config.battery.usableKWh * capacityFraction(year, endOfLifeYear) }
      : null;

    const {
      gridImport: baseImport,
      gridExport: baseExport,
      equivalentFullCycles,
      gridChargeKWh,
    } = dispatchBattery({
      net,
      battery,
      mode: config.dispatch?.mode || "self-consumption",
      shaveThresholdKW: config.dispatch?.shaveThresholdKW,
    });

    const escalationFactor = Math.pow(1 + retailEscalation, year);
    const exportFactor = exportEscalationFactor(profile.exportPolicy, year, exportTrend);
    const escalatedProfile = {
      ...profile,
      adders: escalateAdders(profile.adders, escalationFactor),
      exportPolicy: escalateExportPolicy(profile.exportPolicy, exportFactor),
    };
    // systemSizes is deliberately NOT part of the options every meter shares
    // below: it is only ever passed to the base meter's priceYear call. A
    // config's nameplate solar/battery size is billed once, on the property's
    // base meter, never a second time on the EV rider meter too -- see this
    // file's header/CONTRACTS.md for the two-schedule rationale.
    const billingOptions = {
      ecaMode,
      ecaFixedValue: household.billingOptions?.ecaFixedValue,
      addersOnExports,
      riderIds: household.riderIds || [],
    };

    const basePricing = priceYear({
      gridImport: baseImport,
      gridExport: baseExport,
      schedule: escalateSchedule(baseSchedule, escalationFactor),
      profile: escalatedProfile,
      options: { ...billingOptions, systemSizes, openingLedger: baseLedger, openingKwhLedger: baseKwhLedger },
    });
    baseLedger = basePricing.exportLedgerEndBalance;
    baseKwhLedger = basePricing.kwhLedgerEndBalance;

    let billTotal = basePricing.annualTotal;
    let totalImport = sum(baseImport);
    const totalExport = sum(baseExport);

    let evImport = null;
    let evExport = null;
    if (meterEv) {
      evImport = loadEv;
      evExport = zeros();
      const evPricing = priceYear({
        gridImport: evImport,
        gridExport: evExport,
        schedule: escalateSchedule(evSchedule, escalationFactor),
        profile: escalatedProfile,
        options: { ...billingOptions, openingLedger: evLedger, openingKwhLedger: evKwhLedger },
      });
      evLedger = evPricing.exportLedgerEndBalance;
      evKwhLedger = evPricing.kwhLedgerEndBalance;
      billTotal += evPricing.annualTotal;
      totalImport += sum(evImport);
    }

    const productionKWh = sum(production);
    const exportKWh = totalExport;
    // Energy that actually served on-site load: total household load minus
    // what was drawn from the grid. Unlike productionKWh - exportKWh, this
    // excludes battery round-trip losses and whatever charge is still sitting
    // in the pack at year end -- neither of those reached the load, so
    // neither should be booked (or monetized downstream) as self-consumed.
    const selfConsumedKWh = totalLoadKWh - totalImport;

    years.push({
      billTotal,
      productionKWh,
      selfConsumedKWh,
      exportKWh,
      importKWh: totalImport,
      cycles: equivalentFullCycles,
      gridChargeKWh,
    });

    if (year === 0) {
      year0 = {
        production,
        gridImport: meterEv ? addSeries(baseImport, evImport) : baseImport,
        gridExport: baseExport, // the EV meter never exports
        batteryNet: net,
        batteryGridImport: baseImport,
        batteryGridExport: baseExport,
        load: meterEv ? addSeries(loadBase, loadEv) : combinedLoad,
      };
    }
  }

  const summerDay = medianProductionDay(year0.production, isLeuSummer);
  const winterDay = medianProductionDay(year0.production, (m) => !isLeuSummer(m));

  const representativeDays = {
    summer: buildDayFlows(
      summerDay,
      year0.production,
      year0.load,
      year0.gridImport,
      year0.gridExport,
      year0.batteryNet,
      year0.batteryGridImport,
      year0.batteryGridExport,
    ),
    winter: buildDayFlows(
      winterDay,
      year0.production,
      year0.load,
      year0.gridImport,
      year0.gridExport,
      year0.batteryNet,
      year0.batteryGridImport,
      year0.batteryGridExport,
    ),
  };

  // Scoped to horizonYears, not the full analysis window: totals answer "over
  // my ownership window," the same lens NPV/IRR/lifetimeSavings/
  // effectiveCostPerKWh use in calc/finance.js, so a payback-search year past
  // the horizon never dilutes (or inflates) a headline total the user did not
  // actually own the system for.
  const totals = years.slice(0, horizonYears).reduce(
    (acc, y) => ({
      billTotal: acc.billTotal + y.billTotal,
      productionKWh: acc.productionKWh + y.productionKWh,
      selfConsumedKWh: acc.selfConsumedKWh + y.selfConsumedKWh,
      exportKWh: acc.exportKWh + y.exportKWh,
      importKWh: acc.importKWh + y.importKWh,
      cycles: acc.cycles + y.cycles,
      gridChargeKWh: acc.gridChargeKWh + y.gridChargeKWh,
    }),
    { billTotal: 0, productionKWh: 0, selfConsumedKWh: 0, exportKWh: 0, importKWh: 0, cycles: 0, gridChargeKWh: 0 },
  );

  return { configId: config.configId ?? "baseline", years, horizonYears, representativeDays, totals };
}

/**
 * @param {Object} args
 * @param {Config[]} args.configs
 * @param {Household} args.household
 * @param {import('./tariffs/profile.js').UtilityProfile} args.profile
 * @param {{horizonYears?:number, retailEscalation?:number, exportTrend?:number, ecaMode?:string, addersOnExports?:boolean}} args.assumptions
 *
 * Each returned ConfigResult's `years` runs to
 * max(horizonYears, PAYBACK_SEARCH_YEARS) -- longer than the ownership
 * horizon whenever the horizon is short -- so a payback or a replacement
 * event landing after the horizon is still visible; `horizonYears` on the
 * result marks where the ownership window itself ends within that array,
 * and `totals` is summed over only that many years.
 */
export function simulateComparison({ configs, household, profile, assumptions }) {
  const { base: loadBase, ev: loadEv } = loadHourly(household.load);

  const baseline = simulateConfig({ config: {}, household, loadBase, loadEv, profile, assumptions });
  const results = (configs || []).map((config) =>
    simulateConfig({ config, household, loadBase, loadEv, profile, assumptions }),
  );

  return { baseline, results };
}
