import { describe, it, expect } from "vitest";
import {
  hourContext,
  rateForHour,
  tieredEnergyCost,
  allUnitsBlocksEnergyCost,
  retailRateForHour,
  resolveExportRate,
  demandPeriodFor,
  adderCost,
  ridersTotalPercentOff,
  validateSchedule,
  validateAdder,
  validateRider,
  validateExportRate,
  validateExportPolicy,
  validateProfileShape,
} from "../tariffs/profile.js";

describe("hourContext", () => {
  it("marks Jan 1 00:00 as winter, Thursday, not weekend, and New Year's Day", () => {
    const ctx = hourContext(0);
    expect(ctx).toEqual({
      hour: 0,
      hourOfDay: 0,
      dayOfWeek: 4,
      isWeekend: false,
      isHoliday: true,
      monthIdx: 0,
      isSummer: false,
    });
  });

  it("marks a July hour as LEU summer", () => {
    const julyFirstHour = 181 * 24; // day of year 181 = Jul 1
    expect(hourContext(julyFirstHour).isSummer).toBe(true);
    expect(hourContext(julyFirstHour).monthIdx).toBe(6);
  });
});

describe("rateForHour", () => {
  const flat = {
    id: "flat",
    pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.1 },
  };
  const tou = {
    id: "tou",
    pricing: {
      type: "tou",
      periods: [
        { id: "peak", rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 },
        { id: "off-peak", rate: { summer: 0.1, winter: 0.08 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 20) },
      ],
    },
  };

  it("picks summer or winter rate on a flat-seasonal schedule", () => {
    expect(rateForHour(flat, { isSummer: true })).toBe(0.2);
    expect(rateForHour(flat, { isSummer: false })).toBe(0.1);
  });

  it("picks the matching TOU period and season", () => {
    expect(rateForHour(tou, { isSummer: true, hourOfDay: 18 })).toBe(0.3);
    expect(rateForHour(tou, { isSummer: false, hourOfDay: 18 })).toBe(0.25);
    expect(rateForHour(tou, { isSummer: true, hourOfDay: 2 })).toBe(0.1);
  });

  it("throws when no TOU period matches the hour", () => {
    const gappy = { id: "gappy", pricing: { type: "tou", periods: [{ id: "only", rate: { summer: 0.1, winter: 0.1 }, applies: () => false }] } };
    expect(() => rateForHour(gappy, { hour: 5, isSummer: true })).toThrow(/no TOU period/);
  });

  it("refuses tiered pricing, since a tiered rate has no single per-hour value", () => {
    const tiered = { id: "tiered", pricing: { type: "tiered", rates: [0.1, 0.2], breakpoints: { summer: [100], winter: [100] } } };
    expect(() => rateForHour(tiered, { isSummer: true })).toThrow(/tieredEnergyCost/);
  });
});

describe("tieredEnergyCost", () => {
  const schedule = {
    pricing: {
      rates: [0.1, 0.2, 0.3],
      breakpoints: { summer: [100, 200], winter: [50, 150] },
    },
  };

  it("bills each band only for the slice of usage inside it", () => {
    // 250 kWh in summer: 100@0.1 + 100@0.2 + 50@0.3
    const expected = 100 * 0.1 + 100 * 0.2 + 50 * 0.3;
    expect(tieredEnergyCost(250, schedule, true)).toBeCloseTo(expected, 6);
  });

  it("uses the winter breakpoints when isSummer is false", () => {
    // 200 kWh in winter: 50@0.1 + 100@0.2 + 50@0.3
    const expected = 50 * 0.1 + 100 * 0.2 + 50 * 0.3;
    expect(tieredEnergyCost(200, schedule, false)).toBeCloseTo(expected, 6);
  });

  it("charges exactly the first tier at its boundary", () => {
    expect(tieredEnergyCost(50, schedule, false)).toBeCloseTo(50 * 0.1, 6);
  });

  it("charges nothing for zero or negative usage", () => {
    expect(tieredEnergyCost(0, schedule, true)).toBe(0);
    expect(tieredEnergyCost(-10, schedule, true)).toBe(0);
  });
});

