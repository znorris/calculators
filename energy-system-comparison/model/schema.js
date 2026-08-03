// The full app state shape and its defaults.
//
// State has three top-level sections: `household` (the site being served --
// tariff, usage, EV load), `assumptions` (economic projections shared across
// every config), and `configs` (the systems being compared: solar/wind/
// battery hardware, its cost, and how it's financed). Everything the UI reads
// or writes, the URL codec carries, and storage.js persists is this shape.
//
// normalizeState is the single entry point for turning "whatever was in
// localStorage or a share link" into a value every other module can trust:
// every field gets a concrete value, unknown keys are dropped, and nothing
// throws on missing or malformed input.

import equipmentPresets from "../data/equipment-presets.json";
import windData from "../data/wind.json";
import { HOURS_PER_YEAR } from "../calc/time.js";
import { solarArraySpec, batterySpec, turbineSpec, solarCost, windCost, batteryCost } from "../calc/sweep.js";

let idCounter = 0;

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  idCounter += 1;
  return `${prefix}-${idCounter}-${String(Math.floor(performance.now() * 1000))}`;
}

function num(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function nullableNum(v) {
  return v == null ? null : num(v, null);
}

function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}

function str(v, fallback) {
  return typeof v === "string" && v ? v : fallback;
}

function arr(v, fallback) {
  return Array.isArray(v) ? v : fallback;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Spreadsheet-style column letters: 0 is A, 25 is Z, 26 is AA. */
function columnLetters(index) {
  let out = "";
  let n = index;
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** The next unused bare-letter config name: A, B, C, ... */
export function nextConfigName(configs) {
  const taken = new Set((configs || []).map((c) => (c?.name || "").trim()));
  for (let i = 0; ; i += 1) {
    const candidate = columnLetters(i);
    if (!taken.has(candidate)) return candidate;
  }
}

// --- Enumerated option lists, for <select> rendering -----------------------

export const SCHEDULE_OPTIONS = [
  { value: "EA", label: "Schedule EA (Residential)" },
  { value: "G1", label: "Schedule G1 (Small Commercial)" },
  { value: "G2", label: "Schedule G2 (Medium Commercial)" },
];

export const G1_PHASE_OPTIONS = [
  { value: "singlePhase", label: "Single-phase" },
  { value: "threePhase", label: "Three-phase" },
];

export const USAGE_MODES = ["annual", "monthly", "hourly"];

export const ECA_MODES = [
  { value: "trailingAverage", label: "Trailing average (LODI's published monthly table)" },
  { value: "fixed", label: "Fixed override" },
];

export const FINANCING_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "loan", label: "Loan" },
];

// --- Equipment presets, re-exported for one place other modules import from
// (component code should not need to know these live in two separate JSON
// files under data/). ---------------------------------------------------

export const BATTERY_PRESETS = equipmentPresets.batteries;
export const SOLAR_PANEL_PRESETS = equipmentPresets.solar.panelPresets;
export const WIND_TURBINE_PRESETS = windData.powerCurves.presets;
export const SOLAR_COST_DEFAULTS = equipmentPresets.solar;
export const WIND_COST_DEFAULTS = equipmentPresets.wind;

const SOLAR_DEFAULTS = equipmentPresets.solar;

/**
 * Fraction of usable capacity held back from self-consumption dispatch, so
 * the battery keeps a reserve for an outage rather than running itself flat
 * on the theory that the grid is always there. Not a hardware spec, so no
 * preset publishes it; a config can still set it to 0.
 */
export const DEFAULT_BATTERY_RESERVE_FRAC = 0.1;

/**
 * Central Valley small-wind sites run modest average speeds; this is a
 * starting point for a new turbine, not a site measurement. See
 * calc/wind.js and data/wind.json for how a mean speed becomes an hourly
 * series.
 */
export const DEFAULT_ANNUAL_MEAN_WIND_MS = 4;

export const DEFAULT_ANNUAL_KWH = 9000;

// --- household ---------------------------------------------------------

export const DEFAULT_USAGE = {
  mode: "annual",
  annualKWh: DEFAULT_ANNUAL_KWH,
  monthlyKWh: null,
  hourlyKWh: null,
};

export const DEFAULT_EV = {
  enabled: false,
  kWhPerDay: 0,
  windowStartHour: 0,
  windowEndHour: 0,
  daysPerWeek: 0,
  riderMeter: false,
};

/**
 * A blank starting point for a custom (non-LODI) tariff, shaped exactly like
 * calc/tariffs/custom.js's buildCustomProfile input. Flat-seasonal at $0 so
 * the schedule is valid (see profile.js validateSchedule) the moment a user
 * switches profileId to "custom", before they've entered real rates.
 */
