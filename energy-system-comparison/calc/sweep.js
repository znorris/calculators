// The sizing explorer's grid generator and per-point engine runner. See
// CONTRACTS.md's "calc/sweep.js" section for the full contract; this module
// is the broad first-pass scan a user runs before building configs by hand
// in the detailed editor (components/ConfigEditor.jsx).
//
// Pure ESM like every other calc/ module: no React, no I/O, no Date.now().
// It cannot import model/schema.js (model/ depends on calc/, never the
// reverse -- see model/runEngine.js's own imports), so the default equipment
// parameters below (solar tilt/azimuth, a turbine's default annual mean wind
// speed) are read straight from data/equipment-presets.json and data/wind.json,
// mirroring model/schema.js's newSolarArray/newTurbine/batteryFromPreset
// defaults rather than sharing an implementation with them.
//
// household/profile/assumptions passed into runSweep are the already-resolved
// engine shapes model/runEngine.js's resolveHousehold/toEngineAssumptions
// build -- this module does no tariff or schedule resolution of its own, so
// there is exactly one path (calc/simulate.js + calc/finance.js) that ever
// invokes the engine, shared by the detailed comparison and the sizing
// explorer alike.

import { simulateComparison } from "./simulate.js";
import { financeConfig } from "./finance.js";
import equipmentPresets from "../data/equipment-presets.json";
import windData from "../data/wind.json";

const WIND_TURBINE_PRESETS = windData.powerCurves.presets;
const SOLAR_DEFAULTS = equipmentPresets.solar;
const BATTERY_PRESETS = equipmentPresets.batteries;
const LFP_BATTERY_DEFAULTS = equipmentPresets.batteryDefaultsByChemistry.LFP;

export const SWEEP_SOLAR_STEP_KW = 1;
export const SWEEP_SOLAR_MAX_KW = 14;
export const SWEEP_BATTERY_STEP_KWH = 5;
export const SWEEP_BATTERY_MAX_KWH = 30;

/**
 * South-facing, 20-degree tilt: mirrors model/schema.js's newSolarArray()
 * defaults. Exported so components/ExplorerSection.jsx's "Pricing
 * assumptions" group can seed its own tilt/azimuth fields' defaults from
 * this one source rather than retyping 20/180 a second time -- the same
 * discipline as reading solarCostPerWatt's own default off
 * data/equipment-presets.json instead of a hardcoded number.
 */
export const SOLAR_TILT_DEG = 20;
export const SOLAR_AZIMUTH_DEG = 180;

/** Central Valley starting estimate; mirrors model/schema.js's DEFAULT_ANNUAL_MEAN_WIND_MS. */
const DEFAULT_ANNUAL_MEAN_WIND_MS = 4;

/** Mirrors model/schema.js's DEFAULT_BATTERY_RESERVE_FRAC: not a hardware spec, so no preset publishes it. */
const DEFAULT_BATTERY_RESERVE_FRAC = 0.1;

/** Mirrors model/schema.js's DEFAULT_DISPATCH / DEFAULT_GRID_CHARGE: a sweep point never explores dispatch mode or grid-charging as its own dimension. */
const SWEEP_DISPATCH = { mode: "self-consumption", shaveThresholdKW: null };
const SWEEP_GRID_CHARGE = { enabled: false, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 };

const BATTERY_MATCH_EPSILON = 0.01;

// --- Grid generation -------------------------------------------------------

function solarKWValues(enabled) {
  if (!enabled) return [0];
  const values = [];
  for (let kw = 0; kw <= SWEEP_SOLAR_MAX_KW; kw += SWEEP_SOLAR_STEP_KW) values.push(kw);
  return values;
}

function batteryKWhValues(enabled) {
  if (!enabled) return [0];
  const steps = [];
  for (let kwh = 0; kwh <= SWEEP_BATTERY_MAX_KWH; kwh += SWEEP_BATTERY_STEP_KWH) steps.push(kwh);
  const presetValues = BATTERY_PRESETS.map((b) => b.usableKWh);

  const seen = new Map(); // rounded-cents key -> first value seen at that key
  for (const v of [...steps, ...presetValues]) {
    const key = Math.round(v / BATTERY_MATCH_EPSILON);
    if (!seen.has(key)) seen.set(key, v);
  }
  return [...seen.values()].sort((a, b) => a - b);
}

