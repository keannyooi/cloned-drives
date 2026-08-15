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
const offerTemplates = new Map(); // templateID (without .json) -> template data object
const pvpEventTemplates = new Map(); // templateID (without .json) -> pvp event template data
const packBattleTemplates = new Map(); // templateID (without .json) -> pack battle template data
const autoEventTemplates = new Map(); // templateID (without .json) -> auto-event template data
const drivers = new Map();     // driverID (without .json) -> driver data object

// File lists (equivalent to readdirSync results)
let carFiles = [];                // ["c00001.json", "c00002.json", ...]
let trackFiles = [];              // ["t00001.json", "t00002.json", ...]
let packFiles = [];               // ["p00001.json", "p00002.json", ...]
let offerTemplateFiles = [];      // ["o00001.json", "o00002.json", ...]
let pvpEventTemplateFiles = [];   // ["pe00001.json", "pe00002.json", ...]
let packBattleTemplateFiles = []; // ["pb00001.json", "pb00002.json", ...]
let autoEventTemplateFiles = [];  // ["ae00001.json", ...] ("_"-prefixed files are skipped)
let driverFiles = [];             // ["d00000.json", ...] (only files that passed validation)

// L-01: Cached arrays — built once after initialization, avoids repeated Array.from()
let cachedCarArray = [];
let cachedTrackArray = [];

// Initialization state
let initialized = false;

// ============================================================================
// DRIVER VALIDATION (rarity system v3 — see docs/race-week-design.md §5)
// ============================================================================

const DRIVER_RARITIES = ["base", "rare", "secret", "divine", "icon", "autograph", "serialised"];
// Max attainable level per rarity. LEVELS ARE 1-BASED: recruiting a card is
// Level 1 and each duplicate threshold adds one, so a base driver runs 1→4.
// icon/autograph/serialised cap at 0 — ALL bonus entries are active regardless
// of minLevel, so minLevel is legal but ignored on those tiers.
const DRIVER_MAX_LEVELS = { base: 4, rare: 5, secret: 6, divine: 7, icon: 0, autograph: 0, serialised: 0 };
const DRIVER_EFFECT_STATS = ["topSpeed", "accel", "handling", "weight", "mra", "ola"];
// Race-context / stat-threshold cond keys resolved by the race engine.
const DRIVER_COND_SPECIAL_KEYS = ["statMin", "statMax", "carID", "weather", "surface", "bossRace", "underdog"];
// filterCheck car criteria documented for driver bonus conds.
const DRIVER_COND_FILTER_KEYS = [
    "make", "model", "country", "tags", "search", "bodyStyle", "gc", "driveType",
    "tyreType", "seatCount", "isPrize", "cr", "modelYear", "fuelType", "enginePos",
    "tcs", "abs", "cardType", "collection", "hiddenTag", "isBM"
];

/**
 * Validate a parsed driver JSON against the rarity system v3 schema.
 * @param {Object} driver - Parsed driver JSON
 * @param {string} expectedID - Driver ID derived from the filename
 * @returns {string|null} Failure reason, or null when valid
 */
