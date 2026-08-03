// Sentence generation for the results report.
//
// Every function here reads only from precomputed engine outputs
// (ConfigResult, financeConfig's output, incrementalAnalysis's output) plus
// the raw config/household/profile records the compose layer already holds
// in its useMemo -- nothing in this file simulates anything.
//
// `entries` is the shared shape the whole report layer passes around:
//   [{ id, name, config, result, finance, incremental, windCapacityFactor }]
// where config/result/finance/incremental match calc/CONTRACTS.md's Config,
// ConfigResult, financeConfig() output, and incrementalAnalysis() output.
// `windCapacityFactor` (number|null) is not derivable from ConfigResult
// alone -- production there is solar+wind combined -- so the compose layer
// is expected to compute it once per config, from calc/wind.js's
// windHourly() run against only that config's turbines, divided by
// (rated kW x 8760h). A config with no turbines carries null.
//
// "Retail value" of self-consumed energy is not a line item priceYear()
// keeps once collapsed into ConfigResult.years[].billTotal (LODI's tiered
// and TOU rates make a single $/kWh figure inexact for a given kWh), so it
// is approximated as a blended rate: the baseline (no-system) household's
// own bill divided by its own import kWh for year one. Every sentence that
// uses it says "blended" or "roughly" rather than presenting it as an exact
// per-kWh billing figure.

import { money, percent } from "../format.js";

const LOW_WIND_CAPACITY_FACTOR = 0.1;
const WELL_SITED_WIND_CAPACITY_FACTOR = "25-35%";

function nameOf(entry) {
  return entry.name?.trim() || "This config";
}

/** Matches the assumptions page's perKWh() convention: 4 decimals, since rates like $0.0843/kWh round to $0 at whole-dollar precision. */
function perKWh(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(4)}/kWh`;
}

/** Year-one blended retail rate: the no-system bill divided by the no-system import, so it carries fixed charges and tier mix along with energy. */
function blendedRetailRate(baseline) {
  const year1 = baseline.years[0];
  return year1 && year1.importKWh > 0 ? year1.billTotal / year1.importKWh : null;
}

/**
 * A single $/kWh export rate, when the profile's export policy actually has
 * one: avoidedCostCredit's flat ratePerKWh, or netMetering's hourly mode
 * with a numeric exportRate. Hourly netMetering's 'retail' exportRate has no
 * single number (it is whatever rate each individual hour's tier/TOU period
 * happens to be), and annual (kWh) netting has no per-kWh export rate at all
 * -- it nets kWh before any dollar figure is computed -- so both return null
 * rather than a guessed number the battery-shift sentence could misstate.
 */
function exportRateOf(profile) {
  const policy = profile?.exportPolicy;
  if (!policy) return null;
  if (policy.type === "avoidedCostCredit") return policy.ratePerKWh;
  if (policy.type === "netMetering" && policy.netting === "hourly" && typeof policy.exportRate === "number") {
    return policy.exportRate;
  }
  return null;
}

/**
 * Trailing clause describing what a config's year-one exported kWh actually
 * earned, worded to match the profile's real export mechanism rather than
 * always assuming avoidedCostCredit's flat-rate credit:
 *  - avoidedCostCredit: an exact $ figure at the flat avoided-cost rate.
 *  - netMetering hourly, numeric exportRate: an exact $ figure at that same
 *    flat rate (the mechanism differs from avoidedCostCredit -- a
 *    carry-forward ledger fed by a per-hour credit -- but year-one's total
 *    dollar figure is identical to multiplying kWh by the flat rate).
 *  - netMetering hourly, 'retail': the real per-hour credit varies with
 *    whatever tier or TOU period that hour's rate is, so there is no single
 *    number to multiply by -- this approximates it with the same blended
 *    retail rate self-consumed energy above is valued at, worded "roughly"
 *    rather than "about" to flag the approximation.
 *  - netMetering annual: exported kWh nets directly against import in kWh
 *    before any $ figure exists, so there is no export-credit dollar amount
 *    to quote at all -- the sentence instead states the netting mechanism.
 */
function exportClause(profile, exportKWh, retailRate) {
  const policy = profile?.exportPolicy;
  if (!policy) return "";
  if (policy.type === "avoidedCostCredit") {
    return ` for about ${money(exportKWh * policy.ratePerKWh)} of export credit at the ${perKWh(policy.ratePerKWh)} avoided-cost rate`;
  }
  if (policy.type === "netMetering" && policy.netting === "hourly") {
    if (typeof policy.exportRate === "number") {
      return ` for about ${money(exportKWh * policy.exportRate)} of export credit at the ${perKWh(policy.exportRate)} net-metering rate`;
    }
    if (retailRate != null) {
      return (
        ` for roughly ${money(exportKWh * retailRate)} of export credit, valued at each exporting hour's own retail rate ` +
        `under net metering (approximated here at the ${perKWh(retailRate)} blended rate)`
      );
    }
    return "";
  }
  if (policy.type === "netMetering" && policy.netting === "annual") {
    return `, netted directly against import in kWh under annual net metering rather than earning a separate export credit`;
  }
  return "";
}

