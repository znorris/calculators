// Composition root. State is one record (household + assumptions + configs,
// per model/schema.js). Inputs update that state immediately, but the
// simulation itself -- model/runEngine.js's runEngine(), the sole
// implementation also used by worker/calcWorker.js -- runs off the main
// thread: a debounced effect below posts the current state to a worker
// ~RECALC_DEBOUNCE_MS after the last change, so typing in a field never
// reruns the full 8760-hour simulation synchronously per keystroke. `engine`
// holds the last response and is only ever replaced by a newer one, so the
// report stays on screen (with a "Recalculating..." indicator) while a
// request is in flight rather than blanking.
//
// This calculator's state is deeply nested, unlike home-purchase-comparison's
// and mortgage-strategy-comparison's flat numeric fields, so shared/urlState.js
// (a flat query-string codec) cannot round-trip it -- model/urlCodec.js exists
// for exactly that reason (base64 JSON in the URL fragment, with hourly usage
// slimmed out). shared/ScenariosMenu.jsx and shared/ShareBanner.jsx are still
// used as-is: both treat `inputs`/state as an opaque blob and never touch the
// codec themselves, so they work with any state shape. shared/ShareButton.jsx
// is the one shared piece NOT used here, since it is wired to the flat codec;
// a small local button below calls model/urlCodec.js's buildShareUrl instead.

import { Component, useEffect, useRef, useState } from "react";
import { Breadcrumb } from "../shared/Breadcrumb.jsx";
import { ScenariosMenu } from "../shared/ScenariosMenu.jsx";
import { ShareBanner } from "../shared/ShareBanner.jsx";
import { DataDisclosure, DataDisclosureLink, WarrantyDisclaimer } from "../shared/DataDisclosure.jsx";
import { GlossaryProvider, Term } from "../shared/Term.jsx";
import { GLOSSARY_BY_ID } from "./glossary.js";
import { HouseholdSection } from "./components/HouseholdSection.jsx";
import { ExplorerSection } from "./components/ExplorerSection.jsx";
import { ConfigEditor } from "./components/ConfigEditor.jsx";
import { ResultsSection } from "./components/ResultsSection.jsx";
import { Field } from "./components/Field.jsx";
import { defaultState, normalizeState, ECA_MODES } from "./model/schema.js";
import { loadState, saveState, clearState, STATE_KEY, SCENARIOS_KEY, EXPLORER_KEY } from "./model/storage.js";
import { buildShareUrl, readPayload, stripShareParam } from "./model/urlCodec.js";
import {
  clampHorizonYears,
  ecaModeChangePatch,
  trailingAverageCustomAdderValue,
  assumptionsAfterHouseholdChange,
  createEngineWorker,
} from "./model/runEngine.js";
import { debounce } from "./model/debounce.js";
import { money } from "./format.js";
import { color, card, button, input as inputStyle } from "./theme.js";
import { copyText } from "../shared/clipboard.js";
import { CopyFallbackPanel } from "../shared/CopyFallbackPanel.jsx";
import { isLodiProfile, customUtilityLabel } from "./model/utilityLabel.js";

/** How long an input's changes are quiet before the worker is asked to recompute. */
const RECALC_DEBOUNCE_MS = 400;

/**
 * Caveats specific to this calculator, beyond the shared disclosure -- a
 * function of `household` rather than a constant, since two of these are
 * LEU-specific facts (its ECA/export-rate reset cadence, the unresolved
 * ECA-on-exports question) that don't hold for a household on a custom
 * tariff: those two render only when the Lodi profile is active, replaced by
 * one generic note for a custom profile, and "Verify before you buy" names
 * the active utility rather than always saying LEU.
 */