export const DEFAULT_CUSTOM_PROFILE_INPUTS = {
  id: "custom",
  label: "Custom Utility",
  fixedChargePerMonth: 0,
  pricing: { type: "flat-seasonal", summerRate: 0, winterRate: 0 },
  demand: null,
  // Both optional Schedule-level fields (calc/tariffs/profile.js's typedef);
  // null/empty here is byte-identical to omitting them entirely once they
  // reach calc/tariffs/custom.js's buildCustomProfile (see that module's own
  // header), i.e. no minimum-bill floor and no system-size charge -- so a
  // legacy state merging in these defaults (normalizeCustomProfileInputs
  // below) behaves exactly as it did before either field existed.
  minimumBillPerMonth: null,
  systemSizeCharges: [],
  adders: [],
  riders: [],
  exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0, addersApply: false, carryForward: true, cashOut: false },
  constraints: { allowedFinancing: ["cash", "loan"], interconnectionFees: { singlePhase: 0, threePhase: 0 } },
};

export const DEFAULT_HOUSEHOLD = {
  profileId: "lodi",
  customProfileInputs: DEFAULT_CUSTOM_PROFILE_INPUTS,
  schedule: "EA",
  g1Phase: "singlePhase",
  riderIds: [],
  usage: DEFAULT_USAGE,
  ev: DEFAULT_EV,
};

function normalizeUsage(raw) {
  const rawMode = USAGE_MODES.includes(raw?.mode) ? raw.mode : DEFAULT_USAGE.mode;
  const monthlyKWh = Array.isArray(raw?.monthlyKWh) && raw.monthlyKWh.length === 12 ? raw.monthlyKWh.slice() : null;
  const hourlyKWh = Array.isArray(raw?.hourlyKWh) && raw.hourlyKWh.length === HOURS_PER_YEAR ? raw.hourlyKWh.slice() : null;

  // calc/load.js throws when mode disagrees with the series it requires
  // (e.g. mode "hourly" with hourlyKWh null), so a mode whose series failed
  // validation above is downgraded to annual here rather than left
  // mismatched -- that state can never reach the engine, from storage, a
  // share link, or anywhere else normalizeState runs.
  if ((rawMode === "hourly" && !hourlyKWh) || (rawMode === "monthly" && !monthlyKWh)) {
    return { mode: "annual", annualKWh: DEFAULT_USAGE.annualKWh, monthlyKWh: null, hourlyKWh: null };
  }

  return {
    mode: rawMode,
    annualKWh: num(raw?.annualKWh, DEFAULT_USAGE.annualKWh),
    monthlyKWh,
    hourlyKWh,
  };
}

function normalizeEv(raw) {
  return {
    enabled: bool(raw?.enabled, DEFAULT_EV.enabled),
    kWhPerDay: num(raw?.kWhPerDay, DEFAULT_EV.kWhPerDay),
    windowStartHour: num(raw?.windowStartHour, DEFAULT_EV.windowStartHour),
    windowEndHour: num(raw?.windowEndHour, DEFAULT_EV.windowEndHour),
    daysPerWeek: num(raw?.daysPerWeek, DEFAULT_EV.daysPerWeek),
    riderMeter: bool(raw?.riderMeter, DEFAULT_EV.riderMeter),
  };
}

/**
 * True for a TOU period's window descriptor shape calc/tariffs/custom.js's
 * buildAppliesFromWindow can actually build an applies() predicate from:
 * {hours:[startHour, endHour]}, both integers 0-23. This is the same shape
 * model/profileCodec.js's parseProfileImport already enforces on the way in
 * from an AI-assisted import, so a period that fails this check can only
 * have gotten here some other way -- a hand-edited share link or a
 * hand-edited localStorage record are the two this app itself exposes.
 */
function isValidTouWindow(window) {
  return (
    !!window &&
    typeof window === "object" &&
    Array.isArray(window.hours) &&
    window.hours.length === 2 &&
    window.hours.every((h) => typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23)
  );
}

/**
 * Drops a TOU pricing block's periods that lack a valid window descriptor,
 * and degrades pricing entirely to the flat-seasonal default if none
 * survive -- rather than letting a windowless period reach the renderer.
 * components/HouseholdSection.jsx's PricingSummary reads
 * p.window.hours[0] with no guard (it never receives a TOU period through
 * any path this app's own UI can produce, since the import validates window
 * shape and this form can't hand-author TOU periods at all), so a
 * structurally-valid-but-windowless period from a hand-edited share link or
 * hand-edited localStorage record would otherwise reach that render and
 * throw, blanking the whole page rather than degrading to an error message.
 * calc/tariffs/custom.js's materializeTouPricing intentionally leaves such a
 * period's shape untouched so calc/tariffs/profile.js's validateSchedule can
 * report its own "missing an applies() predicate" error for it -- that error
 * path only works if the period never reaches a component render at all,
 * which is what this sanitization guarantees.
 */