function windPresetValues(tickedIds) {
  const valid = new Set(WIND_TURBINE_PRESETS.map((p) => p.id));
  const ticked = (tickedIds || []).filter((id) => valid.has(id));
  return [null, ...ticked];
}

/**
 * @param {Object} args
 * @param {{solar:boolean, battery:boolean, wind:string[]}} args.categories
 * @returns {Array<{solarKW:number, batteryKWh:number, windPresetId:string|null}>}
 */
export function generateSweepGrid({ categories }) {
  const solarValues = solarKWValues(!!categories?.solar);
  const batteryValues = batteryKWhValues(!!categories?.battery);
  const windValues = windPresetValues(categories?.wind);

  const points = [];
  for (const solarKW of solarValues) {
    for (const batteryKWh of batteryValues) {
      for (const windPresetId of windValues) {
        // Byte-identical to the no-system baseline -- carries no sizing
        // information of its own, regardless of which categories are on.
        if (solarKW === 0 && batteryKWh === 0 && windPresetId == null) continue;
        points.push({ solarKW, batteryKWh, windPresetId });
      }
    }
  }
  return points;
}

// --- Per-dimension spec + pricing -------------------------------------------

/**
 * Every pricing/hardware default this module would otherwise read straight
 * off data/equipment-presets.json, overridable by the sizing explorer's own
 * "Pricing assumptions" group (components/ExplorerSection.jsx). Every field
 * is optional; an absent `pricingAssumptions` argument (or an absent
 * individual field within one) reproduces today's behavior exactly -- this
 * is the backward-compatibility contract every existing call site (and every
 * existing test in calc/__tests__/sweep.test.js) relies on, since none of
 * them pass this argument at all.
 * @typedef {Object} SweepPricingAssumptions
 * @property {number} [solarCostPerWatt] $/W-DC installed, before incentives; defaults to equipment-presets.json's solar.costPerWattInstalled.value
 * @property {number} [batteryCostPerKWh] flat $/kWh installed, applied to EVERY point's battery size instead of today's catalog-based pricing (an exact preset match's own installedCostUSD, or interpolatedBatteryCostPerKWh for a non-preset size); omitted/null keeps that catalog-based pricing
 * @property {number} [windCostPerKW] $/kW installed; defaults to equipment-presets.json's wind.costPerKWInstalled.value
 * @property {number} [solarTiltDeg] array tilt in degrees; defaults to 20 (SOLAR_TILT_DEG)
 * @property {number} [solarAzimuthDeg] array azimuth in degrees, 180 = due south; defaults to 180 (SOLAR_AZIMUTH_DEG)
 * @property {number} [oAndMPerKWDCPerYear] $/kW-DC/year operations-and-maintenance, applied to every point's own solar kW-DC; defaults to 0 (today's behavior)
 * @property {{year:number, costPerWatt:number}} [inverterReplacement] a one-time inverter-replacement cost ($/W-DC of the point's own solar array) in the stated ownership year; omitted/null models no replacement at all (today's behavior)
 */

/** @returns {{kwDC, tilt, azimuth, inverterEff, lossFrac, degradationRate}} */
export function solarArraySpec(kwDC, pricingAssumptions) {
  return {
    kwDC,
    tilt: pricingAssumptions?.solarTiltDeg ?? SOLAR_TILT_DEG,
    azimuth: pricingAssumptions?.solarAzimuthDeg ?? SOLAR_AZIMUTH_DEG,
    inverterEff: SOLAR_DEFAULTS.inverterEffDefault,
    lossFrac: SOLAR_DEFAULTS.lossStackDefaultFrac,
    degradationRate: SOLAR_DEFAULTS.degradationRateDefault,
  };
}

export function solarCost(kwDC, pricingAssumptions) {
  if (!(kwDC > 0)) return 0;
  const perWatt = pricingAssumptions?.solarCostPerWatt ?? SOLAR_DEFAULTS.costPerWattInstalled.value;
  return kwDC * 1000 * perWatt;
}

function windPresetById(id) {
  return WIND_TURBINE_PRESETS.find((p) => p.id === id) || null;
}

function turbineRatedKW(preset) {
  return (preset?.curve || []).reduce((max, p) => Math.max(max, p.kw || 0), 0);
}

