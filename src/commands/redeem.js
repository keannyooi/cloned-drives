"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack, getDriver } = require("../util/functions/dataManager.js");
const { driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const addCars = require("../util/functions/addCars.js");
const { trackMoneyEarned, trackTrophiesEarned, trackFuseTokensEarned, trackCodeRedeemed } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");
const codeModel = require("../models/codeSchema.js");

module.exports = {
    name: "redeem",
    aliases: ["code"],
    usage: ["<code>"],
    args: 1,
    category: "Gameplay",
    cooldown: 5,
    description: "Redeems a code to receive its rewards. Codes are given out during special occasions.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);

        const codeName = args[0].toUpperCase();
        const codeData = await codeModel.findOne({ code: codeName });

        // Code doesn't exist
        if (!codeData) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, this code doesn't exist.",
                desc: "Double-check the code and try again. Codes are not case-sensitive.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Code is not active
        if (!codeData.isActive) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, this code is not currently active.",
                desc: "This code may have been deactivated or hasn't been activated yet.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Code has expired
        if (codeData.deadline !== "unlimited") {
            const interval = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(codeData.deadline));
            if (interval.invalid !== null) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, this code has expired.",
                    desc: "Unfortunately, this code is no longer available.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
        }

        // Max redemptions reached
        if (codeData.maxRedemptions > 0 && codeData.redeemedBy.length >= codeData.maxRedemptions) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, this code has reached its maximum number of redemptions.",
                desc: "Unfortunately, this code is no longer available.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Player already redeemed
        if (codeData.redeemedBy.includes(message.author.id)) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, you have already redeemed this code.",
                desc: "Each code can only be redeemed once per player.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // All checks passed - apply rewards
        const playerData = await profileModel.findOne({ userID: message.author.id });
        const rewards = codeData.rewards;
        let rewardLog = "";

        // Money
        if (rewards.money) {
            playerData.money += rewards.money;
            rewardLog += `${moneyEmoji}${rewards.money.toLocaleString("en")}\n`;
        }

        // Trophies
        if (rewards.trophies) {
            playerData.trophies += rewards.trophies;
            rewardLog += `${trophyEmoji}${rewards.trophies.toLocaleString("en")}\n`;
        }

        // Fuse Tokens
        if (rewards.fuseTokens) {
            playerData.fuseTokens += rewards.fuseTokens;
            rewardLog += `${fuseEmoji}${rewards.fuseTokens.toLocaleString("en")}\n`;
        }

        // Cars (added directly to garage)
        if (rewards.cars && rewards.cars.length > 0) {
            playerData.garage = addCars(playerData.garage, rewards.cars);
            for (let car of rewards.cars) {
                let currentCar = getCar(car.carID);
                rewardLog += `1x ${carNameGen({ currentCar, rarity: true, upgrade: car.upgrade })}\n`;
            }
        }

        // Packs and drivers route through unclaimedRewards so cd-rewards'
        // existing machinery does the heavy lifting — pack opening for packs;
        // dupe→XP conversion, level-ups and ownership for drivers.
        const pendingEntries = [];
        if (rewards.packs && rewards.packs.length > 0) {
            for (let packID of rewards.packs) {
                pendingEntries.push({ pack: packID, origin: `Code: ${codeName}` });
                let currentPack = getPack(packID);
                rewardLog += `1x ${currentPack["packName"]} *(claim via \`cd-rewards\`)*\n`;
            }
        }
        if (rewards.drivers && rewards.drivers.length > 0) {
            for (let driverID of rewards.drivers) {
                const codeDriver = getDriver(driverID);
                if (!codeDriver) {
                    // Roster file removed since the code was built — skip the
                    // grant rather than filing an unclaimable entry.
                    console.log(`[codes] ${codeName}: unknown driver "${driverID}" skipped`);
                    continue;
                }
                pendingEntries.push({ driver: driverID, origin: `Code: ${codeName}` });
                rewardLog += `Driver: **${driverDisplayName(codeDriver)}** *(claim via \`cd-rewards\`)*\n`;
            }
        }

        // Save. Currencies go through $inc and queued rewards through $push,
        // never absolute writes from the stale pre-read copy — a background
        // grant (Race Week payout, pack battle milestone) landing between this
        // command's read and write used to be silently clobbered by the old
        // whole-array $set. The garage $set remains: addCars merges upgrade
        // maps, and only user-serialized commands write the garage directly.
        const update = {
            "$inc": {
                money: rewards.money || 0,
                trophies: rewards.trophies || 0,
                fuseTokens: rewards.fuseTokens || 0
            }
        };
        if (rewards.cars && rewards.cars.length > 0) update["$set"] = { garage: playerData.garage };
        if (pendingEntries.length > 0) update["$push"] = { unclaimedRewards: { "$each": pendingEntries } };
        await profileModel.updateOne({ userID: message.author.id }, update);

        // Track redemption
        trackCodeRedeemed();
        if (rewards.money) trackMoneyEarned(rewards.money);
        if (rewards.trophies) trackTrophiesEarned(rewards.trophies);
        if (rewards.fuseTokens) trackFuseTokensEarned(rewards.fuseTokens);

        // L-07: Use $addToSet instead of replacing entire array (avoids sending full array over wire)
        await codeModel.updateOne({ code: codeName }, {
            $addToSet: { redeemedBy: message.author.id }
        });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully redeemed code \`${codeName}\`!`,
            author: message.author,
            fields: [{ name: "Rewards Received", value: rewardLog || "None" }]
        });
        return successMessage.sendMessage();
    }
};
