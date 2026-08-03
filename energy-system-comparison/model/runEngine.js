// The one engine-invocation implementation: turns {household, assumptions,
// configs} (model/schema.js's state shape, minus its own UI-only concerns)
// into every calc/ call the report needs, and back into the shape
// components/ResultsSection.jsx and report/prose.js read. Pure ESM, no React,
// no DOM -- worker/calcWorker.js is the only caller (its {kind:'engine'}
// message branch); there is no synchronous fallback. If App.jsx's
// `new Worker(...)` construction itself throws (e.g. the browser blocks
// module workers), runEngine() never runs at all, and App.jsx surfaces that
// as an engine error rather than a blank page.

import { buildCustomProfile, validateProfile } from "../calc/tariffs/custom.js";
import { simulateComparison } from "../calc/simulate.js";
import { financeConfig } from "../calc/finance.js";
import { incrementalAnalysis } from "../calc/incremental.js";
import { windHourly } from "../calc/wind.js";
import { HOURS_PER_YEAR } from "../calc/time.js";
import { LODI, LODI_ECA_MONTHLY } from "../calc/tariffs/lodi.js";
import { estimateCosts, batteryChargeDischargeEff, HORIZON_YEARS_MIN, HORIZON_YEARS_MAX, DEFAULT_ASSUMPTIONS } from "./schema.js";
import equipmentPresets from "../data/equipment-presets.json";

function turbineRatedKW(turbine) {
  return (turbine?.powerCurve || []).reduce((max, p) => Math.max(max, p.kw || 0), 0);
}

/**
 * A config's own nameplate sizes, in calc/incentives.js's {kwSolar,
 * kwhBattery, kwBattery} shape -- what a perUnit incentive line
 * (config.costs.incentives) prices its rate against. Derived straight from
 * the engine Config (toEngineConfig's output: solar.arrays[].kwDC summed,
 * battery.usableKWh, battery.maxChargeKW as the battery's own power rating),
 * never a separate user-entered field -- there is nothing else for "this
 * config's solar/battery size" to mean. Mirrors calc/sweep.js's runSweep,
 * which builds the identical shape per sweep point from that point's own
 * solarKW/batteryKWh/batterySpec(...).maxChargeKW.
 */
export function sizesForEngineConfig(engineConfig) {
  const kwSolar = (engineConfig.solar?.arrays || []).reduce((sum, a) => sum + (a.kwDC || 0), 0);
  return {
    kwSolar,
    kwhBattery: engineConfig.battery?.usableKWh || 0,
    kwBattery: engineConfig.battery?.maxChargeKW || 0,
  };
}

/**
 * Capacity factor for one config's turbines alone, run through calc/wind.js
 * independently of solar -- ConfigResult only carries combined production,
 * so this is the one figure report/prose.js needs that the compose layer
 * must compute itself (see this file's header).
 */
function windCapacityFactorFor(turbines) {
  if (!turbines || turbines.length === 0) return null;
  const ratedKW = turbines.reduce((sum, t) => sum + turbineRatedKW(t), 0);
  if (ratedKW <= 0) return null;
  const hourly = windHourly({ turbines, year: 0 });
  const totalKWh = hourly.reduce((sum, v) => sum + v, 0);
  return totalKWh / (ratedKW * HOURS_PER_YEAR);
}

/**
 * Engine Config shape per calc/CONTRACTS.md: solar/wind/battery keys are
 * each optional, and calc/incremental.js's presence check (`config[component]`)
 * is a plain truthiness test -- so an empty `{turbines:[]}` object would
 * read as "wind present" even with zero turbines. Keys are omitted here
 * rather than set to an empty/null value so that check means what it says.
 */
function toEngineConfig(config) {
  const engine = { configId: config.id };
  if (config.solar.arrays.length > 0) engine.solar = { arrays: config.solar.arrays };
  if (config.wind.turbines.length > 0) engine.wind = { turbines: config.wind.turbines };
  if (config.battery) {
    const { chargeEff, dischargeEff } = batteryChargeDischargeEff(config.battery.roundTripEff);
    engine.battery = {
      usableKWh: config.battery.usableKWh,
      chargeEff,
      dischargeEff,
      maxChargeKW: config.battery.maxChargeKW,
      maxDischargeKW: config.battery.maxDischargeKW,
      reserveFrac: config.battery.reserveFrac,
      cycleLife: config.battery.cycleLife,
      calendarLifeYears: config.battery.calendarLifeYears,
      // model/schema.js's normalizeBattery/batteryFromPreset always fill this
      // in (never an absent key), so it's threaded through as-is rather than
      // re-defaulted here.
      gridCharge: { ...config.battery.gridCharge },
    };
    // calc/simulate.js's Config.dispatch is a sibling of battery/solar/wind,
    // not nested under battery, even though the UI keeps it on the battery
    // slice (it's a battery dispatch setting with nowhere else to live in
    // model/schema.js). normalizeBattery/batteryFromPreset always fill this
    // in too, so it's threaded through as-is.
    engine.dispatch = { ...config.battery.dispatch };
  }
  return engine;
}

