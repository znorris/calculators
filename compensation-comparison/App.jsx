// Composition root. State lives here; every calculation is a pure function
// called from useMemo, and every record shape comes from the model layer.

import { useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "../shared/Breadcrumb.jsx";
import { ColumnStrip } from "./components/ColumnStrip.jsx";
import { OfferColumn } from "./components/OfferColumn.jsx";
import { ReportColumn } from "./components/ReportColumn.jsx";
import { SettingsBar } from "./components/SettingsBar.jsx";
import { DataDisclosure, DataDisclosureLink, WarrantyDisclaimer } from "../shared/DataDisclosure.jsx";
import {
  createOffer,
  duplicateOffer,
  setField,
  sectionsWithData,
  nextOfferName,
} from "./model/offer.js";
import {
  createComparison,
  addOffer,
  removeOffer,
  moveOffer,
  setBaseline,
  setPinned,
  columnOrder,
  addFactor,
  updateFactor,
  removeFactor,
  REPORT_COLUMN_ID,
} from "./model/comparison.js";
import {
  loadOffers,
  saveOffers,
  loadComparisons,
  saveComparisons,
  loadActiveComparisonId,
  saveActiveComparisonId,
  clearStoredData,
  removeOfferFromComparison,
  deleteComparison,
  indexById,
  upsertOffer,
} from "./model/storage.js";
import { remapShared } from "./model/importShare.js";
import { ComparisonsMenu } from "./components/ComparisonsMenu.jsx";
import { parseShareUrl, stripShareParam, buildShareUrl } from "./model/urlCodec.js";
import { projectAll } from "./calc/project.js";
import { color, button as buttonStyle } from "./theme.js";

/** Caveats specific to this calculator, beyond the shared disclosure. */
const COMP_DISCLOSURE_NOTES = [
  {
    title: "Where the tax figures come from",
    body:
      "Federal brackets, the standard deduction, payroll tax caps, and retirement limits come from the IRS " +
      "and Social Security Administration for the selected tax year. State figures come from each state's " +
      "revenue department where published, and each state record carries a confidence marker; where a state " +
      "has not yet released the current year, the prior year is carried forward. City income taxes beyond a " +
      "rate you enter, and several equity mechanisms, are not modeled. The Assumptions section of the report " +
      "lists what is and is not included. Every constant is published at assumptions/ and always matches "
      + "what this calculator uses.",
  },
];

/**
 * A first visit gets two empty offers so the column layout is visible without
 * anything to clear out. No amounts, employers, or locations are prefilled;
 * a compensation tool should never put numbers in front of someone that they
 * did not enter.
 */
function seedOffers() {
  return [createOffer({ name: "Offer A" }), createOffer({ name: "Offer B" })];
}

/**
 * Resolve the starting state once.
 *
 * A share link ADDS a comparison rather than replacing anything, so opening a
 * colleague's link cannot touch what you already saved. That is a property of
 * the shape: import only ever appends, so there is nothing to guard against.
 */
function initialState() {
  const storedOffers = loadOffers();
  const storedComparisons = loadComparisons();

  let offers = storedOffers;
  let comparisons = storedComparisons;

  // First visit: one comparison holding a seeded pair.
  if (comparisons.length === 0) {
    offers = storedOffers.length ? storedOffers : seedOffers();
    const ids = offers.map((o) => o.id);
    comparisons = [
      createComparison({ name: "My comparison", offerIds: ids, baselineId: ids[0] ?? null }),
    ];
  }

  let activeId = loadActiveComparisonId();
  let importedName = null;

  const shared = parseShareUrl();
  if (shared) {
    const imported = remapShared(shared);
    if (imported) {
      offers = [...offers, ...imported.offers];
      comparisons = [...comparisons, imported.comparison];
      activeId = imported.comparison.id;
      importedName = imported.comparison.name;
    }
  }

  if (!comparisons.some((c) => c.id === activeId)) activeId = comparisons[0]?.id ?? null;

  // Drop references to offers that are no longer in the library. Deliberately
  // not re-adding library offers a comparison omits: an earlier version did,
  // which made Remove a session-only hide that every reload undid.
  const present = new Set(offers.map((o) => o.id));
  comparisons = comparisons.map((c) => {
    const offerIds = c.offerIds.filter((id) => present.has(id));
    return {
      ...c,
      offerIds,
      baselineId: offerIds.includes(c.baselineId) ? c.baselineId : (offerIds[0] ?? null),
    };
  });

  return { offers, comparisons, activeId, importedName, fromShare: Boolean(shared) };
}

export default function App() {
  const [initial] = useState(initialState);
  const [offers, setOffers] = useState(initial.offers);
  const [comparisons, setComparisons] = useState(initial.comparisons);
  const [activeId, setActiveId] = useState(initial.activeId);
  const [importNotice, setImportNotice] = useState(initial.importedName);
  const [manualSections, setManualSections] = useState(() => new Map());
  const [activeColumn, setActiveColumn] = useState(null);

  useEffect(() => {
    if (initial.fromShare) stripShareParam();
  }, [initial.fromShare]);

  // Import appends rather than replaces, so these can write unconditionally.
  useEffect(() => {
    saveOffers(offers);
  }, [offers]);

  useEffect(() => {
    saveComparisons(comparisons);
  }, [comparisons]);

  useEffect(() => {
    saveActiveComparisonId(activeId);
  }, [activeId]);

  const comparison = useMemo(
    () => comparisons.find((c) => c.id === activeId) || comparisons[0] || createComparison(),
    [comparisons, activeId],
  );

  /** Apply a change to the open comparison, leaving the others alone. */
  function updateComparison(fn) {
    setComparisons((prev) => prev.map((c) => (c.id === comparison.id ? fn(c) : c)));
  }

  const offersById = useMemo(() => indexById(offers), [offers]);

  const activeOffers = useMemo(
    () => comparison.offerIds.map((id) => offersById[id]).filter(Boolean),
    [comparison.offerIds, offersById],
  );

  const projections = useMemo(
    () =>
      projectAll(activeOffers, {
        filingStatus: comparison.filingStatus,
        taxYear: comparison.taxYear,
        horizonYears: comparison.horizonYears,
      }),
    [activeOffers, comparison.filingStatus, comparison.taxYear, comparison.horizonYears],
  );

  const baseline = useMemo(
    () => projections.find((p) => p.offerId === comparison.baselineId) || projections[0] || null,
    [projections, comparison.baselineId],
  );

  // A section opens when any offer has data in it, so a gap is visible rather
  // than hidden. A manual toggle overrides that for the whole row set.
  const openSections = useMemo(() => {
    const auto = sectionsWithData(activeOffers);
    const result = new Set(auto);
    for (const [id, isOpen] of manualSections) {
      if (isOpen) result.add(id);
      else result.delete(id);
    }
    return result;
  }, [activeOffers, manualSections]);

  /**
   * Toggle a section, dropping the override once it agrees with the automatic
   * state. Keeping it meant a section closed by hand stayed closed for the rest
   * of the session even after an offer gained data that should reopen it.
   */
  function toggleSection(sectionId) {
    const auto = sectionsWithData(activeOffers).has(sectionId);
    const wanted = !openSections.has(sectionId);
    setManualSections((prev) => {
      const next = new Map(prev);
      if (wanted === auto) next.delete(sectionId);
      else next.set(sectionId, wanted);
      return next;
    });
  }

  function updateOffer(offerId, fieldId, value) {
    setOffers((prev) => prev.map((o) => (o.id === offerId ? setField(o, fieldId, value) : o)));
  }

  function rateFactor(offerId, factorId, value) {
    setOffers((prev) =>
      prev.map((o) => {
        if (o.id !== offerId) return o;
        const ratings = { ...(o.factorRatings || {}) };
        if (value == null) delete ratings[factorId];
        else ratings[factorId] = value;
        return { ...o, factorRatings: ratings, updatedAt: Date.now() };
      }),
    );
  }

  // Switching to a newly created column matters on a phone, where only one
  // column shows and a new offer would otherwise appear to do nothing.
  function handleAddOffer() {
    const offer = createOffer({ name: nextOfferName(offers) });
    setOffers((prev) => upsertOffer(prev, offer));
    updateComparison((prev) => addOffer(prev, offer.id));
    setActiveColumn(offer.id);
  }

  function handleDuplicate(offerId) {
    const copy = duplicateOffer(offersById[offerId]);
    setOffers((prev) => upsertOffer(prev, copy));
    updateComparison((prev) => addOffer(prev, copy.id));
    setActiveColumn(copy.id);
  }

  /**
   * Remove drops the offer from the comparison AND deletes the record.
   *
   * Offers are standalone records so they can be reused, but nothing can
   * create one outside a comparison yet, so an offer left in the library
   * without a comparison referencing it is unreachable. Keeping it would leak a
   * record the user believes they deleted.
   */
  /**
   * Remove drops the offer from THIS comparison, and deletes the record only
   * when no other comparison references it. An offer can belong to several
   * comparisons, so dropping it from one must not destroy it for the rest.
   */
  function handleRemove(offerId) {
    const next = removeOfferFromComparison(offers, comparisons, comparison.id, offerId);
    setComparisons(next.comparisons);
    setOffers(next.offers);
    setActiveColumn(null);
  }

  function handleCreateComparison() {
    const seeded = [createOffer({ name: "Offer A" }), createOffer({ name: "Offer B" })];
    const ids = seeded.map((o) => o.id);
    const fresh = createComparison({
      name: `Comparison ${comparisons.length + 1}`,
      offerIds: ids,
      baselineId: ids[0],
    });
    setOffers((prev) => [...prev, ...seeded]);
    setComparisons((prev) => [...prev, fresh]);
    setActiveId(fresh.id);
    setActiveColumn(null);
  }

  function handleRenameComparison(id, name) {
    setComparisons((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function handleDeleteComparison(id) {
    if (comparisons.length === 1) return;
    const next = deleteComparison(offers, comparisons, id);
    setComparisons(next.comparisons);
    setOffers(next.offers);
    if (id === activeId) setActiveId(next.comparisons[0]?.id ?? null);
  }

  function handleShare() {
    const url = buildShareUrl(comparison, offersById);
    navigator.clipboard?.writeText(url);
  }

  /**
   * Wipe stored data and reset the screen in the same action, so it cannot go
   * on showing figures the user just asked to have deleted.
   *
   * Reset to genuinely empty rather than to a seeded pair. The save effects
   * fire immediately after this, so seeding would write offers straight back
   * into the storage that was just cleared.
   */
  function handleClearStoredData() {
    clearStoredData();
    const fresh = createComparison({ name: "My comparison" });
    setOffers([]);
    setComparisons([fresh]);
    setActiveId(fresh.id);
    setImportNotice(null);
    setActiveColumn(null);
  }

  // Report first, matching columnOrder. It is the answer; the offer columns
  // are where you type. On a phone that means the first thing you see is the
  // comparison rather than an empty form.
  const columns = [
    {
      id: REPORT_COLUMN_ID,
      label: "Report",
      node: (
        <ReportColumn
          projections={projections}
          offersById={offersById}
          baseline={baseline}
          comparison={comparison}
          isPinned={comparison.pinnedId === REPORT_COLUMN_ID}
          onHorizonChange={(years) => updateComparison((prev) => ({ ...prev, horizonYears: years }))}
        />
      ),
    },
    ...activeOffers.map((offer, i) => ({
      id: offer.id,
      label: offer.name?.trim() || `Offer ${i + 1}`,
      node: (
        <OfferColumn
          offer={offer}
          projection={projections.find((p) => p.offerId === offer.id)}
          isBaseline={offer.id === comparison.baselineId}
          isPinned={offer.id === comparison.pinnedId}
          openSections={openSections}
          onToggleSection={toggleSection}
          onChangeField={(fieldId, value) => updateOffer(offer.id, fieldId, value)}
          onMakeBaseline={() => updateComparison((prev) => setBaseline(prev, offer.id))}
          onDuplicate={() => handleDuplicate(offer.id)}
          onRemove={() => handleRemove(offer.id)}
          onMoveLeft={() => updateComparison((prev) => moveOffer(prev, offer.id, i - 1))}
          onMoveRight={() => updateComparison((prev) => moveOffer(prev, offer.id, i + 1))}
          canMoveLeft={i > 0}
          canMoveRight={i < activeOffers.length - 1}
          factors={comparison.factors}
          onRateFactor={rateFactor}
        />
      ),
    })),
  ];

  // Distinct from the active COMPARISON id above; this is which column shows.
  const activeColumnId = activeColumn ?? columnOrder(comparison)[0];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 16px 60px" }}>
      <Breadcrumb current="Compensation Comparison" />

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: color.ink, margin: "0 0 4px" }}>
          Compensation Comparison
        </h1>
        <p style={{ fontSize: 12.5, color: color.muted, margin: 0, maxWidth: 640, lineHeight: 1.55 }}>
          Compare job offers over a {comparison.horizonYears}-year horizon. Every section shows on every offer;
          open the ones that apply and leave the rest closed.
        </p>
      </header>

      <DataDisclosureLink
        extraLinks={[{ label: "Assumptions and tax data", href: "assumptions/" }]}
      />

      {importNotice && (
        <div
          style={{
            background: color.accentSoft,
            border: `1px solid #c7d2fe`,
            borderLeft: `4px solid ${color.accent}`,
            borderRadius: 8,
            padding: "9px 12px",
            marginBottom: 12,
            fontSize: 12,
            color: color.body,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            Added <strong>{importNotice}</strong> from a shared link as a new comparison. Nothing you had saved was
            changed.
          </span>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            style={{ ...buttonStyle, minHeight: 30, flex: "0 0 auto" }}
          >
            Dismiss
          </button>
        </div>
      )}

      <ComparisonsMenu
        comparisons={comparisons}
        activeId={comparison.id}
        offersById={offersById}
        onSelect={(id) => {
          setActiveId(id);
          setActiveColumn(null);
        }}
        onCreate={handleCreateComparison}
        onRename={handleRenameComparison}
        onDelete={handleDeleteComparison}
      />

      <SettingsBar
        comparison={comparison}
        onChange={(patch) => updateComparison((prev) => ({ ...prev, ...patch }))}
        onAddOffer={handleAddOffer}
        onShare={handleShare}
        onAddFactor={() => updateComparison((prev) => addFactor(prev))}
        onUpdateFactor={(id, patch) => updateComparison((prev) => updateFactor(prev, id, patch))}
        onRemoveFactor={(id) => updateComparison((prev) => removeFactor(prev, id))}
      />

      <ColumnStrip
        columns={columns}
        pinnedId={comparison.pinnedId}
        onPin={(id) => updateComparison((prev) => setPinned(prev, id))}
        activeId={activeColumnId}
        onActivate={setActiveColumn}
      />

      <DataDisclosure
        storageKeys={["comp-comparison:offers", "comp-comparison:current"]}
        sharesViaUrl
        onClearStoredData={handleClearStoredData}
      />

      <WarrantyDisclaimer extraNotes={COMP_DISCLOSURE_NOTES} />
    </div>
  );
}
