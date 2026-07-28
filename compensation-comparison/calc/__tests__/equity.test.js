import { describe, it, expect } from "vitest";
import {
  vestingSchedule,
  grantBaseValue,
  exerciseCost,
  grantVestingByYear,
  unvestedFraction,
  projectEquity,
  equityRange,
} from "../equity.js";
import { createOffer } from "../../model/offer.js";
import { projectOffer } from "../project.js";

const CONTEXT = { filingStatus: "single", taxYear: 2026, horizonYears: 5 };

function rsu(overrides = {}) {
  return {
    id: "g1",
    label: "Initial grant",
    instrument: "rsu",
    grantYear: 1,
    grantValue: 200000,
    vestingPreset: "even4",
    ...overrides,
  };
}

describe("vestingSchedule", () => {
  it("reads a preset as decimals summing to one", () => {
    const s = vestingSchedule(rsu({ vestingPreset: "even4" }));
    expect(s).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("expresses a one-year cliff as year one at zero", () => {
    expect(vestingSchedule(rsu({ vestingPreset: "cliff4" }))[0]).toBe(0);
  });

  it("keeps a back-loaded shape back-loaded", () => {
    const s = vestingSchedule(rsu({ vestingPreset: "backloaded" }));
    expect(s[0]).toBeLessThan(s[3]);
    expect(s).toEqual([0.05, 0.15, 0.4, 0.4]);
  });

  it("parses a custom comma-separated schedule", () => {
    const s = vestingSchedule(rsu({ vestingPreset: "custom", vestingCustom: "10, 20, 30, 40" }));
    expect(s).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("tolerates stray whitespace and a trailing comma", () => {
    expect(vestingSchedule(rsu({ vestingPreset: "custom", vestingCustom: " 50 , 50 , " }))).toEqual([0.5, 0.5]);
  });

  it("falls back to an even split rather than vesting nothing on unparseable input", () => {
    expect(vestingSchedule(rsu({ vestingPreset: "custom", vestingCustom: "nonsense" }))).toEqual([
      0.25, 0.25, 0.25, 0.25,
    ]);
  });
});

describe("grant valuation", () => {
  it("values an RSU grant at its stated amount", () => {
    expect(grantBaseValue(rsu())).toBe(200000);
  });

  it("values an option grant at the spread, not the share price", () => {
    const grant = rsu({ instrument: "nso", shares: 10000, strikePrice: 2, sharePrice: 5 });
    expect(grantBaseValue(grant)).toBe(30000);
  });

  it("values an underwater option grant at zero rather than negative", () => {
    const grant = rsu({ instrument: "nso", shares: 10000, strikePrice: 8, sharePrice: 5 });
    expect(grantBaseValue(grant)).toBe(0);
  });

  it("reports the cash needed to exercise", () => {
    expect(exerciseCost(rsu({ instrument: "iso", shares: 10000, strikePrice: 2 }))).toBe(20000);
    expect(exerciseCost(rsu())).toBe(0);
  });
});

describe("grantVestingByYear", () => {
  it("spreads an even grant across four years with no growth", () => {
    const byYear = grantVestingByYear(rsu(), 5, 0);
    expect(byYear).toEqual([50000, 50000, 50000, 50000, 0]);
  });

  it("starts a refresher in its grant year, overlapping the initial grant", () => {
    const byYear = grantVestingByYear(rsu({ grantYear: 3, grantValue: 100000 }), 5, 0);
    expect(byYear[0]).toBe(0);
    expect(byYear[1]).toBe(0);
    expect(byYear[2]).toBe(25000);
    expect(byYear[3]).toBe(25000);
  });

  it("truncates a grant that vests past the end of the horizon", () => {
    const byYear = grantVestingByYear(rsu({ grantYear: 4 }), 5, 0);
    expect(byYear).toHaveLength(5);
    expect(byYear[4]).toBe(50000);
  });

  it("grows each tranche by the years elapsed since the grant", () => {
    const byYear = grantVestingByYear(rsu(), 4, 0.1);
    expect(byYear[0]).toBeCloseTo(50000 * 1.1, 6);
    expect(byYear[3]).toBeCloseTo(50000 * 1.1 ** 4, 6);
  });

  it("puts a back-loaded grant's weight in the later years", () => {
    const byYear = grantVestingByYear(rsu({ vestingPreset: "backloaded" }), 4, 0);
    expect(byYear[0]).toBe(10000);
    expect(byYear[3]).toBe(80000);
    // The distortion a single annualized figure hides: an even split would
    // report 50000 in year one, five times the real amount.
    expect(byYear[0]).toBeLessThan(200000 / 4);
  });
});

describe("unvestedFraction", () => {
  const grant = rsu();

  it("is everything before any tranche vests", () => {
    expect(unvestedFraction(grant, 0)).toBeCloseTo(1, 6);
  });

  it("falls by one tranche per elapsed year", () => {
    expect(unvestedFraction(grant, 1)).toBeCloseTo(0.75, 6);
    expect(unvestedFraction(grant, 2)).toBeCloseTo(0.5, 6);
  });

  it("is nothing once the grant is fully vested", () => {
    expect(unvestedFraction(grant, 4)).toBeCloseTo(0, 6);
    expect(unvestedFraction(grant, 9)).toBeCloseTo(0, 6);
  });

  it("stays at everything through a one-year cliff", () => {
    expect(unvestedFraction(rsu({ vestingPreset: "cliff4" }), 1)).toBeCloseTo(1, 6);
  });

  it("counts a refresher's own clock, not the horizon's", () => {
    expect(unvestedFraction(rsu({ grantYear: 3 }), 2)).toBeCloseTo(1, 6);
    expect(unvestedFraction(rsu({ grantYear: 3 }), 3)).toBeCloseTo(0.75, 6);
  });
});

describe("projectEquity", () => {
  it("stacks a refresher on top of the initial grant", () => {
    const offer = createOffer({
      grants: [rsu(), rsu({ id: "g2", label: "Refresher", grantYear: 2, grantValue: 100000 })],
    });
    const equity = projectEquity(offer, 5, 0);
    expect(equity.total[0]).toBe(50000);
    // Year 2 carries the initial grant's second tranche plus the refresher's first.
    expect(equity.total[1]).toBe(50000 + 25000);
  });

  it("separates RSU value, which is taxable on vest, from option value, which is not", () => {
    const offer = createOffer({
      grants: [rsu(), rsu({ id: "g2", instrument: "nso", shares: 10000, strikePrice: 1, sharePrice: 3 })],
    });
    const equity = projectEquity(offer, 4, 0);
    expect(equity.taxable[0]).toBe(50000);
    expect(equity.untaxed[0]).toBe(5000);
    expect(equity.total[0]).toBe(55000);
    expect(equity.hasOptions).toBe(true);
  });

  it("reports nothing for an offer with no grants", () => {
    const equity = projectEquity(createOffer(), 5, 0);
    expect(equity.hasGrants).toBe(false);
    expect(equity.total).toEqual([0, 0, 0, 0, 0]);
  });

  it("forfeits the whole grant at an exit inside the cliff", () => {
    const offer = createOffer({ grants: [rsu({ vestingPreset: "cliff4" })] });
    const equity = projectEquity(offer, 5, 0);
    expect(equity.forfeitedIfLeavingAfter[0]).toBeCloseTo(200000, 6);
  });

  it("forfeits progressively less at each later exit", () => {
    const equity = projectEquity(createOffer({ grants: [rsu()] }), 5, 0);
    const f = equity.forfeitedIfLeavingAfter;
    expect(f[0]).toBeCloseTo(150000, 6);
    expect(f[1]).toBeCloseTo(100000, 6);
    expect(f[3]).toBeCloseTo(0, 6);
  });
});

describe("equityRange", () => {
  it("is absent when the user supplied no alternative growth rates", () => {
    expect(equityRange(createOffer({ grants: [rsu()] }), 5)).toBeNull();
  });

  it("brackets the base case when both rates are given", () => {
    const offer = createOffer({
      grants: [rsu()],
      stockGrowthRate: 0.1,
      stockGrowthLow: 0,
      stockGrowthHigh: 0.25,
    });
    const range = equityRange(offer, 5);
    const base = projectEquity(offer, 5, 0.1);
    expect(range.low.total[0]).toBeLessThan(base.total[0]);
    expect(range.high.total[0]).toBeGreaterThan(base.total[0]);
  });
});

describe("equity inside the full projection", () => {
  const offer = createOffer({
    name: "Equity heavy",
    annualSalary: 150000,
    annualRaiseRate: 0,
    state: "TX",
    retirementOffered: false,
    grants: [rsu({ vestingPreset: "backloaded", grantValue: 400000 })],
  });
  const projection = projectOffer(offer, CONTEXT);

  it("taxes RSU vesting as ordinary income in the year it vests", () => {
    expect(projection.years[0].grossWages).toBeCloseTo(150000 + 400000 * 0.05, 6);
    expect(projection.years[2].grossWages).toBeCloseTo(150000 + 400000 * 0.4, 6);
  });

  it("pushes the big vest year into a higher marginal rate", () => {
    const small = projection.years[0].taxes.federal.marginalRate;
    const large = projection.years[2].taxes.federal.marginalRate;
    expect(large).toBeGreaterThan(small);
  });

  it("counts equity toward total compensation", () => {
    const equityTotal = projection.cumulative[3].equity;
    expect(equityTotal).toBeCloseTo(400000, 4);
  });

  it("folds unvested equity into the exit-year series", () => {
    const exit = projection.exitYears[0];
    // A back-loaded grant leaves 95% unvested after year one.
    expect(exit.forfeitedEquity).toBeCloseTo(400000 * 0.95, 4);
    expect(exit.forfeitedTotal).toBeGreaterThanOrEqual(exit.forfeitedEquity);
  });

  it("stops forfeiting once the grant is fully vested", () => {
    expect(projection.exitYears[3].forfeitedEquity).toBeCloseTo(0, 6);
  });

  it("does not double count RSU value, which already reached take-home", () => {
    const exit = projection.exitYears[4];
    expect(exit.vestedEquity).toBe(0);
    expect(exit.realized).toBeCloseTo(projection.cumulative[4].takeHome, 4);
  });
});

describe("forfeiture regressions", () => {
  const later = { ...rsu({ grantYear: 5, grantValue: 200000 }), id: "g-late" };

  it("grows a later grant from its own origin, not from the start of the horizon", () => {
    const equity = projectEquity(createOffer({ grants: [later] }), 10, 0.08);
    // Exit at end of year 6. The grant has existed 2 years and is half vested.
    const expected = 200000 * Math.pow(1.08, 2) * 0.5;
    expect(equity.forfeitedIfLeavingAfter[5]).toBeCloseTo(expected, 2);
  });

  it("forfeits nothing for a grant not yet issued at the exit", () => {
    const equity = projectEquity(createOffer({ grants: [later] }), 10, 0.08);
    for (const year of [0, 1, 2, 3]) {
      expect(equity.forfeitedIfLeavingAfter[year], `exit year ${year + 1}`).toBe(0);
    }
  });

  it("still forfeits the whole of a year-one grant inside its cliff", () => {
    const equity = projectEquity(createOffer({ grants: [rsu({ vestingPreset: "cliff4" })] }), 5, 0);
    expect(equity.forfeitedIfLeavingAfter[0]).toBeCloseTo(200000, 6);
  });
});
