"use strict";

const bot = require("../config/config.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar } = require("../util/functions/dataManager.js");
const { isBMCar } = require("../util/functions/cardType.js");
const searchUser = require("../util/functions/searchUser.js");
const calcTotal = require("../util/functions/calcTotal.js");
const botUserError = require("../util/commonerrors/botUserError.js");
const profileModel = require("../models/profileSchema.js");
const { getProfile } = require("../util/functions/profileCache.js");

module.exports = {
    name: "statistics",
    aliases: ["stats"],
    usage: ["[username]"],
    args: 0,
    category: "Info",
    description: "Shows someone's stats.",
    async execute(message, args) {
        if (args.length) {
            if (message.mentions.users.first()) {
                if (!message.mentions.users.first().bot) {
                    try {
                        await displayData(message.mentions.users.first());
                    }
                    catch (error) {
                        throw error;
                    }
                }
                else {
                    return botUserError(message);
                }
            }
            else {
                await new Promise(resolve => resolve(searchUser(message, args[0].toLowerCase())))
                    .then(async (response) => {
                        if (!Array.isArray(response)) return;
                        let [result, currentMessage] = response;
                        await displayData(result.user, currentMessage);
                    })
                    .catch(error => {
                        throw error;
                    });
            }
        }
        else {
            try {
                await displayData(message.author);
            }
            catch (error) {
                throw error;
            }
        }

        async function displayData(user, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

            const playerData = await getProfile(user.id);
            let totalCars = 0, maxedCars = 0, totalBMCars = 0;
            for (let car of playerData.garage) {
                maxedCars += (car.upgrades["996"] + car.upgrades["969"] + car.upgrades["699"]);
                totalCars += calcTotal(car);
                let currentCar = getCar(car.carID);
                if (isBMCar(currentCar)) {
                    totalBMCars += calcTotal(car);
                }
            }

            const MCpercentage = maxedCars / totalCars * 100;
            // raceWeekStats is lazy-initialized — old profiles may lack it entirely or have partial objects
            const raceWeekStats = playerData.raceWeekStats ?? {};
            const weeklyWins = raceWeekStats.weeklyWins ?? 0;
            const weeklyLosses = raceWeekStats.weeklyLosses ?? 0;
            const bestWeek = raceWeekStats.bestWeek ?? 0;
            // unmigrated profiles keep their old rr streak under rrStats.highestStreak
            const legacyHighestStreak = raceWeekStats.legacyHighestStreak ?? playerData.rrStats?.highestStreak ?? 0;
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Stats of ${user.tag}`,
                desc: `Account created on <t:${Math.round(user.createdAt.getTime() / 1000)}>`,
                author: message.author,
                thumbnail: user.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [
                    { name: "Money Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true },
                    { name: "Fuse Tokens", value: `${fuseEmoji}${playerData.fuseTokens.toLocaleString("en")}`, inline: true },
                    { name: "Trophies", value: `${trophyEmoji}${playerData.trophies.toLocaleString("en")}`, inline: true },
                    { name: "Total Cars in Garage", value: totalCars.toLocaleString("en"), inline: true },
                    { name: "Total Black Market Cars in Garage", value: totalBMCars.toLocaleString("en"), inline: true },
                    { name: "Total Maxed Cars in Garage", value: maxedCars.toLocaleString("en"), inline: true },
                    { name: "Maxed Car Percentage", value: `${MCpercentage.toFixed(2)}%`, inline: true },
                    { name: "Race Week (This Week)", value: `${weeklyWins.toLocaleString("en")}W - ${weeklyLosses.toLocaleString("en")}L`, inline: true },
                    { name: "Best Race Week", value: `${bestWeek.toLocaleString("en")} wins`, inline: true },
                    { name: "Legacy Highest Streak", value: legacyHighestStreak.toLocaleString("en"), inline: true },
                    { name: "Highest Daily Reward Streak", value: playerData.dailyStats.highestStreak.toLocaleString("en"), inline: true },
                    { name: "About Me", value: playerData.settings.bio ?? "None" }
                ]
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};