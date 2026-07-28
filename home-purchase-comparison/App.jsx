import { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceDot, Label } from "recharts";
import { parseUrlParams, stripUrlParams } from "../shared/urlState.js";
import { ShareButton } from "../shared/ShareButton.jsx";
import { DataDisclosure, DataDisclosureLink, WarrantyDisclaimer } from "../shared/DataDisclosure.jsx";
import { ScenariosMenu } from "../shared/ScenariosMenu.jsx";
import { ShareBanner } from "../shared/ShareBanner.jsx";
import { Breadcrumb } from "../shared/Breadcrumb.jsx";

const INPUTS_KEY = "home-purchase-comparison-inputs";
const SCENARIOS_KEY = "home-purchase-comparison-scenarios";

/** Caveats specific to this calculator, beyond the shared disclosure. */
const DISCLOSURE_NOTES = [
  {
    title: "What this does not know",
    body:
      "Rates, taxes, insurance, and any appreciation you enter are assumptions. Closing costs, private " +
      "mortgage insurance, HOA dues, maintenance, and the cost of selling are not modeled unless you enter " +
      "them, and each can move the comparison materially.",
  },
];

const URL_SCHEMA = {
  booleans: ["includeTxCosts"],
  strings: ["tgtTaxMode"],
  enums: { tgtTaxMode: ["rate", "annual"] },
};

// ── Math helpers ──

function calcPmt(p, annualRate, nMonths) {
  const mr = annualRate / 12;
  if (mr === 0) return p / nMonths;
  return (p * mr * Math.pow(1 + mr, nMonths)) / (Math.pow(1 + mr, nMonths) - 1);
}

// Inverse amortization: given a monthly payment, what loan does it support?
function invPmt(monthlyPmt, annualRate, nMonths) {
  const mr = annualRate / 12;
  if (mr === 0) return monthlyPmt * nMonths;
  return (monthlyPmt * (1 - Math.pow(1 + mr, -nMonths))) / mr;
}

// Amortize a balance at the standard payment until paid off; returns total interest and months.
function amortize(balance, annualRate, monthlyPmt) {
  if (balance <= 0 || monthlyPmt <= 0) return { interest: 0, months: 0 };
  const mr = annualRate / 12;
  // Sanity: if payment can't cover interest, return high estimate
  if (monthlyPmt <= balance * mr) return { interest: balance * mr * 1200, months: 1200 };
  let b = balance, totalInt = 0, m = 0;
  while (b > 0 && m < 1200) {
    const i = b * mr;
    const p = Math.min(b + i, monthlyPmt);
    b = Math.max(0, b - (p - i));
    totalInt += i;
    m++;
  }
  return { interest: totalInt, months: m };
}

// ── Format helpers ──

const fmt = n => "$" + Math.round(n).toLocaleString();
const fmtSigned = n => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n)).toLocaleString();
const fmtPct = (n, d = 1) => n.toFixed(d) + "%";

