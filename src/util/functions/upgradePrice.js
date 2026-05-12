"use strict";

/**
 * UPGRADE PRICE HELPERS
 * =====================
 * Shared cost math for car upgrades. Used by:
 *   - cd-upgrade  (charges the player to upgrade)
 *   - cd-sell     (refunds a fraction of the upgrade investment)
 *
 * Tune format: 3 digits where each represents an upgrade level (0/3/6/9).
 *   - 000 = stock
 *   - 333 = 3-3-3
 *   - 666 = 6-6-6
 *   - 699 / 969 / 996 = maxed (digit sum 24)
 *
 * Upgrade cost = multiplier × (digit sum delta).
 * The multiplier scales with the car's CR.
 */

/**
 * Returns the CR-bracketed cost-per-stage for a given car CR.
 * Going from 000 → 333 costs multiplier × 9; 000 → 996 costs multiplier × 24.
 */
function getUpgradeMultiplier(cr) {
    if (cr > 1245)                    return 20000000;  // BOSS 1245+
    if (cr > 1130 && cr <= 1245)      return 350000;
    if (cr > 1100 && cr <= 1130)      return 300000;
    if (cr > 1050 && cr <= 1100)      return 175000;
    if (cr > 1000 && cr <= 1050)      return 135000;
    if (cr > 950  && cr <= 1000)      return 80000;
    if (cr > 900  && cr <= 950 )      return 50000;
    if (cr > 850  && cr <= 900 )      return 37500;
    if (cr > 800  && cr <= 850 )      return 22500;
    if (cr > 750  && cr <= 800 )      return 15000;
    if (cr > 700  && cr <= 750 )      return 10000;
    if (cr > 600  && cr <= 700 )      return 9000;
    if (cr > 500  && cr <= 600 )      return 5000;
    if (cr > 400  && cr <= 500 )      return 3750;
    if (cr > 300  && cr <= 400 )      return 2000;
    if (cr > 200  && cr <= 300 )      return 1500;
    if (cr > 100  && cr <= 200 )      return 750;
    return 500;                                          // 1-99
}

/** Sum the three tune digits (e.g. "996" → 24). Returns 0 for "000". */
function tuneDigitSum(tune) {
    if (!tune || typeof tune !== "string" || tune.length !== 3) return 0;
    return parseInt(tune[0], 10) + parseInt(tune[1], 10) + parseInt(tune[2], 10);
}

/**
 * Total cost to upgrade a car from `fromTune` to `toTune` (e.g. "000" → "996").
 * Returns 0 if going downward or sideways (sell refund is computed separately).
 */
function upgradeCost(cr, fromTune, toTune) {
    const delta = tuneDigitSum(toTune) - tuneDigitSum(fromTune);
    if (delta <= 0) return 0;
    return getUpgradeMultiplier(cr) * delta;
}

/**
 * Cost from stock to a given tune (used to compute a sell refund).
 * Equivalent to `upgradeCost(cr, "000", tune)`.
 */
function costFromStock(cr, tune) {
    return getUpgradeMultiplier(cr) * tuneDigitSum(tune);
}

/**
 * Base sell price (per copy) for a car at the given CR.
 * Mirrors the brackets that used to be inline in sell.js — see those for ranges.
 * BOSS cars (CR > 1500) intentionally return 1 to prevent exploits.
 */
function getSellPrice(cr) {
    if (cr > 1500)                     return 1;          // BOSS guard
    if (cr > 1149 && cr <= 1499)       return 7250000;
    if (cr > 1099 && cr <= 1149)       return 4200000;
    if (cr > 1049 && cr <= 1099)       return 1400000;
    if (cr > 999  && cr <= 1049)       return 1080000;
    if (cr > 949  && cr <= 999 )       return 640000;
    if (cr > 899  && cr <= 949 )       return 400000;
    if (cr > 849  && cr <= 899 )       return 300000;
    if (cr > 799  && cr <= 849 )       return 180000;
    if (cr > 749  && cr <= 799 )       return 120000;
    if (cr > 699  && cr <= 749 )       return 80000;
    if (cr > 599  && cr <= 699 )       return 72000;
    if (cr > 499  && cr <= 599 )       return 40000;
    if (cr > 399  && cr <= 499 )       return 30000;
    if (cr > 299  && cr <= 399 )       return 16000;
    if (cr > 199  && cr <= 299 )       return 12000;
    if (cr > 99   && cr <= 199 )       return 6000;
    return 4000;                                          // 1-99
}

module.exports = {
    getUpgradeMultiplier,
    tuneDigitSum,
    upgradeCost,
    costFromStock,
    getSellPrice
};
