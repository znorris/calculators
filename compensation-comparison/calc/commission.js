// Variable pay as a function of quota attainment.
//
// Every other input in this calculator is a number. Commission is a curve,
// and the curve is where the money actually differs: an offer with a lower
// on-target figure but a 2x accelerator can out-earn a higher one at 130%
// attainment and trail badly at 70%.
//
// A quoted OTE is the payout at exactly 100%. It is not what most people
// earn, which is why expected attainment is a first-class input and the
// expected figure is reported beside the target rather than instead of it.

/**
 * Payout multiple of target variable pay at a given attainment, under the
 * accelerator and decelerator shape.
 *
 * Below the decelerator floor the whole payout is reduced, which is how these
 * plans are written: the floor is a cliff, not a marginal band. Above the
 * accelerator threshold only the excess pays at the higher rate, which is the
 * non-retroactive form that nearly every plan uses.
 */
export function simplePayoutMultiple(attainment, plan) {
  const a = Math.max(0, attainment);
  const floor = plan.deceleratorThreshold || 0;
  const ceiling = plan.acceleratorThreshold ?? 1;
  const decel = plan.deceleratorMultiplier ?? 1;
  const accel = plan.acceleratorMultiplier ?? 1;

  if (floor > 0 && a < floor) return a * decel;
  if (a <= ceiling) return a;
  return ceiling + (a - ceiling) * accel;
}

/**
 * Payout multiple under explicit tiers.
 *
 * Marginal applies each tier's rate to the attainment falling inside its own
 * band. Retroactive applies the highest rate reached to the entire amount,
 * which changes the payout sharply right at a tier boundary.
 */
export function tieredPayoutMultiple(attainment, plan) {
  const tiers = [...(plan.tiers || [])]
    .filter((t) => Number.isFinite(t.upToAttainment))
    .sort((x, y) => x.upToAttainment - y.upToAttainment);
  if (tiers.length === 0) return Math.max(0, attainment);

  const a = Math.max(0, attainment);

  if (plan.tieredMode === "retroactive") {
    let rate = tiers[0].multiplier ?? 1;
    for (const tier of tiers) {
      if (a >= tier.upToAttainment) rate = tier.multiplier ?? 1;
    }
    return a * rate;
  }

  let total = 0;
  let floor = 0;
  for (const tier of tiers) {
    if (a <= floor) break;
    const band = Math.min(a, tier.upToAttainment) - floor;
    if (band > 0) total += band * (tier.multiplier ?? 1);
    floor = tier.upToAttainment;
  }
  // Anything above the last tier pays at that tier's rate.
  if (a > floor) total += (a - floor) * (tiers[tiers.length - 1].multiplier ?? 1);
  return total;
}

export function payoutMultiple(attainment, plan) {
  return plan.commissionMode === "tiered"
    ? tieredPayoutMultiple(attainment, plan)
    : simplePayoutMultiple(attainment, plan);
}

/**
 * Variable pay for one year, before clawback.
 *
 * Year one is reduced by ramp: for the ramp months you are paid a stated
 * share of target regardless of attainment, and only the remaining months are
 * driven by the curve. A quoted OTE almost never mentions this, and it is
 * usually the largest gap between the offer letter and the first W-2.
 */
export function variablePayForYear(offer, yearIndex, baseWages) {
  const target = offer.targetVariable || 0;
  if (target <= 0) return null;

  const attainment = offer.expectedAttainment ?? 1;
  const multiple = payoutMultiple(attainment, offer);
  const capMultiple = offer.payoutCapPercent || 0;
  const capped = capMultiple > 0 ? Math.min(multiple, capMultiple) : multiple;

  const rampMonths = yearIndex === 0 ? Math.max(0, Math.min(12, offer.rampMonths || 0)) : 0;
  const rampShare = rampMonths / 12;
  const rampPay = target * rampShare * (offer.rampPayoutPercent ?? 1);
  const earnedPay = target * (1 - rampShare) * capped;

  let gross = rampPay + earnedPay;

  // A non-recoverable draw is a floor on what you keep. A recoverable one is
  // an advance, so it sets no floor and instead leaves a debt when the year
  // falls short.
  const draw = offer.drawAmount || 0;
  let drawShortfall = 0;
  if (draw > 0) {
    if (offer.drawRecoverable) drawShortfall = Math.max(0, draw - gross);
    else gross = Math.max(gross, draw);
  }

  const clawback = gross * (offer.clawbackPercent || 0);

  return {
    target,
    attainment,
    payoutMultiple: capped,
    wasCapped: capMultiple > 0 && multiple > capMultiple,
    rampMonths,
    rampPay,
    earnedPay,
    gross,
    clawback,
    drawShortfall,
    net: gross - clawback,
    /** Payout at exactly 100% of quota, for stating target beside expected. */
    atTarget: target,
    ote: baseWages + target,
    payMix: baseWages + target > 0 ? target / (baseWages + target) : 0,
  };
}

/** Payout across a range of attainment levels, for showing the curve. */
export function attainmentScenarios(offer, levels = [0.5, 0.75, 1, 1.25, 1.5]) {
  const target = offer.targetVariable || 0;
  if (target <= 0) return [];
  const capMultiple = offer.payoutCapPercent || 0;
  return levels.map((attainment) => {
    const raw = payoutMultiple(attainment, offer);
    const multiple = capMultiple > 0 ? Math.min(raw, capMultiple) : raw;
    return { attainment, payout: target * multiple, capped: capMultiple > 0 && raw > capMultiple };
  });
}
