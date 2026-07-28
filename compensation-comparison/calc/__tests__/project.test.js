import { describe, it, expect } from "vitest";
import { createOffer } from "../../model/offer.js";
import { projectOffer } from "../project.js";
import { baseWagesForYear, bonusesForYear, matchVestedFraction } from "../pay.js";
import { FEDERAL } from "../data/federal.js";

const CONTEXT = { filingStatus: "single", taxYear: 2026, horizonYears: 5 };
const LIMITS = FEDERAL[2026].retirementLimits;

function salaried(overrides = {}) {
  return createOffer({
    name: "Test",
    payType: "salary",
    annualSalary: 120000,
    ftePercent: 1,
    annualRaiseRate: 0.03,
    payFrequency: 24,
    state: "CO",
    retirementOffered: false,
    ...overrides,
  });
}

describe("baseWagesForYear", () => {
  it("does not raise year one", () => {
    expect(baseWagesForYear(salaried(), 0).total).toBeCloseTo(120000, 6);
  });

  it("compounds the raise from year two onward", () => {
    expect(baseWagesForYear(salaried(), 2).total).toBeCloseTo(120000 * 1.03 ** 2, 6);
  });

  it("scales salary by the full-time percentage", () => {
    expect(baseWagesForYear(salaried({ ftePercent: 0.5 }), 0).total).toBeCloseTo(60000, 6);
  });

  describe("hourly", () => {
    const hourly = salaried({
      payType: "hourly",
      hourlyRate: 20,
      hoursPerWeek: 40,
      weeksPerYear: 52,
      overtimeMultiplier: 1.5,
      overtimeHoursPerWeek: 5,
      shiftDifferentialRate: 2,
      shiftDifferentialHours: 10,
      annualRaiseRate: 0,
    });

    it("annualizes regular hours", () => {
      expect(baseWagesForYear(hourly, 0).regular).toBeCloseTo(20 * 40 * 52, 6);
    });

    it("pays overtime at the multiplier", () => {
      expect(baseWagesForYear(hourly, 0).overtime).toBeCloseTo(20 * 1.5 * 5 * 52, 6);
    });

    it("treats the shift differential as a flat premium, not a raised rate", () => {
      expect(baseWagesForYear(hourly, 0).differential).toBeCloseTo(2 * 10 * 52, 6);
    });

    it("shortens the year for seasonal work", () => {
      const seasonal = { ...hourly, weeksPerYear: 26 };
      expect(baseWagesForYear(seasonal, 0).regular).toBeCloseTo(20 * 40 * 26, 6);
    });
  });
});

describe("bonusesForYear", () => {
  const signing = { id: "s", label: "Signing", basis: "amount", amount: 20000, recurrence: "oneTime", year: 1 };
  const perf = { id: "p", label: "Performance", basis: "percentOfBase", percent: 0.1, recurrence: "annual", realizationRate: 1 };

  it("pays a one-time bonus only in its stated year", () => {
    const offer = salaried({ bonuses: [signing] });
    expect(bonusesForYear(offer, 0, 120000)).toHaveLength(1);
    expect(bonusesForYear(offer, 1, 120000)).toHaveLength(0);
  });

  it("pays a recurring bonus every year", () => {
    const offer = salaried({ bonuses: [perf] });
    expect(bonusesForYear(offer, 3, 120000)[0].amount).toBeCloseTo(12000, 6);
  });

  it("discounts a recurring bonus by its realization rate", () => {
    const offer = salaried({ bonuses: [{ ...perf, realizationRate: 0.8 }] });
    const [bonus] = bonusesForYear(offer, 0, 120000);
    expect(bonus.face).toBeCloseTo(12000, 6);
    expect(bonus.amount).toBeCloseTo(9600, 6);
  });

  it("does not discount a one-time bonus, which is contractual rather than a target", () => {
    const offer = salaried({ bonuses: [{ ...signing, realizationRate: 0.5 }] });
    expect(bonusesForYear(offer, 0, 120000)[0].amount).toBeCloseTo(20000, 6);
  });

  it("skips a zero bonus rather than emitting an empty line", () => {
    expect(bonusesForYear(salaried({ bonuses: [{ ...signing, amount: 0 }] }), 0, 120000)).toHaveLength(0);
  });
});

