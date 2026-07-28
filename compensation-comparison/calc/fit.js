// Weighted scoring of non-monetary factors.
//
// The importance-times-rating matrix, which is the shape the MIT career
// worksheet uses: rate how much each factor matters to you once, rate each
// offer on each factor, multiply and sum.
//
// This score is deliberately NEVER combined with a dollar figure. Several
// tools blend a cash total with 1-to-5 ratings using a formula they do not
// publish, so a reader cannot tell how much a four-star culture rating moved
// the recommendation. Reporting money and fit as two separate numbers leaves
// the trade in the reader's hands, which is where it belongs.

import { MAX_RATING } from "../model/comparison.js";

/**
 * Score one offer against the weighted factors.
 *
 * Returns null when nothing has been rated, so the report can stay silent
 * rather than showing a zero that looks like a judgment.
 */
export function scoreOffer(offer, factors) {
  const ratings = offer.factorRatings || {};
  const scored = (factors || [])
    .filter((f) => (f.weight ?? 0) > 0)
    .map((f) => ({ factor: f, rating: ratings[f.id] }))
    .filter((entry) => Number.isFinite(entry.rating) && entry.rating > 0);

  if (scored.length === 0) return null;

  const earned = scored.reduce((sum, e) => sum + e.factor.weight * e.rating, 0);
  const possible = scored.reduce((sum, e) => sum + e.factor.weight * MAX_RATING, 0);

  return {
    earned,
    possible,
    /** 0 to 100, comparable across offers only when the same factors are rated. */
    percent: possible > 0 ? (earned / possible) * 100 : 0,
    ratedCount: scored.length,
    totalCount: (factors || []).filter((f) => (f.weight ?? 0) > 0).length,
    contributions: scored
      .map((e) => ({
        id: e.factor.id,
        label: e.factor.label,
        weight: e.factor.weight,
        rating: e.rating,
        points: e.factor.weight * e.rating,
      }))
      .sort((a, b) => b.points - a.points),
  };
}

/**
 * Score every offer, and identify where they most disagree.
 *
 * The largest weighted gap is more useful than the total, because it names
 * the factor actually driving the difference.
 */
export function scoreAll(offers, factors) {
  const scores = new Map();
  for (const offer of offers) scores.set(offer.id, scoreOffer(offer, factors));

  const rated = offers.filter((o) => scores.get(o.id));
  if (rated.length < 2) return { scores, biggestGap: null, leader: null };

  let leader = rated[0];
  for (const offer of rated) {
    if (scores.get(offer.id).percent > scores.get(leader.id).percent) leader = offer;
  }

  let biggestGap = null;
  for (const factor of factors || []) {
    if ((factor.weight ?? 0) <= 0) continue;
    const values = rated
      .map((o) => ({ offer: o, rating: (o.factorRatings || {})[factor.id] }))
      .filter((v) => Number.isFinite(v.rating) && v.rating > 0);
    if (values.length < 2) continue;

    const best = values.reduce((a, b) => (b.rating > a.rating ? b : a));
    const worst = values.reduce((a, b) => (b.rating < a.rating ? b : a));
    const gap = (best.rating - worst.rating) * factor.weight;
    if (gap > 0 && (!biggestGap || gap > biggestGap.gap)) {
      biggestGap = { factor, gap, best: best.offer, worst: worst.offer, spread: best.rating - worst.rating };
    }
  }

  return { scores, biggestGap, leader };
}

/**
 * Whether the offer leading on money is also the one leading on fit.
 *
 * When they disagree there is a real trade to make, and saying so is more
 * useful than any composite number would be.
 */
export function moneyAndFitAgree(moneyLeaderId, fitLeaderId) {
  if (!moneyLeaderId || !fitLeaderId) return null;
  return moneyLeaderId === fitLeaderId;
}
