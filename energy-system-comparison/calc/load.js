// Hourly household/business load, built on bundled PG&E-derived day-type
// shapes (data/load-shapes.json), plus a separately-returned EV charging slice.

import loadShapes from "../data/load-shapes.json";
import { HOURS_PER_YEAR, monthOfHour, hourOfDay, dayOfWeek, isWeekend } from "./time.js";

/**
 * Rate-season split data/load-shapes.json's dayTypes are keyed by: summer =
 * Jun-Sep, winter = Oct-May (PG&E's E-1/A-1 rate-season convention, per its
 * meta.structure). This is distinct from the LEU tariff summer window
 * (isLeuSummer, May-Oct) in time.js, which this module has no reason to use.
 */
function loadShapeSeason(monthIdx) {
  return monthIdx >= 5 && monthIdx <= 8 ? "summer" : "winter";
}

/** Hours in each calendar month of the reference year, derived from time.js. */
function hoursPerMonth() {
  const hours = new Array(12).fill(0);
  for (let day = 0; day < 365; day++) {
    hours[monthOfHour(day * 24)] += 24;
  }
  return hours;
}

/**
 * Per-month target kWh for annual mode, distributing annualKWh across
 * profile.monthlyWeight.
 *
 * monthlyWeight sums to 12 across the 12 months (unweighted), not across the
 * 365 days of the year, so weighting it by each month's actual day count
 * before normalizing is what keeps the reconstructed annual total exactly
 * equal to annualKWh rather than off by the small skew between months of
 * different lengths.
 */
function distributeAnnual(annualKWh, monthlyWeight, monthDays) {
  const rawWeights = monthlyWeight.map((w, m) => w * monthDays[m]);
  const totalRaw = rawWeights.reduce((a, b) => a + b, 0);
  return rawWeights.map((w) => (totalRaw === 0 ? 0 : (annualKWh * w) / totalRaw));
}

/**
 * Builds the base 8760 series from per-month kWh targets, spreading each
 * month's total evenly across its own days and then across each day's hours
 * per the season/day-type template. Every dayType template (weekday or
 * weekend, either season) sums to 1.0 over its 24 hours, so this reconstructs
 * each month's target exactly regardless of its weekday/weekend mix.
 */
function buildFromMonthTotals(profile, monthTotals, monthDays) {
  const base = new Array(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const month = monthOfHour(h);
    const season = loadShapeSeason(month);
    const dayType = isWeekend(h) ? "weekend" : "weekday";
    const template = profile.dayTypes[season][dayType];
    const dayTotal = monthTotals[month] / monthDays[month];
    base[h] = dayTotal * template[hourOfDay(h)];
  }
  return base;
}

/** Active weekdays for EV charging: `daysPerWeek` consecutive days starting Monday. */
function activeDows(daysPerWeek) {
  const n = Math.max(0, Math.min(7, Math.round(daysPerWeek || 0)));
  const set = new Set();
  for (let i = 0; i < n; i++) set.add((1 + i) % 7); // 1 = Monday
  return set;
}

/** Length in hours of the [start, end) charging window, wrapping past midnight. */
function windowLength(start, end) {
  if (start === end) return 24;
  return start < end ? end - start : 24 - start + end;
}

/** True if `hour` (0-23) falls in the [start, end) window, wrapping past midnight. */
function inWindow(hour, start, end) {
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * EV charging kWh, spread evenly across the charging window's hours on active
 * days only. For a window that wraps past midnight, each hour is attributed
 * to whichever calendar day it actually falls on, so on the last active day
 * of the week the portion of the window past midnight lands on the following
 * (inactive) day and is not charged; this is a deliberate simplification, not
 * a rollover of the window onto the next active day.
 */
function evHourly(ev) {
  const arr = new Array(HOURS_PER_YEAR).fill(0);
  if (!ev || !ev.kWhPerDay) return arr;

  const dows = activeDows(ev.daysPerWeek);
  const hours = windowLength(ev.windowStartHour, ev.windowEndHour);
  if (hours <= 0) return arr;
  const perHour = ev.kWhPerDay / hours;

  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    if (!dows.has(dayOfWeek(h))) continue;
    if (!inWindow(hourOfDay(h), ev.windowStartHour, ev.windowEndHour)) continue;
    arr[h] = perHour;
  }
  return arr;
}

/**
 * Base and EV hourly load (kWh), each length HOURS_PER_YEAR.
 *
 * mode 'annual' distributes annualKWh across profile.monthlyWeight and the
 * day-type templates. mode 'monthly' rescales each calendar month to the
 * given monthlyKWh[12] exactly. mode 'hourly' validates and passes hourlyKWh
 * through unchanged. EV load is returned separately so callers can meter,
 * shift, or exclude it independently of the base load.
 */
export function loadHourly({ mode, annualKWh, monthlyKWh, hourlyKWh, profileId, ev }) {
  if (mode === "hourly") {
    if (!Array.isArray(hourlyKWh) || hourlyKWh.length !== HOURS_PER_YEAR) {
      throw new Error(`hourly mode requires hourlyKWh of length ${HOURS_PER_YEAR}`);
    }
    return { base: hourlyKWh.slice(), ev: evHourly(ev) };
  }

  const profile = loadShapes[profileId];
  if (!profile) throw new Error(`Unknown load profileId "${profileId}"`);
  const monthDays = hoursPerMonth().map((h) => h / 24);

  let monthTotals;
  if (mode === "monthly") {
    if (!Array.isArray(monthlyKWh) || monthlyKWh.length !== 12) {
      throw new Error("monthly mode requires monthlyKWh of length 12");
    }
    monthTotals = monthlyKWh;
  } else if (mode === "annual") {
    monthTotals = distributeAnnual(annualKWh || 0, profile.monthlyWeight, monthDays);
  } else {
    throw new Error(`Unknown load mode "${mode}"`);
  }

  return {
    base: buildFromMonthTotals(profile, monthTotals, monthDays),
    ev: evHourly(ev),
  };
}
