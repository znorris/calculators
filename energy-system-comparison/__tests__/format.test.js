// Regression: signedMoney used to emit U+2212 (MINUS SIGN) for negative
// values while money() emits Intl's ASCII hyphen-minus, so adjacent table
// rows built from the two functions showed two different glyphs for the
// same concept. House rule is ASCII hyphen-minus everywhere.

import { describe, it, expect } from "vitest";
import { money, signedMoney } from "../format.js";

describe("format.js minus glyph", () => {
  it("signedMoney uses the ASCII hyphen-minus for negative values, not U+2212", () => {
    const s = signedMoney(-4409);
    expect(s).not.toMatch(/−/);
    expect(s).toBe("-$4,409");
  });

  it("money and signedMoney agree on which minus glyph a negative value gets", () => {
    expect(money(-7086)).toBe("-$7,086");
    expect(signedMoney(-7086)).toBe("-$7,086");
  });

  it("signedMoney still prefixes a positive value with +", () => {
    expect(signedMoney(4409)).toBe("+$4,409");
  });
});
