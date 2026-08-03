import { describe, it, expect } from "vitest";
import { buildResearchPrompt, parseProfileImport, serializeProfile, buildJsonSchema, SCHEMA_FIELDS, FORMAT_VERSION } from "../profileCodec.js";
import { buildCustomProfile, validateProfile } from "../../calc/tariffs/custom.js";

/** Every SCHEMA_FIELDS entry with a fixed set of permitted values -- the same predicate profileCodec.js's own permittedTokensLines/buildJsonSchema apply, rebuilt here (not imported) so this test proves the schema and the prompt actually agree with SCHEMA_FIELDS, rather than merely agreeing with each other via shared code. */
function enumFields() {
  return SCHEMA_FIELDS.filter((f) => (f.type === "string" || f.type === "string[]") && f.enum);
}

/** Walks a JSON Schema object tree by SCHEMA_FIELDS' own dot/"[]" path notation, returning the schema node at that path (or undefined). Independent of profileCodec.js's internal buildJsonSchema helpers -- this test derives its own walker so it isn't just re-running the same code it's meant to check. */
function schemaNodeAtPath(schema, path) {
  let node = schema;
  for (const rawSeg of path.split(".")) {
    if (!node) return undefined;
    const seg = rawSeg.endsWith("[]") ? rawSeg.slice(0, -2) : rawSeg;
    node = node.properties?.[seg];
    if (rawSeg.endsWith("[]")) node = node?.items;
  }
  return node;
}

const VALID_FLAT = {
  formatVersion: 1,
  utilityName: "Example Utility",
  location: "Lodi, CA",
  sources: [
    { section: "pricing", url: "https://example-utility.com/rates" },
    { section: "exportPolicy", url: "https://example-utility.com/net-metering" },
    { section: "constraints", url: "https://example-utility.com/interconnection" },
  ],
  profile: {
    fixedChargePerMonth: 10,
    pricing: { type: "flat-seasonal", summerRate: 0.22, winterRate: 0.18 },
    demand: null,
    adders: [{ id: "eca", label: "Energy Cost Adjustment", mode: "fixed", valuePerKWh: 0.02 }],
    riders: [{ id: "senior", label: "Senior discount", percentOff: 0.1 }],
    exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" },
    constraints: {
      allowedFinancing: ["cash", "loan"],
      interconnectionFees: { singlePhase: 150, threePhase: 400 },
    },
  },
  notes: [],
};

const VALID_TOU = {
  formatVersion: 1,
  utilityName: "TOU Utility",
  location: "Sacramento, CA",
  sources: [
    { section: "pricing", url: "https://tou-utility.com/rates" },
    { section: "exportPolicy", url: "https://tou-utility.com/nem" },
    { section: "constraints", url: "https://tou-utility.com/interconnect" },
  ],
  profile: {
    fixedChargePerMonth: 12,
    // Three periods, together covering every weekday and weekend hour (the
    // finding-5 coverage check ignores excludeHolidays, matching
    // periodsOverlap's own established simplification just above it in
    // profileCodec.js, so on-peak's holiday exclusion doesn't need its own
    // covering period here): on-peak (weekday daytime, holidays excluded),
    // off-peak (every day's night-through-early-morning wraparound), and a
    // third period giving weekend daytime the same off-peak rate on-peak's
    // weekday-only window would otherwise leave uncovered.
    pricing: {
      type: "tou",
      periods: [
        { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [16, 21], days: "weekday", excludeHolidays: true } },
        { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [21, 16], days: "all", excludeHolidays: false } },
        { id: "off-peak-weekend-day", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [16, 21], days: "weekend", excludeHolidays: false } },
      ],
    },
    demand: null,
    adders: [],
    riders: [],
    exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05 },
    constraints: {
      allowedFinancing: ["cash"],
      interconnectionFees: { singlePhase: 100, threePhase: null },
    },
  },
  notes: [{ field: "profile.constraints.interconnectionFees.threePhase", note: "utility has no published three-phase fee" }],
};

