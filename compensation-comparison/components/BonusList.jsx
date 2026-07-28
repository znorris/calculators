// Editor for the `bonuses` list field.
//
// One line item covers signing, relocation, performance, and retention
// bonuses rather than four separate hardcoded fields, because the difference
// between them is when they pay, not what they are.

import { Field } from "./Field.jsx";
import { createListItem } from "../model/offer.js";
import { isFieldVisible } from "../model/schema.js";
import { color, button, iconButton } from "../theme.js";

export function BonusList({ field, items, onChange }) {
  function update(itemId, key, value) {
    onChange(items.map((it) => (it.id === itemId ? { ...it, [key]: value } : it)));
  }

  function remove(itemId) {
    onChange(items.filter((it) => it.id !== itemId));
  }

  function add() {
    onChange([...items, createListItem(field)]);
  }

  return (
    <div>
      {items.map((item, i) => (
        // Separated by a rule rather than boxed. A bordered, padded card
        // inside an already narrow column nests three levels of chrome deep
        // and costs about 48px of the column's width.
        <div
          key={item.id}
          style={{
            borderBottom: i < items.length - 1 ? `1px solid ${color.hairline}` : "none",
            paddingBottom: 4,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: color.muted, textTransform: "uppercase" }}>
              {item.label?.trim() || `Bonus ${i + 1}`}
            </span>
            <button type="button" onClick={() => remove(item.id)} style={iconButton} aria-label="Remove bonus">
              Remove
            </button>
          </div>
          {field.itemFields
            .filter((sub) => isFieldVisible(sub, item))
            .map((sub) => (
              <Field
                key={sub.id}
                field={sub}
                value={item[sub.id]}
                onChange={(v) => update(item.id, sub.id, v)}
                compact
              />
            ))}
        </div>
      ))}
      <button type="button" onClick={add} style={{ ...button, width: "100%" }}>
        {field.addLabel || "Add"}
      </button>
    </div>
  );
}
