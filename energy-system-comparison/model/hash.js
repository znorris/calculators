// A short, deterministic, non-cryptographic digest of a JSON-serializable
// value. components/ExplorerSection.jsx uses this to key its cached sweep
// results against {household, assumptions}: a hash (rather than comparing
// object references) still recognizes "nothing actually changed" across a
// scenario load or share-link apply that rebuilds an equal-by-value object
// under a new reference.

/** FNV-1a, 32-bit, over a UTF-16 code-unit walk of `str` (no TextEncoder dependency). */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable hex digest of `value` via JSON.stringify + FNV-1a. Key order matters, same as JSON.stringify itself. */
export function hashValue(value) {
  return fnv1a(JSON.stringify(value)).toString(16).padStart(8, "0");
}

/**
 * Whether a hashed request/result (`requestHash`, the {household,
 * assumptions} hash a sweep was launched or completed against) no longer
 * matches `liveHash` (the current inputs hash, read fresh at the moment of
 * the call -- never a value captured in a closure from whenever the request
 * was created, since that closure is exactly what goes stale while a sweep
 * is in flight). `requestHash` of null means "no request outstanding," which
 * is never stale regardless of `liveHash`.
 *
 * components/ExplorerSection.jsx calls this from two places against the same
 * ref: once per inputs change, to decide whether to cancel an in-flight
 * sweep (or clear a completed one) whose target no longer matches; and once
 * more inside the worker's onmessage handler itself, since a message already
 * in the event queue when the input changed can still arrive after that
 * cancellation runs.
 */
export function sweepIsStale(requestHash, liveHash) {
  return requestHash != null && requestHash !== liveHash;
}
