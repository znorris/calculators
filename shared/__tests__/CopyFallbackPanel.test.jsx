// @vitest-environment jsdom
//
// Coverage for CopyFallbackPanel's own contract: mounts with a readonly
// textarea already containing, focused on, and selecting the full text, plus
// a dismiss button -- never a window.prompt. Mounts with react-dom/client
// (not renderToStaticMarkup) since the auto-focus/auto-select behavior is
// effect-driven (see components/__tests__/smoke.test.jsx's header for why
// most of this repo's component tests render statically instead).

import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CopyFallbackPanel } from "../CopyFallbackPanel.jsx";

let container;
let root;

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

function render(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

describe("CopyFallbackPanel", () => {
  it("renders a readonly textarea containing the full text, auto-focused and with the full text selected", () => {
    const text = "a".repeat(5000) + "END";
    render(<CopyFallbackPanel text={text} onDismiss={() => {}} />);

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe(text);
    expect(textarea.readOnly).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(text.length);
  });

  it("shows the one-line instruction and never calls window.prompt", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);
    render(<CopyFallbackPanel text="some text" onDismiss={() => {}} />);

    expect(container.textContent).toMatch(/Copying is blocked in this browser context/);
    expect(container.textContent).toMatch(/Ctrl\/Cmd\+C/);
    expect(promptSpy).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<CopyFallbackPanel text="some text" onDismiss={onDismiss} />);

    const dismissButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "Dismiss");
    act(() => dismissButton.click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("re-selects the full text if it loses and regains focus", () => {
    render(<CopyFallbackPanel text="reselect me" onDismiss={() => {}} />);
    const textarea = container.querySelector("textarea");

    act(() => textarea.blur());
    act(() => textarea.focus());
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe("reselect me".length);
  });
});
