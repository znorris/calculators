// Hourly battery dispatch against a production-minus-load series.
//
// Dispatch reacts to net[h] and the battery's own state of charge for
// surplus/deficit handling; the only calendar dependency is calc/time.js's
// hourOfDay, used solely to evaluate the optional grid-charge window.

import { hourOfDay, monthOfHour } from "./time.js";

/**
 * Whether hour-of-day `hod` falls in [startHour, endHour), wrapping past
 * midnight when startHour > endHour (e.g. 22..6 covers 22:00-23:59 and
 * 00:00-05:59). Start is inclusive, end is exclusive either way.
 */
function inHourWindow(hod, startHour, endHour) {
  if (startHour <= endHour) return hod >= startHour && hod < endHour;
  return hod >= startHour || hod < endHour;
}

/**
 * Split an hourly net (production - load) series into grid import/export,
 * optionally routing surplus and deficit through a battery first.
 *
 * `net[h]` is kWh for that hour: positive is surplus available to charge or
 * export, negative is a deficit to serve from the battery or the grid.
 *
 * With `battery: null` there is no storage to dispatch, so every hour passes
 * straight through: gridImport[h] = max(0, -net[h]), gridExport[h] =
 * max(0, net[h]), and every throughput field is zero.
 *
 * With a battery, state of charge starts at the reserve floor
 * (reserveFrac * usableKWh) and is kept within [reserveFrac * usableKWh,
 * usableKWh] every hour by construction: the charge and discharge amounts
 * below are derived from the remaining headroom/available energy, not
 * clamped after the fact.
 *
 * Charging from surplus (net[h] > 0): input energy is capped by maxChargeKW
 * (AC-side power limit) and by the headroom to full capacity converted to
 * input terms (headroomKWh / chargeEff, since only chargeEff of what goes in
 * is stored). Energy stored = input x chargeEff. Any surplus beyond what the
 * battery accepts exports. This step is unaffected by grid charging (below):
 * it always charges toward full capacity, never toward a lower grid-charge
 * target.
 *
 * Grid charging (`battery.gridCharge`, default `{enabled:false}`): when
 * enabled and the current hour-of-day (calc/time.js's hourOfDay) falls in
 * [windowStartHour, windowEndHour) -- wrapping past midnight when
 * windowStartHour > windowEndHour -- and state of charge is below
 * targetSocFrac x usableKWh, the battery draws additional energy from the
 * grid this same hour, after surplus charging above. That grid draw is
 * capped by the LEAST of:
 *  - maxChargeKW minus whatever AC-side power surplus charging already used
 *    this hour (the two share one power budget),
 *  - the remaining input needed to reach the target state of charge
 *    (targetKWh - soc) / chargeEff, since stored = gridEnergy x chargeEff,
 *  - in 'peak-shave' mode only, shaveThresholdKW minus the hour's import so
 *    far, which is already the post-discharge import (see Discharging below:
 *    peak-shave still shaves down to the threshold inside an active window),
 *    so grid charging itself only ever adds into whatever room is left under
 *    the threshold -- it never re-raises an hour's import that shaving
 *    already brought down to (or below) the threshold,
 *  - in 'peak-shave' mode only, ALSO the current calendar month's own
 *    established peak import so far (monthPeakSoFar, tracked hour by hour via
 *    calc/time.js's monthOfHour and reset to 0 at every month boundary) minus
 *    the hour's import so far. A month whose natural (load-driven) peak sits
 *    under shaveThresholdKW would otherwise have grid charging fill every
 *    in-window hour up to the threshold regardless, manufacturing a new
 *    monthly peak at the threshold that was never actually there -- this cap
 *    instead limits grid charging in any hour to whatever the month has
 *    already shown it needs, so the resulting monthly peak (and thus the
 *    demand charge calc/billing.js bills against it) is never HIGHER with
 *    grid charging on than off. It is not always exactly the same: it can
 *    come out LOWER with grid charging on, when the energy it stored lets
 *    the battery shave a later peak in the same month that the grid-charging
 *    -off arm lacks the stored energy to shave (that arm never drew the
 *    extra grid energy, so it has less state of charge available when the
 *    later spike hits). monthPeakSoFar only ever reflects hours already
 *    processed this month (never the current hour's own charging), and is
 *    updated with each hour's FINAL import (after that hour's own grid
 *    charging, if any) once the hour is done, so a peak that grid charging
 *    never raised above what came before it also never lets a later hour's
 *    grid charging raise it further.
 * Outside an active grid-charge window (disabled, out of the hour window, or
 * already at/above target), behavior is byte-identical to a battery with no
 * gridCharge field at all: there is no grid-charging path for that hour.
 *
 * Discharging (net[h] < 0): `mode` sets the discharge target:
 * - 'self-consumption': target the full deficit, so the battery serves as
 *   much of the load as its power and energy limits allow on every deficit
 *   hour -- unless a grid-charge window is active this hour (see above), in
 *   which case the target is 0: buy-now-discharge-later is the point, so an
 *   ordinary sub-threshold deficit is served entirely from the grid instead
 *   of the battery, and charging and discharging don't overlap in the same
 *   hour.
 * - 'peak-shave': target the amount by which gross import (max(0, -net[h]))
 *   exceeds shaveThresholdKW, so a deficit hour that is already at or under
 *   the threshold draws no energy from the battery, preserving stored energy
 *   for hours that would otherwise cross it. This target applies whether or
 *   not a grid-charge window is active this hour: shaving takes priority
 *   over the window, so the battery still discharges down to the threshold
 *   inside an active window instead of letting the hour's import exceed it.
 *   Grid charging (below) only adds to a peak-shave hour after this
 *   discharge, and only into whatever room is left under the threshold.
 * Either way, delivered energy (AC side) is capped by maxDischargeKW and by
 * the stored energy available above the reserve floor, converted to
 * delivered terms (availableAboveReserveKWh x dischargeEff). Whatever the
 * deficit is not covered from the target imports from the grid.
 *
 * Grid-charge energy adds straight into gridImport[h] alongside whatever the
 * hour's deficit (if any) already required -- it hits tiers, TOU pricing,
 * ECA, and demand charges downstream exactly like any other import, with no
 * special-casing in calc/billing.js.
 *
 * `throughputKWh` is total delivered (AC-side, post-dischargeEff) discharge
 * energy; it does not include charging of either kind. `equivalentFullCycles`
 * is total stored-side energy drawn down (delivered / dischargeEff, i.e.
 * before that loss) divided by usableKWh -- this counts grid-sourced energy
 * once it is later discharged the same as any other stored energy, since
 * state of charge does not track where a kWh came from. `gridChargeKWh` is
 * total grid-side energy drawn specifically by grid charging (not the
 * chargeEff-scaled stored side, and not surplus charging).
 *
 * @param {object} args
 * @param {number[]} args.net - length-8760 kWh series, production - load.
 * @param {{usableKWh:number, chargeEff:number, dischargeEff:number, maxChargeKW:number, maxDischargeKW:number, reserveFrac:number, gridCharge?:{enabled:boolean, windowStartHour:number, windowEndHour:number, targetSocFrac:number}}|null} args.battery
 * @param {'self-consumption'|'peak-shave'} args.mode
 * @param {number} [args.shaveThresholdKW] - only used in 'peak-shave' mode.
 * @returns {{gridImport:number[], gridExport:number[], throughputKWh:number, equivalentFullCycles:number, gridChargeKWh:number}}
 */
