"use strict";

const bot = require("../../config/config.js");
const { blackMarketEmojiID, bossEmojiID, mysticEmojiID, legendaryEmojiID, epicEmojiID, exoticEmojiID, standardEmojiID,
    rareEmojiID, uncommonEmojiID, commonEmojiID } = require("../consts/consts.js");

function rarityCheck(car, type) {
    if (type === "bm") {
        return bot.emojis.cache.get(blackMarketEmojiID);
    }
    else if (car["cr"] > 1501) { //BOSS
    return bot.emojis.cache.get(bossEmojiID);
    }
	    else if (car["cr"] > 999 && car["cr"] <= 1500) { //Mystic
        return bot.emojis.cache.get(mysticEmojiID);
    }
    else if (car["cr"] > 849 && car["cr"] <= 999) { //leggie
        return bot.emojis.cache.get(legendaryEmojiID);
    }
    else if (car["cr"] > 699 && car["cr"] <= 849) { //exotic
        return bot.emojis.cache.get(exoticEmojiID);
    }
    else if (car["cr"] > 549 && car["cr"] <= 699) { //epic
        return bot.emojis.cache.get(epicEmojiID);
    }
    else if (car["cr"] > 399 && car["cr"] <= 549) { //rare
        return bot.emojis.cache.get(rareEmojiID);
    }
    else if (car["cr"] > 249 && car["cr"] <= 399) { //uncommon
        return bot.emojis.cache.get(uncommonEmojiID);
    }
    else if (car["cr"] > 99 && car["cr"] <= 249) { //common
        return bot.emojis.cache.get(commonEmojiID);
    }
    else { //standard
        return bot.emojis.cache.get(standardEmojiID);
    }
}

module.exports = rarityCheck;