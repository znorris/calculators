// Share-link encoding.
//
// A share link has to inline the full offer data, because the recipient has no
// access to the author's offer library and the ids in a comparison would
// resolve to nothing. `shared/urlState.js` encodes a flat key-value state,
// which cannot hold an array of offer records, so this calculator carries its
// own codec.
//
// Encoding is base64url over JSON. It is not compact, but it round-trips
// exactly, needs no per-field registry to stay in sync with the schema, and
// keeps unknown fields intact when an older build opens a newer link.

import { normalizeOffer } from "./offer.js";
import { normalizeComparison } from "./comparison.js";

const PARAM = "c";
const FORMAT_VERSION = 1;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Strip fields that only matter locally, to keep the link shorter. */
function slimOffer(offer) {
  const { createdAt, updatedAt, ...rest } = offer;
  return rest;
}

function slimComparison(comparison) {
  const { createdAt, updatedAt, ...rest } = comparison;
  return rest;
}

/**
 * Encode a comparison and the offers it references into a payload string.
 * Offers not referenced by the comparison are not included; a share link
 * carries one comparison, not the whole library.
 */
export function encodeShare(comparison, offersById) {
  const offers = comparison.offerIds.map((id) => offersById[id]).filter(Boolean).map(slimOffer);
  const payload = { v: FORMAT_VERSION, comparison: slimComparison(comparison), offers };
  return toBase64Url(JSON.stringify(payload));
}

export function buildShareUrl(comparison, offersById) {
  const encoded = encodeShare(comparison, offersById);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${PARAM}=${encoded}`;
}

/**
 * Decode a payload string back into `{ comparison, offers }`, or null.
 *
 * A malformed or truncated payload returns null rather than throwing, since a
 * link is user-supplied input and a broken one should not take the page down.
 * Kept separate from `parseShareUrl` so it can be exercised without a DOM.
 */
export function decodeShare(encoded) {
  if (!encoded) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload || typeof payload !== "object") return null;
    if (payload.v !== FORMAT_VERSION) return null;

    const offers = Array.isArray(payload.offers) ? payload.offers.map(normalizeOffer) : [];
    const comparison = normalizeComparison(payload.comparison);

    // Drop references the payload did not actually carry, so a truncated link
    // yields a smaller valid comparison rather than dangling ids.
    const present = new Set(offers.map((o) => o.id));
    comparison.offerIds = comparison.offerIds.filter((id) => present.has(id));
    if (!comparison.offerIds.includes(comparison.baselineId)) {
      comparison.baselineId = comparison.offerIds[0] ?? null;
    }
    return { comparison, offers };
  } catch {
    return null;
  }
}

/** Read a shared comparison out of the current URL. */
export function parseShareUrl() {
  if (typeof window === "undefined") return null;
  return decodeShare(new URLSearchParams(window.location.search).get(PARAM));
}

export function stripShareParam() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}
