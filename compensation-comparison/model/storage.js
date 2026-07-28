// localStorage persistence for the two record types.
//
// `shared/scenarios.js` stores a scenario as one flat input blob, which is
// what the other calculators need. This calculator keeps two keyed
// collections instead, because a comparison references offers by id and
// deleting a referenced offer has to be refused rather than silently
// orphaning it.

import { normalizeOffer } from "./offer.js";
import { normalizeComparison, comparisonsReferencing } from "./comparison.js";

const OFFERS_KEY = "comp-comparison:offers";
const COMPARISONS_KEY = "comp-comparison:comparisons";
const CURRENT_KEY = "comp-comparison:current";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled. The in-memory state stays correct;
    // the caller decides whether to surface this.
    return false;
  }
}

export function loadOffers() {
  return readJson(OFFERS_KEY, []).map(normalizeOffer);
}

export function saveOffers(offers) {
  return writeJson(OFFERS_KEY, offers);
}

export function loadComparisons() {
  return readJson(COMPARISONS_KEY, []).map(normalizeComparison);
}

export function saveComparisons(comparisons) {
  return writeJson(COMPARISONS_KEY, comparisons);
}

/**
 * Which saved comparison is open.
 *
 * Only the id is stored. The comparisons themselves live in one list, so
 * keeping a second copy of the open one would let the two drift apart.
 */
export function loadActiveComparisonId() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}

export function saveActiveComparisonId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, String(id));
    else localStorage.removeItem(CURRENT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove everything this calculator has stored on the device.
 *
 * Named keys rather than `localStorage.clear()`, which would also wipe the
 * other calculators' saved scenarios on the same origin.
 */
export function clearStoredData() {
  for (const key of [OFFERS_KEY, COMPARISONS_KEY, CURRENT_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage disabled. Nothing was stored either, so nothing to remove.
    }
  }
}

/** Index an offer array by id. */
export function indexById(offers) {
  return Object.fromEntries(offers.map((o) => [o.id, o]));
}

/**
 * Delete an offer, refusing if any comparison still references it.
 *
 * Returns `{ ok: true, offers }` on success, or `{ ok: false, blockedBy }`
 * listing the comparisons that hold it, so the caller can name them.
 */
export function deleteOffer(offers, comparisons, offerId) {
  const blockedBy = comparisonsReferencing(comparisons, offerId);
  if (blockedBy.length > 0) return { ok: false, blockedBy };
  return { ok: true, offers: offers.filter((o) => o.id !== offerId) };
}

export function upsertOffer(offers, offer) {
  const i = offers.findIndex((o) => o.id === offer.id);
  if (i === -1) return [...offers, offer];
  const next = [...offers];
  next[i] = offer;
  return next;
}

/**
 * Remove a comparison, and with it any offer no remaining comparison uses.
 *
 * Nothing can reach an offer outside a comparison, so leaving one behind is a
 * record the user cannot see or delete.
 */
export function deleteComparison(offers, comparisons, comparisonId) {
  const remaining = comparisons.filter((c) => c.id !== comparisonId);
  const stillUsed = new Set(remaining.flatMap((c) => c.offerIds));
  return {
    comparisons: remaining,
    offers: offers.filter((o) => stillUsed.has(o.id)),
  };
}

/**
 * Remove an offer from one comparison, deleting the record only when no other
 * comparison references it. An offer can belong to several comparisons, so
 * dropping it from one must not destroy it for the rest.
 */
export function removeOfferFromComparison(offers, comparisons, comparisonId, offerId) {
  const nextComparisons = comparisons.map((c) =>
    c.id === comparisonId
      ? {
          ...c,
          offerIds: c.offerIds.filter((id) => id !== offerId),
          baselineId: c.baselineId === offerId ? (c.offerIds.find((id) => id !== offerId) ?? null) : c.baselineId,
        }
      : c,
  );
  const stillUsed = new Set(nextComparisons.flatMap((c) => c.offerIds));
  return {
    comparisons: nextComparisons,
    offers: offers.filter((o) => stillUsed.has(o.id)),
  };
}

export function upsertComparison(comparisons, comparison) {
  const i = comparisons.findIndex((c) => c.id === comparison.id);
  if (i === -1) return [...comparisons, comparison];
  const next = [...comparisons];
  next[i] = comparison;
  return next;
}
