"use strict";

/**
 * CENTRALIZED DATA MANAGER
 * ========================
 * This module solves several performance issues:
 * 
 * 1. MEMORY LEAK: Previously, every `require('../cars/xxx.json')` cached the module
 *    permanently in Node's require.cache. With thousands of cars being loaded
 *    repeatedly, memory usage grew unbounded.
 * 
 * 2. DUPLICATE FILE READS: Every command file was calling `readdirSync()` separately,
 *    each maintaining its own copy of the file list array.
 * 
 * 3. SLOW LOOKUPS: Using require() has overhead. Direct Map lookups are O(1).
 * 
 * USAGE:
 * ------
 * Instead of:
 *   const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
 *   const car = require(`../cars/${carID}.json`);
 * 
 * Use:
 *   const { getCar, getCarFiles } = require("../util/dataManager.js");
 *   const carFiles = getCarFiles();
 *   const car = getCar(carID);
 * 
 * The data is loaded ONCE at startup and served from memory thereafter.
 */

const { readdirSync, readFileSync } = require("fs");
const path = require("path");

// ============================================================================
// DATA STORAGE - Maps for O(1) lookup
// ============================================================================

const cars = new Map();        // carID (without .json) -> car data object
const tracks = new Map();      // trackID (without .json) -> track data object
const packs = new Map();       // packID (without .json) -> pack data object

// File lists (equivalent to readdirSync results)
let carFiles = [];             // ["c00001.json", "c00002.json", ...]
let trackFiles = [];           // ["t00001.json", "t00002.json", ...]
let packFiles = [];            // ["p00001.json", "p00002.json", ...]

// Initialization state
let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load all game data into memory.
 * Call this ONCE at bot startup (in index.js).
 * 
 * @param {string} basePath - Base path to src folder (e.g., "./src" or "../")
 * @returns {Object} Statistics about loaded data
 */
function initialize(basePath = "./src") {
    if (initialized) {
        console.warn("⚠️ DataManager already initialized, skipping...");
        return getStats();
    }

    const stats = {
        cars: { loaded: 0, failed: 0, errors: [] },
        tracks: { loaded: 0, failed: 0, errors: [] },
        packs: { loaded: 0, failed: 0, errors: [] }
    };

    // Load Cars
    const carsPath = path.join(basePath, "cars");
    carFiles = readdirSync(carsPath).filter(file => file.endsWith(".json"));
    
    for (const file of carFiles) {
        try {
            const filePath = path.join(carsPath, file);
            const rawData = readFileSync(filePath, "utf8");
            const parsed = JSON.parse(rawData);
            const carID = file.slice(0, -5); // Remove .json
            cars.set(carID, parsed);
            stats.cars.loaded++;
        } catch (err) {
            stats.cars.failed++;
            stats.cars.errors.push({ file, error: err.message });
        }
    }

    // Load Tracks
    const tracksPath = path.join(basePath, "tracks");
    trackFiles = readdirSync(tracksPath).filter(file => file.endsWith(".json"));
    
    for (const file of trackFiles) {
        try {
            const filePath = path.join(tracksPath, file);
            const rawData = readFileSync(filePath, "utf8");
            const parsed = JSON.parse(rawData);
            const trackID = file.slice(0, -5);
            tracks.set(trackID, parsed);
            stats.tracks.loaded++;
        } catch (err) {
            stats.tracks.failed++;
            stats.tracks.errors.push({ file, error: err.message });
        }
    }

    // Load Packs
    const packsPath = path.join(basePath, "packs");
    packFiles = readdirSync(packsPath).filter(file => file.endsWith(".json"));
    
    for (const file of packFiles) {
        try {
            const filePath = path.join(packsPath, file);
            const rawData = readFileSync(filePath, "utf8");
            const parsed = JSON.parse(rawData);
            const packID = file.slice(0, -5);
            packs.set(packID, parsed);
            stats.packs.loaded++;
        } catch (err) {
            stats.packs.failed++;
            stats.packs.errors.push({ file, error: err.message });
        }
    }

    initialized = true;

    // Log results
    console.log(`✅ DataManager initialized:`);
    console.log(`   Cars: ${stats.cars.loaded} loaded, ${stats.cars.failed} failed`);
    console.log(`   Tracks: ${stats.tracks.loaded} loaded, ${stats.tracks.failed} failed`);
    console.log(`   Packs: ${stats.packs.loaded} loaded, ${stats.packs.failed} failed`);

    if (stats.cars.failed > 0 || stats.tracks.failed > 0 || stats.packs.failed > 0) {
        console.error("❌ Some files failed to load:");
        stats.cars.errors.forEach(e => console.error(`   Car: ${e.file} - ${e.error}`));
        stats.tracks.errors.forEach(e => console.error(`   Track: ${e.file} - ${e.error}`));
        stats.packs.errors.forEach(e => console.error(`   Pack: ${e.file} - ${e.error}`));
    }

    return stats;
}

