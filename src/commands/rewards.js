"use strict";

const bot = require("../config/config.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
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
        const moneyEmoji = bot.emojis.cache.get("726017235826770021");
        const fuseEmoji = bot.emojis.cache.get("726018658635218955");
        const trophyEmoji = bot.emojis.cache.get("775636479145148418");

        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (playerData.unclaimedRewards.length > 0) {
            let rewardLog = "", line = "", limitExceeded = false;
            for (let reward of playerData.unclaimedRewards) {
                let { origin } = reward;
                switch (Object.keys(reward)[0]) {
                    case "money":
                        playerData.money += reward.money;
                        line = `Received **${moneyEmoji}${reward.money}** from **${origin}**\n`
                        break;
                    case "fuseTokens":
                        playerData.fuseTokens += reward.fuseTokens;
                        line = `Received **${fuseEmoji}${reward.fuseTokens}** from **${origin}**\n`
                        break;
                    case "trophies":
                        playerData.trophies += reward.trophies;
                        line = `Received **${trophyEmoji}${reward.trophies}** from **${origin}**\n`
                        break;
                    case "cars":
                        playerData.garage = addCars(playerData.garage, reward.cars);

                        let carList = "";
                        for (let { carID, upgrade, amount } of reward.cars) {
                            let currentCar = require(`./cars/${carID}.json`);
                            carList += `${amount}x ${carNameGen({ currentCar, rarity: true, upgrade })}`
                        }
                        line = `Received **${carList}** from **${origin}**\n`
                        break;
                    case "packs":
                        let packList = "";
                        for (let packID of reward.packs) {
                            let pack = require(`./packs/${packID}.json`);
                            let addedCars = await openPack(message, pack);
                            if (!Array.isArray(addedCars)) return;

                            playerData.garage = addCars(playerData.garage, addedCars);
                            packList += `1x ${pack["packName"]}`;
                        }
                        line = `Received **${packList}** from **${origin}**\n`
                        break;
                    default:
                        break;
                }

                if (rewardLog.length + line.length < 4096) { // discord embed desc limit
                    rewardLog += `Received **${moneyEmoji}${reward.money}** from **${origin}**\n`;
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