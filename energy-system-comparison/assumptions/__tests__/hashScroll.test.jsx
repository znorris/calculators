// @vitest-environment jsdom
//
// Regression coverage for cold navigation to assumptions/#glossary: the
// browser's own scroll-to-anchor pass runs before this page's React tree has
// rendered anything (nothing with id="glossary" exists in the DOM yet at
// that point), so it lands on the empty page top instead of the glossary
// section. App.jsx's useHashScrollOnMount effect re-does that scroll once
// this page's own content has committed. This repo's other component tests
// render statically with react-dom/server (see
// components/__tests__/smoke.test.jsx's header); this file opts into jsdom
// (per-file environment override, matching
// components/__tests__/ExplorerSection.test.jsx's own pattern) because a
// mount effect -- and window.location.hash -- need a real DOM.
//
// jsdom has no layout engine, so Element.prototype.scrollIntoView is not
// implemented there; it's replaced with a spy so this only asserts that App
// asked the right element to scroll, not that any scrolling visibly happened.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../App.jsx";

async function flushRaf() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe("assumptions page: cold-navigation hash scroll", () => {
  let container;
  let root;
  let scrollSpy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    scrollSpy = HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    root?.unmount();
    container.remove();
    window.location.hash = "";
  });

  it("scrolls the hash target into view once the page has rendered", async () => {
    window.location.hash = "#glossary";

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });
    await flushRaf();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.instances[0].id).toBe("glossary");
  });

  it("does nothing when there is no hash", async () => {
    window.location.hash = "";

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });
    await flushRaf();

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the hash names an id that isn't on the page", async () => {
    window.location.hash = "#not-a-real-section";

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });
    await flushRaf();

    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
