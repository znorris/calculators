import { describe, it, expect } from "vitest";
import {
  resolveIncentives,
  resolveRecurringIncentiveIncome,
  FEDERAL_25D_STATUS,
  CA_PROPERTY_TAX_NOTE,
} from "../incentives.js";

describe("resolveIncentives", () => {
  it("resolves a fixed line item at face value regardless of gross cost", () => {
    const { total, lines } = resolveIncentives([{ label: "Utility rebate", type: "fixed", amount: 750 }], 20000);
    expect(total).toBe(750);
    expect(lines).toEqual([{ label: "Utility rebate", amount: 750 }]);
  });

  it("resolves a percent line item against gross cost", () => {
    const { total, lines } = resolveIncentives([{ label: "State credit", type: "percent", percent: 25 }], 20000);
    expect(total).toBe(5000);
    expect(lines).toEqual([{ label: "State credit", amount: 5000 }]);
  });

  it("stacks a fixed and a percent line item, each against the same gross cost", () => {
    const { total, lines } = resolveIncentives(
      [
        { label: "Utility rebate", type: "fixed", amount: 750 },
        { label: "State credit", type: "percent", percent: 25 },
      ],
      20000,
    );
    // 750 fixed + 25% of 20000 (not of 20000 - 750): stacking is
    // order-independent because each line resolves against gross cost alone.
    expect(total).toBe(750 + 5000);
    expect(lines.map((l) => l.amount)).toEqual([750, 5000]);
  });

  it("passes through to zero with no incentive lines", () => {
    const { total, lines } = resolveIncentives([], 20000);
    expect(total).toBe(0);
    expect(lines).toEqual([]);
  });

  it("passes through to zero when the list is omitted entirely", () => {
    const { total, lines } = resolveIncentives(undefined, 20000);
    expect(total).toBe(0);
    expect(lines).toEqual([]);
  });
});

describe("resolveIncentives: percent with capAmount", () => {
  it("caps a percent line at capAmount when the raw percentage exceeds it (binding)", () => {
    // 30% of 10000 = 3000, capped to 2000.
    const { total, lines } = resolveIncentives(
      [{ label: "State rebate", type: "percent", percent: 30, capAmount: 2000 }],
      10000,
    );
    expect(total).toBe(2000);
    expect(lines).toEqual([{ label: "State rebate", amount: 2000 }]);
  });

  it("leaves a percent line unaffected when the raw percentage is under capAmount (not binding)", () => {
    // 30% of 5000 = 1500, under the 2000 cap.
    const { total, lines } = resolveIncentives(
      [{ label: "State rebate", type: "percent", percent: 30, capAmount: 2000 }],
      5000,
    );
    expect(total).toBe(1500);
    expect(lines).toEqual([{ label: "State rebate", amount: 1500 }]);
  });
});

describe("resolveIncentives: perUnit", () => {
  it("prices a perUnit line at ratePerUnit * the matching size, 0 for an unmatched unit", () => {
    const { total, lines } = resolveIncentives(
      [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300 }],
      20000,
      { kwSolar: 6, kwhBattery: 10, kwBattery: 5 },
    );
    // 300 * 10 kWh-battery = 3000; kwSolar/kwBattery are irrelevant to this unit.
    expect(total).toBe(3000);
    expect(lines).toEqual([{ label: "Battery rebate", amount: 3000 }]);
  });

  it("caps a perUnit line at capAmount when the raw rate*qty exceeds it (binding)", () => {
    // 300/kWh-battery * 15 kWh = 4500, capped to 3000.
    const { total } = resolveIncentives(
      [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300, capAmount: 3000 }],
      20000,
      { kwhBattery: 15 },
    );
    expect(total).toBe(3000);
  });

  it("leaves a perUnit line unaffected when raw rate*qty is under capAmount (not binding)", () => {
    // 300/kWh-battery * 5 kWh = 1500, under the 3000 cap.
    const { total } = resolveIncentives(
      [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300, capAmount: 3000 }],
      20000,
      { kwhBattery: 5 },
    );
    expect(total).toBe(1500);
  });

  it("resolves a kW-solar perUnit line against sizes.kwSolar", () => {
    const { total } = resolveIncentives(
      [{ label: "Per-watt utility incentive", type: "perUnit", unit: "kW-solar", ratePerUnit: 150 }],
      20000,
      { kwSolar: 8 },
    );
    expect(total).toBe(1200);
  });

  it("treats a missing sizes argument as all-zero quantities rather than throwing", () => {
    const { total } = resolveIncentives(
      [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300 }],
      20000,
    );
    expect(total).toBe(0);
  });
});

describe("resolveIncentives: stacking order independence with caps", () => {
  it("resolves each line against gross cost/sizes alone, so declaration order never changes any line's amount or the total", () => {
    const list = [
      { label: "Fixed rebate", type: "fixed", amount: 1000 },
      { label: "State percent", type: "percent", percent: 30, capAmount: 2000 }, // 30% of 10000 = 3000 -> capped 2000
      { label: "Battery perUnit", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300 }, // 300*10 = 3000
    ];
    const sizes = { kwhBattery: 10 };
    const forward = resolveIncentives(list, 10000, sizes);
    const reversed = resolveIncentives([...list].reverse(), 10000, sizes);

    // Percent computes on the full 10000 gross cost, not on
    // 10000 - 1000 (the fixed line) -- that is what makes the total (and
    // each line's own amount) independent of declaration order.
    expect(forward.total).toBe(1000 + 2000 + 3000);
    expect(reversed.total).toBe(forward.total);
    expect(new Map(reversed.lines.map((l) => [l.label, l.amount]))).toEqual(
      new Map(forward.lines.map((l) => [l.label, l.amount])),
    );
  });
});

