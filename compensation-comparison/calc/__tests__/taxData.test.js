// Integrity checks on the generated tax tables.
//
// These exist because the state data is collected from many sources and
// assembled mechanically. A transposed pair of bracket bounds in the
// California head-of-household table reached the repository once; this suite
// is what catches that class of defect.

import { describe, it, expect } from "vitest";
import { STATES, ALL_STATE_CODES, AVAILABLE_STATE_CODES, hasStateData } from "../data/states.js";
import { FEDERAL, AVAILABLE_TAX_YEARS } from "../data/federal.js";

const STATUSES = ["single", "marriedJoint", "marriedSeparate", "headOfHousehold"];

function bracketTables(table) {
  return STATUSES.filter((s) => table.brackets?.[s]).map((s) => [s, table.brackets[s]]);
}

describe("federal tables", () => {
  it.each(AVAILABLE_TAX_YEARS)("%i has a table for every filing status", (year) => {
    for (const status of STATUSES) {
      expect(FEDERAL[year].brackets[status], status).toBeDefined();
      expect(FEDERAL[year].standardDeduction[status], status).toBeGreaterThan(0);
    }
  });

  it.each(AVAILABLE_TAX_YEARS)("%i brackets ascend and end open-ended", (year) => {
    for (const status of STATUSES) {
      const rows = FEDERAL[year].brackets[status];
      let prev = -Infinity;
      for (const row of rows) {
        const bound = row.upTo == null ? Infinity : row.upTo;
        expect(bound, `${status} bound after ${prev}`).toBeGreaterThan(prev);
        prev = bound;
      }
      expect(rows[rows.length - 1].upTo).toBeNull();
    }
  });

  it.each(AVAILABLE_TAX_YEARS)("%i rates are decimals below 1 and non-decreasing", (year) => {
    for (const status of STATUSES) {
      const rates = FEDERAL[year].brackets[status].map((r) => r.rate);
      for (const rate of rates) {
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThan(1);
      }
      expect([...rates].sort((a, b) => a - b)).toEqual(rates);
    }
  });

  it.each(AVAILABLE_TAX_YEARS)("%i FICA constants are sane", (year) => {
    const { fica } = FEDERAL[year];
    expect(fica.socialSecurityRate).toBeCloseTo(0.062, 5);
    expect(fica.medicareRate).toBeCloseTo(0.0145, 5);
    expect(fica.socialSecurityWageBase).toBeGreaterThan(100000);
    expect(fica.additionalMedicareThresholds.marriedJoint).toBeGreaterThan(
      fica.additionalMedicareThresholds.marriedSeparate,
    );
  });
});

describe("state tables", () => {
  const codes = Object.keys(STATES);

  it("uses only real postal codes", () => {
    for (const code of codes) expect(ALL_STATE_CODES).toContain(code);
  });

  it("covers all 50 states plus DC", () => {
    const missing = ALL_STATE_CODES.filter((c) => !hasStateData(c));
    expect(missing).toEqual([]);
    expect(codes).toHaveLength(51);
  });

  it("exposes exactly the codes it holds", () => {
    expect(AVAILABLE_STATE_CODES.sort()).toEqual(codes.sort());
  });

  it.each(codes)("%s declares a supported kind", (code) => {
    expect(["none", "flat", "progressive"]).toContain(STATES[code].kind);
  });

  it.each(codes)("%s has the fields its kind requires", (code) => {
    const table = STATES[code];
    if (table.kind === "flat") {
      expect(table.flatRate).toBeGreaterThan(0);
      expect(table.flatRate).toBeLessThan(1);
    }
    if (table.kind === "progressive") {
      expect(table.brackets).toBeDefined();
      expect(bracketTables(table).length).toBeGreaterThan(0);
    }
    if (table.kind === "none") {
      expect(table.flatRate).toBeUndefined();
      expect(table.brackets).toBeUndefined();
    }
  });

  it.each(codes)("%s bracket bounds strictly ascend and end open-ended", (code) => {
    for (const [status, rows] of bracketTables(STATES[code])) {
      let prev = -Infinity;
      for (const [i, row] of rows.entries()) {
        const bound = row.upTo == null ? Infinity : row.upTo;
        expect(bound, `${code}.${status}[${i}] after ${prev}`).toBeGreaterThan(prev);
        prev = bound;
      }
      expect(rows[rows.length - 1].upTo, `${code}.${status} final band`).toBeNull();
    }
  });

  it.each(codes)("%s rates are decimals below 1", (code) => {
    for (const [status, rows] of bracketTables(STATES[code])) {
      for (const [i, row] of rows.entries()) {
        expect(row.rate, `${code}.${status}[${i}]`).toBeGreaterThanOrEqual(0);
        expect(row.rate, `${code}.${status}[${i}]`).toBeLessThan(1);
      }
    }
  });

  it.each(codes)("%s payroll program rates are decimals below 1", (code) => {
    for (const program of STATES[code].payrollPrograms || []) {
      expect(program.rate, `${code} ${program.name}`).toBeGreaterThan(0);
      expect(program.rate, `${code} ${program.name}`).toBeLessThan(1);
    }
  });

  it("classifies the no-wage-tax states correctly", () => {
    for (const code of ["AK", "FL", "NV", "SD", "TN", "TX", "WA", "WY"]) {
      expect(STATES[code]?.kind, code).toBe("none");
    }
  });

  it("keeps California's uncapped disability deduction", () => {
    const sdi = STATES.CA.payrollPrograms.find((p) => p.name.includes("SDI"));
    expect(sdi).toBeDefined();
    expect(sdi.wageBase).toBeNull();
    expect(sdi.rate).toBeCloseTo(0.013, 5);
  });

  it("reports an absent jurisdiction as absent rather than untaxed", () => {
    const absent = ALL_STATE_CODES.filter((c) => !hasStateData(c));
    for (const code of absent) expect(STATES[code]).toBeUndefined();
  });
});
