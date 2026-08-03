// Profile-aware display name for the active utility, shared by every piece
// of copy that used to hard-code "LEU"/"Lodi" regardless of which profile is
// actually active (App.jsx's DISCLOSURE_NOTES and AssumptionsControls,
// ConfigEditor.jsx's size-cap warning, ExplorerSection.jsx's size-cap copy).
// Derived purely from `household` (profileId, customProfileInputs.label) --
// nothing here needs the resolved engine profile, so a component that
// already receives `household` (every one of the call sites above does, or
// can cheaply be given it) needs no new plumbing to the worker's output just
// for a display name.

/** True when the active profile is the built-in Lodi profile, false for a custom tariff. */
export function isLodiProfile(household) {
  return household?.profileId !== "custom";
}

/**
 * Display name for a custom profile: the utility name the user entered or
 * imported, or the generic "your utility" when it's still the custom-profile
 * form's own blank-starting-point placeholder (model/schema.js's
 * DEFAULT_CUSTOM_PROFILE_INPUTS.label, "Custom Utility") or genuinely empty --
 * "Custom Utility" reads like a placeholder, not a real utility's name, so
 * copy that would otherwise show it verbatim falls back to "your utility"
 * instead.
 */
export function customUtilityLabel(household) {
  const label = household?.customProfileInputs?.label?.trim();
  return label && label !== "Custom Utility" ? label : "your utility";
}
