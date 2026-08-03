// Clipboard write with a same-page fallback for an insecure or unsupported
// context, used by every copy affordance across these calculators (shared/
// ShareButton.jsx, each calculator's own share-link button, and
// energy-system-comparison/components/HouseholdSection.jsx's AI-import
// helper).
//
// navigator.clipboard requires a secure context (https, or the browser's own
// localhost exception) -- an app browsed over plain http from a LAN address
// (e.g. http://10.0.0.132:5173) does not qualify, so `navigator.clipboard`
// itself is undefined there, not merely permission-denied. copyText never
// falls back to window.prompt for that case: a blocking modal dialog is a
// poor fit for a multi-thousand-character value (energy-system-comparison's
// AI research prompt in particular), and some browsers' prompt dialogs
// visibly truncate long text. Instead it tries the legacy
// textarea+execCommand("copy") technique, which is not gated by secure
// context, and only reports failure to its caller once both paths are
// exhausted -- the caller (each copy button) is expected to render its own
// inline fallback UI (see shared/CopyFallbackPanel.jsx) rather than this
// module doing anything itself beyond the copy attempt.

/**
 * @param {string} text
 * @returns {Promise<boolean>} true if either the Clipboard API or the legacy
 *   execCommand path actually copied `text`; false if both failed.
 */
export async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Falls through to the legacy path -- a rejection here (permission
      // denied, or a browser that exposes the API but blocks the call) is
      // not a guarantee the legacy path will fail too.
    }
  }
  return legacyCopy(text);
}

/**
 * The pre-Clipboard-API copy technique: a hidden, off-screen textarea is
 * inserted, its text selected, then document.execCommand("copy") copies the
 * current selection. Chromium and Firefox still support this on an insecure
 * origin -- the Clipboard API's secure-context restriction is specific to
 * that newer API, not to copying via execCommand -- so this is what actually
 * succeeds on an http LAN origin. Returns false rather than throwing on any
 * failure, including in an environment with no `document` at all (SSR) or
 * one where execCommand doesn't exist (an old or non-browser environment).
 */
function legacyCopy(text) {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Off-screen via position, not display:none/visibility:hidden -- a hidden
  // element cannot be focused or have a text selection to copy.
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.setAttribute("readonly", "");
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let succeeded = false;
  try {
    succeeded = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);
  return succeeded;
}
