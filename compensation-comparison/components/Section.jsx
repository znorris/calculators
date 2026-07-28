// A collapsible container. Every section renders on every offer whether or
// not it holds data; compression means collapsing to the header, not
// disappearing.
//
// Open state is owned by the comparison rather than by an individual offer,
// because offers are columns sharing one row set and a container open in one
// column but closed in another would break alignment.

import { color } from "../theme.js";

const headerStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  border: "none",
  borderRadius: 0,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.2,
  textTransform: "uppercase",
  fontFamily: "inherit",
  textAlign: "left",
  minHeight: 38,
};

export function Section({ section, open, onToggle, hasData, children }) {
  const locked = !!section.alwaysOpen;

  const dot = hasData ? (
    <span
      aria-label="has data"
      title="This offer has values in this section"
      style={{ width: 5, height: 5, borderRadius: "50%", background: color.accent, flex: "0 0 auto" }}
    />
  ) : null;

  return (
    <section style={{ borderTop: `1px solid ${color.hairline}`, background: color.surface }}>
      <h3 style={{ margin: 0 }}>
        {locked ? (
          // Rendered as a plain element rather than a disabled button. A
          // disabled button matches the global button:disabled rule and would
          // dim the two most important sections to 40% opacity.
          <div style={{ ...headerStyle, background: color.surface, color: color.muted, cursor: "default" }}>
            <span style={{ flex: 1 }}>{section.label}</span>
            {dot}
          </div>
        ) : (
          <button
            type="button"
            className="section-toggle"
            onClick={onToggle}
            aria-expanded={open}
            style={{
              ...headerStyle,
              // color.muted is 4.35:1 on the tint, just under AA, so the
              // collapsed state uses body instead.
              background: open ? color.surface : color.tint,
              color: open ? color.muted : color.body,
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 9, color: color.faint, width: 8 }}>
              {open ? "▾" : "▸"}
            </span>
            <span style={{ flex: 1 }}>{section.label}</span>
            {dot}
          </button>
        )}
      </h3>
      {open && <div style={{ padding: "2px 12px 12px" }}>{children}</div>}
    </section>
  );
}
