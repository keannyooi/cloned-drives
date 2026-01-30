"use strict";

const { Schema, model } = require("mongoose");

// =============================================================================
// MAIN SCHEMA
// =============================================================================

/**
 * Default league stats structure
 */
function getDefaultLeagueStats() {
    return {
        rating: 1000,
        peakRating: 1000,
        attackWins: 0,
        attackLosses: 0,
        defenseWins: 0,
        defenseLosses: 0,
        winStreak: 0,
        bestWinStreak: 0,
        defense: []
    };
}

/**
 * PvP Player Schema
 * Stores all PvP-related data for a player
 */
const pvpSchema = new Schema({
    userID: { type: String, required: true, unique: true },
    
    // Per-league statistics and defense lineups
    // Using Mixed type for reliable nested object persistence
    leagueStats: {
        type: Schema.Types.Mixed,
        default: () => ({
            standard: getDefaultLeagueStats(),
            common: getDefaultLeagueStats(),
            uncommon: getDefaultLeagueStats(),
            rare: getDefaultLeagueStats(),
            epic: getDefaultLeagueStats(),
            exotic: getDefaultLeagueStats(),
            legendary: getDefaultLeagueStats(),
            mystic: getDefaultLeagueStats(),
            unlimited: getDefaultLeagueStats()
        })
    },
    
    // Global stats (across all leagues)
    globalStats: {
        type: Schema.Types.Mixed,
        default: () => ({
            totalAttackWins: 0,
            totalAttackLosses: 0,
            totalDefenseWins: 0,
            totalDefenseLosses: 0,
            totalMoneyEarned: 0,
            totalTrophiesEarned: 0
        })
    },
    
    // Daily attack tracking
    attacksToday: { type: Number, default: 0 },
    lastAttackReset: { type: Date, default: Date.now },
    
    // Battle history (last 50 battles)
    battleLog: { type: [Schema.Types.Mixed], default: [] },
    
    // Pending notifications (for defense results)
    pendingNotifications: { type: [Schema.Types.Mixed], default: [] },
    
    // Season tracking
    currentSeasonID: { type: Number, default: 1 },
    seasonRewardsClaimed: { type: Schema.Types.Mixed, default: {} }
    
}, { minimize: false, timestamps: true });

// =============================================================================
// INDEXES
// =============================================================================

// For matchmaking queries
pvpSchema.index({ "leagueStats.standard.rating": 1 });
pvpSchema.index({ "leagueStats.common.rating": 1 });
pvpSchema.index({ "leagueStats.uncommon.rating": 1 });
pvpSchema.index({ "leagueStats.rare.rating": 1 });
pvpSchema.index({ "leagueStats.epic.rating": 1 });
pvpSchema.index({ "leagueStats.exotic.rating": 1 });
pvpSchema.index({ "leagueStats.legendary.rating": 1 });
pvpSchema.index({ "leagueStats.mystic.rating": 1 });
pvpSchema.index({ "leagueStats.unlimited.rating": 1 });

// For leaderboards
pvpSchema.index({ "leagueStats.epic.peakRating": -1 });
pvpSchema.index({ "leagueStats.legendary.peakRating": -1 });

// =============================================================================
// PRE-SAVE HOOK
// =============================================================================

/**
 * Pre-save hook to ensure leagueStats changes are persisted
 */
pvpSchema.pre('save', async function() {
    // Force leagueStats to be marked as modified if it exists
    if (this.leagueStats) {
        this.markModified('leagueStats');
    }
});

// =============================================================================
// INSTANCE METHODS
// =============================================================================

/**
 * Get stats for a specific league
 */
pvpSchema.methods.getLeagueStats = function(league) {
    return this.leagueStats[league] || null;
};

/**
 * Check if defense is set for a league
 */
pvpSchema.methods.hasDefense = function(league) {
    const stats = this.leagueStats[league];
    return stats && stats.defense && stats.defense.length === 5;
};

/**
 * Check if attacks need to be reset (daily reset)
 */
pvpSchema.methods.shouldResetAttacks = function(resetHour = 0) {
    const now = new Date();
    const lastReset = new Date(this.lastAttackReset);
    
    // Create reset time for today
    const todayReset = new Date(now);
    todayReset.setUTCHours(resetHour, 0, 0, 0);
    
    // If we're past today's reset and last reset was before it
    if (now >= todayReset && lastReset < todayReset) {
        return true;
    }
    
    // If last reset was more than 24 hours ago
    const dayInMs = 24 * 60 * 60 * 1000;
    if (now - lastReset >= dayInMs) {
        return true;
    }
    
    return false;
};

/**
 * Add battle to log (keeps last 50)
 */
pvpSchema.methods.addBattleLog = function(battleData) {
    this.battleLog.unshift({
        ...battleData,
        timestamp: new Date()
    });
    
    // Keep only last 50 battles
    if (this.battleLog.length > 50) {
        this.battleLog = this.battleLog.slice(0, 50);
    }
};

/**
 * Add pending notification
 */
pvpSchema.methods.addNotification = function(message) {
    this.pendingNotifications.push({
        timestamp: new Date(),
        message
    });
};

/**
 * Get and clear pending notifications
 */
pvpSchema.methods.getAndClearNotifications = function() {
    const notifications = [...this.pendingNotifications];
    this.pendingNotifications = [];
    return notifications;
};

/**
 * Calculate total CR of a defense
 */
