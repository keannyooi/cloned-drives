"use strict";

/**
 * PvP Seasons Configuration
 * 
 * Each season defines:
 * - Duration (start/end dates)
 * - Track pool (which track set to use)
 * - Rewards for each league
 * - Rating thresholds for bonus rewards
 */

const { LEAGUE_ORDER } = require("./pvpConfig.js");
const { getTrackPool } = require("./pvpTracks.js");

// =============================================================================
// SEASON DEFINITIONS
// =============================================================================

/**
 * All seasons
 * Season IDs should be sequential (1, 2, 3, ...)
 */
const SEASONS = {
    1: {
        id: 1,
        name: "Season 0: City Crushing (BETA)",
        description: "Classic city racing - prove your skills on the streets!",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-02-02T20:59:59Z"),
        trackPoolID: "city",
		
        // Car filter (same format as event reqs / garage filters)
        // Uses filterCheck - supports: make, country, driveType, tyreType, gc, 
        // bodyStyle, enginePos, fuelType, tags, collection, cr, modelYear, seatCount,
        // isPrize, isStock, isMaxed, isBM, search, abs, tcs
        // Leave empty {} or omit for no restrictions
        filter: {},
		
        // Rating thresholds for bonus rewards (same for all leagues)
        ratingRewards: [
            { rating: 1100, money: 100000, trophies: 2 },
            { rating: 1200, money: 250000, trophies: 5 },
            { rating: 1300, money: 500000, trophies: 10 },
            { rating: 1400, money: 1000000, trophies: 50 },
            { rating: 1500, money: 2000000, trophies: 50 }
        ],
        
        // Prize cars per league (top N players)
        prizeCarSlots: 3, // Top 3 get prize cars
        prizeCars: {
            standard: "c01023",
            common: "c06138",
            uncommon: "c00927",
            rare: "c08004",
            epic: "c02762",
            exotic: "c07422",
            legendary: "c00212",
            mystic: "c04967",
            unlimited: "c05328"
        }
    },
    
    2: {
        id: 2,
        name: "Season 1: CNY: Year of the Horse",
        description: "Trading the daily commute for 2026 horsepower. It’s time to unbridle the beast and redline into the New Year!",
        startDate: new Date("2026-02-04T00:00:00Z"),
        endDate: new Date("2026-03-21T23:59:59Z"),
        trackPoolID: "offroad",
        filter: {tags: ["Year of the Horse"]},
        
        ratingRewards: [
            { rating: 1100, money: 10000, trophies: 10 },
            { rating: 1200, money: 25000, trophies: 25 },
            { rating: 1300, money: 50000, trophies: 50 },
            { rating: 1400, money: 100000, trophies: 100 },
            { rating: 1500, money: 200000, trophies: 200 }
        ],
        
        prizeCarSlots: 5, // Top 5 get prize cars
        prizeCars: {
            epic: null,
            exotic: null,
            legendary: null,
            mystic: null,
            unlimited: null
        }
    },
    
    3: {
        id: 3,
        name: "Season 2: ",
        description: "???",
        startDate: new Date("2027-04-01T00:00:00Z"),
        endDate: new Date("2027-04-30T23:59:59Z"),
        trackPoolID: "winter",
        filter: {},        
        ratingRewards: [
            { rating: 1100, money: 10000, trophies: 10 },
            { rating: 1200, money: 25000, trophies: 25 },
            { rating: 1300, money: 50000, trophies: 50 },
            { rating: 1400, money: 100000, trophies: 100 },
            { rating: 1500, money: 200000, trophies: 200 }
        ],
        
        prizeCarSlots: 3,
        prizeCars: {
            epic: null,
            exotic: null,
            legendary: null,
            mystic: null,
            unlimited: null
        }
    },
    
    4: {
        id: 4,
        name: "Season 4: Mixed Masters",
        description: "Variety is key - adapt to any surface!",
        startDate: new Date("2027-05-01T00:00:00Z"),
        endDate: new Date("2027-05-31T23:59:59Z"),
        trackPoolID: "mixed",
        filter: {},        
        ratingRewards: [
            { rating: 1100, money: 10000, trophies: 10 },
            { rating: 1200, money: 25000, trophies: 25 },
            { rating: 1300, money: 50000, trophies: 50 },
            { rating: 1400, money: 100000, trophies: 100 },
            { rating: 1500, money: 200000, trophies: 200 }
        ],
        
        prizeCarSlots: 3,
        prizeCars: {
            epic: null,
            exotic: null,
            legendary: null,
            mystic: null,
            unlimited: null
        }
    }
};

