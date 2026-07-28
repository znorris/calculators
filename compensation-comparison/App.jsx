// Composition root. State lives here; every calculation is a pure function
// called from useMemo, and every record shape comes from the model layer.

import { useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "../shared/Breadcrumb.jsx";
import { ColumnStrip } from "./components/ColumnStrip.jsx";
import { OfferColumn } from "./components/OfferColumn.jsx";
import { ReportColumn } from "./components/ReportColumn.jsx";
import { SettingsBar } from "./components/SettingsBar.jsx";
import { DataDisclosure, DataDisclosureLink } from "../shared/DataDisclosure.jsx";
import { createOffer, duplicateOffer, setField, sectionsWithData } from "./model/offer.js";
import {
  createComparison,
  normalizeComparison,
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
  loadCurrentComparison,
  saveCurrentComparison,
  clearStoredData,
  indexById,
  upsertOffer,
} from "./model/storage.js";
import { parseShareUrl, stripShareParam, buildShareUrl } from "./model/urlCodec.js";
import { projectAll } from "./calc/project.js";
import { color } from "./theme.js";

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
      "lists what is and is not included.",
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
 * Resolve the starting state once. A share link wins over stored offers, and
 * a first visit gets a seeded pair. Building this in a single pass matters:
 * calling the seed twice would mint two sets of ids and leave the comparison
 * pointing at offers that do not exist.
 */
function initialState() {
  const shared = parseShareUrl();
  if (shared) return { offers: shared.offers, comparison: shared.comparison, fromShare: true };

  const stored = loadOffers();
  const offers = stored.length ? stored : seedOffers();
  const ids = offers.map((o) => o.id);

  // Restore the working comparison, which carries everything scoped to the
  // person rather than to an offer. Its offer references are re-checked
  // against the library, since an offer could have been deleted since.
  const savedComparison = loadCurrentComparison();
  if (savedComparison) {
    const restored = normalizeComparison(savedComparison);
    const present = new Set(ids);
    restored.offerIds = restored.offerIds.filter((id) => present.has(id));
    // An offer added outside this comparison should still show up rather than
    // being invisible with no way to reach it.
    for (const id of ids) if (!restored.offerIds.includes(id)) restored.offerIds.push(id);
    if (!restored.offerIds.includes(restored.baselineId)) {
      restored.baselineId = restored.offerIds[0] ?? null;
    }
    return { offers, comparison: restored, fromShare: false };
  }

  return {
    offers,
    comparison: createComparison({ offerIds: ids, baselineId: ids[0] ?? null }),
    fromShare: false,
  };
}

export default function App() {
  const [initial] = useState(initialState);
  const [offers, setOffers] = useState(initial.offers);
  const [comparison, setComparison] = useState(initial.comparison);
  const fromShare = initial.fromShare;
  const [manualSections, setManualSections] = useState(() => new Map());
  const [activeColumn, setActiveColumn] = useState(null);

  useEffect(() => {
    if (fromShare) stripShareParam();
  }, [fromShare]);

  useEffect(() => {
    saveOffers(offers);
  }, [offers]);

  useEffect(() => {
    saveCurrentComparison(comparison);
  }, [comparison]);

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

  function toggleSection(sectionId) {
    setManualSections((prev) => {
      const next = new Map(prev);
      next.set(sectionId, !openSections.has(sectionId));
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
    const offer = createOffer({ name: `Offer ${comparison.offerIds.length + 1}` });
    setOffers((prev) => upsertOffer(prev, offer));
    setComparison((prev) => addOffer(prev, offer.id));
    setActiveColumn(offer.id);
  }

  function handleDuplicate(offerId) {
    const copy = duplicateOffer(offersById[offerId]);
    setOffers((prev) => upsertOffer(prev, copy));
    setComparison((prev) => addOffer(prev, copy.id));
    setActiveColumn(copy.id);
  }

  function handleRemove(offerId) {
    setComparison((prev) => removeOffer(prev, offerId));
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
    setOffers([]);
    setComparison(createComparison());
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
          onMakeBaseline={() => setComparison((prev) => setBaseline(prev, offer.id))}
          onDuplicate={() => handleDuplicate(offer.id)}
          onRemove={() => handleRemove(offer.id)}
          onMoveLeft={() => setComparison((prev) => moveOffer(prev, offer.id, i - 1))}
          onMoveRight={() => setComparison((prev) => moveOffer(prev, offer.id, i + 1))}
          canMoveLeft={i > 0}
          canMoveRight={i < activeOffers.length - 1}
          factors={comparison.factors}
          onRateFactor={rateFactor}
        />
      ),
    })),
  ];

  const activeId = activeColumn ?? columnOrder(comparison)[0];

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

      <DataDisclosureLink />

      <SettingsBar
        comparison={comparison}
        onChange={(patch) => setComparison((prev) => ({ ...prev, ...patch }))}
        onAddOffer={handleAddOffer}
        onShare={handleShare}
        onAddFactor={() => setComparison((prev) => addFactor(prev))}
        onUpdateFactor={(id, patch) => setComparison((prev) => updateFactor(prev, id, patch))}
        onRemoveFactor={(id) => setComparison((prev) => removeFactor(prev, id))}
      />

      <ColumnStrip
        columns={columns}
        pinnedId={comparison.pinnedId}
        onPin={(id) => setComparison((prev) => setPinned(prev, id))}
        activeId={activeId}
        onActivate={setActiveColumn}
      />

      <DataDisclosure
        storageKeys={["comp-comparison:offers", "comp-comparison:current"]}
        sharesViaUrl
        extraNotes={COMP_DISCLOSURE_NOTES}
        onClearStoredData={handleClearStoredData}
      />
    </div>
  );
}
