// A glossary term: the acronym or short phrase renders with a dotted
// underline, and a Tooltip shows its full expansion, definition, and why it
// matters on hover, keyboard focus (this span carries its own tabIndex), or
// tap (Tooltip's click-to-toggle).
//
// Entries come from the nearest GlossaryProvider up the tree, not from Term
// itself -- each calculator that adopts this component wraps its own root in
// a GlossaryProvider with its own glossary.js (see
// energy-system-comparison/glossary.js's GLOSSARY_BY_ID, and where
// App.jsx/assumptions/App.jsx each wrap their own tree), so Term carries no
// calculator-specific content and is reusable as-is. A glossary entry is
// shaped { acronym, expansion, definition, whyItMatters }; `acronym` and
// `expansion` are null for an entry that is a plain phrase rather than a
// shortened form (e.g. "discount rate"), in which case the tooltip skips the
// bold expansion line and shows only the definition and whyItMatters.

import { createContext, useContext, useId } from "react";
import { Tooltip } from "./Tooltip.jsx";

const GlossaryContext = createContext({});

export function GlossaryProvider({ glossary, children }) {
  return <GlossaryContext.Provider value={glossary}>{children}</GlossaryContext.Provider>;
}

const underlineStyle = {
  borderBottom: "1px dotted currentColor",
  cursor: "help",
};

/**
 * `id` must resolve in the active GlossaryProvider's glossary. A missing id
 * renders `children` plain (no underline, no tooltip) rather than throwing,
 * so a typo doesn't crash the page -- the static completeness test (see
 * energy-system-comparison/__tests__/glossary-completeness.test.js) is what
 * catches a typo'd id, by greping the source tree for every <Term id="...">
 * use and asserting each one exists in glossary.js. It also means Term
 * degrades to a plain span with no GlossaryProvider ancestor at all, which is
 * what lets a component that uses Term still render standalone in a test
 * with no provider wired up.
 */
export function Term({ id, children }) {
  const glossary = useContext(GlossaryContext);
  const entry = glossary[id];
  const tooltipId = useId();

  if (!entry) return <span>{children}</span>;

  const content = (
    <>
      {entry.expansion && (
        <>
          <strong>{entry.expansion}.</strong>{" "}
        </>
      )}
      {entry.definition} {entry.whyItMatters}
    </>
  );

  return (
    <Tooltip id={tooltipId} content={content}>
      <span tabIndex={0} aria-describedby={tooltipId} style={underlineStyle}>
        {children}
      </span>
    </Tooltip>
  );
}
