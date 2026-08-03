// worker/calcWorker.js runs in a DedicatedWorkerGlobalScope, whose global is
// `self`, not available under vitest's node environment. Polyfilled here as
// globalThis so the worker module's top-level `self.onmessage = ...`
// assignment has somewhere to land and `self.postMessage` calls are
// observable, without spinning up a real Worker (there is no jsdom/worker
// test harness in this repo -- see components/__tests__/smoke.test.jsx).
globalThis.self = globalThis;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { defaultState } from "../../model/schema.js";
import { runEngine } from "../../model/runEngine.js";
import { runSweepEngine } from "../../model/sweepEngine.js";

const SMALL_GRID = [
  { solarKW: 3, batteryKWh: 0, windPresetId: null },
  { solarKW: 0, batteryKWh: 5, windPresetId: null },
];

beforeEach(() => {
  globalThis.postMessage = vi.fn();
});

/** True if any function value exists anywhere under a plain object/array tree. */
function containsFunction(value) {
  if (typeof value === "function") return true;
  if (Array.isArray(value)) return value.some(containsFunction);
  if (value !== null && typeof value === "object" && value.constructor === Object) {
    return Object.values(value).some(containsFunction);
  }
  return false;
}

describe("worker/calcWorker.js -- {kind:'engine'}", () => {
  // This test runs runEngine twice (once for the vacuity guard, once through
  // the worker) -- two full multi-year 8760-hour simulations. Under vitest's
  // default 5s testTimeout it flakes when the machine is loaded (observed
  // three separate times during concurrent agent sessions), so it carries
  // its own generous timeout.
  it("posts {id, output} equal to runEngine's own return value, functions stripped", { timeout: 30000 }, async () => {
    const { stripFunctions } = await import("../calcWorker.js");

    const state = defaultState();
    // Regression guard for the fix below: LODI's Schedule EV carries a TOU
    // period `applies(hourCtx) => bool` predicate, so runEngine's raw output
    // does contain a function here -- if it didn't, the assertion on
    // message.output below (no functions) would be true vacuously.
    expect(containsFunction(runEngine(state))).toBe(true);

    globalThis.onmessage({
      data: {
        kind: "engine",
        id: 7,
        household: state.household,
        configs: state.configs,
        assumptions: state.assumptions,
      },
    });

    expect(globalThis.postMessage).toHaveBeenCalledTimes(1);
    const [message] = globalThis.postMessage.mock.calls[0];
    expect(message.id).toBe(7);
    expect(message.output).toEqual(stripFunctions(runEngine(state)));
  });

  it("never posts a function anywhere in output -- postMessage's structured clone cannot carry one", async () => {
    // Before this fix, message.output.profile.schedules[].pricing.periods[].applies
    // was a live function reference, and self.postMessage(...) with it in the
    // payload threw DataCloneError inside the worker instead of ever
    // responding (reproduced against a real Worker under headless Chrome,
    // not just this node-environment test).
    await import("../calcWorker.js");

    const state = defaultState();
    globalThis.onmessage({
      data: {
        kind: "engine",
        id: 9,
        household: state.household,
        configs: state.configs,
        assumptions: state.assumptions,
      },
    });

    const [message] = globalThis.postMessage.mock.calls.at(-1);
    expect(containsFunction(message.output)).toBe(false);
  });

  it("echoes back a request's own id, not the previous request's", async () => {
    await import("../calcWorker.js");

    const state = defaultState();
    globalThis.onmessage({
      data: {
        kind: "engine",
        id: 42,
        household: state.household,
        configs: state.configs,
        assumptions: state.assumptions,
      },
    });

    const [message] = globalThis.postMessage.mock.calls.at(-1);
    expect(message.id).toBe(42);
  });

  it("posts {id, output:{error}} when the message is missing household/configs/assumptions", async () => {
    await import("../calcWorker.js");

    // runEngine's own internal try/catch handles a missing household by
    // returning {error: message} rather than throwing -- so this is the
    // ordinary error-panel path (see EngineErrorPanel in App.jsx), not the
    // worker-level error path below.
    globalThis.onmessage({ data: { kind: "engine", id: 3 } });

    expect(globalThis.postMessage).toHaveBeenCalledTimes(1);
    const [message] = globalThis.postMessage.mock.calls[0];
    expect(message.id).toBe(3);
    expect(typeof message.output.error).toBe("string");
  });
});

