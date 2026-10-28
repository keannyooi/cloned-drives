"use strict";

/**
 * Race Week prize sources shared by raceWeekManager.js (rung / endless /
 * pre-programmed week prizes) and raceWeekEvents.js (pack-granting in-race
 * events): the one prizePools.json reader and the one tier-based pack roll.
 */

const { readFileSync } = require("fs");
const path = require("path");
const { getPack, getPackFiles } = require("./dataManager.js");
const { getPackTier } = require("../consts/economy.js");

const PRIZE_POOLS_PATH = path.join(__dirname, "../../raceweek/prizePools.json");

/**
 * The whole parsed src/raceweek/prizePools.json, read FRESH on every call so
 * edits apply with no restart. A non-object parse comes back as {}.
 * THROWS when the file is missing or not valid JSON — each caller keeps its
 * own fallback (the manager drops to automatic rules for the whole file, an
 * event drops to the tier roll for that event only).
 */
function readPrizePools() {
    const parsed = JSON.parse(readFileSync(PRIZE_POOLS_PATH, "utf8"));
    return (parsed && typeof parsed === "object") ? parsed : {};
}

/**
 * A random packID (no .json) among every loaded pack of `tier` (getPackTier),
 * event/limited packs included. Returns null when no pack has that tier —
 * callers decide whether that is a skip or an error.
 */
function rollPackByTier(tier) {
    const candidates = getPackFiles().filter(file => {
        const pack = getPack(file);
        return pack && getPackTier(pack) === tier;
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)].slice(0, -5);
}

module.exports = { PRIZE_POOLS_PATH, readPrizePools, rollPackByTier };
