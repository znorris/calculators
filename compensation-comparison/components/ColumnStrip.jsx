// Column layout, and the only component that decides how wide a column is.
//
// Desktop holds the pinned column in view on the left and scrolls the rest
// horizontally beside it. Narrow viewports show exactly one column at a time
// at full width, with a switcher, because a side-by-side comparison does not
// survive a phone screen. The report is one of the switchable columns, not a
// separate screen, and it comes first.

import { useEffect, useRef, useState } from "react";
import { REPORT_COLUMN_ID } from "../model/comparison.js";
import { color, button, COLUMN_WIDTH } from "../theme.js";

const NARROW_QUERY = "(max-width: 760px)";

export function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return narrow;
}

/**
 * @param columns  [{ id, label, node }] in render order, report first
 * @param pinnedId column held in view on wide screens
 */
export function ColumnStrip({ columns, pinnedId, onPin, activeId, onActivate }) {
  const isNarrow = useIsNarrow();

  if (isNarrow) return <NarrowStrip columns={columns} activeId={activeId} onActivate={onActivate} />;
  return <WideStrip columns={columns} pinnedId={pinnedId} onPin={onPin} />;
}

function NarrowStrip({ columns, activeId, onActivate }) {
  const active = columns.find((c) => c.id === activeId) || columns[0];
  const activeTab = useRef(null);

  // The strip scrolls once there are more tabs than fit, so switching to a
  // column, or adding one, has to bring its tab into view. Without this a new
  // offer's tab lands off-screen with nothing indicating it exists.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active?.id]);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Columns"
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 10,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {columns.map((c) => {
          const selected = c.id === active?.id;
          return (
            <button
              key={c.id}
              ref={selected ? activeTab : null}
              role="tab"
              aria-selected={selected}
              onClick={() => onActivate(c.id)}
              style={{
                ...button,
                // 40px keeps the tab inside a comfortable touch target.
                minHeight: 40,
                padding: "8px 14px",
                fontSize: 13,
                whiteSpace: "nowrap",
                flex: "0 0 auto",
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                background: selected ? color.accent : color.surface,
                color: selected ? color.surface : color.body,
                borderColor: selected ? color.accent : color.rule,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Full width, not a fixed column width. A phone has no room to spare. */}
      <div style={{ width: "100%" }}>{active?.node}</div>
    </div>
  );
}

function WideStrip({ columns, pinnedId, onPin }) {
  const pinned = columns.find((c) => c.id === pinnedId);
  const rest = columns.filter((c) => c.id !== pinnedId);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      {pinned && (
        <div
          style={{
            position: "sticky",
            top: 12,
            flex: `0 0 ${COLUMN_WIDTH.pinned}px`,
            // A flex item defaults to min-width:auto, which lets content
            // widen it and leaves descendants measuring an unsettled width.
            minWidth: 0,
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
          }}
        >
          {pinned.node}
          {pinned.id !== REPORT_COLUMN_ID && (
            <button
              type="button"
              onClick={() => onPin(REPORT_COLUMN_ID)}
              style={{ ...button, marginTop: 6, width: "100%" }}
            >
              Pin the report instead
            </button>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 10,
          flex: 1,
          minWidth: 0,
          alignItems: "flex-start",
        }}
      >
        {rest.map((c) => (
          <div key={c.id} style={{ flex: `0 0 ${COLUMN_WIDTH.offer}px`, minWidth: 0 }}>
            {c.node}
          </div>
        ))}
      </div>
    </div>
  );
}
