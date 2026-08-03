import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import App from "../App.jsx";
import { GLOSSARY } from "../../glossary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.resolve(__dirname, "../App.jsx"), "utf8");

describe("assumptions page copy", () => {
  it("never renders a literal double hyphen", () => {
    // Before this fix, eight sentences used "--" (a source-comment
    // convention) inside JSX text nodes, which JSX passes through verbatim
    // to the browser rather than transforming into any dash character.
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toMatch(/--/);
  });

  it("describes the grid-charge window semantics in the dispatch section", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/deficit imports from the grid instead/);
    expect(html).toMatch(/never pushes an hour/);
    expect(html).toMatch(/above the shave threshold/);
    expect(html).toMatch(/deficit hour therefore never exports/);
    expect(html).toMatch(/grid-sourced energy counts toward equivalent full cycles/);
  });

  it("states that peak-shave discharge takes priority over an active grid-charge window, not that the window suppresses discharge unconditionally", () => {
    // Before this fix, the page said flatly that the battery never
    // discharges while a grid-charge window is active, which was true only
    // in self-consumption mode -- see calc/battery.js's fix for the same
    // claim in CONTRACTS.md.
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/In self-consumption mode, while a grid-charge window is active/);
    expect(html).toMatch(/shaving takes priority over the window instead/);
  });
});

describe("assumptions page glossary table", () => {
  // The glossary table (see glossary.js's GlossarySection) is the one place
  // every entry is guaranteed to render, regardless of whether any <Term>
  // elsewhere in the app links to it.
  const html = renderToStaticMarkup(<App />);

  it("has an anchor a Glossary link can target", () => {
    expect(html).toMatch(/<section id="glossary"/);
  });

  it("renders exactly one table row per glossary entry", () => {
    const section = html.match(/<section id="glossary"[\s\S]*?<\/section>/)[0];
    const rowCount = (section.match(/<tr>/g) || []).length - 1; // -1 for the header row
    expect(rowCount).toBe(GLOSSARY.length);
  });

  // React HTML-escapes text nodes; match Field.test.jsx's own approach of
  // comparing against the same escaping rather than the raw source string.
  function htmlEscape(text) {
    return text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
  }

  it("shows every entry's acronym (or, for a plain-phrase entry, its id-derived label), full name, definition, and why-it-matters text", () => {
    const section = html.match(/<section id="glossary"[\s\S]*?<\/section>/)[0];
    for (const entry of GLOSSARY) {
      const label = entry.acronym || entry.id.replace(/-/g, " ");
      expect(section).toContain(htmlEscape(entry.definition));
      expect(section).toContain(htmlEscape(entry.whyItMatters));
      if (entry.expansion) expect(section).toContain(htmlEscape(entry.expansion));
      // A case-insensitive check: idToLabel title-cases the first word only
      // (e.g. "Payback"), while `label` above is the bare lowercase id form.
      expect(section.toLowerCase()).toContain(htmlEscape(label).toLowerCase());
    }
  });
});

describe("assumptions page bundle weight", () => {
  it("imports the meta-only solar-shapes file, not the full hourly grid", () => {
    expect(appSource).toMatch(/solar-shapes\.meta\.json/);
    expect(appSource).not.toMatch(/from\s+["'][^"']*\/data\/solar-shapes\.json["']/);
  });

  it("the meta file is under 1% of the full grid's size", () => {
    const metaSize = fs.statSync(path.resolve(__dirname, "../../data/solar-shapes.meta.json")).size;
    const fullSize = fs.statSync(path.resolve(__dirname, "../../data/solar-shapes.json")).size;
    expect(metaSize).toBeLessThan(fullSize * 0.01);
  });

  it("the meta file still carries the six fields the page reads", () => {
    const meta = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/solar-shapes.meta.json"), "utf8")).meta;
    expect(meta.fetchedFor.site.name).toBeTruthy();
    expect(meta.fetchedFor.site.lat).toBeTypeOf("number");
    expect(meta.fetchedFor.site.lon).toBeTypeOf("number");
    expect(meta.params.tilts.length).toBeGreaterThan(0);
    expect(meta.params.azimuths.length).toBeGreaterThan(0);
    expect(meta.source).toBeTruthy();
    expect(meta.fetchedFor.note).toBeTruthy();
  });
});
