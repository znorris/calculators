// Declarative field schema for an offer.
//
// This is the single source of truth for the offer record. The input UI, the
// default values, the URL codec, and validation all derive from it, so adding
// a field means editing this file and nothing else.
//
// Sections map one-to-one onto the collapsible containers in an offer column.
// Every section renders on every offer regardless of whether it holds data;
// a section collapses to its header rather than disappearing.

/**
 * Field types:
 *   text     free string, not used in any calculation
 *   money    dollar amount, stored as a Number in dollars
 *   percent  stored as a decimal (0.04 means 4%), entered by the user as 4
 *   int      whole number
 *   enum     one of `options`
 *   bool     checkbox
 *   list     repeating group of sub-records, shape given by `itemFields`
 */

export const FILING_STATUSES = [
  { value: "single", label: "Single" },
  { value: "marriedJoint", label: "Married filing jointly" },
  { value: "marriedSeparate", label: "Married filing separately" },
  { value: "headOfHousehold", label: "Head of household" },
];

export const PAY_FREQUENCIES = [
  { value: 52, label: "Weekly (52)" },
  { value: 26, label: "Biweekly (26)" },
  { value: 24, label: "Semi-monthly (24)" },
  { value: 12, label: "Monthly (12)" },
];

export const BONUS_RECURRENCE = [
  { value: "annual", label: "Every year" },
  { value: "oneTime", label: "One time" },
];

export const CITY_TAX_BASES = [
  { value: "gross", label: "Gross wages" },
  { value: "taxable", label: "Income after deductions" },
];