describe("buildResearchPrompt", () => {
  it("embeds every schema field path", () => {
    const prompt = buildResearchPrompt({ utilityName: "PG&E", location: "Stockton, CA" });
    for (const field of SCHEMA_FIELDS) {
      expect(prompt).toContain(field.path);
    }
  });

  it("names the utility and location when given", () => {
    const prompt = buildResearchPrompt({ utilityName: "PG&E", location: "Stockton, CA" });
    expect(prompt).toContain("PG&E");
    expect(prompt).toContain("Stockton, CA");
  });

  it("falls back to generic wording with no utility/location given", () => {
    const prompt = buildResearchPrompt({});
    expect(prompt).toContain("the household's electric utility");
  });

  it("instructs the LLM to output only a fenced json block", () => {
    const prompt = buildResearchPrompt({ utilityName: "PG&E", location: "Stockton, CA" });
    expect(prompt).toMatch(/fenced json/i);
    expect(prompt).toContain("```json");
  });

  it("embeds a JSON Schema block that parses as valid JSON and declares draft 2020-12", () => {
    const prompt = buildResearchPrompt({});
    expect(prompt).toContain("JSON SCHEMA");
    const schemaMatch = prompt.match(/JSON SCHEMA[\s\S]*?```json\n([\s\S]*?)\n```/);
    expect(schemaMatch).not.toBeNull();
    const parsed = JSON.parse(schemaMatch[1]);
    expect(parsed.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(parsed.type).toBe("object");
  });

  it("embeds a permitted-tokens section listing every enum field and its exact allowed strings", () => {
    const prompt = buildResearchPrompt({});
    expect(prompt).toContain("PERMITTED TOKENS");
    for (const field of enumFields()) {
      expect(prompt).toContain(field.path);
      for (const value of field.enum) {
        expect(prompt).toContain(`"${value}"`);
      }
    }
  });

  it("warns that any other spelling, casing, or synonym will be rejected by a strict parser", () => {
    const prompt = buildResearchPrompt({});
    expect(prompt).toMatch(/other spelling, casing, or synonym/i);
    expect(prompt).toMatch(/strict parser/i);
  });
});

describe("buildJsonSchema: derived from SCHEMA_FIELDS, not hand-written in parallel with it", () => {
  it("gives every enum field a JSON Schema 'enum' array matching SCHEMA_FIELDS' own list exactly (proving non-drift)", () => {
    const schema = buildJsonSchema();
    for (const field of enumFields()) {
      const node = schemaNodeAtPath(schema, field.path);
      expect(node, `no schema node found at ${field.path}`).toBeTruthy();
      const nodeEnum = field.type === "string[]" ? node.items?.enum : node.enum;
      const expected = field.nullable && field.type === "string" ? [...field.enum, null] : field.enum;
      expect(nodeEnum).toEqual(expected);
    }
  });

  it("marks a nullable field's type as [<base>, \"null\"] rather than a separate proprietary keyword", () => {
    const schema = buildJsonSchema();
    const fixedCharge = schemaNodeAtPath(schema, "profile.fixedChargePerMonth");
    expect(fixedCharge.type).toEqual(["number", "null"]);
  });

  it("marks formatVersion as a const, matching FORMAT_VERSION exactly", () => {
    const schema = buildJsonSchema();
    expect(schema.properties.formatVersion.const).toBe(FORMAT_VERSION);
  });
});

describe("parseProfileImport: happy path", () => {
  it("parses a flat-seasonal profile and returns profile/meta/warnings", () => {
    const result = parseProfileImport(JSON.stringify(VALID_FLAT));
    expect(result.error).toBeUndefined();
    expect(result.profile.pricing).toEqual(VALID_FLAT.profile.pricing);
    expect(result.profile.fixedChargePerMonth).toBe(10);
    expect(result.meta.utilityName).toBe("Example Utility");
    expect(result.meta.sources).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it("keeps TOU periods in JSON-safe descriptor form (no applies() function) -- buildCustomProfile is what materializes real predicates", () => {
    // Architecture: household.customProfileInputs (app state, storage.js,
    // share links, the message posted into worker/calcWorker.js) must stay
    // JSON-safe and cloneable everywhere it travels, so parseProfileImport
    // itself never builds an applies() function -- only
    // calc/tariffs/custom.js's buildCustomProfile does, freshly, each time
    // the engine runs.
    const result = parseProfileImport(JSON.stringify(VALID_TOU));
    expect(result.error).toBeUndefined();
    const periods = result.profile.pricing.periods;
    expect(periods[0].applies).toBeUndefined();
    expect(periods[0].window).toEqual(VALID_TOU.profile.pricing.periods[0].window);
    expect(() => structuredClone(result.profile)).not.toThrow();

    const builtProfile = buildCustomProfile(result.profile);
    expect(typeof builtProfile.schedules[0].pricing.periods[0].applies).toBe("function");
    // VALID_TOU's on-peak/off-peak windows deliberately leave weekend and
    // holiday daytime hours uncovered -- it exists to exercise wraparound-
    // window mechanics (see the next test), not to pass calc/tariffs/
    // profile.js's full-year coverage check, so this only confirms
    // buildCustomProfile produced a real predicate rather than leaving the
    // "missing an applies() predicate" shape error validateProfile would
    // otherwise report.
    expect(validateProfile(builtProfile).some((e) => /applies\(\) predicate/.test(e))).toBe(false);
  });

  it("evaluates a built TOU applies() function correctly across a wraparound window", () => {
    const result = parseProfileImport(JSON.stringify(VALID_TOU));
    const builtProfile = buildCustomProfile(result.profile);
    const [onPeak, offPeak] = builtProfile.schedules[0].pricing.periods;

    // on-peak: weekday 16:00-21:00, holidays excluded
    expect(onPeak.applies({ hourOfDay: 17, isWeekend: false, isHoliday: false })).toBe(true);
    expect(onPeak.applies({ hourOfDay: 21, isWeekend: false, isHoliday: false })).toBe(false);
    expect(onPeak.applies({ hourOfDay: 17, isWeekend: true, isHoliday: false })).toBe(false);
    expect(onPeak.applies({ hourOfDay: 17, isWeekend: false, isHoliday: true })).toBe(false);

    // off-peak: all days, 21:00-16:00 (wraps past midnight)
    expect(offPeak.applies({ hourOfDay: 23, isWeekend: false, isHoliday: false })).toBe(true);
    expect(offPeak.applies({ hourOfDay: 2, isWeekend: true, isHoliday: false })).toBe(true);
    expect(offPeak.applies({ hourOfDay: 18, isWeekend: false, isHoliday: false })).toBe(false);
  });

  it("surfaces a null field with its note as a warning, not an error", () => {
    const result = parseProfileImport(JSON.stringify(VALID_TOU));
    expect(result.error).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("interconnectionFees.threePhase") && w.includes("three-phase fee"))).toBe(true);
  });

  it("warns when no sources were cited", () => {
    const noSources = { ...VALID_FLAT, sources: [] };
    const result = parseProfileImport(JSON.stringify(noSources));
    expect(result.error).toBeUndefined();
    expect(result.warnings.some((w) => /no sources/i.test(w))).toBe(true);
  });

  it("fills avoidedCostCredit ledger defaults the manual custom-profile builder also uses", () => {
    const result = parseProfileImport(JSON.stringify(VALID_TOU));
    expect(result.profile.exportPolicy).toMatchObject({ addersApply: false, carryForward: true, cashOut: false });
  });
});

describe("parseProfileImport: warnings branch on pricing.type/exportPolicy.type (finding 3)", () => {
  // The research prompt tells the LLM to fill exactly one pricing structure
  // and "leave the other two pricing fields null" (and, symmetrically, only
  // the export fields its chosen exportPolicy.type uses); a fully-verified,
  // fully-compliant answer of any type therefore always carries some
  // required-null fields that are not verification gaps. Each fixture below
  // sets every one of those non-applicable fields to null explicitly (not
  // omitted, since an LLM told to "leave a field null" states it, it doesn't
  // drop the key) -- before this fix, buildWarnings flagged every one of them.
  const SOURCES = [{ section: "pricing", url: "https://example.com/rates" }];
  const FEES = { singlePhase: 100, threePhase: 400 };
  const CONSTRAINTS = { allowedFinancing: ["cash", "loan"], interconnectionFees: FEES };

  it("tou + avoidedCostCredit: a fully-specified compliant import produces zero warnings", () => {
    const imported = {
      formatVersion: 1,
      utilityName: "TOU Utility",
      location: "Sacramento, CA",
      sources: SOURCES,
      profile: {
        fixedChargePerMonth: 12,
        pricing: {
          type: "tou",
          summerRate: null,
          winterRate: null,
          rates: null,
          breakpoints: { summer: null, winter: null },
          periods: [
            { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [16, 21], days: "weekday", excludeHolidays: true } },
            { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [21, 16], days: "all", excludeHolidays: false } },
            // Covers weekend daytime hours on-peak's weekday-only window
            // otherwise leaves uncovered -- see VALID_TOU's identical fixture
            // above for the same reasoning.
            { id: "off-peak-weekend-day", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [16, 21], days: "weekend", excludeHolidays: false } },
          ],
        },
        demand: null,
        adders: [],
        riders: [],
        exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.05, netting: null, exportRate: null },
        constraints: CONSTRAINTS,
      },
      notes: [],
    };
    const result = parseProfileImport(JSON.stringify(imported));
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("flat-seasonal + avoidedCostCredit: a fully-specified compliant import produces zero warnings", () => {
    const imported = {
      formatVersion: 1,
      utilityName: "Flat Utility",
      location: "Fresno, CA",
      sources: SOURCES,
      profile: {
        fixedChargePerMonth: 9,
        pricing: { type: "flat-seasonal", summerRate: 0.22, winterRate: 0.18, rates: null, breakpoints: null, periods: null },
        demand: null,
        adders: [],
        riders: [],
        exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.04, netting: null, exportRate: null },
        constraints: CONSTRAINTS,
      },
      notes: [],
    };
    const result = parseProfileImport(JSON.stringify(imported));
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("tiered + netMetering: a fully-specified compliant import produces zero warnings", () => {
    const imported = {
      formatVersion: 1,
      utilityName: "Tiered Utility",
      location: "Modesto, CA",
      sources: SOURCES,
      profile: {
        fixedChargePerMonth: 11,
        pricing: {
          type: "tiered",
          summerRate: null,
          winterRate: null,
          periods: null,
          rates: [0.1, 0.15, 0.2],
          breakpoints: { summer: [300, 600], winter: [400, 800] },
        },
        demand: null,
        adders: [],
        riders: [],
        exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail", ratePerKWh: null },
        constraints: CONSTRAINTS,
      },
      notes: [],
    };
    const result = parseProfileImport(JSON.stringify(imported));
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });
});

