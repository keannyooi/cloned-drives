"use strict";

const bot = require("../../config/config.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../consts/consts.js");
const { getCar, getPack } = require("./dataManager.js");
const carNameGen = require("./carNameGen.js");

function listRewards(rewards) {
    let rewardString = "";
    for (let [key, value] of Object.entries(rewards)) {
        let emoji;
        switch (key) {
            case "money":
                emoji = bot.emojis.cache.get(moneyEmojiID);
                rewardString += `${emoji}${value.toLocaleString("en")}, `;
                break;
            case "fuseTokens":
                emoji = bot.emojis.cache.get(fuseEmojiID);
                rewardString += `${emoji}${value.toLocaleString("en")}, `;
                break;
            case "trophies":
                emoji = bot.emojis.cache.get(trophyEmojiID);
                rewardString += `${emoji}${value.toLocaleString("en")}, `;
                break;
            case "car":
                let currentCar = getCar(value.carID);
                rewardString += `${carNameGen({ currentCar, rarity: true, upgrade: value.upgrade })}, `;
                break;
            case "pack":
                let pack = getPack(value);
                rewardString += `${pack["packName"]}, `;
                break;
            default:
                break;
        }
    }
    if (rewardString === "") {
        return "None";
    }
    else {
        return rewardString.slice(0, -2);
    }
}

module.exports = listRewards;
