import { useState } from "react";
import { createScenario, loadScenarios, saveScenarios } from "./scenarios.js";

export function ShareBanner({ visible, onDismiss, scenariosKey, getState, setActiveId }) {
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");

  if (!visible) return null;

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const all = loadScenarios(scenariosKey);
    const s = createScenario(trimmed, getState());
    saveScenarios(scenariosKey, [...all, s]);
    setActiveId?.(s.id);
    onDismiss();
  }

  return (
    <div style={{
      background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8,
      padding: "10px 14px", marginBottom: 16, display: "flex",
      alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ fontSize: 12, color: "#1e293b", flex: "1 1 200px" }}>
        Loaded from a share link. {showInput ? "Name your scenario:" : "Save as a scenario to keep this set?"}
      </div>
      {showInput ? (
        <>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            placeholder="Scenario name"
            style={{
              padding: "4px 8px", border: "1px solid #bfdbfe",
              borderRadius: 4, fontSize: 12, minWidth: 140,
            }}
          />
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              padding: "4px 10px", border: "none", background: "#1e293b",
              color: "#fff", borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: name.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() ? 1 : 0.5,
            }}
          >Save</button>
          <button
            onClick={onDismiss}
            style={{
              padding: "4px 8px", border: "none", background: "transparent",
              color: "#64748b", fontSize: 11, cursor: "pointer",
            }}
          >Cancel</button>
        </>
      ) : (
        <>
          <button
            onClick={() => setShowInput(true)}
            style={{
              padding: "4px 10px", border: "1px solid #bfdbfe",
              background: "#fff", color: "#1e3a5f", borderRadius: 4,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >Save as scenario</button>
          <button
            onClick={onDismiss}
            style={{
              padding: "4px 8px", border: "none", background: "transparent",
              color: "#64748b", fontSize: 11, cursor: "pointer",
            }}
          >Dismiss</button>
        </>
      )}
    </div>
  );
}
