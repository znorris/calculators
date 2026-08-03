// The sizing explorer's compose layer, sibling to model/runEngine.js: turns
// {household, assumptions} (model/schema.js's state shape) plus a
// calc/sweep.js grid into calc/sweep.js's runSweep() call and back into the
// shape components/ExplorerSection.jsx reads. worker/calcWorker.js's
// {kind:'sweep'} message branch is the only caller, mirroring how its own
// {kind:'engine'} branch is model/runEngine.js's only caller.
//
// Household/profile resolution is NOT re-derived here: resolveHousehold and
// toEngineAssumptions are model/runEngine.js's own exports, reused as-is so
// there is exactly one place that turns a raw household/assumptions record
// into the engine-ready shapes calc/simulate.js expects.

import { runSweep } from "../calc/sweep.js";
import { simulateComparison } from "../calc/simulate.js";
import { resolveHousehold, toEngineAssumptions, interconnectionFeeFor } from "./runEngine.js";

/**
 * @param {Object} args
 * @param {Object} args.household  model/schema.js's household state shape
 * @param {Object} args.assumptions  model/schema.js's assumptions state shape
 * @param {Array<{solarKW, batteryKWh, windPresetId}>} args.grid  calc/sweep.js's generateSweepGrid() output
 * @param {Array} [args.incentives]  calc/incentives.js line items (default []), forwarded to runSweep unchanged --
 *   components/ExplorerSection.jsx's own compact per-unit solar/battery incentive inputs, resolved per point against
 *   that point's own sizes exactly as calc/sweep.js's runSweep header describes.
 * @param {import('../calc/sweep.js').SweepPricingAssumptions} [args.pricingAssumptions]  the explorer's own
 *   "Pricing assumptions" group overrides, forwarded to runSweep unchanged.
 * @param {(progress:{done:number, total:number}) => void} [args.onProgress]
 * @returns {{points: Array}|{error: string}}
 */
export function runSweepEngine({ household, assumptions: rawAssumptions, grid, incentives, pricingAssumptions, onProgress }) {
  try {
    const resolved = resolveHousehold(household, rawAssumptions);
    if (resolved.error) return resolved;
    const { profile, engineHousehold, engineScheduleId } = resolved;

    const assumptions = toEngineAssumptions(rawAssumptions);
    const interconnectionFee = interconnectionFeeFor(profile, engineScheduleId);
    const sizeCapped = profile.constraints?.sizeCapMode === "trailing12moUsage";

    // Baseline-only run (no configs), purely to read the no-system annual
    // import kWh the size-cap check compares every point's production
    // against -- the same figure model/runEngine.js reads off its own
    // baseline, via the same simulateComparison() call every engine
    // invocation makes.
    const { baseline } = simulateComparison({ configs: [], household: engineHousehold, profile, assumptions });
    const annualUsageKWh = baseline.years[0]?.importKWh ?? 0;

    const points = runSweep(grid, {
      household: engineHousehold,
      profile,
      assumptions,
      discountRatePct: rawAssumptions.discountRatePct,
      interconnectionFee,
      annualUsageKWh,
      sizeCapped,
      incentives,
      pricingAssumptions,
      onProgress,
    });

    return { points };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
