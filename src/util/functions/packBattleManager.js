"use strict";

const bot = require("../../config/config.js");
const { DateTime } = require("luxon");
const { currentEventsChannelID } = require("../consts/consts.js");
const { getCar, getDriver, getPack, getCarFiles } = require("./dataManager.js");
const filterCheck = require("./filterCheck.js");
const { rarityOf } = require("./raceWeekEvents.js");
const { isValidTune } = require("./calcTune.js");
const { toRewardEntries } = require("./rewardEntries.js");
const packBattleModel = require("../../models/packBattleSchema.js");
const packBattleResultModel = require("../../models/packBattleResultSchema.js");
const profileModel = require("../../models/profileSchema.js");

// Built-in per-player stats — no counter may reuse these keys.
const RESERVED_STATS = ["packsOpened", "totalCRPulled", "highestPackPullCR", "highestSinglePullCR",
    "dryStreak", "dailyCRPulled", "dailyHighestSinglePullCR", "lastDailyReset", "rarityCounts", "milestonesEarned"];
// The built-ins a milestone (or a composite milestone's requirement) may
// watch; any counter key is allowed too.
const MILESTONE_STATS = ["packsOpened", "totalCRPulled", "highestPackPullCR", "highestSinglePullCR", "dryStreak"];
const NUMERIC_REWARDS = ["money", "trophies", "fuseTokens"];
const LEADERBOARDS = ["packsOpened", "highestPackPullCR"];

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
    const earnedAcrossBattles = [];
    // Projected + lean: this runs before cd-openpack's success message, and the
    // whole battle doc (100 snapshots, every participant's stats and _seen
    // arrays) was downloaded and hydrated to touch one player's entry.
    const activeBattles = await packBattleModel.find(
        { isActive: true, packID },
        { battleID: 1, name: 1, counters: 1, milestones: 1, [`playerStats.${userID}`]: 1 }
    ).lean();
    if (activeBattles.length === 0) return earnedAcrossBattles;

    for (const battle of activeBattles) {
        // Get or init player stats (a projected playerStats is absent entirely
        // until this player's first open in the battle)
        let stats = (battle.playerStats || {})[userID];
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

        // Milestones are found in memory and their keys ride along in the same
        // $set as the stats (was a separate $push round trip). Collected so the
        // pack-open flow can ANNOUNCE them. They used to be earned in total
        // silence: reward pushed, nothing on screen, player none the wiser
        // until cd-rewards.
        //
        // Rewards are queued FIRST, then the keys are marked. Marking first
        // lost the reward for good when the queue write then failed: the key
        // said "earned", so the milestone was never offered again. Now:
        //   - queue fails → the keys are NOT marked, the stats still save, and
        //     the next open (still over the threshold) earns it again;
        //   - queue lands but the stats write fails → the next open re-finds
        //     it, and the queue skips it: every entry carries a milestoneKey
        //     (battleID:earnedKey), and an already-queued key isn't pushed
        //     twice. That guard lasts while the entry is unclaimed, so the
        //     MILESTONE-UNMARKED log line below names what to check.
        let earned = findNewMilestones(battle, stats);
        if (earned.length > 0) {
            try {
                await pushMilestoneRewards(battle, userID, earned);
            }
            catch (err) {
                console.error(`[PackBattle] MILESTONE-UNQUEUED (retried on the next open) ${JSON.stringify({ userID, battleID: battle.battleID, earnedKeys: earned.map(e => e.earnedKey), rewards: earned.map(e => e.milestone.reward) })}: ${err.message}`);
                earned = [];
            }
        }
        if (earned.length > 0) {
            if (!Array.isArray(stats.milestonesEarned)) stats.milestonesEarned = [];
            stats.milestonesEarned.push(...earned.map(e => e.earnedKey));
        }

        // Write updated stats back to DB
        const setObj = {};
        setObj[`playerStats.${userID}`] = stats;

        try {
            await packBattleModel.updateOne(
                { battleID: battle.battleID },
                { "$set": setObj }
            );
        }
        catch (err) {
            // Rewards already queued above still stand (and are announced), so
            // one battle's failed write must not skip the rest of the loop.
            console.error(`[PackBattle] Tracking failed (non-fatal) for "${battle.name}": ${err.message}`);
            if (earned.length > 0) {
                console.error(`[PackBattle] MILESTONE-UNMARKED (rewards queued, keys not saved) ${JSON.stringify({ userID, battleID: battle.battleID, earnedKeys: earned.map(e => e.earnedKey) })}`);
            }
        }
        for (const entry of earned) {
            earnedAcrossBattles.push({ battleName: battle.name, milestone: entry.milestone });
        }
    }
    return earnedAcrossBattles;
}

