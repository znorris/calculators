// Positioning + open-state primitive for a floating hint anchored to a
// trigger element. All visibility state lives here: it opens on hover or
// keyboard focus of anything inside the trigger, toggles on click/tap (so
// touch, which has no hover, still shows it), and closes on Escape, blur, or
// pointer-leave. React's onFocus/onBlur are focusin/focusout under the hood,
// so they fire for a focusable element nested anywhere inside the wrapping
// span below even though the span itself holds no tabIndex.
//
// The trigger is rendered exactly as `children` gives it -- Term.jsx supplies
// a dotted-underline span, Field.jsx's help affordance supplies a small icon
// button -- Tooltip never adds its own chrome around the trigger, only the
// show/hide/position behavior and the floating content node. Positioning is
// computed against the trigger's own bounding rect in viewport coordinates
// (position: fixed), so it is unaffected by a scrolling or clipping
// ancestor: the content is measured off-screen first, then placed above the
// trigger and clamped inside the viewport with an 8px margin, flipping below
// the trigger when there isn't room above (or vice versa for
// placement="bottom").
//
// `id` is meant for a caller's aria-describedby (Term.jsx's underlined span,
// Field.jsx's input), so the element that id resolves to has to exist in the
// DOM whether or not the tooltip is currently open -- an assistive-tech user
// can trigger aria-describedby's reference without ever opening the floating
// popover. `content` therefore always renders in a visually-hidden span
// carrying `id` (the standard clip-rect sr-only pattern: 1x1px, clipped,
// still in the accessibility tree); the floating popover shown on
// hover/focus/tap is presentational only (aria-hidden), a visual convenience
// for sighted users on top of text that is already reachable without it.
//
// No dependencies beyond React.
//
// TOOLTIP_CSS is shared, page-wide styling (the floating popover's look, the
// sr-only clip-rect for the always-present description span) -- identical
// for every Tooltip instance, not per-instance state. It used to render as
// its own <style> tag inside every Tooltip, so a page with N tooltips (a
// Field with help text, a Term, ...) shipped N duplicate copies of the same
// rules. ensureTooltipStylesInjected below inserts it into document.head
// exactly once per document (a real DOM singleton, not a per-component
// render), guarded by checking for the element's own id rather than a
// module-level flag alone, so it stays correct even if this module is
// evaluated more than once (e.g. two separate bundle chunks). It is a no-op
// under react-dom/server's renderToStaticMarkup (no `document` there; see
// components/__tests__/smoke.test.jsx's header for why this repo's component
// tests render statically) -- fine, since nothing here needs the visual
// popover to be present in that static markup, only the always-present
// sr-only span Tooltip itself still renders unconditionally below.

import { useLayoutEffect, useRef, useState } from "react";

const MARGIN = 8;
const OFFSCREEN = { position: "fixed", top: -9999, left: -9999, visibility: "hidden" };

const TOOLTIP_STYLE_ELEMENT_ID = "shared-tooltip-styles";

/**
 * The one definition of what a floating tooltip-like surface looks like in
 * this app: background, text color (each with its dark-mode counterpart),
 * corner radius, shadow, font size, and padding. Term's own popover below
 * consumes this by class name (TOOLTIP_SURFACE_CLASS); components/ChartTip.jsx
 * consumes the same class name for every recharts hover tooltip, so a chart
 * tip and a glossary Term popover render from the exact same rule set and
 * cannot drift apart the way two independently-authored style objects could.
 */
export const TOOLTIP_SURFACE = {
  background: "#0f172a",
  backgroundDark: "#f1f5f9",
  color: "#f8fafc",
  colorDark: "#0f172a",
  borderRadius: 6,
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.28)",
  fontSize: 11.5,
  padding: "7px 9px",
};

/** Class name every tooltip-like surface renders with -- see TOOLTIP_SURFACE's own header. */
export const TOOLTIP_SURFACE_CLASS = "shared-tooltip-pop";

