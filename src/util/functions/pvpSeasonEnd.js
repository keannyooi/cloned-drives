"use strict";

/**
 * PvP Season End Automation
 * 
 * Run this script to end the current season and start a new one.
 * Can be triggered manually or via cron/scheduled task.
 * 
 * Usage:
 *   node pvpSeasonEnd.js [--dry-run] [--force]
 * 
 * Options:
 *   --dry-run   Preview what would happen without making changes
 *   --force     Run even if season hasn't ended yet
 *
 * Safe to re-run (e.g. after a crash or timeout part-way through): each player is
 * claimed per league with a seasonRewardsClaimed.<season>.<league> marker in the
 * same write that resets their rating, BEFORE anything is paid, so a re-run skips
 * everyone already processed. A season with a saved (non-dry-run) result is
 * refused outright.
 */

const mongoose = require("mongoose");
const addCars = require("./addCars.js");
const { saveGarage } = require("./garageWrite.js");
const pvpModel = require("../../models/pvpSchema.js");
const profileModel = require("../../models/profileSchema.js");
const pvpSeasonResultModel = require("../../models/pvpSeasonResultSchema.js");
const { PVP_LEAGUES, LEAGUE_ORDER, PVP_SETTINGS } = require("../consts/pvpConfig.js");
const { getCurrentSeason, getMostRecentSeason, getSeason, isSeasonEnded } = require("../consts/pvpSeasons.js");

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    // Minimum games to qualify for rewards
    minGamesForRewards: PVP_SETTINGS.minGamesForRewards || 10,
    
    // Base rating (everyone resets to this each season)
    baseRating: PVP_SETTINGS.baseRating || 1000
};

/**
 * Refuse a connection that isn't the bot's database. MONGO_URI has no database
 * name in its path and lands on the empty default "test" DB, where this would
 * "succeed" with 0 players.
 */
function assertBotDatabase() {
    const dbName = mongoose.connection.name;
    console.log(`Database: "${dbName}"`);
    if (!dbName || dbName === "test") {
        throw new Error(`Refusing to run against "${dbName}": not the bot's database (connect with MONGO_PW, never MONGO_URI).`);
    }
}