// ============================================================================
// CHECK MILESTONES — find newly crossed thresholds, push rewards
// ============================================================================

/** The milestones `stats` has newly crossed, as [{ milestone, earnedKey }]. Pure — writes nothing. */
function findNewMilestones(battle, stats) {
    if (!battle.milestones || battle.milestones.length === 0) return [];

    const today = DateTime.now().toFormat("yyyy-MM-dd");
    const newlyEarned = [];

    for (const milestone of battle.milestones) {
        // Composite milestone: EVERY requirement must hold at once
        // ({ requires: [{ stat, threshold }, …] }). Cumulative only — each
        // requirement reads its flat stat exactly like a plain milestone.
        if (Array.isArray(milestone.requires) && milestone.requires.length > 0) {
            if (milestone.resetType === "daily") continue;
            const earnedKey = `${milestone.milestoneID}`;
            const met = milestone.requires.every(req => typeof stats[req.stat] === "number" && stats[req.stat] >= req.threshold);
            if (met && !stats.milestonesEarned.includes(earnedKey)) newlyEarned.push({ milestone, earnedKey });
            continue;
        }

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

    return newlyEarned;
}

/**
 * Push newly earned milestones' rewards to the player's unclaimedRewards.
 * Idempotent per milestone: each entry is stamped milestoneKey =
 * "battleID:earnedKey" (after the reward key and origin, so rewards.js still
 * reads the reward key first), and a key already queued is skipped by the
 * write's filter. A retry after a half-failed open can't queue the same
 * milestone twice. One plain $push per milestone (rarely more than one per
 * open): unclaimedRewards is a light field, so the profile cache keeps the
 * player's entry without a heavy-field voucher.
 */
async function pushMilestoneRewards(battle, userID, newlyEarned) {
    for (const e of newlyEarned) {
        const milestoneKey = `${battle.battleID}:${e.earnedKey}`;
        // rid on non-numeric entries → exact-entry removal at claim time
        const rewards = toRewardEntries(e.milestone.reward, `${battle.name} Milestone`)
            .map(entry => ({ ...entry, milestoneKey }));
        if (rewards.length === 0) continue;
        await profileModel.updateOne(
            { userID, "unclaimedRewards.milestoneKey": { "$ne": milestoneKey } },
            { "$push": { unclaimedRewards: { "$each": rewards } } }
        );
    }
}

/**
 * Find newly crossed milestones and record them in separate writes (keys
 * $pushed onto the battle, rewards onto the profile). processPackOpening no
 * longer uses this — it folds the keys into its stats $set — but it stays
 * exported with its old behaviour.
 */
async function checkMilestones(battle, userID, stats) {
    const newlyEarned = findNewMilestones(battle, stats);
    if (newlyEarned.length > 0) {
        // Add earned keys to battle document
        const pushKeys = newlyEarned.map(e => e.earnedKey);
        await packBattleModel.updateOne(
            { battleID: battle.battleID },
            { $push: { [`playerStats.${userID}.milestonesEarned`]: { $each: pushKeys } } }
        );
        await pushMilestoneRewards(battle, userID, newlyEarned);
    }
    return newlyEarned;
}

// ============================================================================
// TAKE SNAPSHOT — compute rankings and store a leaderboard snapshot
// ============================================================================

async function takeSnapshot(battle) {
    const snapshot = buildSnapshot(battle);
    if (!snapshot) return null;

    // M-13: Cap snapshots at 100 to prevent unbounded array growth
    // $slice: -100 keeps the most recent 100 entries
    await packBattleModel.updateOne(
        { battleID: battle.battleID },
        { $push: { snapshots: { $each: [snapshot], $slice: -100 } } }
    );

    // H-08: Return the snapshot so callers don't need to re-fetch the document
    return snapshot;
}

/** The leaderboard snapshot for a battle's current stats, computed in memory (no write). */
function buildSnapshot(battle) {
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
    return snapshot;
}

// ============================================================================
// DISTRIBUTE PLACEMENT REWARDS — called at battle end
// ============================================================================

async function distributePlacementRewards(battle, claimed = null) {
    // H-08: Re-fetch once for latest stats, then use returned snapshot (was 3 fetches, now 1).
    // endPackBattle passes the doc its claim returned, which is already fresh.
    const freshBattle = claimed || await packBattleModel.findOne({ battleID: battle.battleID });
    if (!freshBattle) return { battle: freshBattle, finalSnapshot: null, distributedRewards: [], failedRewards: [] };

    // takeSnapshot now returns the snapshot directly — no need to re-fetch.
    // Storing it on the battle doc is best-effort here: the doc is deleted
    // right after and the archive keeps finalSnapshot itself, so a failed push
    // must not strand an already-claimed battle with nobody paid.
    let finalSnapshot;
    try {
        finalSnapshot = await takeSnapshot(freshBattle);
    }
    catch (error) {
        console.error(`[PackBattle] final snapshot write failed for "${freshBattle.name}" (paying from the in-memory snapshot): ${error.message}`);
        finalSnapshot = buildSnapshot(freshBattle);
    }
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
            const origin = `${freshBattle.name} (#${placement.minRank}${placement.minRank !== placement.maxRank ? `-${placement.maxRank}` : ""} ${placement.leaderboard})`;
            const rewardEntries = toRewardEntries(placement.reward, origin);
            if (rewardEntries.length === 0) continue;

            // The battle is already claimed (inactive) by now, so one player's
            // failed write must not abort the loop: that would leave everyone
            // after them unpaid, no archive, and the battle stranded. Record
            // it instead — the archive and cd-endpackbattle list it for a re-grant.
            try {
                await profileModel.updateOne(
                    { userID },
                    { $push: { unclaimedRewards: { $each: rewardEntries } } }
                );
            }
            catch (error) {
                console.error(`[PackBattle] PLACEMENT-UNPAID ${JSON.stringify({ userID, battleID: freshBattle.battleID, rank, leaderboard: placement.leaderboard, reward: placement.reward })}: ${error.message}`);
                failedRewards.push({ userID, rank, leaderboard: placement.leaderboard, reward: placement.reward, reason: `write failed: ${error.message}` });
                continue;
            }

            for (const rewardEntry of rewardEntries) {
                distributedRewards.push({
                    userID,
                    rank,
                    leaderboard: placement.leaderboard,
                    reward: rewardEntry
                });
            }
        }
    }

    return { battle: freshBattle, finalSnapshot, distributedRewards, failedRewards };
}