export function buildDisclosureNotes(household) {
  const isLodi = isLodiProfile(household);
  const utilityName = isLodi ? <Term id="leu">LEU</Term> : customUtilityLabel(household);

  const notes = [
    {
      title: "Estimates, not quotes",
      body:
        "Every cost figure is auto-estimated from published equipment presets until you enter your own installer " +
        "quote, and every production, bill, and savings figure comes from a modeled tariff and modeled weather " +
        "shapes, not a metered history of this specific site.",
    },
  ];

  if (isLodi) {
    notes.push(
      {
        title: "Rates change annually",
        body: (
          <>
            <Term id="leu">LEU</Term> resets its <Term id="eca">ECA</Term> monthly and its avoided-cost export rate
            every July 1. This calculator's <Term id="leu">LEU</Term> figures are the FY2026-27 values in effect as
            of this build; verify current rates with <Term id="leu">LEU</Term> before relying on a result.
          </>
        ),
      },
      {
        title: (
          <>
            Whether <Term id="eca">ECA</Term> applies to export credits is unresolved
          </>
        ),
        body: (
          <>
            <Term id="leu">LEU</Term> has not published whether the <Term id="eca">ECA</Term> adder should reduce
            the value of exported energy the same way it adds to the cost of imported energy. This calculator
            defaults to leaving it off exports; the toggle in Assumptions below exists in case a future{" "}
            <Term id="leu">LEU</Term> document resolves the question the other way.
          </>
        ),
      },
    );
  } else {
    notes.push({
      title: "Your entered rates may be out of date",
      body:
        "This utility's rates were entered or imported by you as of a point in time. Utility rates change; " +
        "verify them against the utility's current published schedule before relying on a result.",
    });
  }

  notes.push({
    title: "The wind model is a simplified estimate",
    body:
      "There is no public hourly wind-speed record for the Lodi site, so hourly output is built from a single " +
      "annual mean wind speed and two stylized shape curves rather than measured weather. The Central Valley " +
      "floor is a weak wind resource; see the assumptions page before sizing a turbine around this estimate.",
  });

  notes.push({
    title: "Verify before you buy",
    body: (
      <>
        Confirm your actual rate schedule and any application requirements with {utilityName}, and get a firm,
        site-specific quote from a licensed installer before making a purchase or financing decision.
      </>
    ),
  });

  return notes;
}

const headerBtnStyle = { ...button, minHeight: 32 };

const ECA_FIXED_FIELD = {
  id: "ecaFixedValue",
  type: "money",
  label: (
    <>
      Fixed <Term id="eca">ECA</Term> override ($/<Term id="kwh">kWh</Term>)
    </>
  ),
};
const ADDERS_ON_EXPORTS_FIELD_LODI = {
  id: "addersOnExports",
  type: "bool",
  label: (
    <>
      Apply adders (<Term id="eca">ECA</Term>, state energy tax) to export credits too
    </>
  ),
  help: "LEU has not published whether the ECA (and its other adders) should reduce the value of exported energy. This defaults to off; see the assumptions page for the full note.",
};
/**
 * The generic equivalent of ADDERS_ON_EXPORTS_FIELD_LODI for a custom
 * profile: calc/billing.js's addersOnExports flag applies uniformly to
 * whatever adders a profile declares, regardless of profile, so this control
 * itself works the same way for a custom tariff -- only the LEU/ECA-specific
 * wording needs to change.
 */
const ADDERS_ON_EXPORTS_FIELD_GENERIC = {
  id: "addersOnExports",
  type: "bool",
  label: "Apply per-kWh adders to export credits too",
  help: "Whether your utility's per-kWh adders should reduce the value of exported energy the same way they add to the cost of imported energy is often unpublished. This defaults to off.",
};


