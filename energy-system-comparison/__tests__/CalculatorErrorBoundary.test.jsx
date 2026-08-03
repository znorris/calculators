// @vitest-environment jsdom
//
// Regression coverage for App.jsx's CalculatorErrorBoundary: a render
// exception anywhere in the calculator's main tree (a malformed custom
// tariff shape that somehow still reaches a component render despite
// model/schema.js's normalization, or any future bug in a child component)
// used to unmount the whole tree with nothing rendered in its place -- a
// blank page, per the adversarial-verification probe that reproduced it
// against a hand-edited share link. This mounts the boundary directly around
// a component that always throws, rather than exercising App.jsx's own
// worker-driven state (which has no test harness here -- see
// components/__tests__/smoke.test.jsx's header for why this repo's component
// tests otherwise render statically), so it needs a real DOM and react-dom/
// client to catch the error the same way React does at runtime.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CalculatorErrorBoundary } from "../App.jsx";

function Boom() {
  throw new Error("boom");
}

let container;
let root;

afterEach(() => {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  container?.remove();
});

describe("CalculatorErrorBoundary", () => {
  it("catches a child render error and shows the reset panel instead of unmounting to a blank page", () => {
    // React logs a caught render error to console.error even when a boundary
    // handles it; expected here, so it's silenced for the duration of this
    // one render rather than failing the test on noise.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <CalculatorErrorBoundary onReset={() => {}}>
          <Boom />
        </CalculatorErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("Can't compute a result yet");
    const resetButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset to defaults");
    expect(resetButton).toBeTruthy();

    consoleError.mockRestore();
  });

  it("calls the onReset prop when the reset button is clicked", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <CalculatorErrorBoundary onReset={onReset}>
          <Boom />
        </CalculatorErrorBoundary>,
      );
    });

    const resetButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reset to defaults");
    act(() => {
      resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReset).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <CalculatorErrorBoundary onReset={() => {}}>
          <div>All good</div>
        </CalculatorErrorBoundary>,
      );
    });

    expect(container.textContent).toBe("All good");
  });
});
