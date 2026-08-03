// Interchange format for a custom utility profile, so a household outside
// Lodi can hand any LLM a research prompt, paste back the JSON it produces,
// and get the same UtilityProfile-input shape calc/tariffs/custom.js's
// buildCustomProfile expects.
//
// SCHEMA_FIELDS is the one source of truth for three things that used to be
// three independently hand-maintained lists: the field list buildResearchPrompt
// embeds in the prompt, the JSON Schema (buildJsonSchema below) also embedded
// in the prompt, and the enum/type checks parseProfileImport validates
// against -- including the exact permitted-token list quoted in a rejected
// import's error message. Each field descriptor carries a structured `type`
// (this file's own small vocabulary, not raw JSON Schema syntax -- see
// buildLeafSchema) and, for a field with a fixed set of allowed values, an
// `enum` array; nothing hand-lists field names, permitted tokens, or JSON
// Schema fragments a second time anywhere else in this file.
//
// The wire shape:
//   { formatVersion: 1, utilityName, location, sources: [{section, url}],
//     profile: <buildCustomProfile input>, notes: [{field, note}] }
//
// TOU periods are the one place a Schedule needs something JSON cannot
// carry: profile.js's Schedule.pricing.periods[].applies must be a function.
// The wire format instead carries a plain `window` descriptor per period
// ({hours:[start,end], days, excludeHolidays}); parseProfileImport returns
// that descriptor as-is, at period.window, and never builds the applies()
// function itself -- the parsed profile is what gets stored straight into
// household.customProfileInputs (app state, storage.js, share links, the
// message posted into worker/calcWorker.js), which must stay JSON-safe and
// cloneable everywhere it travels. calc/tariffs/custom.js's
// buildCustomProfile is the one place that later turns a window descriptor
// into a real applies(hourCtx) predicate, freshly, every time the engine
// runs. serializeProfile below reads the same descriptor back out for the
// "Copy my profile as JSON" export.

export const FORMAT_VERSION = 1;

const MAX_INPUT_CHARS = 2_000_000;

export const SOURCE_SECTIONS = ["pricing", "demand", "exportPolicy", "adders", "riders", "constraints"];

// --- enum vocabularies, each referenced by exactly one SCHEMA_FIELDS entry's
// `enum` below, and read back out of that same entry (never re-typed) by
// this file's own validators -- see fieldByPath/permittedValues. ------------

const PRICING_TYPES = ["tiered", "flat-seasonal", "tou", "all-units-blocks"];
const WINDOW_DAYS = ["all", "weekday", "weekend"];
const ADDER_MODES = ["fixed", "monthlyTable"];
const EXPORT_POLICY_TYPES = ["netMetering", "avoidedCostCredit"];
const NETTING_MODES = ["hourly", "annual"];
const FINANCING_TYPES = ["cash", "loan"];
const SYSTEM_SIZE_CHARGE_BASES = ["kW-DC-solar", "kWh-battery"];
// avoidedCostCredit's ratePerKWh has no "retail" or percentOfRetail option
// (calc/tariffs/profile.js's validateExportRate: both require netMetering) --
// a separate, smaller kind list from netMetering's own, below.
const AVOIDED_COST_RATE_KINDS = ["flat", "monthlyTable", "timeTable"];
const NET_METERING_RATE_KINDS = ["retail", "flat", "monthlyTable", "timeTable", "percentOfRetail"];
// "none" means "omit exportPolicy.trueUp entirely," the pre-existing
// backward-compatible implicit rule (calc/billing.js's own header: a numeric
// exportRate cashes out at that same rate, anything else forfeits) rather
// than an explicit choice -- this lets an LLM state "I found no true-up rule
// published" without inventing forfeit or a cash-out rate it can't verify.
const TRUE_UP_KINDS = ["none", "forfeit", "cashOut"];

/**
 * Field descriptors, in prompt reading order. `path` uses dot notation with
 * `[]` marking an array of objects (e.g. "profile.riders[].label"); `note`
 * is the human-readable annotation shown in the prompt and folded into this
 * field's JSON Schema "description".
 *
 * `type` is this file's own small vocabulary (not raw JSON Schema syntax):
 * "string" | "number" | "integer" | "boolean" | "object" | "array" (of
 * objects, further described by this field's own "[]" children elsewhere in
 * this list) | "number[]"/"integer[]"/"string[]" (an array of the given
 * primitive, a leaf with no further children of its own). `enum` (a
 * string[]) is the exhaustive set of permitted values for a "string" field,
 * or for each item of a "string[]" field -- buildJsonSchema below turns it
 * into a strict JSON Schema "enum" array, and this file's validators quote
 * it verbatim in a rejected import's error message (see permittedValues).
 * `nullable` fields may be null when the LLM could not verify them from an
 * official source.
 */