describe("allUnitsBlocksEnergyCost", () => {
  // Flat (non-seasonal) blocks: [0,500] @ 0.10, (500, no ceiling) @ 0.08.
  const flatSchedule = {
    pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: null, rate: 0.08 }] },
  };

  it("prices the WHOLE month at the landed block's rate, not per-band", () => {
    // 300 kWh lands in block 1 (<=500): 300 * 0.10 = 30.
    expect(allUnitsBlocksEnergyCost(300, flatSchedule, true)).toBeCloseTo(30, 6);
  });

  it("includes the boundary kWh in the lower block (upToKWh is inclusive)", () => {
    // Exactly 500 kWh: still block 1 -- 500 * 0.10 = 50.
    expect(allUnitsBlocksEnergyCost(500, flatSchedule, true)).toBeCloseTo(50, 6);
  });

  // The discontinuity: one more kWh moves the ENTIRE month to block 2's
  // lower rate, so the bill actually DROPS from 50.00 to 40.08 even though
  // usage went up -- an intentional cliff all-units-blocks pricing has that
  // tieredEnergyCost's per-band pricing never would.
  it("moves the WHOLE month's bill to the next block's rate one kWh past the boundary, even though the bill drops", () => {
    const at500 = allUnitsBlocksEnergyCost(500, flatSchedule, true);
    const at501 = allUnitsBlocksEnergyCost(501, flatSchedule, true);
    expect(at500).toBeCloseTo(50, 6);
    expect(at501).toBeCloseTo(501 * 0.08, 6); // 40.08
    expect(at501).toBeLessThan(at500);
  });

  it("uses the last block's rate with no ceiling for usage far past every boundary", () => {
    expect(allUnitsBlocksEnergyCost(10000, flatSchedule, true)).toBeCloseTo(10000 * 0.08, 6);
  });

  it("charges nothing for zero or negative usage", () => {
    expect(allUnitsBlocksEnergyCost(0, flatSchedule, true)).toBe(0);
    expect(allUnitsBlocksEnergyCost(-5, flatSchedule, true)).toBe(0);
  });

  it("uses the summer or winter block array for a seasonal schedule", () => {
    const seasonal = {
      pricing: {
        type: "all-units-blocks",
        blocks: {
          summer: [{ upToKWh: 200, rate: 0.2 }, { upToKWh: null, rate: 0.15 }],
          winter: [{ upToKWh: 400, rate: 0.1 }, { upToKWh: null, rate: 0.08 }],
        },
      },
    };
    expect(allUnitsBlocksEnergyCost(300, seasonal, true)).toBeCloseTo(300 * 0.15, 6); // summer: past 200
    expect(allUnitsBlocksEnergyCost(300, seasonal, false)).toBeCloseTo(300 * 0.1, 6); // winter: within 400
  });
});

describe("retailRateForHour", () => {
  it("returns the marginal tiered rate for the given cumulative import kWh", () => {
    const schedule = {
      pricing: { type: "tiered", rates: [0.1, 0.2, 0.3], breakpoints: { summer: [100, 200], winter: [100, 200] } },
    };
    expect(retailRateForHour(schedule, { isSummer: true }, 50)).toBe(0.1);
    expect(retailRateForHour(schedule, { isSummer: true }, 150)).toBe(0.2);
    expect(retailRateForHour(schedule, { isSummer: true }, 250)).toBe(0.3);
  });

  it("returns the marginal all-units-blocks rate for the given cumulative import kWh", () => {
    const schedule = { pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: null, rate: 0.08 }] } };
    expect(retailRateForHour(schedule, { isSummer: true }, 300)).toBe(0.1);
    expect(retailRateForHour(schedule, { isSummer: true }, 600)).toBe(0.08);
  });

  it("delegates to rateForHour for flat-seasonal and tou schedules", () => {
    const flat = { pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.1 } };
    expect(retailRateForHour(flat, { isSummer: true }, 999)).toBe(0.2);
  });
});

