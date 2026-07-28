// Data handling and warranty disclosure, shared by every calculator.
//
// The content is the same everywhere; only the specifics differ, so callers
// pass their own storage keys and any extra caveats. Each calculator states
// mechanisms rather than reassurances, so every claim is checkable against the
// source: none of them contains a fetch, XMLHttpRequest, WebSocket, or
// sendBeacon call, none uses cookies or analytics, and none loads an external
// script or font.

import { useState } from "react";

const ANCHOR = "data-handling";

const ink = "#0f172a";
const body = "#374151";
const muted = "#64748b";
const hairline = "#e2e5ea";
const rule = "#cbd5e1";
const accent = "#4f46e5";
const negative = "#dc2626";
const positive = "#047857";
const tint = "#f1f5f9";

/** One line placed near the top of a page, linking down to the full text. */
export function DataDisclosureLink() {
  return (
    <p style={{ fontSize: 11.5, color: muted, margin: "0 0 14px", lineHeight: 1.5 }}>
      Everything here is computed in your browser and nothing you enter is sent anywhere.{" "}
      <a href={`#${ANCHOR}`} style={{ color: accent, textDecoration: "underline", textUnderlineOffset: 2 }}>
        How your data is handled
      </a>
    </p>
  );
}

/**
 * @param storageKeys   localStorage keys this calculator writes, named outright
 * @param sharesViaUrl  whether it can produce a link containing the inputs
 * @param extraNotes    [{ title, body }] specific to this calculator
 * @param onClearStoredData  omit to hide the clear button
 */
export function DataDisclosure({
  storageKeys = [],
  sharesViaUrl = false,
  extraNotes = [],
  onClearStoredData,
}) {
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
      style={{
        background: "#fff",
        border: `1px solid ${hairline}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginTop: 28,
        scrollMarginTop: 16,
      }}
      aria-labelledby={`${ANCHOR}-heading`}
    >
      <h2 id={`${ANCHOR}-heading`} style={{ fontSize: 14, fontWeight: 700, color: ink, margin: "0 0 10px" }}>
        How your data is handled
      </h2>

      <Item title="Nothing you enter is transmitted">
        This page has no server behind it. Every figure is computed in your browser from what you type, and the
        calculator makes no network request of any kind with your data. There is no account, no login, and no
        submit step.
      </Item>

      {storageKeys.length > 0 && (
        <Item title="What is stored, and where">
          Your inputs are saved in this browser's local storage on this device, under{" "}
          {storageKeys.length === 1 ? "the key " : "the keys "}
          {storageKeys.map((key, i) => (
            <span key={key}>
              {i > 0 && (i === storageKeys.length - 1 ? " and " : ", ")}
              <Code>{key}</Code>
            </span>
          ))}
          . That is what lets your work survive a reload. It stays on this device until you clear it, and it is
          not synced or backed up anywhere.
        </Item>
      )}

      {sharesViaUrl && (
        <Item title="Share links are the one exception">
          Copying a share link encodes your inputs into the link itself. That data then travels wherever you send
          the link, and it is encoded rather than encrypted, so anyone holding the link can read it. Anything that
          handles a URL may also retain it, including chat and email services, browser history, and server logs.
          Treat a share link as you would a document containing the figures in it, because that is what it is.
        </Item>
      )}

      <Item title="No tracking of any kind">
        There is no analytics, no cookies, no tracking pixels, no third-party scripts, and no externally loaded
        fonts. The page uses only fonts already on your system.
      </Item>

      <Item title="What the host can see">
        The site is static files served by GitHub Pages. Whoever serves them can see that a browser requested the
        page, along with the usual things any web server records such as an IP address and a timestamp. They
        cannot see what you typed, because it never reaches them.
      </Item>

      {extraNotes.map((note) => (
        <Item key={note.title} title={note.title}>
          {note.body}
        </Item>
      ))}

      <Item title="No warranty">
        These calculators are provided as is, with no warranty of any kind, express or implied, including any
        warranty of accuracy, merchantability, or fitness for a particular purpose. They are estimates built on
        assumptions you supply and on published figures that change, and they may contain errors. Nothing here is
        tax, legal, investment, or financial advice, and using it creates no professional relationship. Verify
        anything you intend to rely on with a qualified professional and with primary sources. You are solely
        responsible for any decision you make, and the author accepts no liability for any loss arising from use
        of these tools or from reliance on their output.
      </Item>

      {onClearStoredData && storageKeys.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${hairline}` }}>
          {cleared ? (
            <p style={{ fontSize: 12, color: positive, margin: 0, fontWeight: 600 }}>
              Stored data cleared from this browser.
            </p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  padding: "5px 10px",
                  minHeight: 34,
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  borderRadius: 5,
                  cursor: "pointer",
                  color: confirming ? "#fff" : negative,
                  background: confirming ? negative : "#fff",
                  border: `1px solid ${negative}`,
                }}
              >
                {confirming ? "Delete everything, permanently" : "Clear stored data"}
              </button>
              {confirming && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    style={{
                      padding: "5px 10px",
                      minHeight: 34,
                      fontSize: 11.5,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      color: body,
                      background: "#fff",
                      border: `1px solid ${rule}`,
                      borderRadius: 5,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <span style={{ fontSize: 11.5, color: body }}>
                    Everything saved is deleted from this browser and the page resets. This cannot be undone.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Item({ title, children }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: body, margin: "0 0 3px" }}>{title}</h3>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: body, margin: 0 }}>{children}</p>
    </div>
  );
}

function Code({ children }) {
  return (
    <code
      style={{
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: tint,
        padding: "1px 4px",
        borderRadius: 3,
      }}
    >
      {children}
    </code>
  );
}
