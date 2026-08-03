// Rendered below a copy button whenever shared/clipboard.js's copyText()
// resolves false -- neither the Clipboard API nor the legacy execCommand
// path succeeded, most commonly because the page is served over plain http
// from a non-localhost address (see clipboard.js's header). Never
// window.prompt: a readonly textarea is auto-focused and auto-selected on
// mount, so the user's very next keystroke (Ctrl/Cmd+C) copies it, with a
// one-line instruction above and a dismiss button below.
//
// textareaStyle/buttonStyle let a caller with its own theme.js (e.g.
// energy-system-comparison/App.jsx, HouseholdSection.jsx) render this with
// its own house input/button look; a caller with no calculator-specific
// theme available (shared/ShareButton.jsx, used across three calculators
// with three different theme.js files) gets sensible built-in defaults
// instead, so this component never needs a calculator to thread its theme
// through just to keep this panel from looking bare.

import { useEffect, useRef } from "react";

const DEFAULT_TEXTAREA_STYLE = {
  width: "100%",
  minHeight: 80,
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#0f172a",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  resize: "vertical",
};

const DEFAULT_BUTTON_STYLE = {
  padding: "5px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  color: "#374151",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function CopyFallbackPanel({ text, textareaStyle, buttonStyle, onDismiss }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 11, lineHeight: 1.45, color: "#64748b", margin: "0 0 4px" }}>
        Copying is blocked in this browser context; the text below is selected, press Ctrl/Cmd+C.
      </p>
      <textarea
        ref={textareaRef}
        readOnly
        value={text}
        onFocus={(e) => e.target.select()}
        style={{ ...DEFAULT_TEXTAREA_STYLE, ...textareaStyle }}
      />
      <button
        type="button"
        style={{ ...DEFAULT_BUTTON_STYLE, ...buttonStyle, marginTop: 4 }}
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
