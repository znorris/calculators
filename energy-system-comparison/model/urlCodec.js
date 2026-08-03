// Share-link encoding.
//
// Encoding is base64url over JSON, same technique as
// compensation-comparison/model/urlCodec.js: it round-trips exactly and
// needs no per-field registry to stay in sync with the schema.
//
// THE PAYLOAD GOES IN THE FRAGMENT, NOT THE QUERY STRING.
//
// A fragment is never sent to the server, so a household's usage and system
// costs cannot land in GitHub Pages or CDN access logs the way a query
// string would. Search engines do not index a fragment as a distinct URL,
// so a link posted somewhere crawlable cannot be indexed with those figures
// in it. Referrer headers strip fragments too.
//
// Old query-string links are still accepted on read, since accepting one
// creates no exposure; generating one did.

import { normalizeState } from "./schema.js";
import { HOURS_PER_YEAR, monthOfHour } from "../calc/time.js";

const PARAM = "s";
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

function monthlySumsFromHourly(hourlyKWh) {
  const sums = new Array(12).fill(0);
  for (let h = 0; h < HOURS_PER_YEAR; h++) sums[monthOfHour(h)] += hourlyKWh[h] || 0;
  return sums;
}

/**
 * Hourly usage never goes in a share link: 8760 floats dwarf everything
 * else in the payload for a benefit -- reproducing one household's exact
 * hour-by-hour draw -- no recipient needs. A link carries usage.mode plus
 * annualKWh/monthlyKWh only; an hourly-mode household downgrades to its
 * monthly sums (computed via calc/time.js's monthOfHour) so the recipient
 * still sees a realistic seasonal shape, just not the hourly detail.
 */
function slimUsage(usage) {
  if (usage.mode === "hourly" && Array.isArray(usage.hourlyKWh)) {
    return {
      mode: "monthly",
      annualKWh: usage.annualKWh,
      monthlyKWh: monthlySumsFromHourly(usage.hourlyKWh),
      hourlyKWh: null,
    };
  }
  return { ...usage, hourlyKWh: null };
}

function slimState(state) {
  return {
    household: { ...state.household, usage: slimUsage(state.household.usage) },
    assumptions: state.assumptions,
    configs: state.configs,
  };
}

/** Encode app state into a payload string for the URL fragment. */
export function encodeShare(state) {
  const payload = { v: FORMAT_VERSION, state: slimState(state) };
  return toBase64Url(JSON.stringify(payload));
}

export function buildShareUrl(state) {
  const encoded = encodeShare(state);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${PARAM}=${encoded}`;
}

/**
 * Decode a payload string back into normalized state, or null.
 *
 * A malformed or truncated payload returns null rather than throwing, since
 * a link is user-supplied input and a broken one should not take the page
 * down. Kept separate from readPayload so it can be exercised without a
 * location-like object.
 */
export function decodeShare(encoded) {
  if (!encoded) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload || typeof payload !== "object") return null;
    if (payload.v !== FORMAT_VERSION) return null;
    return normalizeState(payload.state);
  } catch {
    return null;
  }
}

/**
 * Read a shared state out of a location-like object, preferring the
 * fragment. Query strings are still accepted so a link generated before the
 * move to fragments still opens.
 */
export function readPayload({ hash, search } = {}) {
  const fromHash = new URLSearchParams(String(hash || "").replace(/^#/, "")).get(PARAM);
  const encoded = fromHash || new URLSearchParams(search || "").get(PARAM);
  return decodeShare(encoded);
}

export function parseShareUrl() {
  if (typeof window === "undefined") return null;
  return readPayload(window.location);
}

export function stripShareParam() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}