/**
 * The full analysis window a config's payback was searched over (see
 * calc/finance.js's cashFlows, which run to horizonIndex and beyond), read
 * off the entry's own finance output rather than re-deriving
 * PAYBACK_SEARCH_YEARS here.
 */
function analysisYearsOf(entry) {
  return entry.finance.cashFlows.length - 1;
}

/** "a payback in year X" or, when there is none anywhere in the search window, "no payback within N years." */
function paybackClause(entry) {
  const { paybackYear } = entry.finance;
  if (paybackYear == null) return `no payback within ${analysisYearsOf(entry)} years`;
  return `a payback in year ${paybackYear.toFixed(1)}`;
}

/**
 * A trailing clause naming how far past the ownership horizon a payback
 * lands, or "" when there is no payback (nothing to place relative to the
 * horizon) or it already falls inside the horizon. A payback beyond the
 * horizon is a real recovery the user just will not own the system long
 * enough to reach -- this states that explicitly rather than letting the
 * bare year number imply it happened during ownership.
 */
function pastHorizonClause(entry, horizonYears) {
  const { paybackYear } = entry.finance;
  if (paybackYear == null || paybackYear <= horizonYears) return "";
  const yearsPast = Math.round((paybackYear - horizonYears) * 10) / 10;
  return `, ${yearsPast} year${yearsPast === 1 ? "" : "s"} past your ${horizonYears}-year horizon`;
}

/**
 * Verdict paragraph: which config wins on NPV, which wins on payback, and
 * whether those are the same config. Names the ownership horizon explicitly,
 * since NPV/lifetime-savings figures are scoped to it while a payback can
 * land after it.
 */
export function verdictParagraph({ entries, horizonYears }) {
  const ranked = entries.filter((e) => e.finance);
  if (ranked.length === 0) return "";

  if (ranked.length === 1) {
    const only = ranked[0];
    return (
      `Over your ${horizonYears}-year horizon, ${nameOf(only)} is the only config compared here, with a net ` +
      `present value (NPV) of ${money(only.finance.npv)} and ${paybackClause(only)}${pastHorizonClause(only, horizonYears)}.`
    );
  }

  const byNpv = [...ranked].sort((a, b) => b.finance.npv - a.finance.npv);
  const byPayback = [...ranked].sort((a, b) => {
    const ap = a.finance.paybackYear;
    const bp = b.finance.paybackYear;
    if (ap == null && bp == null) return 0;
    if (ap == null) return 1;
    if (bp == null) return -1;
    return ap - bp;
  });

  const npvWinner = byNpv[0];
  const paybackWinner = byPayback[0];
  const anyPayback = paybackWinner.finance.paybackYear != null;

  let text = `Over your ${horizonYears}-year horizon, on net present value (NPV), ${nameOf(npvWinner)} leads at ${money(npvWinner.finance.npv)}.`;
  if (!anyPayback) {
    text += ` No config pays back within ${analysisYearsOf(paybackWinner)} years.`;
  } else if (paybackWinner.id === npvWinner.id) {
    text += ` ${nameOf(npvWinner)} also pays back fastest, in year ${paybackWinner.finance.paybackYear.toFixed(1)}${pastHorizonClause(paybackWinner, horizonYears)}, so it wins on both measures.`;
  } else {
    text += ` ${nameOf(paybackWinner)} pays back fastest instead, in year ${paybackWinner.finance.paybackYear.toFixed(1)}${pastHorizonClause(paybackWinner, horizonYears)}, so the two measures point at different configs.`;
  }
  return text;
}

