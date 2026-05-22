// localStorage CRUD for named scenarios.

export function loadScenarios(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveScenarios(key, scenarios) {
  try {
    localStorage.setItem(key, JSON.stringify(scenarios));
  } catch (e) {}
}

export function createScenario(name, inputs) {
  return {
    id: (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    name,
    inputs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
