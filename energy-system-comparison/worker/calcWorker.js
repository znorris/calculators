// Single Vite module worker handling both message kinds this calculator
// posts to a background thread, merged from what used to be two separate
// worker files (engineWorker.js and sweepWorker.js): {kind:'engine', ...}
// (model/runEngine.js's simulation, App.jsx's debounced per-input recompute)
// and {kind:'sweep', ...} (model/sweepEngine.js's sizing-explorer grid run,
// components/ExplorerSection.jsx). Both reach data/solar-shapes.json
// (calc/solar.js's ~2.4 MB PVWatts hourly grid) through calc/simulate.js, so
// two separate worker files each bundled their own full copy of it; one file
// means Vite's build sees one worker entry graph and bundles the grid into
// exactly one async chunk (see calc/solarDefaults.js's header for the other
// half of this fix, the same grid's main-chunk copy).
//
// App.jsx and ExplorerSection.jsx each still instantiate their OWN `new
// Worker(...)` against this one file, rather than sharing a single live
// instance: a sweep runs the full engine across a whole grid of points
// (seconds of CPU on its own thread), and routing both kinds through one
// shared worker instance would make App.jsx's own per-keystroke recompute
// wait behind a stale sweep run's message queue -- a synchronous JS loop
// cannot observe an incoming postMessage until it yields control back to the
// event loop anyway, so that queueing would not resolve merely by sending a
// cancellation message. Two instances loading the same bundled file get the
// one-chunk build-time win with no such runtime coupling.
//
// Message in, engine kind: { kind:'engine', id, household, configs,
// assumptions } -- the same three fields runEngine reads off
// model/schema.js's state shape; the caller drops any UI-only fields
// itself. Message out: { id, output } on success, or { id, error:{message} }
// if something outside runEngine's own try/catch throws (a malformed
// message, for instance).
//
// Message in, sweep kind: { kind:'sweep', id, household, assumptions, grid,
// incentives, pricingAssumptions } -- model/schema.js's raw
// household/assumptions state (never a pre-resolved profile: LODI's TOU
// schedules carry `applies(hourCtx) => bool` predicates that postMessage's
// structured clone cannot carry, so resolution happens inside this worker,
// same as the engine kind), calc/sweep.js's generateSweepGrid() output,
// (optional, default []) calc/incentives.js line items -- components/
// ExplorerSection.jsx's own compact per-unit solar/battery incentive
// inputs -- and (optional) calc/sweep.js's own SweepPricingAssumptions
// shape, from that same component's "Pricing assumptions" group. Both are
// forwarded to model/sweepEngine.js's runSweepEngine unchanged. Message out,
// streamed during the run: { id, progress:{done,total} }. Message out, once
// at the end: { id, output } on success (output is runSweepEngine's
// {points} or {error} shape) or { id, error:{message} } if something
// outside runSweepEngine's own try/catch throws.
//
// id is echoed back unchanged on every message of either kind, so a caller
// that has since sent a newer request can recognize and drop a stale
// response.

import { runEngine } from "../model/runEngine.js";
import { runSweepEngine } from "../model/sweepEngine.js";

/**
 * postMessage's structured-clone algorithm cannot clone a function, and
 * runEngine's `profile` field (calc/tariffs/lodi.js's LODI, in particular
 * Schedule EV's TOU periods) carries `applies(hourCtx) => bool` predicates --
 * fine when runEngine ran on the main thread with no serialization boundary,
 * fatal now that the result crosses one. Nothing downstream of this worker
 * reads those predicates (report/prose.js's exportRateOf reads only
 * profile.exportPolicy), so they're dropped here rather than changing
 * runEngine's return shape for its synchronous callers too. Plain objects and
 * arrays are walked; Sets, Maps, and primitives are returned as-is since
 * structured clone already handles them and none of this codebase's engine
 * output nests a function inside one. runSweepEngine's return shape carries
 * no such profile-attached function, so only the engine kind needs this.
 */
export function stripFunctions(value) {
  if (typeof value === "function") return undefined;
  if (Array.isArray(value)) return value.map(stripFunctions);
  if (value !== null && typeof value === "object" && value.constructor === Object) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      out[key] = stripFunctions(v);
    }
    return out;
  }
  return value;
}

function handleEngine(id, data) {
  const { household, configs, assumptions } = data;
  const output = stripFunctions(runEngine({ household, configs, assumptions }));
  self.postMessage({ id, output });
}

function handleSweep(id, data) {
  const { household, assumptions, grid, incentives, pricingAssumptions } = data;
  const output = runSweepEngine({
    household,
    assumptions,
    grid,
    incentives,
    pricingAssumptions,
    onProgress: (progress) => self.postMessage({ id, progress }),
  });
  self.postMessage({ id, output });
}

self.onmessage = (event) => {
  // id is read outside the try below so a malformed message (event.data
  // missing or not an object) still echoes back whatever id it had, rather
  // than throwing out of onmessage with no response posted at all.
  const id = event.data?.id;
  try {
    const kind = event.data?.kind;
    if (kind === "sweep") {
      handleSweep(id, event.data);
    } else if (kind === "engine") {
      handleEngine(id, event.data);
    } else {
      throw new Error(`worker/calcWorker.js: unrecognized message kind ${JSON.stringify(kind)}`);
    }
  } catch (e) {
    self.postMessage({ id, error: { message: e instanceof Error ? e.message : String(e) } });
  }
};
