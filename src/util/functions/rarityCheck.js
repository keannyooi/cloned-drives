"use strict";

const bot = require("../../config/config.js");
const { blackMarketEmojiID, bossEmojiID, mysticEmojiID, legendaryEmojiID, epicEmojiID, exoticEmojiID, standardEmojiID,
    rareEmojiID, uncommonEmojiID, commonEmojiID } = require("../consts/consts.js");

// L-02: Cache emoji lookups at module level (populated on first call, stays in memory)
let emojiCache = null;

function getEmojiCache() {
    if (emojiCache) return emojiCache;
    emojiCache = {
        bm: bot.emojis.cache.get(blackMarketEmojiID),
        boss: bot.emojis.cache.get(bossEmojiID),
        mystic: bot.emojis.cache.get(mysticEmojiID),
        legendary: bot.emojis.cache.get(legendaryEmojiID),
        exotic: bot.emojis.cache.get(exoticEmojiID),
        epic: bot.emojis.cache.get(epicEmojiID),
        rare: bot.emojis.cache.get(rareEmojiID),
        uncommon: bot.emojis.cache.get(uncommonEmojiID),
        common: bot.emojis.cache.get(commonEmojiID),
        standard: bot.emojis.cache.get(standardEmojiID)
    };
    return emojiCache;
}

function rarityCheck(car, type) {
    const emojis = getEmojiCache();

    if (type === "bm") return emojis.bm;
    else if (car["cr"] > 1500) return emojis.boss;
    else if (car["cr"] > 999) return emojis.mystic;
    else if (car["cr"] > 849) return emojis.legendary;
    else if (car["cr"] > 699) return emojis.exotic;
    else if (car["cr"] > 549) return emojis.epic;
    else if (car["cr"] > 399) return emojis.rare;
    else if (car["cr"] > 249) return emojis.uncommon;
    else if (car["cr"] > 99) return emojis.common;
    else return emojis.standard;
}

module.exports = rarityCheck;