describe("round-trip: serializeProfile -> parseProfileImport", () => {
  it("round-trips a flat-seasonal profile", () => {
    const first = parseProfileImport(JSON.stringify(VALID_FLAT));
    const text = serializeProfile({ ...first.meta, profile: first.profile });
    const second = parseProfileImport(text);

    expect(second.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(second.profile))).toEqual(JSON.parse(JSON.stringify(first.profile)));
    expect(second.meta).toEqual(first.meta);
  });

  it("round-trips a TOU profile, preserving windows (parseProfileImport never attaches an applies() function to strip)", () => {
    const first = parseProfileImport(JSON.stringify(VALID_TOU));
    const text = serializeProfile({ ...first.meta, profile: first.profile });
    const second = parseProfileImport(text);

    expect(second.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(second.profile))).toEqual(JSON.parse(JSON.stringify(first.profile)));
  });

  it("serializes a bare customProfileInputs-shaped profile (no wrapper meta) for the 'Copy my profile as JSON' button", () => {
    const first = parseProfileImport(JSON.stringify(VALID_FLAT));
    const text = serializeProfile(first.profile);
    const parsed = JSON.parse(text);
    expect(parsed.formatVersion).toBe(FORMAT_VERSION);
    expect(parsed.utilityName).toBe(first.profile.label);
    expect(parsed.profile.pricing).toEqual(VALID_FLAT.profile.pricing);
  });

  // Regression (finding 1): serializeProfile used to write profile.exportPolicy
  // straight through in its CANONICAL ({kind, ...}) shape rather than converting
  // it back to the wire format (kind + kind-gated sibling fields) buildExportPolicy
  // expects on the way back in, and omitted minimumBillPerMonth/systemSizeCharges
  // from its output entirely. Fails before this fix (parseProfileImport of the
  // re-serialized text errors, or silently drops fields), passes after: a full
  // parse -> serialize -> parse round trip reproduces the identical canonical
  // profile for every ExportRate kind and every new field.
  describe("serializeProfile round-trips every ExportRate kind and every new field (finding 1)", () => {
    function roundTrip(imported) {
      const first = parseProfileImport(JSON.stringify(imported));
      expect(first.error).toBeUndefined();
      const text = serializeProfile({ ...first.meta, profile: first.profile });
      const second = parseProfileImport(text);
      expect(second.error).toBeUndefined();
      expect(JSON.parse(JSON.stringify(second.profile))).toEqual(JSON.parse(JSON.stringify(first.profile)));
      return second.profile;
    }

    it("avoidedCostCredit ratePerKWh: flat number", () => {
      roundTrip({ ...VALID_FLAT, profile: { ...VALID_FLAT.profile, exportPolicy: { type: "avoidedCostCredit", ratePerKWh: 0.055 } } });
    });

    it("avoidedCostCredit ratePerKWh: monthlyTable", () => {
      const monthlyValues = [0.05, 0.05, 0.06, 0.06, 0.07, 0.08, 0.09, 0.09, 0.08, 0.07, 0.06, 0.05];
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: { ...VALID_FLAT.profile, exportPolicy: { type: "avoidedCostCredit", ratePerKWhKind: "monthlyTable", ratePerKWhMonthlyValues: monthlyValues } },
      });
      expect(profile.exportPolicy.ratePerKWh).toEqual({ kind: "monthlyTable", monthlyValues });
    });

    it("avoidedCostCredit ratePerKWh: timeTable", () => {
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: {
          ...VALID_FLAT.profile,
          exportPolicy: {
            type: "avoidedCostCredit",
            ratePerKWhKind: "timeTable",
            ratePerKWhPeriods: [
              { id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20], days: "all", excludeHolidays: false } },
              { id: "off-peak", rate: { summer: 0.1, winter: 0.08 }, window: { hours: [20, 16], days: "all", excludeHolidays: false } },
            ],
          },
        },
      });
      expect(profile.exportPolicy.ratePerKWh.kind).toBe("timeTable");
      expect(profile.exportPolicy.ratePerKWh.periods).toHaveLength(2);
    });

    it("netMetering exportRate: 'retail'", () => {
      roundTrip({ ...VALID_FLAT, profile: { ...VALID_FLAT.profile, exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail" } } });
    });

    it("netMetering exportRate: percentOfRetail", () => {
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: {
          ...VALID_FLAT.profile,
          exportPolicy: { type: "netMetering", netting: "hourly", exportRateKind: "percentOfRetail", exportRateFraction: 0.85 },
        },
      });
      expect(profile.exportPolicy.exportRate).toEqual({ kind: "percentOfRetail", fraction: 0.85 });
    });

    it("netMetering trueUp: cashOut", () => {
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: {
          ...VALID_FLAT.profile,
          exportPolicy: { type: "netMetering", netting: "annual", exportRate: 0.04, trueUpKind: "cashOut", trueUpRate: 0.03 },
        },
      });
      expect(profile.exportPolicy.trueUp).toEqual({ rate: 0.03 });
    });

    it("netMetering trueUp: forfeit", () => {
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: { ...VALID_FLAT.profile, exportPolicy: { type: "netMetering", netting: "annual", exportRate: 0.04, trueUpKind: "forfeit" } },
      });
      expect(profile.exportPolicy.trueUp).toBe("forfeit");
    });

    it("lockYears, minimumBillPerMonth, and systemSizeCharges", () => {
      const profile = roundTrip({
        ...VALID_FLAT,
        profile: {
          ...VALID_FLAT.profile,
          minimumBillPerMonth: 25,
          systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 3 }, { basis: "kWh-battery", ratePerMonth: 1.5 }],
          exportPolicy: { type: "netMetering", netting: "hourly", exportRate: 0.06, lockYears: 10 },
        },
      });
      expect(profile.minimumBillPerMonth).toBe(25);
      expect(profile.systemSizeCharges).toEqual([{ basis: "kW-DC-solar", ratePerMonth: 3 }, { basis: "kWh-battery", ratePerMonth: 1.5 }]);
      expect(profile.exportPolicy.lockYears).toBe(10);
    });

    it("a profile with none of the optional fields set (no lockYears, no systemSizeCharges, no minimumBillPerMonth) round-trips back to the same absent state, not an explicit 0/[]", () => {
      const profile = roundTrip(VALID_FLAT);
      expect(profile.minimumBillPerMonth).toBeUndefined();
      expect(profile.systemSizeCharges).toBeUndefined();
      expect(profile.exportPolicy.lockYears).toBeUndefined();
    });

    // The Ameren Illinois / ComEd supply/delivery split pattern this file's
    // own research-prompt guidance (SUPPLY/DELIVERY SPLIT UTILITIES, above)
    // tells the LLM to encode as a monthlyTable adder -- an end-to-end
    // fixture combining a monthlyTable adder, a TOU delivery schedule, a
    // percentOfRetail export rate, and minimumBillPerMonth/systemSizeCharges
    // together, rather than one field in isolation the way the tests above
    // each exercise. No lockYears here: finding 4 makes lockYears + a
    // percentOfRetail export rate a validation error (both track the
    // schedule's own retail rate by construction), and lockYears' own
    // round-trip is already covered above against a numeric export rate.
    it("an Ameren-style profile (TOU delivery + a monthlyTable 'supply' adder + percentOfRetail export + minimumBillPerMonth/systemSizeCharges together)", () => {
      const amerenStyle = {
        formatVersion: 1,
        utilityName: "Ameren Illinois",
        location: "Peoria, IL",
        sources: [{ section: "pricing", url: "https://amerenillinois.com/rates" }],
        profile: {
          fixedChargePerMonth: 10.5,
          pricing: {
            type: "tou",
            periods: [
              { id: "on-peak", rate: { summer: 0.09, winter: 0.07 }, window: { hours: [14, 19], days: "weekday", excludeHolidays: false } },
              { id: "off-peak", rate: { summer: 0.04, winter: 0.03 }, window: { hours: [19, 14], days: "all", excludeHolidays: false } },
              { id: "off-peak-weekend-day", rate: { summer: 0.04, winter: 0.03 }, window: { hours: [14, 19], days: "weekend", excludeHolidays: false } },
            ],
          },
          demand: null,
          minimumBillPerMonth: 15,
          systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 1.25 }],
          adders: [
            { id: "supply", label: "Purchased Electricity Adjustment", mode: "monthlyTable", monthlyValues: [0.062, 0.061, 0.059, 0.058, 0.06, 0.065, 0.071, 0.072, 0.068, 0.063, 0.06, 0.061] },
          ],
          riders: [],
          exportPolicy: { type: "netMetering", netting: "hourly", exportRateKind: "percentOfRetail", exportRateFraction: 1 },
          constraints: { allowedFinancing: ["cash", "loan"], interconnectionFees: { singlePhase: 100, threePhase: 350 } },
        },
        notes: [],
      };

      const profile = roundTrip(amerenStyle);
      expect(profile.adders).toEqual([
        { id: "supply", label: "Purchased Electricity Adjustment", mode: "monthlyTable", monthlyValues: amerenStyle.profile.adders[0].monthlyValues },
      ]);
      expect(profile.exportPolicy).toEqual({
        type: "netMetering",
        netting: "hourly",
        exportRate: { kind: "percentOfRetail", fraction: 1 },
      });
      expect(profile.minimumBillPerMonth).toBe(15);
      expect(profile.systemSizeCharges).toEqual([{ basis: "kW-DC-solar", ratePerMonth: 1.25 }]);

      // The built profile bills end to end with no error, the same
      // "structurally sound, not just field-identical" bar runEngine.test.js's
      // own custom-profile end-to-end tests hold every imported profile to.
      const built = buildCustomProfile(profile);
      expect(validateProfile(built)).toEqual([]);
    });
  });
});

