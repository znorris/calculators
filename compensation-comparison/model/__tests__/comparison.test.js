import { describe, it, expect } from "vitest";
import {
  createComparison,
  addOffer,
  removeOffer,
  moveOffer,
  setBaseline,
  clampHorizon,
  columnOrder,
  danglingOfferIds,
  comparisonsReferencing,
  normalizeComparison,
  REPORT_COLUMN_ID,
  DEFAULT_HORIZON_YEARS,
} from "../comparison.js";
import {
  createOffer,
  duplicateOffer,
  sectionsWithData,
  sectionHasData,
  columnLetters,
  nextOfferName,
} from "../offer.js";
import { SECTIONS } from "../schema.js";
import { deleteOffer, upsertOffer, indexById } from "../storage.js";

describe("createComparison", () => {
  it("defaults to a ten-year horizon, long enough for the trend charts to read", () => {
    expect(createComparison().horizonYears).toBe(DEFAULT_HORIZON_YEARS);
    expect(DEFAULT_HORIZON_YEARS).toBe(10);
  });

  it("pins the report by default, since that is the column you keep in view", () => {
    expect(createComparison().pinnedId).toBe(REPORT_COLUMN_ID);
  });
});

describe("addOffer", () => {
  it("makes the first offer the baseline", () => {
    const c = addOffer(createComparison(), "a");
    expect(c.baselineId).toBe("a");
  });

  it("leaves the baseline alone when adding a second offer", () => {
    const c = addOffer(addOffer(createComparison(), "a"), "b");
    expect(c.baselineId).toBe("a");
    expect(c.offerIds).toEqual(["a", "b"]);
  });

  it("ignores a duplicate add", () => {
    const c = addOffer(addOffer(createComparison(), "a"), "a");
    expect(c.offerIds).toEqual(["a"]);
  });
});

describe("removeOffer", () => {
  const base = addOffer(addOffer(createComparison(), "a"), "b");

  it("reassigns the baseline when the baseline is removed", () => {
    expect(removeOffer(base, "a").baselineId).toBe("b");
  });

  it("clears the baseline when the last offer goes", () => {
    const empty = removeOffer(removeOffer(base, "a"), "b");
    expect(empty.baselineId).toBeNull();
    expect(empty.offerIds).toEqual([]);
  });

  it("falls back to the report when the pinned column is removed", () => {
    const pinned = { ...base, pinnedId: "b" };
    expect(removeOffer(pinned, "b").pinnedId).toBe(REPORT_COLUMN_ID);
  });
});

describe("moveOffer", () => {
  const base = addOffer(addOffer(addOffer(createComparison(), "a"), "b"), "c");

  it("moves a column left", () => {
    expect(moveOffer(base, "c", 0).offerIds).toEqual(["c", "a", "b"]);
  });

  it("moves a column right", () => {
    expect(moveOffer(base, "a", 2).offerIds).toEqual(["b", "c", "a"]);
  });

  it("clamps past either end rather than dropping the column", () => {
    expect(moveOffer(base, "a", -5).offerIds).toEqual(["a", "b", "c"]);
    expect(moveOffer(base, "a", 99).offerIds).toEqual(["b", "c", "a"]);
  });

  it("ignores an unknown id", () => {
    expect(moveOffer(base, "zzz", 0).offerIds).toEqual(["a", "b", "c"]);
  });
});

describe("setBaseline", () => {
  it("refuses an offer the comparison does not hold", () => {
    const c = addOffer(createComparison(), "a");
    expect(setBaseline(c, "b").baselineId).toBe("a");
  });
});

describe("columnOrder", () => {
  it("leads with the report, since that is the answer rather than the input", () => {
    const c = addOffer(addOffer(createComparison(), "a"), "b");
    expect(columnOrder(c)).toEqual([REPORT_COLUMN_ID, "a", "b"]);
  });

  it("keeps the report out of offerIds, since it is not an offer", () => {
    const c = addOffer(createComparison(), "a");
    expect(c.offerIds).not.toContain(REPORT_COLUMN_ID);
  });

  it("still lists the report when there are no offers at all", () => {
    expect(columnOrder(createComparison())).toEqual([REPORT_COLUMN_ID]);
  });
});

describe("clampHorizon", () => {
  it("holds the horizon inside its bounds", () => {
    expect(clampHorizon(0)).toBe(1);
    expect(clampHorizon(99)).toBe(10);
    expect(clampHorizon(4)).toBe(4);
  });

  it("falls back to the default on nonsense", () => {
    expect(clampHorizon("abc")).toBe(DEFAULT_HORIZON_YEARS);
    expect(clampHorizon(undefined)).toBe(DEFAULT_HORIZON_YEARS);
  });
});

describe("normalizeComparison", () => {
  it("repairs a baseline pointing outside the offer list", () => {
    const c = normalizeComparison({ offerIds: ["a", "b"], baselineId: "zzz" });
    expect(c.baselineId).toBe("a");
  });

  it("survives a missing offerIds array", () => {
    expect(normalizeComparison({}).offerIds).toEqual([]);
  });
});