/** Sentences for one config: what its production is worth, what its battery shifts, and a demand-charge note on Schedule G2. */
export function configSentences({ entry, baseline, household, profile }) {
  const out = [];
  const name = nameOf(entry);
  const { result, config } = entry;
  const year1 = result.years[0];
  const retailRate = blendedRetailRate(baseline);
  const exportRate = exportRateOf(profile);

  if (year1.productionKWh > 0) {
    const selfConsumedValue = retailRate != null ? year1.selfConsumedKWh * retailRate : null;

    out.push(
      `In year one, ${name} produces ${Math.round(year1.productionKWh).toLocaleString()} kWh. Of that, ` +
        `${Math.round(year1.selfConsumedKWh).toLocaleString()} kWh is used on-site` +
        (selfConsumedValue != null
          ? `, worth roughly ${money(selfConsumedValue)} at a blended retail rate of ${perKWh(retailRate)}`
          : "") +
        `, and ${Math.round(year1.exportKWh).toLocaleString()} kWh is exported` +
        exportClause(profile, year1.exportKWh, retailRate) +
        `.`,
    );
  }

  if (config.battery) {
    const hasGeneration = !!(config.solar || config.wind);
    const gridChargeEnabled = !!config.battery.gridCharge?.enabled;

    if (hasGeneration) {
      const cycles = year1.cycles || 0;
      const shiftedKWh = cycles * (config.battery.usableKWh || 0);
      if (shiftedKWh > 0) {
        const spread = retailRate != null && exportRate != null ? Math.max(0, retailRate - exportRate) : null;
        const shiftedValue = spread != null ? shiftedKWh * spread : null;
        out.push(
          `The battery cycles about ${cycles.toFixed(1)} times in year one, shifting roughly ` +
            `${Math.round(shiftedKWh).toLocaleString()} kWh` +
            (shiftedValue != null
              ? ` worth an estimated ${money(shiftedValue)} at the spread between the retail and export rates`
              : "") +
            ` from export into on-site use instead.`,
        );
      }
    } else if (!gridChargeEnabled) {
      out.push(
        `${name} has a battery but no solar or wind generation. The battery only charges from on-site solar or ` +
          `wind surplus in this model, so without generation it does not change the bill.`,
      );
    }

    if (gridChargeEnabled) {
      const gridChargeKWh = year1.gridChargeKWh || 0;
      const peakShaveActive = config.dispatch?.mode === "peak-shave";
      out.push(
        `${name}'s battery also draws ${Math.round(gridChargeKWh).toLocaleString()} kWh from the grid in year one ` +
          `during its scheduled charging window, on top of any on-site surplus charging. That energy is billed at ` +
          `the retail rate for the hour it is drawn and loses round-trip efficiency converting to and from ` +
          `storage, so it only reduces the bill when it buys at a cheaper time-of-use rate than it later discharges ` +
          `into, or when the battery's dispatch is set to peak shaving on a demand-charged schedule, topping the ` +
          `battery up ahead of the peak it shaves without ever raising that peak itself (grid charging in peak-shave ` +
          `mode is capped to the month's own already-established import peak, on top of the shaving threshold)` +
          (peakShaveActive ? ` (as here)` : "") +
          `.`,
      );
    }
  }

  if (household?.schedule === "G2") {
    out.push(
      `${name} bills on Schedule G2, which charges a demand rate on top of energy usage (see the assumptions ` +
        `page for the rate). Reducing peak import kW lowers that demand charge, and the bill-savings figures ` +
        `above already include any such reduction, but this engine does not itemize the demand component ` +
        `separately from energy, so the demand-specific dollar amount is not broken out on its own.`,
    );
  }

  return out;
}

/**
 * Below this dollar threshold, two configs' cost or savings figures read as
 * effectively tied rather than one being "more" or "less" than the other --
 * keeps a same-cost pair (a cloned config with a changed azimuth, say) from
 * being described as costing "$0 more."
 */
const DOMINANCE_TIE_THRESHOLD_USD = 1;

/**
 * Dominance callouts: a config that costs at least as much upfront and
 * returns no more over the horizon than another, with at least one
 * difference exceeding the tie threshold, is dominated by it. A tied
 * dimension is worded as "the same" rather than a $0 delta.
 */