function sanitizeTouPricing(pricing) {
  if (!pricing || pricing.type !== "tou") return pricing;
  if (!Array.isArray(pricing.periods)) return pricing; // periods:null degrades correctly downstream (validateSchedule), not here.
  const periods = pricing.periods.filter((p) => isValidTouWindow(p?.window));
  if (periods.length === 0) return structuredClone(DEFAULT_CUSTOM_PROFILE_INPUTS.pricing);
  return { ...pricing, periods };
}

/**
 * Drops an ExportRate timeTable's periods that lack a valid window
 * descriptor, the identical defense sanitizeTouPricing runs for a TOU
 * pricing block, and for the identical reason: components/HouseholdSection.jsx
 * renders a timeTable export rate's periods read-only (the same way it does
 * an imported TOU pricing block, since neither can be authored field-by-field
 * in this form), reading period.window.hours[0] with no guard, so a
 * windowless period reaching that render (a hand-edited share link, a
 * hand-edited localStorage record) would throw rather than degrade. Every
 * other ExportRate kind (a plain number, 'retail', monthlyTable,
 * percentOfRetail) passes through unchanged; degrades to a flat $0/kWh
 * export rate if a timeTable's periods empty out, mirroring
 * sanitizeTouPricing's own degrade-to-default behavior.
 */
function sanitizeExportRate(exportRate) {
  if (!exportRate || exportRate.kind !== "timeTable") return exportRate;
  if (!Array.isArray(exportRate.periods)) return exportRate;
  const periods = exportRate.periods.filter((p) => isValidTouWindow(p?.window));
  if (periods.length === 0) return 0;
  return { ...exportRate, periods };
}

/** Applies sanitizeExportRate above to whichever field (ratePerKWh or exportRate) the policy's own type carries an ExportRate on. */
function sanitizeExportPolicy(exportPolicy) {
  if (!exportPolicy || typeof exportPolicy !== "object") return exportPolicy;
  if (exportPolicy.type === "avoidedCostCredit") {
    return { ...exportPolicy, ratePerKWh: sanitizeExportRate(exportPolicy.ratePerKWh) };
  }
  if (exportPolicy.type === "netMetering") {
    return { ...exportPolicy, exportRate: sanitizeExportRate(exportPolicy.exportRate) };
  }
  return exportPolicy;
}

/**
 * Drops whichever of valuePerKWh/monthlyValues doesn't belong to an adder's
 * own mode, so the contradictory shape a stale UI value (or a hand-edited
 * share link/localStorage record) could otherwise carry -- both fields
 * present, when calc/tariffs/profile.js's adderCost only ever reads the one
 * matching adder.mode -- can never persist. Mirrors sanitizeTouPricing's own
 * "this normalizer is the one choke point" role for a shape validateAdder
 * alone wouldn't catch (validateAdder flags a monthlyTable adder's missing
 * or malformed monthlyValues, but not an extraneous valuePerKWh sitting
 * unused alongside a valid one, or vice versa).
 */
function sanitizeAdder(adder) {
  if (!adder || typeof adder !== "object") return adder;
  if (adder.mode === "monthlyTable") {
    const { valuePerKWh, ...rest } = adder;
    return rest;
  }
  const { monthlyValues, ...rest } = adder;
  return rest;
}

/** Applies sanitizeAdder above to every adder in the list; passes non-arrays through unchanged, the same tolerant-degrade rule every other field in this merge follows. */
function sanitizeAdders(adders) {
  if (!Array.isArray(adders)) return adders;
  return adders.map(sanitizeAdder);
}

/**
 * Tolerant merge rather than a full re-validation: this is a free-form form
 * the user is actively editing, and calc/tariffs/custom.js's
 * validateProfile is what surfaces real errors, not this normalizer.
 *
 * A TOU pricing block's periods round-trip through this merge unchanged,
 * window descriptor and all: `raw.pricing` (when present) replaces the
 * default's `pricing` wholesale rather than being merged key-by-key, and a
 * TOU period is already plain, JSON-safe data ({id, rate, window:{hours,
 * days, excludeHolidays}}) by the time it ever reaches here -- no function
 * to lose or rebuild, since calc/tariffs/custom.js's buildCustomProfile is
 * the one place that ever materializes a real applies() predicate from that
 * descriptor, and it does so downstream of this normalizer, not before it.
 *
 * The one shape check this merge DOES make: sanitizeTouPricing above drops
 * any TOU period missing a valid window descriptor (and degrades pricing to
 * flat-seasonal if that empties the array), since a windowless period is not
 * a validation error this normalizer can leave for validateProfile to catch
 * -- it is a shape components/HouseholdSection.jsx's PricingSummary cannot
 * render at all, from ANY source normalizeState runs against (a hand-edited
 * share link, a hand-edited localStorage record), and this normalizer is the
 * one choke point every one of those sources passes through.
 *
 * sanitizeExportPolicy runs the identical check against an ExportRate
 * timeTable (exportPolicy.ratePerKWh or .exportRate) for the identical
 * reason -- components/HouseholdSection.jsx renders a timeTable export rate
 * read-only too, the same way it does an imported TOU pricing block.
 *
 * sanitizeAdders runs a comparable check against every adder: it drops
 * whichever of valuePerKWh/monthlyValues doesn't belong to that adder's own
 * mode, so a stale field from a mode the user has since switched away from
 * (or a hand-edited share link/localStorage record) can never sit alongside
 * the field adderCost actually reads.
 */
