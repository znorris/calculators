// A comparison is a named set of offers viewed together. It references offers
// by id rather than embedding copies, so correcting a field on an offer
// propagates to every comparison holding it.
//
// Fields that belong to the person rather than to any one job live here:
// filing status is identical across every offer being compared, so storing it
// per offer would duplicate it N times and let the copies drift.

let idCounter = 0;

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  idCounter += 1;
  return `${prefix}-${idCounter}-${String(Math.floor(performance.now() * 1000))}`;
}

export const DEFAULT_HORIZON_YEARS = 5;
export const MIN_HORIZON_YEARS = 1;
export const MAX_HORIZON_YEARS = 10;

export function createComparison(overrides = {}) {
  return {
    id: newId("cmp"),
    name: "",
    offerIds: [],
    baselineId: null,
    pinnedId: REPORT_COLUMN_ID,
    filingStatus: "single",
    dependents: 0,
    taxYear: 2026,
    horizonYears: DEFAULT_HORIZON_YEARS,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * The report is a column in the same set as the offers rather than a panel
 * below them, so it needs an id that can sit in the same ordering and pinning
 * machinery. It is not an offer id and never appears in `offerIds`.
 */
export const REPORT_COLUMN_ID = "__report__";

/**
 * Column ids in render order: the report, then the offers.
 *
 * The report leads because it is the primary comparison surface and the offer
 * columns are mostly an input surface. On a phone, where one column shows at a
 * time, leading with the offers would put the answer behind a swipe.
 */
export function columnOrder(comparison) {
  return [REPORT_COLUMN_ID, ...comparison.offerIds];
}

export function addOffer(comparison, offerId) {
  if (comparison.offerIds.includes(offerId)) return comparison;
  const offerIds = [...comparison.offerIds, offerId];
  return {
    ...comparison,
    offerIds,
    baselineId: comparison.baselineId ?? offerId,
    updatedAt: Date.now(),
  };
}

export function removeOffer(comparison, offerId) {
  const offerIds = comparison.offerIds.filter((id) => id !== offerId);
  return {
    ...comparison,
    offerIds,
    baselineId: comparison.baselineId === offerId ? (offerIds[0] ?? null) : comparison.baselineId,
    pinnedId: comparison.pinnedId === offerId ? REPORT_COLUMN_ID : comparison.pinnedId,
    updatedAt: Date.now(),
  };
}

/** Move an offer column to a new index within the offer list. */
export function moveOffer(comparison, offerId, toIndex) {
  const from = comparison.offerIds.indexOf(offerId);
  if (from === -1) return comparison;
  const clamped = Math.max(0, Math.min(toIndex, comparison.offerIds.length - 1));
  if (clamped === from) return comparison;
  const offerIds = [...comparison.offerIds];
  offerIds.splice(from, 1);
  offerIds.splice(clamped, 0, offerId);
  return { ...comparison, offerIds, updatedAt: Date.now() };
}

export function setBaseline(comparison, offerId) {
  if (!comparison.offerIds.includes(offerId)) return comparison;
  return { ...comparison, baselineId: offerId, updatedAt: Date.now() };
}

export function setPinned(comparison, columnId) {
  return { ...comparison, pinnedId: columnId, updatedAt: Date.now() };
}

export function normalizeComparison(raw) {
  const base = createComparison();
  const out = { ...base, ...raw };
  out.offerIds = Array.isArray(raw?.offerIds) ? raw.offerIds.filter(Boolean) : [];
  if (!out.offerIds.includes(out.baselineId)) out.baselineId = out.offerIds[0] ?? null;
  out.horizonYears = clampHorizon(out.horizonYears);
  return out;
}

export function clampHorizon(years) {
  const n = Number(years);
  if (!Number.isFinite(n)) return DEFAULT_HORIZON_YEARS;
  return Math.max(MIN_HORIZON_YEARS, Math.min(MAX_HORIZON_YEARS, Math.round(n)));
}

/**
 * Offer ids referenced by a comparison that are absent from the offer library.
 * Deleting an offer a comparison still points at is blocked upstream, so a
 * non-empty result here means data arrived from somewhere else, such as an
 * older share link.
 */
export function danglingOfferIds(comparison, offersById) {
  return comparison.offerIds.filter((id) => !offersById[id]);
}

/** Comparisons that would break if the given offer were deleted. */
export function comparisonsReferencing(comparisons, offerId) {
  return comparisons.filter((c) => c.offerIds.includes(offerId));
}
