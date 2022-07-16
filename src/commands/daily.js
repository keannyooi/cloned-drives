"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "daily",
    usage: "(no arguments required)",
    args: 0,
    category: "Gameplay",
    description: "Collect your daily reward with this command!",
    async execute(message) {
        let { dailyStats, money, fuseTokens, garage } = await profileModel.findOne({ userID: message.author.id });
        let { lastDaily, streak, highestStreak } = dailyStats;
        const nextDay = DateTime.fromISO(lastDaily).plus({ days: 1 });
        const interval = Interval.fromDateTimes(DateTime.now(), nextDay);

        if (interval.invalid !== null) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
            const streakCheck = Interval.fromDateTimes(nextDay, DateTime.now());
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            let desc = "", image = null;
            if (streakCheck.length("days") > 1) {
                streak = 1;
            }
            else {
                streak++;
            }
            if (streak > highestStreak) {
                highestStreak = streak;
            }

            if (streak % 20 === 0) {
                let randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
                let currentPack = require(`../packs/${randomPack}`);
                while (!currentPack.packName.toLowerCase().includes("elite") || currentPack.repetition > 1) {
                    randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
                    currentPack = require(`../packs/${randomPack}`);
                }
                
                let pulledCars = await openPack({ message, currentPack });
                if (!Array.isArray(pulledCars)) {
                    return bot.deleteID(message.author.id);
                }
                garage = addCars(garage, pulledCars)
                desc = " and you've received a free random elite pack as a bonus!";
                image = currentPack.pack;
            }
            else if (streak % 7 === 0) {
                let randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
                let currentPack = require(`../packs/${randomPack}`);
                let packName = currentPack.packName.toLowerCase();
                while ((packName.includes("elite") && !guildMember.roles.cache.has("860147600459956224")) || packName.includes("booster") || currentPack.repetition > 1) {
                    randomPack = packFiles[Math.floor(Math.random() * packFiles.length)];
                    currentPack = require(`../packs/${randomPack}`);
                    packName = currentPack.packName.toLowerCase();
                }

                let pulledCars = await openPack({ message, currentPack });
                if (!Array.isArray(pulledCars)) {
                    return bot.deleteID(message.author.id);
                }
                garage = addCars(garage, pulledCars)
                desc = " and you've received a free random pack as a bonus!";
                image = currentPack.pack;
            }
            else if (streak % 5 === 0) {
                let carID = carFiles[Math.floor(Math.random() * carFiles.length)];
                let currentCar = require(`../cars/${carID}`);
                while (currentCar["rq"] > 64 || currentCar["isPrize"] === true) {
                    carID = carFiles[Math.floor(Math.random() * carFiles.length)];
                    currentCar = require(`../cars/${carID}`);
                }
                garage = addCars(garage, [{ carID: carID.slice(0, 6), upgrade: "000" }]);
                desc = ` and you've received a free ${carNameGen({ currentCar })} as a bonus!`;
                image = currentCar["card"];
            }

            let moneyReward = 7500 + ((streak - 1) * 4000);
            let fuseReward = 300 * streak;
            if (guildMember.roles.cache.has("860144481109016607")) {
                moneyReward *= 1.5;
                fuseReward *= 1.5;
            }
            money += moneyReward;
            fuseTokens += fuseReward;
            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": {
                    "dailyStats.lastDaily": DateTime.now().toISO(),
                    "dailyStats.streak": streak,
                    "dailyStats.highestStreak": highestStreak,
                    "dailyStats.notifReceived": false
                },
                money,
                fuseTokens,
                garage
            });

            const infoMessage = new SuccessMessage({
                channel: message.channel,
                title: `You've received your daily reward of ${moneyEmoji}${moneyReward.toLocaleString("en")} and ${fuseEmoji}${fuseReward.toLocaleString("en")}!`,
                desc: `Current Streak: \`${streak}\`${desc}`,
                author: message.author,
                image,
                fields: [
                    { name: "Current Money Balance", value: `${moneyEmoji}${money.toLocaleString("en")}`, inline: true },
                    { name: "Current Fuse Token Balance", value: `${fuseEmoji}${fuseTokens.toLocaleString("en")}`, inline: true }
                ]
            });
            if (guildMember.roles.cache.has("860144481109016607")) {
                infoMessage.editEmbed({ footer: "As a token of appreciation for becoming a Cloned Drives patron, you now enjoy a x1.5 multiplier for your money and fuse token daily rewards!" });
            }
            return infoMessage.sendMessage();
        }
        else {
            let hours = Math.floor(interval.length("hours"));
            let minutes = Math.floor(interval.length("minutes") - (hours * 60));
            let seconds = Math.floor(interval.length("seconds") - (hours * 3600) - (minutes * 60));
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "You've already received your daily reward!",
                desc: `Come back in \`${hours}h ${minutes}m ${seconds}s\`!`,
                author: message.author
            });
            return infoMessage.sendMessage();
        }
    }
};