import { describe, it, expect } from "vitest";
import { dispatchBattery } from "../battery.js";

const EPS = 1e-9;

describe("dispatchBattery with battery: null", () => {
  it("splits net straight into import/export with zero throughput", () => {
    const net = [5, -3, 0, -12, 8];
    const result = dispatchBattery({ net, battery: null, mode: "self-consumption" });

    expect(result.gridImport).toEqual([0, 3, 0, 12, 0]);
    expect(result.gridExport).toEqual([5, 0, 0, 0, 8]);
    expect(result.throughputKWh).toBe(0);
    expect(result.equivalentFullCycles).toBe(0);
  });
});

describe("dispatchBattery energy conservation", () => {
  it("matches sum(input) x chargeEff x dischargeEff to delivered output across days that return to the same state of charge", () => {
    const battery = {
      usableKWh: 20,
      chargeEff: 0.9,
      dischargeEff: 0.85,
      maxChargeKW: 1000,
      maxDischargeKW: 1000,
      reserveFrac: 0.1, // reserveKWh = 2
    };
    // Each day: a surplus hour that stores 10 kWh of input, then a deficit
    // hour large enough to hit the stored-energy limit and drain exactly
    // back to the reserve floor, so state of charge returns to 2 kWh at the
    // end of every day and the round trip repeats identically.
    const days = 5;
    const net = [];
    for (let d = 0; d < days; d++) {
      net.push(10, -8);
    }

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    const totalInput = days * 10; // full 10 kWh surplus is absorbed each day
    const expectedDelivered = totalInput * battery.chargeEff * battery.dischargeEff;
    expect(result.throughputKWh).toBeCloseTo(expectedDelivered, 6);
  });
});

describe("dispatchBattery state of charge bounds", () => {
  it("keeps reconstructed state of charge within [reserveFrac x usableKWh, usableKWh] every hour", () => {
    const battery = {
      usableKWh: 15,
      chargeEff: 0.92,
      dischargeEff: 0.88,
      maxChargeKW: 5,
      maxDischargeKW: 4,
      reserveFrac: 0.15,
    };
    const reserveKWh = battery.reserveFrac * battery.usableKWh;

    const hours = 200;
    const net = [];
    for (let h = 0; h < hours; h++) {
      net.push(6 * Math.sin(h * 0.7));
    }

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    let soc = reserveKWh;
    for (let h = 0; h < hours; h++) {
      const netVal = net[h];
      if (netVal > 0) {
        const inputEnergy = netVal - result.gridExport[h];
        soc += inputEnergy * battery.chargeEff;
      } else if (netVal < 0) {
        const grossImport = -netVal;
        const delivered = grossImport - result.gridImport[h];
        soc -= delivered / battery.dischargeEff;
      }
      expect(soc).toBeGreaterThanOrEqual(reserveKWh - EPS);
      expect(soc).toBeLessThanOrEqual(battery.usableKWh + EPS);
    }
  });
});

describe("dispatchBattery power limits", () => {
  it("caps charging at maxChargeKW when a huge surplus hour has plenty of headroom", () => {
    const battery = {
      usableKWh: 100,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 3,
      maxDischargeKW: 1000,
      reserveFrac: 0.1, // reserveKWh = 10, headroom = 90
    };
    const net = [1000];

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // Only 3 kWh (the power limit) is taken from the 1000 kWh surplus.
    expect(result.gridExport[0]).toBeCloseTo(1000 - 3, 6);
    expect(result.gridImport[0]).toBe(0);
  });
});

describe("dispatchBattery reserve floor", () => {
  it("never discharges below reserveFrac x usableKWh even against a huge deficit", () => {
    const battery = {
      usableKWh: 50,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 1000,
      maxDischargeKW: 1000,
      reserveFrac: 0.2, // reserveKWh = 10
    };
    // Hour 0 fills the battery to full; hour 1's deficit is far larger than
    // the 40 kWh available above the reserve floor.
    const net = [1000, -1000];

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // Full capacity minus the reserve floor is the most that can be delivered.
    expect(result.throughputKWh).toBeCloseTo(40, 6);
    expect(result.gridImport[1]).toBeCloseTo(1000 - 40, 6);
  });
});

