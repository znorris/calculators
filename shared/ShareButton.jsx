import { useState } from "react";
import { buildShareUrl } from "./urlState.js";
import { copyText } from "./clipboard.js";
import { CopyFallbackPanel } from "./CopyFallbackPanel.jsx";

export function ShareButton({ getState, style }) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);

  async function handleClick() {
    const url = buildShareUrl(getState());
    const succeeded = await copyText(url);
    if (succeeded) {
      setFallbackUrl(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFallbackUrl(url);
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button
        onClick={handleClick}
        style={style}
        title="Copy a shareable link with your current inputs"
      >
        {copied ? "Copied!" : "Share link"}
      </button>
      {fallbackUrl && <CopyFallbackPanel text={fallbackUrl} onDismiss={() => setFallbackUrl(null)} />}
    </div>
  );
}
