"use strict";

const bot = require("../../config/config.js");
const { getCar } = require("./dataManager.js");
const rarityCheck = require("./rarityCheck.js");

function carNameGen({ currentCar, rarity = false, upgrade = null, removePrizeTag = false, removeBMTag = false }) {
    if (!currentCar) throw new Error("Invalid car data provided.");
    
    const trophyEmoji = bot.emojis.cache.get("1162882228741734520") || "🏆"; // Fallback emoji
    const make = Array.isArray(currentCar.make) ? currentCar.make[0] : currentCar.make;
    const { model, modelYear, isPrize, reference, active, cr } = currentCar;

    // Determine base name
    let currentName = `${make} ${model} (${modelYear})`;

    // Add rarity if requested
    if (rarity) {
        const bmReference = reference ? getCar(reference) : currentCar;
        const type = reference ? "bm" : null;
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

    return currentName;
}

module.exports = carNameGen;
