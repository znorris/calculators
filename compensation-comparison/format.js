// Presentation formatting. This is the only layer that rounds; the
// calculation layer keeps full precision throughout.

const WHOLE_DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole dollars. Precision is bounded and constant, signaling an estimate. */
export function money(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return WHOLE_DOLLARS.format(value);
}

/** Dollars and cents, for per-paycheck figures where the cents matter. */
export function moneyExact(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return CENTS.format(value);
}

/** A signed delta, always carrying its sign so direction is unambiguous. */
export function signedMoney(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${WHOLE_DOLLARS.format(Math.abs(value))}`;
}

/** A decimal rate rendered as a percentage. 0.0495 becomes "4.95%". */
export function percent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${(Math.abs(value) * 100).toFixed(digits)}%`;
}

export function ordinal(n) {
  const suffix = ["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th";
  return `${n}${suffix}`;
}

/** Parse a user-typed money or number string, tolerating commas and symbols. */
export function parseNumeric(input) {
  if (input === "" || input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
