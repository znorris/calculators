import { describe, it, expect } from "vitest";
import {
  REFERENCE_YEAR,
  HOURS_PER_YEAR,
  HOLIDAYS,
  monthOfHour,
  hourOfDay,
  dayOfYear,
  dayOfWeek,
  isWeekend,
  isHoliday,
  isLeuSummer,
} from "../time.js";

describe("constants", () => {
  it("fixes the reference year at 2026, a non-leap year", () => {
    expect(REFERENCE_YEAR).toBe(2026);
    expect(HOURS_PER_YEAR).toBe(8760);
  });

  it("lists all six federal holidays", () => {
    expect(HOLIDAYS).toHaveLength(6);
    expect(HOLIDAYS.map((h) => h.label)).toEqual([
      "New Year's Day",
      "Memorial Day",
      "July 4th",
      "Labor Day",
      "Thanksgiving",
      "Christmas",
    ]);
  });
});

describe("hourOfDay", () => {
  it("wraps at 24", () => {
    expect(hourOfDay(0)).toBe(0);
    expect(hourOfDay(23)).toBe(23);
    expect(hourOfDay(24)).toBe(0);
    expect(hourOfDay(8759)).toBe(23);
  });
});

describe("dayOfYear", () => {
  it("covers 0 through 364 across the full year", () => {
    expect(dayOfYear(0)).toBe(0);
    expect(dayOfYear(23)).toBe(0);
    expect(dayOfYear(24)).toBe(1);
    expect(dayOfYear(8759)).toBe(364);
  });
});

describe("monthOfHour", () => {
  it("stays in January through its last hour", () => {
    expect(monthOfHour(0)).toBe(0);
    expect(monthOfHour(743)).toBe(0); // Jan 31, 23:00
  });

  it("crosses into February at hour 744", () => {
    expect(monthOfHour(744)).toBe(1); // Feb 1, 00:00
  });

  it("gives February only 28 days, since 2026 is not a leap year", () => {
    expect(monthOfHour(1415)).toBe(1); // Feb 28, 23:00
    expect(monthOfHour(1416)).toBe(2); // Mar 1, 00:00
  });

  it("reaches December for the last hour of the year", () => {
    expect(monthOfHour(8759)).toBe(11);
  });
});

describe("dayOfWeek", () => {
  it("puts Jan 1, 2026 on a Thursday", () => {
    expect(dayOfWeek(0)).toBe(4);
  });

  it("puts Jul 4, 2026 on a Saturday", () => {
    const julyFourthHour = 184 * 24; // day of year 184 = Jul 4
    expect(dayOfWeek(julyFourthHour)).toBe(6);
  });

  it("advances by one every 24 hours within the same week", () => {
    expect(dayOfWeek(24)).toBe(5); // Jan 2, Friday
    expect(dayOfWeek(48)).toBe(6); // Jan 3, Saturday
    expect(dayOfWeek(72)).toBe(0); // Jan 4, Sunday
  });
});

describe("isWeekend", () => {
  it("is true only on Saturday and Sunday", () => {
    expect(isWeekend(0)).toBe(false); // Thu
    expect(isWeekend(48)).toBe(true); // Sat
    expect(isWeekend(72)).toBe(true); // Sun
    expect(isWeekend(96)).toBe(false); // Mon
  });
});

describe("isHoliday", () => {
  it("hits every hour of New Year's Day and no hour outside it", () => {
    expect(isHoliday(0)).toBe(true);
    expect(isHoliday(23)).toBe(true);
    expect(isHoliday(24)).toBe(false); // Jan 2
  });

  it("hits Memorial Day, May 25, 2026", () => {
    const memorialDayHour = 144 * 24;
    expect(isHoliday(memorialDayHour)).toBe(true);
    expect(isHoliday(memorialDayHour - 24)).toBe(false); // May 24
    expect(isHoliday(memorialDayHour + 24)).toBe(false); // May 26
  });

  it("hits July 4th", () => {
    expect(isHoliday(184 * 24)).toBe(true);
  });

  it("hits Labor Day, Sep 7, 2026, a Monday", () => {
    const laborDayHour = 249 * 24;
    expect(isHoliday(laborDayHour)).toBe(true);
    expect(dayOfWeek(laborDayHour)).toBe(1);
  });

  it("hits Thanksgiving, Nov 26, 2026, a Thursday", () => {
    const thanksgivingHour = 329 * 24;
    expect(isHoliday(thanksgivingHour)).toBe(true);
    expect(dayOfWeek(thanksgivingHour)).toBe(4);
  });

  it("hits Christmas", () => {
    expect(isHoliday(358 * 24)).toBe(true);
  });
});

describe("isLeuSummer", () => {
  it("covers May through October", () => {
    for (let m = 4; m <= 9; m++) expect(isLeuSummer(m)).toBe(true);
  });

  it("excludes every other month", () => {
    expect(isLeuSummer(0)).toBe(false);
    expect(isLeuSummer(3)).toBe(false);
    expect(isLeuSummer(10)).toBe(false);
    expect(isLeuSummer(11)).toBe(false);
  });
});
