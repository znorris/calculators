import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "../debounce.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("calls fn once, after waitMs, with the last call's arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced("first");
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();

    debounced("second");
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled(); // the first call's timer was reset, not just added to

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });

  it("cancel() prevents a pending call from ever firing", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced("value");
    debounced.cancel();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });

  it("fires again on a later call after a previous one already completed", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced("a");
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced("b");
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });
});