describe("matchVestedFraction", () => {
  it("vests immediately with no cliff", () => {
    expect(matchVestedFraction(salaried({ matchVestingYears: 0 }), 1)).toBe(1);
  });

  it("vests nothing before the cliff and everything at it", () => {
    const offer = salaried({ matchVestingYears: 3 });
    expect(matchVestedFraction(offer, 2)).toBe(0);
    expect(matchVestedFraction(offer, 3)).toBe(1);
  });
});

describe("projectOffer", () => {
  it("produces one entry per horizon year", () => {
    expect(projectOffer(salaried(), CONTEXT).years).toHaveLength(5);
  });

  it("keeps take-home below gross and total compensation at or above it", () => {
    const [year] = projectOffer(salaried(), CONTEXT).years;
    expect(year.takeHome).toBeLessThan(year.grossWages);
    expect(year.totalCompensation).toBeGreaterThanOrEqual(year.grossWages);
  });

  it("counts the employer match as compensation but not as take-home", () => {
    const offer = salaried({ retirementOffered: true, employerMatchRate: 0.04, employeeDeferralRate: 0 });
    const [year] = projectOffer(offer, CONTEXT).years;
    expect(year.totalCompensation - year.grossWages).toBeCloseTo(120000 * 0.04, 6);
    expect(year.retirement.employer).toBeCloseTo(120000 * 0.04, 6);
  });

  it("caps the employer match at the stated percent of salary", () => {
    const offer = salaried({ retirementOffered: true, employerMatchRate: 0.5, employerMatchCapPercent: 0.04 });
    expect(projectOffer(offer, CONTEXT).years[0].retirement.employer).toBeCloseTo(120000 * 0.04, 6);
  });

  it("caps the employee deferral at the statutory limit", () => {
    const offer = salaried({ retirementOffered: true, employeeDeferralRate: 0.9 });
    expect(projectOffer(offer, CONTEXT).years[0].retirement.employee).toBeCloseTo(LIMITS.elective402g, 6);
  });

  it("withholds a deferral from take-home, since it is earned but not received", () => {
    const none = projectOffer(salaried({ retirementOffered: false }), CONTEXT).years[0];
    const some = projectOffer(
      salaried({ retirementOffered: true, employeeDeferralRate: 0.1, deferralType: "traditional" }),
      CONTEXT,
    ).years[0];
    expect(some.takeHome).toBeLessThan(none.takeHome);
  });

  it("leaves a Roth deferral taxed where a traditional one is not", () => {
    const trad = projectOffer(
      salaried({ retirementOffered: true, employeeDeferralRate: 0.1, deferralType: "traditional" }),
      CONTEXT,
    ).years[0];
    const roth = projectOffer(
      salaried({ retirementOffered: true, employeeDeferralRate: 0.1, deferralType: "roth" }),
      CONTEXT,
    ).years[0];
    expect(roth.taxes.federal.tax).toBeGreaterThan(trad.taxes.federal.tax);
    expect(roth.takeHome).toBeLessThan(trad.takeHome);
  });

  it("withholds nothing before the eligibility waiting period elapses", () => {
    const offer = salaried({
      retirementOffered: true,
      retirementEligibilityMonths: 12,
      employerMatchRate: 0.04,
    });
    const projection = projectOffer(offer, CONTEXT);
    expect(projection.years[0].retirement.employer).toBe(0);
    expect(projection.years[1].retirement.employer).toBeGreaterThan(0);
  });

  it("divides the year into the stated number of paychecks", () => {
    const [year] = projectOffer(salaried({ payFrequency: 26 }), CONTEXT).years;
    expect(year.perPaycheck.periods).toBe(26);
    expect(year.perPaycheck.gross * 26).toBeCloseTo(year.grossWages, 4);
  });

  it("accumulates cumulative totals monotonically", () => {
    const { cumulative } = projectOffer(salaried(), CONTEXT);
    for (let i = 1; i < cumulative.length; i += 1) {
      expect(cumulative[i].takeHome).toBeGreaterThan(cumulative[i - 1].takeHome);
      expect(cumulative[i].totalCompensation).toBeGreaterThan(cumulative[i - 1].totalCompensation);
    }
  });

  it("keeps year-one total compensation within salary plus bonuses plus match", () => {
    // The spreadsheet this replaces reported $355,504 on a $175,000 salary
    // because a SUM range swept in the gross paycheck and two rate cells,
    // then multiplied the result by 24.
    const offer = salaried({
      retirementOffered: true,
      employerMatchRate: 0.04,
      bonuses: [{ id: "b", label: "Signing", basis: "amount", amount: 20000, recurrence: "oneTime", year: 1 }],
    });
    const [year] = projectOffer(offer, CONTEXT).years;
    expect(year.totalCompensation).toBeCloseTo(120000 + 20000 + 4800, 6);
  });
});