function normalizeCustomProfileInputs(raw) {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_CUSTOM_PROFILE_INPUTS);
  const merged = { ...structuredClone(DEFAULT_CUSTOM_PROFILE_INPUTS), ...raw };
  return {
    ...merged,
    pricing: sanitizeTouPricing(merged.pricing),
    exportPolicy: sanitizeExportPolicy(merged.exportPolicy),
    adders: sanitizeAdders(merged.adders),
  };
}

function normalizeHousehold(raw) {
  const profileId = raw?.profileId === "custom" ? "custom" : "lodi";
  const schedule = SCHEDULE_OPTIONS.some((o) => o.value === raw?.schedule) ? raw.schedule : DEFAULT_HOUSEHOLD.schedule;
  const g1Phase = raw?.g1Phase === "threePhase" ? "threePhase" : "singlePhase";
  const ev = normalizeEv(raw?.ev);
  return {
    profileId,
    customProfileInputs: normalizeCustomProfileInputs(raw?.customProfileInputs),
    schedule,
    g1Phase,
    riderIds: arr(raw?.riderIds, []).filter((id) => typeof id === "string"),
    usage: normalizeUsage(raw?.usage),
    // Schedule EV (riderMeter) is a Lodi-only rate schedule; a custom
    // profile has no such schedule for the checkbox to mean anything
    // against, and components/HouseholdSection.jsx's checkbox for it
    // renders only when the household is on the Lodi profile for that
    // reason. Forcing it false here (rather than trusting whatever a raw
    // state carries) means a state saved while on Lodi, then switched to a
    // custom profile -- or a hand-edited share link/localStorage record --
    // can never carry an inert `true` into model/runEngine.js's
    // buildEngineHousehold, which reads ev.riderMeter with no profileId
    // check of its own.
    ev: profileId === "custom" ? { ...ev, riderMeter: false } : ev,
  };
}

// --- assumptions ---------------------------------------------------------

// calc/simulate.js's per-year loop never runs at horizonYears 0 (year0 stays
// null and a later reference to it throws), and a negative horizon is
// meaningless, so 1 is the floor; 50 is a generous ceiling against a typo
// like a stray extra digit.
export const HORIZON_YEARS_MIN = 1;
export const HORIZON_YEARS_MAX = 50;

export const DEFAULT_ASSUMPTIONS = {
  horizonYears: 25,
  retailEscalationPct: 3,
  exportTrendPct: 0,
  discountRatePct: 5,
  ecaMode: "trailingAverage",
  ecaFixedValue: null,
  addersOnExports: false,
};

function normalizeAssumptions(raw) {
  const ecaMode = raw?.ecaMode === "fixed" ? "fixed" : "trailingAverage";
  return {
    horizonYears: clamp(num(raw?.horizonYears, DEFAULT_ASSUMPTIONS.horizonYears), HORIZON_YEARS_MIN, HORIZON_YEARS_MAX),
    retailEscalationPct: num(raw?.retailEscalationPct, DEFAULT_ASSUMPTIONS.retailEscalationPct),
    exportTrendPct: num(raw?.exportTrendPct, DEFAULT_ASSUMPTIONS.exportTrendPct),
    discountRatePct: num(raw?.discountRatePct, DEFAULT_ASSUMPTIONS.discountRatePct),
    ecaMode,
    ecaFixedValue: nullableNum(raw?.ecaFixedValue),
    addersOnExports: bool(raw?.addersOnExports, DEFAULT_ASSUMPTIONS.addersOnExports),
  };
}

// --- configs: solar / wind / battery / costs / financing ------------------

/** A blank solar array, defaulted from data/equipment-presets.json. */
export function newSolarArray() {
  return {
    kwDC: 0,
    tilt: 20,
    azimuth: 180, // due south; see data/solar-shapes.json grid keys
    inverterEff: SOLAR_DEFAULTS.inverterEffDefault,
    lossFrac: SOLAR_DEFAULTS.lossStackDefaultFrac,
    degradationRate: SOLAR_DEFAULTS.degradationRateDefault,
  };
}