describe("resolveIncentives: recurring types are excluded from the year-0 resolution", () => {
  it("resolves to no line and no total for annualProduction/annualFixed items", () => {
    const { total, lines } = resolveIncentives(
      [
        { label: "SREC income", type: "annualProduction", ratePerKWh: 0.03, years: 10 },
        { label: "VPP enrollment", type: "annualFixed", amount: 200, years: 5 },
        { label: "Utility rebate", type: "fixed", amount: 750 },
      ],
      20000,
    );
    expect(total).toBe(750);
    expect(lines).toEqual([{ label: "Utility rebate", amount: 750 }]);
  });
});

describe("resolveRecurringIncentiveIncome: annualProduction", () => {
  const list = [{ label: "SREC income", type: "annualProduction", ratePerKWh: 0.03, years: 10 }];

  it("pays ratePerKWh * that year's production inside the window", () => {
    // 0.03 * 9000 = 270.
    expect(resolveRecurringIncentiveIncome(list, 1, 9000)).toEqual({
      total: 270,
      lines: [{ label: "SREC income", amount: 270 }],
    });
  });

  it("pays less in a later year when that year's (degraded) production is lower", () => {
    // Year 1 at 9000 kWh (0.03 * 9000 = 270) vs. year 10 at a degraded 8000
    // kWh (0.03 * 8000 = 240): year 10's income is lower because production.js
    // hands this function each year's own already-degraded production, not a
    // flat year-1 estimate.
    const year1 = resolveRecurringIncentiveIncome(list, 1, 9000).total;
    const year10 = resolveRecurringIncentiveIncome(list, 10, 8000).total;
    expect(year1).toBe(270);
    expect(year10).toBe(240);
    expect(year10).toBeLessThan(year1);
  });

  it("pays nothing at year 0 or once the years window has elapsed", () => {
    expect(resolveRecurringIncentiveIncome(list, 0, 9000).total).toBe(0);
    expect(resolveRecurringIncentiveIncome(list, 11, 9000).total).toBe(0);
  });

  it("pays at the boundary year (inclusive)", () => {
    expect(resolveRecurringIncentiveIncome(list, 10, 8000).total).toBe(240);
  });
});

describe("resolveRecurringIncentiveIncome: annualFixed", () => {
  const list = [{ label: "VPP enrollment", type: "annualFixed", amount: 200, years: 5 }];

  it("pays the flat amount for every year 1..years", () => {
    for (let year = 1; year <= 5; year += 1) {
      expect(resolveRecurringIncentiveIncome(list, year, 0).total).toBe(200);
    }
  });

  it("pays nothing before year 1 or after the window ends", () => {
    expect(resolveRecurringIncentiveIncome(list, 0, 0).total).toBe(0);
    expect(resolveRecurringIncentiveIncome(list, 6, 0).total).toBe(0);
  });
});

describe("resolveRecurringIncentiveIncome: stacks recurring types and ignores one-time types", () => {
  it("sums annualProduction and annualFixed in the same year, excluding fixed/percent/perUnit lines", () => {
    const list = [
      { label: "SREC income", type: "annualProduction", ratePerKWh: 0.03, years: 10 },
      { label: "VPP enrollment", type: "annualFixed", amount: 200, years: 5 },
      { label: "Utility rebate", type: "fixed", amount: 750 },
      { label: "State percent", type: "percent", percent: 25 },
    ];
    // 0.03 * 8500 + 200 = 255 + 200 = 455.
    const { total, lines } = resolveRecurringIncentiveIncome(list, 3, 8500);
    expect(total).toBe(455);
    expect(lines).toEqual([
      { label: "SREC income", amount: 255 },
      { label: "VPP enrollment", amount: 200 },
    ]);
  });
});

describe("FEDERAL_25D_STATUS", () => {
  it("marks the credit expired for systems placed in service after 2025-12-31", () => {
    expect(FEDERAL_25D_STATUS.expired).toBe(true);
    expect(FEDERAL_25D_STATUS.lastEligibleDate).toBe("2025-12-31");
    expect(FEDERAL_25D_STATUS.note).toMatch(/2025/);
    expect(FEDERAL_25D_STATUS.note).toMatch(/One Big Beautiful Bill Act/);
  });
});

describe("CA_PROPERTY_TAX_NOTE", () => {
  it("carries the 2027-01-01 sunset date for the property tax exclusion", () => {
    expect(CA_PROPERTY_TAX_NOTE.sunsetDate).toBe("2027-01-01");
    expect(CA_PROPERTY_TAX_NOTE.note).toMatch(/property tax/i);
    expect(CA_PROPERTY_TAX_NOTE.note).toMatch(/2027/);
  });
});
