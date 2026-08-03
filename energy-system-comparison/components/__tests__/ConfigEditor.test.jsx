// @vitest-environment jsdom
//
// Coverage for the inline config rename affordance: config cards used to
// show only "Config A"/"Config B" with no way to give a config a real name.
// This exercises the actual click-to-edit interaction (pencil button ->
// text input -> Enter/blur commits, Escape cancels, an empty/whitespace
// draft reverts) against a mounted ConfigEditor, and confirms a committed
// rename survives model/schema.js's normalizeState round-trip the way a
// share link or localStorage save would run it through.
//
// This repo's other component tests render statically with
// react-dom/server (see smoke.test.jsx's header); this file opts into jsdom
// (per-file environment override, same as
// components/__tests__/ExplorerSection.test.jsx) because typing into a real
// input and dispatching keyboard events needs a real DOM.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ConfigEditor } from "../ConfigEditor.jsx";
import { defaultState, normalizeState } from "../../model/schema.js";

let container;
let root;
let latestConfigs;

/** Keeps configs in real component state, like App.jsx does, so a rename actually round-trips through onChange -> re-render. */
function Harness({ initialConfigs }) {
  const [configs, setConfigs] = useState(initialConfigs);
  latestConfigs = configs;
  return (
    <ConfigEditor
      configs={configs}
      allowedFinancing={["cash", "loan"]}
      onChange={(next) => {
        latestConfigs = next;
        setConfigs(next);
      }}
    />
  );
}

function renderHarness(configs) {
  act(() => {
    root.render(<Harness initialConfigs={configs} />);
  });
}

function pencilButton() {
  return container.querySelector('button[aria-label="Rename configuration"]');
}

function nameInput() {
  return container.querySelector('input[aria-label="Configuration name"]');
}

function setValueAndInput(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ConfigEditor: inline config rename", () => {
  it("shows the plain name with a pencil button, no input, before editing starts", () => {
    const state = defaultState();
    renderHarness(state.configs);

    expect(container.textContent).toContain("Config A");
    expect(pencilButton()).toBeTruthy();
    expect(nameInput()).toBeNull();
  });

  it("clicking the pencil opens an input seeded with the current name, and Enter commits a new one", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    expect(input).toBeTruthy();
    expect(input.value).toBe("A");

    act(() => setValueAndInput(input, "Roof array"));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(nameInput()).toBeNull(); // back to display mode
    expect(latestConfigs[0].name).toBe("Roof array");
    expect(container.textContent).toContain("Config Roof array");
  });

  it("commits on blur the same as Enter", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    act(() => setValueAndInput(input, "Blur commit"));
    // React delegates onBlur through the native "focusout" event (blur
    // itself doesn't bubble, see shared/Tooltip.jsx's header for the same
    // point about onFocus/onBlur), so that's what needs dispatching here.
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

    expect(latestConfigs[0].name).toBe("Blur commit");
  });

  it("trims surrounding whitespace and caps the name at 40 characters", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    const overlong = "  " + "x".repeat(60) + "  ";
    act(() => setValueAndInput(input, overlong));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(latestConfigs[0].name).toBe("x".repeat(40));
  });

  it("Escape cancels without committing, leaving the original name in place", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    act(() => setValueAndInput(input, "Should not stick"));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(nameInput()).toBeNull();
    expect(latestConfigs[0].name).toBe("A");
    expect(container.textContent).toContain("Config A");
  });

  it("reverts to the original name when the draft is empty or whitespace-only, rather than committing a blank name", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    act(() => setValueAndInput(input, "   "));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(latestConfigs[0].name).toBe("A");
    expect(container.textContent).toContain("Config A");
  });

  it("a committed rename survives normalizeState's round-trip, the same normalization a share link or localStorage load runs through", () => {
    const state = defaultState();
    renderHarness(state.configs);

    act(() => pencilButton().click());
    const input = nameInput();
    act(() => setValueAndInput(input, "Roof + battery"));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(latestConfigs[0].name).toBe("Roof + battery");

    const normalized = normalizeState({ ...state, configs: latestConfigs });
    expect(normalized.configs[0].name).toBe("Roof + battery");
    // The untouched second config's generated letter name survives the same round-trip.
    expect(normalized.configs[1].name).toBe("B");
  });
});
