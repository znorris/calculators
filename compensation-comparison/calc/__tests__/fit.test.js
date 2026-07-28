import { describe, it, expect } from "vitest";
import { scoreOffer, scoreAll, moneyAndFitAgree } from "../fit.js";
import { createOffer } from "../../model/offer.js";
import {
  createComparison,
  addFactor,
  updateFactor,
  removeFactor,
  normalizeComparison,
  DEFAULT_FACTORS,
} from "../../model/comparison.js";

const FACTORS = [
  { id: "growth", label: "Career growth", weight: 5 },
  { id: "balance", label: "Work-life balance", weight: 3 },
  { id: "stability", label: "Company stability", weight: 1 },
];

describe("scoreOffer", () => {
  it("is null when nothing has been rated, rather than zero", () => {
    expect(scoreOffer(createOffer(), FACTORS)).toBeNull();
  });

  it("scores weight times rating out of the maximum those factors could earn", () => {
    const offer = createOffer({ factorRatings: { growth: 5, balance: 3, stability: 1 } });
    const score = scoreOffer(offer, FACTORS);
    expect(score.earned).toBe(5 * 5 + 3 * 3 + 1 * 1);
    expect(score.possible).toBe((5 + 3 + 1) * 5);
    expect(score.percent).toBeCloseTo((35 / 45) * 100, 6);
  });

  it("reaches 100 percent when every rated factor is maxed", () => {
    const offer = createOffer({ factorRatings: { growth: 5, balance: 5, stability: 5 } });
    expect(scoreOffer(offer, FACTORS).percent).toBeCloseTo(100, 6);
  });

  it("scores only what was rated, so a partial rating is not penalized as zero", () => {
    const offer = createOffer({ factorRatings: { growth: 5 } });
    const score = scoreOffer(offer, FACTORS);
    expect(score.percent).toBeCloseTo(100, 6);
    expect(score.ratedCount).toBe(1);
    expect(score.totalCount).toBe(3);
  });

  it("ignores a factor whose weight is zero", () => {
    const factors = [...FACTORS, { id: "ignored", label: "Off", weight: 0 }];
    const offer = createOffer({ factorRatings: { growth: 5, ignored: 1 } });
    const score = scoreOffer(offer, factors);
    expect(score.contributions.some((c) => c.id === "ignored")).toBe(false);
    expect(score.totalCount).toBe(3);
  });

  it("weights a high-importance factor above a low-importance one", () => {
    const caresAboutGrowth = createOffer({ factorRatings: { growth: 5, stability: 1 } });
    const caresAboutStability = createOffer({ factorRatings: { growth: 1, stability: 5 } });
    expect(scoreOffer(caresAboutGrowth, FACTORS).percent).toBeGreaterThan(
      scoreOffer(caresAboutStability, FACTORS).percent,
    );
  });

  it("orders contributions by how much they moved the score", () => {
    const offer = createOffer({ factorRatings: { growth: 3, balance: 5, stability: 5 } });
    const points = scoreOffer(offer, FACTORS).contributions.map((c) => c.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });
});

describe("scoreAll", () => {
  const strong = createOffer({ name: "Strong", factorRatings: { growth: 5, balance: 2, stability: 4 } });
  const balanced = createOffer({ name: "Balanced", factorRatings: { growth: 2, balance: 5, stability: 4 } });

  it("names the offer leading on fit", () => {
    const { leader } = scoreAll([strong, balanced], FACTORS);
    expect(leader.name).toBe("Strong");
  });

  it("names the factor separating them most, weighted", () => {
    const { biggestGap } = scoreAll([strong, balanced], FACTORS);
    // Growth differs by 3 at weight 5 (gap 15); balance differs by 3 at weight 3 (gap 9).
    expect(biggestGap.factor.id).toBe("growth");
    expect(biggestGap.gap).toBe(15);
    expect(biggestGap.best.name).toBe("Strong");
    expect(biggestGap.worst.name).toBe("Balanced");
  });

  it("has no leader or gap with fewer than two rated offers", () => {
    const result = scoreAll([strong, createOffer({ name: "Unrated" })], FACTORS);
    expect(result.leader).toBeNull();
    expect(result.biggestGap).toBeNull();
  });

  it("ignores a factor only one offer rated when finding the gap", () => {
    const a = createOffer({ name: "A", factorRatings: { growth: 5, stability: 3 } });
    const b = createOffer({ name: "B", factorRatings: { growth: 4 } });
    const { biggestGap } = scoreAll([a, b], FACTORS);
    expect(biggestGap.factor.id).toBe("growth");
  });
});

describe("moneyAndFitAgree", () => {
  it("reports agreement when the same offer leads both", () => {
    expect(moneyAndFitAgree("a", "a")).toBe(true);
  });

  it("reports disagreement, which is the case worth surfacing", () => {
    expect(moneyAndFitAgree("a", "b")).toBe(false);
  });

  it("is null when either side has no leader", () => {
    expect(moneyAndFitAgree(null, "b")).toBeNull();
  });
});

describe("factors on the comparison", () => {
  it("ship with a default set, since a blank list teaches nothing", () => {
    expect(createComparison().factors.length).toBe(DEFAULT_FACTORS.length);
  });

  it("are copies, so editing one comparison does not touch another", () => {
    const a = createComparison();
    const b = createComparison();
    a.factors[0].weight = 1;
    expect(b.factors[0].weight).toBe(DEFAULT_FACTORS[0].weight);
  });

  it("add, update, and remove", () => {
    let c = createComparison();
    const before = c.factors.length;
    c = addFactor(c, "Commute");
    expect(c.factors).toHaveLength(before + 1);

    const added = c.factors[c.factors.length - 1];
    c = updateFactor(c, added.id, { weight: 5, label: "Commute time" });
    expect(c.factors[c.factors.length - 1].weight).toBe(5);
    expect(c.factors[c.factors.length - 1].label).toBe("Commute time");

    c = removeFactor(c, added.id);
    expect(c.factors).toHaveLength(before);
  });

  it("survive a stored comparison that predates them", () => {
    expect(normalizeComparison({ offerIds: [] }).factors.length).toBeGreaterThan(0);
  });

  it("keep a stored list rather than replacing it with defaults", () => {
    const custom = [{ id: "x", label: "Only this", weight: 4 }];
    expect(normalizeComparison({ factors: custom }).factors).toEqual(custom);
  });
});
