"use strict";

const bot = require("../../config/config.js");
const { getCar } = require("./dataManager.js");
const { DIAMONDS_ENABLED } = require("../consts/consts.js");
const rarityCheck = require("./rarityCheck.js");

// L-02: Cache trophy emoji at module level (populated on first call)
let cachedTrophyEmoji = null;

function carNameGen({ currentCar, rarity = false, upgrade = null, removePrizeTag = false, removeBMTag = false, removeDiamondTag = false }) {
    if (!currentCar) throw new Error("Invalid car data provided.");

    if (!cachedTrophyEmoji) {
        cachedTrophyEmoji = bot.emojis.cache.get("1162882228741734520") || "🏆";
    }
    const trophyEmoji = cachedTrophyEmoji;
    const make = Array.isArray(currentCar.make) ? currentCar.make[0] : currentCar.make;
    const { model, modelYear, isPrize, reference, active, cr, diamond } = currentCar;

    // Determine base name
    let currentName = `${make} ${model} (${modelYear})`;

    // Add rarity if requested
    if (rarity) {
        const bmReference = reference ? getCar(reference) : currentCar;
        // Precedence: BM reference > diamond flag > CR-based
        const type = reference ? "bm" : (bmReference.diamond === true ? "diamond" : null);
        currentName = `(${rarityCheck(bmReference, type)} ${bmReference.cr}) ${currentName}`;
    }

    // Add upgrade tag if provided
    if (upgrade) currentName += ` [${upgrade}]`;

    // Add prize tag unless explicitly removed
    if (!removePrizeTag && isPrize) currentName += ` ${trophyEmoji}`;

    // Add BM (benchmark) tag unless explicitly removed
    if (!removeBMTag && reference) {
        currentName += active ? `🟢` : `🔴`;
    }

    // Add diamond active-state indicator (parallels the BM 🟢/🔴 pattern).
    // The rarity icon already identifies the car as Diamond, so no extra diamond
    // emoji is added. active=true → 🟢, active=false → 🔴, undefined → no tag.
    // (Safe to reuse `active` — diamond cars have no `reference` so can't be BM.)
    // Gated by DIAMONDS_ENABLED — indicator hidden while the feature is paused.
    if (DIAMONDS_ENABLED && !removeDiamondTag && diamond === true) {
        if (active === true) currentName += `🟢`;
        else if (active === false) currentName += `🔴`;
    }

    return currentName;
}

module.exports = carNameGen;