describe("resolveExportRate", () => {
  const flatSchedule = { pricing: { type: "flat-seasonal", summerRate: 0.2, winterRate: 0.1 } };
  const tieredSchedule = { pricing: { type: "tiered", rates: [0.1, 0.2], breakpoints: { summer: [100], winter: [100] } } };

  it("returns a flat number as-is", () => {
    expect(resolveExportRate(0.09, flatSchedule, { isSummer: true }, 0)).toBe(0.09);
  });

  it("resolves 'retail' to the schedule's own applicable rate", () => {
    expect(resolveExportRate("retail", flatSchedule, { isSummer: true }, 0)).toBe(0.2);
    expect(resolveExportRate("retail", tieredSchedule, { isSummer: true }, 150)).toBe(0.2);
  });

  it("resolves a monthlyTable by calendar month", () => {
    const monthlyTable = { kind: "monthlyTable", monthlyValues: [0.01, 0.02, ...Array(10).fill(0.05)] };
    expect(resolveExportRate(monthlyTable, flatSchedule, { monthIdx: 1 }, 0)).toBe(0.02);
    expect(resolveExportRate(monthlyTable, flatSchedule, { monthIdx: 11 }, 0)).toBe(0.05);
  });

  it("resolves a timeTable to the first matching period's seasonal rate", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [
        { rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 20 },
        { rate: { summer: 0.1, winter: 0.08 }, applies: () => true },
      ],
    };
    expect(resolveExportRate(timeTable, flatSchedule, { hourOfDay: 18, isSummer: true }, 0)).toBe(0.3);
    expect(resolveExportRate(timeTable, flatSchedule, { hourOfDay: 2, isSummer: false }, 0)).toBe(0.08);
  });

  it("throws when no timeTable period matches the hour", () => {
    const timeTable = { kind: "timeTable", periods: [{ rate: { summer: 0.1, winter: 0.1 }, applies: () => false }] };
    expect(() => resolveExportRate(timeTable, flatSchedule, { hour: 5, isSummer: true }, 0)).toThrow(/no ExportRate timeTable period/);
  });

  it("scales the retail rate by fraction for percentOfRetail", () => {
    const percentOfRetail = { kind: "percentOfRetail", fraction: 0.5 };
    expect(resolveExportRate(percentOfRetail, flatSchedule, { isSummer: true }, 0)).toBeCloseTo(0.1, 6);
    expect(resolveExportRate(percentOfRetail, tieredSchedule, { isSummer: true }, 150)).toBeCloseTo(0.1, 6);
  });

  it("throws on an unrecognized ExportRate value", () => {
    expect(() => resolveExportRate({ kind: "bogus" }, flatSchedule, { isSummer: true }, 0)).toThrow(/unrecognized ExportRate/);
  });
});

describe("demandPeriodFor", () => {
  it("returns null when the schedule has no demand charge", () => {
    expect(demandPeriodFor({ id: "no-demand" }, {})).toBeNull();
  });

  it("returns 'standard' for every hour when there is no peakApplies predicate", () => {
    const schedule = { demand: { ratePerKW: { summer: 1, winter: 1 } } };
    expect(demandPeriodFor(schedule, { hourOfDay: 17 })).toBe("standard");
  });

  it("returns 'peak' only when peakApplies matches", () => {
    const schedule = { demand: { ratePerKW: { summer: 1, winter: 1 }, peakApplies: (ctx) => ctx.hourOfDay === 17 } };
    expect(demandPeriodFor(schedule, { hourOfDay: 17 })).toBe("peak");
    expect(demandPeriodFor(schedule, { hourOfDay: 10 })).toBe("standard");
  });
});

