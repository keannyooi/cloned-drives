"use strict";

/**
 * PvP Configuration - Core Settings
 * 
 * For seasons, tracks, and bans, see:
 * - pvpSeasons.js
 * - pvpTracks.js  
 * - pvpBans.js
 */

// =============================================================================
// LEAGUE DEFINITIONS
// =============================================================================

const PVP_LEAGUES = {
    standard: {
        name: "Standard League",
        minCarCR: 0,
        maxCarCR: 99,
        maxTotalCR: 400,
        maxDuplicates: 2,
        emoji: "standardEmojiID",
        color: 0x9E9E9E,
        minGarageSize: 10,
        entryFee: 0,
        baseReward: 5000
    },
    common: {
        name: "Common League",
        minCarCR: 100,
        maxCarCR: 249,
        maxTotalCR: 1000,
        maxDuplicates: 2,
        emoji: "commonEmojiID",
        color: 0x8D6E63,
        minGarageSize: 15,
        entryFee: 0,
        baseReward: 10000
    },
    uncommon: {
        name: "Uncommon League",
        minCarCR: 250,
        maxCarCR: 399,
        maxTotalCR: 1600,
        maxDuplicates: 2,
        emoji: "uncommonEmojiID",
        color: 0x4CAF50,
        minGarageSize: 20,
        entryFee: 1000,
        baseReward: 20000
    },
    rare: {
        name: "Rare League",
        minCarCR: 400,
        maxCarCR: 549,
        maxTotalCR: 2200,
        maxDuplicates: 2,
        emoji: "rareEmojiID",
        color: 0x2196F3,
        minGarageSize: 25,
        entryFee: 2500,
        baseReward: 35000
    },
    epic: {
        name: "Epic League",
        minCarCR: 550,
        maxCarCR: 699,
        maxTotalCR: 3000,
        maxDuplicates: 2,
        emoji: "epicEmojiID",
        color: 0x9C27B0,
        minGarageSize: 30,
        entryFee: 5000,
        baseReward: 50000
    },
    exotic: {
        name: "Exotic League",
        minCarCR: 700,
        maxCarCR: 849,
        maxTotalCR: 3600,
        maxDuplicates: 2,
        emoji: "exoticEmojiID",
        color: 0xFFC107,
        minGarageSize: 35,
        entryFee: 10000,
        baseReward: 75000
    },
    legendary: {
        name: "Legendary League",
        minCarCR: 850,
        maxCarCR: 999,
        maxTotalCR: 4200,
        maxDuplicates: 2,
        emoji: "legendaryEmojiID",
        color: 0xFF9800,
        minGarageSize: 40,
        entryFee: 25000,
        baseReward: 100000
    },
    mystic: {
        name: "Mystic League",
        minCarCR: 1000,
        maxCarCR: 1500,
        maxTotalCR: 5500,
        maxDuplicates: 2,
        emoji: "mysticEmojiID",
        color: 0xE91E63,
        minGarageSize: 50,
        entryFee: 50000,
        baseReward: 150000
    },
    unlimited: {
        name: "Unlimited League",
        minCarCR: 0,
        maxCarCR: Infinity,
        maxTotalCR: Infinity,
        maxDuplicates: 2,
        emoji: "bossEmojiID",
        color: 0xF44336,
        minGarageSize: 75,
        entryFee: 100000,
        baseReward: 250000
    }
};

// League order (for display)
const LEAGUE_ORDER = [
    "standard", "common", "uncommon", "rare", 
    "epic", "exotic", "legendary", "mystic", "unlimited"
];

// =============================================================================
// PVP SETTINGS
// =============================================================================

const PVP_SETTINGS = {
    // Daily limits
    maxAttacksPerDay: 25,
    attackResetHour: 0, // UTC hour when attacks reset
    
    // Matchmaking
    baseRatingRange: 150,
    maxRatingRange: 500,
    matchmakingAttempts: 5,
    opponentsToShow: 3,
    
    // Rating
    baseRating: 1000,
    kFactor: 32,
    minRatingChange: 8,
    maxRatingChange: 48,
    
    // Battle
    racesPerBattle: 5,
    racesToWin: 3,
    
    // Rewards
    baseTrophiesPerWin: 1,
    ghostRewardMultiplier: 0.5,
    
    // Streak bonuses (win streak => multiplier)
    streakBonuses: {
        3: 1.3,   // 130% bonus at 3 wins
        5: 1.7,   // 170% at 5 wins
        10: 1.35, // 35% at 10 wins
        15: 1.5,  // 50% at 15 wins
        20: 1.75  // 75% at 20 wins
    },
    
    // Timeouts (ms)
    opponentSelectTimeout: 120000,
    carSelectTimeout: 60000,
    
    // Season end
    ratingDecayFactor: 0.5, // Ratings decay 50% toward base between seasons
    minGamesForRewards: 5, // Minimum games to qualify for season rewards
    
    // Leaderboard
    minGamesForLeaderboard: 5 // Minimum games to appear on leaderboard
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get league configuration by name
 */
function getLeague(leagueName) {
    const name = leagueName?.toLowerCase();
    return PVP_LEAGUES[name] || null;
}

/**
 * Get league tier (1-9) for reward scaling
 */
function getLeagueTier(league) {
    const index = LEAGUE_ORDER.indexOf(league);
    return index >= 0 ? index + 1 : 1;
}

/**
 * Generate ghost opponent name
 */
function generateGhostName() {
    const prefixes = ["Shadow", "Phantom", "Ghost", "Specter", "Spirit", "Wraith", "Shade"];
    const suffixes = ["Racer", "Driver", "Pilot", "Speedster", "Runner", "Drifter", "Champion"];
    const numbers = ["", "", "", "99", "13", "7", "42", "88"];
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const number = numbers[Math.floor(Math.random() * numbers.length)];
    
    return `${prefix}${suffix}${number}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    PVP_LEAGUES,
    LEAGUE_ORDER,
    PVP_SETTINGS,
    getLeague,
    getLeagueTier,
    generateGhostName
};