export const SCHEMA_FIELDS = [
  { path: "formatVersion", type: "number", const: FORMAT_VERSION, note: "must be exactly 1" },
  { path: "utilityName", type: "string" },
  { path: "location", type: "string", note: "city and state" },
  { path: "sources", type: "array", note: "array of source citations (fields below)" },
  { path: "sources[].section", type: "string", enum: SOURCE_SECTIONS },
  { path: "sources[].url", type: "string", note: "an official utility URL" },
  { path: "profile.fixedChargePerMonth", type: "number", unit: "dollars/month", nullable: true },
  {
    path: "profile.minimumBillPerMonth",
    type: "number",
    unit: "dollars/month",
    nullable: true,
    optional: true,
    note: "a floor under the bill even after riders and export credits, if this utility publishes one; omit or null if none",
  },
  {
    path: "profile.pricing.type",
    type: "string",
    enum: PRICING_TYPES,
    note: "fill only the one this utility actually uses",
  },
  { path: "profile.pricing.summerRate", type: "number", unit: "$/kWh", note: "flat-seasonal only", nullable: true },
  { path: "profile.pricing.winterRate", type: "number", unit: "$/kWh", note: "flat-seasonal only", nullable: true },
  { path: "profile.pricing.rates", type: "number[]", unit: "$/kWh, one per tier", note: "tiered only", nullable: true },
  {
    path: "profile.pricing.breakpoints.summer",
    type: "number[]",
    note: "tiered only: cumulative monthly kWh, ascending, length = rates.length - 1",
    nullable: true,
  },
  {
    path: "profile.pricing.breakpoints.winter",
    type: "number[]",
    note: "tiered only: same as breakpoints.summer, for winter months",
    nullable: true,
  },
  {
    path: "profile.pricing.blocks.summer",
    type: "array",
    note:
      "all-units-blocks only: ascending array of {upToKWh, rate} blocks for summer months. Every block but the " +
      "last must have a positive upToKWh ceiling (cumulative monthly kWh); the last block must have upToKWh null " +
      "(no ceiling). Unlike tiered pricing, the WHOLE month's kWh bills at the single rate of the block the " +
      "month's total lands in, not a per-band split",
    nullable: true,
  },
  { path: "profile.pricing.blocks.summer[].upToKWh", type: "number", note: "all-units-blocks only: null only on the last block", nullable: true },
  { path: "profile.pricing.blocks.summer[].rate", type: "number", unit: "$/kWh", note: "all-units-blocks only" },
  {
    path: "profile.pricing.blocks.winter",
    type: "array",
    note: "all-units-blocks only: same shape as blocks.summer, for winter months",
    nullable: true,
  },
  { path: "profile.pricing.blocks.winter[].upToKWh", type: "number", note: "all-units-blocks only: null only on the last block", nullable: true },
  { path: "profile.pricing.blocks.winter[].rate", type: "number", unit: "$/kWh", note: "all-units-blocks only" },
  { path: "profile.pricing.periods", type: "array", note: "tou only: array of TOU periods (fields below)", nullable: true },
  { path: "profile.pricing.periods[].id", type: "string", note: 'tou only: e.g. "on-peak"' },
  { path: "profile.pricing.periods[].rate.summer", type: "number", unit: "$/kWh", note: "tou only", nullable: true },
  { path: "profile.pricing.periods[].rate.winter", type: "number", unit: "$/kWh", note: "tou only", nullable: true },
  {
    path: "profile.pricing.periods[].window.hours",
    type: "integer[]",
    minItems: 2,
    maxItems: 2,
    minimum: 0,
    maximum: 23,
    note: "tou only: [startHour, endHour], end exclusive, wraps past midnight if startHour > endHour",
  },
  { path: "profile.pricing.periods[].window.days", type: "string", enum: WINDOW_DAYS, note: "tou only" },
  { path: "profile.pricing.periods[].window.excludeHolidays", type: "boolean", note: "tou only" },
  {
    path: "profile.demand",
    type: "object",
    nullable: true,
    optional: true,
    note: "null if no demand charge, else { ratePerKW: { summer, winter } } in $/kW",
  },
  {
    path: "profile.systemSizeCharges",
    type: "array",
    optional: true,
    note: "a monthly charge based on the customer's OWN solar/battery nameplate size, if this utility bills one (rare); omit if none",
  },
  {
    path: "profile.systemSizeCharges[].basis",
    type: "string",
    enum: SYSTEM_SIZE_CHARGE_BASES,
    note: "what the charge is billed against",
  },
  { path: "profile.systemSizeCharges[].ratePerMonth", type: "number", unit: "dollars/month per unit of basis" },
  { path: "profile.adders[].id", type: "string" },
  { path: "profile.adders[].label", type: "string" },
  { path: "profile.adders[].mode", type: "string", enum: ADDER_MODES },
  { path: "profile.adders[].valuePerKWh", type: "number", unit: "$/kWh", note: "fixed mode only", nullable: true },
  {
    path: "profile.adders[].monthlyValues",
    type: "number[]",
    minItems: 12,
    maxItems: 12,
    note: "monthlyTable mode only: Jan-Dec, $/kWh",
    nullable: true,
  },
  { path: "profile.riders[].id", type: "string" },
  { path: "profile.riders[].label", type: "string" },
  { path: "profile.riders[].percentOff", type: "number", note: "fraction 0-1", nullable: true },
  { path: "profile.exportPolicy.type", type: "string", enum: EXPORT_POLICY_TYPES },
  {
    path: "profile.exportPolicy.lockYears",
    type: "integer",
    nullable: true,
    optional: true,
    note:
      "a vintage lock, if this utility's export rate is frozen for a stated number of years from interconnection " +
      "before it starts escalating (e.g. some net-metering successor tariffs); omit or null if the rate simply " +
      "follows the utility's normal annual rate-case schedule with no such lock. Has no effect on a \"retail\" or " +
      "percentOfRetail export rate (exportRateKind): both already track the schedule's own retail rate as it " +
      "escalates, so there is no fixed dollar figure for a lock to freeze; use a numeric, monthlyTable, or " +
      "timeTable export rate instead to model a locked export rate.",
  },
  {
    path: "profile.exportPolicy.ratePerKWhKind",
    type: "string",
    enum: AVOIDED_COST_RATE_KINDS,
    nullable: true,
    note: 'avoidedCostCredit only: which of the fields below is filled in. "flat" (a single rate) is the common case',
  },
  {
    path: "profile.exportPolicy.ratePerKWh",
    type: "number",
    unit: "$/kWh",
    note: 'avoidedCostCredit only, when ratePerKWhKind is "flat"',
    nullable: true,
  },
  {
    path: "profile.exportPolicy.ratePerKWhMonthlyValues",
    type: "number[]",
    minItems: 12,
    maxItems: 12,
    note: 'avoidedCostCredit only, when ratePerKWhKind is "monthlyTable": Jan-Dec, $/kWh',
    nullable: true,
  },
  {
    path: "profile.exportPolicy.ratePerKWhPeriods",
    type: "array",
    note: 'avoidedCostCredit only, when ratePerKWhKind is "timeTable": array of periods, same shape as pricing.periods above (fields below)',
    nullable: true,
  },
  { path: "profile.exportPolicy.ratePerKWhPeriods[].id", type: "string", note: 'e.g. "on-peak"' },
  { path: "profile.exportPolicy.ratePerKWhPeriods[].rate.summer", type: "number", unit: "$/kWh", nullable: true },
  { path: "profile.exportPolicy.ratePerKWhPeriods[].rate.winter", type: "number", unit: "$/kWh", nullable: true },
  {
    path: "profile.exportPolicy.ratePerKWhPeriods[].window.hours",
    type: "integer[]",
    minItems: 2,
    maxItems: 2,
    minimum: 0,
    maximum: 23,
    note: "[startHour, endHour], end exclusive, wraps past midnight if startHour > endHour",
  },
  { path: "profile.exportPolicy.ratePerKWhPeriods[].window.days", type: "string", enum: WINDOW_DAYS },
  { path: "profile.exportPolicy.ratePerKWhPeriods[].window.excludeHolidays", type: "boolean" },
  { path: "profile.exportPolicy.netting", type: "string", enum: NETTING_MODES, note: "netMetering only", nullable: true },
  {
    path: "profile.exportPolicy.exportRateKind",
    type: "string",
    enum: NET_METERING_RATE_KINDS,
    nullable: true,
    note: 'netMetering only: which of the fields below is filled in. "retail" (billed at the schedule\'s own applicable rate) is the common case',
  },
  {
    path: "profile.exportPolicy.exportRate",
    type: "retailOrNumber",
    note: 'netMetering only, when exportRateKind is "retail" or "flat": exactly "retail", or a number $/kWh',
    nullable: true,
  },
  {
    path: "profile.exportPolicy.exportRateMonthlyValues",
    type: "number[]",
    minItems: 12,
    maxItems: 12,
    note: 'netMetering only, when exportRateKind is "monthlyTable": Jan-Dec, $/kWh',
    nullable: true,
  },
  {
    path: "profile.exportPolicy.exportRatePeriods",
    type: "array",
    note: 'netMetering only, when exportRateKind is "timeTable": array of periods, same shape as pricing.periods above (fields below)',
    nullable: true,
  },
  { path: "profile.exportPolicy.exportRatePeriods[].id", type: "string", note: 'e.g. "on-peak"' },
  { path: "profile.exportPolicy.exportRatePeriods[].rate.summer", type: "number", unit: "$/kWh", nullable: true },
  { path: "profile.exportPolicy.exportRatePeriods[].rate.winter", type: "number", unit: "$/kWh", nullable: true },
  {
    path: "profile.exportPolicy.exportRatePeriods[].window.hours",
    type: "integer[]",
    minItems: 2,
    maxItems: 2,
    minimum: 0,
    maximum: 23,
    note: "[startHour, endHour], end exclusive, wraps past midnight if startHour > endHour",
  },
  { path: "profile.exportPolicy.exportRatePeriods[].window.days", type: "string", enum: WINDOW_DAYS },
  { path: "profile.exportPolicy.exportRatePeriods[].window.excludeHolidays", type: "boolean" },
  {
    path: "profile.exportPolicy.exportRateFraction",
    type: "number",
    nullable: true,
    note: 'netMetering only, when exportRateKind is "percentOfRetail" (only valid with netting "hourly"): fraction 0 (exclusive) to 1 (inclusive) of the applicable retail rate',
  },
  {
    path: "profile.exportPolicy.trueUpKind",
    type: "string",
    enum: TRUE_UP_KINDS,
    nullable: true,
    optional: true,
    note:
      'netMetering with netting "annual" only: how leftover banked kWh at year-end is resolved. "none" means no ' +
      'explicit rule was found (the calculator then falls back to its own default); omit entirely for hourly netting',
  },
  {
    path: "profile.exportPolicy.trueUpRate",
    type: "number",
    nullable: true,
    optional: true,
    note: 'only when trueUpKind is "cashOut": the flat $/kWh rate leftover banked kWh is cashed out at',
  },
  {
    path: "profile.constraints.allowedFinancing",
    type: "string[]",
    enum: FINANCING_TYPES,
    note: "non-empty, containing only the values listed",
  },
  { path: "profile.constraints.interconnectionFees.singlePhase", type: "number", unit: "dollars", nullable: true },
  { path: "profile.constraints.interconnectionFees.threePhase", type: "number", unit: "dollars", nullable: true },
  { path: "notes", type: "array", optional: true, note: "array of notes explaining any null field above (fields below)" },
  { path: "notes[].field", type: "string", note: 'dot path of the field you set to null (e.g. "profile.demand")' },
  { path: "notes[].note", type: "string", note: "why that field could not be verified" },
];

const FIELDS_BY_PATH = new Map(SCHEMA_FIELDS.map((f) => [f.path, f]));

/** The exhaustive permitted-values list for a SCHEMA_FIELDS path with an `enum`, or []. Reused by both the prompt's permitted-tokens section and every enum validator below, so neither can list a value the other doesn't. */
function permittedValues(path) {
  return FIELDS_BY_PATH.get(path)?.enum ?? [];
}

function quotedList(values) {
  return values.map((v) => JSON.stringify(v)).join(", ");
}

/**
 * "<label> <actual> is not permitted; use exactly one of "a", "b"[, or
 * null]." -- the one error-message shape every enum validator below builds
 * from, so the wording (and the permitted list itself, looked up from
 * SCHEMA_FIELDS by `path`) can never drift between fields. `label` is the
 * text shown before the offending value; it defaults to `path` but a caller
 * already naming the offending array item (e.g. `profile.adders "a1"`)
 * passes a shorter one (e.g. "mode") so the field isn't named twice.
 */
function notPermittedMessage(path, actual, { nullable = false, label = path } = {}) {
  const values = permittedValues(path);
  const suffix = nullable ? `${quotedList(values)}, or null` : quotedList(values);
  return `${label} ${JSON.stringify(actual)} is not permitted; use exactly one of ${suffix}.`;
}

// --- JSON Schema generation --------------------------------------------------

/** Splits "profile.pricing.periods[].window.hours" into ["profile","pricing","periods","[]","window","hours"], treating a trailing "[]" on a segment as its own step (drop into that array's `items`). */
function pathSegments(path) {
  return path.split(".").flatMap((seg) => (seg.endsWith("[]") ? [seg.slice(0, -2), "[]"] : [seg]));
}

function ensureObjectSchema(node) {
  if (!node.type) node.type = "object";
  if (!node.properties) node.properties = {};
  if (!node.required) node.required = [];
  if (node.additionalProperties === undefined) node.additionalProperties = false;
  return node;
}

function ensureArraySchema(node) {
  if (!node.type) node.type = "array";
  if (!node.items) node.items = {};
  return node;
}

