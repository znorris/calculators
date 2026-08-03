import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, readPayload, buildShareUrl } from "../urlCodec.js";
import { defaultState } from "../schema.js";
import { HOURS_PER_YEAR, monthOfHour } from "../../calc/time.js";

describe("share codec", () => {
  it("round-trips a state with annual usage", () => {
    const state = defaultState();
    state.household.usage.annualKWh = 14000;
    state.assumptions.horizonYears = 15;

    const decoded = decodeShare(encodeShare(state));
    expect(decoded.household.usage.annualKWh).toBe(14000);
    expect(decoded.assumptions.horizonYears).toBe(15);
    expect(decoded.configs).toHaveLength(2);
  });

  it("round-trips monthly usage as-is", () => {
    const state = defaultState();
    state.household.usage = { mode: "monthly", annualKWh: 9000, monthlyKWh: new Array(12).fill(750), hourlyKWh: null };

    const decoded = decodeShare(encodeShare(state));
    expect(decoded.household.usage.mode).toBe("monthly");
    expect(decoded.household.usage.monthlyKWh).toEqual(new Array(12).fill(750));
  });

  it("excludes hourly usage from the payload, downgrading to monthly sums", () => {
    const hourlyKWh = new Array(HOURS_PER_YEAR).fill(1); // 1 kWh every hour
    const state = defaultState();
    state.household.usage = { mode: "hourly", annualKWh: HOURS_PER_YEAR, monthlyKWh: null, hourlyKWh };

    const encoded = encodeShare(state);
    // The encoded payload never carries the 8760-length array: naively
    // base64url-encoding it alone would take on the order of 8760 * 4 chars,
    // dwarfing the rest of the payload.
    expect(encoded.length).toBeLessThan(8760);

    const decoded = decodeShare(encoded);
    expect(decoded.household.usage.mode).toBe("monthly");
    expect(decoded.household.usage.hourlyKWh).toBeNull();

    const expectedMonthly = new Array(12).fill(0);
    for (let h = 0; h < HOURS_PER_YEAR; h++) expectedMonthly[monthOfHour(h)] += 1;
    expect(decoded.household.usage.monthlyKWh).toEqual(expectedMonthly);
  });

  it("round-trips a config's gridCharge settings", () => {
    const state = defaultState();
    state.configs[1].battery.gridCharge = { enabled: true, windowStartHour: 21, windowEndHour: 5, targetSocFrac: 0.8 };

    const decoded = decodeShare(encodeShare(state));
    expect(decoded.configs[1].battery.gridCharge).toEqual({
      enabled: true,
      windowStartHour: 21,
      windowEndHour: 5,
      targetSocFrac: 0.8,
    });
  });

  it("returns null on garbage rather than throwing, since a link is user input", () => {
    expect(decodeShare("not-base64-at-all!!!")).toBeNull();
    expect(decodeShare("")).toBeNull();
    expect(decodeShare(null)).toBeNull();
  });

  it("returns null on a truncated payload", () => {
    const encoded = encodeShare(defaultState());
    expect(decodeShare(encoded.slice(0, Math.floor(encoded.length / 2)))).toBeNull();
  });

  it("refuses a payload from an unknown format version", () => {
    const toBase64Url = (s) =>
      btoa(String.fromCharCode(...new TextEncoder().encode(s)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const bad = toBase64Url(JSON.stringify({ v: 999, state: {} }));
    expect(decodeShare(bad)).toBeNull();
  });
});

describe("payload location", () => {
  it("reads a payload from the fragment", () => {
    const encoded = encodeShare(defaultState());
    const decoded = readPayload({ hash: `#s=${encoded}`, search: "" });
    expect(decoded.configs).toHaveLength(2);
  });

  it("still reads a legacy query-string payload", () => {
    const encoded = encodeShare(defaultState());
    const decoded = readPayload({ hash: "", search: `?s=${encoded}` });
    expect(decoded.configs).toHaveLength(2);
  });

  it("prefers the fragment when both are present", () => {
    const a = encodeShare(defaultState());
    const stateB = defaultState();
    stateB.assumptions.horizonYears = 7;
    const b = encodeShare(stateB);
    const decoded = readPayload({ hash: `#s=${b}`, search: `?s=${a}` });
    expect(decoded.assumptions.horizonYears).toBe(7);
  });

  it("is null when neither carries a payload", () => {
    expect(readPayload({ hash: "#data-handling", search: "?utm=x" })).toBeNull();
  });

  it("survives a bare hash and a missing search", () => {
    expect(readPayload({ hash: "#", search: undefined })).toBeNull();
    expect(readPayload({})).toBeNull();
  });
});

describe("share codec: incentive line items of every type round-trip unchanged", () => {
  it("round-trips fixed, percent, perUnit, annualProduction, and annualFixed incentives on a config", () => {
    const state = defaultState();
    state.configs[0].costs.incentives = [
      { label: "Fixed rebate", type: "fixed", amount: 1000 },
      { label: "State credit", type: "percent", percent: 30, capAmount: 5000 },
      { label: "SGIP", type: "perUnit", unit: "kWh-battery", ratePerUnit: 150, capAmount: null },
      { label: "SREC", type: "annualProduction", ratePerKWh: 0.02, years: 10 },
      { label: "VPP", type: "annualFixed", amount: 500, years: 5 },
    ];

    const decoded = decodeShare(encodeShare(state));
    expect(decoded.configs[0].costs.incentives).toEqual(state.configs[0].costs.incentives);
  });
});

describe("buildShareUrl", () => {
  it("puts the payload in the fragment, not the query string", () => {
    globalThis.window = { location: { origin: "https://example.test", pathname: "/energy-system-comparison/" } };
    const url = buildShareUrl(defaultState());
    expect(url).toMatch(/^https:\/\/example\.test\/energy-system-comparison\/#s=/);
    delete globalThis.window;
  });
});