/** Copies a share link built from model/urlCodec.js's fragment-based codec. */
function ShareLinkButton({ getState }) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);

  async function handleClick() {
    const url = buildShareUrl(getState());
    const succeeded = await copyText(url);
    if (succeeded) {
      setFallbackUrl(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFallbackUrl(url);
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" onClick={handleClick} style={headerBtnStyle} title="Copy a shareable link with your current inputs">
        {copied ? "Copied!" : "Share link"}
      </button>
      {fallbackUrl && (
        <CopyFallbackPanel text={fallbackUrl} textareaStyle={inputStyle} buttonStyle={button} onDismiss={() => setFallbackUrl(null)} />
      )}
    </div>
  );
}

export function AssumptionsControls({ household, assumptions, onChange }) {
  const isLodi = isLodiProfile(household);
  // The raw entered adders, not the resolved profile's -- available straight
  // off household with no engine round-trip needed just to know whether any
  // exist. Lodi always carries two (ECA, the state energy tax) via
  // calc/tariffs/lodi.js, so it's never gated on this for its own controls.
  const customAdders = isLodi ? [] : household.customProfileInputs?.adders || [];
  const hasCustomAdders = customAdders.length > 0;
  const monthlyTableAdders = customAdders.filter((a) => a.mode === "monthlyTable");
  const utilityLabel = isLodi ? "LEU" : customUtilityLabel(household);

  return (
    <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: color.ink, margin: "0 0 10px" }}>Assumptions</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={{
              id: "horizonYears",
              type: "int",
              label: "Ownership horizon (years)",
              help:
                "How many years of ownership the report evaluates: NPV and lifetime savings are summed over exactly " +
                "this window (payback is always searched beyond it, so a long payback still shows its real year). " +
                "Set it to how long you realistically expect to own the property: 25 matches a typical panel " +
                "warranty, 10 fits a planned earlier sale.",
            }}
            value={assumptions.horizonYears}
            onChange={(v) => onChange({ horizonYears: clampHorizonYears(v ?? assumptions.horizonYears) })}
            compact
          />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={{
              id: "retailEscalationPct",
              type: "number",
              label: "Retail rate escalation (%/yr)",
              help: isLodi
                ? "How much Lodi Electric's prices rise each year in the model. Energy rates, the fixed charge, " +
                  "demand rates, and per-kWh adders all compound at this rate, so a higher value makes future bill " +
                  "savings, and therefore every system, look better. The 3% default is a national-average rule of " +
                  "thumb, not an LEU figure: LEU's base rates have not changed since mid-2024, so a lower value is " +
                  "the conservative choice."
                : `How much ${utilityLabel}'s prices rise each year in the model. Energy rates, the fixed charge, ` +
                  "demand rates, and per-kWh adders all compound at this rate, so a higher value makes future bill " +
                  "savings, and therefore every system, look better. The 3% default is a national-average rule of " +
                  "thumb.",
            }}
            value={assumptions.retailEscalationPct}
            onChange={(v) => onChange({ retailEscalationPct: v ?? 0 })}
            compact
          />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={{
              id: "exportTrendPct",
              type: "number",
              label: "Export rate trend (%/yr)",
              help: isLodi
                ? "How the export credit changes each year after Lodi Electric's July 1 reset. The default 0% " +
                  "holds it at the current $0.0843/kWh, because its short history moves erratically: it fell 38% " +
                  "between fiscal 2023-24 and 2025-26, then rose 1.4%. Enter a negative value to stress-test how " +
                  "much a config depends on export income."
                : "How the export credit changes each year in the model. The default 0% holds it flat at " +
                  "whatever rate you entered. Enter a negative value to stress-test how much a config depends on " +
                  "export income.",
            }}
            value={assumptions.exportTrendPct}
            onChange={(v) => onChange({ exportTrendPct: v ?? 0 })}
            compact
          />
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Field
            field={{
              id: "discountRatePct",
              type: "number",
              label: (
                <>
                  <Term id="discount-rate">Discount rate</Term> (%/yr)
                </>
              ),
              help:
                "The yearly return your money would earn in its next-best use, such as an index fund or paying " +
                "down your mortgage. NPV uses it to shrink future savings into today's dollars, so a higher rate " +
                "makes distant savings count for less. Your mortgage rate is a solid conservative choice; 0 " +
                "reports undiscounted totals.",
            }}
            value={assumptions.discountRatePct}
            onChange={(v) => onChange({ discountRatePct: v ?? 0 })}
            compact
          />
        </div>
      </div>

      {isLodi && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Field
              field={{
                id: "ecaMode",
                type: "enum",
                label: (
                  <>
                    <Term id="eca">ECA</Term> mode
                  </>
                ),
                placeholder: false,
                options: ECA_MODES,
                help: "ECA is Lodi's Energy Cost Adjustment, a per-kWh adder LEU republishes monthly. Trailing average prices future years from LEU's historical monthly table; fixed override uses one flat value instead.",
              }}
              value={assumptions.ecaMode}
              onChange={(v) => onChange(ecaModeChangePatch(assumptions, v))}
              compact
            />
          </div>
          {assumptions.ecaMode === "fixed" && (
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <Field
                field={ECA_FIXED_FIELD}
                value={assumptions.ecaFixedValue}
                onChange={(v) => onChange({ ecaFixedValue: v })}
                compact
              />
            </div>
          )}
        </div>
      )}
      {/*
        Generic equivalent of the ECA-mode/fixed-override control above, for
        a custom profile with at least one monthlyTable adder:
        calc/tariffs/profile.js's adderCost keys its "fixed override" off
        adder.mode === "monthlyTable" (not any specific adder id -- that
        limitation is fixed; see CONTRACTS.md), so this toggle genuinely
        affects every monthlyTable adder a custom profile declares, the same
        way it affects LEU's own ECA adder. Hidden when the profile has no
        monthlyTable adder, since there is nothing for either mode to apply
        to. assumptions.ecaMode/ecaFixedValue is the one shared flag pair
        both this control and Lodi's own use (see model/schema.js's
        DEFAULT_ASSUMPTIONS) -- App's updateHousehold resets both to their
        defaults on every profileId switch, so a value set against one
        profile's adder(s) never silently reprices a different profile's.
      */}
      {!isLodi && monthlyTableAdders.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <Field
              field={{
                id: "variableAdderMode",
                type: "enum",
                label: "Variable adder pricing",
                placeholder: false,
                options: ECA_MODES,
                help:
                  monthlyTableAdders.length === 1
                    ? `${monthlyTableAdders[0].label || "This adder"} is entered as a monthly table. Trailing average ` +
                      "prices future years from that table; fixed override replaces it with one flat value for every " +
                      "month instead."
                    : "These adders are entered as monthly tables. Trailing average prices future years from each " +
                      "one's own table; fixed override replaces every one of them with the same one flat value for " +
                      "every month instead.",
              }}
              value={assumptions.ecaMode}
              onChange={(v) => onChange(ecaModeChangePatch(assumptions, v, trailingAverageCustomAdderValue(monthlyTableAdders)))}
              compact
            />
          </div>
          {assumptions.ecaMode === "fixed" && (
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <Field
                field={{ id: "ecaFixedValue", type: "money", label: "Fixed override ($/kWh)" }}
                value={assumptions.ecaFixedValue}
                onChange={(v) => onChange({ ecaFixedValue: v })}
                compact
              />
            </div>
          )}
        </div>
      )}

      {(isLodi || hasCustomAdders) && (
        <Field
          field={isLodi ? ADDERS_ON_EXPORTS_FIELD_LODI : ADDERS_ON_EXPORTS_FIELD_GENERIC}
          value={assumptions.addersOnExports}
          onChange={(v) => onChange({ addersOnExports: v })}
          compact
        />
      )}
    </div>
  );
}

