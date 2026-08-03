import { describe, it, expect } from "vitest";
import { windHourly, WIND_SHEAR_ALPHA, REFERENCE_HEIGHT_M } from "../wind.js";
import { HOURS_PER_YEAR, monthOfHour, hourOfDay } from "../time.js";
import windData from "../../data/wind.json";

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Independently reconstructs the module's normalized annual shape from the
 * bundled data, so tests can predict exact hourly speeds without duplicating
 * wind.js's internals into the assertions themselves.
 */
function referenceShape() {
  function diurnalSeason(monthIdx) {
    if (monthIdx === 11 || monthIdx <= 1) return "winter";
    if (monthIdx <= 4) return "spring";
    if (monthIdx <= 7) return "summer";
    return "fall";
  }
  const raw = new Array(HOURS_PER_YEAR);
  let total = 0;
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const month = monthOfHour(h);
    const v = windData.diurnal[diurnalSeason(month)][hourOfDay(h)] * windData.seasonal[month];
    raw[h] = v;
    total += v;
  }
  const mean = total / HOURS_PER_YEAR;
  return raw.map((v) => v / mean);
}

/**
 * Independent reimplementation of the pre-fix windHourly algorithm: hourly
 * speed is looked up directly on the curve (no Rayleigh spread), and speed
 * above the last curve point is treated as a hard cut-out. Used only to give
 * the Rayleigh-uplift regression test (below) an independent "old method"
 * baseline to compare against, not to assert anything about wind.js's
 * current behavior directly.
 */
function shapeOnlyEnergy(curve, annualMeanWindMS) {
  const shape = referenceShape();
  function powerAtHardCutoff(ms) {
    const first = curve[0];
    const last = curve[curve.length - 1];
    if (ms < first.ms || ms > last.ms) return 0;
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
  let total = 0;
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    total += powerAtHardCutoff(annualMeanWindMS * shape[h]);
  }
  return total;
}

const BERGEY_CURVE = windData.powerCurves.presets.find((p) => p.id === "bergey-excel-6").curve;

describe("windHourly", () => {
  it("returns a length-8760 series", () => {
    const out = windHourly({
      turbines: [{ powerCurve: [{ ms: 3, kw: 0 }, { ms: 12, kw: 5 }], annualMeanWindMS: 5 }],
      year: 0,
    });
    expect(out).toHaveLength(HOURS_PER_YEAR);
  });

  it("sums multiple turbines hour by hour", () => {
    const curve = [{ ms: 3, kw: 0 }, { ms: 12, kw: 5 }];
    const a = windHourly({ turbines: [{ powerCurve: curve, annualMeanWindMS: 5 }], year: 0 });
    const b = windHourly({ turbines: [{ powerCurve: curve, annualMeanWindMS: 7 }], year: 0 });
    const combined = windHourly({
      turbines: [
        { powerCurve: curve, annualMeanWindMS: 5 },
        { powerCurve: curve, annualMeanWindMS: 7 },
      ],
      year: 0,
    });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(combined[h]).toBeCloseTo(a[h] + b[h], 9);
    }
  });

  it("returns all zeros when the entire curve is 0 kW", () => {
    const out = windHourly({
      turbines: [{ powerCurve: [{ ms: 3, kw: 0 }, { ms: 25, kw: 0 }], annualMeanWindMS: 6 }],
      year: 0,
    });
    expect(sum(out)).toBe(0);
  });

  it("analytic check: a curve covering every reachable speed returns rated power every hour", () => {
    // With the curve flat at ratedKW across [0, 100] -- wider than any speed
    // RAYLEIGH_INTEGRATION_SPAN * vm can reach for these means -- the
    // Rayleigh quadrature is integrating probability density over its whole
    // support, which must total 1 regardless of vm.
    const annualMeanWindMS = 5;
    const ratedKW = 3;
    const powerCurve = [
      { ms: 0, kw: ratedKW },
      { ms: 100, kw: ratedKW },
    ];
    const out = windHourly({ turbines: [{ powerCurve, annualMeanWindMS }], year: 0 });
    expect(sum(out) / (ratedKW * HOURS_PER_YEAR)).toBeCloseTo(1, 3);
  });

  it("analytic check: cut-in above every reachable speed returns zero every hour", () => {
    const annualMeanWindMS = 5;
    const powerCurve = [
      { ms: 100, kw: 10 },
      { ms: 200, kw: 10 },
    ];
    const out = windHourly({ turbines: [{ powerCurve, annualMeanWindMS }], year: 0 });
    expect(sum(out)).toBe(0);
  });

  it("returns zero for no turbines", () => {
    const out = windHourly({ turbines: [], year: 0 });
    expect(sum(out)).toBe(0);
  });

  // --- Regression: hubHeightM now feeds a wind-shear correction (finding: ---
  // "hub height is an editable input on every turbine row but changes
  // nothing"). Before the fix, this was flat across every hub height because
  // hubHeightM was never read.
  it("raises annual energy as hub height rises, holding annualMeanWindMS fixed", () => {
    const hubHeights = [10, 20, 40, 80, 150];
    let previous = -Infinity;
    for (const hubHeightM of hubHeights) {
      const out = windHourly({
        turbines: [{ powerCurve: BERGEY_CURVE, annualMeanWindMS: 5, hubHeightM }],
        year: 0,
      });
      const total = sum(out);
      expect(total).toBeGreaterThan(previous);
      previous = total;
    }
  });

  it("applies the documented power-law shear exponent and reference height", () => {
    // WIND_SHEAR_ALPHA / REFERENCE_HEIGHT_M are the assumptions-page-facing
    // contract for how hubHeightM is used; pin their values directly.
    expect(REFERENCE_HEIGHT_M).toBe(10);
    expect(WIND_SHEAR_ALPHA).toBeCloseTo(1 / 7, 9);
  });

  // --- Regression: hourly speeds are now Rayleigh-distributed around each ---
  // hour's shape-scaled mean, not looked up as a single deterministic point
  // (finding: "deterministic mean-1 shape ... understating annual wind
  // energy by 22% at the app's default 4 m/s"). Before the fix, windHourly's
  // output matched shapeOnlyEnergy (the old method) almost exactly; the fix
  // must raise it materially at low mean wind speeds.
  it("produces materially more annual energy than a shape-only deterministic lookup at a low mean wind speed", () => {
    const annualMeanWindMS = 4; // DEFAULT_ANNUAL_MEAN_WIND_MS
    const out = windHourly({ turbines: [{ powerCurve: BERGEY_CURVE, annualMeanWindMS }], year: 0 });
    const rayleighEnergy = sum(out);
    const oldMethodEnergy = shapeOnlyEnergy(BERGEY_CURVE, annualMeanWindMS);

    expect(rayleighEnergy).toBeGreaterThan(oldMethodEnergy * 1.15);
  });

  // --- Regression: speeds above the curve's last point now hold that ---
  // point's kw instead of hard-cutting to 0 (finding: "powerAt() treats the
  // last power-curve point as a hard cut-out, making annual energy fall as
  // mean wind speed rises above ~10 m/s"). Before the fix, this sweep had
  // dozens of points where raising the mean wind speed lowered annual
  // energy.
  it("does not lose annual energy as mean wind speed rises past the curve's last defined point", () => {
    let previous = -Infinity;
    for (let annualMeanWindMS = 1; annualMeanWindMS <= 25; annualMeanWindMS += 1) {
      const out = windHourly({ turbines: [{ powerCurve: BERGEY_CURVE, annualMeanWindMS }], year: 0 });
      const total = sum(out);
      expect(total).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = total;
    }
  });
});
