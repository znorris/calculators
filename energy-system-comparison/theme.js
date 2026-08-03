// Style tokens, kept in one place so the inline styles used across this
// calculator stay consistent with the other two in this repo.

// Contrast ratios below are against white unless noted. Anything carrying
// text must clear 4.5:1, the WCAG AA floor for normal-size text. An earlier
// version of this palette failed that in four places because the pairings
// were never checked, so the ratio is recorded next to each token.
export const color = {
  ink: "#0f172a", // 17.9:1
  body: "#374151", // 9.2:1, and 9.4:1 on tint
  muted: "#64748b", // 4.76:1 on white, 4.35:1 on tint, so not safe on tint
  faint: "#94a3b8", // 2.4:1. DECORATIVE ONLY. Never use for text a reader needs.
  hairline: "#e2e5ea",
  rule: "#cbd5e1",
  surface: "#ffffff",
  page: "#f8f9fa",
  tint: "#f1f5f9",

  accent: "#4f46e5", // 7.5:1
  accentSoft: "#eef2ff",
  positive: "#047857", // 4.9:1. Was #059669 at 3.8:1, which failed.
  positiveSoft: "#f0fdf4",
  negative: "#dc2626", // 4.8:1
  negativeSoft: "#fef2f2",
  caution: "#b45309", // 4.9:1
  cautionSoft: "#fffbeb",
};

/**
 * Desktop column widths. Only ColumnStrip reads these; the column components
 * render at 100% and let the layout decide, so a phone gets the full screen
 * rather than a 300px column with dead space beside it.
 *
 * The report is wider than an offer because it is the primary comparison
 * surface and carries prose, a chart, and two tables, none of which are
 * legible in the same width as a stack of input fields.
 */
/**
 * One color per offer, assigned by position and reused across every chart so a
 * given offer keeps its color throughout the report.
 */
export const SERIES_COLORS = ["#4f46e5", "#0284c7", "#047857", "#b45309", "#be123c", "#7c3aed"];

export function offerColor(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export const COLUMN_WIDTH = {
  offer: 300,
  pinned: 380,
};

export const card = {
  background: color.surface,
  border: `1px solid ${color.hairline}`,
  borderRadius: 10,
};

export const label = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: color.muted,
  marginBottom: 3,
};

export const input = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 12.5,
  color: color.ink,
  border: `1px solid ${color.rule}`,
  borderRadius: 5,
  background: color.surface,
  fontFamily: "inherit",
};

export const help = {
  fontSize: 11,
  lineHeight: 1.45,
  color: color.muted,
  margin: "3px 0 0",
};

export const button = {
  padding: "5px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  color: color.body,
  background: color.surface,
  border: `1px solid ${color.rule}`,
  borderRadius: 5,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const buttonPrimary = {
  ...button,
  color: color.surface,
  background: color.accent,
  borderColor: color.accent,
};

// Repeated row controls sit next to each other, so they need a real touch
// target rather than the base button's dimensions shrunk. 32px clears the
// 24px WCAG minimum with room for an imprecise thumb.
export const iconButton = {
  ...button,
  padding: "6px 10px",
  minHeight: 32,
  fontSize: 11.5,
  lineHeight: 1.3,
};
