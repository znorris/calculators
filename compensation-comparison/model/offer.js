// An offer is a standalone, named record holding one employer's compensation
// terms. It is a point-in-time snapshot: "Acme 2026" is a separate
// record from "Acme 2024" rather than an edit of it.
//
// Offers carry no type field. Nothing declares whether an offer is hourly,
// salaried, or equity-heavy; that is inferred from which values are present.

import { SECTIONS, isFieldVisible } from "./schema.js";

let idCounter = 0;

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  idCounter += 1;
  return `${prefix}-${idCounter}-${String(Math.floor(performance.now() * 1000))}`;
}

/** Default values for every field in the schema, keyed by field id. */
export function defaultValues() {
  const out = {};
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      out[field.id] = field.type === "list" ? [] : field.default;
    }
  }
  return out;
}

/** Create a new offer, optionally seeded with values. */
export function createOffer(overrides = {}) {
  return {
    id: newId("offer"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...defaultValues(),
    // Not a schema field. The factors themselves belong to the comparison,
    // since how much you care about work-life balance is a property of you;
    // only the per-offer rating lives here, keyed by factor id.
    factorRatings: {},
    ...overrides,
  };
}

/**
 * Copy an offer under a new id. This is the supported path for entering the
 * same employer in a later year, since comparisons reference offers by id and
 * editing in place would rewrite history in every comparison holding it.
 */
export function duplicateOffer(offer, nameSuffix = " (copy)") {
  return {
    ...structuredClone(offer),
    id: newId("offer"),
    name: `${offer.name || "Untitled"}${nameSuffix}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Apply a field change, returning a new offer. */
export function setField(offer, fieldId, value) {
  return { ...offer, [fieldId]: value, updatedAt: Date.now() };
}

/** Create a blank item for a `list` field, using its itemFields defaults. */
export function createListItem(field) {
  const item = { id: newId("item") };
  for (const sub of field.itemFields || []) item[sub.id] = sub.default;
  return item;
}

/**
 * Fill in any field the record is missing, so an offer stored before a schema
 * change still loads. Unknown keys are preserved rather than dropped, so a
 * record written by a newer version survives a round trip through an older one.
 */
export function normalizeOffer(raw) {
  const defaults = defaultValues();
  const out = { ...defaults, ...raw };
  out.id = raw?.id || newId("offer");
  out.createdAt = raw?.createdAt || Date.now();
  out.updatedAt = raw?.updatedAt || Date.now();
  out.factorRatings = raw?.factorRatings && typeof raw.factorRatings === "object" ? raw.factorRatings : {};
  for (const [key, value] of Object.entries(defaults)) {
    if (Array.isArray(value) && !Array.isArray(out[key])) out[key] = [];
  }
  return out;
}

/** A display label that never renders as empty. */
export function offerLabel(offer, fallback = "Untitled offer") {
  return offer?.name?.trim() || fallback;
}

/**
 * Spreadsheet-style column letters: 0 is A, 25 is Z, 26 is AA.
 *
 * Unbounded, so a comparison with more than 26 offers keeps going rather than
 * wrapping around to a name already in use.
 */
export function columnLetters(index) {
  let out = "";
  let n = index;
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * The next default offer name, as the first letter not already taken.
 *
 * Counting offers would reuse a letter after a removal: delete Offer A from a
 * pair and the count says 1, which is B, which already exists.
 */
export function nextOfferName(offers) {
  const taken = new Set(offers.map((o) => (o?.name || "").trim()));
  for (let i = 0; ; i += 1) {
    const candidate = `Offer ${columnLetters(i)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Whether a field holds something the user actually entered, as opposed to
 * sitting at its default. Drives the auto-expand rule.
 */
export function isFieldFilled(field, values) {
  const value = values[field.id];
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (field.type === "bool") return value !== field.default;
  if (typeof value === "number") return value !== 0 && value !== field.default;
  return value !== field.default;
}

/** Whether any visible field in a section holds user-entered data. */
export function sectionHasData(section, offer) {
  return section.fields.some(
    (field) => isFieldVisible(field, offer) && isFieldFilled(field, offer),
  );
}

/**
 * Section ids that should render expanded across every column.
 *
 * Expansion is a property of the comparison rather than of one offer: offers
 * are columns sharing a row set, so a container open in one column and closed
 * in another would break row alignment. A section opens if ANY offer has data
 * in it, which makes a gap visible instead of hiding it.
 */
export function sectionsWithData(offers) {
  const open = new Set();
  for (const section of SECTIONS) {
    if (section.alwaysOpen) {
      open.add(section.id);
      continue;
    }
    if (offers.some((offer) => sectionHasData(section, offer))) open.add(section.id);
  }
  return open;
}
