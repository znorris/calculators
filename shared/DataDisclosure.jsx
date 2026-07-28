// Two separate disclosures, shared by every calculator.
//
//   DataDisclosure      what happens to what you type
//   WarrantyDisclaimer  what the output is and is not worth
//
// They are deliberately not one section. One is a factual statement about data
// flow that a reader can verify against the source; the other is a legal
// limitation on relying on the numbers. Merging them would let a reader take
// the credibility of the first as covering the second.
//
// The data claims are checkable: no calculator here contains a fetch,
// XMLHttpRequest, WebSocket, or sendBeacon call, none uses cookies or
// analytics, and none loads an external script or font.

import { useState } from "react";

const DATA_ANCHOR = "data-handling";
const WARRANTY_ANCHOR = "disclaimer";

const ink = "#0f172a";
const body = "#374151";
const muted = "#64748b";
const hairline = "#e2e5ea";
const rule = "#cbd5e1";
const accent = "#4f46e5";
const negative = "#dc2626";
const positive = "#047857";
const tint = "#f1f5f9";

const section = {
  background: "#fff",
  border: `1px solid ${hairline}`,
  borderRadius: 10,
  padding: "16px 18px",
  marginTop: 28,
  scrollMarginTop: 16,
};

const heading = { fontSize: 14, fontWeight: 700, color: ink, margin: "0 0 10px" };

/** One line placed near the top of a page, linking down to both sections. */
export function DataDisclosureLink() {
  const link = { color: accent, textDecoration: "underline", textUnderlineOffset: 2 };
  return (
    <p style={{ fontSize: 11.5, color: muted, margin: "0 0 14px", lineHeight: 1.5 }}>
      Everything here is computed in your browser and nothing you enter is sent anywhere.{" "}
      <a href={`#${DATA_ANCHOR}`} style={link}>
        How your data is handled
      </a>
      {" · "}
      <a href={`#${WARRANTY_ANCHOR}`} style={link}>
        Disclaimer
      </a>
    </p>
  );
}

/**
 * What happens to what you type. Facts only, no legal language.
 *
 * @param storageKeys        localStorage keys this calculator writes, named outright
 * @param sharesViaUrl       whether it can produce a link containing the inputs
 * @param onClearStoredData  omit to hide the clear button
 */
export function DataDisclosure({ storageKeys = [], sharesViaUrl = false, onClearStoredData }) {
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
    <section id={DATA_ANCHOR} style={section} aria-labelledby={`${DATA_ANCHOR}-heading`}>
      <h2 id={`${DATA_ANCHOR}-heading`} style={heading}>
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

      {onClearStoredData && storageKeys.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${hairline}` }}>
          {cleared ? (
            <p style={{ fontSize: 12, color: positive, margin: 0, fontWeight: 600 }}>
              Stored data cleared from this browser.
            </p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={handleClear} style={dangerButton(confirming)}>
                {confirming ? "Delete everything, permanently" : "Clear stored data"}
              </button>
              {confirming && (
                <>
                  <button type="button" onClick={() => setConfirming(false)} style={plainButton}>
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

/**
 * What the output is and is not worth. Kept separate from the data disclosure.
 *
 * @param extraNotes  [{ title, body }] modeling limits specific to this calculator
 */
export function WarrantyDisclaimer({ extraNotes = [] }) {
  return (
    <section id={WARRANTY_ANCHOR} style={section} aria-labelledby={`${WARRANTY_ANCHOR}-heading`}>
      <h2 id={`${WARRANTY_ANCHOR}-heading`} style={heading}>
        Disclaimer
      </h2>

      <Item title="No warranty">
        This calculator is provided as is, with no warranty of any kind, express or implied, including any
        warranty of accuracy, merchantability, or fitness for a particular purpose. It may contain errors.
      </Item>

      <Item title="Not advice">
        Nothing here is tax, legal, investment, or financial advice, and using it creates no professional
        relationship. Verify anything you intend to rely on with a qualified professional and with primary
        sources.
      </Item>

      <Item title="Estimates, not predictions">
        Every figure rests on assumptions you supply and on published rates that change. Small changes to an
        assumption can move the result substantially, and a projection is not a forecast of what will happen.
      </Item>

      {extraNotes.map((note) => (
        <Item key={note.title} title={note.title}>
          {note.body}
        </Item>
      ))}

      <Item title="Your decision, your responsibility">
        You are solely responsible for any decision you make. The author accepts no liability for any loss
        arising from use of this tool or from reliance on its output.
      </Item>
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

const buttonBase = {
  padding: "5px 10px",
  minHeight: 34,
  fontSize: 11.5,
  fontWeight: 600,
  fontFamily: "inherit",
  borderRadius: 5,
  cursor: "pointer",
};

const plainButton = { ...buttonBase, color: body, background: "#fff", border: `1px solid ${rule}` };

function dangerButton(active) {
  return {
    ...buttonBase,
    color: active ? "#fff" : negative,
    background: active ? negative : "#fff",
    border: `1px solid ${negative}`,
  };
}
