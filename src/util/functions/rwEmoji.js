"use strict";

/**
 * RACE WEEK EMOJI RESOLVER
 * ========================
 * One place that turns a semantic key ("divine", "photofinish", "levelUp")
 * into a renderable emoji. Every Race Week / Drivers surface goes through this
 * instead of hardcoding IDs or unicode, so re-skinning is a consts edit.
 *
 * Always falls back to the unicode glyph the feature shipped with, so a
 * missing/deleted emote or a cold cache degrades to readable text rather than
 * rendering "undefined" at players.
 *
 *     rwEmoji("divine")            → <:Driver_Divine:...>  (or "🥉")
 *     rwEmoji("photofinish")       → <:RRPhoto:...>        (or "📸")
 *     rarityEmoji(driverOrRarity)  → the tier emote, legacy names normalized
 */

const bot = require("../../config/config.js");
const { raceWeekEmojiIDs } = require("../consts/consts.js");

// Unicode used before the custom set existed — kept as the fallback for each key.
const FALLBACKS = {
    base: "⚪", rare: "🔵", secret: "🔴", divine: "🥉",
    icon: "🌟", autograph: "🖋️", serialised: "🔢",

    driverActive: "⚡", driverIdle: "💤",

    levelLocked: "🔒", levelUnlocked: "🔓", levelUp: "⬆️",
    progress: "📈", maxed: "🔁", serial: "🏷️",

    raceweek: "🏁", winner: "🏆", rotation: "🔄",
    exclusive: "👑", unique: "✳️", bossSlayer: "⚔️",

    car: "🚗", pack: "📦", driver: "👤",

    photofinish: "📸", cashvein: "💼", skiptoken: "🎟️", packshards: "🧩",
    driverscout: "🔭", doubleornothing: "🎲", cursedrace: "😈", convoy: "🚚",
    underdogoffer: "🐣", showcase: "🎪", goldenopponent: "✨", revengematch: "🔥",
    lucky: "🌟", domination: "💎"
};

/** Resolve a key to its custom emote, or the unicode fallback. */
function rwEmoji(key) {
    const id = raceWeekEmojiIDs[key];
    if (id) {
        const emoji = bot.emojis?.cache?.get(id);
        if (emoji) return emoji.toString();
    }
    return FALLBACKS[key] || "";
}

// Legacy 4-tier names still appear in older data / stored prize maps.
const LEGACY_RARITY = { standard: "base", epic: "secret", legendary: "divine" };

/**
 * Tier emote for a driver object OR a rarity string. Legacy tier names are
 * normalized, so a not-yet-migrated card still renders correctly.
 */
function rarityEmoji(driverOrRarity) {
    const raw = (driverOrRarity && typeof driverOrRarity === "object")
        ? driverOrRarity.rarity
        : driverOrRarity;
    const rarity = LEGACY_RARITY[raw] || raw || "base";
    return rwEmoji(rarity);
}

module.exports = rwEmoji;
module.exports.rwEmoji = rwEmoji;
module.exports.rarityEmoji = rarityEmoji;
