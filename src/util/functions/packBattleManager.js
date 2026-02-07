"use strict";

const { DateTime } = require("luxon");
const { getCar } = require("./dataManager.js");
const packBattleModel = require("../../models/packBattleSchema.js");
const profileModel = require("../../models/profileSchema.js");

// ============================================================================
// CR -> RARITY MAPPING (matches openPack.js thresholds exactly)
// ============================================================================

function getRarityFromCR(cr) {
    if (cr >= 1000) return "mystic";
    if (cr >= 850) return "legendary";
    if (cr >= 700) return "exotic";
    if (cr >= 550) return "epic";
    if (cr >= 400) return "rare";
    if (cr >= 250) return "uncommon";
    if (cr >= 100) return "common";
    return "standard";
}

// ============================================================================
// DENSE RANKING — 1st, 1st, 2nd, 3rd (not 1st, 1st, 3rd)
// ============================================================================

function computeDenseRanking(sortedEntries) {
    let rank = 0;
    let prevValue = null;
    return sortedEntries.map(entry => {
        if (entry.value !== prevValue) {
            rank++;
            prevValue = entry.value;
        }
        return { ...entry, rank };
    });
}

// ============================================================================
// DEFAULT PLAYER STATS — created on first pack open in a battle
// ============================================================================

function createDefaultStats() {
    return {
        packsOpened: 0,
        highestPackPullCR: 0,
        highestSinglePullCR: 0,
        totalCRPulled: 0,
        rarityCounts: {
            standard: 0,
            common: 0,
            uncommon: 0,
            rare: 0,
            epic: 0,
            exotic: 0,
            legendary: 0,
            mystic: 0
        },
        dryStreak: 0,
        dailyCRPulled: 0,
        dailyHighestSinglePullCR: 0,
        lastDailyReset: DateTime.now().toFormat("yyyy-MM-dd"),
        milestonesEarned: []
    };
}

// ============================================================================
// DAILY RESET — zeros daily stats if the date has changed
// ============================================================================

function resetDailyIfNeeded(stats) {
    const today = DateTime.now().toFormat("yyyy-MM-dd");
    if (stats.lastDailyReset !== today) {
        stats.dailyCRPulled = 0;
        stats.dailyHighestSinglePullCR = 0;
        stats.lastDailyReset = today;
        return true;
    }
    return false;
}

// ============================================================================
// PROCESS PACK OPENING — called from openpack.js after a successful open
// ============================================================================

async function processPackOpening(userID, packID, addedCars) {
    const activeBattles = await packBattleModel.find({ isActive: true, packID });
    if (activeBattles.length === 0) return;

    for (const battle of activeBattles) {
        // Get or init player stats
        let stats = battle.playerStats[userID];
        const isNew = !stats;
        if (isNew) {
            stats = createDefaultStats();
        }

        // Reset daily fields if needed
        resetDailyIfNeeded(stats);

        // Compute stats from this pack opening
        let packPullCR = 0;
        let bestSingleCR = 0;
        let hasLegendaryPlus = false;
        const rarityIncrements = {};

        for (const car of addedCars) {
            const carData = getCar(car.carID);
            if (!carData) continue;

            const cr = carData.cr || 0;
            packPullCR += cr;
            if (cr > bestSingleCR) bestSingleCR = cr;

            const rarity = getRarityFromCR(cr);
            rarityIncrements[rarity] = (rarityIncrements[rarity] || 0) + 1;

            if (cr >= 850) hasLegendaryPlus = true;
        }

        // Update stats in memory
        stats.packsOpened++;
        stats.totalCRPulled += packPullCR;
        stats.dailyCRPulled += packPullCR;
        if (packPullCR > stats.highestPackPullCR) stats.highestPackPullCR = packPullCR;
        if (bestSingleCR > stats.highestSinglePullCR) stats.highestSinglePullCR = bestSingleCR;
        if (bestSingleCR > stats.dailyHighestSinglePullCR) stats.dailyHighestSinglePullCR = bestSingleCR;

        for (const [rarity, count] of Object.entries(rarityIncrements)) {
            stats.rarityCounts[rarity] = (stats.rarityCounts[rarity] || 0) + count;
        }

        stats.dryStreak = hasLegendaryPlus ? 0 : (stats.dryStreak + 1);

        // Write updated stats back to DB
        const setObj = {};
        setObj[`playerStats.${userID}`] = stats;

        await packBattleModel.updateOne(
            { battleID: battle.battleID },
            { "$set": setObj }
        );

        // Check milestones after the update
        await checkMilestones(battle, userID, stats);
    }
}

