"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack } = require("../util/functions/dataManager.js");
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

        // Initialize discoveredCars
        let discoveredCars = playerData.discoveredCars || [];
        if (discoveredCars.length === 0 && playerData.garage.length > 0) {
            discoveredCars = playerData.garage.map(c => c.carID);
        }

        if (playerData.unclaimedRewards.length > 0) {
            let rewardLog = "", line = "", limitExceeded = false;
            for (let reward of playerData.unclaimedRewards) {
                let { origin } = reward;
                switch (Object.keys(reward)[0]) {
                    case "money":
                        playerData.money += reward.money;
                        line = `Received **${moneyEmoji}${reward.money.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "fuseTokens":
                        playerData.fuseTokens += reward.fuseTokens;
                        line = `Received **${fuseEmoji}${reward.fuseTokens.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "trophies":
                        playerData.trophies += reward.trophies;
                        line = `Received **${trophyEmoji}${reward.trophies.toLocaleString("en")}** from **${origin}**\n`;
                        break;
                    case "car":
                        let currentCar = getCar(reward.car.carID);
                        playerData.garage = addCars(playerData.garage, [reward.car]);
                        // Track discovery
                        if (!discoveredCars.includes(reward.car.carID)) {
                            discoveredCars.push(reward.car.carID);
                        }
                        line = `Received **1x ${carNameGen({ currentCar, rarity: true, upgrade: reward.car.upgrade })}** from **${origin}**\n`;
                        break;
                    case "pack":
                        let currentPack = getPack(reward.pack);
                        let addedCars = await openPack({ message, currentPack, discoveredCars });
                        if (!Array.isArray(addedCars)) return;

                        playerData.garage = addCars(playerData.garage, addedCars);
                        line = `Received **1x ${currentPack["packName"]}** from **${origin}**\n`;
                        break;
                    default:
                        break;
                }

                if (rewardLog.length + line.length < 4096) { // discord embed desc limit
                    rewardLog += line;
                }
                else if (!limitExceeded) {
                    limitExceeded = true;
                    rewardLog += "...etc";
                }
            }

            await profileModel.updateOne({ userID: message.author.id }, {
                money: playerData.money,
                fuseTokens: playerData.fuseTokens,
                trophies: playerData.trophies,
                garage: playerData.garage,
                discoveredCars,
                unclaimedRewards: []
            });

            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: "Successfully claimed your rewards!",
                desc: rewardLog,
                author: message.author
            });
            return successMessage.sendMessage();
        }
        else {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "It looks like you don't have any unclaimed rewards.",
                desc: "Please come back here when you have pending rewards!",
                author: message.author
            });
            return infoMessage.sendMessage();
        }
    }
};
