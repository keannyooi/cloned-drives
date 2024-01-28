"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { readdirSync } = require("fs");
const carFiles = readdirSync("./src/cars").filter(file => file.endsWith(".json"));
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID} = require("../util/consts/consts.js");
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
        let { dailyStats, money, garage } = await profileModel.findOne({ userID: message.author.id });
        let { lastDaily, streak, highestStreak } = dailyStats;

        // Check if 24 hours have passed since the last daily
        const lastDailyDateTime = DateTime.fromISO(lastDaily);
        const currentDateTime = DateTime.now();
		const hoursSinceLastDaily = currentDateTime.diff(lastDailyDateTime, 'hours').hours;
		//const minutesSinceLastDaily = currentDateTime.diff(lastDailyDateTime, 'minutes').minutes;
		//const hoursSinceLastDaily = minutesSinceLastDaily / 60;
		
console.log('Hours since last daily:', hoursSinceLastDaily);

        if (hoursSinceLastDaily >= 24) {
        ///testing use this///if (hoursSinceLastDaily >= 0.1) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const streakCheck = Interval.fromDateTimes(lastDailyDateTime, lastDailyDateTime.plus({ days: 1 }));
            const guildMember = await bot.homeGuild.members.fetch(message.author.id);
            let desc = "", image = null;
            if (streakCheck.length("days") > 1) {
                streak = 1;
            } else {
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
                while (currentCar["reference"] || currentCar["cr"] > 699 || currentCar["isPrize"] === true) {
                    carID = carFiles[Math.floor(Math.random() * carFiles.length)];
                    currentCar = require(`../cars/${carID}`);
                }
                garage = addCars(garage, [{ carID: carID.slice(0, 6), upgrade: "000" }]);
                desc = ` and you've received a free ${carNameGen({ currentCar })} as a bonus!`;
                image = currentCar["racehud"];
            }

            let moneyReward = 7500 + ((streak - 1) * 4000);
            if (guildMember.roles.cache.has("860144481109016607")) {
                moneyReward *= 1.5;
            }
            money += moneyReward;
            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": {
                    "dailyStats.lastDaily": DateTime.now().toISO(),
                    "dailyStats.streak": streak,
                    "dailyStats.highestStreak": highestStreak,
                    "dailyStats.notifReceived": false
                },
                money,
                garage
            });

            const infoMessage = new SuccessMessage({
                channel: message.channel,
                title: `You've received your daily reward of ${moneyEmoji}${moneyReward.toLocaleString("en")}!`,
                desc: `Current Streak: \`${streak}\`${desc}`,
                author: message.author,
                image,
                fields: [
                    { name: "Current Money Balance", value: `${moneyEmoji}${money.toLocaleString("en")}`, inline: true }
                ]
            });
            if (guildMember.roles.cache.has("860144481109016607")) {
                infoMessage.editEmbed({ footer: "As a token of appreciation for becoming a Cloned Drives patron, you now enjoy a x1.5 multiplier for your money daily rewards!" });
            }
            return infoMessage.sendMessage();
        }

        // Calculate the time remaining until the next daily
        const remainingTime = 24 - hoursSinceLastDaily;
        const hoursRemaining = Math.floor(remainingTime);
        const minutesRemaining = Math.floor((remainingTime % 1) * 60);
        const secondsRemaining = Math.floor(((remainingTime * 60) % 1) * 60);

        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "You've already received your daily reward!",
            desc: `Come back in \`${hoursRemaining}h ${minutesRemaining}m ${secondsRemaining}s\`!`,
            author: message.author
        });
        infoMessage.sendMessage();
    }
};