/** Sections in render order. */
export const SECTIONS = [
  {
    id: "identity",
    label: "Offer",
    alwaysOpen: true,
    fields: [
      { id: "name", type: "text", label: "Employer", default: "", placeholder: "Acme Corp" },
      { id: "roleTitle", type: "text", label: "Role", default: "", placeholder: "Staff Engineer" },
    ],
  },

  {
    id: "basePay",
    label: "Base pay",
    alwaysOpen: true,
    fields: [
      {
        id: "payType",
        type: "enum",
        label: "Paid as",
        default: "salary",
        options: [
          { value: "salary", label: "Salary" },
          { value: "hourly", label: "Hourly" },
        ],
      },
      {
        id: "annualSalary",
        type: "money",
        label: "Annual salary",
        default: 0,
        showIf: (o) => o.payType === "salary",
      },
      {
        id: "ftePercent",
        type: "percent",
        label: "Percent of full time",
        default: 1,
        help: "Use for part-time or a partial year. 100% for a normal full-time role.",
        showIf: (o) => o.payType === "salary",
      },
      {
        id: "hourlyRate",
        type: "money",
        label: "Hourly rate",
        default: 0,
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "hoursPerWeek",
        type: "int",
        label: "Hours per week",
        default: 40,
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "weeksPerYear",
        type: "int",
        label: "Weeks worked per year",
        default: 52,
        help: "Lower this for seasonal work.",
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "overtimeMultiplier",
        type: "percent",
        label: "Overtime multiplier",
        default: 1.5,
        help: "1.5 means time and a half.",
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "overtimeHoursPerWeek",
        type: "int",
        label: "Overtime hours per week",
        default: 0,
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "shiftDifferentialRate",
        type: "money",
        label: "Shift differential per hour",
        default: 0,
        help: "Extra per hour for night, weekend, or holiday shifts.",
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "shiftDifferentialHours",
        type: "int",
        label: "Differential hours per week",
        default: 0,
        showIf: (o) => o.payType === "hourly",
      },
      {
        id: "payFrequency",
        type: "enum",
        label: "Paycheck frequency",
        default: 24,
        options: PAY_FREQUENCIES,
      },
      {
        id: "annualRaiseRate",
        type: "percent",
        label: "Expected annual raise",
        default: 0.03,
        help: "Compounds each year of the horizon. Employers differ, so this sits on the offer.",
      },
    ],
  },

  {
    id: "bonuses",
    label: "Bonuses",
    fields: [
      {
        id: "bonuses",
        type: "list",
        label: "Bonus line items",
        default: [],
        addLabel: "Add bonus",
        itemFields: [
          { id: "label", type: "text", label: "Name", default: "", placeholder: "Signing bonus" },
          {
            id: "basis",
            type: "enum",
            label: "Entered as",
            default: "amount",
            options: [
              { value: "amount", label: "Dollar amount" },
              { value: "percentOfBase", label: "Percent of base" },
            ],
          },
          { id: "amount", type: "money", label: "Amount", default: 0, showIf: (b) => b.basis === "amount" },
          { id: "percent", type: "percent", label: "Percent of base", default: 0, showIf: (b) => b.basis === "percentOfBase" },
          { id: "recurrence", type: "enum", label: "Frequency", default: "annual", options: BONUS_RECURRENCE },
          { id: "year", type: "int", label: "Paid in year", default: 1, showIf: (b) => b.recurrence === "oneTime" },
          {
            id: "clawbackYears",
            type: "int",
            label: "Clawback window (years)",
            default: 0,
            help: "Repayable if you leave within this many years. Used by the exit-year table.",
            showIf: (b) => b.recurrence === "oneTime",
          },
          {
            id: "realizationRate",
            type: "percent",
            label: "Typically paid at",
            default: 1,
            help: "A target bonus that historically pays out at 80% should be entered as 80%.",
            showIf: (b) => b.recurrence === "annual",
          },
        ],
      },
    ],
  },

  {
    id: "location",
    label: "Location and tax",
    fields: [
      {
        id: "state",
        type: "enum",
        label: "State",
        default: "",
        optionsFrom: "states",
        help: "Drives state income tax and any state disability or paid-leave deduction.",
      },
      { id: "cityTaxRate", type: "percent", label: "City tax rate", default: null, help: "Leave blank if none." },
      { id: "cityTaxBase", type: "enum", label: "City tax applies to", default: "gross", options: CITY_TAX_BASES },
    ],
  },

  {
    id: "retirement",
    label: "Retirement",
    fields: [
      { id: "retirementOffered", type: "bool", label: "Employer offers a plan", default: true },
      {
        id: "retirementEligibilityMonths",
        type: "int",
        label: "Months until eligible",
        default: 0,
        showIf: (o) => o.retirementOffered,
      },
      {
        id: "employeeDeferralRate",
        type: "percent",
        label: "Your contribution",
        default: 0,
        showIf: (o) => o.retirementOffered,
      },
      {
        id: "deferralType",
        type: "enum",
        label: "Contribution type",
        default: "traditional",
        options: [
          { value: "traditional", label: "Traditional (pre-tax)" },
          { value: "roth", label: "Roth (after-tax)" },
        ],
        help: "Traditional lowers income tax but not Social Security or Medicare tax. Roth lowers neither.",
        showIf: (o) => o.retirementOffered,
      },
      {
        id: "employerMatchRate",
        type: "percent",
        label: "Employer match",
        default: 0,
        showIf: (o) => o.retirementOffered,
      },
      {
        id: "employerMatchCapPercent",
        type: "percent",
        label: "Match capped at",
        default: 0,
        help: "As a percent of salary. Leave at 0 for no cap.",
        showIf: (o) => o.retirementOffered,
      },
      {
        id: "matchVestingYears",
        type: "int",
        label: "Match vesting (years)",
        default: 0,
        help: "Years of service before the employer match is fully yours. Used by the exit-year table.",
        showIf: (o) => o.retirementOffered,
      },
    ],
  },
];

/** Every section id, in render order. */
export const SECTION_IDS = SECTIONS.map((s) => s.id);

/** Flat list of top-level field descriptors across all sections. */
export const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

/** Look up a field descriptor by id. */
export function fieldById(id) {
  return ALL_FIELDS.find((f) => f.id === id) || null;
}

/** Section a given field belongs to. */
export function sectionForField(id) {
  return SECTIONS.find((s) => s.fields.some((f) => f.id === id)) || null;
}

/**
 * Whether a field should render, given the current offer values. Fields
 * without a `showIf` always render.
 */
export function isFieldVisible(field, values) {
  return typeof field.showIf === "function" ? !!field.showIf(values) : true;
}