// ============================================================================
// GETTERS - Use these instead of require()
// ============================================================================

/**
 * Get car data by ID
 * @param {string} carID - Car ID with or without .json extension
 * @returns {Object|null} Car data object or null if not found
 * 
 * @example
 * // All these work:
 * getCar("c00001")
 * getCar("c00001.json")
 * getCar("../cars/c00001.json") // extracts ID automatically
 */
function getCar(carID) {
    // Handle various input formats
    if (!carID) return null;
    
    // Extract just the ID if a path or extension was included
    let cleanID = carID;
    if (cleanID.includes("/")) {
        cleanID = cleanID.split("/").pop();
    }
    if (cleanID.endsWith(".json")) {
        cleanID = cleanID.slice(0, -5);
    }
    
    const car = cars.get(cleanID);
    if (!car) {
        console.warn(`⚠️ Car not found: ${carID} (cleaned: ${cleanID})`);
        return null;
    }
    return car;
}

/**
 * Get track data by ID
 * @param {string} trackID - Track ID with or without .json extension
 * @returns {Object|null} Track data object or null if not found
 */
function getTrack(trackID) {
    if (!trackID) return null;
    
    let cleanID = trackID;
    if (cleanID.includes("/")) {
        cleanID = cleanID.split("/").pop();
    }
    if (cleanID.endsWith(".json")) {
        cleanID = cleanID.slice(0, -5);
    }
    
    const track = tracks.get(cleanID);
    if (!track) {
        console.warn(`⚠️ Track not found: ${trackID} (cleaned: ${cleanID})`);
        return null;
    }
    return track;
}

/**
 * Get pack data by ID
 * @param {string} packID - Pack ID with or without .json extension
 * @returns {Object|null} Pack data object or null if not found
 */
function getPack(packID) {
    if (!packID) return null;
    
    let cleanID = packID;
    if (cleanID.includes("/")) {
        cleanID = cleanID.split("/").pop();
    }
    if (cleanID.endsWith(".json")) {
        cleanID = cleanID.slice(0, -5);
    }
    
    const pack = packs.get(cleanID);
    if (!pack) {
        console.warn(`⚠️ Pack not found: ${packID} (cleaned: ${cleanID})`);
        return null;
    }
    return pack;
}

// ============================================================================
// FILE LIST GETTERS - Use these instead of readdirSync()
// ============================================================================

/**
 * Get list of all car files
 * @returns {string[]} Array of car filenames (e.g., ["c00001.json", ...])
 */
function getCarFiles() {
    return carFiles;
}

/**
 * Get list of all track files
 * @returns {string[]} Array of track filenames
 */
function getTrackFiles() {
    return trackFiles;
}

/**
 * Get list of all pack files
 * @returns {string[]} Array of pack filenames
 */
