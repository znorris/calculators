// Generates ../states.js from the collected tax data in ./sources.
//
//   node compensation-comparison/calc/data/generate/generate.mjs
//
// Reads every .json file in ./sources in filename order, so a later file
// overrides an earlier one on the same jurisdiction. Pass explicit paths to
// use a different set.
//
// Validation is fatal. A bracket table that is not strictly ascending, or one
// lacking an open-ended final band, aborts the write rather than shipping. A
// transposed pair of California bracket bounds reached the repository once,
// which is why this refuses rather than warns.
//
// `states.js` is committed, so the calculator does not depend on this script.
// It exists so the tables can be rebuilt when the tax year turns over.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(HERE, "sources");
const OUT = join(HERE, "..", "states.js");

const ALL_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

const STATUSES = ["single", "marriedJoint", "marriedSeparate", "headOfHousehold"];

/** Corrections applied on top of the collected data, with the reason recorded. */
const CORRECTIONS = {
  CA: (rec) => {
    // The verifier found the head-of-household table had two bounds
    // transposed: 1010435 at 11.3% followed by 1000000 at 12.3%. Both bands
    // are real. The 1% Mental Health Services Act surcharge starts at
    // $1,000,000 while the 12.3% bracket starts at $1,010,435, so income
    // between them is taxed at 11.3% plus the surcharge, and above it at
    // 12.3% plus the surcharge. The fix is to swap the two bounds, not to
    // drop a band, which would skip the 12.3% rate entirely.
    const rows = rec.brackets?.headOfHousehold;
    if (rows) {
      for (let i = 1; i < rows.length; i += 1) {
        const prev = rows[i - 1].upTo;
        const here = rows[i].upTo;
        if (prev != null && here != null && here < prev) {
          rows[i - 1].upTo = here;
          rows[i].upTo = prev;
        }
      }
    }
    // The verifier also found CA had no payrollPrograms entry despite SDI
    // being uncapped at 1.3% since 2024.
    if (!rec.payrollPrograms?.length) {
      rec.payrollPrograms = [{ name: "SDI and PFL", rate: 0.013, wageBase: null }];
    }
    rec.notes = [
      rec.notes,
      "A 1% Mental Health Services Act surcharge applies above $1,000,000 and is not in the bracket table.",
      "SDI is uncapped. 2026 dollar thresholds are not confirmed against a primary FTB page.",
    ]
      .filter(Boolean)
      .join(" ");
    return rec;
  },
  NH: (rec) => {
    rec.kind = "none";
    rec.notes =
      "The interest and dividends tax was repealed effective tax year 2025, so there is no personal income tax at all for 2026.";
    return rec;
  },
};

function validate(code, rec, errors) {
  if (!rec.kind) errors.push(`${code}: missing kind`);
  if (rec.kind === "flat" && !(rec.flatRate > 0)) errors.push(`${code}: flat with no rate`);
  if (rec.kind === "progressive" && !rec.brackets) errors.push(`${code}: progressive with no brackets`);

  for (const status of STATUSES) {
    const rows = rec.brackets?.[status];
    if (!rows) continue;
    if (rows.length === 0) {
      errors.push(`${code}.${status}: empty table`);
      continue;
    }
    let prev = -Infinity;
    for (const [i, row] of rows.entries()) {
      if (!(row.rate >= 0 && row.rate < 1)) {
        errors.push(`${code}.${status}[${i}]: rate ${row.rate} is not a decimal below 1`);
      }
      const bound = row.upTo == null ? Infinity : row.upTo;
      if (bound <= prev) {
        errors.push(`${code}.${status}[${i}]: upTo ${row.upTo} does not exceed the previous ${prev}`);
      }
      prev = bound;
    }
    if (rows[rows.length - 1].upTo != null) {
      errors.push(`${code}.${status}: final band is not open-ended`);
    }
  }

  for (const program of rec.payrollPrograms || []) {
    if (!(program.rate > 0 && program.rate < 1)) {
      errors.push(`${code}: payroll program "${program.name}" rate ${program.rate} is not a decimal below 1`);
    }
  }
}

function serializeBrackets(rows, indent) {
  const pad = " ".repeat(indent);
  const inner = rows
    .map((r) => `${pad}  { upTo: ${r.upTo == null ? "null" : r.upTo}, rate: ${r.rate} },`)
    .join("\n");
  return `[\n${inner}\n${pad}]`;
}