describe("exit-year series", () => {
  const offer = salaried({
    retirementOffered: true,
    employerMatchRate: 0.04,
    matchVestingYears: 3,
    bonuses: [
      { id: "s", label: "Signing", basis: "amount", amount: 20000, recurrence: "oneTime", year: 1, clawbackYears: 2 },
    ],
  });
  const projection = projectOffer(offer, CONTEXT);

  it("forfeits the whole match before the vesting cliff", () => {
    expect(projection.exitYears[0].vestedMatch).toBe(0);
    expect(projection.exitYears[0].forfeitedMatch).toBeGreaterThan(0);
  });

  it("forfeits nothing once the cliff is reached", () => {
    expect(projection.exitYears[2].forfeitedMatch).toBe(0);
  });

  it("repays a signing bonus inside its clawback window", () => {
    expect(projection.exitYears[0].clawback).toBeCloseTo(20000, 6);
  });

  it("stops repaying once the window closes", () => {
    expect(projection.exitYears[2].clawback).toBe(0);
  });

  it("realizes less than the projected total at every early exit", () => {
    const total = projection.cumulative[4].totalCompensation;
    for (const exit of projection.exitYears.slice(0, 4)) {
      expect(exit.realized).toBeLessThan(total);
    }
  });

  it("reaches take-home plus vested match at the final year", () => {
    const final = projection.exitYears[4];
    const cumulative = projection.cumulative[4];
    expect(final.realized).toBeCloseTo(cumulative.takeHome + cumulative.employerRetirement, 4);
  });

  it("rises every year", () => {
    const values = projection.exitYears.map((e) => e.realized);
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

describe("total compensation is the sum of its parts", () => {
  // The composition chart must show every one of these or its bars will not
  // add up to the figure the rest of the report states.
  it("equals wages plus bonus plus commission plus taxable equity plus employer match and health", () => {
    const offer = salaried({
      retirementOffered: true,
      employerMatchRate: 0.04,
      employerPremiumPerPaycheck: 400,
      hsaEmployerSeed: 800,
      targetVariable: 40000,
      expectedAttainment: 1,
      bonuses: [{ id: "b", label: "Perf", basis: "amount", amount: 10000, recurrence: "annual", realizationRate: 1 }],
      grants: [{ id: "g", label: "RSU", instrument: "rsu", grantYear: 1, grantValue: 100000, vestingPreset: "even4" }],
    });
    const [year] = projectOffer(offer, CONTEXT).years;

    const parts =
      year.wages.total +
      year.bonusTotal +
      year.variableTotal +
      year.equity.total +
      year.retirement.employer +
      year.employerHealth.total;

    expect(year.totalCompensation).toBeCloseTo(parts, 6);
  });
});