const TOOLTIP_CSS = `
  .shared-tooltip-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .${TOOLTIP_SURFACE_CLASS} {
    z-index: 1000;
    /* The popover is a span (or, from ChartTip.jsx, a div); without
       display:block it is inline, so max-width is ignored and the
       background paints per line fragment instead of as one box around the
       wrapped text. */
    display: block;
    width: max-content;
    max-width: min(320px, calc(100vw - 16px));
    /* The Term wrapper sets nowrap to keep acronyms unbroken; the popover
       nests inside it and must reset to wrap its own text. */
    white-space: normal;
    overflow-wrap: break-word;
    text-align: left;
    padding: ${TOOLTIP_SURFACE.padding};
    border-radius: ${TOOLTIP_SURFACE.borderRadius}px;
    font-size: ${TOOLTIP_SURFACE.fontSize}px;
    line-height: 1.5;
    background: ${TOOLTIP_SURFACE.background};
    color: ${TOOLTIP_SURFACE.color};
    box-shadow: ${TOOLTIP_SURFACE.boxShadow};
    animation: shared-tooltip-fade-in 0.1s ease-out;
  }
  @keyframes shared-tooltip-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-color-scheme: dark) {
    .${TOOLTIP_SURFACE_CLASS} {
      background: ${TOOLTIP_SURFACE.backgroundDark};
      color: ${TOOLTIP_SURFACE.colorDark};
    }
  }
`;

/**
 * Inserts TOOLTIP_CSS into document.head exactly once per document (a real
 * DOM singleton, not a per-component render) -- exported so
 * components/ChartTip.jsx, a separate consumer of TOOLTIP_SURFACE_CLASS that
 * may mount before any Term has, can guarantee the stylesheet is present
 * without depending on load order between the two.
 */
export function ensureTooltipStylesInjected() {
  if (typeof document === "undefined") return; // SSR/test: nothing to inject into.
  const existing = document.getElementById(TOOLTIP_STYLE_ELEMENT_ID);
  if (existing) {
    // Overwrite rather than skip: under HMR the guard element survives module
    // reloads, so a skip would pin the page to whatever CSS version injected
    // first.
    if (existing.textContent !== TOOLTIP_CSS) existing.textContent = TOOLTIP_CSS;
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = TOOLTIP_STYLE_ELEMENT_ID;
  styleEl.textContent = TOOLTIP_CSS;
  document.head.appendChild(styleEl);
}

export function Tooltip({ id, content, children, placement = "top" }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(OFFSCREEN);
  const anchorRef = useRef(null);
  const tipRef = useRef(null);

  // Runs on mount for every Tooltip instance, but only the first one to run
  // in a given document actually inserts anything (see the DOM-presence
  // guard above); every later instance's call is a cheap no-op check.
  useLayoutEffect(() => {
    ensureTooltipStylesInjected();
  }, []);

  // Skipped entirely by react-dom/server's renderToStaticMarkup (no effects
  // run during SSR), so the closed/off-screen state above is exactly what a
  // static render produces -- intentional, since this repo's component tests
  // render statically with no DOM to measure against (see
  // components/__tests__/smoke.test.jsx's header).
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    let top = placement === "bottom" ? anchorRect.bottom + MARGIN : anchorRect.top - tipRect.height - MARGIN;
    if (top < MARGIN) top = anchorRect.bottom + MARGIN;
    if (top + tipRect.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, anchorRect.top - tipRect.height - MARGIN);
    }

    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, window.innerWidth - tipRect.width - MARGIN));

    setStyle({ position: "fixed", top, left, visibility: "visible" });
  }, [open, placement]);

  function close() {
    setOpen(false);
    setStyle(OFFSCREEN);
  }

  return (
    <span
      ref={anchorRef}
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={close}
      onClick={() => (open ? close() : setOpen(true))}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {children}
      <span id={id} className="shared-tooltip-sr-only">
        {content}
      </span>
      {open && (
        <span ref={tipRef} aria-hidden="true" className={TOOLTIP_SURFACE_CLASS} style={style}>
          {content}
        </span>
      )}
    </span>
  );
}
