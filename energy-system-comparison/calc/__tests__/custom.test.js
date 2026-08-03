import { describe, it, expect } from "vitest";
import { buildCustomProfile, validateProfile } from "../tariffs/custom.js";

describe("buildCustomProfile", () => {
  it("wraps flat-seasonal pricing into a single-schedule profile with sensible defaults", () => {
    const profile = buildCustomProfile({
      id: "my-utility",
      label: "My Utility",
      fixedChargePerMonth: 12,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
    });

    expect(profile.id).toBe("my-utility");
    expect(profile.schedules).toHaveLength(1);
    expect(profile.schedules[0].fixedChargePerMonth).toBe(12);
    expect(profile.schedules[0].pricing.summerRate).toBe(0.2);
    expect(profile.constraints.allowedFinancing).toEqual(["cash", "loan"]);
    expect(profile.adders).toEqual([]);
    expect(profile.riders).toEqual([]);
    expect(profile.exportPolicy.type).toBe("avoidedCostCredit");
  });

  it("carries a demand block through onto the schedule when given one", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 50,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
      demand: { ratePerKW: { summer: 5, winter: 4 } },
    });
    expect(profile.schedules[0].demand).toEqual({ ratePerKW: { summer: 5, winter: 4 } });
  });

  it("materializes a timeTable ExportRate's periods the same way it does TOU pricing periods", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 15,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
      exportPolicy: {
        type: "netMetering",
        netting: "hourly",
        exportRate: {
          kind: "timeTable",
          periods: [
            { rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20] } },
            { rate: { summer: 0.1, winter: 0.08 }, window: { hours: [20, 16] } },
          ],
        },
      },
    });

    const periods = profile.exportPolicy.exportRate.periods;
    expect(typeof periods[0].applies).toBe("function");
    expect(typeof periods[1].applies).toBe("function");
    // window.hours [16,20): hour 18 is inside period 0's window, outside period 1's.
    expect(periods[0].applies({ hourOfDay: 18, isHoliday: false, isWeekend: false })).toBe(true);
    expect(periods[1].applies({ hourOfDay: 18, isHoliday: false, isWeekend: false })).toBe(false);
    // The window descriptor itself survives alongside the materialized function.
    expect(periods[0].window).toEqual({ hours: [16, 20] });
    expect(validateProfile(profile)).toEqual([]);
  });

  it("leaves a non-timeTable ExportRate (a flat number) on the export policy untouched", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 15,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05, addersApply: false, carryForward: true, cashOut: false },
    });
    expect(profile.exportPolicy.ratePerKWh).toBe(0.05);
  });

  // Regression: buildCustomProfile used to destructure only
  // {id, label, fixedChargePerMonth, pricing, demand, adders, riders,
  // exportPolicy, constraints} off inputs, silently dropping
  // minimumBillPerMonth and systemSizeCharges even when a caller (the
  // CustomProfileBuilder form) supplied them -- the built schedule carried
  // neither field regardless of what was entered, so calc/billing.js's
  // minimum-bill floor and system-size charge never took effect for any
  // custom tariff. Fails before this fix (both fields absent from
  // profile.schedules[0]), passes after (both present and threaded through
  // to calc/billing.js unchanged).
  it("carries minimumBillPerMonth and systemSizeCharges through onto the schedule when given them", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
      minimumBillPerMonth: 25,
      systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 5 }],
    });
    expect(profile.schedules[0].minimumBillPerMonth).toBe(25);
    expect(profile.schedules[0].systemSizeCharges).toEqual([{ basis: "kW-DC-solar", ratePerMonth: 5 }]);
    expect(validateProfile(profile)).toEqual([]);
  });

  it("omits minimumBillPerMonth and systemSizeCharges from the schedule when not given (no floor, no charge, matching calc/billing.js's own absent-means-none default)", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.15 },
    });
    expect(profile.schedules[0].minimumBillPerMonth).toBeUndefined();
    expect(profile.schedules[0].systemSizeCharges).toBeUndefined();
  });

  it("round-trips into a profile that passes validateProfile", () => {
    const profile = buildCustomProfile({
      id: "round-trip",
      label: "Round Trip Utility",
      fixedChargePerMonth: 15,
      pricing: {
        type: "tiered",
        rates: [0.1, 0.2, 0.3],
        breakpoints: { summer: [300, 600], winter: [400, 800] },
      },
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05, addersApply: false, carryForward: true, cashOut: false },
    });
    expect(validateProfile(profile)).toEqual([]);
  });
});

describe("validateProfile", () => {
  it("catches a negative rate inside the built schedule", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 15,
      pricing: { type: "flat-seasonal", summerRate: -0.1, winterRate: 0.15 },
    });
    const errors = validateProfile(profile);
    expect(errors.some((e) => /non-negative/.test(e))).toBe(true);
  });

  it("catches missing tiers (breakpoints omitted on a tiered schedule)", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: 15,
      pricing: { type: "tiered", rates: [0.1, 0.2, 0.3] },
    });
    const errors = validateProfile(profile);
    expect(errors.some((e) => /breakpoints/.test(e))).toBe(true);
  });

  it("catches a negative fixed charge", () => {
    const profile = buildCustomProfile({
      fixedChargePerMonth: -5,
      pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
    });
    const errors = validateProfile(profile);
    expect(errors.some((e) => /fixedChargePerMonth/.test(e))).toBe(true);
  });

  it("passes a fully valid hand-assembled profile", () => {
    const profile = {
      id: "hand",
      label: "Hand Assembled",
      schedules: [
        {
          id: "hand-schedule",
          label: "Hand Assembled",
          fixedChargePerMonth: 10,
          pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
        },
      ],
      adders: [],
      riders: [],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05, addersApply: false, carryForward: true, cashOut: false },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 100, threePhase: 200 } },
    };
    expect(validateProfile(profile)).toEqual([]);
  });
});