describe("adderCost", () => {
  it("prices a fixed adder as valuePerKWh times kWh", () => {
    const adder = { id: "tax", mode: "fixed", valuePerKWh: 0.001 };
    expect(adderCost(adder, { kWh: 1000 })).toBeCloseTo(1, 6);
  });

  it("prices a monthlyTable adder from the given calendar month", () => {
    const adder = { id: "eca", mode: "monthlyTable", monthlyValues: [0.01, 0.02, ...Array(10).fill(0)] };
    expect(adderCost(adder, { monthIdx: 1, kWh: 500 })).toBeCloseTo(10, 6);
  });

  it("overrides the eca adder's table with ecaFixedValue when ecaMode is 'fixed'", () => {
    const adder = { id: "eca", mode: "monthlyTable", monthlyValues: Array(12).fill(0.05) };
    expect(adderCost(adder, { monthIdx: 3, kWh: 100, ecaMode: "fixed", ecaFixedValue: 0.02 })).toBeCloseTo(2, 6);
  });

  it("leaves a non-eca adder alone even when ecaMode is 'fixed'", () => {
    const adder = { id: "tax", mode: "fixed", valuePerKWh: 0.0003 };
    expect(adderCost(adder, { kWh: 1000, ecaMode: "fixed", ecaFixedValue: 0.02 })).toBeCloseTo(0.3, 6);
  });

  // Regression: the override used to be keyed off adder.id === "eca", so a
  // differently-named monthlyTable adder was silently priced from its own
  // table even when ecaMode was 'fixed'. It is now keyed off
  // adder.mode === "monthlyTable", so ANY monthlyTable adder gets the same
  // override LEU's own `eca` adder does. 100 kWh * 0.02 override = 2,
  // not 100 * 0.05 (the table's own April value) = 5.
  it("overrides any monthlyTable adder (not just one named 'eca') with ecaFixedValue when ecaMode is 'fixed'", () => {
    const adder = { id: "custom-adjustment", label: "Custom Adjustment", mode: "monthlyTable", monthlyValues: Array(12).fill(0.05) };
    expect(adderCost(adder, { monthIdx: 3, kWh: 100, ecaMode: "fixed", ecaFixedValue: 0.02 })).toBeCloseTo(2, 6);
  });

  it("throws on an unknown adder mode", () => {
    expect(() => adderCost({ id: "x", mode: "bogus" }, { kWh: 1 })).toThrow(/unknown adder mode/);
  });

  it("throws on ecaMode 'fixed' with a null ecaFixedValue instead of silently pricing ECA at $0", () => {
    const adder = { id: "eca", mode: "monthlyTable", monthlyValues: Array(12).fill(0.05) };
    expect(() => adderCost(adder, { monthIdx: 0, kWh: 500, ecaMode: "fixed", ecaFixedValue: null })).toThrow(
      /ecaFixedValue must be a number/,
    );
  });

  it("throws on ecaMode 'fixed' with an undefined ecaFixedValue instead of propagating NaN", () => {
    const adder = { id: "eca", mode: "monthlyTable", monthlyValues: Array(12).fill(0.05) };
    expect(() => adderCost(adder, { monthIdx: 0, kWh: 500, ecaMode: "fixed" })).toThrow(/ecaFixedValue must be a number/);
  });
});

describe("ridersTotalPercentOff", () => {
  const riders = [
    { id: "share", percentOff: 0.3, exclusiveGroup: "household" },
    { id: "medical", percentOff: 0.25, exclusiveGroup: "household" },
    { id: "low-income", percentOff: 0.1 },
  ];

  it("sums percentOff across selected riders with no shared group", () => {
    expect(ridersTotalPercentOff(riders, ["share", "low-income"])).toBeCloseTo(0.4, 6);
  });

  it("returns 0 for no riders selected", () => {
    expect(ridersTotalPercentOff(riders, [])).toBe(0);
  });

  it("ignores unknown rider ids", () => {
    expect(ridersTotalPercentOff(riders, ["nonexistent"])).toBe(0);
  });

  it("throws when two selected riders share an exclusiveGroup", () => {
    expect(() => ridersTotalPercentOff(riders, ["share", "medical"])).toThrow(/exclusive group/);
  });

  it("caps the combined total at 1 when selected riders with no shared exclusiveGroup sum past 100%", () => {
    const overlapping = [
      { id: "a", percentOff: 0.6 },
      { id: "b", percentOff: 0.6 },
    ];
    expect(ridersTotalPercentOff(overlapping, ["a", "b"])).toBe(1);
  });
});

