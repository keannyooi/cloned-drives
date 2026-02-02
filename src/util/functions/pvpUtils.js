"use strict";

const { getCar, getTrackFiles, getTrack, getCarFiles } = require("./dataManager.js");
const { 
    PVP_LEAGUES, 
    PVP_SETTINGS, 
    generateGhostName,
    getLeagueTier
} = require("../consts/pvpConfig.js");
const { getCurrentSeason } = require("../consts/pvpSeasons.js");
const { isCarBanned, getBanReason } = require("../consts/pvpBans.js");
const { surfaceSupportsRain } = require("../consts/pvpTracks.js");
const carNameGen = require("./carNameGen.js");
const { getAvailableTunes } = require("./calcTune.js");

// =============================================================================
// HAND VALIDATION
// =============================================================================

/**
 * Get the base car ID for duplicate counting
 * BM/Prize cars reference a base car, so we count them together
 */
function getBaseCarID(carID) {
    const carData = getCar(carID);
    if (!carData) return carID;
    
    // If car has a reference, use the reference (base car) for duplicate counting
    if (carData.reference) {
        return carData.reference;
    }
    
    return carID;
}

/**
 * Get the effective CR for a car
 * BM/Prize cars may have CR 0, so we get it from the referenced car
 */
function getEffectiveCR(carID) {
    const carData = getCar(carID);
    if (!carData) return 0;
    
    // If car has a reference and CR is 0 or missing, use the reference's CR
    if (carData.reference) {
        const baseCarData = getCar(carData.reference);
        if (baseCarData) {
            return baseCarData.cr || 0;
        }
    }
    
    return carData.cr || 0;
}

/**
 * Validate a PvP hand for a specific league
 * @param {Array} cars - Array of { carID, upgrade }
 * @param {String} league - League name
 * @param {Number} seasonID - Current season ID
 * @returns {Object} { valid, errors, warnings, totalCR, carCounts }
 */