// =============================================================================
// SEASON HELPERS
// =============================================================================

/**
 * Get current active season
 * Returns null during off-season periods
 */
function getCurrentSeason() {
    const now = new Date();
    
    // Find season where we're between start and end dates
    for (const season of Object.values(SEASONS)) {
        if (now >= season.startDate && now <= season.endDate) {
            return {
                ...season,
                trackPool: getTrackPool(season.trackPoolID),
                isActive: true
            };
        }
    }
    
    // No active season - return null or a placeholder
    return null;
}

/**
 * Get the most recent season (active or ended)
 * Useful for displaying results even after season ends
 */
function getMostRecentSeason() {
    const now = new Date();
    const seasonIDs = Object.keys(SEASONS).map(Number).sort((a, b) => b - a);
    
    // Find most recent season that has started
    for (const id of seasonIDs) {
        if (now >= SEASONS[id].startDate) {
            return {
                ...SEASONS[id],
                trackPool: getTrackPool(SEASONS[id].trackPoolID),
                isActive: now <= SEASONS[id].endDate
            };
        }
    }
    
    // Return first season as fallback
    const firstSeason = SEASONS[seasonIDs[seasonIDs.length - 1]];
    return {
        ...firstSeason,
        trackPool: getTrackPool(firstSeason.trackPoolID),
        isActive: false
    };
}

/**
 * Check if PvP is currently in an active season
 */
function isSeasonActive() {
    return getCurrentSeason() !== null;
}

/**
 * Get a specific season by ID
 */
function getSeason(seasonID) {
    const season = SEASONS[seasonID];
    if (!season) return null;
    
    return {
        ...season,
        trackPool: getTrackPool(season.trackPoolID)
    };
}

/**
 * Get next season (for preview)
 */
function getNextSeason() {
    const current = getCurrentSeason() || getMostRecentSeason();
    if (!current) return null;
    
    const nextID = current.id + 1;
    return getSeason(nextID);
}

/**
 * Get time remaining in current season
 */
function getSeasonTimeRemaining() {
    const season = getCurrentSeason();
    
    // No active season
    if (!season) {
        return { days: 0, hours: 0, minutes: 0, expired: true };
    }
    
    const now = new Date();
    const remaining = season.endDate - now;
    
    if (remaining <= 0) {
        return { days: 0, hours: 0, minutes: 0, expired: true };
    }
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, expired: false };
}

/**
 * Check if season has ended and needs processing
 */
function isSeasonEnded() {
    const season = getMostRecentSeason();
    if (!season) return false;
    
    const now = new Date();
    return now > season.endDate;
}

/**
 * Get all seasons (for admin display)
 */
function getAllSeasons() {
    return Object.values(SEASONS).map(s => ({
        ...s,
        trackPool: getTrackPool(s.trackPoolID)
    }));
}

/**
 * Add a new season (runtime only - update file for persistence)
 */
function addSeason(seasonData) {
    const id = Math.max(...Object.keys(SEASONS).map(Number)) + 1;
    SEASONS[id] = {
        id,
        ...seasonData
    };
    return id;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    SEASONS,
    getCurrentSeason,
    getMostRecentSeason,
    isSeasonActive,
    getSeason,
    getNextSeason,
    getSeasonTimeRemaining,
    isSeasonEnded,
    getAllSeasons,
    addSeason
};
