// Single source of glossary entries for this calculator, used by both
// App.jsx and assumptions/App.jsx (each wraps its own tree in
// shared/Term.jsx's GlossaryProvider with GLOSSARY_BY_ID below) and by the
// glossary table on the assumptions page (rendered straight from GLOSSARY,
// one row per entry, in the order below).
//
// Each entry is { id, acronym, expansion, definition, whyItMatters }.
// `acronym`/`expansion` are null for the two entries that are a plain phrase
// rather than a shortened form (discount rate, payback); shared/Term.jsx
// skips the bold expansion line in that case and shows only the definition
// and whyItMatters. `id` is what every <Term id="..."> in this calculator's
// source tree references; energy-system-comparison/__tests__/glossary
// -completeness.test.js greps the tree for those ids and asserts every one
// resolves here.

export const GLOSSARY = [
  {
    id: "npv",
    acronym: "NPV",
    expansion: "net present value",
    definition:
      "A dollar arriving years from now is worth less than a dollar today, because today's dollar could grow at " +
      "your discount rate in the meantime. NPV shrinks each year's cost and saving into today's dollars " +
      "accordingly, then adds them all up into one number.",
    whyItMatters:
      "Positive means buying the system leaves you wealthier than keeping the money invested at your discount " +
      "rate, and by that many of today's dollars. Negative means the alternative investment wins.",
  },
  {
    id: "irr",
    acronym: "IRR",
    expansion: "internal rate of return",
    definition:
      "The earning rate at which the system exactly ties your alternative: the discount rate that would put its " +
      "NPV at zero.",
    whyItMatters:
      "If the IRR beats the return you expect your money to earn elsewhere, the system wins; if it trails, " +
      "keeping the money invested wins.",
  },
  {
    id: "discount-rate",
    acronym: null,
    expansion: null,
    definition:
      "The yearly return your money would earn in its next-best use, such as an index fund or paying down a " +
      "loan.",
    whyItMatters:
      "It sets how heavily future savings shrink when converted into today's dollars: the higher the rate, the " +
      "less a distant dollar counts.",
  },
  {
    id: "payback",
    acronym: null,
    expansion: null,
    definition: "The year the system's cumulative savings first cover its cost and stay positive.",
    whyItMatters:
      "The simplest risk measure: how long your money is committed before the system has paid for itself.",
  },
  {
    id: "upfront-cost",
    acronym: null,
    expansion: null,
    definition:
      "The total paid at the start: equipment and installation plus the interconnection fee, minus any incentives " +
      "entered. For a loan it is the down payment, with the rest arriving as monthly payments over the term.",
    whyItMatters:
      "This is the amount at risk while savings accumulate; every other metric describes how and when it comes " +
      "back.",
  },
  {
    id: "year1-savings",
    acronym: null,
    expansion: null,
    definition:
      "The first year's utility bill without the system minus the first year's bill with it, including export " +
      "credits.",
    whyItMatters:
      "The most concrete near-term number: what actually changes on next year's bills, before degradation or rate " +
      "changes compound.",
  },
  {
    id: "lifetime-savings",
    acronym: null,
    expansion: null,
    definition:
      "Where your wallet stands at the end of your horizon versus doing nothing: every year's bill savings added " +
      "up, minus the upfront cost, loan payments, maintenance, and replacements, all in raw dollars.",
    whyItMatters:
      "The face-value bottom line. Compare it with NPV, which shrinks distant dollars to reflect what the money " +
      "could earn elsewhere; healthy lifetime savings with negative NPV means the raw sum wins but the alternative " +
      "investment wins after timing is accounted for.",
  },
  {
    id: "self-consumption",
    acronym: null,
    expansion: null,
    definition: "The share of the system's production that serves your own load instead of exporting to the grid.",
    whyItMatters:
      "A self-consumed kWh is worth your full retail rate, while an exported one earns your utility's export " +
      "credit, often several times less, so this single ratio drives most of the economics.",
  },
  {
    id: "year1-production",
    acronym: null,
    expansion: null,
    definition: "The energy the system generates in its first year, before panel degradation reduces later years.",
    whyItMatters:
      "The physical basis of every dollar figure; compare it against annual usage, since a utility with a size " +
      "cap (LEU included) may reject a system sized above your trailing 12-month consumption.",
  },
  {
    id: "standalone-payback",
    acronym: null,
    expansion: null,
    definition:
      "A component's own payback: the years until the extra savings it adds on top of the rest of the " +
      "configuration cover its own added cost.",
    whyItMatters: "It answers whether the battery or turbine earns its place, separately from whether the whole system does.",
  },
  {
    id: "added-cost",
    acronym: null,
    expansion: null,
    definition:
      "The cost of adding this one component, its equipment and installation, on top of the configuration's other " +
      "parts, before incentives or fees.",
    whyItMatters: "Paired with the added savings, it isolates whether this component earns its own place in the configuration.",
  },
  {
    id: "added-annual-savings",
    acronym: null,
    expansion: null,
    definition:
      "The extra bill savings per year this component produces beyond what the configuration achieves without it, " +
      "averaged over your horizon and net of the component's own maintenance cost.",
    whyItMatters:
      "A battery's value is only the exports it shifts and the peaks it shaves; this separates that contribution " +
      "from the solar's.",
  },
  {
    id: "cumulative-cash-flow",
    acronym: null,
    expansion: null,
    definition:
      "Your running money position versus doing nothing: each year's bill savings minus that year's costs, " +
      "totaled from purchase day onward.",
    whyItMatters:
      "Where a line crosses zero is that configuration's payback year; where two lines cross, one overtakes the " +
      "other.",
  },
  {
    id: "tou",
    acronym: "TOU",
    expansion: "time-of-use",
    definition:
      "A rate design where the price per kWh depends on the hour and day, typically highest on summer evenings.",
    whyItMatters: "It determines whether shifting usage, or battery discharge, into expensive hours saves money.",
  },
  {
    id: "eca",
    acronym: "ECA",
    expansion: "Energy Cost Adjustment",
    definition:
      "A per-kWh charge Lodi Electric recalculates monthly from its wholesale power costs and adds on top of base " +
      "rates.",
    whyItMatters:
      "It adds roughly two to six cents per kWh, so ignoring it understates both your bill and the value of " +
      "self-consumed solar.",
  },
  {
    id: "ep",
    acronym: "EP",
    expansion: "Schedule EP (Energy Purchase)",
    definition:
      "Lodi Electric's program for new solar customers: imports are billed in full at retail rates, and exported " +
      "energy earns a flat credit that resets each July 1.",
    whyItMatters:
      "The gap between retail rates and the EP credit is why self-consuming solar is worth several times more " +
      "than exporting it in Lodi.",
  },
  {
    id: "nem",
    acronym: "NEM",
    expansion: "net energy metering",
    definition: "A billing arrangement where energy you export offsets energy you import, historically close to one-to-one at retail rates.",
    whyItMatters:
      "Lodi closed NEM to new customers in 2017; it still matters for grandfathered systems and for other " +
      "utilities' rules.",
  },
  {
    id: "soc",
    acronym: "SoC",
    expansion: "state of charge",
    definition: "How full the battery is at a given moment, as a fraction of its usable capacity.",
    whyItMatters: "Charge limits, reserve floors, and dispatch decisions are all expressed against it.",
  },
  {
    id: "kw",
    acronym: "kW",
    expansion: "kilowatt",
    definition: "A rate of energy flow: power.",
    whyItMatters: "Demand charges, charge and discharge limits, and peak loads are measured in kW.",
  },
  {
    id: "kwh",
    acronym: "kWh",
    expansion: "kilowatt-hour",
    definition: "An amount of energy: one kilowatt flowing for one hour.",
    whyItMatters: "Energy charges on your bill, your usage, and battery capacity are measured in kWh.",
  },
  {
    id: "kw-dc",
    acronym: "kW-DC",
    expansion: "kilowatts, direct current",
    definition: "A solar array's nameplate rating measured at the panels' DC output, before inverter conversion.",
    whyItMatters: "Panel systems are sized and priced in kW-DC; actual AC output is lower.",
  },
  {
    id: "pv",
    acronym: "PV",
    expansion: "photovoltaic",
    definition: "Solar panels that convert sunlight directly into electricity.",
    whyItMatters: "Distinguishes solar electric systems from solar water heating.",
  },
  {
    id: "ev",
    acronym: "EV",
    expansion: "electric vehicle",
    definition: "A vehicle charged from the grid, treated here as a distinct household load.",
    whyItMatters:
      "Its charging schedule changes which hours your load lands in, and whether a separately metered EV rate " +
      "(like LEU's) helps.",
  },
  {
    id: "leu",
    acronym: "LEU",
    expansion: "Lodi Electric Utility",
    definition:
      "The City of Lodi's municipal electric utility, governed by the city council rather than the state's " +
      "utility commission.",
    whyItMatters:
      "Its rules differ sharply from PG&E's: flat tiered rates, no net metering for new solar, and its own export " +
      "credit.",
  },
  {
    id: "apr",
    acronym: "APR",
    expansion: "annual percentage rate",
    definition: "The yearly interest rate on a loan, including compounding as charged monthly.",
    whyItMatters: "It sets the true cost of financing a system instead of paying cash.",
  },
  {
    id: "itc",
    acronym: "ITC",
    expansion: "investment tax credit",
    definition:
      "The federal tax credit for energy property. The residential version ended for systems placed in service " +
      "after December 31, 2025.",
    whyItMatters:
      "In 2026 a cash or loan purchase gets no federal credit; only third-party-owned systems can still capture " +
      "one.",
  },
  {
    id: "om",
    acronym: "O&M",
    expansion: "operations and maintenance",
    definition: "Recurring costs of owning the system: cleaning, monitoring, repairs, and eventual part replacements.",
    whyItMatters: "Small yearly amounts compound over 25 years and belong in any honest payback math.",
  },
  {
    id: "tmy",
    acronym: "TMY",
    expansion: "typical meteorological year",
    definition:
      "A synthetic weather year assembled from decades of measurements to represent typical conditions at a " +
      "location.",
    whyItMatters: "Production estimates use TMY data, so results represent a typical year rather than any specific one.",
  },
  {
    id: "ac",
    acronym: "AC",
    expansion: "alternating current",
    definition: "The form of electricity the grid and your home circuits carry.",
    whyItMatters: "Inverter output, battery delivery, and everything your meter sees are AC.",
  },
  {
    id: "dc",
    acronym: "DC",
    expansion: "direct current",
    definition: "The form of electricity panels produce and batteries store internally.",
    whyItMatters: "Conversion between DC and AC loses a few percent each way, which the model accounts for.",
  },
];

export const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((entry) => [entry.id, entry]));