function normalizeSolarArray(raw) {
  const fallback = newSolarArray();
  return {
    kwDC: num(raw?.kwDC, fallback.kwDC),
    tilt: num(raw?.tilt, fallback.tilt),
    azimuth: num(raw?.azimuth, fallback.azimuth),
    inverterEff: num(raw?.inverterEff, fallback.inverterEff),
    lossFrac: num(raw?.lossFrac, fallback.lossFrac),
    degradationRate: num(raw?.degradationRate, fallback.degradationRate),
  };
}

function windPresetById(id) {
  return WIND_TURBINE_PRESETS.find((t) => t.id === id) || null;
}

/** A blank turbine seeded from a preset (first preset if none named). */
export function newTurbine(presetId) {
  const preset = windPresetById(presetId) || WIND_TURBINE_PRESETS[0] || null;
  return {
    presetId: preset?.id ?? null,
    powerCurve: preset?.curve ? preset.curve.map((p) => ({ ...p })) : [],
    hubHeightM: preset?.hubHeightDefaultM ?? 24,
    annualMeanWindMS: DEFAULT_ANNUAL_MEAN_WIND_MS,
  };
}

function normalizeTurbine(raw) {
  const preset = windPresetById(raw?.presetId);
  const fallback = newTurbine(raw?.presetId);
  return {
    presetId: fallback.presetId,
    powerCurve: Array.isArray(raw?.powerCurve) && raw.powerCurve.length ? raw.powerCurve : fallback.powerCurve,
    hubHeightM: num(raw?.hubHeightM, preset?.hubHeightDefaultM ?? fallback.hubHeightM),
    annualMeanWindMS: num(raw?.annualMeanWindMS, fallback.annualMeanWindMS),
  };
}

function batteryPresetById(id) {
  return BATTERY_PRESETS.find((b) => b.id === id) || null;
}

/**
 * Grid-charging window default: disabled. A battery's gridCharge is always a
 * concrete object here, never an absent key, so BatteryEditor.jsx and
 * model/runEngine.js's config->engine conversion never special-case its absence -- calc/battery.js's
 * contract already treats enabled:false as byte-identical to no gridCharge
 * field at all, so always sending this shape costs nothing at the engine.
 */
export const DEFAULT_GRID_CHARGE = {
  enabled: false,
  windowStartHour: 22,
  windowEndHour: 6,
  targetSocFrac: 1.0,
};

function normalizeGridCharge(raw) {
  return {
    enabled: bool(raw?.enabled, DEFAULT_GRID_CHARGE.enabled),
    windowStartHour: clamp(Math.round(num(raw?.windowStartHour, DEFAULT_GRID_CHARGE.windowStartHour)), 0, 23),
    windowEndHour: clamp(Math.round(num(raw?.windowEndHour, DEFAULT_GRID_CHARGE.windowEndHour)), 0, 23),
    targetSocFrac: clamp(num(raw?.targetSocFrac, DEFAULT_GRID_CHARGE.targetSocFrac), 0, 1),
  };
}

/**
 * Discharge-dispatch strategy default: self-consumption (target the full
 * hourly deficit). shaveThresholdKW is null rather than 0 in this mode --
 * calc/battery.js only reads it in 'peak-shave' mode, so there is no live
 * threshold to seed until the user actually switches modes.
 */
export const DEFAULT_DISPATCH = {
  mode: "self-consumption",
  shaveThresholdKW: null,
};

function normalizeDispatch(raw) {
  const mode = raw?.mode === "peak-shave" ? "peak-shave" : DEFAULT_DISPATCH.mode;
  return {
    mode,
    shaveThresholdKW: nullableNum(raw?.shaveThresholdKW),
  };
}

/**
 * A battery config seeded from one of data/equipment-presets.json's
 * batteries. Falls back to the first preset if the id doesn't match, since
 * "add a battery" always needs to produce something usable.
 */
export function batteryFromPreset(presetId) {
  const preset = batteryPresetById(presetId) || BATTERY_PRESETS[0];
  if (!preset) return null;
  return {
    presetId: preset.id,
    usableKWh: preset.usableKWh,
    roundTripEff: preset.roundTripEff,
    maxChargeKW: preset.maxChargeKW,
    maxDischargeKW: preset.maxDischargeKW,
    reserveFrac: DEFAULT_BATTERY_RESERVE_FRAC,
    cycleLife: preset.cycleLife,
    calendarLifeYears: preset.calendarLifeYears,
    gridCharge: { ...DEFAULT_GRID_CHARGE },
    dispatch: { ...DEFAULT_DISPATCH },
  };
}

