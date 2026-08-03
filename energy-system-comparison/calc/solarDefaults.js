// Loss and inverter-efficiency defaults, split out of calc/solar.js into
// their own module with no other dependency, so a caller that only needs
// these two numbers (components/SolarArraysEditor.jsx, for its default-value
// placeholders) never pulls in calc/solar.js's static import of
// data/solar-shapes.json (a ~2.4 MB PVWatts hourly grid) just to read them.
// calc/solar.js re-exports both names from here for every other caller, so
// this split changes no import path for anyone already importing them from
// calc/solar.js.

/**
 * Loss and inverter-efficiency assumptions already baked into every array in
 * data/solar-shapes.json (PVWatts params.losses / params.inv_eff). Any
 * lossFrac/inverterEff an array specifies is expressed relative to this
 * baseline, not as an absolute derate on top of it, so the assumptions page
 * can show the PVWatts defaults a caller inherits by not overriding them.
 */
export const DEFAULT_LOSS_FRAC = 0.14;
export const DEFAULT_INVERTER_EFF = 0.96;
