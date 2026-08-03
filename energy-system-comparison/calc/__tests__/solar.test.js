import { describe, it, expect } from "vitest";
import { solarHourly, DEFAULT_LOSS_FRAC, DEFAULT_INVERTER_EFF } from "../solar.js";
import { HOURS_PER_YEAR } from "../time.js";
import solarShapes from "../../data/solar-shapes.json";

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

describe("solarHourly", () => {
  it("returns a length-8760 series", () => {
    const out = solarHourly({ arrays: [{ kwDC: 5, tilt: 20, azimuth: 180 }], year: 0 });
    expect(out).toHaveLength(HOURS_PER_YEAR);
  });

  it("scales linearly with kwDC: doubling kwDC doubles every hour", () => {
    const base = solarHourly({ arrays: [{ kwDC: 5, tilt: 20, azimuth: 180 }], year: 0 });
    const doubled = solarHourly({ arrays: [{ kwDC: 10, tilt: 20, azimuth: 180 }], year: 0 });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(doubled[h]).toBeCloseTo(base[h] * 2, 9);
    }
  });

  it("sums multiple arrays hour by hour", () => {
    const a = solarHourly({ arrays: [{ kwDC: 3, tilt: 20, azimuth: 180 }], year: 0 });
    const b = solarHourly({ arrays: [{ kwDC: 7, tilt: 10, azimuth: 90 }], year: 0 });
    const combined = solarHourly({
      arrays: [
        { kwDC: 3, tilt: 20, azimuth: 180 },
        { kwDC: 7, tilt: 10, azimuth: 90 },
      ],
      year: 0,
    });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(combined[h]).toBeCloseTo(a[h] + b[h], 9);
    }
  });

  it("matches a grid point exactly (no interpolation) at (20, 180)", () => {
    const out = solarHourly({ arrays: [{ kwDC: 1, tilt: 20, azimuth: 180 }], year: 0 });
    const expected = solarShapes.grid.t20_a180;
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(out[h]).toBeCloseTo(expected[h], 9);
    }
  });

  it("brackets the four corner shapes when interpolating tilt and azimuth", () => {
    // Midpoint of tilt (20,30) and azimuth (135,180): every hour of the
    // bilinear result must lie within the min/max of the four corners.
    const out = solarHourly({ arrays: [{ kwDC: 1, tilt: 25, azimuth: 157.5 }], year: 0 });
    const corners = [
      solarShapes.grid.t20_a135,
      solarShapes.grid.t20_a180,
      solarShapes.grid.t30_a135,
      solarShapes.grid.t30_a180,
    ];
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const values = corners.map((c) => c[h]);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      expect(out[h]).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(out[h]).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it("is the exact average of the four corners at the grid's midpoint (tilt 25, azimuth 157.5)", () => {
    const out = solarHourly({ arrays: [{ kwDC: 1, tilt: 25, azimuth: 157.5 }], year: 0 });
    const corners = [
      solarShapes.grid.t20_a135,
      solarShapes.grid.t20_a180,
      solarShapes.grid.t30_a135,
      solarShapes.grid.t30_a180,
    ];
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const avg = corners.reduce((s, c) => s + c[h], 0) / 4;
      expect(out[h]).toBeCloseTo(avg, 9);
    }
  });

  it("clamps tilt and azimuth outside the grid hull to the nearest edge", () => {
    const clampedLow = solarHourly({ arrays: [{ kwDC: 1, tilt: 0, azimuth: 45 }], year: 0 });
    const edge = solarHourly({ arrays: [{ kwDC: 1, tilt: 10, azimuth: 90 }], year: 0 });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(clampedLow[h]).toBeCloseTo(edge[h], 9);
    }

    const clampedHigh = solarHourly({ arrays: [{ kwDC: 1, tilt: 90, azimuth: 999 }], year: 0 });
    const highEdge = solarHourly({ arrays: [{ kwDC: 1, tilt: 40, azimuth: 270 }], year: 0 });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(clampedHigh[h]).toBeCloseTo(highEdge[h], 9);
    }
  });

  it("compounds degradation as (1 - degradationRate)^year", () => {
    const array = { kwDC: 5, tilt: 20, azimuth: 180, degradationRate: 0.005 };
    const year0 = solarHourly({ arrays: [array], year: 0 });
    const year10 = solarHourly({ arrays: [array], year: 10 });
    const expectedFactor = Math.pow(1 - 0.005, 10);
    expect(sum(year10) / sum(year0)).toBeCloseTo(expectedFactor, 9);
  });

  it("applies no degradation in year 0", () => {
    const array = { kwDC: 5, tilt: 20, azimuth: 180, degradationRate: 0.01 };
    const out = solarHourly({ arrays: [array], year: 0 });
    const noRate = solarHourly({ arrays: [{ ...array, degradationRate: 0 }], year: 0 });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(out[h]).toBeCloseTo(noRate[h], 9);
    }
  });

  it("normalizes lossFrac/inverterEff relative to the PVWatts baseline", () => {
    const baseline = solarHourly({ arrays: [{ kwDC: 5, tilt: 20, azimuth: 180 }], year: 0 });
    const explicitDefaults = solarHourly({
      arrays: [
        { kwDC: 5, tilt: 20, azimuth: 180, lossFrac: DEFAULT_LOSS_FRAC, inverterEff: DEFAULT_INVERTER_EFF },
      ],
      year: 0,
    });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(explicitDefaults[h]).toBeCloseTo(baseline[h], 9);
    }

    // Halving the loss fraction below baseline should scale output up by
    // (1 - lossFrac) / (1 - DEFAULT_LOSS_FRAC).
    const lowerLoss = solarHourly({
      arrays: [{ kwDC: 5, tilt: 20, azimuth: 180, lossFrac: 0.07 }],
      year: 0,
    });
    const expectedFactor = (1 - 0.07) / (1 - DEFAULT_LOSS_FRAC);
    expect(sum(lowerLoss) / sum(baseline)).toBeCloseTo(expectedFactor, 9);

    const betterInverter = solarHourly({
      arrays: [{ kwDC: 5, tilt: 20, azimuth: 180, inverterEff: 0.98 }],
      year: 0,
    });
    const expectedInverterFactor = 0.98 / DEFAULT_INVERTER_EFF;
    expect(sum(betterInverter) / sum(baseline)).toBeCloseTo(expectedInverterFactor, 9);
  });

  it("returns all zeros for no arrays", () => {
    const out = solarHourly({ arrays: [], year: 0 });
    expect(sum(out)).toBe(0);
    expect(out).toHaveLength(HOURS_PER_YEAR);
  });
});