function normalizeBattery(raw) {
  if (!raw || typeof raw !== "object") return null;
  const preset = batteryPresetById(raw.presetId);
  return {
    presetId: preset?.id ?? (typeof raw.presetId === "string" ? raw.presetId : null),
    usableKWh: num(raw.usableKWh, preset?.usableKWh ?? 0),
    roundTripEff: num(raw.roundTripEff, preset?.roundTripEff ?? 0.96),
    maxChargeKW: num(raw.maxChargeKW, preset?.maxChargeKW ?? 0),
    maxDischargeKW: num(raw.maxDischargeKW, preset?.maxDischargeKW ?? 0),
    reserveFrac: num(raw.reserveFrac, DEFAULT_BATTERY_RESERVE_FRAC),
    cycleLife: num(raw.cycleLife, preset?.cycleLife ?? 6000),
    calendarLifeYears: num(raw.calendarLifeYears, preset?.calendarLifeYears ?? 10),
    gridCharge: normalizeGridCharge(raw.gridCharge),
    dispatch: normalizeDispatch(raw.dispatch),
  };
}

/**
 * calc/battery.js's dispatchBattery wants separate charge/discharge
 * efficiencies; the schema stores one round-trip figure because that's the
 * number every datasheet and preset in data/equipment-presets.json publishes.
 * Split it evenly (each leg is the square root of the round trip) so
 * chargeEff * dischargeEff reproduces roundTripEff exactly, rather than
 * guessing how a manufacturer divided the loss between the two directions.
 */
export function batteryChargeDischargeEff(roundTripEff) {
  const eff = Math.sqrt(Math.max(0, roundTripEff ?? 0));
  return { chargeEff: eff, dischargeEff: eff };
}

/**
 * calc/incentives.js's five line-item types, in the order CostsEditor.jsx's
 * type <select> lists them: the three one-time (year-0 cost-reduction) types
 * first, then the two recurring (ownership-year income) types.
 */
export const INCENTIVE_TYPES = ["fixed", "percent", "perUnit", "annualProduction", "annualFixed"];

/** perUnit's `unit` enum (calc/incentives.js's unitQuantity), for CostsEditor.jsx's <select>. */
export const INCENTIVE_UNIT_OPTIONS = [
  { value: "kW-solar", label: "$/kW solar" },
  { value: "kWh-battery", label: "$/kWh battery" },
  { value: "kW-battery", label: "$/kW battery (power rating, not energy)" },
];

/**
 * Normalizes one incentive line item to exactly the shape calc/incentives.js's
 * resolveIncentives/resolveRecurringIncentiveIncome read: an unrecognized
 * `type` falls back to "fixed" (the original, pre-this-feature type) rather
 * than being dropped, so a malformed entry still becomes a usable, editable
 * line instead of silently vanishing from a household's saved list.
 * capAmount (percent, perUnit only) is nullable -- present but null means "no
 * cap," the same convention costs.solarGross/etc. already use elsewhere in
 * this file. years (annualProduction, annualFixed only) floors at 1: a
 * 0-or-negative years value would mean "never pays," which is not a state
 * this form's int field should be able to silently produce.
 */
function normalizeIncentive(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = INCENTIVE_TYPES.includes(raw.type) ? raw.type : "fixed";
  const label = str(raw.label, "");

  if (type === "percent") {
    return { label, type, percent: num(raw.percent, 0), capAmount: nullableNum(raw.capAmount) };
  }
  if (type === "perUnit") {
    const unit = INCENTIVE_UNIT_OPTIONS.some((o) => o.value === raw.unit) ? raw.unit : "kW-solar";
    return { label, type, unit, ratePerUnit: num(raw.ratePerUnit, 0), capAmount: nullableNum(raw.capAmount) };
  }
  if (type === "annualProduction") {
    return { label, type, ratePerKWh: num(raw.ratePerKWh, 0), years: Math.max(1, Math.round(num(raw.years, 1))) };
  }
  if (type === "annualFixed") {
    return { label, type, amount: num(raw.amount, 0), years: Math.max(1, Math.round(num(raw.years, 1))) };
  }
  return { label, type: "fixed", amount: num(raw.amount, 0) };
}

function defaultCosts() {
  return {
    solarGross: null,
    windGross: null,
    batteryGross: null,
    oAndMPerYear: 0,
    inverterReplacementYear: null,
    inverterReplacementCost: null,
    incentives: [],
  };
}

function normalizeCosts(raw) {
  return {
    solarGross: nullableNum(raw?.solarGross),
    windGross: nullableNum(raw?.windGross),
    batteryGross: nullableNum(raw?.batteryGross),
    oAndMPerYear: num(raw?.oAndMPerYear, 0),
    inverterReplacementYear: nullableNum(raw?.inverterReplacementYear),
    inverterReplacementCost: nullableNum(raw?.inverterReplacementCost),
    incentives: arr(raw?.incentives, []).map(normalizeIncentive).filter(Boolean),
  };
}

