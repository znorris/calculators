import { describe, it, expect } from "vitest";
import {
  benefitDeductions,
  employerHealthValue,
  expectedMedicalCost,
  onsiteDaysPerYear,
  benefitValue,
  WORKING_DAYS,
} from "../benefits.js";
import { computeFica, computeAllTaxes } from "../tax.js";
import { createOffer } from "../../model/offer.js";
import { projectOffer } from "../project.js";

const CONTEXT = { filingStatus: "single", taxYear: 2026, horizonYears: 5 };

describe("benefitDeductions", () => {
  const offer = createOffer({
    payFrequency: 24,
    medicalPremiumPerPaycheck: 200,
    dentalPremiumPerPaycheck: 30,
    visionPremiumPerPaycheck: 10,
    hsaEmployeeContribution: 4400,
    lifeInsurancePerPaycheck: 12,
    ltdPerPaycheck: 25,
    stdPerPaycheck: 50,
  });

  it("annualizes premiums at the offer's pay frequency", () => {
    expect(benefitDeductions(offer, 24).section125).toBeCloseTo((200 + 30 + 10) * 24, 6);
  });

  it("scales with a different pay frequency", () => {
    expect(benefitDeductions(offer, 26).section125).toBeCloseTo((200 + 30 + 10) * 26, 6);
  });

  it("groups the deductions that escape payroll tax", () => {
    const d = benefitDeductions(offer, 24);
    expect(d.reducesBothBases).toBeCloseTo(240 * 24 + 4400, 6);
  });

  it("keeps life and disability after tax, so the payout stays untaxed", () => {
    expect(benefitDeductions(offer, 24).postTax).toBeCloseTo((12 + 25 + 50) * 24, 6);
  });

  it("charges nothing on an offer with no benefits entered", () => {
    expect(benefitDeductions(createOffer(), 24).total).toBe(0);
  });
});

describe("the Section 125 mechanism", () => {
  it("lowers the payroll tax base, unlike a 401k deferral", () => {
    const plain = computeFica(120000, "single", 2026);
    const withPremiums = computeFica(120000, "single", 2026, 6000);
    expect(withPremiums.total).toBeLessThan(plain.total);
    expect(plain.total - withPremiums.total).toBeCloseTo(6000 * (0.062 + 0.0145), 6);
  });

  it("lowers income tax and payroll tax together, where a 401k lowers only income tax", () => {
    const base = { grossWages: 120000, filingStatus: "single", taxYear: 2026, stateCode: "TX" };
    const with401k = computeAllTaxes({ ...base, preTaxDeductions: 6000 });
    const withHsa = computeAllTaxes({ ...base, ficaExemptDeductions: 6000 });

    expect(with401k.federal.tax).toBeCloseTo(withHsa.federal.tax, 6);
    expect(withHsa.fica.total).toBeLessThan(with401k.fica.total);
    expect(withHsa.total).toBeLessThan(with401k.total);
  });

  it("saves the payroll tax rate on every deferred dollar", () => {
    const base = { grossWages: 120000, filingStatus: "single", taxYear: 2026, stateCode: "TX" };
    const none = computeAllTaxes(base);
    const some = computeAllTaxes({ ...base, ficaExemptDeductions: 4400 });
    const saving = none.total - some.total;
    // Income tax at the marginal rate plus 7.65% of payroll tax.
    expect(saving).toBeCloseTo(4400 * (none.federal.marginalRate + 0.0765), 0);
  });
});

describe("employerHealthValue", () => {
  it("counts the premium share and the HSA seed separately", () => {
    const offer = createOffer({ employerPremiumPerPaycheck: 500, hsaEmployerSeed: 1200 });
    const value = employerHealthValue(offer, 24);
    expect(value.premium).toBe(12000);
    expect(value.hsaSeed).toBe(1200);
    expect(value.total).toBe(13200);
  });
});

describe("expectedMedicalCost", () => {
  it("caps spending at the out-of-pocket maximum", () => {
    expect(expectedMedicalCost(createOffer({ expectedMedicalSpend: 20000, outOfPocketMax: 6000 }))).toBe(6000);
  });

  it("uses the expected figure when it is below the cap", () => {
    expect(expectedMedicalCost(createOffer({ expectedMedicalSpend: 1500, outOfPocketMax: 6000 }))).toBe(1500);
  });

  it("does not cap when no maximum is given", () => {
    expect(expectedMedicalCost(createOffer({ expectedMedicalSpend: 9000 }))).toBe(9000);
  });
});

describe("onsiteDaysPerYear", () => {
  it("is zero for a remote role, whatever the day count says", () => {
    expect(onsiteDaysPerYear(createOffer({ workArrangement: "remote", daysOnsitePerWeek: 5 }))).toBe(0);
  });

  it("annualizes a hybrid week", () => {
    expect(onsiteDaysPerYear(createOffer({ workArrangement: "hybrid", daysOnsitePerWeek: 3 }))).toBe(156);
  });

  it("clamps a nonsense day count to a week", () => {
    expect(onsiteDaysPerYear(createOffer({ workArrangement: "onsite", daysOnsitePerWeek: 99 }))).toBe(7 * 52);
  });
});

