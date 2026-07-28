// Editor for any `list` schema field: bonuses, equity grants, and whatever
// comes next. The field descriptor supplies the item shape, so this component
// knows nothing about what it is editing.
//
// Items are separated by a rule rather than boxed. A bordered, padded card
// inside an already narrow column nests three levels of chrome deep and eats
// roughly 48px of the column's width.

import { Field } from "./Field.jsx";
import { createListItem } from "../model/offer.js";
import { isFieldVisible } from "../model/schema.js";
import { color, button, iconButton } from "../theme.js";

export function ListEditor({ field, items, onChange }) {
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
        <div
          key={item.id}
          style={{
            borderBottom: i < items.length - 1 ? `1px solid ${color.hairline}` : "none",
            paddingBottom: 4,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: color.muted,
                textTransform: "uppercase",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.label?.trim() || `${field.itemNoun || "Item"} ${i + 1}`}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              style={{ ...iconButton, flex: "0 0 auto" }}
              aria-label={`Remove ${field.itemNoun || "item"} ${i + 1}`}
            >
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

      <button type="button" onClick={add} style={{ ...button, width: "100%", minHeight: 36 }}>
        {field.addLabel || "Add"}
      </button>
    </div>
  );
}