/**
 * Starting terms for a loan, only meaningful once financing.type is "loan";
 * a cash purchase ignores these. 20% down / 6% APR / 10-year term are a
 * plausible starting point for a solar loan, not a computed figure.
 */
function defaultFinancing() {
  return {
    type: "cash",
    downPaymentFrac: 0.2,
    aprPct: 6,
    termYears: 10,
  };
}

function normalizeFinancing(raw) {
  const fallback = defaultFinancing();
  const type = raw?.type === "loan" ? "loan" : "cash";
  return {
    type,
    downPaymentFrac: num(raw?.downPaymentFrac, fallback.downPaymentFrac),
    aprPct: num(raw?.aprPct, fallback.aprPct),
    termYears: num(raw?.termYears, fallback.termYears),
  };
}

function normalizeConfig(raw) {
  return {
    id: str(raw?.id, newId("config")),
    name: str(raw?.name, "A"),
    solar: { arrays: arr(raw?.solar?.arrays, []).map(normalizeSolarArray) },
    wind: { turbines: arr(raw?.wind?.turbines, []).map(normalizeTurbine) },
    battery: normalizeBattery(raw?.battery),
    costs: normalizeCosts(raw?.costs),
    financing: normalizeFinancing(raw?.financing),
  };
}

/** A blank config, named the next unused letter after `existing`. */
export function newConfig(existing = []) {
  return {
    id: newId("config"),
    name: nextConfigName(existing),
    solar: { arrays: [] },
    wind: { turbines: [] },
    battery: null,
    costs: defaultCosts(),
    financing: defaultFinancing(),
  };
}

/**
 * The two starter configs a fresh app state seeds: A is a bare 5 kW south-
 * facing array, B is the same array plus the cheapest battery preset, so the
 * default comparison already shows what a battery buys before a user has
 * entered anything.
 */
export function seedConfigs() {
  const configA = {
    id: newId("config"),
    name: "A",
    solar: { arrays: [{ ...newSolarArray(), kwDC: 5 }] },
    wind: { turbines: [] },
    battery: null,
    costs: defaultCosts(),
    financing: defaultFinancing(),
  };
  const configB = {
    ...structuredClone(configA),
    id: newId("config"),
    name: "B",
    battery: batteryFromPreset(BATTERY_PRESETS[0]?.id),
  };
  return [configA, configB];
}

/** Fresh app state for a first run: default household/assumptions, seeded configs. */
export function defaultState() {
  return {
    household: structuredClone(DEFAULT_HOUSEHOLD),
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    configs: seedConfigs(),
  };
}

/**
 * Fill in whatever a raw state object is missing, so a state saved before a
 * schema change (or a share link built by an older version) still loads.
 * `configs` defaults to an empty array here, not the two starter configs:
 * reseeding a fresh household/assumptions record with configs it never had
 * would silently invent systems the user never entered. `defaultState()` is
 * the one place that seeds; call it when storage.js's loadState() returns
 * null (nothing saved yet at all), not from inside this normalizer.
 */
export function normalizeState(raw) {
  return {
    household: normalizeHousehold(raw?.household),
    assumptions: normalizeAssumptions(raw?.assumptions),
    configs: arr(raw?.configs, []).map(normalizeConfig),
  };
}

/**
 * Builds a real Config from one of calc/sweep.js's sizing-explorer sweep
 * points -- ExplorerSection.jsx's "Add as configuration" action. Uses the
 * same default-equipment-parameter builders (calc/sweep.js's solarArraySpec/
 * batterySpec/turbineSpec) the sweep itself priced the point with, and pins
 * costs.solarGross/windGross/batteryGross to that same module's solarCost/
 * windCost/batteryCost rather than leaving them null for estimateCosts to
 * re-derive below -- battery cost in particular can come from
 * interpolatedBatteryCostPerKWh, a different formula than this file's own
 * blendedBatteryCostPerKWh fallback, so leaving it null could re-price the
 * promoted config away from the sweep point it was added from.
 * `pricingAssumptions` (calc/sweep.js's own SweepPricingAssumptions shape,
 * default {}) is the identical override object the sweep itself priced this
 * point with -- passed through to solarArraySpec/solarCost/windCost/
 * batteryCost for the same reason `incentives` is: a promoted config must
 * reproduce the exact figures the sweep showed, not silently fall back to
 * data/equipment-presets.json's own defaults for a point that was actually
 * priced (or angled -- tilt/azimuth reach solarArraySpec too) against an
 * explorer override.
 * oAndMPerYear/inverterReplacement are read straight off `point` itself
 * (calc/sweep.js's runSweep already computed them once, from that same
 * pricingAssumptions, against this point's own solar kW-DC) rather than
 * recomputed here a second time -- point is the one source of truth for
 * them, the same role it already plays for `upfront`.
 * `incentives` (calc/incentives.js line items, default []) carries straight
 * onto the promoted config's costs.incentives unchanged -- when it came from
 * ExplorerSection.jsx's own compact per-unit solar/battery incentive inputs,
 * this is what makes runSweep's own incentive resolution (see calc/sweep.js's
 * header) and CostsEditor.jsx's later resolveIncentives price the identical
 * line items against the identical sizes, since the promoted config's own
 * solar/battery sizes already match the point it was added from.
 * @param {{sizes:{solarKW:number, batteryKWh:number, windPresetId:string|null}, oAndMPerYear?:number, inverterReplacement?:{year:number,cost:number}|null}} point
 * @param {Config[]} existingConfigs
 * @param {Array} [incentives]
 * @param {import('../calc/sweep.js').SweepPricingAssumptions} [pricingAssumptions]
 */
