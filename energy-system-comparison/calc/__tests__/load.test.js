import { describe, it, expect } from "vitest";
import { loadHourly } from "../load.js";
import { HOURS_PER_YEAR, monthOfHour, dayOfWeek } from "../time.js";

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function monthlySums(series) {
  const totals = new Array(12).fill(0);
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    totals[monthOfHour(h)] += series[h];
  }
  return totals;
}

describe("loadHourly - hourly mode", () => {
  it("passes a valid hourlyKWh series through unchanged", () => {
    const hourlyKWh = new Array(HOURS_PER_YEAR).fill(0).map((_, i) => i % 5);
    const { base } = loadHourly({ mode: "hourly", hourlyKWh, profileId: "residential" });
    expect(base).toEqual(hourlyKWh);
  });

  it("rejects a series of the wrong length", () => {
    expect(() =>
      loadHourly({ mode: "hourly", hourlyKWh: new Array(100).fill(1), profileId: "residential" }),
    ).toThrow();
  });
});

describe("loadHourly - annual mode", () => {
  it("returns a length-8760 base series", () => {
    const { base } = loadHourly({ mode: "annual", annualKWh: 12000, profileId: "residential" });
    expect(base).toHaveLength(HOURS_PER_YEAR);
  });

  it("reconstructs the given annualKWh exactly", () => {
    const { base } = loadHourly({ mode: "annual", annualKWh: 12000, profileId: "residential" });
    expect(sum(base)).toBeCloseTo(12000, 6);
  });

  it("scales linearly with annualKWh", () => {
    const a = loadHourly({ mode: "annual", annualKWh: 5000, profileId: "small-commercial" }).base;
    const b = loadHourly({ mode: "annual", annualKWh: 10000, profileId: "small-commercial" }).base;
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(b[h]).toBeCloseTo(a[h] * 2, 9);
    }
  });

  it("rejects an unknown profileId", () => {
    expect(() => loadHourly({ mode: "annual", annualKWh: 1000, profileId: "nope" })).toThrow();
  });
});

describe("loadHourly - monthly mode", () => {
  it("rescales each calendar month to sum to exactly the given kWh", () => {
    const monthlyKWh = [800, 700, 750, 650, 600, 900, 1100, 1050, 800, 700, 750, 850];
    const { base } = loadHourly({ mode: "monthly", monthlyKWh, profileId: "residential" });
    const totals = monthlySums(base);
    for (let m = 0; m < 12; m++) {
      expect(totals[m]).toBeCloseTo(monthlyKWh[m], 6);
    }
  });

  it("matches regardless of a month's weekday/weekend mix, since every day-type template sums to 1.0", () => {
    const monthlyKWh = new Array(12).fill(1000);
    const { base: residential } = loadHourly({ mode: "monthly", monthlyKWh, profileId: "residential" });
    const { base: commercial } = loadHourly({
      mode: "monthly",
      monthlyKWh,
      profileId: "small-commercial",
    });
    expect(monthlySums(residential).every((t) => Math.abs(t - 1000) < 1e-6)).toBe(true);
    expect(monthlySums(commercial).every((t) => Math.abs(t - 1000) < 1e-6)).toBe(true);
  });

  it("rejects a monthlyKWh array that isn't length 12", () => {
    expect(() =>
      loadHourly({ mode: "monthly", monthlyKWh: [1, 2, 3], profileId: "residential" }),
    ).toThrow();
  });
});

describe("loadHourly - EV slice", () => {
  it("spreads kWhPerDay evenly across the charging window on active days", () => {
    const { ev } = loadHourly({
      mode: "annual",
      annualKWh: 6000,
      profileId: "residential",
      ev: { kWhPerDay: 10, windowStartHour: 22, windowEndHour: 6, daysPerWeek: 5 },
    });

    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const hour = h % 24;
      const inWindow = hour >= 22 || hour < 6;
      const active = dayOfWeek(h) >= 1 && dayOfWeek(h) <= 5; // Mon-Fri
      if (inWindow && active) {
        expect(ev[h]).toBeCloseTo(10 / 8, 9); // 8-hour window
      } else {
        expect(ev[h]).toBe(0);
      }
    }
  });

  it("restricts charging to only the first daysPerWeek days starting Monday", () => {
    const { ev } = loadHourly({
      mode: "annual",
      annualKWh: 6000,
      profileId: "residential",
      ev: { kWhPerDay: 8, windowStartHour: 0, windowEndHour: 4, daysPerWeek: 2 },
    });
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const dow = dayOfWeek(h);
      const active = dow === 1 || dow === 2; // Mon, Tue only
      if (!active) expect(ev[h]).toBe(0);
    }
    // Some hours on Monday/Tuesday within the window should be nonzero.
    const anyCharging = ev.some((v) => v > 0);
    expect(anyCharging).toBe(true);
  });

  it("charges every day when daysPerWeek is 7", () => {
    const { ev } = loadHourly({
      mode: "annual",
      annualKWh: 6000,
      profileId: "residential",
      ev: { kWhPerDay: 4, windowStartHour: 1, windowEndHour: 3, daysPerWeek: 7 },
    });
    let daysSeen = new Set();
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      if (ev[h] > 0) daysSeen.add(dayOfWeek(h));
    }
    expect(daysSeen.size).toBe(7);
  });

  it("charges nothing when kWhPerDay is 0 or ev is omitted", () => {
    const { ev: withZero } = loadHourly({
      mode: "annual",
      annualKWh: 6000,
      profileId: "residential",
      ev: { kWhPerDay: 0, windowStartHour: 0, windowEndHour: 6, daysPerWeek: 7 },
    });
    expect(sum(withZero)).toBe(0);

    const { ev: withNone } = loadHourly({ mode: "annual", annualKWh: 6000, profileId: "residential" });
    expect(sum(withNone)).toBe(0);
  });

  it("reconstructs kWhPerDay exactly per active day, summed over the year", () => {
    const kWhPerDay = 9;
    const { ev } = loadHourly({
      mode: "annual",
      annualKWh: 6000,
      profileId: "residential",
      ev: { kWhPerDay, windowStartHour: 9, windowEndHour: 17, daysPerWeek: 5 },
    });
    const activeDayCount = (() => {
      let count = 0;
      for (let day = 0; day < 365; day++) {
        const dow = dayOfWeek(day * 24);
        if (dow >= 1 && dow <= 5) count++;
      }
      return count;
    })();
    expect(sum(ev)).toBeCloseTo(kWhPerDay * activeDayCount, 6);
  });
});
