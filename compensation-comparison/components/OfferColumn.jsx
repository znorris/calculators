// One offer column: the editable input surface. Comparison lives in the
// report column, so no deltas are rendered inline here.

import { Section } from "./Section.jsx";
import { Field } from "./Field.jsx";
import { ListEditor } from "./ListEditor.jsx";
import { SECTIONS, isFieldVisible } from "../model/schema.js";
import { sectionHasData, offerLabel } from "../model/offer.js";
import { money } from "../format.js";
import { card, color, iconButton } from "../theme.js";

export function OfferColumn({
  offer,
  projection,
  isBaseline,
  isPinned,
  openSections,
  onToggleSection,
  onChangeField,
  onMakeBaseline,
  onDuplicate,
  onRemove,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}) {
  const total = projection?.cumulative?.[projection.cumulative.length - 1];

  return (
    // Sizing belongs to ColumnStrip, which is the only component that knows
    // whether it is laying out a scrolling desktop row or a single full-width
    // phone column. A fixed width here would leave dead space on a phone.
    <article
      style={{
        ...card,
        width: "100%",
        overflow: "hidden",
        outline: isBaseline ? `2px solid ${color.accent}` : "none",
        outlineOffset: -2,
      }}
    >
      <header style={{ padding: "10px 12px", background: isBaseline ? color.accentSoft : color.surface }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: color.ink,
              margin: 0,
              // Without this a flex item will not shrink below its content
              // width, so the ellipsis never engages and a long employer name
              // pushes the baseline chip out of the card instead.
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {offerLabel(offer)}
          </h2>
          {isBaseline && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: color.accent,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                flex: "0 0 auto",
              }}
            >
              Baseline
            </span>
          )}
        </div>

        {total && (
          <p style={{ fontSize: 12, color: color.muted, margin: "4px 0 0" }}>
            {money(total.totalCompensation)} total ·{" "}
            <span style={{ color: color.body }}>{money(total.takeHome)} take-home</span>
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          <button type="button" style={iconButton} onClick={onMoveLeft} disabled={!canMoveLeft} aria-label="Move column left">
            ←
          </button>
          <button type="button" style={iconButton} onClick={onMoveRight} disabled={!canMoveRight} aria-label="Move column right">
            →
          </button>
          {!isBaseline && (
            <button type="button" style={iconButton} onClick={onMakeBaseline}>
              Baseline
            </button>
          )}
          <button type="button" style={iconButton} onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" style={iconButton} onClick={onRemove}>
            Remove
          </button>
        </div>
        {isPinned && (
          <p style={{ fontSize: 11, color: color.muted, margin: "6px 0 0" }}>Pinned</p>
        )}
      </header>

      {SECTIONS.map((section) => (
        <Section
          key={section.id}
          section={section}
          open={openSections.has(section.id)}
          hasData={sectionHasData(section, offer)}
          onToggle={() => onToggleSection(section.id)}
        >
          {section.fields
            .filter((field) => isFieldVisible(field, offer))
            .map((field) =>
              field.type === "list" ? (
                <ListEditor
                  key={field.id}
                  field={field}
                  items={offer[field.id] || []}
                  onChange={(v) => onChangeField(field.id, v)}
                />
              ) : (
                <Field
                  key={field.id}
                  field={field}
                  value={offer[field.id]}
                  onChange={(v) => onChangeField(field.id, v)}
                />
              ),
            )}
        </Section>
      ))}
    </article>
  );
}
