// URL ↔ state helpers for sharing calculator inputs via query params.
//
// schema shape: { booleans: ["fieldA"], strings: ["fieldB"], enums: { fieldB: ["one", "two"] } }
// Any field not in `booleans` or `strings` is treated as numeric.

export function encodeStateToParams(state) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v == null) continue;
    if (typeof v === "boolean") params.set(k, v ? "1" : "0");
    else params.set(k, String(v));
  }
  return params.toString();
}

export function parseUrlParams(schema = {}) {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  if ([...search.keys()].length === 0) return null;
  const booleans = new Set(schema.booleans || []);
  const strings = new Set(schema.strings || []);
  const enums = schema.enums || {};
  const obj = {};
  for (const [k, v] of search) {
    if (booleans.has(k)) {
      obj[k] = v === "1";
    } else if (strings.has(k)) {
      if (enums[k] && !enums[k].includes(v)) continue;
      obj[k] = v;
    } else {
      const n = Number(v);
      if (!isNaN(n) && isFinite(n)) obj[k] = n;
    }
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

export function stripUrlParams() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}

export function buildShareUrl(state) {
  const params = encodeStateToParams(state);
  return `${window.location.origin}${window.location.pathname}?${params}`;
}
