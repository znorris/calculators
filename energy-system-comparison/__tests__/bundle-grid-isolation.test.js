// Regression coverage for the solar-shapes grid appearing in the main
// entry's first-paint bundle. This runs an actual Vite build and inspects
// the emitted chunks -- unlike this repo's other "bundle weight" checks (see
// assumptions/__tests__/App.test.jsx), which are static source-text greps,
// this one has to be a real build: the underlying bug was a Rollup
// tree-shaking interaction (a module-top-level property read on the
// imported JSON is never eliminated, regardless of whether anything
// downstream uses it) that no amount of reading the source proves one way or
// the other. Slower than a unit test (a few hundred ms), kept in its own
// file so it does not slow down every other test run's watch loop.
//
// The build covers EVERY entry this repo ships (mirroring vite.config.js's
// own input map), not just energy-system-comparison: data/solar-shapes.json
// (the ~2.4 MB grid) and data/solar-shapes.meta.json (the small file
// assumptions/App.jsx reads) share the same "generatedNote" prose string,
// which quotes a grid key as an example ('Grid keys are t{tilt}_a{azimuth},
// e.g. t20_a180 = ...'). That string alone landed in the assumptions entry's
// own chunk (from the small meta file) even though the real grid never did --
// a bare 't20_a180' substring match can't tell those two apart, so the match
// below requires the key immediately followed by a JSON array
// ('"t20_a180":['), a shape only the actual grid data produces; the prose
// sentence has no array following the key anywhere in it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import viteConfig from "../../vite.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.resolve(__dirname, "../../.tmp-bundle-grid-isolation-test");

// Read straight out of vite.config.js's own input map (it's a plain ESM
// module, so importing it costs nothing extra) rather than a hand-copied
// literal, so a new entry added there is automatically covered here too
// without this file needing an edit. Checked under both option keys since
// this repo's vite.config.js currently names its input map
// build.rolldownOptions.input, but build.rollupOptions.input is the older
// (still-supported) name for the same thing.
const ALL_ENTRIES = viteConfig.build?.rolldownOptions?.input ?? viteConfig.build?.rollupOptions?.input;

// Only the real grid data produces a JSON object key immediately followed by
// its array of hourly values; the meta file's prose mention of the same key
// never has an array literal after it.
const GRID_VALUE_PATTERN = /"t20_a180":\[/;

let assetFiles = [];

beforeAll(async () => {
  const { build } = await import(path.resolve(REPO_ROOT, "node_modules/vite/dist/node/index.js"));
  const react = (await import(path.resolve(REPO_ROOT, "node_modules/@vitejs/plugin-react/dist/index.js"))).default;

  await build({
    root: REPO_ROOT,
    configFile: false,
    logLevel: "error",
    plugins: [react()],
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { input: ALL_ENTRIES },
    },
  });

  const assetsDir = path.join(OUT_DIR, "assets");
  assetFiles = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f, contents: fs.readFileSync(path.join(assetsDir, f), "utf8") }));
}, 60000);

afterAll(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

describe("full-repo bundle: solar-shapes grid isolation", () => {
  it("read a non-empty entry map out of vite.config.js (sanity check the import itself, so a broken read doesn't silently degrade every other assertion below to a no-op)", () => {
    expect(ALL_ENTRIES).toBeTruthy();
    expect(Object.keys(ALL_ENTRIES).length).toBeGreaterThan(0);
  });

  it("finds at least one built chunk per entry (sanity check the build actually ran)", () => {
    expect(assetFiles.length).toBeGreaterThanOrEqual(Object.keys(ALL_ENTRIES).length);
  });

  it("the assumptions entry's own chunk mentions the grid-key prose string, but as text, not real grid data", () => {
    // Guards the test itself: if this ever stops matching, the prose string
    // moved or was reworded, and GRID_VALUE_PATTERN's assumption that a bare
    // 't20_a180' substring match is ambiguous (see this file's header) needs
    // re-checking against whatever replaced it.
    const withBareMention = assetFiles.filter((f) => f.contents.includes("t20_a180"));
    expect(withBareMention.length).toBeGreaterThanOrEqual(2);
    const withGridValue = withBareMention.filter((f) => GRID_VALUE_PATTERN.test(f.contents));
    expect(withBareMention.length).toBeGreaterThan(withGridValue.length);
  });

  it("the full grid (a real 't20_a180' grid VALUE, not the bare prose substring) appears in exactly one chunk across every entry", () => {
    const withGrid = assetFiles.filter((f) => GRID_VALUE_PATTERN.test(f.contents));
    expect(withGrid.map((f) => f.name)).toHaveLength(1);
  });

  it("the one chunk containing the grid is not either main entry chunk", () => {
    const withGrid = assetFiles.filter((f) => GRID_VALUE_PATTERN.test(f.contents));
    expect(withGrid).toHaveLength(1);
    expect(withGrid[0].name).not.toMatch(/^energy-system-comparison-/);
    expect(withGrid[0].name).not.toMatch(/^energy-assumptions-/);
  });

  it("the energy-system-comparison entry chunk is well under 1 MB (no ~2.4 MB grid folded in)", () => {
    const main = assetFiles.find((f) => f.name.startsWith("energy-system-comparison-"));
    expect(main).toBeTruthy();
    expect(Buffer.byteLength(main.contents, "utf8")).toBeLessThan(1024 * 1024);
  });
});