describe("parseProfileImport: a wrong enum token's error message quotes the exact permitted list, so a failed import is self-correcting when pasted back to the LLM", () => {
  function withPricing(pricing) {
    return { ...VALID_FLAT, profile: { ...VALID_FLAT.profile, pricing } };
  }

  it("pricing.type: a near-miss (underscore instead of hyphen) names the bad value and every permitted token", () => {
    const result = parseProfileImport(JSON.stringify(withPricing({ type: "flat_seasonal", summerRate: 0.2, winterRate: 0.18 })));
    expect(result.error).toContain('profile.pricing.type "flat_seasonal" is not permitted');
    expect(result.error).toContain('"tiered"');
    expect(result.error).toContain('"flat-seasonal"');
    expect(result.error).toContain('"tou"');
  });

  it("exportPolicy.type: wrong casing names the bad value and every permitted token", () => {
    const bad = { ...VALID_FLAT, profile: { ...VALID_FLAT.profile, exportPolicy: { type: "netmetering" } } };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('profile.exportPolicy.type "netmetering" is not permitted');
    expect(result.error).toContain('"netMetering"');
    expect(result.error).toContain('"avoidedCostCredit"');
  });

  it("exportPolicy.netting: an invalid value names the bad value, every permitted token, and null", () => {
    const bad = {
      ...VALID_FLAT,
      profile: { ...VALID_FLAT.profile, exportPolicy: { type: "netMetering", netting: "monthly", exportRate: "retail" } },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('profile.exportPolicy.netting "monthly" is not permitted');
    expect(result.error).toContain('"hourly"');
    expect(result.error).toContain('"annual"');
    expect(result.error).toContain("or null");
  });

  it("window.days: wrong casing names the bad value and every permitted token, without repeating the field path twice", () => {
    const bad = withPricing({
      type: "tou",
      periods: [{ id: "on-peak", rate: { summer: 0.3, winter: 0.2 }, window: { hours: [16, 21], days: "Weekday" } }],
    });
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('window.days "Weekday" is not permitted');
    expect(result.error).toContain('"all"');
    expect(result.error).toContain('"weekday"');
    expect(result.error).toContain('"weekend"');
  });

  it("adders[].mode: wrong casing names the bad value and every permitted token, without repeating the field path twice", () => {
    const bad = {
      ...VALID_FLAT,
      profile: { ...VALID_FLAT.profile, adders: [{ id: "a1", label: "Some Adder", mode: "Fixed" }] },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('mode "Fixed" is not permitted');
    expect(result.error).toContain('"fixed"');
    expect(result.error).toContain('"monthlyTable"');
  });

  it("constraints.allowedFinancing: an unpermitted token names the offending array and every permitted token", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        constraints: { allowedFinancing: ["Cash"], interconnectionFees: { singlePhase: 100, threePhase: 200 } },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('profile.constraints.allowedFinancing must be a non-empty array containing only values from "cash", "loan"');
    expect(result.error).toContain('["Cash"]');
  });
});

describe("parseProfileImport: hostile inputs", () => {
  it("rejects text with no JSON object at all", () => {
    const result = parseProfileImport("Sorry, I could not find this utility's rate schedule.");
    expect(result.error).toBeDefined();
    expect(result.profile).toBeUndefined();
  });

  it("rejects a bare JSON array with no object", () => {
    const result = parseProfileImport("[1, 2, 3]");
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/no json object/i);
  });

  it("rejects an unsupported formatVersion", () => {
    const result = parseProfileImport(JSON.stringify({ ...VALID_FLAT, formatVersion: 2 }));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/formatVersion/);
  });

  it("rejects a negative rate", () => {
    const bad = { ...VALID_FLAT, profile: { ...VALID_FLAT.profile, pricing: { type: "flat-seasonal", summerRate: -0.05, winterRate: 0.18 } } };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/summerRate/);
    expect(result.error).toMatch(/non-negative/);
  });

  it("rejects overlapping TOU windows", () => {
    const bad = {
      ...VALID_TOU,
      profile: {
        ...VALID_TOU.profile,
        pricing: {
          type: "tou",
          periods: [
            { id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [14, 20], days: "weekday" } },
            { id: "afternoon", rate: { summer: 0.3, winter: 0.2 }, window: { hours: [16, 22], days: "weekday" } },
          ],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/overlap/);
  });

  it("does not flag non-overlapping TOU windows on disjoint day types", () => {
    const ok = {
      ...VALID_TOU,
      profile: {
        ...VALID_TOU.profile,
        pricing: {
          type: "tou",
          periods: [
            { id: "weekday-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [14, 20], days: "weekday" } },
            { id: "weekend-peak", rate: { summer: 0.3, winter: 0.2 }, window: { hours: [14, 20], days: "weekend" } },
            // Covers the complementary hours on every day, so this fixture has
            // full coverage and isn't rejected by the finding-5 coverage check
            // this test isn't exercising.
            { id: "off-peak", rate: { summer: 0.15, winter: 0.12 }, window: { hours: [20, 14], days: "all" } },
          ],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(ok));
    expect(result.error).toBeUndefined();
  });

  // Regression (finding 5): a real hour reaching this gap throws deep inside
  // calc/billing.js at simulation time ("no TOU period ... matches hour N"),
  // long after import -- naming no field the user could go back and fix.
  // Fails before this check existed (no error at import time), passes after.
  it("rejects TOU periods that leave an hour uncovered", () => {
    const bad = {
      ...VALID_TOU,
      profile: {
        ...VALID_TOU.profile,
        pricing: {
          type: "tou",
          periods: [{ id: "on-peak", rate: { summer: 0.4, winter: 0.3 }, window: { hours: [16, 21], days: "all" } }],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/coverage gap/);
  });

  it("rejects ExportRate timeTable periods that leave an hour uncovered, the same way TOU pricing periods are (they share validatePeriodsList)", () => {
    const bad = {
      ...VALID_TOU,
      profile: {
        ...VALID_TOU.profile,
        exportPolicy: {
          type: "netMetering",
          netting: "hourly",
          exportRateKind: "timeTable",
          exportRatePeriods: [{ id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20], days: "all" } }],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/coverage gap/);
  });

  it("does not run the coverage check when a period already has its own shape error", () => {
    const bad = {
      ...VALID_TOU,
      profile: {
        ...VALID_TOU.profile,
        pricing: {
          type: "tou",
          periods: [{ id: "on-peak", rate: { summer: 0.4, winter: 0.3 } }], // no window at all
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/must have a window/);
    expect(result.error).not.toMatch(/coverage gap/);
  });

  it("rejects a profile missing a required section", () => {
    const bad = { ...VALID_FLAT, profile: { ...VALID_FLAT.profile } };
    delete bad.profile.exportPolicy;
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/exportPolicy/);
  });

  it("rejects a 10 MB string without throwing or hanging", () => {
    const huge = "x".repeat(10 * 1024 * 1024);
    const result = parseProfileImport(huge);
    expect(result.error).toBeDefined();
    expect(result.profile).toBeUndefined();
  });

  it("never throws on any of the hostile inputs above", () => {
    const inputs = [
      null,
      undefined,
      42,
      "",
      "not json at all",
      "[1,2,3]",
      "{ broken json",
      JSON.stringify({ formatVersion: 99 }),
      "x".repeat(3_000_000),
    ];
    for (const input of inputs) {
      expect(() => parseProfileImport(input)).not.toThrow();
    }
  });
});

describe("parseProfileImport: fence extraction from chatty LLM text", () => {
  it("extracts JSON from a fenced block preceded and followed by prose", () => {
    const chatty = `Here is what I found for this utility, based on their published rate schedule.

I could not verify every field, but here is my best answer:

\`\`\`json
${JSON.stringify(VALID_FLAT, null, 2)}
\`\`\`

Let me know if you need anything else!`;

    const result = parseProfileImport(chatty);
    expect(result.error).toBeUndefined();
    expect(result.meta.utilityName).toBe("Example Utility");
  });

  it("extracts JSON from a fence with no language tag", () => {
    const chatty = "Sure, here you go:\n```\n" + JSON.stringify(VALID_FLAT) + "\n```";
    const result = parseProfileImport(chatty);
    expect(result.error).toBeUndefined();
  });

  it("extracts a bare JSON object with no fences and no prose", () => {
    const result = parseProfileImport(JSON.stringify(VALID_FLAT));
    expect(result.error).toBeUndefined();
  });

  it("finds the JSON object even with a brace inside a quoted string beforehand", () => {
    const chatty = `Note: some utilities publish rates like "{not real json}" in prose.\n\`\`\`json\n${JSON.stringify(VALID_FLAT)}\n\`\`\``;
    const result = parseProfileImport(chatty);
    expect(result.error).toBeUndefined();
  });
});

describe("parseProfileImport: all-units-blocks pricing", () => {
  function withBlocks(blocks) {
    return {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        pricing: { type: "all-units-blocks", blocks },
      },
    };
  }

  it("parses a valid seasonal all-units-blocks pricing and round-trips it into buildCustomProfile", () => {
    const blocks = {
      summer: [
        { upToKWh: 500, rate: 0.15 },
        { upToKWh: 1000, rate: 0.25 },
        { upToKWh: null, rate: 0.35 },
      ],
      winter: [
        { upToKWh: 600, rate: 0.12 },
        { upToKWh: null, rate: 0.2 },
      ],
    };
    const result = parseProfileImport(JSON.stringify(withBlocks(blocks)));
    expect(result.error).toBeUndefined();
    expect(result.profile.pricing).toEqual({ type: "all-units-blocks", blocks });
    expect(validateProfile(buildCustomProfile(result.profile))).toEqual([]);
  });

  it("rejects a last block whose upToKWh isn't null", () => {
    const result = parseProfileImport(
      JSON.stringify(
        withBlocks({
          summer: [{ upToKWh: 500, rate: 0.15 }],
          winter: [{ upToKWh: 500, rate: 0.15 }],
        }),
      ),
    );
    expect(result.error).toContain("last block must have upToKWh null");
  });

  it("rejects a non-ascending upToKWh sequence", () => {
    const result = parseProfileImport(
      JSON.stringify(
        withBlocks({
          summer: [
            { upToKWh: 500, rate: 0.15 },
            { upToKWh: 400, rate: 0.25 },
            { upToKWh: null, rate: 0.35 },
          ],
          winter: [{ upToKWh: null, rate: 0.2 }],
        }),
      ),
    );
    expect(result.error).toContain("upToKWh values must be strictly ascending");
  });

  it("rejects a negative block rate", () => {
    const result = parseProfileImport(
      JSON.stringify(
        withBlocks({
          summer: [{ upToKWh: null, rate: -0.1 }],
          winter: [{ upToKWh: null, rate: 0.1 }],
        }),
      ),
    );
    expect(result.error).toContain("rate must be a non-negative number");
  });
});

describe("parseProfileImport: minimumBillPerMonth and systemSizeCharges", () => {
  it("parses and carries both through to buildCustomProfile's schedule", () => {
    const withCharges = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        minimumBillPerMonth: 20,
        systemSizeCharges: [{ basis: "kW-DC-solar", ratePerMonth: 3 }],
      },
    };
    const result = parseProfileImport(JSON.stringify(withCharges));
    expect(result.error).toBeUndefined();
    expect(result.profile.minimumBillPerMonth).toBe(20);
    expect(result.profile.systemSizeCharges).toEqual([{ basis: "kW-DC-solar", ratePerMonth: 3 }]);
    const built = buildCustomProfile(result.profile);
    expect(built.schedules[0].minimumBillPerMonth).toBe(20);
    expect(built.schedules[0].systemSizeCharges).toEqual([{ basis: "kW-DC-solar", ratePerMonth: 3 }]);
  });

  it("omits both from the built profile when absent (backward-compatible with an older import)", () => {
    const result = parseProfileImport(JSON.stringify(VALID_FLAT));
    expect(result.error).toBeUndefined();
    expect(result.profile.minimumBillPerMonth).toBeUndefined();
    expect(result.profile.systemSizeCharges).toBeUndefined();
  });

  it("rejects an unpermitted systemSizeCharges basis, naming every permitted token", () => {
    const bad = {
      ...VALID_FLAT,
      profile: { ...VALID_FLAT.profile, systemSizeCharges: [{ basis: "kW-solar-panels", ratePerMonth: 3 }] },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain('basis "kW-solar-panels" is not permitted');
    expect(result.error).toContain('"kW-DC-solar"');
    expect(result.error).toContain('"kWh-battery"');
  });
});

describe("parseProfileImport: export-rate kinds (monthlyTable, timeTable, percentOfRetail), lockYears, trueUp", () => {
  it("parses avoidedCostCredit ratePerKWhKind monthlyTable into the canonical {kind:'monthlyTable'} ExportRate", () => {
    const monthlyValues = [0.05, 0.05, 0.06, 0.06, 0.07, 0.08, 0.09, 0.09, 0.08, 0.07, 0.06, 0.05];
    const withMonthly = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "avoidedCostCredit", ratePerKWhKind: "monthlyTable", ratePerKWhMonthlyValues: monthlyValues },
      },
    };
    const result = parseProfileImport(JSON.stringify(withMonthly));
    expect(result.error).toBeUndefined();
    expect(result.profile.exportPolicy.ratePerKWh).toEqual({ kind: "monthlyTable", monthlyValues });
    expect(validateProfile(buildCustomProfile(result.profile))).toEqual([]);
  });

  it("parses netMetering exportRateKind monthlyTable into the canonical {kind:'monthlyTable'} ExportRate", () => {
    const monthlyValues = new Array(12).fill(0.081);
    const withMonthly = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "annual", exportRateKind: "monthlyTable", exportRateMonthlyValues: monthlyValues },
      },
    };
    const result = parseProfileImport(JSON.stringify(withMonthly));
    expect(result.error).toBeUndefined();
    expect(result.profile.exportPolicy.exportRate).toEqual({ kind: "monthlyTable", monthlyValues });
  });

  it("rejects a monthlyTable kind whose monthlyValues isn't exactly 12 entries", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "avoidedCostCredit", ratePerKWhKind: "monthlyTable", ratePerKWhMonthlyValues: [0.05, 0.06] },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain("ratePerKWhMonthlyValues must be an array of 12 non-negative numbers");
  });

  it("parses netMetering exportRateKind timeTable into materializable periods, preserving overlap validation", () => {
    const withTimeTable = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: {
          type: "netMetering",
          netting: "hourly",
          exportRateKind: "timeTable",
          exportRatePeriods: [
            { id: "on-peak", rate: { summer: 0.3, winter: 0.25 }, window: { hours: [16, 20], days: "all", excludeHolidays: false } },
            { id: "off-peak", rate: { summer: 0.1, winter: 0.08 }, window: { hours: [20, 16], days: "all", excludeHolidays: false } },
          ],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(withTimeTable));
    expect(result.error).toBeUndefined();
    expect(result.profile.exportPolicy.exportRate.kind).toBe("timeTable");
    expect(result.profile.exportPolicy.exportRate.periods).toHaveLength(2);
    const built = buildCustomProfile(result.profile);
    expect(typeof built.exportPolicy.exportRate.periods[0].applies).toBe("function");
    expect(validateProfile(built)).toEqual([]);
  });

  it("rejects overlapping timeTable periods the same way pricing.periods overlap is rejected", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: {
          type: "netMetering",
          netting: "hourly",
          exportRateKind: "timeTable",
          exportRatePeriods: [
            { id: "a", rate: { summer: 0.3, winter: 0.25 }, window: { hours: [0, 12], days: "all", excludeHolidays: false } },
            { id: "b", rate: { summer: 0.1, winter: 0.08 }, window: { hours: [6, 18], days: "all", excludeHolidays: false } },
          ],
        },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain("overlap");
  });

  it("parses percentOfRetail only when netting is hourly, and rejects it under annual netting", () => {
    const ok = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "hourly", exportRateKind: "percentOfRetail", exportRateFraction: 0.85 },
      },
    };
    const okResult = parseProfileImport(JSON.stringify(ok));
    expect(okResult.error).toBeUndefined();
    expect(okResult.profile.exportPolicy.exportRate).toEqual({ kind: "percentOfRetail", fraction: 0.85 });

    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "annual", exportRateKind: "percentOfRetail", exportRateFraction: 0.85 },
      },
    };
    const badResult = parseProfileImport(JSON.stringify(bad));
    expect(badResult.error).toContain('percentOfRetail" is only valid with netting "hourly"');
  });

  it("rejects an exportRateFraction outside (0, 1]", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "hourly", exportRateKind: "percentOfRetail", exportRateFraction: 1.5 },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain("exportRateFraction must be a fraction between 0 (exclusive) and 1 (inclusive)");
  });

  it("parses a positive integer lockYears and rejects a non-integer or non-positive one", () => {
    // A numeric exportRate rather than VALID_FLAT's own "retail" default:
    // lockYears combined with "retail" is its own rejection below (finding
    // 4), so this fixture uses a rate lockYears can actually apply to.
    const numericExportRate = { type: "netMetering", netting: "annual", exportRate: 0.08 };
    const ok = { ...VALID_FLAT, profile: { ...VALID_FLAT.profile, exportPolicy: { ...numericExportRate, lockYears: 5 } } };
    const okResult = parseProfileImport(JSON.stringify(ok));
    expect(okResult.error).toBeUndefined();
    expect(okResult.profile.exportPolicy.lockYears).toBe(5);

    const bad = { ...VALID_FLAT, profile: { ...VALID_FLAT.profile, exportPolicy: { ...numericExportRate, lockYears: 0 } } };
    expect(parseProfileImport(JSON.stringify(bad)).error).toContain("lockYears must be a positive integer");
  });

  // Regression (finding 4): the import-time mirror of
  // calc/tariffs/profile.js's validateExportPolicy check -- "retail" and
  // percentOfRetail already track the schedule's own retail rate as it
  // escalates, so lockYears has no fixed dollar figure to freeze. Fails
  // before this fix (no error; VALID_FLAT's own default exportRate is
  // "retail" with no explicit exportRateKind), passes after.
  it("rejects lockYears combined with an implicit or explicit 'retail' exportRate", () => {
    // VALID_FLAT.profile.exportPolicy is netMetering/exportRate:"retail" with
    // no exportRateKind set -- the implicit-default case.
    const implicitRetail = {
      ...VALID_FLAT,
      profile: { ...VALID_FLAT.profile, exportPolicy: { ...VALID_FLAT.profile.exportPolicy, lockYears: 5 } },
    };
    expect(parseProfileImport(JSON.stringify(implicitRetail)).error).toContain("lockYears has no effect");

    const explicitRetail = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "annual", exportRateKind: "retail", exportRate: "retail", lockYears: 5 },
      },
    };
    expect(parseProfileImport(JSON.stringify(explicitRetail)).error).toContain("lockYears has no effect");
  });

  it("rejects lockYears combined with percentOfRetail", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: {
          type: "netMetering",
          netting: "hourly",
          exportRateKind: "percentOfRetail",
          exportRateFraction: 0.85,
          lockYears: 5,
        },
      },
    };
    expect(parseProfileImport(JSON.stringify(bad)).error).toContain("lockYears has no effect");
  });

  it("parses trueUpKind cashOut into {rate}, and forfeit into the string 'forfeit'", () => {
    const cashOut = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail", trueUpKind: "cashOut", trueUpRate: 0.04 },
      },
    };
    const cashOutResult = parseProfileImport(JSON.stringify(cashOut));
    expect(cashOutResult.error).toBeUndefined();
    expect(cashOutResult.profile.exportPolicy.trueUp).toEqual({ rate: 0.04 });

    const forfeit = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "annual", exportRate: "retail", trueUpKind: "forfeit" },
      },
    };
    const forfeitResult = parseProfileImport(JSON.stringify(forfeit));
    expect(forfeitResult.error).toBeUndefined();
    expect(forfeitResult.profile.exportPolicy.trueUp).toBe("forfeit");
  });

  it("omits trueUp entirely when trueUpKind is 'none' or absent (backward-compatible implicit rule)", () => {
    const result = parseProfileImport(JSON.stringify(VALID_FLAT));
    expect(result.error).toBeUndefined();
    expect(result.profile.exportPolicy.trueUp).toBeUndefined();
  });

  it("rejects trueUpKind when netting is hourly, not annual", () => {
    const bad = {
      ...VALID_FLAT,
      profile: {
        ...VALID_FLAT.profile,
        exportPolicy: { type: "netMetering", netting: "hourly", exportRate: "retail", trueUpKind: "forfeit" },
      },
    };
    const result = parseProfileImport(JSON.stringify(bad));
    expect(result.error).toContain("trueUpKind is only meaningful under netMetering netting \"annual\"");
  });

  // Backward compatibility: a formatVersion:1 payload written before
  // ratePerKWhKind/exportRateKind/lockYears/trueUpKind existed (VALID_FLAT
  // itself is exactly this shape: only exportRate:"retail", no kind fields
  // at all) must still parse to the identical canonical ExportRate/
  // ExportPolicy it always did.
  it("still parses a pre-existing formatVersion:1 payload with no kind fields at all", () => {
    const result = parseProfileImport(JSON.stringify(VALID_FLAT));
    expect(result.error).toBeUndefined();
    expect(result.profile.exportPolicy).toEqual({
      type: "netMetering",
      netting: "annual",
      exportRate: "retail",
    });
  });
});

describe("buildResearchPrompt: supply/delivery mapping guidance", () => {
  it("includes a worked example encoding delivery as base pricing, supply as a monthlyTable adder, and the export rate as the same monthlyTable", () => {
    const prompt = buildResearchPrompt({ utilityName: "Ameren Illinois", location: "Peoria, IL" });
    expect(prompt).toMatch(/supply.*delivery/i);
    expect(prompt).toContain("Purchased Electricity Adjustment");
    expect(prompt).toContain('"mode": "monthlyTable"');
    expect(prompt).toContain('"exportRateKind": "monthlyTable"');
  });
});