function EngineErrorPanel({ message }) {
  return (
    <div
      style={{
        ...card,
        padding: "14px 16px",
        marginBottom: 16,
        borderColor: color.negative,
        background: color.negativeSoft,
      }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 700, color: color.negative, margin: "0 0 6px" }}>
        Can't compute a result yet
      </h2>
      <p style={{ fontSize: 12.5, color: color.body, margin: 0, lineHeight: 1.55 }}>{message}</p>
    </div>
  );
}

/**
 * Catches a render exception anywhere below it (a malformed custom tariff
 * shape that reaches a component render despite model/schema.js's
 * normalization, a future bug in any child component) and shows an error
 * panel with a way back to a working state, rather than letting React
 * unmount the whole tree and leave a blank page -- the failure mode a
 * hand-edited share link or hand-edited localStorage record could otherwise
 * produce with no error boundary in place. An error boundary must be a class
 * component (getDerivedStateFromError/componentDidCatch have no Hooks
 * equivalent), so this is the one class in an otherwise all-function-component
 * codebase.
 */
export class CalculatorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 16px 60px" }}>
          <EngineErrorPanel message="This page hit an unexpected error while rendering and could not continue. Resetting clears any saved inputs and starts over from the defaults." />
          <button type="button" onClick={this.handleReset} style={{ ...button, minHeight: 32 }}>
            Reset to defaults
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(null);

  // engine holds the last worker response (or the error shape runEngine
  // returns); null only until that first response arrives. pending is true
  // from the moment an input changes until the matching response comes back,
  // covering both the debounce wait and the in-flight worker call.
  const [engine, setEngine] = useState(null);
  const [pending, setPending] = useState(false);

  const workerRef = useRef(null);
  // The id of the most recently POSTED request, not a counter of responses
  // received -- a response whose id doesn't match this was superseded by a
  // newer request sent since, and is dropped rather than overwriting a
  // fresher (or in-flight) result with a stale one.
  const latestRequestIdRef = useRef(0);
  const debouncedPostRef = useRef(null);
  const isFirstRequestRef = useRef(true);

  // Mount effect: a share link wins over anything saved locally, since
  // following a link is an explicit request to see that link's inputs.
  useEffect(() => {
    const shared = readPayload(window.location);
    if (shared) {
      setState(shared);
      stripShareParam();
      setLoadedFromUrl(true);
    } else {
      const stored = loadState();
      if (stored) setState(stored);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState(state);
  }, [loaded, state]);

  // One worker for the component's lifetime (see worker/calcWorker.js for
  // the message contract this shares with components/ExplorerSection.jsx's
  // own separate worker instance against the same file); terminated on
  // unmount rather than per-request. If construction itself throws (e.g. the
  // browser blocks module workers), workerRef.current stays null and no
  // request would ever complete, so the failure is surfaced through the
  // same engine-error shape runEngine() itself returns, rather than leaving
  // the "Loading saved data…" screen up forever with no worker ever posted
  // to.
  useEffect(() => {
    const { worker, error } = createEngineWorker(
      () => new Worker(new URL("./worker/calcWorker.js", import.meta.url), { type: "module" }),
    );
    if (!worker) {
      setPending(false);
      setEngine({
        error: `This calculator could not start its calculation engine (${error}). Try reloading the page, or a different browser.`,
      });
      return;
    }
    worker.onmessage = (event) => {
      const { id, output, error } = event.data;
      if (id !== latestRequestIdRef.current) return; // stale response, superseded by a newer request
      setPending(false);
      setEngine(error ? { error: error.message } : output);
    };
    // Construction can succeed while the script fetch still fails (a dead
    // dev server, a bad deploy): no message ever arrives, so without this
    // the report would sit on stale numbers with the recalculating
    // indicator stuck on.
    worker.onerror = (event) => {
      setPending(false);
      setEngine({
        error:
          "The calculation engine failed to load. Check your connection to the app and reload the page." +
          (event?.message ? ` Details: ${event.message}` : ""),
      });
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  function postToWorker(nextState) {
    const worker = workerRef.current;
    // No worker to post to (construction failed at mount, see the effect
    // above) -- leave `pending` false rather than stuck true from the recalc
    // effect below, since no response will ever arrive to clear it.
    if (!worker) {
      setPending(false);
      return;
    }
    latestRequestIdRef.current += 1;
    worker.postMessage({
      kind: "engine",
      id: latestRequestIdRef.current,
      household: nextState.household,
      configs: nextState.configs,
      assumptions: nextState.assumptions,
    });
  }

  useEffect(() => {
    debouncedPostRef.current = debounce(postToWorker, RECALC_DEBOUNCE_MS);
    return () => debouncedPostRef.current?.cancel();
  }, []);

  // The one effect that asks the worker to recompute: the very first request
  // (once saved/shared state has loaded) fires immediately so the initial
  // report still renders promptly, since there is no previous result yet to
  // keep showing in the meantime. Every later state change is debounced, so
  // typing in an input never posts a message per keystroke.
  useEffect(() => {
    if (!loaded) return;
    setPending(true);
    if (isFirstRequestRef.current) {
      isFirstRequestRef.current = false;
      postToWorker(state);
    } else {
      debouncedPostRef.current?.(state);
    }
  }, [loaded, state]);

  function getCurrentState() {
    return state;
  }

  function applyState(raw) {
    setState(normalizeState(raw));
  }

  /**
   * A profileId switch (Lodi <-> custom, either direction) resets
   * assumptions.ecaMode/ecaFixedValue back to their defaults -- both
   * describe whichever profile's monthlyTable adder(s) were active when the
   * user set them, and calc/tariffs/profile.js's adderCost applies them to
   * ANY monthlyTable adder the now-active profile declares (keyed off
   * adder.mode, not a specific id). Left stale, a "fixed override" value set
   * against one profile's adder would silently reprice a completely
   * different profile's adder the moment the household switches, with no
   * control in the UI naming the substitution. The reset itself is
   * model/runEngine.js's assumptionsAfterHouseholdChange, a pure function
   * tested directly there rather than through this component.
   */
  function updateHousehold(household) {
    setState((prev) => ({
      ...prev,
      household,
      assumptions: assumptionsAfterHouseholdChange(prev.assumptions, prev.household.profileId, household.profileId),
    }));
  }

  function updateAssumptions(patch) {
    setState((prev) => ({ ...prev, assumptions: { ...prev.assumptions, ...patch } }));
  }

  function updateConfigs(configs) {
    setState((prev) => ({ ...prev, configs }));
  }

  function resetAll() {
    clearState();
    setState(defaultState());
    setActiveScenarioId(null);
    setLoadedFromUrl(false);
  }

  function clearStoredData() {
    for (const key of [STATE_KEY, SCENARIOS_KEY, EXPLORER_KEY]) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Storage disabled; nothing to clear.
      }
    }
    window.location.href = window.location.pathname;
  }

  // engine is null only until the first worker response ever arrives (no
  // previous result exists yet to keep showing in its place); every request
  // after that overwrites it in place, so the report below never blanks.
  if (!loaded || !engine) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "80px 16px", textAlign: "center", color: color.muted }}>
        Loading saved data…
      </div>
    );
  }

  return (
    <CalculatorErrorBoundary onReset={resetAll}>
    <GlossaryProvider glossary={GLOSSARY_BY_ID}>
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 16px 60px" }}>
      <Breadcrumb current="Energy System Comparison" />

      <DataDisclosureLink
        extraLinks={[
          { label: "Assumptions and data sources", href: "assumptions/" },
          { label: "Glossary", href: "assumptions/#glossary" },
        ]}
      />

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: color.ink, margin: "0 0 4px" }}>
            Energy System Comparison
          </h1>
          <p style={{ fontSize: 12.5, color: color.muted, margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
            {isLodiProfile(state.household) ? (
              <>
                Compare solar, wind, and battery systems against your City of Lodi Electric Utility (
                <Term id="leu">LEU</Term>) bill, over a {state.assumptions.horizonYears}-year horizon.
              </>
            ) : (
              <>
                Compare solar, wind, and battery systems against your {customUtilityLabel(state.household)} bill,
                over a {state.assumptions.horizonYears}-year horizon.
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <ScenariosMenu
            storageKey={SCENARIOS_KEY}
            getCurrentState={getCurrentState}
            applyScenario={applyState}
            activeId={activeScenarioId}
            setActiveId={setActiveScenarioId}
            buttonStyle={headerBtnStyle}
          />
          <ShareLinkButton getState={getCurrentState} />
          <button type="button" onClick={resetAll} style={headerBtnStyle}>
            Reset all
          </button>
        </div>
      </header>

      <ShareBanner
        visible={loadedFromUrl}
        onDismiss={() => setLoadedFromUrl(false)}
        scenariosKey={SCENARIOS_KEY}
        getState={getCurrentState}
        setActiveId={setActiveScenarioId}
      />

      <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: color.ink, margin: "0 0 10px" }}>Household</h2>
        <HouseholdSection household={state.household} onChange={updateHousehold} />
      </div>

      <AssumptionsControls household={state.household} assumptions={state.assumptions} onChange={updateAssumptions} />

      <ExplorerSection
        household={state.household}
        assumptions={state.assumptions}
        existingConfigs={state.configs}
        onAddConfig={(config) => setState((prev) => ({ ...prev, configs: [...prev.configs, config] }))}
      />

      {engine.interconnectionFee > 0 && (
        <p style={{ fontSize: 11, color: color.muted, margin: "-8px 0 12px", lineHeight: 1.45 }}>
          {isLodiProfile(state.household) ? (
            <>
              A one-time <Term id="leu">LEU</Term> interconnection fee of {money(engine.interconnectionFee)} is
              added to the gross cost below for any config with solar or wind generation, based on your household's
              schedule and phase.
            </>
          ) : (
            <>
              A one-time interconnection fee of {money(engine.interconnectionFee)}, from {customUtilityLabel(state.household)}'s
              entered rates, is added to the gross cost below for any config with solar or wind generation.
            </>
          )}
        </p>
      )}

      <ConfigEditor
        configs={state.configs}
        allowedFinancing={engine.allowedFinancing}
        oversizedConfigIds={engine.oversizedConfigIds}
        gridChargeAdvisoryConfigIds={engine.gridChargeAdvisoryConfigIds}
        hasDemandCharge={engine.hasDemandCharge}
        baselinePeakKW={engine.baselinePeakKW}
        household={state.household}
        onChange={updateConfigs}
      />

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: pending ? 6 : 0 }}>
          {pending && (
            <span style={{ fontSize: 11.5, color: color.muted, fontStyle: "italic" }} aria-live="polite">
              Recalculating…
            </span>
          )}
        </div>
        {engine.error ? (
          <EngineErrorPanel message={engine.error} />
        ) : (
          <ResultsSection
            entries={engine.entries}
            baseline={engine.baseline}
            household={engine.household}
            profile={engine.profile}
            horizonYears={state.assumptions.horizonYears}
          />
        )}
      </div>

      <DataDisclosure storageKeys={[STATE_KEY, SCENARIOS_KEY, EXPLORER_KEY]} sharesViaUrl onClearStoredData={clearStoredData} />

      <WarrantyDisclaimer extraNotes={buildDisclosureNotes(state.household)} />
    </div>
    </GlossaryProvider>
    </CalculatorErrorBoundary>
  );
}
