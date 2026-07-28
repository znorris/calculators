// Turning a decoded share link into a comparison you own.
//
// Every id is minted fresh, so an imported comparison is a distinct snapshot of
// what someone sent rather than something that can collide with what you
// already have. Reopening your own link therefore gives you a second copy,
// which is visible and deletable. Matching on id and reusing the local record
// would instead show you your own figures where they had drifted from the
// sender's, which is a silent substitution and worse than a visible duplicate.
//
// Because import only ever adds, nothing the reader already saved can be
// overwritten. That is a property of the shape rather than a guard that has to
// be remembered.

import { createOffer } from "./offer.js";
import { createComparison, REPORT_COLUMN_ID } from "./comparison.js";

/**
 * @param shared  { comparison, offers } as returned by decodeShare
 * @returns { comparison, offers } with fresh ids throughout, or null
 */
export function remapShared(shared, { name } = {}) {
  if (!shared?.comparison || !Array.isArray(shared.offers)) return null;

  // Old id to new id, so the comparison's references and its baseline keep
  // pointing at the right records after remapping.
  const idMap = new Map();
  const offers = shared.offers.map((incoming) => {
    // Dropping the incoming id lets createOffer mint a fresh one, since its
    // overrides are spread last and would otherwise keep the old id.
    const { id: incomingId, ...rest } = incoming;
    const fresh = createOffer(rest);
    idMap.set(incomingId, fresh.id);
    return fresh;
  });

  const offerIds = (shared.comparison.offerIds || [])
    .map((id) => idMap.get(id))
    .filter(Boolean);

  const { id: incomingComparisonId, ...comparisonRest } = shared.comparison;
  const comparison = createComparison({
    ...comparisonRest,
    name: name || shared.comparison.name?.trim() || "Shared comparison",
    offerIds,
    baselineId: idMap.get(shared.comparison.baselineId) ?? offerIds[0] ?? null,
    // Pinning is a local viewing preference, not worth importing.
    pinnedId: REPORT_COLUMN_ID,
    importedAt: Date.now(),
  });

  return { comparison, offers };
}
