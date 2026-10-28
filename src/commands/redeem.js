"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCar, getPack, getDriver, getVoucher } = require("../util/functions/dataManager.js");
const { driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const makeRewardID = require("../util/functions/rewardID.js");
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

        // All checks passed - build the rewards (nothing is written yet)
        const rewards = codeData.rewards;
        let rewardLog = "";

        // Money
        if (rewards.money) {
            rewardLog += `${moneyEmoji}${rewards.money.toLocaleString("en")}\n`;
        }

        // Trophies
        if (rewards.trophies) {
            rewardLog += `${trophyEmoji}${rewards.trophies.toLocaleString("en")}\n`;
        }

        // Fuse Tokens
        if (rewards.fuseTokens) {
            rewardLog += `${fuseEmoji}${rewards.fuseTokens.toLocaleString("en")}\n`;
        }

        // Packs, cars and drivers route through unclaimedRewards so cd-rewards'
        // existing machinery does the heavy lifting — pack opening for packs;
        // dupe→XP conversion, level-ups and ownership for drivers. Every entry
        // carries a rid (rewardID.js), kept AFTER the type key — cd-rewards
        // reads the first key — so the claim removes exactly that entry.
        const pendingEntries = [];
        // Cars queue too — redeem no longer writes the garage at all. One
        // fewer garage read-modify-write in the codebase, and cd-rewards'
        // claim path (addCars + discoveredCars) is the single place code
        // cars materialize, exactly like every other car reward source.
        if (rewards.cars && rewards.cars.length > 0) {
            for (let car of rewards.cars) {
                pendingEntries.push({ car: { carID: car.carID, upgrade: car.upgrade || "000" }, origin: `Code: ${codeName}`, rid: makeRewardID() });
                let currentCar = getCar(car.carID);
                rewardLog += `1x ${carNameGen({ currentCar, rarity: true, upgrade: car.upgrade })} *(claim via \`cd-rewards\`)*\n`;
            }
        }
        if (rewards.packs && rewards.packs.length > 0) {
            for (let packID of rewards.packs) {
                pendingEntries.push({ pack: packID, origin: `Code: ${codeName}`, rid: makeRewardID() });
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
                pendingEntries.push({ driver: driverID, origin: `Code: ${codeName}`, rid: makeRewardID() });
                rewardLog += `Driver: **${driverDisplayName(codeDriver)}** *(claim via \`cd-rewards\`)*\n`;
            }
        }
        if (rewards.vouchers && rewards.vouchers.length > 0) {
            for (let entry of rewards.vouchers) {
                const codeVoucher = getVoucher(entry.voucherID);
                if (!codeVoucher) {
                    // Voucher file removed since the code was built — skip the
                    // grant rather than filing an unclaimable entry.
                    console.log(`[codes] ${codeName}: unknown voucher "${entry.voucherID}" skipped`);
                    continue;
                }
                const amount = Number.isInteger(entry.amount) && entry.amount > 0 ? entry.amount : 1;
                pendingEntries.push({ voucher: { voucherID: entry.voucherID, amount }, origin: `Code: ${codeName}`, rid: makeRewardID() });
                rewardLog += `${amount}x ${codeVoucher.name} 🎟️ *(claim via \`cd-rewards\`)*\n`;
            }
        }

        // Record the redemption FIRST, in one guarded write: the filter re-checks
        // "active", "not redeemed by this player" and "uses left" on the server,
        // so a burst of redeems right after a code drop can never push a capped
        // code past its limit (the checks above ran on a copy that may already
        // be stale). redeemedBy.length is the use counter. Matching nothing means
        // someone took the last use (or the code changed) — pay nothing.
        let claim;
        try {
            claim = await codeModel.updateOne({
                code: codeName,
                isActive: true,
                redeemedBy: { "$ne": message.author.id },
                "$expr": {
                    "$or": [
                        { "$lte": [{ "$ifNull": ["$maxRedemptions", 0] }, 0] },
                        { "$lt": [{ "$size": { "$ifNull": ["$redeemedBy", []] } }, "$maxRedemptions"] }
                    ]
                }
            }, {
                "$push": { redeemedBy: message.author.id }
            });
        }
        catch (error) {
            // An errored write may still have landed: the use may be recorded
            // with nothing paid. Log it so staff can check redeemedBy and re-grant.
            console.error(`[codes] CLAIM UNCERTAIN (${error.message}): ${message.author.id} redeeming ${codeName}. The use may or may not have been recorded; nothing was paid.`);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, this code could not be redeemed.",
                desc: `Something went wrong while redeeming \`${codeName}\`. Please try again. If it then says you have already redeemed it, contact staff so they can grant the rewards.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        if (claim.matchedCount === 0) {
            // Re-read once to say why.
            const latest = await codeModel.findOne({ code: codeName }, { isActive: 1, redeemedBy: 1, maxRedemptions: 1 }).lean();
            const redeemedBy = latest && Array.isArray(latest.redeemedBy) ? latest.redeemedBy : [];
            let title = "Error, this code could not be redeemed.", desc = "Please try again.";
            if (!latest) {
                title = "Error, this code doesn't exist.";
                desc = "Double-check the code and try again. Codes are not case-sensitive.";
            }
            else if (redeemedBy.includes(message.author.id)) {
                title = "Error, you have already redeemed this code.";
                desc = "Each code can only be redeemed once per player.";
            }
            else if (!latest.isActive) {
                title = "Error, this code is not currently active.";
                desc = "This code may have been deactivated or hasn't been activated yet.";
            }
            else if (latest.maxRedemptions > 0 && redeemedBy.length >= latest.maxRedemptions) {
                title = "Error, this code has reached its maximum number of redemptions.";
                desc = "Unfortunately, this code is no longer available.";
            }
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title,
                desc,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Pay. Currencies go through $inc and queued rewards through $push —
        // redeem performs NO absolute writes at all. Cars/packs/drivers land in
        // unclaimedRewards and materialize through cd-rewards' claim path, so a
        // background grant arriving mid-redeem can never be clobbered.
        const update = {
            "$inc": {
                money: rewards.money || 0,
                trophies: rewards.trophies || 0,
                fuseTokens: rewards.fuseTokens || 0
            }
        };
        if (pendingEntries.length > 0) update["$push"] = { unclaimedRewards: { "$each": pendingEntries } };
        // The use is already recorded, so a failure here leaves the player
        // UNPAID, never paid twice. Not retried and not rolled back (a write
        // that errored may still have landed) — log what support needs to re-grant.
        let paid = false;
        try {
            const result = await profileModel.updateOne({ userID: message.author.id }, update);
            paid = result.matchedCount > 0;
            if (!paid) console.error(`[codes] PAYMENT FAILED (no profile matched): ${message.author.id} redeemed ${codeName} but was NOT paid. Update: ${JSON.stringify(update)}`);
        }
        catch (error) {
            console.error(`[codes] PAYMENT FAILED (${error.message}): ${message.author.id} redeemed ${codeName} and may NOT have been paid. Update: ${JSON.stringify(update)}`);
        }
        if (!paid) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, your code rewards could not be delivered.",
                desc: `Your redemption of \`${codeName}\` was recorded, but adding the rewards failed. Please contact staff so they can re-grant them.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Track redemption
        trackCodeRedeemed();
        if (rewards.money) trackMoneyEarned(rewards.money);
        if (rewards.trophies) trackTrophiesEarned(rewards.trophies);
        if (rewards.fuseTokens) trackFuseTokensEarned(rewards.fuseTokens);

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully redeemed code \`${codeName}\`!`,
            author: message.author,
            fields: [{ name: "Rewards Received", value: rewardLog || "None" }]
        });
        return successMessage.sendMessage();
    }
};