function mStr(m) {
  if (m == null || !isFinite(m)) return "—";
  const y = Math.floor(m / 12), mo = Math.round(m % 12);
  if (y === 0) return `${mo}mo`;
  if (mo === 0) return `${y}yr`;
  return `${y}yr ${mo}mo`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function mDate(monthIdx, year) {
  return MONTHS[monthIdx] + " " + year;
}
function addMonths(monthIdx, year, n) {
  const total = monthIdx + n;
  return { monthIdx: ((total % 12) + 12) % 12, year: year + Math.floor(total / 12) };
}

// "About the same" tolerance for narrative phrasing
const SAME_MONTHLY = 25;   // $/mo
const SAME_INTEREST = 5000; // $ lifetime
const SAME_RATE = 0.0015;   // 0.15%

// ═══════════════════════════════════════
export default function App() {
  // Current home
  const [curValue, setCurValue] = useState(500000);
  const [origLoan, setOrigLoan] = useState(350000);
  const [oldRate, setOldRate] = useState(3.0);
  const [oldTermYears, setOldTermYears] = useState(30);
  const [curBalance, setCurBalance] = useState(305000);
  const [startMo, setStartMo] = useState(0); // Jan
  const [startYr, setStartYr] = useState(2020);
  const [curAnnualTax, setCurAnnualTax] = useState(5000);
  const [curAnnualIns, setCurAnnualIns] = useState(1800);

  // Target home
  const [tgtPrice, setTgtPrice] = useState(550000);
  const [newRate, setNewRate] = useState(6.5);
  const [newTermYears, setNewTermYears] = useState(30);
  const [tgtTaxMode, setTgtTaxMode] = useState("rate"); // "rate" | "annual"
  const [tgtTaxRate, setTgtTaxRate] = useState(1.1);
  const [tgtAnnualTax, setTgtAnnualTax] = useState(6000);
  const [tgtAnnualIns, setTgtAnnualIns] = useState(1800);

  // Transaction costs
  const [includeTxCosts, setIncludeTxCosts] = useState(true);
  const [realtorPct, setRealtorPct] = useState(5.5);
  const [otherSellingCosts, setOtherSellingCosts] = useState(5000);
  const [closingPct, setClosingPct] = useState(2.5);

  // Reference "today" for months-elapsed (locked to a fixed point so behavior is deterministic)
  const TODAY = useMemo(() => {
    const d = new Date();
    return { monthIdx: d.getMonth(), year: d.getFullYear() };
  }, []);

  // ── Persistence ──
  const [loaded, setLoaded] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);

  function applyInputs(d) {
    if (d.curValue != null) setCurValue(d.curValue);
    if (d.origLoan != null) setOrigLoan(d.origLoan);
    if (d.oldRate != null) setOldRate(d.oldRate);
    if (d.oldTermYears != null) setOldTermYears(d.oldTermYears);
    if (d.curBalance != null) setCurBalance(d.curBalance);
    if (d.startMo != null) setStartMo(d.startMo);
    if (d.startYr != null) setStartYr(d.startYr);
    if (d.curAnnualTax != null) setCurAnnualTax(d.curAnnualTax);
    if (d.curAnnualIns != null) setCurAnnualIns(d.curAnnualIns);
    if (d.tgtPrice != null) setTgtPrice(d.tgtPrice);
    if (d.newRate != null) setNewRate(d.newRate);
    if (d.newTermYears != null) setNewTermYears(d.newTermYears);
    if (d.tgtTaxMode != null) setTgtTaxMode(d.tgtTaxMode);
    if (d.tgtTaxRate != null) setTgtTaxRate(d.tgtTaxRate);
    if (d.tgtAnnualTax != null) setTgtAnnualTax(d.tgtAnnualTax);
    if (d.tgtAnnualIns != null) setTgtAnnualIns(d.tgtAnnualIns);
    if (d.includeTxCosts != null) setIncludeTxCosts(d.includeTxCosts);
    if (d.realtorPct != null) setRealtorPct(d.realtorPct);
    if (d.otherSellingCosts != null) setOtherSellingCosts(d.otherSellingCosts);
    if (d.closingPct != null) setClosingPct(d.closingPct);
  }

  function getCurrentInputs() {
    return {
      curValue, origLoan, oldRate, oldTermYears, curBalance, startMo, startYr,
      curAnnualTax, curAnnualIns, tgtPrice, newRate, newTermYears, tgtTaxMode, tgtTaxRate,
      tgtAnnualTax, tgtAnnualIns, includeTxCosts, realtorPct, otherSellingCosts, closingPct,
    };
  }

  useEffect(() => {
    try {
      const urlState = parseUrlParams(URL_SCHEMA);
      if (urlState) {
        applyInputs(urlState);
        stripUrlParams();
        setLoadedFromUrl(true);
      } else {
        const raw = localStorage.getItem(INPUTS_KEY);
        if (raw) applyInputs(JSON.parse(raw));
      }
    } catch (e) { /* no saved data */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(INPUTS_KEY, JSON.stringify(getCurrentInputs())); } catch (e) {}
  }, [loaded, curValue, origLoan, oldRate, oldTermYears, curBalance, startMo, startYr,
      curAnnualTax, curAnnualIns, tgtPrice, newRate, newTermYears, tgtTaxMode, tgtTaxRate,
      tgtAnnualTax, tgtAnnualIns, includeTxCosts, realtorPct, otherSellingCosts, closingPct]);

  function resetAll() {
    setCurValue(500000); setOrigLoan(350000); setOldRate(3.0); setOldTermYears(30);
    setCurBalance(305000); setStartMo(0); setStartYr(2020);
    setCurAnnualTax(5000); setCurAnnualIns(1800);
    setTgtPrice(550000); setNewRate(6.5); setNewTermYears(30);
    setTgtTaxMode("rate"); setTgtTaxRate(1.1); setTgtAnnualTax(6000); setTgtAnnualIns(1800);
    setIncludeTxCosts(true); setRealtorPct(5.5); setOtherSellingCosts(5000); setClosingPct(2.5);
    setActiveScenarioId(null);
    try { localStorage.removeItem(INPUTS_KEY); } catch (e) {}
  }

  // ── Derived calculations ──
  const calc = useMemo(() => {
    const oldR = oldRate / 100;
    const newR = newRate / 100;
    const oldTermMonths = oldTermYears * 12;
    const newTermMonths = newTermYears * 12;

    // Current loan
    const oldPmt = calcPmt(origLoan, oldR, oldTermMonths);
    const monthsElapsed = Math.max(0, (TODAY.year - startYr) * 12 + (TODAY.monthIdx - startMo));
    const monthsRemainingScheduled = Math.max(0, oldTermMonths - monthsElapsed);
    const maturity = addMonths(startMo, startYr, oldTermMonths);
    const remainingCurrent = amortize(curBalance, oldR, oldPmt);

    // Current escrow & monthly
    const curEscrow = (curAnnualTax + curAnnualIns) / 12;
    const curTotalMonthly = oldPmt + curEscrow;

    // Equity
    const equityGross = curValue - curBalance;

    // Transaction costs & net cash for down payment
    const realtorFee = includeTxCosts ? (realtorPct / 100) * curValue : 0;
    const otherSelling = includeTxCosts ? otherSellingCosts : 0;
    const closingCosts = includeTxCosts ? (closingPct / 100) * tgtPrice : 0;
    const totalTxCosts = realtorFee + otherSelling + closingCosts;
    const saleProceeds = curValue - realtorFee - otherSelling - curBalance;
    const downPayment = Math.max(0, saleProceeds - closingCosts);

    // New loan
    const newLoanRaw = tgtPrice - downPayment;
    const newLoan = Math.max(0, newLoanRaw);
    const newPmt = calcPmt(newLoan, newR, newTermMonths);
    const newAnnualTax = tgtTaxMode === "rate" ? tgtPrice * (tgtTaxRate / 100) : tgtAnnualTax;
    const effectiveTaxRate = tgtPrice > 0 ? (newAnnualTax / tgtPrice) * 100 : 0;
    const newEscrow = (newAnnualTax + tgtAnnualIns) / 12;
    const newTotalMonthly = newPmt + newEscrow;
    const newPurchase = addMonths(TODAY.monthIdx, TODAY.year, 0);
    const newMaturity = addMonths(newPurchase.monthIdx, newPurchase.year, newTermMonths);

    // Lifetime interest (new) — exact amortization
    const newLifetime = amortize(newLoan, newR, newPmt);

    // Deltas
    const monthlyDelta = newTotalMonthly - curTotalMonthly;
    const monthlyDeltaPct = curTotalMonthly > 0 ? (monthlyDelta / curTotalMonthly) * 100 : 0;
    const escrowDelta = newEscrow - curEscrow;
    const piDelta = newPmt - oldPmt;
    const rateDelta = newR - oldR;
    const interestDelta = newLifetime.interest - remainingCurrent.interest;

    // Borrowing power per dollar of current P&I
    const oldPI = oldPmt;
    const loanAtOldRate = invPmt(oldPI, oldR, oldTermMonths);
    const loanAtNewRate = invPmt(oldPI, newR, newTermMonths);
    const borrowingPowerPct = loanAtOldRate > 0
      ? ((loanAtNewRate - loanAtOldRate) / loanAtOldRate) * 100
      : 0;

    // Equity gain since origination
    const equityGainSinceOrigination = curValue - origLoan;

    // ── Chart data ──
    // Monthly payment breakdown (stacked bars)
    const monthlyChart = [
      { name: "Current", PI: Math.round(oldPmt), Escrow: Math.round((curAnnualTax + curAnnualIns) / 12) },
      { name: "After move", PI: Math.round(newPmt), Escrow: Math.round(newEscrow) },
    ];

    // Cumulative interest over time
    const maxMonths = Math.max(remainingCurrent.months, newLifetime.months, 12);
    const interestSeries = [];
    let bCur = curBalance, intCur = 0, doneCur = bCur <= 0;
    let bNew = newLoan, intNew = 0, doneNew = bNew <= 0;
    for (let m = 1; m <= maxMonths; m++) {
      if (!doneCur) {
        const i = bCur * oldR / 12;
        const p = Math.min(bCur + i, oldPmt);
        bCur = Math.max(0, bCur - (p - i));
        intCur += i;
        if (bCur <= 0) doneCur = true;
      }
      if (!doneNew) {
        const i = bNew * newR / 12;
        const p = Math.min(bNew + i, newPmt);
        bNew = Math.max(0, bNew - (p - i));
        intNew += i;
        if (bNew <= 0) doneNew = true;
      }
      if (m === 1 || m % 12 === 0 || m === maxMonths) {
        interestSeries.push({ month: m, current: Math.round(intCur), newLoan: Math.round(intNew) });
      }
    }

    // Buying power across rates (2% to 8%)
    const buyingPowerSeries = [];
    for (let r10 = 20; r10 <= 80; r10 += 1) {
      const rate = r10 / 10;
      const loan = invPmt(oldPmt, rate / 100, oldTermMonths);
      buyingPowerSeries.push({ rate, loan: Math.round(loan) });
    }

    return {
      oldR, newR, oldTermMonths, newTermMonths,
      oldPmt, monthsElapsed, monthsRemainingScheduled, maturity, remainingCurrent,
      curEscrow, curTotalMonthly, equityGross,
      realtorFee, otherSelling, closingCosts, totalTxCosts, saleProceeds, downPayment,
      newLoan, newPmt, newAnnualTax, effectiveTaxRate, newEscrow, newTotalMonthly, newMaturity, newLifetime,
      monthlyDelta, monthlyDeltaPct, escrowDelta, piDelta, rateDelta, interestDelta,
      loanAtOldRate, loanAtNewRate, borrowingPowerPct,
      equityGainSinceOrigination,
      monthlyChart, interestSeries, buyingPowerSeries,
    };
  }, [curValue, origLoan, oldRate, oldTermYears, curBalance, startMo, startYr,
      curAnnualTax, curAnnualIns, tgtPrice, newRate, newTermYears, tgtTaxMode, tgtTaxRate,
      tgtAnnualTax, tgtAnnualIns, includeTxCosts, realtorPct, otherSellingCosts, closingPct, TODAY]);

  // ── Adaptive narrative helpers ──
  const direction = (delta, tol) => delta > tol ? "more" : delta < -tol ? "less" : "same";
  const monthlyDir = direction(calc.monthlyDelta, SAME_MONTHLY);
  const interestDir = direction(calc.interestDelta, SAME_INTEREST);
  const rateDir = direction(calc.rateDelta, SAME_RATE);

  if (!loaded) return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 920, margin: "0 auto", padding: "80px 16px", textAlign: "center", color: "#94a3b8" }}>
      Loading saved data…
    </div>
  );


  /** Remove this calculator's stored data and reload into a clean state. */
  function clearStoredData() {
    for (const key of ["home-purchase-comparison-inputs", "home-purchase-comparison-scenarios"]) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
    window.location.href = window.location.pathname;
  }

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .hpc-app { padding: 16px 10px !important; }
          .hpc-app h1 { font-size: 18px !important; }
          .hpc-app h2 { font-size: 14px !important; }
          .hpc-app input, .hpc-app select { font-size: 16px !important; }
          .hpc-cols { grid-template-columns: 1fr !important; }
          .hpc-compare { font-size: 11px !important; }
        }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>
      <div className="hpc-app" style={{
        fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 920, margin: "0 auto",
        padding: "24px 16px", color: "#1a1a2e", background: "#f7f8fb", minHeight: "100vh",
      }}>

        <Breadcrumb current="Home Purchase Comparison" />

        <DataDisclosureLink />

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 3px", color: "#0f172a" }}>Home Purchase Comparison</h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Compare the true cost of moving — monthly payment, lifetime interest, and how rate changes affect your buying power.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            <ScenariosMenu
              storageKey={SCENARIOS_KEY}
              getCurrentState={getCurrentInputs}
              applyScenario={applyInputs}
              activeId={activeScenarioId}
              setActiveId={setActiveScenarioId}
              buttonStyle={headerBtnStyle}
            />
            <ShareButton getState={getCurrentInputs} style={headerBtnStyle} />
            <button onClick={resetAll} style={headerBtnStyle}>Reset all</button>
          </div>
        </div>

        <ShareBanner
          visible={loadedFromUrl}
          onDismiss={() => setLoadedFromUrl(false)}
          scenariosKey={SCENARIOS_KEY}
          getState={getCurrentInputs}
          setActiveId={setActiveScenarioId}
        />

        {/* ── INPUTS ── */}
        <div className="hpc-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
          {/* Current home */}
          <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e5ea" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Current home</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
              <Field label="Estimated value" value={curValue} onChange={setCurValue} prefix="$" />
              <Field label="Original loan amount" value={origLoan} onChange={setOrigLoan} prefix="$" />
              <Field label="Current balance" value={curBalance} onChange={setCurBalance} prefix="$" />
              <div>
                <div style={lbl}>Loan start</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <select value={startMo} onChange={e => setStartMo(+e.target.value)} style={{ ...sel, flex: "1 1 0", minWidth: 0 }}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    <NumInput min={1970} max={2100} value={startYr} onChange={v => setStartYr(Math.round(v))} style={inputStyle()} />
                  </div>
                </div>
              </div>
              <Field label="Interest rate" value={oldRate} onChange={setOldRate} suffix="%" step={0.125} />
              <Field label="Term (years)" value={oldTermYears} onChange={setOldTermYears} step={1} />
              <Field label="Annual property tax" value={curAnnualTax} onChange={setCurAnnualTax} prefix="$" />
              <Field label="Annual insurance" value={curAnnualIns} onChange={setCurAnnualIns} prefix="$" />
            </div>
          </div>

          {/* Target home */}
          <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e5ea" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>Target home</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
              <Field label="Purchase price" value={tgtPrice} onChange={setTgtPrice} prefix="$" />
              <Field label="Quoted rate" value={newRate} onChange={setNewRate} suffix="%" step={0.125} />
              <Field label="Term (years)" value={newTermYears} onChange={setNewTermYears} step={1} />
              <TaxField
                mode={tgtTaxMode} setMode={setTgtTaxMode}
                rateValue={tgtTaxRate} onRateChange={setTgtTaxRate}
                annualValue={tgtAnnualTax} onAnnualChange={setTgtAnnualTax}
              />
              <Field label="Annual insurance" value={tgtAnnualIns} onChange={setTgtAnnualIns} prefix="$" />
            </div>
            <p style={{ fontSize: 10.5, color: "#94a3b8", margin: "8px 0 0", lineHeight: 1.5 }}>
              {tgtTaxMode === "rate"
                ? <>Most US states reassess at purchase price. Tax = price × rate ({fmt(tgtPrice * tgtTaxRate / 100)}/yr). Switch to <strong>$/yr</strong> to override.</>
                : <>Using fixed annual property tax (override active — equivalent to {fmtPct(calc.effectiveTaxRate, 2)} of purchase price). Switch to <strong>%</strong> to compute from rate.</>}
            </p>
          </div>
        </div>

        {/* Transaction costs */}
        <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e5ea", marginBottom: 22 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: includeTxCosts ? 12 : 0 }}>
            <input type="checkbox" checked={includeTxCosts} onChange={e => setIncludeTxCosts(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Include transaction costs
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}>
              (realtor commission, closing costs, etc.)
            </span>
          </label>
          {includeTxCosts && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="Realtor commission" value={realtorPct} onChange={setRealtorPct} suffix="%" step={0.25} />
              <Field label="Other selling costs" value={otherSellingCosts} onChange={setOtherSellingCosts} prefix="$" />
              <Field label="Closing costs on purchase" value={closingPct} onChange={setClosingPct} suffix="%" step={0.25} />
            </div>
          )}
        </div>

        {/* ── 1. Property comparison ── */}
        <Section title="Property comparison">
          <CompareTable rows={[
            ["Price / estimated value", fmt(curValue), fmt(tgtPrice)],
            ["Interest rate", fmtPct(oldRate, 3), fmtPct(newRate, 3)],
            ["Loan type", `${oldTermYears}-year fixed`, `${newTermYears}-year fixed`],
            ["Origination", mDate(startMo, startYr), "New"],
            ["Loan maturity", mDate(calc.maturity.monthIdx, calc.maturity.year), mDate(calc.newMaturity.monthIdx, calc.newMaturity.year)],
          ]} headers={["", "Current home", "Target home"]} />
          <Prose>
            {calc.equityGainSinceOrigination > 0
              ? <>The current home's estimated value is <strong>{fmt(calc.equityGainSinceOrigination)}</strong> above its original loan amount — that paper gain is what makes a move feel affordable. The rest of this analysis tests whether the math actually supports that intuition.</>
              : calc.equityGainSinceOrigination < 0
                ? <>The current home's estimated value is <strong>{fmt(-calc.equityGainSinceOrigination)}</strong> below its original loan amount. Moving from this position is unusually constrained.</>
                : <>The current home's estimated value matches its original loan amount, so most of the equity in play comes from principal paid down, not appreciation.</>}
          </Prose>
        </Section>

        {/* ── 2. Current mortgage snapshot ── */}
        <Section title="Current mortgage snapshot">
          <KVGrid items={[
            ["Original loan balance", fmt(origLoan)],
            ["Current principal balance", fmt(curBalance)],
            ["Estimated equity (gross)", fmt(calc.equityGross)],
            ["Months into the loan", `${calc.monthsElapsed} (${mStr(calc.monthsElapsed)})`],
            ["Monthly principal & interest", fmt(calc.oldPmt)],
            ["Monthly escrow (tax + insurance)", fmt(calc.curEscrow)],
            ["Total monthly payment", <strong key="t">{fmt(calc.curTotalMonthly)}</strong>],
          ]} />
          <Prose>
            The current payment of <strong>{fmt(calc.curTotalMonthly)}/mo</strong> is the benchmark every move scenario has to beat. Of that, <strong>{fmt(calc.oldPmt)}</strong> goes to principal &amp; interest at a <strong>{fmtPct(oldRate, 3)}</strong> rate, and <strong>{fmt(calc.curEscrow)}</strong> covers property tax and insurance. Gross equity (estimated value minus current balance) sits at <strong>{fmt(calc.equityGross)}</strong>.
          </Prose>
        </Section>

        {/* ── 3. Move scenario ── */}
        <Section title="Move scenario">
          {includeTxCosts && (
            <div style={{ background: "#fafbfc", borderRadius: 8, padding: "10px 12px", border: "1px solid #eef0f4", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>From equity to down payment</div>
              <KVRow label={`Realtor commission (${fmtPct(realtorPct, 2)} of sale)`} value={"−" + fmt(calc.realtorFee)} small />
              <KVRow label="Other selling costs" value={"−" + fmt(calc.otherSelling)} small />
              <KVRow label={`Closing costs (${fmtPct(closingPct, 2)} of purchase)`} value={"−" + fmt(calc.closingCosts)} small />
              <KVRow label="Total transaction costs" value={"−" + fmt(calc.totalTxCosts)} small bold />
              <div style={{ borderTop: "1px dashed #e2e5ea", margin: "6px 0" }} />
              <KVRow label="Net cash available for down payment" value={fmt(calc.downPayment)} small bold />
            </div>
          )}
          <KVGrid items={[
            ["Down payment", fmt(calc.downPayment)],
            ["New loan amount", fmt(calc.newLoan)],
            ["New monthly P&I", fmt(calc.newPmt)],
            ["New monthly escrow", fmt(calc.newEscrow)],
            ["New total monthly", <strong key="t">{fmt(calc.newTotalMonthly)}</strong>],
            ["Change vs. current monthly",
              <strong key="d" style={{ color: monthlyDir === "more" ? "#dc2626" : monthlyDir === "less" ? "#059669" : "#64748b" }}>
                {fmtSigned(calc.monthlyDelta)} ({calc.monthlyDelta >= 0 ? "+" : ""}{calc.monthlyDeltaPct.toFixed(1)}%)
              </strong>],
          ]} />
          <ChartFrame title="Monthly payment, side by side">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={calc.monthlyChart} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} axisLine={{ stroke: "#e2e5ea" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => "$" + (v / 1000).toFixed(1) + "k"} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  formatter={(v) => fmt(v)} labelStyle={{ color: "#1e293b", fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="PI" stackId="a" fill="#6366f1" name="Principal & Interest" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Escrow" stackId="a" fill="#94a3b8" name="Escrow (tax + insurance)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <Prose>
            {monthlyDir === "more"
              ? <>Moving would push the monthly payment to <strong>{fmt(calc.newTotalMonthly)}</strong> — roughly <strong>{fmt(Math.abs(calc.monthlyDelta))} more per month</strong>, a {Math.abs(calc.monthlyDeltaPct).toFixed(0)}% increase over what's being paid today.</>
              : monthlyDir === "less"
                ? <>Moving would actually <em>reduce</em> the monthly payment to <strong>{fmt(calc.newTotalMonthly)}</strong> — roughly <strong>{fmt(Math.abs(calc.monthlyDelta))} less per month</strong>, a {Math.abs(calc.monthlyDeltaPct).toFixed(0)}% decrease.</>
                : <>Moving keeps the monthly payment roughly flat at <strong>{fmt(calc.newTotalMonthly)}</strong> — within about {fmt(SAME_MONTHLY)} of the current bill.</>}
            {" "}
            {calc.escrowDelta > SAME_MONTHLY
              ? <>Escrow alone climbs <strong>{fmt(calc.escrowDelta)}/mo</strong>, largely because the target home is taxed on its purchase price at <strong>{fmtPct(tgtTaxRate, 2)}</strong>.</>
              : calc.escrowDelta < -SAME_MONTHLY
                ? <>Escrow drops by <strong>{fmt(-calc.escrowDelta)}/mo</strong> — the target home's tax-plus-insurance bill comes out lower than the current one.</>
                : <>Escrow is roughly unchanged, within about {fmt(SAME_MONTHLY)}/mo.</>}
          </Prose>
        </Section>

        {/* ── 4. Rate impact on borrowing power ── */}
        <Section title="Rate impact on borrowing power">
          <div style={{ overflowX: "auto", marginBottom: 8 }}>
            <table className="hpc-compare" style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Rate</th>
                  <th style={thStyle}>What a {fmt(calc.oldPmt)}/mo P&amp;I payment supports</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>{fmtPct(oldRate, 3)} (current rate)</td>
                  <td style={tdNumStyle}>{fmt(calc.loanAtOldRate)} loan</td>
                </tr>
                <tr>
                  <td style={tdStyle}>{fmtPct(newRate, 3)} (quoted rate)</td>
                  <td style={tdNumStyle}>{fmt(calc.loanAtNewRate)} loan</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ChartFrame title={`Loan supported by ${fmt(calc.oldPmt)}/mo P&I across the rate curve`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={calc.buyingPowerSeries} margin={{ top: 18, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                <XAxis dataKey="rate" type="number" domain={[2, 8]} ticks={[2, 3, 4, 5, 6, 7, 8]}
                  tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e5ea" }} tickLine={false}
                  tickFormatter={r => r + "%"} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  formatter={v => fmt(v) + " loan"}
                  labelFormatter={r => fmtPct(r, 2) + " rate"}
                  labelStyle={{ color: "#1e293b", fontWeight: 600 }} />
                <Line type="monotone" dataKey="loan" stroke="#6366f1" strokeWidth={2} dot={false} name="Loan supported" />
                <ReferenceDot x={oldRate} y={calc.loanAtOldRate} r={5} fill="#16a34a" stroke="#fff" strokeWidth={2} isFront>
                  <Label value="current" position="top" offset={8} style={{ fontSize: 10, fontWeight: 700, fill: "#16a34a" }} />
                </ReferenceDot>
                <ReferenceDot x={newRate} y={calc.loanAtNewRate} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2} isFront>
                  <Label value="quoted" position="top" offset={8} style={{ fontSize: 10, fontWeight: 700, fill: "#dc2626" }} />
                </ReferenceDot>
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          <Prose>
            {rateDir === "more"
              ? <>
                  At <strong>{fmtPct(newRate, 3)}</strong>, each dollar of monthly P&amp;I supports a smaller loan than it does at the current <strong>{fmtPct(oldRate, 3)}</strong> rate. Specifically, the same <strong>{fmt(calc.oldPmt)}/mo</strong> that funds today's loan would support only <strong>{fmt(calc.loanAtNewRate)}</strong> at the new rate — a <strong>{Math.abs(calc.borrowingPowerPct).toFixed(0)}% drop</strong> in borrowing power per dollar of payment.
                  {calc.equityGainSinceOrigination > 0 && <> The current home's value has risen by about <strong>{fmt(calc.equityGainSinceOrigination)}</strong> since origination on paper, but the rate move erodes that gain by shrinking what the equity can buy.</>}
                </>
              : rateDir === "less"
                ? <>At <strong>{fmtPct(newRate, 3)}</strong>, each dollar of monthly P&amp;I supports a larger loan than it does at the current <strong>{fmtPct(oldRate, 3)}</strong> rate. The same <strong>{fmt(calc.oldPmt)}/mo</strong> would support <strong>{fmt(calc.loanAtNewRate)}</strong> at the new rate — a <strong>{calc.borrowingPowerPct.toFixed(0)}% increase</strong> in borrowing power per dollar of payment. The rate environment is working in favor of the move.</>
                : <>The current and quoted rates are nearly identical, so borrowing power per dollar of payment is essentially unchanged. The decision turns on price differences, transaction costs, and escrow — not on the rate itself.</>}
          </Prose>
        </Section>

        {/* ── 5. Lifetime cost comparison ── */}
        <Section title="Lifetime cost comparison">
          <CompareTable headers={["", "Current loan (remaining)", "New loan (target home)"]} rows={[
            ["Loan balance", fmt(curBalance), fmt(calc.newLoan)],
            ["Months remaining", `${calc.remainingCurrent.months} (${mStr(calc.remainingCurrent.months)})`,
              `${calc.newLifetime.months} (${mStr(calc.newLifetime.months)})`],
            ["Total P&I to be paid", fmt(calc.remainingCurrent.interest + curBalance), fmt(calc.newLifetime.interest + calc.newLoan)],
            ["Of which is interest", fmt(calc.remainingCurrent.interest), fmt(calc.newLifetime.interest)],
          ]} />
          <ChartFrame title="Cumulative interest paid over time">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={calc.interestSeries} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
                <XAxis dataKey="month" type="number" domain={[0, 'dataMax']}
                  tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e5ea" }} tickLine={false}
                  tickFormatter={m => "Yr " + Math.round(m / 12)} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  formatter={v => fmt(v)}
                  labelFormatter={m => `Year ${(m / 12).toFixed(1)}`}
                  labelStyle={{ color: "#1e293b", fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Line type="monotone" dataKey="current" stroke="#64748b" strokeWidth={2} dot={false} name="Current loan (remaining)" />
                <Line type="monotone" dataKey="newLoan" stroke={interestDir === "less" ? "#059669" : "#dc2626"} strokeWidth={2} dot={false} name="New loan (target)" />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          <Prose>
            {interestDir === "more"
              ? <>Across the full term, the new loan would carry roughly <strong>{fmt(Math.abs(calc.interestDelta))} more in interest</strong> than what's left to pay on the current mortgage. This combines two effects: a {calc.newLoan > curBalance ? "larger" : "different"} loan balance and {rateDir === "more" ? "a higher" : rateDir === "less" ? "a lower" : "a similar"} rate, stretched over {calc.newLifetime.months > calc.remainingCurrent.months ? "more" : "fewer"} months.</>
              : interestDir === "less"
                ? <>Across the full term, the new loan would carry roughly <strong>{fmt(Math.abs(calc.interestDelta))} less in interest</strong> than what's left to pay on the current mortgage — a meaningful tailwind on the lifetime cost side.</>
                : <>Across the full term, total interest paid would be roughly the same — within about {fmt(SAME_INTEREST)} of the current loan's remaining interest.</>}
          </Prose>
        </Section>

        {/* ── 6. Bottom line ── */}
        <Section title="Bottom line" highlight>
          <Prose large>
            {monthlyDir === "more" && interestDir === "more"
              ? <>Moving would cost about <strong>{fmt(Math.abs(calc.monthlyDelta))} more per month</strong> and roughly <strong>{fmt(Math.abs(calc.interestDelta))} more in interest</strong> over the life of the loan. {rateDir === "more" ? "The rate environment has cancelled out much of the equity gain — " : ""}the target home, despite headline pricing, would cost substantially more both monthly and in the long term.</>
              : monthlyDir === "less" && interestDir === "less"
                ? <>Moving would actually save about <strong>{fmt(Math.abs(calc.monthlyDelta))} per month</strong> and roughly <strong>{fmt(Math.abs(calc.interestDelta))} in interest</strong> over the life of the loan. The combination of price, rate, and equity works in favor of the move.</>
                : monthlyDir === "more" && interestDir === "less"
                  ? <>Moving would cost about <strong>{fmt(Math.abs(calc.monthlyDelta))} more per month</strong> but save roughly <strong>{fmt(Math.abs(calc.interestDelta))} in interest</strong> over the life of the loan — a trade-off between monthly cash flow and lifetime cost.</>
                  : monthlyDir === "less" && interestDir === "more"
                    ? <>Moving would save about <strong>{fmt(Math.abs(calc.monthlyDelta))} per month</strong> but add roughly <strong>{fmt(Math.abs(calc.interestDelta))} in interest</strong> over the life of the loan. A lower monthly bill comes at the cost of paying more in total.</>
                    : <>The monthly and lifetime costs of moving come out close to where the current mortgage already sits. The decision turns on non-financial factors more than on the numbers in this calculator.</>}
          </Prose>
        </Section>

        {/* ── 7. Things worth considering ── */}
        <Section title="Things worth considering">
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12.5, lineHeight: 1.65, color: "#374151" }}>
            {oldRate < 4 && rateDir === "more" && (
              <li style={{ marginBottom: 6 }}>
                The current <strong>{fmtPct(oldRate, 3)}</strong> mortgage is exceptional by historical standards. Selling means giving it up permanently — that rate cannot be ported to a new property.
              </li>
            )}
            {monthlyDir === "more" && (
              <li style={{ marginBottom: 6 }}>
                Targeting homes where post-transaction cash covers a larger share of the purchase price would keep monthly costs closer to where they are today.
              </li>
            )}
            {rateDir === "more" && (
              <li style={{ marginBottom: 6 }}>
                Mortgage rate buydowns and future refinances could improve the math — but only if rates actually fall, which isn't guaranteed.
              </li>
            )}
            {includeTxCosts && calc.totalTxCosts > 0 && (
              <li style={{ marginBottom: 6 }}>
                Roughly <strong>{fmt(calc.totalTxCosts)}</strong> of equity is consumed by transaction costs in this scenario. Toggling those off would reduce the new loan to <strong>{fmt(Math.max(0, tgtPrice - calc.equityGross))}</strong>.
              </li>
            )}
            {!includeTxCosts && (
              <li style={{ marginBottom: 6 }}>
                Transaction costs are <strong>not</strong> included in this scenario. Realtor commissions, closing costs, and other selling fees typically consume <em>5–9%</em> of the sale price — toggle them on for a more realistic picture.
              </li>
            )}
            <li style={{ marginBottom: 6 }}>
              Property tax and insurance figures are estimates. A local lender quote and a current insurance quote on the target home would refine the actual escrow.
            </li>
          </ul>
          <p style={{ fontSize: 10.5, color: "#94a3b8", margin: "12px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
            This is an analytical comparison, not financial advice. Property tax, insurance, and transaction cost figures are estimates and should be verified with a local lender and real estate agent.
          </p>
        </Section>

      <DataDisclosure
        storageKeys={["home-purchase-comparison-inputs", "home-purchase-comparison-scenarios"]}
        sharesViaUrl
        onClearStoredData={clearStoredData}
      />

      <WarrantyDisclaimer extraNotes={DISCLOSURE_NOTES} />

      </div>
    </>
  );
}

// ── Sub-components ──

function Section({ title, highlight, children }) {
  return (
    <div style={{
      background: highlight ? "#f0fdf4" : "#fff",
      borderRadius: 10, padding: "18px 20px",
      border: highlight ? "1px solid #bbf7d0" : "1px solid #e2e5ea",
      marginBottom: 22,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#0f172a" }}>{title}</h2>
      {children}
    </div>
  );
}

function Prose({ children, large }) {
  return (
    <p style={{
      fontSize: large ? 13 : 12.5, lineHeight: 1.65,
      margin: "10px 0 0", color: "#374151",
    }}>{children}</p>
  );
}

function KVGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 16 }}>
      {items.map(([k, v], i) => (
        <KVRow key={i} label={k} value={v} />
      ))}
    </div>
  );
}

function KVRow({ label, value, small, bold }) {
  return (
    <>
      <div style={{ fontSize: small ? 11.5 : 12.5, color: small ? "#94a3b8" : "#64748b", padding: "3px 0", fontWeight: bold ? 600 : 400 }}>{label}</div>
      <div style={{ fontSize: small ? 11.5 : 12.5, color: "#1e293b", padding: "3px 0", fontWeight: bold ? 700 : 600, textAlign: "right", whiteSpace: "nowrap" }}>{value}</div>
    </>
  );
}

function CompareTable({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="hpc-compare" style={tableStyle}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ ...thStyle, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={j === 0 ? tdStyle : tdNumStyle}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({ title, children }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed #eef0f4" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function TaxField({ mode, setMode, rateValue, onRateChange, annualValue, onAnnualChange }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, gap: 4 }}>
        <span style={{ ...lbl, marginBottom: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mode === "rate" ? "Property tax rate" : "Annual property tax"}
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === "rate" ? "annual" : "rate")}
          style={{
            fontSize: 9, padding: "1px 5px", border: "1px solid #dde0e6",
            borderRadius: 4, background: "#fff", color: "#64748b", cursor: "pointer",
            textTransform: "none", letterSpacing: "normal", fontWeight: 600,
            flexShrink: 0, whiteSpace: "nowrap",
          }}
          title={mode === "rate" ? "Override with annual $ amount" : "Compute from rate"}
        >
          use {mode === "rate" ? "$/yr" : "%"}
        </button>
      </div>
      <div style={{ position: "relative" }}>
        {mode === "rate" ? (
          <>
            <NumInput min={0} step={0.05} value={rateValue} onChange={onRateChange}
              style={{ ...inputStyle(), paddingLeft: 10, paddingRight: 28 }} />
            <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>%</span>
          </>
        ) : (
          <>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none", zIndex: 1 }}>$</span>
            <NumInput min={0} step={100} value={annualValue} onChange={onAnnualChange}
              style={{ ...inputStyle(), paddingLeft: 20, paddingRight: 10 }} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, prefix, suffix, step = 1 }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={lbl}>{label}</div>
      <div style={{ position: "relative" }}>
        {prefix && <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none", zIndex: 1 }}>{prefix}</span>}
        <NumInput min={0} step={step} value={value} onChange={onChange}
          style={{
            ...inputStyle(),
            paddingLeft: prefix ? 20 : 10,
            paddingRight: suffix ? 28 : 10,
          }}
        />
        {suffix && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Controlled number input that allows free typing, empty fields, and commits on blur
function NumInput({ value, onChange, min, max, step = 1, style }) {
  const [raw, setRaw] = useState(String(value));
  const prev = useRef(value);
  if (value !== prev.current && String(value) !== raw) {
    setRaw(String(value));
  }
  prev.current = value;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={e => {
        const s = e.target.value;
        setRaw(s);
        const v = parseFloat(s);
        if (!isNaN(v) && (min == null || v >= min) && (max == null || v <= max)) {
          onChange(v);
        }
      }}
      onBlur={() => {
        const v = parseFloat(raw);
        if (isNaN(v) || (min != null && v < min)) {
          onChange(min != null ? min : 0);
          setRaw(String(min != null ? min : 0));
        } else if (max != null && v > max) {
          onChange(max);
          setRaw(String(max));
        } else {
          setRaw(String(v));
        }
      }}
      style={style}
    />
  );
}

// ── Styles ──
const headerBtnStyle = {
  border: "1px solid #dde0e6", borderRadius: 6, padding: "6px 14px",
  fontSize: 12, fontWeight: 600, color: "#475569", background: "#fff",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
};
const lbl = { display: "block", fontSize: 10, fontWeight: 600, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.3px" };
const sel = { padding: "7px 8px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, fontWeight: 600, color: "#1e293b", background: "#fff" };
const inputStyle = () => ({
  width: "100%", padding: "7px 10px",
  borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, fontWeight: 600,
  color: "#1e293b", background: "#fff", boxSizing: "border-box",
});

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const thStyle = { fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 8px", borderBottom: "1px solid #e2e5ea", textAlign: "left" };
const tdStyle = { padding: "6px 8px", borderBottom: "1px solid #eef0f4", color: "#475569" };
const tdNumStyle = { padding: "6px 8px", borderBottom: "1px solid #eef0f4", color: "#1e293b", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" };