/** This file's own field.type vocabulary -> a JSON Schema fragment (draft 2020-12 style: nullable is `type: [base, "null"]`, not a separate keyword). */
function buildLeafSchema(field) {
  const { type, enum: enumValues, unit, note, nullable, minItems, maxItems, minimum, maximum, const: constValue } = field;
  const description = [unit, note].filter(Boolean).join("; ") || undefined;

  if (type === "retailOrNumber") {
    const oneOf = [{ const: "retail" }, { type: "number" }];
    if (nullable) oneOf.push({ type: "null" });
    return { oneOf, ...(description ? { description } : {}) };
  }

  if (type === "number[]" || type === "integer[]" || type === "string[]") {
    const itemType = type.slice(0, -2);
    const items = { type: itemType };
    if (enumValues) items.enum = enumValues;
    if (itemType === "integer") {
      if (minimum != null) items.minimum = minimum;
      if (maximum != null) items.maximum = maximum;
    }
    const schema = { type: nullable ? ["array", "null"] : "array", items };
    if (minItems != null) schema.minItems = minItems;
    if (maxItems != null) schema.maxItems = maxItems;
    if (description) schema.description = description;
    return schema;
  }

  if (type === "array") {
    const schema = { type: nullable ? ["array", "null"] : "array", items: {} };
    if (description) schema.description = description;
    return schema;
  }

  const schema = { type: nullable ? [type, "null"] : type };
  if (enumValues) schema.enum = nullable ? [...enumValues, null] : enumValues;
  if (constValue !== undefined) schema.const = constValue;
  if (description) schema.description = description;
  return schema;
}

/** Merges a freshly-built leaf schema into whatever's already at that slot (rather than overwriting), so field order in SCHEMA_FIELDS never matters: an array's own entry (e.g. "profile.pricing.periods") and its "[]" children's entries (e.g. "profile.pricing.periods[].id") can appear in either order and still compose into one schema node. */
function mergeLeafSchema(existing, incoming) {
  return Object.assign(existing || {}, incoming);
}

function setFieldSchema(root, field) {
  const segments = pathSegments(field.path);
  let node = ensureObjectSchema(root);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    if (seg === "[]") {
      node = ensureArraySchema(node).items;
      continue;
    }

    if (isLast) {
      const parent = ensureObjectSchema(node);
      parent.properties[seg] = mergeLeafSchema(parent.properties[seg], buildLeafSchema(field));
      // `nullable` (this field's VALUE may be null) and `optional` (this
      // field's KEY may be omitted entirely) are independent: the prompt
      // tells the LLM to write null rather than drop a field it can't
      // verify, so almost every nullable field is still a required key --
      // parseProfileImport's own validators bear this out (e.g.
      // isNonNegNumberOrNull(undefined) is false, the same rejection as any
      // other wrong type). Only fields whose validator explicitly tolerates
      // the key being absent (profile.demand, the top-level notes array) are
      // marked `optional` in SCHEMA_FIELDS.
      if (!field.optional && !parent.required.includes(seg)) parent.required.push(seg);
      continue;
    }

    const parent = ensureObjectSchema(node);
    if (!parent.properties[seg]) parent.properties[seg] = {};
    node = parent.properties[seg];
  }
}

/** A curated list of container paths (objects SCHEMA_FIELDS only describes the leaves of, never itself) that parseProfileImport's own validators genuinely require -- everything else's required-ness is already derived per-field from `nullable` above. Dot notation only; none of these containers is itself inside a "[]" array. */
const REQUIRED_CONTAINER_PATHS = [
  "profile",
  "profile.pricing",
  "profile.exportPolicy",
  "profile.constraints",
  "profile.constraints.interconnectionFees",
];

function markContainersRequired(root) {
  for (const path of REQUIRED_CONTAINER_PATHS) {
    const segments = path.split(".");
    const leaf = segments[segments.length - 1];
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) node = node.properties[segments[i]];
    if (!node.required.includes(leaf)) node.required.push(leaf);
  }
}

/**
 * A JSON Schema (2020-12 style: `type` arrays for nullability, no
 * proprietary "nullable" keyword) generated entirely from SCHEMA_FIELDS --
 * never hand-written in parallel with it, so the two cannot drift (see this
 * file's own header, and model/__tests__/profileCodec.test.js's schema test,
 * which regenerates this same schema independently to prove it).
 */
export function buildJsonSchema() {
  const root = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" };
  ensureObjectSchema(root);
  for (const field of SCHEMA_FIELDS) setFieldSchema(root, field);
  markContainersRequired(root);
  return root;
}

/** Every SCHEMA_FIELDS entry with a fixed set of permitted values (or a boolean), as one plain-language line for the prompt: "path: exactly one of "a", "b"[, or null]." A strict JSON Schema's enum array is precise but easy for an LLM to skim past; this restates the same constraint as an instruction. */
function permittedTokensLines() {
  const lines = [];
  for (const field of SCHEMA_FIELDS) {
    if (field.type === "string" && field.enum) {
      lines.push(`- ${field.path}: exactly one of ${field.nullable ? `${quotedList(field.enum)}, or null` : quotedList(field.enum)}`);
    } else if (field.type === "string[]" && field.enum) {
      lines.push(`- ${field.path}: an array containing only values from ${quotedList(field.enum)} (not a bare string)`);
    } else if (field.type === "retailOrNumber") {
      lines.push(`- ${field.path}: exactly "retail", or a number, or null`);
    } else if (field.type === "boolean") {
      lines.push(`- ${field.path}: true or false (a JSON boolean, never the string "yes"/"no")`);
    }
  }
  return lines.join("\n");
}

// --- research prompt -----------------------------------------------------

/**
 * Full prompt text for any LLM to research a utility's rate rules and
 * return an import-ready JSON block. Embeds SCHEMA_FIELDS' field list, a
 * generated JSON Schema (buildJsonSchema), and a plain-language permitted-
 * tokens list -- all three derived from SCHEMA_FIELDS (see this file's own
 * header), so nothing here can list a field, type, or enum value the other
 * two don't also agree on.
 */
export function buildResearchPrompt({ utilityName = "", location = "" } = {}) {
  const who = utilityName.trim() || "the household's electric utility";
  const where = location.trim() ? ` in ${location.trim()}` : "";
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const fieldLines = SCHEMA_FIELDS.map((f) => `- ${f.path}: ${f.note}${f.nullable ? " (nullable)" : ""}`).join("\n");
  const schemaJson = JSON.stringify(buildJsonSchema(), null, 2);
  const tokenLines = permittedTokensLines();

  return `You are researching the residential electric rate schedule for ${who}${where} so its rules can be modeled in a solar/battery cost comparison tool.

Use only the utility's own official sources: its published rate schedule PDFs or tariff pages, current as of today, ${today}. Do not use third-party summary sites, aggregators, or your own prior knowledge of typical rates in the area.

Fill every field below that you can verify from an official source:
- The fixed monthly charge.
- Exactly one pricing structure: tiered breakpoints and rates, or a flat seasonal rate, or time-of-use (TOU) periods with their exact hour windows. Use whichever one this utility actually bills under, and leave the other two pricing fields null.
- Any per-kWh adders (surcharges billed on top of the energy rate).
- The utility's export mechanism for customer-generated power, net metering or an avoided-cost credit, and its rate.
- Any riders (bill discounts).
- Interconnection fees.
- Financing restrictions: which of cash or loan financing the utility's interconnection rules allow.

If you cannot verify a field from an official source, set it to null rather than guessing or estimating a plausible-sounding value. When you set a field to null, add an entry to the top-level "notes" array explaining why, for example that the utility does not publish that figure, or that it is under a pending rate case.

Cite at least one source URL per top-level section (${SOURCE_SECTIONS.join(", ")}) in the "sources" array, using the utility's own site for each.

SUPPLY/DELIVERY SPLIT UTILITIES -- some utilities (the Ameren Illinois / ComEd pattern) unbundle the bill into a "delivery" charge (the regulated wires/poles infrastructure cost) and a separate "supply" charge (the electricity commodity itself, often a monthly-varying figure published under a name like "Purchased Electricity Adjustment"). If this utility bills that way, encode it as:
- Delivery as this profile's base pricing (whichever pricing.type the delivery tariff itself actually uses -- flat-seasonal or tiered).
- Supply as its own adder, mode "monthlyTable", one $/kWh value per calendar month tracking the utility's published supply rate.
- The export rate as a monthlyTable ExportRate carrying the SAME monthly values as the supply adder -- net-metered exported kWh typically offsets what the customer would have paid for supply that month specifically, not the combined delivery-plus-supply retail rate.

A compact worked example of exactly that encoding (delivery at a flat $0.071/kWh, supply varying monthly, export crediting the supply rate 1:1):
\`\`\`json
{
  "profile": {
    "pricing": { "type": "flat-seasonal", "summerRate": 0.071, "winterRate": 0.071 },
    "adders": [
      {
        "id": "supply",
        "label": "Supply (Purchased Electricity Adjustment)",
        "mode": "monthlyTable",
        "monthlyValues": [0.081, 0.081, 0.075, 0.070, 0.065, 0.062, 0.060, 0.060, 0.063, 0.068, 0.075, 0.081]
      }
    ],
    "exportPolicy": {
      "type": "netMetering",
      "netting": "annual",
      "exportRateKind": "monthlyTable",
      "exportRateMonthlyValues": [0.081, 0.081, 0.075, 0.070, 0.065, 0.062, 0.060, 0.060, 0.063, 0.068, 0.075, 0.081]
    }
  }
}
\`\`\`
Only use this pattern for a utility that actually separates delivery and supply this way; a vertically-integrated utility billing one blended energy rate should still use a single flat-seasonal, tiered, or TOU pricing.type with no supply adder.

Return ONLY a single fenced json code block, and nothing else in your reply, no prose before or after it. The object inside must have exactly this shape (units and allowed values noted after each field):

${fieldLines}

PERMITTED TOKENS -- this reply is checked by a strict parser, not read loosely. For every field below, use one of the exact strings listed (matching case and punctuation exactly); any other spelling, casing, or synonym (e.g. "Flat_Seasonal", "flat seasonal", "Yes") will be rejected:

${tokenLines}

JSON SCHEMA -- the fenced block below must validate against this schema (draft 2020-12). "type": [X, "null"] means the field may be X or null; "enum" lists the only strings a field may hold:

\`\`\`json
${schemaJson}
\`\`\`

Example of the fenced block's shape, for a flat-seasonal utility with no demand charge (substitute a "tiered" or "tou" pricing object if that is what this utility actually uses):

\`\`\`json
{
  "formatVersion": 1,
  "utilityName": "${who}",
  "location": "${location.trim()}",
  "sources": [
    { "section": "pricing", "url": "https://example-utility.com/rates" }
  ],
  "profile": {
    "fixedChargePerMonth": 10.00,
    "pricing": { "type": "flat-seasonal", "summerRate": 0.22, "winterRate": 0.18 },
    "demand": null,
    "adders": [],
    "riders": [],
    "exportPolicy": { "type": "netMetering", "netting": "annual", "exportRate": "retail" },
    "constraints": {
      "allowedFinancing": ["cash", "loan"],
      "interconnectionFees": { "singlePhase": 150, "threePhase": 400 }
    }
  },
  "notes": []
}
\`\`\`
`;
}