describe("validateSchedule", () => {
  it("accepts a well-formed tiered schedule", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: { type: "tiered", rates: [0.1, 0.2, 0.3], breakpoints: { summer: [100, 200], winter: [100, 200] } },
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it("flags a negative rate", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: { type: "tiered", rates: [0.1, -0.2, 0.3], breakpoints: { summer: [100, 200], winter: [100, 200] } },
    };
    expect(validateSchedule(schedule).some((e) => /non-negative/.test(e))).toBe(true);
  });

  it("flags missing tiers (breakpoints absent)", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: { type: "tiered", rates: [0.1, 0.2, 0.3] },
    };
    expect(validateSchedule(schedule).some((e) => /breakpoints/.test(e))).toBe(true);
  });

  it("flags a breakpoints length mismatch", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: { type: "tiered", rates: [0.1, 0.2, 0.3], breakpoints: { summer: [100], winter: [100, 200] } },
    };
    expect(validateSchedule(schedule).some((e) => /breakpoints must have/.test(e))).toBe(true);
  });

  it("flags a missing schedule entirely", () => {
    expect(validateSchedule(null)).toEqual(["schedule is missing"]);
  });

  it("accepts a TOU schedule whose periods together cover every hour of the year", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: {
        type: "tou",
        periods: [
          { id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 21 },
          { id: "off-peak", rate: { summer: 0.1, winter: 0.08 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 21) },
        ],
      },
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  // Regression (finding 5): calc/billing.js's rateForHour throws "no TOU
  // period ... matches hour N" the first time a real hour actually lands in
  // the gap -- a runtime failure with no field named to fix. Fails before
  // this check existed (no error at validation time), passes after
  // (validateSchedule catches it up front, naming the first uncovered hour).
  it("flags a TOU schedule whose on-peak/off-peak periods leave weekend daytime hours uncovered", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: {
        type: "tou",
        periods: [
          { id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => !ctx.isWeekend && ctx.hourOfDay >= 16 && ctx.hourOfDay < 21 },
          { id: "off-peak", rate: { summer: 0.1, winter: 0.08 }, applies: (ctx) => ctx.hourOfDay >= 21 || ctx.hourOfDay < 16 },
        ],
      },
    };
    const errors = validateSchedule(schedule);
    expect(errors.some((e) => /coverage gap/.test(e))).toBe(true);
  });

  it("does not run the coverage check when a period already has a shape error (missing applies(), bad rate)", () => {
    const schedule = {
      id: "EA",
      label: "Residential",
      fixedChargePerMonth: 19.5,
      pricing: { type: "tou", periods: [{ id: "broken", rate: { summer: 0.1, winter: 0.1 } }] },
    };
    const errors = validateSchedule(schedule);
    expect(errors.some((e) => /missing an applies\(\) predicate/.test(e))).toBe(true);
    expect(errors.some((e) => /coverage gap/.test(e))).toBe(false);
  });

  it("accepts a well-formed all-units-blocks schedule (flat blocks)", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: null, rate: 0.08 }] },
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it("accepts a well-formed all-units-blocks schedule with seasonal block boundaries", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: {
        type: "all-units-blocks",
        blocks: {
          summer: [{ upToKWh: 200, rate: 0.2 }, { upToKWh: null, rate: 0.15 }],
          winter: [{ upToKWh: 400, rate: 0.1 }, { upToKWh: null, rate: 0.08 }],
        },
      },
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it("flags an all-units-blocks last block that has a numeric upToKWh instead of null", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: { type: "all-units-blocks", blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: 1000, rate: 0.08 }] },
    };
    expect(validateSchedule(schedule).some((e) => /last block must have upToKWh null/.test(e))).toBe(true);
  });

  it("flags an all-units-blocks non-last block missing a numeric upToKWh", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: { type: "all-units-blocks", blocks: [{ upToKWh: null, rate: 0.1 }, { upToKWh: null, rate: 0.08 }] },
    };
    expect(validateSchedule(schedule).some((e) => /upToKWh must be a positive number/.test(e))).toBe(true);
  });

  it("flags non-ascending all-units-blocks upToKWh values", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: {
        type: "all-units-blocks",
        blocks: [{ upToKWh: 500, rate: 0.1 }, { upToKWh: 300, rate: 0.12 }, { upToKWh: null, rate: 0.08 }],
      },
    };
    expect(validateSchedule(schedule).some((e) => /strictly ascending/.test(e))).toBe(true);
  });

  it("flags a negative all-units-blocks rate", () => {
    const schedule = {
      id: "block",
      label: "Block",
      fixedChargePerMonth: 10,
      pricing: { type: "all-units-blocks", blocks: [{ upToKWh: null, rate: -0.1 }] },
    };
    expect(validateSchedule(schedule).some((e) => /rate must be a non-negative number/.test(e))).toBe(true);
  });

  it("accepts a schedule with no minimumBillPerMonth or systemSizeCharges", () => {
    const schedule = {
      id: "s",
      label: "S",
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it("flags a negative minimumBillPerMonth", () => {
    const schedule = {
      id: "s",
      label: "S",
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
      minimumBillPerMonth: -5,
    };
    expect(validateSchedule(schedule).some((e) => /minimumBillPerMonth/.test(e))).toBe(true);
  });

  it("accepts a valid systemSizeCharges array", () => {
    const schedule = {
      id: "s",
      label: "S",
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
      systemSizeCharges: [
        { basis: "kW-DC-solar", ratePerMonth: 2 },
        { basis: "kWh-battery", ratePerMonth: 1.5 },
      ],
    };
    expect(validateSchedule(schedule)).toEqual([]);
  });

  it("flags an unknown systemSizeCharges basis and a negative ratePerMonth", () => {
    const schedule = {
      id: "s",
      label: "S",
      fixedChargePerMonth: 10,
      pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 },
      systemSizeCharges: [
        { basis: "kW-DC-wind", ratePerMonth: 2 },
        { basis: "kWh-battery", ratePerMonth: -1 },
      ],
    };
    const errors = validateSchedule(schedule);
    expect(errors.some((e) => /basis must be/.test(e))).toBe(true);
    expect(errors.some((e) => /ratePerMonth must be a non-negative number/.test(e))).toBe(true);
  });
});

