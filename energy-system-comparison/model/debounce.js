// A generic trailing-edge debounce: calls `fn` with the most recent
// arguments `waitMs` after the last call, resetting the timer on every call
// in between. Extracted as a plain function (not a hook) so it's testable
// with vitest's fake timers without mounting a component -- this repo has no
// jsdom/testing-library dependency (see components/__tests__/smoke.test.jsx).

export function debounce(fn, waitMs) {
  let timer = null;

  function debounced(...args) {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }

  debounced.cancel = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