function validatePvPHand(cars, league, seasonID) {
    const leagueConfig = PVP_LEAGUES[league];
    if (!leagueConfig) {
        return { valid: false, errors: ["Invalid league"], warnings: [], totalCR: 0, carCounts: {} };
    }
    
    const errors = [];
    const warnings = [];
    const carCounts = {};  // Counts by BASE car ID (for duplicate detection)
    let totalCR = 0;
    
    // Check car count
    if (cars.length !== 5) {
        errors.push(`Need exactly 5 cars (got ${cars.length})`);
    }
    
    for (const car of cars) {
        const carData = getCar(car.carID);
        
        if (!carData) {
            errors.push(`Invalid car ID: ${car.carID}`);
            continue;
        }
        
        // Get effective CR (handles BM cars with CR 0)
        const carCR = getEffectiveCR(car.carID);
        totalCR += carCR;
        
        // Check minimum CR (rarity floor)
        if (carCR < leagueConfig.minCarCR) {
            const carName = carNameGen({ currentCar: carData });
            errors.push(`${carName} (CR ${carCR}) is below minimum CR ${leagueConfig.minCarCR} for this league`);
        }
        
        // Check maximum CR (rarity ceiling)
        if (carCR > leagueConfig.maxCarCR) {
            const carName = carNameGen({ currentCar: carData });
            errors.push(`${carName} (CR ${carCR}) exceeds max CR ${leagueConfig.maxCarCR} for this league`);
        }
        
        // Check if banned (check both the car and its base car)
        const baseCarID = getBaseCarID(car.carID);
        if (isCarBanned(car.carID, league, seasonID) || isCarBanned(baseCarID, league, seasonID)) {
            const carName = carNameGen({ currentCar: carData });
            const reason = getBanReason(car.carID, league, seasonID) || getBanReason(baseCarID, league, seasonID);
            errors.push(`🚫 ${carName} is BANNED: ${reason}`);
        }
        
        // Count duplicates by BASE car ID (so BM + base car count together)
        carCounts[baseCarID] = (carCounts[baseCarID] || 0) + 1;
    }
    
    // Check duplicate limit
    for (const [carID, count] of Object.entries(carCounts)) {
        if (count > leagueConfig.maxDuplicates) {
            const carData = getCar(carID);
            const carName = carNameGen({ currentCar: carData });
            errors.push(`${carName} used ${count}x (max ${leagueConfig.maxDuplicates})`);
        } else if (count === leagueConfig.maxDuplicates) {
            const carData = getCar(carID);
            const carName = carNameGen({ currentCar: carData });
            warnings.push(`${carName} at duplicate limit (${count}/${leagueConfig.maxDuplicates})`);
        }
    }
    
    // Check total CR budget
    if (leagueConfig.maxTotalCR !== Infinity && totalCR > leagueConfig.maxTotalCR) {
        const over = totalCR - leagueConfig.maxTotalCR;
        errors.push(`Total CR ${totalCR} exceeds budget of ${leagueConfig.maxTotalCR} (over by ${over})`);
    }
    
    // Analyze for season track pool warnings
    const season = getCurrentSeason();
    if (season) {
        const tyreWarning = analyzeTyreCoverage(cars, season.trackPool.surfaces);
        if (tyreWarning) {
            warnings.push(tyreWarning);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        totalCR,
        remainingCR: leagueConfig.maxTotalCR === Infinity ? Infinity : leagueConfig.maxTotalCR - totalCR,
        carCounts
    };
}

/**
 * Get max CR allowed for next car based on current total and remaining slots
 */
function getMaxAllowedCR(currentTotal, league, slotsRemaining = 1) {
    const leagueConfig = PVP_LEAGUES[league];
    if (!leagueConfig) return 0;
    
    if (leagueConfig.maxTotalCR === Infinity) {
        return leagueConfig.maxCarCR;
    }
    
    // Calculate remaining budget
    const remainingBudget = leagueConfig.maxTotalCR - currentTotal;
    
    // If more than 1 slot remaining, reserve minCarCR for each future slot
    const reserveForFutureSlots = (slotsRemaining - 1) * leagueConfig.minCarCR;
    const availableForThisCar = remainingBudget - reserveForFutureSlots;
    
    // Can't exceed per-car max or available budget
    return Math.min(availableForThisCar, leagueConfig.maxCarCR);
}

/**
 * Analyze tyre coverage for season warnings
 */
function analyzeTyreCoverage(cars, surfaces) {
    let slickCount = 0;
    let offRoadCount = 0;
    
    for (const car of cars) {
        const carData = getCar(car.carID);
        if (!carData) continue;
        
        switch (carData.tyreType) {
            case "Slick":
            case "Drag":
                slickCount++;
                break;
            case "Off-Road":
                offRoadCount++;
                break;
        }
    }
    
    // Warn if running slicks in off-road season
    const hasOffRoad = surfaces.some(s => ["Dirt", "Snow", "Sand", "Gravel", "Ice"].includes(s));
    if (hasOffRoad && slickCount >= 3) {
        return "⚠️ 3+ slick/drag tyre cars in off-road season — risky!";
    }
    
    // Warn if running off-road in asphalt-only season
    const isAsphaltOnly = surfaces.every(s => ["Asphalt", "Track", "Drag"].includes(s));
    if (isAsphaltOnly && offRoadCount >= 3) {
        return "⚠️ 3+ off-road tyre cars in road season — suboptimal!";
    }
    
    return null;
}

/**
 * Check if player owns the cars in their garage with required upgrades
 * Also validates they're not using more copies than they own
 */
function validateCarOwnership(cars, garage) {
    const errors = [];
    
    // Count how many of each carID+upgrade combination is used
    const usedCounts = {};
    for (const car of cars) {
        const key = `${car.carID}_${car.upgrade}`;
        usedCounts[key] = (usedCounts[key] || 0) + 1;
    }
    
    // Check each unique carID+upgrade combination
    for (const [key, usedCount] of Object.entries(usedCounts)) {
        const [carID, upgrade] = key.split('_');
        const ownedCar = garage.find(g => g.carID === carID);
        
        if (!ownedCar) {
            const carData = getCar(carID);
            const carName = carData ? carNameGen({ currentCar: carData }) : carID;
            errors.push(`You don't own ${carName}`);
            continue;
        }
        
        const ownedAtTune = ownedCar.upgrades?.[upgrade] || 0;
        
        if (ownedAtTune < 1) {
            const carData = getCar(carID);
            const carName = carData ? carNameGen({ currentCar: carData }) : carID;
            errors.push(`You don't have ${carName} at ${upgrade} tune`);
        } else if (usedCount > ownedAtTune) {
            const carData = getCar(carID);
            const carName = carData ? carNameGen({ currentCar: carData }) : carID;
            errors.push(`You only own ${ownedAtTune}x ${carName} [${upgrade}] but tried to use ${usedCount}`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// =============================================================================
// MATCHMAKING
// =============================================================================

/**
 * Find opponents for a player in a league
 * @param {Model} pvpModel - The PvP mongoose model
 * @returns {Array} Array of opponent profiles (or ghost opponents)
 */
async function findOpponents(pvpModel, attackerID, league, attackerRating) {
    const { baseRatingRange, maxRatingRange, matchmakingAttempts, opponentsToShow } = PVP_SETTINGS;
    
    console.log(`[PvP Matchmaking] Looking for opponents in ${league} for rating ${attackerRating}`);
    
    // Try with increasing rating ranges
    for (let attempt = 0; attempt < matchmakingAttempts; attempt++) {
        const currentRange = baseRatingRange + (attempt * 100);
        
        const candidates = await pvpModel.findOpponents(attackerID, league, attackerRating, currentRange);
        console.log(`[PvP Matchmaking] Attempt ${attempt + 1}, range ±${currentRange}: found ${candidates.length} candidates`);
        
        if (candidates.length >= opponentsToShow) {
            return shuffleArray(candidates).slice(0, opponentsToShow).map(c => ({
                ...c.toObject(),
                isGhost: false
            }));
        }
    }
    
    // Try any rating in this league
    const anyRating = await pvpModel.find({
        userID: { $ne: attackerID },
        [`leagueStats.${league}.defense.0`]: { $exists: true }
    }).limit(10);
    
    console.log(`[PvP Matchmaking] Any rating search: found ${anyRating.length} players with defense`);
    
    if (anyRating.length >= 1) {
        return shuffleArray(anyRating).slice(0, opponentsToShow).map(c => ({
            ...c.toObject(),
            isGhost: false
        }));
    }
    
    // Generate ghost opponents
    console.log(`[PvP Matchmaking] No players found, generating ghost opponents`);
    const ghosts = generateGhostOpponents(league, attackerRating, opponentsToShow);
    console.log(`[PvP Matchmaking] Generated ${ghosts.length} ghost opponents`);
    
    return ghosts;
}

/**
 * Generate AI ghost opponents
 */
function generateGhostOpponents(league, attackerRating, count) {
    const leagueConfig = PVP_LEAGUES[league];
    const carFiles = getCarFiles();
    const ghosts = [];
    
    // Pre-filter valid cars for this league (within CR range)
    const validCars = [];
    for (const carFile of carFiles) {
        const carID = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile;
        const car = getCar(carID);
        
        if (!car || car.reference) continue;
        
        const carCR = car.cr || 0;
        
        // Must be within league CR range
        if (carCR >= leagueConfig.minCarCR && carCR <= leagueConfig.maxCarCR) {
            validCars.push({ carID, cr: carCR });
        }
    }
    
    if (validCars.length < 5) {
        console.warn(`Not enough valid cars for ${league} ghost opponents (found ${validCars.length})`);
        return [];
    }
    
    for (let i = 0; i < count; i++) {
        const ghostDefense = [];
        let attempts = 0;
        const maxAttempts = 100;
        
        // Build a valid defense for this league
        while (ghostDefense.length < 5 && attempts < maxAttempts) {
            attempts++;
            
            // Pick a random valid car
            const randomCar = validCars[Math.floor(Math.random() * validCars.length)];
            
            // Check duplicate limit
            const existingCount = ghostDefense.filter(c => c.carID === randomCar.carID).length;
            if (existingCount >= leagueConfig.maxDuplicates) continue;
            
            // Random upgrade
            const upgrades = getAvailableTunes();
            const upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
            
            ghostDefense.push({ carID: randomCar.carID, upgrade });
        }
        
        if (ghostDefense.length === 5) {
            ghosts.push({
                isGhost: true,
                userID: `ghost_${i}_${Date.now()}`,
                displayName: generateGhostName(),
                leagueStats: {
                    [league]: {
                        rating: attackerRating + Math.floor(Math.random() * 100 - 50),
                        defense: ghostDefense,
                        attackWins: Math.floor(Math.random() * 50),
                        attackLosses: Math.floor(Math.random() * 30)
                    }
                }
            });
        }
    }
    
    return ghosts;
}

// =============================================================================
// RATING CALCULATIONS
// =============================================================================

/**
 * Calculate ELO rating change
 * @returns {Object} { winnerChange, loserChange }
 */
function calculateRatingChange(winnerRating, loserRating) {
    const { kFactor, minRatingChange, maxRatingChange } = PVP_SETTINGS;
    
    const expectedWin = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    let change = Math.round(kFactor * (1 - expectedWin));
    
    // Clamp to min/max
    change = Math.max(minRatingChange, Math.min(maxRatingChange, change));
    
    return {
        winnerChange: change,
        loserChange: -change
    };
}

/**
 * Calculate battle rewards
 */
function calculateRewards(league, won, isGhost, winStreak) {
    const leagueConfig = PVP_LEAGUES[league];
    const tier = getLeagueTier(league);
    
    let money = leagueConfig.baseReward;
    let trophies = PVP_SETTINGS.baseTrophiesPerWin * tier;
    
    if (!won) {
        // Losers get 25% consolation
        money = Math.floor(money * 0.25);
        trophies = Math.floor(trophies * 0.25);
    } else {
        // Win streak bonuses
        for (const [streak, multiplier] of Object.entries(PVP_SETTINGS.streakBonuses)) {
            if (winStreak >= parseInt(streak)) {
                money = Math.floor(money * multiplier);
            }
        }
    }
    
    // Ghost penalty
    if (isGhost) {
        money = Math.floor(money * PVP_SETTINGS.ghostRewardMultiplier);
        trophies = Math.floor(trophies * PVP_SETTINGS.ghostRewardMultiplier);
    }
    
    return { money, trophies };
}

/**
 * Soft reset rating toward base (for season resets)
 */
function softResetRating(currentRating, decayFactor = 0.5) {
    const { baseRating } = PVP_SETTINGS;
    return Math.round(baseRating + (currentRating - baseRating) * decayFactor);
}

// =============================================================================
// TRACK SELECTION
// =============================================================================

/**
 * Select battle tracks based on current season's track pool
 * @returns {Array} Array of { trackID, weather }
 */
function selectBattleTracks(count = 5) {
    const season = getCurrentSeason();
    const trackPool = season.trackPool;
    const { surfaces, weather, weatherWeights, specificTracks } = trackPool;
    
    let validTracks;
    
    if (specificTracks && specificTracks.length > 0) {
        // Use specific tracks defined in the pool
        validTracks = specificTracks;
    } else {
        // Filter all tracks that match season's allowed surfaces
        const allTracks = getTrackFiles();
        validTracks = allTracks.filter(trackFile => {
            const trackID = trackFile.endsWith('.json') ? trackFile.slice(0, -5) : trackFile;
            const track = getTrack(trackID);
            return track && surfaces.includes(track.surface);
        });
    }
    
    if (validTracks.length === 0) {
        // Fallback to any tracks if no match
        console.warn("No tracks match season pool, using all tracks");
        const allTracks = getTrackFiles();
        return selectRandomTracks(allTracks, count, weatherWeights, weather);
    }
    
    return selectRandomTracks(validTracks, count, weatherWeights, weather);
}

/**
 * Select random tracks with weather
 */
function selectRandomTracks(trackList, count, weatherWeights, weatherOptions) {
    const selectedTracks = [];
    const usedTrackIDs = new Set();
    
    // Shuffle track list
    const shuffled = shuffleArray([...trackList]);
    
    for (const trackFile of shuffled) {
        if (selectedTracks.length >= count) break;
        
        const trackID = trackFile.endsWith('.json') ? trackFile.slice(0, -5) : trackFile;
        const trackData = getTrack(trackID);
        
        if (!trackData || usedTrackIDs.has(trackID)) continue;
        
        usedTrackIDs.add(trackID);
        
        // Check if this surface can have rain (uses imported function)
        const canHaveRain = surfaceSupportsRain(trackData.surface);
        
        // Default to Sunny for incompatible surfaces
        let selectedWeather = "Sunny";
        
        if (canHaveRain) {
            // This surface supports weather variation, roll for it
            const roll = Math.random();
            let cumulative = 0;
            
            for (const w of weatherOptions) {
                cumulative += weatherWeights[w] || 0;
                if (roll <= cumulative) {
                    selectedWeather = w;
                    break;
                }
            }
        }
        // For surfaces that don't support rain (Snow, Ice, Sand), always use Sunny
        
        selectedTracks.push({
            trackID,
            weather: selectedWeather
        });
    }
    
    return selectedTracks;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Calculate total CR of a car array
 */
function calculateTotalCR(cars) {
    return cars.reduce((total, car) => {
        return total + getEffectiveCR(car.carID);
    }, 0);
}

/**
 * Format time remaining string
 */
function formatTimeRemaining(ms) {
    if (ms <= 0) return "Ready";
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Format rating with trend indicator
 */
function formatRating(current, peak) {
    const trend = current > peak - 50 ? "📈" : current < peak - 100 ? "📉" : "";
    return `${current} ${trend}`;
}

/**
 * Get win rate percentage
 */
function getWinRate(wins, losses) {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
}

/**
 * Generate defense display string
 */
function generateDefenseDisplay(defense, showCR = true) {
    const lines = [];
    let totalCR = 0;
    
    for (let i = 0; i < defense.length; i++) {
        const car = defense[i];
        const carData = getCar(car.carID);
        
        if (!carData) {
            lines.push(`${i + 1}. Unknown car`);
            continue;
        }
        
        const carName = carNameGen({ currentCar: carData, upgrade: car.upgrade, rarity: true });
        const cr = getEffectiveCR(car.carID);
        totalCR += cr;
        
        if (showCR) {
            lines.push(`${i + 1}. ${carName} — CR ${cr}`);
        } else {
            lines.push(`${i + 1}. ${carName}`);
        }
    }
    
    return { lines, totalCR };
}

/**
 * Get attacks remaining display
 */
function getAttacksDisplay(attacksToday, maxAttacks, lastReset) {
    const remaining = maxAttacks - attacksToday;
    
    // Calculate time until reset
    const now = new Date();
    const nextReset = new Date(lastReset);
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(PVP_SETTINGS.attackResetHour, 0, 0, 0);
    
    const msUntilReset = nextReset - now;
    const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
    const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        remaining,
        total: maxAttacks,
        resetIn: `${hoursUntilReset}h ${minutesUntilReset}m`
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Validation
    validatePvPHand,
    getMaxAllowedCR,
    analyzeTyreCoverage,
    validateCarOwnership,
    
    // Car helpers (BM/Prize car handling)
    getBaseCarID,
    getEffectiveCR,
    
    // Matchmaking
    findOpponents,
    generateGhostOpponents,
    
    // Rating
    calculateRatingChange,
    calculateRewards,
    softResetRating,
    
    // Tracks
    selectBattleTracks,
    
    // Helpers
    shuffleArray,
    calculateTotalCR,
    formatTimeRemaining,
    formatRating,
    getWinRate,
    generateDefenseDisplay,
    getAttacksDisplay
};
