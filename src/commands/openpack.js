"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");
const { trackMoneySpent, trackTrophiesEarned, trackPackOpened } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "openpack",
    aliases: ["buypack", "op"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Gameplay",
    cooldown: 5,
    description: "Opens a pack.",
    async execute(message, args) {
        try {
            const packFiles = getPackFiles();
            const query = args.map(i => i.toLowerCase());

            // Only show packs with category "normal" (or price for backward compat) that have a price
            const packs = packFiles.filter(packFile => {
                const packId = packFile.endsWith('.json') ? packFile.slice(0, -5) : packFile;
                const contents = getPack(packId);
                if (!contents || !contents.price) return false;
                return getPackCategories(contents).includes("normal");
            });

            const response = await search(message, query, packs, "pack");
            if (!Array.isArray(response)) return;
            let [result, currentMessage] = response;
            const packId = result.endsWith('.json') ? result.slice(0, -5) : result;

            const playerData = await profileModel.findOne({ userID: message.author.id });
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const currentPack = getPack(packId);

            if (playerData.money < currentPack.price) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, it looks like you don't have enough money for this purchase.",
                    author: message.author,
                    fields: [
                        { name: "Required Amount of Money", value: `${moneyEmoji}${currentPack.price.toLocaleString("en")}`, inline: true },
                        { name: "Your Money Balance", value: `${moneyEmoji}${playerData.money.toLocaleString("en")}`, inline: true }
                    ]
                });
                return errorMessage.sendMessage({ currentMessage });
            }

            // Initialize discoveredCars from garage if this is the first time
            let discoveredCars = playerData.discoveredCars || [];
            if (discoveredCars.length === 0 && playerData.garage.length > 0) {
                discoveredCars = playerData.garage.map(c => c.carID);
            }

            // Open the pack
            const addedCars = await openPack({ message, currentPack, currentMessage, discoveredCars });
            if (!Array.isArray(addedCars)) return;

            // Calculate new balance
            let balance = playerData.money - currentPack.price;

            // Apply bonus rewards if the pack has them
            const successFields = [
                { name: "Your Money Balance", value: `${moneyEmoji}${balance.toLocaleString("en")}`, inline: true }
            ];
            let bonusTrophies = 0;

            if (currentPack.bonusRewards) {
                if (currentPack.bonusRewards.money) {
                    balance += currentPack.bonusRewards.money;
                    successFields.push({
                        name: "Bonus Money",
                        value: `${moneyEmoji}${currentPack.bonusRewards.money.toLocaleString("en")}`,
                        inline: true
                    });
                    // Update balance field
                    successFields[0].value = `${moneyEmoji}${balance.toLocaleString("en")}`;
                }
                if (currentPack.bonusRewards.trophies) {
                    const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
                    bonusTrophies = currentPack.bonusRewards.trophies;
                    successFields.push({
                        name: "Bonus Trophies",
                        value: `${trophyEmoji}${bonusTrophies.toLocaleString("en")}`,
                        inline: true
                    });
                }
            }

            // Single DB update: subtract price, add bonus rewards, add cars, save discoveries
            const updateObj = {
                money: balance,
                garage: addCars(playerData.garage, addedCars),
                discoveredCars
            };
            if (bonusTrophies > 0) {
                updateObj.trophies = playerData.trophies + bonusTrophies;
            }

            await profileModel.updateOne(
                { userID: message.author.id },
                updateObj
            );

            trackMoneySpent(currentPack.price);
            trackPackOpened(currentPack["packName"]);
            if (bonusTrophies > 0) trackTrophiesEarned(bonusTrophies);

            // Pack Battle tracking (non-fatal — never breaks normal pack opening)
            try {
                const { processPackOpening } = require("../util/functions/packBattleManager.js");
                await processPackOpening(message.author.id, packId, addedCars);
            } catch (err) {
                console.error("[PackBattle] Tracking failed (non-fatal):", err.message);
            }

            setTimeout(() => {
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully bought a ${currentPack["packName"]}!`,
                    author: message.author,
                    fields: successFields
                });
                successMessage.sendMessage();
            }, 5000);

        } catch (error) {
            console.error("An error occurred while processing the 'openpack' command:", error);
        }
    }
};

// === Backward-compatible category helper ===
function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    // Infer from legacy properties
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}