/** @returns {{presetId, powerCurve, hubHeightM, annualMeanWindMS}|null} null when windPresetId matches no preset. */
export function turbineSpec(windPresetId) {
  const preset = windPresetId ? windPresetById(windPresetId) : null;
  if (!preset) return null;
  return {
    presetId: preset.id,
    powerCurve: preset.curve.map((p) => ({ ...p })),
    hubHeightM: preset.hubHeightDefaultM,
    annualMeanWindMS: DEFAULT_ANNUAL_MEAN_WIND_MS,
  };
}

export function windCost(windPresetId, pricingAssumptions) {
  const preset = windPresetId ? windPresetById(windPresetId) : null;
  if (!preset) return 0;
  const perKW = pricingAssumptions?.windCostPerKW ?? equipmentPresets.wind.costPerKWInstalled.value;
  return turbineRatedKW(preset) * perKW;
}

function sortedBatteryPresets() {
  return [...BATTERY_PRESETS].sort((a, b) => a.usableKWh - b.usableKWh);
}

function exactBatteryPreset(kWh) {
  return BATTERY_PRESETS.find((b) => Math.abs(b.usableKWh - kWh) < BATTERY_MATCH_EPSILON) || null;
}

const BLENDED_POWER_TO_ENERGY_RATIO = (() => {
  if (BATTERY_PRESETS.length === 0) return 0.5;
  const ratios = BATTERY_PRESETS.map((b) => b.maxChargeKW / b.usableKWh);
  return ratios.reduce((sum, v) => sum + v, 0) / ratios.length;
})();

/**
 * $/kWh installed cost at `kWh`, piecewise-linear across every battery
 * preset sorted by usable capacity. Below the smallest preset's kWh or above
 * the largest, that endpoint's own $/kWh rate is held flat rather than
 * extrapolating the interpolation line -- a size far outside the catalog has
 * no better anchor.
 */
export function interpolatedBatteryCostPerKWh(kWh) {
  const presets = sortedBatteryPresets();
  if (presets.length === 0) return 0;
  const rate = (p) => p.installedCostUSD / p.usableKWh;

  if (kWh <= presets[0].usableKWh) return rate(presets[0]);
  const last = presets[presets.length - 1];
  if (kWh >= last.usableKWh) return rate(last);

  for (let i = 0; i < presets.length - 1; i += 1) {
    const a = presets[i];
    const b = presets[i + 1];
    if (kWh >= a.usableKWh && kWh <= b.usableKWh) {
      const rateA = rate(a);
      const rateB = rate(b);
      const frac = (kWh - a.usableKWh) / (b.usableKWh - a.usableKWh);
      return rateA + (rateB - rateA) * frac;
    }
  }
  return rate(last);
}

/**
 * Schema-Config-battery-shaped spec (usableKWh/roundTripEff/maxChargeKW/
 * maxDischargeKW/reserveFrac/cycleLife/calendarLifeYears -- no chargeEff/
 * dischargeEff), so model/schema.js's configFromSweepPoint can drop this
 * straight into a Config.battery slice unchanged. Returns null for kWh <= 0.
 */
export function batterySpec(kWh) {
  if (!(kWh > 0)) return null;
  const preset = exactBatteryPreset(kWh);
  if (preset) {
    return {
      presetId: preset.id,
      usableKWh: preset.usableKWh,
      roundTripEff: preset.roundTripEff,
      maxChargeKW: preset.maxChargeKW,
      maxDischargeKW: preset.maxDischargeKW,
      reserveFrac: DEFAULT_BATTERY_RESERVE_FRAC,
      cycleLife: preset.cycleLife,
      calendarLifeYears: preset.calendarLifeYears,
    };
  }
  const power = kWh * BLENDED_POWER_TO_ENERGY_RATIO;
  return {
    presetId: null,
    usableKWh: kWh,
    roundTripEff: LFP_BATTERY_DEFAULTS.roundTripEff,
    maxChargeKW: power,
    maxDischargeKW: power,
    reserveFrac: DEFAULT_BATTERY_RESERVE_FRAC,
    cycleLife: LFP_BATTERY_DEFAULTS.cycleLife,
    calendarLifeYears: LFP_BATTERY_DEFAULTS.calendarLifeYears,
  };
}

