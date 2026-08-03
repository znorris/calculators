// Every constant this page shows is imported from calc/ or data/, never
// retyped, so the page cannot disagree with the engine that produces a
// user's results. Where the engine doesn't export a value this page would
// otherwise need, the number is left out rather than copied by hand -- see
// the gaps called out inline near each such spot.

import { useEffect } from "react";
import { Breadcrumb } from "../../shared/Breadcrumb.jsx";
import { GlossaryProvider, Term } from "../../shared/Term.jsx";
import { GLOSSARY, GLOSSARY_BY_ID } from "../glossary.js";
import {
  LODI,
  LODI_EA,
  LODI_EV,
  LODI_G1,
  LODI_G2,
  LODI_ECA_MONTHLY,
  LODI_ECA_HISTORY,
  LODI_EP_RATE,
  LODI_EP_HISTORY,
  LODI_STATE_ENERGY_TAX,
  LODI_RIDERS,
  LODI_FEES,
  sources as lodiSources,
} from "../calc/tariffs/lodi.js";
import { FEDERAL_25D_STATUS, CA_PROPERTY_TAX_NOTE } from "../calc/incentives.js";
import { REFERENCE_HEIGHT_M, WIND_SHEAR_ALPHA } from "../calc/wind.js";
// Only the metadata (site, grid axes, source note) this page displays, not
// the 2.4 MB hourly grid solar.js interpolates against -- importing
// calc/solar.js itself (even for just its two exported constants) would
// still pull that grid in, since calc/solar.js is bundled as one chunk
// shared with the main calculator, which does need it for solarHourly().
import solarShapes from "../data/solar-shapes.meta.json";

// Same PVWatts params.losses/params.inv_eff calc/solar.js hardcodes as
// DEFAULT_LOSS_FRAC/DEFAULT_INVERTER_EFF (see that file's comment) -- read
// from the fetched metadata here instead of importing calc/solar.js itself,
// so this page never disagrees with the engine without depending on a
// module that would drag the full grid back in.
const DEFAULT_LOSS_FRAC = solarShapes.meta.params.losses / 100;
const DEFAULT_INVERTER_EFF = solarShapes.meta.params.inv_eff / 100;
import windData from "../data/wind.json";
import loadShapes from "../data/load-shapes.json";
import equipmentPresets from "../data/equipment-presets.json";
import { money, moneyExact, percent } from "../format.js";
import { color, card } from "../theme.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Per-kWh rates carry four significant decimals (e.g. $0.1428); money()/moneyExact() round to whole cents. Returns JSX (not a string) so the kWh unit carries its own Term tooltip at every one of this page's many call sites. */
function perKWh(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <>
      ${value.toFixed(4)}/<Term id="kwh">kWh</Term>
    </>
  );
}

/** Same as perKWh above, for a per-kW rate (demand charges). */
function perKW(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    <>
      ${value.toFixed(2)}/<Term id="kw">kW</Term>
    </>
  );
}

/** Splits on ". " (period-space) rather than "." so a decimal figure like "0.20" mid-sentence isn't mistaken for a sentence end. */
function firstSentence(text) {
  return text.split(". ")[0] + ".";
}

/** Glossary table fallback for an entry with no acronym (glossary.js's discount-rate/payback): "discount-rate" -> "Discount rate". */
function idToLabel(id) {
  const words = id.split("-");
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * Scrolls a cold-navigation hash target (e.g. this page loaded directly at
 * #glossary) into view once this page's own content has actually rendered.
 * The browser's own scroll-to-anchor pass runs before React ever paints
 * anything below (there is nothing in the DOM with that id yet at that
 * point), so it lands on the empty page top rather than the target section.
 * One requestAnimationFrame deferral is enough: it runs after this render's
 * commit, once the target id exists in the DOM.
 */
function useHashScrollOnMount() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView();
    });
    return () => cancelAnimationFrame(raf);
  }, []);
}