describe("referential integrity", () => {
  it("names the comparisons holding an offer", () => {
    const c1 = addOffer(createComparison({ name: "2026 search" }), "a");
    const c2 = addOffer(createComparison({ name: "old" }), "b");
    expect(comparisonsReferencing([c1, c2], "a").map((c) => c.name)).toEqual(["2026 search"]);
  });

  it("refuses to delete an offer a comparison still points at", () => {
    const offer = createOffer({ name: "Held" });
    const comparison = addOffer(createComparison({ name: "Uses it" }), offer.id);
    const result = deleteOffer([offer], [comparison], offer.id);
    expect(result.ok).toBe(false);
    expect(result.blockedBy).toHaveLength(1);
  });

  it("allows deleting an unreferenced offer", () => {
    const offer = createOffer({ name: "Loose" });
    const result = deleteOffer([offer], [], offer.id);
    expect(result.ok).toBe(true);
    expect(result.offers).toEqual([]);
  });

  it("reports dangling references, which a truncated share link can produce", () => {
    const comparison = addOffer(createComparison(), "ghost");
    expect(danglingOfferIds(comparison, {})).toEqual(["ghost"]);
  });
});

describe("offers", () => {
  it("gives a duplicate a new id, so editing it cannot rewrite the original", () => {
    const original = createOffer({ name: "Northwind", annualSalary: 110000 });
    const copy = duplicateOffer(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.annualSalary).toBe(110000);
    expect(copy.name).toBe("Northwind (copy)");
  });

  it("deep-copies list fields, so editing a duplicate's bonuses leaves the original alone", () => {
    const original = createOffer({
      bonuses: [{ id: "b", label: "Signing", basis: "amount", amount: 10000, recurrence: "oneTime", year: 1 }],
    });
    const copy = duplicateOffer(original);
    copy.bonuses[0].amount = 99999;
    expect(original.bonuses[0].amount).toBe(10000);
  });

  it("replaces rather than appends on upsert", () => {
    const offer = createOffer({ name: "A" });
    const list = upsertOffer([offer], { ...offer, name: "B" });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("B");
  });

  it("indexes by id", () => {
    const a = createOffer({ name: "A" });
    expect(indexById([a])[a.id].name).toBe("A");
  });
});

describe("section auto-expansion", () => {
  const bonusSection = SECTIONS.find((s) => s.id === "bonuses");

  it("finds no data in an untouched section", () => {
    expect(sectionHasData(bonusSection, createOffer())).toBe(false);
  });

  it("finds data once a list field has an entry", () => {
    const offer = createOffer({ bonuses: [{ id: "b", label: "Signing" }] });
    expect(sectionHasData(bonusSection, offer)).toBe(true);
  });

  it("opens a section across every column when any one offer has data", () => {
    const empty = createOffer();
    const filled = createOffer({ bonuses: [{ id: "b", label: "Signing" }] });
    expect(sectionsWithData([empty, filled])).toContain("bonuses");
  });

  it("leaves a section closed when no offer has data", () => {
    expect(sectionsWithData([createOffer(), createOffer()])).not.toContain("bonuses");
  });

  it("always opens the sections marked as such", () => {
    const open = sectionsWithData([createOffer()]);
    for (const section of SECTIONS.filter((s) => s.alwaysOpen)) {
      expect(open, section.id).toContain(section.id);
    }
  });
});

describe("default offer naming", () => {
  it("counts in spreadsheet column letters", () => {
    expect(columnLetters(0)).toBe("A");
    expect(columnLetters(1)).toBe("B");
    expect(columnLetters(25)).toBe("Z");
  });

  it("keeps going past Z rather than repeating a letter", () => {
    expect(columnLetters(26)).toBe("AA");
    expect(columnLetters(27)).toBe("AB");
    expect(columnLetters(51)).toBe("AZ");
    expect(columnLetters(52)).toBe("BA");
  });

  it("follows the seeded pair with C, not 3", () => {
    const seeded = [createOffer({ name: "Offer A" }), createOffer({ name: "Offer B" })];
    expect(nextOfferName(seeded)).toBe("Offer C");
  });

  it("names the first offer A", () => {
    expect(nextOfferName([])).toBe("Offer A");
  });

  it("reuses a freed letter instead of colliding, after a removal", () => {
    // Counting offers would say 1, which is B, which is still present.
    const afterRemovingA = [createOffer({ name: "Offer B" })];
    expect(nextOfferName(afterRemovingA)).toBe("Offer A");
  });

  it("skips letters taken by renamed offers", () => {
    const offers = [createOffer({ name: "Offer A" }), createOffer({ name: "Northwind" })];
    expect(nextOfferName(offers)).toBe("Offer B");
  });

  it("ignores surrounding whitespace when checking what is taken", () => {
    expect(nextOfferName([createOffer({ name: "  Offer A  " })])).toBe("Offer B");
  });
});
