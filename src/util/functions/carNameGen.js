"use strict";

const bot = require("../../config/config.js");
const rarityCheck = require("./rarityCheck.js");

function carNameGen(args) {
    let { currentCar, rarity, upgrade, removePrizeTag, removeBMTag } = args;
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = currentCar["make"];
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (rarity === true) {
        let type = null;
        if (currentCar["reference"]) {
            currentCar = require(`../../cars/${currentCar["reference"]}.json`)
            type = "bm";
        }
        currentName = `(${rarityCheck(currentCar, type)} ${currentCar["rq"]}) ${currentName}`;
    }
    if (upgrade) {
        currentName += ` [${upgrade}]`;
    }
    if (!removePrizeTag && currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    if (!removeBMTag && currentCar["active"]) {
        currentName += ``🟢``;
    }
    return currentName;
}

module.exports = carNameGen;