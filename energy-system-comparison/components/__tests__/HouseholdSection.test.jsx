// @vitest-environment jsdom
//
// Regression coverage for the AI-import helper's "Copy research prompt"
// button: it used to fall back to window.prompt when navigator.clipboard was
// unavailable, unusable for a multi-thousand-character prompt (see
// shared/clipboard.js's header). This confirms the button now shows
// shared/CopyFallbackPanel.jsx instead, with the full prompt text selected,
// and that window.prompt is never called either way.
//
// Mounts with react-dom/client (not renderToStaticMarkup) since the copy flow
// is async/effect-driven -- see components/__tests__/ExplorerSection.test.jsx's
// header for the same jsdom opt-in this file uses.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HouseholdSection } from "../HouseholdSection.jsx";
import { defaultState } from "../../model/schema.js";
import { buildResearchPrompt } from "../../model/profileCodec.js";

let container;
let root;
const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true, writable: true });
  document.execCommand = originalExecCommand;
});

function customHousehold() {
  const state = defaultState();
  return { ...state.household, profileId: "custom" };
}

function findButton(text) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));
}

describe("HouseholdSection AI-import helper: copy-research-prompt fallback", () => {
  it("shows the inline fallback panel with the full prompt text selected when copying fails, and never calls window.prompt", async () => {
    // Neither copy path available -- the insecure/non-localhost-http case
    // shared/clipboard.js's header describes.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    document.execCommand = vi.fn(() => false);
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);

    act(() => {
      root.render(<HouseholdSection household={customHousehold()} onChange={() => {}} />);
    });

    const copyButton = findButton("Copy research prompt");
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton.click();
      // Flush the microtask copyText() awaits internally.
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = container.querySelector("textarea[readonly]");
    expect(textarea).toBeTruthy();
    const expectedPrompt = buildResearchPrompt({ utilityName: "", location: "" });
    expect(textarea.value).toBe(expectedPrompt);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(expectedPrompt.length);
    expect(container.textContent).toMatch(/Copying is blocked in this browser context/);

    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("shows 'Copied!' and no fallback panel when the Clipboard API succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });

    act(() => {
      root.render(<HouseholdSection household={customHousehold()} onChange={() => {}} />);
    });

    const copyButton = findButton("Copy research prompt");
    await act(async () => {
      copyButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findButton("Copied!")).toBeTruthy();
    expect(container.querySelector("textarea[readonly]")).toBeNull();
  });
});
