# calc module contracts — energy-system-comparison

Every engine module codes against these signatures. Do not deviate; other agents build against them.

## Conventions
- Hourly series are plain number[] of length 8760. Index 0 = Jan 1, 00:00-01:00 of reference year 2026 (non-leap; Jan 1, 2026 is a Thursday), local standard time, no DST. Values are kWh per hour slot (numerically equal to average kW).
- Months, seasons, weekday/holiday logic come ONLY from calc/time.js.
- All calc/ modules are pure ESM: no React, no I/O, no Date.now(); bundled JSON is imported statically.
- Units: dollars (number), kWh, kW. LEU summer = May-Oct (month indexes 4-9).

## calc/time.js
- Constants: REFERENCE_YEAR = 2026, HOURS_PER_YEAR = 8760, HOLIDAYS (fixed list: New Year's Day, Memorial Day, July 4, Labor Day, Thanksgiving, Christmas as 2026 dates).
- monthOfHour(h) -> 0..11; hourOfDay(h) -> 0..23; dayOfYear(h) -> 0..364; dayOfWeek(h) -> 0(Sun)..6(Sat); isWeekend(h); isHoliday(h); isLeuSummer(monthIdx) -> bool.

## calc/tariffs/profile.js (JSDoc typedefs + validation helpers)
Schedule = { id, label, fixedChargePerMonth,
  pricing:
    { type:'tiered', rates:[r1,r2,r3], breakpoints:{ summer:[b1,b2], winter:[b1,b2] } }   // rates $/kWh, breakpoints cumulative monthly kWh
  | { type:'flat-seasonal', summerRate, winterRate }
  | { type:'tou', periods:[{ id, rate:{summer,winter}, applies:(hourCtx)=>bool }] }       // hourCtx = {hour, hourOfDay, dayOfWeek, isWeekend, isHoliday, monthIdx, isSummer}
  | { type:'all-units-blocks', blocks:Block[] | { summer:Block[], winter:Block[] } },     // Block = { upToKWh:number|null, rate }; ascending by upToKWh, only the LAST block may have upToKWh null (no ceiling)
  demand?: { ratePerKW:{summer,winter}, peakRatePerKW?:{summer,winter}, peakApplies?:(hourCtx)=>bool },
  minimumBillPerMonth?: number,        // floors the month's total AFTER riders and export-credit offset; see calc/billing.js
  systemSizeCharges?: [{ basis:'kW-DC-solar'|'kWh-battery', ratePerMonth }] }             // billed monthly as size * ratePerMonth; size comes from priceYear's options.systemSizes
This applies() form is the one validateSchedule and rateForHour require, and it is only ever built by
calc/tariffs/custom.js's buildCustomProfile (see that section below). Everywhere upstream of buildCustomProfile --
household.customProfileInputs in app state, storage.js's localStorage record, a share link, the postMessage sent
into worker/calcWorker.js -- a tou period instead carries the JSON-safe descriptor form
{ id, rate:{summer,winter}, window:{hours:[start,end], days:'all'|'weekday'|'weekend', excludeHolidays:bool} }, with
no function on it. Never hand-assemble or expect an applies() function anywhere upstream of buildCustomProfile; only
the descriptor form is cloneable across those boundaries.
allUnitsBlocksEnergyCost(monthlyKWh, schedule, isSummer) prices the schedule's `all-units-blocks` pricing: the WHOLE
month's kWh bills at the single rate of the block the monthly total lands in (unlike tieredEnergyCost's per-band
accounting), so crossing a block boundary by one kWh can move the entire month's bill, including DOWN, at an upper
block's lower rate -- an intentional discontinuity, not a bug, that some utilities' block tariffs actually have.
ExportRate = number                                                            // flat $/kWh, every hour
           | 'retail'                                                          // netMetering only
           | { kind:'monthlyTable', monthlyValues:number[12] }                 // keyed by calendar month
           | { kind:'timeTable', periods:[{ rate:{summer,winter}, window }] }   // keyed by hour, first matching period wins (declaration order; overlapping windows are a validation error); window is the identical {hours:[start,end], days, excludeHolidays} descriptor a tou period uses, materialized to applies() the same way via calc/tariffs/custom.js's buildAppliesFromWindow
           | { kind:'percentOfRetail', fraction:0..1 }                         // netMetering with netting:'hourly' only; credit = fraction * that hour's applicable retail rate