export function dispatchBattery({ net, battery, mode, shaveThresholdKW }) {
  const hours = net.length;
  const gridImport = new Array(hours);
  const gridExport = new Array(hours);

  if (!battery) {
    for (let h = 0; h < hours; h++) {
      gridImport[h] = Math.max(0, -net[h]);
      gridExport[h] = Math.max(0, net[h]);
    }
    return { gridImport, gridExport, throughputKWh: 0, equivalentFullCycles: 0, gridChargeKWh: 0 };
  }

  const { usableKWh, chargeEff, dischargeEff, maxChargeKW, maxDischargeKW, reserveFrac, gridCharge } = battery;
  const reserveKWh = reserveFrac * usableKWh;
  const gc = gridCharge && gridCharge.enabled ? gridCharge : null;

  let soc = reserveKWh;
  let throughputKWh = 0;
  let dischargedStoredKWh = 0;
  let gridChargeKWh = 0;

  // Peak-shave only (see this function's header): the running maximum
  // hourly import already established this calendar month, reset to 0 at
  // every month boundary. Read before this hour's own grid-charge cap is
  // computed, updated only after this hour's final import (grid charge
  // included) is known.
  let currentMonth = -1;
  let monthPeakSoFar = 0;

  for (let h = 0; h < hours; h++) {
    const netVal = net[h];

    if (mode === "peak-shave") {
      const month = monthOfHour(h);
      if (month !== currentMonth) {
        currentMonth = month;
        monthPeakSoFar = 0;
      }
    }

    let inputEnergy = 0; // AC-side surplus-charging input used this hour, for the shared maxChargeKW budget below.
    let importVal = 0;
    let exportVal = 0;

    const gcActive = gc !== null && inHourWindow(hourOfDay(h), gc.windowStartHour, gc.windowEndHour) && soc < gc.targetSocFrac * usableKWh;

    if (netVal > 0) {
      const headroomKWh = usableKWh - soc;
      const inputLimitByHeadroom = chargeEff > 0 ? headroomKWh / chargeEff : 0;
      inputEnergy = Math.max(0, Math.min(netVal, maxChargeKW, inputLimitByHeadroom));
      soc += inputEnergy * chargeEff;
      exportVal = netVal - inputEnergy;
    } else if (netVal < 0) {
      const grossImport = -netVal;

      // Peak-shave targets the excess over the threshold regardless of
      // gcActive -- shaving takes priority over the grid-charge window, so a
      // window that is active does not cancel a shave. Self-consumption
      // targets 0 while gcActive (buy-now-discharge-later: an ordinary
      // sub-threshold deficit is served from the grid instead), and the full
      // deficit otherwise.
      const dischargeTargetKWh =
        mode === "peak-shave"
          ? Math.max(0, grossImport - (shaveThresholdKW ?? 0))
          : gcActive
            ? 0
            : grossImport;

      const availableAboveReserveKWh = Math.max(0, soc - reserveKWh);
      const deliveredLimitByStored = availableAboveReserveKWh * dischargeEff;
      const delivered = Math.max(0, Math.min(dischargeTargetKWh, maxDischargeKW, deliveredLimitByStored));
      const storedUsed = dischargeEff > 0 ? delivered / dischargeEff : 0;

      soc -= storedUsed;
      throughputKWh += delivered;
      dischargedStoredKWh += storedUsed;
      importVal = grossImport - delivered;
    }

    if (gcActive) {
      const remainingChargeKWBudget = Math.max(0, maxChargeKW - inputEnergy);
      const remainingCapacityInput =
        chargeEff > 0 ? Math.max(0, (gc.targetSocFrac * usableKWh - soc) / chargeEff) : 0;
      const caps = [remainingChargeKWBudget, remainingCapacityInput];
      if (mode === "peak-shave") {
        caps.push(Math.max(0, (shaveThresholdKW ?? 0) - importVal));
        caps.push(Math.max(0, monthPeakSoFar - importVal));
      }
      const gridEnergy = Math.max(0, Math.min(...caps));

      soc += gridEnergy * chargeEff;
      importVal += gridEnergy;
      gridChargeKWh += gridEnergy;
    }

    gridImport[h] = importVal;
    gridExport[h] = exportVal;

    if (mode === "peak-shave") {
      monthPeakSoFar = Math.max(monthPeakSoFar, importVal);
    }
  }

  const equivalentFullCycles = usableKWh > 0 ? dischargedStoredKWh / usableKWh : 0;

  return { gridImport, gridExport, throughputKWh, equivalentFullCycles, gridChargeKWh };
}
