// Progressive bracket arithmetic, shared by federal and state tax.
//
// A bracket table is an ascending array of `{ upTo, rate }`. `upTo` is the top
// of the band of taxable income that `rate` applies to; the final entry uses
// null for no upper bound. Each rate applies only to the slice of income
// inside its own band, which is what separates a marginal rate from an
// effective one.

/** Tax owed on `taxableIncome` under a bracket table. */
export function taxFromBrackets(taxableIncome, brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) return 0;
  const income = Math.max(0, taxableIncome);
  let owed = 0;
  let floor = 0;
  for (const band of brackets) {
    const ceiling = band.upTo == null ? Infinity : band.upTo;
    if (income <= floor) break;
    owed += (Math.min(income, ceiling) - floor) * band.rate;
    floor = ceiling;
  }
  return owed;
}

/** The rate the next dollar of income would be taxed at. */
export function marginalRateFromBrackets(taxableIncome, brackets) {
  if (!Array.isArray(brackets) || brackets.length === 0) return 0;
  const income = Math.max(0, taxableIncome);
  for (const band of brackets) {
    if (band.upTo == null || income < band.upTo) return band.rate;
  }
  return brackets[brackets.length - 1].rate;
}

/**
 * Pick the bracket array for a filing status, falling back to single.
 *
 * Several states publish one table used by more than one status, so a missing
 * entry means "same as single" rather than "no tax".
 */
export function bracketsFor(table, filingStatus) {
  if (!table) return null;
  return table[filingStatus] || table.single || null;
}

/** Effective rate, guarding the zero-income case. */
export function effectiveRate(tax, income) {
  return income > 0 ? tax / income : 0;
}
