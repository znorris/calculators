// @vitest-environment jsdom
//
// Coverage for copyText's fallback ordering: navigator.clipboard requires a
// secure context (https, or the browser's own localhost exception), so an
// app browsed over plain http from a LAN address has `navigator.clipboard`
// undefined outright, not merely permission-denied -- see clipboard.js's
// header for why this matters (a multi-thousand-character research prompt is
// unusable via window.prompt, which this module never falls back to).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyText } from "../clipboard.js";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true, writable: true });
  document.execCommand = originalExecCommand;
  document.querySelectorAll("textarea").forEach((el) => el.remove());
});

describe("copyText: Clipboard API path", () => {
  it("returns true and never touches the legacy path when navigator.clipboard.writeText succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    document.execCommand = vi.fn(() => {
      throw new Error("legacy path should not run");
    });

    const result = await copyText("hello");
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});

describe("copyText: falls back to the legacy execCommand path", () => {
  it("calls execCommand('copy') when navigator.clipboard is undefined (the insecure-context case)", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    document.execCommand = vi.fn(() => true);

    const result = await copyText("fallback text");
    expect(result).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    // No textarea left behind after a successful copy.
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("calls execCommand('copy') when navigator.clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    document.execCommand = vi.fn(() => true);

    const result = await copyText("fallback text");
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when both the Clipboard API and execCommand fail -- never window.prompt", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    document.execCommand = vi.fn(() => false);
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => null);

    const result = await copyText("unreachable");
    expect(result).toBe(false);
    expect(promptSpy).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it("returns false rather than throwing when execCommand itself throws", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    document.execCommand = vi.fn(() => {
      throw new Error("not supported");
    });

    await expect(copyText("text")).resolves.toBe(false);
  });

  it("returns false rather than throwing when execCommand does not exist at all", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    // @ts-expect-error -- simulating an environment with no execCommand
    document.execCommand = undefined;

    await expect(copyText("text")).resolves.toBe(false);
  });
});