// ============================================================================
// ARCHIVE — keep the record when a battle ends, however it ends
// ============================================================================

/**
 * Save a PackBattleResult for an ending battle. cd-endpackbattle always did
 * this; the timed auto-end in index.js used to delete the battle without it,
 * so every battle that simply ran out left no record of who earned what.
 * Never throws — a failed archive must not stop the battle from ending.
 * @param {Object} battle        the battle as it was loaded
 * @param {Object} distribution  distributePlacementRewards' return value
 * @param {string} endedBy       a userID, or "auto" for the timer
 */
async function archivePackBattle(battle, distribution = {}, endedBy = "auto") {
    try {
        const source = distribution.battle || battle;
        const plain = typeof source.toObject === "function" ? source.toObject() : source;
        const playerStats = plain.playerStats || {};
        await packBattleResultModel.create({
            battleID: battle.battleID,
            battleName: battle.name,
            packID: battle.packID,
            endedAt: new Date(),
            endedBy,
            participants: Object.values(playerStats).filter(stats => stats && stats.packsOpened > 0).length,
            playerStats,
            finalSnapshot: distribution.finalSnapshot || null,
            placementRewards: battle.placementRewards || [],
            distributedRewards: distribution.distributedRewards || [],
            failedRewards: distribution.failedRewards || [],
            milestones: battle.milestones || []
        });
        return true;
    }
    catch (error) {
        console.error(`[PackBattle] could not archive "${battle && battle.name}": ${error.message}`);
        return false;
    }
}

// ============================================================================
// START / END — shared by the commands and the 3-minute loop in index.js
// ============================================================================

/** The next Race Week rollover: Monday 00:00 UTC (ISO weeks start on Monday). */
function nextRaceWeekStart(now = DateTime.utc()) {
    return now.toUTC().startOf("week").plus({ weeks: 1 });
}

