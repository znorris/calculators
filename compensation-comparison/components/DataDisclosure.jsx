// What this page does with what you type into it.
//
// Compensation is sensitive, so the disclosure states the mechanism rather
// than offering reassurance. Every claim here is checkable against the source:
// there is no fetch, XMLHttpRequest, WebSocket, or sendBeacon call anywhere in
// the calculator, no analytics, no cookies, no external fonts or scripts, and
// exactly two localStorage keys.
//
// The share link is the one path by which data leaves the device, and it is
// described as such instead of being left out.

import { useState } from "react";
import { color, button, card } from "../theme.js";

const ANCHOR = "data-handling";

/** One line near the top, linking down to the full text. */
export function DataDisclosureLink() {
  return (
    <p style={{ fontSize: 11.5, color: color.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
      Everything here is computed in your browser and nothing you type is sent anywhere.{" "}
      <a href={`#${ANCHOR}`} style={{ color: color.accent, textDecoration: "underline", textUnderlineOffset: 2 }}>
        How your data is handled
      </a>
    </p>
  );
}

export function DataDisclosure({ onClearStoredData }) {
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  function handleClear() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onClearStoredData();
    setConfirming(false);
    setCleared(true);
  }

  return (
    <section
      id={ANCHOR}
      style={{ ...card, padding: "16px 18px", marginTop: 28, scrollMarginTop: 16 }}
      aria-labelledby={`${ANCHOR}-heading`}
    >
      <h2
        id={`${ANCHOR}-heading`}
        style={{ fontSize: 14, fontWeight: 700, color: color.ink, margin: "0 0 10px" }}
      >
        How your data is handled
      </h2>

      <Item title="Nothing you type is transmitted">
        This page has no server behind it. Every figure is computed in your browser from what you enter, and the
        calculator makes no network request of any kind with your data. There is no account, no login, and no
        submit step.
      </Item>

      <Item title="What is stored, and where">
        Your offers and your comparison settings are saved in this browser's local storage on this device, under
        the keys <Code>comp-comparison:offers</Code> and <Code>comp-comparison:current</Code>. That is what lets
        your work survive a reload. It stays on the device until you clear it, and it is not synced or backed up
        anywhere.
      </Item>

      <Item title="Share links are the one exception">
        Using "Copy share link" encodes your offers into the link itself. That data then travels wherever you
        send the link, and it is encoded rather than encrypted, so anyone holding the link can read it. Anything
        that handles a URL may also retain it, including chat and email services, browser history, and server
        logs. Treat a share link as you would a document containing your salary, because that is what it is.
      </Item>

      <Item title="No tracking of any kind">
        There is no analytics, no cookies, no tracking pixels, no third-party scripts, and no externally loaded
        fonts. The page uses only fonts already on your system.
      </Item>

      <Item title="What the host can see">
        The site is static files. Whoever serves them can see that a browser requested the page, along with the
        usual things any web server records such as an IP address and a timestamp. They cannot see what you typed,
        because it never reaches them.
      </Item>

      <Item title="Not advice">
        Tax figures are estimates computed from published rates, and several of the state figures carry lower
        confidence where a state has not yet released the current year. The Assumptions section of the report
        lists what is and is not modeled. None of this is tax or financial advice.
      </Item>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${color.hairline}` }}>
        {cleared ? (
          <p style={{ fontSize: 12, color: color.positive, margin: 0, fontWeight: 600 }}>
            Stored data cleared from this browser.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleClear}
              style={{
                ...button,
                minHeight: 34,
                color: confirming ? color.surface : color.negative,
                background: confirming ? color.negative : color.surface,
                borderColor: color.negative,
              }}
            >
              {confirming ? "Delete everything, permanently" : "Clear stored data"}
            </button>
            {confirming && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  style={{ ...button, minHeight: 34 }}
                >
                  Cancel
                </button>
                <span style={{ fontSize: 11.5, color: color.body }}>
                  Every offer and setting is deleted from this browser and the page resets to empty. What remains
                  stored is an empty list and default settings. This cannot be undone.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Item({ title, children }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: color.body, margin: "0 0 3px" }}>{title}</h3>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: color.body, margin: 0 }}>{children}</p>
    </div>
  );
}

function Code({ children }) {
  return (
    <code
      style={{
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: color.tint,
        padding: "1px 4px",
        borderRadius: 3,
      }}
    >
      {children}
    </code>
  );
}