function getPackFiles() {
    return packFiles;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all cars as an array (useful for filtering/searching)
 * @returns {Object[]} Array of all car objects
 */
function getAllCars() {
    return Array.from(cars.values());
}

/**
 * Get all tracks as an array
 * @returns {Object[]} Array of all track objects
 */
function getAllTracks() {
    return Array.from(tracks.values());
}

/**
 * Get all packs as an array
 * @returns {Object[]} Array of all pack objects
 */
function getAllPacks() {
    return Array.from(packs.values());
}

/**
 * Check if a car exists
 * @param {string} carID - Car ID to check
 * @returns {boolean}
 */
function carExists(carID) {
    let cleanID = carID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return cars.has(cleanID);
}

/**
 * Check if a track exists
 * @param {string} trackID - Track ID to check
 * @returns {boolean}
 */
function trackExists(trackID) {
    let cleanID = trackID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return tracks.has(cleanID);
}

/**
 * Check if a pack exists
 * @param {string} packID - Pack ID to check
 * @returns {boolean}
 */
function packExists(packID) {
    let cleanID = packID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return packs.has(cleanID);
}

/**
 * Get memory usage statistics
 * @returns {Object} Statistics about the data manager
 */
function getStats() {
    return {
        initialized,
        counts: {
            cars: cars.size,
            tracks: tracks.size,
            packs: packs.size
        },
        fileCounts: {
            cars: carFiles.length,
            tracks: trackFiles.length,
            packs: packFiles.length
        }
    };
}

/**
 * Reload a specific car (useful if JSON file was updated)
 * @param {string} carID - Car ID to reload
 * @param {string} basePath - Base path to src folder
 * @returns {boolean} Success status
 */
function reloadCar(carID, basePath = "./src") {
    try {
        let cleanID = carID;
        if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
        
        const filePath = path.join(basePath, "cars", `${cleanID}.json`);
        const rawData = readFileSync(filePath, "utf8");
        const parsed = JSON.parse(rawData);
        cars.set(cleanID, parsed);
        return true;
    } catch (err) {
        console.error(`Failed to reload car ${carID}: ${err.message}`);
        return false;
    }
}

/**
 * Reload all data (useful after adding new cars/tracks/packs)
 * @param {string} basePath - Base path to src folder
 * @returns {Object} Statistics about loaded data
 */
function reloadAll(basePath = "./src") {
    // Clear existing data
    cars.clear();
    tracks.clear();
    packs.clear();
    carFiles = [];
    trackFiles = [];
    packFiles = [];
    initialized = false;
    
    // Reinitialize
    return initialize(basePath);
}

/**
 * Get a random car (useful for random race, daily rewards, etc.)
 * @param {Function} filterFn - Optional filter function
 * @returns {Object|null} Random car object
 * 
 * @example
 * // Random car with CR < 700
 * getRandomCar(car => car.cr < 700 && !car.isPrize);
 */
function getRandomCar(filterFn = null) {
    let carArray = Array.from(cars.values());
    
    if (filterFn) {
        carArray = carArray.filter(filterFn);
    }
    
    if (carArray.length === 0) return null;
    
    return carArray[Math.floor(Math.random() * carArray.length)];
}

/**
 * Get a random car file (returns the filename, not data)
 * @param {Function} filterFn - Optional filter function (receives car data)
 * @returns {string|null} Random car filename
 */
function getRandomCarFile(filterFn = null) {
    if (!filterFn) {
        return carFiles[Math.floor(Math.random() * carFiles.length)];
    }
    
    // Filter by car data
    const filtered = carFiles.filter(file => {
        const carID = file.slice(0, -5);
        const car = cars.get(carID);
        return car && filterFn(car);
    });
    
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
}

/**
 * Get a random track
 * @returns {Object|null} Random track object
 */
function getRandomTrack() {
    const trackArray = Array.from(tracks.values());
    if (trackArray.length === 0) return null;
    return trackArray[Math.floor(Math.random() * trackArray.length)];
}

/**
 * Search cars by criteria (faster than filtering require() results)
 * @param {Object} criteria - Search criteria
 * @returns {string[]} Array of matching car file names
 * 
 * @example
 * searchCars({ make: "BMW", cr: { min: 500, max: 700 } });
 */
function searchCars(criteria = {}) {
    const results = [];
    
    for (const [carID, car] of cars) {
        let matches = true;
        
        // CR range
        if (criteria.cr) {
            if (criteria.cr.min && car.cr < criteria.cr.min) matches = false;
            if (criteria.cr.max && car.cr > criteria.cr.max) matches = false;
        }
        
        // Make
        if (criteria.make) {
            const carMake = Array.isArray(car.make) ? car.make : [car.make];
            if (!carMake.some(m => m.toLowerCase() === criteria.make.toLowerCase())) {
                matches = false;
            }
        }
        
        // Is Prize
        if (criteria.isPrize !== undefined) {
            if (car.isPrize !== criteria.isPrize) matches = false;
        }
        
        // Is Reference (BM car)
        if (criteria.isReference !== undefined) {
            if ((car.reference !== undefined) !== criteria.isReference) matches = false;
        }
        
        // Drive type
        if (criteria.driveType) {
            if (car.driveType !== criteria.driveType) matches = false;
        }
        
        // Country
        if (criteria.country) {
            if (car.country !== criteria.country) matches = false;
        }
        
        if (matches) {
            results.push(`${carID}.json`);
        }
    }
    
    return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Initialization
    initialize,
    reloadAll,
    reloadCar,
    
    // Getters (replace require())
    getCar,
    getTrack,
    getPack,
    
    // File lists (replace readdirSync())
    getCarFiles,
    getTrackFiles,
    getPackFiles,
    
    // Bulk getters
    getAllCars,
    getAllTracks,
    getAllPacks,
    
    // Existence checks
    carExists,
    trackExists,
    packExists,
    
    // Utilities
    getStats,
    getRandomCar,
    getRandomCarFile,
    getRandomTrack,
    searchCars
};
