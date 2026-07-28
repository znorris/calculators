import { describe, it, expect } from "vitest";
import {
  simplePayoutMultiple,
  tieredPayoutMultiple,
  payoutMultiple,
  variablePayForYear,
  attainmentScenarios,
} from "../commission.js";
import { createOffer } from "../../model/offer.js";
import { projectOffer } from "../project.js";

const CONTEXT = { filingStatus: "single", taxYear: 2026, horizonYears: 5 };

function plan(overrides = {}) {
  return {
    commissionMode: "simple",
    acceleratorThreshold: 1,
    acceleratorMultiplier: 1,
    deceleratorThreshold: 0,
    deceleratorMultiplier: 1,
    ...overrides,
  };
}

describe("simplePayoutMultiple", () => {
  it("pays linearly with no accelerator or floor", () => {
    expect(simplePayoutMultiple(0.8, plan())).toBeCloseTo(0.8, 6);
    expect(simplePayoutMultiple(1.4, plan())).toBeCloseTo(1.4, 6);
  });

  it("pays exactly target at quota", () => {
    expect(simplePayoutMultiple(1, plan({ acceleratorMultiplier: 2 }))).toBeCloseTo(1, 6);
  });

  it("applies the accelerator only to attainment above the threshold", () => {
    // 100% at normal rate plus 30% at double.
    expect(simplePayoutMultiple(1.3, plan({ acceleratorMultiplier: 2 }))).toBeCloseTo(1 + 0.3 * 2, 6);
  });

  it("respects an accelerator threshold above quota", () => {
    const p = plan({ acceleratorThreshold: 1.2, acceleratorMultiplier: 2 });
    expect(simplePayoutMultiple(1.1, p)).toBeCloseTo(1.1, 6);
    expect(simplePayoutMultiple(1.4, p)).toBeCloseTo(1.2 + 0.2 * 2, 6);
  });

  it("cuts the whole payout below the decelerator floor, which is a cliff not a band", () => {
    const p = plan({ deceleratorThreshold: 0.5, deceleratorMultiplier: 0.5 });
    expect(simplePayoutMultiple(0.4, p)).toBeCloseTo(0.4 * 0.5, 6);
    expect(simplePayoutMultiple(0.6, p)).toBeCloseTo(0.6, 6);
  });

  it("pays nothing at zero attainment", () => {
    expect(simplePayoutMultiple(0, plan())).toBe(0);
  });

  it("treats negative attainment as zero", () => {
    expect(simplePayoutMultiple(-0.5, plan())).toBe(0);
  });
});

describe("tieredPayoutMultiple", () => {
  const tiers = [
    { upToAttainment: 0.5, multiplier: 0.5 },
    { upToAttainment: 1, multiplier: 1 },
    { upToAttainment: 1.5, multiplier: 2 },
  ];

  it("applies each rate to its own band in marginal mode", () => {
    const p = { commissionMode: "tiered", tieredMode: "marginal", tiers };
    // 50% at half rate, then 25% at full rate.
    expect(tieredPayoutMultiple(0.75, p)).toBeCloseTo(0.5 * 0.5 + 0.25 * 1, 6);
  });

  it("applies the top rate reached to everything in retroactive mode", () => {
    const p = { commissionMode: "tiered", tieredMode: "retroactive", tiers };
    expect(tieredPayoutMultiple(1, p)).toBeCloseTo(1 * 1, 6);
    expect(tieredPayoutMultiple(1.5, p)).toBeCloseTo(1.5 * 2, 6);
  });

  it("diverges sharply between the two modes at a boundary, which is the point of the distinction", () => {
    const marginal = tieredPayoutMultiple(1.5, { commissionMode: "tiered", tieredMode: "marginal", tiers });
    const retro = tieredPayoutMultiple(1.5, { commissionMode: "tiered", tieredMode: "retroactive", tiers });
    expect(retro).toBeGreaterThan(marginal * 1.4);
  });

  it("extends the last tier's rate above the final threshold", () => {
    const p = { commissionMode: "tiered", tieredMode: "marginal", tiers };
    const atCap = tieredPayoutMultiple(1.5, p);
    expect(tieredPayoutMultiple(2, p)).toBeCloseTo(atCap + 0.5 * 2, 6);
  });

  it("sorts tiers given out of order", () => {
    const shuffled = { commissionMode: "tiered", tieredMode: "marginal", tiers: [tiers[2], tiers[0], tiers[1]] };
    const ordered = { commissionMode: "tiered", tieredMode: "marginal", tiers };
    expect(tieredPayoutMultiple(1.2, shuffled)).toBeCloseTo(tieredPayoutMultiple(1.2, ordered), 6);
  });

  it("falls back to linear when no tiers are defined", () => {
    expect(tieredPayoutMultiple(0.9, { commissionMode: "tiered", tiers: [] })).toBeCloseTo(0.9, 6);
  });
});

describe("payoutMultiple", () => {
  it("routes to the mode the plan declares", () => {
    const tiered = { commissionMode: "tiered", tieredMode: "retroactive", tiers: [{ upToAttainment: 1, multiplier: 3 }] };
    expect(payoutMultiple(1, tiered)).toBeCloseTo(3, 6);
    expect(payoutMultiple(1, plan())).toBeCloseTo(1, 6);
  });
});