export function configFromSweepPoint(point, existingConfigs = [], incentives = [], pricingAssumptions = {}) {
  const { solarKW, batteryKWh, windPresetId } = point.sizes;
  const config = newConfig(existingConfigs);

  if (solarKW > 0) config.solar = { arrays: [solarArraySpec(solarKW, pricingAssumptions)] };

  const turbine = turbineSpec(windPresetId);
  if (turbine) config.wind = { turbines: [turbine] };

  const battery = batterySpec(batteryKWh);
  if (battery) {
    config.battery = {
      ...battery,
      gridCharge: { ...DEFAULT_GRID_CHARGE },
      dispatch: { ...DEFAULT_DISPATCH },
    };
  }

  config.costs = {
    ...defaultCosts(),
    solarGross: solarKW > 0 ? solarCost(solarKW, pricingAssumptions) : null,
    windGross: turbine ? windCost(windPresetId, pricingAssumptions) : null,
    batteryGross: battery ? batteryCost(batteryKWh, pricingAssumptions) : null,
    oAndMPerYear: point.oAndMPerYear || 0,
    inverterReplacementYear: point.inverterReplacement?.year ?? null,
    inverterReplacementCost: point.inverterReplacement?.cost ?? null,
    incentives,
  };

  return config;
}

/**
 * Fills only the gross-cost fields a config left null, from
 * data/equipment-presets.json's $/W (solar), $/kW (wind), and per-preset or
 * blended $/kWh (battery) figures. An explicit 0 is left alone -- only
 * `null` means "not entered yet" -- so a user who priced a system at $0 (a
 * gift, a demo unit) doesn't get it silently overwritten on the next render.
 */
export function estimateCosts(config, presets) {
  const costs = config?.costs || defaultCosts();
  return {
    ...costs,
    solarGross: costs.solarGross ?? estimateSolarGross(config?.solar, presets),
    windGross: costs.windGross ?? estimateWindGross(config?.wind, presets),
    batteryGross: costs.batteryGross ?? estimateBatteryGross(config?.battery, presets),
  };
}

function estimateSolarGross(solar, presets) {
  const perWatt = presets?.solar?.costPerWattInstalled?.value ?? 0;
  return (solar?.arrays || []).reduce((sum, a) => sum + (a.kwDC || 0) * 1000 * perWatt, 0);
}

function turbineRatedKW(turbine) {
  return (turbine?.powerCurve || []).reduce((max, p) => Math.max(max, p.kw || 0), 0);
}

function estimateWindGross(wind, presets) {
  const perKW = presets?.wind?.costPerKWInstalled?.value ?? 0;
  return (wind?.turbines || []).reduce((sum, t) => sum + turbineRatedKW(t) * perKW, 0);
}

/** Blended $/kWh across every battery preset, used when a battery matches no preset (a custom size). */
function blendedBatteryCostPerKWh(presets) {
  const batteries = presets?.batteries || [];
  if (!batteries.length) return 0;
  const perKWh = batteries.map((b) => b.installedCostUSD / b.usableKWh);
  return perKWh.reduce((sum, v) => sum + v, 0) / perKWh.length;
}

function estimateBatteryGross(battery, presets) {
  if (!battery) return 0;
  const preset = (presets?.batteries || []).find((b) => b.id === battery.presetId);
  if (preset) {
    if (battery.usableKWh === preset.usableKWh) return preset.installedCostUSD;
    return (preset.installedCostUSD / preset.usableKWh) * (battery.usableKWh || 0);
  }
  return blendedBatteryCostPerKWh(presets) * (battery.usableKWh || 0);
}
