"use strict";

// Race Week per-win payout (v2.2 formula — see docs/race-week-design.md §4a).
// The one copy: cd-rr (randomrace.js) pays with it and the economy simulator
// (scripts/simulateEconomy.js) models with it. Pure — no Discord, config or
// DB — so the simulator and unit tests can load it headless.

const { ECON } = require("../consts/raceWeek.js");
const { rrMoneyBonusPct } = require("./cardType.js");

/**
 * Flat per-win pay + clamped CR-differential bonus, then the card-type money
 * bonus (BM +25% via rrMoneyBonusPct; Diamond gated by DIAMONDS_ENABLED),
 * domination tiers on the subtotal, and the 5% lucky-race roll.
 *
 * @param {Object} race       { playerCar, opponentCar, rawHandCar, result }
 * @param {Object} [options]  econ: tuning (default the shipped ECON; the
 *   simulator passes its CLI overrides), rng: the lucky roll (default Math.random)
 */
function computeWinPayout({ playerCar, opponentCar, rawHandCar, result }, { econ = ECON, rng = Math.random } = {}) {
    const flat = econ.flatBase;

    let crBonus = 0;
    if (playerCar.cr - opponentCar.cr <= econ.crBonusEligibleDiff) {
        // counted crDiff clamps at +40 — bounds the farmable deep-underdog channel
        crBonus = (Math.min(opponentCar.cr - playerCar.cr, econ.crDiffClamp) + 40) * econ.crBonusBase;
    }
    const baseSubtotal = flat + crBonus;

    let bonusPct = rawHandCar ? rrMoneyBonusPct(rawHandCar) : 0;
    // Race Week rule (spec §4a): the diamond 2× money bonus stays OFF here
    // REGARDLESS of the global DIAMONDS_ENABLED flag — an all-diamond nolife
    // week at 2× would blow the weekly economy target (~$63M sim'd).
    if (playerCar.isDiamond) bonusPct = 0;
    const cardBonus = Math.round(baseSubtotal * bonusPct / 100);
    const subtotal = baseSubtotal + cardBonus;

    let dominationBonus = 0, dominationLabel = null;
    for (const tier of econ.dominationTiers) {
        if (result >= tier.threshold) {
            dominationBonus = Math.floor(subtotal * tier.multiplier);
            dominationLabel = tier.label;
            break;
        }
    }

    const lucky = rng() < econ.luckyChance;
    const luckyBonus = lucky ? Math.floor(subtotal * econ.luckyMult) : 0;

    return {
        flat, crBonus, bonusPct, cardBonus, subtotal, dominationBonus, dominationLabel,
        lucky, luckyBonus, total: subtotal + dominationBonus + luckyBonus
    };
}

module.exports = { computeWinPayout };
