// @vitest-environment jsdom
//
// Regression coverage for Tooltip.jsx's shared stylesheet: it used to render
// its own <style> tag inside every instance, so a page with N tooltips (a
// Field with help text, a Term, ...) shipped N duplicate copies of the same
// rules. This needs a real DOM (document.head) to check against, so it
// mounts with react-dom/client rather than rendering statically (see
// energy-system-comparison/components/__tests__/smoke.test.jsx's header for
// why most of this repo's component tests render statically instead, and
// energy-system-comparison/components/__tests__/ExplorerSection.test.jsx for
// the same per-file jsdom opt-in this file uses).

import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Tooltip } from "../Tooltip.jsx";

let container;
let root;

afterEach(() => {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  container?.remove();
  document.head.querySelectorAll("#shared-tooltip-styles").forEach((el) => el.remove());
});

describe("Tooltip shared stylesheet", () => {
  it("inserts exactly one <style> element into document.head, no matter how many Tooltip instances render, and adds no other <style> element anywhere in the document", () => {
    const styleCountBefore = document.querySelectorAll("style").length;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Tooltip id="t1" content="First">
            <span>One</span>
          </Tooltip>
          <Tooltip id="t2" content="Second">
            <span>Two</span>
          </Tooltip>
          <Tooltip id="t3" content="Third">
            <span>Three</span>
          </Tooltip>
        </div>,
      );
    });

    const styleEls = document.head.querySelectorAll("#shared-tooltip-styles");
    expect(styleEls).toHaveLength(1);
    expect(styleEls[0].tagName).toBe("STYLE");
    expect(styleEls[0].textContent).toContain(".shared-tooltip-pop");

    // Three instances mounted, but the document-wide <style> count only grew
    // by the one shared singleton above -- no per-instance duplicate landed
    // anywhere else in the document (head or the render container).
    expect(document.querySelectorAll("style")).toHaveLength(styleCountBefore + 1);
  });

  it("does not insert a second copy when a later Tooltip mounts after the first is already present", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <Tooltip id="t1" content="First">
          <span>One</span>
        </Tooltip>,
      );
    });
    expect(document.head.querySelectorAll("#shared-tooltip-styles")).toHaveLength(1);
    const styleCountAfterFirst = document.querySelectorAll("style").length;

    act(() => {
      root.render(
        <div>
          <Tooltip id="t1" content="First">
            <span>One</span>
          </Tooltip>
          <Tooltip id="t2" content="Second, mounted later">
            <span>Two</span>
          </Tooltip>
        </div>,
      );
    });
    expect(document.head.querySelectorAll("#shared-tooltip-styles")).toHaveLength(1);
    expect(document.querySelectorAll("style")).toHaveLength(styleCountAfterFirst);
  });
});
