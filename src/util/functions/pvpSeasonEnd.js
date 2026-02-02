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
 */

const mongoose = require("mongoose");
const pvpModel = require("../../models/pvpSchema.js");
const profileModel = require("../../models/profileSchema.js");
const { PVP_LEAGUES, LEAGUE_ORDER, PVP_SETTINGS } = require("../consts/pvpConfig.js");
const { getCurrentSeason, getMostRecentSeason, getSeason, isSeasonEnded } = require("../consts/pvpSeasons.js");

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    // MongoDB connection string (set via environment or here)
    mongoURI: process.env.MONGO_URI || "mongodb://localhost:27017/cloneddrives",
    
    // Minimum games to qualify for rewards
    minGamesForRewards: PVP_SETTINGS.minGamesForRewards || 10,
    
    // Rating decay toward base (0.5 = 50% toward 1000)
    ratingDecayFactor: PVP_SETTINGS.ratingDecayFactor || 0.5,
    
    // Base rating
    baseRating: PVP_SETTINGS.baseRating || 1000
};

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
        await mongoose.connect(CONFIG.mongoURI);
        weConnected = true;
        console.log("✅ Connected to database");
    } else {
        console.log("✅ Using existing database connection");
    }
    
    const results = {
        season: currentSeason,
        leagueResults: {},
        totalPlayersProcessed: 0,
        totalRewardsDistributed: 0,
        totalPrizeCarsAwarded: 0,
        ratingsReset: 0
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
        
        console.log("\n" + "=".repeat(60));
        console.log("SEASON END SUMMARY");
        console.log("=".repeat(60));
        console.log(`Players Processed: ${results.totalPlayersProcessed}`);
        console.log(`Rewards Distributed: ${results.totalRewardsDistributed}`);
        console.log(`Prize Cars Awarded: ${results.totalPrizeCarsAwarded}`);
        console.log(`Ratings Reset: ${results.ratingsReset}`);
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
        topPlayers: []
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
    
    // Sort by rating for prize cars
    qualifyingPlayers.sort((a, b) => {
        const ratingA = a.leagueStats[league]?.rating || CONFIG.baseRating;
        const ratingB = b.leagueStats[league]?.rating || CONFIG.baseRating;
        return ratingB - ratingA;
    });
    
    // Award prize cars to top players
    const prizeCar = season.prizeCars?.[league];
    const prizeSlots = season.prizeCarSlots || 3;
    
    if (prizeCar) {
        const topPlayers = qualifyingPlayers.slice(0, prizeSlots);
        
        for (let i = 0; i < topPlayers.length; i++) {
            const player = topPlayers[i];
            result.topPlayers.push({
                userID: player.userID,
                rank: i + 1,
                rating: player.leagueStats[league]?.rating || CONFIG.baseRating
            });
            
            console.log(`  🏆 Rank ${i + 1}: ${player.userID} - Rating: ${player.leagueStats[league]?.rating}`);
            
            if (!dryRun) {
                // Add car to player's garage (properly stacking if they already own it)
                const profile = await profileModel.findOne({ userID: player.userID });
                if (profile) {
                    const existingCar = profile.garage.find(c => c.carID === prizeCar);
                    
                    if (existingCar) {
                        // Increment existing car's 000 upgrade count
                        await profileModel.updateOne(
                            { userID: player.userID, "garage.carID": prizeCar },
                            { $inc: { "garage.$.upgrades.000": 1 } }
                        );
                    } else {
                        // Add new car entry
                        await profileModel.updateOne(
                            { userID: player.userID },
                            {
                                $push: {
                                    garage: {
                                        carID: prizeCar,
                                        upgrades: { "000": 1 },
                                        tpiBonus: 0
                                    }
                                }
                            }
                        );
                    }
                }
            }
            result.prizeCarsAwarded++;
        }
    } else {
        console.log("  ℹ️ No prize car configured for this league");
    }
    
    // Process each qualifying player for rating rewards and soft reset
    for (const player of qualifyingPlayers) {
        const stats = player.leagueStats[league];
        if (!stats) continue;
        
        const currentRating = stats.rating || CONFIG.baseRating;
        result.playersProcessed++;
        
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
        
        if (totalMoney > 0 || totalTrophies > 0) {
            result.rewardsDistributed++;
            
            if (!dryRun) {
                // Add rewards to unclaimed (separate objects with reward type first)
                if (totalMoney > 0) {
                    await profileModel.updateOne(
                        { userID: player.userID },
                        {
                            $push: {
                                unclaimedRewards: {
                                    money: totalMoney,
                                    origin: `PvP Season ${season.id} - ${PVP_LEAGUES[league].name}`
                                }
                            }
                        }
                    );
                }
                
                if (totalTrophies > 0) {
                    await profileModel.updateOne(
                        { userID: player.userID },
                        {
                            $push: {
                                unclaimedRewards: {
                                    trophies: totalTrophies,
                                    origin: `PvP Season ${season.id} - ${PVP_LEAGUES[league].name}`
                                }
                            }
                        }
                    );
                }
                
                // Mark rewards as claimed
                await pvpModel.updateOne(
                    { userID: player.userID },
                    {
                        $set: {
                            [`seasonRewardsClaimed.${season.id}.${league}`]: claimedThresholds
                        }
                    }
                );
            }
        }
        
        // Soft reset rating (50% toward base)
        const newRating = Math.round(
            CONFIG.baseRating + (currentRating - CONFIG.baseRating) * CONFIG.ratingDecayFactor
        );
        
        if (!dryRun) {
            await pvpModel.updateOne(
                { userID: player.userID },
                {
                    $set: {
                        [`leagueStats.${league}.rating`]: newRating,
                        [`leagueStats.${league}.winStreak`]: 0
                    }
                }
            );
        }
        
        result.ratingsReset++;
    }
    
    console.log(`  Processed ${result.playersProcessed} players`);
    console.log(`  Distributed rewards to ${result.rewardsDistributed} players`);
    console.log(`  Reset ${result.ratingsReset} ratings`);
    
    return result;
}

/**
 * Preview leaderboard without processing
 */
async function previewLeaderboard(league, limit = 10) {
    await mongoose.connect(CONFIG.mongoURI);
    
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
