"use strict";

/**
 * 6-Stat Tune Calculation System v2.1
 * 
 * Each tune digit represents an upgrade category:
 * - 1st digit (Gearing): Top Speed + MRA
 * - 2nd digit (Engine): 0-60 + OLA
 * - 3rd digit (Chassis): Handling + Weight
 * 
 * Tune Identities:
 * - 996: Drag (Best TS, MRA, 0-60, OLA | Worst Handling, Weight)
 * - 969: Balanced (Best TS, MRA, Handling, Weight | Worst 0-60, OLA)
 * - 699: Twisty (Best 0-60, OLA, Handling, Weight | Worst TS, MRA)
 * 
 * v2.1 Changes:
 * - MRA and OLA now preserve 2 decimal places
 * - Cars that upgrade past 60 mph now get valid 0-60 times
 */

const upgradeLevels = {
    // GEARING: Affects Top Speed + MRA (high-speed performance)
    gearing: {
        0: { tsMult: 0, mraBonus: 0 },
        3: { tsMult: 1, mraBonus: 3 },
        6: { tsMult: 2, mraBonus: 5 },
        9: { tsMult: 3, mraBonus: 8 }
    },
    
    // ENGINE: Affects 0-60 + OLA (launch & acceleration)
    engine: {
        0: { accelMult: 1.00, olaBonus: 0 },
        3: { accelMult: 0.95, olaBonus: 3 },
        6: { accelMult: 0.90, olaBonus: 5 },
        9: { accelMult: 0.85, olaBonus: 8 }
    },
    
    // CHASSIS: Affects Handling + Weight (cornering & agility)
    chassis: {
        0: { handlingMult: 1.00, weightMult: 1.00 },
        3: { handlingMult: 1.033, weightMult: 0.98 },
        6: { handlingMult: 1.066, weightMult: 0.95 },
        9: { handlingMult: 1.10, weightMult: 0.92 }
    }
};

// Valid tune codes
const validTunes = ["000", "333", "666", "699", "969", "996"];

/**
 * Calculate all 6 tuned stats for a car
 * @param {Object} car - Car data object (base stats, or bmReference for BM cars)
 * @param {string} tune - Tune code ("000", "333", "666", "699", "969", "996")
 * @returns {Object} - { topSpeed, accel, handling, weight, mra, ola }
 */
function calcTune(car, tune) {
    // Default to stock if no tune provided
    if (!tune) tune = "000";
    
    // Parse tune digits
    const gearingLvl = parseInt(tune[0]);
    const engineLvl = parseInt(tune[1]);
    const chassisLvl = parseInt(tune[2]);
    
    // Get upgrade values for each component
    const gearing = upgradeLevels.gearing[gearingLvl];
    const engine = upgradeLevels.engine[engineLvl];
    const chassis = upgradeLevels.chassis[chassisLvl];
    
    // Fallback if invalid level (shouldn't happen with valid tunes)
    if (!gearing || !engine || !chassis) {
        return {
            topSpeed: car.topSpeed,
            accel: car["0to60"],
            handling: car.handling,
            weight: car.weight,
            mra: car.mra,
            ola: car.ola
        };
    }
    
    // Base stats
    const baseTS = car.topSpeed;
    const baseAccel = car["0to60"];
    const baseHandling = car.handling;
    const baseWeight = car.weight;
    const baseMRA = car.mra || 0;
    const baseOLA = car.ola || 0;
    
    // ==========================================
    // Calculate Top Speed FIRST (needed for other calcs)
    // ==========================================
    let topSpeed;
    if (baseTS < 60) {
        // Slow cars get flat bonus scaled by gearing level
        topSpeed = Math.round(baseTS + (26 * (gearingLvl / 9)));
    } else {
        // Normal cars use inverse relationship (faster cars gain less)
        topSpeed = Math.round(baseTS + (520 / baseTS * gearing.tsMult));
    }
    
    // ==========================================
    // Calculate 0-60 (based on TUNED top speed)
    // ==========================================
    let accel;
    if (topSpeed < 60) {
        // Car still can't reach 60 mph after upgrades
        accel = 99.9;
    } else if (baseTS < 60 && topSpeed >= 60) {
        // Car upgraded PAST 60 mph threshold!
        // Calculate a 0-60 time based on how much over 60 it is
        // Formula: Start at 60 seconds at exactly 60 mph, decrease as top speed increases
        // Every 1 mph over 60 = roughly -2.5 seconds (with floor at 4.0s)
        const mphOver60 = topSpeed - 60;
        const estimatedAccel = Math.max(4.0, 60 - (mphOver60 * 2.5));
        accel = Number((estimatedAccel * engine.accelMult).toFixed(1));
    } else {
        // Normal car - apply multiplier to base 0-60
        accel = Number((baseAccel * engine.accelMult).toFixed(1));
    }
    
    // ==========================================
    // Calculate Handling (percentage improvement)
    // ==========================================
    const handling = Math.round(baseHandling * chassis.handlingMult);
    
    // ==========================================
    // Calculate Weight (percentage reduction)
    // ==========================================
    const weight = Math.round(baseWeight * chassis.weightMult);
    
    // ==========================================
    // Calculate MRA (preserves 2 decimal places)
    // Only upgrades if car can reach 100 mph
    // ==========================================
    let mra;
    if (topSpeed >= 100) {
        // Apply bonus and keep 2 decimal precision
        mra = Number((baseMRA + gearing.mraBonus).toFixed(2));
    } else {
        mra = Number(Number(baseMRA).toFixed(2));
    }
    
    // ==========================================
    // Calculate OLA (preserves 2 decimal places)
    // Only upgrades if car can reach 60 mph
    // ==========================================
    let ola;
    if (topSpeed >= 60) {
        // Apply bonus and keep 2 decimal precision
        ola = Number((baseOLA + engine.olaBonus).toFixed(2));
    } else {
        ola = Number(Number(baseOLA).toFixed(2));
    }
    
    return { topSpeed, accel, handling, weight, mra, ola };
}

/**
 * Get list of available tune codes
 * @returns {string[]} Array of valid tune codes
 */
function getAvailableTunes() {
    return [...validTunes];
}

/**
 * Check if a tune code is valid
 * @param {string} tune - Tune code to validate
 * @returns {boolean}
 */
function isValidTune(tune) {
    return validTunes.includes(tune);
}

/**
 * Get the upgrade level breakdown for a tune
 * @param {string} tune - Tune code
 * @returns {Object} - { gearing, engine, chassis } level objects
 */
function getTuneLevels(tune) {
    const gearingLvl = parseInt(tune[0]);
    const engineLvl = parseInt(tune[1]);
    const chassisLvl = parseInt(tune[2]);
    
    return {
        gearing: upgradeLevels.gearing[gearingLvl],
        engine: upgradeLevels.engine[engineLvl],
        chassis: upgradeLevels.chassis[chassisLvl]
    };
}

/**
 * Get tune identity/description
 * @param {string} tune - Tune code
 * @returns {string} - Description of the tune
 */
function getTuneIdentity(tune) {
    const identities = {
        "000": "Stock",
        "333": "Stage 1",
        "666": "Stage 2",
        "996": "Drag",
        "969": "Balanced",
        "699": "Circuit"
    };
    return identities[tune] || "Unknown";
}

module.exports = { 
    calcTune, 
    getAvailableTunes, 
    isValidTune, 
    getTuneLevels,
    getTuneIdentity,
    upgradeLevels 
};