/** Standalone connect — MONGO_PW, same as index.js. */
async function connectStandalone() {
    if (!process.env.MONGO_PW) throw new Error("MONGO_PW is not set (it is read from the repo's .env).");
    await mongoose.connect(process.env.MONGO_PW);
    try {
        assertBotDatabase();
    } catch (err) {
        await mongoose.disconnect();
        throw err;
    }
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Process season end
 */
async function processSeasonEnd(options = {}) {
    const { dryRun = false, force = false } = options;
    
    console.log("=".repeat(60));
    console.log("PvP SEASON END PROCESSOR");
    console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
    console.log("=".repeat(60));
    console.log();
    
    // Get the season to process (use most recent, which works during off-season too)
    const currentSeason = getMostRecentSeason();
    const hasEnded = isSeasonEnded();
    
    console.log(`Season: ${currentSeason.name} (ID: ${currentSeason.id})`);
    console.log(`End Date: ${currentSeason.endDate}`);
    console.log(`Has Ended: ${hasEnded}`);
    console.log();
    
    if (!hasEnded && !force) {
        console.log("❌ Season has not ended yet. Use --force to run anyway.");
        return { success: false, reason: "Season not ended" };
    }
    
    // Connect to database if not already connected
    // When running via bot command, we're already connected
    // When running standalone, we need to connect
    let weConnected = false;
    if (mongoose.connection.readyState !== 1) {
        await connectStandalone();
        weConnected = true;
        console.log("✅ Connected to database");
    } else {
        assertBotDatabase();
        console.log("✅ Using existing database connection");
    }

    // A season whose result was already saved has been fully paid — refuse a
    // second run outright (a crashed run saves no result; the per-player
    // markers in processLeague make that re-run safe).
    if (!dryRun) {
        const alreadyDone = await pvpSeasonResultModel.exists({ seasonID: currentSeason.id, wasDryRun: { $ne: true } });
        if (alreadyDone) {
            console.log(`❌ Season ${currentSeason.id} was already processed (a saved result exists). Not paying it again.`);
            if (weConnected) await mongoose.disconnect();
            return { success: false, reason: "Season already processed" };
        }
    }
    
    const results = {
        season: currentSeason,
        leagueResults: {},
        totalPlayersProcessed: 0,
        totalRewardsDistributed: 0,
        totalPrizeCarsAwarded: 0,
        ratingsReset: 0,
        defensesCleared: 0,
        alreadyProcessed: 0,
        distributedRewards: [],
        failedRewards: []
    };

    try {
        // Process each league
        for (const league of LEAGUE_ORDER) {
            console.log(`\n${"─".repeat(40)}`);
            console.log(`Processing: ${PVP_LEAGUES[league].name}`);
            console.log(`${"─".repeat(40)}`);

            const leagueResult = await processLeague(league, currentSeason, dryRun);
            results.leagueResults[league] = leagueResult;
            results.totalPlayersProcessed += leagueResult.playersProcessed;
            results.totalRewardsDistributed += leagueResult.rewardsDistributed;
            results.totalPrizeCarsAwarded += leagueResult.prizeCarsAwarded;
            results.ratingsReset += leagueResult.ratingsReset;
            results.defensesCleared += leagueResult.defensesCleared;
            results.alreadyProcessed += leagueResult.alreadyProcessed;
            results.distributedRewards.push(...(leagueResult.distributedRewards || []));
            results.failedRewards.push(...(leagueResult.failedRewards || []));
        }

        // Increment season ID for all players
        if (!dryRun) {
            const nextSeasonID = currentSeason.id + 1;
            await pvpModel.updateMany(
                {},
                { $set: { currentSeasonID: nextSeasonID } }
            );
            console.log(`\n✅ Updated all players to season ${nextSeasonID}`);
        }

        // Save results to database
        try {
            await pvpSeasonResultModel.create({
                seasonID: currentSeason.id,
                seasonName: currentSeason.name,
                endedAt: new Date(),
                endedBy: options.endedBy || "system",
                wasDryRun: dryRun,
                totalPlayersProcessed: results.totalPlayersProcessed,
                totalRewardsDistributed: results.totalRewardsDistributed,
                totalPrizeCarsAwarded: results.totalPrizeCarsAwarded,
                totalRatingsReset: results.ratingsReset,
                totalDefensesCleared: results.defensesCleared,
                leagueResults: results.leagueResults,
                distributedRewards: results.distributedRewards,
                failedRewards: results.failedRewards,
                seasonConfig: {
                    prizeCars: currentSeason.prizeCars || {},
                    prizeCarSlots: currentSeason.prizeCarSlots || 3,
                    ratingRewards: currentSeason.ratingRewards || [],
                    trackPoolName: currentSeason.trackPool?.name || "",
                    filter: currentSeason.filter || {},
                    startDate: currentSeason.startDate,
                    endDate: currentSeason.endDate
                }
            });
            console.log("✅ Season results saved to database");
        } catch (err) {
            console.error(`Failed to save season results: ${err.message}`);
        }

        console.log("\n" + "=".repeat(60));
        console.log("SEASON END SUMMARY");
        console.log("=".repeat(60));
        console.log(`Players Processed: ${results.totalPlayersProcessed}`);
        console.log(`Rewards Distributed: ${results.totalRewardsDistributed}`);
        console.log(`Prize Cars Awarded: ${results.totalPrizeCarsAwarded}`);
        console.log(`Ratings Reset: ${results.ratingsReset}`);
        console.log(`Defenses Cleared: ${results.defensesCleared}`);
        if (results.alreadyProcessed > 0) {
            console.log(`Skipped (already processed by an earlier run): ${results.alreadyProcessed}`);
        }
        if (results.failedRewards.length > 0) {
            console.log(`⚠️ Failed Rewards: ${results.failedRewards.length}`);
        }
        console.log();

        return { success: true, results };
        
    } catch (error) {
        console.error("❌ Error processing season end:", error);
        return { success: false, error: error.message };
        
    } finally {
        // Only disconnect if we connected ourselves (standalone mode)
        if (weConnected && mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log("✅ Disconnected from database");
        }
    }
}

/**
 * Process a single league
 */
async function processLeague(league, season, dryRun) {
    const result = {
        playersProcessed: 0,
        rewardsDistributed: 0,
        prizeCarsAwarded: 0,
        ratingsReset: 0,
        defensesCleared: 0,
        alreadyProcessed: 0,
        topPlayers: [],
        distributedRewards: [],
        failedRewards: []
    };
    
    // Get all players with defenses in this league who meet minimum games requirement
    const minGames = CONFIG.minGamesForRewards;
    const players = await pvpModel.find({
        [`leagueStats.${league}.defense.0`]: { $exists: true }
    });
    
    // Filter to players who meet minimum games requirement
    const qualifyingPlayers = players.filter(p => {
        const stats = p.leagueStats[league];
        if (!stats) return false;
        const totalGames = (stats.attackWins || 0) + (stats.attackLosses || 0);
        return totalGames >= minGames;
    });
    
    console.log(`  Found ${qualifyingPlayers.length} qualifying players (of ${players.length} with defenses)`);
    
    // Per-player marker: written (with the rating reset) BEFORE the player is
    // paid, so a re-run after a crash skips them. It keeps the rating they
    // finished on, so a re-run still ranks everyone as the first run did
    // (processed players are already back at baseRating).
    const markerPath = `seasonRewardsClaimed.${season.id}.${league}`;
    const markerOf = p => p.seasonRewardsClaimed?.[season.id]?.[league];
    const finalRating = p => {
        const marker = markerOf(p);
        if (marker && typeof marker.rating === "number") return marker.rating;
        return p.leagueStats[league]?.rating || CONFIG.baseRating;
    };

    // Sort by rating for prize cars
    qualifyingPlayers.sort((a, b) => finalRating(b) - finalRating(a));

    const prizeCar = season.prizeCars?.[league];
    const prizeSlots = season.prizeCarSlots || 3;
    if (!prizeCar) console.log("  ℹ️ No prize car configured for this league");

    // Process each qualifying player: claim (marker + soft reset), then prize
    // car (top players) and rating rewards
    for (let i = 0; i < qualifyingPlayers.length; i++) {
        const player = qualifyingPlayers[i];
        const stats = player.leagueStats[league];
        if (!stats) continue;

        const currentRating = finalRating(player);
        const prizeRank = prizeCar && i < prizeSlots ? i + 1 : null;
        if (prizeRank) {
            result.topPlayers.push({ userID: player.userID, rank: prizeRank, rating: currentRating });
            console.log(`  🏆 Rank ${prizeRank}: ${player.userID} - Rating: ${currentRating}`);
        }

        // Calculate rating threshold rewards
        let totalMoney = 0;
        let totalTrophies = 0;
        const claimedThresholds = [];

        for (const threshold of season.ratingRewards || []) {
            if (currentRating >= threshold.rating) {
                totalMoney += threshold.money;
                totalTrophies += threshold.trophies;
                claimedThresholds.push(threshold.rating);
            }
        }

        if (!dryRun) {
            // Atomic claim: only the run that writes the marker pays this player.
            // Full reset rating to base (everyone starts fresh each season).
            const claim = await pvpModel.updateOne(
                { userID: player.userID, [markerPath]: { $exists: false } },
                {
                    $set: {
                        [markerPath]: { thresholds: claimedThresholds, rating: currentRating, prizeRank, processedAt: new Date() },
                        [`leagueStats.${league}.rating`]: CONFIG.baseRating,
                        [`leagueStats.${league}.winStreak`]: 0
                    }
                }
            );
            if (claim.matchedCount === 0) {
                console.log(`  ⏭️ ${player.userID} already processed for this league — skipping`);
                result.alreadyProcessed++;
                continue;
            }
        }

        result.playersProcessed++;
        result.ratingsReset++;

        // Award prize car to top players (stacks onto an owned copy server-side —
        // never a second garage row)
        if (prizeRank) {
            const origin = `PvP Season ${season.id} - ${PVP_LEAGUES[league].name} #${prizeRank}`;
            if (!dryRun) {
                try {
                    const { ok } = await saveGarage({
                        userID: player.userID,
                        before: [],
                        after: addCars([], [{ carID: prizeCar, upgrade: "000" }])
                    });
                    if (ok) {
                        result.distributedRewards.push({ userID: player.userID, league, type: "prizeCar", amount: prizeCar, origin });
                    } else {
                        result.failedRewards.push({ userID: player.userID, league, type: "prizeCar", amount: prizeCar, origin, reason: "No profile found for user" });
                    }
                } catch (err) {
                    result.failedRewards.push({ userID: player.userID, league, type: "prizeCar", amount: prizeCar, origin, reason: err.message });
                }
            }
            result.prizeCarsAwarded++;
        }

        if (totalMoney > 0 || totalTrophies > 0) {
            result.rewardsDistributed++;

            if (!dryRun) {
                const origin = `PvP Season ${season.id} - ${PVP_LEAGUES[league].name}`;
                // Money and trophies in one write, so they land (or fail) together
                const entries = [];
                if (totalMoney > 0) entries.push({ money: totalMoney, origin });
                if (totalTrophies > 0) entries.push({ trophies: totalTrophies, origin });

                try {
                    const pushResult = await profileModel.updateOne(
                        { userID: player.userID },
                        { $push: { unclaimedRewards: { $each: entries } } }
                    );
                    for (const entry of entries) {
                        const type = entry.money !== undefined ? "money" : "trophies";
                        const record = { userID: player.userID, league, type, amount: entry[type], origin };
                        if (pushResult.matchedCount === 0) result.failedRewards.push({ ...record, reason: "No profile found for user" });
                        else result.distributedRewards.push(record);
                    }
                } catch (err) {
                    result.failedRewards.push({
                        userID: player.userID, league, type: "ratingRewards",
                        amount: { money: totalMoney, trophies: totalTrophies },
                        origin,
                        reason: err.message
                    });
                }
            }
        }
    }

    // Clear ALL defenses in this league (including non-qualifying players)
    // This ensures old hands don't persist into the new season with potentially different filters
    if (!dryRun) {
        const clearResult = await pvpModel.updateMany(
            { [`leagueStats.${league}.defense.0`]: { $exists: true } },
            { $set: { [`leagueStats.${league}.defense`]: [] } }
        );
        result.defensesCleared = clearResult.modifiedCount;
    } else {
        // In dry run, just count how many would be cleared
        result.defensesCleared = players.length;
    }
    
    console.log(`  Processed ${result.playersProcessed} players`);
    console.log(`  Distributed rewards to ${result.rewardsDistributed} players`);
    console.log(`  Reset ${result.ratingsReset} ratings`);
    console.log(`  Cleared ${result.defensesCleared || 0} defenses`);
    
    return result;
}

/**
 * Preview leaderboard without processing
 */
async function previewLeaderboard(league, limit = 10) {
    await connectStandalone();
    
    try {
        const players = await pvpModel.getLeaderboard(league, limit, CONFIG.minGamesForRewards);
        
        console.log(`\nTop ${limit} in ${PVP_LEAGUES[league].name}:`);
        console.log("-".repeat(50));
        
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const winRate = p.wins + p.losses > 0 
                ? Math.round((p.wins / (p.wins + p.losses)) * 100) 
                : 0;
            console.log(`${i + 1}. ${p.userID} - Rating: ${p.rating} | ${p.wins}W-${p.losses}L (${winRate}%)`);
        }
        
        return players;
        
    } finally {
        await mongoose.disconnect();
    }
}

// =============================================================================
// CLI HANDLING
// =============================================================================

if (require.main === module) {
    // Standalone: read MONGO_PW from the repo's .env (whatever the cwd)
    require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const force = args.includes("--force");
    const preview = args.includes("--preview");
    const league = args.find(a => !a.startsWith("--")) || "epic";
    
    if (preview) {
        previewLeaderboard(league, 25)
            .then(() => process.exit(0))
            .catch(err => {
                console.error(err);
                process.exit(1);
            });
    } else {
        processSeasonEnd({ dryRun, force })
            .then(result => {
                process.exit(result.success ? 0 : 1);
            })
            .catch(err => {
                console.error(err);
                process.exit(1);
            });
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    processSeasonEnd,
    processLeague,
    previewLeaderboard,
    CONFIG
};