// ============================================================================
// CHECK MILESTONES — find newly crossed thresholds, push rewards
// ============================================================================

async function checkMilestones(battle, userID, stats) {
    if (!battle.milestones || battle.milestones.length === 0) return [];

    const today = DateTime.now().toFormat("yyyy-MM-dd");
    const newlyEarned = [];

    for (const milestone of battle.milestones) {
        // Determine which stat to check
        let currentValue;
        if (milestone.resetType === "daily") {
            if (milestone.stat === "totalCRPulled") currentValue = stats.dailyCRPulled;
            else if (milestone.stat === "highestSinglePullCR") currentValue = stats.dailyHighestSinglePullCR;
            else continue;
        } else {
            currentValue = stats[milestone.stat];
        }

        if (currentValue === undefined) continue;

        // Daily milestones use "id-YYYY-MM-DD" so they can be re-earned each day
        const earnedKey = milestone.resetType === "daily"
            ? `${milestone.milestoneID}-${today}`
            : `${milestone.milestoneID}`;

        if (currentValue >= milestone.threshold && !stats.milestonesEarned.includes(earnedKey)) {
            newlyEarned.push({ milestone, earnedKey });
        }
    }

    if (newlyEarned.length > 0) {
        // Add earned keys to battle document
        const pushKeys = newlyEarned.map(e => e.earnedKey);
        await packBattleModel.updateOne(
            { battleID: battle.battleID },
            { $push: { [`playerStats.${userID}.milestonesEarned`]: { $each: pushKeys } } }
        );

        // Push rewards to player's unclaimedRewards
        const rewards = newlyEarned.map(e => ({
            ...e.milestone.reward,
            origin: `${battle.name} Milestone`
        }));

        await profileModel.updateOne(
            { userID },
            { $push: { unclaimedRewards: { $each: rewards } } }
        );
    }

    return newlyEarned;
}

// ============================================================================
// TAKE SNAPSHOT — compute rankings and store a leaderboard snapshot
// ============================================================================

async function takeSnapshot(battle) {
    const entries = Object.entries(battle.playerStats || {});
    if (entries.length === 0) return null;

    // Build packs opened leaderboard
    const packsOpenedList = entries
        .map(([userID, stats]) => ({ userID, value: stats.packsOpened || 0 }))
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value);

    // Build highest pack pull CR leaderboard
    const crList = entries
        .map(([userID, stats]) => ({ userID, value: stats.highestPackPullCR || 0 }))
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value);

    const snapshot = {
        timestamp: DateTime.now().toISO(),
        packsOpened: computeDenseRanking(packsOpenedList),
        highestPackPullCR: computeDenseRanking(crList)
    };

    // M-13: Cap snapshots at 100 to prevent unbounded array growth
    // $slice: -100 keeps the most recent 100 entries
    await packBattleModel.updateOne(
        { battleID: battle.battleID },
        { $push: { snapshots: { $each: [snapshot], $slice: -100 } } }
    );

    // H-08: Return the snapshot so callers don't need to re-fetch the document
    return snapshot;
}

// ============================================================================
// DISTRIBUTE PLACEMENT REWARDS — called at battle end
// ============================================================================

async function distributePlacementRewards(battle) {
    // H-08: Re-fetch once for latest stats, then use returned snapshot (was 3 fetches, now 1)
    const freshBattle = await packBattleModel.findOne({ battleID: battle.battleID });
    if (!freshBattle) return;

    // takeSnapshot now returns the snapshot directly — no need to re-fetch
    const finalSnapshot = await takeSnapshot(freshBattle);
    if (!finalSnapshot) return;

    for (const placement of freshBattle.placementRewards || []) {
        const leaderboard = finalSnapshot[placement.leaderboard];
        if (!leaderboard || leaderboard.length === 0) continue;

        const qualifyingPlayers = leaderboard.filter(
            entry => entry.rank >= placement.minRank && entry.rank <= placement.maxRank
        );

        for (const { userID } of qualifyingPlayers) {
            const rewardEntry = {
                ...placement.reward,
                origin: `${freshBattle.name} (#${placement.minRank}${placement.minRank !== placement.maxRank ? `-${placement.maxRank}` : ""} ${placement.leaderboard})`
            };

            await profileModel.updateOne(
                { userID },
                { $push: { unclaimedRewards: rewardEntry } }
            );
        }
    }
}

module.exports = {
    processPackOpening,
    takeSnapshot,
    distributePlacementRewards,
    checkMilestones,
    resetDailyIfNeeded,
    computeDenseRanking,
    getRarityFromCR,
    createDefaultStats
};
