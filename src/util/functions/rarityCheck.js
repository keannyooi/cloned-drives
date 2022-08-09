"use strict";

const bot = require("../../config/config.js");
const { blackMarketEmojiID, legendaryEmojiID, epicEmojiID, ultraRareEmojiID, superRareEmojiID,
    rareEmojiID, uncommonEmojiID, commonEmojiID } = require("../consts/consts.js");

function rarityCheck(car, type) {
    if (type === "bm") {
        return bot.emojis.cache.get(blackMarketEmojiID);
    }
    else if (car["rq"] > 79) { //leggie
        return bot.emojis.cache.get(legendaryEmojiID);
    }
    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
        return bot.emojis.cache.get(epicEmojiID);
    }
    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
        return bot.emojis.cache.get(ultraRareEmojiID);
    }
    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
        return bot.emojis.cache.get(superRareEmojiID);
    }
    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
        return bot.emojis.cache.get(rareEmojiID);
    }
    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
        return bot.emojis.cache.get(uncommonEmojiID);
    }
    else { //common
        return bot.emojis.cache.get(commonEmojiID);
    }
}

module.exports = rarityCheck;