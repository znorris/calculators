import { describe, it, expect } from "vitest";
import { remapShared } from "../importShare.js";
import { encodeShare, decodeShare } from "../urlCodec.js";
import { createOffer } from "../offer.js";
import { createComparison, addOffer, REPORT_COLUMN_ID } from "../comparison.js";
import { indexById } from "../storage.js";

function sharedPayload() {
  const a = createOffer({ name: "Northwind", annualSalary: 120000, state: "CO" });
  const b = createOffer({ name: "Globex", annualSalary: 135000, state: "CA" });
  let comparison = addOffer(addOffer(createComparison({ name: "Their search" }), a.id), b.id);
  comparison = { ...comparison, baselineId: b.id, pinnedId: a.id, filingStatus: "marriedJoint" };
  return decodeShare(encodeShare(comparison, indexById([a, b])));
}

describe("remapShared", () => {
  it("mints a fresh id for every offer, so nothing can collide with what you have", () => {
    const shared = sharedPayload();
    const imported = remapShared(shared);

    const oldIds = new Set(shared.offers.map((o) => o.id));
    for (const offer of imported.offers) expect(oldIds.has(offer.id)).toBe(false);
    expect(new Set(imported.offers.map((o) => o.id)).size).toBe(2);
  });

  it("mints a fresh comparison id too", () => {
    const shared = sharedPayload();
    expect(remapShared(shared).comparison.id).not.toBe(shared.comparison.id);
  });

  it("rewires offerIds to the new ids", () => {
    const imported = remapShared(sharedPayload());
    const present = new Set(imported.offers.map((o) => o.id));
    expect(imported.comparison.offerIds).toHaveLength(2);
    for (const id of imported.comparison.offerIds) expect(present.has(id)).toBe(true);
  });

  it("rewires the baseline to the same offer it pointed at, not just the first", () => {
    const shared = sharedPayload();
    const baselineName = shared.offers.find((o) => o.id === shared.comparison.baselineId).name;
    const imported = remapShared(shared);
    const importedBaseline = imported.offers.find((o) => o.id === imported.comparison.baselineId);
    expect(importedBaseline.name).toBe(baselineName);
    expect(baselineName).toBe("Globex");
  });

  it("carries the values and the comparison-scoped settings across", () => {
    const imported = remapShared(sharedPayload());
    expect(imported.offers.map((o) => o.name).sort()).toEqual(["Globex", "Northwind"]);
    expect(imported.offers.find((o) => o.name === "Northwind").annualSalary).toBe(120000);
    expect(imported.comparison.filingStatus).toBe("marriedJoint");
  });

  it("resets pinning, which is a local viewing preference", () => {
    expect(remapShared(sharedPayload()).comparison.pinnedId).toBe(REPORT_COLUMN_ID);
  });

  it("marks the comparison as imported", () => {
    expect(remapShared(sharedPayload()).comparison.importedAt).toBeGreaterThan(0);
  });

  it("names an unnamed shared comparison rather than leaving it blank", () => {
    const a = createOffer({ name: "X" });
    const comparison = addOffer(createComparison({ name: "" }), a.id);
    const shared = decodeShare(encodeShare(comparison, indexById([a])));
    expect(remapShared(shared).comparison.name).toBe("Shared comparison");
  });

  it("accepts an explicit name", () => {
    expect(remapShared(sharedPayload(), { name: "From Dana" }).comparison.name).toBe("From Dana");
  });

  it("produces different ids each time, so reopening your own link duplicates rather than collides", () => {
    const shared = sharedPayload();
    const first = remapShared(shared);
    const second = remapShared(shared);
    expect(first.comparison.id).not.toBe(second.comparison.id);
    expect(first.offers[0].id).not.toBe(second.offers[0].id);
  });

  it("returns null on a malformed payload rather than throwing", () => {
    expect(remapShared(null)).toBeNull();
    expect(remapShared({})).toBeNull();
    expect(remapShared({ comparison: {}, offers: "nope" })).toBeNull();
  });

  it("drops references the payload did not carry", () => {
    const shared = sharedPayload();
    shared.comparison.offerIds.push("ghost-id");
    const imported = remapShared(shared);
    expect(imported.comparison.offerIds).toHaveLength(2);
  });
});
