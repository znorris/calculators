import { describe, it, expect } from "vitest";
import {
  computeFica,
  computeFederalIncomeTax,
  computeStateTax,
  computeCityTax,
  computeAllTaxes,
} from "../tax.js";
import { FEDERAL } from "../data/federal.js";

const YEAR = 2026;
const { fica: FICA } = FEDERAL[YEAR];

describe("computeFica", () => {
  it("charges Social Security on every dollar below the wage base", () => {
    expect(computeFica(100000, "single", YEAR).socialSecurity).toBeCloseTo(100000 * 0.062, 6);
  });

  it("stops charging Social Security at the wage base", () => {
    const over = computeFica(FICA.socialSecurityWageBase * 2, "single", YEAR);
    expect(over.socialSecurity).toBeCloseTo(FICA.socialSecurityWageBase * 0.062, 6);
    expect(over.hitWageBase).toBe(true);
  });

  it("never caps Medicare", () => {
    expect(computeFica(1000000, "single", YEAR).medicare).toBeCloseTo(1000000 * 0.0145, 6);
  });

  it("applies the Additional Medicare surtax only above the filing-status threshold", () => {
    expect(computeFica(150000, "single", YEAR).additionalMedicare).toBe(0);
    expect(computeFica(300000, "single", YEAR).additionalMedicare).toBeCloseTo(100000 * 0.009, 6);
  });

  it("uses a higher surtax threshold for joint filers than for separate ones", () => {
    const joint = computeFica(240000, "marriedJoint", YEAR).additionalMedicare;
    const separate = computeFica(240000, "marriedSeparate", YEAR).additionalMedicare;
    expect(joint).toBe(0);
    expect(separate).toBeGreaterThan(0);
  });

  it("separates what the employer withholds from what the employee owes", () => {
    // A joint filer at $220k owes nothing but has withholding taken anyway,
    // because the employer keys off a flat $200k regardless of filing status.
    const result = computeFica(220000, "marriedJoint", YEAR);
    expect(result.additionalMedicare).toBe(0);
    expect(result.withheldAdditionalMedicare).toBeCloseTo(20000 * 0.009, 6);
  });

  it("charges nothing on zero wages", () => {
    expect(computeFica(0, "single", YEAR).total).toBe(0);
  });
});

describe("computeFederalIncomeTax", () => {
  it("subtracts the standard deduction before applying brackets", () => {
    const result = computeFederalIncomeTax({
      grossWages: 50000,
      filingStatus: "single",
      taxYear: YEAR,
    });
    expect(result.taxableIncome).toBeCloseTo(50000 - result.standardDeduction, 6);
  });

  it("owes nothing when the standard deduction exceeds income", () => {
    const result = computeFederalIncomeTax({ grossWages: 5000, filingStatus: "single", taxYear: YEAR });
    expect(result.taxableIncome).toBe(0);
    expect(result.tax).toBe(0);
  });

  it("reports an effective rate below the marginal rate", () => {
    const result = computeFederalIncomeTax({ grossWages: 120000, filingStatus: "single", taxYear: YEAR });
    expect(result.effectiveRate).toBeLessThan(result.marginalRate);
  });

  it("taxes a joint filer less than a single filer on identical wages", () => {
    const single = computeFederalIncomeTax({ grossWages: 120000, filingStatus: "single", taxYear: YEAR });
    const joint = computeFederalIncomeTax({ grossWages: 120000, filingStatus: "marriedJoint", taxYear: YEAR });
    expect(joint.tax).toBeLessThan(single.tax);
  });

  describe("pre-tax deferrals", () => {
    const base = { grossWages: 120000, filingStatus: "single", taxYear: YEAR };

    it("lower the income tax base", () => {
      const without = computeFederalIncomeTax({ ...base, preTaxDeductions: 0 });
      const with401k = computeFederalIncomeTax({ ...base, preTaxDeductions: 24500 });
      expect(with401k.taxableIncome).toBeCloseTo(without.taxableIncome - 24500, 6);
    });

    it("save roughly the deferral times the marginal rate", () => {
      const without = computeFederalIncomeTax({ ...base, preTaxDeductions: 0 });
      const with401k = computeFederalIncomeTax({ ...base, preTaxDeductions: 24500 });
      expect(without.tax - with401k.tax).toBeCloseTo(24500 * without.marginalRate, -2);
    });

    it("do not touch FICA, which is the distinction a blended rate cannot express", () => {
      const ficaTotal = computeFica(120000, "single", YEAR).total;
      const all = computeAllTaxes({ ...base, preTaxDeductions: 24500, stateCode: "TX" });
      expect(all.fica.total).toBeCloseTo(ficaTotal, 6);
    });
  });
});