export default function App() {
  useHashScrollOnMount();

  return (
    <GlossaryProvider glossary={GLOSSARY_BY_ID}>
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Two levels up to the index, one to the calculator. Matches the
          BreadcrumbList declared in this page's structured data. */}
      <Breadcrumb
        trail={[
          { label: "Calculators", href: "../../" },
          { label: "Energy System Comparison", href: "../" },
        ]}
        current="Assumptions"
      />

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: color.ink, margin: "0 0 6px" }}>
          What the energy system calculator assumes
        </h1>
        <p style={{ fontSize: 12.5, color: color.body, margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
          Every rate, tariff structure, and system-performance figure the calculator uses, with sources. If a
          number here looks wrong, it is wrong in your results too.
        </p>
      </header>

      <Section
        title={
          <>
            Lodi Electric Utility (<Term id="leu">LEU</Term>) rates, FY2026-27
          </>
        }
      >
        <p style={note}>
          Every rate and rule on this page describes the calculator's built-in City of Lodi Electric Utility (
          <Term id="leu">LEU</Term>) profile specifically. A household on a custom tariff uses the rates it entered
          or imported for that utility instead; none of the figures below apply to it.
        </p>
        <p style={note}>
          <Term id="leu">LEU</Term> is a municipal utility, not a CPUC-regulated investor-owned utility: it was
          never required to offer <Term id="nem">net energy metering</Term> or its successor, the Net Billing Tariff
          (NBT), so exported energy is instead bought back at a fixed avoided-cost rate the city council resets
          every July 1, and power-purchase agreements are prohibited (<Term id="leu">LEU</Term> requires
          customer-owned or customer-financed generation).
        </p>

        <h3 style={h3}>Schedule EA (Residential), tiered</h3>
        <KeyValues items={[["Fixed charge per month", moneyExact(LODI_EA.fixedChargePerMonth)]]} />
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Tier</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
                <th style={{ ...th, textAlign: "right" }}>Winter breakpoint</th>
                <th style={{ ...th, textAlign: "right" }}>Summer breakpoint</th>
              </tr>
            </thead>
            <tbody>
              {LODI_EA.pricing.rates.map((rate, i) => {
                const winterFloor = i === 0 ? 0 : LODI_EA.pricing.breakpoints.winter[i - 1];
                const summerFloor = i === 0 ? 0 : LODI_EA.pricing.breakpoints.summer[i - 1];
                const winterCeil = LODI_EA.pricing.breakpoints.winter[i];
                const summerCeil = LODI_EA.pricing.breakpoints.summer[i];
                return (
                  <tr key={i}>
                    <td style={td}>Tier {i + 1}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{perKWh(rate)}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {winterCeil == null ? (
                        <>above {winterFloor} <Term id="kwh">kWh</Term></>
                      ) : (
                        <>
                          {winterFloor}-{winterCeil} <Term id="kwh">kWh</Term>
                        </>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {summerCeil == null ? (
                        <>above {summerFloor} <Term id="kwh">kWh</Term></>
                      ) : (
                        <>
                          {summerFloor}-{summerCeil} <Term id="kwh">kWh</Term>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroller>
        <p style={note}>
          Breakpoints are cumulative monthly <Term id="kwh">kWh</Term>, not per-tier widths: each rate applies only
          to the slice of the month's usage inside its own band, the same way progressive income-tax brackets work.
        </p>

        <h3 style={h3}>
          Schedule <Term id="ev">EV</Term> (<Term id="ev">EV</Term> Circuit Rider)
        </h3>
        <KeyValues
          items={[
            ["Fixed charge per month", moneyExact(LODI_EV.fixedChargePerMonth)],
            ...LODI_EV.pricing.periods.map((p) => [`${p.id} rate`, perKWh(p.rate.summer)]),
          ]}
        />
        <p style={note}>
          A <Term id="tou">time-of-use</Term> schedule: rate depends on the hour, not just the season. A separately
          metered circuit rider, installed downstream of <Term id="leu">LEU</Term>'s own connection. Off-peak covers
          8pm-6am Monday-Friday plus all day Saturday, Sunday, and <Term id="leu">LEU</Term> holidays; on-peak is
          every other hour. <Term id="leu">LEU</Term> publishes one rate per period with no summer/winter split, so
          both seasons carry the same figure.
        </p>

        <h3 style={h3}>Schedule G1 (Small Commercial), flat-seasonal</h3>
        <KeyValues
          items={[
            ["Fixed charge, single-phase", moneyExact(LODI_G1.singlePhase.fixedChargePerMonth)],
            ["Fixed charge, three-phase", moneyExact(LODI_G1.threePhase.fixedChargePerMonth)],
            ["Summer rate", perKWh(LODI_G1.singlePhase.pricing.summerRate)],
            ["Winter rate", perKWh(LODI_G1.singlePhase.pricing.winterRate)],
          ]}
        />
        <p style={note}>Energy rates are identical across both phase configurations; only the fixed charge differs.</p>

        <h3 style={h3}>Schedule G2 (Medium Commercial), flat-seasonal + demand</h3>
        <KeyValues
          items={[
            ["Fixed charge per month", moneyExact(LODI_G2.fixedChargePerMonth)],
            ["Summer rate", perKWh(LODI_G2.pricing.summerRate)],
            ["Winter rate", perKWh(LODI_G2.pricing.winterRate)],
            ["Demand charge, summer", perKW(LODI_G2.demand.ratePerKW.summer)],
            ["Demand charge, winter", perKW(LODI_G2.demand.ratePerKW.winter)],
          ]}
        />
        <p style={note}>
          One demand rate applies to the whole month's peak import <Term id="kw">kW</Term>;{" "}
          <Term id="leu">LEU</Term> does not carry a separate peak-period demand rate on this schedule.
        </p>

        <h3 style={h3}>California state energy surcharge</h3>
        <KeyValues items={[[LODI_STATE_ENERGY_TAX.label, perKWh(LODI_STATE_ENERGY_TAX.valuePerKWh)]]} />

        <h3 style={h3}>Bill discount riders</h3>
        <KeyValues items={LODI_RIDERS.map((r) => [r.label, percent(r.percentOff, 0)])} />
        <p style={note}>
          At most one rider applies per household: {LODI_RIDERS.map((r) => r.label).join(", ")} all share the same
          exclusive group, so selecting a second throws rather than silently stacking discounts.
        </p>

        <h3 style={h3}>Sources</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {lodiSources.map((url) => (
            <li key={url} style={{ fontSize: 11.5, lineHeight: 1.8 }}>
              <a href={url} style={{ color: color.accent }} rel="noreferrer noopener" target="_blank">
                {url}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={
          <>
            <Term id="eca">ECA</Term> (Energy Cost Adjustment)
          </>
        }
      >
        <p style={note}>
          A monthly per-<Term id="kwh">kWh</Term> adder on top of the schedule's energy rate, published by{" "}
          <Term id="leu">LEU</Term> alongside its rate schedules. The default (trailing-average) mode uses the table
          below, keyed by calendar month using the most recently published figure <Term id="leu">LEU</Term> has
          issued for that month; a fixed-lock mode exists so a caller can price a future year with one flat override
          value instead of assuming the historical table still holds.
        </p>
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                {MONTH_LABELS.map((m) => (
                  <th key={m} style={{ ...th, textAlign: "right" }}>
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {LODI_ECA_MONTHLY.map((v, i) => (
                  <td
                    key={i}
                    style={{
                      ...td,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: i === 6 ? color.caution : color.body,
                    }}
                  >
                    {perKWh(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Scroller>
        <p style={note}>
          July (highlighted) is the one month where the FY2026-27 figure ({perKWh(LODI_ECA_HISTORY.jul2026)})
          supersedes the FY2025-26 actual ({perKWh(LODI_ECA_HISTORY.fy2025_26.jul)}); every other month still carries
          its FY2025-26 actual, the most recent <Term id="leu">LEU</Term> has published for that calendar month.
        </p>

        <h3 style={h3}>
          Whether <Term id="eca">ECA</Term> applies to export credits
        </h3>
        <p style={note}>
          Unresolved in <Term id="leu">LEU</Term>'s published documents: whether the <Term id="eca">ECA</Term>{" "}
          adder should reduce the value of exported energy the same way it adds to the cost of imported energy. The
          calculator defaults to leaving <Term id="eca">ECA</Term> (and every
          other adder) off of export credits: addersOnExports is only applied when explicitly turned on, so a
          missing or false value on this option always means the historical off behavior, never a computed default.
          A toggle exists to turn it on if a future <Term id="leu">LEU</Term> document resolves the question the
          other way.
        </p>
      </Section>

      <Section
        title={
          <>
            Export compensation (<Term id="ep">EP</Term> rate)
          </>
        }
      >
        <KeyValues
          items={[
            ["Current rate (FY2026-27), effective 2026-07-01", perKWh(LODI_EP_RATE)],
            ["Cash-out", LODI.exportPolicy.cashOut ? "Yes" : "No"],
            ["Unused credit carries forward", LODI.exportPolicy.carryForward ? "Yes" : "No"],
          ]}
        />
        <p style={note}>
          Reset every July 1 by city council action. Export credit only offsets a bill; it never pays out, and any
          credit left over at year-end carries into the next month's ledger rather than expiring. Renewable energy
          certificates associated with exported generation belong to <Term id="leu">LEU</Term>, not the customer,
          under this program.
        </p>

        <h3 style={h3}>Rate history</h3>
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Fiscal year</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
                <th style={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {LODI_EP_HISTORY.map((h) => (
                <tr key={h.fiscalYear}>
                  <td style={td}>{h.fiscalYear}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {perKWh(h.ratePerKWh)}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{h.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </Section>

      <Section title="Custom utility profiles: net metering">
        <p style={note}>
          A household not on one of <Term id="leu">LEU</Term>'s modeled schedules can define its own tariff, including
          an export policy <Term id="leu">LEU</Term> itself does not offer: <Term id="nem">net energy metering</Term>{" "}
          (NEM). The calculator implements two NEM variants; which one applies (and how the true-up at year end
          behaves) is set on the custom tariff's export policy, not chosen per household.
        </p>

        <h3 style={h3}>Hourly netting (retail-crediting NEM)</h3>
        <p style={note}>
          Imports are billed exactly the same as any other tariff. Every hour a household exports, that hour's kWh
          earns a dollar credit at the applicable retail rate for that hour: the time-of-use period's own rate, the
          marginal rate of whichever tier the household's cumulative usage sits in that month (on a tiered schedule),
          or the season's flat rate, or, when the tariff sets a flat override rate instead of "retail," that flat
          number for every exporting hour regardless of time or tier. Credits accumulate in a running bank that only
          ever offsets a bill; unused credit carries into next month rather than expiring, and it never pays out in
          cash.
        </p>

        <h3 style={h3}>Annual netting (kWh netting)</h3>
        <p style={note}>
          The more common form among municipal NEM programs: instead of earning a separate dollar credit, exported
          kWh is subtracted from imported kWh before the bill is priced at all. Each month bills only the net kWh
          (imports minus exports minus any kWh credit banked from earlier months this year), so netting is
          volumetric, moving the same kWh figure every per-kWh charge (tier position, time-of-use energy, and every
          adder) is priced from. Fixed and demand charges are never netted. A time-of-use schedule nets within each
          rate period separately rather than against the whole month's total, so a surplus of exports during one
          period cannot lower the bill for a different period the same month; that period's own unconsumed export
          still banks as kWh credit for a later month, the same as it would on a non-time-of-use schedule. Banked
          kWh credit from earlier months applies to a later month's periods starting with the most expensive one,
          so a stored kWh always displaces the highest-priced energy it can that month.
        </p>
        <p style={note}>
          The kWh bank itself only ever lasts within one calendar year. At the year's final month, whatever kWh
          credit is still banked is resolved by the tariff's true-up rule. A tariff can set that rule explicitly:
          "Forfeit leftover credit" drops it outright, or "Cash out at a rate" pays it out at a stated flat $/kWh
          rate into a one-time dollar credit that then behaves exactly like hourly netting's own bank (offsets
          future bills, never pays out in cash, carries forward indefinitely). Leaving the true-up unset falls back
          to the calculator's pre-existing implicit rule instead: a tariff whose export rate is itself a flat number
          cashes leftover kWh out at that same number, and anything else (including "retail," or any of the
          non-flat export-rate kinds below) forfeits. This matches how many municipal NEM programs actually true
          up: "retail" pricing during the year already means every netted kWh displaced a real retail-rate charge;
          it says nothing about what a true-up year-end payout should be worth, so the calculator does not invent
          one without being told to.
        </p>

        <h3 style={h3}>Export rate kinds</h3>
        <p style={note}>
          One export rate figure serves both export mechanisms above (avoided-cost credit's rate, and net
          metering's own exported-kWh rate): a flat $/kWh number, "retail" (net metering only: the applicable
          retail rate for that exporting hour, the same rate hourly netting's own credit uses), a monthly table
          (twelve $/kWh figures, one per calendar month, for a utility whose export rate itself varies seasonally
          rather than following one flat number), a hand-authored time table (the same hour-window vocabulary a
          time-of-use pricing period uses, for an export rate that itself varies by hour of day, entered by
          importing a tariff with an AI assistant since the household form only authors flat and monthly-table
          rates by hand), or a percentage of the retail rate (net metering with hourly netting only: every
          exporting hour's credit is that fraction of what that same hour's import would have cost at the
          applicable retail rate). Every kind resolves to a $/kWh figure the same way, hour by hour, regardless of
          which one a tariff declares.
        </p>

        <h3 style={h3}>Vintage lock</h3>
        <p style={note}>
          An export rate can be frozen at its starting value for a stated number of years from interconnection
          before the export rate trend assumption starts applying to it. Some net-metering successor tariffs
          lock a customer's rate this way rather than letting it escalate (or de-escalate) immediately alongside
          everyone else's. The escalation clock restarts at year 0 once the lock ends, rather than jumping straight
          to the factor it would have reached had escalation been running the whole time.
        </p>

        <h3 style={h3}>Minimum bill</h3>
        <p style={note}>
          A tariff can set a dollar floor under the total bill that riders and export credits cannot push below,
          matching a utility minimum-bill rule some tariffs publish. The floor applies after riders and after
          export credits, not before: a credit that would have pushed the bill below the floor is left unspent in
          the credit bank for a later month, rather than drawn out and wasted against the floor. The bill before any
          floor is still never negative on its own, with or without this setting.
        </p>

        <h3 style={h3}>System-size charges</h3>
        <p style={note}>
          A tariff can also bill a flat monthly charge based on the size of the solar array or battery the
          household itself installs, in dollars per kW-DC of solar or per kWh of battery per month, separate from
          the usage-based energy charge. This is billed against the config's own nameplate size (a battery's full rated
          capacity, not whatever it has degraded to in a given year), the same way every other config-specific
          charge is.
        </p>
      </Section>

      <Section title="Solar production model">
        <p style={note}>
          Hourly <Term id="ac">AC</Term> output is bilinearly interpolated from a bundled grid of PVWatts-derived
          per-<Term id="kw-dc">kW-DC</Term> shapes (tilt x azimuth), not simulated per request.{" "}
          <Term id="kw-dc">kW-DC</Term> is a <Term id="pv">PV</Term> array's rated <Term id="dc">DC</Term> output at
          its panels, before an inverter's <Term id="ac">AC</Term>/<Term id="dc">DC</Term> conversion; the{" "}
          <Term id="ac">AC</Term> <Term id="kwh">kWh</Term> this calculator counts as production is always less than
          the <Term id="kw-dc">kW-DC</Term> rating implies, per the array's inverter efficiency and loss-stack
          settings below. PVWatts uses a <Term id="tmy">TMY</Term> weather file for the site below, not actual
          weather for any specific calendar year: production for a real year will differ from this shape.
        </p>
        <KeyValues
          items={[
            ["Site", solarShapes.meta.fetchedFor.site.name],
            ["Coordinates", `${solarShapes.meta.fetchedFor.site.lat}, ${solarShapes.meta.fetchedFor.site.lon}`],
            ["Tilt grid points", solarShapes.meta.params.tilts.join(", ") + "°"],
            ["Azimuth grid points", solarShapes.meta.params.azimuths.join(", ") + "° (180° = due south)"],
            ["Source", solarShapes.meta.source],
          ]}
        />
        <p style={note}>{solarShapes.meta.fetchedFor.note}</p>

        <h3 style={h3}>Baseline losses and normalization</h3>
        <KeyValues
          items={[
            ["Baseline system losses baked into the shapes", percent(DEFAULT_LOSS_FRAC, 0)],
            ["Baseline inverter efficiency baked into the shapes", percent(DEFAULT_INVERTER_EFF, 0)],
            ["Equipment-preset default loss stack for a new array", percent(equipmentPresets.solar.lossStackDefaultFrac, 0)],
            ["Equipment-preset default inverter efficiency for a new array", percent(equipmentPresets.solar.inverterEffDefault, 0)],
            ["Default annual degradation", percent(equipmentPresets.solar.degradationRateDefault, 2)],
          ]}
        />
        <p style={note}>
          An array's lossFrac/inverterEff scale the baseline rather than replace it: the shapes already reflect the
          baseline figures above, so an override is applied as (1 - lossFrac)/(1 - baseline loss) and
          inverterEff/baseline inverter efficiency, both of which equal 1 when the baseline is left in place. The
          equipment-preset default loss stack ({percent(equipmentPresets.solar.lossStackDefaultFrac, 0)}) matches
          the baseline exactly, but the preset's default inverter efficiency (
          {percent(equipmentPresets.solar.inverterEffDefault, 0)}) is one point above the PVWatts baseline (
          {percent(DEFAULT_INVERTER_EFF, 0)}), so a newly added array applies a small boost above the bundled shape
          by default rather than reproducing it exactly. Degradation compounds as (1 - rate)^year, so year 0 always
          applies a factor of 1.
        </p>
      </Section>

      <Section title="Wind production model">
        <p style={note}>
          This is a deterministic energy-estimate method, not a weather simulation: no public hourly wind-speed
          record exists for the Lodi site, so hourly speeds are constructed from a single annual mean and two
          stylized, hand-authored shape curves (diurnal and seasonal multipliers, each with an exact mean of 1.0).
          Given the same inputs this always returns the same series, since nothing samples from a distribution.
        </p>
        <p style={note}>
          Annual mean wind speed is entered as measured at {REFERENCE_HEIGHT_M} m above ground and extrapolated up
          to each turbine's hub height with a power-law wind-shear correction (exponent {WIND_SHEAR_ALPHA.toFixed(3)},
          the standard open-terrain/"one-seventh power law" figure appropriate for the flat Central Valley floor):
          speed at hub = speed at {REFERENCE_HEIGHT_M} m x (hub height / {REFERENCE_HEIGHT_M}) ^ {WIND_SHEAR_ALPHA.toFixed(3)}.
          A taller tower therefore raises modeled output, roughly with the cube of the speed gain.
        </p>
        <KeyValues
          items={[
            ["Diurnal shape methodology", firstSentence(windData.meta.diurnal.methodology)],
            ["Seasonal shape methodology", firstSentence(windData.meta.seasonal.methodology)],
          ]}
        />
        <p style={note}>
          Each hour's shape-scaled mean speed is treated as the mean of a Rayleigh-distributed wind speed for that
          hour, and turbine output is the expectation of the power curve over that distribution (deterministic
          Simpson's-rule quadrature, not sampling), capturing the spread a real hour's gusts and lulls would
          contribute around the shaped mean, which a single deterministic speed value cannot. Output above the top
          of a turbine's power curve holds flat at the curve's last rated point (a turbine furls rather than shuts
          down), unless the selected preset publishes an actual cut-out speed, in which case output is 0 above it.
          There is no wind degradation model: the year index is accepted for signature symmetry with solar but does
          not affect output. Central Valley small-wind sites sit in the same modest-resource regime documented for
          the region's "Delta Breeze" (see sources below); the shape curves encode timing only, not magnitude, so a
          realistic annual mean wind speed has to come from a site-specific source.
        </p>

        <h3 style={h3}>Sources</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {[...windData.meta.diurnal.sources, ...windData.meta.seasonal.sources].map((s) => (
            <li key={s.url} style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 4 }}>
              <a href={s.url} style={{ color: color.accent }} rel="noreferrer noopener" target="_blank">
                {s.title}
              </a>
              {s.note && <span style={{ color: color.muted }}> — {s.note}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Battery dispatch model">
        <p style={note}>
          No calendar logic runs here: dispatch reacts only to the hourly production-minus-load series and the
          battery's own <Term id="soc">state of charge</Term>. Charging is capped by the <Term id="ac">AC</Term>-side
          power limit and by remaining headroom to full capacity; discharging is capped by the{" "}
          <Term id="ac">AC</Term>-side power limit and by stored energy available above a reserve floor.{" "}
          <Term id="soc">SoC</Term> starts at, and never drops below, the reserve floor.
        </p>
        <h3 style={h3}>Discharge target by mode</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={{ fontSize: 12, lineHeight: 1.6, color: color.body, marginBottom: 5 }}>
            Self-consumption: targets the full hourly deficit, so the battery serves as much of the load as its
            power and energy limits allow on every deficit hour.
          </li>
          <li style={{ fontSize: 12, lineHeight: 1.6, color: color.body, marginBottom: 5 }}>
            Peak-shave: targets only the amount by which gross grid import exceeds a threshold, so a deficit hour
            already at or under the threshold draws nothing from the battery, preserving stored energy for hours
            that would otherwise cross it. Meant for a demand-charged schedule, though the engine does not restrict
            the mode to any particular schedule; the calculator's battery editor only shows this dispatch choice
            when the selected schedule actually carries a demand charge to shave against.
          </li>
        </ul>
        <p style={note}>
          Round-trip efficiency is supplied to the dispatch engine as separate charge and discharge legs
          (chargeEff, dischargeEff); the engine itself has no logic for deriving those two figures from a single
          manufacturer round-trip-efficiency spec.
        </p>

        <h3 style={h3}>Degradation over the horizon</h3>
        <p style={note}>
          Usable capacity declines linearly from nameplate to a fixed end-of-life fraction (70%), reached at
          whichever comes first of the battery's cycle life or calendar life. A battery missing BOTH figures has no
          degradation channel to derive a curve from at all, so it runs at full nameplate capacity for every year of
          the horizon rather than being treated as already at end of life. Cycles per year are not known in advance
          (they depend on dispatch, which depends on the year's already-degraded capacity), so the engine runs one
          probe dispatch at full nameplate capacity against the config's first-year production and load to get a
          representative annual cycle count, then assumes that rate holds for every year of the horizon. This is an
          approximation: a partially degraded battery cycles somewhat differently (smaller swings hit the reserve
          floor sooner), but re-deriving the rate every year would require an iterative fixed point the engine does
          not attempt.
        </p>
        <p style={note}>
          Surplus charging (on-site production above load) always runs first and always targets full capacity; it
          is unaffected by grid charging below. A battery with no solar or wind generation and grid charging left
          off never charges at all, so it never changes the bill from the no-system baseline.
        </p>

        <h3 style={h3}>Grid charging (optional)</h3>
        <p style={note}>
          When enabled, the battery can also draw energy from the grid during a configured hour-of-day window (for
          example 10pm to 6am), whenever its <Term id="soc">SoC</Term> sits below the configured target. The window
          wraps
          past midnight the same way a start hour later than the end hour reads: 22 to 6 covers 10pm through
          5:59am. Grid charging shares its power budget with surplus charging (the same kilowatt charge limit covers
          both) and, in peak-shave mode, is capped so it never pushes an hour's import above the shave threshold.
          That cap only ever adds into whatever room a shave (below) has already left under the threshold, since
          that threshold-relative import figure is already post-discharge. Peak-shave mode adds a second cap on top
          of it: grid charging also never pushes an hour's import above the current calendar month's own
          already-established peak import. A month whose natural (load-driven) peak sits under the shave threshold
          therefore never gets a new, higher peak manufactured by grid charging alone; the billed monthly peak, and
          any demand charge against it, never comes out higher with grid charging on than off. It can come out lower:
          the energy the battery drew from the grid ahead of time gives it something to discharge against a later
          peak that same month, a peak that would otherwise go unshaved because the battery would still be empty if
          grid charging were left off.
        </p>
        <p style={note}>
          In self-consumption mode, while a grid-charge window is active the battery never discharges against a
          deficit hour: the full deficit imports from the grid instead, and any grid-charge energy for that hour
          adds on top of it, so charging and discharging never overlap in the same hour. In peak-shave mode, shaving
          takes priority over the window instead: a deficit hour whose gross import exceeds the shave threshold
          still discharges down to the threshold (reserve floor permitting) exactly as it would outside the window,
          and grid charging that same hour only tops up whatever room is left under the threshold afterward. Either
          way, a deficit hour therefore never exports (a deficit hour has nothing to export in the first place), and
          the grid-charge energy hits tiers, <Term id="tou">TOU</Term> pricing, <Term id="eca">ECA</Term>, and
          demand charges downstream exactly like any other import. Cycle counting does not change:{" "}
          <Term id="soc">SoC</Term> does not track where a stored <Term id="kwh">kWh</Term> came from, so
          grid-sourced energy counts toward equivalent full cycles once discharged, the same as energy from on-site
          surplus.
        </p>
      </Section>

      <Section title="Financial model">
        <p style={note}>
          Retail rate escalation and export-rate trend each compound annually as (1 + rate)^year; leaving either
          unset applies no escalation at all (year 0 and every later year use the unescalated figure). Cash flows
          are not discounted at all if no discount rate is supplied. Loan payments use fully amortizing, monthly
          compounding math with a zero-rate branch (payment = principal / months) to avoid a division by zero at a
          0% <Term id="apr">APR</Term>: the same calcPmt implementation home-purchase-comparison uses. A config's{" "}
          <Term id="om">O&M</Term> cost is entered per year and treated as a level annual cash outflow with no
          escalation of its own. Interest paid on a loan is excluded from effective cost per <Term id="kwh">kWh</Term>{" "}
          on purpose, so a cash purchase and a loan purchase of the identical system land on the same effective cost
          per <Term id="kwh">kWh</Term>; only the financing choice's effect on cash flow timing differs between them.
        </p>
        <p style={note}>
          <Term id="irr">Internal rate of return</Term> is found by bisection over a -99% to +100% range and returns
          null (not a number) when the cash-flow vector never crosses zero in that range: an all-negative flow that
          never pays back, or an all-positive flow paid back before year 1. Payback year is interpolated at a
          constant rate across the crossing year, the only shape available without a sub-year cash-flow model, and
          is likewise null when the horizon ends without a crossing.
        </p>

        <h3 style={h3}>Incentives</h3>
        <p style={note}>{FEDERAL_25D_STATUS.note}</p>
        <p style={note}>{CA_PROPERTY_TAX_NOTE.note}</p>
        <p style={note}>
          Five incentive line-item types exist, in two groups. Three are one-time: they reduce the system's upfront
          cost the moment it's installed. A fixed line is a flat dollar amount. A percent line is a percentage of
          the system's full gross cost, not gross minus other incentives already applied, so stacking several
          incentives this way is what the programs themselves specify, and the total never depends on what order
          the lines are listed in. A per-unit line prices a flat rate against the config's own installed size
          instead of its cost: dollars per kW of solar installed, per kWh of battery installed, or per kW of
          battery power rating, so a solar-only config sees $0 from a battery-keyed per-unit line, and vice versa.
          Percent and per-unit lines can each carry an optional dollar cap, applied to that one line's own computed
          amount after the fact, never against a running total other lines have already reduced.
        </p>
        <p style={note}>
          The other two types are recurring income instead of a one-time cost reduction: they pay out in each of a
          stated number of ownership years, starting at year 1 (the first full year after purchase), rather than
          folding into the upfront price. An annual-production line pays a $/kWh rate against that specific year's
          own actual production (so a degrading array's income falls in step with its output, the same way its
          production does); an annual-fixed line pays a flat dollar amount every one of those years regardless of
          production, matching a program like a battery virtual-power-plant enrollment fee. Recurring income counts
          toward cash flow, net present value, and lifetime savings, the same as a bill saving does, but is
          deliberately excluded from effective cost per <Term id="kwh">kWh</Term>: that figure answers what the
          system cost to install, and revenue earned after the fact isn't a cost.
        </p>
        <p style={note}>
          The federal credit above is the residential Section 25D credit; a commercial system's{" "}
          <Term id="itc">investment tax credit</Term> (Section 48) isn't a separate incentive type here, but can
          still be modeled as a percent-of-gross incentive line with its own label.
        </p>
      </Section>

      <Section title="Equipment presets">
        <p style={note}>
          As of {equipmentPresets.asOf}. {equipmentPresets.meta.note}
        </p>
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Battery</th>
                <th style={th}>Chemistry</th>
                <th style={{ ...th, textAlign: "right" }}>
                  Usable <Term id="kwh">kWh</Term>
                </th>
                <th style={{ ...th, textAlign: "right" }}>Round-trip eff.</th>
                <th style={{ ...th, textAlign: "right" }}>
                  Max <Term id="kw">kW</Term> (charge/discharge)
                </th>
                <th style={{ ...th, textAlign: "right" }}>Cycle life</th>
                <th style={{ ...th, textAlign: "right" }}>Calendar life</th>
                <th style={{ ...th, textAlign: "right" }}>Installed cost</th>
                <th style={th}>Estimated fields</th>
              </tr>
            </thead>
            <tbody>
              {equipmentPresets.batteries.map((b) => (
                <tr key={b.id}>
                  <td style={td}>{b.label}</td>
                  <td style={{ ...td, color: color.muted }}>{b.chemistry}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b.usableKWh}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {percent(b.roundTripEff, 1)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {b.maxChargeKW}/{b.maxDischargeKW}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b.cycleLife}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {b.calendarLifeYears}y
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {money(b.installedCostUSD)}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: b.estimatedFields.length ? color.caution : color.muted }}>
                    {b.estimatedFields.length ? b.estimatedFields.join(", ") : "none"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>

        <h3 style={h3}>Solar and wind cost defaults</h3>
        <KeyValues
          items={[
            ["Solar installed cost", `$${equipmentPresets.solar.costPerWattInstalled.value.toFixed(2)}/W`],
            ["Wind installed cost", `$${equipmentPresets.wind.costPerKWInstalled.value}/kW`],
            ["Panel wattage presets", equipmentPresets.solar.panelPresets.map((p) => `${p.watts} W`).join(", ")],
          ]}
        />
        <p style={note}>{equipmentPresets.meta.priceVolatilityNote}</p>

        <h3 style={h3}>Load shape provenance</h3>
        <KeyValues
          items={[
            ["Residential profile", loadShapes.meta.profiles.residential],
            ["Small-commercial profile", loadShapes.meta.profiles["small-commercial"]],
          ]}
        />
        <p style={note}>{loadShapes.meta.structure}</p>
      </Section>

      <Section title="Fees and constraints">
        <KeyValues
          items={[
            [`Interconnection fee, single-phase (${LODI_FEES.interconnection.fiscalYear})`, money(LODI_FEES.interconnection.singlePhase)],
            [`Interconnection fee, three-phase (${LODI_FEES.interconnection.fiscalYear})`, money(LODI_FEES.interconnection.threePhase)],
            ["System size cap", LODI.constraints.sizeCapMode],
            ["Allowed financing", LODI.constraints.allowedFinancing.join(", ")],
          ]}
        />
        <p style={note}>
          <Term id="leu">LEU</Term> had not published FY2026-27 interconnection fees as of the sources cited above,
          so the figures shown carry forward from FY2025-26. Power-purchase agreements are not an allowed financing
          type on <Term id="leu">LEU</Term>'s program: the list above only ever contains cash and loan.
        </p>
      </Section>

      <GlossarySection />
    </div>
    </GlossaryProvider>
  );
}

/**
 * One row per glossary.js entry, in that file's declared order. This is the
 * one place in the app every entry is guaranteed to render regardless of
 * whether any <Term> elsewhere links to it, since the every-occurrence-gets-
 * a-Term design (see glossary.js's header) still leaves it possible for an
 * entry to have no <Term> user anywhere in a given build.
 */
function GlossarySection() {
  return (
    <section id="glossary" style={{ ...card, padding: "16px 18px", marginBottom: 18, scrollMarginTop: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: color.ink, margin: "0 0 6px" }}>Glossary</h2>
      <p style={note}>Every acronym and technical term this calculator uses, in one place.</p>
      <Scroller>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Term</th>
              <th style={th}>Full name</th>
              <th style={th}>Definition</th>
              <th style={th}>Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map((entry) => (
              <tr key={entry.id}>
                <td style={{ ...td, fontWeight: 600, color: color.ink, whiteSpace: "nowrap" }}>
                  {entry.acronym || idToLabel(entry.id)}
                </td>
                <td style={td}>{entry.expansion || "—"}</td>
                <td style={td}>{entry.definition}</td>
                <td style={td}>{entry.whyItMatters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 18 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: color.ink, margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

function KeyValues({ items }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "4px 18px",
        margin: 0,
      }}
    >
      {items.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "4px 0",
            borderBottom: `1px solid ${color.hairline}`,
            fontSize: 12,
          }}
        >
          <dt style={{ color: color.body }}>{k}</dt>
          <dd style={{ margin: 0, color: color.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Scroller({ children }) {
  return <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>;
}

const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = {
  textAlign: "left",
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  color: color.muted,
  padding: "0 10px 5px 0",
  borderBottom: `1px solid ${color.hairline}`,
  whiteSpace: "nowrap",
};
const td = {
  padding: "6px 10px 6px 0",
  color: color.body,
  borderBottom: `1px solid ${color.hairline}`,
  verticalAlign: "top",
};
const h3 = { fontSize: 12.5, fontWeight: 700, color: color.ink, margin: "16px 0 6px" };
const note = { fontSize: 11.5, lineHeight: 1.6, color: color.muted, margin: "0 0 8px" };