describe("validateAdder / validateRider / validateExportPolicy", () => {
  it("flags a rider percentOff outside (0,1]", () => {
    expect(validateAdder({ id: "a", label: "A", mode: "fixed", valuePerKWh: -1 }).length).toBeGreaterThan(0);
    expect(validateRider({ id: "r", label: "R", percentOff: 1.5 }).length).toBeGreaterThan(0);
    expect(validateRider({ id: "r", label: "R", percentOff: 0.3 })).toEqual([]);
  });

  it("accepts a monthlyTable adder whose 12 values are all finite non-negative numbers", () => {
    expect(
      validateAdder({ id: "a", label: "A", mode: "monthlyTable", monthlyValues: new Array(12).fill(0.05) }),
    ).toEqual([]);
  });

  // Regression: the length/type check alone (`!(v >= 0)`) let Infinity
  // through, since `Infinity >= 0` is true. Fails before this fix (no
  // error), passes after (Number.isFinite catches it).
  it("flags a monthlyTable adder with a non-finite value", () => {
    const withInfinity = new Array(12).fill(0.05);
    withInfinity[3] = Infinity;
    expect(validateAdder({ id: "a", label: "A", mode: "monthlyTable", monthlyValues: withInfinity }).length).toBeGreaterThan(0);

    const withNaN = new Array(12).fill(0.05);
    withNaN[7] = NaN;
    expect(validateAdder({ id: "a", label: "A", mode: "monthlyTable", monthlyValues: withNaN }).length).toBeGreaterThan(0);
  });

  it("flags an avoidedCostCredit policy with a negative rate", () => {
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: -0.01 }).length).toBeGreaterThan(0);
  });

  it("accepts a valid netMetering policy", () => {
    expect(validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: "retail" })).toEqual([]);
  });

  it("flags a netMetering policy with a negative or non-finite numeric exportRate", () => {
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: -0.05 }).length).toBeGreaterThan(0);
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: Infinity }).length).toBeGreaterThan(0);
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: 0 })).toEqual([]);
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: 0.08 })).toEqual([]);
  });

  it("accepts a monthlyTable ExportRate on avoidedCostCredit and netMetering alike", () => {
    const monthlyTable = { kind: "monthlyTable", monthlyValues: Array(12).fill(0.05) };
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: monthlyTable })).toEqual([]);
    expect(validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: monthlyTable })).toEqual([]);
  });

  it("flags a monthlyTable ExportRate with the wrong length or a negative value", () => {
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: { kind: "monthlyTable", monthlyValues: [0.1] } }).length).toBeGreaterThan(0);
    expect(
      validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: { kind: "monthlyTable", monthlyValues: [-0.1, ...Array(11).fill(0.1)] } }).length,
    ).toBeGreaterThan(0);
  });

  it("accepts a timeTable ExportRate whose periods have non-overlapping windows and non-negative rates", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [
        { rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20] }, applies: () => false },
        { rate: { summer: 0.1, winter: 0.08 }, window: { hours: [20, 16] }, applies: () => true },
      ],
    };
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: timeTable })).toEqual([]);
  });

  it("flags a timeTable ExportRate whose periods' windows overlap", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [
        { rate: { summer: 0.3, winter: 0.25 }, window: { hours: [14, 20] }, applies: () => false },
        { rate: { summer: 0.1, winter: 0.08 }, window: { hours: [18, 22] }, applies: () => false },
      ],
    };
    const errors = validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: timeTable });
    expect(errors.some((e) => /overlap/.test(e))).toBe(true);
  });

  it("flags a timeTable ExportRate period missing an applies() predicate", () => {
    const timeTable = { kind: "timeTable", periods: [{ rate: { summer: 0.1, winter: 0.1 } }] };
    const errors = validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: timeTable });
    expect(errors.some((e) => /missing an applies/.test(e))).toBe(true);
  });

  // Regression (finding 5): calc/billing.js's resolveExportRate throws "no
  // ExportRate timeTable period ... matches hour N" the first time a real
  // hour lands in the gap. Fails before this check existed, passes after.
  it("flags a timeTable ExportRate whose periods leave some hour uncovered", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [{ rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 21 }],
    };
    const errors = validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: timeTable });
    expect(errors.some((e) => /coverage gap/.test(e))).toBe(true);
  });

  it("accepts a timeTable ExportRate whose periods together cover every hour", () => {
    const timeTable = {
      kind: "timeTable",
      periods: [
        { rate: { summer: 0.3, winter: 0.25 }, applies: (ctx) => ctx.hourOfDay >= 16 && ctx.hourOfDay < 21 },
        { rate: { summer: 0.1, winter: 0.08 }, applies: (ctx) => !(ctx.hourOfDay >= 16 && ctx.hourOfDay < 21) },
      ],
    };
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: timeTable })).toEqual([]);
  });

  it("accepts percentOfRetail only for netMetering with netting 'hourly'", () => {
    const percentOfRetail = { kind: "percentOfRetail", fraction: 0.5 };
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: percentOfRetail })).toEqual([]);
    expect(validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: percentOfRetail }).length).toBeGreaterThan(0);
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: percentOfRetail }).length).toBeGreaterThan(0);
  });

  it("flags a percentOfRetail fraction outside (0,1]", () => {
    expect(
      validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: { kind: "percentOfRetail", fraction: 0 } }).length,
    ).toBeGreaterThan(0);
    expect(
      validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: { kind: "percentOfRetail", fraction: 1.5 } }).length,
    ).toBeGreaterThan(0);
  });

  it("flags 'retail' on avoidedCostCredit, since it is netMetering-only", () => {
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: "retail" }).length).toBeGreaterThan(0);
  });

  it("accepts a positive integer lockYears and flags anything else", () => {
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.08, lockYears: 10 })).toEqual([]);
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.08, lockYears: null })).toEqual([]);
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.08, lockYears: 0 }).some((e) => /lockYears/.test(e))).toBe(true);
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.08, lockYears: 2.5 }).some((e) => /lockYears/.test(e))).toBe(true);
  });

  // Regression (finding 4): lockYears freezes an ExportRate at its year-0
  // value, but "retail" and percentOfRetail already track the schedule's
  // own retail rate as it escalates -- there is no fixed dollar figure a
  // lock could freeze, so the combination is a validation error rather than
  // a silent no-op. Fails before this fix (no error), passes after.
  it("flags lockYears combined with a 'retail' or percentOfRetail export rate", () => {
    expect(
      validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: "retail", lockYears: 5 }).some((e) =>
        /lockYears/.test(e),
      ),
    ).toBe(true);
    expect(
      validateExportPolicy({
        type: "netMetering",
        netting: "hourly",
        exportRate: { kind: "percentOfRetail", fraction: 0.5 },
        lockYears: 5,
      }).some((e) => /lockYears/.test(e)),
    ).toBe(true);
  });

  it("does not flag lockYears combined with a numeric, monthlyTable, or timeTable export rate", () => {
    expect(validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: 0.05, lockYears: 5 })).toEqual([]);
    expect(
      validateExportPolicy({
        type: "netMetering",
        netting: "hourly",
        exportRate: { kind: "monthlyTable", monthlyValues: new Array(12).fill(0.05) },
        lockYears: 5,
      }),
    ).toEqual([]);
  });

  it("does not flag lockYears without an export rate that tracks retail (e.g. avoidedCostCredit, which has no retail/percentOfRetail kind)", () => {
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.05, lockYears: 5 })).toEqual([]);
  });

  it("accepts an explicit { rate } or 'forfeit' trueUp under netMetering annual netting", () => {
    expect(validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: "retail", trueUp: { rate: 0.05 } })).toEqual([]);
    expect(validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: "retail", trueUp: "forfeit" })).toEqual([]);
  });

  it("flags a malformed trueUp and a trueUp present on a policy other than netMetering annual", () => {
    expect(
      validateExportPolicy({ type: "netMetering", netting: "annual", exportRate: "retail", trueUp: { rate: -1 } }).some((e) => /trueUp/.test(e)),
    ).toBe(true);
    expect(
      validateExportPolicy({ type: "netMetering", netting: "hourly", exportRate: 0.08, trueUp: { rate: 0.05 } }).some((e) => /trueUp/.test(e)),
    ).toBe(true);
    expect(validateExportPolicy({ type: "avoidedCostCredit", ratePerKWh: 0.08, trueUp: { rate: 0.05 } }).some((e) => /trueUp/.test(e))).toBe(true);
  });
});

