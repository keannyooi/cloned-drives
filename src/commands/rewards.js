"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "rewards",
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Collects your rewards from random races, events and challenges.",
    async execute(message) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

        const playerData = await profileModel.findOne({ userID: message.author.id });
if (playerData.unclaimedRewards.length > 0) {
    console.log(`Processing rewards for user ${message.author.id}`);
    let rewardLog = "", line = "", limitExceeded = false;

    for (let reward of playerData.unclaimedRewards) {
        let { origin } = reward;

        try {
            switch (Object.keys(reward)[0]) {
                case "money":
                    if (typeof reward.money === "number" && reward.money > 0) {
                        playerData.money += reward.money;
                        line = `Received **${moneyEmoji}${reward.money.toLocaleString("en")}** from **${origin}**\n`;
                    } else {
                        console.error(`Invalid money reward:`, reward);
                    }
                    break;

                case "car":
                    if (reward.car && typeof reward.car.carID === "string") {
                        let currentCar = require(`../cars/${reward.car.carID}.json`);
                        playerData.garage = addCars(playerData.garage, [reward.car]);
                        line = `Received **1x ${carNameGen({ currentCar, rarity: true, upgrade: reward.car.upgrade })}** from **${origin}**\n`;
                    } else {
                        console.error(`Invalid car reward:`, reward);
                    }
                    break;

                case "pack":
                    if (reward.pack && typeof reward.pack === "string") {
                        let currentPack = require(`../packs/${reward.pack}.json`);
                        let addedCars = await openPack({ message, currentPack });
                        if (Array.isArray(addedCars)) {
                            playerData.garage = addCars(playerData.garage, addedCars);
                            line = `Received **1x ${currentPack["packName"]}** from **${origin}**\n`;
                        } else {
                            console.error(`Invalid pack reward:`, reward);
                        }
                    }
                    break;

                default:
                    console.warn(`Unknown reward type:`, reward);
                    break;
            }
        } catch (err) {
            console.error(`Error processing reward from ${origin}:`, err);
            continue;
        }

        if (rewardLog.length + line.length < 4096) {
            rewardLog += line;
        } else if (!limitExceeded) {
            limitExceeded = true;
            rewardLog += "...etc\n";
        }
    }

    try {
        await profileModel.updateOne(
            { userID: message.author.id },
            {
                money: playerData.money,
                fuseTokens: playerData.fuseTokens,
                trophies: playerData.trophies,
                garage: playerData.garage,
                unclaimedRewards: []
            }
        );
        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: "Successfully claimed your rewards!",
            desc: rewardLog,
            author: message.author
        });
        return successMessage.sendMessage();
    } catch (err) {
        console.error(`Failed to update database for user ${message.author.id}:`, err);
        return message.channel.send("An error occurred while claiming your rewards. Please try again later.");
    }
} else {
    const infoMessage = new InfoMessage({
        channel: message.channel,
        title: "It looks like you don't have any unclaimed rewards.",
        desc: "Please come back here when you have pending rewards!",
        author: message.author
    });
    return infoMessage.sendMessage();
}
}
}
