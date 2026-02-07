"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { getCarFiles, getPackFiles, getCar, getPack } = require("../util/functions/dataManager.js");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID} = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const openPack = require("../util/functions/openPack.js");
const { trackMoneyEarned } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "daily",
    usage: "(no arguments required)",
    args: 0,
    category: "Gameplay",
    description: "Collect your daily reward with this command!",
    async execute(message) {
        const carFiles = getCarFiles();
        const packFiles = getPackFiles();
        
        let playerData = await profileModel.findOne({ userID: message.author.id });
        let { dailyStats, money, garage } = playerData;
        let { lastDaily, streak, highestStreak } = dailyStats;

        // Initialize discoveredCars
        let discoveredCars = playerData.discoveredCars || [];
        if (discoveredCars.length === 0 && garage.length > 0) {
            discoveredCars = garage.map(c => c.carID);
        }

        // Check if 24 hours have passed since the last daily
        const lastDailyDateTime = DateTime.fromISO(lastDaily);
        const currentDateTime = DateTime.now();
        const hoursSinceLastDaily = currentDateTime.diff(lastDailyDateTime, 'hours').hours;

        if (hoursSinceLastDaily >= 24) {
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
                // === Streak 20: Random ELITE daily pack ===
                const eligiblePacks = packFiles.filter(f => {
                    const pack = getPack(f);
                    const cats = getPackCategories(pack);
                    const tier = getPackTier(pack);
                    if (!cats.includes("daily")) return false;
                    if (tier !== "elite") return false;
                    // Backward compat: old packs without explicit categories still use repetition check
                    if (!pack.categories && (pack.repetition || 1) > 1) return false;
                    return true;
                });

                if (eligiblePacks.length > 0) {
                    const randomPack = weightedRandomPack(eligiblePacks);
                    const currentPack = getPack(randomPack);
                    let pulledCars = await openPack({ message, currentPack, discoveredCars });
                    if (!Array.isArray(pulledCars)) {
                        return bot.deleteID(message.author.id);
                    }
                    garage = addCars(garage, pulledCars);
                    desc = " and you've received a free random elite pack as a bonus!";
                    image = currentPack.pack;
                }
            }
            else if (streak % 7 === 0) {
                // === Streak 7: Random non-elite, non-booster daily pack ===
                const isPatron = guildMember.roles.cache.has("860147600459956224");
                const eligiblePacks = packFiles.filter(f => {
                    const pack = getPack(f);
                    const cats = getPackCategories(pack);
                    const tier = getPackTier(pack);
                    if (!cats.includes("daily")) return false;
                    // Exclude elite unless patron
                    if (tier === "elite" && !isPatron) return false;
                    // Always exclude booster
                    if (tier === "booster") return false;
                    // Backward compat: old packs without explicit categories still use repetition check
                    if (!pack.categories && (pack.repetition || 1) > 1) return false;
                    return true;
                });

                if (eligiblePacks.length > 0) {
                    const randomPack = weightedRandomPack(eligiblePacks);
                    const currentPack = getPack(randomPack);
                    let pulledCars = await openPack({ message, currentPack, discoveredCars });
                    if (!Array.isArray(pulledCars)) {
                        return bot.deleteID(message.author.id);
                    }
                    garage = addCars(garage, pulledCars);
                    desc = " and you've received a free random pack as a bonus!";
                    image = currentPack.pack;
                }
            }
            else if (streak % 5 === 0) {
                let carID = carFiles[Math.floor(Math.random() * carFiles.length)];
                let currentCar = getCar(carID);
                while (currentCar["reference"] || currentCar["cr"] > 699 || currentCar["isPrize"] === true) {
                    carID = carFiles[Math.floor(Math.random() * carFiles.length)];
                    currentCar = getCar(carID);
                }
                const newCarID = carID.slice(0, 6);
                garage = addCars(garage, [{ carID: newCarID, upgrade: "000" }]);
                // Track discovery
                if (!discoveredCars.includes(newCarID)) {
                    discoveredCars.push(newCarID);
                }
                desc = ` and you've received a free ${carNameGen({ currentCar })} as a bonus!`;
                image = currentCar["racehud"];
            }

            let moneyReward = 7500 + ((streak - 1) * 4000);
            if (guildMember.roles.cache.has("860144481109016607")) {
                moneyReward *= 1.5;
            }
            money += moneyReward;
            trackMoneyEarned(moneyReward);
            await profileModel.updateOne({ userID: message.author.id }, {
                "$set": {
                    "dailyStats.lastDaily": DateTime.now().toISO(),
                    "dailyStats.streak": streak,
                    "dailyStats.highestStreak": highestStreak,
                    "dailyStats.notifReceived": false
                },
                money,
                garage,
                discoveredCars
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

// === Pack selection helpers ===

function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}

function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}

/**
 * Weighted random selection from a list of pack file identifiers.
 * Packs with higher `weight` values are more likely to be chosen.
 * Defaults to weight 10 for packs without an explicit weight.
 */
function weightedRandomPack(packs) {
    const weighted = packs.map(f => {
        const packId = f.endsWith('.json') ? f.slice(0, -5) : f;
        const pack = getPack(packId);
        return { file: f, weight: pack.weight || 10 };
    });
    const totalWeight = weighted.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const p of weighted) {
        roll -= p.weight;
        if (roll <= 0) return p.file;
    }
    return weighted[weighted.length - 1].file;
}