describe("dispatchBattery peak-shave mode", () => {
  const battery = {
    usableKWh: 50,
    chargeEff: 1,
    dischargeEff: 1,
    maxChargeKW: 1000,
    maxDischargeKW: 1000,
    reserveFrac: 0.2, // reserveKWh = 10
  };

  it("caps grid import at shaveThresholdKW when the battery has energy above reserve", () => {
    const net = [1000, -20]; // hour 0 fills the battery to full (50 kWh)
    const result = dispatchBattery({
      net,
      battery,
      mode: "peak-shave",
      shaveThresholdKW: 5,
    });

    expect(result.gridImport[1]).toBeCloseTo(5, 6);
  });

  it("draws nothing from the battery when gross import is already at or under the threshold", () => {
    const net = [1000, -3];
    const result = dispatchBattery({
      net,
      battery,
      mode: "peak-shave",
      shaveThresholdKW: 5,
    });

    expect(result.gridImport[1]).toBeCloseTo(3, 6);
    expect(result.throughputKWh).toBe(0);
  });

  it("still respects the reserve floor when shaving a deficit larger than available energy", () => {
    const net = [1000, -1000];
    const result = dispatchBattery({
      net,
      battery,
      mode: "peak-shave",
      shaveThresholdKW: 5,
    });

    // Target would be 1000 - 5 = 995, but only 40 kWh is available above reserve.
    expect(result.throughputKWh).toBeCloseTo(40, 6);
    expect(result.gridImport[1]).toBeCloseTo(1000 - 40, 6);
  });
});

describe("dispatchBattery cycle counting", () => {
  it("counts roughly 365 x (daily depth / usableKWh) full cycles on a synthetic daily cycle year", () => {
    const battery = {
      usableKWh: 10,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 1000,
      maxDischargeKW: 1000,
      reserveFrac: 0.2, // reserveKWh = 2, so depth to full is 8 kWh/day
    };

    const hoursPerYear = 8760;
    const net = new Array(hoursPerYear).fill(0);
    for (let day = 0; day < 365; day++) {
      const base = day * 24;
      net[base] = 100; // fills to full (limited by 8 kWh headroom)
      net[base + 1] = -100; // drains back to the reserve floor
    }

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    const dailyDepth = battery.usableKWh - battery.reserveFrac * battery.usableKWh; // 8 kWh
    const expectedCycles = 365 * (dailyDepth / battery.usableKWh);
    expect(result.equivalentFullCycles).toBeCloseTo(expectedCycles, 6);
  });
});