One ExportRate type serves BOTH avoidedCostCredit.ratePerKWh and netMetering.exportRate. resolveExportRate(exportRate,
schedule, hourCtx, cumulativeImportKWh) resolves any ExportRate to the $/kWh credit for one exporting hour; 'retail'
and 'percentOfRetail' both read retailRateForHour(schedule, hourCtx, cumulativeImportKWh) (the TOU period's own rate,
the current tier's rate from cumulative import kWh so far that month, the all-units-block that cumulative total lands
in, or the season's flat rate) -- percentOfRetail scales that figure by its own fraction. calc/billing.js resolves
every ExportRate PER EXPORTING HOUR (even a flat number or monthlyTable, whose value doesn't vary within a month), with
one exception: 'retail' or percentOfRetail credited against an all-units-blocks schedule. all-units-blocks is not
marginal/tiered -- it prices the WHOLE month's import at the single rate of whichever block the month's FINAL total
lands in (see allUnitsBlocksEnergyCost above), so resolving that rate off cumulativeImportKWh SO FAR mid-month can read
the wrong block whenever more import still lands later the same month. For that one combination, calc/billing.js
recomputes the month's export credit directly from its own final importKWh, after the hourly pass, instead of summing
each hour's resolveExportRate result -- every other kind/pricing-type combination still goes through the single
per-hour path.
ExportPolicy = { type:'avoidedCostCredit', ratePerKWh:ExportRate, addersApply:false, carryForward:true, cashOut:false,
                 lockYears?:number|null }
             | { type:'netMetering', netting:'hourly'|'annual', exportRate:ExportRate, lockYears?:number|null,
                 trueUp?:{rate:number}|'forfeit' }
lockYears (either policy type) is a vintage lock: calc/simulate.js freezes the ExportRate at its year-0 value for years
0 through lockYears-1 (lockYears total frozen years), and resumes exportTrend escalation from year lockYears onward,
with that escalation's own exponent clock restarting at 1 there (year lockYears is factor (1+exportTrend)^1, year
lockYears+1 is (1+exportTrend)^2, and so on -- not a jump straight to (1+exportTrend)^lockYears) -- this models a
fixed-vintage export rate, e.g. AZ/NV net-metering successor tariffs that lock a customer's rate for a stated number of
years from interconnection. lockYears has no effect on a 'retail' or percentOfRetail ExportRate: both already track the
schedule's own retail rate as it escalates (via retailEscalation, not exportTrend), so there is no fixed dollar figure
for a vintage lock to freeze -- validateExportPolicy (calc/tariffs/profile.js and model/profileCodec.js both) rejects
that combination as a validation error rather than silently no-op'ing it. trueUp (netMetering netting:'annual' only)
is the year-end true-up calc/billing.js resolves leftover banked kWh with: {rate} cashes it out at that rate into the
$ ledger (same behavior as before); 'forfeit' drops it. trueUp is OPTIONAL for backward compatibility: absent, the
pre-existing implicit rule applies instead -- a numeric exportRate cashes out at that same rate; anything else
(including 'retail' and every non-numeric ExportRate kind) forfeits.
Adder = { id, label, mode:'fixed'|'monthlyTable', valuePerKWh?, monthlyValues?:number[12] }
Rider = { id, label, percentOff }
UtilityProfile = { id, label, schedules:Schedule[], adders:Adder[], riders:Rider[], exportPolicy:ExportPolicy,
  constraints:{ sizeCapMode?:'trailing12moUsage', allowedFinancing:string[], interconnectionFees:{singlePhase, threePhase} } }
ridersTotalPercentOff(riders, riderIds) caps its return at 1 (100% off), so selected riders can never drive a bill
subtotal negative. validateProfileShape flags a profile whose riders CAN sum past 100% off when selected together
(every rider with no exclusiveGroup, plus the largest rider in each exclusiveGroup), so that authoring mistake is
caught before it reaches billing.js.
adderCost's ecaMode:'fixed'/ecaFixedValue override is keyed off adder.mode === 'monthlyTable', NOT any specific
adder id (it used to be keyed off adder.id === 'eca'; that limitation is fixed) -- ANY monthlyTable adder a profile
declares gets the same fixed-value override LEU's own `eca` adder does. The options key stays named
ecaMode/ecaFixedValue for state/storage compatibility, but CONTRACTS (and the code) treat it as a monthly-table
override, not an ECA-specific one. adderCost throws when ecaMode is 'fixed' and ecaFixedValue is not a number,
rather than pricing that adder at $0 or NaN.
validateExportRate(exportRate, {context:'avoidedCostCredit'|'netMetering', netting?}) validates one ExportRate value
in context: 'retail' is netMetering-only; percentOfRetail is netMetering-with-netting:'hourly'-only; a timeTable's
periods are checked for non-negative rates, a materialized applies() predicate, pairwise window-overlap (any two
periods whose window descriptors can both apply the same hour is an error -- first-match-wins makes an overlap
ambiguous about which period actually governs that hour), AND -- only once every period has passed the checks above --
full 8760-hour coverage (every hour of the reference year must match at least one period's applies(); a gap is an
error naming the first uncovered hour, rather than the raw "no ... period matches hour N" throw that gap would
otherwise only surface deep inside calc/billing.js the first time a real hour actually lands there).
validateSchedule's own `tou` pricing.periods are checked identically (non-negative rates, applies(), and the same
full-hour-coverage check; TOU pricing has no overlap check of its own at the engine layer, unlike a timeTable
ExportRate -- see model/profileCodec.js's shared validatePeriodsList, which checks BOTH overlap and coverage for TOU
pricing.periods AND ExportRate periods at import time, before either ever reaches a materialized applies() function).
validateExportPolicy additionally validates lockYears (positive integer or absent; also an error when combined with a
'retail' or percentOfRetail export rate -- see this file's own lockYears paragraph above) and trueUp (only meaningful
under netMetering netting:'annual'; otherwise flagged).

## calc/tariffs/lodi.js
export const LODI (UtilityProfile) with schedules EA, EV (rider meter), G1, G2; plus named constants the assumptions page imports: LODI_EA (rates/breakpoints/fixed), LODI_EV, LODI_G1, LODI_G2, LODI_ECA_MONTHLY (FY2025-26 actuals + Jul 2026 0.0496), LODI_EP_RATE (0.0843 FY2026-27), LODI_EP_HISTORY, LODI_STATE_ENERGY_TAX (0.0003), LODI_RIDERS, LODI_FEES, sources (URL strings).

