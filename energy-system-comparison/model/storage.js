// localStorage persistence for the working state, named scenarios, and the
// sizing explorer's last completed sweep.
//
// Unlike compensation-comparison, this calculator's whole state is one
// record (household + assumptions + configs), not a library of records
// referenced by id, so there is no "delete blocked by a reference" problem
// to solve here -- just read/write each key, tolerantly.

import { normalizeState } from "./schema.js";

export const STATE_KEY = "energy-comparison:state";
export const SCENARIOS_KEY = "energy-comparison:scenarios";
export const EXPLORER_KEY = "energy-comparison:explorer";

// Above this, a sweep's full point list is dropped from the saved record
// (see saveExplorerResult below) rather than risking the save failing
// outright against a browser's per-origin localStorage quota. Approximate:
// JS string .length (UTF-16 code units) stands in for a byte count, close
// enough for a soft ~1 MB cap over JSON that's almost entirely ASCII
// numbers.
const EXPLORER_MAX_CHARS = 1_000_000;

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt JSON or storage disabled; treat the same as nothing stored.
    return null;
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

/**
 * The saved working state, or null if nothing has been saved yet.
 *
 * Returns null rather than a default-filled state so the caller can tell
 * "no save exists" from "a save exists and every field happened to be
 * blank" -- App.jsx should only call schema.js's defaultState() (which
 * seeds the two starter configs) in the former case.
 */
export function loadState() {
  const raw = readJson(STATE_KEY);
  return raw ? normalizeState(raw) : null;
}

export function saveState(state) {
  return writeJson(STATE_KEY, state);
}

export function clearState() {
  try {
    localStorage.removeItem(STATE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Named scenarios, stored under SCENARIOS_KEY as an array of
 * { id, name, inputs, createdAt, updatedAt } records -- the shape
 * shared/scenarios.js's createScenario() produces and shared/
 * ScenariosMenu.jsx reads/writes directly via that module, keyed by
 * whatever `storageKey` prop it's given (pass SCENARIOS_KEY).
 *
 * These wrappers are for code outside ScenariosMenu -- an import/export
 * feature, say -- that wants the list with `inputs` already run through
 * schema.js's normalizeState, the same forward-compat guarantee loadState()
 * gives the working state.
 */
export function loadScenarios() {
  const raw = readJson(SCENARIOS_KEY);
  const list = Array.isArray(raw) ? raw : [];
  return list.map((s) => ({ ...s, inputs: normalizeState(s?.inputs) }));
}

export function saveScenarios(scenarios) {
  return writeJson(SCENARIOS_KEY, scenarios);
}

/**
 * The sizing explorer's (components/ExplorerSection.jsx) last completed
 * sweep, so a later visit with unchanged inputs can render it immediately
 * instead of re-running: { inputsHash, completedAt, points, picks, pricing }
 * or null if nothing has been saved (or the saved record is malformed --
 * readJson already treats corrupt JSON as nothing stored).
 *
 * inputsHash is model/hash.js's hashValue({household, assumptions,
 * solarIncentivePerKW, batteryIncentivePerKWh, pricing}) at the moment the
 * sweep completed; the caller compares it against a freshly computed
 * current hash to decide whether the restored points still describe the
 * current inputs, the same sweepIsStale check a live in-flight sweep is
 * judged against. picks is {bestNpv, bestPayback} (calc/sweep.js's point
 * shape, or null), computed once at save time from the FULL point list --
 * kept even when `points` itself is capped away below, so "the best point by
 * NPV" a user saw on a previous visit doesn't disappear merely because the
 * full grid was too large to persist. `pricing` is ExplorerSection.jsx's own
 * "Pricing assumptions" group state at save time, restored into that same
 * UI on a hash match so the group shows the exact values that produced the
 * restored points, not merely values that happen to match them.
 */
export function loadExplorerResult() {
  return readJson(EXPLORER_KEY);
}

/**
 * Saves `record` ({inputsHash, completedAt, points, picks, pricing}),
 * dropping the full `points` array down to just its top 5 by NPV when the
 * serialized record would exceed EXPLORER_MAX_CHARS -- a full sizing grid
 * can run to hundreds of points, and picks/top-5 already carry every figure
 * the restored view actually needs (see loadExplorerResult's header). Falls
 * through to writeJson's own try/catch either way, so a write that still
 * fails after capping (or on an already-near-full quota) is swallowed the
 * same as every other localStorage write in this module.
 */
export function saveExplorerResult(record) {
  const points = record.points || [];
  const full = JSON.stringify({ ...record, points });
  if (full.length <= EXPLORER_MAX_CHARS) {
    return writeJson(EXPLORER_KEY, { ...record, points });
  }
  const top5 = [...points].sort((a, b) => b.npv - a.npv).slice(0, 5);
  return writeJson(EXPLORER_KEY, { ...record, points: top5 });
}

export function clearExplorerResult() {
  try {
    localStorage.removeItem(EXPLORER_KEY);
    return true;
  } catch {
    return false;
  }
}
