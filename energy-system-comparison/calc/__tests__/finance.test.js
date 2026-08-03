import { describe, it, expect } from "vitest";
import { financeConfig } from "../finance.js";

/**
 * Build a ConfigResult stub with only the fields finance.js reads.
 *
 * horizonYears is set to bills.length: financeConfig's analysisYears is
 * min(max(horizonYears, PAYBACK_SEARCH_YEARS), result.years.length,
 * baseline.years.length), so a stub this short caps analysisYears right back
 * down to bills.length regardless of PAYBACK_SEARCH_YEARS -- these tests
 * exercise the horizon-scoped math, not the extended payback search, which
 * calc/__tests__/simulate.test.js and the "payback beyond the horizon" cases
 * below cover instead.
 */
function makeResult(bills, productions = bills.map(() => 0), horizonYears = bills.length) {
  return {
    years: bills.map((billTotal, i) => ({ billTotal, productionKWh: productions[i] })),
    horizonYears,
  };
}

const noReplacements = { inverterReplacement: null, batteryReplacement: null };

describe("cash flow shape", () => {
  it("puts the net upfront spend at index 0 and one entry per horizon year after it", () => {
    const baseline = makeResult([2000, 2000, 2000]);
    const result = makeResult([1000, 1000, 1000]);
    const out = financeConfig({
      result,
      baseline,
      costs: { gross: 6000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.cashFlows).toHaveLength(4);
    expect(out.cumulative).toHaveLength(4);
    expect(out.cashFlows[0]).toBe(-6000);
    expect(out.cashFlows[1]).toBe(1000);
  });
});

describe("never pays back", () => {
  // Baseline and config bills are identical every year: no savings, ever.
  const baseline = makeResult([2000, 2000, 2000]);
  const result = makeResult([2000, 2000, 2000]);
  const out = financeConfig({
    result,
    baseline,
    costs: { gross: 10000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    financing: { type: "cash" },
    econ: { discountRatePct: 5 },
  });

  it("keeps cumulative flat and negative for the whole horizon", () => {
    expect(out.cashFlows).toEqual([-10000, 0, 0, 0]);
    expect(out.cumulative).toEqual([-10000, -10000, -10000, -10000]);
  });

  it("reports no payback year", () => {
    expect(out.paybackYear).toBeNull();
  });

  it("reports no IRR: NPV stays negative at both ends of the bisection range", () => {
    expect(out.irr).toBeNull();
  });

  it("reports lifetime savings equal to the sunk cost", () => {
    expect(out.lifetimeSavings).toBe(-10000);
  });
});

describe("zero upfront cost but perpetually negative cumulative", () => {
  // Incentives fully offset gross cost, so cashFlows[0] is 0, but O&M drains
  // the balance every year with no savings to offset it: cumulative is 0,
  // then strictly negative for the rest of the horizon.
  const baseline = makeResult([2000, 2000, 2000]);
  const result = makeResult([2000, 2000, 2000]);
  const out = financeConfig({
    result,
    baseline,
    costs: {
      gross: 5000,
      incentives: [{ label: "Rebate", type: "fixed", amount: 5000 }],
      oAndMPerYear: 200,
      ...noReplacements,
    },
    financing: { type: "cash" },
    econ: { discountRatePct: 5 },
  });

  it("has a zero, non-negative cashFlows[0] but a cumulative that goes negative and stays there", () => {
    expect(out.cashFlows[0]).toBe(0);
    expect(out.cumulative).toEqual([0, -200, -400, -600]);
  });

  it("reports no payback year rather than 0", () => {
    expect(out.paybackYear).toBeNull();
  });
});

describe("IRR on a non-monotone flow (a late replacement year)", () => {
  // 25-year horizon, flat 1000/yr savings, a $6000 inverter replacement in
  // year 24 dips that year's flow negative while year 25 is positive again --
  // the flow crosses zero more than once, so a naive bisection anchored at
  // r=-0.99 can converge on a rate that is not actually a zero of NPV.
  const bills = new Array(25).fill(1000);
  const baseline = makeResult(new Array(25).fill(2000));
  const result = makeResult(new Array(25).fill(1000));
  const out = financeConfig({
    result,
    baseline,
    costs: {
      gross: 40000,
      incentives: [],
      oAndMPerYear: 0,
      inverterReplacement: { year: 24, cost: 6000 },
      batteryReplacement: null,
    },
    financing: { type: "cash" },
    econ: { discountRatePct: 5 },
  });

  it("dips the replacement year's flow negative, confirming the non-monotone shape", () => {
    expect(out.cashFlows.slice(-3)).toEqual([1000, -5000, 1000]);
  });

  it("reports a rate that is a genuine zero of NPV, or null", () => {
    if (out.irr === null) return;
    const npvAtIrr = out.cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + out.irr, t), 0);
    const scale = out.cashFlows.reduce((max, cf) => Math.max(max, Math.abs(cf)), 1);
    expect(Math.abs(npvAtIrr)).toBeLessThan(scale * 1e-6);
  });
});

describe("IRR on a root beyond the old [-0.99, 1.0] bisection range", () => {
  // A 1-year, 5x return: NPV(r) = -1000 + 5000/(1+r), a root at r=4 (400%),
  // which is beyond the old bisection range but inside the current
  // [-0.99, 10] scan range.
  const baseline = makeResult([6000]);
  const result = makeResult([1000]);
  const out = financeConfig({
    result,
    baseline,
    costs: { gross: 1000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    financing: { type: "cash" },
    econ: { discountRatePct: 8 },
  });

  it("still pays back, quickly", () => {
    expect(out.cashFlows).toEqual([-1000, 5000]);
    // Crosses zero 20% of the way through year 1: -1000 + 0.2*5000 = 0.
    expect(out.paybackYear).toBeCloseTo(0.2, 6);
  });

  it("finds the 400% root now that the scan range reaches it", () => {
    expect(out.irr).toBeCloseTo(4, 6);
  });
});

describe("hand-computed NPV and IRR on a clean single-year root", () => {
  // -1000 now, +1200 in a year: NPV(0.2) = -1000 + 1200/1.2 = 0 exactly.
  const baseline = makeResult([2200]);
  const result = makeResult([1000]);

  it("matches a zero discount rate to the raw sum", () => {
    const out = financeConfig({
      result,
      baseline,
      costs: { gross: 1000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.npv).toBeCloseTo(200, 6);
    expect(out.lifetimeSavings).toBeCloseTo(200, 6);
  });

  it("matches a hand-computed NPV at 10%", () => {
    const out = financeConfig({
      result,
      baseline,
      costs: { gross: 1000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 10 },
    });
    expect(out.npv).toBeCloseTo(-1000 + 1200 / 1.1, 6);
  });

  it("finds the exact analytic IRR of 20%", () => {
    const out = financeConfig({
      result,
      baseline,
      costs: { gross: 1000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 5 },
    });
    expect(out.irr).toBeCloseTo(0.2, 5);
  });
});

describe("fractional payback interpolated within the crossing year", () => {
  // Flows: -6000, 2000, 2000, 4000, 1000, 1000.
  // Cumulative: -6000, -4000, -2000, 2000, 3000, 4000.
  // Crosses between year 2 (-2000) and year 3 (+2000): 2000/4000 = 0.5 of
  // the way through year 3, so payback lands at 2.5.
  const baseline = makeResult([3000, 3000, 5000, 2000, 2000]);
  const result = makeResult([1000, 1000, 1000, 1000, 1000]);
  const out = financeConfig({
    result,
    baseline,
    costs: { gross: 6000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    financing: { type: "cash" },
    econ: { discountRatePct: 5 },
  });

  it("builds the expected cash flow and cumulative vectors", () => {
    expect(out.cashFlows).toEqual([-6000, 2000, 2000, 4000, 1000, 1000]);
    expect(out.cumulative).toEqual([-6000, -4000, -2000, 2000, 3000, 4000]);
  });

  it("interpolates payback to one decimal", () => {
    expect(out.paybackYear).toBeCloseTo(2.5, 6);
  });

  it("matches a hand-computed NPV at 5%", () => {
    const expected =
      -6000 + 2000 / 1.05 + 2000 / 1.05 ** 2 + 4000 / 1.05 ** 3 + 1000 / 1.05 ** 4 + 1000 / 1.05 ** 5;
    expect(out.npv).toBeCloseTo(expected, 6);
  });

  it("reports lifetime savings as the undiscounted cumulative total", () => {
    expect(out.lifetimeSavings).toBe(4000);
  });
});

describe("loan amortization, cross-checked against an independently computed calcPmt value", () => {
  // Independently computed (not via this module): principal 20000, 6% APR,
  // 120 monthly payments -> monthly payment 222.04100388330235, so
  // 12 * that = 2664.4920465996283 per year while the loan runs.
  const INDEPENDENT_MONTHLY_PMT = 222.04100388330235;

  it("charges the full annual loan payment against a fully financed system", () => {
    const bills = new Array(10).fill(1000);
    const out = financeConfig({
      result: makeResult(bills),
      baseline: makeResult(bills),
      costs: { gross: 20000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "loan", downPaymentFrac: 0, aprPct: 6, termYears: 10 },
      econ: { discountRatePct: 5 },
    });
    expect(out.cashFlows[0]).toBe(0); // no down payment, no incentives
    for (let year = 1; year <= 10; year += 1) {
      expect(out.cashFlows[year]).toBeCloseTo(-INDEPENDENT_MONTHLY_PMT * 12, 4);
    }
  });

  it("scales the loan payment down when a down payment shrinks the principal", () => {
    // Same rate and term, principal 16000 (80% of 20000): payment scales
    // linearly with principal, so 222.04100388330235 * 0.8 = 177.6328...
    const bills = new Array(10).fill(0);
    const out = financeConfig({
      result: makeResult(bills),
      baseline: makeResult(bills),
      costs: { gross: 20000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "loan", downPaymentFrac: 0.2, aprPct: 6, termYears: 10 },
      econ: { discountRatePct: 5 },
    });
    expect(out.cashFlows[0]).toBe(-4000); // 20% down payment
    expect(out.cashFlows[1]).toBeCloseTo(-(INDEPENDENT_MONTHLY_PMT * 0.8 * 12), 4);
  });

  it("stops charging the loan payment once the term ends, even mid-horizon", () => {
    const bills = new Array(3).fill(0);
    const out = financeConfig({
      result: makeResult(bills),
      baseline: makeResult(bills),
      costs: { gross: 12000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "loan", downPaymentFrac: 0, aprPct: 0, termYears: 2 },
      econ: { discountRatePct: 0 },
    });
    // 0% APR: calcPmt's zero-rate branch splits principal evenly, 12000/24 = 500/mo, 6000/yr.
    expect(out.cashFlows[1]).toBe(-6000);
    expect(out.cashFlows[2]).toBe(-6000);
    expect(out.cashFlows[3]).toBe(0); // term already finished after year 2
  });
});

describe("loan financing rejects a term or APR that would erase the financed principal", () => {
  const bills = new Array(3).fill(0);
  const baseArgs = {
    result: makeResult(bills),
    baseline: makeResult(bills),
    costs: { gross: 12000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    econ: { discountRatePct: 5 },
  };

  it("throws for a zero term instead of silently dropping the principal", () => {
    expect(() =>
      financeConfig({ ...baseArgs, financing: { type: "loan", downPaymentFrac: 0.2, aprPct: 6, termYears: 0 } }),
    ).toThrow();
  });

  it("throws for a null/missing term instead of silently dropping the principal", () => {
    expect(() =>
      financeConfig({
        ...baseArgs,
        financing: { type: "loan", downPaymentFrac: 0.2, aprPct: 6, termYears: null },
      }),
    ).toThrow();
  });

  it("throws for a negative term", () => {
    expect(() =>
      financeConfig({
        ...baseArgs,
        financing: { type: "loan", downPaymentFrac: 0.2, aprPct: 6, termYears: -5 },
      }),
    ).toThrow();
  });

  it("throws for a non-numeric APR instead of silently treating it as 0%", () => {
    expect(() =>
      financeConfig({
        ...baseArgs,
        financing: { type: "loan", downPaymentFrac: 0.2, aprPct: null, termYears: 10 },
      }),
    ).toThrow();
  });
});

describe("replacement line items land in their own year only", () => {
  const bills = new Array(5).fill(0);
  const out = financeConfig({
    result: makeResult(bills),
    baseline: makeResult(bills),
    costs: {
      gross: 10000,
      incentives: [],
      oAndMPerYear: 100,
      inverterReplacement: { year: 3, cost: 1500 },
      batteryReplacement: { year: 5, cost: 3000 },
    },
    financing: { type: "cash" },
    econ: { discountRatePct: 0 },
  });

  it("charges only O&M in years without a replacement", () => {
    expect(out.cashFlows[1]).toBe(-100);
    expect(out.cashFlows[2]).toBe(-100);
    expect(out.cashFlows[4]).toBe(-100);
  });

  it("adds the inverter replacement cost in its own year only", () => {
    expect(out.cashFlows[3]).toBe(-(100 + 1500));
  });

  it("adds the battery replacement cost in its own year, stacking with O&M", () => {
    expect(out.cashFlows[5]).toBe(-(100 + 3000));
  });
});

describe("incentives inside the finance flow", () => {
  const bills = [2000, 2000];
  const productions = [6000, 6000];

  it("stacks a fixed and a percent line item against gross cost", () => {
    const out = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: {
        gross: 5000,
        incentives: [
          { label: "Utility rebate", type: "fixed", amount: 500 },
          { label: "State credit", type: "percent", percent: 10 },
        ],
        oAndMPerYear: 0,
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    // 500 fixed + 10% of 5000 = 500 + 500 = 1000 total incentive.
    expect(out.cashFlows[0]).toBe(-5000 + 1000);
  });

  it("passes through unchanged with no incentives", () => {
    const out = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: { gross: 5000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.cashFlows[0]).toBe(-5000);
  });
});

describe("effectiveCostPerKWh", () => {
  it("divides net upfront plus discounted O&M by discounted production", () => {
    const bills = [2000, 2000];
    const productions = [6000, 6000];
    const out = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult([3000, 3000], productions),
      costs: {
        gross: 5000,
        incentives: [{ label: "Rebate", type: "fixed", amount: 500 }],
        oAndMPerYear: 100,
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    // Net upfront: 5000 - 500 = 4500. Discounted O&M at 0%: 100 + 100 = 200.
    // Discounted production at 0%: 6000 + 6000 = 12000.
    expect(out.effectiveCostPerKWh).toBeCloseTo((4500 + 200) / 12000, 6);
  });

  it("is unaffected by financing structure, so a cash and a loan purchase of the same system agree", () => {
    const bills = [0, 0];
    const productions = [5000, 5000];
    const cash = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: { gross: 10000, incentives: [], oAndMPerYear: 50, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    const loan = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: { gross: 10000, incentives: [], oAndMPerYear: 50, ...noReplacements },
      financing: { type: "loan", downPaymentFrac: 1, aprPct: 6, termYears: 2 },
      econ: { discountRatePct: 0 },
    });
    // A 100% down payment loan has no principal to finance, so it is
    // identical in substance to a cash purchase.
    expect(loan.effectiveCostPerKWh).toBeCloseTo(cash.effectiveCostPerKWh, 6);
  });

  it("agrees between cash and a partially financed loan on the identical system", () => {
    // A 20% down loan finances 80% of gross as principal; effectiveCostPerKWh
    // is defined on the system's own cost (gross minus incentives), not on
    // whatever cash actually left the buyer's pocket up front, so it must
    // land on the same figure as the cash purchase regardless of the down
    // payment split.
    const bills = [0, 0];
    const productions = [5000, 5000];
    const cash = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: { gross: 10000, incentives: [], oAndMPerYear: 50, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    const loan = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: { gross: 10000, incentives: [], oAndMPerYear: 50, ...noReplacements },
      financing: { type: "loan", downPaymentFrac: 0.2, aprPct: 6, termYears: 10 },
      econ: { discountRatePct: 0 },
    });
    expect(loan.effectiveCostPerKWh).toBeCloseTo(cash.effectiveCostPerKWh, 6);
  });
});

describe("regression: a 10-year horizon must not hide a payback that lands past it", () => {
  // Before this fix, cashFlows/cumulative ran only to horizonYears (10), so a
  // config that actually recovers its cost in year 13 reported paybackYear
  // null -- "never pays back" -- hiding a real payback the user just would
  // not be the owner for anymore. Flat $1000/yr savings against a $13000
  // gross cost cross zero exactly at year 13: cumulative[12] = -1000,
  // cumulative[13] = 0.
  const horizonYears = 10;
  const analysisWindowYears = 20;
  const baseline = makeResult(new Array(analysisWindowYears).fill(2000), undefined, horizonYears);
  const result = makeResult(new Array(analysisWindowYears).fill(1000), undefined, horizonYears);
  const out = financeConfig({
    result,
    baseline,
    costs: { gross: 13000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    financing: { type: "cash" },
    econ: { discountRatePct: 0 },
  });

  it("reports the true payback year even though it lands three years past the horizon", () => {
    expect(out.paybackYear).toBeCloseTo(13, 6);
  });

  it("marks horizonIndex at the 10-year horizon, distinct from the longer cashFlows/cumulative window", () => {
    expect(out.horizonIndex).toBe(10);
    expect(out.cashFlows).toHaveLength(analysisWindowYears + 1);
    expect(out.cumulative).toHaveLength(analysisWindowYears + 1);
  });

  it("keeps NPV and lifetimeSavings scoped to the 10-year horizon, not the extended search window", () => {
    // Over 10 years at 0% discount: -13000 + 1000*10 = -3000 -- the
    // horizon-scoped view has genuinely not recovered by year 10, even
    // though the full-window search above finds the year-13 crossing.
    expect(out.npv).toBeCloseTo(-3000, 6);
    expect(out.lifetimeSavings).toBeCloseTo(-3000, 6);
  });
});

describe("incentives: perUnit cap binding and not binding, via costs.sizes", () => {
  const bills = [2000, 2000];
  const productions = [0, 0];

  it("caps the year-0 reduction when the perUnit line's raw amount exceeds capAmount (binding)", () => {
    // 300/kWh-battery * 15 kWh = 4500, capped to 3000.
    const out = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: {
        gross: 20000,
        incentives: [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300, capAmount: 3000 }],
        oAndMPerYear: 0,
        sizes: { kwhBattery: 15 },
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.cashFlows[0]).toBe(-20000 + 3000);
  });

  it("leaves the year-0 reduction at the raw amount when it is under capAmount (not binding)", () => {
    // 300/kWh-battery * 5 kWh = 1500, under the 3000 cap.
    const out = financeConfig({
      result: makeResult(bills, productions),
      baseline: makeResult(bills, productions),
      costs: {
        gross: 20000,
        incentives: [{ label: "Battery rebate", type: "perUnit", unit: "kWh-battery", ratePerUnit: 300, capAmount: 3000 }],
        oAndMPerYear: 0,
        sizes: { kwhBattery: 5 },
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.cashFlows[0]).toBe(-20000 + 1500);
  });
});

describe("incentives: annualProduction income with degradation", () => {
  // 12-year horizon, flat $0 bill savings, a degrading production series
  // (roughly 2% simple decline per year past year 1) so year 10's income is
  // provably lower than year 1's, not just numerically coincidental.
  const horizonYears = 12;
  const productions = Array.from({ length: horizonYears }, (_, i) => 9000 * (1 - 0.02 * i));
  const bills = new Array(horizonYears).fill(0);
  const out = financeConfig({
    result: makeResult(bills, productions, horizonYears),
    baseline: makeResult(bills, productions, horizonYears),
    costs: {
      gross: 20000,
      incentives: [{ label: "SREC income", type: "annualProduction", ratePerKWh: 0.03, years: 10 }],
      oAndMPerYear: 0,
      ...noReplacements,
    },
    financing: { type: "cash" },
    econ: { discountRatePct: 0 },
  });

  it("adds ratePerKWh * that year's own production as positive cash flow in years 1..years", () => {
    // Year 1: 0.03 * 9000 = 270. Year 10: 0.03 * (9000*(1-0.02*9)) = 0.03*7380 = 221.4.
    expect(out.cashFlows[1]).toBeCloseTo(270, 6);
    expect(out.cashFlows[10]).toBeCloseTo(221.4, 6);
    expect(out.cashFlows[10]).toBeLessThan(out.cashFlows[1]);
  });

  it("pays nothing once the years window elapses, even though the horizon continues", () => {
    // Years 11 and 12 are inside the 12-year horizon but past the SREC's own
    // 10-year window: bills contribute 0 savings, so cash flow is 0.
    expect(out.cashFlows[11]).toBe(0);
    expect(out.cashFlows[12]).toBe(0);
  });
});

describe("incentives: annualFixed income window", () => {
  const horizonYears = 8;
  const bills = new Array(horizonYears).fill(0);
  const productions = new Array(horizonYears).fill(0);
  const out = financeConfig({
    result: makeResult(bills, productions, horizonYears),
    baseline: makeResult(bills, productions, horizonYears),
    costs: {
      gross: 5000,
      incentives: [{ label: "VPP enrollment", type: "annualFixed", amount: 300, years: 5 }],
      oAndMPerYear: 0,
      ...noReplacements,
    },
    financing: { type: "cash" },
    econ: { discountRatePct: 0 },
  });

  it("pays the flat amount in years 1..5 and nothing in years 6..8", () => {
    expect(out.cashFlows.slice(1, 6)).toEqual([300, 300, 300, 300, 300]);
    expect(out.cashFlows.slice(6, 9)).toEqual([0, 0, 0]);
  });
});

describe("regression: recurring incentive income pulls a payback crossing earlier", () => {
  // $10000 gross, flat $500/yr bill savings alone crosses zero at year 20
  // (500*20 = 10000), past the 15-year horizon -- a genuine but
  // beyond-horizon payback. Adding a $700/yr annualFixed incentive for 10
  // years raises each of the first 10 years' cash flow to 1200/yr, which
  // recovers the 10000 upfront by year 9 (1200*9 = 10800 > 10000, exact
  // crossing partway through year 9): the recurring income pulls the
  // crossing forward from year 20 to inside the horizon entirely.
  //
  // The stub arrays run 25 years (not just the 15-year horizon) so the
  // year-20 crossing in the no-incentive case is actually inside
  // analysisYears = min(max(horizonYears, PAYBACK_SEARCH_YEARS), years.length,
  // years.length) -- a 15-entry stub would cap analysisYears at 15 and hide
  // it entirely.
  const horizonYears = 15;
  const analysisWindowYears = 25;
  const bills = new Array(analysisWindowYears).fill(1500);
  const baselineBills = bills.map((b) => b + 500);
  const productions = new Array(analysisWindowYears).fill(0);

  it("without the incentive, payback lands at year 20, past the horizon", () => {
    const out = financeConfig({
      result: makeResult(bills, productions, horizonYears),
      baseline: makeResult(baselineBills, productions, horizonYears),
      costs: { gross: 10000, incentives: [], oAndMPerYear: 0, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    expect(out.paybackYear).toBeCloseTo(20, 6);
  });

  it("with a 10-year annualFixed incentive, payback lands inside the horizon instead", () => {
    const out = financeConfig({
      result: makeResult(bills, productions, horizonYears),
      baseline: makeResult(baselineBills, productions, horizonYears),
      costs: {
        gross: 10000,
        incentives: [{ label: "VPP enrollment", type: "annualFixed", amount: 700, years: 10 }],
        oAndMPerYear: 0,
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 0 },
    });
    // Cumulative after year k (k<=10): -10000 + 1200*k. Crosses zero between
    // year 8 (-10000+9600=-400) and year 9 (-10000+10800=800): fraction
    // 400/1200 = 1/3 of year 9, so payback = 8 + 1/3 rounded to one decimal.
    expect(out.paybackYear).toBeCloseTo(8.3, 6);
    expect(out.paybackYear).toBeLessThan(horizonYears);
  });
});

describe("regression: NPV is positive only because of recurring incentive income", () => {
  // Bill savings alone lose money every year (system costs more in O&M than
  // it saves on the bill), so NPV from bill savings alone is negative. A
  // 10-year annualProduction incentive adds enough income to flip NPV
  // positive -- this pins that recurring income is genuinely summed into
  // cashFlows/NPV, not merely resolved and discarded. Before recurring-income
  // support existed, cashFlows carried only bill savings minus O&M, so NPV
  // here would have stayed negative.
  const horizonYears = 10;
  const bills = new Array(horizonYears).fill(1000);
  const baselineBills = new Array(horizonYears).fill(1050); // only $50/yr bill savings
  const productions = new Array(horizonYears).fill(10000);

  it("is negative from bill savings and O&M alone", () => {
    const withoutIncentive = financeConfig({
      result: makeResult(bills, productions, horizonYears),
      baseline: makeResult(baselineBills, productions, horizonYears),
      costs: { gross: 2000, incentives: [], oAndMPerYear: 20, ...noReplacements },
      financing: { type: "cash" },
      econ: { discountRatePct: 5 },
    });
    // $30/yr net (50 savings - 20 O&M) for 10 years, discounted, against a
    // $2000 upfront cost, is comfortably negative.
    expect(withoutIncentive.npv).toBeLessThan(0);
  });

  it("turns positive once a 10-year annualProduction incentive is added", () => {
    const withIncentive = financeConfig({
      result: makeResult(bills, productions, horizonYears),
      baseline: makeResult(baselineBills, productions, horizonYears),
      costs: {
        gross: 2000,
        incentives: [{ label: "SREC income", type: "annualProduction", ratePerKWh: 0.03, years: 10 }],
        oAndMPerYear: 20,
        ...noReplacements,
      },
      financing: { type: "cash" },
      econ: { discountRatePct: 5 },
    });
    // 0.03 * 10000 = 300/yr SREC income on top of the $30/yr net above:
    // 330/yr for 10 years against a $2000 upfront cost is comfortably positive.
    expect(withIncentive.npv).toBeGreaterThan(0);
  });
});

describe("regression: never-recovers stays null across the full analysis window, not just the horizon", () => {
  // $100/yr savings against a $50000 cost never recovers even over the full
  // 40-year PAYBACK_SEARCH_YEARS window, so paybackYear must still be null --
  // the fix widens the search, it does not manufacture a payback that isn't
  // there.
  const horizonYears = 10;
  const bills = new Array(40).fill(0);
  const out = financeConfig({
    result: makeResult(bills.map(() => 900), undefined, horizonYears),
    baseline: makeResult(bills.map(() => 1000), undefined, horizonYears),
    costs: { gross: 50000, incentives: [], oAndMPerYear: 0, ...noReplacements },
    financing: { type: "cash" },
    econ: { discountRatePct: 0 },
  });

  it("reports no payback within the full 40-year search window", () => {
    expect(out.cashFlows).toHaveLength(41);
    expect(out.paybackYear).toBeNull();
  });

  it("still reports a negative horizon-scoped NPV", () => {
    expect(out.npv).toBeLessThan(0);
  });
});
