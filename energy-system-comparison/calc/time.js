// Calendar arithmetic for the hourly series every calc/ module walks.
//
// The reference year is fixed at 2026 (a non-leap year, Jan 1 a Thursday) so
// that "hour 4382" means the same calendar moment in every module without
// each one carrying its own date math. Nothing here reads Date.now() or the
// system clock: the year is a constant, not "this year," and every hourly
// series in this repo is indexed against it regardless of when it runs.

export const REFERENCE_YEAR = 2026;
export const HOURS_PER_YEAR = 8760;

// Days in each month of the reference year, Jan first. 2026 is not a leap
// year, so February gets 28.
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Day-of-year (0-indexed) that each month starts on, derived from
// MONTH_LENGTHS so the two can never drift apart.
const MONTH_START_DAY = MONTH_LENGTHS.reduce((acc, len, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_LENGTHS[i - 1]);
  return acc;
}, []);

/**
 * Fixed 2026 dates for the six federal holidays the tariffs in this
 * calculator treat as off-peak. Memorial Day, Labor Day, and Thanksgiving
 * float from year to year; these are the specific dates they land on in the
 * reference year only, not a rule for computing them in any other year.
 */
export const HOLIDAYS = [
  { label: "New Year's Day", monthIdx: 0, day: 1, dayOfYear: 0 },
  { label: "Memorial Day", monthIdx: 4, day: 25, dayOfYear: 144 },
  { label: "July 4th", monthIdx: 6, day: 4, dayOfYear: 184 },
  { label: "Labor Day", monthIdx: 8, day: 7, dayOfYear: 249 },
  { label: "Thanksgiving", monthIdx: 10, day: 26, dayOfYear: 329 },
  { label: "Christmas", monthIdx: 11, day: 25, dayOfYear: 358 },
];

const HOLIDAY_DAYS_OF_YEAR = new Set(HOLIDAYS.map((h) => h.dayOfYear));

/** Day of year, 0-364, for hour index h (0-8759). */
export function dayOfYear(h) {
  return Math.floor(h / 24) % 365;
}

/** Hour within the day, 0-23. */
export function hourOfDay(h) {
  return h % 24;
}

/**
 * Month index, 0 (Jan) through 11 (Dec), for hour index h.
 *
 * A linear scan over 12 entries rather than a closed-form formula, so this
 * reads directly off MONTH_LENGTHS/MONTH_START_DAY instead of a separate
 * calculation that could drift from them.
 */
export function monthOfHour(h) {
  const doy = dayOfYear(h);
  let month = 11;
  for (let i = 0; i < 12; i++) {
    if (doy < MONTH_START_DAY[i]) {
      month = i - 1;
      break;
    }
  }
  return month;
}

/**
 * Day of week, 0 (Sun) through 6 (Sat).
 *
 * Jan 1, 2026 (day of year 0) is a Thursday (4), so every later day of year
 * shifts that by one, mod 7.
 */
export function dayOfWeek(h) {
  return (4 + dayOfYear(h)) % 7;
}

/** True on Saturday or Sunday. */
export function isWeekend(h) {
  const dow = dayOfWeek(h);
  return dow === 0 || dow === 6;
}

/** True on any of the six fixed 2026 holiday dates, for every hour of that day. */
export function isHoliday(h) {
  return HOLIDAY_DAYS_OF_YEAR.has(dayOfYear(h));
}

/** LEU summer season: May through October, month indexes 4-9 inclusive. */
export function isLeuSummer(monthIdx) {
  return monthIdx >= 4 && monthIdx <= 9;
}