describe("variablePayForYear", () => {
  const base = 100000;

  it("is absent when the offer has no variable pay", () => {
    expect(variablePayForYear(createOffer(), 0, base)).toBeNull();
  });

  it("pays target at full attainment", () => {
    const offer = createOffer({ targetVariable: 100000, expectedAttainment: 1 });
    expect(variablePayForYear(offer, 0, base).gross).toBeCloseTo(100000, 6);
  });

  it("discounts a quoted OTE by realistic attainment", () => {
    const offer = createOffer({ targetVariable: 100000, expectedAttainment: 0.45 });
    const v = variablePayForYear(offer, 0, base);
    expect(v.gross).toBeCloseTo(45000, 6);
    expect(v.ote).toBe(200000);
    expect(v.atTarget).toBe(100000);
  });

  it("surfaces the pay mix", () => {
    const offer = createOffer({ targetVariable: 100000 });
    expect(variablePayForYear(offer, 0, 100000).payMix).toBeCloseTo(0.5, 6);
  });

  it("caps the payout and says it did", () => {
    const offer = createOffer({
      targetVariable: 100000,
      expectedAttainment: 2,
      acceleratorMultiplier: 2,
      payoutCapPercent: 1.5,
    });
    const v = variablePayForYear(offer, 0, base);
    expect(v.gross).toBeCloseTo(150000, 6);
    expect(v.wasCapped).toBe(true);
  });

  describe("ramp", () => {
    const offer = createOffer({
      targetVariable: 120000,
      expectedAttainment: 0.5,
      rampMonths: 6,
      rampPayoutPercent: 1,
    });

    it("pays full target for the ramp months regardless of attainment", () => {
      const v = variablePayForYear(offer, 0, base);
      expect(v.rampPay).toBeCloseTo(60000, 6);
      expect(v.earnedPay).toBeCloseTo(60000 * 0.5, 6);
      expect(v.gross).toBeCloseTo(90000, 6);
    });

    it("applies only to year one", () => {
      const v = variablePayForYear(offer, 1, base);
      expect(v.rampMonths).toBe(0);
      expect(v.gross).toBeCloseTo(60000, 6);
    });

    it("raises year-one pay above the steady state for an under-performer", () => {
      const y1 = variablePayForYear(offer, 0, base).gross;
      const y2 = variablePayForYear(offer, 1, base).gross;
      expect(y1).toBeGreaterThan(y2);
    });
  });

  describe("draw", () => {
    const shortfall = { targetVariable: 100000, expectedAttainment: 0.3, drawAmount: 50000 };

    it("floors the payout when the draw is non-recoverable", () => {
      const v = variablePayForYear(createOffer({ ...shortfall, drawRecoverable: false }), 0, base);
      expect(v.gross).toBeCloseTo(50000, 6);
      expect(v.drawShortfall).toBe(0);
    });

    it("leaves a debt instead of a floor when the draw is recoverable", () => {
      const v = variablePayForYear(createOffer({ ...shortfall, drawRecoverable: true }), 0, base);
      expect(v.gross).toBeCloseTo(30000, 6);
      expect(v.drawShortfall).toBeCloseTo(20000, 6);
    });

    it("leaves no debt when earnings clear the draw", () => {
      const v = variablePayForYear(
        createOffer({ targetVariable: 100000, expectedAttainment: 1, drawAmount: 50000, drawRecoverable: true }),
        0,
        base,
      );
      expect(v.drawShortfall).toBe(0);
    });
  });

  it("subtracts expected clawback from what is realized", () => {
    const offer = createOffer({ targetVariable: 100000, expectedAttainment: 1, clawbackPercent: 0.1 });
    const v = variablePayForYear(offer, 0, base);
    expect(v.clawback).toBeCloseTo(10000, 6);
    expect(v.net).toBeCloseTo(90000, 6);
  });
});

describe("attainmentScenarios", () => {
  it("is empty without variable pay", () => {
    expect(attainmentScenarios(createOffer())).toEqual([]);
  });

  it("rises monotonically across attainment levels", () => {
    const offer = createOffer({ targetVariable: 100000, acceleratorMultiplier: 2 });
    const curve = attainmentScenarios(offer);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].payout).toBeGreaterThan(curve[i - 1].payout);
    }
  });

  it("flags the levels a cap truncates", () => {
    const offer = createOffer({ targetVariable: 100000, payoutCapPercent: 1 });
    const curve = attainmentScenarios(offer);
    expect(curve.find((c) => c.attainment === 1.5).capped).toBe(true);
    expect(curve.find((c) => c.attainment === 0.75).capped).toBe(false);
  });
});

describe("commission inside the full projection", () => {
  const offer = createOffer({
    name: "AE",
    annualSalary: 110000,
    annualRaiseRate: 0,
    state: "TX",
    retirementOffered: false,
    targetVariable: 110000,
    expectedAttainment: 0.7,
    rampMonths: 6,
    clawbackPercent: 0.05,
  });
  const projection = projectOffer(offer, CONTEXT);

  it("taxes commission as ordinary income", () => {
    const y = projection.years[1];
    expect(y.grossWages).toBeCloseTo(110000 + y.variableTotal, 6);
  });

  it("pays more in the ramp year than in steady state at low attainment", () => {
    expect(projection.years[0].variableTotal).toBeGreaterThan(projection.years[1].variableTotal);
  });

  it("lands well below the quoted OTE, which is the point of the attainment input", () => {
    const steady = projection.years[1];
    expect(steady.variable.ote).toBe(220000);
    expect(steady.grossWages).toBeLessThan(220000);
  });

  it("exposes the payout curve for the report", () => {
    expect(projection.attainmentCurve).toHaveLength(5);
  });
});
