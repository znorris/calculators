// Shared "paste a row of N numbers" parser, used by every monthly/hourly
// value-entry UI in this calculator: UsageInput.jsx's monthly and hourly
// usage modes, and HouseholdSection.jsx's monthly-table export-rate and
// adder editors. One implementation, so pasting a comma/tab/newline-
// separated row of numbers behaves identically everywhere it's offered.

/**
 * Splits on commas, tabs, or newlines; a single line is treated as one
 * comma-separated row, multiple lines as one value per line (tolerating a
 * trailing "hour,value" second column by keeping only the last token per
 * line).
 */
export function parseSeries(text, expectedLength) {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const tokens =
    rawLines.length > 1
      ? rawLines.map((line) => {
          const parts = line.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
          return parts[parts.length - 1] ?? "";
        })
      : (rawLines[0] || "").split(/[,\t]+/).map((t) => t.trim()).filter((t) => t.length > 0);

  const values = new Array(tokens.length);
  const failedRows = [];
  tokens.forEach((tok, i) => {
    const n = Number(tok);
    if (!Number.isFinite(n)) {
      failedRows.push(i + 1);
      values[i] = 0;
    } else {
      values[i] = n;
    }
  });

  return { values, count: tokens.length, failedRows, lengthOk: expectedLength == null || tokens.length === expectedLength };
}
