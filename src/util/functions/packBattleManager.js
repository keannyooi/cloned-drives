"use strict";

const { DateTime } = require("luxon");
const { getCar, getDriver } = require("./dataManager.js");
const filterCheck = require("./filterCheck.js");
const { rarityOf } = require("./raceWeekEvents.js");
const makeRewardID = require("./rewardID.js");
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

function resetDailyIfNeeded(stats, counters) {
    const today = DateTime.now().toFormat("yyyy-MM-dd");
    if (stats.lastDailyReset !== today) {
        stats.dailyCRPulled = 0;
        stats.dailyHighestSinglePullCR = 0;
        // Custom counters keep a _today mirror so milestones can be daily.
        for (const counter of counters || []) {
            if (counter && counter.key) stats[counter.key + "_today"] = 0;
        }
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

        // Reset daily fields if needed (counter day-mirrors included)
        resetDailyIfNeeded(stats, battle.counters);

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

        // Custom counters — per-card filtered tallies. carIDs is an exact
        // allowlist, filter is any cd-filter criteria (OR across array values,
        // matching how players read "coupe or convertible"). A broken filter
        // logs and skips ITS counter only — pack opening must never break on a
        // battle's config.
        for (const counter of battle.counters || []) {
            if (!counter || !counter.key || typeof counter.key !== "string") continue;
            let tally = 0;
            for (const car of addedCars) {
                const carData = getCar(car.carID);
                if (!carData) continue;
                if (Array.isArray(counter.carIDs) && counter.carIDs.length > 0
                    && !counter.carIDs.includes(car.carID)) continue;
                if (counter.filter && Object.keys(counter.filter).length > 0) {
                    let matched = false;
                    try {
                        matched = filterCheck({ car: { carID: car.carID }, filter: counter.filter, applyOrLogic: true });
                    }
                    catch (err) {
                        console.error(`[PackBattle] counter "${counter.key}" filter error: ${err.message}`);
                        tally = 0;
                        break;
                    }
                    if (!matched) continue;
                }
                if (counter.type === "uniqueCars") {
                    // Distinct matching carIDs, scoped to THIS battle: the set
                    // lives beside the number so milestones (which read a flat
                    // numeric stat) keep working untouched.
                    const seenKey = counter.key + "_seen";
                    if (!Array.isArray(stats[seenKey])) stats[seenKey] = [];
                    if (!stats[seenKey].includes(car.carID)) {
                        stats[seenKey].push(car.carID);
                        tally += 1;
                    }
                    continue;
                }
                tally += counter.type === "crPulled" ? (carData.cr || 0) : 1;
            }
            if (tally > 0) {
                stats[counter.key] = (stats[counter.key] || 0) + tally;
                if (counter.type !== "uniqueCars") {
                    stats[counter.key + "_today"] = (stats[counter.key + "_today"] || 0) + tally;
                }
            }
        }

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
            // Custom counters (crPulled/cardsPulled) keep a _today mirror,
            // zeroed by resetDailyIfNeeded — so counter-backed dailies work.
            else if ((battle.counters || []).some(counter => counter && counter.key === milestone.stat && counter.type !== "uniqueCars")) {
                currentValue = stats[milestone.stat + "_today"];
            }
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

        // Push rewards to player's unclaimedRewards (rid on non-numeric
        // entries → exact-entry removal at claim time)
        const rewards = newlyEarned.map(e => {
            const entry = { ...e.milestone.reward, origin: `${battle.name} Milestone` };
            if (entry.money === undefined && entry.fuseTokens === undefined && entry.trophies === undefined) {
                entry.rid = makeRewardID();
            }
            return entry;
        });

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
    if (!freshBattle) return { battle: freshBattle, finalSnapshot: null, distributedRewards: [], failedRewards: [] };

    // takeSnapshot now returns the snapshot directly — no need to re-fetch
    const finalSnapshot = await takeSnapshot(freshBattle);
    if (!finalSnapshot) return { battle: freshBattle, finalSnapshot: null, distributedRewards: [], failedRewards: [] };

    const distributedRewards = [];
    const failedRewards = [];

    for (const placement of freshBattle.placementRewards || []) {
        const leaderboard = finalSnapshot[placement.leaderboard];
        if (!leaderboard || leaderboard.length === 0) continue;

        const qualifyingPlayers = leaderboard.filter(
            entry => entry.rank >= placement.minRank && entry.rank <= placement.maxRank
        );

        // Drivers v2: a driver placement reward is { driver: "dXXXXX" } — validate the
        // ID against the loaded driver files once per placement so a typo'd/unloaded
        // driver fails loudly here instead of silently dropping at claim time.
        const wantsDriver = placement.reward && placement.reward.driver !== undefined;
        const driverInvalid = wantsDriver && !getDriver(placement.reward.driver);
        // Serialised drivers are mint-capped and can never be awarded as rewards
        // (same rule as events/championships/givereward/PvP).
        const driverSerialised = wantsDriver && !driverInvalid && rarityOf(getDriver(placement.reward.driver)) === "serialised";

        for (const { userID, rank } of qualifyingPlayers) {
            if (driverInvalid || driverSerialised) {
                failedRewards.push({
                    userID,
                    rank,
                    leaderboard: placement.leaderboard,
                    reason: driverSerialised
                        ? `serialised drivers cannot be awarded ("${placement.reward.driver}")`
                        : `unknown driver ID "${placement.reward.driver}"`
                });
                continue;
            }

            // Reward-entry contract: one reward key per entry, reward key first,
            // origin second (rewards.js switches on Object.keys(reward)[0]).
            const rewardEntry = {
                ...placement.reward,
                origin: `${freshBattle.name} (#${placement.minRank}${placement.minRank !== placement.maxRank ? `-${placement.maxRank}` : ""} ${placement.leaderboard})`
            };
            if (rewardEntry.money === undefined && rewardEntry.fuseTokens === undefined && rewardEntry.trophies === undefined) {
                rewardEntry.rid = makeRewardID();
            }

            await profileModel.updateOne(
                { userID },
                { $push: { unclaimedRewards: rewardEntry } }
            );

            distributedRewards.push({
                userID,
                rank,
                leaderboard: placement.leaderboard,
                reward: rewardEntry
            });
        }
    }

    return { battle: freshBattle, finalSnapshot, distributedRewards, failedRewards };
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
