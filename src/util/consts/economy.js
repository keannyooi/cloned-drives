"use strict";

/**
 * Economy constants shared by live commands and scripts/simulateEconomy.js.
 *
 * Pure data + pure helpers with NO requires, so the simulator can import it
 * headless. Rebalance HERE: cd-daily, cd-hilo and the simulator all read
 * these, so there is no hand-copied mirror to forget.
 * (Race Week tuning lives in raceWeek.js; this file is everything else.)
 */

// =============================================================================
// DAILY (src/commands/daily.js)
// =============================================================================

const DAILY = {
    // Money for streak N = baseMoney + (N - 1) * moneyPerStreakDay.
    baseMoney: 7500,
    moneyPerStreakDay: 4000,
    // Patron role (consts.js patronRoleID) multiplies the money reward.
    patronMoneyMultiplier: 1.5
};

/** Money paid by a daily claim at `streak` (already incremented). */
function dailyMoneyReward(streak, isPatron) {
    let moneyReward = DAILY.baseMoney + ((streak - 1) * DAILY.moneyPerStreakDay);
    if (isPatron) {
        moneyReward *= DAILY.patronMoneyMultiplier;
    }
    return moneyReward;
}

// =============================================================================
// HI-LO (src/commands/hilo.js)
// =============================================================================

const HILO = {
    // Base gain for a correct guess that reaches `streak`; first match wins.
    // Past the last entry: tailBase + (streak - tailFrom) * tailPerStreak.
    streakRewards: [
        { exactly: 1, reward: 15000 },
        { below: 5, reward: 8000 },
        { below: 10, reward: 18000 },
        { below: 15, reward: 30000 },
        { below: 20, reward: 45000 }
    ],
    tailBase: 60000,
    tailFrom: 20,
    tailPerStreak: 5000,
    // One-off bonus added on reaching exactly this streak.
    milestoneBonuses: { 5: 10000, 10: 25000, 20: 75000 },
    // Share of the pot kept on a wrong guess; first threshold the streak meets.
    keepPercentages: [
        { minStreak: 15, percent: 75 },
        { minStreak: 10, percent: 60 },
        { minStreak: 5, percent: 50 },
        { minStreak: 3, percent: 30 },
        { minStreak: 1, percent: 15 }
    ]
};

/** Base gain (before multiplier and bonuses) for a correct guess at `streak`. */
function hiloStreakReward(streak) {
    for (const step of HILO.streakRewards) {
        if (step.exactly !== undefined ? streak === step.exactly : streak < step.below) return step.reward;
    }
    return HILO.tailBase + (streak - HILO.tailFrom) * HILO.tailPerStreak;
}

/** Percent of the pot kept when a guess at `streak` is wrong (0 below streak 1). */
function hiloKeepPercentage(streak) {
    const step = HILO.keepPercentages.find(entry => streak >= entry.minStreak);
    return step ? step.percent : 0;
}

// =============================================================================
// PACK TIERS / CATEGORIES (daily, Race Week prizes, simulator)
// =============================================================================

/**
 * A pack's reward categories. Packs without an explicit `categories` list are
 * legacy: "normal" if priced, plus every reward category.
 */
function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}

/**
 * A pack's tier: explicit `tier`, else inferred from the name ("elite" /
 * "booster" / "standard"). Decides which packs daily and Race Week draw from.
 */
function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}

module.exports = {
    DAILY,
    dailyMoneyReward,
    HILO,
    hiloStreakReward,
    hiloKeepPercentage,
    getPackCategories,
    getPackTier
};
