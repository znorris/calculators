import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadOffers,
  saveOffers,
  loadComparisons,
  saveComparisons,
  loadActiveComparisonId,
  saveActiveComparisonId,
  deleteComparison,
  removeOfferFromComparison,
} from "../storage.js";
import { createOffer } from "../offer.js";
import { createComparison, normalizeComparison, updateFactor, addOffer } from "../comparison.js";

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
  it("round-trips a list of comparisons", () => {
    const a = createComparison({ name: "2026 search", offerIds: ["o1"], baselineId: "o1" });
    const b = createComparison({ name: "Old", offerIds: [] });
    saveComparisons([a, b]);

    const loaded = loadComparisons();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((c) => c.name)).toEqual(["2026 search", "Old"]);
    expect(loaded[0].baselineId).toBe("o1");
  });

  it("keeps values scoped to the person rather than an offer", () => {
    const c = createComparison({ filingStatus: "marriedJoint", horizonYears: 7 });
    saveComparisons([c]);
    const [loaded] = loadComparisons();
    expect(loaded.filingStatus).toBe("marriedJoint");
    expect(loaded.horizonYears).toBe(7);
  });

  it("keeps factor weights", () => {
    let c = createComparison();
    const target = c.factors[0];
    c = updateFactor(c, target.id, { weight: 5, label: "Renamed" });
    saveComparisons([c]);
    const restored = loadComparisons()[0].factors.find((f) => f.id === target.id);
    expect(restored.weight).toBe(5);
    expect(restored.label).toBe("Renamed");
  });

  it("returns an empty list rather than throwing on corrupt data", () => {
    localStorage.setItem("comp-comparison:comparisons", "{not json");
    expect(loadComparisons()).toEqual([]);
  });
});

describe("which comparison is open", () => {
  it("stores only the id, so the list stays the single source of truth", () => {
    saveActiveComparisonId("cmp-1");
    expect(loadActiveComparisonId()).toBe("cmp-1");
  });

  it("is null before anything is chosen", () => {
    expect(loadActiveComparisonId()).toBeNull();
  });

  it("clears when given nothing", () => {
    saveActiveComparisonId("cmp-1");
    saveActiveComparisonId(null);
    expect(loadActiveComparisonId()).toBeNull();
  });
});

describe("deleting a comparison", () => {
  it("deletes offers no remaining comparison uses", () => {
    const lonely = createOffer({ name: "Only here" });
    const c = addOffer(createComparison({ name: "Doomed" }), lonely.id);
    const result = deleteComparison([lonely], [c], c.id);
    expect(result.comparisons).toEqual([]);
    expect(result.offers).toEqual([]);
  });

  it("keeps an offer another comparison still references", () => {
    const shared = createOffer({ name: "Shared" });
    const a = addOffer(createComparison({ name: "A" }), shared.id);
    const b = addOffer(createComparison({ name: "B" }), shared.id);
    const result = deleteComparison([shared], [a, b], a.id);
    expect(result.comparisons.map((c) => c.name)).toEqual(["B"]);
    expect(result.offers.map((o) => o.name)).toEqual(["Shared"]);
  });
});

describe("removing an offer from one comparison", () => {
  it("deletes the record when nothing else references it", () => {
    const offer = createOffer({ name: "Only here" });
    const c = addOffer(createComparison(), offer.id);
    const result = removeOfferFromComparison([offer], [c], c.id, offer.id);
    expect(result.comparisons[0].offerIds).toEqual([]);
    expect(result.offers).toEqual([]);
  });

  it("keeps the record when another comparison uses it", () => {
    const offer = createOffer({ name: "Shared" });
    const a = addOffer(createComparison({ name: "A" }), offer.id);
    const b = addOffer(createComparison({ name: "B" }), offer.id);
    const result = removeOfferFromComparison([offer], [a, b], a.id, offer.id);
    expect(result.comparisons[0].offerIds).toEqual([]);
    expect(result.comparisons[1].offerIds).toEqual([offer.id]);
    expect(result.offers).toHaveLength(1);
  });

  it("reassigns the baseline when the removed offer was it", () => {
    const one = createOffer({ name: "One" });
    const two = createOffer({ name: "Two" });
    let c = addOffer(addOffer(createComparison(), one.id), two.id);
    expect(c.baselineId).toBe(one.id);
    const result = removeOfferFromComparison([one, two], [c], c.id, one.id);
    expect(result.comparisons[0].baselineId).toBe(two.id);
  });

  it("leaves other comparisons untouched", () => {
    const offer = createOffer({ name: "X" });
    const a = addOffer(createComparison({ name: "A" }), offer.id);
    const b = addOffer(createComparison({ name: "B", horizonYears: 3 }), offer.id);
    const result = removeOfferFromComparison([offer], [a, b], a.id, offer.id);
    expect(result.comparisons[1].horizonYears).toBe(3);
  });
});
