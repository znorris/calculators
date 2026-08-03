import { describe, it, expect } from "vitest";
import {
  LODI,
  LODI_EA,
  LODI_EV,
  LODI_G1,
  LODI_G2,
  LODI_ECA_MONTHLY,
  LODI_ECA_HISTORY,
  LODI_EP_RATE,
  LODI_EP_HISTORY,
  LODI_STATE_ENERGY_TAX,
  LODI_RIDERS,
  LODI_FEES,
  sources,
} from "../tariffs/lodi.js";
import { validateSchedule, validateProfileShape } from "../tariffs/profile.js";

describe("LODI_EA", () => {
  it("matches the published fixed charge, rates, and breakpoints", () => {
    expect(LODI_EA.fixedChargePerMonth).toBe(19.5);
    expect(LODI_EA.pricing.rates).toEqual([0.1428, 0.1581, 0.3366]);
    expect(LODI_EA.pricing.breakpoints.winter).toEqual([391, 782]);
    expect(LODI_EA.pricing.breakpoints.summer).toEqual([481, 962]);
  });

  it("passes profile.js's own schedule validation", () => {
    expect(validateSchedule(LODI_EA)).toEqual([]);
  });
});

describe("LODI_EV", () => {
  it("charges the off-peak rate all day on a weekend", () => {
    const [offPeak] = LODI_EV.pricing.periods;
    expect(offPeak.applies({ isWeekend: true, isHoliday: false, hourOfDay: 13 })).toBe(true);
  });

  it("charges the off-peak rate all day on a holiday", () => {
    const [offPeak] = LODI_EV.pricing.periods;
    expect(offPeak.applies({ isWeekend: false, isHoliday: true, hourOfDay: 13 })).toBe(true);
  });

  it("charges off-peak from 8pm to 6am on a weekday", () => {
    const [offPeak] = LODI_EV.pricing.periods;
    expect(offPeak.applies({ isWeekend: false, isHoliday: false, hourOfDay: 20 })).toBe(true);
    expect(offPeak.applies({ isWeekend: false, isHoliday: false, hourOfDay: 5 })).toBe(true);
    expect(offPeak.applies({ isWeekend: false, isHoliday: false, hourOfDay: 6 })).toBe(false);
    expect(offPeak.applies({ isWeekend: false, isHoliday: false, hourOfDay: 19 })).toBe(false);
  });

  it("has exactly one period covering every hour a weekday off-peak hour does not", () => {
    const [offPeak, onPeak] = LODI_EV.pricing.periods;
    const ctx = { isWeekend: false, isHoliday: false, hourOfDay: 12 };
    expect(offPeak.applies(ctx)).toBe(false);
    expect(onPeak.applies(ctx)).toBe(true);
  });

  it("passes schedule validation", () => {
    expect(validateSchedule(LODI_EV)).toEqual([]);
  });
});

describe("LODI_G1", () => {
  it("models single-phase as the lower fixed charge and three-phase as the higher one", () => {
    expect(LODI_G1.singlePhase.fixedChargePerMonth).toBe(20.5);
    expect(LODI_G1.threePhase.fixedChargePerMonth).toBe(31.5);
  });

  it("shares the same flat-seasonal rates across both phase configurations", () => {
    expect(LODI_G1.singlePhase.pricing).toEqual(LODI_G1.threePhase.pricing);
    expect(LODI_G1.singlePhase.pricing.summerRate).toBeCloseTo(0.19261, 6);
    expect(LODI_G1.singlePhase.pricing.winterRate).toBeCloseTo(0.14244, 6);
  });

  it("exposes both phase variants on the profile's schedules array", () => {
    expect(LODI.schedules.map((s) => s.id)).toEqual(expect.arrayContaining(["G1", "G1-3P"]));
  });
});

describe("LODI_G2", () => {
  it("has a single demand rate with no separate peak-period demand charge", () => {
    expect(LODI_G2.demand.ratePerKW).toEqual({ summer: 4.18, winter: 4.18 });
    expect(LODI_G2.demand.peakRatePerKW).toBeUndefined();
    expect(LODI_G2.demand.peakApplies).toBeUndefined();
  });

  it("matches the published flat rates and fixed charge", () => {
    expect(LODI_G2.fixedChargePerMonth).toBe(103.5);
    expect(LODI_G2.pricing.summerRate).toBeCloseTo(0.15829, 6);
    expect(LODI_G2.pricing.winterRate).toBeCloseTo(0.12671, 6);
  });
});

