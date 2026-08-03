// Coverage for Term.jsx's static (non-interactive) markup: this repo has no
// jsdom/testing-library dependency, so hover/focus/tap behavior isn't
// exercised here (see energy-system-comparison/components/__tests__/smoke
// .test.jsx's header for why renderToStaticMarkup is this repo's component
// test approach) -- this only checks what a server render actually produces:
// the dotted-underline trigger, its tabIndex, and its aria-describedby
// wiring to a tooltip id.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GlossaryProvider, Term } from "../Term.jsx";

const GLOSSARY = {
  widget: {
    acronym: "WID",
    expansion: "widget thing",
    definition: "A widget is a thing this test made up.",
    whyItMatters: "It matters for testing Term in isolation.",
  },
  phrase: {
    // No acronym/expansion: a plain-phrase entry like "discount rate" or
    // "payback" in energy-system-comparison/glossary.js.
    acronym: null,
    expansion: null,
    definition: "A phrase is a plain term with no shortened form.",
    whyItMatters: "It covers the no-acronym branch of Term tooltip content.",
  },
};

describe("Term", () => {
  it("renders a focusable, described trigger for a known id", () => {
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY}>
        <Term id="widget">Widget</Term>
      </GlossaryProvider>,
    );
    expect(html).toContain(">Widget<");
    expect(html).toMatch(/tabindex="0"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
  });

  it("wires the same id the tooltip trigger references, and that id resolves to a real node even while closed (no dangling aria-describedby)", () => {
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY}>
        <Term id="widget">Widget</Term>
      </GlossaryProvider>,
    );
    const describedBy = html.match(/aria-describedby="([^"]+)"/)[1];
    expect(describedBy.length).toBeGreaterThan(0);
    // Regression: Tooltip used to render its id="..." node only while open
    // (`{open && <span id={id}>}`), and Tooltip's own open state starts
    // false with react-dom/server never running the effects that would open
    // it -- so the id above pointed at nothing in this exact markup. Tooltip
    // now renders a permanently-present visually-hidden span carrying `id`
    // regardless of open state, so the description is present here too.
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain(GLOSSARY.widget.expansion);
    expect(html).toContain(GLOSSARY.widget.definition);
    expect(html).toContain(GLOSSARY.widget.whyItMatters);
    // Expansion renders bolded, ahead of the definition.
    expect(html).toMatch(/<strong>widget thing\.<\/strong>/);
  });

  it("skips the bold expansion line for a plain-phrase entry with no acronym/expansion, but still shows the definition and whyItMatters", () => {
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY}>
        <Term id="phrase">Phrase</Term>
      </GlossaryProvider>,
    );
    expect(html).not.toContain("<strong>");
    expect(html).toContain(GLOSSARY.phrase.definition);
    expect(html).toContain(GLOSSARY.phrase.whyItMatters);
  });

  it("renders children plain, with no tabIndex or tooltip wiring, for an id absent from the glossary", () => {
    // A typo'd id shouldn't crash the page; glossary-completeness.test.js
    // (energy-system-comparison/__tests__/) is what actually catches a typo
    // by greping the source tree, not this component at render time.
    const html = renderToStaticMarkup(
      <GlossaryProvider glossary={GLOSSARY}>
        <Term id="not-a-real-id">Mystery</Term>
      </GlossaryProvider>,
    );
    expect(html).toContain("Mystery");
    expect(html).not.toMatch(/tabindex/);
    expect(html).not.toMatch(/aria-describedby/);
  });

  it("renders children plain when used with no GlossaryProvider at all", () => {
    const html = renderToStaticMarkup(<Term id="widget">Widget</Term>);
    expect(html).toContain("Widget");
    expect(html).not.toMatch(/tabindex/);
  });
});
