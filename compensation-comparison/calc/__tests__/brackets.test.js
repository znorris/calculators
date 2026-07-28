import { describe, it, expect } from "vitest";
import {
  taxFromBrackets,
  marginalRateFromBrackets,
  bracketsFor,
  effectiveRate,
} from "../brackets.js";

const TABLE = [
  { upTo: 12400, rate: 0.1 },
  { upTo: 50400, rate: 0.12 },
  { upTo: 105700, rate: 0.22 },
  { upTo: null, rate: 0.24 },
];

describe("taxFromBrackets", () => {
  it("applies each rate only to the slice of income inside its own band", () => {
    const expected = 12400 * 0.1 + (50400 - 12400) * 0.12 + (100000 - 50400) * 0.22;
    expect(taxFromBrackets(100000, TABLE)).toBeCloseTo(expected, 6);
  });

  it("charges nothing on zero or negative income", () => {
    expect(taxFromBrackets(0, TABLE)).toBe(0);
    expect(taxFromBrackets(-5000, TABLE)).toBe(0);
  });

  it("charges only the first rate below the first threshold", () => {
    expect(taxFromBrackets(10000, TABLE)).toBeCloseTo(1000, 6);
  });

  it("charges exactly the first band at its boundary", () => {
    expect(taxFromBrackets(12400, TABLE)).toBeCloseTo(1240, 6);
  });

  it("extends the open-ended final band without limit", () => {
    const below = taxFromBrackets(105700, TABLE);
    expect(taxFromBrackets(205700, TABLE)).toBeCloseTo(below + 100000 * 0.24, 6);
  });

  it("returns zero for an empty or missing table", () => {
    expect(taxFromBrackets(100000, [])).toBe(0);
    expect(taxFromBrackets(100000, undefined)).toBe(0);
  });
});

describe("marginalRateFromBrackets", () => {
  it("reports the rate the next dollar would be taxed at", () => {
    expect(marginalRateFromBrackets(60000, TABLE)).toBe(0.22);
  });

  it("moves to the next band at a boundary, since the band is exclusive at its top", () => {
    expect(marginalRateFromBrackets(12400, TABLE)).toBe(0.12);
  });

  it("returns the top rate above the last threshold", () => {
    expect(marginalRateFromBrackets(5000000, TABLE)).toBe(0.24);
  });
});

describe("bracketsFor", () => {
  it("falls back to the single table, since some states publish one shared table", () => {
    const table = { single: TABLE };
    expect(bracketsFor(table, "headOfHousehold")).toBe(TABLE);
  });

  it("returns null when there is no table at all", () => {
    expect(bracketsFor(null, "single")).toBeNull();
  });
});

describe("effectiveRate", () => {
  it("guards division by zero income", () => {
    expect(effectiveRate(0, 0)).toBe(0);
  });

  it("is below the marginal rate on progressive income", () => {
    const tax = taxFromBrackets(100000, TABLE);
    expect(effectiveRate(tax, 100000)).toBeLessThan(marginalRateFromBrackets(100000, TABLE));
  });
});
