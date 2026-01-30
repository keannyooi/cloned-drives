"use strict";

/**
 * PvP Banned Cars
 * 
 * Cars that are banned from PvP either globally or per-season/league.
 * Bans are typically applied to overpowered or meta-dominating cars.
 */

// =============================================================================
// BAN DEFINITIONS
// =============================================================================

/**
 * Global bans - these cars are banned in ALL seasons and ALL leagues
 * Format: { carID: "reason" }
 */
const GLOBAL_BANS = {
    // Example:
    // "c00001": "Overpowered in all conditions",
    // "c00002": "Stats glitched, pending fix"
	"c06409": "Overpowered?"
};

/**
 * Season-specific bans
 * Format: { seasonID: { allLeagues: [...], perLeague: { leagueName: [...] } } }
 */
const SEASON_BANS = {
    1: {
        // Banned in all leagues for this season
        allLeagues: [
            // { carID: "c00010", reason: "Dominates asphalt meta" }
        ],
        // Banned in specific leagues only
        perLeague: {
            epic: [
                // { carID: "c00020", reason: "Too strong for Epic league" }
            ],
            legendary: [],
            mystic: [],
            unlimited: []
        }
    },
    2: {
        allLeagues: [],
        perLeague: {
            epic: [],
            legendary: [],
            mystic: [],
            unlimited: []
        }
    },
    3: {
        allLeagues: [],
        perLeague: {
            epic: [],
            legendary: [],
            mystic: [],
            unlimited: []
        }
    },
    4: {
        allLeagues: [],
        perLeague: {
            epic: [],
            legendary: [],
            mystic: [],
            unlimited: []
        }
    }
};

/**
 * Ban reasons dictionary for common reasons
 */
const BAN_REASONS = {
    OP_ALL: "Overpowered in all conditions",
    OP_ASPHALT: "Dominates asphalt tracks",
    OP_OFFROAD: "Dominates off-road tracks",
    OP_WINTER: "Dominates winter conditions",
    META_DOMINANT: "Appears in >80% of top defenses",
    STATS_BUG: "Stats issue pending fix",
    BALANCE_REVIEW: "Under balance review",
    EVENT_EXCLUSIVE: "Reserved for events only"
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a car is banned for a specific league and season
 */
function isCarBanned(carID, league, seasonID) {
    // Check global bans first
    if (GLOBAL_BANS[carID]) {
        return true;
    }
    
    // Check season-specific bans
    const seasonBans = SEASON_BANS[seasonID];
    if (!seasonBans) return false;
    
    // Check all-league bans for this season
    if (seasonBans.allLeagues.some(ban => ban.carID === carID)) {
        return true;
    }
    
    // Check league-specific bans
    const leagueBans = seasonBans.perLeague[league];
    if (leagueBans && leagueBans.some(ban => ban.carID === carID)) {
        return true;
    }
    
    return false;
}

/**
 * Get ban reason for a car
 */
function getBanReason(carID, league, seasonID) {
    // Check global bans
    if (GLOBAL_BANS[carID]) {
        return GLOBAL_BANS[carID];
    }
    
    // Check season bans
    const seasonBans = SEASON_BANS[seasonID];
    if (!seasonBans) return "Banned";
    
    // Check all-league bans
    const allLeagueBan = seasonBans.allLeagues.find(ban => ban.carID === carID);
    if (allLeagueBan) {
        return allLeagueBan.reason || "Banned this season";
    }
    
    // Check league-specific bans
    const leagueBans = seasonBans.perLeague[league];
    if (leagueBans) {
        const leagueBan = leagueBans.find(ban => ban.carID === carID);
        if (leagueBan) {
            return leagueBan.reason || `Banned in ${league}`;
        }
    }
    
    return "Banned";
}

/**
 * Get all banned cars for a league and season
 */
function getBannedCars(league, seasonID) {
    const banned = [];
    
    // Add global bans
    for (const [carID, reason] of Object.entries(GLOBAL_BANS)) {
        banned.push({ carID, reason, isGlobal: true });
    }
    
    // Add season bans
    const seasonBans = SEASON_BANS[seasonID];
    if (seasonBans) {
        // All-league bans
        for (const ban of seasonBans.allLeagues) {
            banned.push({ ...ban, isGlobal: false, isAllLeagues: true });
        }
        
        // League-specific bans
        const leagueBans = seasonBans.perLeague[league];
        if (leagueBans) {
            for (const ban of leagueBans) {
                banned.push({ ...ban, isGlobal: false, isAllLeagues: false });
            }
        }
    }
    
    return banned;
}

/**
 * Get count of banned cars per league for a season
 */
function getBanCountByLeague(seasonID) {
    const counts = {};
    const seasonBans = SEASON_BANS[seasonID] || { allLeagues: [], perLeague: {} };
    const globalCount = Object.keys(GLOBAL_BANS).length;
    const allLeagueCount = seasonBans.allLeagues.length;
    
    for (const league of Object.keys(seasonBans.perLeague)) {
        const leagueSpecificCount = seasonBans.perLeague[league]?.length || 0;
        counts[league] = globalCount + allLeagueCount + leagueSpecificCount;
    }
    
    return counts;
}

/**
 * Add a ban (runtime only - update file for persistence)
 */
function addBan(carID, reason, seasonID = null, league = null) {
    if (!seasonID) {
        // Global ban
        GLOBAL_BANS[carID] = reason;
    } else {
        if (!SEASON_BANS[seasonID]) {
            SEASON_BANS[seasonID] = { allLeagues: [], perLeague: {} };
        }
        
        if (!league) {
            // All-league ban for season
            SEASON_BANS[seasonID].allLeagues.push({ carID, reason });
        } else {
            // League-specific ban
            if (!SEASON_BANS[seasonID].perLeague[league]) {
                SEASON_BANS[seasonID].perLeague[league] = [];
            }
            SEASON_BANS[seasonID].perLeague[league].push({ carID, reason });
        }
    }
}

/**
 * Remove a ban (runtime only)
 */
function removeBan(carID, seasonID = null, league = null) {
    if (!seasonID) {
        delete GLOBAL_BANS[carID];
    } else {
        const seasonBans = SEASON_BANS[seasonID];
        if (!seasonBans) return;
        
        if (!league) {
            seasonBans.allLeagues = seasonBans.allLeagues.filter(b => b.carID !== carID);
        } else if (seasonBans.perLeague[league]) {
            seasonBans.perLeague[league] = seasonBans.perLeague[league].filter(b => b.carID !== carID);
        }
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    GLOBAL_BANS,
    SEASON_BANS,
    BAN_REASONS,
    isCarBanned,
    getBanReason,
    getBannedCars,
    getBanCountByLeague,
    addBan,
    removeBan
};