// --- extraction: pull the first JSON object out of chatty LLM text -------

/**
 * Scans raw for the first top-level {...} object, tracking string state
 * (quotes and escapes) across the WHOLE text, not just from the first `{`:
 * a stray `{` inside quoted prose before the real JSON (e.g. a sentence
 * quoting a phrase like "rates are {complicated} here") would otherwise be
 * mistaken for the object's start. Returns null when no complete top-level
 * object is found.
 */
function extractFirstJsonObject(raw) {
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Extracts the JSON text an LLM's reply is expected to carry, tolerating
 * surrounding prose and one or more markdown fences. Tries each fenced code
 * block first (an LLM asked for "only a fenced json block" occasionally
 * still adds a sentence before or after it), then falls back to scanning the
 * whole raw text for a top-level object.
 */
function extractJsonText(raw) {
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenceRe.exec(raw))) {
    const inner = extractFirstJsonObject(match[1]);
    if (inner) return inner;
  }
  return extractFirstJsonObject(raw);
}

// --- TOU window helpers ----------------------------------------------------

/** Inclusive of start, exclusive of end; wraps past midnight when start > end (mirrors calc/battery.js's gridCharge window). */
function hourInWindow(hourOfDay, start, end) {
  if (start === end) return true;
  if (start < end) return hourOfDay >= start && hourOfDay < end;
  return hourOfDay >= start || hourOfDay < end;
}

function hoursCoveredByWindow(window) {
  const [start, end] = window.hours;
  const covered = new Set();
  for (let h = 0; h < 24; h++) {
    if (hourInWindow(h, start, end)) covered.add(h);
  }
  return covered;
}

function daysCompatible(a, b) {
  if (a === "all" || b === "all") return true;
  return a === b;
}

/**
 * True when two TOU periods' windows can both be active in the same hour.
 * excludeHolidays is deliberately not factored in: a holiday is a handful of
 * days a year, too small a slice to make two otherwise-overlapping windows
 * non-overlapping in any way a household would notice.
 */
function periodsOverlap(a, b) {
  const hoursOverlap = [...hoursCoveredByWindow(a.window)].some((h) => hoursCoveredByWindow(b.window).has(h));
  if (!hoursOverlap) return false;
  return daysCompatible(a.window.days || "all", b.window.days || "all");
}

/**
 * Errors when some (hourOfDay, dayType) combination is covered by NO
 * period's window -- the import-time equivalent of the coverage gap that
 * otherwise only surfaces later as a raw "no ... period matches hour N"
 * throw inside the engine (calc/tariffs/profile.js's own
 * validateFullHourCoverage catches the identical gap on the already-
 * materialized applies() functions, as a backstop for a hand-edited share
 * link or localStorage record this import-time check never saw).
 * excludeHolidays is not modeled here, matching periodsOverlap's own
 * simplification just above: a holiday is too small a slice of the year to
 * leave a gap large enough to matter.
 */
function coverageGap(parsedPeriods) {
  for (const dayType of ["weekday", "weekend"]) {
    const covered = new Set();
    for (const p of parsedPeriods) {
      const days = p.window.days || "all";
      if (days !== "all" && days !== dayType) continue;
      for (const h of hoursCoveredByWindow(p.window)) covered.add(h);
    }
    for (let hourOfDay = 0; hourOfDay < 24; hourOfDay++) {
      if (!covered.has(hourOfDay)) return { hourOfDay, dayType };
    }
  }
  return null;
}

// The research prompt only asks the LLM for the export mechanism and its
// rate (what a tariff page actually states); these three booleans are
// billing-engine plumbing (calc/billing.js's ledger behavior, per
// CONTRACTS.md: an avoidedCostCredit ledger carries forward, never cashes
// out) that calc/tariffs/custom.js's own DEFAULT_EXPORT_POLICY also fixes
// rather than sourcing from user input. Applied only when the parsed
// exportPolicy is missing them, so an imported avoidedCostCredit profile
// behaves identically to one built by hand through CustomProfileBuilder.
const AVOIDED_COST_CREDIT_DEFAULTS = { addersApply: false, carryForward: true, cashOut: false };

function withExportPolicyDefaults(policy) {
  if (policy.type !== "avoidedCostCredit") return policy;
  return { ...AVOIDED_COST_CREDIT_DEFAULTS, ...policy };
}

/**
 * Converts one wire-format ExportRate (a `kind` plus whichever sibling field
 * that kind gates -- see this module's header and SCHEMA_FIELDS) into the
 * canonical ExportRate value calc/tariffs/profile.js's typedef describes
 * (a plain number, "retail", or a {kind, ...} object) -- the shape
 * calc/tariffs/custom.js's buildCustomProfile actually expects on
 * exportPolicy.ratePerKWh/.exportRate. A timeTable period's window
 * descriptor is normalized down to {hours, days, excludeHolidays} the same
 * way parsePricing's own tou branch does for pricing.periods, since the wire
 * format only ever carries the JSON-safe descriptor, never a function.
 */
function buildExportRateValue(kind, { flatValue, monthlyValues, periods, fraction }) {
  if (kind === "retail") return "retail";
  if (kind === "monthlyTable") return { kind: "monthlyTable", monthlyValues };
  if (kind === "timeTable") {
    return {
      kind: "timeTable",
      periods: periods.map((p) => ({
        id: p.id,
        rate: { summer: p.rate.summer, winter: p.rate.winter },
        window: { hours: p.window.hours, days: p.window.days ?? "all", excludeHolidays: p.window.excludeHolidays ?? false },
      })),
    };
  }
  if (kind === "percentOfRetail") return { kind: "percentOfRetail", fraction };
  return flatValue; // kind === "flat"
}

/**
 * Converts one wire-format exportPolicy (type, lockYears, the
 * ratePerKWh / exportRate kind-gated field group, netting, trueUpKind/
 * trueUpRate) into the canonical ExportPolicy shape. ratePerKWhKind/
 * exportRateKind null defaults to "flat" (or, for netMetering, "retail" when
 * the legacy exportRate value itself already reads "retail") -- the only
 * kind a payload written before these kind fields existed could ever have
 * meant, so an older formatVersion:1 import still parses exactly as it
 * always did. trueUpKind "none" (or an absent key) omits exportPolicy.trueUp
 * entirely, leaving calc/billing.js's own pre-existing implicit rule in
 * effect, per this module's header.
 */
function buildExportPolicy(policy) {
  const base = { type: policy.type, ...(policy.lockYears != null ? { lockYears: policy.lockYears } : {}) };

  if (policy.type === "avoidedCostCredit") {
    const kind = policy.ratePerKWhKind ?? "flat";
    const ratePerKWh = buildExportRateValue(kind, {
      flatValue: policy.ratePerKWh,
      monthlyValues: policy.ratePerKWhMonthlyValues,
      periods: policy.ratePerKWhPeriods,
    });
    return { ...base, ratePerKWh };
  }

  const kind = policy.exportRateKind ?? (policy.exportRate === "retail" ? "retail" : "flat");
  const exportRate = buildExportRateValue(kind, {
    flatValue: policy.exportRate,
    monthlyValues: policy.exportRateMonthlyValues,
    periods: policy.exportRatePeriods,
    fraction: policy.exportRateFraction,
  });
  const trueUpKind = policy.trueUpKind;
  const trueUp = trueUpKind === "forfeit" ? "forfeit" : trueUpKind === "cashOut" ? { rate: policy.trueUpRate } : undefined;

  return {
    ...base,
    netting: policy.netting,
    exportRate,
    ...(trueUp !== undefined ? { trueUp } : {}),
  };
}