describe("dispatchBattery grid charging", () => {
  it("is byte-identical to a battery with no gridCharge field when gridCharge.enabled is false", () => {
    const net = [];
    for (let h = 0; h < 48; h++) net.push(6 * Math.sin(h * 0.5));

    const batteryLegacy = {
      usableKWh: 15,
      chargeEff: 0.92,
      dischargeEff: 0.88,
      maxChargeKW: 5,
      maxDischargeKW: 4,
      reserveFrac: 0.15,
    };
    const batteryWithDisabledGridCharge = {
      ...batteryLegacy,
      gridCharge: { enabled: false, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };

    const legacyResult = dispatchBattery({ net, battery: batteryLegacy, mode: "self-consumption" });
    const disabledResult = dispatchBattery({ net, battery: batteryWithDisabledGridCharge, mode: "self-consumption" });

    expect(disabledResult).toEqual(legacyResult);
  });

  it("activates only within a wrap-around window (22..6), hitting 23:00 and 05:00 but not 06:00 or 21:00", () => {
    // 31 hours starting at hour-of-day 0: h=21 -> hod 21, h=23 -> hod 23,
    // h=29 -> hod 5 (next day), h=30 -> hod 6.
    const net = new Array(31).fill(0);
    const battery = {
      usableKWh: 1000, // large headroom so the target is never actually reached in this window
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 1,
      maxDischargeKW: 1,
      reserveFrac: 0,
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    expect(result.gridImport[21]).toBe(0); // hour-of-day 21, before the window
    expect(result.gridImport[23]).toBeCloseTo(1, 6); // hour-of-day 23, inside the window
    expect(result.gridImport[29]).toBeCloseTo(1, 6); // hour-of-day 5, inside the wrapped window
    expect(result.gridImport[30]).toBe(0); // hour-of-day 6, the exclusive end of the window
  });

  it("caps the grid draw at the remaining capacity to targetSocFrac x usableKWh even with power headroom to spare", () => {
    const net = [0];
    const battery = {
      usableKWh: 10,
      chargeEff: 0.8,
      dischargeEff: 0.9,
      maxChargeKW: 100, // far more power than the target cap allows
      maxDischargeKW: 100,
      reserveFrac: 0,
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 0.5 }, // target = 5 kWh
    };

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // Grid-side energy needed to store 5 kWh at 0.8 chargeEff is 5 / 0.8 = 6.25.
    expect(result.gridImport[0]).toBeCloseTo(6.25, 6);
    expect(result.gridChargeKWh).toBeCloseTo(6.25, 6);
  });

  it("shares one maxChargeKW power budget between surplus charging and grid charging in the same hour", () => {
    const net = [2]; // a 2 kWh on-site surplus
    const battery = {
      usableKWh: 10,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 4,
      maxDischargeKW: 4,
      reserveFrac: 0,
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 }, // target = 10, well above reach
    };

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // Surplus charging takes the full 2 kWh surplus (no export); grid charging
    // then takes only the remaining 4 - 2 = 2 kWh of the shared power budget.
    expect(result.gridExport[0]).toBeCloseTo(0, 6);
    expect(result.gridImport[0]).toBeCloseTo(2, 6);
    expect(result.gridChargeKWh).toBeCloseTo(2, 6);
  });

  it("never lets grid charging push a peak-shave hour's import above shaveThresholdKW", () => {
    // Index 12 (hour-of-day 12, outside the 22-6 window) seeds the month's
    // established peak at exactly the threshold (5 kWh deficit, no grid
    // charging, no discharge since it's already at the threshold) -- without
    // this seed hour, the window hour under test would hit the
    // month-peak-so-far cap (see the dedicated test below) before it ever
    // reached the shaveThresholdKW cap this test means to exercise.
    const net = [...Array(12).fill(0), -5, ...Array(9).fill(0), -3]; // index 12: 5 kWh; index 22: 3 kWh deficit
    const battery = {
      usableKWh: 1000,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 1000,
      maxDischargeKW: 1000,
      reserveFrac: 0,
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };

    const result = dispatchBattery({ net, battery, mode: "peak-shave", shaveThresholdKW: 5 });

    // The seed hour establishes a 5 kWh peak. The 3 kWh deficit at index 22
    // already imports from the grid (charge windows never discharge the
    // battery); grid charging tops up only the remaining 5 - 3 = 2 kWh of
    // headroom under the threshold, which is also exactly the month's
    // already-established peak, so both caps agree here.
    expect(result.gridImport[22]).toBeCloseTo(5, 6);
    expect(result.gridChargeKWh).toBeCloseTo(2, 6);
  });

  it("never lets grid charging raise a month's import peak above what the month's own load already established, even when that's below shaveThresholdKW", () => {
    // Regression: calc/battery.js used to cap grid charging in peak-shave
    // mode by shaveThresholdKW alone. A month whose natural (load-driven)
    // peak sits under that threshold had every in-window hour topped up to
    // the threshold regardless, manufacturing a new monthly peak (and demand
    // charge) that was never actually there. Index 12 (hour-of-day 12,
    // outside the window) establishes a natural peak of 6 kWh -- well under
    // the 10 kWh threshold. Index 22 (hour-of-day 22, inside the window) has
    // only a 2 kWh deficit.
    const net = [...Array(12).fill(0), -6, ...Array(9).fill(0), -2]; // index 12: 6 kWh; index 22: 2 kWh deficit
    const battery = {
      usableKWh: 1000,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 1000,
      maxDischargeKW: 1000,
      reserveFrac: 0,
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };

    const result = dispatchBattery({ net, battery, mode: "peak-shave", shaveThresholdKW: 10 });

    // Pre-fix, grid charging would have topped index 22 up to the 10 kWh
    // threshold (8 kWh of grid charging on top of the 2 kWh deficit),
    // raising the month's peak from 6 to 10. The fix caps it at the 6 kWh
    // already established instead: only 4 kWh of grid charging.
    expect(result.gridImport[12]).toBeCloseTo(6, 6);
    expect(result.gridImport[22]).toBeCloseTo(6, 6);
    expect(Math.max(...result.gridImport)).toBeCloseTo(6, 6);
    expect(result.gridChargeKWh).toBeCloseTo(4, 6);
  });

  it("serves a deficit from the grid instead of the battery during an active charge window, while the battery still charges", () => {
    const net = [-10]; // a 10 kWh deficit, no on-site surplus this hour
    const battery = {
      usableKWh: 1000,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 5,
      maxDischargeKW: 1000,
      reserveFrac: 0.5, // reserveKWh = 500, plenty of stored energy the battery could otherwise discharge
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // No discharge happens (throughputKWh stays 0) even though the battery
    // has energy available above reserve; the whole 10 kWh deficit imports
    // from the grid, plus up to maxChargeKW (5) of grid charging on top.
    expect(result.throughputKWh).toBe(0);
    expect(result.gridChargeKWh).toBeCloseTo(5, 6);
    expect(result.gridImport[0]).toBeCloseTo(15, 6);
  });

  it("still shaves a peak-shave hour down to shaveThresholdKW inside an active grid-charge window, when gross import exceeds the threshold", () => {
    // Reviewer's fixture: threshold 10 kW, 40 kWh / 5 kW charge / 10 kW
    // discharge / 10% reserve (4 kWh floor), 12 kW deficit at hours of-day
    // 22, 23, 0, 1 (window 22-6), target SoC 1.0 (full). Shaving must win
    // over the window at every one of the four hours, not just the first
    // (the first hour starts at soc == target, so gcActive is already false
    // there even pre-fix; hours 2-4 are the ones the bug left unshaved).
    const battery = {
      usableKWh: 40,
      chargeEff: 1,
      dischargeEff: 1,
      maxChargeKW: 5,
      maxDischargeKW: 10,
      reserveFrac: 0.1, // reserveKWh = 4
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1.0 },
    };
    // Indices 0-9: a large daytime surplus (hours of-day 0-9) charges the
    // battery to full before the window. Indices 10-21: idle (hours of-day
    // 10-21, outside the window). Indices 22-25: hours of-day 22, 23, 0, 1,
    // the window's four 12 kW deficit hours under test.
    const net = [...Array(10).fill(100), ...Array(12).fill(0), -12, -12, -12, -12];

    const result = dispatchBattery({ net, battery, mode: "peak-shave", shaveThresholdKW: 10 });

    expect(result.gridImport[22]).toBeCloseTo(10, 6);
    expect(result.gridImport[23]).toBeCloseTo(10, 6);
    expect(result.gridImport[24]).toBeCloseTo(10, 6);
    expect(result.gridImport[25]).toBeCloseTo(10, 6);
  });

  it("holds the net + gridImport - gridExport = AC-side battery flow identity for every hour of a full year with grid charging active", () => {
    const battery = {
      usableKWh: 20,
      chargeEff: 0.9,
      dischargeEff: 0.9,
      maxChargeKW: 3,
      maxDischargeKW: 3,
      reserveFrac: 0.1, // reserveKWh = 2
      gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 0.9 },
    };

    const hoursPerYear = 8760;
    const net = new Array(hoursPerYear);
    for (let h = 0; h < hoursPerYear; h++) {
      const hod = h % 24;
      // A solar-shaped surplus midday, a steady deficit the rest of the day.
      net[h] = hod >= 10 && hod < 15 ? 5 : -2;
    }

    const result = dispatchBattery({ net, battery, mode: "self-consumption" });

    // Reconstruct state of charge hour by hour from the returned series and
    // check both the balance identity and the charge bounds hold throughout.
    const reserveKWh = battery.reserveFrac * battery.usableKWh;
    const targetKWh = battery.gridCharge.targetSocFrac * battery.usableKWh;
    let soc = reserveKWh;
    let reconstructedGridChargeKWh = 0;
    for (let h = 0; h < hoursPerYear; h++) {
      const hod = h % 24;
      const inWindow = hod >= 22 || hod < 6;
      const gcActiveThisHour = inWindow && soc < targetKWh;

      const flow = net[h] + result.gridImport[h] - result.gridExport[h];
      if (flow > 0) {
        soc += flow * battery.chargeEff;
      } else if (flow < 0) {
        soc += flow / battery.dischargeEff;
      }
      expect(soc).toBeGreaterThanOrEqual(reserveKWh - EPS);
      expect(soc).toBeLessThanOrEqual(battery.usableKWh + EPS);

      if (gcActiveThisHour && net[h] < 0) {
        // Deficits inside an active charge window are fully grid-served, so
        // whatever import exceeds the deficit itself is grid-charge energy.
        const gridChargeThisHour = result.gridImport[h] - -net[h];
        expect(gridChargeThisHour).toBeGreaterThanOrEqual(-EPS);
        reconstructedGridChargeKWh += Math.max(0, gridChargeThisHour);
      }
    }

    expect(result.gridChargeKWh).toBeGreaterThan(0);
    expect(reconstructedGridChargeKWh).toBeLessThanOrEqual(result.gridChargeKWh + EPS);
  });
});

