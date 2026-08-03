import { describe, it, expect } from "vitest";
import { hashValue, sweepIsStale } from "../hash.js";

describe("hashValue", () => {
  it("is stable across separately-constructed but equal-by-value objects", () => {
    const a = { household: { schedule: "EA", riderIds: [] }, assumptions: { horizonYears: 25 } };
    const b = { household: { schedule: "EA", riderIds: [] }, assumptions: { horizonYears: 25 } };
    expect(hashValue(a)).toBe(hashValue(b));
  });

  it("differs when any nested field differs", () => {
    const a = { household: { schedule: "EA" }, assumptions: { horizonYears: 25 } };
    const b = { household: { schedule: "G1" }, assumptions: { horizonYears: 25 } };
    expect(hashValue(a)).not.toBe(hashValue(b));
  });

  it("is a fixed-width hex string", () => {
    expect(hashValue({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(hashValue({ a: 1, b: [1, 2, 3], c: "x".repeat(5000) })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("sweepIsStale", () => {
  it("is false when no request is outstanding (requestHash null), regardless of the live hash", () => {
    expect(sweepIsStale(null, "abc")).toBe(false);
    expect(sweepIsStale(null, null)).toBe(false);
  });

  it("is false when the request's hash still matches the live hash", () => {
    expect(sweepIsStale("abc", "abc")).toBe(false);
  });

  it("is true when the request's hash no longer matches the live hash", () => {
    // Regression: ExplorerSection.jsx used to key its cancellation guard off
    // a `resultsHash` state that was set to null for the entire duration of
    // an in-flight sweep, so this exact case (a request outstanding for
    // inputs that have since changed) never fired the guard, and an input
    // change never cancelled the in-flight worker.
    expect(sweepIsStale("abc", "def")).toBe(true);
  });

  it("only cares whether requestHash matches liveHash, not which specific value either is", () => {
    // Regression: the completion handler used to write back the hash
    // captured in runExplore()'s own closure rather than reading a live
    // value at arrival time, so a request hash and a "live" hash read from
    // the same stale closure always compared equal even after inputs had
    // moved on. Simulating that bug here: a closure-captured requestHash
    // compared against itself (rather than a freshly-read live hash) always
    // returns false, which is exactly the bug -- this function only reports
    // staleness correctly when its second argument is actually fresh.
    const requestHash = hashValue({ household: { schedule: "EA" } });
    const staleClosureRead = requestHash; // what the old bug compared against
    const freshLiveRead = hashValue({ household: { schedule: "G1" } }); // inputs changed since
    expect(sweepIsStale(requestHash, staleClosureRead)).toBe(false);
    expect(sweepIsStale(requestHash, freshLiveRead)).toBe(true);
  });
});