function serializeRecord(code, rec) {
  const lines = [`  ${code}: {`, `    name: ${JSON.stringify(rec.name)},`, `    kind: ${JSON.stringify(rec.kind)},`];

  if (rec.kind === "flat") lines.push(`    flatRate: ${rec.flatRate},`);

  if (rec.brackets && rec.kind === "progressive") {
    lines.push("    brackets: {");
    for (const status of STATUSES) {
      const rows = rec.brackets[status];
      if (!rows) continue;
      lines.push(`      ${status}: ${serializeBrackets(rows, 6)},`);
    }
    lines.push("    },");
  }

  if (rec.standardDeduction && Object.keys(rec.standardDeduction).length) {
    const parts = STATUSES.filter((s) => rec.standardDeduction[s] != null)
      .map((s) => `${s}: ${rec.standardDeduction[s]}`)
      .join(", ");
    if (parts) lines.push(`    standardDeduction: { ${parts} },`);
  }

  if (rec.payrollPrograms?.length) {
    lines.push("    payrollPrograms: [");
    for (const p of rec.payrollPrograms) {
      lines.push(
        `      { name: ${JSON.stringify(p.name)}, rate: ${p.rate}, wageBase: ${p.wageBase == null ? "null" : p.wageBase} },`,
      );
    }
    lines.push("    ],");
  }

  lines.push(`    confidence: ${JSON.stringify(rec.confidence || "probable")},`);
  if (rec.notes) lines.push(`    notes: ${JSON.stringify(rec.notes)},`);
  if (rec.sources?.length) lines.push(`    source: ${JSON.stringify(rec.sources[0])},`);
  lines.push("  },");
  return lines.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────
const explicit = process.argv.slice(2);
const files = explicit.length
  ? explicit
  : readdirSync(SOURCES)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(SOURCES, f));

if (files.length === 0) {
  console.error(`no source files in ${SOURCES}`);
  process.exit(1);
}

/** Accept either a raw workflow result or an extracted source file. */
function jurisdictionsIn(parsed) {
  return parsed.states || parsed.jurisdictions || parsed.result?.states || parsed.result?.jurisdictions || [];
}

const byCode = {};
for (const file of files) {
  const list = jurisdictionsIn(JSON.parse(readFileSync(file, "utf8")));
  for (const rec of list) byCode[rec.code] = rec;
  console.log(`${file.replace(HERE, ".")}: ${list.length} records`);
}

for (const [code, fn] of Object.entries(CORRECTIONS)) {
  if (byCode[code]) byCode[code] = fn(byCode[code]);
}

const errors = [];
for (const [code, rec] of Object.entries(byCode)) validate(code, rec, errors);

if (errors.length) {
  console.error("\nVALIDATION FAILED:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

const present = Object.keys(byCode).sort();
const missing = ALL_CODES.filter((c) => !byCode[c]);

const body = present.map((code) => serializeRecord(code, byCode[code])).join("\n\n");

const header = `// State income tax, one entry per jurisdiction. GENERATED FILE.
//
// \`kind\` selects how the rate is applied:
//   none         no tax on wage income
//   flat         one rate on state taxable income
//   progressive  bracket table per filing status
//
// \`payrollPrograms\` are employee-side deductions that are not income tax:
// state disability and paid family leave. They are flat rates, so they cost
// one line each and need no extra input. A null wageBase means uncapped.
//
// \`confidence\` records how the figure was obtained. "verified" means it was
// read off a state revenue department page; "probable" means it came from a
// secondary source or a prior tax year carried forward, with the reason in
// \`notes\`. Anything marked probable is worth re-checking before relying on it.
//
// Coverage: ${present.length} of 51 jurisdictions.${missing.length ? ` Missing: ${missing.join(", ")}.` : ""}
// A jurisdiction with no entry resolves to null and is reported as unavailable
// rather than taxed at zero, which would make a high-tax state look free.
`;

const footer = `
/** Postal codes with data. */
export const AVAILABLE_STATE_CODES = Object.keys(STATES).sort();

/** Every US jurisdiction, so the picker can show which ones lack data. */
export const ALL_STATE_CODES = ${JSON.stringify(ALL_CODES, null, 2).replace(/\n/g, "\n")};

export function stateTable(code) {
  return STATES[code] || null;
}

export function hasStateData(code) {
  return Boolean(STATES[code]);
}
`;

writeFileSync(OUT, `${header}\nexport const STATES = {\n${body}\n};\n${footer}`);

console.log(`\nwrote ${present.length} jurisdictions to states.js`);
if (missing.length) console.log(`missing ${missing.length}: ${missing.join(", ")}`);
const probable = present.filter((c) => (byCode[c].confidence || "probable") !== "verified");
console.log(`confidence: ${present.length - probable.length} verified, ${probable.length} probable`);
