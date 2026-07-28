// The list of saved comparisons, and switching between them.
//
// A comparison is a named group of offers. Offers live in one library and can
// belong to several comparisons at once, which is why removing an offer from
// one comparison deletes the record only when nothing else references it.

import { useState } from "react";
import { color, button, buttonPrimary, input as inputStyle } from "../theme.js";

export function ComparisonsMenu({
  comparisons,
  activeId,
  offersById,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const active = comparisons.find((c) => c.id === activeId);

  function beginRename(comparison) {
    setRenaming(comparison.id);
    setDraft(comparison.name || "");
  }

  function commitRename() {
    if (renaming) onRename(renaming, draft.trim());
    setRenaming(null);
    setDraft("");
  }

  function summarize(comparison) {
    const names = comparison.offerIds
      .map((id) => offersById[id]?.name?.trim())
      .filter(Boolean);
    if (names.length === 0) return "No offers";
    if (names.length <= 2) return names.join(" vs ");
    return `${names[0]} vs ${names.length - 1} others`;
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ ...button, minHeight: 34, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span aria-hidden="true" style={{ fontSize: 9, color: color.faint }}>
            {open ? "▾" : "▸"}
          </span>
          <strong style={{ fontWeight: 700 }}>{active?.name?.trim() || "Untitled comparison"}</strong>
          <span style={{ color: color.muted, fontWeight: 400 }}>
            {comparisons.length > 1 ? `· ${comparisons.length} saved` : ""}
          </span>
        </button>
        <button type="button" onClick={onCreate} style={{ ...button, minHeight: 34 }}>
          New comparison
        </button>
      </div>

      {open && (
        <ul
          style={{
            listStyle: "none",
            margin: "8px 0 0",
            padding: 0,
            border: `1px solid ${color.hairline}`,
            borderRadius: 8,
            background: color.surface,
            overflow: "hidden",
          }}
        >
          {comparisons.map((comparison) => {
            const isActive = comparison.id === activeId;
            const isRenaming = renaming === comparison.id;
            return (
              <li
                key={comparison.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderTop: `1px solid ${color.hairline}`,
                  background: isActive ? color.accentSoft : color.surface,
                  flexWrap: "wrap",
                }}
              >
                {isRenaming ? (
                  <>
                    <input
                      type="text"
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      style={{ ...inputStyle, flex: "1 1 140px", minWidth: 0 }}
                      aria-label="Comparison name"
                    />
                    <button type="button" onClick={commitRename} style={{ ...buttonPrimary, minHeight: 30 }}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(comparison.id);
                        setOpen(false);
                      }}
                      style={{
                        flex: "1 1 140px",
                        minWidth: 0,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          fontWeight: isActive ? 700 : 600,
                          color: color.ink,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {comparison.name?.trim() || "Untitled comparison"}
                        {comparison.importedAt ? " (imported)" : ""}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: color.muted }}>
                        {summarize(comparison)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => beginRename(comparison)}
                      style={{ ...button, minHeight: 30, flex: "0 0 auto" }}
                    >
                      Rename
                    </button>

                    {confirmDelete === comparison.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(comparison.id);
                          setConfirmDelete(null);
                        }}
                        style={{
                          ...button,
                          minHeight: 30,
                          flex: "0 0 auto",
                          color: color.surface,
                          background: color.negative,
                          borderColor: color.negative,
                        }}
                      >
                        Delete for good
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(comparison.id)}
                        disabled={comparisons.length === 1}
                        title={comparisons.length === 1 ? "The last comparison cannot be deleted" : undefined}
                        style={{ ...button, minHeight: 30, flex: "0 0 auto", color: color.negative }}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
