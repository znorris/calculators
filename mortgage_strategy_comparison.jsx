import { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";

function calcPmt(p, r, n) {
  const mr = r / 12;
  if (mr === 0) return p / n;
  return (p * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
}


function runModel({ loan, extra, ret, divYld, fedTax, stateTax, chosenPayoff }) {
  const { originalLoan, rate, termYears, currentBalance, monthsElapsed } = loan;
  const pmt = calcPmt(originalLoan, rate, termYears * 12);
  const mr = rate / 12;
  const rem = termYears * 12 - monthsElapsed;
  const tax = fedTax + stateTax;
  const mGrow = (ret - divYld) / 12;
  const mDiv = divYld / 12;

  // ── A: Normal schedule ──
  let bA = currentBalance, intA = 0;
  const schA = [];
  for (let m = 1; m <= rem; m++) {
    const i = bA * mr;
    const p = Math.min(bA + i, pmt);
    bA = Math.max(0, bA - (p - i));
    intA += i;
    schA.push({ m, bal: bA });
  }

  // ── B: Extra payments ──
  let bB = currentBalance, intB = 0, payoffB = rem;
  const schB = [];
  for (let m = 1; m <= rem; m++) {
    if (bB > 0) {
      const i = bB * mr;
      const p = Math.min(bB + i, pmt + extra);
      bB = Math.max(0, bB - (p - i));
      intB += i;
      if (bB <= 0 && payoffB === rem) payoffB = m;
    }
    schB.push({ m, bal: bB });
  }
  const intSaved = intA - intB;

  // ── C: Invest extra, normal mortgage, lump-sum payoff at chosen time ──
  let bC = currentBalance, intC = 0;
  let invC = 0, contribC = 0;
  let crossover = null;
  const schC = [];
  for (let m = 1; m <= rem; m++) {
    if (bC > 0) {
      const i = bC * mr;
      const p = Math.min(bC + i, pmt);
      bC = Math.max(0, bC - (p - i));
      intC += i;
    }
    const isPost = chosenPayoff && m > chosenPayoff;
    const monthlyAdd = isPost ? pmt + extra : extra;
    const g = invC * mGrow;
    const d = invC * mDiv * (1 - tax);
    invC = invC + g + d + monthlyAdd;
    contribC += monthlyAdd;
    const gainsC = Math.max(0, invC - contribC);
    const taxC = gainsC * tax;
    const atvC = invC - taxC;

    if (!crossover && !isPost && atvC >= bC && bC > 0) crossover = m;

    if (chosenPayoff && m === chosenPayoff) {
      const surplus = atvC - bC;
      invC = Math.max(0, surplus);
      contribC = invC;
      bC = 0;
    }
    const postAtv = invC - Math.max(0, invC - contribC) * tax;
    schC.push({ m, bal: bC, inv: invC, atv: bC > 0 ? atvC : postAtv });
  }

  // Payoff stats for C
  let cStats = null;
  if (chosenPayoff && chosenPayoff <= rem) {
    let tb = currentBalance, ti = 0, tc = 0, tI = 0;
    for (let m = 1; m <= chosenPayoff; m++) {
      if (tb > 0) { const i = tb * mr; const p = Math.min(tb + i, pmt); tb = Math.max(0, tb - (p - i)); ti += i; }
      const g2 = tI * mGrow; const d2 = tI * mDiv * (1 - tax);
      tI = tI + g2 + d2 + extra; tc += extra;
    }
    const tG = Math.max(0, tI - tc);
    const tT = tG * tax;
    cStats = { mortBal: tb, invGross: tI, invAtv: tI - tT, surplus: (tI - tT) - tb, taxBill: tT, intPaid: ti };
  }

  // Chart data — regular 3-month sampling, full term
  const chartEnd = rem;
  const chart = [];
  for (let m = 3; m <= chartEnd; m += 3) {
    const a = m <= schA.length ? schA[m - 1] : null;
    const b = m <= schB.length ? schB[m - 1] : null;
    const c = m <= schC.length ? schC[m - 1] : null;
    chart.push({
      month: m,
      aMort: a ? Math.round(a.bal) : 0,
      bMort: b ? Math.round(b.bal) : 0,
      cInv: c ? Math.round(c.atv) : null,
      cInvGross: c ? Math.round(c.inv) : null,
    });
  }
  if (chart.length === 0 || chart[chart.length - 1].month !== chartEnd) {
    const a = schA[chartEnd - 1], b = schB[chartEnd - 1], c = schC[chartEnd - 1];
    chart.push({
      month: chartEnd,
      aMort: a ? Math.round(a.bal) : 0,
      bMort: b ? Math.round(b.bal) : 0,
      cInv: c ? Math.round(c.atv) : null,
      cInvGross: c ? Math.round(c.inv) : null,
    });
  }

  // Year ticks
  const yearTicks = [], halfTicks = [];
  for (let m = 1; m <= chartEnd; m++) {
    const totalMo = monthsElapsed + m;
    const moOfYear = totalMo % 12;
    if (moOfYear === 5) yearTicks.push(m);
    if (moOfYear === 11) halfTicks.push(m);
  }

  return { pmt, rem, intA, intB, intSaved, payoffB, crossover, cStats, chart, yearTicks, halfTicks, tax, schB, schC };
}

const fmt = n => "$" + Math.round(n).toLocaleString();
const fmtK = n => Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(0) + "k" : "$" + n.toFixed(0);
function mStr(m) { if (!m && m !== 0) return "\u2014"; const y = Math.floor(m / 12), mo = m % 12; return y === 0 ? `${mo}mo` : mo > 0 ? `${y}yr ${mo}mo` : `${y}yr`; }

// ═══════════════════════════════════════
export default function App() {
  // Loan inputs
  const [origLoan, setOrigLoan] = useState(100000);
  const [termYears, setTermYears] = useState(30);
  const [mortRate, setMortRate] = useState(6);
  const [curBal, setCurBal] = useState(100000);
  const [startMo, setStartMo] = useState(3); // 0=Jan, 3=Apr
  const [startYr, setStartYr] = useState(2026);

  // Strategy inputs
  const [returnRate, setReturnRate] = useState(7);
  const [extra, setExtra] = useState(500);
  const [fedTax, setFedTax] = useState(0.15);
  const [stateTax, setStateTax] = useState(0.093);
  const [divYld] = useState(0.015);
  const [payoffOff, setPayoffOff] = useState(0);

  // Zoom state
  const [zoomDomain, setZoomDomain] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  // Persistent storage
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("mortgage-calc-inputs");
        if (result && result.value) {
          const d = JSON.parse(result.value);
          if (d.origLoan != null) setOrigLoan(d.origLoan);
          if (d.termYears != null) setTermYears(d.termYears);
          if (d.mortRate != null) setMortRate(d.mortRate);
          if (d.curBal != null) setCurBal(d.curBal);
          if (d.startMo != null) setStartMo(d.startMo);
          if (d.startYr != null) setStartYr(d.startYr);
          if (d.returnRate != null) setReturnRate(d.returnRate);
          if (d.extra != null) setExtra(d.extra);
          if (d.fedTax != null) setFedTax(d.fedTax);
          if (d.stateTax != null) setStateTax(d.stateTax);
          if (d.payoffOff != null) setPayoffOff(d.payoffOff);
        }
      } catch (e) { /* no saved data */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const data = { origLoan, termYears, mortRate, curBal, startMo, startYr, returnRate, extra, fedTax, stateTax, payoffOff };
    window.storage.set("mortgage-calc-inputs", JSON.stringify(data)).catch(() => {});
  }, [loaded, origLoan, termYears, mortRate, curBal, startMo, startYr, returnRate, extra, fedTax, stateTax, payoffOff]);

  // Derived loan object
  const loan = useMemo(() => {
    const rate = mortRate / 100;
    // Months elapsed = difference between now (Apr 2026) and start date
    const nowYear = 2026, nowMonth = 3; // Apr = index 3
    const monthsElapsed = Math.max(0, (nowYear - startYr) * 12 + (nowMonth - startMo));
    return { originalLoan: origLoan, rate, termYears, currentBalance: curBal, monthsElapsed };
  }, [origLoan, termYears, mortRate, curBal, startMo, startYr]);

  function mDate(m) {
    const totalMo = startMo + loan.monthsElapsed + m;
    const y = startYr + Math.floor(totalMo / 12);
    const mo = totalMo % 12;
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo] + " " + y;
  }

  const ret = returnRate / 100;
  const base = useMemo(() => runModel({ loan, extra, ret, divYld, fedTax, stateTax, chosenPayoff: null }), [loan, ret, extra, fedTax, stateTax, divYld]);
  const minP = base.crossover || 1;
  const maxP = base.rem;
  const chosen = Math.min(Math.max(minP + payoffOff, minP), maxP);

  const s = useMemo(() => runModel({ loan, extra, ret, divYld, fedTax, stateTax, chosenPayoff: chosen }), [loan, ret, extra, fedTax, stateTax, divYld, chosen]);

  const ps = s.cStats;
  const timeCvB = s.payoffB - chosen;

  // ── Optimal payoff analysis ──
  const optimalData = useMemo(() => {
    if (!base.crossover) return { data: [], peakMonth: null, peakAdv: 0 };
    const cross = base.crossover;
    const mr = loan.rate / 12;
    const taxRate = fedTax + stateTax;
    const mGrow = (ret - divYld) / 12;
    const mDiv = divYld / 12;
    const monthlyPmt = base.pmt;

    const crossSnap = runModel({ loan, extra, ret, divYld, fedTax, stateTax, chosenPayoff: cross });
    const crossSurplus = crossSnap.cStats ? crossSnap.cStats.surplus : 0;

    let paidOffBal = crossSurplus;
    let paidOffContrib = crossSurplus;
    const data = [];
    let peakMonth = cross;
    let peakAdv = 0;
    const step = Math.max(1, Math.round((base.rem - cross) / 80));

    for (let m = cross + 1; m <= base.rem; m++) {
      const g = paidOffBal * mGrow;
      const d = paidOffBal * mDiv * (1 - taxRate);
      paidOffBal = paidOffBal + g + d + monthlyPmt + extra;
      paidOffContrib += monthlyPmt + extra;
      const paidOffGains = Math.max(0, paidOffBal - paidOffContrib);
      const paidOffAtv = paidOffBal - paidOffGains * taxRate;

      const waitPoint = m <= base.schC.length ? base.schC[m - 1] : null;
      const waitNet = waitPoint ? waitPoint.atv - waitPoint.bal : 0;
      const advantage = waitNet - paidOffAtv;

      if (advantage > peakAdv) { peakAdv = advantage; peakMonth = m; }
      if (m % step === 0 || m === base.rem || m === cross + 1) {
        data.push({ month: m, advantage: Math.round(advantage) });
      }
    }
    return { data, peakMonth, peakAdv: Math.round(peakAdv) };
  }, [loan, ret, extra, fedTax, stateTax, divYld, base.crossover, base.rem, base.schC, base.pmt]);

  const timingTicks = useMemo(() => {
    if (!base.crossover) return [];
    const ticks = [];
    for (let m = base.crossover; m <= base.rem; m++) {
      const totalMo = loan.monthsElapsed + m;
      if (totalMo % 12 === 5) ticks.push(m);
    }
    return ticks;
  }, [base.crossover, base.rem, loan.monthsElapsed]);

  // ── Zoom logic ──
  const xDomain = zoomDomain || [0, s.rem];
  const xSpan = xDomain[1] - xDomain[0];

  const visibleTicks = useMemo(() => {
    const major = [], minor = [];
    const lo = Math.max(0, xDomain[0] - 12);
    const hi = Math.min(s.rem + 12, xDomain[1] + 12);
    for (let m = 1; m <= s.rem; m++) {
      if (m < lo || m > hi) continue;
      const totalMo = loan.monthsElapsed + m;
      const moOfYear = totalMo % 12;
      if (xSpan <= 18) {
        if (moOfYear === 5) major.push(m);
        else minor.push(m);
      } else if (xSpan <= 60) {
        if (moOfYear === 5) major.push(m);
        if (moOfYear === 11) minor.push(m);
      } else {
        if (moOfYear === 5) major.push(m);
        if (moOfYear === 11) minor.push(m);
      }
    }
    return { major, minor };
  }, [xDomain, xSpan, s.rem, loan.monthsElapsed]);

  const allTicks = [...visibleTicks.major, ...visibleTicks.minor].sort((a, b) => a - b);

  function handleMouseDown(e) { if (e && e.activeLabel != null) setDragStart(e.activeLabel); }
  function handleMouseMove(e) { if (dragStart != null && e && e.activeLabel != null) setDragEnd(e.activeLabel); }
  function handleMouseUp() {
    if (dragStart != null && dragEnd != null) {
      const left = Math.min(dragStart, dragEnd);
      const right = Math.max(dragStart, dragEnd);
      if (right - left > 3) setZoomDomain([left, right]);
    }
    setDragStart(null); setDragEnd(null);
  }
  function resetZoom() { setZoomDomain(null); setDragStart(null); setDragEnd(null); }
  function resetAll() {
    setOrigLoan(100000); setTermYears(30); setMortRate(6); setCurBal(100000);
    setStartMo(3); setStartYr(2026);
    setReturnRate(7); setExtra(500); setFedTax(0.15); setStateTax(0.093);
    setPayoffOff(0); resetZoom();
    window.storage.delete("mortgage-calc-inputs").catch(() => {});
  }

  if (!loaded) return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 920, margin: "0 auto", padding: "80px 16px", textAlign: "center", color: "#94a3b8" }}>
      Loading saved data…
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 920, margin: "0 auto", padding: "24px 16px", color: "#1a1a2e", background: "#f7f8fb", minHeight: "100vh" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 3px", color: "#0f172a" }}>Mortgage Strategy Comparison</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{fmt(extra)}/mo available · {mortRate}% rate · {fmt(curBal)} remaining</p>
        </div>
        <button onClick={resetAll} style={{
          border: "1px solid #dde0e6", borderRadius: 6, padding: "6px 14px",
          fontSize: 12, fontWeight: 600, color: "#475569", background: "#fff",
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}>Reset all</button>
      </div>

      {/* ── INPUTS ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22, background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e5ea" }}>

        {/* Loan inputs */}
        <div>
          <label style={{ ...lbl, marginBottom: 8 }}>Loan Details</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <LoanField label="Original loan" value={origLoan} onChange={setOrigLoan} prefix="$" />
            <LoanField label="Term (years)" value={termYears} onChange={setTermYears} />
            <LoanField label="Interest rate" value={mortRate} onChange={setMortRate} suffix="%" step={0.125} />
            <LoanField label="Current balance" value={curBal} onChange={setCurBal} prefix="$" />
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.3px" }}>Loan start</div>
              <div style={{ display: "flex", gap: 4 }}>
                <select value={startMo} onChange={e => setStartMo(+e.target.value)} style={{ flex: "1 1 80px", padding: "7px 6px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, fontWeight: 600, color: "#1e293b", background: "#fff" }}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <input type="number" min={1990} max={2030} value={startYr} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setStartYr(v); }}
                  style={{ flex: "1 1 70px", padding: "7px 8px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, fontWeight: 600, color: "#1e293b", background: "#fff", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Strategy inputs */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", borderTop: "1px solid #eef0f4", paddingTop: 12 }}>
          <div style={{ flex: "1 1 320px" }}>
            <label style={lbl}>Expected Market Return<Tip text="The average annual return you expect from your investments. The S&P 500 has historically returned ~10% before inflation, ~7% after. 6-8% is a conservative to moderate range." /></label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: "0 0 90px" }}>
                <input type="number" min={1} max={15} step={0.1} value={returnRate}
                  onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 20) setReturnRate(v); }}
                  style={{ width: "100%", padding: "7px 28px 7px 10px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 14, fontWeight: 600, color: "#1e3a5f", background: "#fff", boxSizing: "border-box" }}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>%</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[6, 7, 8, 10].map(r => (
                  <button key={r} onClick={() => setReturnRate(r)} style={{
                    border: "none", borderRadius: 5, padding: "6px 10px", fontSize: 11, cursor: "pointer",
                    background: returnRate === r ? "#1e3a5f" : "#f1f5f9",
                    color: returnRate === r ? "#fff" : "#64748b",
                    fontWeight: returnRate === r ? 600 : 400,
                  }}>{r}%</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={lbl}>Extra Monthly<Tip text="The additional amount beyond your normal mortgage payment that you can put toward either extra principal (B) or investing (C) each month." /></label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>$</span>
              <input type="number" min={0} step={100} value={extra}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setExtra(v); }}
                style={{ width: "100%", padding: "7px 10px 7px 20px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 14, fontWeight: 600, color: "#1e3a5f", background: "#fff", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Tax inputs */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", borderTop: "1px solid #eef0f4", paddingTop: 12 }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={lbl}>Federal LTCG Rate<Tip text="Federal long-term capital gains tax rate on investments held over 1 year. Depends on your taxable income." /></label>
            <select value={fedTax} onChange={e => setFedTax(+e.target.value)} style={sel}>
              <option value={0}>0%</option>
              <option value={0.15}>15%</option>
              <option value={0.20}>20%</option>
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={lbl}>State Tax on Gains<Tip text="Your state's tax rate on investment gains. Varies widely — 0% in states like TX, FL, WA; up to 13.3% in CA. Some states tax gains as ordinary income." /></label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: "0 0 90px" }}>
                <input type="number" min={0} max={15} step={0.1} value={parseFloat((stateTax * 100).toFixed(1))}
                  onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 20) setStateTax(v / 100); }}
                  style={{ width: "100%", padding: "7px 28px 7px 10px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 14, fontWeight: 600, color: "#1e3a5f", background: "#fff", boxSizing: "border-box" }}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>%</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 5, 9.3, 13.3].map(r => (
                  <button key={r} onClick={() => setStateTax(r / 100)} style={{
                    border: "none", borderRadius: 5, padding: "6px 8px", fontSize: 11, cursor: "pointer",
                    background: Math.abs(stateTax * 100 - r) < 0.05 ? "#1e3a5f" : "#f1f5f9",
                    color: Math.abs(stateTax * 100 - r) < 0.05 ? "#fff" : "#64748b",
                    fontWeight: Math.abs(stateTax * 100 - r) < 0.05 ? 600 : 400,
                  }}>{r}%</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ flex: "0 0 auto", background: "#fef9e7", border: "1px solid #f0d87a", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#7c6a1f", whiteSpace: "nowrap" }}>
            Combined: {((fedTax + stateTax) * 100).toFixed(1)}%<Tip align="right" text="Total tax rate applied to investment gains when you sell. Federal + state combined." />
          </div>
        </div>
      </div>

      {/* ── EXECUTIVE SUMMARY ── */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", border: "1px solid #e2e5ea", marginBottom: 22 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#0f172a" }}>Executive Summary</h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.65, margin: "0 0 14px", color: "#374151" }}>
          You have <em>{fmt(extra)}/mo</em> beyond your normal <em>{fmt(Math.round(s.pmt))}/mo</em> mortgage payment. This tool compares three strategies for that money:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 16 }}>
          <MiniCard color="#94a3b8" label="A — Normal Schedule" desc={<>Do nothing extra. Mortgage runs the full term to <em>{mDate(s.rem)}</em>. Pay <em>{fmt(s.intA)}</em> in total interest. <em>$0</em> in hand at payoff.</>} />
          <MiniCard color="#6366f1" label="B — Extra Payments" desc={<>Pay <em>{fmt(extra)}/mo</em> extra toward principal. Paid off in <em>{mStr(s.payoffB)}</em> (<em>{mDate(s.payoffB)}</em>). Pay <em>{fmt(s.intB)}</em> in total interest. <em>$0</em> in hand at payoff.</>} />
          <MiniCard color="#059669" label="C — Invest & Lump-Sum" desc={<>Invest <em>{fmt(extra)}/mo</em> in a total market index fund. Normal mortgage payments. Pay off in one lump sum.{ps ? <> Pay <em>{fmt(ps.intPaid)}</em> in total interest. <em>{fmt(ps.surplus)}</em> in hand at payoff.</> : ''}</>} />
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#1e293b" }}>Key Concepts</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          <KT term="Crossover Point" color="#f59e0b" desc="The earliest month Strategy C's after-tax portfolio exceeds the remaining mortgage balance. The first moment you could pay off the house from investments." />
          <KT term="Chosen Payoff" color="#dc2626" desc={<>The month you choose to execute C's lump-sum payoff. Adjustable from crossover (<em>{base.crossover ? mDate(base.crossover) : '—'}</em>) to loan end (<em>{mDate(s.rem)}</em>).</>} />
          <KT term="Surplus" color="#7c3aed" desc="Cash remaining in your pocket after C's lump-sum payoff and all taxes. B leaves $0 at payoff." />
          <KT term="After-Tax Value" color="#059669" desc={<>Portfolio minus <em>{((fedTax + stateTax) * 100).toFixed(1)}%</em> combined tax (<em>{(fedTax * 100).toFixed(0)}%</em> federal + <em>{(stateTax * 100).toFixed(1)}%</em> state) on gains.</>} />
        </div>

        <div style={{
          background: ps && timeCvB >= 0 ? "#f0fdf4" : ps ? "#f0f7ff" : "#fefce8",
          borderRadius: 8, padding: "12px 14px",
          border: ps && timeCvB >= 0 ? "1px solid #bbf7d0" : ps ? "1px solid #bfdbfe" : "1px solid #fef08a",
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1e293b", marginBottom: 3 }}>
            {ps && timeCvB > 0
              ? <>📈 Bottom Line: C beats B by <em>{mStr(timeCvB)}</em> and leaves <em>{fmt(ps.surplus)}</em> surplus</>
              : ps && timeCvB === 0
                ? <>📈 Bottom Line: C matches B's timeline with <em>{fmt(ps.surplus)}</em> surplus</>
                : ps && timeCvB < 0
                  ? <>📈 Bottom Line: C pays off <em>{mStr(Math.abs(timeCvB))}</em> after B, but with <em>{fmt(ps.surplus)}</em> surplus</>
                  : "⚖️ Adjust settings above to explore"}
          </div>
          <p style={{ fontSize: 11.5, lineHeight: 1.55, margin: 0, color: "#475569" }}>
            {ps
              ? <>C pays <em>{fmt(ps.intPaid)}</em> in total interest and walks away with <em>{fmt(ps.surplus)}</em> in hand (after <em>{fmt(ps.taxBill)}</em> in taxes). B pays <em>{fmt(s.intB)}</em> in total interest but leaves <em>$0</em> in hand. C pays <em>{fmt(ps.intPaid - s.intB)}</em> more interest than B, but pockets <em>{fmt(ps.surplus)}</em> — a net <em>{fmt(ps.surplus - (ps.intPaid - s.intB))}</em> ahead.</>
              : "Set your assumptions above and use the payoff slider to compare."}
          </p>
        </div>
      </div>

      {/* Payoff slider */}
      {base.crossover && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e5ea", marginBottom: 22 }}>
          <label style={lbl}>
            C Payoff Timing:<Tip text="Choose when Strategy C sells investments and pays off the mortgage in one lump sum. Ranges from the crossover point (earliest possible) to the natural end of the loan." /> <strong style={{ color: "#dc2626" }}>{mDate(chosen)}</strong>
            <span style={{ fontWeight: 400, color: "#94a3b8" }}> ({mStr(chosen)}{chosen > s.payoffB ? " · past B" : ""})</span>
          </label>
          <input type="range" min={0} max={maxP - minP} step={1} value={payoffOff} onChange={e => setPayoffOff(+e.target.value)} style={{ width: "100%", accentColor: "#dc2626", marginTop: 4 }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8" }}>
            <span>Crossover ({mDate(minP)})</span>
            <span>Loan end ({mDate(maxP)})</span>
          </div>
        </div>
      )}

      {/* ── THREE-WAY COMPARISON ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 20, borderRadius: 10, overflow: "hidden", border: "1px solid #dde0e6" }}>
        <StratCard color="#94a3b8" tag="A: Normal Schedule" time={mStr(s.rem)} date={mDate(s.rem)}
          rows={[
            [<>Total interest paid<Tip text="Total mortgage interest you'll pay over the life of this strategy." /></>, fmt(s.intA)],
            [<>Cash in hand at payoff<Tip text="Liquid money in your pocket the day the mortgage hits $0." /></>, "$0", true],
          ]} />
        <StratCard color="#6366f1" tag="B: Extra Payments" time={mStr(s.payoffB)} date={mDate(s.payoffB)}
          rows={[
            [<>Total interest paid<Tip text="Total mortgage interest you'll pay over the life of this strategy." /></>, fmt(s.intB)],
            [<>Cash in hand at payoff<Tip text="Liquid money in your pocket the day the mortgage hits $0." /></>, "$0", true],
          ]}
          bonusRows={[
            [<>Interest saved vs A<Tip text="How much less interest you pay compared to the normal 30-year schedule." /></>, fmt(s.intSaved), false, true],
          ]} />
        <StratCard color="#059669" tag="C: Invest & Lump-Sum" time={mStr(chosen)} date={mDate(chosen)}
          highlight={ps && timeCvB >= 0}
          rows={ps ? [
            [<>Total interest paid<Tip text="Mortgage interest paid from now until your chosen lump-sum payoff date." /></>, fmt(ps.intPaid)],
            [<>Cash in hand at payoff<Tip text="What's left after selling investments, paying taxes on gains, and paying off the mortgage in full." /></>, fmt(ps.surplus), false, true],
          ] : []}
          bonusRows={ps ? [
            [<>Tax bill at sale<Tip text="Federal + state capital gains tax owed when you sell your investments to pay off the mortgage." /></>, fmt(ps.taxBill)],
          ] : []} />
      </div>

      {/* Callout cards */}
      {ps && (
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <Callout
            color={timeCvB > 0 ? "#16a34a" : timeCvB === 0 ? "#d97706" : "#3b82f6"}
            icon={timeCvB > 0 ? "⏱️" : timeCvB === 0 ? "🤝" : "🕐"}
            title={timeCvB > 0 ? <>C pays off <em>{mStr(timeCvB)}</em> before B</> : timeCvB === 0 ? "C matches B's timeline" : <>C pays off <em>{mStr(Math.abs(timeCvB))}</em> after B</>}
            detail={timeCvB > 0 ? <>House is free and clear <em>{mStr(timeCvB)}</em> before extra payments would finish.</> : timeCvB === 0 ? "Both retire the mortgage at the same time, but C keeps surplus." : "Waiting longer lets the surplus grow while the mortgage amortizes."}
          />
          <Callout color="#7c3aed" icon="💰" title={<><em>{fmt(ps.surplus)}</em> surplus at C's payoff</>} detail="Cash remaining after lump-sum payoff and all taxes. B leaves $0 at its payoff." />
        </div>
      )}

      {/* ── CHART ── */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "16px 12px 8px", border: "1px solid #e2e5ea", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2, padding: "0 4px" }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "#334155" }}>Mortgage Balance &amp; Investment Growth</h3>
            <p style={{ fontSize: 11, margin: 0, color: "#94a3b8" }}>
              {zoomDomain
                ? `Viewing ${mDate(zoomDomain[0])} — ${mDate(zoomDomain[1])}`
                : "How each strategy's mortgage balance and C's investment portfolio evolve over the full loan term. The crossover is where C's portfolio can first cover the remaining mortgage. Click and drag to zoom."}
            </p>
          </div>
          {zoomDomain && (
            <button onClick={resetZoom} style={{
              border: "1px solid #dde0e6", borderRadius: 6, padding: "5px 12px",
              fontSize: 11, fontWeight: 600, color: "#475569", background: "#f8f9fb",
              cursor: "pointer", whiteSpace: "nowrap", marginTop: 2,
            }}>Reset zoom</button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={s.chart} margin={{ top: 10, right: 14, left: 6, bottom: 18 }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <defs>
              <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
            <XAxis dataKey="month" type="number" domain={xDomain} ticks={allTicks} allowDataOverflow
              tick={({ x, y, payload }) => {
                const isMajor = visibleTicks.major.includes(payload.value);
                if (isMajor) {
                  const totalMo = loan.monthsElapsed + payload.value;
                  const absMonth = startMo + totalMo;
                  const calYear = startYr + Math.floor(absMonth / 12);
                  const label = xSpan <= 48 ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][absMonth % 12]} '${String(calYear).slice(2)}` : String(calYear);
                  return <text x={x} y={y + 14} textAnchor="middle" fontSize={10} fill="#94a3b8">{label}</text>;
                }
                return <line x1={x} y1={y} x2={x} y2={y + 4} stroke="#d1d5db" strokeWidth={1} />;
              }}
              axisLine={{ stroke: "#d1d5db" }} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} width={48} />
            <Tooltip formatter={(v, name) => [fmt(v), name]}
              labelFormatter={(monthVal) => { const m = typeof monthVal === "number" ? monthVal : parseInt(monthVal); if (isNaN(m)) return ""; return `${mDate(m)}  (${mStr(m)})`; }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Area type="monotone" dataKey="aMort" name="A: Mortgage (normal)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
            <Area type="monotone" dataKey="bMort" name="B: Mortgage (extra pmts)" stroke="#6366f1" strokeWidth={2} fill="none" />
            <Area type="monotone" dataKey="cInv" name="C: Portfolio (after tax)" stroke="#059669" strokeWidth={2.5} fill="url(#gC)" />
            <Area type="monotone" dataKey="cInvGross" name="C: Portfolio (pre-tax)" stroke="#059669" strokeWidth={1} strokeDasharray="4 3" fill="none" />
            {base.crossover && <ReferenceLine x={base.crossover} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />}
            <ReferenceLine x={chosen} stroke="#dc2626" strokeWidth={2} strokeDasharray="6 3" />
            <ReferenceLine x={s.payoffB} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" />
            {dragStart != null && dragEnd != null && (
              <ReferenceArea x1={Math.min(dragStart, dragEnd)} x2={Math.max(dragStart, dragEnd)} strokeOpacity={0.3} fill="#6366f1" fillOpacity={0.1} />
            )}
            <Legend content={() => null} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "10px 0 6px", borderTop: "1px solid #f1f3f5", marginTop: 4, flexWrap: "wrap" }}>
          <LK color="#94a3b8" dash="4 3" width={1.5} label="A: Mortgage (normal)" />
          <LK color="#6366f1" dash="" width={2} label="B: Mortgage (extra pmts)" />
          <LK color="#059669" dash="" width={2.5} label="C: Portfolio (after tax)" />
          <LK color="#059669" dash="4 3" width={1} label="C: Portfolio (pre-tax)" />
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "4px 0 4px", flexWrap: "wrap" }}>
          {base.crossover && <LK color="#f59e0b" dash="6 2" width={2} label={`Crossover — ${mDate(base.crossover)}`} />}
          <LK color="#dc2626" dash="6 2" width={2} label={`C payoff — ${mDate(chosen)}`} />
          <LK color="#6366f1" dash="4 4" width={1.5} label={`B payoff — ${mDate(s.payoffB)}`} />
        </div>
      </div>

      {/* ── OPTIMAL PAYOFF ANALYSIS ── */}
      {optimalData.data.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "16px 12px 8px", border: "1px solid #e2e5ea", marginBottom: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px 4px", color: "#334155" }}>When to Pay Off: Wait vs. Pay Off &amp; Invest</h3>
          <p style={{ fontSize: 11, margin: "0 0 4px 4px", color: "#64748b", lineHeight: 1.5 }}>
            At crossover, you have a choice: pay off the mortgage immediately and invest the full <em>{fmt(Math.round(s.pmt + extra))}/mo</em> (your
            mortgage payment + extra) into the market going forward, or wait — keep your investments growing at <em>{returnRate}%</em> while
            continuing to pay <em>{mortRate}%</em> on the mortgage. This chart shows how much richer (or poorer) you are by waiting
            compared to paying off at crossover.
          </p>
          <p style={{ fontSize: 11, margin: "0 0 6px 4px", color: "#94a3b8" }}>
            Above $0 = waiting is ahead. Below $0 = paying off sooner would have been better. The peak marks the optimal payoff date.
          </p>
          <div style={{
            display: "flex", gap: 16, margin: "0 4px 12px", padding: "10px 14px",
            background: optimalData.peakAdv > 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 6,
            border: optimalData.peakAdv > 0 ? "1px solid #bbf7d0" : "1px solid #fecaca",
            fontSize: 12, flexWrap: "wrap", alignItems: "center",
          }}>
            {optimalData.peakAdv > 0 ? (
              <>
                <span style={{ color: "#166534", fontWeight: 700 }}>📍 Optimal payoff: <em>{mDate(optimalData.peakMonth)}</em> (<em>{mStr(optimalData.peakMonth)}</em>)</span>
                <span style={{ color: "#166534" }}>Waiting gains you <em><strong>{fmt(optimalData.peakAdv)}</strong></em> vs paying off at crossover</span>
              </>
            ) : (
              <span style={{ color: "#991b1b", fontWeight: 600 }}>Pay off at crossover — waiting doesn't help at this return rate</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={optimalData.data} margin={{ top: 10, right: 14, left: 6, bottom: 18 }}>
              <defs>
                <linearGradient id="gAdv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
              <XAxis dataKey="month" type="number" domain={[base.crossover, base.rem]} ticks={timingTicks}
                tick={({ x, y, payload }) => {
                  const absMonth = startMo + loan.monthsElapsed + payload.value;
                  const calYear = startYr + Math.floor(absMonth / 12);
                  return <text x={x} y={y + 14} textAnchor="middle" fontSize={10} fill="#94a3b8">{calYear}</text>;
                }}
                axisLine={{ stroke: "#d1d5db" }} tickLine={false} allowDataOverflow />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "#94a3b8" }} width={48} />
              <Tooltip formatter={(v, name) => [fmt(v), name]}
                labelFormatter={(monthVal) => { const m = typeof monthVal === "number" ? monthVal : parseInt(monthVal); if (isNaN(m)) return ""; return `Pay off at ${mDate(m)} (${mStr(m)})`; }}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <Area type="monotone" dataKey="advantage" name="Advantage of waiting" stroke="#059669" strokeWidth={2.5} fill="url(#gAdv)" />
              {optimalData.peakMonth && <ReferenceLine x={optimalData.peakMonth} stroke="#16a34a" strokeWidth={2} strokeDasharray="6 3" />}
              <ReferenceLine x={chosen} stroke="#dc2626" strokeWidth={2} strokeDasharray="6 3" />
              <ReferenceLine x={s.payoffB} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", padding: "8px 0 4px", borderTop: "1px solid #f1f3f5", marginTop: 4, flexWrap: "wrap" }}>
            <LK color="#059669" dash="" width={2.5} label="Net advantage of waiting" />
            {optimalData.peakMonth && <LK color="#16a34a" dash="6 2" width={2} label={`Optimal payoff — ${mDate(optimalData.peakMonth)}`} />}
            <LK color="#dc2626" dash="6 2" width={2} label={`Your chosen payoff — ${mDate(chosen)}`} />
            <LK color="#6366f1" dash="4 4" width={1.5} label={`B payoff — ${mDate(s.payoffB)}`} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #e2e5ea", textAlign: "center" }}>
        <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 8px", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
          This tool is for educational and illustrative purposes only and does not constitute financial, tax, or investment advice. 
          All projections are hypothetical, based on the assumptions you provide, and do not account for market volatility, 
          inflation, individual tax circumstances, investment fees, or changes in tax law. Past market performance does not 
          guarantee future results. Consult a qualified financial advisor and tax professional before making financial decisions.
        </p>
        <p style={{ fontSize: 10, color: "#b0b8c8", margin: 0 }}>
          © {new Date().getFullYear()} Zach Norris. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ──

function LoanField({ label, value, onChange, prefix, suffix, step = 1 }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
      <div style={{ position: "relative" }}>
        {prefix && <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>{prefix}</span>}
        <input type="number" step={step} value={value}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) onChange(v); }}
          style={{
            width: "100%", padding: `7px ${suffix ? 28 : 10}px 7px ${prefix ? 20 : 10}px`,
            borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, fontWeight: 600,
            color: "#1e293b", background: "#fff", boxSizing: "border-box",
          }}
        />
        {suffix && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94a3b8", pointerEvents: "none" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function StratCard({ color, tag: t, time, date, rows, bonusRows, highlight }) {
  return (
    <div style={{ background: highlight ? "#f0fdf4" : "#fff", padding: "16px 14px", borderLeft: highlight ? `3px solid #16a34a` : `1px solid #eef0f4` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{t}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginBottom: 1 }}>{time}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Paid off <strong>{date}</strong></div>
      {rows.map(([label, value, muted, hl], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11.5 }}>
          <span style={{ color: "#64748b" }}>{label}</span>
          <span style={{ fontWeight: 600, color: hl ? "#16a34a" : muted ? "#b0b8c8" : "#1e293b" }}>{value}</span>
        </div>
      ))}
      {bonusRows && bonusRows.length > 0 && (
        <>
          <div style={{ borderTop: "1px dashed #e2e5ea", margin: "6px 0" }} />
          {bonusRows.map(([label, value, muted, hl], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}>
              <span style={{ color: "#94a3b8" }}>{label}</span>
              <span style={{ fontWeight: 600, color: hl ? "#16a34a" : muted ? "#b0b8c8" : "#64748b" }}>{value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MiniCard({ color, label, desc }) {
  return (
    <div style={{ background: "#fafbfc", borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, color: "#475569" }}>{desc}</p>
    </div>
  );
}

function Callout({ color, icon, title, detail }) {
  return (
    <div style={{ flex: "1 1 220px", background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #e8eaee", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 3 }}>{icon} {title}</div>
      <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}

function KT({ term, color, desc }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />
      <div style={{ fontSize: 12, lineHeight: 1.55, color: "#475569" }}><strong style={{ color: "#1e293b" }}>{term}:</strong> {desc}</div>
    </div>
  );
}

function LK({ color, dash, width: w = 2, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <svg width="28" height="12"><line x1="0" y1="6" x2="28" y2="6" stroke={color} strokeWidth={w} strokeDasharray={dash || "none"} /></svg>
      <span style={{ fontSize: 10.5, color: "#475569", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function Tip({ text, align }) {
  const [show, setShow] = useState(false);
  // align: "left" | "center" (default) | "right"
  const pos = align === "right"
    ? { right: 0, transform: "none" }
    : align === "left"
      ? { left: 0, transform: "none" }
      : { left: "50%", transform: "translateX(-50%)" };
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 3, cursor: "help", textTransform: "none" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%", background: "#e2e5ea",
        fontSize: 9, fontWeight: 700, color: "#64748b", lineHeight: 1,
      }}>?</span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", ...pos,
          background: "#1e293b", color: "#f1f5f9", fontSize: 11, lineHeight: 1.45,
          padding: "8px 10px", borderRadius: 6, width: 220, zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", pointerEvents: "none",
          textTransform: "none", fontWeight: 400, letterSpacing: "normal",
          whiteSpace: "normal", wordWrap: "break-word",
        }}>{text}</span>
      )}
    </span>
  );
}

const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" };
const sel = { width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #dde0e6", fontSize: 13, color: "#374151", background: "#fff" };