## calc/tariffs/custom.js
buildCustomProfile(inputs) -> UtilityProfile; validateProfile(profile) -> string[] of errors.
buildCustomProfile is the single materialization point for a tou period's applies() predicate: it turns each
period's window descriptor (period.window = { hours:[start,end], days, excludeHolidays }) into a live
applies(hourCtx)=>bool function via buildAppliesFromWindow(window) -> (hourCtx)=>bool, also exported. State,
storage.js's localStorage record, a share link, and the worker/calcWorker.js postMessage payload carry the
descriptor form ONLY, never a function, so the value stays structured-clone-safe and JSON-safe everywhere it
travels; buildCustomProfile is called fresh inside the worker on every engine run rather than assuming a function
survived a serialization boundary it cannot cross. A period whose window is missing or malformed passes through
unchanged (no applies attached), so validateSchedule above reports its own "missing an applies() predicate" error
for that period instead of this function throwing.
buildCustomProfile is likewise the single materialization point for an ExportRate timeTable's periods (on
exportPolicy.ratePerKWh or .exportRate): the identical window-descriptor vocabulary and buildAppliesFromWindow do the
materializing, and the identical "descriptor form only, never a function, upstream of buildCustomProfile" rule
applies. Every other ExportRate kind (a plain number, 'retail', monthlyTable, percentOfRetail) passes through
buildCustomProfile unchanged.
buildCustomProfile also threads inputs.minimumBillPerMonth and inputs.systemSizeCharges straight onto the built
schedule (schema.minimumBillPerMonth/systemSizeCharges), omitted entirely when null/undefined (or, for
systemSizeCharges, empty) rather than written as an explicit 0/[] -- matching calc/billing.js's own "absent means no
floor / 0 charge" default. These are the one place model/components/HouseholdSection.jsx's CustomProfileBuilder form
fields for a minimum bill and system-size charges actually reach the engine.

## calc/solar.js
solarHourly({ arrays:[{ kwDC, tilt, azimuth, inverterEff, lossFrac, degradationRate }], year }) -> number[8760]
Uses data/solar-shapes.json (per-kW-DC AC output grid keyed by tilt/azimuth); bilinear interpolation between grid points; year applies (1-degradationRate)^year.

## calc/wind.js
windHourly({ turbines:[{ powerCurve:[{ms,kw}], hubHeightM, annualMeanWindMS }], year }) -> number[8760]
annualMeanWindMS is measured at REFERENCE_HEIGHT_M (10 m); it is extrapolated to hubHeightM via the power-law
wind-shear model (WIND_SHEAR_ALPHA = 1/7): speedAtHub = annualMeanWindMS * (hubHeightM / 10) ^ (1/7). The hub-height
speed is shaped by data/wind.json diurnal/seasonal factors (deterministic, mean-1, no Math.random()) into an hourly
mean. Each hour's output is the expectation of the power curve over a Rayleigh distribution whose mean is that
hour's shaped speed, evaluated by deterministic Simpson's-rule quadrature (no sampling) -- this is what "Rayleigh
distribution" means here, not a per-hour sampled draw. powerAt() holds the curve's last point flat above its
top speed (a turbine furls rather than hard-shuts-down) unless the preset publishes a cutOutMS, in which case output
is 0 above that speed.

## calc/load.js
loadHourly({ mode:'annual'|'monthly'|'hourly', annualKWh?, monthlyKWh?, hourlyKWh?, profileId:'residential'|'small-commercial', ev?:{ kWhPerDay, windowStartHour, windowEndHour, daysPerWeek } }) -> { base:number[8760], ev:number[8760] }
Scales data/load-shapes.json day-type templates; monthly mode rescales each month to the given kWh.

## calc/battery.js
dispatchBattery({ net:number[8760] /* production - load; + = surplus */, battery:{ usableKWh, chargeEff, dischargeEff, maxChargeKW, maxDischargeKW, reserveFrac, cycleLife?, calendarLifeYears?, gridCharge? }, mode:'self-consumption'|'peak-shave', shaveThresholdKW? })
 -> { gridImport:number[8760], gridExport:number[8760], throughputKWh, equivalentFullCycles, gridChargeKWh }