function validateDriver(driver, expectedID) {
    if (!driver || typeof driver !== "object" || Array.isArray(driver)) {
        return "not a JSON object";
    }
    if (typeof driver.driverID !== "string" || driver.driverID !== expectedID) {
        return `driverID must be "${expectedID}" (matching the filename)`;
    }
    if (typeof driver.name !== "string" || driver.name.trim() === "") {
        return "missing/empty name";
    }
    if (typeof driver.description !== "string") {
        return "missing description";
    }
    if (!DRIVER_RARITIES.includes(driver.rarity)) {
        return `rarity must be one of ${DRIVER_RARITIES.join("/")} (got "${driver.rarity}")`;
    }
    if (driver.rarity === "serialised") {
        if (!Number.isInteger(driver.serialCap) || driver.serialCap <= 0) {
            return "serialised drivers require serialCap (positive integer)";
        }
    }
    else if (driver.serialCap !== undefined) {
        return `serialCap is only allowed on serialised drivers (rarity is "${driver.rarity}")`;
    }
    if (driver.collection !== undefined) {
        if (typeof driver.collection !== "string" || driver.collection.trim() === "") {
            return "collection must be a non-empty string when present";
        }
    }
    // Optional recruitment-shop fields (cd-recruit). recruitPrice's presence is
    // what puts a driver in the shop; recruitExclusive locks it to shop/offers.
    if (driver.recruitPrice !== undefined) {
        if (!Number.isInteger(driver.recruitPrice) || driver.recruitPrice <= 0) {
            return "recruitPrice must be a positive integer";
        }
    }
    if (driver.recruitMultiplier !== undefined) {
        if (typeof driver.recruitMultiplier !== "number" || driver.recruitMultiplier < 1) {
            return "recruitMultiplier must be a number >= 1";
        }
    }
    if (driver.recruitExclusive !== undefined) {
        if (typeof driver.recruitExclusive !== "boolean") {
            return "recruitExclusive must be a boolean";
        }
        if (driver.recruitExclusive && driver.recruitPrice === undefined) {
            return "recruitExclusive drivers need a recruitPrice (they're otherwise unobtainable)";
        }
    }
    // Optional per-card serial-stamp placement (full-art serialised cards are
    // each composed differently, so they can move/plate the printed number).
    if (driver.serialStamp !== undefined) {
        if (typeof driver.serialStamp !== "object" || driver.serialStamp === null || Array.isArray(driver.serialStamp)) {
            return "serialStamp must be an object when present";
        }
        for (const key of ["rightFrac", "topFrac", "fontFrac", "strokeFrac"]) {
            const value = driver.serialStamp[key];
            if (value !== undefined && (typeof value !== "number" || value < 0 || value > 1)) {
                return `serialStamp.${key} must be a number between 0 and 1`;
            }
        }
        if (driver.serialStamp.plate !== undefined && typeof driver.serialStamp.plate !== "boolean") {
            return "serialStamp.plate must be a boolean";
        }
    }
    if (typeof driver.inRotation !== "boolean") {
        return "missing/non-boolean inRotation";
    }
    if (!Array.isArray(driver.bonuses)) {
        return "bonuses must be an array";
    }

    for (let i = 0; i < driver.bonuses.length; i++) {
        const bonus = driver.bonuses[i], label = `bonuses[${i}]`;
        if (!bonus || typeof bonus !== "object" || Array.isArray(bonus)) {
            return `${label} is not an object`;
        }
        if (!bonus.effects || typeof bonus.effects !== "object" || Array.isArray(bonus.effects)) {
            return `${label} has no effects object`;
        }
        const effectKeys = Object.keys(bonus.effects);
        if (effectKeys.length === 0) {
            return `${label} effects is empty`;
        }
        for (const key of effectKeys) {
            if (key === "moneyMult") {
                if (typeof bonus.effects.moneyMult !== "number") {
                    return `${label} effects.moneyMult must be a number`;
                }
            }
            else if (key === "add" || key === "mult" || key === "set") {
                // set = ABSOLUTE stat override applied after add/mult (misprints)
                const block = bonus.effects[key];
                if (!block || typeof block !== "object" || Array.isArray(block)) {
                    return `${label} effects.${key} must be an object`;
                }
                for (const [stat, value] of Object.entries(block)) {
                    if (!DRIVER_EFFECT_STATS.includes(stat)) {
                        return `${label} effects.${key} has unknown stat "${stat}"`;
                    }
                    if (typeof value !== "number") {
                        return `${label} effects.${key}.${stat} must be a number`;
                    }
                }
            }
            else {
                return `${label} effects has unknown key "${key}" (allowed: add, mult, set, moneyMult)`;
            }
        }
        if (bonus.minLevel !== undefined) {
            const maxLevel = DRIVER_MAX_LEVELS[driver.rarity];
            // Level 1 is ownership itself, so a gate there is meaningless —
            // omit minLevel instead of setting it to 1.
            if (!Number.isInteger(bonus.minLevel) || bonus.minLevel < 2) {
                return `${label} minLevel must be an integer of 2 or more (Level 1 = ownership; omit minLevel for always-active bonuses)`;
            }
            // Leveling rarities can't gate past their max level; level-0 rarities
            // (icon/autograph/serialised) ignore minLevel at runtime, so any value passes.
            if (maxLevel > 0 && bonus.minLevel > maxLevel) {
                return `${label} minLevel ${bonus.minLevel} exceeds max level ${maxLevel} for ${driver.rarity} rarity`;
            }
        }
        if (bonus.cond !== undefined && bonus.cond !== null) {
            if (typeof bonus.cond !== "object" || Array.isArray(bonus.cond)) {
                return `${label} cond must be an object`;
            }
            for (const key of Object.keys(bonus.cond)) {
                if (!DRIVER_COND_SPECIAL_KEYS.includes(key) && !DRIVER_COND_FILTER_KEYS.includes(key)) {
                    return `${label} cond has undocumented key "${key}"`;
                }
            }
            for (const statKey of ["statMin", "statMax"]) {
                if (bonus.cond[statKey] !== undefined) {
                    const block = bonus.cond[statKey];
                    if (!block || typeof block !== "object" || Array.isArray(block)) {
                        return `${label} cond.${statKey} must be an object`;
                    }
                    for (const [stat, value] of Object.entries(block)) {
                        if (!DRIVER_EFFECT_STATS.includes(stat)) {
                            return `${label} cond.${statKey} has unknown stat "${stat}"`;
                        }
                        if (typeof value !== "number") {
                            return `${label} cond.${statKey}.${stat} must be a number`;
                        }
                    }
                }
            }
            if (bonus.cond.carID !== undefined && (!Array.isArray(bonus.cond.carID) || bonus.cond.carID.some(id => typeof id !== "string"))) {
                return `${label} cond.carID must be an array of car ID strings`;
            }
        }
    }

    return null;
}

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
        packs: { loaded: 0, failed: 0, errors: [] },
        offerTemplates: { loaded: 0, failed: 0, errors: [] },
        pvpEventTemplates: { loaded: 0, failed: 0, errors: [] },
        packBattleTemplates: { loaded: 0, failed: 0, errors: [] },
        autoEventTemplates: { loaded: 0, failed: 0, errors: [] },
        drivers: { loaded: 0, failed: 0, errors: [] }
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

    // Load Offer Templates
    const offersPath = path.join(basePath, "offers");
    try {
        offerTemplateFiles = readdirSync(offersPath).filter(file => file.endsWith(".json"));
        for (const file of offerTemplateFiles) {
            try {
                const filePath = path.join(offersPath, file);
                const rawData = readFileSync(filePath, "utf8");
                const parsed = JSON.parse(rawData);
                const templateID = file.slice(0, -5);
                offerTemplates.set(templateID, parsed);
                stats.offerTemplates.loaded++;
            } catch (err) {
                stats.offerTemplates.failed++;
                stats.offerTemplates.errors.push({ file, error: err.message });
            }
        }
    } catch (err) {
        // offers/ directory may not exist yet — that's fine
        console.log(`   Offer Templates: directory not found, skipping`);
    }

    // Load PvP Event Templates
    const pvpEventsPath = path.join(basePath, "pvpevents");
    try {
        pvpEventTemplateFiles = readdirSync(pvpEventsPath).filter(file => file.endsWith(".json"));
        for (const file of pvpEventTemplateFiles) {
            try {
                const filePath = path.join(pvpEventsPath, file);
                const rawData = readFileSync(filePath, "utf8");
                const parsed = JSON.parse(rawData);
                const templateID = file.slice(0, -5);
                pvpEventTemplates.set(templateID, parsed);
                stats.pvpEventTemplates.loaded++;
            } catch (err) {
                stats.pvpEventTemplates.failed++;
                stats.pvpEventTemplates.errors.push({ file, error: err.message });
            }
        }
    } catch (err) {
        // pvpevents/ directory may not exist yet — that's fine
        console.log(`   PvP Event Templates: directory not found, skipping`);
    }

    // Load Pack Battle Templates
    const packBattlesPath = path.join(basePath, "packbattles");
    try {
        packBattleTemplateFiles = readdirSync(packBattlesPath).filter(file => file.endsWith(".json"));
        for (const file of packBattleTemplateFiles) {
            try {
                const filePath = path.join(packBattlesPath, file);
                const rawData = readFileSync(filePath, "utf8");
                const parsed = JSON.parse(rawData);
                const templateID = file.slice(0, -5);
                packBattleTemplates.set(templateID, parsed);
                stats.packBattleTemplates.loaded++;
            } catch (err) {
                stats.packBattleTemplates.failed++;
                stats.packBattleTemplates.errors.push({ file, error: err.message });
            }
        }
    } catch (err) {
        // packbattles/ directory may not exist yet — that's fine
        console.log(`   Pack Battle Templates: directory not found, skipping`);
    }

    // Load Auto-Event Templates ("_"-prefixed files are documentation, not templates)
    const autoEventsPath = path.join(basePath, "autoevents");
    try {
        autoEventTemplateFiles = readdirSync(autoEventsPath).filter(file => file.endsWith(".json") && !file.startsWith("_"));
        for (const file of autoEventTemplateFiles) {
            try {
                const filePath = path.join(autoEventsPath, file);
                const rawData = readFileSync(filePath, "utf8");
                const parsed = JSON.parse(rawData);
                const templateID = file.slice(0, -5);
                autoEventTemplates.set(templateID, parsed);
                stats.autoEventTemplates.loaded++;
            } catch (err) {
                stats.autoEventTemplates.failed++;
                stats.autoEventTemplates.errors.push({ file, error: err.message });
            }
        }
    } catch (err) {
        // autoevents/ directory may not exist yet — that's fine
        console.log(`   Auto-Event Templates: directory not found, skipping`);
    }

    // Load Drivers (rarity system v3 — validated at startup; invalid files are logged
    // and skipped, NEVER fatal: drivers are non-critical collectibles)
    const driversPath = path.join(basePath, "drivers");
    try {
        const driverFileNames = readdirSync(driversPath).filter(file => file.endsWith(".json"));
        for (const file of driverFileNames) {
            try {
                const filePath = path.join(driversPath, file);
                const rawData = readFileSync(filePath, "utf8");
                const parsed = JSON.parse(rawData);
                const driverID = file.slice(0, -5);
                const invalidReason = validateDriver(parsed, driverID);
                if (invalidReason) {
                    throw new Error(invalidReason);
                }
                drivers.set(driverID, parsed);
                driverFiles.push(file);
                stats.drivers.loaded++;
            } catch (err) {
                stats.drivers.failed++;
                stats.drivers.errors.push({ file, error: err.message });
                console.warn(`⚠️ Driver file skipped: ${file} - ${err.message}`);
            }
        }
    } catch (err) {
        // drivers/ directory may not exist yet — that's fine
        console.log(`   Drivers: directory not found, skipping`);
    }

    /**
     * A driver's identity to a player is name + variant + rarity — that's what
     * every list, card and search shows. Nothing enforces it structurally
     * (driverID is the real key), so two drivers sharing all three would look
     * identical in cd-driverlist with no way to tell them apart.
     *
     * This used to be covered incidentally by `year`. With that field gone,
     * the check has to be explicit — otherwise adding a second "Lewis Hamilton
     * (Prime)" at secret rarity fails silently and confusingly, in the UI,
     * rather than loudly here at boot.
     */
    const identities = new Map();
    for (const [driverID, driver] of drivers) {
        const identity = `${driver.name}|${driver.variant || ""}|${driver.rarity}`.toLowerCase();
        if (identities.has(identity)) {
            console.warn(`⚠️ Driver identity clash: ${driverID} and ${identities.get(identity)} are both `
                + `"${driver.name}${driver.variant ? ` (${driver.variant})` : ""}" at ${driver.rarity} rarity. `
                + "Give one a variant — players cannot tell them apart.");
            stats.drivers.errors.push({ file: `${driverID}.json`, error: "identity clash with " + identities.get(identity) });
        }
        else identities.set(identity, driverID);
    }

    initialized = true;

    // L-01: Build cached arrays once (avoids Array.from() on every getRandomCar/Track call)
    cachedCarArray = Array.from(cars.values());
    cachedTrackArray = Array.from(tracks.values());

    // Log results
    console.log(`✅ DataManager initialized:`);
    console.log(`   Cars: ${stats.cars.loaded} loaded, ${stats.cars.failed} failed`);
    console.log(`   Tracks: ${stats.tracks.loaded} loaded, ${stats.tracks.failed} failed`);
    console.log(`   Packs: ${stats.packs.loaded} loaded, ${stats.packs.failed} failed`);
    console.log(`   Offer Templates: ${stats.offerTemplates.loaded} loaded, ${stats.offerTemplates.failed} failed`);
    console.log(`   PvP Event Templates: ${stats.pvpEventTemplates.loaded} loaded, ${stats.pvpEventTemplates.failed} failed`);
    console.log(`   Pack Battle Templates: ${stats.packBattleTemplates.loaded} loaded, ${stats.packBattleTemplates.failed} failed`);
    console.log(`   Auto-Event Templates: ${stats.autoEventTemplates.loaded} loaded, ${stats.autoEventTemplates.failed} failed`);
    console.log(`   Drivers: ${stats.drivers.loaded} loaded, ${stats.drivers.failed} failed`);

    if (stats.cars.failed > 0 || stats.tracks.failed > 0 || stats.packs.failed > 0 || stats.offerTemplates.failed > 0 || stats.pvpEventTemplates.failed > 0) {
        console.error("❌ Some files failed to load:");
        stats.cars.errors.forEach(e => console.error(`   Car: ${e.file} - ${e.error}`));
        stats.tracks.errors.forEach(e => console.error(`   Track: ${e.file} - ${e.error}`));
        stats.packs.errors.forEach(e => console.error(`   Pack: ${e.file} - ${e.error}`));
        stats.offerTemplates.errors.forEach(e => console.error(`   Offer Template: ${e.file} - ${e.error}`));
        stats.pvpEventTemplates.errors.forEach(e => console.error(`   PvP Event Template: ${e.file} - ${e.error}`));
        stats.packBattleTemplates.errors.forEach(e => console.error(`   Pack Battle Template: ${e.file} - ${e.error}`));
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

/**
 * Get offer template data by ID
 * @param {string} templateID - Template ID with or without .json extension
 * @returns {Object|null} Template data object or null if not found
 */
function getOfferTemplate(templateID) {
    if (!templateID) return null;

    let cleanID = templateID;
    if (cleanID.includes("/")) {
        cleanID = cleanID.split("/").pop();
    }
    if (cleanID.endsWith(".json")) {
        cleanID = cleanID.slice(0, -5);
    }

    const template = offerTemplates.get(cleanID);
    if (!template) {
        console.warn(`⚠️ Offer template not found: ${templateID} (cleaned: ${cleanID})`);
        return null;
    }
    return template;
}

/**
 * Get PvP event template data by ID
 * @param {string} templateID - Template ID with or without .json extension
 * @returns {Object|null} Template data object or null if not found
 */
function getPvpEventTemplate(templateID) {
    if (!templateID) return null;

    let cleanID = templateID;
    if (cleanID.includes("/")) {
        cleanID = cleanID.split("/").pop();
    }
    if (cleanID.endsWith(".json")) {
        cleanID = cleanID.slice(0, -5);
    }

    const template = pvpEventTemplates.get(cleanID);
    if (!template) {
        console.warn(`⚠️ PvP event template not found: ${templateID} (cleaned: ${cleanID})`);
        return null;
    }
    return template;
}

/**
 * Get pack battle template data by ID
 * @param {string} templateID - Template ID with or without .json extension
 * @returns {Object|null} Template data object or null if not found
 */
function getPackBattleTemplate(templateID) {
    if (!templateID) return null;
    let cleanID = templateID;
    if (cleanID.includes("/")) cleanID = cleanID.split("/").pop();
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    const template = packBattleTemplates.get(cleanID);
    if (!template) {
        console.warn(`⚠️ Pack battle template not found: ${templateID} (cleaned: ${cleanID})`);
        return null;
    }
    return template;
}

/**
 * Get auto-event template data by ID
 * @param {string} templateID - Template ID with or without .json extension
 * @returns {Object|null} Template data object or null if not found
 */
function getAutoEventTemplate(templateID) {
    if (!templateID) return null;
    let cleanID = templateID;
    if (cleanID.includes("/")) cleanID = cleanID.split("/").pop();
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    const template = autoEventTemplates.get(cleanID);
    if (!template) {
        console.warn(`⚠️ Auto-event template not found: ${templateID} (cleaned: ${cleanID})`);
        return null;
    }
    return template;
}

/**
 * Get driver data by ID (drivers v2)
 * @param {string} driverID - Driver ID with or without .json extension
 * @returns {Object|null} Driver data object or null if not found
 */
function getDriver(driverID) {
    if (!driverID) return null;
    let cleanID = driverID;
    if (cleanID.includes("/")) cleanID = cleanID.split("/").pop();
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    const driver = drivers.get(cleanID);
    if (!driver) {
        console.warn(`⚠️ Driver not found: ${driverID} (cleaned: ${cleanID})`);
        return null;
    }
    return driver;
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

/**
 * Get list of all offer template files
 * @returns {string[]} Array of offer template filenames
 */
function getOfferTemplateFiles() {
    return offerTemplateFiles;
}

/**
 * Get list of all PvP event template files
 * @returns {string[]} Array of PvP event template filenames
 */
function getPvpEventTemplateFiles() {
    return pvpEventTemplateFiles;
}

/**
 * Get list of all pack battle template files
 * @returns {string[]} Array of pack battle template filenames
 */
function getPackBattleTemplateFiles() {
    return packBattleTemplateFiles;
}

/**
 * Get list of all auto-event template files
 * @returns {string[]} Array of auto-event template filenames
 */
function getAutoEventTemplateFiles() {
    return autoEventTemplateFiles;
}

/**
 * Get list of all driver files that passed validation
 * @returns {string[]} Array of driver filenames (e.g., ["d00000.json", ...])
 */
function getDriverFiles() {
    return driverFiles;
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
 * Get all drivers as an array (drivers v2)
 * @returns {Object[]} Array of all driver objects
 */
function getAllDrivers() {
    return Array.from(drivers.values());
}

/**
 * Get all offer templates as an array
 * @returns {Object[]} Array of all offer template objects
 */
function getAllOfferTemplates() {
    return Array.from(offerTemplates.values());
}

/**
 * Get all PvP event templates as an array
 * @returns {Object[]} Array of all PvP event template objects
 */
function getAllPvpEventTemplates() {
    return Array.from(pvpEventTemplates.values());
}

/**
 * Get all pack battle templates as an array
 * @returns {Object[]} Array of all pack battle template objects
 */
function getAllPackBattleTemplates() {
    return Array.from(packBattleTemplates.values());
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
 * Check if an offer template exists
 * @param {string} templateID - Template ID to check
 * @returns {boolean}
 */
function offerTemplateExists(templateID) {
    let cleanID = templateID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return offerTemplates.has(cleanID);
}

/**
 * Check if a PvP event template exists
 * @param {string} templateID - Template ID to check
 * @returns {boolean}
 */
function pvpEventTemplateExists(templateID) {
    let cleanID = templateID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return pvpEventTemplates.has(cleanID);
}

/**
 * Check if a pack battle template exists
 * @param {string} templateID - Template ID to check
 * @returns {boolean}
 */
function packBattleTemplateExists(templateID) {
    let cleanID = templateID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return packBattleTemplates.has(cleanID);
}

/**
 * Check if a driver exists (drivers v2)
 * @param {string} driverID - Driver ID to check
 * @returns {boolean}
 */
function driverExists(driverID) {
    if (!driverID) return false;
    let cleanID = driverID;
    if (cleanID.endsWith(".json")) cleanID = cleanID.slice(0, -5);
    return drivers.has(cleanID);
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
            packs: packs.size,
            offerTemplates: offerTemplates.size,
            pvpEventTemplates: pvpEventTemplates.size,
            packBattleTemplates: packBattleTemplates.size,
            drivers: drivers.size
        },
        fileCounts: {
            cars: carFiles.length,
            tracks: trackFiles.length,
            packs: packFiles.length,
            offerTemplates: offerTemplateFiles.length,
            pvpEventTemplates: pvpEventTemplateFiles.length,
            drivers: driverFiles.length
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
    offerTemplates.clear();
    pvpEventTemplates.clear();
    packBattleTemplates.clear();
    drivers.clear();
    carFiles = [];
    trackFiles = [];
    packFiles = [];
    offerTemplateFiles = [];
    pvpEventTemplateFiles = [];
    packBattleTemplateFiles = [];
    driverFiles = [];
    cachedCarArray = [];
    cachedTrackArray = [];
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
    // L-01: Use cached array instead of Array.from() on every call
    let carArray = filterFn ? cachedCarArray.filter(filterFn) : cachedCarArray;

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
    // L-01: Use cached array instead of Array.from() on every call
    if (cachedTrackArray.length === 0) return null;
    return cachedTrackArray[Math.floor(Math.random() * cachedTrackArray.length)];
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
            // lazy require: cardType sits above this module in the layer stack
            const { isPrizeLike } = require("./cardType.js");
            if (isPrizeLike(car) !== criteria.isPrize) matches = false;
        }

        // Is Reference (BM car)
        if (criteria.isReference !== undefined) {
            const { isBMCar } = require("./cardType.js");
            if (isBMCar(car) !== criteria.isReference) matches = false;
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
    getOfferTemplate,
    getPvpEventTemplate,
    getPackBattleTemplate,
    getAutoEventTemplate,
    getDriver,

    // File lists (replace readdirSync())
    getCarFiles,
    getTrackFiles,
    getPackFiles,
    getOfferTemplateFiles,
    getPvpEventTemplateFiles,
    getPackBattleTemplateFiles,
    getAutoEventTemplateFiles,
    getDriverFiles,

    // Bulk getters
    getAllCars,
    getAllTracks,
    getAllPacks,
    getAllOfferTemplates,
    getAllPvpEventTemplates,
    getAllPackBattleTemplates,
    getAllDrivers,

    // Existence checks
    carExists,
    trackExists,
    packExists,
    offerTemplateExists,
    pvpEventTemplateExists,
    packBattleTemplateExists,
    driverExists,

    // Utilities
    getStats,
    getRandomCar,
    getRandomCarFile,
    getRandomTrack,
    searchCars
};
