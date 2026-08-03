// AC production for a rooftop/ground PV system, built on bundled PVWatts
// hourly shapes (data/solar-shapes.json).

import solarShapes from "../data/solar-shapes.json";
import { HOURS_PER_YEAR } from "./time.js";
import { DEFAULT_LOSS_FRAC, DEFAULT_INVERTER_EFF } from "./solarDefaults.js";

// Re-exported for every existing caller: the two constants themselves now
// live in calc/solarDefaults.js (see that file's header for why), with no
// change to where anyone already imports them from.
export { DEFAULT_LOSS_FRAC, DEFAULT_INVERTER_EFF };

// Read lazily (inside a function, not at module top level) rather than as a
// module-scope const: a bare `solarShapes.meta.params.tilts` property read
// at the top of the file is a statement Rollup's tree-shaking conservatively
// never eliminates (property reads are treated as potentially having side
// effects, e.g. a getter, regardless of whether the read result is later
// used), which would keep this whole module -- and the ~2.4 MB JSON behind
// it -- in any bundle that so much as imports solarHourly, even one that
// never actually calls it. Deferred into a function, the read (and the
// import backing it) is eliminated along with the rest of this module by
// ordinary unused-function elimination when nothing calls solarHourly.
let gridAxes = null;
function gridAxesOnce() {
  if (!gridAxes) {
    gridAxes = { tilts: solarShapes.meta.params.tilts, azimuths: solarShapes.meta.params.azimuths };
  }
  return gridAxes;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Locates `value` within an ascending grid, clamping to the grid's own range
 * first (data/solar-shapes.json is a full rectangular tilt x azimuth lattice,
 * so clamping each axis independently is equivalent to clamping to the hull).
 * Returns the bracketing grid values and the fractional position between them.
 */
function bracket(value, grid) {
  const v = clamp(value, grid[0], grid[grid.length - 1]);
  for (let i = 0; i < grid.length - 1; i++) {
    const lo = grid[i];
    const hi = grid[i + 1];
    if (v >= lo && v <= hi) {
      return { lo, hi, frac: hi === lo ? 0 : (v - lo) / (hi - lo) };
    }
  }
  // Unreachable given the clamp above, but keeps the function total.
  return { lo: grid[0], hi: grid[0], frac: 0 };
}

function gridKey(tilt, azimuth) {
  return `t${tilt}_a${azimuth}`;
}

/**
 * Per-kW-DC AC output shape for an arbitrary (tilt, azimuth), bilinearly
 * interpolated between the four nearest data/solar-shapes.json grid points.
 * Values outside the grid's tilt/azimuth range are clamped to the nearest
 * edge rather than extrapolated.
 */
function interpolatedShape(tilt, azimuth) {
  const { tilts, azimuths } = gridAxesOnce();
  const t = bracket(tilt, tilts);
  const a = bracket(azimuth, azimuths);

  const s00 = solarShapes.grid[gridKey(t.lo, a.lo)];
  const s01 = solarShapes.grid[gridKey(t.lo, a.hi)];
  const s10 = solarShapes.grid[gridKey(t.hi, a.lo)];
  const s11 = solarShapes.grid[gridKey(t.hi, a.hi)];

  const w00 = (1 - t.frac) * (1 - a.frac);
  const w01 = (1 - t.frac) * a.frac;
  const w10 = t.frac * (1 - a.frac);
  const w11 = t.frac * a.frac;

  const shape = new Array(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    shape[h] = s00[h] * w00 + s01[h] * w01 + s10[h] * w10 + s11[h] * w11;
  }
  return shape;
}

/**
 * Hourly AC production (kWh) for a PV system, summed across arrays.
 *
 * `year` is the zero-based year index into the horizon (year 0 = the system's
 * first operating year, at full nameplate output); degradationRate compounds
 * as (1 - degradationRate)^year, so year 0 always applies a factor of 1.
 *
 * lossFrac/inverterEff scale the bundled baseline rather than replacing it:
 * the shapes already reflect DEFAULT_LOSS_FRAC/DEFAULT_INVERTER_EFF, so a
 * caller's override is applied as (1 - lossFrac)/(1 - DEFAULT_LOSS_FRAC) and
 * inverterEff/DEFAULT_INVERTER_EFF, both of which equal 1 when the caller
 * leaves the defaults in place.
 */
export function solarHourly({ arrays, year }) {
  const total = new Array(HOURS_PER_YEAR).fill(0);

  for (const array of arrays || []) {
    const shape = interpolatedShape(array.tilt, array.azimuth);
    const lossFrac = array.lossFrac ?? DEFAULT_LOSS_FRAC;
    const inverterEff = array.inverterEff ?? DEFAULT_INVERTER_EFF;
    const lossFactor = (1 - lossFrac) / (1 - DEFAULT_LOSS_FRAC);
    const inverterFactor = inverterEff / DEFAULT_INVERTER_EFF;
    const degradation = Math.pow(1 - (array.degradationRate || 0), year || 0);
    const scale = (array.kwDC || 0) * lossFactor * inverterFactor * degradation;

    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      total[h] += shape[h] * scale;
    }
  }

  return total;
}