Caller degrades usableKWh per year (see calc/simulate.js's capacityFraction). No battery => pass battery:null,
function splits net into import/export directly. Surplus charging happens only when net[h] > 0 (on-site surplus);
that path is unaffected by gridCharge and always charges toward full capacity, never toward a lower grid-charge
target.
gridCharge = { enabled:false, windowStartHour:22, windowEndHour:6, targetSocFrac:1.0 } (all four fields optional;
omitted or enabled:false is byte-identical to a battery with no gridCharge field at all -- no grid-charging path
runs for any hour). The window is hour-of-day based (calc/time.js's hourOfDay), inclusive of windowStartHour and
exclusive of windowEndHour, and wraps past midnight when windowStartHour > windowEndHour (22..6 covers 22:00-23:59
and 00:00-05:59). Inside an active window (enabled, hour-of-day in range, and state of charge below
targetSocFrac x usableKWh), after surplus charging (above) the battery draws additional energy from the grid this
same hour, capped by the LEAST of: maxChargeKW minus whatever AC-side power surplus charging already used this hour
(the two share one power budget), (targetSocFrac x usableKWh - soc) / chargeEff (remaining input needed to reach
the target, since stored = gridEnergy x chargeEff), and, in 'peak-shave' mode only, BOTH shaveThresholdKW minus the
hour's import so far AND the current calendar month's own already-established import peak (monthPeakSoFar, tracked
hour by hour via calc/time.js's monthOfHour and reset to 0 at every month boundary) minus the hour's import so far
-- that import figure is already post-discharge (see below), so these caps only ever add into room left under the
threshold or under the month's own peak; they never re-raise an hour's import back above either one. The
month-peak cap is what makes grid charging never raise the billed monthly peak (and so never raise a demand
charge) even in a month whose natural peak sits under shaveThresholdKW: absent it, every in-window hour would be
topped up to the threshold regardless, manufacturing a new peak that was never actually there. That billed peak is
not always exactly the same with grid charging on versus off, only ever the same or lower: stored grid energy can
let the battery shave a later peak the same month that a grid-charging-off run lacks the state of charge to shave,
so the on arm's peak can come out strictly lower than the off arm's for that month. In 'self-consumption'
mode, while a grid-charge window is active the battery never discharges even against a deficit hour --
buy-now-discharge-later is the point, so charging and discharging never overlap in the same hour; the deficit is
served entirely from the grid instead. In 'peak-shave' mode, an active grid-charge window does NOT suppress
discharge: shaving takes priority over the window, so a deficit hour whose gross import exceeds shaveThresholdKW
still discharges down to the threshold (reserve floor permitting) exactly as it would outside the window, and grid
charging that same hour is limited to whatever room is left under the threshold afterward -- often none.
Grid-charge energy adds straight into gridImport[h] alongside any deficit the hour already required, so it hits
tiers, TOU pricing, ECA, and demand charges downstream exactly like any other import, with no special-casing in
calc/billing.js. `gridChargeKWh` is total grid-side energy drawn by
grid charging across the whole series (not the surplus-charging fraction, and not the chargeEff-scaled stored
side). `equivalentFullCycles` counts grid-sourced energy once it is later discharged the same as any other stored
energy, since state of charge does not track where a kWh came from -- there is no separate accounting needed to
make grid-sourced throughput count toward cycle life.
The schema has no dodFrac ("depth of discharge") field: usableKWh IS the usable capacity a preset or custom entry
states directly, so there is no separate fraction-of-nameplate figure to track or apply anywhere in calc/ or model/
schema.js.

## calc/billing.js
priceYear({ gridImport:number[8760], gridExport:number[8760], schedule, profile, options:{ ecaMode:'trailingAverage'|'fixed', ecaFixedValue?, addersOnExports:boolean, riderIds:string[], openingLedger?:number, openingKwhLedger?:number, systemSizes?:{kwDCSolar?:number, kwhBattery?:number} } })
 -> { monthly:[{ fixed, energy, adders, demand, systemCharge, riderDiscount, exportCredit, total }], annualTotal, exportLedgerEndBalance, kwhLedgerEndBalance }
Tier (or all-units-block) position tracked per calendar month from cumulative import kWh. options.openingLedger
(default 0) seeds the $ export credit ledger every export policy shares; exportLedgerEndBalance is the Dec 31
balance, and the caller (calc/simulate.js) threads it into the next year's openingLedger rather than resetting to 0
-- credit only ever offsets a bill, it never cashes out.
systemCharge is schedule.systemSizeCharges billed monthly (0 when the schedule declares none): sum of
size * ratePerMonth per entry, where size is options.systemSizes.kwDCSolar or .kwhBattery per entry's basis (both
default 0 when options.systemSizes is omitted).
schedule.minimumBillPerMonth (optional, default 0 i.e. no floor) floors the month's total AFTER riders and AFTER
export-credit offset -- matches a utility minimum bill that a customer's own credits cannot erase. This is enforced
by capping how much of the $ ledger a month is allowed to draw down to (subtotal - minimumBillPerMonth, floored at
0), NOT by applying the full credit and then flooring the result: credit that would have pushed the bill below the
floor is left UNSPENT in the ledger, available for a later month, rather than drawn out and then wasted against the
floor. subtotal itself (pre-export-credit, post-rider) is still clamped to a minimum of 0 regardless, so monthly
total (and annualTotal) is never negative under any export policy even before the floor is considered.
Implements both profile.exportPolicy.type values (anything else throws, quoting both): 'avoidedCostCredit' (LODI's)
and 'netMetering'. Fixed, demand, and system-size charges are never netted or credited under any policy -- they are
driven by the raw hourly import series (or, for system-size charges, options.systemSizes) regardless of export
policy.
- avoidedCostCredit and netMetering netting:'hourly' both earn a $ credit PER EXPORTING HOUR, resolved via
  tariffs/profile.js's resolveExportRate(ratePerKWh or exportRate, schedule, hourCtx, cumulativeImportKWh) and
  accumulated into the same per-month bucket -- avoidedCostCredit resolves its own ratePerKWh, hourly netMetering its
  own exportRate ('retail' only valid there), both through the identical ExportRate resolution (see
  tariffs/profile.js's section above for every ExportRate kind). The month's adders-on-exports deduction (when
  addersOnExports is true) is still computed once per month on the month's total exported kWh, then the net figure
  is added to the $ ledger every policy shares.
- netMetering, netting:'annual' (kWh netting, typical muni NEM): import and export are netted in kWh *before*
  pricing, every month: billed kWh = max(0, importKWh - exportKWh - carriedKWhCredit), where carriedKWhCredit is kWh
  credit left over from earlier months in the same calendar year; unconsumed export becomes next month's
  carriedKWhCredit. Tiered (or all-units-blocks) pricing's rate position and every per-kWh adder read off this NET
  billed kWh (netting is volumetric, so it moves the same kWh figure every volumetric charge prices from), not the
  raw import. A TOU schedule nets *within each period* rather than against the whole month's total -- a period's
  export only offsets that same period's own import, never a different period's; carriedKWhCredit is drawn down
  against each period's own excess import starting with the most expensive period for that season and proceeding
  downward (declaration order must never change a bill: two imports of the same tariff listing periods in different
  orders bill identically, and banked kWh displaces cost at the highest marginal rate first), and a period's own
  excess export (beyond its own import) becomes carry the same way the whole month's does in the non-TOU case. The
  kWh ledger is intra-year only: at the 12th month (the annual true-up) whatever kWh credit remains is resolved and
  zeroed rather than carried into next year's January. exportPolicy.trueUp controls the resolution: {rate} cashes
  the leftover kWh at that rate into a one-time $ credit added to the same $ ledger every policy shares (so it then
  carries forward and never cashes out, same as avoidedCostCredit); 'forfeit' drops it (matches common muni year-end
  forfeiture). trueUp is OPTIONAL for backward compatibility: absent, the pre-existing implicit rule applies
  instead -- a numeric exportRate cashes out at that same rate; 'retail', or any non-numeric ExportRate kind (none of
  which name a single $/kWh figure to cash a lump kWh balance out at), forfeits. Either way, 'retail' during the year
  already means each netted kWh displaced retail-rate energy (it set the tier/TOU rate that kWh would otherwise have
  billed at) -- it does not mean the true-up itself pays out at a retail rate, since kWh netting has no per-kWh
  dollar figure to pay a true-up out at in the first place.
This module does not itself apply exportPolicy.lockYears -- that is calc/simulate.js's concern (see its section
below), applied before the (possibly still-frozen, possibly escalated) exportPolicy for a given year ever reaches
priceYear.
options.openingKwhLedger/kwhLedgerEndBalance thread the annual-netting kWh ledger the same openingLedger/
exportLedgerEndBalance pattern threads the $ ledger, so calc/simulate.js can carry both per meter with one uniform
pattern regardless of export policy. Under the once-a-year true-up above, kwhLedgerEndBalance always reads back 0 (it
never survives past December) for every export policy today -- this is a no-op currently, kept only so the two
ledgers stay symmetric in the caller's wiring rather than special-casing one of them out.

## calc/simulate.js
export const PAYBACK_SEARCH_YEARS = 40 -- floor on how many years a payback search runs, independent of
assumptions.horizonYears. Each ConfigResult is simulated over ANALYSIS_YEARS = max(horizonYears,
PAYBACK_SEARCH_YEARS) years, not just horizonYears, so a payback or a replacement event landing after a short
ownership horizon is still visible instead of being silently cut off at the horizon.
simulateComparison({ configs, household, profile, assumptions }) -> { baseline: ConfigResult, results: ConfigResult[] }
ConfigResult = { configId, years:[{ billTotal, productionKWh, selfConsumedKWh, exportKWh, importKWh, cycles, gridChargeKWh }] (length ANALYSIS_YEARS), horizonYears (echoes assumptions.horizonYears; marks where the ownership window ends within `years`), representativeDays:{ summer:DayFlows, winter:DayFlows }, totals }
`totals` sums only the first `horizonYears` entries of `years` (not the full ANALYSIS_YEARS array) -- it answers
"over my ownership window," the same lens calc/finance.js's NPV/IRR/lifetimeSavings/effectiveCostPerKWh use, so a
payback-search year past the horizon never dilutes or inflates it.
DayFlows = { production:number[24], load:number[24], batteryFlow:number[24], gridImport:number[24], gridExport:number[24] } (median-production day of the season)
`gridChargeKWh` is dispatchBattery's grid-charge total for that year (config.battery.gridCharge threads straight
through, since the battery object handed to dispatchBattery is a spread of config.battery); `totals.gridChargeKWh`
sums it across the horizon the same way as every other totals field. It is 0 for every year of a config with no
battery, or a battery whose gridCharge is absent/disabled. batteryFlow (both representativeDays and the identity
below) already reflects grid-charge energy with no separate field or code path -- it is derived as
production - load - gridExport + gridImport, and grid-charge energy shows up there simply by having added to
gridImport for that hour.
household = { schedule, riderIds, usage inputs per calc/load.js, options for billing }
assumptions = { horizonYears (default 25), retailEscalation, exportTrend, ecaMode, addersOnExports }
Export credit ledgers carry each year's Dec 31 balance into the next year's Jan 1 opening balance (one $ ledger per
meter -- base and, when the EV rider applies, the EV meter bank separately -- plus, for calc/billing.js's annual
kWh-netting mode, one kWh ledger per meter threaded the identical openingLedger/exportLedgerEndBalance-style way;
see priceYear's own header for why that kWh ledger always reads back 0 today regardless). Retail escalation
((1+retailEscalation)^year) scales the schedule's energy rates (tiered/flat-seasonal/tou/all-units-blocks alike),
fixed charge, demand rates, minimumBillPerMonth, and systemSizeCharges' ratePerMonth, and the profile's adders (ECA,
state energy tax) -- every dollar figure that inflates like retail power, not just the energy line; kWh
boundaries (tiered breakpoints, all-units-blocks upToKWh) are thresholds, not dollars, and are left untouched.
Export trend scales the export policy's own ExportRate figure(s) (tariffs/profile.js's typedef: avoidedCostCredit's
ratePerKWh, or netMetering's exportRate) via exportEscalationFactor -- (1+exportTrend)^year by default, but honoring
an optional exportPolicy.lockYears vintage lock: factor 1 (frozen at the year-0 rate) for every year < lockYears,
then (1+exportTrend)^(year - lockYears + 1) from year lockYears onward, i.e. the escalation exponent's own clock
resets to 1 at lockYears (year lockYears gets one full compounding step) rather than continuing to count from year
0. escalateExportRate scales a flat number, or every
rate inside a monthlyTable/timeTable, directly by that factor; 'retail' and percentOfRetail's fraction are left
untouched (both already follow retailEscalation, by reading a rate off the separately-escalated schedule at billing
time, rather than carrying a dollar figure of their own to scale a second time). exportPolicy.trueUp's own {rate}
(when present) escalates by the identical factor, since it is the same kind of $/kWh figure; a 'forfeit' trueUp has
no rate to scale.
config's actual nameplate solar/battery sizes (systemSizes = { kwDCSolar: sum of config.solar.arrays[].kwDC,
kwhBattery: config.battery.usableKWh }, computed once per config, not per year) thread into priceYear's
options.systemSizes for the BASE meter's priceYear call ONLY, for schedule.systemSizeCharges -- never the EV rider
meter's call, even when evRiderApplies is true. A config's nameplate solar/battery size is one physical fact about
the property, not two: if schedule.EV also happens to declare its own systemSizeCharges, options.systemSizes is
simply absent from that call (priceYear/systemSizeChargeForMonth read the missing sizes as 0), so a two-schedule
household (base + EV rider) is never billed the same nameplate size twice. This uses the battery's NAMEPLATE
usableKWh, not a given year's degraded capacity (capacityFraction) -- a system's physical size for billing purposes
does not shrink as the battery ages.
selfConsumedKWh = totalLoadKWh - totalImportKWh: energy that actually served load, which
excludes battery round-trip losses and whatever charge is still stored at year end (neither reached the load).
Battery capacity degrades linearly from nameplate to 70% at whichever comes first of cycleLife or calendarLifeYears;
a battery missing BOTH channels never degrades (capacityFraction returns 1 for every year, since "no data" is not
"already at end of life").

## calc/finance.js
financeConfig({ result:ConfigResult, baseline:ConfigResult, costs:{ gross, incentives:[], sizes?:{kwSolar?,kwhBattery?,kwBattery?}, oAndMPerYear, inverterReplacement:{year,cost}|null, batteryReplacement:{year,cost}|null }, financing:{ type:'cash'|'loan', downPaymentFrac?, aprPct?, termYears? }, econ:{ discountRatePct } })
 -> { cashFlows:number[], cumulative:number[], horizonIndex:number, paybackYear:number|null, npv, irr:number|null, lifetimeSavings, effectiveCostPerKWh }
costs.incentives resolves in two parts (see calc/incentives.js for the per-type shapes): resolveIncentives() folds the
one-time types (fixed, percent, perUnit) into cashFlows[0] as an upfront cost reduction, reading costs.sizes (optional,
default {}) for perUnit lines; resolveRecurringIncentiveIncome() adds the recurring INCOME types (annualProduction,
annualFixed) into cashFlows[year] for year = 1..analysisYears as a POSITIVE contribution, keyed to
result.years[year-1].productionKWh for annualProduction lines (that year's own degradation-aware production, not a
flat year-1 estimate). Recurring income shares cashFlows/cumulative's extended-window scoping unchanged: income
landing in a year past horizonYears (but within analysisYears) still appears in cashFlows/cumulative and can still
pull paybackYear earlier or later, exactly like a replacement cost, while npv/irr/lifetimeSavings stay scoped to
horizonYears via the horizonFlows slice.
Reads result.horizonYears (not result.years.length) as the ownership horizon. cashFlows/cumulative run over the full
analysis window -- min(max(horizonYears, PAYBACK_SEARCH_YEARS), result.years.length, baseline.years.length) years
after the upfront index-0 entry -- so a replacement event or a payback crossing landing after the horizon still
appears in them; horizonIndex (== horizonYears) is the index within those two arrays where the ownership window
ends, the single-series-plus-index contract other modules (report/prose.js, ComparisonTable, CashFlowChart) read to
tell a horizon-scoped figure from a beyond-horizon one, e.g. cumulative[horizonIndex] === lifetimeSavings.
Loan math must match calcPmt in home-purchase-comparison/App.jsx. Loan financing throws if termYears is non-finite
or <= 0, or aprPct is non-finite, rather than silently dropping the financed principal from cash flows.
paybackYear is searched over the FULL cashFlows/cumulative (the whole analysis window, not just horizonYears): the
first ownership year after which cumulative never goes negative again, found by scanning for the LAST index still
negative and interpolating the crossing right after it (so a later dip, e.g. a replacement-year cost, pushes the
reported payback out to the last recovery), returns 0 only when cumulative is never negative at all, and null only
when it is still negative at the end of the full analysis window -- cashFlows[0] >= 0 alone does not imply payback.
A non-null paybackYear greater than horizonIndex is a genuine payback the user will not own the system long enough
to reach; callers are expected to say so rather than presenting every payback as if it fell inside the horizon.
irr() scans [-0.99, 10] for sign changes, bisects every bracket found, verifies each candidate against a tolerance
scaled to the cash-flow magnitude, and returns the genuine root nearest 0% (or null if none verify), so a
non-monotone flow (a replacement-year cost) cannot produce a rate that is not actually an NPV zero. NPV and IRR are
computed from cashFlows.slice(0, horizonIndex + 1) only -- horizon-scoped, unaffected by the extended search window.
effectiveCostPerKWh = (gross - incentives.total + discounted O&M/replacements) / discounted productionKWh, both
discounted sums taken over horizonYears only, computed identically regardless of financing.type -- a loan's down
payment/principal split and its interest are financing choices, not a cost of the system, so cash and loan purchases
of the identical system land on the same effective cost per kWh. incentives.total here is resolveIncentives' one-time
total ONLY -- annualProduction/annualFixed recurring income is deliberately excluded from this figure, because it is
revenue the system earns over time, not a reduction of what the system cost to install; it is instead fully counted
in cashFlows/npv/lifetimeSavings above, which are the figures that answer what owning the system nets the buyer.

## calc/incentives.js
Five incentive line-item types: { label, type:'fixed', amount } (existing); { label, type:'percent', percent,
capAmount?:number }; { label, type:'perUnit', unit:'kW-solar'|'kWh-battery'|'kW-battery', ratePerUnit, capAmount?:number };
{ label, type:'annualProduction', ratePerKWh, years:number }; { label, type:'annualFixed', amount, years:number }.
The first three are one-time, year-0 items (they reduce a system's upfront cost); the last two are recurring INCOME
items (an SREC/performance-payment stream keyed to actual annual production, or a flat per-year payment such as a
battery VPP enrollment), paid for `years` consecutive ownership years starting at year 1.

resolveIncentives(list, grossCost, sizes?:{kwSolar?, kwhBattery?, kwBattery?}) -> { total, lines:[{label, amount}] }
resolves ONLY the one-time types against grossCost/sizes; annualProduction/annualFixed items resolve to no line here.
A percent line's amount is `percent/100 * grossCost`; a perUnit line's amount is `ratePerUnit * sizes[unit's field]`
(0 for a missing/unmatched sizes field, e.g. no `sizes` argument at all). Either type's capAmount, when present, ceils
that line's own amount -- applied per line, after that line's amount is computed against grossCost/sizes, never
against a running total other lines have already reduced. This (plus fixed's and percent's pre-existing gross-cost-only
basis) is what keeps resolution order-independent: two incentive lists differing only in declaration order resolve to
the same total and the same per-line amounts, since no line's amount ever depends on another line's.

resolveRecurringIncentiveIncome(list, year:number, productionKWh:number) -> { total, lines:[{label, amount}] } resolves
ONLY the recurring types, for one 1-based ownership year (matching calc/finance.js's cashFlows indexing: year 1 is the
first full ownership year after the upfront moment). fixed/percent/perUnit items resolve to no line here. An item pays
in years 1..item.years inclusive (boundary year included), 0 outside that window including year 0 -- no partial-year
proration. annualProduction's amount is `ratePerKWh * productionKWh`, where `productionKWh` is the caller's own
already-degradation-aware production figure for that specific calendar year (calc/simulate.js's
ConfigResult.years[n].productionKWh), not a flat year-1 estimate, so a degrading array's income falls in step with its
output; annualFixed's amount is always its flat `amount`, independent of production.

Exported constants: FEDERAL_25D_STATUS (expired 2025-12-31 note), CA_PROPERTY_TAX_NOTE (sunset 2027-01-01).

## calc/sweep.js
The sizing explorer's grid generator and per-point engine runner -- the broad first-pass scan a user runs before
building configs by hand in the detailed editor.
generateSweepGrid({ categories:{solar:boolean, battery:boolean, wind:string[]} }) -> SweepPoint[]
SweepPoint = { solarKW, batteryKWh, windPresetId:string|null }. solarKW ranges 0..14 step 1 when categories.solar is
true, else fixed at [0]. batteryKWh ranges 0..30 step 5 (when categories.battery is true, else fixed at [0]) unioned
with every data/equipment-presets.json battery preset's exact usableKWh, deduped to 2 decimal places. windPresetId is
null ("no wind") plus one entry per id in categories.wind that resolves to a real data/wind.json preset -- only
turbine presets the caller ticks are swept, never every preset unconditionally the way battery's are. The single point
where solarKW===0 && batteryKWh===0 && windPresetId===null is always omitted: it is byte-identical to the no-system
baseline, so it carries no sizing information regardless of which categories are checked, and this one filter is what
makes solar's (or battery's) own 0 value absent whenever it is the only category ticked.
solarArraySpec(kwDC, pricingAssumptions?) / batterySpec(kWh) / turbineSpec(windPresetId) build one SolarArrayInput /
BatteryInput(schema shape, see below) / WindTurbineInput per calc/simulate.js's typedefs, from
data/equipment-presets.json's/data/wind.json's default equipment parameters (south-facing 20-degree tilt for solar; a
preset's own hubHeightDefaultM and this module's own DEFAULT_ANNUAL_MEAN_WIND_MS for wind, mirroring
model/schema.js's newSolarArray/newTurbine defaults since calc/ cannot import model/). batterySpec returns null for
kWh <= 0 (no battery). A kWh matching a preset's usableKWh (within 0.01) returns that preset's own
roundTripEff/maxChargeKW/maxDischargeKW/cycleLife/calendarLifeYears; any other kWh gets LFP chemistry defaults
(batteryDefaultsByChemistry.LFP) for the efficiency/life fields and a blended kW-per-kWh power rating averaged across
every preset. batterySpec's return shape is schema-Config-battery-shaped
(usableKWh/roundTripEff/maxChargeKW/maxDischargeKW/reserveFrac/cycleLife/calendarLifeYears, no chargeEff/dischargeEff)
so model/schema.js's configFromSweepPoint can drop it straight into a Config.battery slice unchanged.
solarCost(kwDC, pricingAssumptions?) / windCost(windPresetId, pricingAssumptions?) / batteryCost(kWh,
pricingAssumptions?) price a point from the same defaults: $/W and $/kW straight from data/equipment-presets.json;
battery cost is the matching preset's installedCostUSD on an exact match, else interpolatedBatteryCostPerKWh(kWh) *
kWh. interpolatedBatteryCostPerKWh piecewise-linearly interpolates $/kWh across every preset sorted by usableKWh;
below the smallest or above the largest preset's kWh, that endpoint's own $/kWh rate is held flat rather than
extrapolating the interpolation line.
pricingAssumptions (SweepPricingAssumptions, optional on every function above and on runSweep below) is
components/ExplorerSection.jsx's own "Pricing assumptions" group: { solarCostPerWatt?, batteryCostPerKWh?,
windCostPerKW?, solarTiltDeg?, solarAzimuthDeg?, oAndMPerKWDCPerYear?, inverterReplacement?:{year,costPerWatt}|null }.
Every field, and the argument itself, is optional -- an absent field (or an absent argument entirely) reproduces
today's own default exactly, the backward-compatibility contract every pre-existing call site relies on.
batteryCostPerKWh, when a number (including 0), REPLACES catalog-based battery pricing entirely for every point,
not just non-preset sizes -- an exact preset match no longer prices at that preset's own installedCostUSD once this
override is set. solarTiltDeg/solarAzimuthDeg reach solarArraySpec (and therefore the engine run itself, not just
cost) since a sweep point's own production depends on them. oAndMPerKWDCPerYear and inverterReplacement's costPerWatt
scale against a point's own solar kW-DC only (never total system size); inverterReplacement resolves to null on any
point with 0 kW-DC solar even when the override itself is set, since there is no inverter to replace.
runSweep(grid, { household, profile, assumptions, discountRatePct, interconnectionFee, annualUsageKWh, sizeCapped,
incentives?:Array, pricingAssumptions?, onProgress? }) -> Array<{ sizes:{solarKW,batteryKWh,windPresetId}, upfront,
npv, paybackYear, paybackBeyondHorizon, year1Savings, exceedsSizeCap, oAndMPerYear, inverterReplacement:{year,cost}|null }>.
`incentives` (calc/incentives.js line items, default []) is applied identically to every point, but resolved per
point against that point's OWN sizes: { kwSolar: point.solarKW, kwhBattery: point.batteryKWh, kwBattery:
batterySpec(point.batteryKWh)?.maxChargeKW ?? 0 } -- so a perUnit or percent/cap line prices each point's own
equipment, not one shared figure across the whole sweep, and a solar-only point sees 0 kWh-battery/kW-battery
quantity (an incentive keyed to a size the point doesn't have contributes nothing to it). Passed straight through as
costs.incentives/costs.sizes on each point's own financeConfig call, so a recurring type (annualProduction,
annualFixed) resolves exactly like it does in the detailed comparison -- as income in that point's cashFlows[1..] --
since a sweep point's financeConfig call is otherwise no different from the detailed comparison's. oAndMPerYear/
inverterReplacement (from pricingAssumptions, see above) are threaded into that same financeConfig call's
costs.oAndMPerYear/costs.inverterReplacement, and also carried onto the returned point itself so
model/schema.js's configFromSweepPoint can pin a promoted config's costs.oAndMPerYear/inverterReplacementYear/
inverterReplacementCost to the exact figures the sweep priced, the same role `upfront` already plays for the gross
component costs. `upfront` is unaffected by incentives (it is gross component + interconnection-fee cost only, same
as before); only `npv`/`paybackYear`/`paybackBeyondHorizon` move. household/profile/assumptions are the already-resolved engine shapes
model/runEngine.js's resolveHousehold/toEngineAssumptions produce (see that file's header) -- runSweep itself does no
tariff/schedule resolution, only calc/simulate.js + calc/finance.js calls, so there is exactly one engine-invocation
path for both the detailed comparison and the sizing explorer. Points are batched SWEEP_BATCH_SIZE (10) at a time
into one simulateComparison call per batch (not one call per point): calc/simulate.js recomputes the identical
no-system baseline on every call regardless of how many configs it's given, so batching amortizes that recompute
across 10 points instead of paying it once per point, roughly halving a default sweep's runtime, while a per-batch
financeConfig call still runs once per point (cheap: cash-flow arithmetic, no simulation) with financing:{type:'cash'}
(a sweep point has no financing plan of its own; "Add as configuration" is what lets a user pick one).
paybackBeyondHorizon mirrors calc/finance.js's own horizonIndex convention: true only when paybackYear is non-null and
greater than finance.horizonIndex. exceedsSizeCap mirrors model/runEngine.js's own oversized check (sizeCapped &&
result.years[0].productionKWh > annualUsageKWh). onProgress, when given, is called synchronously once per completed
batch with {done, total} -- worker/calcWorker.js's {kind:'sweep'} branch posts these straight through as they arrive,
streaming to the main thread as the loop runs, since cancellation is the caller terminating that worker outright
rather than a cooperative in-loop check.
bestByNpv(points) / bestByPayback(points) return the single best point (or null on an empty/fully-capped list) among
points with exceedsSizeCap:false; bestByPayback also excludes a null paybackYear (never pays back within the search
window) -- both ignore capped points so a picked point is never one LEU would reject outright.

## calc/incremental.js
incrementalAnalysis({ config, household, profile, assumptions, costs }) -> [{ component:'battery'|'wind', addedCost, addedAnnualSavings, standalonePaybackYears:number|null }]
Implemented by re-simulating the config with that component removed. addedAnnualSavings averages bill savings over
the ownership horizon only (the re-simulated result's own horizonYears field), a representative "typical year"
figure. standalonePaybackYears searches the FULL analysis window (out to max(horizonYears, PAYBACK_SEARCH_YEARS)),
returning an absolute year that can land after the horizon; null only when the component's cumulative net savings
never recover addedCost anywhere in that window.