describe("validateProfileShape", () => {
  it("collects errors from every nested schedule/adder/rider", () => {
    const profile = {
      id: "x",
      label: "X",
      schedules: [{ id: "s", label: "S", fixedChargePerMonth: -1, pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 } }],
      adders: [{ id: "a", label: "A", mode: "fixed", valuePerKWh: 0.1 }],
      riders: [],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 100, threePhase: 200 } },
    };
    expect(profile.schedules[0].fixedChargePerMonth).toBe(-1);
    const errors = validateProfileShape(profile);
    expect(errors.some((e) => /fixedChargePerMonth/.test(e))).toBe(true);
  });

  it("passes a fully valid profile", () => {
    const profile = {
      id: "x",
      label: "X",
      schedules: [{ id: "s", label: "S", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 } }],
      adders: [],
      riders: [],
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 100, threePhase: 200 } },
    };
    expect(validateProfileShape(profile)).toEqual([]);
  });

  function profileWithRiders(riders) {
    return {
      id: "x",
      label: "X",
      schedules: [{ id: "s", label: "S", fixedChargePerMonth: 10, pricing: { type: "flat-seasonal", summerRate: 0.1, winterRate: 0.1 } }],
      adders: [],
      riders,
      exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
      constraints: { allowedFinancing: ["cash"], interconnectionFees: { singlePhase: 100, threePhase: 200 } },
    };
  }

  it("flags riders with no shared exclusiveGroup that can sum past 100% off together", () => {
    const profile = profileWithRiders([
      { id: "a", label: "A", percentOff: 0.6 },
      { id: "b", label: "B", percentOff: 0.6 },
    ]);
    expect(validateProfileShape(profile).some((e) => /sum to more than 100%/.test(e))).toBe(true);
  });

  it("does not flag riders that sum past 100% only across mutually-exclusive groups", () => {
    const profile = profileWithRiders([
      { id: "share", label: "Share", percentOff: 0.6, exclusiveGroup: "household" },
      { id: "medical", label: "Medical", percentOff: 0.6, exclusiveGroup: "household" },
    ]);
    expect(validateProfileShape(profile).some((e) => /sum to more than 100%/.test(e))).toBe(false);
  });
});
