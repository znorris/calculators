// Regression coverage for Field.jsx's id derivation: the same field
// descriptor (a module-level constant) renders once per config card, so a
// fixed `f-${field.id}` id collided across cards and mis-targeted every
// second card's <label for>. See components/__tests__/smoke.test.jsx's
// header for why this repo tests components via renderToStaticMarkup rather
// than a DOM-mounting library.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "../Field.jsx";

const OANDM_FIELD = { id: "oAndMPerYear", type: "money", label: "O&M per year" };
const HELP_FIELD = { id: "discountRatePct", type: "number", label: "Discount rate", help: "Used to discount future cash flows to today's dollars." };

function idsAndLabelTargets(html) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const labelFors = [...html.matchAll(/\sfor="([^"]+)"/g)].map((m) => m[1]);
  return { ids, labelFors };
}

describe("Field id uniqueness", () => {
  it("gives two instances of the same field descriptor distinct ids, each label targeting its own input", () => {
    // Before this fix, both instances rendered id="f-oAndMPerYear" and both
    // labels' `for` resolved to the first one.
    const html = renderToStaticMarkup(
      <div>
        <Field field={OANDM_FIELD} value={100} onChange={() => {}} />
        <Field field={OANDM_FIELD} value={200} onChange={() => {}} />
      </div>,
    );
    const { ids, labelFors } = idsAndLabelTargets(html);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(labelFors).toEqual(ids);
  });

  it("honors an explicit idPrefix instead of the auto-generated one", () => {
    const html = renderToStaticMarkup(<Field field={OANDM_FIELD} value={100} onChange={() => {}} idPrefix="config-a" />);
    expect(html).toContain('id="config-a-oAndMPerYear"');
    expect(html).toContain('for="config-a-oAndMPerYear"');
  });
});

describe("Field help wiring", () => {
  // Regression: the input's aria-describedby has to resolve to an element
  // that actually carries the help text, with no hover/focus/tap needed --
  // shared/Tooltip.jsx renders its description in an always-present
  // visually-hidden span (see that file's header), not only while its
  // floating popover is open, so this must hold in a plain static render
  // with no interaction at all.
  it("wires the input's aria-describedby to an element containing the help text, with no interaction", () => {
    const html = renderToStaticMarkup(<Field field={HELP_FIELD} value={5} onChange={() => {}} idPrefix="assump" />);

    const inputMatch = html.match(/<input\b[^>]*\sid="assump-discountRatePct"[^>]*>/);
    expect(inputMatch).toBeTruthy();
    const describedByMatch = inputMatch[0].match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch).toBeTruthy();

    const describedById = describedByMatch[1];
    const describedByElement = html.match(new RegExp(`<span id="${describedById}"[^>]*>([^<]*)</span>`));
    expect(describedByElement).toBeTruthy();
    // React HTML-escapes text nodes (the apostrophe becomes &#x27;), so
    // compare against the same escaping rather than the raw help string.
    expect(describedByElement[1]).toBe(HELP_FIELD.help.replace(/'/g, "&#x27;"));
  });
});
