import { describe, it, expect } from "vitest";
import { isLodiProfile, customUtilityLabel } from "../utilityLabel.js";

describe("isLodiProfile", () => {
  it("is true for the default (no profileId) and explicit 'lodi' households", () => {
    expect(isLodiProfile({})).toBe(true);
    expect(isLodiProfile({ profileId: "lodi" })).toBe(true);
  });

  it("is false only for profileId 'custom'", () => {
    expect(isLodiProfile({ profileId: "custom" })).toBe(false);
  });
});

describe("customUtilityLabel", () => {
  it("returns the entered/imported label when present and not the form's own placeholder", () => {
    expect(customUtilityLabel({ customProfileInputs: { label: "Foo Electric" } })).toBe("Foo Electric");
  });

  it("trims whitespace", () => {
    expect(customUtilityLabel({ customProfileInputs: { label: "  Foo Electric  " } })).toBe("Foo Electric");
  });

  it("falls back to 'your utility' for the blank-starting-point placeholder label", () => {
    expect(customUtilityLabel({ customProfileInputs: { label: "Custom Utility" } })).toBe("your utility");
  });

  it("falls back to 'your utility' when the label is empty, whitespace-only, or missing", () => {
    expect(customUtilityLabel({ customProfileInputs: { label: "" } })).toBe("your utility");
    expect(customUtilityLabel({ customProfileInputs: { label: "   " } })).toBe("your utility");
    expect(customUtilityLabel({ customProfileInputs: {} })).toBe("your utility");
    expect(customUtilityLabel({})).toBe("your utility");
  });
});
