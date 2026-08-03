// Static guard against a built-but-never-mounted component: every .jsx file
// under components/ that exports a capitalized (component-shaped) name must
// be reachable by walking relative imports outward from App.jsx, directly or
// transitively. A component that fails this either needs wiring into the
// tree, or its file deleted -- this test cannot tell which, so it only
// fails and lists the file, leaving that call to whoever reads the failure.
//
// The resolver below is deliberately small: it strips comments, regex-scans
// for `import ... from "..."` and `export ... from "..."` specifiers
// starting with "." (ignoring bare package specifiers like "react"), and
// resolves each relative to the importing file's own directory, trying the
// specifier as-is, then with .js/.jsx appended, then as a directory's
// index.js/index.jsx. It does not understand dynamic `import()`, JSX syntax,
// or TypeScript path aliases -- none of which this codebase uses for its own
// modules -- and does not follow `new Worker(new URL(...))` (a worker's
// module graph is deliberately separate from the main app's, so a component
// is never reachable only through one).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALC_ROOT = path.resolve(__dirname, "../..");
const APP_ENTRY = path.resolve(CALC_ROOT, "App.jsx");
const COMPONENTS_DIR = path.resolve(CALC_ROOT, "components");

/** Strips // line comments and /* block comments (crude, but sufficient: this codebase never puts import-like text inside a string literal). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every relative (starts with ".") specifier from an import or re-export statement. */
function relativeImportSpecifiers(src) {
  const specifiers = [];
  const re = /\b(?:import|export)\b[^;'"]*?from\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (spec && spec.startsWith(".")) specifiers.push(spec);
  }
  return specifiers;
}

/** Resolves `specifier` (relative to `fromFile`'s directory) to an existing file path, or null if none of the candidate forms exist. */
function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

/** BFS over the relative-import graph starting at `entryFile`; returns the Set of every reached absolute file path (entry included). */
function reachableFilesFrom(entryFile) {
  const visited = new Set([entryFile]);
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift();
    if (!/\.jsx?$/.test(file)) continue; // .json etc. have nothing further to walk
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const spec of relativeImportSpecifiers(src)) {
      const resolved = resolveImport(file, spec);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return visited;
}

/** Every capitalized `export function Name` / `export const Name =` / `export default function Name` identifier in `src`. */
function exportedComponentNames(src) {
  const names = new Set();
  const patterns = [
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=/g,
    /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
  ];
  const cleaned = stripComments(src);
  for (const re of patterns) {
    let m;
    while ((m = re.exec(cleaned))) names.add(m[1]);
  }
  return names;
}

/** Every .jsx file under `dir`, recursing into subdirectories except __tests__. */
function jsxFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsxFilesUnder(full));
    else if (entry.name.endsWith(".jsx")) out.push(full);
  }
  return out;
}

describe("component reachability from App.jsx", () => {
  it("reaches at least the known top-level sections (sanity check the resolver itself works)", () => {
    const reached = reachableFilesFrom(APP_ENTRY);
    expect(reached.has(path.join(COMPONENTS_DIR, "HouseholdSection.jsx"))).toBe(true);
    expect(reached.has(path.join(COMPONENTS_DIR, "ExplorerSection.jsx"))).toBe(true);
    expect(reached.has(path.join(COMPONENTS_DIR, "ResultsSection.jsx"))).toBe(true);
  });

  it("every components/ .jsx file exporting a capitalized component is imported, directly or transitively, from App.jsx", () => {
    const reached = reachableFilesFrom(APP_ENTRY);
    const componentFiles = jsxFilesUnder(COMPONENTS_DIR);

    const unreachable = componentFiles
      .filter((file) => exportedComponentNames(fs.readFileSync(file, "utf8")).size > 0)
      .filter((file) => !reached.has(file))
      .map((file) => path.relative(CALC_ROOT, file));

    expect(unreachable).toEqual([]);
  });
});
