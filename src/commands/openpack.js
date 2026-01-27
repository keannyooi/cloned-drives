"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const addCars = require("../util/functions/addCars.js");
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");
const mongoose = require("mongoose");
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
    const packs = packFiles.filter(packFile => {
        const packId = packFile.endsWith('.json') ? packFile.slice(0, -5) : packFile;
        const contents = getPack(packId);
        return contents && contents["price"];
    });

    const response = await search(message, query, packs, "pack");
    if (!Array.isArray(response)) return;
    let [result, currentMessage] = response;
    const packId = result.endsWith('.json') ? result.slice(0, -5) : result;

    const { money, garage } = await profileModel.findOne({ userID: message.author.id });
    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
    const currentPack = getPack(packId);

    if (money >= currentPack["price"]) {
        const session = await mongoose.startSession();
        session.startTransaction();

        // Initialize balance to a default value
        let balance = money;

        try {
            balance -= currentPack["price"];
            const addedCars = await openPack({ message, currentPack, currentMessage });
            if (!Array.isArray(addedCars)) return;

            // Perform the first database operation: Subtract the purchase price from the user's balance
            await profileModel.updateOne(
                { userID: message.author.id },
                { $inc: { money: -currentPack["price"] } }
            );

            // Perform the second database operation: Add cars to the user's garage
            await profileModel.updateOne(
                { userID: message.author.id },
                {
                    money: balance,
                    garage: addCars(garage, addedCars)
                }
            );

            // Commit the transaction if both operations succeed
            await session.commitTransaction();
        } catch (error) {
            // Handle errors and roll back the transaction if necessary
            await session.abortTransaction();
            throw error; // Rethrow the error to handle it at a higher level if needed
        } finally {
            // End the session
            session.endSession();
        }

        setTimeout(() => {
            const successMessage = new SuccessMessage({
                channel: message.channel,
                title: `Successfully bought a ${currentPack["packName"]}!`,
                author: message.author,
                fields: [
                    { name: "Your Money Balance", value: `${moneyEmoji}${balance.toLocaleString("en")}`, inline: true }
                ]
            });
            successMessage.sendMessage();
        }, 5000);
    } else {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, it looks like you don't have enough money for this purchase.",
            author: message.author,
            fields: [
                { name: "Required Amount of Money", value: `${moneyEmoji}${currentPack["price"].toLocaleString("en")}`, inline: true },
                { name: "Your Money Balance", value: `${moneyEmoji}${money.toLocaleString("en")}`, inline: true }
            ]
        });
        errorMessage.sendMessage({ currentMessage });
    }
} catch (error) {
    console.error("An error occurred while processing the 'openpack' command:", error);
    // You can optionally send an error message to the user here.
}}};
