// Federal tax constants, keyed by tax year.
//
// Rates are decimals. Bracket `upTo` is the top of the band of TAXABLE income
// that the rate applies to, ascending, with the final band open-ended (null).
//
// PENDING VERIFICATION: these figures are awaiting cross-check against the
// IRS revenue procedure by the tax-table research run. Treat the 415(c) limit
// in particular as unconfirmed.

export const FEDERAL = {
  2026: {
    taxYear: 2026,

    brackets: {
      single: [
        { upTo: 12400, rate: 0.1 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      marriedJoint: [
        { upTo: 24800, rate: 0.1 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      marriedSeparate: [
        { upTo: 12400, rate: 0.1 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 384350, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
      headOfHousehold: [
        { upTo: 17700, rate: 0.1 },
        { upTo: 67450, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201750, rate: 0.24 },
        { upTo: 256200, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: null, rate: 0.37 },
      ],
    },

    standardDeduction: {
      single: 16100,
      marriedJoint: 32200,
      marriedSeparate: 16100,
      headOfHousehold: 24150,
    },

    fica: {
      socialSecurityRate: 0.062,
      socialSecurityWageBase: 184500,
      medicareRate: 0.0145,
      additionalMedicareRate: 0.009,
      // The employee's actual liability threshold varies by filing status,
      // but an employer must begin withholding at a flat wage level
      // regardless of it. That mismatch is real, not a modeling shortcut.
      additionalMedicareThresholds: {
        single: 200000,
        marriedJoint: 250000,
        marriedSeparate: 125000,
        headOfHousehold: 200000,
      },
      employerWithholdingThreshold: 200000,
    },

    retirementLimits: {
      elective402g: 24500,
      total415c: 72000,
      catchUp50: 8000,
      catchUp60to63: 11250,
      compensationLimit401a17: 360000,
    },

    supplementalWithholding: {
      flatRate: 0.22,
      highEarnerRate: 0.37,
      highEarnerThreshold: 1000000,
    },
  },
};

export const DEFAULT_TAX_YEAR = 2026;

export const AVAILABLE_TAX_YEARS = Object.keys(FEDERAL)
  .map(Number)
  .sort((a, b) => b - a);

export function federalTables(taxYear = DEFAULT_TAX_YEAR) {
  return FEDERAL[taxYear] || FEDERAL[DEFAULT_TAX_YEAR];
}
