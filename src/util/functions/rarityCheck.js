"use strict";

const bot = require("../../config/config.js");

function rarityCheck(car) {
    if (car["collection"]) {
        return bot.emojis.cache.get("831967206446465064");
    }
    else if (car["rq"] > 79) { //leggie
        return bot.emojis.cache.get("857512942471479337");
    }
    else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
        return bot.emojis.cache.get("726025468230238268");
    }
    else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
        return bot.emojis.cache.get("726025431937187850");
    }
    else if (car["rq"] > 39 && car["rq"] <= 49) { //super
        return bot.emojis.cache.get("857513197937623042");
    }
    else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
        return bot.emojis.cache.get("726025302656024586");
    }
    else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
        return bot.emojis.cache.get("726025273421725756");
    }
    else { //common
        return bot.emojis.cache.get("726020544264273928");
    }
}

module.exports = rarityCheck;