describe("benefitValue", () => {
  const dailyRate = 120000 / WORKING_DAYS;

  it("prices meals only on days actually spent onsite", () => {
    const hybrid = benefitValue(
      createOffer({ workArrangement: "hybrid", daysOnsitePerWeek: 2, lunchPerDay: 15 }),
      dailyRate,
    );
    expect(hybrid.meals).toBeCloseTo(15 * 104, 6);
  });

  it("prices a free lunch at nothing for a remote role", () => {
    const remote = benefitValue(createOffer({ workArrangement: "remote", lunchPerDay: 15 }), dailyRate);
    expect(remote.meals).toBe(0);
  });

  it("values PTO at the daily rate", () => {
    const offer = createOffer({ ptoDays: 20 });
    expect(benefitValue(offer, dailyRate).timeOff).toBeCloseTo(20 * dailyRate, 6);
  });

  it("values unlimited PTO at the days actually taken, not at nothing and not at infinity", () => {
    const unlimited = createOffer({ unlimitedPto: true, expectedDaysTaken: 12, ptoDays: 25 });
    expect(benefitValue(unlimited, dailyRate).timeOff).toBeCloseTo(12 * dailyRate, 6);
  });

  it("counts holidays separately from PTO", () => {
    const offer = createOffer({ ptoDays: 15, paidHolidays: 11 });
    const value = benefitValue(offer, dailyRate);
    expect(value.timeOff).toBeCloseTo(15 * dailyRate, 6);
    expect(value.holidays).toBeCloseTo(11 * dailyRate, 6);
  });

  it("subtracts commuting rather than adding it", () => {
    const offer = createOffer({ workArrangement: "onsite", daysOnsitePerWeek: 5, commuteCostPerDay: 12 });
    const value = benefitValue(offer, dailyRate);
    expect(value.commuteCost).toBeCloseTo(12 * 260, 6);
    expect(value.net).toBeLessThan(0);
  });

  it("leaves commute time unpriced unless asked", () => {
    const base = { workArrangement: "onsite", daysOnsitePerWeek: 5, commuteMinutesPerDay: 60 };
    expect(benefitValue(createOffer(base), dailyRate).commuteTimeCost).toBe(0);
    expect(benefitValue(createOffer({ ...base, valueCommuteTime: true }), dailyRate).commuteTimeCost).toBeGreaterThan(0);
  });

  it("keeps parental leave out of the annual net, since it pays once if at all", () => {
    const offer = createOffer({ parentalLeaveWeeks: 12 });
    const value = benefitValue(offer, dailyRate);
    expect(value.parentalLeave).toBeCloseTo(12 * 5 * dailyRate, 6);
    expect(value.net).toBe(0);
  });
});

describe("benefits inside the full projection", () => {
  const offer = createOffer({
    name: "Benefits",
    annualSalary: 120000,
    annualRaiseRate: 0,
    payFrequency: 24,
    state: "TX",
    retirementOffered: false,
    employerPremiumPerPaycheck: 500,
    medicalPremiumPerPaycheck: 200,
    hsaEmployerSeed: 1000,
    ptoDays: 20,
    workArrangement: "onsite",
    daysOnsitePerWeek: 5,
    lunchPerDay: 15,
  });
  const projection = projectOffer(offer, CONTEXT);
  const [year] = projection.years;

  it("takes the premium out of take-home", () => {
    const without = projectOffer(
      createOffer({ ...offer, id: "x", medicalPremiumPerPaycheck: 0 }),
      CONTEXT,
    ).years[0];
    expect(year.takeHome).toBeLessThan(without.takeHome);
  });

  it("charges less than the full premium, because it escapes both tax bases", () => {
    const without = projectOffer(
      createOffer({ ...offer, id: "x", medicalPremiumPerPaycheck: 0 }),
      CONTEXT,
    ).years[0];
    const premium = 200 * 24;
    expect(without.takeHome - year.takeHome).toBeLessThan(premium);
  });

  it("counts the employer premium share toward total compensation", () => {
    expect(year.totalCompensation).toBeCloseTo(120000 + 500 * 24 + 1000, 6);
  });

  it("keeps dollarized perks out of total compensation", () => {
    expect(year.totalCompensation).toBeLessThan(year.totalRewards);
    expect(year.benefits.meals).toBeGreaterThan(0);
  });

  it("reports total rewards as compensation plus benefits net of medical spend", () => {
    expect(year.totalRewards).toBeCloseTo(
      year.totalCompensation + year.benefits.net - year.medicalCost,
      6,
    );
  });

  it("shows the benefit deduction on the paycheck", () => {
    expect(year.perPaycheck.benefits).toBeCloseTo(200, 6);
  });
});