/** DM everyone who opted into event notifications, 50 at a time. */
async function sendStartDMs(battleName, packName) {
    const BATCH_SIZE = 50;
    let processedCount = 0;
    const startTime = Date.now();
    console.log(`[PackBattle DMs] Starting background notifications for "${battleName}"...`);

    const processBatch = userBatch => Promise.all(userBatch.map(async ({ userID }) => {
        try {
            const user = await bot.homeGuild.members.fetch(userID);
            await user.send(`**Notification: The ${battleName} pack battle has officially started!** Open the **${packName}** pack to participate!`);
        } catch (err) {
            console.log(`Unable to send notification to user ${userID}`);
        }
    }));

    // Only the ID is used — an exclusion projection still streamed every
    // other profile field (unclaimedRewards, rrStats, …) per opted-in player.
    const cursor = profileModel.find({ "settings.sendeventnotifs": true }, { userID: 1 }).lean().cursor();
    let batch = [];
    for await (const profile of cursor) {
        batch.push(profile);
        if (batch.length >= BATCH_SIZE) {
            await processBatch(batch);
            processedCount += batch.length;
            batch = [];
            console.log(`[PackBattle DMs] Processed ${processedCount} notifications...`);
        }
    }
    if (batch.length > 0) {
        await processBatch(batch);
        processedCount += batch.length;
    }
    console.log(`[PackBattle DMs] Completed ${processedCount} notifications in ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);
}

/**
 * Start a pack battle: activate it, turn its "Xd" duration into a deadline,
 * announce it in the events channel and DM everyone who opted in.
 * Activation is an atomic claim on an INACTIVE battle, so the command, the
 * scheduled start and a second bot on the same database can never all start
 * (and announce) it. `startedAt` anchors the deadline: a scheduled start
 * passes its planned time, so the battle still ends on schedule when the
 * 3-minute tick runs a little late.
 * @returns {Promise<Object|null>} the started battle, or null if it was already running or gone
 */
async function activatePackBattle(battle, startedAt = DateTime.now()) {
    const duration = String(battle.deadline || "unlimited");
    const deadline = duration !== "unlimited" && duration.length < 9
        ? startedAt.plus({ days: parseInt(duration) }).toISO()
        : duration;
    const started = await packBattleModel.findOneAndUpdate(
        { battleID: battle.battleID, isActive: false },
        { $set: { isActive: true, deadline, scheduledStart: null } },
        { new: true }
    ).lean();
    if (!started) return null;

    const pack = getPack(started.packID);
    const packName = pack ? pack["packName"] : started.packID;
    try {
        const channel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
        await channel.send({ content: `**The ${started.name} pack battle has officially started!** Open the **${packName}** pack to participate!` });
    } catch (error) {
        console.error(`[PackBattle] "${started.name}" started, but the events channel announcement failed: ${error.message}`);
    }
    // Hundreds of DMs — never make the caller wait for them
    sendStartDMs(started.name, packName).catch(err => {
        console.error("[PackBattle DMs] Error sending notifications:", err);
    });
    return started;
}

/**
 * Start every inactive battle whose scheduledStart has passed. Runs on the
 * 3-minute tick behind the same gate as the Race Week rollover, so a battle
 * scheduled "with the rollover" starts on that same tick.
 * @returns {Promise<string[]>} names of the battles this call started
 */
async function startScheduledPackBattles(now = DateTime.utc()) {
    if (!bot.homeGuild) return [];   // not logged in yet — the next tick catches it
    const scheduled = await packBattleModel.find({ isActive: false, scheduledStart: { $type: "string" } }).lean();
    const startedNames = [];
    for (const battle of scheduled) {
        const at = DateTime.fromISO(battle.scheduledStart, { zone: "utc" });
        if (!at.isValid || at > now) continue;
        try {
            const started = await activatePackBattle(battle, at);
            if (started) {
                startedNames.push(started.name);
                console.log(`[PackBattle] Scheduled start: ${started.name} (planned for ${at.toISO()})`);
            }
        }
        catch (error) {
            console.error(`[PackBattle] Scheduled start of "${battle.name}" failed: ${error.message}`);
        }
    }
    return startedNames;
}

/**
 * End a battle: claim it, pay placements, archive, delete. Shared by
 * cd-endpackbattle and the timed auto-end. The claim (active → inactive) is
 * one atomic write, so whichever path gets there first ends the battle and
 * every other one — the 3-minute tick, the dev bot's copy of it, a second
 * admin's confirm — gets null and pays nothing. Placements are paid from the
 * doc the claim returned (the battle as it stood when it ended).
 * @param {Object} battle   the battle as loaded (only battleID is read)
 * @param {string} endedBy  a userID, or "auto" for the timer
 * @returns {Promise<Object|null>} distributePlacementRewards' result, or null if it was already ended
 */
async function endPackBattle(battle, endedBy = "auto") {
    const claimed = await packBattleModel.findOneAndUpdate(
        { battleID: battle.battleID, isActive: true },
        { $set: { isActive: false } },
        { returnDocument: "after", projection: { snapshots: 0 } }
    ).lean();
    if (!claimed) return null;
    const distribution = await distributePlacementRewards(claimed, claimed);
    await archivePackBattle(claimed, distribution, endedBy);
    try {
        await packBattleModel.deleteOne({ battleID: claimed.battleID });
    }
    catch (error) {
        // Already paid and archived, and inactive so nothing re-claims it:
        // report the end as done and leave the leftover doc for a cleanup.
        console.error(`[PackBattle] "${claimed.name}" ended and paid, but deleting it failed (leftover inactive doc, battleID ${claimed.battleID}): ${error.message}`);
    }
    return distribution;
}

/**
 * End a battle whose deadline has passed (the 3-minute loop in index.js).
 * @returns {Promise<boolean>} true if this call ended it
 */
async function expirePackBattle(battle) {
    return (await endPackBattle(battle, "auto")) !== null;
}

// ============================================================================
// TEMPLATE VALIDATION — everything checkable before a battle exists
// ============================================================================

/** Problems with one reward object ({ money } / { car: { carID, upgrade } } / { pack } / { driver } …). */
function rewardProblems(reward, where) {
    if (!reward || typeof reward !== "object" || Array.isArray(reward) || Object.keys(reward).length === 0) {
        return [`${where} has no reward`];
    }
    const problems = [];
    for (const [key, value] of Object.entries(reward)) {
        if (NUMERIC_REWARDS.includes(key)) {
            if (typeof value !== "number" || !(value > 0)) problems.push(`${where}: ${key} must be a positive number`);
        }
        else if (key === "car") {
            const carID = value && value.carID;
            if (!carID || !getCar(carID)) problems.push(`${where}: car "${carID}" isn't a loaded car`);
            else if (value.upgrade !== undefined && !isValidTune(value.upgrade)) problems.push(`${where}: "${value.upgrade}" isn't a tune`);
        }
        else if (key === "pack") {
            if (!value || !getPack(value)) problems.push(`${where}: pack "${value}" doesn't exist`);
        }
        else if (key === "driver") {
            if (!value || !getDriver(value)) problems.push(`${where}: driver "${value}" doesn't exist`);
            else if (rarityOf(getDriver(value)) === "serialised") problems.push(`${where}: serialised drivers can't be rewards`);
        }
        else problems.push(`${where}: unknown reward type "${key}"`);
    }
    return problems;
}

