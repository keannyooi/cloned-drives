"use strict";

const bot = require("../../config/config.js");
const rarityCheck = require("./rarityCheck.js");

function carNameGen(args) {
    const { currentCar, rarity, upgrade, removePrizeTag } = args;
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = currentCar["make"];
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (rarity === true) {
        currentName = `(${rarityCheck(currentCar)} ${currentCar["rq"]}) ${currentName}`;
    }
    if (upgrade) {
        currentName += ` [${upgrade}]`;
    }
    if (!removePrizeTag && currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    return currentName;
}

module.exports = carNameGen;