describe("computeStateTax", () => {
  it("charges nothing in a state with no wage income tax", () => {
    const tx = computeStateTax({ grossWages: 120000, filingStatus: "single", stateCode: "TX" });
    expect(tx.available).toBe(true);
    expect(tx.total).toBe(0);
  });

  it("reports an unknown jurisdiction as unavailable rather than untaxed", () => {
    const result = computeStateTax({ grossWages: 120000, filingStatus: "single", stateCode: "ZZ" });
    expect(result.available).toBe(false);
    expect(result.total).toBe(0);
  });

  it("treats a blank state the same way", () => {
    expect(computeStateTax({ grossWages: 100000, filingStatus: "single", stateCode: "" }).available).toBe(false);
  });

  it("applies a flat state rate after any state deduction", () => {
    const co = computeStateTax({ grossWages: 100000, filingStatus: "single", stateCode: "CO" });
    expect(co.kind).toBe("flat");
    expect(co.marginalRate).toBeGreaterThan(0);
    expect(co.tax).toBeGreaterThan(0);
    expect(co.tax).toBeLessThan(100000 * co.marginalRate + 1);
  });

  it("charges California's uncapped disability deduction on the full wage", () => {
    const ca = computeStateTax({ grossWages: 400000, filingStatus: "single", stateCode: "CA" });
    expect(ca.payrollTotal).toBeCloseTo(400000 * 0.013, 4);
  });

  it("taxes California progressively, so a doubled wage more than doubles the tax", () => {
    const low = computeStateTax({ grossWages: 60000, filingStatus: "single", stateCode: "CA" });
    const high = computeStateTax({ grossWages: 120000, filingStatus: "single", stateCode: "CA" });
    expect(high.tax).toBeGreaterThan(low.tax * 2);
  });

  it("lets a pre-tax deferral reduce state tax too", () => {
    const without = computeStateTax({ grossWages: 120000, filingStatus: "single", stateCode: "CA" });
    const withDeferral = computeStateTax({
      grossWages: 120000,
      preTaxDeductions: 24500,
      filingStatus: "single",
      stateCode: "CA",
    });
    expect(withDeferral.tax).toBeLessThan(without.tax);
  });
});

describe("computeCityTax", () => {
  it("charges nothing without a rate", () => {
    expect(computeCityTax({ grossWages: 100000, taxableIncome: 80000, rate: null })).toBe(0);
  });

  it("charges more on gross than on income after deductions", () => {
    const gross = computeCityTax({ grossWages: 100000, taxableIncome: 80000, rate: 0.03, base: "gross" });
    const taxable = computeCityTax({ grossWages: 100000, taxableIncome: 80000, rate: 0.03, base: "taxable" });
    expect(gross).toBeCloseTo(3000, 6);
    expect(taxable).toBeCloseTo(2400, 6);
  });

  it("defaults to gross when no base is given, matching most local wage taxes", () => {
    expect(computeCityTax({ grossWages: 100000, taxableIncome: 80000, rate: 0.03 })).toBeCloseTo(3000, 6);
  });
});

describe("computeAllTaxes", () => {
  const args = {
    grossWages: 120000,
    filingStatus: "single",
    taxYear: YEAR,
    stateCode: "CA",
    cityTaxRate: null,
  };

  it("sums its parts", () => {
    const all = computeAllTaxes(args);
    expect(all.total).toBeCloseTo(all.federal.tax + all.fica.total + all.state.total + all.city, 6);
  });

  it("reports a combined marginal rate above the federal one in a taxed state", () => {
    const all = computeAllTaxes(args);
    expect(all.combinedMarginalRate).toBeGreaterThan(all.federal.marginalRate);
  });

  it("leaves the combined marginal rate at the federal one in an untaxed state", () => {
    const all = computeAllTaxes({ ...args, stateCode: "TX" });
    expect(all.combinedMarginalRate).toBeCloseTo(all.federal.marginalRate, 6);
  });

  it("takes less than half of a typical wage", () => {
    expect(computeAllTaxes(args).effectiveRate).toBeLessThan(0.5);
  });
});
