import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare } from "../urlCodec.js";
import { createOffer } from "../offer.js";
import { createComparison, addOffer } from "../comparison.js";
import { indexById } from "../storage.js";

function fixture() {
  const a = createOffer({
    name: "Northwind",
    annualSalary: 120000,
    state: "CO",
    payFrequency: 24,
    bonuses: [
      { id: "b1", label: "Signing", basis: "amount", amount: 20000, recurrence: "oneTime", year: 1, clawbackYears: 2 },
    ],
  });
  const b = createOffer({ name: "Globex", annualSalary: 135000, state: "CA", payFrequency: 26 });
  const comparison = addOffer(addOffer(createComparison({ name: "2026 search" }), a.id), b.id);
  return { offers: [a, b], offersById: indexById([a, b]), comparison };
}

describe("share codec", () => {
  it("round-trips a comparison and its offers", () => {
    const { comparison, offersById } = fixture();
    const decoded = decodeShare(encodeShare(comparison, offersById));

    expect(decoded.comparison.name).toBe("2026 search");
    expect(decoded.comparison.offerIds).toEqual(comparison.offerIds);
    expect(decoded.offers).toHaveLength(2);
    expect(decoded.offers[0].name).toBe("Northwind");
    expect(decoded.offers[0].annualSalary).toBe(120000);
  });

  it("carries nested list fields intact", () => {
    const { comparison, offersById } = fixture();
    const decoded = decodeShare(encodeShare(comparison, offersById));
    expect(decoded.offers[0].bonuses[0]).toMatchObject({
      label: "Signing",
      amount: 20000,
      recurrence: "oneTime",
      clawbackYears: 2,
    });
  });

  it("preserves comparison-scoped values that are not on any offer", () => {
    const { comparison, offersById } = fixture();
    const withFiling = { ...comparison, filingStatus: "marriedJoint", horizonYears: 7, taxYear: 2026 };
    const decoded = decodeShare(encodeShare(withFiling, offersById));
    expect(decoded.comparison.filingStatus).toBe("marriedJoint");
    expect(decoded.comparison.horizonYears).toBe(7);
  });

  it("inlines the offers, since a recipient has no access to the author's library", () => {
    const { comparison, offersById } = fixture();
    const decoded = decodeShare(encodeShare(comparison, offersById));
    for (const id of decoded.comparison.offerIds) {
      expect(decoded.offers.some((o) => o.id === id)).toBe(true);
    }
  });

  it("carries only the referenced offers, not the whole library", () => {
    const { comparison, offers } = fixture();
    const stranger = createOffer({ name: "Not in this comparison" });
    const decoded = decodeShare(encodeShare(comparison, indexById([...offers, stranger])));
    expect(decoded.offers.map((o) => o.name)).not.toContain("Not in this comparison");
  });

  it("survives a base64url payload containing characters that need escaping", () => {
    const offer = createOffer({ name: "Ünïcode & Sons <\"quoted\">", annualSalary: 1 });
    const comparison = addOffer(createComparison(), offer.id);
    const decoded = decodeShare(encodeShare(comparison, indexById([offer])));
    expect(decoded.offers[0].name).toBe("Ünïcode & Sons <\"quoted\">");
  });

  it("drops references the payload did not carry rather than dangling", () => {
    const { comparison, offers } = fixture();
    // Simulate a link that names two offers but only ships one.
    const partial = encodeShare(comparison, indexById([offers[0]]));
    const decoded = decodeShare(partial);
    expect(decoded.offers).toHaveLength(1);
    expect(decoded.comparison.offerIds).toEqual([offers[0].id]);
    expect(decoded.comparison.baselineId).toBe(offers[0].id);
  });

  it("returns null on garbage rather than throwing, since a link is user input", () => {
    expect(decodeShare("not-base64-at-all!!!")).toBeNull();
    expect(decodeShare("")).toBeNull();
    expect(decodeShare(null)).toBeNull();
  });

  it("returns null on a truncated payload", () => {
    const { comparison, offersById } = fixture();
    const encoded = encodeShare(comparison, offersById);
    expect(decodeShare(encoded.slice(0, Math.floor(encoded.length / 2)))).toBeNull();
  });

  it("refuses a payload from an unknown format version", () => {
    const bad = btoa(JSON.stringify({ v: 999, comparison: {}, offers: [] }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeShare(bad)).toBeNull();
  });
});