describe("dispatchBattery grid charging: month-peak invariant (never higher, can be lower)", () => {
  // Locks in the verified invariant this function's own header and
  // calc/CONTRACTS.md document: with grid charging on, a month's peak-shave
  // import peak is never HIGHER than with it off, but it is not always
  // exactly the same either -- it can come out LOWER, when energy the
  // battery drew from the grid ahead of time lets it shave a later spike
  // that same month which the grid-charging-off run has no stored energy
  // left to shave. Two deficit spikes in the same month (hour 8: 18 kW,
  // hour 32: 25 kW), no on-site generation at all, so the battery only ever
  // has energy to discharge from grid charging.
  it("shaves a later same-month spike using grid-drawn energy that the off run never had, so its peak comes out strictly lower", () => {
    const hours = 8760;
    const net = new Array(hours).fill(0);
    net[8] = -18;
    net[32] = -25;

    const batteryBase = { usableKWh: 10, chargeEff: 1, dischargeEff: 1, maxChargeKW: 100, maxDischargeKW: 100, reserveFrac: 0 };
    const off = dispatchBattery({
      net,
      battery: { ...batteryBase, gridCharge: { enabled: false, windowStartHour: 0, windowEndHour: 6, targetSocFrac: 1 } },
      mode: "peak-shave",
      shaveThresholdKW: 10,
    });
    const on = dispatchBattery({
      net,
      battery: { ...batteryBase, gridCharge: { enabled: true, windowStartHour: 0, windowEndHour: 6, targetSocFrac: 1 } },
      mode: "peak-shave",
      shaveThresholdKW: 10,
    });

    // Neither run has any stored energy yet at hour 8 (the first grid-charge
    // window, hours 0-6, is over by then), so both shave it identically --
    // this is not the "never higher" cap doing anything interesting yet.
    expect(off.gridImport[8]).toBeCloseTo(18, 9);
    expect(on.gridImport[8]).toBeCloseTo(18, 9);

    // By hour 32 (the next overnight window has recharged the battery in the
    // "on" run only), the off run still has nothing to discharge and passes
    // the full 25 kW spike straight through; the on run shaves it down to 15.
    expect(off.gridImport[32]).toBeCloseTo(25, 9);
    expect(on.gridImport[32]).toBeCloseTo(15, 9);

    const offPeak = Math.max(...off.gridImport);
    const onPeak = Math.max(...on.gridImport);
    expect(offPeak).toBeCloseTo(25, 9);
    expect(onPeak).toBeCloseTo(18, 9); // the hour-8 spike, not hour-32's shaved 15
    expect(onPeak).toBeLessThan(offPeak); // strictly lower, not "always exactly the same"
    expect(onPeak).toBeLessThanOrEqual(offPeak); // and never higher, in any case
  });
});