/**
 * Validate and normalise a pack battle template (src/packbattles/*.json).
 * A car/pack/driver that doesn't exist is a problem, so a placeholder like
 * "TODO-bm-911" blocks creation instead of failing when a player claims it.
 * @returns {{ problems: string[], counters: Array, milestones: Array, placementRewards: Array }}
 */
function validateBattleTemplate(template) {
    const problems = [];

    // Custom counters: a typo'd key or filter would otherwise never tick, silently.
    const counters = Array.isArray(template.counters) ? template.counters : [];
    for (const counter of counters) {
        let problem = null;
        if (!counter || typeof counter.key !== "string" || counter.key.length === 0) problem = "a counter is missing its key";
        else if (RESERVED_STATS.includes(counter.key)) problem = `counter key "${counter.key}" collides with a built-in stat`;
        else if (!["crPulled", "cardsPulled", "uniqueCars"].includes(counter.type)) problem = `counter "${counter.key}" type must be crPulled, cardsPulled or uniqueCars`;
        else if (counter.key.endsWith("_seen") || counter.key.endsWith("_today")) problem = `counter key "${counter.key}" may not end in _seen or _today (reserved bookkeeping suffixes)`;
        else if (counters.filter(other => other && other.key === counter.key).length > 1) problem = `duplicate counter key "${counter.key}"`;
        else if (counter.carIDs !== undefined && (!Array.isArray(counter.carIDs) || counter.carIDs.some(id => !getCar(id)))) {
            const missing = Array.isArray(counter.carIDs) ? counter.carIDs.filter(id => !getCar(id)) : [];
            problem = `counter "${counter.key}" has unknown carID(s): ${missing.join(", ") || "carIDs must be an array"}`;
        }
        else if (counter.filter !== undefined && (typeof counter.filter !== "object" || Array.isArray(counter.filter))) problem = `counter "${counter.key}" filter must be an object`;
        else if (counter.filter && Object.keys(counter.filter).length > 0) {
            try { filterCheck({ car: { carID: getCarFiles()[0].slice(0, 6) }, filter: counter.filter, applyOrLogic: true }); }
            catch (err) { problem = `counter "${counter.key}" filter is malformed: ${err.message}`; }
        }
        if (problem) problems.push(problem);
    }
    const counterKeys = counters.filter(Boolean).map(counter => counter.key);
    const knownStat = stat => MILESTONE_STATS.includes(stat) || counterKeys.includes(stat);
    const dailyCapable = ["totalCRPulled", "highestSinglePullCR",
        ...counters.filter(counter => counter && counter.type !== "uniqueCars").map(counter => counter.key)];

    const milestones = (Array.isArray(template.milestones) ? template.milestones : []).map((m, i) => {
        const normalised = {
            milestoneID: m.milestoneID || `m${i + 1}`,
            stat: m.stat,
            threshold: m.threshold,
            reward: m.reward,
            resetType: m.resetType || "none",
            isSecret: !!m.isSecret,
            hint: m.hint || ""
        };
        if (Array.isArray(m.requires)) normalised.requires = m.requires.map(req => ({ stat: req && req.stat, threshold: req && req.threshold }));
        return normalised;
    });
    for (const m of milestones) {
        const where = `milestone ${m.milestoneID}`;
        if (m.requires) {
            if (m.requires.length === 0) problems.push(`${where}: requires is empty`);
            if (m.resetType === "daily") problems.push(`${where}: a milestone with several requirements can't be daily`);
            if (m.stat !== undefined) problems.push(`${where}: use either "stat" or "requires", not both`);
            for (const req of m.requires) {
                if (!knownStat(req.stat)) problems.push(`${where}: requirement stat "${req.stat}" is neither a built-in stat nor a counter key`);
                if (typeof req.threshold !== "number" || !(req.threshold > 0)) problems.push(`${where}: requirement "${req.stat}" needs a positive threshold`);
            }
        }
        else {
            if (m.resetType === "daily" && !dailyCapable.includes(m.stat)) problems.push(`${where}: daily milestones work on totalCRPulled, highestSinglePullCR, or a crPulled/cardsPulled counter — "${m.stat}" is none of those`);
            if (!knownStat(m.stat)) problems.push(`${where}: stat "${m.stat}" is neither a built-in stat nor a counter key — it would never fire`);
            if (typeof m.threshold !== "number" || !(m.threshold > 0)) problems.push(`${where}: needs a positive threshold`);
        }
        problems.push(...rewardProblems(m.reward, where));
    }

    const placementRewards = (Array.isArray(template.placementRewards) ? template.placementRewards : []).map(p => ({
        leaderboard: p.leaderboard,
        minRank: p.minRank,
        maxRank: p.maxRank,
        reward: p.reward
    }));
    placementRewards.forEach((p, i) => {
        const where = `placement ${i + 1} (${p.leaderboard} #${p.minRank}-${p.maxRank})`;
        if (!LEADERBOARDS.includes(p.leaderboard)) problems.push(`${where}: leaderboard must be ${LEADERBOARDS.join(" or ")}`);
        if (!Number.isInteger(p.minRank) || !Number.isInteger(p.maxRank) || p.minRank < 1 || p.maxRank < p.minRank) problems.push(`${where}: ranks must be whole numbers with minRank ≤ maxRank`);
        problems.push(...rewardProblems(p.reward, where));
    });

    return { problems, counters, milestones, placementRewards };
}

module.exports = {
    processPackOpening,
    takeSnapshot,
    distributePlacementRewards,
    checkMilestones,
    toRewardEntries,
    archivePackBattle,
    nextRaceWeekStart,
    activatePackBattle,
    startScheduledPackBattles,
    endPackBattle,
    expirePackBattle,
    validateBattleTemplate,
    rewardProblems,
    RESERVED_STATS,
    MILESTONE_STATS,
    resetDailyIfNeeded,
    computeDenseRanking,
    getRarityFromCR,
    createDefaultStats
};
