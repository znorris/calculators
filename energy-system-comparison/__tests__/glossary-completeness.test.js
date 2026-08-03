// Static completeness check: every <Term id="..."> literal in this
// calculator's source tree must resolve in glossary.js, so a typo'd id
// doesn't silently render as plain, un-tooltipped text (see shared/Term.jsx's
// header for why a missing id fails soft rather than throwing at render
// time -- this test is what actually catches the typo).
//
// This only checks the one direction (every used id exists in the
// glossary), not the reverse: a glossary entry with no <Term> user anywhere
// would still be fine, since the glossary table on the assumptions page
// (see assumptions/App.jsx) renders every entry regardless of whether any
// <Term> in the app links to it.
//
// ComparisonTable.jsx's row descriptors reference a glossary id through a
// `termId` field instead of a literal <Term id="..."> (the id is threaded
// into <Term id={row.termId}>), so this test also greps for that pattern
// directly rather than trying to statically evaluate JSX prop expressions.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GLOSSARY, GLOSSARY_BY_ID } from "../glossary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE_EXTENSIONS = new Set([".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "__tests__", "data"]);

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function findTermIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(/<Term\s+id="([a-zA-Z0-9_-]+)"/g)) ids.add(m[1]);
  for (const m of text.matchAll(/\btermId:\s*"([a-zA-Z0-9_-]+)"/g)) ids.add(m[1]);
  return ids;
}

describe("glossary completeness", () => {
  const files = collectSourceFiles(ROOT);
  const usedIds = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const id of findTermIds(text)) usedIds.add(id);
  }

  it("finds at least one <Term>/termId usage (the source tree actually adopted the glossary)", () => {
    expect(usedIds.size).toBeGreaterThan(0);
  });

  it("every <Term id=\"...\"> and termId used in the source tree resolves in glossary.js", () => {
    const missing = [...usedIds].filter((id) => !(id in GLOSSARY_BY_ID));
    expect(missing).toEqual([]);
  });

  it("every glossary entry has a non-empty definition and whyItMatters", () => {
    const incomplete = GLOSSARY.filter((entry) => !entry.definition?.trim() || !entry.whyItMatters?.trim()).map(
      (entry) => entry.id,
    );
    expect(incomplete).toEqual([]);
  });

  it("every glossary entry has both acronym and expansion, or neither (no half-filled entry)", () => {
    const mismatched = GLOSSARY.filter((entry) => Boolean(entry.acronym) !== Boolean(entry.expansion)).map(
      (entry) => entry.id,
    );
    expect(mismatched).toEqual([]);
  });

  it("has no duplicate ids", () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
