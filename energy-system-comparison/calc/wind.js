// Hourly production for a small wind turbine.
//
// This is an energy-estimate method, not a weather simulation: there is no
// public hourly wind-speed record for the Lodi site (see data/wind.json
// meta.diurnal.methodology / meta.seasonal.methodology), so hourly mean
// speeds are constructed deterministically from a single annual mean and two
// stylized, hand-authored shape curves (diurnal and seasonal multipliers,
// each with an exact mean of 1.0). Given the same inputs this always returns
// the same series: there is no Math.random() anywhere in this module.
//
// Each hour's shape-scaled mean speed is then treated as the mean of a
// Rayleigh-distributed wind speed for that hour (the standard wind-resource
// assumption CONTRACTS.md refers to), and turbine output is the expectation
// of the power curve over that distribution, evaluated by deterministic
// numeric quadrature (Simpson's rule) rather than by sampling.

import windData from "../data/wind.json";
import { HOURS_PER_YEAR, monthOfHour, hourOfDay } from "./time.js";

/**
 * annualMeanWindMS is defined as measured at this height (m) above ground;
 * WindEditor.jsx's label reflects this. Turbine hub heights are extrapolated
 * from it via the power-law shear model (WIND_SHEAR_ALPHA below).
 */
export const REFERENCE_HEIGHT_M = 10;

/**
 * Power-law wind-shear exponent used to extrapolate REFERENCE_HEIGHT_M wind
 * speed up to a turbine's hub height: speedAtHub = speedRef * (hubHeightM /
 * REFERENCE_HEIGHT_M) ^ WIND_SHEAR_ALPHA. 1/7 is the standard open-terrain
 * exponent (Hellmann/"one-seventh power law"), appropriate for the flat,
 * unobstructed Central Valley floor this calculator targets.
 */
export const WIND_SHEAR_ALPHA = 1 / 7;

/**
 * Sub-intervals for the per-hour Simpson's-rule quadrature (31 evaluation
 * points). Curves in data/wind.json are continuous (no cut-in/cut-out jump:
 * cut-in is approached at 0 kW, and above the last point output holds
 * flat -- see powerAt), so a fixed low-order rule tracks the true integral to
 * well under 1% across the vm range these presets cover.
 */
const RAYLEIGH_QUADRATURE_INTERVALS = 30;

/**
 * Multiple of the hour's mean speed to integrate out to. The Rayleigh tail
 * beyond 6x the mean carries negligible probability mass (CDF(6*vm) is
 * within 1e-12 of 1), so truncating here rather than integrating to
 * infinity does not measurably bias the result.
 */
const RAYLEIGH_INTEGRATION_SPAN = 6;

/**
 * Meteorological season for the diurnal shape lookup: winter = Dec-Feb,
 * spring = Mar-May, summer = Jun-Aug, fall = Sep-Nov. This is the season
 * split data/wind.json's diurnal tables are keyed by; it is unrelated to the
 * LEU tariff summer window (isLeuSummer, May-Oct) in time.js, which this
 * module has no reason to use.
 */
function diurnalSeason(monthIdx) {
  if (monthIdx === 11 || monthIdx <= 1) return "winter";
  if (monthIdx <= 4) return "spring";
  if (monthIdx <= 7) return "summer";
  return "fall";
}

/**
 * Unitless per-hour shape factor (diurnal x seasonal), renormalized so its
 * own mean across the 8760 hours is exactly 1. The two source tables are
 * each independently mean-1 (see data/wind.json meta), but their hour-weighted
 * product need not be exactly 1 once combined across a real calendar, and an
 * un-renormalized shape would drift the annual mean away from
 * annualMeanWindMS.
 */
function buildAnnualShape() {
  const raw = new Array(HOURS_PER_YEAR);
  let sum = 0;
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const month = monthOfHour(h);
    const diurnalFactor = windData.diurnal[diurnalSeason(month)][hourOfDay(h)];
    const seasonalFactor = windData.seasonal[month];
    const value = diurnalFactor * seasonalFactor;
    raw[h] = value;
    sum += value;
  }
  const mean = sum / HOURS_PER_YEAR;
  return raw.map((v) => v / mean);
}

/**
 * Power output (kW) at wind speed `ms`, linearly interpolated on the turbine
 * curve. Below the first curve point (cut-in) output is 0. Above the last
 * curve point, output holds flat at that point's kw (the extrapolation
 * data/wind.json's meta.powerCurves.structure specifies), unless `cutOutMS`
 * is given, in which case output is 0 for any speed above it.
 */
function powerAt(curve, ms, cutOutMS) {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (ms < first.ms) return 0;
  if (cutOutMS != null && ms > cutOutMS) return 0;
  if (ms >= last.ms) return last.kw;

  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (ms >= a.ms && ms <= b.ms) {
      const frac = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
      return a.kw + (b.kw - a.kw) * frac;
    }
  }
  return last.kw;
}

/** Rayleigh probability density at speed `v` (m/s) for mean speed `vm`. */
function rayleighPdf(v, vm) {
  if (vm <= 0) return 0;
  const x = v / vm;
  return ((Math.PI / 2) * v) / (vm * vm) * Math.exp((-Math.PI / 4) * x * x);
}

/**
 * Expected power (kW) for one hour, integrating the turbine curve against a
 * Rayleigh distribution whose mean is that hour's shape-scaled speed `vm`.
 * Composite Simpson's rule over [0, RAYLEIGH_INTEGRATION_SPAN * vm].
 */
function expectedPower(curve, vm, cutOutMS) {
  if (!(vm > 0)) return 0;

  const upper = vm * RAYLEIGH_INTEGRATION_SPAN;
  const n = RAYLEIGH_QUADRATURE_INTERVALS;
  const step = upper / n;

  const weighted = (v) => powerAt(curve, v, cutOutMS) * rayleighPdf(v, vm);

  let acc = weighted(0) + weighted(upper);
  for (let i = 1; i < n; i++) {
    acc += (i % 2 === 0 ? 2 : 4) * weighted(i * step);
  }
  return (step / 3) * acc;
}

/**
 * Hourly production (kWh) for one or more turbines, summed together.
 *
 * `year` is accepted for signature symmetry with solar/battery but wind
 * output has no degradation model here, so it does not affect the result.
 */
export function windHourly({ turbines, year }) {
  void year; // accepted per contract; no degradation model applies to it here.
  const shape = buildAnnualShape();
  const total = new Array(HOURS_PER_YEAR).fill(0);

  for (const turbine of turbines || []) {
    const speedRef = turbine.annualMeanWindMS || 0;
    const hubHeightM = turbine.hubHeightM ?? REFERENCE_HEIGHT_M;
    const shearFactor = Math.pow(Math.max(hubHeightM, 0) / REFERENCE_HEIGHT_M, WIND_SHEAR_ALPHA);
    const meanAtHub = speedRef * shearFactor;

    const preset = windData.powerCurves.presets.find((p) => p.id === turbine.presetId);
    const cutOutMS = preset?.cutOutMS ?? null;

    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const hourMean = meanAtHub * shape[h];
      total[h] += expectedPower(turbine.powerCurve, hourMean, cutOutMS);
    }
  }

  return total;
}
