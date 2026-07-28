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

export function upsertComparison(comparisons, comparison) {
  const i = comparisons.findIndex((c) => c.id === comparison.id);
  if (i === -1) return [...comparisons, comparison];
  const next = [...comparisons];
  next[i] = comparison;
  return next;
}