// --- validation ------------------------------------------------------------

function isNonNegNumberOrNull(v) {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
}

/**
 * Validates one TOU-period-shaped array -- the vocabulary profile.pricing's
 * "tou" periods, exportPolicy.ratePerKWhPeriods, and
 * exportPolicy.exportRatePeriods all share identically: each entry needs a
 * string id, a rate.summer/rate.winter (each a non-negative number or
 * null), and a window {hours, days, excludeHolidays}. Pushes every error
 * found onto `errors`, prefixed with `pathLabel` (e.g.
 * "profile.pricing.periods"), and returns the {id, window} pairs actually
 * usable for the overlap check below (an entry whose own window shape check
 * failed is skipped, not compared). `windowDaysFieldPath` names whichever
 * SCHEMA_FIELDS entry notPermittedMessage should read window.days'
 * permitted-values list off of -- all three share the identical WINDOW_DAYS
 * enum, so the message content is the same regardless of which one is
 * named, but the caller still supplies its own real path rather than one
 * hardcoded to a single field.
 */
function validatePeriodsList(periods, pathLabel, windowDaysFieldPath, errors) {
  const parsedPeriods = [];
  for (const p of periods) {
    const id = p && typeof p.id === "string" && p.id ? p.id : "(missing id)";
    if (id === "(missing id)") errors.push(`every entry in ${pathLabel} must have a string "id".`);
    if (!p || typeof p.rate !== "object" || p.rate === null) {
      errors.push(`${pathLabel} "${id}" must have a rate object.`);
    } else {
      if (!isNonNegNumberOrNull(p.rate.summer)) errors.push(`${pathLabel} "${id}" rate.summer must be a non-negative number or null.`);
      if (!isNonNegNumberOrNull(p.rate.winter)) errors.push(`${pathLabel} "${id}" rate.winter must be a non-negative number or null.`);
    }
    const window = p && p.window;
    if (!window || typeof window !== "object") {
      errors.push(`${pathLabel} "${id}" must have a window.`);
      continue;
    }
    const hours = window.hours;
    if (!Array.isArray(hours) || hours.length !== 2 || !hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) {
      errors.push(`${pathLabel} "${id}" window.hours must be [startHour, endHour], integers 0-23.`);
      continue;
    }
    const days = window.days ?? "all";
    if (!WINDOW_DAYS.includes(days)) {
      errors.push(`${pathLabel} "${id}" ${notPermittedMessage(windowDaysFieldPath, days, { label: "window.days" })}`);
      continue;
    }
    const excludeHolidays = window.excludeHolidays ?? false;
    if (typeof excludeHolidays !== "boolean") {
      errors.push(`${pathLabel} "${id}" window.excludeHolidays must be a boolean (true or false, not "${excludeHolidays}").`);
      continue;
    }
    parsedPeriods.push({ id, window: { hours, days, excludeHolidays } });
  }
  for (let i = 0; i < parsedPeriods.length; i++) {
    for (let j = i + 1; j < parsedPeriods.length; j++) {
      if (periodsOverlap(parsedPeriods[i], parsedPeriods[j])) {
        errors.push(`${pathLabel} "${parsedPeriods[i].id}" and "${parsedPeriods[j].id}" overlap: both can apply in the same hour.`);
      }
    }
  }
  // Coverage only runs once every entry in `periods` parsed cleanly into
  // parsedPeriods -- an entry whose own shape failed (missing window, bad
  // hours, etc.) already has its own error above naming it, and comparing
  // against an incomplete list here would either miss a real gap or invent
  // one caused entirely by the entry that failed to parse.
  if (parsedPeriods.length === periods.length) {
    const gap = coverageGap(parsedPeriods);
    if (gap) {
      errors.push(`${pathLabel} has a coverage gap: no period covers ${gap.dayType} hour ${gap.hourOfDay}:00. Every hour must be covered by at least one period.`);
    }
  }
  return parsedPeriods;
}

/** All-units-blocks pricing validates the SAME shape for both seasons; factored out since profile.pricing.blocks.summer/.winter are independently nullable. */
function validateBlocksList(blocks, pathLabel, errors) {
  if (blocks === null || blocks === undefined) return; // tolerated null/absent, same as tiered breakpoints
  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push(`${pathLabel} must be a non-empty array, or null.`);
    return;
  }
  blocks.forEach((b, i) => {
    const isLast = i === blocks.length - 1;
    if (!(typeof b?.rate === "number" && Number.isFinite(b.rate) && b.rate >= 0)) {
      errors.push(`${pathLabel}[${i}].rate must be a non-negative number.`);
    }
    if (isLast) {
      if (b?.upToKWh != null) errors.push(`${pathLabel}'s last block must have upToKWh null (no ceiling).`);
    } else if (!(typeof b?.upToKWh === "number" && Number.isFinite(b.upToKWh) && b.upToKWh > 0)) {
      errors.push(`${pathLabel}[${i}].upToKWh must be a positive number (only the last block may be null).`);
    } else if (i > 0 && typeof blocks[i - 1]?.upToKWh === "number" && b.upToKWh <= blocks[i - 1].upToKWh) {
      errors.push(`${pathLabel} upToKWh values must be strictly ascending.`);
    }
  });
}

