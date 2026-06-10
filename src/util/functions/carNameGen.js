"use strict";

const bot = require("../../config/config.js");
const { DIAMONDS_ENABLED } = require("../consts/consts.js");
const { modifiedBase, isBMCar, isDiamondCar, isPrizeLike, inBMRotation, isDiamondRollable } = require("./cardType.js");
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
    const { model, modelYear } = currentCar;

    // Determine base name
    let currentName = `${make} ${model} (${modelYear})`;

    // Add rarity if requested
    if (rarity) {
        const bmReference = modifiedBase(currentCar);
        // Precedence: BM > diamond > CR-based
        const type = isBMCar(currentCar) ? "bm" : (isDiamondCar(currentCar) ? "diamond" : null);
        currentName = `(${rarityCheck(bmReference, type)} ${bmReference.cr}) ${currentName}`;
    }

    // Add upgrade tag if provided
    if (upgrade) currentName += ` [${upgrade}]`;

    // Add prize tag unless explicitly removed
    if (!removePrizeTag && isPrizeLike(currentCar)) currentName += ` ${trophyEmoji}`;

    // Add BM (benchmark) tag unless explicitly removed
    if (!removeBMTag && isBMCar(currentCar)) {
        currentName += inBMRotation(currentCar) ? `🟢` : `🔴`;
    }

    // Add diamond active-state indicator (parallels the BM 🟢/🔴 pattern).
    // The rarity icon already identifies the car as Diamond, so no extra diamond
    // emoji is added. Rollable → 🟢, retired/event-only → 🔴.
    // Gated by DIAMONDS_ENABLED — indicator hidden while the feature is paused.
    if (DIAMONDS_ENABLED && !removeDiamondTag && isDiamondCar(currentCar)) {
        currentName += isDiamondRollable(currentCar) ? `🟢` : `🔴`;
    }

    return currentName;
}

module.exports = carNameGen;