pvpSchema.methods.getDefenseTotalCR = function(league, getCar) {
    const stats = this.leagueStats[league];
    if (!stats || !stats.defense) return 0;
    
    return stats.defense.reduce((total, car) => {
        const carData = getCar(car.carID);
        return total + (carData?.cr || 0);
    }, 0);
};

/**
 * Set defense for a league (properly triggers save)
 */
pvpSchema.methods.setDefense = function(league, cars) {
    // Ensure leagueStats exists
    if (!this.leagueStats) {
        this.leagueStats = {};
    }
    
    // Ensure league stats exist
    if (!this.leagueStats[league]) {
        this.leagueStats[league] = {
            rating: 1000,
            peakRating: 1000,
            attackWins: 0,
            attackLosses: 0,
            defenseWins: 0,
            defenseLosses: 0,
            winStreak: 0,
            bestWinStreak: 0,
            defense: []
        };
    }
    
    // Create new array with plain objects (not Mongoose documents)
    const defenseCopy = cars.map(car => ({
        carID: car.carID,
        upgrade: car.upgrade || "000"
    }));
    
    this.leagueStats[league].defense = defenseCopy;
    
    // Mark both the specific defense AND the entire leagueStats as modified
    this.markModified(`leagueStats.${league}.defense`);
    this.markModified(`leagueStats.${league}`);
    this.markModified('leagueStats');
    
    console.log(`[PvP Schema] setDefense called for ${league}:`, defenseCopy);
};

/**
 * Update rating for a league
 */
pvpSchema.methods.updateRating = function(league, change) {
    if (!this.leagueStats[league]) {
        this.leagueStats[league] = { rating: 1000, peakRating: 1000 };
    }
    
    this.leagueStats[league].rating += change;
    
    if (this.leagueStats[league].rating > this.leagueStats[league].peakRating) {
        this.leagueStats[league].peakRating = this.leagueStats[league].rating;
    }
    
    this.markModified(`leagueStats.${league}`);
};

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find or create PvP profile for a user
 */
pvpSchema.statics.findOrCreate = async function(userID) {
    let profile = await this.findOne({ userID });
    
    if (!profile) {
        profile = new this({ userID });
        
        // Ensure leagueStats is properly initialized
        if (!profile.leagueStats) {
            profile.leagueStats = {};
        }
        
        const leagues = ['standard', 'common', 'uncommon', 'rare', 'epic', 'exotic', 'legendary', 'mystic', 'unlimited'];
        for (const league of leagues) {
            if (!profile.leagueStats[league]) {
                profile.leagueStats[league] = getDefaultLeagueStats();
            }
        }
        
        profile.markModified('leagueStats');
        await profile.save();
        console.log(`[PvP Schema] Created new profile for ${userID}`);
    }
    
    return profile;
};

/**
 * Get leaderboard for a league
 */
pvpSchema.statics.getLeaderboard = async function(league, limit = 25, minGames = 5) {
    const ratingPath = `leagueStats.${league}.rating`;
    const peakRatingPath = `leagueStats.${league}.peakRating`;
    const winsPath = `leagueStats.${league}.attackWins`;
    const lossesPath = `leagueStats.${league}.attackLosses`;
    const defensePath = `leagueStats.${league}.defense`;
    
    return await this.aggregate([
        {
            $match: {
                // Must have defense set
                [`${defensePath}.0`]: { $exists: true },
                // Must have minimum games
                $expr: {
                    $gte: [
                        { $add: [`$${winsPath}`, `$${lossesPath}`] },
                        minGames
                    ]
                }
            }
        },
        {
            $project: {
                userID: 1,
                rating: `$${ratingPath}`,
                peakRating: `$${peakRatingPath}`,
                wins: `$${winsPath}`,
                losses: `$${lossesPath}`,
                winStreak: `$leagueStats.${league}.winStreak`,
                bestWinStreak: `$leagueStats.${league}.bestWinStreak`
            }
        },
        { $sort: { rating: -1 } },
        { $limit: limit }
    ]);
};

/**
 * Find opponents for matchmaking
 */
pvpSchema.statics.findOpponents = async function(attackerID, league, attackerRating, range) {
    const ratingPath = `leagueStats.${league}.rating`;
    const defensePath = `leagueStats.${league}.defense`;
    
    return await this.find({
        userID: { $ne: attackerID },
        [`${defensePath}.0`]: { $exists: true },
        [ratingPath]: {
            $gte: attackerRating - range,
            $lte: attackerRating + range
        }
    }).limit(10);
};

/**
 * Get all players with defenses in a league (for season end)
 */
pvpSchema.statics.getLeaguePlayers = async function(league, minGames = 0) {
    const defensePath = `leagueStats.${league}.defense`;
    const winsPath = `leagueStats.${league}.attackWins`;
    const lossesPath = `leagueStats.${league}.attackLosses`;
    
    const query = {
        [`${defensePath}.0`]: { $exists: true }
    };
    
    if (minGames > 0) {
        query.$expr = {
            $gte: [
                { $add: [`$${winsPath}`, `$${lossesPath}`] },
                minGames
            ]
        };
    }
    
    return await this.find(query).sort({ [`leagueStats.${league}.rating`]: -1 });
};

// =============================================================================
// EXPORT
// =============================================================================

const pvpModel = model("PvP", pvpSchema);
module.exports = pvpModel;