function validatePricing(pricing, errors) {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    errors.push("profile.pricing is required.");
    return;
  }
  if (pricing.type === "flat-seasonal") {
    if (!isNonNegNumberOrNull(pricing.summerRate)) errors.push("profile.pricing.summerRate must be a non-negative number or null.");
    if (!isNonNegNumberOrNull(pricing.winterRate)) errors.push("profile.pricing.winterRate must be a non-negative number or null.");
  } else if (pricing.type === "tiered") {
    const rates = pricing.rates;
    if (rates !== null) {
      if (!Array.isArray(rates) || rates.length === 0 || !rates.every((r) => typeof r === "number" && Number.isFinite(r) && r >= 0)) {
        errors.push("profile.pricing.rates must be a non-empty array of non-negative numbers, or null.");
      } else {
        const bp = pricing.breakpoints;
        if (bp !== null) {
          if (!bp || typeof bp !== "object") {
            errors.push("profile.pricing.breakpoints must be an object with summer and winter arrays, or null.");
          } else {
            for (const season of ["summer", "winter"]) {
              const series = bp[season];
              if (series === null) continue;
              if (!Array.isArray(series) || series.length !== rates.length - 1) {
                errors.push(`profile.pricing.breakpoints.${season} must have ${rates.length - 1} entries (one fewer than rates), or be null.`);
              } else if (series.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
                errors.push(`profile.pricing.breakpoints.${season} must contain only non-negative numbers.`);
              } else {
                for (let i = 1; i < series.length; i++) {
                  if (series[i] <= series[i - 1]) {
                    errors.push(`profile.pricing.breakpoints.${season} must be strictly ascending.`);
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  } else if (pricing.type === "tou") {
    const periods = pricing.periods;
    if (periods !== null) {
      if (!Array.isArray(periods) || periods.length === 0) {
        errors.push("profile.pricing.periods must be a non-empty array, or null.");
      } else {
        validatePeriodsList(periods, "profile.pricing.periods", "profile.pricing.periods[].window.days", errors);
      }
    }
  } else if (pricing.type === "all-units-blocks") {
    validateBlocksList(pricing.blocks?.summer, "profile.pricing.blocks.summer", errors);
    validateBlocksList(pricing.blocks?.winter, "profile.pricing.blocks.winter", errors);
  } else {
    errors.push(notPermittedMessage("profile.pricing.type", pricing.type));
  }
}

function validateDemand(demand, errors) {
  if (demand === null || demand === undefined) return;
  if (typeof demand !== "object" || Array.isArray(demand)) {
    errors.push("profile.demand must be an object, or null.");
    return;
  }
  const rate = demand.ratePerKW;
  if (!rate || typeof rate !== "object" || !isNonNegNumberOrNull(rate.summer) || !isNonNegNumberOrNull(rate.winter)) {
    errors.push("profile.demand.ratePerKW must have non-negative summer and winter numbers, or null.");
  }
}

function validateAdders(adders, errors) {
  if (adders === null || adders === undefined) return;
  if (!Array.isArray(adders)) {
    errors.push("profile.adders must be an array.");
    return;
  }
  for (const a of adders) {
    const id = a && typeof a.id === "string" && a.id ? a.id : "(missing id)";
    if (id === "(missing id)") errors.push('every entry in profile.adders must have a string "id".');
    if (!a || typeof a.label !== "string" || !a.label) errors.push(`profile.adders "${id}" must have a string label.`);
    if (a?.mode === "fixed") {
      if (!isNonNegNumberOrNull(a.valuePerKWh)) errors.push(`profile.adders "${id}" valuePerKWh must be a non-negative number or null.`);
    } else if (a?.mode === "monthlyTable") {
      if (a.monthlyValues !== null && (!Array.isArray(a.monthlyValues) || a.monthlyValues.length !== 12 || a.monthlyValues.some((v) => !isNonNegNumberOrNull(v)))) {
        errors.push(`profile.adders "${id}" monthlyValues must be an array of 12 non-negative numbers, or null.`);
      }
    } else if (!ADDER_MODES.includes(a?.mode)) {
      errors.push(`profile.adders "${id}" ${notPermittedMessage("profile.adders[].mode", a?.mode, { label: "mode" })}`);
    }
  }
}

function validateRiders(riders, errors) {
  if (riders === null || riders === undefined) return;
  if (!Array.isArray(riders)) {
    errors.push("profile.riders must be an array.");
    return;
  }
  for (const r of riders) {
    const id = r && typeof r.id === "string" && r.id ? r.id : "(missing id)";
    if (id === "(missing id)") errors.push('every entry in profile.riders must have a string "id".');
    if (!r || typeof r.label !== "string" || !r.label) errors.push(`profile.riders "${id}" must have a string label.`);
    if (r?.percentOff !== null && !(typeof r?.percentOff === "number" && r.percentOff > 0 && r.percentOff <= 1)) {
      errors.push(`profile.riders "${id}" percentOff must be a fraction between 0 and 1, or null.`);
    }
  }
}

function validateMonthlyValues(values, pathLabel, errors) {
  if (values === null || values === undefined) {
    errors.push(`${pathLabel} is required (an array of 12 non-negative numbers) when this kind is selected.`);
    return;
  }
  if (!Array.isArray(values) || values.length !== 12 || values.some((v) => !(typeof v === "number" && Number.isFinite(v) && v >= 0))) {
    errors.push(`${pathLabel} must be an array of 12 non-negative numbers.`);
  }
}

function validateTimeTablePeriods(periods, pathLabel, windowDaysFieldPath, errors) {
  if (periods === null || periods === undefined) {
    errors.push(`${pathLabel} is required (a non-empty array of periods) when this kind is selected.`);
    return;
  }
  if (!Array.isArray(periods) || periods.length === 0) {
    errors.push(`${pathLabel} must be a non-empty array.`);
    return;
  }
  validatePeriodsList(periods, pathLabel, windowDaysFieldPath, errors);
}

/**
 * ratePerKWhKind null defaults to "flat" -- the only kind a payload written
 * before this field existed could ever have meant, so an older
 * formatVersion:1 import (ratePerKWh only, no kind field at all) still
 * validates and parses exactly as it always did.
 */
function validateAvoidedCostRate(policy, errors) {
  if (policy.ratePerKWhKind != null && !AVOIDED_COST_RATE_KINDS.includes(policy.ratePerKWhKind)) {
    errors.push(notPermittedMessage("profile.exportPolicy.ratePerKWhKind", policy.ratePerKWhKind, { nullable: true }));
    return;
  }
  const kind = policy.ratePerKWhKind ?? "flat";
  if (kind === "flat") {
    if (!isNonNegNumberOrNull(policy.ratePerKWh)) errors.push("profile.exportPolicy.ratePerKWh must be a non-negative number or null.");
  } else if (kind === "monthlyTable") {
    validateMonthlyValues(policy.ratePerKWhMonthlyValues, "profile.exportPolicy.ratePerKWhMonthlyValues", errors);
  } else if (kind === "timeTable") {
    validateTimeTablePeriods(
      policy.ratePerKWhPeriods,
      "profile.exportPolicy.ratePerKWhPeriods",
      "profile.exportPolicy.ratePerKWhPeriods[].window.days",
      errors,
    );
  }
}

/**
 * exportRateKind null defaults from the legacy exportRate value itself
 * ("retail" if that's what it is, "flat" otherwise) for the identical
 * backward-compatibility reason validateAvoidedCostRate's default does.
 */
function validateNetMeteringRate(policy, errors) {
  if (policy.exportRateKind != null && !NET_METERING_RATE_KINDS.includes(policy.exportRateKind)) {
    errors.push(notPermittedMessage("profile.exportPolicy.exportRateKind", policy.exportRateKind, { nullable: true }));
    return;
  }
  const kind = policy.exportRateKind ?? (policy.exportRate === "retail" ? "retail" : "flat");
  if (kind === "retail" || kind === "flat") {
    if (policy.exportRate !== null && policy.exportRate !== "retail" && typeof policy.exportRate !== "number") {
      errors.push(`profile.exportPolicy.exportRate ${JSON.stringify(policy.exportRate)} is not permitted; use exactly "retail", a number, or null.`);
    } else if (typeof policy.exportRate === "number" && policy.exportRate < 0) {
      errors.push("profile.exportPolicy.exportRate must be non-negative when it is a number.");
    }
  } else if (kind === "monthlyTable") {
    validateMonthlyValues(policy.exportRateMonthlyValues, "profile.exportPolicy.exportRateMonthlyValues", errors);
  } else if (kind === "timeTable") {
    validateTimeTablePeriods(
      policy.exportRatePeriods,
      "profile.exportPolicy.exportRatePeriods",
      "profile.exportPolicy.exportRatePeriods[].window.days",
      errors,
    );
  } else if (kind === "percentOfRetail") {
    if (policy.netting !== "hourly") {
      errors.push('profile.exportPolicy.exportRateKind "percentOfRetail" is only valid with netting "hourly".');
    }
    if (policy.exportRateFraction !== null && !(typeof policy.exportRateFraction === "number" && policy.exportRateFraction > 0 && policy.exportRateFraction <= 1)) {
      errors.push("profile.exportPolicy.exportRateFraction must be a fraction between 0 (exclusive) and 1 (inclusive), or null.");
    }
  }
}

/** netMetering netting "annual" only; trueUpKind "none" (or an absent key) means the pre-existing implicit rule applies, matching calc/billing.js's own backward-compatible default. */
function validateTrueUp(policy, errors) {
  const trueUpKind = policy.trueUpKind;
  if (trueUpKind == null || trueUpKind === "none") return;
  if (!TRUE_UP_KINDS.includes(trueUpKind)) {
    errors.push(notPermittedMessage("profile.exportPolicy.trueUpKind", trueUpKind, { nullable: true }));
    return;
  }
  if (policy.netting !== "annual") {
    errors.push('profile.exportPolicy.trueUpKind is only meaningful under netMetering netting "annual".');
  }
  if (trueUpKind === "cashOut" && !isNonNegNumberOrNull(policy.trueUpRate)) {
    errors.push('profile.exportPolicy.trueUpRate must be a non-negative number when trueUpKind is "cashOut".');
  }
}

function validateExportPolicy(policy, errors) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    errors.push("profile.exportPolicy is required.");
    return;
  }

  if (policy.lockYears !== null && policy.lockYears !== undefined && !(Number.isInteger(policy.lockYears) && policy.lockYears > 0)) {
    errors.push("profile.exportPolicy.lockYears must be a positive integer, or null.");
  }

  // "retail" and "percentOfRetail" are the only two exportRateKind values
  // that track the schedule's own retail rate by construction (already
  // escalated by retailEscalation), so there is no fixed dollar figure a
  // vintage lock could freeze -- avoidedCostCredit has no equivalent kind
  // (AVOIDED_COST_RATE_KINDS above), so this only ever applies to
  // netMetering. Mirrors calc/tariffs/profile.js's validateExportPolicy,
  // which runs the identical check against the canonical (post-import)
  // shape as a backstop for a hand-edited share link or localStorage record.
  if (
    policy.lockYears != null &&
    policy.type === "netMetering" &&
    (policy.exportRateKind === "retail" ||
      policy.exportRateKind === "percentOfRetail" ||
      (policy.exportRateKind == null && policy.exportRate === "retail"))
  ) {
    errors.push(
      'profile.exportPolicy.lockYears has no effect on a "retail" or percentOfRetail export rate: both track the schedule\'s own retail rate by construction (already escalated by retailEscalation), so there is no fixed dollar figure for a vintage lock to freeze. Use a numeric, monthlyTable, or timeTable export rate to model a locked export rate instead.',
    );
  }

  if (policy.type === "avoidedCostCredit") {
    validateAvoidedCostRate(policy, errors);
  } else if (policy.type === "netMetering") {
    if (policy.netting !== null && !NETTING_MODES.includes(policy.netting)) {
      errors.push(notPermittedMessage("profile.exportPolicy.netting", policy.netting, { nullable: true }));
    }
    validateNetMeteringRate(policy, errors);
    validateTrueUp(policy, errors);
  } else {
    errors.push(notPermittedMessage("profile.exportPolicy.type", policy.type));
  }
}

function validateSystemSizeCharges(charges, errors) {
  if (charges === null || charges === undefined) return;
  if (!Array.isArray(charges)) {
    errors.push("profile.systemSizeCharges must be an array.");
    return;
  }
  charges.forEach((c, i) => {
    if (!SYSTEM_SIZE_CHARGE_BASES.includes(c?.basis)) {
      errors.push(`profile.systemSizeCharges[${i}] ${notPermittedMessage("profile.systemSizeCharges[].basis", c?.basis, { label: "basis" })}`);
    }
    if (!isNonNegNumberOrNull(c?.ratePerMonth) || c?.ratePerMonth === null) {
      errors.push(`profile.systemSizeCharges[${i}].ratePerMonth must be a non-negative number.`);
    }
  });
}

function validateConstraints(constraints, errors) {
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) {
    errors.push("profile.constraints is required.");
    return;
  }
  const financing = constraints.allowedFinancing;
  if (!Array.isArray(financing) || financing.length === 0 || financing.some((f) => !FINANCING_TYPES.includes(f))) {
    errors.push(
      `profile.constraints.allowedFinancing must be a non-empty array containing only values from ${quotedList(FINANCING_TYPES)}; found ${JSON.stringify(financing)}.`,
    );
  }
  const fees = constraints.interconnectionFees;
  if (!fees || typeof fees !== "object" || !isNonNegNumberOrNull(fees.singlePhase) || !isNonNegNumberOrNull(fees.threePhase)) {
    errors.push("profile.constraints.interconnectionFees must have non-negative singlePhase and threePhase numbers, or null.");
  }
}

function validateSources(sources, errors) {
  if (!Array.isArray(sources)) {
    errors.push("sources must be an array.");
    return;
  }
  for (const s of sources) {
    if (!s || typeof s.section !== "string" || !SOURCE_SECTIONS.includes(s.section)) {
      errors.push(`every entry in sources must have a "section" that is one of: ${SOURCE_SECTIONS.join(", ")}.`);
    }
    if (!s || typeof s.url !== "string" || !s.url) {
      errors.push('every entry in sources must have a non-empty string "url".');
    }
  }
}

function validateNotes(notes, errors) {
  if (notes === undefined) return;
  if (!Array.isArray(notes)) {
    errors.push("notes must be an array.");
    return;
  }
  for (const n of notes) {
    if (!n || typeof n.field !== "string" || !n.field || typeof n.note !== "string" || !n.note) {
      errors.push('every entry in notes must have a string "field" and a string "note".');
    }
  }
}

/**
 * Warnings for a structurally valid parse: every null leaf (an unverifiable
 * field the LLM flagged) surfaced with its note if one was given, plus any
 * note whose field path doesn't match a known field (likely a typo or a
 * hallucinated field name).
 *
 * Only the pricing/export fields the chosen pricing.type/exportPolicy.type
 * actually uses are null-checked: buildResearchPrompt tells the LLM to fill
 * exactly one pricing structure and "leave the other two pricing fields
 * null," so a flat-seasonal profile's null tiered/TOU fields (and a
 * netMetering profile's null avoidedCostCredit rate, or vice versa) are the
 * schema requiring null for that type, not something the LLM failed to
 * verify -- surfacing them as warnings would flag every fully-verified,
 * compliant import.
 *
 * profile.demand is deliberately absent from this list regardless of type,
 * and so are minimumBillPerMonth, systemSizeCharges, exportPolicy.lockYears,
 * and exportPolicy.trueUpKind/trueUpRate: null/absent there each mean "this
 * utility has none of this" or "no explicit rule found," a complete,
 * confirmed finding rather than a placeholder for something the LLM could
 * not verify, so none of them warrant a warning on its own.
 *
 * `profile` here is the RAW wire-format object (parsed.profile), not
 * builtProfile -- the kind-gated fields this function null-checks
 * (exportPolicy.ratePerKWhMonthlyValues and friends) only exist on the wire
 * shape; buildExportPolicy folds them into builtProfile's single canonical
 * ExportRate value before this function would ever see it.
 */
function buildWarnings(profile, notes, sourcesCount) {
  const warnings = [];
  const notesByField = new Map();
  for (const n of notes) {
    if (n && typeof n.field === "string") notesByField.set(n.field, n.note);
  }

  const pricingType = profile.pricing?.type;
  const exportType = profile.exportPolicy?.type;

  const nullChecks = [
    ["profile.fixedChargePerMonth", profile.fixedChargePerMonth],
    ["profile.constraints.interconnectionFees.singlePhase", profile.constraints?.interconnectionFees?.singlePhase],
    ["profile.constraints.interconnectionFees.threePhase", profile.constraints?.interconnectionFees?.threePhase],
  ];
  if (pricingType === "flat-seasonal") {
    nullChecks.push(
      ["profile.pricing.summerRate", profile.pricing?.summerRate],
      ["profile.pricing.winterRate", profile.pricing?.winterRate],
    );
  } else if (pricingType === "tiered") {
    nullChecks.push(
      ["profile.pricing.rates", profile.pricing?.rates],
      ["profile.pricing.breakpoints.summer", profile.pricing?.breakpoints?.summer],
      ["profile.pricing.breakpoints.winter", profile.pricing?.breakpoints?.winter],
    );
  } else if (pricingType === "tou") {
    nullChecks.push(["profile.pricing.periods", profile.pricing?.periods]);
  } else if (pricingType === "all-units-blocks") {
    nullChecks.push(
      ["profile.pricing.blocks.summer", profile.pricing?.blocks?.summer],
      ["profile.pricing.blocks.winter", profile.pricing?.blocks?.winter],
    );
  }

  // Which sibling field actually carries the rate depends on each policy's
  // own *Kind selector (see buildExportPolicy above) -- only that one field
  // is checked, the same "only the fields this profile's own type actually
  // uses" filtering this function already does for pricing above.
  const avoidedKind = profile.exportPolicy?.ratePerKWhKind ?? "flat";
  const netKind = profile.exportPolicy?.exportRateKind ?? (profile.exportPolicy?.exportRate === "retail" ? "retail" : "flat");
  if (exportType === "avoidedCostCredit") {
    if (avoidedKind === "flat") nullChecks.push(["profile.exportPolicy.ratePerKWh", profile.exportPolicy?.ratePerKWh]);
    else if (avoidedKind === "monthlyTable") nullChecks.push(["profile.exportPolicy.ratePerKWhMonthlyValues", profile.exportPolicy?.ratePerKWhMonthlyValues]);
    else if (avoidedKind === "timeTable") nullChecks.push(["profile.exportPolicy.ratePerKWhPeriods", profile.exportPolicy?.ratePerKWhPeriods]);
  } else if (exportType === "netMetering") {
    nullChecks.push(["profile.exportPolicy.netting", profile.exportPolicy?.netting]);
    if (netKind === "retail" || netKind === "flat") nullChecks.push(["profile.exportPolicy.exportRate", profile.exportPolicy?.exportRate]);
    else if (netKind === "monthlyTable") nullChecks.push(["profile.exportPolicy.exportRateMonthlyValues", profile.exportPolicy?.exportRateMonthlyValues]);
    else if (netKind === "timeTable") nullChecks.push(["profile.exportPolicy.exportRatePeriods", profile.exportPolicy?.exportRatePeriods]);
    else if (netKind === "percentOfRetail") nullChecks.push(["profile.exportPolicy.exportRateFraction", profile.exportPolicy?.exportRateFraction]);
  }

  for (const [field, value] of nullChecks) {
    if (value !== null) continue;
    const note = notesByField.get(field);
    warnings.push(note ? `${field} is null: ${note}` : `${field} is null with no explanatory note.`);
  }

  // Every field SCHEMA_FIELDS allows to be null, regardless of the profile's
  // own pricing/export type -- a note's field path is checked against the
  // full set here (not just nullChecks above, which is type-filtered), so a
  // note about a field that's simply inapplicable to this type isn't
  // mistaken for an unrecognized/hallucinated field name.
  const knownFields = new Set([
    "profile.fixedChargePerMonth",
    "profile.minimumBillPerMonth",
    "profile.pricing.summerRate",
    "profile.pricing.winterRate",
    "profile.pricing.rates",
    "profile.pricing.breakpoints.summer",
    "profile.pricing.breakpoints.winter",
    "profile.pricing.periods",
    "profile.pricing.blocks.summer",
    "profile.pricing.blocks.winter",
    "profile.systemSizeCharges",
    "profile.exportPolicy.lockYears",
    "profile.exportPolicy.ratePerKWh",
    "profile.exportPolicy.ratePerKWhMonthlyValues",
    "profile.exportPolicy.ratePerKWhPeriods",
    "profile.exportPolicy.netting",
    "profile.exportPolicy.exportRate",
    "profile.exportPolicy.exportRateMonthlyValues",
    "profile.exportPolicy.exportRatePeriods",
    "profile.exportPolicy.exportRateFraction",
    "profile.exportPolicy.trueUpKind",
    "profile.exportPolicy.trueUpRate",
    "profile.constraints.interconnectionFees.singlePhase",
    "profile.constraints.interconnectionFees.threePhase",
    "profile.demand",
  ]);
  for (const n of notes) {
    if (n && typeof n.field === "string" && !knownFields.has(n.field)) {
      warnings.push(`notes referenced an unrecognized field "${n.field}"; it was ignored.`);
    }
  }

  if (!sourcesCount) warnings.push("No sources were cited; this profile's figures could not be traced back to an official source.");

  return warnings;
}

/**
 * Parses raw pasted text (tolerating surrounding prose and markdown fences)
 * into { profile, meta, warnings } ready to hand to buildCustomProfile, or
 * { error } when the text cannot yield a usable profile. Never throws: any
 * unexpected failure is caught and reported through the same { error } shape.
 */
export function parseProfileImport(text) {
  try {
    if (typeof text !== "string" || !text.trim()) {
      return { error: "Paste the assistant's reply first; there is nothing to import." };
    }
    if (text.length > MAX_INPUT_CHARS) {
      return { error: `Pasted text is ${text.length.toLocaleString()} characters, over the ${MAX_INPUT_CHARS.toLocaleString()}-character limit. Paste only the assistant's JSON block, not the whole conversation.` };
    }

    const jsonText = extractJsonText(text);
    if (!jsonText) {
      return { error: "No JSON object was found in the pasted text. Paste the assistant's full reply, including its fenced JSON block." };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return { error: `The extracted JSON could not be parsed: ${e.message}` };
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Expected a JSON object at the top level, not an array or a bare value." };
    }

    const errors = [];

    if (parsed.formatVersion !== FORMAT_VERSION) {
      return { error: `Unsupported formatVersion ${JSON.stringify(parsed.formatVersion)}; this importer only reads formatVersion ${FORMAT_VERSION}.` };
    }
    if (typeof parsed.utilityName !== "string" || !parsed.utilityName.trim()) errors.push("utilityName is required.");
    if (typeof parsed.location !== "string") errors.push("location must be a string (it may be empty).");

    validateSources(parsed.sources, errors);
    validateNotes(parsed.notes, errors);

    const profile = parsed.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return { error: "profile is required." };
    }

    if (!isNonNegNumberOrNull(profile.fixedChargePerMonth)) {
      errors.push("profile.fixedChargePerMonth must be a non-negative number or null.");
    }
    if (profile.minimumBillPerMonth !== null && profile.minimumBillPerMonth !== undefined && !isNonNegNumberOrNull(profile.minimumBillPerMonth)) {
      errors.push("profile.minimumBillPerMonth must be a non-negative number or null.");
    }
    validatePricing(profile.pricing, errors);
    validateDemand(profile.demand, errors);
    validateSystemSizeCharges(profile.systemSizeCharges, errors);
    validateAdders(profile.adders, errors);
    validateRiders(profile.riders, errors);
    validateExportPolicy(profile.exportPolicy, errors);
    validateConstraints(profile.constraints, errors);

    if (errors.length > 0) {
      return { error: errors.join(" ") };
    }

    // Normalize any TOU periods down to their plain, JSON-safe shape
    // (id/rate/window descriptor only); every other section is already
    // JSON-safe as parsed. No applies() function is built here -- see this
    // module's header and calc/tariffs/custom.js's buildCustomProfile.
    const builtPricing =
      profile.pricing.type === "tou" && Array.isArray(profile.pricing.periods)
        ? {
            ...profile.pricing,
            periods: profile.pricing.periods.map((p) => ({
              id: p.id,
              rate: { summer: p.rate.summer, winter: p.rate.winter },
              window: { hours: p.window.hours, days: p.window.days ?? "all", excludeHolidays: p.window.excludeHolidays ?? false },
            })),
          }
        : profile.pricing;

    const builtProfile = {
      id: "custom",
      label: parsed.utilityName.trim(),
      fixedChargePerMonth: profile.fixedChargePerMonth,
      pricing: builtPricing,
      demand: profile.demand ?? null,
      ...(profile.minimumBillPerMonth != null ? { minimumBillPerMonth: profile.minimumBillPerMonth } : {}),
      ...(Array.isArray(profile.systemSizeCharges) && profile.systemSizeCharges.length > 0
        ? { systemSizeCharges: profile.systemSizeCharges }
        : {}),
      adders: profile.adders ?? [],
      riders: profile.riders ?? [],
      exportPolicy: withExportPolicyDefaults(buildExportPolicy(profile.exportPolicy)),
      constraints: profile.constraints,
    };

    const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const sourcesCount = Array.isArray(parsed.sources) ? parsed.sources.length : 0;
    // The RAW wire-format profile, not builtProfile: buildWarnings' nullChecks
    // read each kind-gated field by its own wire name (e.g.
    // exportPolicy.ratePerKWhMonthlyValues), which buildExportPolicy above has
    // already folded into builtProfile's single canonical ExportRate value by
    // this point.
    const warnings = buildWarnings(profile, notes, sourcesCount);

    return {
      profile: builtProfile,
      meta: {
        utilityName: parsed.utilityName.trim(),
        location: parsed.location,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        notes,
      },
      warnings,
    };
  } catch (e) {
    return { error: `Could not import this profile: ${e.message}` };
  }
}

// --- symmetric export --------------------------------------------------

/**
 * Strips a TOU pricing block's `applies` functions back down to their
 * JSON-safe window descriptor, so the exported text is exactly the shape
 * parseProfileImport accepts back in.
 */
function serializablePricing(pricing) {
  if (!pricing || pricing.type !== "tou" || !Array.isArray(pricing.periods)) return pricing;
  return {
    ...pricing,
    periods: pricing.periods.map((p) => ({
      id: p.id,
      rate: p.rate,
      window: p.window || { hours: [0, 0], days: "all", excludeHolidays: false },
    })),
  };
}

/**
 * Converts one canonical ExportRate value (a plain number, "retail", or a
 * {kind, ...} object -- calc/tariffs/profile.js's typedef) into this
 * module's own wire-format {kind, flatValue, monthlyValues, periods,
 * fraction} fields, the exact inverse of buildExportRateValue above. A
 * timeTable period's window is passed straight through (already the
 * JSON-safe descriptor form buildExportRateValue itself produces, and the
 * only form a canonical timeTable period ever carries -- calc/tariffs/
 * custom.js's buildCustomProfile is what turns it into a real applies()
 * function, downstream of both directions of this codec).
 */
function serializeExportRateValue(rate) {
  if (rate === "retail") return { kind: "retail", flatValue: "retail" };
  if (rate == null || typeof rate === "number") return { kind: "flat", flatValue: rate ?? null };
  if (rate.kind === "monthlyTable") return { kind: "monthlyTable", monthlyValues: rate.monthlyValues };
  if (rate.kind === "timeTable") {
    return {
      kind: "timeTable",
      periods: rate.periods.map((p) => ({
        id: p.id,
        rate: { summer: p.rate.summer, winter: p.rate.winter },
        window: p.window || { hours: [0, 0], days: "all", excludeHolidays: false },
      })),
    };
  }
  if (rate.kind === "percentOfRetail") return { kind: "percentOfRetail", fraction: rate.fraction };
  return { kind: "flat", flatValue: null };
}

/**
 * Converts one canonical ExportPolicy (buildExportPolicy's own output shape)
 * back into the wire-format exportPolicy (kind + kind-gated sibling fields),
 * the exact inverse of buildExportPolicy above. avoidedCostCredit's
 * addersApply/carryForward/cashOut are deliberately left off the wire
 * output: withExportPolicyDefaults (above) fills those in as billing-engine
 * plumbing that is never sourced from user input in the first place (see
 * that function's own comment), so they have no wire-format field to
 * round-trip through and parseProfileImport re-derives them identically on
 * the way back in.
 */
function serializeExportPolicy(exportPolicy) {
  if (!exportPolicy || typeof exportPolicy !== "object") return exportPolicy;
  const base = { type: exportPolicy.type, lockYears: exportPolicy.lockYears ?? null };

  if (exportPolicy.type === "avoidedCostCredit") {
    const { kind, flatValue, monthlyValues, periods } = serializeExportRateValue(exportPolicy.ratePerKWh);
    return {
      ...base,
      ratePerKWhKind: kind,
      ratePerKWh: kind === "flat" ? flatValue : null,
      ratePerKWhMonthlyValues: kind === "monthlyTable" ? monthlyValues : null,
      ratePerKWhPeriods: kind === "timeTable" ? periods : null,
    };
  }

  const { kind, flatValue, monthlyValues, periods, fraction } = serializeExportRateValue(exportPolicy.exportRate);
  const trueUp = exportPolicy.trueUp;
  const trueUpKind = trueUp === "forfeit" ? "forfeit" : trueUp && typeof trueUp === "object" ? "cashOut" : "none";
  return {
    ...base,
    netting: exportPolicy.netting,
    exportRateKind: kind,
    exportRate: kind === "flat" || kind === "retail" ? flatValue : null,
    exportRateMonthlyValues: kind === "monthlyTable" ? monthlyValues : null,
    exportRatePeriods: kind === "timeTable" ? periods : null,
    exportRateFraction: kind === "percentOfRetail" ? fraction : null,
    trueUpKind,
    trueUpRate: trueUpKind === "cashOut" ? trueUp.rate : null,
  };
}

/**
 * Serializes a household's custom profile back into the wire format, for
 * the "Copy my profile as JSON" export. Accepts either
 * { utilityName, location, sources, notes, profile } or a bare profile
 * object (as stored in household.customProfileInputs), so the export button
 * can hand this the same shape HouseholdSection already holds.
 */
export function serializeProfile(state) {
  const hasWrapper = state && typeof state === "object" && state.profile && typeof state.profile === "object";
  const profile = hasWrapper ? state.profile : state || {};
  const utilityName = (hasWrapper && state.utilityName) || profile.label || "Custom Utility";
  const location = (hasWrapper && state.location) || "";
  const sources = (hasWrapper && Array.isArray(state.sources) && state.sources) || [];
  const notes = (hasWrapper && Array.isArray(state.notes) && state.notes) || [];

  const wire = {
    formatVersion: FORMAT_VERSION,
    utilityName,
    location,
    sources,
    profile: {
      fixedChargePerMonth: profile.fixedChargePerMonth ?? null,
      pricing: serializablePricing(profile.pricing),
      demand: profile.demand ?? null,
      minimumBillPerMonth: profile.minimumBillPerMonth ?? null,
      systemSizeCharges: profile.systemSizeCharges || [],
      adders: profile.adders || [],
      riders: profile.riders || [],
      exportPolicy: serializeExportPolicy(profile.exportPolicy),
      constraints: profile.constraints,
    },
    notes,
  };

  return JSON.stringify(wire, null, 2);
}
