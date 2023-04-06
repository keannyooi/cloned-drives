"use strict";

const bot = require("../../config/config.js");
const rarityCheck = require("./rarityCheck.js");

function carNameGen(args) {
    let { currentCar, rarity, upgrade, removePrizeTag, removeBMTag } = args;
    const trophyEmoji = bot.emojis.cache.get("775636479145148418");
    let make = currentCar["make"], bmReference = currentCar;
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (rarity === true) {
        let type = null;
        if (currentCar["reference"]) {
            bmReference = require(`../../cars/${currentCar["reference"]}.json`);
            type = "bm";
        }
        currentName = `(${rarityCheck(bmReference, type)} ${bmReference["rq"]}) ${currentName}`;
    }
    if (upgrade) {
        currentName += ` [${upgrade}]`;
    }
    if (!removePrizeTag && currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    if (!removeBMTag && currentCar["reference"]) {
        if (currentCar["active"]) {
            currentName += ` 🟢`;
        }
        else {
            currentName += ` 🔴`;
        }
    }
    return currentName;
}

module.exports = carNameGen;