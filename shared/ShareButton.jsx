import { useState } from "react";
import { buildShareUrl } from "./urlState.js";

export function ShareButton({ getState, style }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = buildShareUrl(getState());
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      window.prompt("Copy this share link:", url);
    }
  }

  return (
    <button
      onClick={handleClick}
      style={style}
      title="Copy a shareable link with your current inputs"
    >
      {copied ? "Copied!" : "Share link"}
    </button>
  );
}