describe("worker/calcWorker.js -- {kind:'sweep'}", () => {
  it("posts {id, output} equal to runSweepEngine's own return value", async () => {
    await import("../calcWorker.js");
    const state = defaultState();

    globalThis.onmessage({
      data: { kind: "sweep", id: 5, household: state.household, assumptions: state.assumptions, grid: SMALL_GRID },
    });

    const messages = globalThis.postMessage.mock.calls.map(([m]) => m);
    const final = messages.at(-1);
    expect(final.id).toBe(5);
    expect(final.output).toEqual(
      runSweepEngine({ household: state.household, assumptions: state.assumptions, grid: SMALL_GRID }),
    );
  });

  it("forwards an incentives array through to runSweepEngine unchanged", async () => {
    await import("../calcWorker.js");
    const state = defaultState();
    const incentives = [{ label: "Solar rebate", type: "perUnit", unit: "kW-solar", ratePerUnit: 100 }];

    globalThis.onmessage({
      data: { kind: "sweep", id: 6, household: state.household, assumptions: state.assumptions, grid: SMALL_GRID, incentives },
    });

    const messages = globalThis.postMessage.mock.calls.map(([m]) => m);
    const final = messages.at(-1);
    expect(final.output).toEqual(
      runSweepEngine({ household: state.household, assumptions: state.assumptions, grid: SMALL_GRID, incentives }),
    );
    // Distinguishes this from the no-incentives test above: the point's npv
    // actually moved, so a signature regression that silently drops
    // `incentives` before calling runSweepEngine would still pass the
    // toEqual check above (both sides would agree on the wrong, no-incentive
    // answer) without this.
    const withoutIncentives = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid: SMALL_GRID });
    expect(final.output.points[0].npv).not.toBeCloseTo(withoutIncentives.points[0].npv, 6);
  });

  it("forwards pricingAssumptions through to runSweepEngine unchanged", async () => {
    await import("../calcWorker.js");
    const state = defaultState();
    const pricingAssumptions = { solarCostPerWatt: 1.5 };
    const grid = [{ solarKW: 6, batteryKWh: 0, windPresetId: null }];

    globalThis.onmessage({
      data: { kind: "sweep", id: 7, household: state.household, assumptions: state.assumptions, grid, pricingAssumptions },
    });

    const messages = globalThis.postMessage.mock.calls.map(([m]) => m);
    const final = messages.at(-1);
    expect(final.output).toEqual(
      runSweepEngine({ household: state.household, assumptions: state.assumptions, grid, pricingAssumptions }),
    );
    // Distinguishes this from an unaffected sweep: the point's upfront cost
    // actually moved, so a regression that silently drops
    // `pricingAssumptions` before calling runSweepEngine would still pass
    // the toEqual check above (both sides would agree on the wrong,
    // default-pricing answer) without this.
    const withoutOverride = runSweepEngine({ household: state.household, assumptions: state.assumptions, grid });
    expect(final.output.points[0].upfront).not.toBeCloseTo(withoutOverride.points[0].upfront, 6);
  });

  it("streams {id, progress} messages before the final {id, output} message", async () => {
    await import("../calcWorker.js");
    const state = defaultState();

    // 11 points is more than one SWEEP_BATCH_SIZE (10) batch, so at least one
    // progress message is expected before the final output message.
    const grid = Array.from({ length: 11 }, (_, i) => ({ solarKW: (i % 14) + 1, batteryKWh: 0, windPresetId: null }));

    globalThis.onmessage({ data: { kind: "sweep", id: 8, household: state.household, assumptions: state.assumptions, grid } });

    const messages = globalThis.postMessage.mock.calls.map(([m]) => m);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.slice(0, -1).every((m) => m.progress)).toBe(true);
    const final = messages.at(-1);
    expect(final.output.points.length).toBe(11);
  }, 20000);

  it("posts {id, output:{error}} for a malformed custom tariff, the ordinary error path", async () => {
    await import("../calcWorker.js");
    const state = defaultState();
    state.household.profileId = "custom";
    state.household.customProfileInputs = {
      ...state.household.customProfileInputs,
      exportPolicy: { type: "bogus" },
    };

    globalThis.onmessage({
      data: { kind: "sweep", id: 3, household: state.household, assumptions: state.assumptions, grid: SMALL_GRID },
    });

    const [message] = globalThis.postMessage.mock.calls.at(-1);
    expect(message.id).toBe(3);
    expect(typeof message.output.error).toBe("string");
  });

  it("echoes back a request's own id on every message, including progress", async () => {
    await import("../calcWorker.js");
    const state = defaultState();
    const grid = Array.from({ length: 11 }, (_, i) => ({ solarKW: (i % 14) + 1, batteryKWh: 0, windPresetId: null }));

    globalThis.onmessage({ data: { kind: "sweep", id: 42, household: state.household, assumptions: state.assumptions, grid } });

    const messages = globalThis.postMessage.mock.calls.map(([m]) => m);
    expect(messages.every((m) => m.id === 42)).toBe(true);
  }, 20000);
});

describe("worker/calcWorker.js -- shared envelope", () => {
  it("posts {id, error:{message}} rather than throwing out of onmessage when event.data itself is missing", async () => {
    await import("../calcWorker.js");

    globalThis.onmessage({});

    expect(globalThis.postMessage).toHaveBeenCalledTimes(1);
    const [message] = globalThis.postMessage.mock.calls[0];
    expect(message.id).toBeUndefined();
    expect(typeof message.error.message).toBe("string");
    expect(message.error.message.length).toBeGreaterThan(0);
  });

  it("posts {id, error:{message}} for a message with no recognized kind, rather than silently doing nothing", async () => {
    // Regression guard for the merge of engineWorker.js and sweepWorker.js
    // into this one file: each kind used to be the only thing its own
    // worker file ever did, so there was no "wrong kind" case to handle.
    // Merged into one file, an unrecognized (or missing) kind must still
    // produce a response rather than silently dropping the request.
    await import("../calcWorker.js");

    globalThis.onmessage({ data: { id: 11, household: {}, assumptions: {} } });

    expect(globalThis.postMessage).toHaveBeenCalledTimes(1);
    const [message] = globalThis.postMessage.mock.calls[0];
    expect(message.id).toBe(11);
    expect(typeof message.error.message).toBe("string");
    expect(message.error.message.length).toBeGreaterThan(0);
  });
});