/** Clamps to the schema's ownership-horizon bounds; see model/schema.js's HORIZON_YEARS_MIN/MAX for why 0 and negative horizons crash the engine. */
export function clampHorizonYears(v) {
  return Math.min(HORIZON_YEARS_MAX, Math.max(HORIZON_YEARS_MIN, v));
}

/**
 * Runs `factory` (App.jsx passes `() => new Worker(...)`) inside a
 * try/catch, since a module Worker's constructor can itself throw
 * synchronously (a browser that blocks module workers, a CSP violation) --
 * with nothing posted to it yet, runEngine() above never runs and no
 * onmessage response will ever arrive to clear a loading state. Returns
 * { worker, error: null } on success or { worker: null, error: message } on
 * failure, so the caller can render the same engine-error panel it already
 * has for a runEngine()-surfaced error rather than a distinct code path.
 */
export function createEngineWorker(factory) {
  try {
    return { worker: factory(), error: null };
  } catch (e) {
    return { worker: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Mean of LODI's published trailing-12-month ECA table, used to seed a fixed-override value rather than leaving it null. */
export function trailingAverageEcaValue() {
  return LODI_ECA_MONTHLY.reduce((sum, v) => sum + v, 0) / LODI_ECA_MONTHLY.length;
}

/**
 * The custom-profile equivalent of trailingAverageEcaValue above: the mean
 * of every monthlyTable adder's own 12 monthly values, combined, used to
 * seed a fixed-override value for App.jsx's generic "Variable adder
 * pricing" control. calc/tariffs/profile.js's adderCost applies
 * assumptions.ecaMode/ecaFixedValue to EVERY monthlyTable adder a profile
 * declares (keyed off adder.mode, not any specific id -- see CONTRACTS.md),
 * so seeding from a custom profile's own adder(s) is correct regardless of
 * how many there are; seeding from LEU's own ECA history here would be as
 * wrong for a custom profile as it would be irrelevant.
 */
export function trailingAverageCustomAdderValue(monthlyTableAdders) {
  const allValues = (monthlyTableAdders || []).flatMap((a) => (Array.isArray(a.monthlyValues) ? a.monthlyValues : []));
  if (allValues.length === 0) return 0;
  return allValues.reduce((sum, v) => sum + v, 0) / allValues.length;
}

/**
 * Patch to apply when the ECA-mode-equivalent selector changes (App.jsx's
 * Lodi-only "ECA mode" control, or its generic "Variable adder pricing"
 * equivalent for a custom profile with a monthlyTable adder).
 * calc/tariffs/profile.js multiplies ecaFixedValue directly against kWh, so
 * a null override in fixed mode either zeroes the adder or throws against
 * profile.js's own guard -- seeding it the moment a user switches to fixed
 * keeps the field from ever starting blank. `seedValue` defaults to LEU's
 * own trailing average (trailingAverageEcaValue), matching every existing
 * Lodi call site unchanged; the custom-profile control passes its own
 * adder-derived seed (trailingAverageCustomAdderValue) explicitly instead.
 */
export function ecaModeChangePatch(assumptions, mode, seedValue = trailingAverageEcaValue()) {
  if (mode === "fixed" && assumptions.ecaFixedValue == null) {
    return { ecaMode: mode, ecaFixedValue: seedValue };
  }
  return { ecaMode: mode };
}

/**
 * assumptions.ecaMode/ecaFixedValue after a household update, extracted
 * from App.jsx's updateHousehold as a pure function so the reset can be
 * tested directly without mounting a component (the same reasoning as
 * ecaModeChangePatch above). Resets both back to DEFAULT_ASSUMPTIONS'
 * values whenever profileId changes (Lodi <-> custom, either direction) --
 * both fields describe whichever profile's monthlyTable adder(s) were
 * active when the user set them, and calc/tariffs/profile.js's adderCost
 * applies them to ANY monthlyTable adder the now-active profile declares
 * (keyed off adder.mode, not a specific id), so a value set against one
 * profile's adder would otherwise silently reprice a different profile's
 * adder the moment the household switches. Left untouched when profileId
 * is unchanged, so editing any other household field never resets it.
 */
export function assumptionsAfterHouseholdChange(prevAssumptions, prevProfileId, nextProfileId) {
  if (nextProfileId === prevProfileId) return prevAssumptions;
  return { ...prevAssumptions, ecaMode: DEFAULT_ASSUMPTIONS.ecaMode, ecaFixedValue: DEFAULT_ASSUMPTIONS.ecaFixedValue };
}

/**
 * LEU's one-time interconnection fee for a config with solar or wind
 * generation, keyed to the household's resolved schedule id (G1-3P is the
 * only three-phase case; EA, G1 single-phase, and G2 all use the
 * single-phase figure). calc/finance.js's header states costs.gross must
 * already have any interconnection/permit fee folded in by the caller --
 * this is that fold-in. A battery-only config never interconnects, so it
 * carries no fee.
 */
export function interconnectionFeeFor(profile, engineScheduleId) {
  const fees = profile?.constraints?.interconnectionFees;
  if (!fees) return 0;
  return engineScheduleId === "G1-3P" ? fees.threePhase || 0 : fees.singlePhase || 0;
}

/** Combines estimated component costs and, for a generating config, the interconnection fee into the one-time gross cost financeConfig treats as costs.gross. */
export function assembleGrossCost(engineConfig, estimated, interconnectionFee) {
  const hasGeneration = !!(engineConfig.solar || engineConfig.wind);
  return (
    (estimated.solarGross || 0) +
    (estimated.windGross || 0) +
    (estimated.batteryGross || 0) +
    (hasGeneration ? interconnectionFee : 0)
  );
}

/**
 * Whether the resolved schedule has neither time-of-use pricing nor a demand
 * charge -- the two cases calc/battery.js's gridCharge mechanism can plausibly
 * pay for (a cheaper TOU window to buy in, or shaving a demand-charge peak).
 * A flat or tiered schedule with no demand charge prices every import hour
 * the same way (aside from tier position), so grid charging there only adds
 * cost: retail rate plus round-trip loss, recovered by nothing.
 */
export function scheduleLacksTouOrDemand(profile, scheduleId) {
  const schedule = profile?.schedules?.find((s) => s.id === scheduleId);
  if (!schedule) return false;
  return schedule.pricing?.type !== "tou" && !schedule.demand;
}

/**
 * Whether a config's grid charging has no plausible payback: the schedule
 * has no TOU spread to buy into (scheduleLacksTouOrDemand's TOU half), AND
 * either the schedule carries no demand charge at all, or it does but this
 * config's battery isn't actually dispatching in 'peak-shave' mode -- a
 * demand charge only gives grid charging something to pay for when the
 * battery is shaving against it; a demand-charged schedule run in
 * 'self-consumption' mode gets no such benefit; grid charging there is the
 * same "retail rate plus round-trip loss, recovered by nothing" as a flat
 * schedule with no demand charge at all.
 *
 * The peak-shave exemption relies on calc/battery.js's own invariant: grid
 * charging in that mode is capped by the month's own already-established
 * import peak (on top of the shaving threshold), so it never itself raises
 * the billed monthly peak it is meant to shave -- the pre-charge is
 * therefore never a net cost against demand charges, only ever a potential
 * saving, which is what "has no plausible payback" is exempting it from
 * claiming.
 */
export function gridChargeHasNoPayback(profile, scheduleId, dispatchMode) {
  const schedule = profile?.schedules?.find((s) => s.id === scheduleId);
  if (!schedule) return false;
  if (schedule.pricing?.type === "tou") return false;
  if (schedule.demand && dispatchMode === "peak-shave") return false;
  return true;
}

/**
 * LEU's actual schedule id for household.schedule: "G1" bare is ambiguous
 * between LODI_G1.singlePhase ("G1") and LODI_G1.threePhase ("G1-3P"), so
 * g1Phase resolves it. EA and G2 need no resolution. A custom profile has
 * exactly one schedule, built by buildCustomProfile with id `${id}-schedule`.
 */
function resolveScheduleId(household, isCustom, profile) {
  if (isCustom) return profile.schedules[0].id;
  if (household.schedule === "G1") return household.g1Phase === "threePhase" ? "G1-3P" : "G1";
  return household.schedule;
}

/**
 * calc/load.js's day-type templates are keyed 'residential'|'small-commercial'
 * (data/load-shapes.json); nothing in the schema lets a custom-tariff
 * household pick between them, so "residential" is the default for a custom
 * profile -- the more common case for a hand-modeled household tariff.
 */
function loadProfileIdFor(engineScheduleId, isCustom) {
  if (isCustom) return "residential";
  return engineScheduleId === "EA" ? "residential" : "small-commercial";
}

function buildEngineHousehold(household, engineScheduleId, isCustom, ecaFixedValue) {
  const evEnabled = !!household.ev?.enabled;
  return {
    schedule: engineScheduleId,
    riderIds: household.riderIds,
    load: {
      mode: household.usage.mode,
      annualKWh: household.usage.annualKWh,
      monthlyKWh: household.usage.monthlyKWh,
      hourlyKWh: household.usage.hourlyKWh,
      profileId: loadProfileIdFor(engineScheduleId, isCustom),
      ev: evEnabled
        ? {
            kWhPerDay: household.ev.kWhPerDay,
            windowStartHour: household.ev.windowStartHour,
            windowEndHour: household.ev.windowEndHour,
            daysPerWeek: household.ev.daysPerWeek,
          }
        : { kWhPerDay: 0, windowStartHour: 0, windowEndHour: 0, daysPerWeek: 0 },
    },
    evRider: evEnabled && !!household.ev.riderMeter,
    billingOptions: { ecaFixedValue },
  };
}

/**
 * A rough sizing hint for BatteryEditor's peak-shave threshold field, not a
 * billed monthly peak: ConfigResult exposes only two representative days
 * (median-production summer and winter, calc/simulate.js's
 * representativeDays), not the full 8760-hour series a real monthly peak
 * needs, so this is the largest hourly import across just those two days of
 * the no-system baseline (whose gridImport equals household load exactly).
 * It is only ever shown as placeholder text ("around your baseline peak, N
 * kW"), never a value the user can't override, so under- or over-shooting
 * the real monthly peak costs nothing but a slightly-off suggestion.
 */
export function baselinePeakKWFrom(baseline) {
  const days = [baseline?.representativeDays?.summer, baseline?.representativeDays?.winter];
  let peak = 0;
  for (const day of days) {
    for (const v of day?.gridImport || []) peak = Math.max(peak, v);
  }
  return peak;
}

/**
 * Resolves {household, assumptions} into the engine-ready profile,
 * engineHousehold, and the schedule id billing runs against -- the first
 * step runEngine() takes before simulating, factored out so a second
 * engine-invocation path (model/sweepEngine.js, for the sizing explorer) can
 * reuse it instead of re-deriving custom-tariff or schedule-id resolution a
 * second time. Returns { error } in the same shape runEngine() surfaces (a
 * malformed custom tariff -- an unknown exportPolicy.type among other shape
 * errors) rather than throwing, so both callers read `.error` off the return
 * value the same way.
 */
export function resolveHousehold(household, rawAssumptions) {
  const isCustom = household.profileId === "custom";
  const profile = isCustom ? buildCustomProfile(household.customProfileInputs) : LODI;

  if (isCustom) {
    const profileErrors = validateProfile(profile);
    if (profileErrors.length > 0) {
      // The one profile error the household section's TOU form cannot offer
      // a field to fix directly (its periods came from an import, not
      // hand-entry -- see components/HouseholdSection.jsx's CustomProfileBuilder):
      // point at re-running the import instead of the form below, which has
      // nowhere to enter TOU periods.
      const fixHint = profileErrors.some((e) => e === "tou pricing.periods must be a non-empty array")
        ? "Re-run the import with complete periods to see results."
        : "Fix them in the household section below to see results.";
      return {
        error:
          `The custom tariff has ${profileErrors.length} unresolved error${profileErrors.length === 1 ? "" : "s"}: ` +
          `${profileErrors.join("; ")}. ${fixHint}`,
      };
    }
  }

  // No export-policy-type gate here beyond what validateProfile (above, for
  // a custom tariff) already runs: calc/billing.js's priceYear implements
  // both avoidedCostCredit and netMetering (hourly and annual netting), and
  // validateProfileShape's validateExportPolicy already rejects any other
  // exportPolicy.type, quoting the two permitted ones, as part of the
  // profileErrors check above -- there is nothing left for a second,
  // engine-level gate to catch.
  const engineScheduleId = resolveScheduleId(household, isCustom, profile);
  const engineHousehold = buildEngineHousehold(household, engineScheduleId, isCustom, rawAssumptions.ecaFixedValue);
  return { profile, engineHousehold, engineScheduleId };
}

/** rawAssumptions (model/schema.js's percent-based shape) -> calc/simulate.js's fraction-based Assumptions. */
export function toEngineAssumptions(rawAssumptions) {
  return {
    horizonYears: rawAssumptions.horizonYears,
    retailEscalation: rawAssumptions.retailEscalationPct / 100,
    exportTrend: rawAssumptions.exportTrendPct / 100,
    ecaMode: rawAssumptions.ecaMode,
    addersOnExports: rawAssumptions.addersOnExports,
  };
}

/**
 * Runs every engine call for {household, assumptions, configs} (model/schema.js's
 * state shape) inside one try/catch: a malformed custom tariff (an unknown
 * exportPolicy.type, or any other validateProfileShape failure) should
 * surface as a message, not a thrown exception -- both the worker
 * caller and any synchronous caller read `.error` off the return value
 * rather than needing their own try/catch around this call. Custom-tariff
 * shape errors are checked before simulating (cheap, and gives a specific
 * message) rather than relying only on whatever a deep throw happens to say.
 */
export function runEngine({ household, assumptions: rawAssumptions, configs }) {
  try {
    const resolved = resolveHousehold(household, rawAssumptions);
    if (resolved.error) return resolved;
    const { profile, engineHousehold, engineScheduleId } = resolved;
    const assumptions = toEngineAssumptions(rawAssumptions);

    const engineConfigs = configs.map(toEngineConfig);
    const { baseline, results } = simulateComparison({
      configs: engineConfigs,
      household: engineHousehold,
      profile,
      assumptions,
    });

    const econ = { discountRatePct: rawAssumptions.discountRatePct };
    const annualUsageKWh = baseline.years[0]?.importKWh ?? 0;
    const sizeCapped = profile.constraints?.sizeCapMode === "trailing12moUsage";
    const oversizedConfigIds = new Set();
    const gridChargeAdvisoryConfigIds = new Set();
    const interconnectionFee = interconnectionFeeFor(profile, engineScheduleId);
    const resolvedSchedule = profile.schedules?.find((s) => s.id === engineScheduleId);
    const hasDemandCharge = !!resolvedSchedule?.demand;
    const baselinePeakKW = baselinePeakKWFrom(baseline);

    const entries = configs.map((config, i) => {
      const engineConfig = engineConfigs[i];
      const result = results[i];
      const estimated = estimateCosts(config, equipmentPresets);
      const gross = assembleGrossCost(engineConfig, estimated, interconnectionFee);
      const inverterReplacement =
        config.costs.inverterReplacementYear != null
          ? { year: config.costs.inverterReplacementYear, cost: config.costs.inverterReplacementCost || 0 }
          : null;

      const finance = financeConfig({
        result,
        baseline,
        costs: {
          gross,
          incentives: config.costs.incentives,
          sizes: sizesForEngineConfig(engineConfig),
          oAndMPerYear: config.costs.oAndMPerYear,
          inverterReplacement,
          batteryReplacement: null,
        },
        financing: config.financing,
        econ,
      });

      // Per-component O&M isn't tracked separately from the config's single
      // lumped oAndMPerYear field, so no share of it is attributed to either
      // component here -- attributing all of it to both would double-count
      // it against the whole-system finance.js result above.
      const incremental = incrementalAnalysis({
        config: engineConfig,
        household: engineHousehold,
        profile,
        assumptions,
        costs: {
          ...(engineConfig.battery ? { battery: { cost: estimated.batteryGross || 0 } } : {}),
          ...(engineConfig.wind ? { wind: { cost: estimated.windGross || 0 } } : {}),
        },
      });

      if (sizeCapped && result.years[0].productionKWh > annualUsageKWh) {
        oversizedConfigIds.add(config.id);
      }

      if (
        config.battery?.gridCharge?.enabled &&
        gridChargeHasNoPayback(profile, engineScheduleId, config.battery?.dispatch?.mode)
      ) {
        gridChargeAdvisoryConfigIds.add(config.id);
      }

      return {
        id: config.id,
        name: config.name,
        config: engineConfig,
        result,
        finance,
        incremental,
        windCapacityFactor: windCapacityFactorFor(config.wind.turbines),
      };
    });

    return {
      profile,
      household: engineHousehold,
      baseline,
      entries,
      allowedFinancing: profile.constraints.allowedFinancing,
      oversizedConfigIds,
      gridChargeAdvisoryConfigIds,
      interconnectionFee,
      hasDemandCharge,
      baselinePeakKW,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