export function dominanceCallouts({ entries }) {
  const out = [];
  const ranked = entries.filter((e) => e.finance);
  for (const a of ranked) {
    for (const b of ranked) {
      if (a.id === b.id) continue;
      const aCost = -a.finance.cashFlows[0];
      const bCost = -b.finance.cashFlows[0];
      const aSavings = a.finance.lifetimeSavings;
      const bSavings = b.finance.lifetimeSavings;
      const costDiff = aCost - bCost;
      const savingsDiff = bSavings - aSavings; // positive => a returns less than b

      const costsMore = costDiff > DOMINANCE_TIE_THRESHOLD_USD;
      const costsTie = Math.abs(costDiff) <= DOMINANCE_TIE_THRESHOLD_USD;
      const returnsLess = savingsDiff > DOMINANCE_TIE_THRESHOLD_USD;
      const savingsTie = Math.abs(savingsDiff) <= DOMINANCE_TIE_THRESHOLD_USD;

      const dominated = (costsMore || costsTie) && (returnsLess || savingsTie) && (costsMore || returnsLess);
      if (dominated) {
        const costPhrase = costsTie
          ? `costs the same upfront as ${nameOf(b)}`
          : `costs ${money(costDiff)} more upfront than ${nameOf(b)}`;
        const savingsPhrase = savingsTie
          ? "returns the same over the horizon"
          : `returns ${money(savingsDiff)} less over the horizon`;
        out.push(`${nameOf(a)} ${costPhrase} and ${savingsPhrase}.`);
      }
    }
  }
  return out;
}

/**
 * First ownership year (>=1) at which `leader`'s cumulative cash flow
 * reaches or passes `trailing`'s, given `leader` started behind. Returns
 * null when `leader` was never behind at the start (nothing to overtake).
 */
function findOvertakeYear(leaderCumulative, trailingCumulative) {
  if (leaderCumulative[0] >= trailingCumulative[0]) return null;
  for (let k = 1; k < leaderCumulative.length; k++) {
    if (leaderCumulative[k] >= trailingCumulative[k]) return k;
  }
  return null;
}

/**
 * Cash-flow crossover sentences between adjacent configs when ranked by
 * final cumulative cash flow (lifetimeSavings). A config that ends ahead
 * but started behind (typically a higher upfront cost) gets an "overtakes"
 * sentence naming the year it caught up -- searched over the full analysis
 * window (calc/finance.js's cumulative, which runs past horizonYears), since
 * a crossover after the horizon is still a real change in which config leads,
 * even though lifetimeSavings itself (the ranking key) stays horizon-scoped.
 */
export function crossoverSentences({ entries, horizonYears }) {
  const out = [];
  const ranked = [...entries.filter((e) => e.finance)].sort(
    (a, b) => b.finance.lifetimeSavings - a.finance.lifetimeSavings,
  );
  for (let i = 0; i < ranked.length - 1; i++) {
    const leader = ranked[i];
    const runnerUp = ranked[i + 1];
    const year = findOvertakeYear(leader.finance.cumulative, runnerUp.finance.cumulative);
    if (year != null) {
      const beyondNote = year > horizonYears ? `, past your ${horizonYears}-year horizon` : "";
      out.push(
        `${nameOf(leader)} starts behind ${nameOf(runnerUp)} on cumulative cash flow but overtakes it in year ${year}${beyondNote}.`,
      );
    }
  }
  return out;
}

/** A reality check when a config's modeled wind capacity factor is unusually low. */
export function windRealitySentences({ entries }) {
  const out = [];
  for (const entry of entries) {
    const hasWind = (entry.config?.wind?.turbines || []).length > 0;
    if (hasWind && entry.windCapacityFactor != null && entry.windCapacityFactor < LOW_WIND_CAPACITY_FACTOR) {
      out.push(
        `${nameOf(entry)}'s wind turbine is modeled at a ${percent(entry.windCapacityFactor)} capacity factor, ` +
          `well under the ${WELL_SITED_WIND_CAPACITY_FACTOR} a well-sited small turbine reaches. At the modeled ` +
          `site wind speed the turbine turns for only a small share of its rated output, so it contributes little ` +
          `of ${nameOf(entry)}'s production regardless of what it cost to install.`,
      );
    }
  }
  return out;
}

/**
 * Assembles every sentence group into the shape ResultsSection renders.
 *
 * @param entries [{ id, name, config, result, finance, incremental, windCapacityFactor }] baseline excluded
 * @param baseline ConfigResult, the no-system case
 * @param household { schedule, ... } per calc/simulate.js's Household
 * @param profile UtilityProfile, for the export rate
 * @param horizonYears number of ownership years simulated
 */
export function buildReport({ entries, baseline, household, profile, horizonYears }) {
  return {
    verdict: verdictParagraph({ entries, horizonYears }),
    perConfig: entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      sentences: configSentences({ entry, baseline, household, profile }),
    })),
    dominance: dominanceCallouts({ entries }),
    crossovers: crossoverSentences({ entries, horizonYears }),
    windReality: windRealitySentences({ entries }),
  };
}
