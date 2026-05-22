import { useState, useEffect, useRef } from "react";
import { loadScenarios, saveScenarios, createScenario } from "./scenarios.js";

export function ScenariosMenu({
  storageKey,
  getCurrentState,
  applyScenario,
  activeId,
  setActiveId,
  buttonStyle,
}) {
  const [scenarios, setScenarios] = useState(() => loadScenarios(storageKey));
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function persist(next) {
    setScenarios(next);
    saveScenarios(storageKey, next);
  }

  function handleSaveNew() {
    const name = newName.trim();
    if (!name) return;
    const s = createScenario(name, getCurrentState());
    persist([...scenarios, s]);
    setNewName("");
    setActiveId?.(s.id);
  }

  function handleLoad(s) {
    applyScenario(s.inputs);
    setActiveId?.(s.id);
    setOpen(false);
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this scenario?")) return;
    persist(scenarios.filter(s => s.id !== id));
    if (activeId === id) setActiveId?.(null);
  }

  function handleRename(id) {
    const name = renameValue.trim();
    if (!name) return;
    persist(scenarios.map(s =>
      s.id === id ? { ...s, name, updatedAt: Date.now() } : s
    ));
    setRenamingId(null);
  }

  function handleOverwrite(id) {
    if (!window.confirm("Overwrite this scenario with the current values?")) return;
    persist(scenarios.map(s =>
      s.id === id ? { ...s, inputs: getCurrentState(), updatedAt: Date.now() } : s
    ));
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <style>{`
        .sv-scen-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          z-index: 100;
          background: #fff;
          border: 1px solid #e2e5ea;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          min-width: 260px;
          max-width: calc(100vw - 24px);
          padding: 8px;
        }
        @media (max-width: 640px) {
          .sv-scen-dropdown { right: auto; left: 0; }
        }
      `}</style>
      <button onClick={() => setOpen(o => !o)} style={buttonStyle}>
        Scenarios {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="sv-scen-dropdown">
          {scenarios.length === 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8", padding: "6px 8px", fontStyle: "italic" }}>
              No saved scenarios yet.
            </div>
          )}
          {scenarios.map(s => (
            <div
              key={s.id}
              style={{
                display: "flex", alignItems: "center", padding: "4px 6px",
                borderRadius: 4, marginBottom: 2,
                background: activeId === s.id ? "#f1f5f9" : "transparent",
              }}
            >
              {renamingId === s.id ? (
                <>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleRename(s.id);
                      else if (e.key === "Escape") setRenamingId(null);
                    }}
                    style={inlineInput}
                  />
                  <button onClick={() => handleRename(s.id)} style={iconBtn} title="Save name">save</button>
                  <button onClick={() => setRenamingId(null)} style={iconBtn} title="Cancel">cancel</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleLoad(s)}
                    style={{
                      flex: 1, textAlign: "left", border: "none",
                      background: "transparent", fontSize: 12,
                      color: "#1e293b", cursor: "pointer", padding: "2px 0",
                      fontWeight: activeId === s.id ? 600 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title="Load this scenario"
                  >
                    {s.name}
                  </button>
                  {activeId === s.id && (
                    <button onClick={() => handleOverwrite(s.id)} style={iconBtn} title="Overwrite with current values">save</button>
                  )}
                  <button
                    onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}
                    style={iconBtn}
                    title="Rename"
                  >rename</button>
                  <button onClick={() => handleDelete(s.id)} style={iconBtn} title="Delete">×</button>
                </>
              )}
            </div>
          ))}
          <div style={{
            borderTop: scenarios.length > 0 ? "1px solid #eef0f4" : "none",
            marginTop: scenarios.length > 0 ? 4 : 0,
            paddingTop: scenarios.length > 0 ? 6 : 0,
            display: "flex", gap: 4,
          }}>
            <input
              placeholder="Name new scenario..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveNew(); }}
              style={inlineInput}
            />
            <button
              onClick={handleSaveNew}
              disabled={!newName.trim()}
              style={{
                padding: "4px 10px", border: "1px solid #dde0e6",
                borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: newName.trim() ? "#1e293b" : "#f1f5f9",
                color: newName.trim() ? "#fff" : "#94a3b8",
                cursor: newName.trim() ? "pointer" : "not-allowed",
              }}
            >Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  border: "none", background: "transparent", color: "#94a3b8",
  fontSize: 10, padding: "2px 5px", cursor: "pointer", marginLeft: 2,
  textTransform: "none", letterSpacing: "normal",
};

const inlineInput = {
  flex: 1, padding: "5px 8px", border: "1px solid #dde0e6",
  borderRadius: 4, fontSize: 12, minWidth: 0,
};
