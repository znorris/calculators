import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadOffers,
  saveOffers,
  loadCurrentComparison,
  saveCurrentComparison,
} from "../storage.js";
import { createOffer } from "../offer.js";
import { createComparison, normalizeComparison, updateFactor } from "../comparison.js";

/** Minimal localStorage, since these tests run in node. */
function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

beforeEach(() => {
  installStorage();
});

describe("offer persistence", () => {
  it("round-trips an offer", () => {
    const offer = createOffer({ name: "Northwind", annualSalary: 120000, state: "CO" });
    saveOffers([offer]);
    const [loaded] = loadOffers();
    expect(loaded.name).toBe("Northwind");
    expect(loaded.annualSalary).toBe(120000);
    expect(loaded.id).toBe(offer.id);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadOffers()).toEqual([]);
  });

  it("returns an empty list rather than throwing on corrupt data", () => {
    localStorage.setItem("comp-comparison:offers", "{not json");
    expect(loadOffers()).toEqual([]);
  });

  it("keeps factor ratings, which are not schema fields", () => {
    const offer = createOffer({ name: "A", factorRatings: { growth: 4 } });
    saveOffers([offer]);
    expect(loadOffers()[0].factorRatings).toEqual({ growth: 4 });
  });
});

describe("comparison persistence", () => {
  it("is null before anything is saved", () => {
    expect(loadCurrentComparison()).toBeNull();
  });

  it("round-trips the values scoped to the person rather than an offer", () => {
    const comparison = createComparison({
      offerIds: ["a", "b"],
      baselineId: "b",
      pinnedId: "a",
      filingStatus: "marriedJoint",
      taxYear: 2026,
      horizonYears: 7,
    });
    saveCurrentComparison(comparison);

    const loaded = normalizeComparison(loadCurrentComparison());
    expect(loaded.filingStatus).toBe("marriedJoint");
    expect(loaded.horizonYears).toBe(7);
    expect(loaded.baselineId).toBe("b");
    expect(loaded.pinnedId).toBe("a");
  });

  it("keeps factor weights", () => {
    let comparison = createComparison();
    const target = comparison.factors[0];
    comparison = updateFactor(comparison, target.id, { weight: 5, label: "Renamed" });
    saveCurrentComparison(comparison);

    const loaded = normalizeComparison(loadCurrentComparison());
    const restored = loaded.factors.find((f) => f.id === target.id);
    expect(restored.weight).toBe(5);
    expect(restored.label).toBe("Renamed");
  });

  it("returns null rather than throwing on corrupt data", () => {
    localStorage.setItem("comp-comparison:current", "{not json");
    expect(loadCurrentComparison()).toBeNull();
  });

  it("rejects a stored array, which is the wrong shape", () => {
    localStorage.setItem("comp-comparison:current", "[]");
    expect(loadCurrentComparison()).toBeNull();
  });

  it("survives a write failure without throwing", () => {
    globalThis.localStorage.setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveCurrentComparison(createComparison())).toBe(false);
  });
});