describe("LODI_ECA_MONTHLY", () => {
  it("has 12 entries keyed Jan (0) through Dec (11)", () => {
    expect(LODI_ECA_MONTHLY).toHaveLength(12);
  });

  it("uses the FY2025-26 actual for every month except July", () => {
    expect(LODI_ECA_MONTHLY[0]).toBeCloseTo(LODI_ECA_HISTORY.fy2025_26.jan, 6); // Jan
    expect(LODI_ECA_MONTHLY[11]).toBeCloseTo(LODI_ECA_HISTORY.fy2025_26.dec, 6); // Dec
  });

  it("supersedes the FY2025-26 July actual with the newer July 2026 figure", () => {
    expect(LODI_ECA_MONTHLY[6]).toBeCloseTo(0.0496, 6);
    expect(LODI_ECA_MONTHLY[6]).not.toBeCloseTo(LODI_ECA_HISTORY.fy2025_26.jul, 6);
  });
});

describe("LODI_EP_RATE / LODI_EP_HISTORY", () => {
  it("is the FY2026-27 avoided-cost rate", () => {
    expect(LODI_EP_RATE).toBeCloseTo(0.0843, 6);
  });

  it("carries FY2024-25 forward from FY2023-24 with a note, since it was never sourced", () => {
    const fy2425 = LODI_EP_HISTORY.find((h) => h.fiscalYear === "FY2024-25");
    const fy2324 = LODI_EP_HISTORY.find((h) => h.fiscalYear === "FY2023-24");
    expect(fy2425.ratePerKWh).toBe(fy2324.ratePerKWh);
    expect(fy2425.note).toMatch(/carried forward/i);
  });

  it("has the current rate as the last history entry", () => {
    expect(LODI_EP_HISTORY.at(-1)).toEqual({ fiscalYear: "FY2026-27", ratePerKWh: LODI_EP_RATE });
  });
});

describe("LODI_STATE_ENERGY_TAX", () => {
  it("is a fixed 0.0003/kWh adder", () => {
    expect(LODI_STATE_ENERGY_TAX.mode).toBe("fixed");
    expect(LODI_STATE_ENERGY_TAX.valuePerKWh).toBeCloseTo(0.0003, 6);
  });
});

describe("LODI_RIDERS", () => {
  it("has SHARE, medical, and senior at their published percentages", () => {
    const byId = Object.fromEntries(LODI_RIDERS.map((r) => [r.id, r]));
    expect(byId.share.percentOff).toBeCloseTo(0.3, 6);
    expect(byId.medical.percentOff).toBeCloseTo(0.25, 6);
    expect(byId.senior.percentOff).toBeCloseTo(0.05, 6);
  });

  it("puts all three riders in the same exclusiveGroup, since only one applies per household", () => {
    const groups = new Set(LODI_RIDERS.map((r) => r.exclusiveGroup));
    expect(groups.size).toBe(1);
    expect(groups.has(undefined)).toBe(false);
  });
});

describe("LODI constraints and fees", () => {
  it("caps sizing on trailing 12-month usage and prohibits PPAs", () => {
    expect(LODI.constraints.sizeCapMode).toBe("trailing12moUsage");
    expect(LODI.constraints.allowedFinancing).toEqual(["cash", "loan"]);
    expect(LODI.constraints.allowedFinancing).not.toContain("ppa");
  });

  it("matches the FY2025-26 interconnection fees", () => {
    expect(LODI_FEES.interconnection.singlePhase).toBe(843);
    expect(LODI_FEES.interconnection.threePhase).toBe(1472);
  });
});

describe("LODI profile shape", () => {
  it("passes full profile validation", () => {
    expect(validateProfileShape(LODI)).toEqual([]);
  });

  it("cites at least one lodi.gov source", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const url of sources) expect(url).toMatch(/^https:\/\/www\.lodi\.gov\//);
  });
});
