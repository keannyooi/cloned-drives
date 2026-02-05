"use strict";

const bot = require("../config/config.js");
const { DateTime, Interval } = require("luxon");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID, defaultPageLimit } = require("../util/consts/consts.js");
const { getCar, getPack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const listRewards = require("../util/functions/listRewards.js");
const timeDisplay = require("../util/functions/timeDisplay.js");
const listUpdate = require("../util/functions/listUpdate.js");
const codeModel = require("../models/codeSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "codes",
    aliases: ["codelist"],
    usage: ["", "[page number]", "[code name]"],
    args: 0,
    category: "Admin",
    description: "View all redeemable codes and their details.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
        const allCodes = await codeModel.find();
        const { settings } = await profileModel.findOne({ userID: message.author.id });

        if (allCodes.length === 0) {
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "No codes have been created yet.",
                desc: "Use `cd-createcode <code>` to create one.",
                author: message.author
            });
            return infoMessage.sendMessage();
        }

        // If a specific code name is provided (non-numeric first arg)
        if (args.length > 0 && isNaN(args[0])) {
            const codeName = args[0].toUpperCase();
            const codeData = allCodes.find(c => c.code === codeName);

            if (!codeData) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, code not found.",
                    desc: `No code with the name \`${codeName}\` exists.`,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }

            // Build detailed reward view
            let rewardDesc = "";
            const rewards = codeData.rewards;

            if (rewards.money) {
                rewardDesc += `${moneyEmoji}${rewards.money.toLocaleString("en")}\n`;
            }
            if (rewards.trophies) {
                rewardDesc += `${trophyEmoji}${rewards.trophies.toLocaleString("en")}\n`;
            }
            if (rewards.fuseTokens) {
                rewardDesc += `${fuseEmoji}${rewards.fuseTokens.toLocaleString("en")}\n`;
            }
            if (rewards.cars && rewards.cars.length > 0) {
                for (let car of rewards.cars) {
                    let currentCar = getCar(car.carID);
                    rewardDesc += `${carNameGen({ currentCar, rarity: true, upgrade: car.upgrade })}\n`;
                }
            }
            if (rewards.packs && rewards.packs.length > 0) {
                for (let packID of rewards.packs) {
                    let currentPack = getPack(packID);
                    rewardDesc += `${currentPack["packName"]}\n`;
                }
            }
            if (rewardDesc === "") {
                rewardDesc = "None configured";
            }

            // Status
            let statusStr = codeData.isActive ? "🟢 Active" : "🔴 Inactive";

            // Deadline
            let deadlineStr = "Unlimited";
            if (codeData.deadline !== "unlimited") {
                if (codeData.deadline.endsWith("d")) {
                    deadlineStr = `${parseInt(codeData.deadline)} day(s) (starts on activation)`;
                } else {
                    const deadlineDate = DateTime.fromISO(codeData.deadline);
                    const interval = Interval.fromDateTimes(DateTime.now(), deadlineDate);
                    if (interval.invalid !== null) {
                        deadlineStr = "Expired";
                    } else {
                        deadlineStr = timeDisplay(deadlineDate);
                    }
                }
            }

            // Max uses
            let maxUsesStr = codeData.maxRedemptions === 0
                ? `${codeData.redeemedBy.length} (Unlimited)`
                : `${codeData.redeemedBy.length}/${codeData.maxRedemptions}`;

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Code: ${codeData.code}`,
                author: message.author,
                fields: [
                    { name: "Status", value: statusStr, inline: true },
                    { name: "Redemptions", value: maxUsesStr, inline: true },
                    { name: "Deadline", value: deadlineStr, inline: true },
                    { name: "Rewards", value: rewardDesc },
                    { name: "Created By", value: codeData.createdBy || "Unknown", inline: true }
                ]
            });
            return infoMessage.sendMessage();
        }

        // List view with pagination
        let page = 1;
        if (args.length > 0 && !isNaN(args[0])) {
            page = parseInt(args[0]);
        }

        const pageLimit = settings.listamount || defaultPageLimit;
        const totalPages = Math.ceil(allCodes.length / pageLimit);
        if (page < 1 || page > totalPages) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, page number requested invalid.",
                desc: `The code list ends at page ${totalPages}.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        try {
            await listUpdate(allCodes, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let codeList = "";
            for (let i = 0; i < section.length; i++) {
                let code = section[i];
                let statusIcon = code.isActive ? "🟢" : "🔴";
                let usesStr = code.maxRedemptions === 0
                    ? `${code.redeemedBy.length}/∞`
                    : `${code.redeemedBy.length}/${code.maxRedemptions}`;
                let rewardSummary = listRewards(code.rewards);
                codeList += `${statusIcon} \`${code.code}\` — ${usesStr} uses — ${rewardSummary}\n`;
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: `Redeemable Codes (${allCodes.length} total)`,
                desc: codeList || "No codes found.",
                author: message.author,
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
};