export function batteryCost(kWh, pricingAssumptions) {
  if (!(kWh > 0)) return 0;
  // A flat $/kWh override replaces catalog-based pricing entirely -- every
  // point's battery cost is that one rate times its own kWh, not just the
  // non-preset (interpolated) sizes; an exact preset match no longer gets
  // that preset's own installedCostUSD once this override is in effect.
  if (typeof pricingAssumptions?.batteryCostPerKWh === "number") {
    return pricingAssumptions.batteryCostPerKWh * kWh;
  }
  const preset = exactBatteryPreset(kWh);
  if (preset) return preset.installedCostUSD;
  return interpolatedBatteryCostPerKWh(kWh) * kWh;
}

/** roundTripEff -> {chargeEff, dischargeEff}; mirrors model/schema.js's batteryChargeDischargeEff (even split, each leg the square root of the round trip). */
function batteryChargeDischargeEff(roundTripEff) {
  const eff = Math.sqrt(Math.max(0, roundTripEff ?? 0));
  return { chargeEff: eff, dischargeEff: eff };
}

// --- Per-point engine invocation --------------------------------------------

function engineConfigFor(point, configId, pricingAssumptions) {
  const engine = { configId };
  if (point.solarKW > 0) engine.solar = { arrays: [solarArraySpec(point.solarKW, pricingAssumptions)] };

  const turbine = turbineSpec(point.windPresetId);
  if (turbine) engine.wind = { turbines: [turbine] };

  const battery = batterySpec(point.batteryKWh);
  if (battery) {
    const { chargeEff, dischargeEff } = batteryChargeDischargeEff(battery.roundTripEff);
    engine.battery = {
      usableKWh: battery.usableKWh,
      chargeEff,
      dischargeEff,
      maxChargeKW: battery.maxChargeKW,
      maxDischargeKW: battery.maxDischargeKW,
      reserveFrac: battery.reserveFrac,
      cycleLife: battery.cycleLife,
      calendarLifeYears: battery.calendarLifeYears,
      gridCharge: { ...SWEEP_GRID_CHARGE },
    };
    engine.dispatch = { ...SWEEP_DISPATCH };
  }
  return engine;
}

/** Combined component cost plus, for a generating point, the interconnection fee -- mirrors model/runEngine.js's assembleGrossCost. */
function grossCostFor(point, interconnectionFee, pricingAssumptions) {
  const solar = solarCost(point.solarKW, pricingAssumptions);
  const wind = windCost(point.windPresetId, pricingAssumptions);
  const battery = batteryCost(point.batteryKWh, pricingAssumptions);
  const hasGeneration = point.solarKW > 0 || !!point.windPresetId;
  return solar + wind + battery + (hasGeneration ? interconnectionFee : 0);
}

/**
 * A point's own O&M and one-time inverter-replacement cost, both scaled off
 * that point's own solar kW-DC (not total system size): O&M is a per-kW-DC-
 * per-year operations/maintenance figure a PV array specifically incurs, and
 * an inverter's replacement cost tracks the DC capacity it was sized to
 * handle, not a battery or turbine sitting on the same property. Returns
 * `{oAndMPerYear:0, inverterReplacement:null}` (today's behavior) with no
 * pricingAssumptions, and inverterReplacement stays null whenever the point
 * has no solar at all -- there is no inverter to replace.
 */
function omAndReplacementFor(point, pricingAssumptions) {
  const oAndMPerYear = (pricingAssumptions?.oAndMPerKWDCPerYear || 0) * point.solarKW;
  const replacement = pricingAssumptions?.inverterReplacement;
  const inverterReplacement =
    replacement && point.solarKW > 0
      ? { year: replacement.year, cost: replacement.costPerWatt * point.solarKW * 1000 }
      : null;
  return { oAndMPerYear, inverterReplacement };
}

/**
 * Points per simulateComparison() call. calc/simulate.js recomputes the
 * identical no-system baseline on every call regardless of how many configs
 * it's given, so batching amortizes that recompute across SWEEP_BATCH_SIZE
 * points instead of paying it once per point -- roughly halving a default
 * sweep's total runtime in practice -- while still reporting progress every
 * few points rather than only once at the very end.
 */
const SWEEP_BATCH_SIZE = 10;

/**
 * @param {Array<{solarKW, batteryKWh, windPresetId}>} grid
 * @param {Object} args
 * @param {Object} args.household  Household per calc/simulate.js (already resolved)
 * @param {Object} args.profile  UtilityProfile (already resolved)
 * @param {Object} args.assumptions  per calc/simulate.js (already in engine/fraction form)
 * @param {number} args.discountRatePct
 * @param {number} args.interconnectionFee
 * @param {number} args.annualUsageKWh  no-system baseline year-1 import kWh, for the size-cap check
 * @param {boolean} args.sizeCapped  whether the active profile enforces trailing12moUsage sizing
 * @param {Array} [args.incentives]  calc/incentives.js line items, applied identically to every point;
 *   resolved per point against that point's own sizes ({kwSolar, kwhBattery, kwBattery}, the last read
 *   off batterySpec(point.batteryKWh).maxChargeKW), so a perUnit or percent/cap item prices each point's
 *   own equipment rather than one shared figure. Recurring types (annualProduction, annualFixed) resolve
 *   the same way financeConfig always resolves them -- as income in cashFlows[1..] -- since a sweep point's
 *   financeConfig call is otherwise no different from the detailed comparison's.
 * @param {import('./sweep.js').SweepPricingAssumptions} [args.pricingAssumptions]  overrides for every
 *   cost/hardware default this module would otherwise read off data/equipment-presets.json, from the
 *   sizing explorer's own "Pricing assumptions" group; omitted (or any individual field within it
 *   omitted) reproduces today's behavior exactly -- see solarArraySpec/solarCost/batteryCost/windCost's
 *   own headers for the per-field defaulting rule.
 * @param {(progress:{done:number, total:number}) => void} [args.onProgress]
 */
export function runSweep(
  grid,
  {
    household,
    profile,
    assumptions,
    discountRatePct,
    interconnectionFee,
    annualUsageKWh,
    sizeCapped,
    incentives,
    pricingAssumptions,
    onProgress,
  },
) {
  const total = grid.length;
  const econ = { discountRatePct };
  const financing = { type: "cash" };
  const incentiveList = incentives || [];
  const points = [];

  for (let start = 0; start < grid.length; start += SWEEP_BATCH_SIZE) {
    const batch = grid.slice(start, start + SWEEP_BATCH_SIZE);
    const engineConfigs = batch.map((point, j) => engineConfigFor(point, `sweep-${start + j}`, pricingAssumptions));

    const { baseline, results } = simulateComparison({
      configs: engineConfigs,
      household,
      profile,
      assumptions,
    });

    batch.forEach((point, j) => {
      const result = results[j];
      const gross = grossCostFor(point, interconnectionFee, pricingAssumptions);
      const battery = batterySpec(point.batteryKWh);
      const sizes = { kwSolar: point.solarKW, kwhBattery: point.batteryKWh, kwBattery: battery ? battery.maxChargeKW : 0 };
      const { oAndMPerYear, inverterReplacement } = omAndReplacementFor(point, pricingAssumptions);

      const finance = financeConfig({
        result,
        baseline,
        costs: {
          gross,
          incentives: incentiveList,
          oAndMPerYear,
          inverterReplacement,
          batteryReplacement: null,
          sizes,
        },
        financing,
        econ,
      });

      const exceedsSizeCap = !!sizeCapped && result.years[0].productionKWh > annualUsageKWh;

      points.push({
        sizes: { solarKW: point.solarKW, batteryKWh: point.batteryKWh, windPresetId: point.windPresetId },
        upfront: gross,
        npv: finance.npv,
        paybackYear: finance.paybackYear,
        paybackBeyondHorizon: finance.paybackYear != null && finance.paybackYear > finance.horizonIndex,
        year1Savings: baseline.years[0].billTotal - result.years[0].billTotal,
        exceedsSizeCap,
        // Carried straight onto a promoted config's own costs by
        // model/schema.js's configFromSweepPoint, the same way `upfront`
        // (gross) already is, so the config card reproduces this exact
        // point's numbers rather than re-deriving O&M/replacement from
        // scratch with no pricingAssumptions to hand it.
        oAndMPerYear,
        inverterReplacement,
      });
    });

    if (onProgress) onProgress({ done: points.length, total });
  }

  return points;
}

// --- Best-point selection ----------------------------------------------------

/** Highest-NPV point among those not exceeding the size cap; null if every point is capped or the list is empty. */
export function bestByNpv(points) {
  const eligible = points.filter((p) => !p.exceedsSizeCap);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) => (p.npv > best.npv ? p : best));
}

/** Lowest-paybackYear point (null -- never pays back -- excluded) among those not exceeding the size cap. */
export function bestByPayback(points) {
  const eligible = points.filter((p) => !p.exceedsSizeCap && p.paybackYear != null);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) => (p.paybackYear < best.paybackYear ? p : best));
}
